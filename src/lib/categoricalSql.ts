// Frequency + categorical-summary SQL (§10 Module 6, `05-charting/04-categorical.md`) —
// pure, mirroring lib/correlationSql.ts/distributionSql.ts's shape. The
// group-summary builder is shared with services/insights.ts's concentration +
// outlier-group rules (§10 Module 1) — one implementation of "aggregate a
// quantitative column by a categorical one," not two.
import { quoteIdentifier } from '../services/ingestion';
import type { QueryResult } from '../types';

export interface FrequencyRow {
  category: string;
  count: number;
}

// A high-cardinality categorical column shouldn't try to render hundreds of
// bars; this is well above any donut-eligible cardinality (see
// CategoricalModule's own, tighter threshold), so it never clips the data a
// donut needs to lump its tail correctly.
const DEFAULT_FREQUENCY_LIMIT = 50;

/** Frequency bar chart's query (§10 Module 6) — one categorical column, sorted descending by count. Also the donut view's source data: the caller lumps the tail locally via `lumpTail` rather than re-querying. */
export function buildFrequencySql(tableName: string, column: string, limit = DEFAULT_FREQUENCY_LIMIT): string {
  const col = quoteIdentifier(column);
  return (
    `SELECT ${col} AS category, COUNT(*) AS count\n` +
    `FROM ${quoteIdentifier(tableName)}\nWHERE ${col} IS NOT NULL\n` +
    `GROUP BY 1\nORDER BY 2 DESC\nLIMIT ${limit}`
  );
}

export function parseFrequency(result: QueryResult): FrequencyRow[] {
  return result.rows.map((row) => ({ category: String(row[0]), count: Number(row[1] ?? 0) }));
}

/**
 * Caps a donut/pie at `maxSlices` wedges, lumping every row past the top
 * `maxSlices - 1` into one "Other" slice, so a column with more categories
 * than that stays legible instead of drawing dozens of slivers. `rows` is
 * assumed already sorted descending (`buildFrequencySql`'s own `ORDER BY`);
 * a no-op when there's nothing to lump.
 */
export function lumpTail(rows: FrequencyRow[], maxSlices: number): FrequencyRow[] {
  if (rows.length <= maxSlices) return rows;
  const head = rows.slice(0, maxSlices - 1);
  const tail = rows.slice(maxSlices - 1);
  const otherCount = tail.reduce((sum, r) => sum + r.count, 0);
  return [...head, { category: 'Other', count: otherCount }];
}

export interface CategorySummaryRow {
  grp: string;
  total: number;
  mean: number;
  rows: number;
}

/**
 * One categorical group × one quantitative measure: sum, mean, and row count
 * per group, sorted by total descending. This is also the grouped-bar view's
 * only query — `total`/`mean` give the Sum/Average toggle both aggregates
 * from one round trip — and `services/insights.ts`'s concentration/
 * outlier-group probe reuses it unchanged (same `grp`/`total`/`mean`/`rows`
 * shape it already depended on).
 */
export function buildCategorySummarySql(tableName: string, catColumn: string, quantColumn: string): string {
  const cat = quoteIdentifier(catColumn);
  const quant = quoteIdentifier(quantColumn);
  return (
    `SELECT ${cat} AS grp, SUM(${quant}) AS total, AVG(${quant}) AS mean, COUNT(*) AS rows\n` +
    `FROM ${quoteIdentifier(tableName)}\nWHERE ${cat} IS NOT NULL\nGROUP BY 1\nORDER BY 2 DESC`
  );
}

export function parseCategorySummary(result: QueryResult): CategorySummaryRow[] {
  return result.rows.map((row) => ({
    grp: String(row[0]),
    total: Number(row[1] ?? 0),
    mean: Number(row[2] ?? 0),
    rows: Number(row[3] ?? 0),
  }));
}
