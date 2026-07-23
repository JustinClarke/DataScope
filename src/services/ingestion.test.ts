import { describe, expect, it } from 'vitest';
import { IngestionError, loadDataset, loadFiles, profileTable } from './ingestion';

// loadDataset/removeDataset/removeTable need a live DuckDB worker (a real
// browser), so they are verified separately, not here — see
// formatPolicy.test.ts for the pure logic (format detection, table naming,
// malformed-CSV detection) they build on. loadFiles' two reject-before-
// touching-the-engine paths below are the exception: both throw ahead of
// loadEngine(), so they're reachable without a real worker. loadDataset's
// oversized-file refusal is a third: the size-tier gate runs on `File.size`
// alone before loadEngine() too.

function fileOfSize(name: string, bytes: number): File {
  const file = new File([], name);
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

describe('ingestion service', () => {
  it('IngestionError is a distinguishable Error subclass', () => {
    const error = new IngestionError('boom');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('boom');
  });

  it('profileTable rejects an unknown table id before touching the engine', async () => {
    await expect(profileTable('does-not-exist')).rejects.toThrow(/Unknown table id/);
  });

  it('loadFiles rejects an empty batch before touching the engine', async () => {
    await expect(loadFiles([])).rejects.toThrow(IngestionError);
  });

  it('loadFiles rejects a batch with no supported formats before touching the engine', async () => {
    const files = [new File(['x'], 'report.xlsx'), new File(['y'], 'notes.txt')];
    await expect(loadFiles(files)).rejects.toThrow(/2 files dropped are in a supported format/);
  });

  it('loadDataset refuses a file over the size ceiling before touching the engine', async () => {
    const huge = fileOfSize('huge.csv', 301 * 1024 * 1024);
    await expect(loadDataset(huge)).rejects.toThrow(IngestionError);
    await expect(loadDataset(huge)).rejects.toThrow(/too large for in-browser analysis \(~301 MB\)/);
  });
});
