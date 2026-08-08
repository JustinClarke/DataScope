// Contextual query templates + guided task-shaped answers (§10 Module 2, D53)
// derived from each table's classified columns — the "what do I even ask?"
// on-ramp, and the no-SQL floor for a business analyst. Pure: no store, no
// engine access, so every suggestion set is snapshot-testable against a
// hand-built ClassifiedColumn[] fixture with no real DuckDB instance.
//
// Suggestions are generated per table, not over the global multi-table union
// — `evaluateCapabilities` (03-capability-engine) already does exactly the
// column-type tally this needs, so it is reused one table at a time (an
// array of one table never triggers its qualified-name behavior) rather than
// reimplementing the same semantic-type bucketing here.
import type { TableRegistryEntry } from "../types";
import { evaluateCapabilities } from "./capabilities";

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export type TemplateKind =
  | "categorical-numeric"
  | "temporal-numeric-trend"
  | "temporal-numeric-moving-avg"
  | "correlation"
  | "categorical-breakdown"
  | "textual-search"
  | "preview";

export interface QuerySuggestion {
  id: string;
  kind: TemplateKind;
  label: string;
  sql: string;
  /** Rendered via the shell's educational-panel pattern, not a native hover tooltip. */
  tooltip: string;
}

export interface TableSuggestions {
  tableId: string;
  tableName: string;
  suggestions: QuerySuggestion[];
}

export type TaskKind =
  | "trend-over-time"
  | "top-n-by-segment"
  | "period-over-period"
  | "outliers"
  | "simple-cohort";

export interface QueryTask {
  id: string;
  kind: TaskKind;
  label: string;
  description: string;
  sql: string;
}

export interface TableTasks {
  tableId: string;
  tableName: string;
  tasks: QueryTask[];
}

const TOOLTIP: Record<TemplateKind, string> = {
  "categorical-numeric":
    "GROUP BY splits your data into buckets; AVG() and COUNT(*) summarize each bucket.",
  "temporal-numeric-trend":
    "DATE_TRUNC buckets each date into a period (here, a month); SUM() totals the numeric column within each bucket, so the row order traces a trend.",
  "temporal-numeric-moving-avg":
    "A window function (OVER ... ROWS BETWEEN) averages each row together with the ones before it, smoothing day-to-day noise into a trend line.",
  correlation:
    "CORR() measures how closely two numeric columns move together, from -1 (opposite) to 1 (in lockstep).",
  "categorical-breakdown":
    "GROUP BY splits your data into buckets; COUNT(*) counts rows in each one, ranked by frequency.",
  "textual-search":
    "ILIKE performs a case-insensitive text search — swap %keyword% for whatever you are looking for.",
  preview:
    "A quick look at the raw rows before writing anything more specific.",
};

/**
 * Column-shaped templates (§10 M2 table) for one table. `dataset` is the
 * table's own registered name, per this item's leaf doc ("multi-table:
 * suggest per-table"); a relationship-aware JOIN template is deliberately
 * out of scope for v0 (leaf doc: "keep v0 simple").
 */
function templatesForTable(table: TableRegistryEntry): QuerySuggestion[] {
  if (!table.columns || table.columns.length === 0) return [];

  const caps = evaluateCapabilities([table]);
  const dataset = quoteIdentifier(table.tableName);
  const [cat] = caps.categoricalColumns;
  const [num, num2] = caps.numericColumns;
  const [date] = caps.dateColumns;
  const [text] = caps.textColumns;

  const suggestions: QuerySuggestion[] = [];

  if (cat && num) {
    suggestions.push({
      id: `${table.id}-categorical-numeric`,
      kind: "categorical-numeric",
      label: `Average ${num} by ${cat}`,
      sql: `SELECT ${quoteIdentifier(cat)}, AVG(${quoteIdentifier(num)}), COUNT(*) FROM ${dataset} GROUP BY 1 ORDER BY 2 DESC`,
      tooltip: TOOLTIP["categorical-numeric"],
    });
  }

  if (date && num) {
    suggestions.push({
      id: `${table.id}-temporal-numeric-trend`,
      kind: "temporal-numeric-trend",
      label: `${num} by month`,
      sql: `SELECT DATE_TRUNC('month', ${quoteIdentifier(date)}) as period, SUM(${quoteIdentifier(num)}) FROM ${dataset} GROUP BY 1 ORDER BY 1`,
      tooltip: TOOLTIP["temporal-numeric-trend"],
    });
    suggestions.push({
      id: `${table.id}-temporal-numeric-moving-avg`,
      kind: "temporal-numeric-moving-avg",
      label: `${num} moving average`,
      sql: `SELECT ${quoteIdentifier(date)}, ${quoteIdentifier(num)}, AVG(${quoteIdentifier(num)}) OVER(ORDER BY ${quoteIdentifier(date)} ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as moving_avg FROM ${dataset}`,
      tooltip: TOOLTIP["temporal-numeric-moving-avg"],
    });
  }

  if (num && num2) {
    suggestions.push({
      id: `${table.id}-correlation`,
      kind: "correlation",
      label: `Correlation: ${num} vs ${num2}`,
      sql: `SELECT CORR(${quoteIdentifier(num)}, ${quoteIdentifier(num2)}) as correlation FROM ${dataset}`,
      tooltip: TOOLTIP.correlation,
    });
  }

  if (cat) {
    suggestions.push({
      id: `${table.id}-categorical-breakdown`,
      kind: "categorical-breakdown",
      label: `${cat} frequency`,
      sql: `SELECT ${quoteIdentifier(cat)}, COUNT(*) as freq FROM ${dataset} GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
      tooltip: TOOLTIP["categorical-breakdown"],
    });
  }

  if (text) {
    suggestions.push({
      id: `${table.id}-textual-search`,
      kind: "textual-search",
      label: `Search ${text}`,
      sql: `SELECT ${quoteIdentifier(text)} FROM ${dataset} WHERE ${quoteIdentifier(text)} ILIKE '%keyword%' LIMIT 50`,
      tooltip: TOOLTIP["textual-search"],
    });
  }

  suggestions.push({
    id: `${table.id}-preview`,
    kind: "preview",
    label: "Preview rows",
    sql: `SELECT * FROM ${dataset} LIMIT 100`,
    tooltip: TOOLTIP.preview,
  });

  return suggestions;
}

/** Column-shaped templates for every classified table, grouped per table. */
export function buildTemplateSuggestions(
  tables: TableRegistryEntry[],
): TableSuggestions[] {
  return tables
    .filter((table) => table.columns && table.columns.length > 0)
    .map((table) => ({
      tableId: table.id,
      tableName: table.tableName,
      suggestions: templatesForTable(table),
    }));
}

/**
 * Guided task-shaped answers (D53) for one table — analyst tasks in plain
 * language, each a parameterized, deterministic (no-LLM) query. A task
 * appears only when the classified columns it needs are present, matching
 * the leaf doc's named example ("period-over-period requires a Temporal +
 * Quantitative pair"). The chart half of "query + auto-chart" is wired at
 * the UI layer, disabled pending 04-chart-translator (unbuilt) — the same
 * gap and the same disabled-with-reason convention InsightFeed already
 * established for its own "Open as chart" action.
 */
function tasksForTable(table: TableRegistryEntry): QueryTask[] {
  if (!table.columns || table.columns.length === 0) return [];

  const caps = evaluateCapabilities([table]);
  const dataset = quoteIdentifier(table.tableName);
  const [cat] = caps.categoricalColumns;
  const [num] = caps.numericColumns;
  const [date] = caps.dateColumns;
  const [id] = caps.identifierColumns;

  const tasks: QueryTask[] = [];

  if (date && num) {
    const dateCol = quoteIdentifier(date);
    const numCol = quoteIdentifier(num);

    tasks.push({
      id: `${table.id}-trend-over-time`,
      kind: "trend-over-time",
      label: "Trend over time",
      description: `How has ${num} moved over time, bucketed by month?`,
      sql: `SELECT DATE_TRUNC('month', ${dateCol}) AS period, SUM(${numCol}) AS total FROM ${dataset} GROUP BY 1 ORDER BY 1`,
    });

    tasks.push({
      id: `${table.id}-period-over-period`,
      kind: "period-over-period",
      label: "This period vs last",
      description: `How does the latest month's ${num} compare to the month before it?`,
      sql: `WITH by_period AS (
  SELECT DATE_TRUNC('month', ${dateCol}) AS period, SUM(${numCol}) AS total
  FROM ${dataset}
  GROUP BY 1
)
SELECT period, total, LAG(total) OVER (ORDER BY period) AS previous_period,
  total - LAG(total) OVER (ORDER BY period) AS change
FROM by_period
ORDER BY period DESC
LIMIT 2`,
    });
  }

  if (cat) {
    const catCol = quoteIdentifier(cat);
    const metric = num ? `SUM(${quoteIdentifier(num)})` : "COUNT(*)";
    tasks.push({
      id: `${table.id}-top-n-by-segment`,
      kind: "top-n-by-segment",
      label: "Top-N by segment",
      description: num
        ? `Which ${cat} values have the highest total ${num}?`
        : `Which ${cat} values occur most often?`,
      sql: `SELECT ${catCol}, ${metric} AS value FROM ${dataset} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    });
  }

  if (num) {
    const numCol = quoteIdentifier(num);
    tasks.push({
      id: `${table.id}-outliers`,
      kind: "outliers",
      label: "Outliers",
      description: `Which rows have a ${num} more than 3 standard deviations from the mean?`,
      sql: `WITH stats AS (
  SELECT AVG(${numCol}) AS mean, STDDEV(${numCol}) AS sd FROM ${dataset}
)
SELECT ${dataset}.*, (${numCol} - stats.mean) / NULLIF(stats.sd, 0) AS z_score
FROM ${dataset}, stats
WHERE ABS((${numCol} - stats.mean) / NULLIF(stats.sd, 0)) > 3
ORDER BY z_score DESC
LIMIT 50`,
    });
  }

  if (id && date) {
    const idCol = quoteIdentifier(id);
    const dateCol = quoteIdentifier(date);
    tasks.push({
      id: `${table.id}-simple-cohort`,
      kind: "simple-cohort",
      label: "Simple cohort",
      description: `How many distinct ${id} first appear in each month of ${date}?`,
      sql: `SELECT DATE_TRUNC('month', ${dateCol}) AS cohort_month, COUNT(DISTINCT ${idCol}) AS cohort_size FROM ${dataset} GROUP BY 1 ORDER BY 1`,
    });
  }

  return tasks;
}

/** Guided task-shaped answers for every classified table, grouped per table. */
export function buildTaskSuggestions(
  tables: TableRegistryEntry[],
): TableTasks[] {
  return tables
    .filter((table) => table.columns && table.columns.length > 0)
    .map((table) => ({
      tableId: table.id,
      tableName: table.tableName,
      tasks: tasksForTable(table),
    }));
}
