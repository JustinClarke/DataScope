import { describe, expect, it } from 'vitest';
import { summarizeBatch } from './summarize';
import type { SkippedFile } from '../../services/ingestion';

describe('summarizeBatch', () => {
  it("matches §7.5's exact copy shape for mixed unsupported skips", () => {
    const skipped: SkippedFile[] = [
      { name: 'notes.xlsx', kind: 'unsupported', reason: 'x' },
      { name: 'readme.txt', kind: 'unsupported', reason: 'x' },
    ];
    expect(summarizeBatch(4, skipped)).toBe('Ingested 4 tables; skipped 2 unsupported files (.txt, .xlsx).');
  });

  it('has no skip clause when nothing was skipped', () => {
    expect(summarizeBatch(3, [])).toBe('Ingested 3 tables.');
  });

  it('singularizes table/file counts', () => {
    const skipped: SkippedFile[] = [{ name: 'a.xlsx', kind: 'unsupported', reason: 'x' }];
    expect(summarizeBatch(1, skipped)).toBe('Ingested 1 table; skipped 1 unsupported file (.xlsx).');
  });

  it('reports failed-to-parse files distinctly from unsupported ones', () => {
    const skipped: SkippedFile[] = [
      { name: 'a.xlsx', kind: 'unsupported', reason: 'x' },
      { name: 'broken.csv', kind: 'failed', reason: 'malformed' },
    ];
    expect(summarizeBatch(2, skipped)).toBe(
      "Ingested 2 tables; skipped 1 unsupported file (.xlsx), 1 file couldn't be parsed.",
    );
  });
});
