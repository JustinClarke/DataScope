// Aggregate memory budgeting: a folder/multi-select/ZIP batch is weighed as
// a whole, not per file, before anything is ingested. This is deliberately
// just the 50MB combined-size warn threshold; the fuller per-file tier
// ladder below (sampled preview, refusal, device-memory headroom) is built
// on top of this same pre-scan rather than a second one.
export const AGGREGATE_WARN_THRESHOLD_BYTES = 50 * 1024 * 1024;

export function aggregateBytes(files: readonly File[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

export function exceedsAggregateWarnThreshold(totalBytes: number): boolean {
  return totalBytes > AGGREGATE_WARN_THRESHOLD_BYTES;
}

// Per-file size tiers so an oversized upload degrades instead of crashing
// the tab. `warn`/`sampled` happen to share the same 50MB boundary as the
// aggregate-warn threshold above by coincidence, not by reuse — the
// aggregate threshold gates a *combined-batch* banner, this one gates a
// single file's own ingest behavior, and the two are checked independently
// (a folder can trip the aggregate banner from many small files with no
// single file ever leaving `full`).
export type SizeTier = 'full' | 'warn' | 'sampled' | 'refuse';

export const SIZE_WARN_THRESHOLD_BYTES = 50 * 1024 * 1024;
export const SIZE_SAMPLE_THRESHOLD_BYTES = 100 * 1024 * 1024;
export const SIZE_REFUSE_THRESHOLD_BYTES = 300 * 1024 * 1024;

/** First N rows kept in sampled-preview mode. */
export const SAMPLE_ROW_LIMIT = 100_000;

/**
 * `headroomExceeded` lets a device-memory signal auto-downgrade a file into
 * sampled mode even under the 100MB size threshold — it never escalates
 * past `sampled` (a file that's already `refuse`-tier by size stays
 * `refuse` regardless of headroom, and a file already `sampled` by size
 * doesn't need a second reason).
 */
export function decideSizeTier(bytes: number, headroomExceeded: boolean): SizeTier {
  if (bytes > SIZE_REFUSE_THRESHOLD_BYTES) return 'refuse';
  if (bytes > SIZE_SAMPLE_THRESHOLD_BYTES) return 'sampled';
  if (headroomExceeded) return 'sampled';
  if (bytes > SIZE_WARN_THRESHOLD_BYTES) return 'warn';
  return 'full';
}

/** Refusal copy for the over-the-ceiling tier, `~X MB` filled from the real file size. */
export function refusalMessage(bytes: number): string {
  const mb = Math.round(bytes / (1024 * 1024));
  return (
    `This file is too large for in-browser analysis (~${mb} MB). Consider: (a) DuckDB CLI locally, ` +
    `(b) sampling the first 100K rows here, or (c) hosting the file on httpfs-readable object storage ` +
    `and pointing DataScope at it.`
  );
}
