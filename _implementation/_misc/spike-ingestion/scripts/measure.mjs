// Drive the harness in a real (headless Chromium) browser and capture the
// numbers the spike cares about: cross-origin isolation state, which DuckDB
// bundle was selected, cold/warm init time, and per-file query timings.
//
// Env vars:
//   BASE_URL  dev server URL           (default http://localhost:5188)
//   SMALL     path to small CSV        (optional)
//   LARGE     path to large CSV        (optional)
//   WARM      "1" to test a warm reload (default off)
//   OUT       write JSON result here   (optional)

import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5188';
const SMALL = process.env.SMALL || '';
const LARGE = process.env.LARGE || '';
const WARM = process.env.WARM === '1';
const OUT = process.env.OUT || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(page, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await page.evaluate(() => window.__SPIKE__?.ready === true);
    if (ready) return;
    await sleep(200);
  }
  throw new Error('timed out waiting for __SPIKE__.ready');
}

async function runOneFile(page, path) {
  const before = await page.evaluate(() => window.__SPIKE__.runs.length);
  await page.setInputFiles('input[type=file]', path);
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const n = await page.evaluate(() => window.__SPIKE__.runs.length);
    if (n > before) break;
    await sleep(200);
  }
  const runs = await page.evaluate(() => window.__SPIKE__.runs);
  return runs[runs.length - 1];
}

const result = { baseUrl: BASE_URL, console: [], pageErrors: [] };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

page.on('console', (m) => result.console.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => result.pageErrors.push(String(e)));

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await waitReady(page);

  const first = await page.evaluate(() => ({
    init: window.__SPIKE__.init,
    initError: window.__SPIKE__.initError,
  }));
  result.coldInit = first.init;
  result.initError = first.initError;

  if (first.init) {
    if (SMALL && fs.existsSync(SMALL)) result.small = await runOneFile(page, SMALL);
    if (LARGE && fs.existsSync(LARGE)) result.large = await runOneFile(page, LARGE);

    if (WARM) {
      // Reload in the same context: the multi-MB .wasm should now come from
      // the HTTP cache, so a second cold init measures warm-cache behavior.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitReady(page);
      const warm = await page.evaluate(() => window.__SPIKE__.init);
      result.warmInit = warm;
    }
  }
} catch (e) {
  result.driverError = String(e?.stack || e);
} finally {
  await browser.close();
}

const json = JSON.stringify(result, null, 2);
if (OUT) fs.writeFileSync(OUT, json);
console.log(json);
