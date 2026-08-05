// SQL → Chart translator (pure). One result set in, one recommendation out:
// the best-fit chart, a KPI stat, or a fall-back to the tabular grid. This is
// the single detector shared by the SQL playground's auto-chart panel, the
// insight-feed and query-suggestion "open as chart" actions, and (later) the
// AI pipeline's final-result auto-chart step — no forked logic anywhere.
//
// Detection is driven primarily by the returned columns' types, with the
// query text used only as a light hint to tell an aggregated GROUP BY (a bar
// over a category axis) apart from two raw numeric columns (a scatter).
import type { ChartRecommendation, ChartSpec, ChartType, QueryResult } from '../types';
import { formatDateCell } from './columnStats';

type ColumnKind = 'temporal' | 'numeric' | 'other';

// A wider result than this is a table, not a chart — SELECT * degrades cleanly.
const MAX_CHART_COLUMNS = 4;
// Beyond this many categories a bar chart is illegible; degrade to the grid.
const MAX_BAR_CATEGORIES = 50;
// SVG point ceiling for a line/scatter before it degrades to the grid. Interim
// value: the large-series canvas/downsampling threshold is a later charting
// decision, so this stays conservative rather than rendering a janky chart.
// Exported for A6's `create_chart`, which refuses a result past this ceiling
// *before* loading its rows — the alternative being to page 5,000 rows out of
// 100,000 and let the mapper plot the truncation as if it were the series.
export const MAX_PLOTTABLE_ROWS = 5000;
// Cap on measures drawn against one axis, so a wide aggregate stays readable.
const MAX_Y_SERIES = 3;

// The engine reports a result's column types as Arrow type strings
// (`Int64`, `Float64`, `Utf8`, `Date32<DAY>`, `Timestamp<...>`, `Bool`,
// `Decimal<...>`), not DuckDB SQL type names — so these patterns match the
// Arrow spellings first, with the SQL spellings kept for any caller that
// passes DESCRIBE/SUMMARIZE type names instead.
const TEMPORAL_TYPE = /^(DATE|TIMESTAMP|TIME|INTERVAL)/i;
const NUMERIC_TYPE =
  /^(U?INT|U?TINYINT|U?SMALLINT|U?INTEGER|U?BIGINT|U?HUGEINT|FLOAT|DOUBLE|REAL|DECIMAL|NUMERIC|HALF)/i;

export function classifyColumnType(columnType: string): ColumnKind {
  const t = columnType.trim().toUpperCase();
  // Temporal is tested first: INTERVAL and INT share a prefix, and a DATE/TIME
  // must never be mistaken for a number.
  if (TEMPORAL_TYPE.test(t)) return 'temporal';
  if (NUMERIC_TYPE.test(t)) return 'numeric';
  return 'other';
}

function indicesOf(kinds: ColumnKind[], kind: ColumnKind): number[] {
  const out: number[] = [];
  kinds.forEach((k, i) => {
    if (k === kind) out.push(i);
  });
  return out;
}

/** Function-call form or GROUP BY — a bare `max` in a column name won't match. */
function hasAggregate(sql: string): boolean {
  return (
    /\bgroup\s+by\b/i.test(sql) ||
    /\b(count|sum|avg|min|max|median|mode|stddev|stddev_pop|variance|var_pop|corr)\s*\(/i.test(sql)
  );
}

function titleFor(type: ChartType, xField: string, yFields: string[]): string {
  const ys = yFields.join(', ');
  switch (type) {
    case 'time-series':
      return `${ys} over ${xField}`;
    case 'correlation':
      return `${yFields[0]} vs ${xField}`;
    case 'distribution':
      return `Distribution of ${xField}`;
    default:
      return `${ys} by ${xField}`;
  }
}

function formatKpi(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'bigint') return value.toLocaleString();
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return String(value);
}

function chartFor(
  type: ChartType,
  columnNames: string[],
  xIdx: number,
  yIdxs: number[],
  seriesIdx?: number,
): ChartRecommendation {
  const xField = columnNames[xIdx];
  const yFields = yIdxs.map((i) => columnNames[i]);
  const spec: ChartSpec = {
    type,
    title: titleFor(type, xField, yFields),
    xField,
    yFields,
    ...(seriesIdx !== undefined ? { seriesField: columnNames[seriesIdx] } : {}),
  };
  return { kind: 'chart', spec };
}

const gridReason = (reason: string): ChartRecommendation => ({ kind: 'grid', reason });

/**
 * The mapping table, deterministic:
 *  - single numeric scalar        → KPI stat
 *  - one temporal axis + measures → line (time series)
 *  - a category axis + measures   → bar (categorical), few enough categories
 *  - two raw numeric columns      → scatter (correlation)
 *  - anything else / too wide / too many points → the tabular grid
 */
export function recommendChart(result: QueryResult, sql?: string): ChartRecommendation {
  const { columnNames, columnTypes, rows } = result;
  const n = rows.length;
  const cols = columnNames.length;

  if (cols === 0 || n === 0) return gridReason('Empty result — nothing to plot.');

  const kinds = columnTypes.map(classifyColumnType);
  const temporal = indicesOf(kinds, 'temporal');
  const numeric = indicesOf(kinds, 'numeric');
  const other = indicesOf(kinds, 'other');

  // Single aggregate value — a scalar stat, no axes, so outside ChartSpec.
  if (n === 1 && cols === 1 && numeric.length === 1) {
    return { kind: 'kpi', label: columnNames[0], value: formatKpi(rows[0][0]) };
  }

  if (cols > MAX_CHART_COLUMNS) return gridReason('Too many columns to chart — showing the table.');

  const aggregated = sql === undefined ? undefined : hasAggregate(sql);

  // Time series — a single temporal axis carrying one or more measures.
  if (temporal.length === 1 && numeric.length >= 1) {
    if (n > MAX_PLOTTABLE_ROWS) return gridReason('Too many points to plot cleanly — showing the table.');
    return chartFor('time-series', columnNames, temporal[0], numeric.slice(0, MAX_Y_SERIES));
  }

  // Aggregated shape → bar. GROUP BY puts the dimension first even when it is
  // numeric-typed, so the aggregate hint lets a small integer key be the axis.
  if (aggregated === true && n <= MAX_BAR_CATEGORIES) {
    const groupIdx = other.length >= 1 ? other[0] : numeric.length >= 2 ? numeric[0] : -1;
    if (groupIdx >= 0) {
      const measures = numeric.filter((i) => i !== groupIdx).slice(0, MAX_Y_SERIES);
      if (measures.length >= 1) {
        return chartFor('categorical', columnNames, groupIdx, measures, other.length >= 2 ? other[1] : undefined);
      }
    }
  }

  // Category dimension + numeric measure, few enough rows → bar.
  if (other.length >= 1 && numeric.length >= 1 && n <= MAX_BAR_CATEGORIES) {
    return chartFor(
      'categorical',
      columnNames,
      other[0],
      numeric.slice(0, MAX_Y_SERIES),
      other.length >= 2 ? other[1] : undefined,
    );
  }

  // Two raw numeric columns, no grouping dimension → scatter.
  if (numeric.length >= 2 && other.length === 0 && temporal.length === 0) {
    if (n > MAX_PLOTTABLE_ROWS) return gridReason('Too many points to plot cleanly — showing the table.');
    return chartFor('correlation', columnNames, numeric[0], [numeric[1]]);
  }

  return gridReason('No clear chart for this result shape — showing the table.');
}

/** Chart types the picker can offer for this result, in recommendation order. */
export function availableChartTypes(result: QueryResult): ChartType[] {
  const kinds = result.columnTypes.map(classifyColumnType);
  const temporal = indicesOf(kinds, 'temporal').length;
  const numeric = indicesOf(kinds, 'numeric').length;
  const other = indicesOf(kinds, 'other').length;
  const types: ChartType[] = [];
  if (temporal >= 1 && numeric >= 1) types.push('time-series');
  if (numeric >= 1 && (other >= 1 || numeric >= 2)) types.push('categorical');
  if (numeric >= 2) types.push('correlation');
  return types;
}

/** Build a spec for a picker-chosen type from the same result, or null if the shape can't support it. */
export function specForType(result: QueryResult, type: ChartType): ChartSpec | null {
  const { columnNames, columnTypes } = result;
  const kinds = columnTypes.map(classifyColumnType);
  const temporal = indicesOf(kinds, 'temporal');
  const numeric = indicesOf(kinds, 'numeric');
  const other = indicesOf(kinds, 'other');

  switch (type) {
    case 'time-series': {
      if (temporal.length < 1 || numeric.length < 1) return null;
      const rec = chartFor('time-series', columnNames, temporal[0], numeric.slice(0, MAX_Y_SERIES));
      return rec.kind === 'chart' ? rec.spec : null;
    }
    case 'categorical': {
      const groupIdx = other.length >= 1 ? other[0] : numeric.length >= 2 ? numeric[0] : -1;
      if (groupIdx < 0) return null;
      const measures = numeric.filter((i) => i !== groupIdx).slice(0, MAX_Y_SERIES);
      if (measures.length < 1) return null;
      const rec = chartFor('categorical', columnNames, groupIdx, measures, other.length >= 2 ? other[1] : undefined);
      return rec.kind === 'chart' ? rec.spec : null;
    }
    case 'correlation': {
      if (numeric.length < 2) return null;
      const rec = chartFor('correlation', columnNames, numeric[0], [numeric[1]]);
      return rec.kind === 'chart' ? rec.spec : null;
    }
    default:
      return null;
  }
}

/**
 * Shape a result into the row-object array Recharts consumes: one object per
 * row keyed by column name, numeric cells coerced to numbers and temporal
 * cells (surfaced by the engine as epoch milliseconds) formatted to readable
 * axis labels. Nulls are preserved so the renderer can gap them.
 */
export function buildChart(result: QueryResult, _spec?: ChartSpec): Array<Record<string, unknown>> {
  const { columnNames, columnTypes, rows } = result;
  const kinds = columnTypes.map(classifyColumnType);
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columnNames.forEach((name, i) => {
      const cell = row[i];
      if (cell === null || cell === undefined) {
        obj[name] = null;
      } else if (kinds[i] === 'numeric') {
        const num = typeof cell === 'bigint' ? Number(cell) : Number(cell);
        obj[name] = Number.isFinite(num) ? num : cell;
      } else if (kinds[i] === 'temporal') {
        obj[name] = formatDateCell(cell);
      } else {
        obj[name] = String(cell);
      }
    });
    return obj;
  });
}
