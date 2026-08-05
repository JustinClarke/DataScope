import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEvalEngine, type EvalEngine } from '../../duckdb/duckdb';
import {
  compileEcommercePlan,
  executeEcommercePlan,
  metricUnit,
} from './ecommercePipeline';
import { assertBoundedMetric, metricId, type Metric } from './metrics';
import { averageOrderValueMetric, averageOrderValuePlan, monthlyRevenuePlan } from './phase3Plans';
import { PHASE5_QUESTIONS, truncatedProductRevenuePlan } from './phase5Protocol';
import { renderVerifiedFact } from './renderer';
import { verifyClaim } from './verifier';

const samples = path.resolve('public/samples/ecommerce');

let engine: EvalEngine;

beforeAll(async () => {
  engine = await createEvalEngine();
  await engine.loadCsv('customers', path.join(samples, 'customers.csv'));
  await engine.loadCsv('products', path.join(samples, 'products.csv'));
  await engine.loadCsv('orders', path.join(samples, 'orders.csv'));
  await engine.loadCsv('order_items', path.join(samples, 'order_items.csv'));
});

afterAll(async () => {
  await engine.close();
});

describe('bounded recursive metrics', () => {
  it('accepts one ratio layer and assigns average-order-value units from typed operands', () => {
    expect(() => assertBoundedMetric(averageOrderValueMetric)).not.toThrow();
    expect(metricId(averageOrderValueMetric)).toBe(
      'ratio(sum_product(order_items.quantity,order_items.unit_price),count_distinct(order_items.order_id),scale=1)',
    );
    expect(metricUnit(averageOrderValueMetric)).toBe('USD/order');
  });

  it('rejects a ratio nested beyond the declared depth bound', () => {
    const nested: Metric = {
      kind: 'ratio', numerator: averageOrderValueMetric,
      denominator: { kind: 'count_rows', table: 'orders' }, scale: 1,
    };
    expect(() => assertBoundedMetric(nested)).toThrow('metric depth exceeds 2');
  });

  it('compiles division with a zero-denominator guard and compiler-authored joins', () => {
    const sql = compileEcommercePlan(averageOrderValuePlan);
    expect(sql).toContain('NULLIF((COUNT(DISTINCT t0."order_id")), 0)');
    expect(sql).toContain('LEFT JOIN "orders" t1');
    expect(sql).toContain(`t1."status" = 'completed'`);
    expect(sql).not.toContain('average order value');
  });
});

describe('authoritative ecommerce evidence cells', () => {
  it('executes every predeclared Phase 5 packet and preserves the truncated control scope', async () => {
    const plans = [...new Map(PHASE5_QUESTIONS.flatMap((question) => question.plans).map((plan) => [plan.id, plan])).values()];
    const packets = await Promise.all(plans.map((plan) => executeEcommercePlan(engine, plan)));
    expect(packets.every(({ evidence }) => evidence.rows.length > 0)).toBe(true);
    expect(packets.find(({ evidence }) => evidence.id === `evidence:${truncatedProductRevenuePlan.id}`)?.evidence)
      .toMatchObject({ completeness: 'truncated', rows: { length: 5 } });
  });

  it('computes completed-order AOV identically to the fixture reference query', async () => {
    const { evidence } = await executeEcommercePlan(engine, averageOrderValuePlan);
    const reference = await engine.execute(
      `SELECT ROUND(AVG(order_total), 2) FROM (
        SELECT o.order_id, SUM(oi.quantity * oi.unit_price) AS order_total
        FROM orders o JOIN order_items oi ON o.order_id = oi.order_id
        WHERE o.status = 'completed' GROUP BY o.order_id
      ) t`,
    );

    expect(evidence.metric).toBe(metricId(averageOrderValueMetric));
    expect(evidence.unit).toBe('USD/order');
    expect(evidence.rows).toHaveLength(1);
    expect(evidence.rows[0]?.rowId).toBe('r1');
    expect(evidence.rows[0]?.value).toBe(reference.rows[0]?.[0]);
    expect(evidence.rows[0]?.label).toContain('divided by distinct count of order_items.order_id');
  });

  it('fails a zero-denominator ratio closed as a null evidence cell', async () => {
    const { evidence } = await executeEcommercePlan(engine, {
      ...averageOrderValuePlan,
      id: 'empty-aov',
      filters: [{ column: { table: 'orders', column: 'status' }, operator: 'equals', value: 'not-a-status' }],
    });
    expect(evidence.rows).toEqual([{
      rowId: 'r1',
      label: expect.stringContaining('orders.status equals not-a-status'),
      value: null,
    }]);
    expect(verifyClaim({
      kind: 'threshold',
      subject: { evidenceId: evidence.id, rowId: 'r1', field: 'value' },
      operator: 'above',
      threshold: 0,
    }, [evidence])).toMatchObject({ accepted: false, reason: 'NON_NUMERIC_OPERAND' });
  });

  it('addresses real monthly rows deterministically and renders only verified facts', async () => {
    const { evidence } = await executeEcommercePlan(engine, monthlyRevenuePlan);
    expect(evidence.completeness).toBe('complete');
    expect(evidence.dimension).toBe('orders.order_date/month');
    expect(evidence.rows[0]).toMatchObject({ rowId: 'r1', label: '2021-12-01', order: 0 });
    expect(evidence.rows).toHaveLength(37);

    const result = verifyClaim({
      kind: 'change',
      from: { evidenceId: evidence.id, rowId: 'r1', field: 'value' },
      to: { evidenceId: evidence.id, rowId: 'r2', field: 'value' },
      operator: 'increase',
    }, [evidence]);
    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error(result.detail);
    expect(renderVerifiedFact(result.fact)).toContain('was a verified increase from 2021-12-01');
  });
});
