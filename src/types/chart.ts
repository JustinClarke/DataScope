// Shared shape between the manual chart modules and the AI pipeline's
// auto-chart config — one translator, one type (chartMapper.ts). ChartSpec is
// also the atomic unit the declarative ViewSpec layer composes into panels.

export type ChartType = 'time-series' | 'correlation' | 'distribution' | 'categorical' | 'join-graph';

export interface ChartSpec {
  type: ChartType;
  title: string;
  xField: string;
  yFields: string[];
  seriesField?: string;
}

/**
 * What the translator recommends for a result set. Not every result is a
 * chart: a single aggregate value is a KPI stat (no axes, so outside
 * ChartSpec), and anything ambiguous or too wide/large to plot cleanly
 * degrades to the tabular grid rather than a broken chart. The three real
 * chart shapes (bar, line, scatter) all reduce to a ChartSpec whose `type`
 * names the chart module that owns their visual.
 */
export type ChartRecommendation =
  | { kind: 'chart'; spec: ChartSpec }
  | { kind: 'kpi'; label: string; value: string }
  | { kind: 'grid'; reason: string };
