import * as duckdb from '@duckdb/duckdb-wasm';

// Serve the DuckDB workers and .wasm modules from our own origin. Vite's ?url
// import turns each into a same-origin URL. Same-origin resources satisfy the
// Cross-Origin-Embedder-Policy: require-corp constraint without extra CORP
// headers, which cross-origin CDN downloads would otherwise need.
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import coiWasm from '@duckdb/duckdb-wasm/dist/duckdb-coi.wasm?url';
import coiWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-coi.worker.js?url';
import coiPthreadWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js?url';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
  coi: {
    mainModule: coiWasm,
    mainWorker: coiWorker,
    pthreadWorker: coiPthreadWorker,
  },
};

export interface EnvInfo {
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  measureMemoryApi: boolean;
  userAgent: string;
  features: duckdb.PlatformFeatures | null;
}

export interface BundleInfo {
  selected: 'coi' | 'eh' | 'mvp' | 'unknown';
  mainWorker: string;
  mainModule: string;
  threaded: boolean;
}

export interface InitResult {
  env: EnvInfo;
  bundle: BundleInfo;
  coldMs: number; // selectBundle + worker spawn + wasm fetch/compile/instantiate
}

export interface RunResult {
  fileName: string;
  fileBytes: number;
  rows: number;
  cols: number;
  registerMs: number; // registerFileBuffer
  ingestMs: number; // CREATE TABLE ... read_csv_auto / read_parquet
  countMs: number; // SELECT count(*)
  summarizeMs: number; // SUMMARIZE
  engineMemBytes: number | null; // DuckDB's own reported memory (duckdb_memory())
  jsHeapBeforeBytes: number | null;
  jsHeapAfterBytes: number | null;
}

let db: duckdb.AsyncDuckDB | null = null;

function bundleName(mainWorker: string): BundleInfo['selected'] {
  if (mainWorker.includes('coi')) return 'coi';
  if (mainWorker.includes('eh')) return 'eh';
  if (mainWorker.includes('mvp')) return 'mvp';
  return 'unknown';
}

export function readEnv(features: duckdb.PlatformFeatures | null): EnvInfo {
  return {
    crossOriginIsolated:
      typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    measureMemoryApi:
      typeof (performance as unknown as { measureUserAgentSpecificMemory?: unknown })
        .measureUserAgentSpecificMemory === 'function',
    userAgent: navigator.userAgent,
    features,
  };
}

export async function initDuckDB(): Promise<InitResult> {
  const t0 = performance.now();

  const features = await duckdb.getPlatformFeatures();
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);

  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  const coldMs = performance.now() - t0;

  const selected = bundleName(bundle.mainWorker!);
  return {
    env: readEnv(features),
    bundle: {
      selected,
      mainWorker: bundle.mainWorker!,
      mainModule: bundle.mainModule,
      threaded: selected === 'coi',
    },
    coldMs,
  };
}

function jsHeap(): number | null {
  return performance.memory ? performance.memory.usedJSHeapSize : null;
}

export async function runFile(file: File): Promise<RunResult> {
  if (!db) throw new Error('DuckDB not initialized');

  const isParquet = file.name.toLowerCase().endsWith('.parquet');
  const jsHeapBeforeBytes = jsHeap();

  const buf = new Uint8Array(await file.arrayBuffer());
  const regName = `dropped_${Date.now()}_${file.name}`;

  // Register the raw file bytes as a virtual file DuckDB can read directly.
  const tReg = performance.now();
  await db.registerFileBuffer(regName, buf);
  const registerMs = performance.now() - tReg;

  const conn = await db.connect();
  try {
    const reader = isParquet
      ? `read_parquet('${regName}')`
      : `read_csv_auto('${regName}')`;

    // Materialize into a table so ingest cost (parse + type inference) is timed
    // separately from the aggregate queries that follow.
    const tIngest = performance.now();
    await conn.query(`CREATE OR REPLACE TABLE t AS SELECT * FROM ${reader}`);
    const ingestMs = performance.now() - tIngest;

    const tCount = performance.now();
    const countRes = await conn.query('SELECT count(*)::BIGINT AS n FROM t');
    const countMs = performance.now() - tCount;
    const rows = Number(countRes.toArray()[0].n);

    const tSum = performance.now();
    const sumRes = await conn.query('SUMMARIZE t');
    const summarizeMs = performance.now() - tSum;
    const cols = sumRes.numRows;

    // Ask DuckDB itself how much memory it is holding (its data lives in the
    // worker's WASM heap, not the main-thread JS heap, so this is the truthful
    // signal for data-load memory).
    let engineMemBytes: number | null = null;
    try {
      const memRes = await conn.query(
        'SELECT sum(memory_usage_bytes)::BIGINT AS m FROM duckdb_memory()'
      );
      const m = memRes.toArray()[0]?.m;
      engineMemBytes = m == null ? null : Number(m);
    } catch {
      engineMemBytes = null;
    }

    const jsHeapAfterBytes = jsHeap();

    return {
      fileName: file.name,
      fileBytes: file.size,
      rows,
      cols,
      registerMs,
      ingestMs,
      countMs,
      summarizeMs,
      engineMemBytes,
      jsHeapBeforeBytes,
      jsHeapAfterBytes,
    };
  } finally {
    await conn.close();
  }
}
