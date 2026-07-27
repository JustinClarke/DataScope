import { useEffect, useMemo, useState } from 'react';
import { runChartQuery } from '../../../services/charts';
import { buildSeasonalitySql, parseSeasonality, type SeasonalityCell, type TimeSeriesAggregate } from '../../../lib/timeSeriesSql';
import { GeneratedSql } from './GeneratedSql';

const AGGREGATES: TimeSeriesAggregate[] = ['avg', 'sum', 'min', 'max', 'count'];
// DuckDB's EXTRACT(dow FROM …) is 0 = Sunday .. 6 = Saturday (dayofweek()'s definition).
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * The sequential magnitude ramp (design.md § Chart palette): one hue mixed
 * toward the surface, which is what makes a single expression ramp up in
 * lightness on the dark register and down on the light one. Cells with no data
 * skip this entirely and stay transparent, so "no data" never reads as "low".
 */
const sequentialFill = (intensity: number) =>
  `color-mix(in oklab, var(--chart-seq) ${(12 + intensity * 88).toFixed(1)}%, var(--color-canvas))`;

interface SeasonalityHeatmapProps {
  table: string;
  dateColumn: string;
  valueColumn: string;
}

/** Day-of-week × hour-of-day heatmap (§10 Module 3). A dataset with date-only (no time-of-day) values legitimately concentrates every cell at hour 0 — a true rendering of the data, not a bug. */
export function SeasonalityHeatmap({ table, dateColumn, valueColumn }: SeasonalityHeatmapProps) {
  const [aggregate, setAggregate] = useState<TimeSeriesAggregate>('avg');
  const [cells, setCells] = useState<SeasonalityCell[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sql = buildSeasonalitySql({ table, dateColumn, valueColumn, aggregate });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    runChartQuery(sql)
      .then((r) => {
        if (!cancelled) setCells(parseSeasonality(r));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not run the seasonality query.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sql]);

  const { grid, maxValue } = useMemo(() => {
    const byKey = new Map<string, number>();
    let max = 0;
    for (const cell of cells ?? []) {
      byKey.set(`${cell.dow}:${cell.hour}`, cell.value);
      max = Math.max(max, Math.abs(cell.value));
    }
    return { grid: byKey, maxValue: max };
  }, [cells]);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-1.5 text-xs text-(--color-fg-muted)">
        Aggregate
        <select
          aria-label="Seasonality aggregate"
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

      {loading ? (
        <p className="text-sm text-(--color-fg-muted)">Running query…</p>
      ) : error ? (
        <p className="text-sm text-(--color-error)">{error}</p>
      ) : !cells || cells.length === 0 ? (
        <p className="text-sm text-(--color-fg-muted)">No rows for this table.</p>
      ) : (
        <div className="overflow-x-auto" data-testid="seasonality-grid">
          <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `3rem repeat(24, 1.5rem)` }}>
            <div />
            {HOURS.map((h) => (
              <div key={h} className="text-center text-[10px] text-(--color-fg-muted)">
                {h % 3 === 0 ? h : ''}
              </div>
            ))}
            {DOW_LABELS.map((label, dow) => (
              <div key={label} className="contents">
                <div className="flex items-center text-xs text-(--color-fg-muted)">{label}</div>
                {HOURS.map((hour) => {
                  const value = grid.get(`${dow}:${hour}`);
                  const intensity = value === undefined || maxValue === 0 ? 0 : Math.abs(value) / maxValue;
                  return (
                    <div
                      key={hour}
                      title={value === undefined ? `${label} ${hour}:00 — no data` : `${label} ${hour}:00 — ${value.toLocaleString()}`}
                      className="h-6 w-6 rounded-sm border border-(--color-border)"
                      style={{ backgroundColor: value === undefined ? 'transparent' : sequentialFill(intensity) }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <GeneratedSql sql={sql} />
    </div>
  );
}
