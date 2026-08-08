// Manifest logging (DESIGN.md §4: "every prompt, emitted SQL, raw result,
// error, arm, model, machine, token counts, and peak memory logged per
// call"). runner.ts's runOneCall stays pure/single-purpose (one cell in,
// one result out, no I/O) — this module is the thin, separately-testable
// layer that adds the fields runOneCall has no way to know about itself
// (which dataset, which machine, this process's peak RSS around the call)
// and appends the result as one JSONL line, so a sweep can be killed and
// resumed without losing completed rows.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runOneCall, type RunOneCallParams, type RunOneCallResult } from './runner';

export interface ManifestRow extends RunOneCallResult {
  dataset: string;
  machine: string;
  peakRssBytes: number;
  timestamp: string;
}

export function appendManifestRow(path: string, row: ManifestRow): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`, 'utf8');
}

const RSS_SAMPLE_INTERVAL_MS = 50;

/**
 * Runs one cell via `runOneCall`, samples this process's RSS at a fixed
 * interval while the call is in flight to catch the peak (not just before/
 * after), and appends the combined row to the manifest at `path`. `dataset`
 * and `machine` are caller-supplied labels (e.g. "ecommerce", "M4") — this
 * function has no way to infer either from `params` alone.
 */
export async function runAndLog(
  path: string,
  dataset: string,
  machine: string,
  params: RunOneCallParams,
): Promise<ManifestRow> {
  let peakRssBytes = process.memoryUsage().rss;
  const sampler = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  }, RSS_SAMPLE_INTERVAL_MS);
  try {
    const result = await runOneCall(params);
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    const row: ManifestRow = { ...result, dataset, machine, peakRssBytes, timestamp: new Date().toISOString() };
    appendManifestRow(path, row);
    return row;
  } finally {
    clearInterval(sampler);
  }
}
