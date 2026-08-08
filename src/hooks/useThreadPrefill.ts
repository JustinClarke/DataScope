import { useEffect, useState } from "react";
import { useUIStore } from "../stores/ui";
import type { ModulePrefill } from "../lib/threadPrefill";

/**
 * Reads a `RankedAction`'s `ThreadConfig.prefilledConfig` (D68e) exactly once
 * on the calling module's mount, then clears it from the store — a module
 * reached again afterward (sidebar click, back navigation) starts empty, same
 * as today. The snapshot is taken via a lazy `useState` initializer so it is
 * available on the very first render, not one tick later; the clear itself
 * runs in a mount-only effect (a store write during render is not safe),
 * mirroring `ChartsModule`'s existing apply-`activeTabId`-once-on-arrival ref.
 *
 * `override` (W7.5) is the Workbench's per-tab equivalent: a tab's own
 * `TabSpec.initializer.prefilledConfig`, threaded down from `WorkbenchShell`'s
 * `TabContent` the same way W3 threads `initialTableId` into `ProfileDashboard`
 * — never a second global. When `override` is anything other than `undefined`
 * (including `null`, meaning "this tab genuinely has no prefill"), it wins
 * outright and the old shell's global `pendingPrefill` is never read or
 * cleared. Every call site that omits the argument keeps today's behavior
 * byte-for-byte.
 */
export function useThreadPrefill(override?: ModulePrefill): ModulePrefill {
  const [prefill] = useState<ModulePrefill>(() =>
    override !== undefined ? override : useUIStore.getState().pendingPrefill,
  );

  useEffect(() => {
    if (override !== undefined) return;
    if (prefill) useUIStore.getState().clearPendingPrefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return prefill;
}
