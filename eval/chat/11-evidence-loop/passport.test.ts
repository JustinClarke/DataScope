import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEvalEngine, type EvalEngine } from '../../duckdb/duckdb';
import { loadEvalDatasets } from '../../dataset/tables';
import type { DatasetPassport } from './contracts';
import { buildPassport } from './passport';

let engine: EvalEngine;
let first: DatasetPassport;
let second: DatasetPassport;

beforeAll(async () => {
  engine = await createEvalEngine();
  const dataset = (await loadEvalDatasets(engine)).find((candidate) => candidate.id === 'ecommerce');
  if (!dataset) throw new Error('ecommerce fixture missing');
  first = await buildPassport(engine, dataset.id, dataset.tables);
  second = await buildPassport(engine, dataset.id, dataset.tables);
});

afterAll(async () => {
  await engine.close();
});

describe('deterministic ecommerce passport', () => {
  it('is byte-for-byte stable across repeated builds', () => {
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('reports the fixture header independently of an LLM', () => {
    expect(first.header.tableCount).toBe(4);
    expect(first.header.totalRows).toBe(5437);
    expect(first.header.dateRange).toEqual({ min: '2019-01-07', max: '2024-12-15' });
  });

  it('infers the three ecommerce key relationships and checks their orphans', () => {
    const relationships = first.relationships.map(
      (relationship) => `${relationship.many.table}.${relationship.many.column}->${relationship.one.table}.${relationship.one.column}:${relationship.orphanCount}`,
    );
    expect(relationships).toEqual([
      'orders.customer_id->customers.customer_id:0',
      'order_items.product_id->products.product_id:0',
      'order_items.order_id->orders.order_id:0',
    ]);
  });

  it('computes quality without an LLM', () => {
    expect(first.tables.every((table) => table.duplicateRows === 0)).toBe(true);
    expect(first.quality.filter((finding) => finding.code === 'orphans')).toHaveLength(0);
  });
});
