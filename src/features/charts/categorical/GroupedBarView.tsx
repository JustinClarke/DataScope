import { lazy, Suspense } from 'react';
import type { ChartSpec, QueryResult } from '../../../types';

// The charting library rides in its own chunk, same lazy boundary TrendView/ScatterDrillThrough use.
const ChartRenderer = lazy(() => import('../../../components/charts/ChartRenderer'));

interface GroupedBarViewProps {
  result: QueryResult;
  catColumn: string;
  quantColumn: string;
  aggregate: 'total' | 'mean';
}

/**
 * Grouped bar — Categorical × Quantitative (§10 Module 6, e.g. "average
 * salary by department"). Reuses `ChartRenderer` unmodified:
 * `buildCategorySummarySql`'s `grp`/`total`/`mean` result is the exact shape
 * the shared `categorical` `ChartSpec` already renders as a bar chart for the
 * SQL playground's auto-chart panel, so no new chart primitive is needed here
 * (this item's own Dependencies note) — the Sum/Average toggle just picks
 * which already-computed column feeds `yFields`.
 */
export function GroupedBarView({ result, catColumn, quantColumn, aggregate }: GroupedBarViewProps) {
  const spec: ChartSpec = {
    type: 'categorical',
    title: `${aggregate === 'mean' ? 'Average' : 'Sum of'} ${quantColumn} by ${catColumn}`,
    xField: 'grp',
    yFields: [aggregate],
  };
  return (
    <Suspense
      fallback={
        <div className="flex h-80 items-center justify-center rounded-lg border border-(--color-border) text-sm text-(--color-fg-muted)">
          Loading chart…
        </div>
      }
    >
      <ChartRenderer result={result} spec={spec} />
    </Suspense>
  );
}
