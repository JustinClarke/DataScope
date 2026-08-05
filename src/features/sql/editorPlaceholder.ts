import type { TableRegistryEntry } from '../../types';

/**
 * What an empty console editor says (S6.7). The drawer opens on the editor
 * alone now — Info is absent until a selection or a run gives it something to
 * hold — so the empty buffer is the whole first impression, and a blank
 * rectangle is a poor one.
 *
 * Deliberately one static line naming one real, already-loaded table: not
 * `QuerySuggestions` under another name (S6.5 pulled that block out of the
 * console this same week, and the map is its one home). No ranking, no card,
 * no click target beyond the editor itself.
 */
export function consolePlaceholder(tables: TableRegistryEntry[]): string {
  const first = tables[0];
  if (!first) return 'Type a query, or ⌘Enter to run';
  return `Type a query, or ⌘Enter to run — try SELECT * FROM "${first.tableName}" LIMIT 100`;
}
