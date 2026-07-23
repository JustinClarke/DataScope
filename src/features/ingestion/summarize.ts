import type { SkippedFile } from '../../services/ingestion';

function extensionOf(name: string): string {
  const ext = name.split('.').pop();
  return ext && ext !== name ? `.${ext.toLowerCase()}` : name;
}

/** §7.5 "one summary toast, never per-file modals" copy: "Ingested 4 tables; skipped 2 unsupported files (.xlsx, .txt)." */
export function summarizeBatch(ingestedCount: number, skipped: SkippedFile[]): string {
  const table = ingestedCount === 1 ? 'table' : 'tables';
  let message = `Ingested ${ingestedCount} ${table}`;

  const unsupported = skipped.filter((s) => s.kind === 'unsupported');
  const failed = skipped.filter((s) => s.kind === 'failed');
  const refused = skipped.filter((s) => s.kind === 'refused');

  if (unsupported.length > 0) {
    const extensions = [...new Set(unsupported.map((s) => extensionOf(s.name)))].sort();
    const file = unsupported.length === 1 ? 'file' : 'files';
    message += `; skipped ${unsupported.length} unsupported ${file} (${extensions.join(', ')})`;
  }
  if (failed.length > 0) {
    const file = failed.length === 1 ? 'file' : 'files';
    message += `${unsupported.length > 0 ? ',' : ';'} ${failed.length} ${file} couldn't be parsed`;
  }
  if (refused.length > 0) {
    const file = refused.length === 1 ? 'file was' : 'files were';
    message += `${unsupported.length > 0 || failed.length > 0 ? ',' : ';'} ${refused.length} ${file} too large`;
  }

  return `${message}.`;
}
