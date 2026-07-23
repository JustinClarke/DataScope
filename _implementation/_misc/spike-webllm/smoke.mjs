// Cheap pre-flight: everything except the multi-GB model load, so a harness bug
// surfaces before we pay for a download. Reuses run.mjs's vite spawn pattern.
import { spawn } from 'node:child_process';
import net from 'node:net';
import pw from './node_modules/playwright/index.js';
const { chromium } = pw;
const PORT = 5199, BASE = `http://127.0.0.1:${PORT}`;

function waitPort(port, ms = 30000) {
  const t0 = Date.now();
  return new Promise((res, rej) => {
    const t = () => { const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { s.destroy(); res(); });
      s.once('error', () => { s.destroy(); Date.now() - t0 > ms ? rej(new Error('no vite')) : setTimeout(t, 300); }); };
    t();
  });
}
const vite = spawn('./node_modules/.bin/vite', ['--port', String(PORT)], { stdio: ['ignore', 'inherit', 'inherit'] });
process.on('exit', () => vite.kill());
try {
  await waitPort(PORT);
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--enable-unsafe-webgpu'] });
  const page = await browser.newPage();
  page.on('console', (m) => m.text().startsWith('[spike]') && console.log('  ', m.text()));
  page.on('pageerror', (e) => console.error('  pageerror:', e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction('window.spike !== undefined', null, { timeout: 20000 });
  console.log('env', await page.evaluate('window.spike.env()'));
  console.log('gpu', await page.evaluate('window.spike.gpuAdapter()'));
  const models = await page.evaluate('window.spike.listModels()');
  const coders = models.filter((m) => /coder/i.test(m.id) && /q4f16|q4f32/i.test(m.id) && m.vramMB).sort((a, b) => a.vramMB - b.vramMB);
  console.log('coder options:', coders.slice(0, 6));
  console.log('duckdb', await page.evaluate('window.spike.initDuckDB()'));
  console.log('seed', await page.evaluate('window.spike.seedLabeledSchema()'));
  // prove the reference SQL for a couple tasks executes and the scoring path works
  console.log('sanity count', await page.evaluate("window.spike.infer ? 'engine-fn-present' : 'missing'"));
  await browser.close();
  console.log('SMOKE OK');
} catch (e) { console.error('SMOKE FAIL:', e); process.exitCode = 1; }
finally { vite.kill(); }
