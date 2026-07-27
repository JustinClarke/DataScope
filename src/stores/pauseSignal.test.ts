import { beforeEach, describe, expect, it } from 'vitest';
import { usePauseSignalStore } from './pauseSignal';

beforeEach(() => {
  usePauseSignalStore.setState({ lastPaused: null });
});

describe('pause signal store', () => {
  it('defaults to no known pause', () => {
    expect(usePauseSignalStore.getState().lastPaused).toBeNull();
  });

  it('reportPaused records the surface and a timestamp', () => {
    usePauseSignalStore.getState().reportPaused('vault');
    const signal = usePauseSignalStore.getState().lastPaused;
    expect(signal?.surface).toBe('vault');
    expect(signal?.at).toEqual(expect.any(String));
  });

  it('reportPaused overwrites a previous signal', () => {
    usePauseSignalStore.getState().reportPaused('vault');
    usePauseSignalStore.getState().reportPaused('vault');
    expect(usePauseSignalStore.getState().lastPaused?.surface).toBe('vault');
  });

  it('clear resets to null', () => {
    usePauseSignalStore.getState().reportPaused('vault');
    usePauseSignalStore.getState().clear();
    expect(usePauseSignalStore.getState().lastPaused).toBeNull();
  });
});
