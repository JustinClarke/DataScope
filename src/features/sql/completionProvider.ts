import type { TableRegistryEntry } from '../../types';

export type SqlCompletionKind = 'table' | 'column';

export interface SqlCompletionItem {
  label: string;
  kind: SqlCompletionKind;
  /** Short human-readable annotation shown alongside the label (e.g. the owning table for a column). */
  detail: string;
  insertText: string;
}

/**
 * Pure derivation of autocomplete entries from the live table registry — no
 * Monaco types here so this stays testable without a browser editor instance
 * and reusable if the editor integration ever changes. Reads the registry
 * fresh on every call rather than caching, so a table added, dropped, or
 * derived after the editor mounted is reflected on the next keystroke.
 *
 * A column can belong to more than one table; each occurrence is kept as a
 * separate suggestion (with its own table in `detail`) rather than deduped,
 * so the annotation always names the right source table.
 */
export function buildCompletionItems(tables: TableRegistryEntry[]): SqlCompletionItem[] {
  const items: SqlCompletionItem[] = [];

  for (const table of tables) {
    items.push({
      label: table.tableName,
      kind: 'table',
      detail: table.origin === 'derived' ? 'derived table' : 'table',
      insertText: table.tableName,
    });

    for (const column of table.columns ?? []) {
      items.push({
        label: column.name,
        kind: 'column',
        detail: `column · ${table.tableName}`,
        insertText: column.name,
      });
    }
  }

  return items;
}
