import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, fireEvent, within } from '@testing-library/react';
import { SqlModule } from './SqlModule';
import { useQueryStore, CONSOLE_SESSION } from '../../stores/query';
import { useDatasetsStore } from '../../stores/datasets';
import { useUIStore } from '../../stores/ui';
import { useTabsStore } from '../../stores/tabs';
import { useRunGuardStore } from '../../stores/runGuard';
import { EducationalPanelProvider } from '../../app/EducationalPanelContext';
import * as sqlService from '../../services/sql';
import * as transformsService from '../../services/transforms';
import * as exportService from '../../services/export';
import type { Dataset, TableRegistryEntry } from '../../types';

// SqlModule always mounts under EducationalPanelProvider in the real app
// (App.tsx) — QuerySuggestions, rendered inside SqlModule, calls
// useEducationalPanel() unconditionally, so every render here needs the same
// wrapper or that hook throws outside a provider.
function renderSqlModule() {
  return render(
    <EducationalPanelProvider>
      <SqlModule />
    </EducationalPanelProvider>,
  );
}

// The real MonacoWrapper statically imports `monaco-editor`, which needs a
// real browser (canvas/layout) to mount — out of scope for a jsdom unit test
// (verified live instead, see this build's own notes). Stubbed here so this
// test exercises SqlModule's own wiring: the Suspense boundary, the run
// button, and the results/history panes. Queries are scoped to each test's
// own `container` (no RTL auto-cleanup is configured in vitest.config.ts,
// matching the rest of this test suite's convention) rather than the global
// `screen`.
vi.mock('./MonacoWrapper', () => ({
  default: ({ onRunQuery }: { onRunQuery: () => void }) => (
    <button type="button" data-testid="fake-monaco" onClick={onRunQuery}>
      fake editor
    </button>
  ),
}));

vi.mock('../../services/sql', async () => {
  const actual = await vi.importActual<typeof sqlService>('../../services/sql');
  return { ...actual, runQuery: vi.fn() };
});

vi.mock('../../services/transforms', async () => {
  const actual = await vi.importActual<typeof transformsService>('../../services/transforms');
  return { ...actual, runTransform: vi.fn(), materializeInsteadOfMutation: vi.fn(), forceMutation: vi.fn() };
});

vi.mock('../../services/export', () => ({ downloadTable: vi.fn(async () => {}) }));

describe('SqlModule', () => {
  beforeEach(() => {
    useQueryStore.setState({ sessions: {}, history: [], lastRunSession: CONSOLE_SESSION });
    // No suggestions/tasks should render without a registered, classified
    // table — keeps QuerySuggestions a no-op for every assertion below.
    useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
    useUIStore.getState().clearPendingPrefill();
    useRunGuardStore.setState({ pending: null, pendingSession: CONSOLE_SESSION });
    useTabsStore.setState({ tabs: [], activeTabId: null });
    // SqlModule chains `.catch()` off the real runQuery's promise, so the mock
    // must return one too (a bare vi.fn() default returns undefined).
    vi.mocked(sqlService.runQuery).mockReset().mockResolvedValue({
      columnNames: [],
      columnTypes: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
    });
    const transformResult = {
      columnNames: ['result'],
      columnTypes: ['Utf8'],
      rows: [['ok']],
      rowCount: 1,
      executionTimeMs: 0,
    };
    vi.mocked(transformsService.runTransform).mockReset().mockResolvedValue(transformResult);
    vi.mocked(transformsService.materializeInsteadOfMutation).mockReset().mockResolvedValue(transformResult);
    vi.mocked(transformsService.forceMutation).mockReset().mockResolvedValue(transformResult);
    vi.mocked(exportService.downloadTable).mockReset().mockResolvedValue(undefined);
  });

  const dataset: Dataset = {
    id: 'ds-1',
    name: 'orders.csv',
    sourceType: 'file',
    tableNames: ['orders'],
    ingestedAt: '2026-07-20T00:00:00.000Z',
  };
  const sourceTable: TableRegistryEntry = {
    id: 'tbl-1',
    tableName: 'orders',
    datasetId: 'ds-1',
    origin: 'file',
    rowCount: 10,
    columnCount: 2,
    memoryBytes: 512,
    createdAt: '2026-07-20T00:00:00.000Z',
  };

  it('lazy-loads the editor behind Suspense and renders it', async () => {
    const { container } = renderSqlModule();
    await waitFor(() => expect(within(container).getByTestId('fake-monaco')).toBeTruthy());
  });

  it('disables Run when the query is empty', async () => {
    const { container } = renderSqlModule();
    await waitFor(() =>
      expect((within(container).getByRole('button', { name: /run/i }) as HTMLButtonElement).disabled).toBe(true),
    );
  });

  it('enables Run once SQL is present and calls runQuery on click', async () => {
    useQueryStore.getState().setSql(CONSOLE_SESSION, 'select 1');
    const { container } = renderSqlModule();

    await waitFor(() =>
      expect((within(container).getByRole('button', { name: /run/i }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(within(container).getByRole('button', { name: /run/i }));
    expect(sqlService.runQuery).toHaveBeenCalledWith('select 1', CONSOLE_SESSION);
  });

  // S5 — the console is the scratchpad, so it is the surface that can promote.
  it('disables Pin on an empty buffer and pins the query and its result once there is one', async () => {
    const { container } = renderSqlModule();
    await waitFor(() =>
      expect((within(container).getByRole('button', { name: /pin to tab/i }) as HTMLButtonElement).disabled).toBe(true),
    );

    const result = { columnNames: ['n'], columnTypes: ['BIGINT'], rows: [[1]], rowCount: 1, executionTimeMs: 7 };
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, 'select 1');
    useQueryStore.getState().querySucceeded(CONSOLE_SESSION, result);

    const pin = await waitFor(() => within(container).getByRole('button', { name: /pin to tab/i }));
    expect((pin as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(pin);

    const tabs = useTabsStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].type).toBe('query');
    // One-way: the console keeps what it had.
    expect(useQueryStore.getState().sessions[CONSOLE_SESSION].result).toBe(result);
  });

  it('shows an empty-history message before any statement has run', async () => {
    const { container } = renderSqlModule();
    await waitFor(() => expect(container.textContent).toContain('No statements run yet'));
  });

  it('lists a history entry after a query completes', async () => {
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, 'select 1');
    useQueryStore.getState().querySucceeded(CONSOLE_SESSION, {
      columnNames: ['n'],
      columnTypes: ['BIGINT'],
      rows: [[1]],
      rowCount: 1,
      executionTimeMs: 7,
    });

    const { container } = renderSqlModule();
    await waitFor(() => expect(container.textContent).toContain('select 1'));
    expect(container.textContent).toContain('7 ms');
  });

  it('re-runs a history row through the same path as every other surface (S4)', async () => {
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, 'select 1');
    useQueryStore.getState().querySucceeded(CONSOLE_SESSION, {
      columnNames: ['n'],
      columnTypes: ['BIGINT'],
      rows: [[1]],
      rowCount: 1,
      executionTimeMs: 7,
    });
    vi.mocked(sqlService.runQuery).mockClear();

    const { container } = renderSqlModule();
    const historyRun = await waitFor(() => within(container).getAllByRole('button', { name: /^run$/i })[0]);
    fireEvent.click(historyRun);

    expect(sqlService.runQuery).toHaveBeenCalledWith('select 1', CONSOLE_SESSION);
  });

  it('surfaces a query error in the results area', async () => {
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, 'select * from missing');
    useQueryStore.getState().queryFailed(CONSOLE_SESSION, 'Catalog Error: Table with name missing does not exist!');

    const { container } = renderSqlModule();
    await waitFor(() => expect(within(container).getByRole('alert')).toBeTruthy());
    expect(within(container).getByRole('alert').textContent).toMatch(/does not exist/i);
  });

  it('routes a CREATE TABLE AS statement through runTransform, not runQuery', async () => {
    useQueryStore.getState().setSql(CONSOLE_SESSION, 'CREATE TABLE feats AS SELECT 1');
    const { container } = renderSqlModule();

    fireEvent.click(within(container).getByRole('button', { name: /run/i }));

    await waitFor(() => expect(transformsService.runTransform).toHaveBeenCalledWith('CREATE TABLE feats AS SELECT 1'));
    expect(sqlService.runQuery).not.toHaveBeenCalled();
  });

  it('routes a mutation against a derived table straight through runTransform (no guard)', async () => {
    useDatasetsStore.getState().registerDataset(dataset, [{ ...sourceTable, origin: 'derived' }]);
    useQueryStore.getState().setSql(CONSOLE_SESSION, 'DROP TABLE orders');
    const { container } = renderSqlModule();

    fireEvent.click(within(container).getByRole('button', { name: /run/i }));

    await waitFor(() => expect(transformsService.runTransform).toHaveBeenCalledWith('DROP TABLE orders'));
    expect(within(container).queryByRole('dialog')).toBeNull();
  });

  it('hands a source mutation to the guard instead of running it — and renders no modal of its own (S4)', async () => {
    useDatasetsStore.getState().registerDataset(dataset, [sourceTable]);
    useQueryStore.getState().setSql(CONSOLE_SESSION, 'DROP TABLE orders');
    const { container } = renderSqlModule();

    fireEvent.click(within(container).getByRole('button', { name: /run/i }));

    await waitFor(() => expect(useRunGuardStore.getState().pending?.mutationTarget).toBe('orders'));
    expect(transformsService.runTransform).not.toHaveBeenCalled();
    // The modal is `TransformGuardHost`'s, mounted once in the shell.
    expect(within(container).queryByRole('dialog')).toBeNull();
  });

  it('runs nothing on mount, whatever a pending prefill holds (S4 — the console is mounted in every session)', async () => {
    useUIStore.getState().setActiveModule('sql', null, { tableName: 'orders', columns: [], sql: 'SELECT * FROM orders' });
    const { container } = renderSqlModule();

    await waitFor(() => expect(within(container).getByTestId('fake-monaco')).toBeTruthy());
    expect(sqlService.runQuery).not.toHaveBeenCalled();
    expect(transformsService.runTransform).not.toHaveBeenCalled();
  });

  it('disables "Export recipe" with no derived tables and enables it once one exists', async () => {
    const { container } = renderSqlModule();
    await waitFor(() =>
      expect((within(container).getByRole('button', { name: /export recipe/i }) as HTMLButtonElement).disabled).toBe(
        true,
      ),
    );

    useDatasetsStore.getState().registerDataset(dataset, [{ ...sourceTable, origin: 'derived' }]);

    await waitFor(() =>
      expect((within(container).getByRole('button', { name: /export recipe/i }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
  });

  it('shows a Download Parquet shortcut on the Results header once a CTAS registers its derived table, wired to the export service', async () => {
    useQueryStore.getState().setSql(CONSOLE_SESSION, 'CREATE TABLE feats AS SELECT 1');
    const derivedTable: TableRegistryEntry = {
      ...sourceTable,
      id: 'tbl-2',
      tableName: 'feats',
      origin: 'derived',
      generatingSql: 'CREATE TABLE feats AS SELECT 1',
    };
    // Mirrors the real runTransform's order (register the derived table, then
    // resolve) closely enough for this test's purposes: registration must be
    // visible before QueryResultsPanel re-renders on the resolved status.
    vi.mocked(transformsService.runTransform).mockImplementation(async () => {
      useDatasetsStore.getState().registerDataset(dataset, [derivedTable]);
      return {
        columnNames: ['result'],
        columnTypes: ['Utf8'],
        rows: [['Created derived table "feats".']],
        rowCount: 1,
        executionTimeMs: 0,
      };
    });

    const { container } = renderSqlModule();
    fireEvent.click(within(container).getByRole('button', { name: /run/i }));

    const downloadButton = await waitFor(() => within(container).getByRole('button', { name: /download parquet/i }));
    fireEvent.click(downloadButton);

    await waitFor(() => expect(exportService.downloadTable).toHaveBeenCalledWith(derivedTable, 'parquet'));
  });
});
