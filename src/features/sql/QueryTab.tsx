// A query tab (S5, D73, master §13.3) — the artifact tab kind's first live
// member. Independent, editable, re-runnable: its own editor, Run and results,
// on its own query session (the session id *is* the tab id), through the same
// `requestRun` every other runner calls so the transform guard covers it.
//
// What it deliberately does not carry: the History list, the query suggestions
// and the export-recipe action. All three are about the *session*, not about
// the query in hand, and all three stay in the console — a query tab is one
// query and its result.
import { useCallback } from "react";
import { Play } from "lucide-react";
import { useQuerySession, getSession } from "../../stores/query";
import { requestRun } from "../../services/runPath";
import { QueryOutput } from "./QueryResultsPanel";
import { LazySqlEditor } from "./LazySqlEditor";

interface QueryTabProps {
  /** The tab's id, which is also its query session id. */
  tabId: string;
  /** The tab's name, shown as the surface's heading. */
  name: string;
}

export function QueryTab({ tabId, name }: QueryTabProps) {
  const { sql, status } = useQuerySession(tabId);

  const handleRun = useCallback(() => {
    requestRun(getSession(tabId).sql, tabId);
  }, [tabId]);

  const canRun = sql.trim().length > 0 && status !== "running";

  return (
    <div data-testid={`query-tab-${tabId}`} className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-(--color-fg)">{name}</h2>
        <button
          type="button"
          onClick={handleRun}
          disabled={!canRun}
          className="flex items-center gap-2 rounded-lg bg-(--color-accent) px-3 py-1.5 text-sm font-medium text-(--color-accent-fg) disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={14} aria-hidden="true" />
          {status === "running" ? "Running…" : "Run"}
          <span className="text-xs opacity-75">⌘/Ctrl+Enter</span>
        </button>
      </div>

      <LazySqlEditor sessionId={tabId} onRunQuery={handleRun} />

      <QueryOutput sessionId={tabId} />
    </div>
  );
}
