import { useQueryStore } from '../../stores/query';
import { classifyStatement } from '../../lib/statementClass';
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

  const lastRunSql = history[0]?.sql ?? sql;
  const lastRunWasQuery = classifyStatement(lastRunSql).class === 'query';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="mb-2 text-sm font-medium text-(--color-fg)">Results</h3>
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
                <span className={entry.error ? 'text-red-500' : 'text-(--color-fg-muted)'}>
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
