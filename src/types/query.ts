/**
 * The engine-agnostic execution boundary (D49) — profiling, classification,
 * capabilities, and AI are written against this, never against duckdb-wasm
 * directly, so a future engine swap (e.g. the D51 desktop sidecar) only
 * replaces the implementation. D49 defines the boundary as execute / register
 * / summarize; cancellation is first-class control flow, not an error (D58).
 */
export interface QueryEngine {
  execute(sql: string, options?: { signal?: AbortSignal }): Promise<QueryResult>;
  /**
   * A `Uint8Array` registers a fully in-memory buffer; a `File` registers a
   * streaming handle so a large upload never needs a full in-JS-heap copy
   * just to reach the engine.
   */
  registerFile(name: string, data: Uint8Array | File): Promise<void>;
  summarize(tableName: string): Promise<QueryResult>;
  /** Copies a whole table to a downloadable buffer via `COPY ... TO` (§12.2) — entirely in-engine, no network. */
  exportTable(tableName: string, format: 'parquet' | 'csv'): Promise<Uint8Array<ArrayBuffer>>;
}

export interface QueryResult {
  columnNames: string[];
  columnTypes: string[];
  rows: unknown[][];
  rowCount: number;
  executionTimeMs: number;
}
