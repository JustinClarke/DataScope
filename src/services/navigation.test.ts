import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTabsStore } from '../stores/tabs';
import { useDrawerStore } from '../stores/drawer';
import { openDestination, isDestinationReady } from './navigation';
import * as runPath from './runPath';
import type { SidebarModule } from '../stores/ui';

vi.mock('./runPath', () => ({ runInConsole: vi.fn() }));

beforeEach(() => {
  useTabsStore.setState({ tabs: [], activeTabId: null });
  useDrawerStore.setState({ open: true, expanded: false, consoleSignal: 0 });
  vi.mocked(runPath.runInConsole).mockReset();
});

describe('openDestination', () => {
  it('routes to stores/tabs.ts.openTab, falling back to \'map\' for a module with no tab type yet', () => {
    // 'ai' has no TabType (it's the always-on right pane, not a tab, W7.5) —
    // still the right fixture to prove the fallback-to-'map' path.
    openDestination('ai', 'chart-1', { tableName: 'orders', columns: [] });

    const tabs = useTabsStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].type).toBe('map');
    expect(tabs[0].initializer).toEqual({
      module: 'ai',
      prefilledConfig: { tableName: 'orders', columns: [] },
    });
  });

  it('routes the "profile" module to a \'profile\' tab type (W2)', () => {
    openDestination('profile', 't-customers');

    const tabs = useTabsStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].type).toBe('profile');
    expect(tabs[0].subject).toBe('t-customers');
  });

  it('routes each wired module (W7.5 + S1 ingestion) to its own identically-named tab type', () => {
    // `sql` is deliberately absent: S5 removed the tab type, and the module's
    // destination is the drawer console (asserted below).
    (['pivot', 'charts', 'correlation', 'export', 'ingestion'] as const).forEach((module) => {
      openDestination(module);
    });

    const tabs = useTabsStore.getState().tabs;
    expect(tabs.map((t) => t.type).sort()).toEqual(
      ['charts', 'correlation', 'export', 'ingestion', 'pivot'].sort(),
    );
    // No tab argument supplied — subject falls back to the module name.
    for (const tab of tabs) {
      expect(tab.subject).toBe(tab.type);
    }
  });

  it('runs a SQL-bearing action in the console and opens no tab (S4, D68e "on the answer")', () => {
    openDestination('sql', 'duplicates', { tableName: 'orders', columns: [], sql: 'SELECT * FROM orders' });

    expect(runPath.runInConsole).toHaveBeenCalledWith('SELECT * FROM orders');
    expect(useTabsStore.getState().tabs).toHaveLength(0);
  });

  it('opens the console, and no tab, for a sql action carrying no query to run (S5)', () => {
    openDestination('sql', null, { tableName: 'orders', columns: [] });

    expect(runPath.runInConsole).not.toHaveBeenCalled();
    expect(useDrawerStore.getState()).toMatchObject({ open: true });
    expect(useTabsStore.getState().tabs).toHaveLength(0);
  });

  it('leaves every non-sql module alone, prefilled SQL or not', () => {
    openDestination('charts', 'time-series', { tableName: 'orders', columns: [], sql: 'SELECT * FROM orders' });

    expect(runPath.runInConsole).not.toHaveBeenCalled();
    expect(useTabsStore.getState().tabs[0].type).toBe('charts');
  });
});

describe('isDestinationReady (W7.5, S1)', () => {
  it('is true for every module with a reachable destination — including sql, whose destination is the console rather than a tab (S5)', () => {
    (['profile', 'sql', 'pivot', 'charts', 'correlation', 'export', 'ingestion'] as const).forEach((module) => {
      expect(isDestinationReady(module)).toBe(true);
    });
  });

  it('is false for ai — the always-on right pane, never a tab', () => {
    expect(isDestinationReady('ai' as SidebarModule)).toBe(false);
  });
});
