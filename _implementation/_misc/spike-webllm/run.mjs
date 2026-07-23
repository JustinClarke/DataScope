// D43 WebLLM spike driver. Spawns the Vite dev server, drives a HEADED Chromium
// (headless silently falls back to SwiftShader — useless for real GPU numbers),
// and runs the three kill criteria, writing SPIKE-RESULTS.json.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import pw from './node_modules/playwright/index.js';
const { chromium } = pw;

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
const FIXTURE = `${BASE}/fixtures/large.csv`;

function waitPort(port, ms = 30000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { s.destroy(); resolve(); });
      s.once('error', () => {
        s.destroy();
        if (Date.now() - t0 > ms) reject(new Error('vite did not start'));
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

const log = (...a) => console.log('·', ...a);
const results = { startedAt: new Date().toISOString() };

const vite = spawn('./node_modules/.bin/vite', ['--port', String(PORT)], {
  cwd: process.cwd(), stdio: ['ignore', 'inherit', 'inherit'],
});
process.on('exit', () => vite.kill());

try {
  await waitPort(PORT);
  log('vite up on', BASE);

  // Persistent context: Cache Storage survives across runs, so the 1.6 GB model
  // downloads once and re-runs resume (and warm-load can be measured).
  const ctx = await chromium.launchPersistentContext('./.chrome-profile', {
    headless: false,
    channel: 'chrome', // real Chrome 150 → genuine Metal WebGPU (probe-confirmed); no managed browser needed
    args: ['--enable-unsafe-webgpu'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on('console', (m) => { if (m.text().startsWith('[spike]')) console.log('  ', m.text()); });
  let crashed = false;
  page.on('crash', () => { crashed = true; console.error('!! PAGE CRASHED (OOM?)'); });
  page.on('pageerror', (e) => console.error('  pageerror:', e.message));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction('window.spike !== undefined', null, { timeout: 20000 });

  results.env = await page.evaluate('window.spike.env()');
  log('env', results.env);
  results.gpuAdapter = await page.evaluate('window.spike.gpuAdapter()');
  log('gpu', results.gpuAdapter);

  const models = await page.evaluate('window.spike.listModels()');
  // Prefer a small coder model that fits an 8 GB M1: coder family, smallest VRAM.
  const coders = models
    .filter((m) => /coder/i.test(m.id) && /q4f16|q4f32/i.test(m.id) && m.vramMB)
    .sort((a, b) => a.vramMB - b.vramMB);
  // Prefer the 1.5B coder q4f16: fair SQL-quality representative, ~1.6 GB VRAM —
  // leaves headroom under the ~2 GB tab budget beside DuckDB's ~90 MB. 0.5B is
  // the ultra-safe fallback; a plain smallest-coder pick would undersell (b).
  const picked = coders.find((m) => /Coder-1\.5B.*q4f16/i.test(m.id))?.id
    || coders[0]?.id
    || models.sort((a, b) => (a.vramMB || 1e9) - (b.vramMB || 1e9))[0].id;
  results.modelCatalogue = { coderOptions: coders.slice(0, 6), picked };
  log('picked model:', picked);

  log('init DuckDB…');
  results.duckdb = await page.evaluate('window.spike.initDuckDB()');
  log('duckdb', results.duckdb);

  log(`loading model ${picked} — this pulls model shards from the CDN, watch progress…`);
  results.criterionC = await page.evaluate((id) => window.spike.loadModel(id), picked);
  // trim the verbose timeline before persisting
  const tl = results.criterionC.timeline;
  results.criterionC.timelineSample = tl.filter((_, i) => i % Math.ceil(tl.length / 12 || 1) === 0);
  delete results.criterionC.timeline;
  log('criterion C (download/load):', {
    loadMs: Math.round(results.criterionC.loadMs),
    downloadedMB: +(results.criterionC.downloadedBytes / 1048576).toFixed(1),
    encodedMB: +(results.criterionC.encodedBytes / 1048576).toFixed(1),
    maxFrameGapMs: Math.round(results.criterionC.maxFrameGapMs),
  });

  log('seeding labeled NL→SQL schema…');
  results.seed = await page.evaluate('window.spike.seedLabeledSchema()');

  log('criterion B — running labeled NL→SQL set (execution-scored)…');
  results.criterionB = await page.evaluate('window.spike.criterionB()');
  log('criterion B pass rate:', results.criterionB.passed + '/' + results.criterionB.total);

  log('criterion A — combined DuckDB(big) + inference coexistence…');
  results.criterionA = await page.evaluate((u) => window.spike.criterionA(u), FIXTURE);
  log('criterion A:', {
    bigRows: results.criterionA.aggRows,
    aggMs: Math.round(results.criterionA.aggMs),
    inferOk: results.criterionA.inferOk,
    duckdbHeapMB: results.criterionA.mem.afterInfer.duckdbHeapBytes
      ? +(results.criterionA.mem.afterInfer.duckdbHeapBytes / 1048576).toFixed(1) : null,
    uaMemoryMB: results.criterionA.mem.afterInfer.uaMemoryBytes
      ? +(results.criterionA.mem.afterInfer.uaMemoryBytes / 1048576).toFixed(1) : null,
  });

  results.crashed = crashed;
  results.finishedAt = new Date().toISOString();
  await ctx.close();
} catch (e) {
  results.error = e.message;
  console.error('SPIKE ERROR:', e);
} finally {
  fs.writeFileSync('SPIKE-RESULTS.json', JSON.stringify(results, null, 2));
  log('wrote SPIKE-RESULTS.json');
  vite.kill();
  process.exit(results.error ? 1 : 0);
}
