// The two seam validators (ADR-010 Decisions 3, 4, 8) — the honesty boundary an
// AI producer's output must clear before the view trusts a single field. The
// producer never self-certifies: the client computes the deterministic baseline,
// receives the candidate, and applies these. A false result degrades in place to
// the baseline. Pure — no I/O, no model call.
import type { FactRef, RankedAction } from '../types'
import { checkCitation, type CitableFact } from './citableFacts'

/**
 * A stable key over everything the action-ranking re-ranker may NOT change:
 * module, tab, prefill, evidence, and score. Only `verb` and list order are the
 * model's to touch, so they are excluded. Two action sets with the same multiset
 * of these keys are the same set — re-ordered and re-phrased only.
 */
function actionIdentity(action: RankedAction): string {
  return JSON.stringify({
    module: action.module,
    tab: action.tab ?? null,
    prefill: action.prefill,
    evidence: action.evidence,
    score: action.score,
  })
}

/**
 * Seam 1 validator. True only when the candidate is the baseline's action set
 * re-ordered and/or re-phrased: same length, and the same multiset of identity
 * keys. An added, dropped, or altered action (a new module, a changed prefill or
 * evidence, a nudged score) fails and degrades to the deterministic baseline.
 */
export function rankedActionValidator(baseline: RankedAction[], candidate: RankedAction[]): boolean {
  if (candidate.length !== baseline.length) return false
  const counts = new Map<string, number>()
  for (const action of baseline) {
    const key = actionIdentity(action)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const action of candidate) {
    const key = actionIdentity(action)
    const remaining = counts.get(key)
    if (remaining === undefined || remaining === 0) return false
    counts.set(key, remaining - 1)
  }
  return true
}

// Permanence, causal, and "verified" wording the D45 guard forbids in a stated
// fact — the model may re-phrase, not over-claim. Word-boundary, case-insensitive.
const FORBIDDEN_PHRASING =
  /\b(always|never|permanent(?:ly)?|guaranteed?|invariant|certain(?:ly)?|proven?|verified|confirmed|because|causes?|caused|due to|leads? to|results? in|drives?)\b/i

/** True when the re-phrased statement stays within the D45 honesty guard. */
export function passesPhrasingGuard(statement: string): boolean {
  return !FORBIDDEN_PHRASING.test(statement)
}

/**
 * Seam 2 validator. True only when every non-`statement` field is byte-identical
 * to the baseline (the numeric claim, its SQL/snapshot provenance, and its
 * confidence/provenance tags are the model's to keep, not to touch) and the
 * re-phrased statement clears the D45 phrasing guard.
 *
 * `citedFact` is the clause-citation-binding candidate's amendment
 * (03-clause-citation-binding.md, "What to build" item 3): when given, the
 * candidate's statement must also name only entities/values that belong to
 * the one fact it cites (`checkCitation`) — the per-clause check that catches
 * a real statistic attached to the wrong column, not just an invented one.
 * Optional and additive: every existing 2-arg call site is unaffected.
 */
export function narrationValidator(baseline: FactRef, candidate: FactRef, citedFact?: CitableFact): boolean {
  const structurallyIntact =
    candidate.sql === baseline.sql &&
    candidate.snapshot === baseline.snapshot &&
    candidate.confidence === baseline.confidence &&
    candidate.provenance === baseline.provenance &&
    passesPhrasingGuard(candidate.statement)
  if (!structurallyIntact) return false
  return citedFact === undefined || checkCitation(candidate.statement, citedFact).ok
}
