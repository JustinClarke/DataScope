import { QueryHistory } from './QueryResultsPanel';

/**
 * There is exactly one run log per session, so the tab has one fixed subject —
 * the same pattern `MAP_TAB_SUBJECT` follows for the dataset-wide map.
 */
export const HISTORY_TAB_SUBJECT = 'session';

/**
 * The session's run log, in a tab of its own (S6.7). Until now it was a
 * `<details>` disclosure at the bottom of the drawer's Info pane — under this
 * item Info holds the *current* result and nothing past it, so a session-wide
 * log needed a home that isn't competing with one result for room.
 *
 * Deliberately thin: `QueryHistory` is unchanged, reads the same session-wide
 * `history` array it always did, and its rows already carry `RunSqlButton` —
 * so re-running an old query from here goes down the one guarded run path
 * (S4) and lands back in the drawer's Info exactly as any fresh run does.
 */
export function HistoryTab() {
  return (
    <div data-testid="history-tab" className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-medium text-(--color-fg)">Session history</h2>
      <QueryHistory />
    </div>
  );
}
