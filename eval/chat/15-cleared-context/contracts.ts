// Experiment 15A's ledger and checkpoint vocabulary — Checkpoint 1
// (`15-cleared-context-loop.md` §§18-387, the only part of that document
// authoritative for this build; everything past "Design history below" in the
// doc is explicitly non-authoritative and not reflected here).
//
// 15A's own "Minimum ledger required" section names exactly five relations —
// Requirements, Attempts, Artifacts, Checkpoint state, Round accounting — and
// says "Do not build the complete product-wide reasoning ledger first." The
// deferred packet's `analysis.claims` / `analysis.reasoning_notes` /
// layered-verification system is explicitly out of scope for 15A; a "verified
// finding" here is a reference to an Artifact, not a new entity.
import { isOpError, type OpOutcome, type OpSchemaField } from '../../../src/lib/analyst/types';

// ── Arms and phases (§ Frozen comparison arms) ─────────────────────────────

/**
 * 'shared' tags anything recorded during phase one, before the fork — both
 * arms inherit it read-only. 'control' / 'treatment' tag phase-two records,
 * which live in isolated branches (§: "isolated so neither arm can warm or
 * mutate the other's state").
 */
export type ArmTag = 'shared' | 'control' | 'treatment';
export type ClearingArm = Extract<ArmTag, 'control' | 'treatment'>;
export type PhaseNumber = 1 | 2;

/**
 * "Each phase is capped at eight provider calls and sixteen operations; the
 * whole analyst is therefore capped at sixteen provider calls and thirty-two
 * operations." A provider call is one tool-capable round-trip regardless of
 * how many operations it emits.
 */
export interface PhaseCeilings {
  maxProviderCalls: number;
  maxOperations: number;
}

export const PHASE_CEILINGS: Readonly<PhaseCeilings> = { maxProviderCalls: 8, maxOperations: 16 };
export const WHOLE_ANALYST_CEILINGS: Readonly<PhaseCeilings> = { maxProviderCalls: 16, maxOperations: 32 };

/** "Three consecutive failed operations end the current phase early." */
export const CONSECUTIVE_FAILURE_LIMIT = 3;

// ── Provider usage accounting (§ Caching policy; § The only build requires #1) ──

/**
 * Raw and billable are recorded separately because prefix caching changes
 * price, not sampling: "The frozen verdict rule is keyed to raw tokens, so no
 * arm is credited or penalized for provider-side infrastructure; billable
 * tokens are reported alongside as the product-economics number."
 */
export interface CallUsage {
  rawPromptTokens: number;
  rawOutputTokens: number;
  billablePromptTokens: number;
  billableOutputTokens: number;
}

export interface UsageTotals extends CallUsage {
  calls: number;
  /** The largest single call's raw prompt tokens seen so far — the context high-water metric (§ Measurements). Reported, never a win condition (§ Predeclared verdict). */
  highWaterRawPromptTokens: number;
}

export const ZERO_USAGE_TOTALS: Readonly<UsageTotals> = {
  calls: 0,
  rawPromptTokens: 0,
  rawOutputTokens: 0,
  billablePromptTokens: 0,
  billableOutputTokens: 0,
  highWaterRawPromptTokens: 0,
};

export function accountUsage(totals: Readonly<UsageTotals>, call: Readonly<CallUsage>): UsageTotals {
  return {
    calls: totals.calls + 1,
    rawPromptTokens: totals.rawPromptTokens + call.rawPromptTokens,
    rawOutputTokens: totals.rawOutputTokens + call.rawOutputTokens,
    billablePromptTokens: totals.billablePromptTokens + call.billablePromptTokens,
    billableOutputTokens: totals.billableOutputTokens + call.billableOutputTokens,
    highWaterRawPromptTokens: Math.max(totals.highWaterRawPromptTokens, call.rawPromptTokens),
  };
}

// ── Relation 1: Requirements ────────────────────────────────────────────────

/**
 * "Frozen mandatory obligations and their current status." The
 * machine-executable check itself is gold-file-authored task content (§ Task
 * set and repetitions), not ledger state — it lives with the gold file
 * (Checkpoint 7), not here. The ledger only tracks whether it currently
 * passes and, if so, what satisfied it.
 */
export interface Requirement {
  requirementId: string;
  description: string;
  status: 'unsatisfied' | 'satisfied';
  /** Set only when `status === 'satisfied'` — the artifact whose deterministic check satisfied it. The model asserting satisfaction is never sufficient (§ host validation rules). */
  satisfiedByArtifactId?: string;
}

// ── Relation 2: Attempts ────────────────────────────────────────────────────

export type AttemptDisposition = 'ok' | 'error' | 'duplicate';

/**
 * "Operation, canonical parameters, outcome/error, usage, and duplicate
 * identity." `requestHash` is the exact-duplicate identity key (Checkpoint 3
 * defines the canonicalization); `duplicateOfAttemptId` is set only when
 * `disposition === 'duplicate'`.
 */
export interface Attempt {
  attemptId: string;
  phase: PhaseNumber;
  arm: ArmTag;
  operation: string;
  /** Canonical/normalized parameters — the same input produces the same JSON, which is what `requestHash` is derived from. */
  parameters: unknown;
  disposition: AttemptDisposition;
  outcome: OpOutcome;
  usage: CallUsage;
  requestHash: string;
  duplicateOfAttemptId?: string;
  createdAt: string;
}

/** The compact projection the midpoint briefing carries (§ Midpoint briefing contract: "compact failed-attempt and exact-duplicate fingerprints") — never the full `Attempt` row (no parameters, no usage). */
export interface AttemptFingerprint {
  operation: string;
  requestHash: string;
  disposition: Extract<AttemptDisposition, 'error' | 'duplicate'>;
  errorCode?: string;
}

export function toFingerprint(attempt: Readonly<Attempt>): AttemptFingerprint | null {
  if (attempt.disposition === 'ok') return null;
  const errorCode = isOpError(attempt.outcome) ? attempt.outcome.code : undefined;
  return {
    operation: attempt.operation,
    requestHash: attempt.requestHash,
    disposition: attempt.disposition,
    ...(errorCode ? { errorCode } : {}),
  };
}

// ── Relation 3: Artifacts ───────────────────────────────────────────────────

/**
 * "Exact operation/SQL, dataset revision, bounded actual result,
 * completeness, warnings, and request/result identity." One artifact per
 * successful attempt; `resultHash` separately identifies the observed output
 * so a changed dataset never gets silently conflated with a changed query.
 */
export interface Artifact {
  artifactId: string;
  attemptId: string;
  /**
   * Which branch produced this artifact. Added after the first real two-arm
   * run against a live ledger (`runPilot.test.ts`) surfaced that
   * `createGoldFileChecker`'s unscoped `listArtifacts` scan let one arm's
   * satisfying evidence silently satisfy the *other* arm's copy of the same
   * globally-scoped `Requirement` row — control finishes first in
   * `runExperiment15A`, so its artifacts were already in the ledger by the
   * time treatment's own `checkRequirements` ran. Mirrors `Attempt.arm`,
   * which `findAttemptsByRequestHash`'s `visibleArms` already used for the
   * equivalent duplicate-detection scoping; `Artifact` had no equivalent
   * until now.
   */
  arm: ArmTag;
  operation: string;
  sql: string | null;
  datasetRevision: string;
  schema: OpSchemaField[];
  rowCount: number;
  /** Bounded actual rows, not the whole result — see `complete`. */
  rows: readonly unknown[][];
  complete: boolean;
  warnings: readonly string[];
  requestHash: string;
  resultHash: string;
  createdAt: string;
}

// ── Relation 4: Checkpoint state (the model-authored lane) ─────────────────

/**
 * "Typed checkpoint as the only write path for model-authored claims,
 * caveats and work items." Every field in this relation is model-authored by
 * construction — there is no deterministic counterpart in `Checkpoint`, which
 * is what "visibly model-authored" means structurally rather than by a flag
 * on each field. Host validation (Checkpoint 5) checks structure and
 * evidence-locator existence; it never upgrades a claim to deterministic
 * evidence.
 */
export interface EvidenceLocator {
  artifactId: string;
  /** Optional pointer into the artifact's bounded rows, e.g. a row index or column name. Free text because the artifact shapes vary; existence of `artifactId` is what host validation actually checks. */
  locator?: string;
}

export interface CandidateClaim {
  claimId: string;
  statement: string;
  evidenceLocators: readonly EvidenceLocator[];
}

export interface WorkItem {
  workItemId: string;
  question: string;
  priority: number;
}

export interface Checkpoint {
  phase: PhaseNumber;
  arm: ArmTag;
  candidateClaims: readonly CandidateClaim[];
  caveats: readonly string[];
  openWork: readonly WorkItem[];
  recommendedNextAction: string;
  createdAt: string;
}

// ── Relation 5: Round accounting ────────────────────────────────────────────

/**
 * "After phase two, the host records one of" these six values (§ Early
 * completion and terminal reasons). `satisfied_before_boundary` is a distinct,
 * separately-reported task-level outcome ("does not estimate the treatment
 * effect") produced only at the end of phase one, so it is not a member of
 * this union — see `TaskOutcome` below.
 */
export const TERMINAL_REASONS = [
  'satisfied',
  'exhausted',
  'no_progress',
  'blocked',
  'cancelled',
  'harness_error',
] as const;
export type TerminalReason = (typeof TERMINAL_REASONS)[number];

/**
 * "Enforced ceilings, actual usage, terminal reason, and context high-water"
 * — one row per phase per branch. `endedEarly` is set only by the
 * three-consecutive-failure rule; ordinary ceiling exhaustion is not "early"
 * and leaves it unset.
 */
export interface RoundAccounting {
  phase: PhaseNumber;
  arm: ArmTag;
  enforcedCeilings: PhaseCeilings;
  actualProviderCalls: number;
  actualOperations: number;
  usage: UsageTotals;
  endedEarly?: Extract<TerminalReason, 'blocked'>;
}

/**
 * The task-level result. `satisfied_before_boundary` ends the whole task at
 * phase one and is reported separately in both arms (§ Early completion);
 * `scored` is the ordinary two-phase outcome, one per arm, and must state
 * material unmet requirements for every terminal reason except `cancelled` /
 * `harness_error` (§: "Every other terminal synthesis must state material
 * unmet requirements").
 */
export type TaskOutcome =
  | { kind: 'satisfied_before_boundary' }
  | { kind: 'scored'; arm: ClearingArm; terminalReason: TerminalReason; materialUnmetRequirements: readonly string[] };

// ── Midpoint briefing packet (§ Midpoint briefing contract) ────────────────

/** A finding is a reference to an `Artifact` plus which requirement (if any) it bears on — not a new ledger entity (see file header). */
export interface FindingRef {
  artifactId: string;
  requirementId?: string;
  complete: boolean;
  rowCount: number;
}

export interface RemainingCeilings {
  phaseProviderCalls: number;
  phaseOperations: number;
  wholeProviderCalls: number;
  wholeOperations: number;
}

/**
 * "The deterministic builder emits a bounded packet" — the exact eight
 * sections listed in § Midpoint briefing contract, in ranking order. Built by
 * Checkpoint 4; this is only the shape. "Contains no raw transcript and no
 * hidden host-authored analytical conclusion."
 */
export interface MidpointBriefing {
  originalTask: string;
  mandatoryRequirements: readonly Requirement[];
  schemaSummary: string;
  verifiedFindings: readonly FindingRef[];
  /** Visibly attributed — sourced from the phase-one `Checkpoint`, never host-synthesized. */
  modelCaveats: readonly string[];
  recommendedNextAction: string;
  openWork: readonly WorkItem[];
  failureFingerprints: readonly AttemptFingerprint[];
  remainingCeilings: RemainingCeilings;
  /** Bytes of the serialized packet — bounded by a pilot-measured ceiling (§: "Only the maximum serialized size is set from pilot measurement"). */
  serializedByteSize: number;
}
