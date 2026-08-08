// Shell-level panel layout — which panels are collapsed, persisted so a reload
// returns the workspace the user arranged. The inspector has its own store
// (`drawer.ts`) with richer geometry (height, info ratio, expanded); this store
// covers the explorer and AI pane, which are binary open/closed.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const LAYOUT_STORAGE_KEY = "datascope-layout";

interface PersistedLayoutState {
  explorerCollapsed: boolean;
  aiPaneCollapsed: boolean;
}
const LAYOUT_PERSIST_VERSION = 1;

interface LayoutState {
  explorerCollapsed: boolean;
  aiPaneCollapsed: boolean;
  toggleExplorer: () => void;
  toggleAIPane: () => void;
  setExplorerCollapsed: (collapsed: boolean) => void;
  setAIPaneCollapsed: (collapsed: boolean) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      explorerCollapsed: false,
      aiPaneCollapsed: false,
      toggleExplorer: () =>
        set((state) => ({ explorerCollapsed: !state.explorerCollapsed })),
      toggleAIPane: () =>
        set((state) => ({ aiPaneCollapsed: !state.aiPaneCollapsed })),
      setExplorerCollapsed: (collapsed) =>
        set({ explorerCollapsed: collapsed }),
      setAIPaneCollapsed: (collapsed) => set({ aiPaneCollapsed: collapsed }),
    }),
    {
      name: LAYOUT_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: LAYOUT_PERSIST_VERSION,
      partialize: (state): PersistedLayoutState => ({
        explorerCollapsed: state.explorerCollapsed,
        aiPaneCollapsed: state.aiPaneCollapsed,
      }),
      migrate: (persisted, version): PersistedLayoutState =>
        version === LAYOUT_PERSIST_VERSION
          ? (persisted as PersistedLayoutState)
          : { explorerCollapsed: false, aiPaneCollapsed: false },
    },
  ),
);
