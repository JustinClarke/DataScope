import { describe, expect, it } from 'vitest';
import { buildRecipeScript } from './recipeExport';
import type { TableRegistryEntry } from '../types';

function derivedTable(overrides: Partial<TableRegistryEntry>): TableRegistryEntry {
  return {
    id: 'tbl-1',
    tableName: 'high_value_orders',
    datasetId: 'ds-1',
    origin: 'derived',
    rowCount: 10,
    columnCount: 3,
    memoryBytes: 1024,
    createdAt: '2026-07-20T00:00:00.000Z',
    generatingSql: 'CREATE TABLE high_value_orders AS SELECT * FROM orders WHERE total > 100',
    ...overrides,
  };
}

describe('buildRecipeScript', () => {
  it('renders a placeholder comment when no derived tables exist', () => {
    expect(buildRecipeScript([])).toBe('-- No transforms recorded this session.\n');
  });

  it('excludes non-derived and generatingSql-less tables', () => {
    const fileTable = derivedTable({ id: 'tbl-2', origin: 'file', generatingSql: undefined });
    const strayDerived = derivedTable({ id: 'tbl-3', generatingSql: undefined });
    const script = buildRecipeScript([fileTable, strayDerived]);
    expect(script).toBe('-- No transforms recorded this session.\n');
  });

  it('orders statements by creation time and includes each table name as a header comment', () => {
    const first = derivedTable({
      id: 'tbl-1',
      tableName: 'a',
      createdAt: '2026-07-20T00:00:01.000Z',
      generatingSql: 'CREATE TABLE a AS SELECT 1',
    });
    const second = derivedTable({
      id: 'tbl-2',
      tableName: 'b',
      createdAt: '2026-07-20T00:00:02.000Z',
      generatingSql: 'CREATE TABLE b AS SELECT * FROM a',
    });
    // Passed out of order — the output must still be chronological.
    const script = buildRecipeScript([second, first]);

    const aIndex = script.indexOf('-- a');
    const bIndex = script.indexOf('-- b');
    expect(aIndex).toBeGreaterThan(-1);
    expect(bIndex).toBeGreaterThan(aIndex);
    expect(script).toContain('CREATE TABLE a AS SELECT 1;');
    expect(script).toContain('CREATE TABLE b AS SELECT * FROM a;');
  });

  it('normalizes a trailing semicolon so every statement ends with exactly one', () => {
    const table = derivedTable({ generatingSql: 'CREATE TABLE high_value_orders AS SELECT 1;  ' });
    const script = buildRecipeScript([table]);
    expect(script).toContain('CREATE TABLE high_value_orders AS SELECT 1;\n');
    expect(script).not.toContain(';;');
  });

  it('includes a statement-count summary line', () => {
    const one = derivedTable({});
    expect(buildRecipeScript([one])).toContain('1 statement, in the order they ran.');

    const two = derivedTable({ id: 'tbl-2', tableName: 'b' });
    expect(buildRecipeScript([one, two])).toContain('2 statements, in the order they ran.');
  });
});
