import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EvalEngine } from '../../duckdb/duckdb';
import { averageOrderValuePlan, monthlyRevenuePlan } from '../12-verified-claims/phase3Plans';
import type { DatasetPassport } from './contracts';
import {
  MAX_ROWS_PER_PACKET,
  resolveComparePeriodsCandidate,
  resolveJoinCoverageCandidate,
  resolveMissingnessCandidate,
  resolvePlanCandidate,
} from './compactEvidence';
import { createEcommerceFixture } from './testFixtures';

let engine: EvalEngine;
let passport: DatasetPassport;

beforeAll(async () => {
  ({ engine, passport } = await createEcommerceFixture());
});

afterAll(async () => {
  await engine.close();
});

describe('compaction enforces row/packet limits without lying about completeness', () => {
  it('caps a 37-row monthly packet to the model row limit and marks it truncated even though the plan itself was not', async () => {
    const { packet } = await resolvePlanCandidate(engine, monthlyRevenuePlan);
    expect(packet.sourceRowCount).toBe(37);
    expect(packet.returnedRowCount).toBe(MAX_ROWS_PER_PACKET);
    expect(packet.rows).toHaveLength(MAX_ROWS_PER_PACKET);
    expect(packet.completeness).toBe('truncated');
  });

  it('reports a single-row summary as complete with matching source/returned counts', async () => {
    const { packet } = await resolvePlanCandidate(engine, averageOrderValuePlan);
    expect(packet.sourceRowCount).toBe(1);
    expect(packet.returnedRowCount).toBe(1);
    expect(packet.completeness).toBe('complete');
  });

  it('carries canonical typed filters as strings derived from the compiled plan, not raw SQL', async () => {
    const { sql, packet } = await resolvePlanCandidate(engine, averageOrderValuePlan);
    expect(packet.filters).toEqual(['orders.status equals completed']);
    expect(sql).toContain(`'completed'`);
  });
});

describe('passport-derived candidates never touch DuckDB', () => {
  it('derives missingness rows straight from the passport null counts', () => {
    const packet = resolveMissingnessCandidate('table-missingness', passport);
    expect(packet.unit).toBe('rows');
    expect(packet.sourceRowCount).toBe(passport.tables.reduce((sum, table) => sum + table.columns.length, 0));
    expect(packet.rows.every((row) => typeof row.value === 'number')).toBe(true);
  });

  it('derives join coverage rows from the passport relationship orphan counts', () => {
    const packet = resolveJoinCoverageCandidate('join-coverage', passport);
    expect(packet.sourceRowCount).toBe(passport.relationships.length);
    expect(packet.rows.every((row) => row.value === 0)).toBe(true);
  });
});

describe('compare_periods derives deltas from an already-resolved source packet', () => {
  it('computes the largest complete month-to-month change without a new DB query', async () => {
    const { packet: monthly } = await resolvePlanCandidate(engine, monthlyRevenuePlan);
    const deltas = resolveComparePeriodsCandidate('largest-monthly-change', monthly);
    expect(deltas.rows.length).toBeGreaterThan(0);
    const maxAbsDelta = Math.max(...deltas.rows.map((row) => Math.abs(row.value ?? 0)));
    const largest = deltas.rows.find((row) => Math.abs(row.value ?? 0) === maxAbsDelta);
    expect(largest).toBeDefined();
    // The source packet was itself capped to 12 rows, so its own truncation propagates.
    expect(deltas.completeness).toBe('truncated');
  });
});
