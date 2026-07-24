import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { TableList } from './TableList';
import { useDatasetsStore } from '../../stores/datasets';
import type { Dataset, TableRegistryEntry } from '../../types';

const dataset: Dataset = {
  id: 'ds-1',
  name: 'ecommerce',
  sourceType: 'sample',
  tableNames: ['customers', 'orders'],
  ingestedAt: new Date().toISOString(),
};

const customers: TableRegistryEntry = {
  id: 't-customers',
  tableName: 'customers',
  datasetId: 'ds-1',
  origin: 'sample',
  rowCount: 1234,
  columnCount: 6,
  memoryBytes: 20480,
  createdAt: dataset.ingestedAt,
};

const orders: TableRegistryEntry = {
  id: 't-orders',
  tableName: 'orders',
  datasetId: 'ds-1',
  origin: 'derived',
  rowCount: 8400,
  columnCount: 4,
  memoryBytes: 1048576,
  createdAt: dataset.ingestedAt,
  generatingSql: 'CREATE TABLE orders AS SELECT * FROM raw_orders',
};

beforeEach(() => {
  useDatasetsStore.setState({ tables: [], datasets: [], workerStatus: 'idle', workerError: null });
});

function renderTableList(overrides: Partial<Parameters<typeof TableList>[0]> = {}) {
  return render(
    <TableList
      onRemove={vi.fn()}
      onRefresh={vi.fn()}
      refreshingTableId={null}
      refreshDisabled={false}
      {...overrides}
    />,
  );
}

describe('TableList', () => {
  it('renders nothing when the registry is empty', () => {
    const { container } = renderTableList();
    expect(container.textContent).toBe('');
  });

  it('shows name, rows × cols, source, and memory for every registered table', () => {
    useDatasetsStore.getState().registerDataset(dataset, [customers, orders]);

    const { container } = renderTableList();

    expect(container.textContent).toContain('customers');
    expect(container.textContent).toContain('1,234 rows × 6 cols');
    expect(container.textContent).toContain('sample');
    expect(container.textContent).toContain('20 KB');

    expect(container.textContent).toContain('orders');
    expect(container.textContent).toContain('8,400 rows × 4 cols');
    expect(container.textContent).toContain('derived');
    expect(container.textContent).toContain('1 MB');
  });

  it('updates live when a table is added to the store after mount', () => {
    const { container } = renderTableList();
    expect(container.textContent).not.toContain('customers');

    act(() => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
    });

    expect(container.textContent).toContain('customers');
  });

  it('calls onRemove with the table id, not the dataset id', () => {
    useDatasetsStore.getState().registerDataset(dataset, [customers]);
    const onRemove = vi.fn();

    const { container } = renderTableList({ onRemove });
    fireEvent.click(container.querySelector('button[aria-label="Remove customers"]')!);

    expect(onRemove).toHaveBeenCalledWith('t-customers');
  });

  it('labels a derived table\'s remove control "Undo" instead of "Remove" — undo (§12.1) is dropping it', () => {
    useDatasetsStore.getState().registerDataset(dataset, [orders]);
    const onRemove = vi.fn();

    const { container } = renderTableList({ onRemove });
    expect(container.querySelector('button[aria-label="Remove orders"]')).toBeNull();
    fireEvent.click(container.querySelector('button[aria-label="Undo orders"]')!);

    expect(onRemove).toHaveBeenCalledWith('t-orders');
  });

  it('labels a shared-origin table "shared link"', () => {
    const shared: TableRegistryEntry = {
      id: 't-shared',
      tableName: 'shared_dataset',
      datasetId: 'ds-2',
      origin: 'shared',
      rowCount: 10,
      columnCount: 2,
      memoryBytes: 100,
      createdAt: dataset.ingestedAt,
    };
    useDatasetsStore.getState().registerDataset({ ...dataset, id: 'ds-2' }, [shared]);

    const { container } = renderTableList();
    expect(container.textContent).toContain('shared link');
  });

  it('shows a refresh button only for API-origin tables, not file/sample/derived', () => {
    const apiTable: TableRegistryEntry = {
      ...customers,
      id: 't-api',
      tableName: 'api_table',
      origin: 'api',
      sourceUrl: 'https://api.example.com/data',
    };
    useDatasetsStore.getState().registerDataset(dataset, [customers, orders, apiTable]);

    const { container } = renderTableList();

    expect(container.querySelector('button[aria-label="Refresh api_table from source"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Refresh customers from source"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Refresh orders from source"]')).toBeNull();
  });

  it('calls onRefresh with the table id when its refresh button is clicked', () => {
    const apiTable: TableRegistryEntry = {
      ...customers,
      id: 't-api',
      tableName: 'api_table',
      origin: 'api',
      sourceUrl: 'https://api.example.com/data',
    };
    useDatasetsStore.getState().registerDataset(dataset, [apiTable]);
    const onRefresh = vi.fn();

    const { container } = renderTableList({ onRefresh });
    fireEvent.click(container.querySelector('button[aria-label="Refresh api_table from source"]')!);

    expect(onRefresh).toHaveBeenCalledWith('t-api');
  });

  it('disables every refresh button while refreshDisabled is true', () => {
    const apiTable: TableRegistryEntry = {
      ...customers,
      id: 't-api',
      tableName: 'api_table',
      origin: 'api',
      sourceUrl: 'https://api.example.com/data',
    };
    useDatasetsStore.getState().registerDataset(dataset, [apiTable]);

    const { container } = renderTableList({ refreshDisabled: true });
    const button = container.querySelector('button[aria-label="Refresh api_table from source"]') as HTMLButtonElement;

    expect(button.disabled).toBe(true);
  });

  it('shows the last-fetched timestamp for an API-origin table', () => {
    const apiTable: TableRegistryEntry = {
      ...customers,
      id: 't-api',
      tableName: 'api_table',
      origin: 'api',
      sourceUrl: 'https://api.example.com/data',
      lastFetchedAt: '2026-07-23T00:00:00.000Z',
    };
    useDatasetsStore.getState().registerDataset(dataset, [apiTable]);

    const { container } = renderTableList();

    expect(container.textContent).toContain('fetched');
    expect(container.textContent).toContain(new Date('2026-07-23T00:00:00.000Z').toLocaleString());
  });

  it('shows a possibly-stale badge on a derived table flagged stale, not on others', () => {
    const staleTable: TableRegistryEntry = { ...orders, id: 't-stale', tableName: 'stale_orders', stale: true };
    useDatasetsStore.getState().registerDataset(dataset, [orders, staleTable]);

    const { container } = renderTableList();

    expect(container.textContent).toContain('possibly stale');
    const ordersRow = container.querySelector('button[aria-label="Undo orders"]')!.closest('li');
    const staleRow = container.querySelector('button[aria-label="Undo stale_orders"]')!.closest('li');
    expect(ordersRow?.textContent).not.toContain('possibly stale');
    expect(staleRow?.textContent).toContain('possibly stale');
  });
});
