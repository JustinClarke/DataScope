// Per-origin durability at ingest (S6.9 scope call 5): a non-sampled
// `file`/`sample` table's bytes are staged to OPFS; a sampled-tier file's are
// not, because that tier deliberately never buffers the file. Kept out of
// `ingestion.test.ts`, which is explicitly the suite that never stands up an
// engine — these paths need one, so the engine module is mocked here.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDataset, loadFiles, removeTable } from './ingestion';
import { readStagedManifest, setStagingTransportForTests, type StagingTransport } from './opfsStaging';
import { handleStagingRequest } from '../workers/opfsStaging.protocol';
import { useDatasetsStore } from '../stores/datasets';
import { FakeOpfsRoot, SUPPORTED_SCOPE } from '../test/fakeOpfs';

const SUMMARIZE_COLUMNS = [
  'column_name',
  'column_type',
  'min',
  'max',
  'approx_unique',
  'avg',
  'std',
  'null_percentage',
];

// Just enough engine to get `ingestBuffer` through: a two-column table with ten
// rows and no profile. The staging assertions below don't depend on any of it.
function engineResult(sql: string) {
  if (sql.startsWith('DESCRIBE')) return { columnNames: [], rows: [], rowCount: 2, durationMs: 0 };
  if (sql.includes('SUMMARIZE')) return { columnNames: SUMMARIZE_COLUMNS, rows: [], rowCount: 0, durationMs: 0 };
  if (sql.includes('COUNT(*)')) return { columnNames: ['n'], rows: [[10]], rowCount: 1, durationMs: 0 };
  if (sql.includes('estimated_size')) return { columnNames: ['s'], rows: [[1234]], rowCount: 1, durationMs: 0 };
  return { columnNames: [], rows: [], rowCount: 0, durationMs: 0 };
}

vi.mock('../workers/duckdb.worker', () => ({
  duckDBEngine: {
    execute: (sql: string) => Promise.resolve(engineResult(sql)),
    registerFile: () => Promise.resolve(),
  },
  resetEngine: () => Promise.resolve(),
}));

function csvFile(name: string, sizeBytes?: number): File {
  const file = new File(['id,total\n1,9\n'], name, { type: 'text/csv' });
  if (sizeBytes !== undefined) Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('ingest-time staging', () => {
  beforeEach(() => {
    setStagingTransportForTests(() => {
      const root = new FakeOpfsRoot();
      const transport: StagingTransport = {
        send: async (request) =>
          (await handleStagingRequest(request, async () => root as unknown as FileSystemDirectoryHandle, SUPPORTED_SCOPE))
            .response,
        dispose: () => {},
      };
      return transport;
    });
    useDatasetsStore.setState({ tables: [], datasets: [], workerStatus: 'idle', workerError: null });
  });

  it('stages a dropped file so it survives a refresh', async () => {
    await loadDataset(csvFile('orders.csv'));

    expect(await readStagedManifest()).toEqual([
      { tableName: 'orders', fileName: 'orders.csv', fileHash: expect.any(String), stagedAt: expect.any(String) },
    ]);
  });

  it('does not stage a sampled-tier file — persisting it would buffer exactly what that tier refuses to', async () => {
    // Over the sampled threshold on `File.size` alone, so ingestion streams it
    // through a file handle and never holds its bytes.
    await loadDataset(csvFile('huge.csv', 120 * 1024 * 1024));

    expect(useDatasetsStore.getState().tables[0].sampled).toBe(true);
    expect(await readStagedManifest()).toEqual([]);
  });

  it('stages every durable file in a batch and skips the sampled one', async () => {
    await loadFiles([csvFile('a.csv'), csvFile('big.csv', 120 * 1024 * 1024), csvFile('c.csv')]);

    expect((await readStagedManifest()).map((entry) => entry.tableName)).toEqual(['a', 'c']);
  });

  it('removing a table drops its staged bytes, so it does not come back on the next load', async () => {
    await loadDataset(csvFile('orders.csv'));
    const tableId = useDatasetsStore.getState().tables[0].id;

    await removeTable(tableId);

    expect(await readStagedManifest()).toEqual([]);
  });
});
