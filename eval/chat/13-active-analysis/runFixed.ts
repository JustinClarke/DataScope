import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ArtifactWriter, sha256 } from '../12-verified-claims/artifactWriter';
import { compileEcommercePlan, executeEcommercePlan } from '../12-verified-claims/ecommercePipeline';
import { PHASE5_QUESTIONS, type Phase5Question } from '../12-verified-claims/phase5Protocol';
import { verifyClaim, type VerificationResult } from '../12-verified-claims/verifier';
import { buildCapabilityGapMap, corroborateUnsupported } from './capabilityGaps';
import { generateCandidates, generateOffers, offerCard } from './candidateGenerator';
import {
  accountTokens,
  FIXED_EVIDENCE_ACTION_SCHEMA,
  parseFixedEvidenceAction,
  ZERO_TOKEN_ACCOUNTING,
  type AnalysisOffer,
  type AnalysisOfferCard,
  type CallArtifact,
  type EvidencePacket,
  type FixedEvidenceAction,
  type TokenAccounting,
} from './contracts';
import { assertPromptSurfaceClean } from './datasetMap';
import { renderFact } from './renderer';
import { artifactStem, parseRepeatArgs, repeatId as repeatIdFor, repeatPlan, type Checkpoint5Manifest } from './repeats';
import {
  callWithSchema,
  OLLAMA_BASE_URL,
  QWEN3_MODEL_TAG,
  resolveQwen3,
  THINKING_MODE,
  type ChatMessage,
  type ResolvedModel,
  type SchemaCallResult,
} from './qwen3Rig';
import { createEcommerceFixture } from './testFixtures';

const executeFile = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../..');
const runsRoot = path.join(here, 'runs');

const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 8192);
const TOKEN_CAP = Number(process.env.OLLAMA_NUM_PREDICT ?? 2048);
const KEEP_ALIVE = '30m';

const fixturePaths = ['customers', 'products', 'orders', 'order_items'].map((name) =>
  path.join(repository, `public/samples/ecommerce/${name}.csv`),
);

/**
 * Arm A's contract statement. Same four-shape grammar as Arm B minus `request_probes`, which
 * the schema also makes undecodable — § Scored arms: "One model call per question; no probe
 * request permitted."
 */
const SYSTEM_PROMPT = [
  'You are answering from deterministic evidence that has already been computed for you.',
  'Take exactly one action, expressed as a single JSON object matching one of these three shapes:',
  '{"action":"final_claim","claim":{...}} to state a factual claim grounded in the supplied evidence.',
  '{"action":"final_offer","offerId":"..."} to select a precomputed executable offer by its exact id.',
  '{"action":"unsupported","reason":"..."} to report that the question cannot be answered with the available data.',
  'Only offer ids present in the offer menu are valid for final_offer.',
  'For a claim, use only evidenceId, rowId, field, and scope rowIds present in the supplied evidence.',
  'For an extremum, the scope must list every row in one complete packet.',
  'For a time change, from must be earlier and to later.',
  'Return exactly one JSON object and nothing else outside it.',
].join(' ');

/**
 * The one prompt line `assertPromptSurfaceClean` is deliberately not run over (§ Checkpoint 4,
 * Finding 5.1). The guard's sample-value rule rejects any non-temporal column extreme, and an
 * aggregate group label legitimately *is* one — `products.category` max is `Toys`, and a
 * category-revenue packet must label a row `Toys`. Kill criterion 3 permits exactly that: the
 * leak it forbids is "any original row or sample value ... outside a compact aggregate evidence
 * packet". These packets are compiled from predeclared plans by experiment 12's unchanged
 * compiler, so they are aggregate by construction; every other byte the model sees is guarded.
 */
const EVIDENCE_LINE = 2;

/**
 * Deliberately shaped like experiment 12's fixed-evidence prompt (question, source fields, the
 * predeclared packets) rather than Arm B's Turn 0 prompt. Arm A carries no dataset map: adding
 * one would inflate Arm A's prompt and hand H2's context high-water comparison to Arm B for a
 * reason that has nothing to do with the loop under test.
 */
function promptFor(
  question: Phase5Question,
  fields: Record<string, string[]>,
  evidence: readonly EvidencePacket[],
  offers: readonly AnalysisOfferCard[],
): { prompt: string; guardedSurface: string } {
  const lines = [
    `Question: ${question.text}`,
    `Available source fields: ${JSON.stringify(fields)}`,
    `Deterministic evidence: ${JSON.stringify(evidence)}`,
    `Available executable offers: ${JSON.stringify(offers)}`,
    'Return one verified supporting fact grounded in the evidence above, or one executable offer id when a next computation is the appropriate answer.',
    'One supporting fact is not expected to be a complete narrative answer to the question.',
  ];
  return { prompt: lines.join('\n'), guardedSurface: lines.filter((_, index) => index !== EVIDENCE_LINE).join('\n') };
}

type Disposition =
  | { kind: 'final_claim'; rendered: string }
  | { kind: 'rejected_claim'; reason: string; detail: string }
  | { kind: 'final_offer'; offerId: string }
  | { kind: 'rejected_offer'; offerId: string }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'rejected_unsupported'; reason: string }
  | { kind: 'no_useful_verified_result' };

interface QuestionRecord {
  questionId: string;
  questionKind: 'answerable' | 'control';
  /** § Checkpoint 5: which of the N repeats produced this record. 1 for a single-repeat run. */
  repeat: number;
  /** § Checkpoint 5: a call that never returned; recorded, marked, and not scored as a model result. */
  transportFailure: string | null;
  action: FixedEvidenceAction['action'] | 'parse_error' | 'transport_failure';
  repaired: boolean;
  parseError: string | null;
  responseHash: string | null;
  doneReason: string | null;
  disposition: Disposition;
  rendered: string | null;
  verification: VerificationResult | null;
  tokens: TokenAccounting;
  durationMs: number;
}

function createRunId(startedAt: string): string {
  const timestamp = startedAt.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return `${timestamp}-${randomBytes(3).toString('hex')}`;
}

async function git(args: string[]): Promise<string> {
  return (await executeFile('git', args, { cwd: repository })).stdout.trimEnd();
}

function selectedQuestions(): Phase5Question[] {
  const argument = process.argv.find((value) => value.startsWith('--questions='));
  if (!argument) return [...PHASE5_QUESTIONS];
  const ids = argument.slice('--questions='.length).split(',').filter(Boolean);
  const selection = ids.map((id) => {
    const question = PHASE5_QUESTIONS.find((candidate) => candidate.id === id);
    if (!question) throw new Error(`unknown question id: ${id}`);
    return question;
  });
  if (selection.length === 0) throw new Error('--questions= selected no questions');
  return selection;
}

async function createManifest(
  startedAt: string,
  model: ResolvedModel,
  questions: readonly Phase5Question[],
  plan: { repeats: number; seed: string; order: Array<{ repeat: number; questionIds: string[] }> },
): Promise<Checkpoint5Manifest> {
  const fixtures = await Promise.all(
    fixturePaths.map(async (absolutePath) => {
      const [bytes, metadata] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
      return { id: path.basename(absolutePath, '.csv'), absolutePath, byteSize: metadata.size, sha256: sha256(bytes) };
    }),
  );
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      ['candidateGenerator.ts', 'capabilityGaps.ts', 'contracts.ts', 'datasetMap.ts', 'qwen3Rig.ts', 'renderer.ts', 'repeats.ts', 'runFixed.ts', 'testFixtures.ts'].map(
        async (filename) => [filename, sha256(await readFile(path.join(here, filename)))],
      ),
    ),
  );
  return {
    runId: createRunId(startedAt),
    startedAt,
    command: process.argv,
    workingDirectory: process.cwd(),
    experimentVersion: '13.4',
    schemaVersions: { manifest: 1, events: 1, calls: 1 },
    git: { commit: await git(['rev-parse', 'HEAD']), statusShort: await git(['status', '--short']) },
    runtime: { node: process.version, duckdbWasm: '1.32.0', harness: '13.4' },
    fixtures,
    provider: { name: 'ollama-native-chat', endpointHost: new URL(OLLAMA_BASE_URL).host, modelTag: model.tag, modelDigest: model.digest },
    options: {
      temperature: THINKING_MODE.temperature,
      numCtx: NUM_CTX,
      keepAlive: KEEP_ALIVE,
      timeoutMs: Number(process.env.OLLAMA_CALL_TIMEOUT_MS ?? 600_000),
      retryCap: 0,
      repairCap: 1,
    },
    selection: {
      questions: questions.map((question) => question.id),
      repeats: plan.repeats,
      filters: [
        'arm A fixed evidence',
        'one model call per question',
        'no probe request permitted',
        'frozen thinking-mode sampler from checkpoint 2',
        ...(plan.repeats > 1 ? [`checkpoint 5 scored core: N=${plan.repeats}`, `question order seed: ${plan.seed}`] : []),
      ],
    },
    ...(plan.repeats > 1 ? { checkpoint5: { seed: plan.seed, repeats: plan.repeats, order: plan.order } } : {}),
    hashes: {
      systemPrompts: { fixed: sha256(SYSTEM_PROMPT) },
      schemas: { fixedEvidenceAction: sha256(JSON.stringify(FIXED_EVIDENCE_ACTION_SCHEMA)) },
      deterministicSources: sourceHashes,
    },
    privacy: { classification: 'bundled-public-fixtures-only', bundledPublicFixturesOnly: true },
  };
}

async function main(): Promise<void> {
  const questions = selectedQuestions();
  const { repeats, seed } = parseRepeatArgs(process.argv);
  const perRepeat = repeatPlan(questions, seed, repeats);
  console.log(`resolving ${QWEN3_MODEL_TAG} on ${OLLAMA_BASE_URL}...`);
  const model = await resolveQwen3();
  console.log(`resolved ${model.tag} digest=${model.digest}`);

  const { engine, passport } = await createEcommerceFixture();
  const candidates = generateCandidates(passport);
  const offers: AnalysisOffer[] = generateOffers(candidates);
  const offerCards = offers.map(offerCard);
  const gaps = buildCapabilityGapMap(passport);
  const fields = Object.fromEntries(passport.tables.map((table) => [table.name, table.columns.map((column) => column.column)]));
  // Finding 5.1: guard Arm A's own prompt, not a stand-in. The candidate menu this used to check
  // is Arm B's surface — Arm A never sends it — while the fields and offer menu Arm A does send
  // went unchecked. `guardedSurface` is composed from the same strings as the prompt itself, and
  // evidence is empty here only because that line is excluded from the guard either way.
  for (const question of questions) {
    assertPromptSurfaceClean(
      `${SYSTEM_PROMPT}\n${promptFor(question, fields, [], offerCards).guardedSurface}`,
      passport,
      PHASE5_QUESTIONS.map((entry) => entry.id),
    );
  }

  const startedAt = new Date().toISOString();
  const writer = await ArtifactWriter.start(
    runsRoot,
    await createManifest(startedAt, model, questions, {
      repeats,
      seed,
      order: perRepeat.map((entry) => ({ repeat: entry.repeat, questionIds: entry.questions.map((question) => question.id) })),
    }),
  );
  await writer.appendEvent('model_resolved', { tag: model.tag, digest: model.digest });
  await writer.appendEvent('prompt_surface_checked', {
    questionIdsLeaked: 0,
    sampleValuesLeaked: 0,
    guarded: 'system prompt, question text, source fields, offer menu',
    unguarded: 'deterministic aggregate evidence packets (kill criterion 3 permits aggregate group labels)',
  });
  await writer.appendEvent('fixture_loaded', { fixtureIds: ['customers', 'products', 'orders', 'order_items'], offerCount: offers.length });

  const records: QuestionRecord[] = [];
  try {
    // Flattened (repeat, question) sequence: each repeat's order comes from the persisted seed.
    const schedule = perRepeat.flatMap(({ repeat, questions: ordered }) => ordered.map((question) => ({ repeat, question })));
    for (const { repeat, question } of schedule) {
      const questionStartedAt = Date.now();
      const stem = artifactStem(question.id, repeatIdFor(repeat, repeats));
      let transportFailure: string | null = null;

      // The predeclared experiment 12 packets, recomputed by the unchanged compiler/executor.
      await writer.writeJsonArtifact('plans', `${stem}-plans.json`, {
        provenance: 'predeclared-hand-authored-phase-5',
        questionId: question.id,
        repeat,
        question: question.text,
        plans: question.plans,
      });
      const evidence: EvidencePacket[] = [];
      for (let index = 0; index < question.plans.length; index += 1) {
        const plan = question.plans[index]!;
        const sql = compileEcommercePlan(plan);
        await writer.writeSqlArtifact(`${stem}-probe-${String(index + 1).padStart(2, '0')}.sql`, sql);
        const executed = await executeEcommercePlan(engine, plan);
        evidence.push(executed.evidence);
        await writer.writeJsonArtifact('evidence', `${stem}-probe-${String(index + 1).padStart(2, '0')}.json`, executed.evidence);
        await writer.appendEvent('sql_completed', { questionId: question.id, repeat, probeId: plan.id, rowCount: executed.evidence.rows.length });
      }

      const baseMessages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: promptFor(question, fields, evidence, offerCards).prompt },
      ];
      let attemptMessages = [...baseMessages];
      let repaired = false;
      let result: SchemaCallResult | undefined;
      let action: FixedEvidenceAction | null = null;
      let parseError: string | null = null;
      let tokens: TokenAccounting = ZERO_TOKEN_ACCOUNTING;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const callStartedAt = new Date().toISOString();
        try {
          result = await callWithSchema(
            attemptMessages,
            THINKING_MODE,
            { numCtx: NUM_CTX, numPredict: TOKEN_CAP, keepAlive: KEEP_ALIVE },
            FIXED_EVIDENCE_ACTION_SCHEMA,
          );
        } catch (error) {
          // Kill criterion 9: a model call must not be absent from the artifacts, even when it never returned.
          await writer.writeCall({
            questionId: question.id, role: attempt === 1 ? 'claim' : 'repair', attempt, messages: attemptMessages,
            schema: FIXED_EVIDENCE_ACTION_SCHEMA, requestOptions: { numCtx: NUM_CTX, numPredict: TOKEN_CAP },
            tokenCounts: null, startedAt: callStartedAt, endedAt: new Date().toISOString(),
            durationMs: Date.now() - Date.parse(callStartedAt),
            error: String(error),
          });
          // Recorded above (kill criterion 9), then ends this question only: aborting the whole
          // scored run over one dead socket would discard every other completed question.
          transportFailure = String(error);
          break;
        }
        const endedAt = new Date().toISOString();
        action = null;
        parseError = null;
        try {
          action = parseFixedEvidenceAction(JSON.parse(result.rawContent));
        } catch (error) {
          parseError = String(error);
        }
        const call: CallArtifact = {
          questionId: question.id,
          role: attempt === 1 ? 'claim' : 'repair',
          attempt,
          messages: attemptMessages,
          schema: FIXED_EVIDENCE_ACTION_SCHEMA,
          requestOptions: {
            think: THINKING_MODE.think,
            numCtx: NUM_CTX,
            numPredict: TOKEN_CAP,
            temperature: THINKING_MODE.temperature,
            topP: THINKING_MODE.topP,
            topK: THINKING_MODE.topK,
          },
          ...(action ? { parsedValue: action } : {}),
          ...(parseError ? { parseError } : {}),
          tokenCounts: { prompt: result.promptTokens, response: result.responseTokens },
          startedAt: callStartedAt,
          endedAt,
          durationMs: Date.parse(endedAt) - Date.parse(callStartedAt),
          responseHash: sha256(result.rawContent),
          rawContent: result.rawContent,
          thinking: result.thinking,
        };
        await writer.writeCall(call);
        tokens = accountTokens(tokens, {
          promptTokens: result.promptTokens,
          // § Checkpoint 2 finding: with format + think:true, eval_count excludes the thinking trace.
          responseTokens: Math.max(result.responseTokens, result.estimatedResponseTokens),
        });
        if (action || attempt === 2) break;
        repaired = true;
        attemptMessages = [
          ...attemptMessages,
          {
            role: 'user',
            content: `The prior response was structurally invalid. Error: ${JSON.stringify(parseError)}. Return one corrected JSON object.`,
          },
        ];
      }

      let disposition: Disposition = { kind: 'no_useful_verified_result' };
      let rendered: string | null = null;
      let verification: VerificationResult | null = null;
      if (transportFailure) {
        const failed: QuestionRecord = {
          questionId: question.id, questionKind: question.kind, repeat, transportFailure,
          action: 'transport_failure', repaired, parseError: null, responseHash: null, doneReason: null,
          disposition, rendered: null, verification: null, tokens, durationMs: Date.now() - questionStartedAt,
        };
        records.push(failed);
        await writer.writeJsonArtifact('claims', `${stem}-disposition.json`, { ...failed, claim: null });
        await writer.appendEvent('question_terminal', { questionId: question.id, repeat, disposition: 'transport_failure', displayed: false });
        console.log(`[r${repeat}] ${question.id} (${question.kind}): transport_failure`);
        continue;
      }
      if (action?.action === 'final_claim') {
        verification = verifyClaim(action.claim, evidence);
        if (verification.accepted) {
          rendered = renderFact(verification.fact, action.claim, evidence);
          disposition = { kind: 'final_claim', rendered };
        } else {
          disposition = { kind: 'rejected_claim', reason: verification.reason, detail: verification.detail };
        }
      } else if (action?.action === 'final_offer') {
        const accepted = offers.some((offer) => offer.id === action.offerId);
        disposition = accepted ? { kind: 'final_offer', offerId: action.offerId } : { kind: 'rejected_offer', offerId: action.offerId };
      } else if (action?.action === 'unsupported') {
        const corroborated = corroborateUnsupported(action.reason, gaps, evidence);
        disposition = corroborated ? { kind: 'unsupported', reason: action.reason } : { kind: 'rejected_unsupported', reason: action.reason };
      }

      const record: QuestionRecord = {
        questionId: question.id,
        questionKind: question.kind,
        repeat,
        transportFailure,
        action: action?.action ?? 'parse_error',
        repaired,
        parseError,
        responseHash: sha256(result!.rawContent),
        doneReason: result!.doneReason,
        disposition,
        rendered,
        verification,
        tokens,
        durationMs: Date.now() - questionStartedAt,
      };
      records.push(record);
      await writer.writeJsonArtifact('claims', `${stem}-disposition.json`, {
        ...record,
        claim: action?.action === 'final_claim' ? action.claim : null,
        ...(question.expectedUnsupportedReason ? { expectedUnsupportedReason: question.expectedUnsupportedReason } : {}),
      });
      await writer.appendEvent('question_terminal', { questionId: question.id, repeat, disposition: disposition.kind, displayed: Boolean(rendered) });
      console.log(`[r${repeat}] ${question.id} (${question.kind}): ${disposition.kind}`);
      if (rendered) console.log(`  rendered: ${rendered}`);
    }
  } catch (error) {
    await writer.interrupt(error).catch(() => undefined);
    await engine.close();
    throw error;
  }
  await engine.close();

  await writer.complete({
    arm: 'A-fixed',
    checkpoint: repeats > 1 ? 5 : 4,
    model,
    selectedMode: THINKING_MODE.id,
    ...(repeats > 1 ? { repeats, seed } : {}),
    records,
  });
  const failures = records.filter((record) => record.transportFailure).length;
  console.log(
    `arm A complete: ${records.length} question-run(s) across ${repeats} repeat(s)${failures > 0 ? `, ${failures} transport failure(s)` : ''}, run ${writer.runId}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
