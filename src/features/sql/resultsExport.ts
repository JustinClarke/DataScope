import type { QueryResult, TableRegistryEntry } from '../../types';
import { formatCellText } from './cellFormat';
import { buildRecipeScript } from '../../lib/recipeExport';

/** RFC 4180 quoting: only when a field contains a comma, quote, or newline; embedded quotes double up. */
function csvField(text: string): string {
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(result: QueryResult): string {
  const lines = [result.columnNames.map(csvField).join(',')];
  for (const row of result.rows) {
    lines.push(row.map((cell, i) => csvField(formatCellText(cell, result.columnTypes[i] ?? ''))).join(','));
  }
  return lines.join('\r\n');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(result: QueryResult, filename = 'query-results.csv'): void {
  downloadBlob(new Blob([toCsv(result)], { type: 'text/csv;charset=utf-8' }), filename);
}

/**
 * `.xlsx` writing is lazy-loaded (§12.2, §15) — the OOXML writer and its zip
 * step have no reason to sit in the entry bundle for the CSV-only common
 * case, so this import only resolves once the user actually asks for Excel.
 */
export async function downloadXlsx(result: QueryResult, filename = 'query-results.xlsx'): Promise<void> {
  const { buildXlsx } = await import('./xlsxWriter');
  downloadBlob(
    new Blob([buildXlsx(result)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  );
}

export async function copySql(sql: string): Promise<void> {
  await navigator.clipboard.writeText(sql);
}

/** The session's transform recipe (§12.1, D53) — every derived table's generating SQL, ordered and downloadable as a re-runnable `.sql` file. */
export function downloadRecipe(tables: TableRegistryEntry[], filename = 'transform-recipe.sql'): void {
  downloadBlob(new Blob([buildRecipeScript(tables)], { type: 'application/sql;charset=utf-8' }), filename);
}
