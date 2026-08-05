import type { QueryResult } from '../types';
import { useQueryStore, getSession, CONSOLE_SESSION, type QuerySessionId } from '../stores/query';
import { analystCore } from './analyst';
import { isOpError } from '../lib/analyst/types';
import { MAX_PREVIEW_ROWS } from '../lib/analyst/operations';

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

// One in-flight query *per session* (S5). Superseding is the rule inside a
// session — a new run replaces the previous one — and would be a bug across
// them: a run in a pinned query tab must not abort the console's slow query.
const inFlight = new Map<QuerySessionId, InFlightQuery>();
const isCurrent = (session: QuerySessionId, id: string): boolean => inFlight.get(session)?.id === id;

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

export async function runQuery(sql: string, session: QuerySessionId = CONSOLE_SESSION): Promise<QueryResult> {
  // Supersede this session's running query — first-class control flow, not an
  // error. The stale run's late result is discarded (see the isCurrent guards)
  // so it can never overwrite the newer query's state. Other sessions are left
  // alone.
  inFlight.get(session)?.controller.abort();

  const id = crypto.randomUUID();
  const controller = new AbortController();
  inFlight.set(session, { id, controller });
  useQueryStore.getState().queryStarted(session, sql);

  let engine: EngineModule;
  try {
    engine = await loadEngine();
  } catch (error) {
    if (isCurrent(session, id)) {
      useQueryStore.getState().queryFailed(
        session,
        error instanceof Error ? error.message : 'Failed to load the query engine',
      );
      inFlight.delete(session);
    }
    throw error;
  }

  try {
    const result = await executeCapped(engine, sql, controller.signal);
    if (isCurrent(session, id)) useQueryStore.getState().querySucceeded(session, result);
    return result;
  } catch (error) {
    if (isCurrent(session, id)) {
      if (engine.isAbortError(error)) {
        // Cancelled/superseded: return to idle without a failed history entry.
        useQueryStore.getState().clearResult(session);
      } else {
        useQueryStore.getState().queryFailed(session, engine.toErrorMessage(error));
      }
    }
    throw error;
  } finally {
    if (isCurrent(session, id)) inFlight.delete(session);
  }
}

/**
 * Cancel a session's in-flight query. There is at most one per session; the
 * optional id guards against a stale cancel aimed at a query that already
 * finished or was replaced.
 */
export function cancelQuery(session: QuerySessionId = CONSOLE_SESSION, queryId?: string): void {
  const current = inFlight.get(session);
  if (!current) return;
  if (queryId !== undefined && queryId !== current.id) return;
  current.controller.abort();
}

/**
 * Paging replaces the 100k cliff (A2, master §13.3) — rather than re-running
 * the capped statement with an `OFFSET` (unsound for an unordered query, see
 * `resultStore.ts`), the first call materializes it once through the analyst
 * core's `run_sql` and *replaces* the ad hoc capped preview with that stable
 * page; every call after pages the same materialization via `read_result`.
 * Returns an error message on failure, `null` on success or when there is
 * nothing to load.
 */
export async function loadMoreRows(session: QuerySessionId = CONSOLE_SESSION): Promise<string | null> {
  const { result, lastRunSql } = getSession(session);
  if (!result) return null;

  if (result.resultId) {
    if (result.nextOffset === null || result.nextOffset === undefined) return null;
    const outcome = await analystCore().call('read_result', {
      resultId: result.resultId,
      offset: result.nextOffset,
      limit: MAX_PREVIEW_ROWS,
    });
    if (isOpError(outcome)) return outcome.message;
    useQueryStore.getState().setResultPage(session, [...result.rows, ...outcome.rows], result.resultId, outcome.nextOffset);
    return null;
  }

  const outcome = await analystCore().call('run_sql', { sql: lastRunSql, limit: MAX_PREVIEW_ROWS });
  if (isOpError(outcome)) return outcome.message;
  if (!outcome.resultId) return null;
  useQueryStore.getState().setResultPage(session, outcome.rows, outcome.resultId, outcome.nextOffset);
  return null;
}

export function getHistory(): QueryResult[] {
  return useQueryStore
    .getState()
    .history.flatMap((entry) => (entry.result ? [entry.result] : []));
}
