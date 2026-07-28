// The item-inspector drawer's geometry and view state (S3, D73, master §13.3).
// Not component state, unlike the explorer rail's `useExplorerWidth`: S4's
// run-from-anywhere calls `activateConsole()` from surfaces all over the app,
// so the region needs one state home reachable outside the drawer's tree.
// Nothing here is persisted — D73's pane mechanics are "v1 is resize +
// collapse", with per-user layout persistence deferred.
import { create } from 'zustand';

export type DrawerView = 'info' | 'console';

export const DRAWER_MIN_HEIGHT = 120;
export const DRAWER_DEFAULT_HEIGHT = 200;

interface DrawerState {
  /** false = collapsed to the header strip; the view switcher never disappears with it. */
  open: boolean;
  view: DrawerView;
  /**
   * Has the editor ever been asked for. Gates `SqlModule`'s mount, which is
   * what keeps Monaco's ~2 MB chunk (§15) off the shell's startup path — the
   * drawer itself is present in every session.
   */
  consoleActivated: boolean;
  /** Full-viewport height. Only ever set by the user: a result never sets it (§13.3). */
  expanded: boolean;
  height: number;
  /** The selection hand-off: open the drawer if collapsed, show Info. */
  openInfo: () => void;
  showView: (view: DrawerView) => void;
  setOpen: (open: boolean) => void;
  /** Open on the console with its editor mounted — S4's seam for run-from-anywhere. */
  activateConsole: () => void;
  setExpanded: (expanded: boolean) => void;
  setHeight: (height: number) => void;
}

export const useDrawerStore = create<DrawerState>((set) => ({
  open: true,
  view: 'info',
  consoleActivated: false,
  expanded: false,
  height: DRAWER_DEFAULT_HEIGHT,
  openInfo: () => set({ open: true, view: 'info' }),
  showView: (view) => set({ open: true, view }),
  setOpen: (open) => set({ open }),
  activateConsole: () => set({ open: true, view: 'console', consoleActivated: true }),
  setExpanded: (expanded) => set({ expanded }),
  setHeight: (height) => set({ height: Math.max(DRAWER_MIN_HEIGHT, height) }),
}));
