// The DuckDB-Wasm side of the engine seam (A0).
//
// A factory over an `execute` function rather than a direct import of
// `workers/duckdb.worker`, for one reason: that module carries Vite `?url`
// asset imports and cannot be loaded outside the bundler. Taking the function
// keeps `lib/analyst` importable from Node, which is what lets the conformance
// suite run the *same* executor code against the same wasm binary it runs in
// the tab. `services/analyst.ts` supplies the browser's engine.
import type { QueryResult } from '../../../types';
import type { Executor } from '../types';

export type WasmExecute = (sql: string, options?: { signal?: AbortSignal }) => Promise<QueryResult>;

export function createWasmExecutor(execute: WasmExecute): Executor {
  return {
    engine: 'duckdb-wasm',
    async execute(sql, signal) {
      const result = await execute(sql, signal ? { signal } : undefined);
      // `lib/arrow.ts` has already applied the cross-engine cell convention
      // (bigint narrowed, decimals scaled, dates as epoch milliseconds).
      return { columnNames: result.columnNames, rows: result.rows, elapsedMs: result.executionTimeMs };
    },
  };
}
