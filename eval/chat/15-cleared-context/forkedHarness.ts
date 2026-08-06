// Checkpoint 6 — the forked harness (§ "The only build 15A requires" #5:
// "run shared phase one, snapshot, fork into two isolated branches, enforce
// ceilings, record terminal reasons"), implementing the ASCII diagram under
// § Frozen comparison arms.
//
// Two deliberate simplifications from a literal reading of that section,
// both documented here rather than left implicit:
//
// 1. **One tagged engine, not two physical databases.** The doc says "clone
//    the ledger/result-store snapshot for two isolated phase-two branches."
//    This harness instead runs both arms' phase two against the same
//    in-process DuckDB engine, with isolation enforced logically: every
//    ledger row is tagged with `arm`, and duplicate lookup is scoped to the
//    caller's own `visibleArms`. This is sufficient *because* the harness
//    core here is read-only — Checkpoint 3's ledger writer and this file
//    never pass a `Catalog` seam to `createAnalystCore` (see
//    `../../harness/runHarness.ts`'s `createHarnessCore`), so
//    `derive_table`/`create_view`/`drop_derived` all refuse and there is no
//    mutable dataset state for one arm to leak into the other's. If a later
//    build adds write operations to the frozen profile, this shortcut needs
//    revisiting.
// 2. **The terminal-reason table has a gap this file resolves explicitly.**
//    § Early completion and terminal reasons enumerates six reasons, but
//    "at most 8 provider calls" (§ Frozen comparison arms) means a phase can
//    end by the model voluntarily emitting zero tool calls before the
//    ceiling — and if that happens with *some* new evidence produced but not
//    full requirement satisfaction, none of the six reasons literally fits:
//    `no_progress` requires *no* new evidence, and `exhausted` in the doc's
//    prose reads as ceiling-caused. This file's resolution: `exhausted`
//    means "phase two ended — by ceiling or by the model's own choice —
//    without full satisfaction and without being blocked," and `no_progress`
//    is reserved for the stricter case the doc actually defines (zero new
//    contributing evidence, zero requirement transitions). See
//    `classifyPhaseTwoOutcome` below.
import { isOpError, type OpOutcome } from '../../../src/lib/analyst/types';
import type { AnalystMcpSession } from '../../../src/lib/analyst/mcp/connect';
import type { AITool, ProviderMessage, ProviderTurn } from '../../../src/types';
import type { EvalEngine } from '../../duckdb/duckdb';
import {
  describeRepairPrompt,
  initialSubmissionState,
  recordCheckpointSubmission,
} from './checkpointValidator';
import { buildMidpointBriefing } from './briefingBuilder';
import { computeRequestHash, computeResultHash } from './duplicateIdentity';
import {
  findAttemptsByRequestHash,
  insertArtifact,
  insertAttempt,
  listArtifacts,
  listAttempts,
  listRequirements,
  upsertCheckpoint,
  upsertRoundAccounting,
} from './ledger';
import {
  accountUsage,
  CONSECUTIVE_FAILURE_LIMIT,
  PHASE_CEILINGS,
  WHOLE_ANALYST_CEILINGS,
  ZERO_USAGE_TOTALS,
  type ArmTag,
  type Artifact,
  type Attempt,
  type CallUsage,
  type Checkpoint,
  type ClearingArm,
  type PhaseCeilings,
  type PhaseNumber,
  type RoundAccounting,
  type TaskOutcome,
  type TerminalReason,
  type UsageTotals,
} from './contracts';

/** A provider round-trip that reports the call's own usage — see `geminiProvider.ts`'s file header for why this is a distinct shape from the bare `AIProvider` contract. Tests supply a fake; production wires `createUsageTrackedGeminiProvider` through a thin adapter. */
export type MeteredComplete = (
  messages: ProviderMessage[],
  tools: AITool[],
  options?: { signal?: AbortSignal },
) => Promise<{ turn: ProviderTurn; usage: CallUsage }>;

function newId(): string {
  return crypto.randomUUID();
}
function nowIso(): string {
  return new Date().toISOString();
}

async function allRequirementsSatisfied(engine: EvalEngine): Promise<boolean> {
  const requirements = await listRequirements(engine);
  // `[].every(...)` is vacuously true — a task with no seeded requirements is a setup
  // bug, not an instantly-satisfied task, so it must never trigger early completion.
  if (requirements.length === 0) return false;
  return requirements.every((r) => r.status === 'satisfied');
}

export interface OperationLoopInput {
  phase: PhaseNumber;
  arm: ArmTag;
  /** Which arms' attempts count as "already tried" for duplicate lookup — see file header, simplification 1. */
  visibleArms: readonly ArmTag[];
  datasetRevision: string;
  session: AnalystMcpSession;
  complete: MeteredComplete;
  messages: readonly ProviderMessage[];
  ceilings: PhaseCeilings;
  engine: EvalEngine;
  /**
   * Persists any newly-satisfied requirements and returns how many
   * transitioned — Checkpoint 7's job; a no-op default is fine for
   * orchestration logic that doesn't care about satisfaction.
   *
   * Takes `visibleArms` so a real implementation (`createGoldFileChecker`)
   * can scope its evidence scan to what this branch is actually allowed to
   * see — the same scoping `findAttemptsByRequestHash` already applies to
   * attempts. Without it, one arm's artifact can silently satisfy the other
   * arm's copy of a shared `Requirement` row (`Artifact` carries no arm tag
   * of its own to filter by otherwise).
   */
  checkRequirements: (engine: EvalEngine, visibleArms: readonly ArmTag[]) => Promise<number>;
  signal?: AbortSignal;
}

export interface OperationLoopResult {
  messages: ProviderMessage[];
  accounting: RoundAccounting;
  newArtifactCount: number;
  requirementTransitionCount: number;
}

/**
 * Drives one phase's operation loop — used for shared phase one and for each
 * arm's phase two. Provider-call ceiling is checked *before* starting a new
 * turn; operation ceiling is checked the same way, never mid-turn, because a
 * turn's tool calls must each get a matching `tool` response message or the
 * next provider call is a malformed conversation — so a turn that pushes
 * operations past the ceiling still finishes, and the loop stops after it.
 */
export async function runOperationLoop(input: OperationLoopInput): Promise<OperationLoopResult> {
  const messages: ProviderMessage[] = [...input.messages];
  let usage: UsageTotals = ZERO_USAGE_TOTALS;
  let providerCalls = 0;
  let operations = 0;
  let consecutiveFailures = 0;
  let endedEarly: Extract<TerminalReason, 'blocked'> | undefined;
  let newArtifactCount = 0;
  let requirementTransitionCount = 0;

  outer: while (providerCalls < input.ceilings.maxProviderCalls && operations < input.ceilings.maxOperations) {
    const tools = await input.session.tools();
    const { turn, usage: callUsage } = await input.complete(messages, tools, { signal: input.signal });
    providerCalls += 1;
    usage = accountUsage(usage, callUsage);
    messages.push({
      role: 'assistant',
      content: turn.text,
      ...(turn.calls.length > 0 ? { toolCalls: turn.calls } : {}),
    });

    if (turn.calls.length === 0) break; // voluntary stop — the model chose to say nothing more

    for (const call of turn.calls) {
      operations += 1;
      const parameters = call.input;
      const requestHash = computeRequestHash({ datasetRevision: input.datasetRevision, operation: call.name, parameters });
      const duplicates = await findAttemptsByRequestHash(input.engine, requestHash, input.visibleArms);

      let outcome: OpOutcome;
      let attempt: Attempt;
      if (duplicates.length > 0) {
        outcome = duplicates[0].outcome;
        attempt = {
          attemptId: newId(),
          phase: input.phase,
          arm: input.arm,
          operation: call.name,
          parameters,
          disposition: 'duplicate',
          outcome,
          usage: callUsage,
          requestHash,
          duplicateOfAttemptId: duplicates[0].attemptId,
          createdAt: nowIso(),
        };
        consecutiveFailures = 0; // a duplicate is not a failure — the original already succeeded
      } else {
        outcome = await input.session.call(call.name, parameters, { signal: input.signal });
        const disposition = isOpError(outcome) ? 'error' : 'ok';
        attempt = {
          attemptId: newId(),
          phase: input.phase,
          arm: input.arm,
          operation: call.name,
          parameters,
          disposition,
          outcome,
          usage: callUsage,
          requestHash,
          createdAt: nowIso(),
        };
        consecutiveFailures = disposition === 'error' ? consecutiveFailures + 1 : 0;
      }
      await insertAttempt(input.engine, attempt);

      if (attempt.disposition === 'ok' && !isOpError(outcome)) {
        const resultHash = computeResultHash({ schema: outcome.schema, rows: outcome.rows });
        const artifact: Artifact = {
          artifactId: newId(),
          attemptId: attempt.attemptId,
          arm: input.arm,
          operation: call.name,
          sql: outcome.sql,
          datasetRevision: input.datasetRevision,
          schema: outcome.schema,
          rowCount: outcome.rowCount,
          rows: outcome.rows,
          complete: outcome.complete,
          // `note` is the deterministic, factual field OpResult actually has (never advice —
          // see types.ts); the closest fit to "warnings" in 15A's own artifact field list.
          warnings: outcome.note ? [outcome.note] : [],
          requestHash,
          resultHash,
          createdAt: nowIso(),
        };
        await insertArtifact(input.engine, artifact);
        newArtifactCount += 1;
      }

      messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(outcome) });

      if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
        endedEarly = 'blocked';
        break outer;
      }
    }

    requirementTransitionCount += await input.checkRequirements(input.engine, input.visibleArms);
    if (await allRequirementsSatisfied(input.engine)) break;
  }

  const accounting: RoundAccounting = {
    phase: input.phase,
    arm: input.arm,
    enforcedCeilings: input.ceilings,
    actualProviderCalls: providerCalls,
    actualOperations: operations,
    usage,
    ...(endedEarly ? { endedEarly } : {}),
  };
  await upsertRoundAccounting(input.engine, accounting);

  return { messages, accounting, newArtifactCount, requirementTransitionCount };
}

const CHECKPOINT_REQUEST_PROMPT =
  'Phase one has ended. Submit your checkpoint now as a single JSON object with exactly these ' +
  'fields: candidateClaims (array of {claimId, statement, evidenceLocators: [{artifactId, ' +
  'locator?}]}), caveats (array of strings), openWork (array of {workItemId, question, ' +
  'priority}), recommendedNextAction (string). Reply with the JSON object and nothing else.';

export interface CheckpointRequestResult {
  /** `null` only if the model failed validation on both the first attempt and the one bounded repair. */
  checkpoint: Checkpoint | null;
  usage: UsageTotals;
}

/**
 * One structured request plus, if needed, the one bounded repair attempt
 * (`checkpointValidator.ts`'s submission state machine). Not a tool call —
 * `tools` is passed as `[]` because a checkpoint is text/JSON the model
 * writes directly, not an operation the analyst core executes.
 */
export async function requestCheckpoint(
  complete: MeteredComplete,
  priorMessages: readonly ProviderMessage[],
  knownArtifactIds: ReadonlySet<string>,
  phase: PhaseNumber,
  arm: ArmTag,
  signal?: AbortSignal,
): Promise<CheckpointRequestResult> {
  let state = initialSubmissionState();
  let usage: UsageTotals = ZERO_USAGE_TOTALS;
  let messages: ProviderMessage[] = [...priorMessages, { role: 'user', content: CHECKPOINT_REQUEST_PROMPT }];

  while (state !== 'closed') {
    const { turn, usage: callUsage } = await complete(messages, [], { signal });
    usage = accountUsage(usage, callUsage);

    let raw: unknown;
    try {
      raw = JSON.parse(turn.text);
    } catch {
      raw = turn.text; // validated and rejected as "must be an object" — never silently dropped
    }

    const result = recordCheckpointSubmission(state, raw, { knownArtifactIds });
    state = result.state;
    if (result.validation.ok && result.validation.checkpoint) {
      return {
        checkpoint: { phase, arm, ...result.validation.checkpoint, createdAt: nowIso() },
        usage,
      };
    }
    messages = [
      ...messages,
      { role: 'assistant', content: turn.text },
      { role: 'user', content: describeRepairPrompt(result.validation.issues) },
    ];
  }
  return { checkpoint: null, usage };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Classifies one arm's phase-two outcome — see file header, simplification 2,
 * for the `exhausted` vs. `no_progress` boundary this implements.
 */
export function classifyPhaseTwoOutcome(arm: ClearingArm, loop: OperationLoopResult, unmet: readonly string[]): TaskOutcome {
  let terminalReason: TerminalReason;
  if (loop.accounting.endedEarly === 'blocked') terminalReason = 'blocked';
  else if (unmet.length === 0) terminalReason = 'satisfied';
  else if (loop.newArtifactCount === 0 && loop.requirementTransitionCount === 0) terminalReason = 'no_progress';
  else terminalReason = 'exhausted';

  return { kind: 'scored', arm, terminalReason, materialUnmetRequirements: unmet };
}

export interface Experiment15AInput {
  originalTask: string;
  /** Byte-identical to both arms (§ Frozen comparison arms). */
  operatingManual: string;
  datasetRevision: string;
  /** Precomputed by the caller — see `briefingBuilder.ts`'s file header for why. */
  schemaSummary: string;
  session: AnalystMcpSession;
  engine: EvalEngine;
  complete: MeteredComplete;
  checkRequirements: (engine: EvalEngine, visibleArms: readonly ArmTag[]) => Promise<number>;
  maxBriefingBytes: number;
  signal?: AbortSignal;
}

export type Experiment15AResult =
  | { kind: 'satisfied_before_boundary' }
  | { kind: 'scored'; control: TaskOutcome; treatment: TaskOutcome };

/** The full ASCII-diagram flow (§ Frozen comparison arms). Requirements must already be seeded in the ledger by the caller (task/gold-file setup — Checkpoint 7's concern, out of scope here). */
export async function runExperiment15A(input: Experiment15AInput): Promise<Experiment15AResult> {
  const systemMessage: ProviderMessage = { role: 'system', content: input.operatingManual };
  const userMessage: ProviderMessage = { role: 'user', content: input.originalTask };

  const phase1 = await runOperationLoop({
    phase: 1,
    arm: 'shared',
    visibleArms: ['shared'],
    datasetRevision: input.datasetRevision,
    session: input.session,
    complete: input.complete,
    messages: [systemMessage, userMessage],
    ceilings: PHASE_CEILINGS,
    engine: input.engine,
    checkRequirements: input.checkRequirements,
    signal: input.signal,
  });

  if (await allRequirementsSatisfied(input.engine)) {
    return { kind: 'satisfied_before_boundary' };
  }

  const knownArtifactIds = new Set((await listArtifacts(input.engine)).map((a) => a.artifactId));
  const { checkpoint } = await requestCheckpoint(input.complete, phase1.messages, knownArtifactIds, 1, 'shared', input.signal);
  if (checkpoint) await upsertCheckpoint(input.engine, checkpoint);

  const requirements = await listRequirements(input.engine);
  const artifacts = await listArtifacts(input.engine);
  const attempts = await listAttempts(input.engine, { arms: ['shared'] });
  const briefing = buildMidpointBriefing(
    {
      originalTask: input.originalTask,
      requirements,
      schemaSummary: input.schemaSummary,
      artifacts,
      checkpoint,
      attempts,
      remainingCeilings: {
        phaseProviderCalls: PHASE_CEILINGS.maxProviderCalls,
        phaseOperations: PHASE_CEILINGS.maxOperations,
        wholeProviderCalls: WHOLE_ANALYST_CEILINGS.maxProviderCalls - phase1.accounting.actualProviderCalls,
        wholeOperations: WHOLE_ANALYST_CEILINGS.maxOperations - phase1.accounting.actualOperations,
      },
    },
    input.maxBriefingBytes,
  );
  const briefingMessage: ProviderMessage = { role: 'user', content: JSON.stringify(briefing) };

  async function runArm(arm: ClearingArm, messages: readonly ProviderMessage[]): Promise<TaskOutcome> {
    try {
      const loop = await runOperationLoop({
        phase: 2,
        arm,
        visibleArms: ['shared', arm],
        datasetRevision: input.datasetRevision,
        session: input.session,
        complete: input.complete,
        messages,
        ceilings: PHASE_CEILINGS,
        engine: input.engine,
        checkRequirements: input.checkRequirements,
        signal: input.signal,
      });
      const unmet = (await listRequirements(input.engine)).filter((r) => r.status === 'unsatisfied').map((r) => r.description);
      return classifyPhaseTwoOutcome(arm, loop, unmet);
    } catch (error) {
      return { kind: 'scored', arm, terminalReason: isAbortError(error) ? 'cancelled' : 'harness_error', materialUnmetRequirements: [] };
    }
  }

  // CONTROL keeps the shared transcript and appends the briefing to it;
  // TREATMENT discards the transcript entirely and starts fresh with only
  // the operating manual and the same briefing (§ Frozen comparison arms).
  const control = await runArm('control', [...phase1.messages, briefingMessage]);
  const treatment = await runArm('treatment', [systemMessage, briefingMessage]);

  return { kind: 'scored', control, treatment };
}
