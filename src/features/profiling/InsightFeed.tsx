import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { QueryResult, TableRegistryEntry } from '../../types';
import type { InsightCandidate } from '../../lib/insights';
import { RULE_LABEL } from '../../lib/insights';
import { loadInsights } from '../../services/insights';
import { runChartQuery } from '../../services/charts';
import { AutoChartPanel } from '../sql/AutoChartPanel';
import { RunSqlButton } from '../sql/RunSqlButton';

function InsightCard({ candidate, onShowSql }: { candidate: InsightCandidate; onShowSql: (label: string, sql: string) => void }) {
  // Charting an insight runs its own query and renders the result through the
  // same translator + panel the SQL playground uses — one implementation, not
  // a second chart path. Toggles closed again on a second click.
  const [chart, setChart] = useState<QueryResult | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [charting, setCharting] = useState(false);

  async function toggleChart() {
    if (chartOpen) {
      setChartOpen(false);
      return;
    }
    setChartOpen(true);
    if (chart || charting) return;
    setCharting(true);
    setChartError(null);
    try {
      setChart(await runChartQuery(candidate.sql));
    } catch (err) {
      setChartError(err instanceof Error ? err.message : 'Could not chart this insight.');
    } finally {
      setCharting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-(--color-border) p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded bg-(--color-accent)/10 px-1.5 py-0.5 text-xs font-medium text-(--color-accent)">
          {RULE_LABEL[candidate.rule]}
        </span>
        <div className="flex items-center gap-3">
          {candidate.sql && (
            <>
              <button
                type="button"
                onClick={() => onShowSql(RULE_LABEL[candidate.rule], candidate.sql)}
                className="text-xs text-(--color-accent) hover:underline"
              >
                Show SQL
              </button>
              <RunSqlButton sql={candidate.sql} />
              <button
                type="button"
                onClick={toggleChart}
                aria-expanded={chartOpen}
                className="flex items-center gap-1 text-xs text-(--color-accent) hover:underline"
              >
                <BarChart3 size={14} aria-hidden="true" />
                {chartOpen ? 'Hide chart' : 'Open as chart'}
              </button>
            </>
          )}
        </div>
      </div>
      <p className="text-sm text-(--color-fg)">{candidate.description}</p>
      {chartOpen && (
        <div className="mt-1">
          {charting ? (
            <p className="text-sm text-(--color-fg-muted)">Building chart…</p>
          ) : chartError ? (
            <p className="text-sm text-(--color-error)">{chartError}</p>
          ) : chart ? (
            <AutoChartPanel result={chart} sql={candidate.sql} />
          ) : null}
        </div>
      )}
    </div>
  );
}

interface InsightFeedProps {
  table: TableRegistryEntry;
  onShowSql: (label: string, sql: string) => void;
}

/**
 * The deterministic insight feed (§10 Module 1, D10, Phase 3) — ranked,
 * rule-based observations below the column cards. No LLM in the loop, so
 * this renders identically with AI off and makes zero network requests of
 * its own (the engine is local WASM).
 */
export function InsightFeed({ table, onShowSql }: InsightFeedProps) {
  const [insights, setInsights] = useState<InsightCandidate[] | null>(null);

  useEffect(() => {
    if (!table.columns) {
      setInsights(null);
      return;
    }
    let cancelled = false;
    setInsights(null);
    void loadInsights(table.tableName, table.columns, table.rowCount).then((result) => {
      if (!cancelled) setInsights(result);
    });
    return () => {
      cancelled = true;
    };
  }, [table.id, table.tableName, table.columns, table.rowCount]);

  if (!table.columns) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-(--color-fg-muted)">Insights</h2>
      {insights === null ? (
        <p className="text-sm text-(--color-fg-muted)">Looking for patterns…</p>
      ) : insights.length === 0 ? (
        <p className="text-sm text-(--color-fg-muted)">No notable patterns found in this table.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {insights.map((candidate) => (
            <InsightCard key={candidate.id} candidate={candidate} onShowSql={onShowSql} />
          ))}
        </div>
      )}
    </div>
  );
}
