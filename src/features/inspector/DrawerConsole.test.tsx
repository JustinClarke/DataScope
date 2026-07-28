import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConsoleColdState, DrawerConsole, PROMPT_ABOVE_ROWS } from './DrawerConsole';
import { useDrawerStore, DRAWER_DEFAULT_HEIGHT } from '../../stores/drawer';
import { useQueryStore, CONSOLE_SESSION, EMPTY_SESSION } from '../../stores/query';
import type { QueryResult } from '../../types';

// Monaco's ~2 MB chunk (§15) lives behind `SqlModule`'s own `lazy()`; this
// leaf is about the pane around it, so the editor is stubbed out.
vi.mock('../sql/SqlModule', () => ({ SqlModule: () => <div data-testid="sql-module" /> }));

function resultWith(rowCount: number): QueryResult {
  return {
    columnNames: ['id'],
    columnTypes: ['INTEGER'],
    rows: Array.from({ length: rowCount }, (_, i) => [i]),
    rowCount,
    executionTimeMs: 1,
  };
}

/** Seeds the console session directly, the way `SqlModule.test.tsx` drives the store. */
function seedConsole(session: Partial<typeof EMPTY_SESSION>) {
  useQueryStore.setState({
    sessions: { [CONSOLE_SESSION]: { ...EMPTY_SESSION, ...session } },
    history: [],
    lastRunSession: CONSOLE_SESSION,
  });
}

describe('DrawerConsole (S3)', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useDrawerStore.setState({
      open: true,
      view: 'console',
      consoleActivated: false,
      expanded: false,
      height: DRAWER_DEFAULT_HEIGHT,
    });
    seedConsole({});
  });

  describe('the cold state', () => {
    it('is a composed pane explaining the console, not an empty editor and not a query list', () => {
      render(<ConsoleColdState />);
      expect(screen.getByTestId('console-cold-state').textContent).toContain('The one place SQL is written');
      expect(screen.queryByTestId('sql-module')).toBeNull();
    });

    it('activates the console through its explicit open control', () => {
      render(<ConsoleColdState />);
      fireEvent.click(screen.getByRole('button', { name: 'Open SQL editor' }));
      expect(useDrawerStore.getState().consoleActivated).toBe(true);
      expect(useDrawerStore.getState().view).toBe('console');
      expect(useDrawerStore.getState().open).toBe(true);
    });
  });

  describe('the result overflow prompt', () => {
    it('offers to expand when a successful result overflows the unexpanded drawer', () => {
      seedConsole({ status: 'success', result: resultWith(PROMPT_ABOVE_ROWS + 1) });
      render(<DrawerConsole />);
      expect(screen.getByTestId('drawer-expand-prompt').textContent).toContain(
        `${PROMPT_ABOVE_ROWS + 1} rows — click to expand`,
      );
    });

    // §13.3: "results never auto-expand" — the offer is the whole mechanism,
    // so the drawer's geometry must be untouched until the user takes it.
    it('changes neither height nor expansion by itself — the result only offers', () => {
      seedConsole({ status: 'success', result: resultWith(PROMPT_ABOVE_ROWS + 500) });
      render(<DrawerConsole />);
      expect(useDrawerStore.getState().expanded).toBe(false);
      expect(useDrawerStore.getState().height).toBe(DRAWER_DEFAULT_HEIGHT);
    });

    it('expands only once the user clicks it, and leaves the dragged height alone', () => {
      seedConsole({ status: 'success', result: resultWith(PROMPT_ABOVE_ROWS + 1) });
      render(<DrawerConsole />);
      fireEvent.click(screen.getByTestId('drawer-expand-prompt'));
      expect(useDrawerStore.getState().expanded).toBe(true);
      expect(useDrawerStore.getState().height).toBe(DRAWER_DEFAULT_HEIGHT);
    });

    it('stays silent for a result that fits, for a non-success status, and once already expanded', () => {
      seedConsole({ status: 'success', result: resultWith(PROMPT_ABOVE_ROWS) });
      const fits = render(<DrawerConsole />);
      expect(fits.queryByTestId('drawer-expand-prompt')).toBeNull();
      cleanup();

      seedConsole({ status: 'running', result: resultWith(PROMPT_ABOVE_ROWS + 1) });
      const running = render(<DrawerConsole />);
      expect(running.queryByTestId('drawer-expand-prompt')).toBeNull();
      cleanup();

      useDrawerStore.setState({ expanded: true });
      seedConsole({ status: 'success', result: resultWith(PROMPT_ABOVE_ROWS + 1) });
      const already = render(<DrawerConsole />);
      expect(already.queryByTestId('drawer-expand-prompt')).toBeNull();
    });
  });
});
