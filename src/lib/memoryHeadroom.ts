// Pre-ingestion headroom estimate — "will loading this file push the tab
// close to its memory ceiling," checked *before* any bytes are read. This is
// a different concern from tabMemory.ts's post-load display value: that one
// just surfaces the JS heap number in the telemetry panel; this one predicts
// a not-yet-loaded file's footprint and compares it to a budget so
// `decideSizeTier` can auto-downgrade ahead of time.
//
// `performance.memory.usedJSHeapSize` is Chrome-only and, per a live
// measurement against the real engine, doesn't see DuckDB's worker-side WASM
// memory at all (that lives outside the main thread's JS heap), and Chrome
// quantizes it against fingerprinting regardless. It's still used here as a
// coarse "how much of the JS heap ceiling is already spoken for" baseline,
// not as a claim that it tracks DuckDB's actual data memory — that
// distinction belongs to tabMemory.ts and the engine's own memory
// instrumentation, unrelated to this pre-load estimate.
interface ChromeMemoryInfo {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface MemorySignals {
  usedJSHeapSize: number | null;
  jsHeapSizeLimit: number | null;
  deviceMemoryGB: number | null;
}

export function readMemorySignals(): MemorySignals {
  const memory = (performance as Performance & { memory?: ChromeMemoryInfo })
    .memory;
  const deviceMemoryGB =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  return {
    usedJSHeapSize: memory?.usedJSHeapSize ?? null,
    jsHeapSizeLimit: memory?.jsHeapSizeLimit ?? null,
    deviceMemoryGB,
  };
}

export const AUTO_DOWNGRADE_HEADROOM_RATIO = 0.7;

// Measured against the real engine: a 50.7MB CSV materialized to ~87MB of
// DuckDB engine memory — roughly 1.7x on-disk size. Used only to *predict* a
// footprint ahead of loading; not a substitute for the real post-load figure
// the engine's own memory instrumentation reports.
export const ESTIMATED_MEMORY_MULTIPLIER = 1.7;

export function estimatedFootprintBytes(fileBytes: number): number {
  return fileBytes * ESTIMATED_MEMORY_MULTIPLIER;
}

const TAB_MEMORY_CEILING_BYTES = 2 * 1024 * 1024 * 1024; // browser tab memory ceiling
const DEVICE_MEMORY_REFERENCE_GB = 8; // navigator.deviceMemory's own reported ceiling

/**
 * Best-effort memory budget for this tab: `jsHeapSizeLimit` when Chrome
 * exposes it, else the ~2GB tab ceiling scaled down by `deviceMemory`
 * against its own 8GB reported ceiling (an 8GB-reporting device gets the
 * full ~2GB tab budget; a 4GB device gets half), else unknown.
 */
function budgetBytes(signals: MemorySignals): number | null {
  if (signals.jsHeapSizeLimit != null) return signals.jsHeapSizeLimit;
  if (signals.deviceMemoryGB != null) {
    return Math.min(
      TAB_MEMORY_CEILING_BYTES,
      (signals.deviceMemoryGB / DEVICE_MEMORY_REFERENCE_GB) *
        TAB_MEMORY_CEILING_BYTES,
    );
  }
  return null;
}

/**
 * Pure decision function (the "simulated" low-headroom acceptance
 * criterion): given a predicted footprint and injected memory signals,
 * would loading this file cross the 70% budget line? No signal available
 * (Safari, Firefox — neither API exists) never forces a downgrade on a
 * guess; it returns `false`, the same as "can't tell."
 */
export function headroomExceeded(
  predictedBytes: number,
  signals: MemorySignals,
): boolean {
  const budget = budgetBytes(signals);
  if (budget == null) return false;
  const used = signals.usedJSHeapSize ?? 0;
  return (used + predictedBytes) / budget > AUTO_DOWNGRADE_HEADROOM_RATIO;
}

/** Convenience wrapper reading live browser signals — thin, untested. */
export function estimateHeadroomExceeded(fileBytes: number): boolean {
  return headroomExceeded(
    estimatedFootprintBytes(fileBytes),
    readMemorySignals(),
  );
}
