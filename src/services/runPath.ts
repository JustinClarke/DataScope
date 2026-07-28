// The one run path (S4, D73, master §13.3 / §12.1). Every surface that can
// execute SQL enters here, so the answer to "can a runner execute a source
// mutation unguarded?" does not depend on how many runners exist — the
// precondition S5's query tabs need.
//
// A plain module rather than a hook: the four `GeneratedSql` blocks, the AI
// turns, the history rows and `openDestination` (not a component at all) cannot
// all call a hook. The modal this can raise is hoisted to `TransformGuardHost`,
// mounted once in `WorkbenchShell`, and the statement between the two lives in
// `stores/runGuard.ts`.
import { useQueryStore, CONSOLE_SESSION, type QuerySessionId } from '../stores/query';
import { useDrawerStore } from '../stores/drawer';
import { useRunGuardStore } from '../stores/runGuard';
import { runQuery } from './sql';
import { runTransform, materializeInsteadOfMutation, forceMutation, isSourceMutation } from './transforms';
import { classifyStatement } from '../lib/statementClass';
import type { QueryResult } from '../types';

// Drives the same queryStarted/querySucceeded/queryFailed cycle runQuery uses
// (services/sql.ts) so a CTAS/mutation's outcome shows up in Results/History
// exactly like a SELECT's does, even though it runs through the transformation
// layer instead.
function runAndTrack(session: QuerySessionId, sqlText: string, run: () => Promise<QueryResult>): void {
  useQueryStore.getState().queryStarted(session, sqlText);
  run()
    .then((res) => useQueryStore.getState().querySucceeded(session, res))
    .catch((err) =>
      useQueryStore.getState().queryFailed(session, err instanceof Error ? err.message : String(err)),
    );
}

/**
 * Execute, or intercept. The one place that decision is made.
 *
 * A run never refuses because another is in flight: `runQuery` already treats a
 * new run as superseding the old one (services/sql.ts — "first-class control
 * flow, not an error"). The console's own Run button still disables itself
 * while running, because that surface is the one *showing* the running state.
 */
export function requestRun(sql: string, session: QuerySessionId = CONSOLE_SESSION): void {
  const statement = sql.trim();
  if (!statement) return;

  const info = classifyStatement(statement);
  if (info.class === 'query') {
    // runQuery records failure/abort into the query store before it rejects
    // (services/sql.ts) — that store update, not this call site, is what
    // ResultsGrid reads. The rejection only matters to a caller awaiting
    // completion, which no run action does.
    runQuery(statement, session).catch(() => {});
    return;
  }
  if (isSourceMutation(info)) {
    useRunGuardStore.getState().hold(info, session);
    return;
  }
  runAndTrack(session, statement, () => runTransform(statement));
}

/**
 * Send SQL to the console, open it, and run it — every remote surface's entry.
 *
 * The buffer is replaced deliberately: a run action is the user asking for this
 * exact query, and the console must show what ran or the buffer and the results
 * disagree. (A *navigation* click never overwrites the buffer — S3's rule. The
 * two are the same principle: the buffer follows stated intent, never a side
 * effect.) `activateConsole` opens the drawer on the console view and nothing
 * else; no result ever expands it.
 */
export function runInConsole(sql: string): void {
  const statement = sql.trim();
  if (!statement) return;
  useQueryStore.getState().setSql(CONSOLE_SESSION, statement);
  useDrawerStore.getState().activateConsole();
  requestRun(statement, CONSOLE_SESSION);
}

/** Guard resolution: run the held statement against a materialized clone instead. */
export function materializeGuarded(): void {
  const { pending: info, pendingSession } = useRunGuardStore.getState();
  if (!info) return;
  useRunGuardStore.getState().release();
  runAndTrack(pendingSession, info.sql, () => materializeInsteadOfMutation(info));
}

/** Guard resolution: run the held statement against the source table after all. */
export function modifyAnywayGuarded(): void {
  const { pending: info, pendingSession } = useRunGuardStore.getState();
  if (!info) return;
  useRunGuardStore.getState().release();
  runAndTrack(pendingSession, info.sql, () => forceMutation(info));
}

/** Guard resolution: drop the held statement, executing nothing. */
export function cancelGuarded(): void {
  useRunGuardStore.getState().release();
}
