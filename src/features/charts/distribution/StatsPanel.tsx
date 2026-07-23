import type { DistributionMoments } from '../../../lib/distributionSql';

function formatStat(value: number | null): string {
  return value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function StatCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-0.5 rounded border border-(--color-border) px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-(--color-fg-muted)">{label}</span>
      <span className="font-mono text-sm text-(--color-fg)">{formatStat(value)}</span>
    </div>
  );
}

/** Descriptive stats panel (§10 Module 5) — mean, median, mode, std dev, skewness, kurtosis, one query's worth of DuckDB aggregates rendered as a grid. `null` cells (e.g. skewness/kurtosis below 2-3 non-null values) render "—", not a fabricated 0. */
export function StatsPanel({ moments }: { moments: DistributionMoments }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      <StatCell label="Mean" value={moments.mean} />
      <StatCell label="Median" value={moments.median} />
      <StatCell label="Mode" value={moments.mode} />
      <StatCell label="Std dev" value={moments.stdDev} />
      <StatCell label="Skewness" value={moments.skewness} />
      <StatCell label="Kurtosis" value={moments.kurtosis} />
    </div>
  );
}
