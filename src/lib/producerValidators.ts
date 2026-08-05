// The two seam validators (ADR-010 Decisions 3, 4, 8) — the honesty boundary an
// AI producer's output must clear before the view trusts a single field. The
// producer never self-certifies: the client computes the deterministic baseline,
// receives the candidate, and applies these. A false result degrades in place to
// the baseline. Pure — no I/O, no model call.
import type { ChartSpec, FactRef, RankedAction } from '../types'
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
  // `verb` is the one free-text field the model may write on this path, so it
  // clears the same D45 guard a re-phrased `statement` does — without this the
  // offers slot is the hole an over-claim gets pushed through
  // (10-grounding-ladder.md, "RankedAction.verb is unguarded").
  if (!candidate.every((action) => passesPhrasingGuard(action.verb))) return false
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
 * Unhedged generalisation over time — the second guard
 * (10-grounding-ladder.md, "Extend the phrasing guard to trend generalisation,
 * and measure the cost"). `FORBIDDEN_PHRASING` bans causal *vocabulary*, so the
 * two sentences a synthesis panel most wants to over-claim with ("Orders
 * consistently peak on Tuesdays", "Older cohorts exhibit steadily increasing
 * order values") clear it clean. These terms catch that shape.
 *
 * Deliberately NOT folded into `passesPhrasingGuard`: it is applied and
 * counted as a measurement first (its false-reject rate against the app's own
 * deterministic statements is a reported result, `eval/claude/10-grounding-ladder/
 * runOffers.ts`), so it earns the shipped path with a number rather than a
 * judgement. Exported as a list, not just a regex, because its length is
 * reported alongside `CLOSURE_RULES`' — and, like that list, it may not grow to
 * flatter the numbers.
 */
export const TREND_GENERALISATION_TERMS = [
  'consistently',
  'steadily',
  'typically',
  'tend to',
  'tends to',
  'continues to',
  'increasingly',
  'ongoing',
] as const

const TREND_GENERALISATION_PHRASING = new RegExp(`\\b(${TREND_GENERALISATION_TERMS.join('|')})\\b`, 'i')

/** True when the statement states a trend without generalising it. */
export function passesTrendGeneralisationGuard(statement: string): boolean {
  return !TREND_GENERALISATION_PHRASING.test(statement)
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
/**
 * Seam 3 validator (A6) — the gate on `create_chart`'s optional model-supplied
 * `spec`. Same discipline as the two above, one layer down: the deterministic
 * producer is `chartMapper`, which reads the *actual* result and can only ever
 * name columns that result has, and the candidate is accepted as a
 * **narrowing** of that baseline — never a widening.
 *
 * True only when:
 *  - `type` is unchanged. The chart form is the translator's call; a model that
 *    wants a different one asks for it by parameter, which re-runs the mapper.
 *  - `xField` is unchanged, and `seriesField` is the baseline's or dropped.
 *  - `yFields` is a non-empty, duplicate-free **subset** of the baseline's, in
 *    any order. Dropping a measure is a legitimate editorial choice; adding one
 *    would be naming a column the renderer was never told exists.
 *  - `title` is a non-empty string that clears the D45 phrasing guard — the one
 *    free-text field, held to the same bar as `RankedAction.verb`.
 *
 * The subset rule is the whole safety property: **no field name in an accepted
 * spec came from the model.** Every one of them was already in the baseline,
 * which was built from the result's own schema, so the chart renderer can never
 * be handed a field the data does not have.
 */
export function chartSpecValidator(baseline: ChartSpec, candidate: ChartSpec): boolean {
  if (candidate.type !== baseline.type) return false
  if (candidate.xField !== baseline.xField) return false
  if (candidate.seriesField !== undefined && candidate.seriesField !== baseline.seriesField) return false
  if (!Array.isArray(candidate.yFields) || candidate.yFields.length === 0) return false
  if (new Set(candidate.yFields).size !== candidate.yFields.length) return false
  if (!candidate.yFields.every((field) => baseline.yFields.includes(field))) return false
  if (typeof candidate.title !== 'string' || candidate.title.trim() === '') return false
  return passesPhrasingGuard(candidate.title)
}

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
