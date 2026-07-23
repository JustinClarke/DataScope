import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, fireEvent, within } from '@testing-library/react';
import { SqlModule } from './SqlModule';
import { useQueryStore } from '../../stores/query';
import { useDatasetsStore } from '../../stores/datasets';
import { useUIStore } from '../../stores/ui';
import { EducationalPanelProvider } from '../../app/EducationalPanelContext';
import * as sqlService from '../../services/sql';
import * as transformsService from '../../services/transforms';
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

describe('SqlModule', () => {
  beforeEach(() => {
    useQueryStore.setState({ sql: '', status: 'idle', result: null, error: null, history: [], charts: [] });
    // No suggestions/tasks should render without a registered, classified
    // table — keeps QuerySuggestions a no-op for every assertion below.
    useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
    useUIStore.getState().clearPendingPrefill();
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
    useQueryStore.setState({ sql: 'select 1' });
    const { container } = renderSqlModule();

    await waitFor(() =>
      expect((within(container).getByRole('button', { name: /run/i }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(within(container).getByRole('button', { name: /run/i }));
    expect(sqlService.runQuery).toHaveBeenCalledWith('select 1');
  });

  it('shows an empty-history message before any statement has run', async () => {
    const { container } = renderSqlModule();
    await waitFor(() => expect(container.textContent).toContain('No statements run yet'));
  });

  it('lists a history entry after a query completes', async () => {
    useQueryStore.getState().queryStarted('select 1');
    useQueryStore.getState().querySucceeded({
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

  it('surfaces a query error in the results area', async () => {
    useQueryStore.getState().queryStarted('select * from missing');
    useQueryStore.getState().queryFailed('Catalog Error: Table with name missing does not exist!');

    const { container } = renderSqlModule();
    await waitFor(() => expect(within(container).getByRole('alert')).toBeTruthy());
    expect(within(container).getByRole('alert').textContent).toMatch(/does not exist/i);
  });

  it('routes a CREATE TABLE AS statement through runTransform, not runQuery', async () => {
    useQueryStore.setState({ sql: 'CREATE TABLE feats AS SELECT 1' });
    const { container } = renderSqlModule();

    fireEvent.click(within(container).getByRole('button', { name: /run/i }));

    await waitFor(() => expect(transformsService.runTransform).toHaveBeenCalledWith('CREATE TABLE feats AS SELECT 1'));
    expect(sqlService.runQuery).not.toHaveBeenCalled();
  });

  it('routes a mutation against a derived table straight through runTransform (no guard)', async () => {
    useDatasetsStore.getState().registerDataset(dataset, [{ ...sourceTable, origin: 'derived' }]);
    useQueryStore.setState({ sql: 'DROP TABLE orders' });
    const { container } = renderSqlModule();

    fireEvent.click(within(container).getByRole('button', { name: /run/i }));

    await waitFor(() => expect(transformsService.runTransform).toHaveBeenCalledWith('DROP TABLE orders'));
    expect(within(container).queryByRole('dialog')).toBeNull();
  });

  it('shows the mutation guard for a statement targeting a source table, without running it', async () => {
    useDatasetsStore.getState().registerDataset(dataset, [sourceTable]);
    useQueryStore.setState({ sql: 'DROP TABLE orders' });
    const { container } = renderSqlModule();

    fireEvent.click(within(container).getByRole('button', { name: /run/i }));

    const dialog = await waitFor(() => within(container).getByRole('dialog'));
    expect(dialog.textContent).toContain('orders');
    expect(transformsService.runTransform).not.toHaveBeenCalled();
  });

  it('guard "Materialize as a new table" calls materializeInsteadOfMutation and closes the modal', async () => {
    useDatasetsStore.getState().registerDataset(dataset, [sourceTable]);
    useQueryStore.setState({ sql: 'DROP TABLE orders' });
    const { container } = renderSqlModule();

    fireEvent.click(within(container).getByRole('button', { name: /run/i }));
    await waitFor(() => within(container).getByRole('dialog'));
    fireEvent.click(within(container).getByRole('button', { name: 'Materialize as a new table' }));

    await waitFor(() => expect(transformsService.materializeInsteadOfMutation).toHaveBeenCalledOnce());
    expect(transformsService.forceMutation).not.toHaveBeenCalled();
    expect(within(container).queryByRole('dialog')).toBeNull();
  });

  it('guard "Modify original anyway" calls forceMutation and closes the modal', async () => {
    useDatasetsStore.getState().registerDataset(dataset, [sourceTable]);
    useQueryStore.setState({ sql: 'DROP TABLE orders' });
    const { container } = renderSqlModule();

    fireEvent.click(within(container).getByRole('button', { name: /run/i }));
    await waitFor(() => within(container).getByRole('dialog'));
    fireEvent.click(within(container).getByRole('button', { name: 'Modify original anyway' }));

    await waitFor(() => expect(transformsService.forceMutation).toHaveBeenCalledOnce());
    expect(transformsService.materializeInsteadOfMutation).not.toHaveBeenCalled();
    expect(within(container).queryByRole('dialog')).toBeNull();
  });

  it('guard Cancel closes the modal without running anything', async () => {
    useDatasetsStore.getState().registerDataset(dataset, [sourceTable]);
    useQueryStore.setState({ sql: 'DROP TABLE orders' });
    const { container } = renderSqlModule();

    fireEvent.click(within(container).getByRole('button', { name: /run/i }));
    await waitFor(() => within(container).getByRole('dialog'));
    fireEvent.click(within(container).getByRole('button', { name: 'Cancel' }));

    expect(within(container).queryByRole('dialog')).toBeNull();
    expect(transformsService.runTransform).not.toHaveBeenCalled();
    expect(transformsService.materializeInsteadOfMutation).not.toHaveBeenCalled();
    expect(transformsService.forceMutation).not.toHaveBeenCalled();
  });

  it('opens on the answer (D68e) — a duplicates prefill runs its SQL immediately, no click needed', async () => {
    useUIStore.getState().setActiveModule('sql', null, { tableName: 'orders', columns: [], sql: 'SELECT * FROM orders' });
    renderSqlModule();

    await waitFor(() => expect(sqlService.runQuery).toHaveBeenCalledWith('SELECT * FROM orders'));
    // Consumed exactly once — a later sidebar-reached open starts empty.
    expect(useUIStore.getState().pendingPrefill).toBeNull();
  });

  it('a prefill with no sql (a route with nothing to run) leaves the editor untouched', async () => {
    useUIStore.getState().setActiveModule('sql', null, { tableName: 'orders', columns: [] });
    renderSqlModule();

    await waitFor(() => expect(useUIStore.getState().pendingPrefill).toBeNull());
    expect(sqlService.runQuery).not.toHaveBeenCalled();
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
});
