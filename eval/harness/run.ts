// D40 eval harness CLI (§11.4) — dev/CI only, never product runtime.
// Usage: `npm run eval` (local-template + mock-cloud; both run in plain Node,
// no browser). WebLLM runs separately via a headed Chrome + WebGPU driver, per
// the D43 spike, and its results file is merged in here if present.
//
// **The Ollama arm is A4's measurement gate** (`04-tool-loop.md`): the pinned
// `qwen2.5-coder:1.5b` is the model the small-model ladder exists for, so
// "no regression on the 1.5b path" has to be a number, not a claim. It runs
// against a real local daemon and is therefore opt-in — set `OLLAMA_BASE_URL`
// (and optionally `OLLAMA_MODEL`) with the daemon up and the model pulled.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine } from '../duckdb/duckdb';
import { loadEvalDatasets } from '../dataset/tables';
import { QUESTIONS } from '../dataset/questions';
import { createLocalTemplateProvider } from '../providers/localTemplate';
import { createMockCloudProvider } from '../providers/mockCloud';
import { createCloudEdgeProvider } from '../providers/cloudEdge';
import { createOllamaProvider, DEFAULT_OLLAMA_MODEL } from '../../src/services/ollamaProvider';
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

  // A4's gate on the small-model ladder. `createOllamaProvider` is the product's
  // own provider — the same probe, the same rungs — so this measures what ships,
  // not a harness-only approximation of it (D58).
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL;
  if (ollamaBaseUrl !== undefined) {
    const model = process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;
    console.log(`\nrunning the Ollama arm against ${ollamaBaseUrl} (${model})…`);
    results.push(
      await runHarness(engine, datasets, QUESTIONS, {
        id: `ollama:${model}`,
        create: () => createOllamaProvider({ baseUrl: ollamaBaseUrl, model }),
      }),
    );
  } else {
    console.log('\n(no OLLAMA_BASE_URL set — skipping the qwen2.5-coder:1.5b arm, A4’s ladder gate)');
  }

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
