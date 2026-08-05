import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createEvalEngine } from '../../duckdb/duckdb';
import { ArtifactWriter, inspectRun, sha256, type RawCallArtifact, type RunManifest } from './artifactWriter';
import { compileEcommercePlan, executeEcommercePlan } from './ecommercePipeline';
import type { EvidencePacket } from './evidence';
import {
  HUMAN_USEFULNESS_RUBRIC,
  parsePhase5Proposal,
  PHASE5_PROPOSAL_SCHEMA,
  PHASE5_QUESTIONS,
  type Phase5Proposal,
  type Phase5Question,
} from './phase5Protocol';
import { renderVerifiedFact } from './renderer';
import { syntheticVerifierCases } from './syntheticCases';
import { verifyClaim, type VerificationResult } from './verifier';

const executeFile = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../..');
const runsRoot = path.join(here, 'runs');
const endpoint = process.env.OLLAMA_CHAT_URL ?? 'http://100.126.157.97:11434/api/chat';
const modelTag = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:7b';
const numCtx = Number(process.env.OLLAMA_NUM_CTX ?? 8192);
const timeoutMs = Number(process.env.OLLAMA_CALL_TIMEOUT_MS ?? 600_000);
const keepAlive = '30m';
const repeats = 5;
const fixturePaths = ['customers', 'products', 'orders', 'order_items'].map((name) =>
  path.join(repository, `public/samples/ecommerce/${name}.csv`));
const deterministicSources = [
  'artifactWriter.ts', 'claimIr.ts', 'ecommercePipeline.ts', 'evidence.ts', 'metrics.ts',
  'phase5Protocol.ts', 'renderer.ts', 'runPhase5.ts', 'syntheticCases.ts', 'verifier.ts',
];
const systemPrompt = [
  'Return exactly one JSON proposal and no prose.',
  'A proposal is either a claim grounded in the supplied deterministic evidence or a typed unsupported response.',
  'Answer only the question asked. Do not substitute an adjacent available metric for a missing requested metric.',
  'Use unsupported reason causal_inference when descriptive evidence cannot establish causation.',
  'Use missing_cost for profit questions when cost is absent, missing_demographic when the requested demographic is absent, and incomplete_scope when a global extremum is requested from truncated evidence.',
  'For a claim, use only evidenceId, rowId, field, and scope rowIds present in the evidence.',
  'For an extremum, the scope must list every row in one complete packet.',
  'For a time change, from must be earlier and to later.',
  'Do not add explanations, labels, magnitude words, or unsupported fields.',
].join(' ');
const availableFields = {
  customers: ['customer_id', 'name', 'email', 'country', 'signup_date'],
  products: ['product_id', 'name', 'category', 'unit_price'],
  orders: ['order_id', 'customer_id', 'order_date', 'status'],
  order_items: ['order_item_id', 'order_id', 'product_id', 'quantity', 'unit_price'],
};

interface OllamaTagsBody { models?: Array<{ name?: string; model?: string; digest?: string }>; }
interface OllamaChatBody { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number; load_duration?: number; eval_duration?: number; }
interface ModelCallResult {
  proposal?: Phase5Proposal;
  parseError?: unknown;
  transportError?: unknown;
  rawContent?: string;
}

interface PersistedValidation {
  repeat: number;
  questionId: string;
  questionKind: 'answerable' | 'control';
  firstPassValid: boolean;
  repaired: boolean;
  proposal: Phase5Proposal | null;
  verification: VerificationResult | null;
  renderedSentence: string | null;
  disposition: string;
  expectedUnsupportedReason?: string;
}

function createRunId(startedAt: string): string {
  return `${startedAt.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}-${randomBytes(3).toString('hex')}`;
}

function tagsEndpoint(): string {
  const url = new URL(endpoint);
  url.pathname = '/api/tags';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function serializedError(error: unknown): unknown {
  if (!(error instanceof Error)) return { message: String(error) };
  const detailed = error as Error & { code?: unknown };
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(detailed.code === undefined ? {} : { code: detailed.code }),
    ...(error.cause === undefined ? {} : { cause: serializedError(error.cause) }),
  };
}

async function git(args: string[]): Promise<string> {
  return (await executeFile('git', args, { cwd: repository })).stdout.trimEnd();
}

async function resolveModelDigest(): Promise<string> {
  const response = await fetch(tagsEndpoint(), { signal: AbortSignal.timeout(20_000) });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Ollama tags request failed with HTTP ${response.status}: ${raw}`);
  const match = (JSON.parse(raw) as OllamaTagsBody).models?.find((model) => model.name === modelTag || model.model === modelTag);
  if (!match?.digest) throw new Error(`Ollama tag ${modelTag} was not present with a digest`);
  return match.digest;
}

async function createManifest(startedAt: string, modelDigest: string): Promise<RunManifest> {
  const fixtures = await Promise.all(fixturePaths.map(async (absolutePath) => {
    const [bytes, metadata] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
    return { id: path.basename(absolutePath, '.csv'), absolutePath, byteSize: metadata.size, sha256: sha256(bytes) };
  }));
  const sourceHashes = Object.fromEntries(await Promise.all(deterministicSources.map(async (filename) => [
    filename, sha256(await readFile(path.join(here, filename))),
  ])));
  return {
    runId: createRunId(startedAt),
    startedAt,
    command: process.argv,
    workingDirectory: process.cwd(),
    experimentVersion: '12.5',
    schemaVersions: { manifest: 1, events: 1, calls: 1 },
    git: { commit: await git(['rev-parse', 'HEAD']), statusShort: await git(['status', '--short']) },
    runtime: { node: process.version, duckdbWasm: '1.32.0', harness: '12.5' },
    fixtures,
    provider: { name: 'ollama-native-chat', endpointHost: new URL(endpoint).host, modelTag, modelDigest },
    options: { temperature: 0, numCtx, keepAlive, timeoutMs, retryCap: 0, repairCap: 1 },
    selection: {
      questions: PHASE5_QUESTIONS.map((question) => question.id),
      repeats,
      filters: ['four answerable questions', 'four negative controls', 'structural repair only'],
    },
    hashes: {
      systemPrompts: { proposal: sha256(systemPrompt) },
      schemas: { phase5Proposal: sha256(JSON.stringify(PHASE5_PROPOSAL_SCHEMA)) },
      deterministicSources: sourceHashes,
    },
    privacy: { classification: 'bundled-public-fixtures-only', bundledPublicFixturesOnly: true },
  };
}

function promptFor(question: Phase5Question, evidence: readonly EvidencePacket[]): string {
  return [
    `Question: ${question.text}`,
    `Question classification: ${question.kind}`,
    `Available source fields: ${JSON.stringify(availableFields)}`,
    `Deterministic evidence: ${JSON.stringify(evidence, null, 2)}`,
  ].join('\n\n');
}

async function callModel(
  writer: ArtifactWriter,
  question: Phase5Question,
  messages: Array<{ role: string; content: string }>,
  role: 'claim' | 'repair',
  attempt: number,
): Promise<ModelCallResult> {
  const requestBody = {
    model: modelTag,
    messages,
    stream: false,
    keep_alive: keepAlive,
    format: PHASE5_PROPOSAL_SCHEMA,
    options: { num_ctx: numCtx, temperature: 0 },
  };
  const startedAt = new Date().toISOString();
  const started = performance.now();
  await writer.appendEvent('model_request_started', { questionId: question.id, role, attempt });
  let response: Response | undefined;
  let rawResponseBody: string | undefined;
  let providerBody: OllamaChatBody | undefined;
  let proposal: Phase5Proposal | undefined;
  let rawContent: string | undefined;
  let parseError: unknown;
  let transportError: unknown;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    });
    rawResponseBody = await response.text();
    await writer.appendEvent(response.ok ? 'model_request_returned' : 'model_request_failed', {
      questionId: question.id, role, attempt, httpStatus: response.status,
    });
    if (!response.ok) {
      transportError = serializedError(new Error(`Ollama chat request failed with HTTP ${response.status}`));
    } else {
      try {
        providerBody = JSON.parse(rawResponseBody) as OllamaChatBody;
        rawContent = providerBody.message?.content;
        if (!rawContent) throw new Error('Ollama response has no message content');
        proposal = parsePhase5Proposal(JSON.parse(rawContent) as unknown);
      } catch (error) {
        parseError = serializedError(error);
      }
    }
  } catch (error) {
    transportError = serializedError(error);
    await writer.appendEvent('model_request_failed', { questionId: question.id, role, attempt, error: transportError });
  }
  const call: RawCallArtifact = {
    questionId: question.id,
    role,
    attempt,
    messages,
    schema: PHASE5_PROPOSAL_SCHEMA,
    requestOptions: { endpoint, body: requestBody, timeoutMs },
    ...(response && rawResponseBody !== undefined ? { http: { status: response.status, headers: Object.fromEntries(response.headers.entries()), rawResponseBody } } : {}),
    ...(proposal ? { parsedValue: proposal } : {}),
    ...(parseError ? { parseError } : {}),
    tokenCounts: providerBody ? {
      prompt: providerBody.prompt_eval_count ?? null,
      response: providerBody.eval_count ?? null,
      load: providerBody.load_duration ?? null,
      eval: providerBody.eval_duration ?? null,
    } : null,
    startedAt,
    endedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started),
    ...(rawResponseBody === undefined ? {} : { responseHash: sha256(rawResponseBody) }),
    ...(rawContent === undefined ? {} : { contentHash: sha256(rawContent) }),
    ...(transportError ? { error: transportError } : {}),
  };
  await writer.writeCall(call);
  if (proposal) await writer.appendEvent('response_parsed', { questionId: question.id, role, attempt, disposition: role === 'claim' ? 'first_pass_valid' : 'valid_after_repair' });
  else if (parseError) await writer.appendEvent('response_rejected', { questionId: question.id, role, attempt, disposition: 'parse_failed', reason: parseError });
  return { proposal, parseError, transportError, rawContent };
}

async function scorePersistedArtifacts(directory: string): Promise<Record<string, unknown>> {
  const claimFiles = (await readdir(path.join(directory, 'claims'))).filter((name) => name.endsWith('-validation.json')).sort();
  const validations = await Promise.all(claimFiles.map(async (name) =>
    JSON.parse(await readFile(path.join(directory, 'claims', name), 'utf8')) as PersistedValidation));
  const callFiles = (await readdir(path.join(directory, 'calls'))).filter((name) => name.endsWith('.json')).sort();
  const calls = await Promise.all(callFiles.map(async (name) =>
    JSON.parse(await readFile(path.join(directory, 'calls', name), 'utf8')) as RawCallArtifact));
  const syntheticResults = syntheticVerifierCases.map((testCase) => ({ testCase, actual: verifyClaim(testCase.claim, testCase.evidence) }));
  const falseCases = syntheticResults.filter(({ testCase }) => !testCase.expected.accepted);
  const falseAcceptances = falseCases.filter(({ actual }) => actual.accepted);
  const repeatYield = Array.from({ length: repeats }, (_, index) => {
    const repeat = index + 1;
    const verified = validations.filter((item) => item.repeat === repeat && item.questionKind === 'answerable' && item.disposition === 'verified').length;
    return { repeat, verifiedAnswerableQuestions: verified, required: 3, passed: verified >= 3 };
  });
  const displayedControlClaims = validations.filter((item) => item.questionKind === 'control' && item.renderedSentence !== null).length;
  const correctControlRefusals = validations.filter((item) => item.questionKind === 'control' && item.disposition === 'correct_refusal').length;
  const responseHashes = calls.map((call) => call.responseHash).filter((hash): hash is string => typeof hash === 'string');
  const contentHashes = calls.map((call) => call.contentHash).filter((hash): hash is string => typeof hash === 'string');
  const dispositions = Object.fromEntries([...new Set(validations.map((item) => item.disposition))].sort().map((disposition) => [
    disposition, validations.filter((item) => item.disposition === disposition).length,
  ]));
  const firstPassValid = validations.filter((item) => item.firstPassValid).length;
  const validAfterRepair = validations.filter((item) => item.proposal !== null).length;
  const transportSuccess = validations.filter((item) => item.disposition !== 'transport_failed').length;
  const passed = falseAcceptances.length === 0
    && displayedControlClaims === 0
    && repeatYield.every((item) => item.passed)
    && validAfterRepair / validations.length >= 0.5;
  return {
    phase: 5,
    source: 'persisted-artifacts',
    questions: PHASE5_QUESTIONS.length,
    repeats,
    expectedTrials: PHASE5_QUESTIONS.length * repeats,
    observedTrials: validations.length,
    modelCalls: calls.length,
    transportSuccess: `${transportSuccess}/${validations.length}`,
    firstPassValidity: `${firstPassValid}/${validations.length}`,
    validityAfterOneRepair: `${validAfterRepair}/${validations.length}`,
    dispositions,
    repeatYield,
    correctControlRefusals: `${correctControlRefusals}/${repeats * 4}`,
    displayedControlClaims,
    deterministicRenderCoverage: `${validations.filter((item) => item.renderedSentence !== null).length}/${validations.filter((item) => item.disposition === 'verified').length}`,
    falseAcceptanceRate: `${falseAcceptances.length}/${falseCases.length}`,
    falseAcceptedFixtureIds: falseAcceptances.map(({ testCase }) => testCase.id),
    responseHashes,
    uniqueResponseHashes: new Set(responseHashes).size,
    contentHashes,
    uniqueContentHashes: new Set(contentHashes).size,
    humanUsefulness: { status: 'pending-additive-human-audit', rubric: HUMAN_USEFULNESS_RUBRIC },
    passed,
  };
}

async function main(): Promise<void> {
  if (modelTag !== 'qwen2.5-coder:7b') throw new Error(`Phase 5 is predeclared for qwen2.5-coder:7b, received ${modelTag}`);
  if (!Number.isInteger(numCtx) || numCtx < 1) throw new Error(`OLLAMA_NUM_CTX must be a positive integer, received ${numCtx}`);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error(`OLLAMA_CALL_TIMEOUT_MS must be positive, received ${timeoutMs}`);
  const startedAt = new Date().toISOString();
  const modelDigest = await resolveModelDigest();
  const writer = await ArtifactWriter.start(runsRoot, await createManifest(startedAt, modelDigest));
  const engine = await createEvalEngine();
  try {
    for (let index = 0; index < fixturePaths.length; index += 1) {
      await engine.loadCsv(['customers', 'products', 'orders', 'order_items'][index]!, fixturePaths[index]!);
    }
    await writer.appendEvent('fixture_loaded', { fixtureIds: ['customers', 'products', 'orders', 'order_items'] });
    await writer.writeJsonArtifact('claims', 'human-usefulness-rubric.json', HUMAN_USEFULNESS_RUBRIC);

    const evidenceByQuestion = new Map<string, EvidencePacket[]>();
    for (let questionIndex = 0; questionIndex < PHASE5_QUESTIONS.length; questionIndex += 1) {
      const question = PHASE5_QUESTIONS[questionIndex]!;
      const prefix = `question-${String(questionIndex + 1).padStart(2, '0')}`;
      await writer.writeJsonArtifact('plans', `${prefix}-hand-authored.json`, {
        provenance: 'predeclared-hand-authored-phase-5', questionId: question.id, question: question.text, plans: question.plans,
      });
      await writer.appendEvent('typed_plan_accepted', { questionId: question.id, probeCount: question.plans.length, provenance: 'hand-authored' });
      const packets: EvidencePacket[] = [];
      for (let probeIndex = 0; probeIndex < question.plans.length; probeIndex += 1) {
        const plan = question.plans[probeIndex]!;
        const sql = compileEcommercePlan(plan);
        await writer.writeSqlArtifact(`${prefix}-probe-${String(probeIndex + 1).padStart(2, '0')}.sql`, sql);
        await writer.appendEvent('sql_compiled', { questionId: question.id, probeId: plan.id });
        await writer.appendEvent('sql_started', { questionId: question.id, probeId: plan.id });
        const executed = await executeEcommercePlan(engine, plan);
        packets.push(executed.evidence);
        await writer.writeJsonArtifact('evidence', `${prefix}-probe-${String(probeIndex + 1).padStart(2, '0')}.json`, executed.evidence);
        await writer.appendEvent('sql_completed', { questionId: question.id, probeId: plan.id, rowCount: executed.evidence.rows.length });
      }
      evidenceByQuestion.set(question.id, packets);
    }

    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      for (let questionIndex = 0; questionIndex < PHASE5_QUESTIONS.length; questionIndex += 1) {
        const question = PHASE5_QUESTIONS[questionIndex]!;
        const evidence = evidenceByQuestion.get(question.id)!;
        const baseMessages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptFor(question, evidence) }];
        const first = await callModel(writer, question, baseMessages, 'claim', 1);
        let final = first;
        let repaired = false;
        if (!first.transportError && !first.proposal) {
          repaired = true;
          const repairMessages = [...baseMessages, {
            role: 'user',
            content: `The prior response was structurally invalid. Error: ${JSON.stringify(first.parseError)}. Prior content: ${JSON.stringify(first.rawContent ?? null)}. Return one corrected proposal.`,
          }];
          final = await callModel(writer, question, repairMessages, 'repair', 1);
        }
        const proposal = final.proposal ?? null;
        let verification: VerificationResult | null = null;
        let renderedSentence: string | null = null;
        let disposition: string;
        if (final.transportError) {
          disposition = 'transport_failed';
        } else if (!proposal) {
          disposition = 'parse_failed';
        } else if (question.kind === 'control') {
          disposition = proposal.disposition === 'unsupported' && proposal.reason === question.expectedUnsupportedReason
            ? 'correct_refusal'
            : proposal.disposition === 'unsupported' ? 'wrong_refusal' : 'control_claim_rejected';
        } else if (proposal.disposition === 'unsupported') {
          disposition = 'answerable_unsupported';
        } else {
          verification = verifyClaim(proposal.claim, evidence);
          disposition = verification.accepted ? 'verified' : verification.reason;
          renderedSentence = verification.accepted ? renderVerifiedFact(verification.fact) : null;
        }
        const stem = `repeat-${String(repeat).padStart(2, '0')}-question-${String(questionIndex + 1).padStart(2, '0')}`;
        await writer.writeJsonArtifact('claims', `${stem}-draft.json`, {
          repeat, questionId: question.id, firstPass: first.proposal ?? null, firstPassError: first.parseError ?? first.transportError ?? null,
          repairAttempted: repaired, finalProposal: proposal,
        });
        const validation: PersistedValidation = {
          repeat, questionId: question.id, questionKind: question.kind, firstPassValid: Boolean(first.proposal), repaired,
          proposal, verification, renderedSentence, disposition,
          ...(question.expectedUnsupportedReason ? { expectedUnsupportedReason: question.expectedUnsupportedReason } : {}),
        };
        await writer.writeJsonArtifact('claims', `${stem}-validation.json`, validation);
        await writer.appendEvent(renderedSentence ? 'claim_accepted' : 'claim_rejected', {
          repeat, questionId: question.id, disposition, displayed: Boolean(renderedSentence),
        });
        console.log(`repeat ${repeat}/${repeats} ${question.id}: ${disposition}`);
      }
    }

    const verdict = await scorePersistedArtifacts(writer.directory);
    await writer.complete(verdict);
    const inspection = await inspectRun(writer.directory);
    console.log(JSON.stringify({ runId: writer.runId, directory: writer.directory, modelDigest, verdict, inspection }, null, 2));
    if (!verdict.passed) process.exitCode = 1;
  } catch (error) {
    await writer.interrupt(error).catch(() => undefined);
    throw error;
  } finally {
    await engine.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
