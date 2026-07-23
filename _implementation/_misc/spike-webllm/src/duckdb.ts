import * as duckdb from '@duckdb/duckdb-wasm';

// Same-origin bundling of DuckDB's workers/wasm (Vite ?url), so they satisfy
// COEP without CORP headers. Reused verbatim from the ingestion spike.
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
  coi: { mainModule: coiWasm, mainWorker: coiWorker, pthreadWorker: coiPthreadWorker },
};

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

export async function initDuckDB() {
  const t0 = performance.now();
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  conn = await db.connect();
  const selected = bundle.mainWorker!.includes('coi')
    ? 'coi'
    : bundle.mainWorker!.includes('eh')
      ? 'eh'
      : 'mvp';
  return { coldMs: performance.now() - t0, bundle: selected, threaded: selected === 'coi' };
}

/** Fetch a served fixture and register+materialize it into DuckDB. Returns load stats. */
export async function ingestCsvUrl(url: string, table = 't') {
  if (!db || !conn) throw new Error('DuckDB not initialized');
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const reg = `reg_${Date.now()}`;
  const tReg = performance.now();
  await db.registerFileBuffer(reg, buf);
  const registerMs = performance.now() - tReg;
  const tIngest = performance.now();
  await conn.query(`CREATE OR REPLACE TABLE ${table} AS SELECT * FROM read_csv_auto('${reg}')`);
  const ingestMs = performance.now() - tIngest;
  const rows = Number((await conn.query(`SELECT count(*)::BIGINT n FROM ${table}`)).toArray()[0].n);
  const cols = (await conn.query(`SUMMARIZE ${table}`)).numRows;
  return { url, bytes: buf.byteLength, rows, cols, registerMs, ingestMs };
}

export async function query(sql: string): Promise<Record<string, unknown>[]> {
  if (!conn) throw new Error('DuckDB not initialized');
  return (await conn.query(sql)).toArray().map((r) => r.toJSON() as Record<string, unknown>);
}

/** DuckDB's own reported memory (its data lives in the worker WASM heap). */
export async function duckdbMemoryBytes(): Promise<number | null> {
  if (!conn) return null;
  try {
    const r = await conn.query('SELECT sum(memory_usage_bytes)::BIGINT m FROM duckdb_memory()');
    const m = r.toArray()[0]?.m;
    return m == null ? null : Number(m);
  } catch {
    return null;
  }
}
