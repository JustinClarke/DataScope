import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';
import { useDatasetsStore } from '../../stores/datasets';
import { useTabsStore } from '../../stores/tabs';
import { usePaletteOpenStore } from '../../stores/paletteOpen';
import { useDrawerStore } from '../../stores/drawer';
import type { TableRegistryEntry } from '../../types';

const { openDestinationMock } = vi.hoisted(() => ({ openDestinationMock: vi.fn() }));
vi.mock('../../services/navigation', async () => {
  const actual = await vi.importActual<typeof import('../../services/navigation')>('../../services/navigation');
  return { ...actual, openDestination: openDestinationMock };
});

function table(id: string, tableName: string): TableRegistryEntry {
  return {
    id,
    tableName,
    datasetId: 'd1',
    origin: 'file',
    rowCount: 10,
    columnCount: 1,
    memoryBytes: 100,
    createdAt: '2026-07-25T00:00:00.000Z',
  };
}

function openPalette() {
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
}

describe('CommandPalette', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    openDestinationMock.mockReset();
    useDatasetsStore.setState({ datasets: [], tables: [table('o', 'orders')], workerStatus: 'idle', workerError: null });
    useTabsStore.setState({ tabs: [], activeTabId: null });
    usePaletteOpenStore.setState({ open: false });
  });

  it('renders nothing until opened', () => {
    const { queryByTestId } = render(<CommandPalette />);
    expect(queryByTestId('command-palette')).toBeNull();
  });

  it('opens on Cmd/Ctrl+K and closes on Escape', () => {
    const { queryByTestId } = render(<CommandPalette />);
    openPalette();
    expect(queryByTestId('command-palette')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(queryByTestId('command-palette')).toBeNull();
  });

  it('opens via usePaletteOpenStore.toggle() directly, the TitleBar button\'s path', () => {
    const { queryByTestId, rerender } = render(<CommandPalette />);
    expect(queryByTestId('command-palette')).toBeNull();
    usePaletteOpenStore.getState().toggle();
    rerender(<CommandPalette />);
    expect(queryByTestId('command-palette')).toBeTruthy();
  });

  it('typing filters entries by label', () => {
    const { getByTestId, queryByTestId } = render(<CommandPalette />);
    openPalette();
    fireEvent.change(getByTestId('command-palette-input'), { target: { value: 'orders' } });
    expect(getByTestId('command-palette-entry-profile:o')).toBeTruthy();
    expect(queryByTestId('command-palette-entry-map')).toBeNull();
  });

  it('activating the map entry opens the workspace map tab and closes the palette', () => {
    const { getByTestId, queryByTestId } = render(<CommandPalette />);
    openPalette();
    fireEvent.click(getByTestId('command-palette-entry-map'));
    expect(useTabsStore.getState().tabs).toMatchObject([{ type: 'map', subject: 'workspace' }]);
    expect(queryByTestId('command-palette')).toBeNull();
  });

  it('activating a profile entry routes through the nav facade and closes the palette', () => {
    const { getByTestId, queryByTestId } = render(<CommandPalette />);
    openPalette();
    fireEvent.click(getByTestId('command-palette-entry-profile:o'));
    expect(openDestinationMock).toHaveBeenCalledWith('profile', 'o');
    expect(queryByTestId('command-palette')).toBeNull();
  });

  it('a not-yet-wired entry is disabled and does nothing on click', () => {
    const { getByTestId } = render(<CommandPalette />);
    openPalette();
    const button = getByTestId('command-palette-entry-ai');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(openDestinationMock).not.toHaveBeenCalled();
    expect(useTabsStore.getState().tabs).toHaveLength(0);
  });

  it('activating a W7.5 module entry (pivot) routes through the nav facade with no tab argument, and closes the palette', () => {
    const { getByTestId, queryByTestId } = render(<CommandPalette />);
    openPalette();
    fireEvent.click(getByTestId('command-palette-entry-pivot'));
    expect(openDestinationMock).toHaveBeenCalledWith('pivot');
    expect(queryByTestId('command-palette')).toBeNull();
  });

  // S5 — the deleted SQL tab's one entry became two destinations.
  it('the SQL console entry opens the drawer console and no tab', () => {
    const { getByTestId } = render(<CommandPalette />);
    openPalette();
    fireEvent.click(getByTestId('command-palette-entry-console'));
    expect(useDrawerStore.getState()).toMatchObject({ open: true });
    expect(useTabsStore.getState().tabs).toHaveLength(0);
  });

  it('the New query tab entry opens an artifact query tab', () => {
    const { getByTestId } = render(<CommandPalette />);
    openPalette();
    fireEvent.click(getByTestId('command-palette-entry-query-tab'));
    const tabs = useTabsStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].type).toBe('query');
  });

  it('a wired-module row renders TAB_GLYPH\'s icon; the one remaining not-yet-wired (ai) row renders its own literal glyph (V5)', () => {
    const { getByTestId } = render(<CommandPalette />);
    openPalette();
    expect(getByTestId('command-palette-entry-pivot').querySelector('svg')).toBeTruthy();
    expect(getByTestId('command-palette-entry-console').querySelector('svg')).toBeTruthy();
    expect(getByTestId('command-palette-entry-ai').textContent).toContain('✦');
    // ingestion is wired now (S1) — it renders TAB_GLYPH's Plus icon like any other module, not the old '＋' literal.
    expect(getByTestId('command-palette-entry-ingestion').querySelector('svg')).toBeTruthy();
  });
});
