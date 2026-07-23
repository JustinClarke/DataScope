// Box-plot + moments SQL (§10 Module 5, `05-charting/03-distribution.md`) —
// pure, mirroring lib/timeSeriesSql.ts/correlationSql.ts's shape: a table +
// column in, one DuckDB statement out. Histogram binning is NOT duplicated
// here — it reuses lib/columnStats.ts's buildHistogramSql/parseHistogram
// (now parameterized by bin count) since this module's only real difference
// from the profile card's fixed-bucket histogram is a configurable count.
// This file owns what that one doesn't: quartiles/whiskers/outliers for the
// box plot, and the mean/median/mode/stddev/skewness/kurtosis moments row.
import { quoteIdentifier } from '../services/ingestion';
import type { QueryResult } from '../types';

export interface Quartiles {
  q1: number;
  median: number;
  q3: number;
}

/** `quantile_cont` — continuous (interpolated) quartiles, the conventional choice for a box plot over `quantile_disc`'s nearest-rank version. */
export function buildQuartilesSql(tableName: string, column: string): string {
  const col = quoteIdentifier(column);
  return (
    `SELECT quantile_cont(${col}, 0.25) AS q1, quantile_cont(${col}, 0.5) AS median, quantile_cont(${col}, 0.75) AS q3\n` +
    `FROM ${quoteIdentifier(tableName)}\nWHERE ${col} IS NOT NULL`
  );
}

/** `null` when the column has no non-null values at all (quantile_cont has nothing to interpolate over). */
export function parseQuartiles(result: QueryResult): Quartiles | null {
  const row = result.rows[0];
  if (!row || row[0] == null || row[1] == null || row[2] == null) return null;
  return { q1: Number(row[0]), median: Number(row[1]), q3: Number(row[2]) };
}

export interface IqrBounds {
  lower: number;
  upper: number;
}

/** The standard 1.5×IQR fence (Tukey's rule) — the "IQR rule" this item's own acceptance criteria name. Pure JS: both quartiles are already in hand from a prior query, so this needs no round trip. */
export function computeIqrBounds({ q1, q3 }: Quartiles): IqrBounds {
  const iqr = q3 - q1;
  return { lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr };
}

export interface Whiskers {
  low: number;
  high: number;
}

/** Whisker ends are real data points inside the fence, not the fence bound itself — the nearest in-fence value to each bound (Tukey's convention), never a value beyond it. */
export function buildWhiskersSql(tableName: string, column: string, bounds: IqrBounds): string {
  const col = quoteIdentifier(column);
  const table = quoteIdentifier(tableName);
  return (
    `SELECT MIN(${col}) AS whisker_low, MAX(${col}) AS whisker_high\n` +
    `FROM ${table}\nWHERE ${col} IS NOT NULL AND ${col} >= ${bounds.lower} AND ${col} <= ${bounds.upper}`
  );
}

/** `null` when no value falls inside the fence at all — degenerate, but possible on a pathological distribution. */
export function parseWhiskers(result: QueryResult): Whiskers | null {
  const row = result.rows[0];
  if (!row || row[0] == null || row[1] == null) return null;
  return { low: Number(row[0]), high: Number(row[1]) };
}

const OUTLIER_LIMIT = 500;

/** Values outside the IQR fence — capped so a heavy-tailed column doesn't try to plot tens of thousands of dots. */
export function buildOutliersSql(tableName: string, column: string, bounds: IqrBounds, limit = OUTLIER_LIMIT): string {
  const col = quoteIdentifier(column);
  const table = quoteIdentifier(tableName);
  return (
    `SELECT ${col} AS value\nFROM ${table}\n` +
    `WHERE ${col} IS NOT NULL AND (${col} < ${bounds.lower} OR ${col} > ${bounds.upper})\n` +
    `ORDER BY ${col}\nLIMIT ${limit}`
  );
}

export function parseOutliers(result: QueryResult): number[] {
  return result.rows.map((row) => Number(row[0]));
}

export interface BoxPlotStats {
  q1: number;
  median: number;
  q3: number;
  whiskerLow: number;
  whiskerHigh: number;
  outliers: number[];
}

export interface DistributionMoments {
  mean: number | null;
  median: number | null;
  mode: number | null;
  stdDev: number | null;
  skewness: number | null;
  kurtosis: number | null;
}

/**
 * One round trip for the whole descriptive-stats panel. DuckDB's built-in
 * `skewness`/`kurtosis` aggregates are the sample versions (denominator
 * n-1/n-1,n-2-style bias correction, same family as pandas' default
 * `.skew()`/`.kurt()`), `stddev` is sample stddev (`ddof=1`, pandas' default)
 * — both chosen so an external pandas `describe()`/`skew()`/`kurt()` cross-
 * check (this item's own definition of done) compares like with like.
 */
export function buildMomentsSql(tableName: string, column: string): string {
  const col = quoteIdentifier(column);
  return (
    `SELECT avg(${col}) AS mean, median(${col}) AS median, mode(${col}) AS mode, stddev(${col}) AS std_dev, ` +
    `skewness(${col}) AS skewness, kurtosis(${col}) AS kurtosis\n` +
    `FROM ${quoteIdentifier(tableName)}\nWHERE ${col} IS NOT NULL`
  );
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** `null` fields are real (e.g. skewness/kurtosis are undefined below 2-3 non-null values), not a parsing failure — rendered as "—" in the stats panel. */
export function parseMoments(result: QueryResult): DistributionMoments {
  const row = result.rows[0] ?? [];
  return {
    mean: nullableNumber(row[0]),
    median: nullableNumber(row[1]),
    mode: nullableNumber(row[2]),
    stdDev: nullableNumber(row[3]),
    skewness: nullableNumber(row[4]),
    kurtosis: nullableNumber(row[5]),
  };
}
