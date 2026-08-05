import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ArtifactWriter, sha256, type RawCallArtifact, type RunManifest } from '../12-verified-claims/artifactWriter';
import { ANALYSIS_ACTION_SCHEMA, type ProbeCandidateCard } from './contracts';
import {
  callAnalysisAction,
  OLLAMA_BASE_URL,
  PREFLIGHT_MODES,
  QWEN3_MODEL_TAG,
  resolveQwen3,
  type AnalysisActionCallResult,
  type ResolvedModel,
  type SamplerMode,
} from './qwen3Rig';

const executeFile = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../..');
const runsRoot = path.join(here, 'runs');

const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 8192);
/**
 * Predeclared before any call, applied as Ollama's `num_predict` so a mode that never
 * converges on schema-valid JSON is truncated rather than run away, and checked against
 * `eval_count` afterward as the fourth pass condition.
 */
const PREFLIGHT_TOKEN_CAP = 1024;
const KEEP_ALIVE = '30m';

/**
 * One fixed synthetic, non-ecommerce compatibility case (§ Thinking and sampling preflight).
 * Deliberately outside candidateGenerator.ts's ecommerce-only candidates: this call tests raw
 * platform/schema mechanics, not real candidate relevance.
 */
const SYNTHETIC_CANDIDATE_ID = 'sensor-average-celsius';
const SYNTHETIC_CANDIDATES: readonly ProbeCandidateCard[] = [
  {
    id: SYNTHETIC_CANDIDATE_ID,
    description: 'average celsius reading grouped by sensor',
    estimatedCostClass: 'small',
    topicTags: ['platform-preflight'],
  },
];

const SYSTEM_PROMPT = [
  'You are the analysis planner in a bounded evidence-acquisition loop.',
  'Take exactly one action per turn, expressed as a single JSON object matching one of these four shapes:',
  '{"action":"request_probes","candidateIds":[...]} to request evidence from one or more of the listed candidate computation ids.',
  '{"action":"final_claim","claim":{...}} to state a verified factual claim from evidence already shown to you in this conversation.',
  '{"action":"final_offer","offerId":"..."} to select a precomputed executable offer by its exact id.',
  '{"action":"unsupported","reason":"..."} to report that the question cannot be answered with the available data.',
  'Only candidate ids present in the candidate menu below are valid for request_probes.',
  'Return exactly one JSON object and nothing else outside it.',
].join(' ');

const QUESTION = 'Which sensor has the highest average reading?';
const USER_PROMPT = [
  `Dataset: synthetic-preflight (1 table: readings[id, sensor, celsius]).`,
  `Question: ${QUESTION}`,
  `Available candidate computations:\n${JSON.stringify(SYNTHETIC_CANDIDATES)}`,
  'No evidence has been computed yet for this question. Choose your next action.',
].join('\n');

interface ModeVerdict {
  mode: SamplerMode;
  schemaValid: boolean;
  thinkingSeparated: boolean;
  correctCandidateSelected: boolean;
  withinTokenCap: boolean;
  passed: boolean;
  promptTokens: number;
  responseTokens: number;
  estimatedResponseTokens: number;
  doneReason: string | null;
  parseError: string | null;
}

function evaluateMode(mode: SamplerMode, result: AnalysisActionCallResult): ModeVerdict {
  const schemaValid = result.action !== null;
  const thinkingSeparated = mode.think ? Boolean(result.thinking && result.thinking.trim() !== '') : true;
  const correctCandidateSelected =
    result.action?.action === 'request_probes' &&
    result.action.candidateIds.length === 1 &&
    result.action.candidateIds[0] === SYNTHETIC_CANDIDATE_ID;
  // Ollama's eval_count has been observed to exclude thinking tokens when format+think are
  // combined (see qwen3Rig's AnalysisActionCallResult doc comment); cap against whichever
  // count is larger so a mode with runaway hidden thinking cannot pass on an under-report.
  const observedResponseTokens = Math.max(result.responseTokens, result.estimatedResponseTokens);
  const withinTokenCap = observedResponseTokens <= PREFLIGHT_TOKEN_CAP && result.doneReason !== 'length';
  return {
    mode,
    schemaValid,
    thinkingSeparated,
    correctCandidateSelected,
    withinTokenCap,
    passed: schemaValid && thinkingSeparated && correctCandidateSelected && withinTokenCap,
    promptTokens: result.promptTokens,
    responseTokens: result.responseTokens,
    estimatedResponseTokens: result.estimatedResponseTokens,
    doneReason: result.doneReason,
    parseError: result.parseError,
  };
}

function createRunId(startedAt: string): string {
  const timestamp = startedAt.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return `${timestamp}-${randomBytes(3).toString('hex')}`;
}

async function git(args: string[]): Promise<string> {
  const result = await executeFile('git', args, { cwd: repository });
  return result.stdout.trimEnd();
}

async function createManifest(startedAt: string, model: ResolvedModel): Promise<RunManifest> {
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      ['contracts.ts', 'qwen3Rig.ts', 'runPreflight.ts'].map(async (filename) => [filename, sha256(await readFile(path.join(here, filename)))]),
    ),
  );
  return {
    runId: createRunId(startedAt),
    startedAt,
    command: process.argv,
    workingDirectory: process.cwd(),
    experimentVersion: '13.2',
    schemaVersions: { manifest: 1, events: 1, calls: 1 },
    git: { commit: await git(['rev-parse', 'HEAD']), statusShort: await git(['status', '--short']) },
    runtime: { node: process.version, duckdbWasm: '1.32.0', harness: '13.2' },
    fixtures: [],
    provider: { name: 'ollama-native-chat', endpointHost: new URL(OLLAMA_BASE_URL).host, modelTag: model.tag, modelDigest: model.digest },
    options: { temperature: -1, numCtx: NUM_CTX, keepAlive: KEEP_ALIVE, timeoutMs: Number(process.env.OLLAMA_CALL_TIMEOUT_MS ?? 600_000), retryCap: 0, repairCap: 0 },
    selection: { questions: ['checkpoint-2-platform-preflight'], repeats: 1, filters: ['non-ecommerce synthetic compatibility case'] },
    hashes: {
      systemPrompts: { preflight: sha256(SYSTEM_PROMPT) },
      schemas: { analysisAction: sha256(JSON.stringify(ANALYSIS_ACTION_SCHEMA)) },
      deterministicSources: sourceHashes,
    },
    privacy: { classification: 'synthetic-only', bundledPublicFixturesOnly: false },
  };
}

async function main(): Promise<void> {
  console.log(`resolving ${QWEN3_MODEL_TAG} on ${OLLAMA_BASE_URL}...`);
  const model = await resolveQwen3();
  console.log(`resolved ${model.tag} digest=${model.digest} quant=${model.quantizationLevel} params=${model.parameterSize} ctx=${model.contextLength}`);
  if (model.quantizationLevel !== 'Q4_K_M') {
    console.warn(`expected Q4_K_M, resolved quantization is ${model.quantizationLevel}`);
  }

  const startedAt = new Date().toISOString();
  const writer = await ArtifactWriter.start(runsRoot, await createManifest(startedAt, model));
  await writer.appendEvent('model_resolved', { tag: model.tag, digest: model.digest, quantizationLevel: model.quantizationLevel, contextLength: model.contextLength });

  const verdicts: ModeVerdict[] = [];
  for (const mode of PREFLIGHT_MODES) {
    await writer.appendEvent('mode_call_started', { modeId: mode.id, think: mode.think, temperature: mode.temperature, topP: mode.topP, topK: mode.topK });
    const callStartedAt = new Date().toISOString();
    let result: AnalysisActionCallResult | undefined;
    let transportError: unknown;
    try {
      result = await callAnalysisAction(SYSTEM_PROMPT, USER_PROMPT, mode, { numCtx: NUM_CTX, numPredict: PREFLIGHT_TOKEN_CAP, keepAlive: KEEP_ALIVE });
    } catch (error) {
      transportError = error;
    }
    const endedAt = new Date().toISOString();

    const call: RawCallArtifact = {
      questionId: 'checkpoint-2-platform-preflight',
      role: 'planner',
      attempt: mode.id === 'thinking' ? 1 : 2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT },
      ],
      schema: ANALYSIS_ACTION_SCHEMA,
      requestOptions: { think: mode.think, numCtx: NUM_CTX, numPredict: PREFLIGHT_TOKEN_CAP, temperature: mode.temperature, topP: mode.topP, topK: mode.topK },
      ...(result ? { parsedValue: result.action ?? undefined, parseError: result.parseError ?? undefined } : {}),
      tokenCounts: result ? { prompt: result.promptTokens, response: result.responseTokens } : null,
      startedAt: callStartedAt,
      endedAt,
      durationMs: Date.parse(endedAt) - Date.parse(callStartedAt),
      ...(transportError ? { error: transportError } : {}),
    };
    await writer.writeCall(call);

    if (!result) {
      await writer.appendEvent('mode_call_failed', { modeId: mode.id, error: String(transportError) });
      verdicts.push({
        mode,
        schemaValid: false,
        thinkingSeparated: false,
        correctCandidateSelected: false,
        withinTokenCap: false,
        passed: false,
        promptTokens: -1,
        responseTokens: -1,
        estimatedResponseTokens: -1,
        doneReason: null,
        parseError: String(transportError),
      });
      continue;
    }

    const verdict = evaluateMode(mode, result);
    verdicts.push(verdict);
    await writer.appendEvent('mode_call_evaluated', { modeId: mode.id, ...verdict, mode: undefined });
    console.log(
      `${mode.id}: schemaValid=${verdict.schemaValid} thinkingSeparated=${verdict.thinkingSeparated} correctCandidate=${verdict.correctCandidateSelected} withinTokenCap=${verdict.withinTokenCap} -> ${verdict.passed ? 'PASS' : 'FAIL'}`,
    );
  }

  const selected = verdicts.find((verdict) => verdict.passed) ?? null;
  const finalVerdict = {
    checkpoint: 2,
    model,
    selectedMode: selected?.mode.id ?? null,
    blocked: selected === null,
    modes: verdicts,
  };
  await writer.complete(finalVerdict);

  if (!selected) {
    console.error('BLOCKED: neither mode satisfied the platform contract. Checkpoint 2 stops here; no prompt repair is authorized.');
    process.exitCode = 1;
    return;
  }
  console.log(`Checkpoint 2 core default: ${selected.mode.id} mode, frozen for both scored arms (run ${writer.runId}).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
