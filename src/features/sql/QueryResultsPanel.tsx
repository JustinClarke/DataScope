import { useState } from 'react';
import { Download } from 'lucide-react';
import { useQueryStore } from '../../stores/query';
import { useDatasetsStore } from '../../stores/datasets';
import { classifyStatement } from '../../lib/statementClass';
import { downloadTable } from '../../services/export';
import { ResultsGrid } from './ResultsGrid';
import { AutoChartPanel } from './AutoChartPanel';

/**
 * Results / Chart / History — shared by the SQL playground and the Pivot
 * builder (D68d: Pivot is its own ANALYZE destination now, EXPLORE/SQL's
 * neighbor). Both feed the same query store (`runQuery`), so there is exactly
 * one rendering of "what a query produced" rather than a second execution
 * path (D49) — reads the store directly, no props.
 */
export function QueryResultsPanel() {
  const status = useQueryStore((state) => state.status);
  const result = useQueryStore((state) => state.result);
  const error = useQueryStore((state) => state.error);
  const history = useQueryStore((state) => state.history);
  const sql = useQueryStore((state) => state.sql);
  const tables = useDatasetsStore((state) => state.tables);
  const [exportingDerived, setExportingDerived] = useState(false);

  const lastRunSql = history[0]?.sql ?? sql;
  const lastRunInfo = classifyStatement(lastRunSql);
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
        <ResultsGrid status={status} result={result} error={error} sql={lastRunSql} />
      </div>

      {status === 'success' && result && result.rowCount > 0 && lastRunWasQuery && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-(--color-fg)">Chart</h3>
          <AutoChartPanel result={result} sql={lastRunSql} />
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium text-(--color-fg)">History</h3>
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
                <span className={entry.error ? 'text-(--color-error)' : 'text-(--color-fg-muted)'}>
                  {entry.error ? 'error' : `${entry.result?.executionTimeMs.toFixed(0)} ms`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
