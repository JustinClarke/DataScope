import { beforeEach, describe, expect, it } from 'vitest';
import { useTabsStore } from '../stores/tabs';
import { openDestination, isDestinationReady } from './navigation';
import type { SidebarModule } from '../stores/ui';

beforeEach(() => {
  useTabsStore.setState({ tabs: [], activeTabId: null });
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

  it('routes each W7.5 module to its own identically-named tab type', () => {
    (['sql', 'pivot', 'charts', 'correlation', 'export'] as const).forEach((module) => {
      openDestination(module);
    });

    const tabs = useTabsStore.getState().tabs;
    expect(tabs.map((t) => t.type).sort()).toEqual(['charts', 'correlation', 'export', 'pivot', 'sql'].sort());
    // No tab argument supplied — subject falls back to the module name.
    for (const tab of tabs) {
      expect(tab.subject).toBe(tab.type);
    }
  });
});

describe('isDestinationReady (W7.5)', () => {
  it('is true for every module with a real Workbench tab type', () => {
    (['profile', 'sql', 'pivot', 'charts', 'correlation', 'export'] as const).forEach((module) => {
      expect(isDestinationReady(module)).toBe(true);
    });
  });

  it('is false for ai and ingestion — neither is a tab', () => {
    (['ai', 'ingestion'] as SidebarModule[]).forEach((module) => {
      expect(isDestinationReady(module)).toBe(false);
    });
  });
});
