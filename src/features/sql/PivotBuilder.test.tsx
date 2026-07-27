import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, within, cleanup } from '@testing-library/react';
import { PivotBuilder } from './PivotBuilder';
import { useDatasetsStore } from '../../stores/datasets';
import { useQueryStore } from '../../stores/query';
import { useUIStore } from '../../stores/ui';
import type { TableRegistryEntry } from '../../types';
import * as sqlService from '../../services/sql';

vi.mock('../../services/sql', async () => {
  const actual = await vi.importActual<typeof sqlService>('../../services/sql');
  return { ...actual, runQuery: vi.fn() };
});

const baseTable: TableRegistryEntry = {
  id: 't-1',
  tableName: 'orders',
  datasetId: 'ds-1',
  origin: 'sample',
  rowCount: 500,
  columnCount: 3,
  memoryBytes: 1024,
  createdAt: new Date().toISOString(),
  columns: [
    {
      name: 'region',
      semanticType: 'Categorical',
      physicalType: 'VARCHAR',
      cardinality: 4,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
    {
      name: 'revenue',
      semanticType: 'Quantitative',
      physicalType: 'DOUBLE',
      cardinality: 90,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
    {
      name: 'customer_id',
      semanticType: 'Identifier',
      physicalType: 'BIGINT',
      cardinality: 400,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
  ],
};

function getSqlPreview(container: HTMLElement): string {
  const pre = within(container).getByText(/^SELECT/, { selector: 'pre' });
  return pre.textContent ?? '';
}

describe('PivotBuilder', () => {
  // Unlike the rest of this suite (state-store-driven, no DOM side effects to
  // leak), PivotBuilder schedules a real debounced `setTimeout` on every spec
  // change. Without unmounting, a previous test's still-mounted instance can
  // fire its pending timer — and call the shared mocked `runQuery` — in the
  // middle of a later test, since this project's vitest config has no global
  // RTL auto-cleanup.
  afterEach(() => cleanup());

  beforeEach(() => {
    useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
    useQueryStore.setState({ sql: '', status: 'idle', result: null, error: null, history: [], charts: [] });
    useUIStore.getState().clearPendingPrefill();
    vi.mocked(sqlService.runQuery).mockReset().mockResolvedValue({
      columnNames: [],
      columnTypes: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
    });
  });

  it('renders nothing with no registered tables', () => {
    const { container } = render(<PivotBuilder />);
    expect(container.textContent).toBe('');
  });

  it('renders nothing for a table with no classified columns yet', () => {
    useDatasetsStore.setState({ tables: [{ ...baseTable, columns: undefined }] });
    const { container } = render(<PivotBuilder />);
    expect(container.textContent).toBe('');
  });

  it('adding a field to Rows via the click affordance places it in the well', async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    const { container } = render(<PivotBuilder />);

    fireEvent.click(within(container).getByTitle('Add region to rows'));

    const rowsWell = within(container).getByTestId('well-rows');
    await waitFor(() => expect(within(rowsWell).getByText('region')).toBeTruthy());
  });

  it('adding a Quantitative field to Values defaults its aggregate to sum, shown in the compiled SQL', async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    const { container } = render(<PivotBuilder />);

    fireEvent.click(within(container).getByTitle('Add revenue to values'));

    await waitFor(() => expect(getSqlPreview(container)).toContain('SUM("revenue") AS "sum_revenue"'));
  });

  it('changing the aggregate picker updates the compiled SQL', async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    const { container } = render(<PivotBuilder />);

    fireEvent.click(within(container).getByTitle('Add revenue to values'));
    await waitFor(() => expect(getSqlPreview(container)).toContain('SUM('));

    fireEvent.change(within(container).getByLabelText('Aggregation for revenue'), { target: { value: 'avg' } });
    await waitFor(() => expect(getSqlPreview(container)).toContain('AVG("revenue") AS "avg_revenue"'));
  });

  it('the subtotals checkbox adds a ROLLUP to the compiled SQL', async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    const { container } = render(<PivotBuilder />);

    fireEvent.click(within(container).getByTitle('Add region to rows'));
    fireEvent.click(within(container).getByTitle('Add revenue to values'));
    await waitFor(() => expect(getSqlPreview(container)).toContain('GROUP BY 1'));

    fireEvent.click(within(container).getByLabelText(/subtotals/i));
    await waitFor(() => expect(getSqlPreview(container)).toContain('GROUP BY ROLLUP("region")'));
  });

  it('picking a sort field and toggling direction updates the ORDER BY clause', async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    const { container } = render(<PivotBuilder />);

    fireEvent.click(within(container).getByTitle('Add region to rows'));
    fireEvent.click(within(container).getByTitle('Add revenue to values'));
    await waitFor(() => expect(getSqlPreview(container)).toContain('sum_revenue'));

    fireEvent.change(within(container).getByLabelText('Sort by'), { target: { value: 'sum_revenue' } });
    await waitFor(() => expect(getSqlPreview(container)).toContain('ORDER BY 2 DESC'));

    fireEvent.click(within(container).getByText('Descending'));
    await waitFor(() => expect(getSqlPreview(container)).toContain('ORDER BY 2 ASC'));
  });

  it('caps a high-cardinality rows field to the top 20 with a "Show all" affordance, removable', async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    const { container } = render(<PivotBuilder />);

    fireEvent.click(within(container).getByTitle('Add customer_id to rows'));

    await waitFor(() => expect(container.textContent).toContain('400 distinct values'));
    expect(getSqlPreview(container)).toContain('WHERE "customer_id" IN');

    fireEvent.click(within(container).getByText('Show all'));
    await waitFor(() => expect(container.textContent).not.toContain('distinct values'));
    expect(getSqlPreview(container)).not.toContain('WHERE');
  });

  it('runs the compiled SQL through the ordinary query path (debounced)', async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    const { container } = render(<PivotBuilder />);

    fireEvent.click(within(container).getByTitle('Add region to rows'));
    fireEvent.click(within(container).getByTitle('Add revenue to values'));

    await waitFor(() => expect(sqlService.runQuery).toHaveBeenCalledTimes(1), { timeout: 1000 });
    const [sql] = vi.mocked(sqlService.runQuery).mock.calls[0];
    expect(sql).toContain('SUM("revenue")');
    expect(useQueryStore.getState().sql).toBe(sql);
  });

  it('opens on the answer (D68e) — a prefill classifies fields into Rows/Values the same way addToWell does', async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    useUIStore.getState().setActiveModule('pivot', null, { tableName: 'orders', columns: ['region', 'revenue'] });
    const { container } = render(<PivotBuilder />);

    // region (Categorical) lands in Rows, revenue (Quantitative) in Values —
    // no click needed, and it runs without waiting for user input.
    await waitFor(() => expect(within(container.querySelector('[data-testid="well-rows"]')!).getByText('region')).toBeTruthy());
    expect(within(container.querySelector('[data-testid="well-values"]')!).getByText('revenue')).toBeTruthy();
    await waitFor(() => expect(sqlService.runQuery).toHaveBeenCalledTimes(1), { timeout: 1000 });
    const [sql] = vi.mocked(sqlService.runQuery).mock.calls[0];
    expect(sql).toContain('SUM("revenue")');
    expect(useUIStore.getState().pendingPrefill).toBeNull();
  });

  it('W7.5: a `prefill` prop (the Workbench tab\'s own initializer) wins over whatever the old shell\'s global store holds', async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    // Deliberately different columns from the prop below — proves the prop is
    // used, not just "no prop passed" falling through to the global.
    useUIStore.getState().setActiveModule('pivot', null, { tableName: 'orders', columns: ['customer_id'] });
    const { container } = render(<PivotBuilder prefill={{ tableName: 'orders', columns: ['region', 'revenue'] }} />);

    await waitFor(() => expect(within(container.querySelector('[data-testid="well-rows"]')!).getByText('region')).toBeTruthy());
    expect(within(container.querySelector('[data-testid="well-values"]')!).getByText('revenue')).toBeTruthy();
    // The global store's own prefill is untouched — the override path never reads or clears it.
    expect(useUIStore.getState().pendingPrefill).toEqual({ tableName: 'orders', columns: ['customer_id'] });
  });

  it('Guided mode dropdowns compile the same SQL as the equivalent Builder-mode wells (cut-line parity)', async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    const { container, unmount } = render(<PivotBuilder />);

    fireEvent.click(within(container).getByTitle('Add region to rows'));
    fireEvent.click(within(container).getByTitle('Add revenue to values'));
    await waitFor(() => expect(getSqlPreview(container)).toContain('sum_revenue'));
    const builderSql = getSqlPreview(container);
    unmount();

    useQueryStore.setState({ sql: '', status: 'idle', result: null, error: null, history: [], charts: [] });
    vi.mocked(sqlService.runQuery).mockClear();

    const { container: guidedContainer } = render(<PivotBuilder />);
    fireEvent.click(within(guidedContainer).getByRole('button', { name: 'guided' }));
    fireEvent.change(within(guidedContainer).getByLabelText('Group by field'), { target: { value: 'region' } });
    fireEvent.change(within(guidedContainer).getByLabelText('Measure field'), { target: { value: 'revenue' } });
    fireEvent.change(within(guidedContainer).getByLabelText('Measure aggregate'), { target: { value: 'sum' } });

    await waitFor(() => expect(getSqlPreview(guidedContainer)).toContain('sum_revenue'));
    expect(getSqlPreview(guidedContainer)).toBe(builderSql);
  });

  it('shows a table picker once two or more classified tables are registered, and switching resets the spec', async () => {
    useDatasetsStore.setState({
      tables: [baseTable, { ...baseTable, id: 't-2', tableName: 'customers' }],
    });
    const { container } = render(<PivotBuilder />);

    fireEvent.click(within(container).getByTitle('Add region to rows'));
    await waitFor(() => expect(within(container).getByTestId('well-rows').textContent).toContain('region'));

    fireEvent.change(within(container).getByLabelText('Pivot table'), { target: { value: 't-2' } });
    expect(within(container).getByTestId('well-rows').textContent).not.toContain('region');
  });
});
