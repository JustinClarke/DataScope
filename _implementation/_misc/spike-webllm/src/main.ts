import {
  CreateMLCEngine,
  prebuiltAppConfig,
  type MLCEngineInterface,
} from '@mlc-ai/web-llm';
import { initDuckDB, ingestCsvUrl, query, duckdbMemoryBytes } from './duckdb';
import { runEval } from './evalRunner';

// ---------------------------------------------------------------------------
// Small logging helper mirrored to the DOM + console so the Playwright driver
// (and a human watching the headed window) can both follow along.
// ---------------------------------------------------------------------------
const logEl = document.getElementById('log')!;
function log(msg: string) {
  const line = `${new Date().toISOString().slice(11, 23)}  ${msg}`;
  logEl.textContent += '\n' + line;
  console.log('[spike]', msg);
}

// ---------------------------------------------------------------------------
// Cross-heap memory snapshot — the truthful signal for kill-criterion (a).
// JS heap alone misses DuckDB's WASM heap and WebLLM's GPU buffers, so we take
// every number the platform will give us and label each honestly.
// ---------------------------------------------------------------------------
async function memSnapshot(label: string) {
  const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  let uaBytes: number | null = null;
  const measure = (
    performance as unknown as {
      measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
    }
  ).measureUserAgentSpecificMemory;
  if (typeof measure === 'function') {
    try {
      uaBytes = (await measure.call(performance)).bytes;
    } catch {
      uaBytes = null;
    }
  }
  return {
    label,
    jsHeapBytes: perfMem ? perfMem.usedJSHeapSize : null,
    // measureUserAgentSpecificMemory captures JS + WASM (+ workers), NOT GPU.
    uaMemoryBytes: uaBytes,
    duckdbHeapBytes: await duckdbMemoryBytes(),
  };
}

// ---------------------------------------------------------------------------
// Model catalogue — enumerate the prebuilt list so the driver can pick a
// coder model that fits the 8 GB M1 rather than us hard-coding a stale id.
// ---------------------------------------------------------------------------
function listModels() {
  return prebuiltAppConfig.model_list.map((m) => ({
    id: m.model_id,
    vramMB: m.vram_required_MB ?? null,
    lowResource: m.low_resource_required ?? null,
    type: m.model_type,
  }));
}

// ---------------------------------------------------------------------------
// WebLLM engine load with a real progress timeline (kill-criterion c).
// ---------------------------------------------------------------------------
let engine: MLCEngineInterface | null = null;
const progressTimeline: { t: number; progress: number; text: string }[] = [];

async function loadModel(modelId: string) {
  progressTimeline.length = 0;
  const t0 = performance.now();
  // Main-thread frame-stall monitor: if the load blocks the main thread badly,
  // criterion (c) "without blocking" needs the Worker engine (webllm.worker.ts).
  let maxFrameGapMs = 0;
  let last = performance.now();
  let raf = 0;
  const tick = () => {
    const now = performance.now();
    maxFrameGapMs = Math.max(maxFrameGapMs, now - last);
    last = now;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  // Resumable retry: a 1.6 GB multi-shard CDN pull can hit a transient
  // "Failed to fetch" mid-stream. Completed shards persist in Cache Storage, so
  // re-invoking CreateMLCEngine skips them and continues from the failed one.
  let attempts = 0;
  let lastErr: unknown;
  const progressCb = (r: { progress: number; text: string }) => {
    progressTimeline.push({ t: performance.now() - t0, progress: r.progress, text: r.text });
    (window as unknown as { __dl: unknown }).__dl = { progress: r.progress, text: r.text };
    log(`load ${(r.progress * 100).toFixed(1)}%  ${r.text.slice(0, 80)}`);
  };
  // High ceiling because this CDN link drops the connection every ~3 shards;
  // each retry resumes instantly from the persistent Cache (cached shards ~1s),
  // so a generous ceiling is cheap and converges over the 30 shards.
  while (attempts < 30) {
    attempts++;
    try {
      engine = await CreateMLCEngine(modelId, { initProgressCallback: progressCb });
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
      log(`load attempt ${attempts} failed: ${(e as Error).message.slice(0, 60)} — retrying from cache`);
      await new Promise((res) => setTimeout(res, Math.min(2500, 600 * attempts)));
    }
  }
  cancelAnimationFrame(raf);
  if (lastErr) throw lastErr;
  const loadMs = performance.now() - t0;

  // Real bytes pulled from the model CDN this load (Timing-Allow-Origin permitting).
  const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const cdn = res.filter((e) => /huggingface|mlc\.ai|raw\.githack|cdn/.test(e.name));
  const downloadedBytes = cdn.reduce((s, e) => s + (e.transferSize || 0), 0);
  const encodedBytes = cdn.reduce((s, e) => s + (e.encodedBodySize || 0), 0);

  return {
    modelId,
    loadMs,
    reportCount: progressTimeline.length,
    firstReportMs: progressTimeline[0]?.t ?? null,
    maxFrameGapMs,
    downloadedBytes,
    encodedBytes,
    cdnResourceCount: cdn.length,
    timeline: progressTimeline.slice(),
  };
}

async function infer(prompt: string, maxTokens = 256) {
  if (!engine) throw new Error('engine not loaded');
  const t0 = performance.now();
  const out = await engine.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: maxTokens,
  });
  return { text: out.choices[0]?.message?.content ?? '', ms: performance.now() - t0 };
}

// ---------------------------------------------------------------------------
// Criterion (b): labeled NL->SQL set, EXECUTION-scored against DuckDB.
// A known seeded schema; each task's canonical answer is computed by executing
// a reference SQL, and the model's generated SQL is scored by result-set match
// (order-insensitive, numerically rounded) — a number, not a vibe.
// ---------------------------------------------------------------------------
const SCHEMA_DDL = `CREATE TABLE sales (
  id INTEGER,
  region VARCHAR,       -- one of: North, South, East, West
  product VARCHAR,
  category VARCHAR,     -- one of: Electronics, Home, Toys
  amount DOUBLE,        -- order revenue in USD
  quantity INTEGER,
  order_date DATE
);`;

const TASKS: { q: string; ref: string }[] = [
  { q: 'How many total orders are there?', ref: 'SELECT count(*) AS n FROM sales' },
  { q: 'What is the total sales amount across all orders?', ref: 'SELECT round(sum(amount),2) AS s FROM sales' },
  { q: 'List the distinct regions.', ref: 'SELECT DISTINCT region FROM sales' },
  { q: 'What is the total sales amount for each region?', ref: 'SELECT region, round(sum(amount),2) AS s FROM sales GROUP BY region' },
  { q: 'Which product has the highest total sales amount? Return only the product name.', ref: 'SELECT product FROM sales GROUP BY product ORDER BY sum(amount) DESC LIMIT 1' },
  { q: "How many orders were placed in the West region?", ref: "SELECT count(*) AS n FROM sales WHERE region = 'West'" },
  { q: 'What is the average order amount for the Electronics category?', ref: "SELECT round(avg(amount),2) AS a FROM sales WHERE category = 'Electronics'" },
  { q: 'How many orders had a quantity greater than 5?', ref: 'SELECT count(*) AS n FROM sales WHERE quantity > 5' },
  { q: 'What is the total quantity sold per category?', ref: 'SELECT category, sum(quantity) AS q FROM sales GROUP BY category' },
  { q: 'What were the total sales in the year 2023?', ref: "SELECT round(sum(amount),2) AS s FROM sales WHERE extract(year FROM order_date) = 2023" },
  { q: 'List the top 3 products by total quantity sold.', ref: 'SELECT product FROM sales GROUP BY product ORDER BY sum(quantity) DESC LIMIT 3' },
  { q: 'What is the total sales amount for orders placed after 2023-06-01?', ref: "SELECT round(sum(amount),2) AS s FROM sales WHERE order_date > DATE '2023-06-01'" },
];

async function seedLabeledSchema() {
  // Deterministic ~240-row table so reference answers are stable across runs.
  await query('DROP TABLE IF EXISTS sales');
  await query(SCHEMA_DDL);
  await query(`INSERT INTO sales
    SELECT
      i::INTEGER AS id,
      ['North','South','East','West'][((i % 4) + 1)::INTEGER] AS region,
      'P' || ((i % 12) + 1)::INTEGER AS product,
      ['Electronics','Home','Toys'][((i % 3) + 1)::INTEGER] AS category,
      round(((i * 37) % 500) + 10 + ((i % 7) * 1.5), 2)::DOUBLE AS amount,
      ((i % 9) + 1)::INTEGER AS quantity,
      DATE '2023-01-01' + (((i * 5) % 540))::INTEGER AS order_date
    FROM range(1, 241) t(i)`);
  return { rows: Number((await query('SELECT count(*) n FROM sales'))[0].n) };
}

function extractSql(text: string): string {
  const fence = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  let sql = (fence ? fence[1] : text).trim();
  // take the first statement only
  sql = sql.split(';')[0].trim();
  return sql;
}

function normalize(rows: Record<string, unknown>[]): string {
  const round = (v: unknown) =>
    typeof v === 'number' || typeof v === 'bigint' ? Number(Number(v).toFixed(2)) : v;
  const norm = rows.map((r) => Object.values(r).map(round));
  norm.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(norm);
}

async function criterionB() {
  const results: {
    q: string;
    genSql: string;
    ok: boolean;
    error?: string;
    ms: number;
  }[] = [];
  for (const task of TASKS) {
    const prompt = `You are a DuckDB SQL expert. Given this schema:

${SCHEMA_DDL}

Write a single DuckDB SQL query that answers the question. Return ONLY the SQL, no explanation.

Question: ${task.q}`;
    const { text, ms } = await infer(prompt, 200);
    const genSql = extractSql(text);
    let ok = false;
    let error: string | undefined;
    try {
      const expected = normalize(await query(task.ref));
      const got = normalize(await query(genSql));
      ok = expected === got;
      if (!ok) error = `mismatch: expected ${expected.slice(0, 80)} got ${got.slice(0, 80)}`;
    } catch (e) {
      error = 'exec: ' + (e as Error).message.slice(0, 120);
    }
    results.push({ q: task.q, genSql, ok, error, ms });
    log(`B ${ok ? 'PASS' : 'FAIL'} (${ms.toFixed(0)}ms)  ${task.q.slice(0, 50)}`);
  }
  const passed = results.filter((r) => r.ok).length;
  return { total: results.length, passed, passRate: passed / results.length, results };
}

// ---------------------------------------------------------------------------
// Criterion (a): combined workload — large dataset in DuckDB AND a real
// inference from the loaded model, in one tab, measuring memory around it and
// surviving without an OOM crash.
// ---------------------------------------------------------------------------
async function criterionA(fixtureUrl: string) {
  const before = await memSnapshot('before-ingest');
  const ingest = await ingestCsvUrl(fixtureUrl, 'big');
  const afterIngest = await memSnapshot('after-ingest');
  // A real full-scan aggregate over the big table WHILE the model weights are
  // resident (column-name-agnostic — the fixture's columns aren't assumed).
  const t0 = performance.now();
  const agg = await query('SELECT count(*) n FROM big');
  const aggMs = performance.now() - t0;
  // A real inference with the big dataset still loaded.
  const inf = await infer('In one short sentence, what is a median?', 64);
  const afterInfer = await memSnapshot('after-infer-with-big-loaded');
  return {
    ingest,
    aggMs,
    aggRows: Number(agg[0].n),
    inferMs: inf.ms,
    inferOk: inf.text.length > 0,
    mem: { before, afterIngest, afterInfer },
  };
}

// Expose the whole API for the Playwright driver.
(window as unknown as { spike: unknown }).spike = {
  env: () => ({
    crossOriginIsolated: (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated ?? false,
    hasWebGPU: 'gpu' in navigator,
    hasMeasureMemory:
      typeof (performance as unknown as { measureUserAgentSpecificMemory?: unknown })
        .measureUserAgentSpecificMemory === 'function',
    ua: navigator.userAgent,
  }),
  gpuAdapter: async () => {
    const a = await (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter();
    const adapter = a as { info?: unknown; limits?: { maxBufferSize?: number } } | null;
    return adapter ? { info: adapter.info, maxBufferMB: Math.round((adapter.limits?.maxBufferSize || 0) / 1048576) } : null;
  },
  listModels,
  initDuckDB,
  seedLabeledSchema,
  memSnapshot,
  loadModel,
  infer,
  criterionA,
  criterionB,
  runEval: (onProgress?: (i: number, total: number, questionId: string) => void) => runEval(engine!, onProgress),
};
log('window.spike ready');
