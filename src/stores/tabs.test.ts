import { beforeEach, describe, expect, it } from 'vitest';
import { TABS_STORAGE_KEY, useTabsStore } from './tabs';

beforeEach(() => {
  localStorage.clear();
  useTabsStore.setState({ tabs: [], activeTabId: null });
});

describe('tabs store', () => {
  it('defaults to no open tabs', () => {
    const state = useTabsStore.getState();
    expect(state.tabs).toEqual([]);
    expect(state.activeTabId).toBeNull();
  });

  it('openTab appends a tab and activates it', () => {
    const id = useTabsStore.getState().openTab('map', 'orders');
    const state = useTabsStore.getState();
    expect(state.tabs).toEqual([{ id, type: 'map', subject: 'orders', initializer: null }]);
    expect(state.activeTabId).toBe(id);
  });

  it('openTab carries the initializer (D68e ThreadConfig prefill)', () => {
    const initializer = { module: 'sql' as const, prefilledConfig: { tableName: 'orders' } };
    const id = useTabsStore.getState().openTab('map', 'orders', initializer);
    expect(useTabsStore.getState().tabs[0]).toEqual({
      id,
      type: 'map',
      subject: 'orders',
      initializer,
    });
  });

  it('closeTab removes the tab and falls back the active id to the last remaining tab', () => {
    const first = useTabsStore.getState().openTab('map', 'orders');
    const second = useTabsStore.getState().openTab('map', 'customers');
    useTabsStore.getState().closeTab(second);
    let state = useTabsStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual([first]);
    expect(state.activeTabId).toBe(first);

    useTabsStore.getState().closeTab(first);
    state = useTabsStore.getState();
    expect(state.tabs).toEqual([]);
    expect(state.activeTabId).toBeNull();
  });

  it('closeTab leaves the active id untouched when closing a non-active tab', () => {
    const first = useTabsStore.getState().openTab('map', 'orders');
    const second = useTabsStore.getState().openTab('map', 'customers');
    useTabsStore.getState().closeTab(first);
    const state = useTabsStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual([second]);
    expect(state.activeTabId).toBe(second);
  });

  // S5: `'query'` is the first artifact-kind member, so this branch is live.
  it('an artifact tab never dedupes, even on an identical subject', () => {
    const first = useTabsStore.getState().openTab('query', 'Query 1');
    const second = useTabsStore.getState().openTab('query', 'Query 1');

    expect(second).not.toBe(first);
    expect(useTabsStore.getState().tabs).toHaveLength(2);
    expect(useTabsStore.getState().activeTabId).toBe(second);
  });

  describe('singleton dedup (W3, §13.3)', () => {
    it('reuses an open singleton tab instead of duplicating it', () => {
      const first = useTabsStore.getState().openTab('profile', 'orders');
      const second = useTabsStore.getState().openTab('profile', 'orders');
      const state = useTabsStore.getState();
      expect(second).toBe(first);
      expect(state.tabs).toHaveLength(1);
      expect(state.activeTabId).toBe(first);
    });

    it('reuse activates the existing tab without overwriting its initializer', () => {
      const initializer = { module: 'profile' as const, prefilledConfig: { tableName: 'orders' } };
      const id = useTabsStore.getState().openTab('profile', 'orders', initializer);
      useTabsStore.getState().openTab('map', 'customers');
      expect(useTabsStore.getState().activeTabId).toBe(useTabsStore.getState().tabs[1]!.id);

      useTabsStore.getState().openTab('profile', 'orders', null);
      const state = useTabsStore.getState();
      expect(state.tabs).toHaveLength(2);
      expect(state.activeTabId).toBe(id);
      expect(state.tabs.find((t) => t.id === id)!.initializer).toEqual(initializer);
    });

    it('different subjects of the same singleton type never collide', () => {
      const first = useTabsStore.getState().openTab('profile', 'orders');
      const second = useTabsStore.getState().openTab('profile', 'customers');
      expect(second).not.toBe(first);
      expect(useTabsStore.getState().tabs).toHaveLength(2);
    });
  });

  describe('setActiveTab', () => {
    it('switches to an already-open tab', () => {
      const first = useTabsStore.getState().openTab('map', 'orders');
      const second = useTabsStore.getState().openTab('map', 'customers');
      expect(useTabsStore.getState().activeTabId).toBe(second);

      useTabsStore.getState().setActiveTab(first);
      expect(useTabsStore.getState().activeTabId).toBe(first);
    });

    it('no-ops for an id that names no open tab', () => {
      const id = useTabsStore.getState().openTab('map', 'orders');
      useTabsStore.getState().setActiveTab('not-a-real-tab-id');
      expect(useTabsStore.getState().activeTabId).toBe(id);
    });
  });

  describe('envelope invariant (D55 generalization, §13.3)', () => {
    it('never lets an artifactSpec payload with envelope-looking keys reach the envelope', () => {
      // Shaped like a hostile/model-originated producer result: `type` and
      // `initializer` keys sitting where an inner artifact spec belongs.
      const hostileArtifactSpec = {
        type: 'not-a-real-tab-type',
        initializer: { module: 'sql', prefilledConfig: { tableName: 'secret' } },
        id: 'attacker-chosen-id',
        subject: 'attacker-chosen-subject',
      };

      const id = useTabsStore.getState().openTab('map', 'orders', null, hostileArtifactSpec);
      const tab = useTabsStore.getState().tabs.find((t) => t.id === id);

      expect(tab).toBeDefined();
      // The envelope is exactly what the typed parameters said — never a key
      // pulled out of artifactSpec, even though the shapes collide by name.
      expect(tab!.type).toBe('map');
      expect(tab!.subject).toBe('orders');
      expect(tab!.initializer).toBeNull();
      expect(tab!.id).not.toBe('attacker-chosen-id');
      // No path spreads artifactSpec's keys onto the stored tab at all.
      expect(Object.keys(tab!).sort()).toEqual(['id', 'initializer', 'subject', 'type']);
    });
  });

  describe('persistence (07c)', () => {
    it('persists exactly tabs and activeTabId', () => {
      const id = useTabsStore.getState().openTab('map', 'orders');

      const raw = localStorage.getItem(TABS_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.state).toEqual({
        tabs: [{ id, type: 'map', subject: 'orders', initializer: null }],
        activeTabId: id,
      });
    });

    it('a persisted payload from an old schema version rehydrates to a safe, empty default rather than crashing', async () => {
      localStorage.setItem(
        TABS_STORAGE_KEY,
        JSON.stringify({ state: { tabs: 'not-an-array', activeTabId: 42 }, version: 0 }),
      );

      await useTabsStore.persist.rehydrate();

      const state = useTabsStore.getState();
      expect(Array.isArray(state.tabs)).toBe(true);
      expect(state.activeTabId).toBeNull();
    });

    it('a restored tab id is never reused by a freshly opened tab', async () => {
      // A large suffix, guaranteed to exceed whatever this module's `nextTabId`
      // counter reached from earlier tests in this file — the collision this
      // guards against only shows up once the counter passes the restored id.
      const restoredId = 'tab-999999';
      localStorage.setItem(
        TABS_STORAGE_KEY,
        JSON.stringify({
          state: {
            tabs: [{ id: restoredId, type: 'map', subject: 'orders', initializer: null }],
            activeTabId: restoredId,
          },
          version: 1,
        }),
      );

      await useTabsStore.persist.rehydrate();
      const newId = useTabsStore.getState().openTab('map', 'customers');

      expect(newId).not.toBe(restoredId);
      expect(useTabsStore.getState().tabs.map((t) => t.id)).toEqual([restoredId, newId]);
    });
  });
});
