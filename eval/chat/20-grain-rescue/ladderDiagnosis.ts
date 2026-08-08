// Roadmap item 1 (README.md "Next steps", post-bake-off): the bake-off
// (bakeoff.ts) only ran the ladder's floor (A0) and ceiling (A4) and found
// A4 did not clearly beat A0 for qwen3:4b. This script runs the full ladder
// — all 5 main arms A0-A4, plus the 2 diagnostic arms A2′/A1x — on qwen3:4b
// alone, to find out whether that's a real regression or concentrated in one
// rung (A2's view-selection, A3's worked examples, or A4's plan-first
// schema), before spending the full multi-model run's time budget on it.
//
// Reuses bakeoff.ts's exact machinery: same bootstrap/profiler/view-build
// sequence, same questions.json filter (explicit, single-check), same
// num_ctx=8192 pin, same resumable-manifest pattern. Diverges only in scope:
// one model, 7 arms instead of 2, and the 2 diagnostic arms are restricted
// to ecommerce/ only per DESIGN.md §3's own scope note ("do not run on the
// other datasets" — order_items/orders is the only fanout the diagnostics
// were designed against).
//
// Run: CHAT_NUM_CTX=8192 npx tsx eval/chat/20-grain-rescue/ladderDiagnosis.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TABLE_SOURCES, bootstrapAllDatasets } from './bootstrap';
import { runAndLog, type ManifestRow } from './manifest';
import { buildAllRollupViews, buildTableRegistry, describeGrain, describeGrainCorrupted, inferEdges } from './profiler';
import { buildDatasetFacts } from './datasetFacts';
import type { Arm, ArmContext } from './runner';
import type { GoldCheck } from './score';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(HERE, 'runs', 'ladder-diagnosis', 'ladder-diagnosis.duckdb');
const MANIFEST_PATH = join(HERE, 'runs', 'ladder-diagnosis', 'manifest.jsonl');
const ERRORS_PATH = join(HERE, 'runs', 'ladder-diagnosis', 'errors.jsonl');
const QUESTIONS_PATH = join(HERE, 'fixtures', 'questions.json');

const MAX_ATTEMPTS_PER_CELL = 2;

export const MODEL = 'qwen3:4b';
export const MAIN_ARMS: Arm[] = ['A0', 'A1', 'A2', 'A3', 'A4'];
export const DIAGNOSTIC_ARMS: Arm[] = ['A2prime', 'A1x'];
export const DIAGNOSTIC_ONLY_DATASET = 'ecommerce';
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
    throw new Error(`ladderDiagnosis.ts must be invoked with CHAT_NUM_CTX=${REQUIRED_NUM_CTX} (got ${process.env.CHAT_NUM_CTX ?? '(unset)'}) — see this file's header comment.`);
  }
  if (process.env.CHAT_THINK === '1') {
    throw new Error('ladderDiagnosis.ts requires CHAT_THINK off (unset or "0"), matching bakeoff.ts/DESIGN.md §4 precedent.');
  }

  mkdirSync(dirname(DB_PATH), { recursive: true });
  if (existsSync(DB_PATH)) rmSync(DB_PATH);

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
  const corruptedGrainByTable = new Map<string, string>();
  for (const t of tables) {
    grainByTable.set(t.tableName, await describeGrain(conn, t, edges));
    corruptedGrainByTable.set(t.tableName, await describeGrainCorrupted(conn, t, edges));
  }

  const allQuestions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8')) as QuestionRow[];
  const questions = allQuestions.filter((q) => q.wording === 'explicit' && q.checks.length === 1);

  const mainCells = MAIN_ARMS.length * questions.length;
  const diagnosticQuestions = questions.filter((q) => q.dataset === DIAGNOSTIC_ONLY_DATASET);
  const diagnosticCells = DIAGNOSTIC_ARMS.length * diagnosticQuestions.length;
  const total = (mainCells + diagnosticCells) * N_REPEATS;
  console.log(
    `ladder diagnosis: ${MODEL}, ${MAIN_ARMS.length} main arms x ${questions.length} questions + ` +
      `${DIAGNOSTIC_ARMS.length} diagnostic arms x ${diagnosticQuestions.length} ${DIAGNOSTIC_ONLY_DATASET} questions, ` +
      `N=${N_REPEATS} = ${total} cells, num_ctx=${REQUIRED_NUM_CTX}`,
  );

  let done = 0;
  let skipped = 0;
  let failed = 0;
  const started = Date.now();
  for (const arm of [...MAIN_ARMS, ...DIAGNOSTIC_ARMS]) {
    const isDiagnostic = DIAGNOSTIC_ARMS.includes(arm);
    for (const q of questions) {
      if (isDiagnostic && q.dataset !== DIAGNOSTIC_ONLY_DATASET) continue;

      const dTableNames = DATASET_TABLES[q.dataset];
      if (!dTableNames) throw new Error(`unknown dataset "${q.dataset}" in questions.json`);
      const dTables = tables.filter((t) => dTableNames.includes(t.tableName));
      const dViews = views.filter((v) => dTableNames.includes(v.viewName.split('_rollup_by_')[0]!));
      const ctx: ArmContext = { tables: dTables, facts, grainByTable, views: dViews, corruptedGrainByTable };
      const allViewNames = dViews.map((v) => v.viewName);
      const gold = toGoldCheck(q.checks[0]!);

      const key = `${MODEL}|${arm}|${q.id}`;
      const alreadyDone = completedCounts.get(key) ?? 0;
      done += alreadyDone;

      for (let rep = alreadyDone; rep < N_REPEATS; rep++) {
        let lastError: unknown = null;
        let succeeded = false;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_CELL && !succeeded; attempt++) {
          try {
            const result = await runAndLog(MANIFEST_PATH, q.dataset, 'ladder-diagnosis', {
              arm,
              model: MODEL,
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
            console.log(`[${done}/${total} +${elapsedS}s] ${arm} ${q.id} rep${rep} -> ${outcome}`);
          } catch (error) {
            lastError = error;
            console.warn(`[retry ${attempt}/${MAX_ATTEMPTS_PER_CELL}] ${arm} ${q.id} rep${rep} -> ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        if (!succeeded) {
          failed++;
          appendFileSync(
            ERRORS_PATH,
            `${JSON.stringify({
              model: MODEL,
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

  bootstrapped.close();
  console.log(`ladder diagnosis complete: ${done} cells logged (${skipped} resumed from prior run, ${failed} failed after ${MAX_ATTEMPTS_PER_CELL} attempts each), manifest at ${MANIFEST_PATH}`);
  if (failed > 0) console.log(`failed-cell details: ${ERRORS_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
