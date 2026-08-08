// Bootstrap and runtime connections to the persisted DuckDB file, kept
// deliberately separate per the experiment doc: the bootstrap connection is
// read-write and closes before any model call; the runtime connection reopens
// the finished file `access_mode=READ_ONLY` and applies the sealed authority
// profile, refusing to start if any lockdown statement fails.
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { applyAuthority, type AuthorityReport } from '../../../src/lib/analyst/authority';
import type { Executor } from '../../../src/lib/analyst/types';

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

function normalizeCell(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value <= MAX_SAFE && value >= MIN_SAFE ? Number(value) : value.toString();
  }
  if (value instanceof Date) return value.getTime();
  return value;
}

async function run(conn: DuckDBConnection, sql: string, signal?: AbortSignal) {
  const started = performance.now();
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

export interface BootstrapConnection {
  conn: DuckDBConnection;
  exec(sql: string): Promise<void>;
  close(): void;
}

/** Read-write connection to `dbPath`, used only during bootstrap. Creates the file if absent. */
export async function openBootstrapConnection(dbPath: string): Promise<BootstrapConnection> {
  const instance = await DuckDBInstance.create(dbPath);
  const conn = await instance.connect();
  return {
    conn,
    async exec(sql: string): Promise<void> {
      await conn.run(sql);
    },
    close(): void {
      conn.closeSync();
    },
  };
}

export interface SealedRuntime {
  execute(sql: string, signal?: AbortSignal): Promise<{ columnNames: string[]; rows: unknown[][]; elapsedMs: number }>;
  authority: AuthorityReport;
  close(): void;
}

/**
 * Opens the finished database `access_mode=READ_ONLY` and applies the `sealed`
 * profile (`src/lib/analyst/authority.ts`, master §11.5) — the same lockdown
 * the product's own eval harness measures against, reused rather than
 * reimplemented. Throws if any lockdown statement is refused, so a silently
 * weaker sandbox never serves a model call.
 */
export async function openSealedRuntime(dbPath: string): Promise<SealedRuntime> {
  const instance = await DuckDBInstance.create(dbPath, { access_mode: 'READ_ONLY' });
  const conn = await instance.connect();
  const executor: Executor = {
    engine: 'duckdb-native',
    execute: (sql, signal) => run(conn, sql, signal),
  };
  const authority = await applyAuthority(executor, 'sealed');
  if (authority.refused.length > 0) {
    conn.closeSync();
    throw new Error(
      `sealed authority profile was refused, runtime will not start: ${authority.refused
        .map((r) => `${r.statement} -> ${r.message}`)
        .join('; ')}`,
    );
  }
  return {
    execute: executor.execute,
    authority,
    close(): void {
      conn.closeSync();
    },
  };
}
