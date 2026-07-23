import { lazy, Suspense, useMemo, useState } from 'react';
import type { ChartSpec, ChartType, QueryResult } from '../../types';
import { availableChartTypes, recommendChart, specForType } from '../../lib/chartMapper';
import { KpiCard } from '../../components/charts/KpiCard';

// The charting library rides in its own chunk — deferred until a chart is
// actually shown, so the KPI and grid outcomes never load it.
const ChartRenderer = lazy(() => import('../../components/charts/ChartRenderer'));

const TYPE_LABEL: Record<ChartType, string> = {
  'time-series': 'Line',
  categorical: 'Bar',
  correlation: 'Scatter',
  distribution: 'Distribution',
  'join-graph': 'Join graph',
};

interface AutoChartPanelProps {
  result: QueryResult;
  /** The query that produced the result — a light hint the translator uses to tell an aggregate apart from raw numeric columns. */
  sql?: string;
}

/**
 * The auto-chart surface shared by the SQL playground and the "open as chart"
 * actions: it asks the translator for the best fit, shows it, and — for a real
 * chart — offers a picker to switch chart type or fall back to the table. The
 * picker mutates the spec; it never invents chart props of its own.
 */
export function AutoChartPanel({ result, sql }: AutoChartPanelProps) {
  const recommendation = useMemo(() => recommendChart(result, sql), [result, sql]);
  const chartTypes = useMemo(() => availableChartTypes(result), [result]);

  // null = the user chose "Table"; undefined = follow the recommendation.
  const [override, setOverride] = useState<ChartType | null | undefined>(undefined);

  if (recommendation.kind === 'kpi') {
    return <KpiCard label={recommendation.label} value={recommendation.value} />;
  }

  // A result the translator sends to the grid, and that can't support any
  // chart type, has nothing to add beyond the table already shown.
  if (recommendation.kind === 'grid' && chartTypes.length === 0) {
    return <p className="text-sm text-(--color-fg-muted)">{recommendation.reason}</p>;
  }

  const recommendedType = recommendation.kind === 'chart' ? recommendation.spec.type : null;
  const activeType = override === undefined ? recommendedType : override;
  const activeSpec: ChartSpec | null =
    activeType === null
      ? null
      : override === undefined && recommendation.kind === 'chart'
        ? recommendation.spec
        : specForType(result, activeType);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-(--color-fg-muted)">Chart:</span>
        {chartTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setOverride(type === recommendedType ? undefined : type)}
            aria-pressed={activeType === type}
            className={`rounded-full border px-2.5 py-1 font-medium transition-colors ${
              activeType === type
                ? 'border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)'
                : 'border-(--color-border) text-(--color-fg-muted) hover:text-(--color-fg)'
            }`}
          >
            {TYPE_LABEL[type]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOverride(null)}
          aria-pressed={activeType === null}
          className={`rounded-full border px-2.5 py-1 font-medium transition-colors ${
            activeType === null
              ? 'border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)'
              : 'border-(--color-border) text-(--color-fg-muted) hover:text-(--color-fg)'
          }`}
        >
          Table
        </button>
      </div>

      {activeSpec === null ? (
        <p className="text-sm text-(--color-fg-muted)">Showing the table below.</p>
      ) : (
        <figure className="flex flex-col gap-2">
          <figcaption className="text-sm font-medium text-(--color-fg)">{activeSpec.title}</figcaption>
          <Suspense
            fallback={
              <div className="flex h-80 items-center justify-center rounded-lg border border-(--color-border) text-sm text-(--color-fg-muted)">
                Loading chart…
              </div>
            }
          >
            <ChartRenderer result={result} spec={activeSpec} />
          </Suspense>
        </figure>
      )}
    </div>
  );
}
