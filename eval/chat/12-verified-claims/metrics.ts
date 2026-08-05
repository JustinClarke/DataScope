export interface ColumnRef {
  table: 'customers' | 'products' | 'orders' | 'order_items';
  column: string;
}

export type Metric =
  | { kind: 'count_rows'; table: ColumnRef['table'] }
  | { kind: 'count_distinct'; column: ColumnRef }
  | { kind: 'sum'; column: ColumnRef }
  | { kind: 'average'; column: ColumnRef }
  | { kind: 'sum_product'; left: ColumnRef; right: ColumnRef }
  | { kind: 'ratio'; numerator: Metric; denominator: Metric; scale: 1 | 100 };

const MAX_METRIC_DEPTH = 2;

export function assertBoundedMetric(metric: Metric, depth = 1): void {
  if (depth > MAX_METRIC_DEPTH) {
    throw new Error(`metric depth exceeds ${MAX_METRIC_DEPTH}`);
  }
  if (metric.kind !== 'ratio') return;
  if (metric.scale !== 1 && metric.scale !== 100) throw new Error('ratio scale must be 1 or 100');
  assertBoundedMetric(metric.numerator, depth + 1);
  assertBoundedMetric(metric.denominator, depth + 1);
}

function column(ref: ColumnRef): string {
  return `${ref.table}.${ref.column}`;
}

export function metricId(metric: Metric): string {
  switch (metric.kind) {
    case 'count_rows':
      return `count_rows(${metric.table})`;
    case 'count_distinct':
      return `count_distinct(${column(metric.column)})`;
    case 'sum':
      return `sum(${column(metric.column)})`;
    case 'average':
      return `average(${column(metric.column)})`;
    case 'sum_product':
      return `sum_product(${column(metric.left)},${column(metric.right)})`;
    case 'ratio':
      return `ratio(${metricId(metric.numerator)},${metricId(metric.denominator)},scale=${metric.scale})`;
  }
}

export function describeMetric(metric: Metric): string {
  switch (metric.kind) {
    case 'count_rows':
      return `count of rows in ${metric.table}`;
    case 'count_distinct':
      return `distinct count of ${column(metric.column)}`;
    case 'sum':
      return `sum of ${column(metric.column)}`;
    case 'average':
      return `average of ${column(metric.column)}`;
    case 'sum_product':
      return `sum of ${column(metric.left)} multiplied by ${column(metric.right)}`;
    case 'ratio':
      return `${describeMetric(metric.numerator)} divided by ${describeMetric(metric.denominator)}${metric.scale === 100 ? ', scaled by 100' : ''}`;
  }
}
