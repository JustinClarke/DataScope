// R-C — variance floor (11-gemini-comparison-arm.md, Phase 5 riders).
// "Nobody knows the run-to-run variance at the pinned temperature, so nobody
// knows what effect size N=20 can actually detect." Runs the four ladder
// rungs (a1=0/10/100/max) at N=100 on both in-scope fixtures — 800 calls.
//
// Run directly on the 7B tier (not Gemini, unlike every other rider so far):
// the doc's own caveat is that "a smaller model is usually more variable, so
// k derived here is a floor, not an estimate" when measured on the frontier
// model. Running it on 7B gives the real k for the tier that actually ships,
// not a borrowed lower bound.
//
// 800 serial Ollama calls is realistically hours, on a rig with a documented
// crash history (10-grounding-ladder.md's own log, and the thermal reason 11
// switched this arm from 14B to 7B in the first place). run.ts's main() only
// writes RESULTS.json once, at the end — fine for a run that completes, fatal
// for one that doesn't. This script instead checkpoints at the single-call
// granularity: every completed record is appended to
// VARIANCE-FLOOR-ollama.jsonl immediately, and re-running the script skips
// any (dataset, cellId, repeat) triple already on disk instead of redoing it.
// Never writes into RESULTS-*.json, per the Phase 5 rule every rider follows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine, type EvalEngine } from '../../duckdb/duckdb';
import { loadEvalDatasets } from '../../dataset/tables';
import { computeStats } from '../08-computed-facts/computeStats';
import { verifyStats } from '../08-computed-facts/verifyStats';
import { rankNextActions } from '../../../src/lib/capabilities';
import { OLLAMA_MODEL } from './ollamaRig';
import {
  computeTableInsights,
  buildOfferCandidates,
  loadAllRows,
  loadPanelKey,
  runCell,
  type DatasetContext,
  type RunRecord,
} from './run';
import { IN_SCOPE_FIXTURES, type RowsSent, type VariantCell } from './variants';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, 'VARIANCE-FLOOR-ollama.jsonl');

const RUNGS: RowsSent[] = [0, 10, 100, 'max'];
// Overridable for a cheap smoke test before committing to the full 800-call
// run (same purpose as run.ts's EVAL_REPEAT_CAP), e.g.
// EVAL_DATASET=titanic VARIANCE_FLOOR_REPEATS=2 tsx riderVarianceFloor.ts
const N = process.env.VARIANCE_FLOOR_REPEATS ? Number(process.env.VARIANCE_FLOOR_REPEATS) : 100;
const FIXTURES = process.env.EVAL_DATASET ? IN_SCOPE_FIXTURES.filter((f) => f === process.env.EVAL_DATASET) : IN_SCOPE_FIXTURES;

if ((process.env.EVAL_PROVIDER ?? 'ollama') !== 'ollama') {
  throw new Error('R-C is the 7B-tier trial — Ollama only. Unset EVAL_PROVIDER or set it to "ollama".');
}
if (OLLAMA_MODEL !== 'qwen2.5-coder:7b') {
  throw new Error(
    `R-C runs on the 7B tier (11-gemini-comparison-arm.md's hardware-driven amendment, not the 14B this rig ` +
      `defaults to) — got OLLAMA_MODEL="${OLLAMA_MODEL}". Set OLLAMA_MODEL=qwen2.5-coder:7b (pull it first: ` +
      '`ollama pull qwen2.5-coder:7b`).',
  );
}

function cellsFor(): VariantCell[] {
  return RUNGS.map((a1) => ({ id: `variance-floor-${a1}`, block: 'row-ladder', a1, a2: 'CLEAR', a3: 'TRUE', repeats: N }));
}

function loadDone(): Set<string> {
  if (!fs.existsSync(OUT_PATH)) return new Set();
  const lines = fs.readFileSync(OUT_PATH, 'utf-8').split('\n').filter(Boolean);
  const done = new Set<string>();
  for (const line of lines) {
    const r = JSON.parse(line) as RunRecord;
    done.add(`${r.dataset}::${r.cellId}::${r.repeat}`);
  }
  return done;
}

function appendRecord(record: RunRecord): void {
  fs.appendFileSync(OUT_PATH, `${JSON.stringify(record)}\n`);
}

async function buildContext(engine: EvalEngine, allDatasets: Awaited<ReturnType<typeof loadEvalDatasets>>, datasetId: string): Promise<DatasetContext> {
  const dataset = allDatasets.find((d) => d.id === datasetId);
  if (!dataset) throw new Error(`fixture not found: ${datasetId}`);
  if (dataset.tables.length !== 1) throw new Error(`${datasetId}: expected a single table`);
  const [table] = dataset.tables;

  const computedStats = await computeStats(engine, dataset.tables);
  await verifyStats(engine, dataset.tables, computedStats); // kill criterion (a)

  const tableInsights = await computeTableInsights(engine, dataset.tables);
  const offerCandidates = buildOfferCandidates(rankNextActions(dataset.tables, tableInsights));
  const allRows = await loadAllRows(engine, table);
  const vocabulary = [table.tableName, ...(table.columns ?? []).map((c) => c.name)];

  const panelKey = loadPanelKey();
  const panelKeyEntry = panelKey[datasetId];
  if (!panelKeyEntry) throw new Error(`PANEL-KEY.json has no entry for ${datasetId}`);

  return { datasetId, table, tables: dataset.tables, computedStats, panelKeyEntry, offerCandidates, allRows, vocabulary };
}

async function main(): Promise<void> {
  const done = loadDone();
  const total = RUNGS.length * N * FIXTURES.length;
  console.log(`R-C variance floor: ${total} calls target (${RUNGS.length} rungs x N=${N} x ${FIXTURES.length} fixtures), ${done.size} already on disk from a prior run.`);
  if (done.size >= total) {
    console.log('Nothing left to run.');
    return;
  }

  const engine = await createEvalEngine();
  const allDatasets = await loadEvalDatasets(engine);

  for (const datasetId of FIXTURES) {
    const ctx = await buildContext(engine, allDatasets, datasetId);

    for (const cell of cellsFor()) {
      let skipped = 0;
      for (let repeat = 1; repeat <= N; repeat++) {
        const key = `${datasetId}::${cell.id}::${repeat}`;
        if (done.has(key)) {
          skipped += 1;
          continue;
        }
        // Single-repeat calls, not one repeats:N call — this is what makes a
        // mid-run crash resumable at the call granularity rather than the
        // cell granularity. Prompts within one cell are byte-identical here
        // (a1 fixed, a2=CLEAR, a3=TRUE — no per-repeat corruption/renaming),
        // so PROMPTS-ollama.jsonl's repeat:1 label on each of these calls
        // loses no information a replay would need.
        const [record] = await runCell(ctx, { ...cell, repeats: 1 });
        record.repeat = repeat;
        appendRecord(record);
        done.add(key);
        console.log(`  [${datasetId}/${cell.id}] ${repeat}/${N} (${done.size}/${total} total)`);
      }
      if (skipped) console.log(`  [${datasetId}/${cell.id}] skipped ${skipped} already-recorded repeats`);
    }
  }

  await engine.close();
  console.log(`\nR-C: ${done.size}/${total} records in ${OUT_PATH}`);
  if (done.size < total) console.log('Incomplete — re-run this script to resume.');
}

main().catch((err) => {
  console.error(err);
  console.error('State is checkpointed in VARIANCE-FLOOR-ollama.jsonl — re-run this script to resume from the last completed call.');
  process.exitCode = 1;
});
