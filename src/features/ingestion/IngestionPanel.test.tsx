import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor, fireEvent, within } from '@testing-library/react';
import { IngestionPanel } from './IngestionPanel';
import { useDatasetsStore } from '../../stores/datasets';
import * as ingestionService from '../../services/ingestion';
import * as transformsService from '../../services/transforms';
import type { Dataset, TableRegistryEntry } from '../../types';

function fileOfSize(name: string, bytes: number): File {
  const file = new File([], name);
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

const MB = 1024 * 1024;

// The engine itself needs a live DuckDB worker (a real browser), verified
// separately — this covers the panel's own state machine and wiring against
// a mocked service boundary. Queries are scoped to each test's own `container`
// (no RTL auto-cleanup is configured in vitest.config.ts, matching the rest of
// this test suite's convention) rather than the global `screen`.
vi.mock('../../services/ingestion', async () => {
  const actual = await vi.importActual<typeof import('../../services/ingestion')>('../../services/ingestion');
  return { ...actual, loadDataset: vi.fn(), loadFiles: vi.fn(), removeTable: vi.fn() };
});

vi.mock('../../services/transforms', async () => {
  const actual = await vi.importActual<typeof import('../../services/transforms')>('../../services/transforms');
  return { ...actual, runTransform: vi.fn() };
});

describe('IngestionPanel', () => {
  beforeEach(() => {
    useDatasetsStore.setState({ tables: [], datasets: [], workerStatus: 'idle', workerError: null });
    vi.mocked(ingestionService.loadDataset).mockReset();
    vi.mocked(ingestionService.loadFiles).mockReset();
    vi.mocked(ingestionService.removeTable).mockReset();
    vi.mocked(transformsService.runTransform).mockReset();
  });

  it('renders the drop zone and every bundled sample', () => {
    const { container } = render(<IngestionPanel />);
    expect(container.textContent).toContain('Drop files, a folder, or a ZIP archive here');
    expect(container.textContent).toContain('E-commerce mini-warehouse');
    expect(container.textContent).toContain('Titanic Passengers');
  });

  it('shows the xlsx rejection modal without calling loadDataset', async () => {
    const { container } = render(<IngestionPanel />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'report.xlsx', { type: 'application/vnd.ms-excel' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(within(container).getByRole('dialog')).toBeTruthy());
    expect(container.textContent).toContain('Excel files are not supported directly');
    expect(ingestionService.loadDataset).not.toHaveBeenCalled();
  });

  it('loads a sample on click and reflects it via the datasets store', async () => {
    const dataset: Dataset = {
      id: 'ds-1',
      name: 'Titanic Passengers',
      sourceType: 'sample',
      tableNames: ['titanic'],
      ingestedAt: new Date().toISOString(),
    };
    const table: TableRegistryEntry = {
      id: 't-1',
      tableName: 'titanic',
      datasetId: 'ds-1',
      origin: 'sample',
      rowCount: 891,
      columnCount: 10,
      memoryBytes: 1024,
      createdAt: dataset.ingestedAt,
    };
    vi.mocked(ingestionService.loadDataset).mockImplementation(async () => {
      useDatasetsStore.getState().registerDataset(dataset, [table]);
      return dataset;
    });

    const { container } = render(<IngestionPanel />);
    fireEvent.click(within(container).getByText('Titanic Passengers'));

    await waitFor(() => expect(container.textContent).toContain('titanic'));
    expect(ingestionService.loadDataset).toHaveBeenCalledWith('titanic');
  });

  it('removes a registered table when its remove button is clicked', () => {
    const dataset: Dataset = {
      id: 'ds-1',
      name: 'my_file.csv',
      sourceType: 'file',
      tableNames: ['my_file'],
      ingestedAt: new Date().toISOString(),
    };
    useDatasetsStore.getState().registerDataset(dataset, [
      {
        id: 't-1',
        tableName: 'my_file',
        datasetId: 'ds-1',
        origin: 'file',
        rowCount: 10,
        columnCount: 2,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
      },
    ]);
    vi.mocked(ingestionService.removeTable).mockResolvedValue(undefined);

    const { container } = render(<IngestionPanel />);
    fireEvent.click(within(container).getByLabelText('Remove my_file'));

    expect(ingestionService.removeTable).toHaveBeenCalledWith('t-1');
  });

  it('shows a summary toast naming skips after a batch (folder/multi-select) ingest', async () => {
    const dataset: Dataset = {
      id: 'ds-batch',
      name: '3 files',
      sourceType: 'folder',
      tableNames: ['customers', 'orders', 'products'],
      ingestedAt: new Date().toISOString(),
    };
    const tables: TableRegistryEntry[] = dataset.tableNames.map((tableName, i) => ({
      id: `t-${i}`,
      tableName,
      datasetId: dataset.id,
      origin: 'file',
      rowCount: 10,
      columnCount: 3,
      memoryBytes: 100,
      createdAt: dataset.ingestedAt,
    }));
    vi.mocked(ingestionService.loadFiles).mockImplementation(async () => {
      useDatasetsStore.getState().registerDataset(dataset, tables);
      return {
        dataset,
        skipped: [{ name: 'notes.xlsx', kind: 'unsupported', reason: 'x' }],
        aggregateBytes: 1024,
        aggregateWarning: false,
      };
    });

    const { container } = render(<IngestionPanel />);
    const input = container.querySelectorAll('input[type="file"]')[0] as HTMLInputElement;
    const files = [
      new File(['a'], 'customers.csv'),
      new File(['b'], 'orders.csv'),
      new File(['c'], 'products.csv'),
    ];
    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(ingestionService.loadFiles).toHaveBeenCalledWith(files));
    await waitFor(() =>
      expect(container.textContent).toContain('Ingested 3 tables; skipped 1 unsupported file (.xlsx).'),
    );
  });

  it('shows the size-refusal modal for an oversized file without calling loadDataset', async () => {
    const { container } = render(<IngestionPanel />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOfSize('huge.csv', 301 * MB)] } });

    await waitFor(() => expect(within(container).getByRole('dialog')).toBeTruthy());
    expect(container.textContent).toContain('too large for in-browser analysis (~301 MB)');
    expect(ingestionService.loadDataset).not.toHaveBeenCalled();
  });

  it('shows the warning banner with an estimated footprint for a 60MB file', async () => {
    vi.mocked(ingestionService.loadDataset).mockImplementation(async (source) => {
      const dataset: Dataset = {
        id: 'ds-warn',
        name: (source as File).name,
        sourceType: 'file',
        tableNames: ['huge'],
        ingestedAt: new Date().toISOString(),
      };
      useDatasetsStore.getState().registerDataset(dataset, [
        {
          id: 't-warn',
          tableName: 'huge',
          datasetId: dataset.id,
          origin: 'file',
          rowCount: 100,
          columnCount: 2,
          memoryBytes: 100,
          createdAt: dataset.ingestedAt,
        },
      ]);
      return dataset;
    });

    const { container } = render(<IngestionPanel />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOfSize('warn.csv', 60 * MB)] } });

    await waitFor(() => expect(container.textContent).toContain('Large file detected'));
    expect(container.textContent).toContain('Estimated memory footprint');
  });

  it('shows the persistent sampled banner and per-table badge for a 150MB file', async () => {
    vi.mocked(ingestionService.loadDataset).mockImplementation(async (source) => {
      const dataset: Dataset = {
        id: 'ds-sampled',
        name: (source as File).name,
        sourceType: 'file',
        tableNames: ['sampled_table'],
        ingestedAt: new Date().toISOString(),
      };
      useDatasetsStore.getState().registerDataset(dataset, [
        {
          id: 't-sampled',
          tableName: 'sampled_table',
          datasetId: dataset.id,
          origin: 'file',
          rowCount: 100_000,
          columnCount: 2,
          memoryBytes: 100,
          createdAt: dataset.ingestedAt,
          sampled: true,
          sampleRowLimit: 100_000,
        },
      ]);
      return dataset;
    });

    const { container } = render(<IngestionPanel />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOfSize('big.csv', 150 * MB)] } });

    await waitFor(() => expect(container.textContent).toContain('Showing a 100K-row sample'));
    expect(container.textContent).toContain('sampled — first 100,000 rows');
  });

  it('undoing a derived table offers Redo, which replays its generating SQL', async () => {
    const dataset: Dataset = {
      id: 'ds-1',
      name: 'high_value_orders',
      sourceType: 'derived',
      tableNames: ['high_value_orders'],
      ingestedAt: new Date().toISOString(),
    };
    useDatasetsStore.getState().registerDataset(dataset, [
      {
        id: 't-1',
        tableName: 'high_value_orders',
        datasetId: 'ds-1',
        origin: 'derived',
        rowCount: 10,
        columnCount: 2,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
        generatingSql: 'CREATE TABLE high_value_orders AS SELECT * FROM orders WHERE total > 100',
      },
    ]);
    vi.mocked(ingestionService.removeTable).mockImplementation(async (tableId) => {
      useDatasetsStore.getState().removeTable(tableId);
    });
    vi.mocked(transformsService.runTransform).mockResolvedValue({
      columnNames: ['result'],
      columnTypes: ['Utf8'],
      rows: [['ok']],
      rowCount: 1,
      executionTimeMs: 0,
    });

    const { container } = render(<IngestionPanel />);
    fireEvent.click(within(container).getByLabelText('Undo high_value_orders'));

    await waitFor(() => expect(container.textContent).toContain('Dropped'));
    expect(container.textContent).toContain('high_value_orders');

    fireEvent.click(within(container).getByRole('button', { name: 'Redo' }));

    await waitFor(() =>
      expect(transformsService.runTransform).toHaveBeenCalledWith(
        'CREATE TABLE high_value_orders AS SELECT * FROM orders WHERE total > 100',
      ),
    );
    await waitFor(() => expect(container.textContent).not.toContain('Dropped'));
  });

  it('shows an error banner when Redo fails, and keeps the offer visible', async () => {
    const dataset: Dataset = {
      id: 'ds-1',
      name: 'high_value_orders',
      sourceType: 'derived',
      tableNames: ['high_value_orders'],
      ingestedAt: new Date().toISOString(),
    };
    useDatasetsStore.getState().registerDataset(dataset, [
      {
        id: 't-1',
        tableName: 'high_value_orders',
        datasetId: 'ds-1',
        origin: 'derived',
        rowCount: 10,
        columnCount: 2,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
        generatingSql: 'CREATE TABLE high_value_orders AS SELECT * FROM orders WHERE total > 100',
      },
    ]);
    vi.mocked(ingestionService.removeTable).mockImplementation(async (tableId) => {
      useDatasetsStore.getState().removeTable(tableId);
    });
    vi.mocked(transformsService.runTransform).mockRejectedValue(new Error('orders no longer exists'));

    const { container } = render(<IngestionPanel />);
    fireEvent.click(within(container).getByLabelText('Undo high_value_orders'));
    await waitFor(() => expect(container.textContent).toContain('Dropped'));

    fireEvent.click(within(container).getByRole('button', { name: 'Redo' }));

    await waitFor(() => expect(container.textContent).toContain('orders no longer exists'));
    expect(container.textContent).toContain('Dropped');
  });

  it('removing a non-derived table never offers Redo', async () => {
    const dataset: Dataset = {
      id: 'ds-1',
      name: 'my_file.csv',
      sourceType: 'file',
      tableNames: ['my_file'],
      ingestedAt: new Date().toISOString(),
    };
    useDatasetsStore.getState().registerDataset(dataset, [
      {
        id: 't-1',
        tableName: 'my_file',
        datasetId: 'ds-1',
        origin: 'file',
        rowCount: 10,
        columnCount: 2,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
      },
    ]);
    vi.mocked(ingestionService.removeTable).mockResolvedValue(undefined);

    const { container } = render(<IngestionPanel />);
    fireEvent.click(within(container).getByLabelText('Remove my_file'));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).not.toContain('Dropped');
  });
});
