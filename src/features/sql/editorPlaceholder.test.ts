import { describe, expect, it } from 'vitest';
import { consolePlaceholder } from './editorPlaceholder';
import type { TableRegistryEntry } from '../../types';

function table(tableName: string): TableRegistryEntry {
  return {
    id: `tbl-${tableName}`,
    tableName,
    datasetId: 'ds-1',
    origin: 'file',
    rowCount: 10,
    columnCount: 2,
    memoryBytes: 512,
    createdAt: '2026-07-29T00:00:00.000Z',
  };
}

describe('the empty console placeholder (S6.7)', () => {
  it('names a real, already-loaded table in a runnable query', () => {
    expect(consolePlaceholder([table('orders'), table('customers')])).toBe(
      'Type a query, or ⌘Enter to run — try SELECT * FROM "orders" LIMIT 100',
    );
  });

  it('invites a query without inventing a table when nothing is loaded', () => {
    const text = consolePlaceholder([]);
    expect(text).toBe('Type a query, or ⌘Enter to run');
    expect(text).not.toContain('SELECT');
  });
});
