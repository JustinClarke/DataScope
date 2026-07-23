// Time-series SQL builders (§10 Module 3, `05-charting/01-time-series.md`) —
// pure: a spec in, one DuckDB statement out, mirroring lib/pivotCompiler.ts's
// shape. No engine access here; services/charts.ts's `runChartQuery` runs
// what these functions produce. Every granularity/window value the UI offers
// is a closed union, never free text, so interpolating it directly into the
// `DATE_TRUNC('${granularity}', …)` / `ROWS BETWEEN ${n} PRECEDING` SQL below
// carries no injection risk — only column/table names (arbitrary strings)
// go through `quoteIdentifier`.
import { quoteIdentifier } from '../services/ingestion';
import type { QueryResult } from '../types';
import { formatDateCell } from './columnStats';

export type TimeSeriesGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type TimeSeriesAggregate = 'sum' | 'avg' | 'min' | 'max' | 'count';
export type MovingAverageWindow = 7 | 30 | 90;

export interface TimeSeriesBase {
  table: string;
  dateColumn: string;
  valueColumn: string;
  aggregate: TimeSeriesAggregate;
}

export interface TrendSpec extends TimeSeriesBase {
  granularity: TimeSeriesGranularity;
  /** Omitted → plain trend, no overlay. */
  movingAverageWindow?: MovingAverageWindow;
}

export type PeriodComparisonSpec = TimeSeriesBase & { granularity: TimeSeriesGranularity };
export type SeasonalitySpec = TimeSeriesBase;

const AGGREGATE_SQL: Record<TimeSeriesAggregate, string> = {
  sum: 'SUM',
  avg: 'AVG',
  min: 'MIN',
  max: 'MAX',
  count: 'COUNT',
};

function sanitizeAliasPart(field: string): string {
  return field.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
}

function aggregateExpression(aggregate: TimeSeriesAggregate, column: string): string {
  if (aggregate === 'count') return 'COUNT(*)';
  return `${AGGREGATE_SQL[aggregate]}(${quoteIdentifier(column)})`;
}

/** `avg_Close`, `count_OrderId`, … — the trend/comparison value series' column alias. */
export function valueAlias(spec: TimeSeriesBase): string {
  return `${spec.aggregate}_${sanitizeAliasPart(spec.valueColumn)}`;
}

/** `ma_7`, `ma_30`, … — the moving-average overlay series' column alias. */
export function movingAverageAlias(window: MovingAverageWindow): string {
  return `ma_${window}`;
}

/**
 * Trend line, one row per `DATE_TRUNC`-bucketed period. With a
 * `movingAverageWindow`, wraps the bucketed series in the §10 Module 2
 * `AVG(...) OVER (ORDER BY … ROWS BETWEEN n PRECEDING AND CURRENT ROW)`
 * pattern — an N-period moving average, "period" being whatever granularity
 * is selected (labelled 7/30/90-*day* in the UI since `day` is the default
 * and the common case, e.g. the stock-prices sample).
 */
export function buildTrendSql(spec: TrendSpec): string {
  const table = quoteIdentifier(spec.table);
  const dateCol = quoteIdentifier(spec.dateColumn);
  const alias = quoteIdentifier(valueAlias(spec));
  const bucketed = `SELECT DATE_TRUNC('${spec.granularity}', ${dateCol}) AS period, ${aggregateExpression(spec.aggregate, spec.valueColumn)} AS ${alias}\nFROM ${table}\nGROUP BY 1`;

  if (spec.movingAverageWindow === undefined) {
    return `${bucketed}\nORDER BY period`;
  }

  const maAlias = quoteIdentifier(movingAverageAlias(spec.movingAverageWindow));
  return (
    `WITH periods AS (\n${bucketed}\n)\n` +
    `SELECT period, ${alias}, AVG(${alias}) OVER (ORDER BY period ROWS BETWEEN ${spec.movingAverageWindow - 1} PRECEDING AND CURRENT ROW) AS ${maAlias}\n` +
    `FROM periods\n` +
    `ORDER BY period`
  );
}

/** The two most recent periods present in the data — "latest vs prior", not literally the calendar's current month (a bundled sample's date range rarely reaches today). */
export function buildPeriodComparisonSql(spec: PeriodComparisonSpec): string {
  const table = quoteIdentifier(spec.table);
  const dateCol = quoteIdentifier(spec.dateColumn);
  const alias = quoteIdentifier(valueAlias(spec));
  return (
    `SELECT period, ${alias}\n` +
    `FROM (\n` +
    `  SELECT DATE_TRUNC('${spec.granularity}', ${dateCol}) AS period, ${aggregateExpression(spec.aggregate, spec.valueColumn)} AS ${alias}\n` +
    `  FROM ${table}\n` +
    `  GROUP BY 1\n` +
    `) t\n` +
    `ORDER BY period DESC\n` +
    `LIMIT 2`
  );
}

/** Day-of-week (0=Sunday) × hour-of-day grid, one cell per combination present in the data. */
export function buildSeasonalitySql(spec: SeasonalitySpec): string {
  const table = quoteIdentifier(spec.table);
  const dateCol = quoteIdentifier(spec.dateColumn);
  const alias = quoteIdentifier(valueAlias(spec));
  return (
    `SELECT EXTRACT(dow FROM ${dateCol}) AS dow, EXTRACT(hour FROM ${dateCol}) AS hour, ${aggregateExpression(spec.aggregate, spec.valueColumn)} AS ${alias}\n` +
    `FROM ${table}\n` +
    `GROUP BY 1, 2\n` +
    `ORDER BY 1, 2`
  );
}

export interface PeriodComparison {
  currentPeriod: string;
  currentValue: number;
  priorPeriod: string | null;
  priorValue: number | null;
  /** `null` when there's no prior period, or the prior value is 0 (percent change is undefined). */
  deltaPct: number | null;
}

/** `buildPeriodComparisonSql`'s two rows (latest first) → a typed comparison, or `null` for an empty result. */
export function parsePeriodComparison(result: QueryResult): PeriodComparison | null {
  const [current, prior] = result.rows;
  if (!current) return null;

  const currentValue = Number(current[1]);
  const priorValue = prior ? Number(prior[1]) : null;
  const deltaPct = priorValue !== null && priorValue !== 0 ? ((currentValue - priorValue) / Math.abs(priorValue)) * 100 : null;

  return {
    currentPeriod: formatDateCell(current[0]),
    currentValue,
    priorPeriod: prior ? formatDateCell(prior[0]) : null,
    priorValue,
    deltaPct,
  };
}

export interface SeasonalityCell {
  dow: number;
  hour: number;
  value: number;
}

/** `buildSeasonalitySql`'s rows → typed cells, `value` coerced to `number` (the engine may return a `bigint` for a `count`/`sum` over integers). */
export function parseSeasonality(result: QueryResult): SeasonalityCell[] {
  return result.rows.map((row) => ({
    dow: Number(row[0]),
    hour: Number(row[1]),
    value: Number(row[2]),
  }));
}
