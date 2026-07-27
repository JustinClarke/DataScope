// The Workbench tab store (W0, D71, master §13.3) — open `TabSpec[]` +
// `activeTabId`. W3 matures W0's minimal base: `openTab` dedupes singleton
// types by `(type, subject)` (artifact types never dedupe, per `TAB_KIND`),
// and `setActiveTab` lets the UI switch to an already-open tab. Keep-mounted
// preservation itself is a rendering contract (`WorkbenchShell.tsx` renders
// every open tab, hiding inactive ones) — this store just never drops a tab
// from `tabs[]` on its own, which is what makes that possible.
import { create } from 'zustand';
import { TAB_KIND, type TabSpec, type TabType } from '../types/tabs';
import type { ThreadConfig } from '../types/actions';

interface TabsState {
  tabs: TabSpec[];
  activeTabId: string | null;
  /**
   * Opens a tab. Only `type`, `subject`, and `initializer` — this function's
   * own typed parameters — ever set the envelope; there is no code path that
   * reads envelope-shaped keys out of `artifactSpec`. `artifactSpec` is the
   * D55 seam for a future *inner* artifact (ChartSpec/ViewSpec, validated by
   * `producerValidators`) — no AI producer wiring exists yet, so it is
   * accepted for signature stability but not yet persisted onto the tab.
   *
   * Singleton types (`TAB_KIND[type] === 'singleton'`) dedupe by `(type,
   * subject)`: an existing match is activated and reused, its `initializer`
   * left untouched (set once, atomically, at creation — D68e). Artifact
   * types always create a new tab.
   */
  openTab: (
    type: TabType,
    subject: string,
    initializer?: ThreadConfig | null,
    artifactSpec?: unknown,
  ) => string;
  closeTab: (id: string) => void;
  /** Switches to an already-open tab. No-op if `id` names no open tab. */
  setActiveTab: (id: string) => void;
}

let nextTabId = 0;

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  openTab: (type, subject, initializer = null, _artifactSpec) => {
    if (TAB_KIND[type] === 'singleton') {
      const existing = get().tabs.find((tab) => tab.type === type && tab.subject === subject);
      if (existing) {
        set({ activeTabId: existing.id });
        return existing.id;
      }
    }
    const id = `tab-${++nextTabId}`;
    const tab: TabSpec = { id, type, subject, initializer };
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: id }));
    return id;
  },
  closeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id);
      const activeTabId =
        state.activeTabId === id ? (tabs[tabs.length - 1]?.id ?? null) : state.activeTabId;
      return { tabs, activeTabId };
    }),
  setActiveTab: (id) =>
    set((state) => (state.tabs.some((tab) => tab.id === id) ? { activeTabId: id } : state)),
}));
