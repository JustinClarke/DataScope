// DESIGN.md §4 model bake-off: qwen3:4b vs qwen3.5:4b vs qwen2.5-coder:1.5b —
// picks which becomes "the" 8GB-viable 4B-class primary model for the full
// ablation run (all main + diagnostic arms). Not itself the full ablation:
// runs only the ladder's floor (A0) and ceiling (A4) arms, since the
// decision this script exists to make is "which candidate benefits most
// from the complete mechanism," not each rung's marginal contribution —
// that's the full run's job, on the winner only.
//
// Scope, decided here (DESIGN.md doesn't pre-register a bake-off protocol
// of its own, only the candidate list and the viability budget):
// - All 6 datasets' single-check explicit-wording questions (38 of 43 — the
//   5 multi-check questions [W1,S1,S4,C1,E1] would need a still-unbuilt
//   per-check result-extraction step: matchesGold compares one executed
//   result to one GoldCheck, and a compound "row count + date range"
//   question needs its one result addressed by two different checks, which
//   nothing in score.ts does yet). All 5 excluded questions are non-trap
//   profiling/compound-lookup questions (trap: ["-"]) — excluding them costs
//   no grain-trap signal, which is what this decision actually turns on.
// - N=2 per DESIGN.md §4's determinism-probe rule, confirmed 100%
//   identical-output for all three candidates, qwen3.5:4b included
//   (BUILD_NOTES.md).
// - num_ctx pinned to one explicit shared value for all three candidates —
//   deliberately the *same* value rather than a per-model one, since
//   varying context budget between bake-off candidates would confound the
//   comparison. 8192 was chosen after measuring every dataset's real A4
//   prompt (largest: ecommerce, ~1444 tokens): comfortable margin for
//   completion tokens and one repair round, and far below qwen3.5:4b's 256K
//   native default (DESIGN.md §4's exact "unpinned KV cache" warning). Must
//   be exported by the caller (`CHAT_NUM_CTX=8192`), not set here — ollama.ts
//   reads it once at module import, before this file's own top-level code
//   runs, so setting it internally would be silently too late.
// - correctViewName passed null uniformly: viewUsage is a diagnostic, not
//   part of the decision rule, and the real per-question "which view is
//   correct" map is real authoring work reserved for the full run.
//
// Decision rule, pre-registered here before the run: winner = highest A4
// correct-rate among candidates. A0 reported alongside as floor/context, not
// part of the decision.
//
// Run: CHAT_NUM_CTX=8192 npx tsx eval/chat/20-grain-rescue/bakeoff.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TABLE_SOURCES, bootstrapAllDatasets } from './bootstrap';
import { runAndLog, type ManifestRow } from './manifest';
import { buildAllRollupViews, buildTableRegistry, describeGrain, inferEdges } from './profiler';
import { buildDatasetFacts } from './datasetFacts';
import type { Arm, ArmContext } from './runner';
import type { GoldCheck } from './score';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(HERE, 'runs', 'bakeoff', 'bakeoff.duckdb');
const MANIFEST_PATH = join(HERE, 'runs', 'bakeoff', 'manifest.jsonl');
const ERRORS_PATH = join(HERE, 'runs', 'bakeoff', 'errors.jsonl');
const QUESTIONS_PATH = join(HERE, 'fixtures', 'questions.json');

/** A single cell has real time cost against a live local model, so a transient failure (an occasional Ollama response missing token counts — hit live during the first run, not a hypothetical) gets one retry before the cell is logged to ERRORS_PATH and skipped, rather than aborting the whole multi-hour sweep. */
const MAX_ATTEMPTS_PER_CELL = 2;

export const CANDIDATES = ['qwen3:4b', 'qwen3.5:4b', 'qwen2.5-coder:1.5b'];
export const ARMS: Arm[] = ['A0', 'A4'];
export const N_REPEATS = 2;
export const REQUIRED_NUM_CTX = 8192;

const DATASET_TABLES: Record<string, string[]> = {
  titanic: ['titanic'],
  weather: ['weather'],
  stock_prices: ['stock_prices'],
  product_reviews: ['product_reviews'],
  ecommerce: ['customers', 'products', 'orders', 'order_items'],
  chasm: ['products', 'order_items', 'product_reviews'],
};

interface QuestionCheck {
  label: string;
  grading: 'scalar' | 'rows';
  scalar?: number | string;
  rows?: Array<Array<number | string>>;
}
interface QuestionRow {
  id: string;
  dataset: string;
  category: string;
  trap: string[];
  text: string;
  wording: string;
  checks: QuestionCheck[];
}

function toGoldCheck(check: QuestionCheck): GoldCheck {
  return check.grading === 'scalar' ? { kind: 'scalar', scalar: check.scalar } : { kind: 'rows', rows: check.rows };
}

async function main(): Promise<void> {
  if (Number(process.env.CHAT_NUM_CTX) !== REQUIRED_NUM_CTX) {
    throw new Error(`bakeoff.ts must be invoked with CHAT_NUM_CTX=${REQUIRED_NUM_CTX} (got ${process.env.CHAT_NUM_CTX ?? '(unset)'}) — see this file's header comment.`);
  }
  if (process.env.CHAT_THINK === '1') {
    throw new Error('bakeoff.ts requires CHAT_THINK off (unset or "0"), matching exp17/DESIGN.md §4 precedent.');
  }

  mkdirSync(dirname(DB_PATH), { recursive: true });
  if (existsSync(DB_PATH)) rmSync(DB_PATH);

  // Resumable (manifest.ts's own design intent — "a sweep can be killed and
  // resumed without losing completed rows"): count already-logged reps per
  // {model, arm, questionId} and only run the remainder. Live-needed, not
  // speculative — the first run of this sweep crashed 92 cells in on a
  // transient Ollama response and this is the recovery path for that run.
  const completedCounts = new Map<string, number>();
  if (existsSync(MANIFEST_PATH)) {
    const priorRows: ManifestRow[] = readFileSync(MANIFEST_PATH, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as ManifestRow);
    for (const row of priorRows) {
      const key = `${row.model}|${row.arm}|${row.questionId}`;
      completedCounts.set(key, (completedCounts.get(key) ?? 0) + 1);
    }
    console.log(`resuming: ${priorRows.length} cells already logged in ${MANIFEST_PATH}`);
  }

  const bootstrapped = await bootstrapAllDatasets(DB_PATH);
  const conn = bootstrapped.conn;
  const tables = await buildTableRegistry(conn, ALL_TABLE_SOURCES.map((s) => s.tableName));
  const facts = await buildDatasetFacts(conn, tables);
  const edges = await inferEdges(conn, tables);
  const views = await buildAllRollupViews(conn, edges, tables);
  for (const v of views) await conn.run(v.sql);
  const grainByTable = new Map<string, string>();
  for (const t of tables) grainByTable.set(t.tableName, await describeGrain(conn, t, edges));

  const allQuestions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8')) as QuestionRow[];
  const questions = allQuestions.filter((q) => q.wording === 'explicit' && q.checks.length === 1);

  const total = CANDIDATES.length * ARMS.length * questions.length * N_REPEATS;
  console.log(
    `bake-off: ${CANDIDATES.length} models x ${ARMS.length} arms x ${questions.length} questions x N=${N_REPEATS} = ${total} cells, num_ctx=${REQUIRED_NUM_CTX}`,
  );

  let done = 0;
  let skipped = 0;
  let failed = 0;
  const started = Date.now();
  for (const model of CANDIDATES) {
    for (const arm of ARMS) {
      for (const q of questions) {
        const dTableNames = DATASET_TABLES[q.dataset];
        if (!dTableNames) throw new Error(`unknown dataset "${q.dataset}" in questions.json`);
        const dTables = tables.filter((t) => dTableNames.includes(t.tableName));
        const dViews = views.filter((v) => dTableNames.includes(v.viewName.split('_rollup_by_')[0]!));
        const ctx: ArmContext = { tables: dTables, facts, grainByTable, views: dViews };
        const allViewNames = dViews.map((v) => v.viewName);
        const gold = toGoldCheck(q.checks[0]!);

        const key = `${model}|${arm}|${q.id}`;
        const alreadyDone = completedCounts.get(key) ?? 0;
        done += alreadyDone;

        for (let rep = alreadyDone; rep < N_REPEATS; rep++) {
          let lastError: unknown = null;
          let succeeded = false;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_CELL && !succeeded; attempt++) {
            try {
              const result = await runAndLog(MANIFEST_PATH, q.dataset, 'bakeoff', {
                arm,
                model,
                question: q.text,
                questionId: q.id,
                ctx,
                conn,
                gold,
                allViewNames,
                correctViewName: null,
                numCtx: REQUIRED_NUM_CTX,
              });
              done++;
              succeeded = true;
              const outcome = result.bucket ?? (result.promptOverflow ? 'OVERFLOW' : 'null');
              const elapsedS = ((Date.now() - started) / 1000).toFixed(0);
              console.log(`[${done}/${total} +${elapsedS}s] ${model} ${arm} ${q.id} rep${rep} -> ${outcome}`);
            } catch (error) {
              lastError = error;
              console.warn(`[retry ${attempt}/${MAX_ATTEMPTS_PER_CELL}] ${model} ${arm} ${q.id} rep${rep} -> ${error instanceof Error ? error.message : String(error)}`);
            }
          }
          if (!succeeded) {
            failed++;
            appendFileSync(
              ERRORS_PATH,
              `${JSON.stringify({
                model,
                arm,
                questionId: q.id,
                rep,
                error: lastError instanceof Error ? lastError.message : String(lastError),
                timestamp: new Date().toISOString(),
              })}\n`,
              'utf8',
            );
          }
        }
        if (alreadyDone > 0) skipped += alreadyDone;
      }
    }
  }

  bootstrapped.close();
  console.log(`bake-off run complete: ${done} cells logged (${skipped} resumed from prior run, ${failed} failed after ${MAX_ATTEMPTS_PER_CELL} attempts each), manifest at ${MANIFEST_PATH}`);
  if (failed > 0) console.log(`failed-cell details: ${ERRORS_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
