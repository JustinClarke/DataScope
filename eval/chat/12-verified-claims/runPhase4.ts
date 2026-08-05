import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createEvalEngine } from '../../duckdb/duckdb';
import { ArtifactWriter, inspectRun, sha256, type RawCallArtifact, type RunManifest } from './artifactWriter';
import { CLAIM_IR_SCHEMA, parseClaimIR, type ClaimIR } from './claimIr';
import { compileEcommercePlan, executeEcommercePlan } from './ecommercePipeline';
import { monthlyRevenuePlan } from './phase3Plans';
import { renderVerifiedFact } from './renderer';
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
const questionId = 'monthly-revenue-december-2021-to-january-2022';
const question = 'What changed in January 2022 compared with December 2021?';
const ecommerceFixtures = [
  path.join(repository, 'public/samples/ecommerce/orders.csv'),
  path.join(repository, 'public/samples/ecommerce/order_items.csv'),
];
const deterministicSources = [
  'artifactWriter.ts',
  'claimIr.ts',
  'ecommercePipeline.ts',
  'evidence.ts',
  'metrics.ts',
  'renderer.ts',
  'runPhase4.ts',
  'verifier.ts',
];
const systemPrompt = [
  'Return exactly one ClaimIR JSON object and no prose.',
  'Use only evidenceId, rowId, and field values present in the supplied deterministic evidence.',
  'Choose the relation that directly answers the question and is true of the evidence.',
  'For a time comparison, use kind "change", with the earlier cell in "from" and the later cell in "to".',
  'Do not add labels, explanations, magnitude words, or unsupported fields.',
].join(' ');

interface OllamaTagsBody {
  models?: Array<{ name?: string; model?: string; digest?: string }>;
}

interface OllamaChatBody {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

function createRunId(startedAt: string): string {
  const timestamp = startedAt.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return `${timestamp}-${randomBytes(3).toString('hex')}`;
}

function tagsEndpoint(): string {
  const url = new URL(endpoint);
  url.pathname = '/api/tags';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function endpointHost(): string {
  const url = new URL(endpoint);
  return url.host;
}

function serializedError(error: unknown): unknown {
  if (!(error instanceof Error)) return { message: String(error) };
  const withDetails = error as Error & { code?: unknown };
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(withDetails.code === undefined ? {} : { code: withDetails.code }),
    ...(error.cause === undefined ? {} : { cause: serializedError(error.cause) }),
  };
}

async function git(command: string[]): Promise<string> {
  const result = await executeFile('git', command, { cwd: repository });
  return result.stdout.trimEnd();
}

async function resolveModelDigest(): Promise<string> {
  const response = await fetch(tagsEndpoint(), { signal: AbortSignal.timeout(20_000) });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Ollama tags request failed with HTTP ${response.status}: ${raw}`);
  const body = JSON.parse(raw) as OllamaTagsBody;
  const match = body.models?.find((model) => model.name === modelTag || model.model === modelTag);
  if (!match?.digest) throw new Error(`Ollama tag ${modelTag} was not present with a digest`);
  return match.digest;
}

async function createManifest(startedAt: string, modelDigest: string): Promise<RunManifest> {
  const fixtures = await Promise.all(ecommerceFixtures.map(async (absolutePath) => {
    const [bytes, metadata] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
    return { id: path.basename(absolutePath, '.csv'), absolutePath, byteSize: metadata.size, sha256: sha256(bytes) };
  }));
  const sourceHashes = Object.fromEntries(await Promise.all(deterministicSources.map(async (filename) => [
    filename,
    sha256(await readFile(path.join(here, filename))),
  ])));
  return {
    runId: createRunId(startedAt),
    startedAt,
    command: process.argv,
    workingDirectory: process.cwd(),
    experimentVersion: '12.4',
    schemaVersions: { manifest: 1, events: 1, calls: 1 },
    git: { commit: await git(['rev-parse', 'HEAD']), statusShort: await git(['status', '--short']) },
    runtime: { node: process.version, duckdbWasm: '1.32.0', harness: '12.4' },
    fixtures,
    provider: { name: 'ollama-native-chat', endpointHost: endpointHost(), modelTag, modelDigest },
    options: { temperature: 0, numCtx, keepAlive, timeoutMs, retryCap: 0, repairCap: 0 },
    selection: {
      questions: [questionId],
      repeats: 1,
      filters: ['orders.status=all', 'months=2021-12,2022-01'],
    },
    hashes: {
      systemPrompts: { claim: sha256(systemPrompt) },
      schemas: { claimIr: sha256(JSON.stringify(CLAIM_IR_SCHEMA)) },
      deterministicSources: sourceHashes,
    },
    privacy: { classification: 'bundled-public-fixtures-only', bundledPublicFixturesOnly: true },
  };
}

async function main(): Promise<void> {
  if (modelTag !== 'qwen2.5-coder:7b') {
    throw new Error(`Phase 4 is predeclared for qwen2.5-coder:7b, received ${modelTag}`);
  }
  if (!Number.isInteger(numCtx) || numCtx < 1) throw new Error(`OLLAMA_NUM_CTX must be a positive integer, received ${numCtx}`);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error(`OLLAMA_CALL_TIMEOUT_MS must be positive, received ${timeoutMs}`);

  const startedAt = new Date().toISOString();
  const modelDigest = await resolveModelDigest();
  const writer = await ArtifactWriter.start(runsRoot, await createManifest(startedAt, modelDigest));
  const engine = await createEvalEngine();
  try {
    await engine.loadCsv('orders', ecommerceFixtures[0]!);
    await engine.loadCsv('order_items', ecommerceFixtures[1]!);
    await writer.appendEvent('fixture_loaded', { fixtureIds: ['orders', 'order_items'] });

    await writer.writeJsonArtifact('plans', 'question-01-hand-authored.json', {
      provenance: 'preselected-hand-authored-phase-4',
      questionId,
      question,
      plans: [monthlyRevenuePlan],
    });
    await writer.appendEvent('typed_plan_accepted', { questionId, probeCount: 1, provenance: 'hand-authored' });

    const sql = compileEcommercePlan(monthlyRevenuePlan);
    await writer.writeSqlArtifact('question-01-probe-01.sql', sql);
    await writer.appendEvent('sql_compiled', { questionId, probeId: monthlyRevenuePlan.id });
    await writer.appendEvent('sql_started', { questionId, probeId: monthlyRevenuePlan.id });
    const executed = await executeEcommercePlan(engine, monthlyRevenuePlan);
    await writer.writeJsonArtifact('evidence', 'question-01-probe-01.json', executed.evidence);
    await writer.appendEvent('sql_completed', {
      questionId,
      probeId: monthlyRevenuePlan.id,
      rowCount: executed.evidence.rows.length,
    });

    const userPrompt = `Question: ${question}\n\nDeterministic evidence:\n${JSON.stringify(executed.evidence, null, 2)}`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    const requestBody = {
      model: modelTag,
      messages,
      stream: false,
      keep_alive: keepAlive,
      format: CLAIM_IR_SCHEMA,
      options: { num_ctx: numCtx, temperature: 0 },
    };
    const callStartedAt = new Date().toISOString();
    const callStart = performance.now();
    await writer.appendEvent('model_request_started', { questionId, role: 'claim', attempt: 1 });

    let response: Response | undefined;
    let rawResponseBody: string | undefined;
    let providerBody: OllamaChatBody | undefined;
    let claim: ClaimIR | undefined;
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
        questionId,
        role: 'claim',
        attempt: 1,
        httpStatus: response.status,
      });
      if (!response.ok) {
        transportError = new Error(`Ollama chat request failed with HTTP ${response.status}`);
      } else {
        try {
          providerBody = JSON.parse(rawResponseBody) as OllamaChatBody;
          const content = providerBody.message?.content;
          if (typeof content !== 'string' || content.length === 0) throw new Error('Ollama response has no message content');
          claim = parseClaimIR(JSON.parse(content) as unknown);
        } catch (error) {
          parseError = serializedError(error);
        }
      }
    } catch (error) {
      transportError = serializedError(error);
      await writer.appendEvent('model_request_failed', { questionId, role: 'claim', attempt: 1, error: transportError });
    }

    const callEndedAt = new Date().toISOString();
    const call: RawCallArtifact = {
      questionId,
      role: 'claim',
      attempt: 1,
      messages,
      schema: CLAIM_IR_SCHEMA,
      requestOptions: { endpoint, body: requestBody, timeoutMs },
      ...(response && rawResponseBody !== undefined ? {
        http: {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          rawResponseBody,
        },
      } : {}),
      ...(claim ? { parsedValue: claim } : {}),
      ...(parseError ? { parseError } : {}),
      tokenCounts: providerBody ? {
        prompt: providerBody.prompt_eval_count ?? null,
        response: providerBody.eval_count ?? null,
      } : null,
      startedAt: callStartedAt,
      endedAt: callEndedAt,
      durationMs: Math.round(performance.now() - callStart),
      ...(transportError ? { error: transportError } : {}),
    };
    await writer.writeCall(call);

    if (transportError) {
      await writer.appendEvent('claim_rejected', { questionId, disposition: 'transport_failed' });
    } else if (parseError || !claim) {
      await writer.appendEvent('response_rejected', { questionId, disposition: 'parse_failed', reason: parseError });
      await writer.appendEvent('claim_rejected', { questionId, disposition: 'parse_failed' });
    } else {
      await writer.appendEvent('response_parsed', { questionId, disposition: 'first_pass_valid' });
    }

    await writer.writeJsonArtifact('claims', 'question-01-draft.json', {
      provenance: 'model-first-pass-phase-4',
      questionId,
      claim: claim ?? null,
      parseError: parseError ?? null,
      repairAttempted: false,
    });
    const verification: VerificationResult | null = claim ? verifyClaim(claim, [executed.evidence]) : null;
    const renderedSentence = verification?.accepted ? renderVerifiedFact(verification.fact) : null;
    await writer.writeJsonArtifact('claims', 'question-01-validation.json', {
      claim: claim ?? null,
      resolvedEvidence: executed.evidence,
      result: verification,
      renderedSentence,
    });
    if (verification) {
      await writer.appendEvent(verification.accepted ? 'claim_accepted' : 'claim_rejected', {
        questionId,
        disposition: verification.accepted ? 'verified' : verification.reason,
      });
    }

    const passed = Boolean(
      !transportError
      && !parseError
      && claim
      && verification?.accepted
      && renderedSentence,
    );
    const verdict = {
      phase: 4,
      questionId,
      modelCalls: 1,
      firstPassValid: Boolean(claim),
      repairAttempted: false,
      repairCalls: 0,
      verifierAccepted: verification?.accepted ?? false,
      verifierDisposition: verification ? (verification.accepted ? 'verified' : verification.reason) : null,
      renderedSentence,
      passed,
    };
    await writer.complete(verdict);
    const inspection = await inspectRun(writer.directory);
    console.log(JSON.stringify({ runId: writer.runId, directory: writer.directory, modelDigest, verdict, inspection }, null, 2));
    if (!passed) process.exitCode = 1;
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
