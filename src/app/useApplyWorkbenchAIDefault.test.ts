import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useApplyWorkbenchAIDefault } from './useApplyWorkbenchAIDefault';
import { useSettingsStore } from '../stores/settings';

const originalGpuDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'gpu');

function setWebGPU(present: boolean) {
  if (!present) {
    delete (globalThis.navigator as { gpu?: unknown }).gpu;
    return;
  }
  Object.defineProperty(globalThis.navigator, 'gpu', { value: {}, configurable: true });
}

beforeEach(() => {
  useSettingsStore.setState({ aiMode: null });
});

afterEach(() => {
  if (originalGpuDescriptor) {
    Object.defineProperty(globalThis.navigator, 'gpu', originalGpuDescriptor);
  } else {
    delete (globalThis.navigator as { gpu?: unknown }).gpu;
  }
});

describe('useApplyWorkbenchAIDefault (W7, §5.1)', () => {
  it('sets local-model on a fresh session when the device probe is capable', () => {
    setWebGPU(true);
    renderHook(() => useApplyWorkbenchAIDefault());
    expect(useSettingsStore.getState().aiMode).toBe('local-model');
  });

  it('sets local-only on a fresh session when the device probe is not capable', () => {
    setWebGPU(false);
    renderHook(() => useApplyWorkbenchAIDefault());
    expect(useSettingsStore.getState().aiMode).toBe('local-only');
  });

  it('never overwrites an already-set aiMode, including one restored from persisted settings', () => {
    setWebGPU(true);
    useSettingsStore.setState({ aiMode: 'cloud' });
    renderHook(() => useApplyWorkbenchAIDefault());
    expect(useSettingsStore.getState().aiMode).toBe('cloud');
  });

  it('applies at most once per mount, even across rerenders', () => {
    setWebGPU(true);
    const { rerender } = renderHook(() => useApplyWorkbenchAIDefault());
    expect(useSettingsStore.getState().aiMode).toBe('local-model');

    useSettingsStore.setState({ aiMode: 'local-only' });
    rerender();
    expect(useSettingsStore.getState().aiMode).toBe('local-only');
  });
});
