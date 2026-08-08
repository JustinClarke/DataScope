// The item-inspector drawer's geometry (S3/S6.5, D73, master §13.3). Not
// component state, unlike the explorer rail's `useExplorerWidth`: S4's
// run-from-anywhere calls `activateConsole()` from surfaces all over the app,
// so the region needs one state home reachable outside the drawer's tree.
// Nothing here is persisted — D73's pane mechanics are "v1 is resize +
// collapse", with per-user layout persistence deferred to S6.9, which answers
// it for the whole shell at once rather than for this region alone.
//
// S6.5 makes both panes permanently visible, so there is no view to select and
// no `view` field: the drawer sits Info and the SQL editor abreast, or stacks
// them — editor above, Info below — when it is expanded or too narrow to sit
// them side by side.
//
// 07c persists the geometry (`open`/`expanded`/`height`/`infoRatio`) so a
// reload returns the drawer the user left, not the defaults. `infoSignal`/
// `consoleSignal` never persist — they are transient nudges, and a restored
// signal would fire a pane-open animation on load for a run that happened
// last session.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const DRAWER_MIN_HEIGHT = 120;
export const DRAWER_DEFAULT_HEIGHT = 200;

// Info's share of the drawer — a ratio rather than a fixed sidebar, because
// both panes carry real content: Info holds the result, its chart and the
// export actions, and the editor holds nothing but code. The clamp is what
// stops either pane reaching zero. A run landing in an invisible pane is how a
// user confirms a transform through the guard modal and then never sees what
// it did.
export const INFO_MIN_RATIO = 0.3;
export const INFO_MAX_RATIO = 0.7;
export const INFO_DEFAULT_RATIO = 0.5;

/** Below this drawer width the panes stack rather than sitting abreast — neither is ever hidden. */
export const SPLIT_MIN_DRAWER_WIDTH = 900;

const clampRatio = (ratio: number): number =>
  Math.min(INFO_MAX_RATIO, Math.max(INFO_MIN_RATIO, ratio));

export const DRAWER_STORAGE_KEY = "datascope-drawer";

/** The 07c whitelist: geometry only, never the `infoSignal`/`consoleSignal` counters. */
interface PersistedDrawerState {
  open: boolean;
  expanded: boolean;
  height: number;
  infoRatio: number;
}
const DRAWER_PERSIST_VERSION = 1;

interface DrawerState {
  /** false = collapsed to the header strip; the strip never disappears with it. */
  open: boolean;
  /**
   * Full-height, and the thing that turns the split from side-by-side into
   * stacked: the editor takes the top and Info becomes the results panel
   * beneath it. Only ever set by the user — a result never sets it (§13.3).
   */
  expanded: boolean;
  height: number;
  /** Info's share of the drawer, on whichever axis the panes are laid out. */
  infoRatio: number;
  /**
   * Bumped by `openInfo`. Both panes are always visible, so a selection change
   * moves no chrome at all — Info watches this to reset its scroll and mark its
   * header, which is the whole of the "something arrived here" signal, and
   * deliberately not a focus steal: the caret is often in the editor.
   */
  infoSignal: number;
  /** Bumped by `activateConsole`, so a run started elsewhere brings its own result into view. */
  consoleSignal: number;
  /** The selection hand-off: open the drawer if collapsed, and signal Info (§13.3). */
  openInfo: () => void;
  setOpen: (open: boolean) => void;
  /** Open with both panes reachable — S4's seam for run-from-anywhere. */
  activateConsole: () => void;
  setExpanded: (expanded: boolean) => void;
  setHeight: (height: number) => void;
  setInfoRatio: (ratio: number) => void;
}

export const useDrawerStore = create<DrawerState>()(
  persist(
    (set) => ({
      open: true,
      expanded: false,
      height: DRAWER_DEFAULT_HEIGHT,
      infoRatio: INFO_DEFAULT_RATIO,
      infoSignal: 0,
      consoleSignal: 0,
      // `height` and `infoRatio` are untouched here and by `setOpen`, which is what
      // makes a re-open after a user collapse return the geometry they left rather
      // than the defaults.
      openInfo: () =>
        set((state) => ({ open: true, infoSignal: state.infoSignal + 1 })),
      setOpen: (open) => set({ open }),
      activateConsole: () =>
        set((state) => ({
          open: true,
          infoRatio: clampRatio(state.infoRatio),
          consoleSignal: state.consoleSignal + 1,
        })),
      setExpanded: (expanded) => set({ expanded }),
      setHeight: (height) =>
        set({ height: Math.max(DRAWER_MIN_HEIGHT, height) }),
      setInfoRatio: (ratio) => set({ infoRatio: clampRatio(ratio) }),
    }),
    {
      name: DRAWER_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: DRAWER_PERSIST_VERSION,
      partialize: (state): PersistedDrawerState => ({
        open: state.open,
        expanded: state.expanded,
        height: state.height,
        infoRatio: state.infoRatio,
      }),
      migrate: (persisted, version): PersistedDrawerState =>
        version === DRAWER_PERSIST_VERSION
          ? (persisted as PersistedDrawerState)
          : {
              open: true,
              expanded: false,
              height: DRAWER_DEFAULT_HEIGHT,
              infoRatio: INFO_DEFAULT_RATIO,
            },
    },
  ),
);
