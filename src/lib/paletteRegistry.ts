// The command palette's registry (W5, D71, master §13.3) — pure data, no
// store/React dependency, so it's testable without mounting anything. Names
// every §13.0-inventory feature home (the hard W5 gate is discoverability;
// see build/12-workbench/06-options-strip-palette.md's inventory table for
// which are actually wired vs. disabled-with-reason at this leaf).
import type { TableRegistryEntry } from '../types';

export type WiredModule = 'pivot' | 'charts' | 'correlation' | 'export' | 'ingestion';

export type PaletteAction =
  | { kind: 'open-map' }
  | { kind: 'open-profile'; tableId: string }
  | { kind: 'open-module'; module: WiredModule }
  // S5: the deleted SQL tab's entry becomes two, because there are now two SQL
  // destinations — the one shared console, and a keeper of your own.
  | { kind: 'open-console' }
  | { kind: 'new-query-tab' }
  | { kind: 'unavailable' };

export interface PaletteEntry {
  id: string;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  action: PaletteAction;
}

/**
 * The destinations wired for real, each a singleton Workbench tab mounting the
 * same component the old shell already uses. Five arrived at W7.5; `ingestion`
 * (Add-data) arrived at S1, closing W2's own deferral; `sql` left at S5 for the
 * two entries below, since the playground tab it named no longer exists.
 */
const WIRED_MODULES: { id: WiredModule; label: string }[] = [
  { id: 'pivot', label: 'Pivot builder' },
  { id: 'charts', label: 'Charts' },
  { id: 'correlation', label: 'Correlation matrix' },
  { id: 'export', label: 'Export / Share' },
  { id: 'ingestion', label: 'Add data' },
];

/**
 * Destinations with no Workbench tab type at all. `dossier` and
 * `relationships` are deliberately absent — both are superseded by the
 * `open-map` entry (D71): the map's single-table Blueprint face re-homes the
 * Dossier, and its ERD is the D24-fed re-skin of the Join Graph. `ai` is the
 * only remaining member — it's the always-on right pane (W7), never a tab.
 */
const NOT_YET_WIRED: { id: string; label: string; reason: string }[] = [
  { id: 'ai', label: 'AI chat', reason: "Lives in the always-on right AI pane, not a tab" },
];

export function buildPaletteEntries(tables: TableRegistryEntry[]): PaletteEntry[] {
  const entries: PaletteEntry[] = [
    { id: 'map', label: 'Dataset map', enabled: true, action: { kind: 'open-map' } },
    // Both SQL destinations are nameable here: the palette is the app's only
    // cross-tab launcher (§13.3), so neither may be reachable by gesture alone.
    { id: 'console', label: 'SQL console', enabled: true, action: { kind: 'open-console' } },
    { id: 'query-tab', label: 'New query tab', enabled: true, action: { kind: 'new-query-tab' } },
  ];

  for (const table of tables) {
    entries.push({
      id: `profile:${table.id}`,
      label: `Profile: ${table.tableName}`,
      enabled: true,
      action: { kind: 'open-profile', tableId: table.id },
    });
  }

  for (const item of WIRED_MODULES) {
    entries.push({
      id: item.id,
      label: item.label,
      enabled: true,
      action: { kind: 'open-module', module: item.id },
    });
  }

  for (const item of NOT_YET_WIRED) {
    entries.push({
      id: item.id,
      label: item.label,
      enabled: false,
      disabledReason: item.reason,
      action: { kind: 'unavailable' },
    });
  }

  return entries;
}
