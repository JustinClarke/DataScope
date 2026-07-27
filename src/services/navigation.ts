// The single migration seam (W0, D71, §19) — every ranked-action / palette /
// explorer click routes through `openDestination`, into the Workbench tabs
// store.
import type { SidebarModule } from '../stores/ui';
import { useTabsStore } from '../stores/tabs';
import type { TabType } from '../types/tabs';

/**
 * The module→tab-type mapping is provisional — filled in one entry at a time
 * as each module migrates off the flat sidebar in its own phase (W2: profile;
 * W7.5: sql/pivot/charts/correlation/export). `ai` and `ingestion` remain
 * unlisted — `ai` is the always-on right pane (W7), never a tab; `ingestion`
 * (Add-data) is W2's own still-open deferral. Anything not yet listed falls
 * back to `'map'`.
 */
const TAB_TYPE_BY_MODULE: Partial<Record<SidebarModule, TabType>> = {
  profile: 'profile',
  sql: 'sql',
  pivot: 'pivot',
  charts: 'charts',
  correlation: 'correlation',
  export: 'export',
};

/**
 * Whether `module` already has a real Workbench tab home (W5). The single
 * source of truth the strip/palette check before treating a `RankedAction`
 * or registry entry as launchable — mirrors `TAB_TYPE_BY_MODULE`'s own
 * one-entry-at-a-time migration rather than re-deriving it elsewhere.
 */
export function isDestinationReady(module: SidebarModule): boolean {
  return module in TAB_TYPE_BY_MODULE;
}

/** Human-readable names for disabled-with-reason copy (strip + palette, W5) — one shared source so the two surfaces never drift on what to call a destination. */
export const MODULE_LABELS: Record<SidebarModule, string> = {
  ingestion: 'Add data',
  dossier: 'Blueprint',
  profile: 'Profile',
  sql: 'SQL',
  pivot: 'Pivot',
  charts: 'Charts',
  correlation: 'Correlation',
  relationships: 'Join Graph',
  ai: 'AI chat',
  export: 'Export',
};

/**
 * Opens a destination via `openTab`, with `prefill` carried as the D68e
 * `ThreadConfig` initializer (§13.3: "a `RankedAction`'s prefill becomes the
 * tab-instance initializer — same D68e semantics").
 */
export function openDestination(
  module: SidebarModule,
  tab?: string | null,
  prefill?: Record<string, unknown> | null,
): void {
  const type = TAB_TYPE_BY_MODULE[module] ?? 'map';
  useTabsStore
    .getState()
    .openTab(type, tab ?? module, prefill ? { module, prefilledConfig: prefill } : null);
}
