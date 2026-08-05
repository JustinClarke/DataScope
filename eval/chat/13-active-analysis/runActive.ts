import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { EvalEngine } from '../../duckdb/duckdb';
import { ArtifactWriter, sha256 } from '../12-verified-claims/artifactWriter';
import { PHASE5_QUESTIONS, type Phase5Question } from '../12-verified-claims/phase5Protocol';
import { createLoopState, exhausted, step, type LoopDisposition, type ProbeRejection } from './analysisLoop';
import { EvidenceCache } from './cache';
import { candidateCard, generateCandidates, generateOffers, offerCard } from './candidateGenerator';
import {
  accountTokens,
  ANALYSIS_ACTION_SCHEMA,
  DEFAULT_LOOP_BUDGETS,
  parseAnalysisAction,
  ZERO_TOKEN_ACCOUNTING,
  type AnalysisAction,
  type AnalysisOffer,
  type AnalysisOfferCard,
  type CallArtifact,
  type ProbeCandidate,
  type ProbeCandidateCard,
  type TokenAccounting,
  type TokenUsage,
} from './contracts';
import { assertPromptSurfaceClean, buildDatasetMap, type DatasetMap } from './datasetMap';
import { laterTurnPrompt, SYSTEM_PROMPT, turn1Prompt } from './prompts';
import {
  artifactStem,
  parseRepeatArgs,
  repeatId as repeatIdFor,
  repeatPlan,
  type Checkpoint5Manifest,
} from './repeats';
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
/** § Hard stop: two probe rounds, so a third turn exists only to conclude. */
const MAX_TURNS = DEFAULT_LOOP_BUDGETS.maxRounds + 1;

const fixturePaths = ['customers', 'products', 'orders', 'order_items'].map((name) =>
  path.join(repository, `public/samples/ecommerce/${name}.csv`),
);

interface TurnRecord {
  turn: number;
  action: AnalysisAction['action'] | 'parse_error';
  candidateIds: string[] | null;
  responseHash: string;
  repaired: boolean;
  parseError: string | null;
  doneReason: string | null;
  promptTokens: number;
  responseTokens: number;
  estimatedResponseTokens: number;
}

interface QuestionRecord {
  questionId: string;
  questionKind: 'answerable' | 'control';
  /** § Checkpoint 5: which of the N repeats produced this record. 1 for a single-repeat run. */
  repeat: number;
  /**
   * § Checkpoint 5: a call that never returned. Recorded and excluded from the scored denominator
   * rather than silently scored as a yield failure — a dead socket is not a model result.
   */
  transportFailure: string | null;
  turns: TurnRecord[];
  executedCandidateIds: string[];
  probeRejections: ProbeRejection[];
  disposition: LoopDisposition;
  rendered: string | null;
  tokens: TokenAccounting;
  /** Answer key applied after the fact; never sent to the model (§ Probe relevance). */
  requestedQuestionRelevance: Array<{ candidateId: string; questionRelevance: string[] }>;
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
      [
        'analysisLoop.ts', 'cache.ts', 'candidateGenerator.ts', 'capabilityGaps.ts', 'compactEvidence.ts',
        'contracts.ts', 'datasetMap.ts', 'qwen3Rig.ts', 'renderer.ts', 'repeats.ts', 'runActive.ts', 'score.ts',
        'testFixtures.ts',
      ].map(async (filename) => [filename, sha256(await readFile(path.join(here, filename)))]),
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
      filters: process.argv.includes('--turn1-only')
        ? ['checkpoint 3 turn-1 diversity screen', 'no probe execution', 'no second turn', 'frozen thinking-mode sampler from checkpoint 2']
        : [
            'arm B active loop',
            'full turn 0/1/2 protocol with probe execution',
            'frozen thinking-mode sampler from checkpoint 2',
            ...(plan.repeats > 1
              ? [`checkpoint 5 scored core: N=${plan.repeats}`, `question order seed: ${plan.seed}`, 'cache reads and writes keyed by repeat id']
              : []),
      ],
    },
    ...(plan.repeats > 1 ? { checkpoint5: { seed: plan.seed, repeats: plan.repeats, order: plan.order } } : {}),
    hashes: {
      systemPrompts: { planner: sha256(SYSTEM_PROMPT) },
      schemas: { analysisAction: sha256(JSON.stringify(ANALYSIS_ACTION_SCHEMA)) },
      deterministicSources: sourceHashes,
    },
    privacy: { classification: 'bundled-public-fixtures-only', bundledPublicFixturesOnly: true },
  };
}

interface TurnCallOutcome {
  action: AnalysisAction | null;
  record: TurnRecord;
  /** One entry per attempt: § Metrics and ROI counts repairs in total model calls and tokens. */
  usages: TokenUsage[];
}

/** One turn: a schema-constrained call, plus at most one structural repair (§ Turn 1). */
async function callTurn(
  writer: ArtifactWriter,
  question: Phase5Question,
  turn: number,
  messages: readonly ChatMessage[],
): Promise<TurnCallOutcome> {
  let attemptMessages = [...messages];
  let repaired = false;
  let result: SchemaCallResult | undefined;
  let action: AnalysisAction | null = null;
  let parseError: string | null = null;
  const usages: TokenUsage[] = [];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = new Date().toISOString();
    try {
      result = await callWithSchema(attemptMessages, THINKING_MODE, { numCtx: NUM_CTX, numPredict: TOKEN_CAP, keepAlive: KEEP_ALIVE }, ANALYSIS_ACTION_SCHEMA);
    } catch (error) {
      // Kill criterion 9: a model call must not be absent from the artifacts, even when it never returned.
      await writer.writeCall({
        questionId: question.id, role: attempt === 1 ? 'planner' : 'repair', attempt, messages: attemptMessages,
        schema: ANALYSIS_ACTION_SCHEMA, requestOptions: { turn, numCtx: NUM_CTX, numPredict: TOKEN_CAP },
        tokenCounts: null, startedAt, endedAt: new Date().toISOString(),
        durationMs: Date.now() - Date.parse(startedAt), error: String(error),
      });
      throw error;
    }
    const endedAt = new Date().toISOString();
    usages.push({
      promptTokens: result.promptTokens,
      // § Checkpoint 2 finding: with format + think:true, eval_count excludes the thinking trace.
      responseTokens: Math.max(result.responseTokens, result.estimatedResponseTokens),
    });
    action = null;
    parseError = null;
    try {
      action = parseAnalysisAction(JSON.parse(result.rawContent));
    } catch (error) {
      parseError = String(error);
    }
    const call: CallArtifact = {
      questionId: question.id,
      role: attempt === 1 ? 'planner' : 'repair',
      attempt,
      messages: attemptMessages,
      schema: ANALYSIS_ACTION_SCHEMA,
      requestOptions: {
        turn,
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
      startedAt,
      endedAt,
      durationMs: Date.parse(endedAt) - Date.parse(startedAt),
      responseHash: sha256(result.rawContent),
      rawContent: result.rawContent,
      thinking: result.thinking,
    };
    await writer.writeCall(call);
    await writer.appendEvent(action ? 'turn_parsed' : 'turn_parse_failed', {
      questionId: question.id, turn, attempt, action: action?.action ?? null, parseError,
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

  const final = result!;
  return {
    action,
    usages,
    record: {
      turn,
      action: action?.action ?? 'parse_error',
      candidateIds: action && action.action === 'request_probes' ? [...action.candidateIds] : null,
      responseHash: sha256(final.rawContent),
      repaired,
      parseError,
      doneReason: final.doneReason,
      promptTokens: final.promptTokens,
      responseTokens: final.responseTokens,
      estimatedResponseTokens: final.estimatedResponseTokens,
    },
  };
}

async function runQuestion(
  engine: EvalEngine,
  writer: ArtifactWriter,
  question: Phase5Question,
  context: {
    passport: Awaited<ReturnType<typeof createEcommerceFixture>>['passport'];
    candidates: readonly ProbeCandidate[];
    offers: readonly AnalysisOffer[];
    datasetMap: DatasetMap;
    cards: readonly ProbeCandidateCard[];
    offerCards: readonly AnalysisOfferCard[];
    repeat: number;
    repeatId: string | undefined;
  },
): Promise<QuestionRecord> {
  const questionStartedAt = Date.now();
  const stem = artifactStem(question.id, context.repeatId);
  /**
   * § Cache and context rules, Checkpoint 5 repeat isolation. The cache is per question — the
   * frozen turn-1 prompt states "No evidence has been computed yet for this question", so a
   * cross-question cache would make that line false and require a prompt change Checkpoint 5
   * forbids. `repeatId` additionally keys every entry, so the isolation the scored core requires
   * is recorded in each cache event rather than only implied by the cache's lifetime.
   */
  let state = createLoopState({
    questionId: question.id,
    passport: context.passport,
    candidates: context.candidates,
    offers: context.offers,
    cache: new EvidenceCache(),
    ...(context.repeatId === undefined ? {} : { repeatId: context.repeatId }),
  });
  await writer.writeJsonArtifact('plans', `${stem}-candidates.json`, {
    questionId: question.id,
    repeat: context.repeat,
    question: question.text,
    candidates: context.candidates,
    offers: context.offers,
  });

  const turns: TurnRecord[] = [];
  const probeRejections: ProbeRejection[] = [];
  const requestedQuestionRelevance: QuestionRecord['requestedQuestionRelevance'] = [];
  let tokens: TokenAccounting = ZERO_TOKEN_ACCOUNTING;
  let disposition: LoopDisposition = exhausted();
  let rendered: string | null = null;
  let transportFailure: string | null = null;

  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    const unresolved = context.candidates
      .filter((candidate) => !state.executedCandidateIds.includes(candidate.id))
      .map(candidateCard);
    const userPrompt = turn === 1
      ? turn1Prompt(question, context.datasetMap, context.cards, context.offerCards)
      : laterTurnPrompt(question, state, unresolved, context.offerCards);
    let outcomeOfCall: TurnCallOutcome;
    try {
      outcomeOfCall = await callTurn(writer, question, turn, [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ]);
    } catch (error) {
      // The call is already persisted by `callTurn` (kill criterion 9). Ending the whole scored
      // run here would discard up to seventy-nine other completed questions over one dead socket,
      // so the failure ends this question only and is carried, marked, into the record.
      transportFailure = String(error);
      disposition = exhausted();
      await writer.appendEvent('question_terminal', {
        questionId: question.id, repeat: context.repeat, reason: 'transport_failure', turn, error: transportFailure,
      });
      break;
    }
    const { action, record, usages } = outcomeOfCall;
    turns.push(record);
    for (const usage of usages) tokens = accountTokens(tokens, usage);

    if (!action) {
      disposition = exhausted();
      await writer.appendEvent('question_terminal', { questionId: question.id, repeat: context.repeat, reason: 'unrepaired_structural_failure' });
      break;
    }
    if (action.action === 'request_probes') {
      for (const candidateId of action.candidateIds) {
        const candidate = context.candidates.find((entry) => entry.id === candidateId);
        requestedQuestionRelevance.push({ candidateId, questionRelevance: candidate?.questionRelevance ?? [] });
      }
    }

    const outcome = await step({ engine, state, action, writer });
    state = outcome.state;
    if (outcome.status === 'terminal') {
      disposition = outcome.disposition;
      rendered = outcome.disposition.kind === 'final_claim' ? outcome.disposition.rendered : null;
      break;
    }
    if (outcome.status === 'probes_rejected') {
      // § Turn 1: a bad semantic choice earns no retry.
      probeRejections.push(...outcome.rejections);
      disposition = exhausted();
      await writer.appendEvent('question_terminal', { questionId: question.id, repeat: context.repeat, reason: 'probe_request_rejected' });
      break;
    }
  }

  await writer.writeJsonArtifact('claims', `${stem}-disposition.json`, {
    questionId: question.id,
    questionKind: question.kind,
    repeat: context.repeat,
    transportFailure,
    disposition,
    rendered,
    turns,
    executedCandidateIds: state.executedCandidateIds,
    probeRejections,
    ...(question.expectedUnsupportedReason ? { expectedUnsupportedReason: question.expectedUnsupportedReason } : {}),
  });

  return {
    questionId: question.id,
    questionKind: question.kind,
    repeat: context.repeat,
    transportFailure,
    turns,
    executedCandidateIds: [...state.executedCandidateIds],
    probeRejections,
    disposition,
    rendered,
    tokens,
    requestedQuestionRelevance,
    durationMs: Date.now() - questionStartedAt,
  };
}

/** The minimum a record needs to be scored by the § Checkpoint 3 turn-1 diversity screen. */
interface ScreenInput {
  questionId: string;
  questionKind: 'answerable' | 'control';
  turns: readonly TurnRecord[];
}

/**
 * The coarse half of the § Checkpoint 3 stop rule, retained here because Checkpoints 4-5 share
 * this file: action type plus (for request_probes only) the requested candidate set. Only
 * meaningful when the run covers the whole eight-question set.
 */
function selectionSignatureFor(record: ScreenInput): string {
  const first = record.turns[0];
  if (!first || first.action === 'parse_error') return 'parse_error';
  if (first.action === 'request_probes') return `request_probes:${[...(first.candidateIds ?? [])].sort().join(',')}`;
  return first.action;
}

function turn1DiversityScreen(records: readonly ScreenInput[]): Record<string, unknown> | null {
  if (records.length !== PHASE5_QUESTIONS.length) return null;
  const half = records.length / 2;
  const group = (keyOf: (record: ScreenInput) => string): Record<string, string[]> => {
    const counts: Record<string, string[]> = {};
    for (const record of records) (counts[keyOf(record)] ??= []).push(record.questionId);
    return counts;
  };
  const hashCounts = group((record) => record.turns[0]?.responseHash ?? 'none');
  const signatureCounts = group(selectionSignatureFor);
  const responseHashCollapse = Object.entries(hashCounts).find(([, ids]) => ids.length > half) ?? null;
  const selectionCollapse = Object.entries(signatureCounts).find(([, ids]) => ids.length > half) ?? null;
  let crossBoundaryCollision: { answerableId: string; controlId: string; selection: string } | null = null;
  for (const answerable of records.filter((record) => record.questionKind === 'answerable')) {
    const signature = selectionSignatureFor(answerable);
    const control = records.find((record) => record.questionKind === 'control' && selectionSignatureFor(record) === signature);
    if (control) {
      crossBoundaryCollision = { answerableId: answerable.questionId, controlId: control.questionId, selection: signature };
      break;
    }
  }
  const blocked = Boolean(responseHashCollapse) || Boolean(selectionCollapse) || Boolean(crossBoundaryCollision);
  return {
    uniqueResponseHashes: Object.keys(hashCounts).length,
    uniqueSelections: Object.keys(signatureCounts).length,
    responseHashCollapse: responseHashCollapse ? { hash: responseHashCollapse[0], questionIds: responseHashCollapse[1] } : null,
    selectionCollapse: selectionCollapse ? { selection: selectionCollapse[0], questionIds: selectionCollapse[1] } : null,
    crossBoundaryCollision,
    blocked,
    passed: !blocked,
  };
}

async function main(): Promise<void> {
  const questions = selectedQuestions();
  /** § Checkpoint 3's screen mode: turn 1 only, no probe execution, no second turn. */
  const turn1Only = process.argv.includes('--turn1-only');
  const { repeats, seed } = parseRepeatArgs(process.argv);
  if (turn1Only && repeats !== 1) throw new Error('--turn1-only is the Checkpoint 3 screen and runs one repeat');
  const plan = repeatPlan(questions, seed, repeats);
  console.log(`resolving ${QWEN3_MODEL_TAG} on ${OLLAMA_BASE_URL}...`);
  const model = await resolveQwen3();
  console.log(`resolved ${model.tag} digest=${model.digest}`);

  const { engine, passport } = await createEcommerceFixture();
  const candidates = generateCandidates(passport);
  const cards = candidates.map(candidateCard);
  const offers = generateOffers(candidates);
  const offerCards = offers.map(offerCard);
  const datasetMap = buildDatasetMap(passport);
  assertPromptSurfaceClean(
    JSON.stringify([datasetMap, cards, offerCards]),
    passport,
    PHASE5_QUESTIONS.map((question) => question.id),
  );

  const startedAt = new Date().toISOString();
  const writer = await ArtifactWriter.start(
    runsRoot,
    await createManifest(startedAt, model, questions, {
      repeats,
      seed,
      order: plan.map((entry) => ({ repeat: entry.repeat, questionIds: entry.questions.map((question) => question.id) })),
    }),
  );
  await writer.appendEvent('model_resolved', { tag: model.tag, digest: model.digest });
  await writer.appendEvent('prompt_surface_checked', { questionIdsLeaked: 0, sampleValuesLeaked: 0 });
  await writer.appendEvent('fixture_loaded', {
    fixtureIds: ['customers', 'products', 'orders', 'order_items'],
    candidateCount: candidates.length,
    offerCount: offers.length,
  });

  const records: QuestionRecord[] = [];
  const screenRecords: ScreenInput[] = [];
  try {
    for (const { repeat, questions: ordered } of plan) {
      const repeatKey = repeatIdFor(repeat, repeats);
      if (repeats > 1) {
        await writer.appendEvent('repeat_started', { repeat, questionIds: ordered.map((question) => question.id) });
        console.log(`--- repeat ${repeat}/${repeats}: ${ordered.map((question) => question.id).join(' ')}`);
      }
      for (const question of ordered) {
        if (turn1Only) {
          // § Checkpoint 3: one Turn-1 call per question, no probe execution and no second turn.
          const { record } = await callTurn(writer, question, 1, [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: turn1Prompt(question, datasetMap, cards, offerCards) },
          ]);
          screenRecords.push({ questionId: question.id, questionKind: question.kind, turns: [record] });
          console.log(`${question.id} (${question.kind}): action=${record.action} candidateIds=${record.candidateIds?.join(',') ?? '-'} hash=${record.responseHash.slice(0, 12)}`);
          continue;
        }
        const record = await runQuestion(engine, writer, question, {
          passport, candidates, offers, datasetMap, cards, offerCards, repeat, repeatId: repeatKey,
        });
        records.push(record);
        if (repeats === 1) screenRecords.push(record);
        console.log(
          `[r${repeat}] ${question.id} (${question.kind}): ${record.transportFailure ? 'transport_failure' : record.disposition.kind} after ${record.turns.length} turn(s), probes=[${record.executedCandidateIds.join(',')}]`,
        );
        if (record.rendered) console.log(`  rendered: ${record.rendered}`);
      }
    }
  } catch (error) {
    await writer.interrupt(error).catch(() => undefined);
    await engine.close();
    throw error;
  }
  await engine.close();

  const screen = turn1DiversityScreen(screenRecords);
  await writer.complete({
    arm: turn1Only ? 'B-active-turn1-screen' : 'B-active',
    checkpoint: turn1Only ? 3 : repeats > 1 ? 5 : 4,
    model,
    selectedMode: THINKING_MODE.id,
    budgets: DEFAULT_LOOP_BUDGETS,
    ...(repeats > 1 ? { repeats, seed, repeatIsolatedCache: true } : {}),
    records,
    turn1DiversityScreen: screen,
  });

  if (turn1Only) {
    if (!screen) throw new Error('the turn-1 diversity screen requires the complete eight-question set');
    if (screen.blocked) {
      console.error(
        'BLOCKED: turn-1 diversity screen reproduced the experiment-12 collapse signature. Checkpoint 4 stays blocked pending a sampler or platform re-check; no prompt rewrite on the real questions is authorized.',
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Checkpoint 3 passed: ${screenRecords.length}/${screenRecords.length} turn-1 calls diverse, no answerable/control collision (run ${writer.runId}).`);
    return;
  }
  const failures = records.filter((record) => record.transportFailure).length;
  console.log(
    `arm B complete: ${records.length} question-run(s) across ${repeats} repeat(s)${failures > 0 ? `, ${failures} transport failure(s)` : ''}, run ${writer.runId}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
