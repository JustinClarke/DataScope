import type { BoxPlotStats } from '../../../lib/distributionSql';

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 40;
const BOX_TOP = 8;
const BOX_BOTTOM = 32;
const MID_Y = (BOX_TOP + BOX_BOTTOM) / 2;
const PADDING_PCT = 6;

/**
 * Horizontal box-and-whisker plot (§10 Module 5) — plain SVG, not Recharts
 * (no first-class box-plot primitive there, same reasoning `CanvasScatter`/
 * `CorrelationHeatmap` used to go custom rather than force a chart-library
 * shape that doesn't fit). Whiskers extend to the nearest in-fence data
 * point (Tukey's convention, matching `buildWhiskersSql`'s own query, never
 * the raw 1.5×IQR fence itself); every point outside that range is drawn as
 * an individual outlier dot per the IQR-rule acceptance criterion.
 */
export function BoxPlot({ stats }: { stats: BoxPlotStats }) {
  const { q1, median, q3, whiskerLow, whiskerHigh, outliers } = stats;

  const domainMin = Math.min(whiskerLow, ...outliers);
  const domainMax = Math.max(whiskerHigh, ...outliers);
  const span = domainMax - domainMin || 1;

  const scale = (value: number): number => {
    const t = (value - domainMin) / span;
    return PADDING_PCT + t * (VIEW_WIDTH - 2 * PADDING_PCT);
  };

  const xWhiskerLow = scale(whiskerLow);
  const xQ1 = scale(q1);
  const xMedian = scale(median);
  const xQ3 = scale(q3);
  const xWhiskerHigh = scale(whiskerHigh);

  const label =
    `Box plot: minimum ${whiskerLow.toFixed(2)}, first quartile ${q1.toFixed(2)}, median ${median.toFixed(2)}, ` +
    `third quartile ${q3.toFixed(2)}, maximum ${whiskerHigh.toFixed(2)}, ${outliers.length} outlier${outliers.length === 1 ? '' : 's'}`;

  return (
    <div className="flex flex-col gap-1">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-28 w-full"
        preserveAspectRatio="none"
      >
        {/* Whisker line */}
        <line
          x1={xWhiskerLow}
          x2={xWhiskerHigh}
          y1={MID_Y}
          y2={MID_Y}
          stroke="var(--color-fg-muted)"
          strokeWidth={0.4}
          vectorEffect="non-scaling-stroke"
        />
        {/* Whisker caps */}
        <line x1={xWhiskerLow} x2={xWhiskerLow} y1={BOX_TOP + 4} y2={BOX_BOTTOM - 4} stroke="var(--color-fg-muted)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
        <line x1={xWhiskerHigh} x2={xWhiskerHigh} y1={BOX_TOP + 4} y2={BOX_BOTTOM - 4} stroke="var(--color-fg-muted)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />

        {/* IQR box */}
        <rect
          x={Math.min(xQ1, xQ3)}
          y={BOX_TOP}
          width={Math.max(0.5, Math.abs(xQ3 - xQ1))}
          height={BOX_BOTTOM - BOX_TOP}
          fill="var(--color-accent)"
          fillOpacity={0.25}
          stroke="var(--color-accent)"
          strokeWidth={0.4}
          vectorEffect="non-scaling-stroke"
        />

        {/* Median line */}
        <line x1={xMedian} x2={xMedian} y1={BOX_TOP} y2={BOX_BOTTOM} stroke="var(--color-accent)" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />

        {/* Outliers */}
        {outliers.map((value, i) => (
          <circle key={i} cx={scale(value)} cy={MID_Y} r={1.1} fill="var(--color-fg-muted)" fillOpacity={0.7} />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-(--color-fg-muted)">
        <span>min {whiskerLow.toFixed(2)}</span>
        <span>Q1 {q1.toFixed(2)}</span>
        <span>median {median.toFixed(2)}</span>
        <span>Q3 {q3.toFixed(2)}</span>
        <span>max {whiskerHigh.toFixed(2)}</span>
      </div>
      {outliers.length > 0 && (
        <p className="text-[10px] text-(--color-fg-muted)">
          {outliers.length} outlier{outliers.length === 1 ? '' : 's'} (IQR rule, 1.5× fence)
        </p>
      )}
    </div>
  );
}
