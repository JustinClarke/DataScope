import { lazy, Suspense, useEffect, useState } from 'react';
import type { ChartSpec, QueryResult } from '../../../types';
import { runChartQuery } from '../../../services/charts';
import {
  buildTrendSql,
  movingAverageAlias,
  valueAlias,
  type MovingAverageWindow,
  type TimeSeriesAggregate,
  type TimeSeriesGranularity,
} from '../../../lib/timeSeriesSql';
import { GeneratedSql } from './GeneratedSql';

// The charting library rides in its own chunk, same lazy boundary AutoChartPanel uses.
const ChartRenderer = lazy(() => import('../../../components/charts/ChartRenderer'));

const GRANULARITIES: TimeSeriesGranularity[] = ['day', 'week', 'month', 'quarter', 'year'];
const AGGREGATES: TimeSeriesAggregate[] = ['avg', 'sum', 'min', 'max', 'count'];
const MA_WINDOWS: MovingAverageWindow[] = [7, 30, 90];
const RUN_DEBOUNCE_MS = 300;

interface TrendViewProps {
  table: string;
  dateColumn: string;
  valueColumn: string;
}

/**
 * Trend line + optional moving-average overlay (§10 Module 3). Reuses
 * `ChartRenderer` unmodified: a granularity-bucketed value series plus an
 * overlay series both come back as ordinary numeric columns alongside a
 * temporal `period` column, so the same time-series `ChartSpec`/multi-line
 * rendering `AutoChartPanel` already uses for a plain query result applies
 * here with no chart-primitive changes (this item's own Dependencies note).
 */
export function TrendView({ table, dateColumn, valueColumn }: TrendViewProps) {
  const [granularity, setGranularity] = useState<TimeSeriesGranularity>('day');
  const [aggregate, setAggregate] = useState<TimeSeriesAggregate>('avg');
  const [maEnabled, setMaEnabled] = useState(false);
  const [maWindow, setMaWindow] = useState<MovingAverageWindow>(7);

  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const spec = { table, dateColumn, valueColumn, granularity, aggregate, movingAverageWindow: maEnabled ? maWindow : undefined };
  const sql = buildTrendSql(spec);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      runChartQuery(sql)
        .then((r) => {
          if (!cancelled) setResult(r);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Could not run the trend query.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, RUN_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sql]);

  const yFields = [valueAlias(spec)];
  if (maEnabled) yFields.push(movingAverageAlias(maWindow));
  const chartSpec: ChartSpec = {
    type: 'time-series',
    title: `${valueColumn} over ${dateColumn}`,
    xField: 'period',
    yFields,
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5 text-(--color-fg-muted)">
          Granularity
          <select
            aria-label="Granularity"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as TimeSeriesGranularity)}
            className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
          >
            {GRANULARITIES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-(--color-fg-muted)">
          Aggregate
          <select
            aria-label="Aggregate"
            value={aggregate}
            onChange={(e) => setAggregate(e.target.value as TimeSeriesAggregate)}
            className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
          >
            {AGGREGATES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-(--color-fg-muted)">
          <input type="checkbox" checked={maEnabled} onChange={(e) => setMaEnabled(e.target.checked)} />
          Moving average
        </label>
        {maEnabled && (
          <select
            aria-label="Moving average window"
            value={maWindow}
            onChange={(e) => setMaWindow(Number(e.target.value) as MovingAverageWindow)}
            className="rounded border border-(--color-border) bg-transparent px-2 py-1 text-(--color-fg)"
          >
            {MA_WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w}-period
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex h-80 items-center justify-center rounded-lg border border-(--color-border) text-sm text-(--color-fg-muted)">
          Running query…
        </div>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : result && result.rows.length === 0 ? (
        <p className="text-sm text-(--color-fg-muted)">No rows for this table.</p>
      ) : result ? (
        <Suspense
          fallback={
            <div className="flex h-80 items-center justify-center rounded-lg border border-(--color-border) text-sm text-(--color-fg-muted)">
              Loading chart…
            </div>
          }
        >
          <ChartRenderer result={result} spec={chartSpec} />
        </Suspense>
      ) : null}

      <GeneratedSql sql={sql} />
    </div>
  );
}
