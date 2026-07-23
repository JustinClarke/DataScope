// Column-card supplemental stats (§10 Module 1, Phase 1) — the per-type
// numbers ColumnProfile/ClassifiedColumn don't already carry (median,
// histogram, top values, date range/gap, text stats). Queries the engine
// directly, same lazy-import pattern as services/ingestion.ts/sql.ts, rather
// than routing through sql.ts's single-in-flight query store: a table's cards
// fire many small concurrent queries, one (or two) per column, which would
// otherwise fight over that store's "one query panel" state machine.
import type { ClassifiedColumn } from '../types';
import * as stats from '../lib/columnStats';

type EngineModule = typeof import('../workers/duckdb.worker');
let engineModule: Promise<EngineModule> | null = null;
function loadEngine(): Promise<EngineModule> {
  if (!engineModule) engineModule = import('../workers/duckdb.worker');
  return engineModule;
}

export type ColumnCardStats =
  | {
      kind: 'Quantitative';
      median: number | null;
      medianSql: string;
      histogram: stats.HistogramBucket[] | null;
      histogramSql: string | null;
    }
  | { kind: 'Categorical'; topValues: stats.ValueFrequency[]; sql: string }
  | { kind: 'Temporal'; range: stats.DateRangeStats | null; sql: string }
  | {
      kind: 'Textual';
      avgWordCount: number | null;
      wordCountSql: string;
      samplePreview: string[];
      sampleSql: string;
    }
  | { kind: 'Identifier' };

async function loadColumnStats(engine: EngineModule, tableName: string, column: ClassifiedColumn): Promise<ColumnCardStats> {
  switch (column.semanticType) {
    case 'Quantitative': {
      const min = Number(column.min);
      const max = Number(column.max);
      const medianSql = stats.buildMedianSql(tableName, column.name);
      const histogramSql = stats.buildHistogramSql(tableName, column.name, min, max);
      const [medianResult, histogramResult] = await Promise.all([
        engine.duckDBEngine.execute(medianSql),
        histogramSql ? engine.duckDBEngine.execute(histogramSql) : Promise.resolve(null),
      ]);
      return {
        kind: 'Quantitative',
        median: stats.parseMedian(medianResult),
        medianSql,
        histogram: histogramResult ? stats.parseHistogram(histogramResult, min, max) : null,
        histogramSql,
      };
    }
    case 'Categorical': {
      const sql = stats.buildTopValuesSql(tableName, column.name);
      const result = await engine.duckDBEngine.execute(sql);
      return { kind: 'Categorical', topValues: stats.parseTopValues(result), sql };
    }
    case 'Temporal': {
      const sql = stats.buildDateRangeSql(tableName, column.name);
      const result = await engine.duckDBEngine.execute(sql);
      return { kind: 'Temporal', range: stats.parseDateRange(result), sql };
    }
    case 'Textual': {
      const wordCountSql = stats.buildWordCountSql(tableName, column.name);
      const sampleSql = stats.buildSamplePreviewSql(tableName, column.name);
      const [wordResult, sampleResult] = await Promise.all([
        engine.duckDBEngine.execute(wordCountSql),
        engine.duckDBEngine.execute(sampleSql),
      ]);
      return {
        kind: 'Textual',
        avgWordCount: stats.parseWordCount(wordResult),
        wordCountSql,
        samplePreview: stats.parseSamplePreview(sampleResult),
        sampleSql,
      };
    }
    case 'Identifier':
      // No supplemental query — an identifier's card is just its badge + null
      // bar + the exclusion note the insight feed's ID-exclusion rule states.
      return { kind: 'Identifier' };
  }
}

/**
 * Supplemental stats for every column of one table, keyed by column name. All
 * columns' queries fire concurrently (each engine.execute() call opens its
 * own DuckDB-Wasm connection) — well within the <500ms card-render budget at
 * v0 table sizes, verified live per this item's acceptance criteria.
 */
export async function loadTableCardStats(
  tableName: string,
  columns: ClassifiedColumn[],
): Promise<Record<string, ColumnCardStats>> {
  const engine = await loadEngine();
  const entries = await Promise.all(
    columns.map(async (column) => [column.name, await loadColumnStats(engine, tableName, column)] as const),
  );
  return Object.fromEntries(entries);
}
