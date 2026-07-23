import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Play, Download } from 'lucide-react';
import { useQueryStore } from '../../stores/query';
import { useDatasetsStore } from '../../stores/datasets';
import { runQuery } from '../../services/sql';
import { runTransform, materializeInsteadOfMutation, forceMutation, isSourceMutation } from '../../services/transforms';
import { classifyStatement, type StatementInfo } from '../../lib/statementClass';
import { useThreadPrefill } from '../../hooks/useThreadPrefill';
import { prefillString } from '../../lib/threadPrefill';
import type { QueryResult } from '../../types';
import { QuerySuggestions } from './QuerySuggestions';
import { QueryResultsPanel } from './QueryResultsPanel';
import { TransformGuardModal } from './TransformGuardModal';
import { downloadRecipe } from './resultsExport';

// The multi-MB Monaco chunk must never enter the bundle graph loaded at
// startup — `lazy()` defers the import until this module actually renders,
// i.e. not before the SQL sidebar card is clicked for the first time.
const MonacoWrapper = lazy(() => import('./MonacoWrapper'));

export function SqlModule() {
  const sql = useQueryStore((state) => state.sql);
  const status = useQueryStore((state) => state.status);
  const hasDerivedTables = useDatasetsStore((state) => state.tables.some((t) => t.origin === 'derived'));
  const [guardInfo, setGuardInfo] = useState<StatementInfo | null>(null);

  // A ranked action's ThreadConfig (D68e) — today only the `duplicates`
  // insight routes here, carrying the exact query that found the duplicate
  // rows (§ capabilities.ts's insightAction). Opens "on the answer": runs
  // immediately, same as pressing Run, rather than waiting on user input.
  const prefill = useThreadPrefill();
  useEffect(() => {
    const prefillSql = prefillString(prefill, 'sql');
    if (prefillSql) runQuery(prefillSql).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Drives the same queryStarted/querySucceeded/queryFailed cycle runQuery
  // uses (services/sql.ts) so a CTAS/mutation's outcome shows up in
  // Results/History exactly like a SELECT's does, even though it runs
  // through the transformation layer instead.
  const runAndTrack = useCallback((sqlText: string, run: () => Promise<QueryResult>) => {
    useQueryStore.getState().queryStarted(sqlText);
    run()
      .then((res) => useQueryStore.getState().querySucceeded(res))
      .catch((err) => useQueryStore.getState().queryFailed(err instanceof Error ? err.message : String(err)));
  }, []);

  const handleRun = useCallback(() => {
    const currentSql = useQueryStore.getState().sql.trim();
    if (!currentSql || useQueryStore.getState().status === 'running') return;

    const info = classifyStatement(currentSql);
    if (info.class === 'query') {
      // runQuery already records failure/abort into the query store before it
      // rejects (see services/sql.ts) — that store update, not this call
      // site, is the source of truth ResultsGrid reads from. The rejection
      // itself is only relevant to a caller that needs to `await`
      // completion, which this fire-and-forget button click does not, so
      // it's deliberately swallowed here rather than left as an unhandled
      // promise rejection.
      runQuery(currentSql).catch(() => {});
      return;
    }
    if (isSourceMutation(info)) {
      setGuardInfo(info);
      return;
    }
    runAndTrack(currentSql, () => runTransform(currentSql));
  }, [runAndTrack]);

  const handleMaterialize = useCallback(() => {
    if (!guardInfo) return;
    const info = guardInfo;
    setGuardInfo(null);
    runAndTrack(info.sql, () => materializeInsteadOfMutation(info));
  }, [guardInfo, runAndTrack]);

  const handleModifyAnyway = useCallback(() => {
    if (!guardInfo) return;
    const info = guardInfo;
    setGuardInfo(null);
    runAndTrack(info.sql, () => forceMutation(info));
  }, [guardInfo, runAndTrack]);

  const handleExportRecipe = useCallback(() => {
    downloadRecipe(useDatasetsStore.getState().tables);
  }, []);

  const canRun = sql.trim().length > 0 && status !== 'running';

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

      <Suspense
        fallback={
          <div className="flex h-64 w-full items-center justify-center rounded-lg border border-(--color-border) text-sm text-(--color-fg-muted)">
            Loading editor…
          </div>
        }
      >
        <MonacoWrapper onRunQuery={handleRun} />
      </Suspense>

      <QueryResultsPanel />

      {guardInfo && guardInfo.mutationTarget && (
        <TransformGuardModal
          targetTable={guardInfo.mutationTarget}
          onMaterialize={handleMaterialize}
          onModifyAnyway={handleModifyAnyway}
          onCancel={() => setGuardInfo(null)}
        />
      )}
    </div>
  );
}
