import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EvalEngine } from '../../duckdb/duckdb';
import { compactPassport } from '../11-evidence-loop/passport';
import type { DatasetPassport } from './contracts';
import { buildDatasetMap } from './datasetMap';
import { createEcommerceFixture } from './testFixtures';

let engine: EvalEngine;
let passport: DatasetPassport;

beforeAll(async () => {
  ({ engine, passport } = await createEcommerceFixture());
});

afterAll(async () => {
  await engine.close();
});

/** Verbatim cell values experiment 11's compactPassport puts in the prompt via VARCHAR min/max. */
const LEAKED_CELL_VALUES = ['Alex Chen', 'Taylor Rossi', 'example.com', 'Apparel Item 100', 'Toys Item 87'];

describe('the model-facing dataset map carries no sample values', () => {
  it('reproduces the leak in experiment 11 compactPassport, so this test fails if the seam is swapped back', () => {
    const serialized = JSON.stringify(compactPassport(passport));
    for (const value of LEAKED_CELL_VALUES) expect(serialized).toContain(value);
  });

  it('excludes every one of those values from the projection actually sent to the model', () => {
    const serialized = JSON.stringify(buildDatasetMap(passport));
    for (const value of LEAKED_CELL_VALUES) expect(serialized).not.toContain(value);
  });

  it('keeps min/max on temporal columns only', () => {
    const map = buildDatasetMap(passport);
    const columns = map.tables.flatMap((table) => table.columns);
    expect(columns.length).toBeGreaterThan(0);
    for (const column of columns) {
      const hasRange = column.min !== undefined || column.max !== undefined;
      expect(hasRange).toBe(column.semanticType === 'Temporal');
    }
    const orderDate = map.tables.find((table) => table.name === 'orders')?.columns.find((column) => column.name === 'order_date');
    expect(orderDate?.min).toBe('2021-12-31');
    expect(orderDate?.max).toBe('2024-12-15');
  });

  it('strips column extremes from the relationship entries as well', () => {
    const map = buildDatasetMap(passport);
    expect(map.relationships.length).toBeGreaterThan(0);
    for (const relationship of map.relationships) {
      expect(Object.keys(relationship).sort()).toEqual(['many', 'one', 'orphanCount']);
      expect(Object.keys(relationship.one).sort()).toEqual(['column', 'table']);
      expect(Object.keys(relationship.many).sort()).toEqual(['column', 'table']);
    }
  });

  it('retains the § Turn 0 authorized facts: row counts, candidate keys, cardinalities, nulls, temporal header range', () => {
    const map = buildDatasetMap(passport);
    const orders = map.tables.find((table) => table.name === 'orders');
    expect(orders?.rowCount).toBe(1400);
    expect(orders?.candidateKeys).toEqual(['order_id']);
    expect(orders?.columns.find((column) => column.name === 'status')?.distinct).toBe(4);
    expect(orders?.columns.find((column) => column.name === 'status')?.nulls).toBe(0);
    expect(map.header.dateRange).toEqual({ min: '2019-01-07', max: '2024-12-15' });
  });

  it('is byte-for-byte stable across repeated builds from the same passport', () => {
    expect(JSON.stringify(buildDatasetMap(passport))).toBe(JSON.stringify(buildDatasetMap(passport)));
  });
});
