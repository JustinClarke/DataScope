// Native DuckDB under Node, for the A0 conformance suite — dev/CI only, never
// product runtime (§11.4).
//
// The second implementation of the executor interface, and the reason A0 ships
// a conformance suite at all: DuckDB-Wasm and native DuckDB can diverge on
// extension availability, some functions and memory behaviour, so an operation
// validated in Node could behave differently in the tab. The fix is a test,
// not a decision.
//
// Cell values are normalized to the same convention `lib/arrow.ts` produces
// for the wasm side — `bigint` narrowed to a number (or a decimal string when
// it will not fit), temporal values as epoch milliseconds — so a conformance
// failure means the *engines* disagreed, not the two adapters.
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import type { Executor } from '../../src/lib/analyst/types';
import type { ClosableExecutor } from './wasmExecutor';

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

function normalizeCell(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value <= MAX_SAFE && value >= MIN_SAFE ? Number(value) : value.toString();
  }
  if (value instanceof Date) return value.getTime();
  return value;
}

async function execute(conn: DuckDBConnection, sql: string, signal?: AbortSignal) {
  const started = performance.now();
  // `interrupt()` is native DuckDB's own cancellation — the counterpart of
  // `cancelSent()` on the wasm connection, so the one cancellation path the
  // core owns reaches the engine on both sides rather than just dropping a
  // promise on the floor.
  const onAbort = () => conn.interrupt();
  if (signal) {
    if (signal.aborted) throw new DOMException('Operation cancelled', 'AbortError');
    signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const result = await conn.run(sql);
    return {
      columnNames: result.columnNames(),
      rows: (await result.getRowsJS()).map((row) => row.map(normalizeCell)),
      elapsedMs: performance.now() - started,
    };
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function createNativeConformanceExecutor(): Promise<ClosableExecutor> {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  const executor: Executor = {
    engine: 'duckdb-native',
    execute: (sql, signal) => execute(conn, sql, signal),
  };
  return {
    engine: executor.engine,
    execute: executor.execute,
    async close() {
      conn.closeSync();
    },
  };
}
