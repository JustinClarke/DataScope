import { beforeEach, describe, expect, it } from 'vitest';
import { useDrawerStore, DRAWER_DEFAULT_HEIGHT, DRAWER_MIN_HEIGHT } from './drawer';

describe('drawer store (S3)', () => {
  beforeEach(() => {
    useDrawerStore.setState({
      open: true,
      view: 'info',
      consoleActivated: false,
      expanded: false,
      height: DRAWER_DEFAULT_HEIGHT,
    });
  });

  it('starts open on Info with no console ever activated', () => {
    const state = useDrawerStore.getState();
    expect(state.open).toBe(true);
    expect(state.view).toBe('info');
    expect(state.consoleActivated).toBe(false);
    expect(state.expanded).toBe(false);
  });

  it('activateConsole opens the drawer, switches the view, and records the activation', () => {
    useDrawerStore.setState({ open: false, view: 'info' });
    useDrawerStore.getState().activateConsole();
    const state = useDrawerStore.getState();
    expect(state.open).toBe(true);
    expect(state.view).toBe('console');
    expect(state.consoleActivated).toBe(true);
  });

  it('openInfo opens a collapsed drawer and switches back to Info', () => {
    useDrawerStore.getState().activateConsole();
    useDrawerStore.getState().setOpen(false);
    useDrawerStore.getState().openInfo();
    expect(useDrawerStore.getState().open).toBe(true);
    expect(useDrawerStore.getState().view).toBe('info');
    // Activation is sticky — the console keeps its editor mounted underneath.
    expect(useDrawerStore.getState().consoleActivated).toBe(true);
  });

  it('showView opens the drawer as well as switching, so a click on a collapsed strip is one gesture', () => {
    useDrawerStore.setState({ open: false });
    useDrawerStore.getState().showView('console');
    expect(useDrawerStore.getState().open).toBe(true);
    expect(useDrawerStore.getState().view).toBe('console');
    // Switching to the console is not the same as asking for an editor.
    expect(useDrawerStore.getState().consoleActivated).toBe(false);
  });

  it('setHeight clamps at the minimum', () => {
    useDrawerStore.getState().setHeight(10);
    expect(useDrawerStore.getState().height).toBe(DRAWER_MIN_HEIGHT);
    useDrawerStore.getState().setHeight(320);
    expect(useDrawerStore.getState().height).toBe(320);
  });

  it('expansion is independent of height, so restoring returns to the dragged size', () => {
    useDrawerStore.getState().setHeight(300);
    useDrawerStore.getState().setExpanded(true);
    expect(useDrawerStore.getState().height).toBe(300);
    useDrawerStore.getState().setExpanded(false);
    expect(useDrawerStore.getState().height).toBe(300);
  });
});
