import { useState } from 'react';
import { Download } from 'lucide-react';
import { useQuerySession, useQueryStore, type QuerySessionId } from '../../stores/query';
import { useDatasetsStore } from '../../stores/datasets';
import { classifyStatement } from '../../lib/statementClass';
import { downloadTable } from '../../services/export';
import { ResultsGrid } from './ResultsGrid';
import { RunSqlButton } from './RunSqlButton';
import { AutoChartPanel } from './AutoChartPanel';

/**
 * "What a query produced" — one rendering, shared by the console, Pivot and
 * every query tab (D49: one execution path, one rendering of its outcome).
 * S5 makes it session-scoped rather than store-global: the shared *rendering*
 * was always right, the shared *state* was the thing query tabs couldn't have.
 *
 * This is also where two of the deleted SQL page's affordances (§13.3) live, so
 * they reach the query tabs by construction rather than being copied onto them:
 * auto-charting a result, and the Download-Parquet-on-CTAS shortcut.
 *
 * `showChart` is off in exactly one place: the drawer's Info pane (S6.7), where
 * a chart is a *different view* of the result competing for room in a pane that
 * only exists because there is a result to show. A full-height query tab has
 * the room, so it keeps the chart it inherited.
 */
export function QueryOutput({ sessionId, showChart = true }: { sessionId: QuerySessionId; showChart?: boolean }) {
  const { status, result, error, sql, lastRunSql } = useQuerySession(sessionId);
  const tables = useDatasetsStore((state) => state.tables);
  const [exportingDerived, setExportingDerived] = useState(false);

  // What ran, not what is typed — the two diverge the moment the buffer is
  // edited after a run, and every decision below is about the result.
  const ranSql = lastRunSql || sql;
  const lastRunInfo = classifyStatement(ranSql);
  const lastRunWasQuery = lastRunInfo.class === 'query';
  // A CTAS that just succeeded gets a Parquet shortcut right on the Results
  // header (§12.2 "wherever a table is") — found by name in the registry
  // rather than threaded through QueryResult, since every derived table
  // already lands there the moment `runTransform` registers it.
  const derivedTable =
    status === 'success' && lastRunInfo.class === 'ctas' && lastRunInfo.ctasTable
      ? tables.find((t) => t.tableName === lastRunInfo.ctasTable)
      : undefined;

  async function handleDownloadDerived() {
    if (!derivedTable || exportingDerived) return;
    setExportingDerived(true);
    try {
      await downloadTable(derivedTable, 'parquet');
    } finally {
      setExportingDerived(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-(--color-fg)">Results</h3>
          {derivedTable && (
            <button
              type="button"
              onClick={handleDownloadDerived}
              disabled={exportingDerived}
              title={`Download "${derivedTable.tableName}" as Parquet`}
              className="flex items-center gap-1 rounded border border-(--color-border) px-2 py-1 text-xs font-medium text-(--color-fg) disabled:opacity-50"
            >
              <Download size={12} aria-hidden="true" /> {exportingDerived ? 'Preparing…' : 'Download Parquet'}
            </button>
          )}
        </div>
        <ResultsGrid sessionId={sessionId} status={status} result={result} error={error} sql={ranSql} />
      </div>

      {showChart && status === 'success' && result && result.rowCount > 0 && lastRunWasQuery && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-(--color-fg)">Chart</h3>
          <AutoChartPanel result={result} sql={ranSql} />
        </div>
      )}
    </div>
  );
}

/**
 * The session-wide log of what ran — every session's runs, not just the
 * console's. A query tab is one query and its result and renders none (S5
 * scope call 2).
 *
 * Its one caller since S6.7 is the `history` tab, which owns the heading; the
 * list renders none of its own. Nothing about the component changed in the
 * move — relocating a render target is all it was.
 */
export function QueryHistory() {
  const history = useQueryStore((state) => state.history);

  return (
    <div>
      {history.length === 0 ? (
        <p className="text-sm text-(--color-fg-muted)">No statements run yet this session.</p>
      ) : (
        <ul className="flex flex-col gap-1 font-mono text-xs">
          {history.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded border border-(--color-border) px-2 py-1"
            >
              <span className="truncate text-(--color-fg-muted)">{entry.sql}</span>
              <div className="flex shrink-0 items-center gap-3">
                <span className={entry.error ? 'text-(--color-error)' : 'text-(--color-fg-muted)'}>
                  {entry.error ? 'error' : `${entry.result?.executionTimeMs.toFixed(0)} ms`}
                </span>
                {/* Re-runs through the same path as every other surface — no history-specific execution (S4). */}
                <RunSqlButton sql={entry.sql} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
