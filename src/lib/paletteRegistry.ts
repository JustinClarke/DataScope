// The command palette's registry (W5, D71, master §13.3) — pure data, no
// store/React dependency, so it's testable without mounting anything. Names
// every §13.0-inventory feature home (the hard W5 gate is discoverability;
// see build/12-workbench/06-options-strip-palette.md's inventory table for
// which are actually wired vs. disabled-with-reason at this leaf).
import type { TableRegistryEntry } from '../types';

export type WiredModule = 'sql' | 'pivot' | 'charts' | 'correlation' | 'export';

export type PaletteAction =
  | { kind: 'open-map' }
  | { kind: 'open-profile'; tableId: string }
  | { kind: 'open-module'; module: WiredModule }
  | { kind: 'unavailable' };

export interface PaletteEntry {
  id: string;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  action: PaletteAction;
}

/**
 * The five destinations W7.5 wires for real, each a singleton Workbench tab
 * mounting the same component the old shell already uses.
 */
const WIRED_MODULES: { id: WiredModule; label: string }[] = [
  { id: 'sql', label: 'SQL playground' },
  { id: 'pivot', label: 'Pivot builder' },
  { id: 'charts', label: 'Charts' },
  { id: 'correlation', label: 'Correlation matrix' },
  { id: 'export', label: 'Export / Share' },
];

/**
 * Destinations with no Workbench tab type yet. `dossier` and `relationships`
 * are deliberately absent — both are superseded by the `open-map` entry
 * (D71): the map's single-table Blueprint face re-homes the Dossier, and its
 * ERD is the D24-fed re-skin of the Join Graph. `ai` is not a tab at all —
 * it's the always-on right pane (W7). `ingestion` (Add-data) remains W2's
 * own open deferral.
 */
const NOT_YET_WIRED: { id: string; label: string; reason: string }[] = [
  { id: 'ai', label: 'AI chat', reason: "Lives in the always-on right AI pane, not a tab" },
  { id: 'ingestion', label: 'Add data', reason: "Arrives with the explorer's Add-data leaf" },
];

export function buildPaletteEntries(tables: TableRegistryEntry[]): PaletteEntry[] {
  const entries: PaletteEntry[] = [
    { id: 'map', label: 'Dataset map', enabled: true, action: { kind: 'open-map' } },
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
