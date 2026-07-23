import type { QueryResult } from '../types';
import { useQueryStore } from '../stores/query';

// duckdb-wasm (and the multi-MB WASM it pulls) is only needed once a query
// actually runs, so the engine module is imported lazily — this is what keeps
// it out of the initial bundle.
type EngineModule = typeof import('../workers/duckdb.worker');
let engineModule: Promise<EngineModule> | null = null;
function loadEngine(): Promise<EngineModule> {
  if (!engineModule) engineModule = import('../workers/duckdb.worker');
  return engineModule;
}

interface InFlightQuery {
  id: string;
  controller: AbortController;
}

// One query panel, one in-flight query. A new run supersedes the previous one.
let inFlight: InFlightQuery | null = null;
const isCurrent = (id: string): boolean => inFlight?.id === id;

// The results grid never holds a full multi-million-row result in JS state
// (state tree, 01-foundation/02-state-management.md) — a SELECT with no
// LIMIT of its own is capped here regardless of the source table's true size.
// `rowCount` on the returned result still reports the *true* total (a cheap
// COUNT(*) over the same subquery); only `rows.length` is capped.
export const RESULT_ROW_CAP = 100_000;

/** Strips a trailing `;` and surrounding whitespace so a statement can be safely re-wrapped in a subquery. */
function stripTrailingSemicolon(sql: string): string {
  return sql.trim().replace(/;\s*$/, '');
}

/**
 * Only a SELECT (or a CTE starting with WITH) is safe to wrap in
 * `SELECT * FROM (...) LIMIT/OFFSET` — DDL/DML (`CREATE TABLE`, `INSERT`, …)
 * would break under that wrapping and don't produce large row sets anyway,
 * so they run unwrapped, uncapped, exactly as before this cap existed.
 */
export function isSelectLike(sql: string): boolean {
  return /^(select|with)\b/i.test(sql.trim());
}

async function executeCapped(
  engine: EngineModule,
  sql: string,
  signal: AbortSignal,
): Promise<QueryResult> {
  const trimmed = stripTrailingSemicolon(sql);
  if (!isSelectLike(trimmed)) {
    return engine.duckDBEngine.execute(sql, { signal });
  }

  const [countResult, pageResult] = await Promise.all([
    engine.duckDBEngine.execute(`SELECT count(*) AS n FROM (${trimmed}) AS _datascope_count`, { signal }),
    engine.duckDBEngine.execute(`SELECT * FROM (${trimmed}) AS _datascope_page LIMIT ${RESULT_ROW_CAP}`, {
      signal,
    }),
  ]);

  const trueRowCount = Number(countResult.rows[0]?.[0] ?? pageResult.rowCount);
  return {
    ...pageResult,
    rowCount: trueRowCount,
    executionTimeMs: countResult.executionTimeMs + pageResult.executionTimeMs,
  };
}

export async function runQuery(sql: string): Promise<QueryResult> {
  // Supersede any running query — first-class control flow, not an error. The
  // stale run's late result is discarded (see the isCurrent guards) so it can
  // never overwrite the newer query's state.
  inFlight?.controller.abort();

  const id = crypto.randomUUID();
  const controller = new AbortController();
  inFlight = { id, controller };
  useQueryStore.getState().queryStarted(sql);

  let engine: EngineModule;
  try {
    engine = await loadEngine();
  } catch (error) {
    if (isCurrent(id)) {
      useQueryStore.getState().queryFailed(
        error instanceof Error ? error.message : 'Failed to load the query engine',
      );
      inFlight = null;
    }
    throw error;
  }

  try {
    const result = await executeCapped(engine, sql, controller.signal);
    if (isCurrent(id)) useQueryStore.getState().querySucceeded(result);
    return result;
  } catch (error) {
    if (isCurrent(id)) {
      if (engine.isAbortError(error)) {
        // Cancelled/superseded: return to idle without a failed history entry.
        useQueryStore.getState().clearResult();
      } else {
        useQueryStore.getState().queryFailed(engine.toErrorMessage(error));
      }
    }
    throw error;
  } finally {
    if (isCurrent(id)) inFlight = null;
  }
}

/**
 * Cancel the in-flight query. With a single query panel there is at most one;
 * an optional id guards against a stale cancel aimed at a query that already
 * finished or was replaced.
 */
export function cancelQuery(queryId?: string): void {
  if (!inFlight) return;
  if (queryId !== undefined && queryId !== inFlight.id) return;
  inFlight.controller.abort();
}

export function getHistory(): QueryResult[] {
  return useQueryStore
    .getState()
    .history.flatMap((entry) => (entry.result ? [entry.result] : []));
}
