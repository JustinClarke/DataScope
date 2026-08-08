// The single migration seam (W0, D71, §19) — every ranked-action / palette /
// explorer click routes through `openDestination`, into the Workbench tabs
// store.
import type { SidebarModule } from "../stores/ui";
import { useTabsStore } from "../stores/tabs";
import { useDrawerStore } from "../stores/drawer";
import { runInConsole } from "./runPath";
import type { TabType } from "../types/tabs";

/**
 * The module→tab-type mapping is provisional — filled in one entry at a time
 * as each module migrates off the flat sidebar in its own phase (W2: profile;
 * W7.5: sql/pivot/charts/correlation/export; S1: ingestion, closing W2's own
 * still-open Add-data deferral). `ai` remains unlisted — it's the always-on
 * right pane (W7), never a tab. **`sql` left this table at S5** — the module
 * still exists, but its destination is the drawer console rather than a tab
 * (D73). Anything not listed falls back to `'map'`.
 */
const TAB_TYPE_BY_MODULE: Partial<Record<SidebarModule, TabType>> = {
  profile: "profile",
  pivot: "pivot",
  charts: "charts",
  correlation: "correlation",
  export: "export",
  ingestion: "ingestion",
};

/**
 * Whether `module` already has a real Workbench tab home (W5). The single
 * source of truth the strip/palette check before treating a `RankedAction`
 * or registry entry as launchable — mirrors `TAB_TYPE_BY_MODULE`'s own
 * one-entry-at-a-time migration rather than re-deriving it elsewhere.
 */
export function isDestinationReady(module: SidebarModule): boolean {
  // `sql` is ready and always was — S5 moved its destination out of the tab
  // registry into the drawer console, and this predicate is about whether a
  // destination is reachable, not about whether it happens to be a tab.
  return module === "sql" || module in TAB_TYPE_BY_MODULE;
}

/** Human-readable names for disabled-with-reason copy (strip + palette, W5) — one shared source so the two surfaces never drift on what to call a destination. */
export const MODULE_LABELS: Record<SidebarModule, string> = {
  ingestion: "Add data",
  dossier: "Blueprint",
  profile: "Profile",
  sql: "SQL console",
  pivot: "Pivot",
  charts: "Charts",
  correlation: "Correlation",
  relationships: "Join Graph",
  ai: "AI chat",
  export: "Export",
};

/**
 * Opens a destination via `openTab`, with `prefill` carried as the D68e
 * `ThreadConfig` initializer (§13.3: "a `RankedAction`'s prefill becomes the
 * tab-instance initializer — same D68e semantics").
 *
 * The exception is the `sql` module: SQL is written in exactly one place now
 * (S4/S5, D73), so it goes to the drawer console instead of opening a tab —
 * running there when the action carries a query, and simply opening there when
 * it doesn't. D68e's "opens on the answer" is unchanged; the answer just
 * appears in the console. Routing it here covers every dispatch site at once
 * rather than asking each one to know the rule.
 */
export function openDestination(
  module: SidebarModule,
  tab?: string | null,
  prefill?: Record<string, unknown> | null,
): void {
  if (module === "sql") {
    const prefilledSql = prefill?.sql;
    if (typeof prefilledSql === "string" && prefilledSql.trim())
      runInConsole(prefilledSql);
    else useDrawerStore.getState().activateConsole();
    return;
  }

  const type = TAB_TYPE_BY_MODULE[module] ?? "map";
  useTabsStore
    .getState()
    .openTab(
      type,
      tab ?? module,
      prefill ? { module, prefilledConfig: prefill } : null,
    );
}
