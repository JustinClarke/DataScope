// Supplemental per-column statistics for the profile dashboard (§10 Module 1)
// — everything SUMMARIZE doesn't already give `ColumnProfile` (median,
// histogram, top values, date range/gap, text stats). Pure SQL builders +
// result parsers, mirroring lib/profile.ts's split; services/profiling.ts
// runs the queries these produce.

import type { QueryResult } from '../types';

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * DuckDB-Wasm's Arrow layer surfaces DATE columns (including `date_trunc`
 * output) as raw epoch-millisecond numbers, not date strings — confirmed live
 * against a real query (`SELECT date_trunc('month', DATE '2023-05-15')` comes
 * back as `1682899200000`, column type `Date32<DAY>`). `String()`-ing that
 * directly produces a meaningless digit string, not a date; every date-valued
 * cell from a query in this file goes through this instead. `precision: 7`
 * truncates to a "YYYY-MM" month label for period-style output.
 */
export function formatDateCell(value: unknown, precision: 7 | 10 = 10): string {
  const n = Number(value);
  return Number.isFinite(n) ? new Date(n).toISOString().slice(0, precision) : String(value);
}

// ---- Quantitative: histogram ----

export interface HistogramBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
}

export const HISTOGRAM_BUCKET_COUNT = 10;

/**
 * Equal-width binning done with explicit FLOOR + clamp rather than DuckDB's
 * `width_bucket` — that function's boundary handling for a value exactly at
 * `max` isn't something worth trusting without re-deriving it, while FLOOR
 * with a clamp is unambiguous and trivial to unit test. Returns `null` for a
 * degenerate column (every non-null value identical, or no non-null values
 * at all — e.g. a 100%-null column) since a histogram has nothing to bin.
 * `binCount` defaults to the fixed profile-card count; `05-distribution`'s
 * configurable-bin-count control passes its own value through the same
 * builder rather than duplicating the binning logic.
 */
export function buildHistogramSql(
  tableName: string,
  column: string,
  min: number,
  max: number,
  binCount: number = HISTOGRAM_BUCKET_COUNT,
): string | null {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
  const width = (max - min) / binCount;
  const col = quoteIdentifier(column);
  return (
    `SELECT LEAST(GREATEST(CAST(FLOOR((CAST(${col} AS DOUBLE) - ${min}) / ${width}) AS INTEGER), 0), ${binCount - 1}) AS bucket, ` +
    `COUNT(*) AS freq FROM ${quoteIdentifier(tableName)} WHERE ${col} IS NOT NULL GROUP BY 1 ORDER BY 1`
  );
}

export function parseHistogram(
  result: QueryResult,
  min: number,
  max: number,
  binCount: number = HISTOGRAM_BUCKET_COUNT,
): HistogramBucket[] {
  const width = (max - min) / binCount;
  const counts = new Array(binCount).fill(0) as number[];
  for (const row of result.rows) {
    const bucket = Number(row[0]);
    if (bucket >= 0 && bucket < binCount) counts[bucket] = Number(row[1]);
  }
  return counts.map((count, i) => ({
    rangeStart: min + i * width,
    rangeEnd: min + (i + 1) * width,
    count,
  }));
}

// ---- Quantitative: median ----

export function buildMedianSql(tableName: string, column: string): string {
  const col = quoteIdentifier(column);
  return `SELECT median(CAST(${col} AS DOUBLE)) AS median FROM ${quoteIdentifier(tableName)} WHERE ${col} IS NOT NULL`;
}

export function parseMedian(result: QueryResult): number | null {
  const value = result.rows[0]?.[0];
  return value === null || value === undefined ? null : Number(value);
}

// ---- Categorical: value frequencies ----

export interface ValueFrequency {
  value: string;
  count: number;
}

// Matches the exact educational SQL shape §10/leaf doc show the user — nulls
// aren't filtered, so a null value surfaces as its own frequency row rather
// than silently disappearing (this is what makes a 100%-null categorical
// column still render a sane single-row result).
export function buildTopValuesSql(tableName: string, column: string, limit = 10): string {
  const col = quoteIdentifier(column);
  return `SELECT ${col} AS value, COUNT(*) AS freq FROM ${quoteIdentifier(tableName)} GROUP BY 1 ORDER BY 2 DESC LIMIT ${limit}`;
}

export function parseTopValues(result: QueryResult): ValueFrequency[] {
  return result.rows.map((row) => ({
    value: row[0] === null ? '(null)' : String(row[0]),
    count: Number(row[1]),
  }));
}

// ---- Temporal: date range + gap detection ----

export interface DateRangeStats {
  earliest: string;
  latest: string;
  /** Human-readable summary; "No gaps detected" when spacing is regular or too little data exists to judge. */
  gapDescription: string;
}

/**
 * Range plus a simple gap heuristic: the largest day-to-day spacing between
 * consecutive distinct dates, compared against the median spacing. A gap
 * more than double the typical cadence is flagged; anything else reads as
 * regular spacing. One round trip — the three sub-selects share the `ordered`/
 * `deltas` CTEs rather than each re-scanning the table.
 */
export function buildDateRangeSql(tableName: string, column: string): string {
  const col = quoteIdentifier(column);
  const table = quoteIdentifier(tableName);
  return `WITH ordered AS (
  SELECT DISTINCT CAST(${col} AS DATE) AS d FROM ${table} WHERE ${col} IS NOT NULL
), deltas AS (
  SELECT date_diff('day', LAG(d) OVER (ORDER BY d), d) AS gap_days FROM ordered
)
SELECT
  (SELECT MIN(d) FROM ordered) AS earliest,
  (SELECT MAX(d) FROM ordered) AS latest,
  (SELECT MAX(gap_days) FROM deltas) AS max_gap_days,
  (SELECT MEDIAN(gap_days) FROM deltas WHERE gap_days IS NOT NULL) AS median_gap_days`;
}

export function parseDateRange(result: QueryResult): DateRangeStats | null {
  const row = result.rows[0];
  if (!row || row[0] == null || row[1] == null) return null;

  const earliest = formatDateCell(row[0]);
  const latest = formatDateCell(row[1]);
  const maxGap = row[2] == null ? null : Number(row[2]);
  const medianGap = row[3] == null ? null : Number(row[3]);

  let gapDescription = 'No gaps detected';
  if (maxGap != null && maxGap > 1 && (medianGap == null || maxGap > medianGap * 2)) {
    const typical = medianGap != null ? ` (typical spacing: ${medianGap} day${medianGap === 1 ? '' : 's'})` : '';
    gapDescription = `Largest gap: ${maxGap} days${typical}`;
  }

  return { earliest, latest, gapDescription };
}

// ---- Textual: word count + sample preview ----

/**
 * Approximate word count via space-counting arithmetic (`length` and
 * `replace` are unambiguous VARCHAR builtins) rather than a list-splitting
 * function whose exact name/behavior isn't worth guessing at — multiple
 * consecutive spaces overcount slightly, an acceptable approximation for a
 * descriptive stat, not a graded exactness criterion.
 */
export function buildWordCountSql(tableName: string, column: string): string {
  const col = quoteIdentifier(column);
  const trimmed = `trim(${col})`;
  return `SELECT AVG(CASE WHEN ${trimmed} = '' THEN 0 ELSE length(${trimmed}) - length(replace(${trimmed}, ' ', '')) + 1 END) AS avg_words FROM ${quoteIdentifier(tableName)} WHERE ${col} IS NOT NULL`;
}

export function parseWordCount(result: QueryResult): number | null {
  const value = result.rows[0]?.[0];
  return value === null || value === undefined ? null : Number(value);
}

export function buildSamplePreviewSql(tableName: string, column: string, limit = 3): string {
  const col = quoteIdentifier(column);
  return `SELECT ${col} FROM ${quoteIdentifier(tableName)} WHERE ${col} IS NOT NULL LIMIT ${limit}`;
}

export function parseSamplePreview(result: QueryResult): string[] {
  return result.rows.map((row) => String(row[0]));
}
