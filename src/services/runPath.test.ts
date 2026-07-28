import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestRun, runInConsole, materializeGuarded, modifyAnywayGuarded, cancelGuarded } from './runPath';
import { useQueryStore, getSession, CONSOLE_SESSION } from '../stores/query';
import { useDrawerStore } from '../stores/drawer';
import { useDatasetsStore } from '../stores/datasets';
import { useRunGuardStore } from '../stores/runGuard';
import * as sqlService from './sql';
import * as transformsService from './transforms';
import type { Dataset, TableRegistryEntry } from '../types';

// Mocked the same way SqlModule.test.tsx already mocks them: the run path's job
// is deciding *which* of these runs, never how they talk to DuckDB.
vi.mock('./sql', async () => {
  const actual = await vi.importActual<typeof sqlService>('./sql');
  return { ...actual, runQuery: vi.fn() };
});

vi.mock('./transforms', async () => {
  const actual = await vi.importActual<typeof transformsService>('./transforms');
  return { ...actual, runTransform: vi.fn(), materializeInsteadOfMutation: vi.fn(), forceMutation: vi.fn() };
});

const result = {
  columnNames: ['result'],
  columnTypes: ['Utf8'],
  rows: [['ok']],
  rowCount: 1,
  executionTimeMs: 0,
};

const dataset: Dataset = {
  id: 'ds-1',
  name: 'orders.csv',
  sourceType: 'file',
  tableNames: ['orders'],
  ingestedAt: '2026-07-28T00:00:00.000Z',
};

const sourceTable: TableRegistryEntry = {
  id: 'tbl-1',
  tableName: 'orders',
  datasetId: 'ds-1',
  origin: 'file',
  rowCount: 10,
  columnCount: 2,
  memoryBytes: 512,
  createdAt: '2026-07-28T00:00:00.000Z',
};

describe('runPath', () => {
  beforeEach(() => {
    useQueryStore.setState({ sessions: {}, history: [], lastRunSession: CONSOLE_SESSION });
    useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
    useDrawerStore.setState({ open: true, view: 'info', consoleActivated: false, expanded: false });
    useRunGuardStore.setState({ pending: null, pendingSession: CONSOLE_SESSION });
    vi.mocked(sqlService.runQuery).mockReset().mockResolvedValue(result);
    vi.mocked(transformsService.runTransform).mockReset().mockResolvedValue(result);
    vi.mocked(transformsService.materializeInsteadOfMutation).mockReset().mockResolvedValue(result);
    vi.mocked(transformsService.forceMutation).mockReset().mockResolvedValue(result);
  });

  describe('requestRun', () => {
    it('sends a SELECT to runQuery and holds nothing', () => {
      requestRun('select 1');
      expect(sqlService.runQuery).toHaveBeenCalledWith('select 1', CONSOLE_SESSION);
      expect(useRunGuardStore.getState().pending).toBeNull();
    });

    it('sends a CREATE TABLE AS through runTransform, tracked in Results and History', async () => {
      requestRun('CREATE TABLE feats AS SELECT 1');
      expect(transformsService.runTransform).toHaveBeenCalledWith('CREATE TABLE feats AS SELECT 1');
      expect(sqlService.runQuery).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(getSession(CONSOLE_SESSION).status).toBe('success'));
      expect(useQueryStore.getState().history[0].sql).toBe('CREATE TABLE feats AS SELECT 1');
    });

    it('intercepts a source mutation — execution did not happen, and the statement is held', () => {
      useDatasetsStore.getState().registerDataset(dataset, [sourceTable]);
      requestRun('DROP TABLE orders');

      expect(sqlService.runQuery).not.toHaveBeenCalled();
      expect(transformsService.runTransform).not.toHaveBeenCalled();
      expect(useRunGuardStore.getState().pending?.mutationTarget).toBe('orders');
    });

    it('is a no-op on empty or whitespace-only SQL', () => {
      requestRun('   ');
      expect(sqlService.runQuery).not.toHaveBeenCalled();
      expect(useRunGuardStore.getState().pending).toBeNull();
    });
  });

  describe('the guard resolutions', () => {
    beforeEach(() => {
      useDatasetsStore.getState().registerDataset(dataset, [sourceTable]);
      requestRun('DROP TABLE orders');
    });

    it('materialize runs the held statement against a clone and clears the guard', async () => {
      materializeGuarded();
      await vi.waitFor(() => expect(transformsService.materializeInsteadOfMutation).toHaveBeenCalledOnce());
      expect(transformsService.forceMutation).not.toHaveBeenCalled();
      expect(useRunGuardStore.getState().pending).toBeNull();
    });

    it('modify anyway runs the held statement as written and clears the guard', async () => {
      modifyAnywayGuarded();
      await vi.waitFor(() => expect(transformsService.forceMutation).toHaveBeenCalledOnce());
      expect(transformsService.materializeInsteadOfMutation).not.toHaveBeenCalled();
      expect(useRunGuardStore.getState().pending).toBeNull();
    });

    it('cancel executes nothing', () => {
      cancelGuarded();
      expect(useRunGuardStore.getState().pending).toBeNull();
      expect(transformsService.materializeInsteadOfMutation).not.toHaveBeenCalled();
      expect(transformsService.forceMutation).not.toHaveBeenCalled();
      expect(transformsService.runTransform).not.toHaveBeenCalled();
    });
  });

  describe('runInConsole', () => {
    it('sets the console buffer, opens the drawer on the console view, and runs', () => {
      runInConsole('select 42');

      expect(getSession(CONSOLE_SESSION).sql).toBe('select 42');
      expect(useDrawerStore.getState()).toMatchObject({ open: true, view: 'console', consoleActivated: true });
      expect(sqlService.runQuery).toHaveBeenCalledWith('select 42', CONSOLE_SESSION);
    });

    it('never expands the drawer — expansion stays the user\'s call at any result size', () => {
      runInConsole('select 42');
      expect(useDrawerStore.getState().expanded).toBe(false);
    });

    it('reaches the same interception a console run does', () => {
      useDatasetsStore.getState().registerDataset(dataset, [sourceTable]);
      runInConsole('DROP TABLE orders');

      expect(transformsService.runTransform).not.toHaveBeenCalled();
      expect(useRunGuardStore.getState().pending?.mutationTarget).toBe('orders');
    });

    it('is a no-op on empty SQL, leaving the buffer and the drawer alone', () => {
      runInConsole('  ');
      expect(getSession(CONSOLE_SESSION).sql).toBe('');
      expect(useDrawerStore.getState().consoleActivated).toBe(false);
      expect(sqlService.runQuery).not.toHaveBeenCalled();
    });
  });

  // S5: the path is session-aware, so N runners can share it.
  describe('sessions', () => {
    it('runs a query in the session it was asked for', () => {
      requestRun('select 1', 'tab-1');
      expect(sqlService.runQuery).toHaveBeenCalledWith('select 1', 'tab-1');
    });

    it('tracks a transform in the calling session, not the console', async () => {
      requestRun('CREATE TABLE feats AS SELECT 1', 'tab-1');
      await vi.waitFor(() => expect(getSession('tab-1').status).toBe('success'));
      expect(getSession(CONSOLE_SESSION).status).toBe('idle');
    });

    it('intercepts a mutation raised from a query tab and resolves it in that tab', async () => {
      useDatasetsStore.getState().registerDataset(dataset, [sourceTable]);
      requestRun('DROP TABLE orders', 'tab-1');

      expect(useRunGuardStore.getState().pending?.mutationTarget).toBe('orders');
      expect(useRunGuardStore.getState().pendingSession).toBe('tab-1');

      materializeGuarded();
      await vi.waitFor(() => expect(getSession('tab-1').status).toBe('success'));
      expect(getSession(CONSOLE_SESSION).status).toBe('idle');
    });
  });
});
