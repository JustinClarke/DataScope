// Truth check for MATERIAL_MASTER_QUESTIONS: run every referenceSql against the
// real table and print what it returns, so the ground truth is something that
// was read rather than something that was assumed. Mirrors duckchat's
// check-truth-*.js discipline — a benchmark with wrong truth is worse than none.
//
//   npx tsx eval/dataset/checkMaterialMaster.ts
//
// It also flags top-N questions whose cut line is a tie, because a tie makes the
// expected answer non-deterministic and the question unfair to score.
import { createEvalEngine } from '../duckdb/duckdb';
import { loadEvalDatasets } from './tables';
import { MATERIAL_MASTER_QUESTIONS } from './materialMaster';

const engine = await createEvalEngine();
await loadEvalDatasets(engine);

let problems = 0;
for (const q of MATERIAL_MASTER_QUESTIONS) {
  const result = await engine.execute(q.referenceSql);
  const preview = result.rows.slice(0, 3).map((r) => r.join(' | ')).join('   //   ');
  console.log(`${q.id}  ${String(result.rowCount).padStart(3)} row(s)  ${preview}${result.rowCount > 3 ? '  …' : ''}`);
  if (result.rowCount === 0) {
    console.log('      ^^ EMPTY RESULT — question is unanswerable as written');
    problems++;
  }
}

// Tie check on the two LIMIT-ed leaderboards: if the value at the cut line
// repeats, which rows come back is arbitrary and the question can't be scored.
for (const [id, sql] of [
  ['mm-09', `SELECT count(*) AS n FROM material_master WHERE "MANUFACTURER" IS NOT NULL GROUP BY "MANUFACTURER" ORDER BY n DESC LIMIT 6`],
  ['mm-12', `SELECT round(sum("UNIT_PRICE_INR" * "STOCK_QTY"), 2) AS v FROM material_master WHERE "MANUFACTURER" IS NOT NULL GROUP BY "MANUFACTURER" ORDER BY v DESC LIMIT 6`],
  ['mm-19', `SELECT round("UNIT_PRICE_INR" * "STOCK_QTY", 2) AS v FROM material_master ORDER BY v DESC LIMIT 11`],
] as const) {
  const rows = (await engine.execute(sql)).rows.map((r) => Number(r[0]));
  const cut = id === 'mm-19' ? 10 : 5;
  if (rows[cut - 1] === rows[cut]) {
    console.log(`\n${id}: TIE at the cut line (${rows[cut - 1]}) — top-N is ambiguous, rewrite the question`);
    problems++;
  } else {
    console.log(`\n${id}: no tie at the cut (${rows[cut - 1]} then ${rows[cut]})`);
  }
}

console.log(problems === 0 ? '\nall reference queries return a well-defined answer' : `\n${problems} problem(s)`);
await engine.close();
process.exit(problems === 0 ? 0 : 1);
