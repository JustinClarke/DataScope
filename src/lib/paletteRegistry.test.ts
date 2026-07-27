import { describe, expect, it } from 'vitest';
import { buildPaletteEntries } from './paletteRegistry';
import type { TableRegistryEntry } from '../types';

function table(id: string, tableName: string): TableRegistryEntry {
  return {
    id,
    tableName,
    datasetId: 'd1',
    origin: 'sample',
    rowCount: 10,
    columnCount: 1,
    memoryBytes: 100,
    createdAt: new Date().toISOString(),
  };
}

describe('buildPaletteEntries', () => {
  it('always leads with the map entry, enabled', () => {
    const entries = buildPaletteEntries([]);
    expect(entries[0]).toMatchObject({ id: 'map', label: 'Dataset map', enabled: true, action: { kind: 'open-map' } });
  });

  it('adds one enabled profile entry per table, in table order', () => {
    const entries = buildPaletteEntries([table('o', 'orders'), table('c', 'customers')]);
    expect(entries[1]).toMatchObject({
      id: 'profile:o',
      label: 'Profile: orders',
      enabled: true,
      action: { kind: 'open-profile', tableId: 'o' },
    });
    expect(entries[2]).toMatchObject({
      id: 'profile:c',
      label: 'Profile: customers',
      enabled: true,
      action: { kind: 'open-profile', tableId: 'c' },
    });
  });

  it('lists the five W7.5 module destinations, each enabled and real', () => {
    const entries = buildPaletteEntries([]);
    const wired = entries.filter((e) => e.action.kind === 'open-module');
    expect(wired.map((e) => e.id).sort()).toEqual(['charts', 'correlation', 'export', 'pivot', 'sql'].sort());
    for (const entry of wired) {
      expect(entry.enabled).toBe(true);
      expect(entry.disabledReason).toBeUndefined();
      expect(entry.action).toMatchObject({ kind: 'open-module', module: entry.id });
    }
  });

  it('lists the two remaining not-yet-wired destinations, each disabled with a non-empty reason', () => {
    const entries = buildPaletteEntries([]);
    const notYetWired = entries.filter((e) => e.action.kind === 'unavailable');
    expect(notYetWired).toHaveLength(2);
    expect(notYetWired.map((e) => e.id).sort()).toEqual(['ai', 'ingestion'].sort());
    for (const entry of notYetWired) {
      expect(entry.enabled).toBe(false);
      expect(entry.disabledReason).toBeTruthy();
    }
  });

  it('never lists a separate dossier or relationships entry — both superseded by the map entry', () => {
    const entries = buildPaletteEntries([]);
    expect(entries.some((e) => e.id === 'dossier')).toBe(false);
    expect(entries.some((e) => e.id === 'relationships')).toBe(false);
  });
});
