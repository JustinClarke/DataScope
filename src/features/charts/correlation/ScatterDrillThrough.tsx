import { lazy, Suspense, useEffect, useState } from 'react';
import type { ChartSpec, QueryResult } from '../../../types';
import { runChartQuery } from '../../../services/charts';
import { buildScatterSql } from '../../../lib/correlationSql';
import { CanvasScatter } from './CanvasScatter';
import { GeneratedSql } from './GeneratedSql';

const ChartRenderer = lazy(() => import('../../../components/charts/ChartRenderer'));

/** §15: beyond this many points, SVG scatter (one DOM node per point) gets janky — switch to canvas. */
export const CANVAS_POINT_THRESHOLD = 10_000;

interface ScatterDrillThroughProps {
  table: string;
  columnA: string;
  columnB: string;
}

/** The cell-click target: a real scatter of the two clicked columns, degrading to canvas past the SVG-jank point (§10 Module 4, §15). */
export function ScatterDrillThrough({ table, columnA, columnB }: ScatterDrillThroughProps) {
  const sql = buildScatterSql(table, columnA, columnB);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    runChartQuery(sql)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not run the scatter query.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sql]);

  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-(--color-border) text-sm text-(--color-fg-muted)">
        Running query…
      </div>
    );
  }
  if (error) return <p className="text-sm text-(--color-error)">{error}</p>;
  if (!result || result.rows.length === 0) {
    return <p className="text-sm text-(--color-fg-muted)">No rows with both values present.</p>;
  }

  const useCanvas = result.rows.length > CANVAS_POINT_THRESHOLD;

  return (
    <div className="flex flex-col gap-3">
      {useCanvas ? (
        <CanvasScatter
          points={result.rows.map((row) => ({ x: Number(row[0]), y: Number(row[1]) }))}
          xLabel={columnA}
          yLabel={columnB}
        />
      ) : (
        <Suspense
          fallback={
            <div className="flex h-80 items-center justify-center rounded-lg border border-(--color-border) text-sm text-(--color-fg-muted)">
              Loading chart…
            </div>
          }
        >
          <ChartRenderer
            result={result}
            spec={
              {
                type: 'correlation',
                title: `${columnB} vs ${columnA}`,
                xField: columnA,
                yFields: [columnB],
              } satisfies ChartSpec
            }
          />
        </Suspense>
      )}
      <GeneratedSql sql={sql} />
    </div>
  );
}
