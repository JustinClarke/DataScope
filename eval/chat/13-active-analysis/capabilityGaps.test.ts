import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EvalEngine } from '../../duckdb/duckdb';
import type { CompactEvidencePacket, DatasetPassport } from './contracts';
import { buildCapabilityGapMap, corroborateUnsupported } from './capabilityGaps';
import { createEcommerceFixture } from './testFixtures';

let engine: EvalEngine;
let passport: DatasetPassport;

beforeAll(async () => {
  ({ engine, passport } = await createEcommerceFixture());
});

afterAll(async () => {
  await engine.close();
});

const completePacket: CompactEvidencePacket = {
  id: 'evidence:x',
  metric: 'sum(x)',
  unit: 'USD',
  filters: [],
  completeness: 'complete',
  sourceRowCount: 1,
  returnedRowCount: 1,
  rows: [{ rowId: 'r1', label: 'r1', value: 1 }],
};
const truncatedPacket: CompactEvidencePacket = { ...completePacket, id: 'evidence:y', completeness: 'truncated' };

describe('capability gap map (§ profit/revenue, age/country, causation/description, complete/truncated)', () => {
  it('distinguishes revenue (computable) from profit (no cost column) on the real ecommerce schema', () => {
    const gaps = buildCapabilityGapMap(passport);
    expect(gaps.missing_cost).toBe(true);
  });

  it('distinguishes country (computable) from age (no demographic column) on the real ecommerce schema', () => {
    const gaps = buildCapabilityGapMap(passport);
    expect(gaps.missing_demographic).toBe(true);
  });

  it('never corroborates causal_inference conditionally; the schema never carries experimental-design metadata', () => {
    const gaps = buildCapabilityGapMap(passport);
    expect(gaps.causal_inference).toBe(true);
  });

  it('would not flag missing_cost if the schema grew a real cost column', () => {
    const withCost: DatasetPassport = {
      ...passport,
      tables: passport.tables.map((table) =>
        table.name === 'products'
          ? { ...table, columns: [...table.columns, { table: 'products', column: 'cost', physicalType: 'DOUBLE', semanticType: 'Quantitative', distinctCount: 1, nullCount: 0, min: 1, max: 1 }] }
          : table,
      ),
    };
    expect(buildCapabilityGapMap(withCost).missing_cost).toBe(false);
  });
});

describe('unsupported corroboration (§ "unsupported is a proposal, not an authority")', () => {
  // `describe` bodies run synchronously at collection time, before the async beforeAll above has
  // populated `passport` — build the gap map fresh inside each test instead of hoisting it here.
  it('corroborates causal_inference unconditionally', () => {
    expect(corroborateUnsupported('causal_inference', buildCapabilityGapMap(passport), [])).toBe(true);
  });

  it('corroborates missing_cost and missing_demographic from the dataset-level gap map', () => {
    const gaps = buildCapabilityGapMap(passport);
    expect(corroborateUnsupported('missing_cost', gaps, [])).toBe(true);
    expect(corroborateUnsupported('missing_demographic', gaps, [])).toBe(true);
  });

  it('corroborates incomplete_scope only when the resolved evidence actually includes a truncated packet', () => {
    const gaps = buildCapabilityGapMap(passport);
    expect(corroborateUnsupported('incomplete_scope', gaps, [completePacket])).toBe(false);
    expect(corroborateUnsupported('incomplete_scope', gaps, [completePacket, truncatedPacket])).toBe(true);
  });

  it('refuses incomplete_scope with no resolved evidence at all', () => {
    expect(corroborateUnsupported('incomplete_scope', buildCapabilityGapMap(passport), [])).toBe(false);
  });
});
