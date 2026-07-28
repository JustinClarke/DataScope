import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InspectorDrawer } from './InspectorDrawer';
import { useDrawerStore, DRAWER_DEFAULT_HEIGHT } from '../../stores/drawer';
import { useSelectionStore } from '../../stores/selection';

// The leaf's central assertion is about *mounting*, not rendering: Monaco's
// ~2 MB chunk (§15) lives behind `SqlModule`'s own `lazy()`, so the drawer's
// contract is that `SqlModule` never mounts until someone asks for an editor,
// and never re-mounts once it has.
const { sqlModuleMounts } = vi.hoisted(() => ({ sqlModuleMounts: { count: 0 } }));
vi.mock('../sql/SqlModule', () => ({
  SqlModule: () => {
    useEffect(() => {
      sqlModuleMounts.count += 1;
    }, []);
    return <div data-testid="sql-module" />;
  },
}));

vi.mock('./Inspector', () => ({ Inspector: () => <div data-testid="inspector" /> }));

describe('InspectorDrawer (S3)', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    sqlModuleMounts.count = 0;
    useDrawerStore.setState({
      open: true,
      view: 'info',
      consoleActivated: false,
      expanded: false,
      height: DRAWER_DEFAULT_HEIGHT,
    });
    useSelectionStore.getState().clearSelection();
  });

  it('renders two user-controlled views with the active one marked', () => {
    render(<InspectorDrawer />);
    expect(screen.getByRole('button', { name: 'Info' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'SQL Console' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'SQL Console' }));
    expect(screen.getByRole('button', { name: 'SQL Console' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('does not mount SqlModule until the console cold state is opened', () => {
    render(<InspectorDrawer />);
    expect(sqlModuleMounts.count).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'SQL Console' }));
    expect(screen.getByTestId('console-cold-state')).toBeTruthy();
    expect(screen.queryByTestId('sql-module')).toBeNull();
    expect(sqlModuleMounts.count).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Open SQL editor' }));
    expect(screen.getByTestId('sql-module')).toBeTruthy();
    expect(sqlModuleMounts.count).toBe(1);
  });

  it('keeps the console mounted across a view switch, so its buffer and results survive', () => {
    render(<InspectorDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'SQL Console' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open SQL editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Info' }));
    fireEvent.click(screen.getByRole('button', { name: 'SQL Console' }));
    expect(sqlModuleMounts.count).toBe(1);
  });

  it('collapses to its header strip — body hidden, view switcher intact', () => {
    render(<InspectorDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse drawer' }));
    expect(screen.queryByTestId('inspector')).toBeNull();
    expect(screen.getByRole('button', { name: 'Info' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));
    expect(screen.getByTestId('inspector')).toBeTruthy();
  });

  it('expands to full height and restores, without touching the dragged height', () => {
    useDrawerStore.getState().setHeight(300);
    render(<InspectorDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand drawer to full height' }));
    expect(screen.getByTestId('inspector-drawer').getAttribute('data-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Restore drawer height' }));
    expect(screen.getByTestId('inspector-drawer').getAttribute('data-expanded')).toBe('false');
    expect(useDrawerStore.getState().height).toBe(300);
  });

  it('a selection opens a collapsed drawer on Info, even from the console (§13.3)', () => {
    render(<InspectorDrawer />);
    fireEvent.click(screen.getByRole('button', { name: 'SQL Console' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open SQL editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse drawer' }));

    act(() => {
      useSelectionStore.getState().selectTable('t1');
    });

    expect(useDrawerStore.getState().open).toBe(true);
    expect(useDrawerStore.getState().view).toBe('info');
    // The console it interrupted is still mounted underneath.
    expect(sqlModuleMounts.count).toBe(1);
  });

  it('does not treat a selection already in the store at mount time as a click', () => {
    useSelectionStore.getState().selectTable('t1');
    useDrawerStore.setState({ open: false, view: 'console' });
    render(<InspectorDrawer />);
    expect(useDrawerStore.getState().open).toBe(false);
    expect(useDrawerStore.getState().view).toBe('console');
  });
});
