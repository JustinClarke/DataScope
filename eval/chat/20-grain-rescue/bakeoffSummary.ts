// Summarizes bakeoff.ts's manifest.jsonl into a per-model x per-arm outcome
// table and applies that script's pre-registered decision rule (winner =
// highest A4 correct-rate). Wilson score interval on the A4 correct-rate is
// reported alongside the point estimate — DESIGN.md §5 requires a CI on
// every arm-comparison figure in the *final report*; this is a preliminary
// model-selection decision, not that report, but there's no reason to state
// a bare percentage when the interval is this cheap to compute.
//
// Run: npx tsx eval/chat/20-grain-rescue/bakeoffSummary.ts [manifest-path]
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ManifestRow } from './manifest';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = join(HERE, 'runs', 'bakeoff', 'manifest.jsonl');
const DEFAULT_ERRORS_PATH = join(HERE, 'runs', 'bakeoff', 'errors.jsonl');

type Bucket = 'correct' | 'wrong-but-ran' | 'abstained' | 'malformed' | 'execution-error' | 'overflow';

interface ErrorRow {
  model: string;
  arm: string;
  questionId: string;
  rep: number;
  error: string;
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

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function main(): void {
  const path = process.argv[2] ?? DEFAULT_PATH;
  if (!existsSync(path)) throw new Error(`no manifest at ${path} — run bakeoff.ts first`);
  const rows: ManifestRow[] = readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ManifestRow);

  const errorsPath = process.argv[3] ?? DEFAULT_ERRORS_PATH;
  const errorRows: ErrorRow[] = existsSync(errorsPath)
    ? readFileSync(errorsPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as ErrorRow)
    : [];

  const models = [...new Set(rows.map((r) => r.model))];
  const arms = [...new Set(rows.map((r) => r.arm))];

  console.log(`${rows.length} logged cells, ${errorRows.length} failed-after-retry cells, models=${models.join(',')}, arms=${arms.join(',')}\n`);

  const a4CorrectRate = new Map<string, number>();

  for (const model of models) {
    console.log(`## ${model}`);
    for (const arm of arms) {
      const cells = rows.filter((r) => r.model === model && r.arm === arm);
      const clientErrors = errorRows.filter((e) => e.model === model && e.arm === arm).length;
      // Failed-after-retry cells count toward n (the denominator every candidate is measured
      // against) even though score.ts never got to bucket them — dropping them would silently
      // credit whichever candidate hits this failure mode most by shrinking its own denominator.
      const n = cells.length + clientErrors;
      const counts: Record<Bucket, number> = {
        correct: 0,
        'wrong-but-ran': 0,
        abstained: 0,
        malformed: 0,
        'execution-error': 0,
        overflow: 0,
      };
      for (const c of cells) {
        if (c.promptOverflow) counts.overflow++;
        else if (c.bucket) counts[c.bucket]++;
      }
      const correctRate = n > 0 ? counts.correct / n : 0;
      const [lo, hi] = wilson95(counts.correct, n);
      const repairUsed = cells.filter((c) => c.repairUsed).length;
      const repairSucceeded = cells.filter((c) => c.repairSucceeded).length;
      const avgElapsedMs = cells.length > 0 ? cells.reduce((s, c) => s + c.elapsedMs, 0) / cells.length : 0;
      const p95ElapsedMs = cells.length > 0 ? [...cells].map((c) => c.elapsedMs).sort((a, b) => a - b)[Math.floor(0.95 * (cells.length - 1))] : 0;

      if (arm === 'A4') a4CorrectRate.set(model, correctRate);

      console.log(
        `  ${arm}: n=${n} correct=${counts.correct} (${pct(correctRate)}, 95% CI [${pct(lo)}, ${pct(hi)}]) ` +
          `wrong-but-ran=${counts['wrong-but-ran']} abstained=${counts.abstained} malformed=${counts.malformed} ` +
          `exec-error=${counts['execution-error']} overflow=${counts.overflow} client-error=${clientErrors} | repair used=${repairUsed} succeeded=${repairSucceeded} | ` +
          `avg=${avgElapsedMs.toFixed(0)}ms p95=${(p95ElapsedMs ?? 0).toFixed(0)}ms`,
      );
    }
    console.log('');
  }

  console.log('## Decision (bakeoff.ts pre-registered rule: winner = highest A4 correct-rate)');
  const ranked = [...a4CorrectRate.entries()].sort((a, b) => b[1] - a[1]);
  for (const [model, rate] of ranked) console.log(`  ${model}: A4 correct-rate ${pct(rate)}`);
  if (ranked.length > 0) console.log(`\nWinner: ${ranked[0]![0]}`);
}

main();
