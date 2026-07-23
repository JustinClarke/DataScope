import { beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS_STORAGE_KEY, useSettingsStore } from './settings';

const initial = {
  aiMode: null,
  byokPreference: 'free-tier-first' as const,
  theme: 'system' as const,
  metadataOnlyRepair: true,
};

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState(initial);
});

describe('settings store', () => {
  it('defaults to no AI mode chosen (D2 — no silent default), free-tier-first BYOK routing, and metadata-only repair on', () => {
    const state = useSettingsStore.getState();
    expect(state.aiMode).toBeNull();
    expect(state.byokPreference).toBe('free-tier-first');
    expect(state.theme).toBe('system');
    expect(state.metadataOnlyRepair).toBe(true);
  });

  it('setAIMode/setByokPreference/setTheme/setMetadataOnlyRepair update state', () => {
    useSettingsStore.getState().setAIMode('cloud');
    useSettingsStore.getState().setByokPreference('prefer-key');
    useSettingsStore.getState().setTheme('dark');
    useSettingsStore.getState().setMetadataOnlyRepair(false);

    const state = useSettingsStore.getState();
    expect(state.aiMode).toBe('cloud');
    expect(state.byokPreference).toBe('prefer-key');
    expect(state.theme).toBe('dark');
    expect(state.metadataOnlyRepair).toBe(false);
  });

  it('persists to localStorage under the settings key on every change', () => {
    useSettingsStore.getState().setTheme('dark');

    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.theme).toBe('dark');
  });
});
