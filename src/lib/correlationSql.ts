// Pairwise-correlation SQL (§10 Module 4, `05-charting/02-correlation.md`) —
// pure, mirroring lib/timeSeriesSql.ts/pivotCompiler.ts's shape: a table +
// column list in, one batched DuckDB statement out (n·(n-1)/2 `corr(...)`
// projections, never one query per pair). Shared with services/insights.ts's
// leakage-flag rule (§10 Module 1) — one implementation of "batch every
// numeric pair into a single query", not two.
import { quoteIdentifier } from '../services/ingestion';
import type { QueryResult } from '../types';

/** Every unordered pair of column names, `i < j`, in input order — the fixed order both the SQL projections and the parser below index against. */
export function correlationPairs(columns: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) pairs.push([columns[i], columns[j]]);
  }
  return pairs;
}

/** One row, one `corr(a, b)` column per pair — batched so an n-column matrix costs one query, not n·(n-1)/2. */
export function buildCorrelationMatrixSql(table: string, columns: string[]): string {
  const pairs = correlationPairs(columns);
  const projections = pairs
    .map(([a, b], i) => `corr(${quoteIdentifier(a)}, ${quoteIdentifier(b)}) AS c${i}`)
    .join(', ');
  return `SELECT ${projections}\nFROM ${quoteIdentifier(table)}`;
}

export interface CorrelationMatrix {
  columns: string[];
  /** `values[i][j]` — symmetric, diagonal is always 1, `null` where DuckDB returned no value (e.g. a constant column). */
  values: Array<Array<number | null>>;
}

/** `buildCorrelationMatrixSql`'s single result row → a symmetric matrix keyed by column index. */
export function parseCorrelationMatrix(result: QueryResult, columns: string[]): CorrelationMatrix {
  const n = columns.length;
  const values: Array<Array<number | null>> = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : null)),
  );

  const row = result.rows[0] ?? [];
  correlationPairs(columns).forEach(([a, b], idx) => {
    const raw = row[idx];
    const corr = raw == null ? null : Number(raw);
    const value = corr !== null && Number.isFinite(corr) ? corr : null;
    const i = columns.indexOf(a);
    const j = columns.indexOf(b);
    values[i][j] = value;
    values[j][i] = value;
  });

  return { columns, values };
}

/** A raw two-column `SELECT` for the drill-through scatter — both columns non-null, so every plotted point has both coordinates. */
export function buildScatterSql(table: string, columnA: string, columnB: string): string {
  const a = quoteIdentifier(columnA);
  const b = quoteIdentifier(columnB);
  return `SELECT ${a}, ${b}\nFROM ${quoteIdentifier(table)}\nWHERE ${a} IS NOT NULL AND ${b} IS NOT NULL`;
}
