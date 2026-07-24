import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/react';
import { ExportModule } from './ExportModule';
import { useDatasetsStore } from '../../stores/datasets';
import { useSettingsStore } from '../../stores/settings';
import * as exportService from '../../services/export';
import type { Dataset, TableRegistryEntry } from '../../types';

vi.mock('../../services/export', () => ({
  downloadTable: vi.fn(async () => {}),
  buildShareBuffer: vi.fn(async () => new Uint8Array()),
  saveToCloud: vi.fn(async () => ({ ok: true, token: 'tok-1', deleteToken: 'del-1', ttlSeconds: 2_592_000 })),
  deleteShare: vi.fn(async () => ({ ok: true })),
  PARQUET_CONTENT_TYPE: 'application/vnd.apache.parquet',
  STRUCTURE_REPORT_CONTENT_TYPE: 'application/vnd.datascope.dsps+json',
}));

const dataset: Dataset = {
  id: 'ds-1',
  name: 'orders.csv',
  sourceType: 'file',
  tableNames: ['orders'],
  ingestedAt: '2026-07-20T00:00:00.000Z',
};

const table: TableRegistryEntry = {
  id: 't-1',
  tableName: 'orders',
  datasetId: 'ds-1',
  origin: 'file',
  rowCount: 1234,
  columnCount: 5,
  memoryBytes: 4096,
  createdAt: dataset.ingestedAt,
};

beforeEach(() => {
  vi.clearAllMocks();
  useDatasetsStore.setState({ tables: [], datasets: [], workerStatus: 'idle', workerError: null });
  useSettingsStore.setState({ shareLinks: [] });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  });
});

describe('ExportModule', () => {
  it('prompts to drop a dataset when the registry is empty', () => {
    const { container } = render(<ExportModule />);
    expect(within(container).getByText(/drop a dataset to export tables/i)).toBeTruthy();
  });

  it('still shows previously created share links when no tables are currently loaded — tables don\'t persist across reloads, but the "delete now" list must still be reachable', () => {
    useSettingsStore.setState({
      shareLinks: [
        { token: 'tok-1', deleteToken: 'del-1', kind: 'structure', label: 'orders', createdAt: '2026-07-23T00:00:00.000Z', ttlSeconds: 2_592_000 },
      ],
    });
    const { container } = render(<ExportModule />);
    expect(within(container).getByText(/drop a dataset to export tables/i)).toBeTruthy();
    expect(within(container).getByText(/your share links/i)).toBeTruthy();
    expect(within(container).getByText('orders')).toBeTruthy();
  });

  it('lists every registered table with its row/column count', () => {
    useDatasetsStore.setState({ tables: [table], datasets: [dataset] });
    const { container } = render(<ExportModule />);
    expect(within(container).getByText('orders')).toBeTruthy();
    expect(within(container).getByText(/1,234 rows × 5 cols/)).toBeTruthy();
  });

  it('downloads a Parquet export via the export service', async () => {
    useDatasetsStore.setState({ tables: [table], datasets: [dataset] });
    const { container } = render(<ExportModule />);
    fireEvent.click(within(container).getByRole('button', { name: /parquet/i }));
    await waitFor(() => expect(exportService.downloadTable).toHaveBeenCalledWith(table, 'parquet'));
  });

  it('downloads a CSV export via the export service', async () => {
    useDatasetsStore.setState({ tables: [table], datasets: [dataset] });
    const { container } = render(<ExportModule />);
    fireEvent.click(within(container).getByRole('button', { name: /csv/i }));
    await waitFor(() => expect(exportService.downloadTable).toHaveBeenCalledWith(table, 'csv'));
  });

  it('copies a Jupyter snippet to the clipboard and shows a confirmation', async () => {
    useDatasetsStore.setState({ tables: [table], datasets: [dataset] });
    const { container } = render(<ExportModule />);
    fireEvent.click(within(container).getByRole('button', { name: /jupyter snippet/i }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('pd.read_parquet')),
    );
    await waitFor(() => within(container).getByRole('button', { name: /copied!/i }));
  });

  it('opens the share dialog for a table and, after saving, lists it under "your share links"', async () => {
    useDatasetsStore.setState({ tables: [table], datasets: [dataset] });
    const { container } = render(<ExportModule />);

    fireEvent.click(within(container).getByRole('button', { name: /^share$/i }));
    const dialog = within(container).getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /save to cloud/i }));

    await waitFor(() => expect(exportService.saveToCloud).toHaveBeenCalledTimes(1));
    fireEvent.click(within(dialog).getByRole('button', { name: /done/i }));

    expect(within(container).getByText(/your share links/i)).toBeTruthy();
    expect(within(container).getAllByText('orders').length).toBeGreaterThan(1);
  });
});
