// D40 eval harness CLI (§11.4) — dev/CI only, never product runtime.
// Usage: `npm run eval` (local-template + mock-cloud; both run in plain Node,
// no browser). WebLLM runs separately via `eval/webllm/run.mjs` (needs a
// real headed Chrome + WebGPU, per the D43 spike's own driver) and its
// results file is merged in here if present.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine } from '../duckdb/duckdb';
import { loadEvalDatasets } from '../dataset/tables';
import { QUESTIONS } from '../dataset/questions';
import { createLocalTemplateProvider } from '../providers/localTemplate';
import { createMockCloudProvider } from '../providers/mockCloud';
import { createCloudEdgeProvider } from '../providers/cloudEdge';
import { runHarness, type HarnessResult } from './runHarness';
import { printReport } from './report';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBLLM_RESULTS_PATH = path.resolve(__dirname, '../webllm/WEBLLM-EVAL-RESULTS.json');

async function main() {
  const engine = await createEvalEngine();
  const datasets = await loadEvalDatasets(engine);

  const results: HarnessResult[] = [];
  results.push(await runHarness(engine, datasets, QUESTIONS, { id: 'local-template', create: createLocalTemplateProvider }));
  results.push(await runHarness(engine, datasets, QUESTIONS, { id: 'mock-cloud', create: (q) => createMockCloudProvider(q.referenceSql) }));
  const endpoint = process.env.VITE_EDGE_AI_ROUTER ?? 'https://datascope-edge-staging.justinclarke.workers.dev/ai-router';
  results.push(await runHarness(engine, datasets, QUESTIONS, { id: 'cloud-edge', create: () => createCloudEdgeProvider(endpoint) }));

  if (fs.existsSync(WEBLLM_RESULTS_PATH)) {
    const webllm = JSON.parse(fs.readFileSync(WEBLLM_RESULTS_PATH, 'utf-8')) as HarnessResult;
    results.push(webllm);
  } else {
    console.log(`\n(no WebLLM results at ${WEBLLM_RESULTS_PATH} — run eval/webllm/run.mjs separately to include it)`);
  }

  printReport(results.map((r) => r.summary));

  const outPath = path.resolve(__dirname, '../EVAL-RESULTS.json');
  fs.writeFileSync(outPath, JSON.stringify({ ranAt: new Date().toISOString(), questionCount: QUESTIONS.length, results }, null, 2));
  console.log(`\nwrote ${outPath}`);

  await engine.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
