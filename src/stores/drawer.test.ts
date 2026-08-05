import { beforeEach, describe, expect, it } from 'vitest';
import {
  useDrawerStore,
  DRAWER_DEFAULT_HEIGHT,
  DRAWER_MIN_HEIGHT,
  DRAWER_STORAGE_KEY,
  INFO_DEFAULT_RATIO,
  INFO_MAX_RATIO,
  INFO_MIN_RATIO,
} from './drawer';

describe('drawer store (S3/S6.5)', () => {
  beforeEach(() => {
    localStorage.clear();
    useDrawerStore.setState({
      open: true,
      expanded: false,
      height: DRAWER_DEFAULT_HEIGHT,
      infoRatio: INFO_DEFAULT_RATIO,
      infoSignal: 0,
      consoleSignal: 0,
    });
  });

  it('starts open at its default geometry, with the panes sharing the drawer evenly', () => {
    const state = useDrawerStore.getState();
    expect(state.open).toBe(true);
    expect(state.expanded).toBe(false);
    expect(state.infoRatio).toBe(INFO_DEFAULT_RATIO);
  });

  // S6.5: both panes are permanently visible, so there is nothing to select
  // between and no editor-activation gate left to keep.
  it('carries neither a view selector nor a console-activation gate', () => {
    const state = useDrawerStore.getState();
    expect('view' in state).toBe(false);
    expect('consoleActivated' in state).toBe(false);
  });

  it('activateConsole opens the drawer and signals the run, clamping the ratio back into range', () => {
    useDrawerStore.setState({ open: false, infoRatio: 0.95 });
    useDrawerStore.getState().activateConsole();
    const state = useDrawerStore.getState();
    expect(state.open).toBe(true);
    expect(state.infoRatio).toBe(INFO_MAX_RATIO);
    expect(state.consoleSignal).toBe(1);
  });

  it('openInfo opens a collapsed drawer and signals Info', () => {
    useDrawerStore.getState().setOpen(false);
    useDrawerStore.getState().openInfo();
    const state = useDrawerStore.getState();
    expect(state.open).toBe(true);
    // The signal is the whole of the "something landed here" treatment — no
    // chrome moves under a permanent split, so nothing else would say so.
    expect(state.infoSignal).toBe(1);
  });

  it('setHeight clamps at the minimum', () => {
    useDrawerStore.getState().setHeight(10);
    expect(useDrawerStore.getState().height).toBe(DRAWER_MIN_HEIGHT);
    useDrawerStore.getState().setHeight(320);
    expect(useDrawerStore.getState().height).toBe(320);
  });

  /**
   * The clamp is the whole guarantee that neither pane reaches zero. A run
   * landing in an invisible pane is how a user confirms a transform through the
   * guard modal and then never sees what it did.
   */
  it('setInfoRatio clamps at both ends, so neither pane can be dragged away', () => {
    useDrawerStore.getState().setInfoRatio(0);
    expect(useDrawerStore.getState().infoRatio).toBe(INFO_MIN_RATIO);
    useDrawerStore.getState().setInfoRatio(-3);
    expect(useDrawerStore.getState().infoRatio).toBe(INFO_MIN_RATIO);
    useDrawerStore.getState().setInfoRatio(1);
    expect(useDrawerStore.getState().infoRatio).toBe(INFO_MAX_RATIO);
    useDrawerStore.getState().setInfoRatio(0.6);
    expect(useDrawerStore.getState().infoRatio).toBe(0.6);
  });

  it('expansion is independent of height, so restoring returns to the dragged size', () => {
    useDrawerStore.getState().setHeight(300);
    useDrawerStore.getState().setExpanded(true);
    expect(useDrawerStore.getState().height).toBe(300);
    useDrawerStore.getState().setExpanded(false);
    expect(useDrawerStore.getState().height).toBe(300);
  });

  // Collapsing is the only way to get the drawer out of the way, and every
  // selection re-opens it — so the trip back has to return the geometry the
  // user left, not the defaults.
  it('a collapse and re-open restores the last height and split ratio', () => {
    useDrawerStore.getState().setHeight(340);
    useDrawerStore.getState().setInfoRatio(0.65);
    useDrawerStore.getState().setOpen(false);
    useDrawerStore.getState().openInfo();
    expect(useDrawerStore.getState().height).toBe(340);
    expect(useDrawerStore.getState().infoRatio).toBe(0.65);
  });

  describe('persistence (07c)', () => {
    it('persists exactly open/expanded/height/infoRatio — never the signal counters', () => {
      useDrawerStore.getState().setHeight(340);
      useDrawerStore.getState().activateConsole();

      const raw = localStorage.getItem(DRAWER_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.state).toEqual({
        open: true,
        expanded: false,
        height: 340,
        infoRatio: INFO_DEFAULT_RATIO,
      });
    });

    it('never persists infoSignal/consoleSignal — a restored signal would fire a pane-open for a run that happened last session', () => {
      useDrawerStore.getState().activateConsole();
      useDrawerStore.getState().openInfo();

      const raw = localStorage.getItem(DRAWER_STORAGE_KEY);
      const parsed = JSON.parse(raw!);
      expect(parsed.state.infoSignal).toBeUndefined();
      expect(parsed.state.consoleSignal).toBeUndefined();
    });

    it('a persisted payload from an old schema version rehydrates to safe defaults rather than crashing', async () => {
      localStorage.setItem(
        DRAWER_STORAGE_KEY,
        JSON.stringify({ state: { open: 'not-a-bool', height: -999 }, version: 0 }),
      );

      await useDrawerStore.persist.rehydrate();

      const state = useDrawerStore.getState();
      expect(state.open).toBe(true);
      expect(state.height).toBe(DRAWER_DEFAULT_HEIGHT);
      expect(state.infoRatio).toBe(INFO_DEFAULT_RATIO);
    });
  });
});
