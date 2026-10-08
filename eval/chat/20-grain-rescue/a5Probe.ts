// The minimal-prompt probe (README.md "Next steps"): the ladder diagnosis
// found A0 (bare DDL) is the best-scoring arm and every rung above it is
// worse. Measuring the prompts explains why that is at least plausible: A0 is
// ~102 tokens on ecommerce and every other arm is 6-14x that. And only 11 of
// the run's 38 questions have a view that can help them at all — the other 27
// carry the full profile/all-views payload for nothing.
//
// So the ladder never tested the region where the mechanism might actually
// work: a *short* prompt carrying *only* the view this question needs. A5
// (`buildA5Prompt`) is that arm — bare DDL + one oracle-selected view, no
// stats, no grain prose, no sibling views, ~322 tokens.
//
// A5 is a ceiling, not a shippable arm: it picks the view using the
// question's pre-registered `correctViewName`, which a real system would have
// to infer. That is deliberate. If a perfectly selected, minimally packaged
// view still doesn't beat A0, the negative result is conclusive rather than a
// packaging artifact, and item 5's multi-hour multi-model sweep can be scoped
// accordingly.
//
// A0 is re-run here rather than compared against ladderDiagnosis.ts's stored
// numbers, so the comparison is paired within one session on one machine
// state. Scope: the two datasets that have any `correctViewName` at all
// (ecommerce 8/15, chasm 3/3) — on the other four, A5 is A0 by construction
// and running it would only burn time confirming that.
//
// This is also the first script to actually *read* item 2's correctViewName
// map, so `viewUsage` finally distinguishes right-view from wrong-view rather
// than only some-view from none.
//
// Run:     CHAT_NUM_CTX=8192 npx tsx eval/chat/20-grain-rescue/a5Probe.ts
// Summary: SUMMARY_ONLY=1 npx tsx eval/chat/20-grain-rescue/a5Probe.ts
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
const DB_PATH = join(HERE, 'runs', 'a5-probe', 'a5-probe.duckdb');
const MANIFEST_PATH = join(HERE, 'runs', 'a5-probe', 'manifest.jsonl');
const ERRORS_PATH = join(HERE, 'runs', 'a5-probe', 'errors.jsonl');
const QUESTIONS_PATH = join(HERE, 'fixtures', 'questions.json');

const MAX_ATTEMPTS_PER_CELL = 2;

export const MODEL = 'qwen3:4b';
export const ARMS: Arm[] = ['A0', 'A5'];
export const DATASETS = ['ecommerce', 'chasm'];
export const N_REPEATS = 2;
export const REQUIRED_NUM_CTX = 8192;

const DATASET_TABLES: Record<string, string[]> = {
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
  correctViewName: string | null;
  checks: QuestionCheck[];
}

function toGoldCheck(check: QuestionCheck): GoldCheck {
  return check.grading === 'scalar' ? { kind: 'scalar', scalar: check.scalar } : { kind: 'rows', rows: check.rows };
}

function wilson95(successes: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.959963985;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(center - margin) / denom, (center + margin) / denom];
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/**
 * The paired readout this probe exists for. bakeoffSummary.ts already prints
 * the standard per-arm outcome table against any manifest; what it can't show
 * is the two comparisons that decide the question — A0 vs A5 restricted to
 * the questions a view can actually reach, and whether A5's shorter prompt
 * changed whether the model reached for the view at all.
 */
function summarize(): void {
  if (!existsSync(MANIFEST_PATH)) throw new Error(`no manifest at ${MANIFEST_PATH} — run without SUMMARY_ONLY first`);
  const rows: ManifestRow[] = readFileSync(MANIFEST_PATH, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ManifestRow);

  const questions = (JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8')) as QuestionRow[]).filter(
    (q) => q.wording === 'explicit' && q.checks.length === 1 && DATASETS.includes(q.dataset),
  );
  const viewBacked = new Set(questions.filter((q) => q.correctViewName).map((q) => q.id));

  const rate = (subset: ManifestRow[]): string => {
    const correct = subset.filter((r) => r.bucket === 'correct').length;
    const [lo, hi] = wilson95(correct, subset.length);
    return `${correct}/${subset.length} = ${pct(subset.length ? correct / subset.length : 0)} [${pct(lo)}, ${pct(hi)}]`;
  };

  console.log('\n================ A5 PROBE SUMMARY ================\n');

  for (const scope of ['all', 'view-backed only', 'no-view-possible'] as const) {
    const inScope = (r: ManifestRow): boolean =>
      scope === 'all' ? true : scope === 'view-backed only' ? viewBacked.has(r.questionId) : !viewBacked.has(r.questionId);
    console.log(`## ${scope}`);
    for (const dataset of [...DATASETS, 'BOTH']) {
      for (const arm of ARMS) {
        const subset = rows.filter(
          (r) => r.arm === arm && inScope(r) && (dataset === 'BOTH' || r.dataset === dataset),
        );
        if (subset.length === 0) continue;
        const avgPromptTokens = subset.reduce((s, r) => s + (r.usage[0]?.promptTokens ?? 0), 0) / subset.length;
        console.log(`  ${dataset.padEnd(10)} ${arm}: ${rate(subset).padEnd(34)} avg prompt ${avgPromptTokens.toFixed(0)} tok`);
      }
    }
    console.log('');
  }

  console.log('## view engagement (view-backed questions only)');
  for (const arm of ARMS) {
    const subset = rows.filter((r) => r.arm === arm && viewBacked.has(r.questionId));
    if (subset.length === 0) continue;
    const counts = new Map<string, number>();
    for (const r of subset) counts.set(r.viewUsage ?? 'null', (counts.get(r.viewUsage ?? 'null') ?? 0) + 1);
    console.log(`  ${arm}: ${[...counts.entries()].map(([k, v]) => `${k}=${v}`).join(' ')}  (n=${subset.length})`);
  }

  console.log('\n## per-question, view-backed (A0 -> A5 correct out of N)');
  for (const q of questions.filter((q) => viewBacked.has(q.id))) {
    const cell = (arm: Arm): string => {
      const subset = rows.filter((r) => r.arm === arm && r.questionId === q.id);
      return `${subset.filter((r) => r.bucket === 'correct').length}/${subset.length}`;
    };
    const a5Rows = rows.filter((r) => r.arm === 'A5' && r.questionId === q.id);
    const usage = [...new Set(a5Rows.map((r) => r.viewUsage))].join(',');
    console.log(`  ${q.id.padEnd(5)} ${q.dataset.padEnd(10)} A0 ${cell('A0')}  A5 ${cell('A5')}   A5 viewUsage=${usage}`);
  }
  console.log('');
}

async function main(): Promise<void> {
  if (process.env.SUMMARY_ONLY === '1') {
    summarize();
    return;
  }
  if (Number(process.env.CHAT_NUM_CTX) !== REQUIRED_NUM_CTX) {
    throw new Error(`a5Probe.ts must be invoked with CHAT_NUM_CTX=${REQUIRED_NUM_CTX} (got ${process.env.CHAT_NUM_CTX ?? '(unset)'}) — see this file's header comment.`);
  }
  if (process.env.CHAT_THINK === '1') {
    throw new Error('a5Probe.ts requires CHAT_THINK off (unset or "0"), matching bakeoff.ts/ladderDiagnosis.ts precedent.');
  }

  mkdirSync(dirname(DB_PATH), { recursive: true });
  if (existsSync(DB_PATH)) rmSync(DB_PATH);

  // Resumability, per bakeoff.ts's own hard-won fix: count what is already
  // logged and run only the remainder. Never delete the manifest on relaunch.
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
  const questions = allQuestions.filter(
    (q) => q.wording === 'explicit' && q.checks.length === 1 && DATASETS.includes(q.dataset),
  );
  const viewBackedCount = questions.filter((q) => q.correctViewName).length;

  const total = ARMS.length * questions.length * N_REPEATS;
  console.log(
    `a5 probe: ${MODEL}, arms ${ARMS.join('+')} x ${questions.length} questions ` +
      `(${viewBackedCount} view-backed, ${questions.length - viewBackedCount} where A5 == A0 by construction), ` +
      `N=${N_REPEATS} = ${total} cells, num_ctx=${REQUIRED_NUM_CTX}`,
  );

  let done = 0;
  let skipped = 0;
  let failed = 0;
  const started = Date.now();
  for (const arm of ARMS) {
    for (const q of questions) {
      const dTableNames = DATASET_TABLES[q.dataset];
      if (!dTableNames) throw new Error(`unknown dataset "${q.dataset}" in questions.json`);
      const dTables = tables.filter((t) => dTableNames.includes(t.tableName));
      const dViews = views.filter((v) => dTableNames.includes(v.viewName.split('_rollup_by_')[0]!));

      // The oracle selection A5 is built to test. Null is a valid, meaningful
      // value here (the question has no view that helps) — not a lookup miss.
      const selectedView = q.correctViewName ? (dViews.find((v) => v.viewName === q.correctViewName) ?? null) : null;
      if (q.correctViewName && selectedView === null) {
        throw new Error(`${q.id} names correctViewName "${q.correctViewName}" but no such view was generated for ${q.dataset}`);
      }

      const ctx: ArmContext = { tables: dTables, facts, grainByTable, views: dViews, selectedView };
      const allViewNames = dViews.map((v) => v.viewName);
      const gold = toGoldCheck(q.checks[0]!);

      const key = `${MODEL}|${arm}|${q.id}`;
      const alreadyDone = completedCounts.get(key) ?? 0;
      done += alreadyDone;
      if (alreadyDone > 0) skipped += alreadyDone;

      for (let rep = alreadyDone; rep < N_REPEATS; rep++) {
        let lastError: unknown = null;
        let succeeded = false;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_CELL && !succeeded; attempt++) {
          try {
            const result = await runAndLog(MANIFEST_PATH, q.dataset, 'a5-probe', {
              arm,
              model: MODEL,
              question: q.text,
              questionId: q.id,
              ctx,
              conn,
              gold,
              allViewNames,
              correctViewName: q.correctViewName,
              numCtx: REQUIRED_NUM_CTX,
            });
            done++;
            succeeded = true;
            const outcome = result.bucket ?? (result.promptOverflow ? 'OVERFLOW' : 'null');
            const elapsedS = ((Date.now() - started) / 1000).toFixed(0);
            console.log(`[${done}/${total} +${elapsedS}s] ${arm} ${q.id} rep${rep} -> ${outcome} (${result.usage[0]?.promptTokens ?? '?'} tok, view=${result.viewUsage})`);
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
    }
  }

  bootstrapped.close();
  console.log(`a5 probe complete: ${done} cells logged (${skipped} resumed from prior run, ${failed} failed after ${MAX_ATTEMPTS_PER_CELL} attempts each), manifest at ${MANIFEST_PATH}`);
  if (failed > 0) console.log(`failed-cell details: ${ERRORS_PATH}`);
  summarize();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
