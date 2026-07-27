import type { HistogramBucket } from '../../../lib/columnStats';

/**
 * Equal-width bar histogram (§10 Module 5). Same bar-shape as the profile
 * card's own `Histogram` (`features/profiling/ColumnCard.tsx`) — not
 * imported from there since that one is a small fixed-size sparkline and
 * this one is the full-size, taller module view with per-bucket axis
 * labels; duplicating a ~15-line bar-rendering block is cheaper than
 * threading a size variant through a shared component for one reuse.
 */
export function Histogram({ buckets }: { buckets: HistogramBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-48 items-end gap-1" aria-label="Value distribution histogram">
        {buckets.map((bucket, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm bg-(--chart-1)/70"
            style={{ height: `${Math.max(2, (bucket.count / max) * 100)}%` }}
            title={`${bucket.rangeStart.toFixed(2)}–${bucket.rangeEnd.toFixed(2)}: ${bucket.count.toLocaleString()}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-(--color-fg-muted)">
        <span>{buckets[0]?.rangeStart.toFixed(2)}</span>
        <span>{buckets[buckets.length - 1]?.rangeEnd.toFixed(2)}</span>
      </div>
    </div>
  );
}
