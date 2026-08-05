import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reconcile, rehydrateWorkspace, recoverTable } from './rehydration';
import { dedupeTableName, sanitizeTableName } from '../features/ingestion/formatPolicy';
import { useDatasetsStore } from '../stores/datasets';
import { useSelectionStore } from '../stores/selection';
import { useRehydrationStore } from '../stores/rehydration';
import type { RestoredTable } from './workspace';
import type { TableRegistryEntry } from '../types';

const execute = vi.fn();

vi.mock('../workers/duckdb.worker', () => ({
  duckDBEngine: {
    execute: (...args: unknown[]) => execute(...args),
    registerFile: vi.fn(),
  },
  resetEngine: vi.fn(),
}));

function entry(overrides: Partial<TableRegistryEntry> & { tableName: string }): TableRegistryEntry {
  return {
    id: `t-${overrides.tableName}`,
    datasetId: 'ds-1',
    origin: 'file',
    rowCount: 10,
    columnCount: 2,
    memoryBytes: 100,
    createdAt: '2026-07-29T00:00:00.000Z',
    ...overrides,
  };
}

/** What `SELECT table_name FROM duckdb_tables()` answers with. */
function engineHolds(...names: string[]): void {
  execute.mockReset().mockResolvedValue({ rows: names.map((n) => [n]), rowCount: names.length });
}

describe('reconcile', () => {
  it('restores a table the engine has', () => {
    const tables = [entry({ tableName: 'orders', fileHash: 'abc' })];
    const restored: RestoredTable[] = [{ tableName: 'orders', fileHash: 'abc', outcome: 'restored' }];

    expect(reconcile(tables, ['orders'], restored)).toEqual([
      { tableId: 't-orders', tableName: 'orders', status: 'restored', reason: null },
    ]);
  });

  it('treats a fileHash mismatch as lost, not restored, even though the table is present', () => {
    const tables = [entry({ tableName: 'orders', fileHash: 'abc' })];
    const restored: RestoredTable[] = [{ tableName: 'orders', fileHash: 'def', outcome: 'restored' }];

    const [outcome] = reconcile(tables, ['orders'], restored);
    expect(outcome.status).toBe('lost');
    expect(outcome.reason).toMatch(/no longer matches the file it came from/);
  });

  it('loses a sampled-tier file with its reason stated — its rows were never stored', () => {
    const tables = [entry({ tableName: 'big', sampled: true, sampleRowLimit: 1000 })];

    const [outcome] = reconcile(tables, [], []);
    expect(outcome.status).toBe('lost');
    expect(outcome.reason).toMatch(/sampled preview/);
  });

  it('carries the restore report’s own reason for an evicted staging entry', () => {
    const tables = [entry({ tableName: 'orders' })];
    const restored: RestoredTable[] = [
      { tableName: 'orders', outcome: 'failed', reason: 'The stored copy of this table is no longer on disk.' },
    ];

    expect(reconcile(tables, [], restored)[0]).toMatchObject({
      status: 'lost',
      reason: 'The stored copy of this table is no longer on disk.',
    });
  });

  it('marks an api table with a sourceUrl recoverable by re-fetch', () => {
    const tables = [entry({ tableName: 'rates', origin: 'api', sourceUrl: 'https://example.test/rates' })];

    expect(reconcile(tables, [], [])[0]).toMatchObject({ status: 'recoverable', recovery: 'refetch' });
  });

  it('marks a derived table recoverable only once its inputs are back', () => {
    const derived = entry({ tableName: 'top_orders', origin: 'derived', generatingSql: 'CREATE TABLE top_orders AS SELECT * FROM "orders"' });

    const withInput = reconcile([entry({ tableName: 'orders' }), derived], ['orders'], []);
    expect(withInput[1]).toMatchObject({ status: 'recoverable', recovery: 'replay' });

    const withoutInput = reconcile([entry({ tableName: 'orders' }), derived], [], []);
    expect(withoutInput[1].status).toBe('lost');
    expect(withoutInput[1].reason).toMatch(/tables this was built from didn't come back/);
  });

  it('restores nine and loses one — partial recovery is the normal path', () => {
    const good = Array.from({ length: 9 }, (_, i) => entry({ tableName: `t${i}` }));
    const outcomes = reconcile([...good, entry({ tableName: 'gone' })], good.map((t) => t.tableName), []);

    expect(outcomes.filter((o) => o.status === 'restored')).toHaveLength(9);
    expect(outcomes.filter((o) => o.status === 'lost')).toHaveLength(1);
  });

  it('gives every entry exactly one status', () => {
    const tables = [
      entry({ tableName: 'orders' }),
      entry({ tableName: 'rates', origin: 'api', sourceUrl: 'https://example.test' }),
      entry({ tableName: 'big', sampled: true }),
      entry({ tableName: 'shared_x', origin: 'shared' }),
    ];

    expect(reconcile(tables, ['orders'], []).map((o) => o.status)).toEqual([
      'restored',
      'recoverable',
      'lost',
      'lost',
    ]);
  });
});

describe('rehydrateWorkspace', () => {
  beforeEach(() => {
    useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
    useSelectionStore.setState({
      selectedTableId: null,
      selectedColumn: null,
      selectedEdgeId: null,
      lastSelectionKind: null,
    });
    useRehydrationStore.setState({ outcomes: {} });
    engineHolds();
  });

  it('does nothing, and never asks the engine, on a cold workspace', async () => {
    await expect(rehydrateWorkspace({ tables: [], durationMs: 0 })).resolves.toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('fires no network request for a recoverable api table', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    useDatasetsStore.setState({
      tables: [entry({ tableName: 'rates', origin: 'api', sourceUrl: 'https://example.test/rates' })],
    });

    const outcomes = await rehydrateWorkspace({ tables: [], durationMs: 0 });

    expect(outcomes[0]).toMatchObject({ status: 'recoverable', recovery: 'refetch' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('clears a selection pointing at a table that did not come back, and keeps one that did', async () => {
    engineHolds('orders');
    useDatasetsStore.setState({ tables: [entry({ tableName: 'orders' }), entry({ tableName: 'gone' })] });
    useSelectionStore.setState({ selectedTableId: 't-gone', lastSelectionKind: 'table' });

    await rehydrateWorkspace({ tables: [], durationMs: 0 });
    expect(useSelectionStore.getState().selectedTableId).toBeNull();
    expect(useSelectionStore.getState().lastSelectionKind).toBeNull();

    useSelectionStore.setState({ selectedTableId: 't-orders', lastSelectionKind: 'table' });
    await rehydrateWorkspace({ tables: [], durationMs: 0 });
    expect(useSelectionStore.getState().selectedTableId).toBe('t-orders');
  });

  it('clears a column selection on a lost table but leaves a selected edge alone', async () => {
    useDatasetsStore.setState({ tables: [entry({ tableName: 'gone' })] });
    useSelectionStore.setState({
      selectedColumn: { tableId: 't-gone', column: 'id' },
      selectedEdgeId: 'edge-1',
      lastSelectionKind: 'column',
    });

    await rehydrateWorkspace({ tables: [], durationMs: 0 });

    expect(useSelectionStore.getState().selectedColumn).toBeNull();
    expect(useSelectionStore.getState().selectedEdgeId).toBe('edge-1');
  });

  // The case 07b's live run surfaced: a reload used to leave the tables in the
  // engine but the rail cold, so re-dropping the same file hit
  // `Catalog Error: Table with name "..." already exists!`. A reconciled
  // registry is the fix — ingest's own dedupe reads it, so the second drop is
  // never handed a name the engine already holds.
  it('leaves the registry populated, so a re-drop of a restored file dedupes instead of colliding', async () => {
    engineHolds('probe_rows');
    useDatasetsStore.setState({ tables: [entry({ tableName: 'probe_rows' })] });

    await rehydrateWorkspace({ tables: [], durationMs: 0 });

    const taken = new Set(useDatasetsStore.getState().tables.map((t) => t.tableName));
    expect(taken.has('probe_rows')).toBe(true);
    expect(dedupeTableName(sanitizeTableName('probe_rows'), taken)).not.toBe('probe_rows');
  });
});

describe('recoverTable', () => {
  beforeEach(() => {
    useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
    useRehydrationStore.setState({ outcomes: {} });
    execute.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('replays a derived table’s recorded SQL and makes it an ordinary row again', async () => {
    const sql = 'CREATE TABLE top_orders AS SELECT * FROM "orders"';
    useDatasetsStore.setState({ tables: [entry({ tableName: 'top_orders', origin: 'derived', generatingSql: sql })] });
    useRehydrationStore.getState().setOutcomes([
      { tableId: 't-top_orders', tableName: 'top_orders', status: 'recoverable', recovery: 'replay', reason: 'x' },
    ]);

    await expect(recoverTable('t-top_orders')).resolves.toBe(true);
    expect(execute).toHaveBeenCalledWith(sql);
    expect(useRehydrationStore.getState().outcomes['t-top_orders']).toMatchObject({ status: 'restored', reason: null });
  });

  it('stays recoverable when the replay fails', async () => {
    execute.mockRejectedValue(new Error('Catalog Error: boom'));
    useDatasetsStore.setState({
      tables: [entry({ tableName: 'top_orders', origin: 'derived', generatingSql: 'CREATE TABLE top_orders AS SELECT 1' })],
    });
    useRehydrationStore.getState().setOutcomes([
      { tableId: 't-top_orders', tableName: 'top_orders', status: 'recoverable', recovery: 'replay', reason: 'x' },
    ]);

    await expect(recoverTable('t-top_orders')).resolves.toBe(false);
    expect(useRehydrationStore.getState().outcomes['t-top_orders']).toMatchObject({
      status: 'recoverable',
      reason: 'Catalog Error: boom',
    });
  });

  it('refuses to recover a lost table', async () => {
    useDatasetsStore.setState({ tables: [entry({ tableName: 'big', sampled: true })] });
    useRehydrationStore.getState().setOutcomes([
      { tableId: 't-big', tableName: 'big', status: 'lost', reason: 'sampled' },
    ]);

    await expect(recoverTable('t-big')).resolves.toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});
