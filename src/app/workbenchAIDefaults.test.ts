import { describe, expect, it } from 'vitest';
import { isCapableDevice, recommendedWorkbenchAIMode } from './workbenchAIDefaults';
import { useSettingsStore } from '../stores/settings';

describe('isCapableDevice (W6)', () => {
  it('returns true when the injected WebGPU check reports present', () => {
    expect(isCapableDevice(() => true)).toBe(true);
  });

  it('returns false when the injected WebGPU check reports absent', () => {
    expect(isCapableDevice(() => false)).toBe(false);
  });
});

describe('recommendedWorkbenchAIMode (W6)', () => {
  it('recommends local-model (WebLLM) for a capable device', () => {
    expect(recommendedWorkbenchAIMode(true)).toBe('local-model');
  });

  it('recommends local-only (off) for a non-capable device', () => {
    expect(recommendedWorkbenchAIMode(false)).toBe('local-only');
  });

  it('has no side effects on the shared settings store', () => {
    const before = useSettingsStore.getState();
    isCapableDevice(() => true);
    recommendedWorkbenchAIMode(true);
    recommendedWorkbenchAIMode(false);
    expect(useSettingsStore.getState()).toBe(before);
  });
});
