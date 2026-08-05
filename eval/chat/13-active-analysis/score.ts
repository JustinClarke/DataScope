import type { LoopDisposition } from './analysisLoop';
import type { CapabilityGapCode } from './contracts';

/** § Metrics and ROI, "Verified useful yield": fraction of answerable questions ending in an accepted claim or offer. */
export function verifiedUsefulYield(dispositions: readonly LoopDisposition[]): number {
  if (dispositions.length === 0) return 0;
  const useful = dispositions.filter((disposition) => disposition.kind === 'final_claim' || disposition.kind === 'final_offer');
  return useful.length / dispositions.length;
}

export interface ControlResult {
  questionId: string;
  disposition: LoopDisposition;
  expectedReason: CapabilityGapCode;
}

/** § Metrics and ROI, "Correct unsupported": exact corroborated gap code, not just any refusal. */
export function correctUnsupportedRate(controls: readonly ControlResult[]): number {
  if (controls.length === 0) return 0;
  const correct = controls.filter(
    (control) => control.disposition.kind === 'unsupported' && control.disposition.reason === control.expectedReason,
  );
  return correct.length / controls.length;
}

export interface AnswerableUnsupportedResult {
  questionId: string;
  reason: CapabilityGapCode;
}

/**
 * § Metrics and ROI, "Refusal collapse": reuse of one unsupported code where different
 * evidence/capabilities apply. Only answerable-question refusals count — every answerable
 * question is, by the question set's own design, a different evidence/capability situation, so
 * the same code recurring across two or more of them is the collapse signature.
 */
export function refusalCollapseCodes(refusals: readonly AnswerableUnsupportedResult[]): CapabilityGapCode[] {
  const questionsByReason = new Map<CapabilityGapCode, Set<string>>();
  for (const refusal of refusals) {
    const questions = questionsByReason.get(refusal.reason) ?? new Set<string>();
    questions.add(refusal.questionId);
    questionsByReason.set(refusal.reason, questions);
  }
  return [...questionsByReason.entries()].filter(([, questions]) => questions.size > 1).map(([reason]) => reason);
}

export interface ProbeRequestOutcome {
  candidateId: string;
  /** The candidate's server-side `questionRelevance`, which the model never sees. */
  questionRelevance: readonly string[];
}

/**
 * § Metrics and ROI, "Probe relevance": requested probes whose pre-registered relevance tags
 * match the asking question. The tags must be the server-side answer key, not anything the
 * prompt carried, or the metric measures string matching rather than judgment.
 */
export function probeRelevance(
  requested: readonly ProbeRequestOutcome[],
  questionId: string,
): { relevant: number; irrelevant: number } {
  const relevant = requested.filter((probe) => probe.questionRelevance.includes(questionId)).length;
  return { relevant, irrelevant: requested.length - relevant };
}

/** § Metrics and ROI, "Probe productivity" / "Duplicate/wasted probes". */
export function probeProductivity(
  executedCandidateIds: readonly string[],
  contributingCandidateIds: readonly string[],
): { productive: number; wasted: number; wastedRate: number } {
  const contributing = new Set(contributingCandidateIds);
  const productive = executedCandidateIds.filter((id) => contributing.has(id)).length;
  const wasted = executedCandidateIds.length - productive;
  return { productive, wasted, wastedRate: executedCandidateIds.length === 0 ? 0 : wasted / executedCandidateIds.length };
}

/** § Cache and context rules: cache reuse is within-repeat only; the caller must not mix repeats. */
export function cacheReuseRate(hits: number, misses: number): number {
  const total = hits + misses;
  return total === 0 ? 0 : hits / total;
}

/**
 * § Metrics and ROI, "Primary ROI": verified useful results per 1,000 total model tokens. A
 * zero-yield arm must not manufacture an infinite ratio.
 */
export function primaryRoi(verifiedUsefulResults: number, totalModelTokens: number): number | 'undefined' {
  if (verifiedUsefulResults === 0) return 'undefined';
  if (totalModelTokens === 0) return 'undefined';
  return (verifiedUsefulResults / totalModelTokens) * 1000;
}

/** § Metrics and ROI, "Stability": final-disposition overlap across an N-repeat set. */
export function stability(dispositions: readonly LoopDisposition[]): { distinctKinds: number; stable: boolean } {
  const distinctKinds = new Set(dispositions.map((disposition) => disposition.kind)).size;
  return { distinctKinds, stable: distinctKinds <= 1 };
}
