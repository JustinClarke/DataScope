import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { ExplorerPanel } from './ExplorerPanel';
import { useDatasetsStore } from '../../stores/datasets';
import { useTabsStore } from '../../stores/tabs';
import { useSelectionStore } from '../../stores/selection';
import * as ingestion from '../../services/ingestion';
import type { Dataset, TableRegistryEntry } from '../../types';

vi.mock('../../services/ingestion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/ingestion')>();
  return {
    ...actual,
    removeTable: vi.fn().mockResolvedValue(undefined),
    refreshTableFromSource: vi.fn().mockResolvedValue({ bytesAccumulated: 0, sizeTier: 'ok', usedRelay: false }),
  };
});

const dataset: Dataset = {
  id: 'ds-1',
  name: 'demo',
  sourceType: 'sample',
  tableNames: ['customers'],
  ingestedAt: new Date().toISOString(),
};

const customers: TableRegistryEntry = {
  id: 't-customers',
  tableName: 'customers',
  datasetId: 'ds-1',
  origin: 'sample',
  rowCount: 10,
  columnCount: 2,
  memoryBytes: 100,
  createdAt: dataset.ingestedAt,
};

const apiTable: TableRegistryEntry = {
  ...customers,
  id: 't-api',
  tableName: 'api_table',
  origin: 'api',
  sourceUrl: 'https://api.example.com/data',
};

function resetStores() {
  useDatasetsStore.setState({ tables: [], datasets: [], workerStatus: 'idle', workerError: null });
  useTabsStore.setState({ tabs: [], activeTabId: null });
  useSelectionStore.setState({ selectedTableId: null });
}

describe('ExplorerPanel (W2, D71)', () => {
  it('shows the Explorer header with a live table/row count (V3)', () => {
    resetStores();
    useDatasetsStore.getState().registerDataset(dataset, [customers]);

    const { getByText, rerender } = render(<ExplorerPanel />);
    expect(getByText('Explorer')).toBeTruthy();
    expect(getByText('1 table · 10 rows')).toBeTruthy();

    const orders: TableRegistryEntry = { ...customers, id: 't-orders', tableName: 'orders', rowCount: 5 };
    useDatasetsStore.getState().registerDataset({ ...dataset, id: 'ds-2' }, [orders]);
    rerender(<ExplorerPanel />);

    expect(getByText('2 tables · 15 rows')).toBeTruthy();
  });

  it('clicking a table name selects it and opens a profile tab (D68d)', () => {
    resetStores();
    useDatasetsStore.getState().registerDataset(dataset, [customers]);

    const { container } = render(<ExplorerPanel />);
    fireEvent.click(within(container).getByText('customers'));

    expect(useSelectionStore.getState().selectedTableId).toBe('t-customers');
    const tabs = useTabsStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].type).toBe('profile');
    expect(tabs[0].subject).toBe('t-customers');
  });

  it('clicking remove calls removeTable with the table id', () => {
    resetStores();
    useDatasetsStore.getState().registerDataset(dataset, [customers]);

    const { container } = render(<ExplorerPanel />);
    fireEvent.click(container.querySelector('button[aria-label="Remove customers"]')!);

    expect(ingestion.removeTable).toHaveBeenCalledWith('t-customers');
  });

  it('clicking refresh calls refreshTableFromSource with the table id', () => {
    resetStores();
    useDatasetsStore.getState().registerDataset(dataset, [apiTable]);

    const { container } = render(<ExplorerPanel />);
    fireEvent.click(container.querySelector('button[aria-label="Refresh api_table from source"]')!);

    expect(ingestion.refreshTableFromSource).toHaveBeenCalledWith('t-api');
  });
});
