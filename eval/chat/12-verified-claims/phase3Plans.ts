import type { EcommerceEvidencePlan } from './ecommercePipeline';
import type { Metric } from './metrics';

export const averageOrderValueMetric: Metric = {
  kind: 'ratio',
  numerator: {
    kind: 'sum_product',
    left: { table: 'order_items', column: 'quantity' },
    right: { table: 'order_items', column: 'unit_price' },
  },
  denominator: { kind: 'count_distinct', column: { table: 'order_items', column: 'order_id' } },
  scale: 1,
};

export const averageOrderValuePlan: EcommerceEvidencePlan = {
  id: 'completed-aov',
  metric: averageOrderValueMetric,
  filters: [{ column: { table: 'orders', column: 'status' }, operator: 'equals', value: 'completed' }],
  maxRows: 1,
};

export const monthlyRevenuePlan: EcommerceEvidencePlan = {
  id: 'monthly-revenue',
  metric: {
    kind: 'sum_product',
    left: { table: 'order_items', column: 'quantity' },
    right: { table: 'order_items', column: 'unit_price' },
  },
  dimension: { column: { table: 'orders', column: 'order_date' }, timeGrain: 'month' },
  filters: [],
  maxRows: 100,
};

export const phase3Plans = [averageOrderValuePlan, monthlyRevenuePlan] as const;
