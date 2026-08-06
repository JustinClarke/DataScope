// Checkpoint 7 — the gold-file check runner (§ "The only build 15A
// requires" #6: "the gold-file check runner for machine-executable
// requirement satisfaction").
//
// This builds the generic, reusable check-evaluation engine: a `GoldFile` is
// a list of typed, machine-executable checks keyed by `requirementId`, and
// `createGoldFileChecker` produces the concrete `checkRequirements`
// implementation `forkedHarness.ts` expects (its own seam is generic on
// purpose — see that file's header). This file does not author the twelve
// frozen tasks themselves; that is "Task set and repetitions" content, an
// explicitly later step ("Run order... starts only once this directory's
// harness is frozen"), not part of what 15A's own build list asks for here.
//
// § Task set and repetitions names five check kinds: "an accepted value with
// tolerance, a required entity, a required caveat pattern, a prohibited
// substitution, or a structural scope match." All five are implemented
// below, deliberately simply — no SQL parsing, no semantic scope modeling
// (the doc rules out embeddings/semantic work for 15A elsewhere). Structural
// scope match is a required-substring check over an artifact's recorded SQL,
// not a parsed query-shape comparison.
import type { EvalEngine } from '../../duckdb/duckdb';
import type { ArmTag, Artifact, Checkpoint, Requirement } from './contracts';
import { getCheckpoint, listArtifacts, listRequirements, updateRequirementStatus } from './ledger';

export interface AcceptedValueCheck {
  kind: 'accepted_value';
  requirementId: string;
  expected: number;
  tolerance: number;
  /** Restrict the scan to a named column (case-insensitive); omitted scans every numeric cell in every artifact. */
  column?: string;
}

export interface RequiredEntityCheck {
  kind: 'required_entity';
  requirementId: string;
  entity: string;
  caseSensitive?: boolean;
}

export interface RequiredCaveatCheck {
  kind: 'required_caveat';
  requirementId: string;
  pattern: string;
  matchType: 'substring' | 'regex';
}

/** Satisfied means the prohibition was *not* violated — this check kind asks for an absence, not a presence. */
export interface ProhibitedSubstitutionCheck {
  kind: 'prohibited_substitution';
  requirementId: string;
  prohibitedTerm: string;
  matchType: 'substring' | 'regex';
}

export interface StructuralScopeCheck {
  kind: 'structural_scope';
  requirementId: string;
  /** Every fragment must appear (case-insensitive) in one single artifact's SQL. */
  requiredSqlFragments: readonly string[];
}

export type RequirementCheck =
  | AcceptedValueCheck
  | RequiredEntityCheck
  | RequiredCaveatCheck
  | ProhibitedSubstitutionCheck
  | StructuralScopeCheck;

export interface GoldFile {
  taskId: string;
  checks: readonly RequirementCheck[];
}

export interface CheckResult {
  satisfied: boolean;
  satisfyingArtifactId?: string;
}

function matches(pattern: string, matchType: 'substring' | 'regex', text: string): boolean {
  if (matchType === 'substring') return text.toLowerCase().includes(pattern.toLowerCase());
  return new RegExp(pattern, 'i').test(text);
}

function evaluateAcceptedValue(check: AcceptedValueCheck, artifacts: readonly Artifact[]): CheckResult {
  for (const artifact of artifacts) {
    const columnIndexes = check.column
      ? artifact.schema.reduce<number[]>((acc, field, i) => (field.name.toLowerCase() === check.column!.toLowerCase() ? [...acc, i] : acc), [])
      : artifact.schema.map((_, i) => i);
    for (const row of artifact.rows) {
      for (const index of columnIndexes) {
        const cell = row[index];
        if (typeof cell === 'number' && Math.abs(cell - check.expected) <= check.tolerance) {
          return { satisfied: true, satisfyingArtifactId: artifact.artifactId };
        }
      }
    }
  }
  return { satisfied: false };
}

function evaluateRequiredEntity(check: RequiredEntityCheck, artifacts: readonly Artifact[]): CheckResult {
  const normalize = (value: string) => (check.caseSensitive ? value : value.toLowerCase());
  const needle = normalize(check.entity);
  for (const artifact of artifacts) {
    if (artifact.sql && normalize(artifact.sql).includes(needle)) return { satisfied: true, satisfyingArtifactId: artifact.artifactId };
    for (const row of artifact.rows) {
      for (const cell of row) {
        if (typeof cell === 'string' && normalize(cell).includes(needle)) {
          return { satisfied: true, satisfyingArtifactId: artifact.artifactId };
        }
      }
    }
  }
  return { satisfied: false };
}

function evaluateRequiredCaveat(check: RequiredCaveatCheck, checkpoint: Checkpoint | null): CheckResult {
  if (!checkpoint) return { satisfied: false };
  return { satisfied: checkpoint.caveats.some((caveat) => matches(check.pattern, check.matchType, caveat)) };
}

function evaluateProhibitedSubstitution(
  check: ProhibitedSubstitutionCheck,
  artifacts: readonly Artifact[],
  checkpoint: Checkpoint | null,
): CheckResult {
  const haystacks: string[] = [
    ...artifacts.flatMap((a) => (a.sql ? [a.sql] : [])),
    ...(checkpoint ? [...checkpoint.caveats, ...checkpoint.candidateClaims.map((c) => c.statement), checkpoint.recommendedNextAction] : []),
  ];
  const violated = haystacks.some((text) => matches(check.prohibitedTerm, check.matchType, text));
  return { satisfied: !violated };
}

function evaluateStructuralScope(check: StructuralScopeCheck, artifacts: readonly Artifact[]): CheckResult {
  for (const artifact of artifacts) {
    if (!artifact.sql) continue;
    const sql = artifact.sql.toLowerCase();
    if (check.requiredSqlFragments.every((fragment) => sql.includes(fragment.toLowerCase()))) {
      return { satisfied: true, satisfyingArtifactId: artifact.artifactId };
    }
  }
  return { satisfied: false };
}

export function evaluateRequirementCheck(
  check: RequirementCheck,
  evidence: { artifacts: readonly Artifact[]; checkpoint: Checkpoint | null },
): CheckResult {
  switch (check.kind) {
    case 'accepted_value':
      return evaluateAcceptedValue(check, evidence.artifacts);
    case 'required_entity':
      return evaluateRequiredEntity(check, evidence.artifacts);
    case 'required_caveat':
      return evaluateRequiredCaveat(check, evidence.checkpoint);
    case 'prohibited_substitution':
      return evaluateProhibitedSubstitution(check, evidence.artifacts, evidence.checkpoint);
    case 'structural_scope':
      return evaluateStructuralScope(check, evidence.artifacts);
  }
}

/**
 * The concrete `checkRequirements` implementation `forkedHarness.ts` expects
 * — re-evaluates every check in the gold file against current ledger state
 * and persists any status change, in either direction: a
 * `prohibited_substitution` or `required_caveat` check can newly violate just
 * as easily as it can newly satisfy, so this is not a monotonic
 * satisfy-only ratchet like `accepted_value`/`required_entity` effectively
 * are once evidence exists. Returns how many requirements actually
 * transitioned, which is what `runOperationLoop` accumulates into
 * `requirementTransitionCount` for the `no_progress` classification.
 *
 * `visibleArms` scopes the artifact scan to what the calling branch is
 * actually allowed to see — added after a real two-arm run (`runPilot.test.ts`)
 * showed that scanning every artifact regardless of arm let control's
 * evidence silently satisfy treatment's copy of the same `Requirement` row,
 * since control always runs first in `runExperiment15A` and `Requirement`
 * status has no arm dimension of its own. Pass e.g. `['shared', 'treatment']`
 * from inside the treatment branch, matching `runOperationLoop`'s own
 * `visibleArms`.
 */
export function createGoldFileChecker(goldFile: GoldFile): (engine: EvalEngine, visibleArms: readonly ArmTag[]) => Promise<number> {
  return async (engine: EvalEngine, visibleArms: readonly ArmTag[]): Promise<number> => {
    const [requirements, artifacts, checkpoint] = await Promise.all([
      listRequirements(engine),
      listArtifacts(engine, { arms: visibleArms }),
      getCheckpoint(engine, 1, 'shared'),
    ]);
    const requirementById = new Map(requirements.map((r) => [r.requirementId, r]));

    let transitioned = 0;
    for (const check of goldFile.checks) {
      const requirement = requirementById.get(check.requirementId);
      if (!requirement) continue; // the gold file may cover requirements this run never seeded — not this runner's problem
      const result = evaluateRequirementCheck(check, { artifacts, checkpoint });
      const nextStatus: Requirement['status'] = result.satisfied ? 'satisfied' : 'unsatisfied';
      if (nextStatus !== requirement.status) {
        await updateRequirementStatus(engine, requirement.requirementId, nextStatus, result.satisfyingArtifactId);
        transitioned += 1;
      }
    }
    return transitioned;
  };
}
