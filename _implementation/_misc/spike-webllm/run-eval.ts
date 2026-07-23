// D40 harness WebLLM driver (§11.4) — same headed-Chrome pattern as the D43
// spike's run.mjs (headless silently falls back to SwiftShader, useless for
// a real result here too), but running the harness's labeled question set
// end-to-end instead of the spike's 12-item smoke set. Writes
// app/eval/webllm/WEBLLM-EVAL-RESULTS.json, which `npm run eval` (in app/)
// picks up and merges into the combined D40 report.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { summarize, type QuestionScore } from '../app/eval/scorer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_PATH = path.resolve(__dirname, '../app/eval/webllm/WEBLLM-EVAL-RESULTS.json');

function waitPort(port: number, ms = 30000): Promise<void> {
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

const log = (...a: unknown[]) => console.log('·', ...a);

interface WebLlmQuestionScore {
  questionId: string;
  execOk: boolean;
  resultCorrect: boolean | null;
  genSql: string;
  ms: number;
  error?: string;
}

async function main() {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

  const vite = spawn('./node_modules/.bin/vite', ['--port', String(PORT)], {
    cwd: __dirname,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  process.on('exit', () => vite.kill());

  try {
    await waitPort(PORT);
    log('vite up on', BASE);

    const ctx = await chromium.launchPersistentContext(path.resolve(__dirname, '.chrome-profile'), {
      headless: false,
      channel: 'chrome',
      args: ['--enable-unsafe-webgpu'],
    });
    const page = ctx.pages()[0] || (await ctx.newPage());
    page.on('console', (m) => { if (m.text().startsWith('[spike]')) console.log('  ', m.text()); });
    page.on('crash', () => console.error('!! PAGE CRASHED (OOM?)'));

    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction('window.spike !== undefined', null, { timeout: 20000 });

    log('init DuckDB…');
    await page.evaluate('window.spike.initDuckDB()');

    const models = await page.evaluate('window.spike.listModels()') as { id: string; vramMB: number | null }[];
    const coders = models.filter((m) => /coder/i.test(m.id) && /q4f16|q4f32/i.test(m.id) && m.vramMB)
      .sort((a, b) => (a.vramMB ?? 0) - (b.vramMB ?? 0));
    const picked = coders.find((m) => /Coder-1\.5B.*q4f16/i.test(m.id))?.id || coders[0]?.id;
    if (!picked) throw new Error('no suitable coder model found in the WebLLM catalogue');
    log('loading model', picked, '— this pulls model shards from the CDN, watch progress…');
    const loadStats = await page.evaluate((id) => (window as any).spike.loadModel(id), picked) as { loadMs: number };
    log('model loaded in', Math.round(loadStats.loadMs), 'ms');

    log('running the D40 labeled question set…');
    await page.exposeFunction('__evalProgress', (i: number, total: number, id: string) => {
      if (i % 5 === 0 || i === total) log(`  [${i}/${total}] ${id}`);
    });
    const result = await page.evaluate(
      `window.spike.runEval((i, total, id) => window.__evalProgress(i, total, id))`,
    ) as { scores: WebLlmQuestionScore[] };

    const scores: QuestionScore[] = result.scores.map((s) => ({
      questionId: s.questionId,
      provider: 'webllm',
      execOk: s.execOk,
      resultCorrect: s.resultCorrect,
      neededRepair: false,
      repairSucceeded: null,
      attemptCount: 1,
      error: s.error,
    }));
    // No metered API and no token-tracking hook into the WebLLM engine here;
    // report 0 for the cost-proxy column rather than a fabricated estimate —
    // it's zero-egress compute either way (§11.2).
    const summary = summarize('webllm', scores, new Map());

    fs.writeFileSync(OUT_PATH, JSON.stringify({ summary, scores, raw: result.scores, modelId: picked }, null, 2));
    log('wrote', OUT_PATH);

    await ctx.close();
  } finally {
    vite.kill();
  }
}

main().catch((e) => {
  console.error('EVAL DRIVER ERROR:', e);
  process.exit(1);
});
