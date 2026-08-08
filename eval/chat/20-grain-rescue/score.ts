// Scoring for exp20 (DESIGN.md §5): single-shot question -> proposal ->
// execute -> compare, not exp17's multi-turn chat scoring (score.ts there is
// tightly coupled to its own session/repair/safety-category shape — not a
// fit here, so this is a small purpose-built comparator instead of a forced
// reuse). Four buckets per call: correct / wrong-but-ran / abstained /
// malformed / execution-error (DESIGN.md §5, post-review revision — v1's
// single "failed-to-run" bucket let abstention masquerade as a safety win;
// see OPUS_REVIEW.md I2).

export type ScoreBucket = 'correct' | 'wrong-but-ran' | 'abstained' | 'malformed' | 'execution-error';

/**
 * DESIGN.md §5 tolerance (single rule, replacing v1's three inconsistent
 * ones — OPUS_REVIEW.md M3): matches within max(0.01 absolute, 0.1%
 * relative) — a tiny gold value (e.g. 0) needs the absolute leg, a large sum
 * (e.g. total revenue) needs the relative leg. Counts/IDs must match exactly
 * — callers pass integer gold for those and the absolute-0.01 leg covers it.
 */
export function numericMatch(actual: number, gold: number): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(gold)) return false;
  const absDiff = Math.abs(actual - gold);
  const threshold = Math.max(0.01, 0.001 * Math.abs(gold));
  return absDiff <= threshold;
}

function normalizeScalar(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
    return trimmed.toLowerCase();
  }
  return String(value).toLowerCase();
}

export interface GoldCheck {
  /** Scalar gold checks compare a single value; table checks compare an unordered set of row-signatures (e.g. "top 5 products by units sold"). */
  kind: 'scalar' | 'rows';
  scalar?: number | string;
  rows?: Array<Array<number | string>>;
}

export interface ExecutedResult {
  columnNames: string[];
  rows: unknown[][];
}

function rowSignature(row: readonly unknown[]): string {
  return row.map(normalizeScalar).map(String).sort().join('');
}

/** True only if the executed result matches gold exactly (within numeric tolerance) — never partial credit. */
export function matchesGold(actual: ExecutedResult, gold: GoldCheck): boolean {
  if (gold.kind === 'scalar') {
    if (actual.rows.length === 0 || actual.rows[0]!.length === 0) return false;
    const actualValue = normalizeScalar(actual.rows[0]![0]);
    const goldValue = normalizeScalar(gold.scalar);
    if (typeof actualValue === 'number' && typeof goldValue === 'number') return numericMatch(actualValue, goldValue);
    return actualValue === goldValue;
  }
  if (!gold.rows) return false;
  if (actual.rows.length !== gold.rows.length) return false;
  const actualSigs = actual.rows.map(rowSignature).sort();
  const goldSigs = gold.rows.map((r) => rowSignature(r)).sort();
  return actualSigs.every((sig, i) => sig === goldSigs[i]);
}

export interface CallOutcome {
  /** 'malformed' short-circuits before SQL ever runs — the model's structured output failed schema/Zod validation. */
  proposalStatus: 'query' | 'unsupported' | 'malformed';
  ranSuccessfully: boolean;
  result: ExecutedResult | null;
  errorMessage: string | null;
}

/**
 * The four-bucket classification DESIGN.md §5 requires (post-review revision
 * — a single "failed-to-run" bucket let abstention alone read as a "safety
 * win" against wrong-but-ran, which is gameable by anything that makes the
 * model give up more; OPUS_REVIEW.md I2). Bucket 2 (wrong-but-ran) is the
 * one that matters most for this experiment's headline claim — the floor
 * rule on claiming a bucket-2-to-bucket-3(c) shift as a "safety win" lives in
 * the report/analysis layer, not here, since it needs the comparison arm's
 * correct-rate too.
 */
export function bucketOutcome(outcome: CallOutcome, gold: GoldCheck): ScoreBucket {
  if (outcome.proposalStatus === 'malformed') return 'malformed';
  if (outcome.proposalStatus === 'unsupported') return 'abstained';
  if (!outcome.ranSuccessfully || !outcome.result) return 'execution-error';
  return matchesGold(outcome.result, gold) ? 'correct' : 'wrong-but-ran';
}

export type ViewUsage = 'none' | 'correct-view' | 'wrong-view' | 'mixed';

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * DESIGN.md §5: tags an emitted SQL string by regex against the dataset's
 * generated view names, so the report can cross-tabulate outcome bucket x
 * viewUsage per arm — an A2 win that shows up mostly as 'none' is not a view
 * effect, and a rising 'wrong-view' rate from A1 to A2 is a real cost, not
 * noise. `correctViewName` is question-specific (supplied by the caller, not
 * inferred here — this function has no notion of which view a question
 * *should* use, only which view names literally appear in the SQL) and may
 * be `null` for questions with no single correct view.
 * Word-bounded, case-insensitive matching: view names are generated with a
 * fixed `<child>_rollup_by_<parent>` shape, so a `\b`-bounded match can't
 * mistake `order_items_rollup_by_orders` for `order_items_rollup_by_orders_v2`
 * or vice versa.
 */
export function tagViewUsage(sql: string, allViewNames: readonly string[], correctViewName: string | null): ViewUsage {
  const referenced = allViewNames.filter((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(sql));
  if (referenced.length === 0) return 'none';
  const referencesCorrect = correctViewName !== null && referenced.includes(correctViewName);
  const referencesWrong = referenced.some((name) => name !== correctViewName);
  if (referencesCorrect && referencesWrong) return 'mixed';
  return referencesCorrect ? 'correct-view' : 'wrong-view';
}
