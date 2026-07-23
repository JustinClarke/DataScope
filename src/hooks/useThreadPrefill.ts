import { useEffect, useState } from 'react';
import { useUIStore } from '../stores/ui';
import type { ModulePrefill } from '../lib/threadPrefill';

/**
 * Reads a `RankedAction`'s `ThreadConfig.prefilledConfig` (D68e) exactly once
 * on the calling module's mount, then clears it from the store — a module
 * reached again afterward (sidebar click, back navigation) starts empty, same
 * as today. The snapshot is taken via a lazy `useState` initializer so it is
 * available on the very first render, not one tick later; the clear itself
 * runs in a mount-only effect (a store write during render is not safe),
 * mirroring `ChartsModule`'s existing apply-`activeTabId`-once-on-arrival ref.
 */
export function useThreadPrefill(): ModulePrefill {
  const [prefill] = useState<ModulePrefill>(() => useUIStore.getState().pendingPrefill);

  useEffect(() => {
    if (prefill) useUIStore.getState().clearPendingPrefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return prefill;
}
