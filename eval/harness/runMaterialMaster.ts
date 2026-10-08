// Runs the material master question set through the product's own six-stage
// pipeline against a local Ollama daemon, and nothing else. Deliberately not
// folded into harness/run.ts: that entrypoint also drives the cloud-edge arm,
// which makes real network calls to the staging worker, and this set exists to
// answer a local-model question.
//
//   OLLAMA_MODEL=qwen3.5:4b npx tsx eval/harness/runMaterialMaster.ts
//
// Writes MATERIAL-MASTER-RESULTS.json next to EVAL-RESULTS.json so a rerun can
// be diffed against this one rather than compared by eye.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine } from '../duckdb/duckdb';
import { loadEvalDatasets } from '../dataset/tables';
import { MATERIAL_MASTER_QUESTIONS } from '../dataset/materialMaster';
import { createOllamaProvider, DEFAULT_OLLAMA_MODEL } from '../../src/services/ollamaProvider';
import { runHarness } from './runHarness';
import { printReport } from './report';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../MATERIAL-MASTER-RESULTS.json');

const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const model = process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;
// Both default the same way the provider does; OLLAMA_THINK=1 turns reasoning
// back on for a run that wants to measure what it costs.
const think = process.env.OLLAMA_THINK === '1';
const temperature = Number(process.env.OLLAMA_TEMPERATURE ?? 0);

const engine = await createEvalEngine();
const datasets = await loadEvalDatasets(engine);

console.log(
  `material master — ${MATERIAL_MASTER_QUESTIONS.length} questions against ${baseUrl}\n` +
    `  model ${model}   think ${think}   temperature ${temperature}\n`,
);

const result = await runHarness(engine, datasets, MATERIAL_MASTER_QUESTIONS, {
  id: `ollama:${model}`,
  create: () => createOllamaProvider({ baseUrl, model, think, temperature }),
});

printReport([result.summary]);

console.log('\nper question:');
const byId = new Map(MATERIAL_MASTER_QUESTIONS.map((q) => [q.id, q]));
for (const s of result.scores) {
  const mark = !s.execOk ? 'ERR ' : s.resultCorrect ? 'PASS' : 'FAIL';
  console.log(`  ${mark}  ${s.questionId}  ${byId.get(s.questionId)?.question ?? ''}`);
  if (s.error) console.log(`         ${s.error.split('\n')[0].slice(0, 140)}`);
}

fs.writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), model, baseUrl, think, temperature, ...result }, null, 2));
console.log(`\nwrote ${OUT}`);
await engine.close();
