// The operation catalog (A0, master §11.5, D74).
//
// Flat and verb-named, because small models degrade as the tool list grows and
// every entry has to earn its slot. A0 ships the spine — the entries that are
// a re-shaping of `src/lib/*` behind one door rather than new computation.
// A1 adds the eight that do not exist yet; A3 adds the derive verbs.
//
// Two shapes of operation, and the split is not arbitrary:
//
//   - **App-authored schema** (`get_schema`, `describe_table`, `column_stats`,
//     `correlate`) — this file knows the columns it returns, the result is
//     small and bounded, so it comes back inline and complete with no result
//     handle. Nothing to page.
//   - **Caller-shaped rows** (`sample_rows`, `run_sql`) — the columns are
//     whatever the data has, so the result is materialized once, its types are
//     read from DuckDB's catalog, and it is paged from that materialization.
//
// `read_result` reads back either a page or, once compaction has taken the
// body, the receipt.
import { quoteIdentifier, quoteLiteral } from '../../services/ingestion';
import { classifyStatement } from '../statementClass';
import { buildCorrelationMatrixSql, correlationPairs } from '../correlationSql';
import { buildDuplicatesProbe } from '../insights';
import {
  buildContainmentSql,
  buildParentKeySql,
  comparisonModeFor,
  KEY_UNIQUENESS_MIN,
  nameAgrees,
  parseContainmentSql,
  parseParentKeySql,
  scoreCandidate,
  type FkCandidate,
} from '../relationshipInference';
import { dedupeTableName, sanitizeTableName } from '../../features/ingestion/formatPolicy';
import {
  availableChartTypes,
  MAX_PLOTTABLE_ROWS,
  recommendChart,
  specForType,
} from '../chartMapper';
import { chartSpecValidator } from '../producerValidators';
import type { ChartSpec, ChartType, QueryResult } from '../../types';
import { engineError, invalidEnum, opError } from './errors';
import { findReferencedObjects, lineageNote, lineageOf } from './lineage';
import { ResultTooLargeError, type ResultStore } from './resultStore';
import { isOpError, type Catalog, type CatalogObject, type Executor, type OpError, type OpOutcome, type OpResult, type OpSchemaField, type Workspace } from './types';

export const DEFAULT_PREVIEW_ROWS = 100;
export const MAX_PREVIEW_ROWS = 1000;
export const DEFAULT_SAMPLE_ROWS = 20;

export type SearchMode = 'exact' | 'prefix' | 'contains' | 'ci_contains';
export type DistinctValuesOrder = 'count_desc' | 'count_asc' | 'value_asc' | 'value_desc';
export type TextUnit = 'word' | 'bigram' | 'trigram';
export type TimeSeriesGrain = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type MetricFn = 'count_rows' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'sum_product';
export interface MetricSpec {
  fn: MetricFn;
  column?: string;
  /** `sum_product` only — exactly two columns to multiply then sum. */
  columns?: string[];
  alias?: string;
}

/** Typed parameters per operation — the call-site contract. Handlers still validate, because a model's arguments are untrusted input. */
export interface OperationParams {
  get_schema: { table?: string };
  describe_table: { table: string };
  data_quality: { table?: string };
  column_stats: { table: string; column: string };
  sample_rows: { table: string; limit?: number };
  correlate: { table: string; columns?: string[] };
  run_sql: { sql: string; limit?: number };
  validate_sql: { sql: string };
  search_values: { term: string; tables?: string[]; columns?: string[]; mode?: SearchMode };
  distinct_values: { table: string; column: string; limit?: number; order?: DistinctValuesOrder; where?: string };
  text_frequency: {
    table: string;
    column: string;
    where?: string;
    unit?: TextUnit;
    top?: number;
    minLength?: number;
    stopwords?: string[];
  };
  time_series: {
    from: string;
    join?: string;
    dateColumn: string;
    grain: TimeSeriesGrain;
    metrics: MetricSpec[];
    where?: string;
  };
  join_coverage: { left: string; right: string; on?: { leftColumn: string; rightColumn: string } };
  aggregate: {
    from: string;
    join?: string;
    metrics: MetricSpec[];
    groupBy?: string[];
    where?: string;
    having?: string;
    order?: string;
    limit?: number;
  };
  derive_table: { name: string; sql: string };
  create_view: { name: string; sql: string };
  drop_derived: { name: string };
  read_result: { resultId: string; offset?: number; limit?: number; columns?: string[] };
  create_chart: { resultId?: string; sql?: string; type?: ChartType; spec?: ChartSpec };
  pin_result: { resultId: string; title: string };
}

export type OpName = keyof OperationParams;

export interface OpContext {
  executor: Executor;
  store: ResultStore;
  signal?: AbortSignal;
  /** Absent on a read-only core; the three derive operations refuse rather than half-work. See `types.ts`. */
  catalog?: Catalog;
  /** Absent on a headless core; `pin_result` refuses rather than half-working. See `types.ts`. */
  workspace?: Workspace;
}

type Handler = (params: Record<string, unknown>, ctx: OpContext) => Promise<OpOutcome>;

// ---- parameter validation ----

function requireString(params: Record<string, unknown>, key: string): string | OpError {
  const value = params[key];
  if (typeof value !== 'string' || value.trim() === '') {
    return opError('invalid_argument', `${key} is required and must be a non-empty string.`);
  }
  return value;
}

function boundedInt(
  params: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number | OpError {
  const value = params[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return opError('invalid_argument', `${key} must be an integer between ${min} and ${max}.`, `${min}–${max}`);
  }
  return value;
}

function isError(value: unknown): value is OpError {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false;
}

// ---- catalog lookups (shared by several operations) ----

/** Levenshtein distance, capped by early exit — the mechanical basis for a nearest-name hint. */
function distance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = previous[j]!;
      previous[j] = next;
    }
  }
  return previous[b.length]!;
}

function nearest(name: string, candidates: string[]): string | undefined {
  const lowered = name.toLowerCase();
  let best: { name: string; score: number } | undefined;
  for (const candidate of candidates) {
    const score = distance(lowered, candidate.toLowerCase());
    if (!best || score < best.score) best = { name: candidate, score };
  }
  // Half the name's length is the point past which "nearest" stops meaning
  // anything — better no hint than a confidently wrong one.
  return best && best.score <= Math.max(2, Math.ceil(name.length / 2)) ? best.name : undefined;
}

/** Non-temp tables and views only: the store's own materializations live in the `temp` catalog and are never part of the schema a caller sees. */
const USER_COLUMNS_SQL =
  `SELECT table_name, column_name, data_type FROM information_schema.columns ` +
  `WHERE table_catalog = current_database() ORDER BY table_name, ordinal_position`;

interface CatalogColumn {
  table: string;
  column: string;
  type: string;
}

async function readCatalog(ctx: OpContext): Promise<{ columns: CatalogColumn[]; elapsedMs: number }> {
  const result = await ctx.executor.execute(USER_COLUMNS_SQL, ctx.signal);
  return {
    columns: result.rows.map((row) => ({
      table: String(row[0]),
      column: String(row[1]),
      type: String(row[2]),
    })),
    elapsedMs: result.elapsedMs,
  };
}

function unknownTable(table: string, known: string[]): OpError {
  return opError('unknown_object', `No table or view named ${table}.`, nearest(table, known));
}

// ---- envelope helpers ----

function inlineResult(
  op: string,
  sql: string | null,
  schema: OpSchemaField[],
  rows: unknown[][],
  elapsedMs: number,
  note?: string,
): OpResult {
  return {
    op,
    sql,
    resultId: null,
    schema,
    rowCount: rows.length,
    rows,
    complete: true,
    nextOffset: null,
    elapsedMs,
    ...(note === undefined ? {} : { note }),
  };
}

/** Materialize once, then hand back the first page of that materialization. */
async function materializedResult(
  op: string,
  sql: string,
  previewRows: number,
  ctx: OpContext,
  priorElapsedMs = 0,
): Promise<OpOutcome> {
  let receipt;
  let elapsedMs = priorElapsedMs;
  try {
    const materialized = await ctx.store.materialize(op, sql, ctx.signal);
    receipt = materialized.entry;
    elapsedMs += materialized.elapsedMs;
  } catch (error) {
    if (error instanceof ResultTooLargeError) {
      return opError('result_too_large', error.message);
    }
    return engineError(error, ctx.signal, { wrapped: true });
  }

  const page = await ctx.store.page(receipt.id, 0, previewRows, ctx.signal);
  elapsedMs += page?.elapsedMs ?? 0;
  return {
    op,
    sql,
    resultId: receipt.id,
    schema: receipt.schema,
    rowCount: receipt.rowCount,
    rows: page?.rows ?? [],
    complete: (page?.rows.length ?? 0) >= receipt.rowCount,
    nextOffset: page?.nextOffset ?? null,
    elapsedMs,
  };
}

// ---- the operations ----

const get_schema: Handler = async (params, ctx) => {
  const table = params.table;
  if (table !== undefined && typeof table !== 'string') {
    return opError('invalid_argument', 'table must be a string when provided.');
  }
  let catalog;
  try {
    catalog = await readCatalog(ctx);
  } catch (error) {
    return engineError(error, ctx.signal);
  }
  const tables = [...new Set(catalog.columns.map((c) => c.table))];
  const selected = table === undefined ? catalog.columns : catalog.columns.filter((c) => c.table === table);
  if (table !== undefined && selected.length === 0) return unknownTable(table, tables);

  return inlineResult(
    'get_schema',
    USER_COLUMNS_SQL,
    [
      { name: 'table_name', type: 'VARCHAR' },
      { name: 'column_name', type: 'VARCHAR' },
      { name: 'data_type', type: 'VARCHAR' },
    ],
    selected.map((c) => [c.table, c.column, c.type]),
    catalog.elapsedMs,
    `${new Set(selected.map((c) => c.table)).size} table(s), ${selected.length} column(s).`,
  );
};

/**
 * `SUMMARIZE`'s own column set is version-dependent and mixed-typed, so this
 * goes through the materialization path rather than declaring a schema this
 * file would have to keep in step with DuckDB — the catalog reports the types,
 * exactly and identically on both engines.
 */
const describe_table: Handler = async (params, ctx) => {
  const table = requireString(params, 'table');
  if (isError(table)) return table;
  const outcome = await materializedResult('describe_table', `SUMMARIZE ${quoteIdentifier(table)}`, DEFAULT_PREVIEW_ROWS, ctx);

  // A3's lineage answer, and the reason there is no seventeenth operation for
  // it: "what did this come from, and what depends on it" is a question about
  // an object, and this is the operation that describes an object. A source
  // table has neither, so its envelope is unchanged.
  if (!ctx.catalog || isOpError(outcome)) return outcome;
  const note = lineageNote(lineageOf(table, await ctx.catalog.objects()));
  return note ? { ...outcome, note } : outcome;
};

// ---- data_quality ----

/** Matches `services/dataQuality.ts`'s null-pattern threshold (S2) — recomputed from a live aggregate rather than shared code, since the core has no access to the app's stored `ClassifiedColumn`s. */
const NULL_PATTERN_THRESHOLD_PCT = 5;

const DATA_QUALITY_SCHEMA: OpSchemaField[] = [
  { name: 'rule', type: 'VARCHAR' },
  { name: 'table_name', type: 'VARCHAR' },
  { name: 'column_name', type: 'VARCHAR' },
  { name: 'description', type: 'VARCHAR' },
  { name: 'sql', type: 'VARCHAR' },
];

/**
 * The third orient operation (D74), closing the gap A5 left open: a service
 * existed (`services/dataQuality.ts`) but no catalog handler, because adding
 * one inside a transport phase would have hidden it. Rather than share that
 * service directly — it takes `TableRegistryEntry[]` with the app's
 * precomputed classification and reaches a browser-only engine singleton,
 * neither of which the core has — this recomputes the same three rules
 * (`nullPatternCandidates`, `zeroVarianceCandidates`, `buildDuplicatesProbe`,
 * all from `lib/insights.ts`) from live aggregates over the executor, so the
 * same operation runs on either engine.
 *
 * One batched query answers null-pattern and zero-variance for every column
 * in scope — `search_values`'s "one UNION ALL rather than a probe per column"
 * precedent — and one query per target table answers duplicates, reusing
 * `buildDuplicatesProbe`'s own SQL exactly rather than a second copy of it.
 */
const data_quality: Handler = async (params, ctx) => {
  const table = params.table;
  if (table !== undefined && typeof table !== 'string') {
    return opError('invalid_argument', 'table must be a string when provided.');
  }
  let catalog;
  try {
    catalog = await readCatalog(ctx);
  } catch (error) {
    return engineError(error, ctx.signal);
  }
  const knownTables = [...new Set(catalog.columns.map((c) => c.table))];
  if (table !== undefined && !knownTables.includes(table)) return unknownTable(table, knownTables);
  const targetTables = table !== undefined ? [table] : knownTables;
  const targetColumns = catalog.columns.filter((c) => targetTables.includes(c.table));

  if (targetColumns.length === 0) {
    return inlineResult('data_quality', null, DATA_QUALITY_SCHEMA, [], catalog.elapsedMs, 'No columns to check.');
  }

  const columnStatsSql =
    targetColumns
      .map(
        (c) =>
          `SELECT ${quoteLiteral(c.table)} AS tbl, ${quoteLiteral(c.column)} AS col, count(*) AS row_count, ` +
          `count(*) - count(${quoteIdentifier(c.column)}) AS nulls, count(DISTINCT ${quoteIdentifier(c.column)}) AS distinct_count ` +
          `FROM ${quoteIdentifier(c.table)}`,
      )
      .join('\nUNION ALL\n') + '\nORDER BY tbl, col';

  try {
    const [columnStatsResult, ...duplicatesResults] = await Promise.all([
      ctx.executor.execute(columnStatsSql, ctx.signal),
      // rowCount only feeds `.describe()`, which this handler does not call.
      ...targetTables.map((t) => ctx.executor.execute(buildDuplicatesProbe(t, 0).sql, ctx.signal)),
    ]);

    const findings: Array<[string, string, string | null, string, string]> = [];
    for (const [tbl, col, rowCount, nulls, distinctCount] of columnStatsResult.rows) {
      const tableName = String(tbl);
      const columnName = String(col);
      const total = Number(rowCount);
      const nullPct = total > 0 ? (Number(nulls) / total) * 100 : 0;
      const distinct = Number(distinctCount);
      const quotedCol = quoteIdentifier(columnName);
      const quotedTable = quoteIdentifier(tableName);
      if (nullPct > NULL_PATTERN_THRESHOLD_PCT) {
        findings.push([
          'null-pattern',
          tableName,
          columnName,
          `Missing values concentrated in ${tableName}.${columnName} (${nullPct.toFixed(1)}% null).`,
          `SELECT COUNT(*) FILTER (WHERE ${quotedCol} IS NULL) AS null_count, COUNT(*) AS total FROM ${quotedTable}`,
        ]);
      }
      if (total > 1 && distinct === 1) {
        findings.push([
          'zero-variance',
          tableName,
          columnName,
          `${tableName}.${columnName} holds a single repeated value across all ${total.toLocaleString()} rows — zero variance.`,
          `SELECT COUNT(DISTINCT ${quotedCol}) AS distinct_count, COUNT(*) AS total FROM ${quotedTable}`,
        ]);
      }
    }
    targetTables.forEach((tableName, i) => {
      const row = duplicatesResults[i]!.rows[0];
      if (!row) return;
      const duplicates = Number(row[0] ?? 0) - Number(row[1] ?? 0);
      if (duplicates <= 0) return;
      findings.push([
        'duplicates',
        tableName,
        null,
        `${duplicates.toLocaleString()} fully duplicated row${duplicates === 1 ? '' : 's'} detected in ${tableName}.`,
        buildDuplicatesProbe(tableName, 0).sql,
      ]);
    });

    const elapsedMs =
      catalog.elapsedMs + columnStatsResult.elapsedMs + duplicatesResults.reduce((sum, r) => sum + r.elapsedMs, 0);
    return inlineResult(
      'data_quality',
      columnStatsSql,
      DATA_QUALITY_SCHEMA,
      findings,
      elapsedMs,
      `${findings.length} finding(s) across ${targetTables.length} table(s).`,
    );
  } catch (error) {
    return engineError(error, ctx.signal, { wrapped: true });
  }
};

/**
 * One statement, so the number the caller sees and the SQL they can re-run are
 * the same thing. The aggregate set depends on the column's declared type,
 * which is read from the catalog first — that read is also what turns a
 * mistyped column into `unknown_object` with a nearest-name hint instead of a
 * bare binder error.
 */
const NUMERIC_TYPES = /^(TINY|SMALL|BIG|HUGE|U?TINY|U?SMALL|U?BIG|U?HUGE)?INT|^INTEGER|^UINTEGER|^DECIMAL|^NUMERIC|^FLOAT|^DOUBLE|^REAL/;
const TEMPORAL_TYPES = /^(DATE|TIME|TIMESTAMP)/;

const column_stats: Handler = async (params, ctx) => {
  const table = requireString(params, 'table');
  if (isError(table)) return table;
  const column = requireString(params, 'column');
  if (isError(column)) return column;

  let catalog;
  try {
    catalog = await readCatalog(ctx);
  } catch (error) {
    return engineError(error, ctx.signal);
  }
  const tables = [...new Set(catalog.columns.map((c) => c.table))];
  const inTable = catalog.columns.filter((c) => c.table === table);
  if (inTable.length === 0) return unknownTable(table, tables);
  const found = inTable.find((c) => c.column === column);
  if (!found) {
    return opError(
      'unknown_object',
      `No column named ${column} in ${table}.`,
      nearest(column, inTable.map((c) => c.column)),
    );
  }

  const col = quoteIdentifier(column);
  const from = `FROM ${quoteIdentifier(table)}`;
  const common =
    `count(*) AS row_count, count(${col}) AS non_null, count(*) - count(${col}) AS nulls, ` +
    `count(DISTINCT ${col}) AS distinct_count`;

  // Every aggregate is cast to the type this file declares, so the schema is
  // literally true rather than approximately true — DuckDB otherwise widens
  // `avg`/`quantile_cont` over a DECIMAL column back to DECIMAL.
  let projection: string;
  let schema: OpSchemaField[];
  const type = found.type.toUpperCase();
  if (NUMERIC_TYPES.test(type)) {
    projection =
      `${common}, CAST(min(${col}) AS DOUBLE) AS min, CAST(max(${col}) AS DOUBLE) AS max, ` +
      `CAST(avg(${col}) AS DOUBLE) AS mean, CAST(stddev_samp(${col}) AS DOUBLE) AS stddev, ` +
      `CAST(quantile_cont(${col}, 0.25) AS DOUBLE) AS q1, CAST(quantile_cont(${col}, 0.5) AS DOUBLE) AS median, ` +
      `CAST(quantile_cont(${col}, 0.75) AS DOUBLE) AS q3`;
    schema = statsSchema([
      ['min', 'DOUBLE'],
      ['max', 'DOUBLE'],
      ['mean', 'DOUBLE'],
      ['stddev', 'DOUBLE'],
      ['q1', 'DOUBLE'],
      ['median', 'DOUBLE'],
      ['q3', 'DOUBLE'],
    ]);
  } else if (TEMPORAL_TYPES.test(type)) {
    projection = `${common}, CAST(min(${col}) AS VARCHAR) AS min, CAST(max(${col}) AS VARCHAR) AS max`;
    schema = statsSchema([
      ['min', 'VARCHAR'],
      ['max', 'VARCHAR'],
    ]);
  } else if (type === 'BOOLEAN') {
    // Counts are the whole story for a boolean; the string-length statistics
    // the text branch would produce measure "true"/"false", not the data.
    projection = common;
    schema = statsSchema([]);
  } else {
    const text = `length(CAST(${col} AS VARCHAR))`;
    projection =
      `${common}, min(${text}) AS min_length, max(${text}) AS max_length, ` +
      `CAST(avg(${text}) AS DOUBLE) AS mean_length`;
    schema = statsSchema([
      ['min_length', 'BIGINT'],
      ['max_length', 'BIGINT'],
      ['mean_length', 'DOUBLE'],
    ]);
  }

  const sql = `SELECT ${projection} ${from}`;
  try {
    const result = await ctx.executor.execute(sql, ctx.signal);
    return inlineResult('column_stats', sql, schema, result.rows, catalog.elapsedMs + result.elapsedMs, found.type);
  } catch (error) {
    return engineError(error, ctx.signal);
  }
};

function statsSchema(extra: Array<[string, string]>): OpSchemaField[] {
  return [
    { name: 'row_count', type: 'BIGINT' },
    { name: 'non_null', type: 'BIGINT' },
    { name: 'nulls', type: 'BIGINT' },
    { name: 'distinct_count', type: 'BIGINT' },
    ...extra.map(([name, type]) => ({ name, type })),
  ];
}

const sample_rows: Handler = async (params, ctx) => {
  const table = requireString(params, 'table');
  if (isError(table)) return table;
  const limit = boundedInt(params, 'limit', DEFAULT_SAMPLE_ROWS, 1, MAX_PREVIEW_ROWS);
  if (isError(limit)) return limit;

  const sql = `SELECT * FROM ${quoteIdentifier(table)} LIMIT ${limit}`;
  return materializedResult('sample_rows', sql, limit, ctx);
};

/**
 * Every numeric pair in one batched statement (`lib/correlationSql.ts`), then
 * flattened to one row per pair — a long shape rather than a matrix, because
 * that is what both a grid and a model read without a second convention.
 */
const correlate: Handler = async (params, ctx) => {
  const table = requireString(params, 'table');
  if (isError(table)) return table;
  const requested = params.columns;
  if (requested !== undefined && (!Array.isArray(requested) || requested.some((c) => typeof c !== 'string'))) {
    return opError('invalid_argument', 'columns must be an array of column names when provided.');
  }

  let catalog;
  try {
    catalog = await readCatalog(ctx);
  } catch (error) {
    return engineError(error, ctx.signal);
  }
  const tables = [...new Set(catalog.columns.map((c) => c.table))];
  const inTable = catalog.columns.filter((c) => c.table === table);
  if (inTable.length === 0) return unknownTable(table, tables);

  const numeric = inTable.filter((c) => NUMERIC_TYPES.test(c.type.toUpperCase())).map((c) => c.column);
  const columns = (requested as string[] | undefined) ?? numeric;
  const unknownColumn = columns.find((c) => !inTable.some((entry) => entry.column === c));
  if (unknownColumn !== undefined) {
    return opError(
      'unknown_object',
      `No column named ${unknownColumn} in ${table}.`,
      nearest(unknownColumn, inTable.map((c) => c.column)),
    );
  }
  if (columns.length < 2) {
    return opError(
      'invalid_argument',
      `correlate needs at least two numeric columns; ${table} offers ${numeric.length}.`,
      numeric.join(', '),
    );
  }

  const sql = buildCorrelationMatrixSql(table, columns);
  try {
    const result = await ctx.executor.execute(sql, ctx.signal);
    const pairs = correlationPairs(columns);
    const row = result.rows[0] ?? [];
    return inlineResult(
      'correlate',
      sql,
      [
        { name: 'column_a', type: 'VARCHAR' },
        { name: 'column_b', type: 'VARCHAR' },
        { name: 'correlation', type: 'DOUBLE' },
      ],
      pairs.map(([a, b], i) => [a, b, row[i] ?? null]),
      result.elapsedMs,
    );
  } catch (error) {
    return engineError(error, ctx.signal);
  }
};

// ---- shared metric SQL (aggregate, time_series) ----

const METRIC_FNS: readonly MetricFn[] = ['count_rows', 'count_distinct', 'sum', 'avg', 'min', 'max', 'median', 'sum_product'];
const METRIC_FN_SQL: Partial<Record<MetricFn, string>> = { sum: 'SUM', avg: 'AVG', min: 'MIN', max: 'MAX', median: 'median' };

/** Mirrors `pivotCompiler.ts`/`timeSeriesSql.ts`'s own copy — a third, local one rather than a new shared export, matching how those two already duplicate it rather than share it. */
function sanitizeAliasPart(field: string): string {
  return field.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
}

function metricExpression(metric: MetricSpec): string | OpError {
  if (metric.fn === 'count_rows') return 'COUNT(*)';
  if (metric.fn === 'count_distinct') {
    if (!metric.column) return opError('invalid_argument', 'count_distinct requires column.');
    return `COUNT(DISTINCT ${quoteIdentifier(metric.column)})`;
  }
  if (metric.fn === 'sum_product') {
    if (!metric.columns || metric.columns.length !== 2) {
      return opError('invalid_argument', 'sum_product requires columns with exactly two entries.');
    }
    return `SUM(${quoteIdentifier(metric.columns[0]!)} * ${quoteIdentifier(metric.columns[1]!)})`;
  }
  if (!metric.column) return opError('invalid_argument', `${metric.fn} requires column.`);
  return `${METRIC_FN_SQL[metric.fn]}(${quoteIdentifier(metric.column)})`;
}

function metricAlias(metric: MetricSpec, index: number, seen: Set<string>): string {
  const base = metric.alias ?? `${metric.fn}_${sanitizeAliasPart(metric.column ?? metric.columns?.join('_') ?? String(index))}`;
  let alias = base;
  let suffix = 2;
  while (seen.has(alias)) {
    alias = `${base}_${suffix}`;
    suffix += 1;
  }
  seen.add(alias);
  return alias;
}

function parseMetric(raw: unknown): MetricSpec | OpError {
  if (typeof raw !== 'object' || raw === null) return opError('invalid_argument', 'Each metric must be an object.');
  const { fn, column, columns, alias } = raw as Record<string, unknown>;
  if (typeof fn !== 'string' || !METRIC_FNS.includes(fn as MetricFn)) return invalidEnum('metrics[].fn', fn, METRIC_FNS);
  if (column !== undefined && typeof column !== 'string') return opError('invalid_argument', 'metrics[].column must be a string.');
  if (columns !== undefined && (!Array.isArray(columns) || columns.some((c) => typeof c !== 'string'))) {
    return opError('invalid_argument', 'metrics[].columns must be an array of strings.');
  }
  if (alias !== undefined && typeof alias !== 'string') return opError('invalid_argument', 'metrics[].alias must be a string.');
  return { fn: fn as MetricFn, column: column as string | undefined, columns: columns as string[] | undefined, alias: alias as string | undefined };
}

/** Parses and expression-compiles a caller's `metrics` array in one pass, deduping aliases the way `pivotCompiler.pivotOutputColumns` does. */
function parseMetrics(raw: unknown): { specs: MetricSpec[]; exprs: string[]; aliases: string[] } | OpError {
  if (!Array.isArray(raw) || raw.length === 0) return opError('invalid_argument', 'metrics must be a non-empty array.');
  const specs: MetricSpec[] = [];
  for (const item of raw) {
    const parsed = parseMetric(item);
    if (isError(parsed)) return parsed;
    specs.push(parsed);
  }
  const exprs: string[] = [];
  for (const spec of specs) {
    const expr = metricExpression(spec);
    if (isError(expr)) return expr;
    exprs.push(expr);
  }
  const seen = new Set<string>();
  const aliases = specs.map((spec, i) => metricAlias(spec, i, seen));
  return { specs, exprs, aliases };
}

// ---- validate_sql ----

const VALIDATE_SQL_SCHEMA: OpSchemaField[] = [
  { name: 'ok', type: 'BOOLEAN' },
  { name: 'statement_class', type: 'VARCHAR' },
  { name: 'referenced_objects', type: 'VARCHAR[]' },
  { name: 'plan', type: 'VARCHAR' },
  { name: 'error', type: 'VARCHAR' },
];

/**
 * The dry-run path the catalog otherwise lacks. `EXPLAIN` plans a statement
 * without running its body — no execution, no result slot — so a caller can
 * check any statement (not just a `SELECT`) before spending a real run.
 */
const validate_sql: Handler = async (params, ctx) => {
  const sql = requireString(params, 'sql');
  if (isError(sql)) return sql;

  const statement = classifyStatement(sql);
  let catalog;
  try {
    catalog = await readCatalog(ctx);
  } catch (error) {
    return engineError(error, ctx.signal);
  }
  const tables = [...new Set(catalog.columns.map((c) => c.table))];
  const referencedObjects = findReferencedObjects(statement.sql, tables);
  const explainSql = `EXPLAIN ${statement.sql}`;

  try {
    const result = await ctx.executor.execute(explainSql, ctx.signal);
    const plan = result.rows.map((row) => String(row[row.length - 1])).join('\n');
    return inlineResult(
      'validate_sql',
      explainSql,
      VALIDATE_SQL_SCHEMA,
      [[true, statement.class, referencedObjects, plan, null]],
      catalog.elapsedMs + result.elapsedMs,
    );
  } catch (error) {
    const failure = engineError(error, ctx.signal);
    if (failure.code === 'cancelled') return failure;
    const message = failure.hint ? `${failure.message}\n${failure.hint}` : failure.message;
    return inlineResult(
      'validate_sql',
      explainSql,
      VALIDATE_SQL_SCHEMA,
      [[false, statement.class, referencedObjects, null, message]],
      catalog.elapsedMs,
    );
  }
};

// ---- search_values ----

const SEARCH_MODES: readonly SearchMode[] = ['exact', 'prefix', 'contains', 'ci_contains'];
const DEFAULT_SEARCH_MODE: SearchMode = 'ci_contains';

/** Everything except numeric/temporal/boolean — the columns a text literal could plausibly appear in. */
function isTextType(type: string): boolean {
  const t = type.toUpperCase();
  return !NUMERIC_TYPES.test(t) && !TEMPORAL_TYPES.test(t) && t !== 'BOOLEAN';
}

function searchPredicate(colExpr: string, term: string, mode: SearchMode): string {
  const lit = quoteLiteral(term);
  switch (mode) {
    case 'exact':
      return `${colExpr} = ${lit}`;
    case 'prefix':
      return `starts_with(${colExpr}, ${lit})`;
    case 'contains':
      return `contains(${colExpr}, ${lit})`;
    case 'ci_contains':
      return `contains(lower(${colExpr}), lower(${lit}))`;
  }
}

const SEARCH_VALUES_SCHEMA: OpSchemaField[] = [
  { name: 'table', type: 'VARCHAR' },
  { name: 'column', type: 'VARCHAR' },
  { name: 'match_count', type: 'BIGINT' },
  { name: 'sample_values', type: 'VARCHAR[]' },
];

/**
 * Answers "which column contains the literal X" directly, one batched
 * `UNION ALL` across every text-typed candidate column rather than a probe
 * per column. Only columns that actually matched appear in the output.
 */
const search_values: Handler = async (params, ctx) => {
  const term = requireString(params, 'term');
  if (isError(term)) return term;
  const rawMode = params.mode;
  if (rawMode !== undefined && (typeof rawMode !== 'string' || !SEARCH_MODES.includes(rawMode as SearchMode))) {
    return invalidEnum('mode', rawMode, SEARCH_MODES);
  }
  const mode = (rawMode as SearchMode | undefined) ?? DEFAULT_SEARCH_MODE;
  const rawTables = params.tables;
  if (rawTables !== undefined && (!Array.isArray(rawTables) || rawTables.some((t) => typeof t !== 'string'))) {
    return opError('invalid_argument', 'tables must be an array of table names when provided.');
  }
  const rawColumns = params.columns;
  if (rawColumns !== undefined && (!Array.isArray(rawColumns) || rawColumns.some((c) => typeof c !== 'string'))) {
    return opError('invalid_argument', 'columns must be an array of column names when provided.');
  }

  let catalog;
  try {
    catalog = await readCatalog(ctx);
  } catch (error) {
    return engineError(error, ctx.signal);
  }
  const knownTables = [...new Set(catalog.columns.map((c) => c.table))];
  if (rawTables) {
    const badTable = (rawTables as string[]).find((t) => !knownTables.includes(t));
    if (badTable !== undefined) return unknownTable(badTable, knownTables);
  }
  if (rawColumns) {
    const knownColumns = [...new Set(catalog.columns.map((c) => c.column))];
    const badColumn = (rawColumns as string[]).find((c) => !knownColumns.includes(c));
    if (badColumn !== undefined) {
      return opError('unknown_object', `No column named ${badColumn} in any table.`, nearest(badColumn, knownColumns));
    }
  }

  const candidates = catalog.columns.filter((c) => {
    if (!isTextType(c.type)) return false;
    if (rawTables && !(rawTables as string[]).includes(c.table)) return false;
    if (rawColumns && !(rawColumns as string[]).includes(c.column)) return false;
    return true;
  });
  if (candidates.length === 0) {
    return inlineResult('search_values', null, SEARCH_VALUES_SCHEMA, [], catalog.elapsedMs, 'No text-typed columns match the given filters.');
  }

  const branches = candidates.map((c) => {
    const colExpr = `CAST(${quoteIdentifier(c.column)} AS VARCHAR)`;
    const predicate = searchPredicate(colExpr, term, mode);
    return (
      `SELECT ${quoteLiteral(c.table)} AS tbl, ${quoteLiteral(c.column)} AS col, ${colExpr} AS val ` +
      `FROM ${quoteIdentifier(c.table)} WHERE ${quoteIdentifier(c.column)} IS NOT NULL AND ${predicate}`
    );
  });
  // Flat rows (one per sample value) rather than a SQL-side `LIST(...)`
  // aggregate: DuckDB-Wasm's Arrow bridge does not normalize a returned LIST
  // cell to a plain JS array the way it does bigint/DECIMAL, so two engines
  // would hand back structurally different values for the same column —
  // caught by this op's own conformance step. Grouping the top five per
  // (table, column) in JS sidesteps the gap entirely.
  const sql =
    `WITH matches AS (\n${branches.join('\nUNION ALL\n')}\n),\n` +
    `grouped AS (SELECT tbl, col, val, COUNT(*) AS cnt FROM matches GROUP BY tbl, col, val),\n` +
    `counts AS (SELECT tbl, col, SUM(cnt) AS match_count FROM grouped GROUP BY tbl, col),\n` +
    `ranked AS (SELECT tbl, col, val, cnt, ROW_NUMBER() OVER (PARTITION BY tbl, col ORDER BY cnt DESC, val ASC) AS rn FROM grouped)\n` +
    `SELECT c.tbl, c.col, c.match_count, r.val\n` +
    `FROM counts c JOIN ranked r ON r.tbl = c.tbl AND r.col = c.col AND r.rn <= 5\n` +
    `ORDER BY c.match_count DESC, c.tbl, c.col, r.rn`;

  try {
    const result = await ctx.executor.execute(sql, ctx.signal);
    const grouped: Array<{ table: string; column: string; matchCount: number; sampleValues: unknown[] }> = [];
    for (const [tbl, col, matchCount, val] of result.rows) {
      const last = grouped[grouped.length - 1];
      if (last && last.table === tbl && last.column === col) {
        last.sampleValues.push(val);
      } else {
        grouped.push({ table: tbl as string, column: col as string, matchCount: matchCount as number, sampleValues: [val] });
      }
    }
    const rows = grouped.map((g) => [g.table, g.column, g.matchCount, g.sampleValues]);
    return inlineResult('search_values', sql, SEARCH_VALUES_SCHEMA, rows, catalog.elapsedMs + result.elapsedMs);
  } catch (error) {
    return engineError(error, ctx.signal, { wrapped: true });
  }
};

// ---- distinct_values ----

const DISTINCT_VALUES_ORDERS: readonly DistinctValuesOrder[] = ['count_desc', 'count_asc', 'value_asc', 'value_desc'];
const DEFAULT_DISTINCT_VALUES_LIMIT = 10;
const DISTINCT_VALUES_ORDER_SQL: Record<DistinctValuesOrder, string> = {
  count_desc: 'g.count DESC, g.value ASC',
  count_asc: 'g.count ASC, g.value ASC',
  value_asc: 'g.value ASC',
  value_desc: 'g.value DESC',
};

/** `buildTopValuesSql`'s parameterized generalization (§10's copy stays fixed at ten, ordered by count only — this is the analyst-facing door). `share` is computed against the filtered total, not just the returned page, so shares stay meaningful under a small `limit`. */
const distinct_values: Handler = async (params, ctx) => {
  const table = requireString(params, 'table');
  if (isError(table)) return table;
  const column = requireString(params, 'column');
  if (isError(column)) return column;
  const rawOrder = params.order;
  if (rawOrder !== undefined && (typeof rawOrder !== 'string' || !DISTINCT_VALUES_ORDERS.includes(rawOrder as DistinctValuesOrder))) {
    return invalidEnum('order', rawOrder, DISTINCT_VALUES_ORDERS);
  }
  const order = (rawOrder as DistinctValuesOrder | undefined) ?? 'count_desc';
  const limit = boundedInt(params, 'limit', DEFAULT_DISTINCT_VALUES_LIMIT, 1, MAX_PREVIEW_ROWS);
  if (isError(limit)) return limit;
  const where = params.where;
  if (where !== undefined && typeof where !== 'string') return opError('invalid_argument', 'where must be a string when provided.');

  let catalog;
  try {
    catalog = await readCatalog(ctx);
  } catch (error) {
    return engineError(error, ctx.signal);
  }
  const tables = [...new Set(catalog.columns.map((c) => c.table))];
  const inTable = catalog.columns.filter((c) => c.table === table);
  if (inTable.length === 0) return unknownTable(table, tables);
  if (!inTable.some((c) => c.column === column)) {
    return opError('unknown_object', `No column named ${column} in ${table}.`, nearest(column, inTable.map((c) => c.column)));
  }

  const sql =
    `WITH filtered AS (\n  SELECT ${quoteIdentifier(column)} AS value FROM ${quoteIdentifier(table)}${where ? ` WHERE (${where})` : ''}\n),\n` +
    `grouped AS (SELECT value, COUNT(*) AS count FROM filtered GROUP BY value),\n` +
    `total AS (SELECT COUNT(*) AS n FROM filtered)\n` +
    `SELECT g.value, g.count, CAST(g.count AS DOUBLE) / NULLIF(t.n, 0) AS share\n` +
    `FROM grouped g CROSS JOIN total t\n` +
    `ORDER BY ${DISTINCT_VALUES_ORDER_SQL[order]}\n` +
    `LIMIT ${limit}`;

  return materializedResult('distinct_values', sql, limit, ctx, catalog.elapsedMs);
};

// ---- text_frequency ----

/** Frozen and versioned (leaf doc DoD) — a text-frequency result stays reproducible for an existing caller even if a future revision adds `STOPWORDS_V2`. */
const STOPWORDS_V1: readonly string[] = [
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', "aren't", 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  "can't", 'cannot', 'could', "couldn't",
  'did', "didn't", 'do', 'does', "doesn't", 'doing', "don't", 'down', 'during',
  'each', 'few', 'for', 'from', 'further',
  'had', "hadn't", 'has', "hasn't", 'have', "haven't", 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', "isn't", 'it', 'its', 'itself',
  "let's",
  'me', 'more', 'most', "mustn't", 'my', 'myself',
  'no', 'nor', 'not',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', "shan't", 'she', 'should', "shouldn't", 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up',
  'very',
  'was', "wasn't", 'we', 'were', "weren't", 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', "won't", 'would', "wouldn't",
  'you', 'your', 'yours', 'yourself', 'yourselves',
];

const TEXT_UNITS: readonly TextUnit[] = ['word', 'bigram', 'trigram'];
const UNIT_N: Record<TextUnit, number> = { word: 1, bigram: 2, trigram: 3 };
const DEFAULT_MIN_LENGTH = 2;
const DEFAULT_TEXT_FREQUENCY_TOP = 50;

/**
 * Tokenizes lower-cased text on non-alphanumerics, filters by `minLength` and
 * `stopwords` at the *token* level for every unit including bigram/trigram —
 * simpler and more predictable than a unit-specific filtering pass, at the
 * cost of occasionally joining two words that were not really adjacent in
 * the source text once a stopword between them is dropped.
 */
function buildTextFrequencySql(
  table: string,
  column: string,
  unit: TextUnit,
  minLength: number,
  stopwords: readonly string[],
  top: number,
  where?: string,
): string {
  const col = quoteIdentifier(column);
  const n = UNIT_N[unit];
  const stopwordFilter = stopwords.length > 0 ? ` AND w NOT IN (${stopwords.map((w) => quoteLiteral(w)).join(', ')})` : '';
  const whereClause = where ? ` AND (${where})` : '';
  const docs =
    `docs AS (\n  SELECT row_number() OVER () AS doc_id,\n    list_filter(\n      regexp_split_to_array(regexp_replace(lower(CAST(${col} AS VARCHAR)), '[^a-z0-9]+', ' ', 'g'), '\\s+'),\n      w -> length(w) >= ${minLength} AND w <> ''${stopwordFilter}\n    ) AS words\n  FROM ${quoteIdentifier(table)} WHERE ${col} IS NOT NULL${whereClause}\n)`;
  const terms =
    unit === 'word'
      ? `terms AS (SELECT doc_id, unnest(words) AS term FROM docs)`
      : `terms AS (\n  SELECT doc_id, unnest(\n    CASE WHEN len(words) >= ${n} THEN\n      list_transform(generate_series(1, len(words) - ${n} + 1), i -> array_to_string(words[i:i+${n}-1], ' '))\n    ELSE [] END\n  ) AS term\n  FROM docs\n)`;

  return (
    `WITH ${docs},\n${terms},\n` +
    `grouped AS (SELECT term, COUNT(*) AS count, COUNT(DISTINCT doc_id) AS doc_count FROM terms GROUP BY term),\n` +
    `total AS (SELECT COUNT(*) AS n FROM terms)\n` +
    `SELECT g.term, g.count, g.doc_count, CAST(g.count AS DOUBLE) / NULLIF(t.n, 0) AS share\n` +
    `FROM grouped g CROSS JOIN total t\n` +
    `ORDER BY g.count DESC, g.term ASC\n` +
    `LIMIT ${top}`
  );
}

/** Turns a text-theme question into a computation instead of a row dump. `sql` is always re-runnable — the two most-tempting-to-do-in-JS operations both stay in SQL, per the leaf doc's own definition of done. */
const text_frequency: Handler = async (params, ctx) => {
  const table = requireString(params, 'table');
  if (isError(table)) return table;
  const column = requireString(params, 'column');
  if (isError(column)) return column;
  const rawUnit = params.unit;
  if (rawUnit !== undefined && (typeof rawUnit !== 'string' || !TEXT_UNITS.includes(rawUnit as TextUnit))) {
    return invalidEnum('unit', rawUnit, TEXT_UNITS);
  }
  const unit = (rawUnit as TextUnit | undefined) ?? 'word';
  const top = boundedInt(params, 'top', DEFAULT_TEXT_FREQUENCY_TOP, 1, MAX_PREVIEW_ROWS);
  if (isError(top)) return top;
  const minLength = boundedInt(params, 'minLength', DEFAULT_MIN_LENGTH, 0, 100);
  if (isError(minLength)) return minLength;
  const where = params.where;
  if (where !== undefined && typeof where !== 'string') return opError('invalid_argument', 'where must be a string when provided.');
  const rawStopwords = params.stopwords;
  if (rawStopwords !== undefined && (!Array.isArray(rawStopwords) || rawStopwords.some((w) => typeof w !== 'string'))) {
    return opError('invalid_argument', 'stopwords must be an array of strings when provided.');
  }
  const stopwords = (rawStopwords as string[] | undefined)?.map((w) => w.toLowerCase()) ?? STOPWORDS_V1;

  let catalog;
  try {
    catalog = await readCatalog(ctx);
  } catch (error) {
    return engineError(error, ctx.signal);
  }
  const tables = [...new Set(catalog.columns.map((c) => c.table))];
  const inTable = catalog.columns.filter((c) => c.table === table);
  if (inTable.length === 0) return unknownTable(table, tables);
  if (!inTable.some((c) => c.column === column)) {
    return opError('unknown_object', `No column named ${column} in ${table}.`, nearest(column, inTable.map((c) => c.column)));
  }

  const sql = buildTextFrequencySql(table, column, unit, minLength, stopwords, top, where);
  return materializedResult('text_frequency', sql, top, ctx, catalog.elapsedMs);
};

// ---- time_series ----

const TIME_SERIES_GRAINS: readonly TimeSeriesGrain[] = ['day', 'week', 'month', 'quarter', 'year'];
const GRAIN_INTERVAL: Record<TimeSeriesGrain, string> = {
  day: '1 day',
  week: '1 week',
  month: '1 month',
  quarter: '3 months',
  year: '1 year',
};

/**
 * One row per period between the filtered data's earliest and latest period
 * at `grain` — a generated calendar `LEFT JOIN`ed onto the actual aggregates,
 * so an unpopulated period is a real row with `is_gap = true` rather than a
 * silently missing one. `querySuggester` names this intent; this computes it.
 */
const time_series: Handler = async (params, ctx) => {
  const from = requireString(params, 'from');
  if (isError(from)) return from;
  const dateColumn = requireString(params, 'dateColumn');
  if (isError(dateColumn)) return dateColumn;
  const rawGrain = params.grain;
  if (typeof rawGrain !== 'string' || !TIME_SERIES_GRAINS.includes(rawGrain as TimeSeriesGrain)) {
    return invalidEnum('grain', rawGrain, TIME_SERIES_GRAINS);
  }
  const grain = rawGrain as TimeSeriesGrain;
  const join = params.join;
  if (join !== undefined && typeof join !== 'string') return opError('invalid_argument', 'join must be a string when provided.');
  const where = params.where;
  if (where !== undefined && typeof where !== 'string') return opError('invalid_argument', 'where must be a string when provided.');
  const parsedMetrics = parseMetrics(params.metrics);
  if (isError(parsedMetrics)) return parsedMetrics;
  const { exprs, aliases } = parsedMetrics;

  let catalog;
  try {
    catalog = await readCatalog(ctx);
  } catch (error) {
    return engineError(error, ctx.signal);
  }
  const tables = [...new Set(catalog.columns.map((c) => c.table))];
  if (!tables.includes(from)) return unknownTable(from, tables);

  const dateCol = quoteIdentifier(dateColumn);
  const fromClause = `${quoteIdentifier(from)}${join ? ` ${join}` : ''}`;
  const whereClause = `${dateCol} IS NOT NULL${where ? ` AND (${where})` : ''}`;
  const metricSelect = exprs.map((expr, i) => `${expr} AS ${quoteIdentifier(aliases[i]!)}`).join(', ');
  const deltaSelect = aliases
    .map(
      (a) =>
        `(${quoteIdentifier(a)} - lag(${quoteIdentifier(a)}) OVER (ORDER BY period)) / NULLIF(ABS(lag(${quoteIdentifier(a)}) OVER (ORDER BY period)), 0) * 100 AS ${quoteIdentifier(`${a}_delta_pct`)}`,
    )
    .join(', ');

  const sql =
    `WITH bounds AS (\n  SELECT date_trunc('${grain}', min(${dateCol})) AS lo, date_trunc('${grain}', max(${dateCol})) AS hi\n  FROM ${fromClause} WHERE ${whereClause}\n),\n` +
    `calendar AS (\n  SELECT unnest(generate_series((SELECT lo FROM bounds), (SELECT hi FROM bounds), INTERVAL '${GRAIN_INTERVAL[grain]}')) AS period\n),\n` +
    `actual AS (\n  SELECT date_trunc('${grain}', ${dateCol}) AS period, ${metricSelect}\n  FROM ${fromClause} WHERE ${whereClause}\n  GROUP BY 1\n),\n` +
    `joined AS (\n  SELECT c.period, ${aliases.map((a) => `a.${quoteIdentifier(a)}`).join(', ')}, (a.period IS NULL) AS is_gap\n  FROM calendar c LEFT JOIN actual a USING (period)\n)\n` +
    `SELECT period, ${aliases.map((a) => quoteIdentifier(a)).join(', ')}, is_gap, ${deltaSelect}\n` +
    `FROM joined\nORDER BY period`;

  return materializedResult('time_series', sql, DEFAULT_PREVIEW_ROWS, ctx, catalog.elapsedMs);
};

// ---- join_coverage ----

const JOIN_COVERAGE_SCHEMA: OpSchemaField[] = [
  { name: 'left_table', type: 'VARCHAR' },
  { name: 'right_table', type: 'VARCHAR' },
  { name: 'left_column', type: 'VARCHAR' },
  { name: 'right_column', type: 'VARCHAR' },
  { name: 'left_matched', type: 'BIGINT' },
  { name: 'left_unmatched', type: 'BIGINT' },
  { name: 'right_matched', type: 'BIGINT' },
  { name: 'right_unmatched', type: 'BIGINT' },
  { name: 'multiplicity', type: 'VARCHAR' },
  { name: 'left_orphan_examples', type: 'VARCHAR[]' },
  { name: 'right_orphan_examples', type: 'VARCHAR[]' },
  { name: 'join_sql', type: 'VARCHAR' },
];

function firstRowAsRecord(result: { columnNames: string[]; rows: unknown[][] }): Record<string, unknown> {
  return Object.fromEntries(result.columnNames.map((name, i) => [name, result.rows[0]?.[i]]));
}

/**
 * The default `on` — a name-agreeing, containment-scored candidate between
 * exactly these two tables. Reuses `relationshipInference`'s own probes and
 * scoring (D58: one algorithm, not a second one for the analyst layer)
 * against stats measured fresh via SQL, because the analyst core has no
 * access to the app's precomputed classification. Structure-only candidates
 * (no name link) are excluded here — a *silent default* needs the stronger
 * bar; a structure-only candidate is exactly what the app's own relationship
 * graph would draw dashed, not solid.
 */
async function inferJoinColumns(
  left: string,
  right: string,
  columns: CatalogColumn[],
  ctx: OpContext,
): Promise<{ leftColumn: string; rightColumn: string } | null> {
  const leftCols = columns.filter((c) => c.table === left);
  const rightCols = columns.filter((c) => c.table === right);
  const directions: Array<[CatalogColumn[], string, CatalogColumn[], string]> = [
    [leftCols, left, rightCols, right],
    [rightCols, right, leftCols, left],
  ];

  let best: { childTable: string; childColumn: string; parentTable: string; parentColumn: string; score: number } | null = null;
  for (const [childCols, childTable, parentCols, parentTable] of directions) {
    for (const child of childCols) {
      for (const parent of parentCols) {
        const comparison = comparisonModeFor(child.type, parent.type);
        if (!comparison || !nameAgrees(child.column, parentTable, parent.column)) continue;
        const candidate: FkCandidate = {
          childTable,
          childColumn: child.column,
          childPhysicalType: child.type,
          parentTable,
          parentColumn: parent.column,
          parentPhysicalType: parent.type,
          nameAgreement: true,
          comparison,
        };
        const keyResult = await ctx.executor.execute(buildParentKeySql(parentTable, parent.column), ctx.signal);
        const keyStats = parseParentKeySql(firstRowAsRecord(keyResult));
        if (keyStats.uniqueness < KEY_UNIQUENESS_MIN) continue;
        const containResult = await ctx.executor.execute(buildContainmentSql(candidate), ctx.signal);
        const containStats = parseContainmentSql(firstRowAsRecord(containResult));
        const scored = scoreCandidate(candidate, containStats, keyStats);
        if (!scored) continue;
        if (!best || scored.containment > best.score) {
          best = { childTable, childColumn: child.column, parentTable, parentColumn: parent.column, score: scored.containment };
        }
      }
    }
  }
  if (!best) return null;
  return best.childTable === left
    ? { leftColumn: best.childColumn, rightColumn: best.parentColumn }
    : { leftColumn: best.parentColumn, rightColumn: best.childColumn };
}

/** Row-weighted matched/unmatched counts for one side, `sourceTable` against `otherTable`. Values are normalized to `VARCHAR` so a type mismatch (zero-padded string vs. integer id) never blocks a coverage read the way a raw `=` would. */
function sideCoverageSql(sourceTable: string, sourceColumn: string, otherTable: string, otherColumn: string): string {
  const s = `TRIM(CAST(${quoteIdentifier(sourceColumn)} AS VARCHAR))`;
  const o = `TRIM(CAST(${quoteIdentifier(otherColumn)} AS VARCHAR))`;
  return (
    `SELECT count(*) FILTER (WHERE l.k IS NOT NULL AND r.k IS NOT NULL) AS matched, ` +
    `count(*) FILTER (WHERE l.k IS NOT NULL AND r.k IS NULL) AS unmatched ` +
    `FROM (SELECT ${s} AS k FROM ${quoteIdentifier(sourceTable)}) l ` +
    `LEFT JOIN (SELECT DISTINCT ${o} AS k FROM ${quoteIdentifier(otherTable)} WHERE ${quoteIdentifier(otherColumn)} IS NOT NULL) r USING (k)`
  );
}

function orphanExamplesSql(sourceTable: string, sourceColumn: string, otherTable: string, otherColumn: string): string {
  const s = `TRIM(CAST(${quoteIdentifier(sourceColumn)} AS VARCHAR))`;
  const o = `TRIM(CAST(${quoteIdentifier(otherColumn)} AS VARCHAR))`;
  return (
    `SELECT DISTINCT l.k FROM (SELECT ${s} AS k FROM ${quoteIdentifier(sourceTable)} WHERE ${quoteIdentifier(sourceColumn)} IS NOT NULL) l ` +
    `LEFT JOIN (SELECT DISTINCT ${o} AS k FROM ${quoteIdentifier(otherTable)} WHERE ${quoteIdentifier(otherColumn)} IS NOT NULL) r USING (k) ` +
    `WHERE r.k IS NULL ORDER BY l.k LIMIT 5`
  );
}

/** `relationshipInference` computes containment *during* inference but exposes no addressable operation for it and no helper that hands back the join clause for an inferred edge — this is that operation. */
const join_coverage: Handler = async (params, ctx) => {
  const left = requireString(params, 'left');
  if (isError(left)) return left;
  const right = requireString(params, 'right');
  if (isError(right)) return right;
  const rawOn = params.on;
  if (rawOn !== undefined && (typeof rawOn !== 'object' || rawOn === null)) {
    return opError('invalid_argument', 'on must be an object with leftColumn and rightColumn when provided.');
  }

  let catalog;
  try {
    catalog = await readCatalog(ctx);
  } catch (error) {
    return engineError(error, ctx.signal);
  }
  const tables = [...new Set(catalog.columns.map((c) => c.table))];
  if (!tables.includes(left)) return unknownTable(left, tables);
  if (!tables.includes(right)) return unknownTable(right, tables);

  let on: { leftColumn: string; rightColumn: string };
  if (rawOn) {
    const { leftColumn, rightColumn } = rawOn as Record<string, unknown>;
    if (typeof leftColumn !== 'string' || typeof rightColumn !== 'string') {
      return opError('invalid_argument', 'on.leftColumn and on.rightColumn must both be strings.');
    }
    const leftCols = catalog.columns.filter((c) => c.table === left).map((c) => c.column);
    if (!leftCols.includes(leftColumn)) {
      return opError('unknown_object', `No column named ${leftColumn} in ${left}.`, nearest(leftColumn, leftCols));
    }
    const rightCols = catalog.columns.filter((c) => c.table === right).map((c) => c.column);
    if (!rightCols.includes(rightColumn)) {
      return opError('unknown_object', `No column named ${rightColumn} in ${right}.`, nearest(rightColumn, rightCols));
    }
    on = { leftColumn, rightColumn };
  } else {
    let inferred: { leftColumn: string; rightColumn: string } | null;
    try {
      inferred = await inferJoinColumns(left, right, catalog.columns, ctx);
    } catch (error) {
      return engineError(error, ctx.signal);
    }
    if (!inferred) {
      return opError('invalid_argument', `No relationship could be inferred between ${left} and ${right}; supply on explicitly.`);
    }
    on = inferred;
  }

  const joinSql =
    `SELECT l.*, r.* FROM ${quoteIdentifier(left)} l ` +
    `INNER JOIN ${quoteIdentifier(right)} r ON l.${quoteIdentifier(on.leftColumn)} = r.${quoteIdentifier(on.rightColumn)}`;

  try {
    const [leftStatsResult, rightStatsResult, leftKeyResult, rightKeyResult, leftOrphansResult, rightOrphansResult] = await Promise.all([
      ctx.executor.execute(sideCoverageSql(left, on.leftColumn, right, on.rightColumn), ctx.signal),
      ctx.executor.execute(sideCoverageSql(right, on.rightColumn, left, on.leftColumn), ctx.signal),
      ctx.executor.execute(buildParentKeySql(left, on.leftColumn), ctx.signal),
      ctx.executor.execute(buildParentKeySql(right, on.rightColumn), ctx.signal),
      ctx.executor.execute(orphanExamplesSql(left, on.leftColumn, right, on.rightColumn), ctx.signal),
      ctx.executor.execute(orphanExamplesSql(right, on.rightColumn, left, on.leftColumn), ctx.signal),
    ]);

    const leftStats = firstRowAsRecord(leftStatsResult);
    const rightStats = firstRowAsRecord(rightStatsResult);
    const leftKey = parseParentKeySql(firstRowAsRecord(leftKeyResult));
    const rightKey = parseParentKeySql(firstRowAsRecord(rightKeyResult));
    const leftUnique = leftKey.uniqueness >= KEY_UNIQUENESS_MIN;
    const rightUnique = rightKey.uniqueness >= KEY_UNIQUENESS_MIN;
    const multiplicity = leftUnique && rightUnique ? '1:1' : leftUnique ? '1:n' : rightUnique ? 'n:1' : 'n:m';

    const elapsedMs =
      leftStatsResult.elapsedMs +
      rightStatsResult.elapsedMs +
      leftKeyResult.elapsedMs +
      rightKeyResult.elapsedMs +
      leftOrphansResult.elapsedMs +
      rightOrphansResult.elapsedMs +
      catalog.elapsedMs;

    return inlineResult(
      'join_coverage',
      joinSql,
      JOIN_COVERAGE_SCHEMA,
      [
        [
          left,
          right,
          on.leftColumn,
          on.rightColumn,
          Number(leftStats.matched ?? 0),
          Number(leftStats.unmatched ?? 0),
          Number(rightStats.matched ?? 0),
          Number(rightStats.unmatched ?? 0),
          multiplicity,
          leftOrphansResult.rows.map((r) => r[0]),
          rightOrphansResult.rows.map((r) => r[0]),
          joinSql,
        ],
      ],
      elapsedMs,
    );
  } catch (error) {
    return engineError(error, ctx.signal, { wrapped: true });
  }
};

// ---- aggregate ----

/**
 * `pivotCompiler` is pivot-shaped and `buildCategorySummarySql` is fixed at
 * one categorical and one quantitative column; this is the general grouped
 * aggregate. A convenience, not a fence — `run_sql` expresses everything
 * this does and more, and the D74 ablation is what decides whether it earns
 * its slot. `groupBy` entries are treated as bare identifiers, not
 * expressions, matching `pivotCompiler.PivotSpec`'s own `rows`/`columns`.
 */
const aggregate: Handler = async (params, ctx) => {
  const from = requireString(params, 'from');
  if (isError(from)) return from;
  const join = params.join;
  if (join !== undefined && typeof join !== 'string') return opError('invalid_argument', 'join must be a string when provided.');
  const where = params.where;
  if (where !== undefined && typeof where !== 'string') return opError('invalid_argument', 'where must be a string when provided.');
  const having = params.having;
  if (having !== undefined && typeof having !== 'string') return opError('invalid_argument', 'having must be a string when provided.');
  const order = params.order;
  if (order !== undefined && typeof order !== 'string') return opError('invalid_argument', 'order must be a string when provided.');
  const limit = boundedInt(params, 'limit', DEFAULT_PREVIEW_ROWS, 1, MAX_PREVIEW_ROWS);
  if (isError(limit)) return limit;
  const rawGroupBy = params.groupBy;
  if (rawGroupBy !== undefined && (!Array.isArray(rawGroupBy) || rawGroupBy.some((g) => typeof g !== 'string'))) {
    return opError('invalid_argument', 'groupBy must be an array of column names when provided.');
  }
  const groupBy = (rawGroupBy as string[] | undefined) ?? [];
  const parsedMetrics = parseMetrics(params.metrics);
  if (isError(parsedMetrics)) return parsedMetrics;
  const { exprs, aliases } = parsedMetrics;

  let catalog;
  try {
    catalog = await readCatalog(ctx);
  } catch (error) {
    return engineError(error, ctx.signal);
  }
  const tables = [...new Set(catalog.columns.map((c) => c.table))];
  if (!tables.includes(from)) return unknownTable(from, tables);

  const fromClause = `${quoteIdentifier(from)}${join ? ` ${join}` : ''}`;
  const groupSelect = groupBy.map((g) => quoteIdentifier(g));
  const metricSelect = exprs.map((expr, i) => `${expr} AS ${quoteIdentifier(aliases[i]!)}`);
  const selectList = [...groupSelect, ...metricSelect].join(', ');
  const totalColumns = groupBy.length + aliases.length;
  // Full positional order by default — the only way to guarantee a stable row
  // sequence across two independently compiled engines when the caller hasn't
  // named an order (see A0's own comment on this exact class of bug).
  const defaultOrder = Array.from({ length: totalColumns }, (_, i) => `${i + 1}`).join(', ');

  const clauses = [`SELECT ${selectList}`, `FROM ${fromClause}`];
  if (where) clauses.push(`WHERE (${where})`);
  if (groupBy.length > 0) clauses.push(`GROUP BY ${groupSelect.map((_, i) => `${i + 1}`).join(', ')}`);
  if (having) clauses.push(`HAVING (${having})`);
  clauses.push(`ORDER BY ${order ?? defaultOrder}`);
  clauses.push(`LIMIT ${limit}`);

  return materializedResult('aggregate', clauses.join('\n'), limit, ctx, catalog.elapsedMs);
};

/**
 * The read-only gate. Master §11.5 keeps the statement classifier for exactly
 * one job — telling a caller that a mutation belongs at `derive_table` (A3),
 * not at `run_sql` — and it is deliberately not a frozen SQL grammar: a
 * denylist over a dialect that grows faster than the list is the weakest
 * guarantee in the build. See `authority.ts` for what the engine enforces.
 */
const REFUSAL_REASON: Record<string, string> = {
  ctas: 'a CREATE TABLE ... AS belongs at derive_table',
  cview: 'a CREATE VIEW ... AS belongs at create_view',
  mutation: 'this statement modifies data',
  other: 'this statement does not begin with SELECT or WITH',
};

const run_sql: Handler = async (params, ctx) => {
  const sql = requireString(params, 'sql');
  if (isError(sql)) return sql;
  const limit = boundedInt(params, 'limit', DEFAULT_PREVIEW_ROWS, 1, MAX_PREVIEW_ROWS);
  if (isError(limit)) return limit;

  const statement = classifyStatement(sql);
  if (statement.class !== 'query') {
    // `other` covers both `INSERT` (which the classifier does not name, and
    // which must never reach the engine here) and outright malformed SQL, and
    // nothing short of a parser tells them apart — so the message states the
    // rule that was applied rather than asserting what the statement was.
    return opError('not_read_only', `run_sql executes read-only queries; ${REFUSAL_REASON[statement.class]}.`, 'SELECT, WITH');
  }
  return materializedResult('run_sql', statement.sql, limit, ctx);
};

// ---- the derive verbs (A3) ----

/**
 * The three operations below own **statement construction, naming and
 * refusal**; they own none of what a derivation means to the host. That half
 * crosses `ctx.catalog` (see `types.ts`) — in the browser, straight onto the
 * same `services/transforms.ts` call the SQL console makes, so a table derived
 * here and a table the user typed `CREATE TABLE AS` for are the same object
 * rather than two that agree.
 */
const NO_CATALOG = 'This core has no writable catalog, so it cannot derive or drop objects.';

const DERIVE_SCHEMA: OpSchemaField[] = [
  { name: 'name', type: 'VARCHAR' },
  { name: 'kind', type: 'VARCHAR' },
  { name: 'row_count', type: 'BIGINT' },
  { name: 'column_count', type: 'BIGINT' },
];

async function derive(
  op: 'derive_table' | 'create_view',
  kind: 'table' | 'view',
  params: Record<string, unknown>,
  ctx: OpContext,
): Promise<OpOutcome> {
  if (!ctx.catalog) return opError('not_read_only', NO_CATALOG);
  const name = requireString(params, 'name');
  if (isError(name)) return name;
  const sql = requireString(params, 'sql');
  if (isError(sql)) return sql;

  // The body has to be a query: this file composes the CREATE statement, so a
  // caller passing a whole `CREATE TABLE AS` would otherwise nest one inside
  // another. The message names the parameter that was actually wanted.
  const body = classifyStatement(sql);
  if (body.class !== 'query') {
    return opError(
      'invalid_argument',
      body.class === 'ctas'
        ? `${op} composes the CREATE statement itself — pass only the SELECT that fills it, and the object name as "name".`
        : `${op} takes a SELECT or WITH query as its body; ${REFUSAL_REASON[body.class]}.`,
      'SELECT, WITH',
    );
  }

  let catalog;
  try {
    catalog = await readCatalog(ctx);
  } catch (error) {
    return engineError(error, ctx.signal);
  }
  const taken = new Set(catalog.columns.map((c) => c.table));

  // The same two rules ingestion applies to a dropped file's name (§7.1), not a
  // second set: a model's chosen name is no more trustworthy than a filename,
  // and an operation that failed on a name DuckDB won't quote would be a worse
  // answer than one that renames deterministically and says so.
  const requested = sanitizeTableName(name);
  const finalName = dedupeTableName(requested, taken);

  const statement = `CREATE ${kind === 'view' ? 'VIEW' : 'TABLE'} ${quoteIdentifier(finalName)} AS ${body.sql}`;

  let elapsedMs = catalog.elapsedMs;
  let rowCount: number;
  let columnCount: number;
  let objects: CatalogObject[];
  try {
    await ctx.catalog.derive({ name: finalName, sql: statement, kind });

    // Counted rather than taken from the host: the browser host profiles what
    // it registers, but the conformance harness has no registry at all, so a
    // number read from the engine is the only one both hosts can report
    // identically.
    const counted = await ctx.executor.execute(
      `SELECT count(*) AS row_count FROM ${quoteIdentifier(finalName)}`,
      ctx.signal,
    );
    rowCount = Number(counted.rows[0]?.[0] ?? 0);
    elapsedMs += counted.elapsedMs;

    const after = await readCatalog(ctx);
    columnCount = after.columns.filter((c) => c.table === finalName).length;
    elapsedMs += after.elapsedMs;

    objects = await ctx.catalog.objects();
  } catch (error) {
    return engineError(error, ctx.signal);
  }

  const notes: string[] = [];
  if (finalName !== name) notes.push(`Named "${finalName}" — "${name}" was not a usable object name, or was taken.`);
  const lineage = lineageNote(lineageOf(finalName, objects));
  if (lineage) notes.push(lineage);

  return inlineResult(
    op,
    statement,
    DERIVE_SCHEMA,
    [[finalName, kind, rowCount, columnCount]],
    elapsedMs,
    notes.length > 0 ? notes.join(' ') : undefined,
  );
}

const derive_table: Handler = (params, ctx) => derive('derive_table', 'table', params, ctx);
const create_view: Handler = (params, ctx) => derive('create_view', 'view', params, ctx);

const DROP_SCHEMA: OpSchemaField[] = [
  { name: 'name', type: 'VARCHAR' },
  { name: 'kind', type: 'VARCHAR' },
  { name: 'generating_sql', type: 'VARCHAR' },
];

/**
 * Refuses a source table — not as a security boundary (a tab that can run
 * §10 Module 2's console is not made safer by this), but because the mutation
 * guard's materialize-onto-a-clone default is the better answer for a human
 * too, and the model gets the same door the user gets. The hint names what
 * *is* droppable rather than suggesting what to do, per the `OpError` contract.
 */
const drop_derived: Handler = async (params, ctx) => {
  if (!ctx.catalog) return opError('not_read_only', NO_CATALOG);
  const name = requireString(params, 'name');
  if (isError(name)) return name;

  let objects: CatalogObject[];
  try {
    objects = await ctx.catalog.objects();
  } catch (error) {
    return engineError(error, ctx.signal);
  }

  const droppable = objects.filter((o) => o.origin === 'derived').map((o) => o.name).sort();
  const target = objects.find((o) => o.name === name);
  if (!target) return opError('unknown_object', `No table or view named ${name}.`, nearest(name, objects.map((o) => o.name)));
  if (target.origin !== 'derived') {
    return opError(
      'invalid_argument',
      `"${name}" is a source table, so drop_derived will not remove it.`,
      droppable.length > 0 ? `derived objects: ${droppable.join(', ')}` : 'no derived objects exist',
    );
  }

  const lineage = lineageOf(name, objects);
  const statement = `DROP ${target.kind === 'view' ? 'VIEW' : 'TABLE'} ${quoteIdentifier(name)}`;

  const started = Date.now();
  try {
    await ctx.catalog.drop({ name, sql: statement, kind: target.kind });
  } catch (error) {
    return engineError(error, ctx.signal);
  }

  // The generating SQL rides in the row because it is what makes the drop
  // undoable — rebuilding is `derive_table` with this body, for a model as
  // much as for the toast in the UI.
  const notes: string[] = [];
  if (lineage.dependents.length > 0) {
    notes.push(`${lineage.dependents.length} object(s) derived from this and are now orphaned: ${lineage.dependents.join(', ')}.`);
  }
  if (target.generatingSql) notes.push('Rebuild with derive_table using generating_sql.');

  return inlineResult(
    'drop_derived',
    statement,
    DROP_SCHEMA,
    [[name, target.kind, target.generatingSql ?? null]],
    Date.now() - started,
    notes.length > 0 ? notes.join(' ') : undefined,
  );
};

/**
 * Read back a page — or, once compaction has replaced the body with a
 * receipt, the receipt. The receipt carries the SQL, so the caller can
 * re-run it deliberately; nothing here summarizes the cells it dropped.
 */
const read_result: Handler = async (params, ctx) => {
  const resultId = requireString(params, 'resultId');
  if (isError(resultId)) return resultId;
  const offset = boundedInt(params, 'offset', 0, 0, Number.MAX_SAFE_INTEGER);
  if (isError(offset)) return offset;
  const limit = boundedInt(params, 'limit', DEFAULT_PREVIEW_ROWS, 1, MAX_PREVIEW_ROWS);
  if (isError(limit)) return limit;
  const rawColumns = params.columns;
  if (rawColumns !== undefined && (!Array.isArray(rawColumns) || rawColumns.some((c) => typeof c !== 'string'))) {
    return opError('invalid_argument', 'columns must be an array of column names when provided.');
  }

  const receipt = ctx.store.receipt(resultId);
  if (!receipt) {
    return opError('unknown_object', `No result with id ${resultId}.`, ctx.store.inventory().map((r) => r.id).join(', ') || undefined);
  }

  let columns: string[] | undefined;
  if (rawColumns && rawColumns.length > 0) {
    const known = receipt.schema.map((f) => f.name);
    const unknownColumn = (rawColumns as string[]).find((c) => !known.includes(c));
    if (unknownColumn !== undefined) {
      return opError('unknown_object', `No column named ${unknownColumn} in result ${resultId}.`, nearest(unknownColumn, known));
    }
    columns = rawColumns as string[];
  }
  const schema = columns ? columns.map((name) => receipt.schema.find((f) => f.name === name)!) : receipt.schema;

  let page;
  try {
    page = await ctx.store.page(resultId, offset, limit, ctx.signal, columns);
  } catch (error) {
    return engineError(error, ctx.signal);
  }

  if (!page) {
    return {
      op: 'read_result',
      sql: receipt.sql,
      resultId,
      schema: receipt.schema,
      rowCount: receipt.rowCount,
      rows: [],
      complete: false,
      nextOffset: null,
      elapsedMs: 0,
      note: 'Result body released by compaction; the SQL above reproduces it.',
    };
  }

  return {
    op: 'read_result',
    sql: receipt.sql,
    resultId,
    schema,
    rowCount: receipt.rowCount,
    rows: page.rows,
    complete: offset === 0 && page.rows.length >= receipt.rowCount,
    nextOffset: page.nextOffset,
    elapsedMs: page.elapsedMs,
  };
};

// ---- the product-surface operations (A6) ----
//
// The two operations that make model work *land in the app* rather than stay in
// a transcript. They compute no analytical fact — they are why the tier exists,
// and they are excluded from the D74 scored run for exactly that reason (see
// `toolSchemas.ts`'s `surface` tag, which is what the harness filters on).
//
// **The D55 seam is the whole of their risk, and neither weakens it.**
// `pin_result` is handed a result id and a title and cannot express a tab
// envelope at all (`PinRequest` in `types.ts` has no field for one).
// `create_chart` emits an inner `ChartSpec` built by `chartMapper` from the real
// result; a model-supplied candidate is a *narrowing* of that baseline or it is
// refused outright. The renderer still executes no model output.

/** Rows a chart needs in hand. Past this the mapper degrades to the grid anyway, so refusing early is the same answer arrived at without paying for the page. */
const CHART_ROW_CEILING = MAX_PLOTTABLE_ROWS;
/** A tab strip is not a caption. Long enough for a real name, short enough that the label stays a label. */
const MAX_PIN_TITLE = 60;

/** The core's envelope in the shape the shared translator reads — `services/ai.ts` has the same three lines, and neither is a second chart path (D58): both feed `chartMapper`. */
function asQueryResult(schema: OpSchemaField[], rows: unknown[][], rowCount: number, elapsedMs: number): QueryResult {
  return {
    columnNames: schema.map((f) => f.name),
    columnTypes: schema.map((f) => f.type),
    rows,
    rowCount,
    executionTimeMs: elapsedMs,
  };
}

const CHART_TYPES: readonly ChartType[] = ['time-series', 'correlation', 'distribution', 'categorical', 'join-graph'];

/**
 * Resolve what is being charted: an existing materialization by `resultId`, or
 * a fresh read-only statement. Exactly one, because "chart this result" and
 * "run this and chart it" are different acts and silently preferring one when
 * both arrive would hide which happened.
 *
 * Returns the charted result's **own envelope** — its schema, its rows, its
 * `resultId`. `create_chart` returns that envelope with a spec attached rather
 * than a row describing the chart, which is what lets a caller chart a result
 * and then pin the very same `resultId`, and what gives a host the data to draw
 * without a second read.
 */
async function chartSubject(
  params: Record<string, unknown>,
  ctx: OpContext,
): Promise<{ envelope: OpResult; result: QueryResult } | OpError> {
  const rawResultId = params.resultId;
  const rawSql = params.sql;
  if (rawResultId !== undefined && rawSql !== undefined) {
    return opError('invalid_argument', 'Pass either resultId or sql, not both.', 'resultId, sql');
  }
  if (rawResultId === undefined && rawSql === undefined) {
    return opError('invalid_argument', 'create_chart needs either a resultId or a sql statement.', 'resultId, sql');
  }

  if (rawResultId !== undefined) {
    const resultId = requireString(params, 'resultId');
    if (isError(resultId)) return resultId;
    const receipt = ctx.store.receipt(resultId);
    if (!receipt) {
      return opError('unknown_object', `No result with id ${resultId}.`, ctx.store.inventory().map((r) => r.id).join(', ') || undefined);
    }
    if (receipt.rowCount > CHART_ROW_CEILING) {
      return opError(
        'invalid_argument',
        `${receipt.rowCount.toLocaleString()} rows is past the ${CHART_ROW_CEILING.toLocaleString()}-row plotting ceiling; aggregate the result down first.`,
        `${CHART_ROW_CEILING} rows`,
      );
    }
    let page;
    try {
      page = await ctx.store.page(resultId, 0, CHART_ROW_CEILING, ctx.signal);
    } catch (error) {
      return engineError(error, ctx.signal);
    }
    if (!page) {
      return opError('unknown_object', `Result ${resultId} was released by compaction; re-run its SQL to chart it.`, receipt.sql);
    }
    const envelope: OpResult = {
      op: 'create_chart',
      sql: receipt.sql,
      resultId,
      schema: receipt.schema,
      rowCount: receipt.rowCount,
      rows: page.rows,
      complete: page.rows.length >= receipt.rowCount,
      nextOffset: page.nextOffset,
      elapsedMs: page.elapsedMs,
    };
    return { envelope, result: asQueryResult(receipt.schema, page.rows, receipt.rowCount, page.elapsedMs) };
  }

  const sql = requireString(params, 'sql');
  if (isError(sql)) return sql;
  const statement = classifyStatement(sql);
  if (statement.class !== 'query') {
    return opError('not_read_only', `create_chart charts a read-only query; ${REFUSAL_REASON[statement.class]}.`, 'SELECT, WITH');
  }
  const outcome = await materializedResult('create_chart', statement.sql, CHART_ROW_CEILING, ctx);
  if (isOpError(outcome)) return outcome;
  if (outcome.rowCount > CHART_ROW_CEILING) {
    return opError(
      'invalid_argument',
      `${outcome.rowCount.toLocaleString()} rows is past the ${CHART_ROW_CEILING.toLocaleString()}-row plotting ceiling; aggregate the query down first.`,
      `${CHART_ROW_CEILING} rows`,
    );
  }
  return { envelope: outcome, result: asQueryResult(outcome.schema, outcome.rows, outcome.rowCount, outcome.elapsedMs) };
}

/**
 * Chart an existing result, or a query, through the same translator §11.1
 * stage 6 already calls. Never a second chart path (D58): `chartMapper` decides
 * the form and writes every field name, from the result's own schema.
 *
 * The refusals are the capabilities broker's grammar (§9) applied to a model
 * caller — the gate that stops the app offering a map for a dataset with no geo
 * columns, saying the same thing to a model. "No temporal column for a time
 * series" is not an error to paper over; it is the answer, and the model
 * composes something else on an ordinary turn.
 */
const create_chart: Handler = async (params, ctx) => {
  const rawType = params.type;
  if (rawType !== undefined && (typeof rawType !== 'string' || !CHART_TYPES.includes(rawType as ChartType))) {
    return invalidEnum('type', rawType, CHART_TYPES);
  }
  const type = rawType as ChartType | undefined;
  const rawSpec = params.spec;
  if (rawSpec !== undefined && (typeof rawSpec !== 'object' || rawSpec === null || Array.isArray(rawSpec))) {
    return opError('invalid_argument', 'spec must be an object when provided.');
  }

  const subject = await chartSubject(params, ctx);
  if (isError(subject)) return subject;
  const { envelope, result } = subject;

  // The deterministic baseline, and the only thing that ever names a column.
  let baseline: ChartSpec;
  if (type !== undefined) {
    const forType = specForType(result, type);
    if (!forType) {
      const available = availableChartTypes(result);
      return opError(
        'invalid_argument',
        `This result cannot support a ${type} chart: ${result.columnNames.length} column(s), types ${result.columnTypes.join(', ')}.`,
        available.length > 0 ? available.join(', ') : 'no chart type fits this result shape',
      );
    }
    baseline = forType;
  } else {
    const recommendation = recommendChart(result, envelope.sql ?? undefined);
    if (recommendation.kind === 'grid') {
      return opError(
        'invalid_argument',
        recommendation.reason,
        availableChartTypes(result).join(', ') || 'no chart type fits this result shape',
      );
    }
    if (recommendation.kind === 'kpi') {
      // A single aggregate value has no axes, so there is no spec for a
      // candidate to narrow — a `spec` alongside it is a request the result
      // cannot answer, and saying so beats charting something else.
      if (rawSpec !== undefined) {
        return opError('invalid_argument', 'This result is a single value, so it has no chart spec to refine.', 'omit spec');
      }
      return {
        ...envelope,
        note: 'A single aggregate value: shown as a stat, which has no axes.',
        chart: recommendation,
      };
    }
    baseline = recommendation.spec;
  }

  // The D55 gate. A model-supplied candidate is accepted only if it is the
  // baseline narrowed — same type, same axis, a subset of its measures, a
  // re-title that clears the D45 phrasing guard. A failure is a structured
  // refusal and **nothing renders**: no partial spec, no quiet drop of the
  // invalid parts, no fallback the caller did not ask for.
  let spec = baseline;
  let producer: 'deterministic' | 'ai' = 'deterministic';
  if (rawSpec !== undefined) {
    const candidate = rawSpec as ChartSpec;
    if (!chartSpecValidator(baseline, candidate)) {
      return opError(
        'invalid_argument',
        'The supplied spec is not a refinement of this result’s chart: type and xField must match, yFields must be a subset of the available measures, and the title must state no cause or certainty.',
        `type ${baseline.type}, xField ${baseline.xField}, yFields ${baseline.yFields.join(', ')}`,
      );
    }
    spec = candidate;
    producer = 'ai';
  }

  return {
    ...envelope,
    // A2's rule applied to a model caller: a finding names its producer. A spec
    // the caller narrowed is not the same artifact as one the translator chose,
    // and the note says which rather than leaving it to be inferred.
    note:
      producer === 'ai'
        ? `A ${spec.type} chart over ${spec.xField}, refined by the caller from the translator's own spec.`
        : `A ${spec.type} chart over ${spec.xField}, chosen by the translator.`,
    chart: { kind: 'chart', spec },
  };
};

const PIN_RESULT_SCHEMA: OpSchemaField[] = [
  // `pin_id`, not `tab_id`: the core does not know the host keeps tabs, and the
  // day it names one is the day a caller starts reasoning about envelopes.
  { name: 'pin_id', type: 'VARCHAR' },
  { name: 'title', type: 'VARCHAR' },
  { name: 'sql', type: 'VARCHAR' },
  { name: 'row_count', type: 'BIGINT' },
];

const NO_WORKSPACE = 'This core is headless, so it has no workspace to pin a result into.';

/**
 * Promote a result to a keeper. The third producer of a query tab (S5 built the
 * first two: pin-from-console and a chosen Suggested Exploration) and **nothing
 * else** — per-instance, never deduped, independently editable and re-runnable,
 * because it is literally the same `openQueryTab` call the other two make.
 *
 * The model supplies a result id and a title. It does not author a tab: the
 * request handed across `Workspace.pin` has no field for a tab type, an id, a
 * subject or an initializer, so the envelope stays the app's by construction
 * rather than by this function being careful (D55/D71).
 */
const pin_result: Handler = async (params, ctx) => {
  if (!ctx.workspace) return opError('unavailable', NO_WORKSPACE);
  const resultId = requireString(params, 'resultId');
  if (isError(resultId)) return resultId;
  const rawTitle = requireString(params, 'title');
  if (isError(rawTitle)) return rawTitle;
  const title = rawTitle.trim().slice(0, MAX_PIN_TITLE);

  const receipt = ctx.store.receipt(resultId);
  if (!receipt) {
    return opError('unknown_object', `No result with id ${resultId}.`, ctx.store.inventory().map((r) => r.id).join(', ') || undefined);
  }

  // Compaction may have released the body. That does not make the pin useless —
  // the receipt still carries the SQL, which is the thing the user edits and
  // re-runs — so it pins with no rows and says so, rather than refusing.
  let page;
  try {
    page = await ctx.store.page(resultId, 0, MAX_PREVIEW_ROWS, ctx.signal);
  } catch (error) {
    return engineError(error, ctx.signal);
  }

  let pinned;
  try {
    pinned = await ctx.workspace.pin({
      title,
      sql: receipt.sql,
      resultId,
      schema: receipt.schema,
      rows: page?.rows ?? [],
      rowCount: receipt.rowCount,
      nextOffset: page?.nextOffset ?? null,
      elapsedMs: page?.elapsedMs ?? 0,
    });
  } catch (error) {
    return engineError(error, ctx.signal);
  }

  const notes: string[] = [];
  if (title !== rawTitle.trim()) notes.push(`Title truncated to ${MAX_PIN_TITLE} characters.`);
  if (!page && receipt.rowCount > 0) notes.push('Result body released by compaction; the pinned query carries the SQL and can be re-run.');

  return inlineResult(
    'pin_result',
    receipt.sql,
    PIN_RESULT_SCHEMA,
    [[pinned.id, title, receipt.sql, receipt.rowCount]],
    page?.elapsedMs ?? 0,
    notes.length > 0 ? notes.join(' ') : undefined,
  );
};

export const OPERATIONS: Record<OpName, Handler> = {
  get_schema,
  describe_table,
  data_quality,
  column_stats,
  sample_rows,
  correlate,
  run_sql,
  validate_sql,
  search_values,
  distinct_values,
  text_frequency,
  time_series,
  join_coverage,
  aggregate,
  derive_table,
  create_view,
  drop_derived,
  read_result,
  create_chart,
  pin_result,
};

export const OPERATION_NAMES = Object.keys(OPERATIONS) as OpName[];

/** An unknown operation name gets the same mechanical treatment as an unknown table. */
export function unknownOperation(name: string): OpError {
  return opError(
    'invalid_argument',
    `No operation named ${name}.`,
    nearest(name, OPERATION_NAMES) ?? OPERATION_NAMES.join(', '),
  );
}

export const __testing = { nearest };
