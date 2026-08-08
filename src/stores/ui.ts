// Active sidebar module / tab (§21.7 state tree — "Sidebar navigation").
// Module ids are the top-level nav destinations grouped by §13.2 (D68d); chart
// sub-types (time-series/distribution/categorical) and the per-table id a
// profile-bound action names are no longer separate modules — they travel as
// `activeTabId`, a generic "sub-destination within the active module" hint
// (a chart sub-type for 'charts', a table id for 'profile').
import { create } from "zustand";

export type SidebarModule =
  | "ingestion"
  | "dossier"
  | "profile"
  | "sql"
  | "pivot"
  | "charts"
  | "correlation"
  | "relationships"
  | "ai"
  | "export";

interface UIState {
  activeModule: SidebarModule;
  activeTabId: string | null;
  /**
   * A `RankedAction`'s `ThreadConfig.prefilledConfig` (D68e) — set atomically
   * with the module switch that opened it "on the answer." The destination
   * module reads it exactly once on arrival, via `useThreadPrefill`, then it
   * self-clears; a plain sidebar-reached open (no third arg) always starts
   * with this `null`, matching today's empty-form behavior.
   */
  pendingPrefill: Record<string, unknown> | null;
  /** Switches the active destination; `tabId` names a sub-destination, `prefill` a ThreadConfig payload (both default to none — a plain module switch has neither). */
  setActiveModule: (
    module: SidebarModule,
    tabId?: string | null,
    prefill?: Record<string, unknown> | null,
  ) => void;
  setActiveTabId: (tabId: string | null) => void;
  clearPendingPrefill: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeModule: "ingestion",
  activeTabId: null,
  pendingPrefill: null,
  setActiveModule: (module, tabId = null, prefill = null) =>
    set({ activeModule: module, activeTabId: tabId, pendingPrefill: prefill }),
  setActiveTabId: (tabId) => set({ activeTabId: tabId }),
  clearPendingPrefill: () => set({ pendingPrefill: null }),
}));
