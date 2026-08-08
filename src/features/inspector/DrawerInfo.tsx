// The drawer's Info pane (S6.5/S6.7, D73, master §13.3). Two things, in one
// deliberate order: what you have *selected*, then what you have *run* — and
// each only when there is one.
//
// The selection scent is unchanged from W7 — it stays rung 2 of the detail
// ladder, still ambient, still linking out to the full tab — but it is a strip
// across the top now rather than the pane's whole content, and it does not
// mount at all with nothing selected, so its "select something to inspect it"
// sentence can never sit on top of a real answer.
//
// S6.7 scopes what follows it down to the result itself. The chart S6.5 put
// beside the grid is a *different view* of the result and the history log is
// *every* result this session; neither is "this result", so both are out — the
// chart to its own `charts` tab, the log to the `history` tab this item adds.
// What is left is the grid, with Pin to tab above it as the one obvious move.
import { useCallback, useEffect, useRef } from "react";
import { Download, History, Pin } from "lucide-react";
import { useDrawerStore } from "../../stores/drawer";
import { useQuerySession, CONSOLE_SESSION } from "../../stores/query";
import { useDatasetsStore } from "../../stores/datasets";
import { useSelectionStore } from "../../stores/selection";
import { useTabsStore } from "../../stores/tabs";
import { pinConsoleQuery } from "../../services/queryTabs";
import { QueryOutput } from "../sql/QueryResultsPanel";
import { HISTORY_TAB_SUBJECT } from "../sql/HistoryTab";
import { downloadRecipe } from "../sql/resultsExport";
import { Inspector } from "./Inspector";

/**
 * Above this many result rows Info offers to expand the drawer rather than
 * doing it (§13.3: "results never auto-expand"). A row count, not a measured
 * overflow — the accepted trade is "two gestures away, not zero", which a
 * `ResizeObserver`'s extra accuracy would not change.
 */
export const PROMPT_ABOVE_ROWS = 12;

/** The expand offer — never an automatic resize. Expanding also stacks the panes, so the result gets the drawer's full width. */
function ResultOverflowPrompt() {
  const { status, result } = useQuerySession(CONSOLE_SESSION);
  const expanded = useDrawerStore((state) => state.expanded);
  const setExpanded = useDrawerStore((state) => state.setExpanded);

  if (
    expanded ||
    status !== "success" ||
    !result ||
    result.rows.length <= PROMPT_ABOVE_ROWS
  ) {
    return null;
  }

  return (
    <button
      type="button"
      data-testid="drawer-expand-prompt"
      onClick={() => setExpanded(true)}
      className="w-full shrink-0 border-b border-(--color-rule-2) bg-(--color-elev) px-3 py-1.5 text-left font-mono text-[length:var(--text-xs)] text-(--color-ink-2) hover:text-(--color-ink)"
    >
      {result.rows.length.toLocaleString()} rows — click to expand
    </button>
  );
}

/**
 * The one result-scoped action: promoting what just ran into a tab of its own.
 * It leads because it is the move a fresh result actually invites — hence the
 * accent fill and the position directly above `QueryOutput`'s Results header.
 */
function PinAction() {
  const { sql, result } = useQuerySession(CONSOLE_SESSION);
  const canPin = sql.trim().length > 0;

  return (
    <div
      data-testid="info-primary-actions"
      className="flex shrink-0 items-center justify-end border-b border-(--color-rule-2) px-3 py-2"
    >
      <button
        type="button"
        onClick={() => pinConsoleQuery()}
        disabled={!canPin}
        title={
          result
            ? "Keep this query and its results in their own tab"
            : "Keep this query in its own tab"
        }
        className="flex items-center gap-1 rounded-lg bg-(--color-accent) px-3 py-1.5 text-sm font-medium text-(--color-accent-fg) disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Pin size={14} aria-hidden="true" />
        Pin to tab
      </button>
    </div>
  );
}

/**
 * Session-scoped, not result-scoped: "every result this session" and "every
 * derived table this session". Neither is about the rows in hand, which is why
 * they sit below the result rather than in the row it leads with — and neither
 * belongs inside `QueryOutput`, whose own CSV/Excel/Copy-SQL buttons a query
 * tab inherits by construction.
 */
function SessionActions() {
  const hasDerivedTables = useDatasetsStore((state) =>
    state.tables.some((t) => t.origin === "derived"),
  );

  const handleExportRecipe = useCallback(() => {
    downloadRecipe(useDatasetsStore.getState().tables);
  }, []);

  return (
    <div
      data-testid="info-session-actions"
      className="flex shrink-0 items-center justify-end gap-2 border-t border-(--color-rule-2) px-3 py-1.5"
    >
      <button
        type="button"
        onClick={() =>
          useTabsStore.getState().openTab("history", HISTORY_TAB_SUBJECT)
        }
        title="Open this session's run log in its own tab"
        className="flex items-center gap-1 rounded-lg border border-(--color-border) px-2.5 py-1 text-xs font-medium text-(--color-fg-muted) hover:text-(--color-fg)"
      >
        <History size={12} aria-hidden="true" />
        History
      </button>
      <button
        type="button"
        onClick={handleExportRecipe}
        disabled={!hasDerivedTables}
        title="Export this session's derived-table SQL as a re-runnable recipe"
        className="flex items-center gap-1 rounded-lg border border-(--color-border) px-2.5 py-1 text-xs font-medium text-(--color-fg-muted) hover:text-(--color-fg) disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download size={12} aria-hidden="true" />
        Export recipe
      </button>
    </div>
  );
}

export function DrawerInfo() {
  const infoSignal = useDrawerStore((state) => state.infoSignal);
  const hasSelection =
    useSelectionStore((state) => state.lastSelectionKind) !== null;
  const scentRef = useRef<HTMLDivElement | null>(null);

  // A new selection replaces the strip's contents in place, with no chrome
  // movement to announce it — so a previous selection's scroll offset would
  // render the new scent below the fold. Resetting is the whole fix; the header
  // mark (`InspectorDrawer`) is the rest of the signal, and neither touches
  // focus, which is usually in the editor next door.
  useEffect(() => {
    if (infoSignal === 0) return;
    if (scentRef.current) scentRef.current.scrollTop = 0;
  }, [infoSignal]);

  return (
    <div data-testid="drawer-info" className="flex min-h-0 flex-1 flex-col">
      {/* Capped rather than free-growing: an edge selection brings D24's
          evidence and its override forms, which would otherwise crowd the
          result out of a short drawer. Absent entirely with nothing selected
          (S6.7) — `Inspector`'s own "select something" fallback stays where it
          is, it just no longer has a way to sit above a result. */}
      {hasSelection && (
        <div
          ref={scentRef}
          data-testid="info-scent-strip"
          className="max-h-[40%] shrink-0 overflow-y-auto border-b border-(--color-rule-2)"
        >
          <Inspector />
        </div>
      )}
      <ResultOverflowPrompt />
      <PinAction />
      {/* The only scroll container in the pane, and it scrolls on both axes:
          `ResultsGrid` truncates every cell, so a wide result in a half-width
          pane would otherwise be a wall of ellipses with no way back to a
          column. */}
      <div
        data-testid="info-output-region"
        className="min-h-0 flex-1 overflow-auto px-3 py-2"
      >
        <QueryOutput sessionId={CONSOLE_SESSION} showChart={false} />
      </div>
      <SessionActions />
    </div>
  );
}
