// Checkpoint 5 — typed checkpoint validation (§ "The only build 15A
// requires" #4: "schema, id existence, allowed transitions, one bounded
// repair attempt").
//
// The schema validated here is 15A's own Checkpoint shape (`contracts.ts`),
// not the deferred design-history packet's richer one: there is no
// requirement-status or requirement-text field to accept, because "the
// model may add work items, sub-questions and caveats; it may not delete,
// narrow, reframe or deprioritize a mandatory requirement" (§ What 15A
// inherits) is enforced structurally — the schema simply has no field for
// it — the same structural-removal pattern experiment 13's
// `FIXED_EVIDENCE_ACTION_SCHEMA` uses to remove `request_probes` for its
// fixed-evidence arm rather than trusting the model to decline it.
//
// "Allowed transitions" is interpreted as the checkpoint *submission* state
// machine for a given (phase, arm), not a field-level status lattice: 15A's
// Checkpoint relation has no status field of its own (unlike `Requirement`,
// whose `status` is host-only and never accepted from a model submission —
// there is structurally no channel for the model to set it). A phase gets at
// most two submissions: the model's first attempt, and — only if that one
// fails validation — one bounded repair attempt. A third submission, or any
// submission after the phase has already closed, is illegal and rejected
// before it is looked at semantically.
import type { CandidateClaim, Checkpoint, WorkItem } from './contracts';

// ── Submission state machine ────────────────────────────────────────────

export type CheckpointSubmissionState = 'awaiting_first' | 'awaiting_repair' | 'closed';

export function initialSubmissionState(): CheckpointSubmissionState {
  return 'awaiting_first';
}

/**
 * The only two legal transitions: a first submission that fails validation
 * moves to `awaiting_repair` (the one bounded repair attempt); anything else
 * — a valid first submission, or *any* second submission, valid or not —
 * closes the phase. There is no third attempt.
 */
export function nextSubmissionState(current: CheckpointSubmissionState, outcome: 'valid' | 'invalid'): CheckpointSubmissionState {
  if (current === 'closed') throw new Error('checkpoint submission attempted after the phase already closed');
  if (current === 'awaiting_first') return outcome === 'valid' ? 'closed' : 'awaiting_repair';
  return 'closed'; // current === 'awaiting_repair'
}

// ── Structural + id-existence validation ────────────────────────────────

export type ValidationIssue = string;

export interface ValidationResult {
  ok: boolean;
  issues: readonly ValidationIssue[];
  /** Present only when `ok` — `phase`/`arm`/`createdAt` are the harness's to fill in, not the model's. */
  checkpoint?: Omit<Checkpoint, 'phase' | 'arm' | 'createdAt'>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(record: Record<string, unknown>, allowed: readonly string[], path: string, issues: ValidationIssue[]): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) issues.push(`${path} has unsupported field "${key}"`);
  }
}

function issuesForCandidateClaim(value: unknown, index: number, knownArtifactIds: ReadonlySet<string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `candidateClaims[${index}]`;
  if (!isRecord(value)) return [`${path} must be an object`];
  rejectUnknownKeys(value, ['claimId', 'statement', 'evidenceLocators'], path, issues);

  if (typeof value.claimId !== 'string' || value.claimId.trim() === '') issues.push(`${path}.claimId must be a non-empty string`);
  if (typeof value.statement !== 'string' || value.statement.trim() === '') issues.push(`${path}.statement must be a non-empty string`);

  if (!Array.isArray(value.evidenceLocators) || value.evidenceLocators.length === 0) {
    issues.push(
      `${path}.evidenceLocators must be a non-empty array — a claim with no evidence locator is not a candidate claim (§ Minimum ledger: "candidate claims with evidence locators")`,
    );
    return issues;
  }
  value.evidenceLocators.forEach((locator, li) => {
    const locatorPath = `${path}.evidenceLocators[${li}]`;
    if (!isRecord(locator)) {
      issues.push(`${locatorPath} must be an object`);
      return;
    }
    rejectUnknownKeys(locator, ['artifactId', 'locator'], locatorPath, issues);
    if (typeof locator.artifactId !== 'string' || locator.artifactId.trim() === '') {
      issues.push(`${locatorPath}.artifactId must be a non-empty string`);
    } else if (!knownArtifactIds.has(locator.artifactId)) {
      issues.push(`${locatorPath}.artifactId "${locator.artifactId}" does not exist in the ledger — a model cannot cite evidence that was never recorded`);
    }
    if (locator.locator !== undefined && typeof locator.locator !== 'string') {
      issues.push(`${locatorPath}.locator must be a string when present`);
    }
  });
  return issues;
}

function issuesForWorkItem(value: unknown, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `openWork[${index}]`;
  if (!isRecord(value)) return [`${path} must be an object`];
  rejectUnknownKeys(value, ['workItemId', 'question', 'priority'], path, issues);
  if (typeof value.workItemId !== 'string' || value.workItemId.trim() === '') issues.push(`${path}.workItemId must be a non-empty string`);
  if (typeof value.question !== 'string' || value.question.trim() === '') issues.push(`${path}.question must be a non-empty string`);
  if (typeof value.priority !== 'number' || !Number.isFinite(value.priority)) issues.push(`${path}.priority must be a finite number`);
  return issues;
}

/**
 * Validates one checkpoint submission: schema (unknown-field rejection,
 * required-field typing) and id existence (every cited `artifactId` must be
 * in `knownArtifactIds` — the ledger's current artifacts, supplied by the
 * caller rather than queried here, so this stays a pure function). Never
 * partially accepts — any issue at all makes the whole submission `ok: false`.
 */
export function validateCheckpointSubmission(
  raw: unknown,
  context: { knownArtifactIds: ReadonlySet<string> },
): ValidationResult {
  if (!isRecord(raw)) return { ok: false, issues: ['checkpoint submission must be an object'] };

  const issues: ValidationIssue[] = [];
  rejectUnknownKeys(raw, ['candidateClaims', 'caveats', 'openWork', 'recommendedNextAction'], '(top level)', issues);

  const candidateClaims = Array.isArray(raw.candidateClaims) ? raw.candidateClaims : null;
  if (candidateClaims === null) {
    issues.push('candidateClaims must be an array (an empty array is valid — a round may find nothing worth claiming)');
  } else {
    const seen = new Set<string>();
    candidateClaims.forEach((claim, i) => {
      issues.push(...issuesForCandidateClaim(claim, i, context.knownArtifactIds));
      if (isRecord(claim) && typeof claim.claimId === 'string') {
        if (seen.has(claim.claimId)) issues.push(`candidateClaims[${i}].claimId "${claim.claimId}" is duplicated within this submission`);
        seen.add(claim.claimId);
      }
    });
  }

  const caveats = Array.isArray(raw.caveats) ? raw.caveats : null;
  if (caveats === null) issues.push('caveats must be an array');
  else caveats.forEach((c, i) => { if (typeof c !== 'string' || c.trim() === '') issues.push(`caveats[${i}] must be a non-empty string`); });

  const openWork = Array.isArray(raw.openWork) ? raw.openWork : null;
  if (openWork === null) {
    issues.push('openWork must be an array');
  } else {
    const seen = new Set<string>();
    openWork.forEach((item, i) => {
      issues.push(...issuesForWorkItem(item, i));
      if (isRecord(item) && typeof item.workItemId === 'string') {
        if (seen.has(item.workItemId)) issues.push(`openWork[${i}].workItemId "${item.workItemId}" is duplicated within this submission`);
        seen.add(item.workItemId);
      }
    });
  }

  if (typeof raw.recommendedNextAction !== 'string') issues.push('recommendedNextAction must be a string');

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    issues: [],
    checkpoint: {
      candidateClaims: candidateClaims as CandidateClaim[],
      caveats: caveats as string[],
      openWork: openWork as WorkItem[],
      recommendedNextAction: raw.recommendedNextAction as string,
    },
  };
}

// ── Tying validation to the submission state machine ────────────────────

export interface CheckpointAttemptResult {
  state: CheckpointSubmissionState;
  validation: ValidationResult;
}

/**
 * The harness's one call per submission: validates, then advances the state
 * machine from the outcome. Throws (via `nextSubmissionState`) if called a
 * third time or after the phase already closed — a harness bug, not a model
 * output to recover from.
 */
export function recordCheckpointSubmission(
  state: CheckpointSubmissionState,
  raw: unknown,
  context: { knownArtifactIds: ReadonlySet<string> },
): CheckpointAttemptResult {
  const validation = validateCheckpointSubmission(raw, context);
  return { state: nextSubmissionState(state, validation.ok ? 'valid' : 'invalid'), validation };
}

/** A deterministic, non-model-authored repair prompt — never invents what was wrong. */
export function describeRepairPrompt(issues: readonly ValidationIssue[]): string {
  return [
    'Your checkpoint submission was invalid. Fix every issue below and resubmit the complete checkpoint once — this is your only repair attempt:',
    ...issues.map((issue) => `- ${issue}`),
  ].join('\n');
}
