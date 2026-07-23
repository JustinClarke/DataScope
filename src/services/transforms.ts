// Transformation layer (§10 Module 2, §12.1) — `CREATE TABLE AS` registration,
// the mutation guard, and one-click undo for derived tables. SELECT/WITH stay
// on services/sql.ts's row-capped path and never reach here; SqlModule routes
// any other statement class through `runTransform`.
import type { ClassifiedColumn, ColumnProfile, Dataset, QueryResult, TableRegistryEntry } from '../types';
import { useDatasetsStore } from '../stores/datasets';
import { classifyStatement, redirectMutationTarget, type StatementInfo } from '../lib/statementClass';
import { dedupeTableName, sanitizeTableName } from '../features/ingestion/formatPolicy';
import { classifyTable, profileTable, quoteIdentifier, summarizeTable } from './ingestion';

type EngineModule = typeof import('../workers/duckdb.worker');
let engineModule: Promise<EngineModule> | null = null;
function loadEngine(): Promise<EngineModule> {
  if (!engineModule) engineModule = import('../workers/duckdb.worker');
  return engineModule;
}

export class TransformError extends Error {}

/**
 * Thrown by `runTransform` for a mutation (UPDATE/DELETE/ALTER/DROP)
 * targeting a source — a non-derived — table (§12.1). The caller (SqlModule)
 * catches this to show a confirm prompt instead of running the statement,
 * then re-invokes via `materializeInsteadOfMutation` or `forceMutation` with
 * the same `info` this error carries, rather than reclassifying from scratch.
 */
export class MutationGuardRequired extends Error {
  readonly info: StatementInfo;
  constructor(info: StatementInfo) {
    super(`"${info.mutationTarget}" is a source table — mutating it in place can't be undone.`);
    this.info = info;
  }
}

function existingTableNames(): Set<string> {
  return new Set(useDatasetsStore.getState().tables.map((t) => t.tableName));
}

async function execute(engine: EngineModule, sql: string): Promise<void> {
  try {
    await engine.duckDBEngine.execute(sql);
  } catch (error) {
    throw new TransformError(error instanceof Error ? error.message : String(error));
  }
}

async function describeTable(engine: EngineModule, tableName: string) {
  const [describeResult, countResult, sizeResult] = await Promise.all([
    engine.duckDBEngine.execute(`DESCRIBE ${quoteIdentifier(tableName)}`),
    engine.duckDBEngine.execute(`SELECT COUNT(*) AS n FROM ${quoteIdentifier(tableName)}`),
    engine.duckDBEngine.execute(
      `SELECT estimated_size FROM duckdb_tables() WHERE table_name = '${tableName.replace(/'/g, "''")}'`,
    ),
  ]);
  return {
    columnCount: describeResult.rowCount,
    rowCount: Number(countResult.rows[0]?.[0] ?? 0),
    memoryBytes: Number(sizeResult.rows[0]?.[0] ?? 0),
  };
}

/**
 * Profiles, classifies, and registers an already-created table as a derived
 * `TableRegistryEntry` — its own single-table `Dataset`, the same 1:1 shape a
 * single-file drop uses (services/ingestion.ts's `loadFile`). Reuses
 * ingestion's own summarize/classify helpers rather than a second
 * implementation of either.
 */
async function registerDerivedTable(
  engine: EngineModule,
  tableName: string,
  generatingSql: string,
): Promise<TableRegistryEntry> {
  const { columnCount, rowCount, memoryBytes } = await describeTable(engine, tableName);
  const profile: ColumnProfile[] = await summarizeTable(engine, tableName);
  const columns: ClassifiedColumn[] = await classifyTable(engine, tableName, profile, rowCount);

  const dataset: Dataset = {
    id: crypto.randomUUID(),
    name: tableName,
    sourceType: 'derived',
    tableNames: [tableName],
    ingestedAt: new Date().toISOString(),
  };
  const entry: TableRegistryEntry = {
    id: crypto.randomUUID(),
    tableName,
    datasetId: dataset.id,
    origin: 'derived',
    rowCount,
    columnCount,
    memoryBytes,
    createdAt: new Date().toISOString(),
    profile,
    columns,
    generatingSql,
  };
  useDatasetsStore.getState().registerDataset(dataset, [entry]);
  return entry;
}

// DDL/mutation statements have no row-shaped result of their own — a
// one-cell confirmation keeps the Results/History panel's existing shape
// rather than adding a second display mode just for this statement class.
function toQueryResult(message: string): QueryResult {
  return { columnNames: ['result'], columnTypes: ['Utf8'], rows: [[message]], rowCount: 1, executionTimeMs: 0 };
}

/** True when `info` is a mutation whose target is a registered source (non-derived) table — the case the guard exists for. */
export function isSourceMutation(info: StatementInfo): boolean {
  if (info.class !== 'mutation' || !info.mutationTarget) return false;
  const table = useDatasetsStore.getState().tables.find((t) => t.tableName === info.mutationTarget);
  return table !== undefined && table.origin !== 'derived';
}

async function reconcileAfterMutation(
  tableId: string,
  mutationKind: StatementInfo['mutationKind'],
): Promise<void> {
  if (mutationKind === 'drop') {
    useDatasetsStore.getState().removeTable(tableId);
    return;
  }
  try {
    await profileTable(tableId);
  } catch {
    // A rename (`ALTER TABLE ... RENAME TO`) or similar shape change can
    // leave the old table name unresolvable to DESCRIBE/SUMMARIZE — the
    // mutation itself already succeeded; only this registry snapshot is
    // stale, so this is logged rather than surfaced as a failed statement.
    console.warn(`Couldn't re-profile table ${tableId} after a mutation — it may have changed shape or been renamed.`);
  }
}

/**
 * Runs any non-SELECT statement from the SQL playground. A `CREATE TABLE AS`
 * derives and registers a new table (§12.1); a mutation against a source
 * table throws `MutationGuardRequired` instead of running, so the caller
 * shows a confirm prompt; a mutation against a derived (or unrecognized)
 * table runs as-is and re-profiles its target afterward so the registry
 * doesn't go stale; anything else runs unwrapped, untouched by this layer.
 */
export async function runTransform(sql: string): Promise<QueryResult> {
  const info = classifyStatement(sql);
  if (isSourceMutation(info)) throw new MutationGuardRequired(info);

  const engine = await loadEngine();

  if (info.class === 'ctas' && info.ctasTable) {
    await execute(engine, info.sql);
    await registerDerivedTable(engine, info.ctasTable, info.sql);
    return toQueryResult(`Created derived table "${info.ctasTable}".`);
  }

  await execute(engine, info.sql);

  if (info.class === 'mutation' && info.mutationTarget) {
    const target = useDatasetsStore.getState().tables.find((t) => t.tableName === info.mutationTarget);
    if (target) await reconcileAfterMutation(target.id, info.mutationKind);
  }

  return toQueryResult('Statement executed.');
}

/**
 * The mutation guard's default choice: clones the source table, redirects
 * the statement onto the clone, and registers the clone as a derived table —
 * the original source is never touched, so it keeps its free undo-by-never-
 * mutating property (§12.1) instead of forfeiting it.
 */
export async function materializeInsteadOfMutation(info: StatementInfo): Promise<QueryResult> {
  if (!info.mutationTarget) throw new TransformError('Not a mutation statement.');
  const engine = await loadEngine();
  const taken = existingTableNames();
  const cloneName = dedupeTableName(sanitizeTableName(`${info.mutationTarget}_edit`), taken);
  const cloneSql = `CREATE TABLE ${quoteIdentifier(cloneName)} AS SELECT * FROM ${quoteIdentifier(info.mutationTarget)}`;

  await execute(engine, cloneSql);

  // DROP has nothing left to redirect toward once the clone exists — an
  // untouched copy of the table the user was about to lose *is* what
  // "materialize instead" means for this statement kind, so the original
  // statement is never re-run against the clone.
  if (info.mutationKind === 'drop') {
    const entry = await registerDerivedTable(engine, cloneName, cloneSql);
    return toQueryResult(`Kept "${entry.tableName}" as a copy — "${info.mutationTarget}" was left untouched.`);
  }

  const redirectedSql = redirectMutationTarget(info, cloneName);
  try {
    await execute(engine, redirectedSql);
  } catch (error) {
    await engine.duckDBEngine.execute(`DROP TABLE IF EXISTS ${quoteIdentifier(cloneName)}`);
    throw error;
  }

  const entry = await registerDerivedTable(engine, cloneName, redirectedSql);
  return toQueryResult(`Materialized "${entry.tableName}" — "${info.mutationTarget}" was left untouched.`);
}

/**
 * The mutation guard's alternate choice: runs the raw statement against the
 * source with no undo, then re-profiles (or, for a DROP, de-registers) the
 * target so the registry reflects the change.
 */
export async function forceMutation(info: StatementInfo): Promise<QueryResult> {
  if (!info.mutationTarget) throw new TransformError('Not a mutation statement.');
  const engine = await loadEngine();
  await execute(engine, info.sql);

  const target = useDatasetsStore.getState().tables.find((t) => t.tableName === info.mutationTarget);
  if (target) await reconcileAfterMutation(target.id, info.mutationKind);

  return toQueryResult(`Modified "${info.mutationTarget}" directly — this can't be undone.`);
}
