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

describe('TableList', () => {
  it('renders nothing when the registry is empty', () => {
    const { container } = render(<TableList onRemove={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('shows name, rows × cols, source, and memory for every registered table', () => {
    useDatasetsStore.getState().registerDataset(dataset, [customers, orders]);

    const { container } = render(<TableList onRemove={vi.fn()} />);

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
    const { container } = render(<TableList onRemove={vi.fn()} />);
    expect(container.textContent).not.toContain('customers');

    act(() => {
      useDatasetsStore.getState().registerDataset(dataset, [customers]);
    });

    expect(container.textContent).toContain('customers');
  });

  it('calls onRemove with the table id, not the dataset id', () => {
    useDatasetsStore.getState().registerDataset(dataset, [customers]);
    const onRemove = vi.fn();

    const { container } = render(<TableList onRemove={onRemove} />);
    fireEvent.click(container.querySelector('button[aria-label="Remove customers"]')!);

    expect(onRemove).toHaveBeenCalledWith('t-customers');
  });

  it('labels a derived table\'s remove control "Undo" instead of "Remove" — undo (§12.1) is dropping it', () => {
    useDatasetsStore.getState().registerDataset(dataset, [orders]);
    const onRemove = vi.fn();

    const { container } = render(<TableList onRemove={onRemove} />);
    expect(container.querySelector('button[aria-label="Remove orders"]')).toBeNull();
    fireEvent.click(container.querySelector('button[aria-label="Undo orders"]')!);

    expect(onRemove).toHaveBeenCalledWith('t-orders');
  });
});
