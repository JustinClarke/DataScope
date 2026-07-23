import * as duckdb from '@duckdb/duckdb-wasm';
import { Table as ArrowTable } from 'apache-arrow';
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import type { QueryEngine, QueryResult } from '../types';
import { useDatasetsStore } from '../stores/datasets';
import { tableToQueryResult } from '../lib/arrow';

// Bundle all DuckDB assets same-origin (Vite's `?url` emits each as a hashed
// file on our own origin). Same-origin resources satisfy
// `Cross-Origin-Embedder-Policy: require-corp` without extra CORP headers, so
// the worker loads as an ordinary `Worker`, not a `blob:` worker, and
// `worker-src` needs only `'self'`.
//
// `coi` (the threaded bundle) is deliberately absent: live-verified
// (01-file-drop) that DuckDB's CDN-hosted loadable extensions — `parquet`,
// `json` — fail to link under it with a WASM shared-memory mismatch
// ("declared = 0, imported = 1"), while CSV (compiled into core, no
// extension) works fine. The same extensions load and run correctly under
// `eh`. Until that upstream incompatibility is resolved or extensions are
// self-hosted at a matching build, `eh` is the ceiling — see ADR-001.
const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
};

interface EngineInstance {
  db: duckdb.AsyncDuckDB;
  worker: Worker;
}

// A module-level singleton *promise*, not just a variable: React StrictMode's
// dev double-invoke and two near-simultaneous first queries must share one
// worker instead of racing two into existence.
let instancePromise: Promise<EngineInstance> | null = null;

async function createInstance(): Promise<EngineInstance> {
  const store = useDatasetsStore.getState();
  store.setWorkerStatus('loading');

  // selectBundle auto-degrades to the single-threaded `eh` bundle when the page
  // is not cross-origin isolated (no COOP/COEP → no SharedArrayBuffer). That is
  // an expected, fully-functional fallback, not an error state.
  const bundle = await duckdb.selectBundle(BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);

  // A crash *after* init (OOM abort, externally killed worker) fires here. Mark
  // a recoverable error and drop the dead singleton so the next use rebuilds a
  // fresh worker instead of awaiting a response that will never come.
  worker.addEventListener('error', (event) => {
    reportFatalCrash(event.message || 'DuckDB worker crashed');
  });

  store.setWorkerStatus('compiling');
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  store.setWorkerStatus('ready');
  return { db, worker };
}

function getInstance(): Promise<EngineInstance> {
  if (!instancePromise) {
    instancePromise = createInstance().catch((error) => {
      // A failed init must not be sticky — clear the singleton so a later
      // attempt (e.g. a retry after a transient asset-load failure) re-inits.
      instancePromise = null;
      useDatasetsStore.getState().setWorkerStatus('error', toErrorMessage(error));
      throw error;
    });
  }
  return instancePromise;
}

function reportFatalCrash(message: string): void {
  useDatasetsStore.getState().setWorkerStatus('error', message);
  void resetEngine();
}

/** Warm up (or await) engine init explicitly; init also happens lazily on first use. */
export async function initEngine(): Promise<void> {
  await getInstance();
}

/** Tear down the current engine so the next use rebuilds a clean one (crash recovery). */
export async function resetEngine(): Promise<void> {
  const pending = instancePromise;
  instancePromise = null;
  if (!pending) return;
  try {
    const { db, worker } = await pending;
    await db.terminate().catch(() => {});
    worker.terminate();
  } catch {
    // The instance never came up — nothing to tear down.
  }
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Query cancelled', 'AbortError');
}

async function execute(
  sql: string,
  options?: { signal?: AbortSignal },
): Promise<QueryResult> {
  const signal = options?.signal;
  if (signal?.aborted) throw abortReason(signal);

  const { db } = await getInstance();
  const conn = await db.connect();
  const start = performance.now();
  let onAbort: (() => void) | undefined;

  try {
    const reader = await conn.send(sql);

    if (signal) {
      // cancelSent() interrupts the in-flight query on this connection; the
      // pending readAll() then rejects, which the catch normalizes to an abort.
      onAbort = () => void conn.cancelSent();
      if (signal.aborted) {
        onAbort();
        throw abortReason(signal);
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const batches = await reader.readAll();
    // Rebuild the table from the reader's schema + batches so column metadata
    // survives even a zero-row result.
    const table = new ArrowTable(reader.schema, batches);
    return tableToQueryResult(table, performance.now() - start);
  } catch (error) {
    // A cancel surfaces as DuckDB's interrupt error — normalize it so callers
    // can tell a user cancellation apart from a genuine query failure.
    if (signal?.aborted) throw abortReason(signal);
    throw error;
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    await conn.close();
  }
}

async function registerFile(name: string, data: Uint8Array | File): Promise<void> {
  const { db } = await getInstance();
  if (data instanceof File) {
    // Streaming handle (the duckdb-wasm package's own documented pattern):
    // DuckDB reads the File via FileReader chunks internally as queries need
    // it, rather than us materializing the whole thing into a Uint8Array
    // first — the point of this path for large files.
    await db.registerFileHandle(name, data, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
  } else {
    await db.registerFileBuffer(name, data);
  }
}

async function summarize(tableName: string): Promise<QueryResult> {
  return execute(`SUMMARIZE ${quoteIdentifier(tableName)}`);
}

/** The DuckDB-Wasm implementation of the engine-agnostic execution boundary. */
export const duckDBEngine: QueryEngine = { execute, registerFile, summarize };

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown engine error';
}

export function isAbortError(error: unknown): boolean {
  // A default AbortSignal reason is a DOMException, which is not an Error
  // subclass in the browser — match both by name.
  return (
    (error instanceof DOMException || error instanceof Error) &&
    error.name === 'AbortError'
  );
}
