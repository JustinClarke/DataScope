// Deterministic profiler for exp20 (DESIGN.md A1/A2): per-column stats +
// semantic classification + FK inference are reused verbatim from the
// product's own src/lib (never re-derived); grain description and
// rollup-view synthesis are new here — nothing in src/lib states a table's
// grain in prose or generates a fanout-collapsing view.
//
// Everything below is pure/deterministic given a DuckDB connection: same
// data in, same profile/edges/views out. No model call in this file.
import type { DuckDBConnection } from '@duckdb/node-api';
import { classifyColumns } from '../../../src/lib/classifier';
import { parseSummarizeResult } from '../../../src/lib/profile';
import {
  assembleEdges,
  buildContainmentSql,
  buildParentKeySql,
  generateCandidates,
  parseContainmentSql,
  parseParentKeySql,
  scoreCandidate,
  type FkEdge,
} from '../../../src/lib/relationshipInference';
import type { ClassifiedColumn, ColumnProfile, QueryResult } from '../../../src/types';
import type { TableRegistryEntry } from '../../../src/types/dataset';

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function normalizeCell(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  return value;
}

async function runQuery(conn: DuckDBConnection, sql: string): Promise<QueryResult> {
  const t0 = performance.now();
  const result = await conn.run(sql);
  const columnNames = result.columnNames();
  const rows = (await result.getRowsJS()).map((row) => row.map(normalizeCell));
  return { columnNames, columnTypes: [], rows, rowCount: rows.length, executionTimeMs: performance.now() - t0 };
}

function firstObjectRow(result: QueryResult): Record<string, unknown> | undefined {
  const row = result.rows[0];
  if (!row) return undefined;
  return Object.fromEntries(result.columnNames.map((name, i) => [name, row[i]]));
}

// ---- profiling + classification (reuses parseSummarizeResult / classifyColumns as-is) ----

export async function profileTable(conn: DuckDBConnection, tableName: string): Promise<ColumnProfile[]> {
  const result = await runQuery(
    conn,
    `SELECT column_name, column_type, min, max, approx_unique, avg, std, null_percentage
     FROM (SUMMARIZE ${quoteIdent(tableName)})`,
  );
  return parseSummarizeResult(result);
}

/** Exact COUNT(DISTINCT) per column in one scan — mirrors ingestion.ts's exactDistinctCounts (SUMMARIZE's HLL estimate is unreliable for the near-unique identifier rule). */
async function exactDistinctCounts(
  conn: DuckDBConnection,
  tableName: string,
  columnNames: string[],
): Promise<Map<string, number>> {
  if (columnNames.length === 0) return new Map();
  const projections = columnNames.map((name, i) => `COUNT(DISTINCT ${quoteIdent(name)}) AS d${i}`).join(', ');
  const result = await runQuery(conn, `SELECT ${projections} FROM ${quoteIdent(tableName)}`);
  const row = result.rows[0] ?? [];
  return new Map(columnNames.map((name, i) => [name, Number(row[i] ?? 0)]));
}

export async function classifyTableColumns(
  conn: DuckDBConnection,
  tableName: string,
  profile: ColumnProfile[],
  rowCount: number,
): Promise<ClassifiedColumn[]> {
  const exact = await exactDistinctCounts(conn, tableName, profile.map((p) => p.name));
  const classifyInput = profile.map((p) => ({ ...p, cardinality: exact.get(p.name) ?? p.cardinality }));
  return classifyColumns(classifyInput, rowCount);
}

/** Builds the full TableRegistryEntry[] `generateCandidates`/FK inference expects, for a fixed list of already-bootstrapped tables. */
export async function buildTableRegistry(conn: DuckDBConnection, tableNames: string[]): Promise<TableRegistryEntry[]> {
  const entries: TableRegistryEntry[] = [];
  const now = new Date().toISOString();
  for (const tableName of tableNames) {
    const countResult = await runQuery(conn, `SELECT COUNT(*) AS n FROM ${quoteIdent(tableName)}`);
    const rowCount = Number(countResult.rows[0]?.[0] ?? 0);
    const profile = await profileTable(conn, tableName);
    const columns = await classifyTableColumns(conn, tableName, profile, rowCount);
    entries.push({
      id: tableName,
      tableName,
      datasetId: 'exp20',
      origin: 'sample',
      rowCount,
      columnCount: columns.length,
      memoryBytes: 0,
      createdAt: now,
      profile,
      columns,
    });
  }
  return entries;
}

// ---- FK inference (reuses generateCandidates/scoreCandidate/assembleEdges as-is) ----

/** Runs the two evidence probes per candidate and assembles scored, confidence-tiered edges. Parent-key stats are cached per (table, column) — child-independent, per relationshipInference.ts's own doc comment. */
export async function inferEdges(conn: DuckDBConnection, tables: TableRegistryEntry[]): Promise<FkEdge[]> {
  const candidates = generateCandidates(tables);
  const parentKeyCache = new Map<string, Awaited<ReturnType<typeof parseParentKeySql>>>();

  const scored = [];
  for (const candidate of candidates) {
    const parentKeyKey = `${candidate.parentTable}.${candidate.parentColumn}`;
    let keyStats = parentKeyCache.get(parentKeyKey);
    if (!keyStats) {
      const result = await runQuery(conn, buildParentKeySql(candidate.parentTable, candidate.parentColumn));
      keyStats = parseParentKeySql(firstObjectRow(result));
      parentKeyCache.set(parentKeyKey, keyStats);
    }
    const containmentResult = await runQuery(conn, buildContainmentSql(candidate));
    const containmentStats = parseContainmentSql(firstObjectRow(containmentResult));
    const s = scoreCandidate(candidate, containmentStats, keyStats);
    if (s) scored.push(s);
  }
  return assembleEdges(scored);
}

// ---- grain description (new — nothing in src/lib states this in prose) ----

export interface FanoutStats {
  avgRowsPerParentKey: number;
  maxRowsPerParentKey: number;
}

/** Per the Honeydew fan-out heuristic cited in RESEARCH.md §5: avg <=1.2 and max <=2 reads as a "one" relationship; above that, the child is a genuine fanout (line-grain) relative to the parent. */
export async function fanoutStats(conn: DuckDBConnection, childTable: string, childColumn: string): Promise<FanoutStats> {
  const result = await runQuery(
    conn,
    `SELECT AVG(cnt) AS avg_cnt, MAX(cnt) AS max_cnt FROM (
       SELECT ${quoteIdent(childColumn)}, COUNT(*) AS cnt FROM ${quoteIdent(childTable)}
       WHERE ${quoteIdent(childColumn)} IS NOT NULL GROUP BY ${quoteIdent(childColumn)}
     )`,
  );
  const row = result.rows[0] ?? [];
  return { avgRowsPerParentKey: Number(row[0] ?? 1), maxRowsPerParentKey: Number(row[1] ?? 1) };
}

const FANOUT_AVG_THRESHOLD = 1.2;
const FANOUT_MAX_THRESHOLD = 2;

function singularize(name: string): string {
  if (name.endsWith('ies')) return `${name.slice(0, -3)}y`;
  if (name.endsWith('ses')) return name.slice(0, -2);
  if (name.endsWith('s')) return name.slice(0, -1);
  return name;
}

/**
 * One plain-language sentence per table, covering *every* confident parent it
 * fans out under — not just the first. A line-item table commonly references
 * more than one parent (order_items fans out under both orders and products
 * independently); reporting only the first-found relationship would silently
 * hide whichever one a given question actually depends on. Only
 * `confident`-tier edges decide grain — a `candidate`-tier edge is too
 * uncertain to assert a grain claim from.
 */
export async function describeGrain(
  conn: DuckDBConnection,
  table: TableRegistryEntry,
  edges: FkEdge[],
): Promise<string> {
  const outgoingConfident = edges.filter((e) => e.childTable === table.tableName && e.confidence === 'confident');
  const fanoutClauses: string[] = [];
  for (const edge of outgoingConfident) {
    const fanout = await fanoutStats(conn, edge.childTable, edge.childColumn);
    if (fanout.avgRowsPerParentKey > FANOUT_AVG_THRESHOLD || fanout.maxRowsPerParentKey > FANOUT_MAX_THRESHOLD) {
      fanoutClauses.push(
        `fans out under ${edge.parentTable} (~${fanout.avgRowsPerParentKey.toFixed(1)} ${table.tableName} rows per ${edge.parentTable} row, max ${fanout.maxRowsPerParentKey})`,
      );
    }
  }
  if (fanoutClauses.length > 0) {
    return (
      `${table.tableName} is line-grain, not entity-grain: it ${fanoutClauses.join('; it also ')}. ` +
      `Aggregating a measure here without first rolling up to the relevant parent's grain double-counts.`
    );
  }
  return `One row per ${singularize(table.tableName)} (${table.rowCount} total) — not a fanout child of any other table at >${FANOUT_AVG_THRESHOLD}x average.`;
}

/**
 * DESIGN.md §3's A1✗ negative control: the same grain claim `describeGrain`
 * makes, deliberately corrupted — parent/child swapped (the sentence now
 * claims the *parent* fans out under the child) and the fanout ratios
 * negated. If a model's A1 accuracy gain doesn't drop when fed this instead
 * of the real grain statement, it isn't reading the profile and the A1 gain
 * is a prompt-length/token-count artifact, not comprehension.
 */
export async function describeGrainCorrupted(
  conn: DuckDBConnection,
  table: TableRegistryEntry,
  edges: FkEdge[],
): Promise<string> {
  const outgoingConfident = edges.filter((e) => e.childTable === table.tableName && e.confidence === 'confident');
  const sentences: string[] = [];
  for (const edge of outgoingConfident) {
    const fanout = await fanoutStats(conn, edge.childTable, edge.childColumn);
    if (fanout.avgRowsPerParentKey > FANOUT_AVG_THRESHOLD || fanout.maxRowsPerParentKey > FANOUT_MAX_THRESHOLD) {
      sentences.push(
        `${edge.parentTable} is line-grain, not entity-grain: it fans out under ${table.tableName} ` +
          `(~${(-fanout.avgRowsPerParentKey).toFixed(1)} ${edge.parentTable} rows per ${table.tableName} row, max ${-fanout.maxRowsPerParentKey}). ` +
          `Aggregating a measure here without first rolling up to the relevant parent's grain double-counts.`,
      );
    }
  }
  if (sentences.length > 0) return sentences.join(' ');
  return `One row per ${singularize(table.tableName)} (${table.rowCount} total) — not a fanout child of any other table at >${FANOUT_AVG_THRESHOLD}x average.`;
}

// ---- rollup view synthesis (new — the load-bearing A2 mechanism) ----

const QUANTITY_NAME = /(quantity|qty|count|units)/i;
const AMOUNT_NAME = /(price|amount|cost|value|revenue|total|fee|rate)/i;
const NUMERIC_PHYSICAL_TYPE = /INT|DECIMAL|DOUBLE|FLOAT|NUMERIC|REAL/i;

/**
 * Column-name-pattern heuristic (same class as relationshipInference's
 * nameAgrees) for "this pair of columns, multiplied, is probably a
 * monetary/value measure" — e.g. quantity * unit_price. The quantity side is
 * matched on physical type, not semanticType: a real per-line quantity (1-10
 * units) is exactly the shape the classifier's CATEGORICAL_CARDINALITY_MAX
 * heuristic mislabels Categorical, and that mislabel is correct for
 * *display* purposes but wrong for "is this a measure" — so this check
 * doesn't inherit it. The amount side stays Quantitative-only since a price
 * column low-cardinality enough to be mislabeled is a much rarer case here.
 * Disclosed limitation either way: purely name-driven, not verified against
 * actual semantics.
 */
function findValuePairs(columns: ClassifiedColumn[]): Array<[ClassifiedColumn, ClassifiedColumn]> {
  const quantityCols = columns.filter((c) => NUMERIC_PHYSICAL_TYPE.test(c.physicalType) && QUANTITY_NAME.test(c.name));
  const amountCols = columns.filter((c) => c.semanticType === 'Quantitative' && AMOUNT_NAME.test(c.name));
  const pairs: Array<[ClassifiedColumn, ClassifiedColumn]> = [];
  for (const q of quantityCols) for (const a of amountCols) if (q.name !== a.name) pairs.push([q, a]);
  return pairs;
}

export interface RollupMeasureColumn {
  name: string;
  kind: 'row_count' | 'sum' | 'avg' | 'product_sum';
}

export interface RollupView {
  viewName: string;
  sql: string;
  /** Plain-language description of what the view is and why it exists, for the A2 prompt block. */
  description: string;
  grainColumn: string;
  parentTable: string;
  /** Structured record of every non-key column the view projects — lets a prompt-assembly layer pick a sensible measure to demonstrate without regex-parsing `sql`. */
  measureColumns: RollupMeasureColumn[];
}

/**
 * For a confident fanout edge (childTable is line-grain relative to
 * parentTable), synthesizes a view that rolls the child up to the parent's
 * key: a row count, SUM/AVG of every Quantitative column, and SUM of every
 * name-matched quantity*amount pair (the deterministic stand-in for "line
 * revenue" without knowing the domain). Returns null for edges that aren't
 * genuine fanouts (fanoutStats below threshold — a rollup of a 1:1 edge is
 * not a grain fix, just a redundant join).
 *
 * `allEdges` excludes every confident FK column on this child table (not
 * just `edge`'s own) from the measure set: a foreign key is numeric and
 * often passes the Quantitative classifier, but SUM/AVG of a key — this
 * edge's own grouping key, or a different edge's key on the same row — is
 * never a real measure. Found live: without this, `orders_rollup_by_customers`
 * generated `SUM(customer_id)`/`AVG(customer_id)` as if the join key were a
 * business measure, the same class of error a model made unprompted when
 * handed an early version of this view (see BUILD_NOTES.md).
 */
export async function buildRollupView(
  conn: DuckDBConnection,
  edge: FkEdge,
  childColumns: ClassifiedColumn[],
  allEdges: readonly FkEdge[],
): Promise<RollupView | null> {
  const fanout = await fanoutStats(conn, edge.childTable, edge.childColumn);
  if (fanout.avgRowsPerParentKey <= FANOUT_AVG_THRESHOLD && fanout.maxRowsPerParentKey <= FANOUT_MAX_THRESHOLD) return null;

  const fkColumnNames = new Set(
    allEdges.filter((e) => e.childTable === edge.childTable && e.confidence === 'confident').map((e) => e.childColumn),
  );
  const nonKeyColumns = childColumns.filter((c) => !fkColumnNames.has(c.name));
  const quantitative = nonKeyColumns.filter((c) => c.semanticType === 'Quantitative');
  const valuePairs = findValuePairs(nonKeyColumns);

  const projections: string[] = [`${quoteIdent(edge.childColumn)} AS ${quoteIdent(edge.parentColumn)}`, `COUNT(*) AS ${edge.childTable}_row_count`];
  const measureColumns: RollupMeasureColumn[] = [{ name: `${edge.childTable}_row_count`, kind: 'row_count' }];
  for (const col of quantitative) {
    projections.push(`SUM(${quoteIdent(col.name)}) AS ${col.name}_sum`, `AVG(${quoteIdent(col.name)}) AS ${col.name}_avg`);
    measureColumns.push({ name: `${col.name}_sum`, kind: 'sum' }, { name: `${col.name}_avg`, kind: 'avg' });
  }
  const valueColumnNames: string[] = [];
  for (const [qty, amt] of valuePairs) {
    const alias = `${qty.name}_${amt.name}_product_sum`;
    projections.push(`SUM(${quoteIdent(qty.name)} * ${quoteIdent(amt.name)}) AS ${alias}`);
    measureColumns.push({ name: alias, kind: 'product_sum' });
    valueColumnNames.push(alias);
  }

  const viewName = `${edge.childTable}_rollup_by_${edge.parentTable}`;
  const sql =
    `CREATE VIEW ${quoteIdent(viewName)} AS SELECT ${projections.join(', ')} ` +
    `FROM ${quoteIdent(edge.childTable)} WHERE ${quoteIdent(edge.childColumn)} IS NOT NULL GROUP BY ${quoteIdent(edge.childColumn)}`;

  const description =
    `${viewName} — one row per ${edge.parentTable} (${edge.parentColumn}), rolling up ${edge.childTable} from its ` +
    `line grain. Columns: ${edge.childTable}_row_count (lines in this ${edge.parentTable}), ` +
    `<col>_sum/<col>_avg for each numeric ${edge.childTable} column` +
    (valueColumnNames.length > 0 ? `, and ${valueColumnNames.join(', ')} (quantity x amount rollups, inferred from column-name pairing — verify against the question's actual measure before trusting the label).` : '.');

  return { viewName, sql, description, grainColumn: edge.parentColumn, parentTable: edge.parentTable, measureColumns };
}

export async function buildAllRollupViews(
  conn: DuckDBConnection,
  edges: FkEdge[],
  tables: TableRegistryEntry[],
): Promise<RollupView[]> {
  const confident = edges.filter((e) => e.confidence === 'confident');
  const views: RollupView[] = [];
  for (const edge of confident) {
    const childTable = tables.find((t) => t.tableName === edge.childTable);
    if (!childTable?.columns) continue;
    const view = await buildRollupView(conn, edge, childTable.columns, edges);
    if (view) views.push(view);
  }
  return views;
}
