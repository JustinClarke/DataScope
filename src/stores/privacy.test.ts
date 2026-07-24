// §22 privacy checklist, exercised at the state layer (01-foundation/02-state-management.md
// test plan): populate a dataset, "reload," and confirm localStorage holds settings keys
// only. IndexedDB isn't asserted here — nothing in this store layer opens a database yet
// (that lands with DuckDB's OPFS persistence, Phase 2/8); asserting it now would be vacuous.
import { beforeEach, describe, expect, it } from 'vitest';
import { useByokKeyStore } from './byokKey';
import { useDatasetsStore } from './datasets';
import { SETTINGS_STORAGE_KEY, useSettingsStore } from './settings';
import type { Dataset, TableRegistryEntry } from '../types';

const dataset: Dataset = {
  id: 'ds-1',
  name: 'sensitive-customers.csv',
  sourceType: 'file',
  tableNames: ['customers'],
  ingestedAt: '2026-07-19T00:00:00.000Z',
};

const table: TableRegistryEntry = {
  id: 'tbl-1',
  tableName: 'customers',
  datasetId: 'ds-1',
  origin: 'file',
  rowCount: 500,
  columnCount: 8,
  memoryBytes: 65536,
  createdAt: '2026-07-19T00:00:00.000Z',
};

function localStorageKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)!);
  return keys;
}

beforeEach(() => {
  localStorage.clear();
  useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
  useSettingsStore.setState({ aiMode: null, byokPreference: 'free-tier-first', theme: 'system' });
});

describe('privacy gate', () => {
  it('a populated dataset never reaches localStorage; only settings survive "reload"', () => {
    useDatasetsStore.getState().registerDataset(dataset, [table]);
    useSettingsStore.getState().setTheme('dark');

    expect(localStorageKeys()).toEqual([SETTINGS_STORAGE_KEY]);

    const persisted = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!);
    expect(persisted.state).toEqual({
      aiMode: null,
      byokPreference: 'free-tier-first',
      // The D3 routing-touched flag is a preference too — never dataset content.
      byokRoutingTouched: false,
      theme: 'dark',
      skipToData: false,
      // The local-model download consent is a preference, never content.
      webllmConsent: null,
      // §11.3 / 06-ai/03: the metadata-only-repair toggle is a preference too.
      metadataOnlyRepair: true,
      // §12.3: the "links I created" list — tokens/labels, never dataset content.
      shareLinks: [],
    });

    const raw = JSON.stringify(persisted);
    expect(raw).not.toContain('sensitive-customers');
    expect(raw).not.toContain('customers');
    expect(raw).not.toContain('ds-1');
  });

  it('a BYOK key survives only in memory — never localStorage, in any storage key (D9)', () => {
    useByokKeyStore.getState().setKey('sk-privacy-canary-key');
    useSettingsStore.getState().setByokPreference('prefer-key'); // force a settings persist write

    expect(useByokKeyStore.getState().key).toBe('sk-privacy-canary-key');
    const everything = localStorageKeys()
      .map((k) => `${k}=${localStorage.getItem(k)}`)
      .join('|');
    expect(everything).not.toContain('sk-privacy-canary-key');
  });
});
