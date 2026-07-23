import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from './ui';

beforeEach(() => {
  useUIStore.setState({ activeModule: 'ingestion', activeTabId: null, pendingPrefill: null });
});

describe('ui store', () => {
  it('defaults to the ingestion module with no open tab', () => {
    const state = useUIStore.getState();
    expect(state.activeModule).toBe('ingestion');
    expect(state.activeTabId).toBeNull();
  });

  it('setActiveModule switches the sidebar module', () => {
    useUIStore.getState().setActiveModule('sql');
    expect(useUIStore.getState().activeModule).toBe('sql');
  });

  it('setActiveTabId tracks and clears the open tab independently of the module', () => {
    useUIStore.getState().setActiveModule('sql');
    useUIStore.getState().setActiveTabId('chart-1');

    let state = useUIStore.getState();
    expect(state.activeModule).toBe('sql');
    expect(state.activeTabId).toBe('chart-1');

    useUIStore.getState().setActiveTabId(null);
    state = useUIStore.getState();
    expect(state.activeModule).toBe('sql');
    expect(state.activeTabId).toBeNull();
  });

  it('setActiveModule carries a ThreadConfig prefill (D68e) atomically with the module switch', () => {
    useUIStore.getState().setActiveModule('charts', 'time-series', { tableName: 'orders', columns: ['a', 'b'] });
    const state = useUIStore.getState();
    expect(state.activeModule).toBe('charts');
    expect(state.activeTabId).toBe('time-series');
    expect(state.pendingPrefill).toEqual({ tableName: 'orders', columns: ['a', 'b'] });
  });

  it('a plain module switch (no third argument) always starts with no prefill', () => {
    useUIStore.getState().setActiveModule('sql', null, { tableName: 'orders', columns: [] });
    useUIStore.getState().setActiveModule('charts');
    expect(useUIStore.getState().pendingPrefill).toBeNull();
  });

  it('clearPendingPrefill removes it without touching the active module/tab', () => {
    useUIStore.getState().setActiveModule('sql', null, { tableName: 'orders', columns: [] });
    useUIStore.getState().clearPendingPrefill();
    const state = useUIStore.getState();
    expect(state.pendingPrefill).toBeNull();
    expect(state.activeModule).toBe('sql');
  });
});
