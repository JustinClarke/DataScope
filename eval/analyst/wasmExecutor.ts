// DuckDB-Wasm under Node, for the A0 conformance suite — dev/CI only, never
// product runtime (§11.4).
//
// This is the *same wasm binary* the tab loads, driven through the *same*
// `createWasmExecutor` and the *same* `lib/arrow.ts` normalizer the app uses.
// That is deliberate: the suite's job is to catch DuckDB-Wasm/native
// divergence, and it can only do that if the two sides differ in the engine
// and nothing else. Converting Arrow here with a second normalizer (as
// `eval/duckdb/duckdb.ts` does for the older harness) would make the suite
// report normalizer bugs as engine divergence.
import {
  createDuckDB,
  ConsoleLogger,
  LogLevel,
  NODE_RUNTIME,
} from '@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs';
import type { DuckDBBundles } from '@duckdb/duckdb-wasm';
import path from 'node:path';
import { tableToQueryResult } from '../../src/lib/arrow';
import { createWasmExecutor } from '../../src/lib/analyst/executors/duckdbWasm';
import type { Executor } from '../../src/lib/analyst/types';

const require = (await import('node:module')).createRequire(import.meta.url);
const DIST = path.dirname(require.resolve('@duckdb/duckdb-wasm'));

const BUNDLES: DuckDBBundles = {
  mvp: {
    mainModule: path.resolve(DIST, 'duckdb-mvp.wasm'),
    mainWorker: path.resolve(DIST, 'duckdb-node-mvp.worker.cjs'),
  },
  eh: {
    mainModule: path.resolve(DIST, 'duckdb-eh.wasm'),
    mainWorker: path.resolve(DIST, 'duckdb-node-eh.worker.cjs'),
  },
};

export interface ClosableExecutor extends Executor {
  close(): Promise<void>;
}

export async function createWasmConformanceExecutor(): Promise<ClosableExecutor> {
  const bindings = await createDuckDB(BUNDLES, new ConsoleLogger(LogLevel.WARNING), NODE_RUNTIME);
  await bindings.instantiate(BUNDLES.eh!.mainModule);
  const conn = bindings.connect();

  const executor = createWasmExecutor(async (sql) => {
    const started = performance.now();
    return tableToQueryResult(conn.query(sql), performance.now() - started);
  });

  return {
    engine: executor.engine,
    execute: executor.execute,
    async close() {
      conn.close();
      bindings.dispose?.();
    },
  };
}
