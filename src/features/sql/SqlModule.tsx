import { useCallback } from 'react';
import { Play, Download, Pin } from 'lucide-react';
import { useQuerySession, useQueryStore, CONSOLE_SESSION } from '../../stores/query';
import { useDatasetsStore } from '../../stores/datasets';
import { requestRun } from '../../services/runPath';
import { pinConsoleQuery } from '../../services/queryTabs';
import { QuerySuggestions } from './QuerySuggestions';
import { QueryOutput, QueryHistory } from './QueryResultsPanel';
import { LazySqlEditor } from './LazySqlEditor';
import { downloadRecipe } from './resultsExport';

/**
 * The SQL console's body — the editor, its Run button, and the results below
 * it. Since S4 it is a *view* over the run path rather than an owner of one:
 * classification, the transform guard and the tracked execution cycle all live
 * in `services/runPath.ts`, which every other surface in the app calls too.
 *
 * Since S5 it is explicitly the **console** session. It is the scratchpad — the
 * next query overwrites the last one's results — so it is also the only surface
 * carrying **Pin to tab**, which promotes what is in hand into a keeper
 * (§13.3). The History list and the export-recipe action stay here for the same
 * reason: both are about the session, not about the result in hand.
 */
export function SqlModule() {
  const { sql, status, result } = useQuerySession(CONSOLE_SESSION);
  const hasDerivedTables = useDatasetsStore((state) => state.tables.some((t) => t.origin === 'derived'));

  const handleRun = useCallback(() => {
    requestRun(useQueryStore.getState().sessions[CONSOLE_SESSION]?.sql ?? '', CONSOLE_SESSION);
  }, []);

  const handleExportRecipe = useCallback(() => {
    downloadRecipe(useDatasetsStore.getState().tables);
  }, []);

  const canRun = sql.trim().length > 0 && status !== 'running';
  const canPin = sql.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-(--color-fg)">SQL</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportRecipe}
            disabled={!hasDerivedTables}
            title="Export this session's derived-table SQL as a re-runnable recipe"
            className="flex items-center gap-1 rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-medium text-(--color-fg) disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={14} aria-hidden="true" />
            Export recipe
          </button>
          <button
            type="button"
            onClick={() => pinConsoleQuery()}
            disabled={!canPin}
            title={
              result
                ? 'Keep this query and its results in their own tab'
                : 'Keep this query in its own tab'
            }
            className="flex items-center gap-1 rounded-lg border border-(--color-border) px-3 py-1.5 text-sm font-medium text-(--color-fg) disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pin size={14} aria-hidden="true" />
            Pin to tab
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun}
            className="flex items-center gap-2 rounded-lg bg-(--color-accent) px-3 py-1.5 text-sm font-medium text-(--color-accent-fg) disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={14} aria-hidden="true" />
            {status === 'running' ? 'Running…' : 'Run'}
            <span className="text-xs opacity-75">⌘/Ctrl+Enter</span>
          </button>
        </div>
      </div>

      <QuerySuggestions />

      <LazySqlEditor sessionId={CONSOLE_SESSION} onRunQuery={handleRun} />

      <QueryOutput sessionId={CONSOLE_SESSION} />
      <QueryHistory />
    </div>
  );
}
