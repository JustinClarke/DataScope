// Checkpoint 4 — the deterministic midpoint briefing builder and its frozen
// ranking rule (§ Midpoint briefing contract).
//
// Schema/relationship text is accepted as an input (`schemaSummary`), not
// computed here: producing it means calling the analyst core's `get_schema`
// (and deciding what "relevant" means for a given task), which needs a live
// engine connection this file deliberately does not hold — that's the
// forked harness's job (Checkpoint 6), matching this file's only
// responsibility: rank and assemble already-fetched ledger state into the
// bounded packet, never fetch it.
//
// "Verified current findings" are `Artifact` rows — 15A's minimum ledger has
// no separate claims/verification entity, so every artifact is verified by
// construction (see `contracts.ts`'s file header). "Linked to [unsatisfied]
// requirements" is interpreted as: an artifact is linked when some
// requirement's `satisfiedByArtifactId` names it. The doc's ranking rule
// text describes findings linked to *unsatisfied* requirements specifically,
// but 15A's ledger only records a requirement→artifact link at the moment a
// requirement becomes *satisfied* (there is no ledger field connecting an
// artifact to a requirement it merely bears on but hasn't resolved) — so
// "linked" here means "satisfied some requirement," ranked ahead of
// unlinked findings, newest first within each group. This is a documented
// interpretive choice, not an ambiguity left unresolved.
import type {
  Artifact,
  AttemptFingerprint,
  Attempt,
  Checkpoint,
  FindingRef,
  MidpointBriefing,
  RemainingCeilings,
  Requirement,
  WorkItem,
} from './contracts';
import { toFingerprint } from './contracts';

export interface BuildBriefingInput {
  originalTask: string;
  /** Every requirement, whatever its current status — "frozen mandatory requirements" and "current requirement status" are the same list here (`Requirement.status` already carries both). Never truncated (see below). */
  requirements: readonly Requirement[];
  /** Precomputed by the caller; see file header. Never truncated. */
  schemaSummary: string;
  artifacts: readonly Artifact[];
  /** Phase one's checkpoint, if one was successfully submitted. `null` only when phase one produced none (e.g. `blocked` before any checkpoint attempt) — caveats/open work/next action are then empty, never fabricated. */
  checkpoint: Checkpoint | null;
  /** Every attempt so far, in any order — fingerprinted and deduplicated here. */
  attempts: readonly Attempt[];
  remainingCeilings: RemainingCeilings;
}

/**
 * Measures everything except `serializedByteSize` itself — that field
 * reports the packet's size, so including it in the measurement would make
 * the act of recording the number change the number (writing "902" where a
 * placeholder "0" was budgeted adds bytes the budget check never saw). The
 * same reason an HTTP `Content-Length` header doesn't count its own bytes.
 */
function contentByteSize(packet: Omit<MidpointBriefing, 'serializedByteSize'>): number {
  return Buffer.byteLength(JSON.stringify(packet), 'utf8');
}

function rankFindings(artifacts: readonly Artifact[], requirements: readonly Requirement[]): FindingRef[] {
  const requirementIdByArtifactId = new Map<string, string>();
  for (const requirement of requirements) {
    if (requirement.satisfiedByArtifactId) requirementIdByArtifactId.set(requirement.satisfiedByArtifactId, requirement.requirementId);
  }

  // Two stable sorts compose into "linked first, newest first within each
  // group" without a combined comparator: sort.() is stable (ES2019+), so
  // the newest-first order established by the first sort survives being
  // partitioned by the second.
  const newestFirst = [...artifacts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const linkedFirst = newestFirst.sort(
    (a, b) => Number(requirementIdByArtifactId.has(b.artifactId)) - Number(requirementIdByArtifactId.has(a.artifactId)),
  );

  return linkedFirst.map((artifact) => ({
    artifactId: artifact.artifactId,
    complete: artifact.complete,
    rowCount: artifact.rowCount,
    ...(requirementIdByArtifactId.has(artifact.artifactId)
      ? { requirementId: requirementIdByArtifactId.get(artifact.artifactId)! }
      : {}),
  }));
}

function rankFingerprints(attempts: readonly Attempt[]): AttemptFingerprint[] {
  const seen = new Set<string>();
  const fingerprints: AttemptFingerprint[] = [];
  for (const attempt of attempts) {
    const fingerprint = toFingerprint(attempt);
    if (!fingerprint) continue;
    const key = `${fingerprint.operation}:${fingerprint.requestHash}:${fingerprint.disposition}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fingerprints.push(fingerprint);
  }
  return fingerprints;
}

type DroppableSection = 'verifiedFindings' | 'modelCaveats' | 'openWork' | 'failureFingerprints';

/**
 * Builds the bounded packet, greedily filling the frozen rank order —
 * unsatisfied requirements (always included, never dropped, being the whole
 * point of the briefing) → verified findings, newest-first → model-authored
 * caveats → open work by declared priority → failure/duplicate fingerprints
 * — and stopping the instant the next item would exceed `maxSerializedBytes`.
 * Later items are never skipped ahead to fit a smaller one: the rank order is
 * a strict precedence, not a knapsack to optimize (§: "Only the maximum
 * serialized size is set from pilot measurement — size is an input, not an
 * outcome").
 *
 * `maxSerializedBytes` has no default: the doc reserves the actual ceiling
 * for pilot measurement, and hardcoding an unmeasured number here would
 * misrepresent it as frozen when it isn't yet.
 */
export function buildMidpointBriefing(input: BuildBriefingInput, maxSerializedBytes: number): MidpointBriefing {
  const rankedFindings = rankFindings(input.artifacts, input.requirements);
  const rankedCaveats = input.checkpoint?.caveats ?? [];
  const rankedOpenWork = [...(input.checkpoint?.openWork ?? [])].sort((a, b) => a.priority - b.priority);
  const rankedFingerprints = rankFingerprints(input.attempts);

  const packet: MidpointBriefing = {
    originalTask: input.originalTask,
    mandatoryRequirements: input.requirements,
    schemaSummary: input.schemaSummary,
    verifiedFindings: [],
    modelCaveats: [],
    recommendedNextAction: input.checkpoint?.recommendedNextAction ?? '',
    openWork: [],
    failureFingerprints: [],
    remainingCeilings: input.remainingCeilings,
    serializedByteSize: 0,
  };

  const candidates: Array<{ section: DroppableSection; index: number }> = [
    ...rankedFindings.map((_, index) => ({ section: 'verifiedFindings' as const, index })),
    ...rankedCaveats.map((_, index) => ({ section: 'modelCaveats' as const, index })),
    ...rankedOpenWork.map((_, index) => ({ section: 'openWork' as const, index })),
    ...rankedFingerprints.map((_, index) => ({ section: 'failureFingerprints' as const, index })),
  ];

  const mutable = {
    verifiedFindings: [] as FindingRef[],
    modelCaveats: [] as string[],
    openWork: [] as WorkItem[],
    failureFingerprints: [] as AttemptFingerprint[],
  };

  for (const candidate of candidates) {
    if (candidate.section === 'verifiedFindings') mutable.verifiedFindings.push(rankedFindings[candidate.index]);
    else if (candidate.section === 'modelCaveats') mutable.modelCaveats.push(rankedCaveats[candidate.index]);
    else if (candidate.section === 'openWork') mutable.openWork.push(rankedOpenWork[candidate.index]);
    else mutable.failureFingerprints.push(rankedFingerprints[candidate.index]);

    const { serializedByteSize: _placeholder, ...tentative } = { ...packet, ...mutable };
    if (contentByteSize(tentative) > maxSerializedBytes) {
      // Roll back this one addition and stop — strict rank order, no skip-ahead.
      if (candidate.section === 'verifiedFindings') mutable.verifiedFindings.pop();
      else if (candidate.section === 'modelCaveats') mutable.modelCaveats.pop();
      else if (candidate.section === 'openWork') mutable.openWork.pop();
      else mutable.failureFingerprints.pop();
      break;
    }
  }

  const { serializedByteSize: _placeholder, ...content } = { ...packet, ...mutable };
  return { ...content, serializedByteSize: contentByteSize(content) };
}
