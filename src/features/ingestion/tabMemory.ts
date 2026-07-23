// `performance.memory` is a non-standard Chrome/Edge extension (undefined
// elsewhere) — display-only, per §7.2's ingestion telemetry. ADR-001 notes
// the *engine's* own memory instrumentation must use `duckdb_memory()`
// instead; this is unrelated, purely for the tab's JS heap in the panel.
interface ChromeMemory {
  usedJSHeapSize: number;
}

export function tabMemoryMB(): number | null {
  const memory = (performance as Performance & { memory?: ChromeMemory }).memory;
  return memory ? memory.usedJSHeapSize / (1024 * 1024) : null;
}
