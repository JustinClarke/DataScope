// Zero-cost evaluation of groundingCheck.ts against already-recorded model
// output — no new model calls. Per 02-generate-then-verify.md's own
// instruction: "iterate on it against recorded outputs in
// SYNTHESIS-VARIANT-RESULTS.json before generating anything new... this arm
// can be substantially evaluated with zero model calls."
//
// Two data sources:
//  1. Every composedHeadline already recorded in SYNTHESIS-VARIANT-RESULTS.json
//     (20 served rows across 5 datasets and 3 prompt variants, cloud + ollama).
//  2. F1 and F3, hand-typed verbatim from the probe doc's own quotes
//     (00-synthesis-and-limits-probe.md L211, L283) — neither survived into
//     the current SYNTHESIS-VARIANT-RESULTS.json snapshot (F4: the same input
//     produced the fabrication once and correct abstention the next run), so
//     they are reconstructed against the (deterministic) titanic
//     StructuralFacts recorded alongside every titanic row in that same file.
//
// Usage: `npx tsx eval/claude/02-generate-then-verify/zero-cost-check.ts`
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedMentions, groundingCheck, CLOSURE_RULES } from './groundingCheck';
import type { StructuralFacts } from '../../../edge/protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface VariantResult {
  variant: string;
  dataset: string;
  score: { baselineHeadline: string; composedHeadline?: string };
  facts: StructuralFacts;
}

interface VariantResultsFile {
  variantResults: VariantResult[];
}

// Hand-audited ground truth for every SERVED row in SYNTHESIS-VARIANT-RESULTS.json
// (`variant__dataset` -> accurate | fabricated), from cross-checking each
// composedHeadline against its recorded `facts` and, where a date span is
// claimed, against min/maxDate arithmetic. See the Verdict section of
// 02-generate-then-verify.md for the reasoning behind each entry.
const GROUND_TRUTH: Record<string, 'accurate' | 'fabricated'> = {
  'production__titanic': 'accurate',
  'production__ollama__titanic': 'accurate',
  'widened-v1-domain-and-dates__ollama__titanic': 'accurate',
  'widened-v2-suited-for__ollama__titanic': 'accurate',
  'production__stock_prices': 'accurate',
  'production__ollama__stock_prices': 'accurate',
  'widened-v1-domain-and-dates__ollama__stock_prices': 'accurate',
  'widened-v2-suited-for__ollama__stock_prices': 'accurate',
  'production__weather': 'accurate',
  'production__ollama__weather': 'accurate',
  'widened-v1-domain-and-dates__ollama__weather': 'accurate',
  // F2: invented city (City has cardinality 1, no value ever crosses the
  // wire; true city is Springfield) AND wrong span ("5 years" vs true ~10).
  'widened-v2-suited-for__ollama__weather': 'fabricated',
  'production__product_reviews': 'accurate',
  'production__ollama__product_reviews': 'accurate',
  'widened-v1-domain-and-dates__ollama__product_reviews': 'accurate',
  // Newly found in this session, not in the README's F1-F4 list: ReviewDate
  // spans 2023-01-01 to 2024-11-29 (~1.9 calendar years, 1-2 by year-diff
  // arithmetic) — "spanning 3 years" is a wrong span, structurally identical
  // to F2's error.
  'widened-v2-suited-for__ollama__product_reviews': 'fabricated',
  'production__ecommerce': 'accurate',
  'production__ollama__ecommerce': 'accurate',
  // Combines customers.signup_date's min year with orders.order_date's max
  // year into one implied span — defensible (each endpoint is independently
  // real) but a soft cross-column concern, not a clean single-column citation.
  'widened-v1-domain-and-dates__ollama__ecommerce': 'accurate',
  'widened-v2-suited-for__ollama__ecommerce': 'accurate',
};

function auditRow(r: VariantResult): { ok: boolean; offending: string[]; truth: 'accurate' | 'fabricated' } | null {
  const statement = r.score.composedHeadline;
  if (statement === undefined) return null;
  const key = `${r.variant}__${r.dataset}`;
  const truth = GROUND_TRUTH[key];
  if (truth === undefined) throw new Error(`no ground truth recorded for ${key}`);
  const allowed = allowedMentions(r.facts, r.score.baselineHeadline);
  const result = groundingCheck(statement, allowed);
  return { ok: result.ok, offending: result.offending, truth };
}

function main(): void {
  const raw = fs.readFileSync(
    path.resolve(__dirname, '../synthesis/SYNTHESIS-VARIANT-RESULTS.json'),
    'utf-8',
  );
  const data = JSON.parse(raw) as VariantResultsFile;

  console.log(`Closure rules (${CLOSURE_RULES.length}):`);
  for (const rule of CLOSURE_RULES) console.log(`  - ${rule}`);
  console.log();

  let accurateTotal = 0;
  let accurateRejected = 0;
  let fabricatedTotal = 0;
  let fabricatedCaught = 0;
  const rows: Array<{ key: string; truth: string; ok: boolean; offending: string[] }> = [];

  for (const r of data.variantResults) {
    const audited = auditRow(r);
    if (audited === null) continue;
    const key = `${r.variant}__${r.dataset}`;
    rows.push({ key, truth: audited.truth, ok: audited.ok, offending: audited.offending });
    if (audited.truth === 'accurate') {
      accurateTotal++;
      if (!audited.ok) accurateRejected++;
    } else {
      fabricatedTotal++;
      if (!audited.ok) fabricatedCaught++;
    }
    console.log(
      `[${audited.truth === 'fabricated' ? 'FAB' : 'acc'}] ${key}: ` +
        `check=${audited.ok ? 'PASS(ok)' : 'REJECTED'}` +
        (audited.offending.length ? ` offending=${JSON.stringify(audited.offending)}` : ''),
    );
  }

  // Titanic facts + a titanic baseline headline are stable across every
  // recorded row for that dataset (buildStructuralFacts/buildDatasetVerdict
  // are deterministic over the fixed CSV) — reuse the ones already recorded
  // rather than recomputing them, per D58 (no second, harness-only path for
  // the *facts*; only the statement text under test is hand-typed).
  const titanicRow = data.variantResults.find((r) => r.dataset === 'titanic');
  if (!titanicRow) throw new Error('no titanic row found to source facts/baseline from');
  const titanicAllowed = allowedMentions(titanicRow.facts, titanicRow.score.baselineHeadline);

  console.log('\n--- F1/F3 reconstruction (verbatim quotes, probe doc L211/L283) ---');

  const f1 = 'Fares for survivors average 1.6σ higher than non-survivors.';
  const f1Result = groundingCheck(f1, titanicAllowed);
  console.log(`F1: "${f1}"`);
  console.log(
    `  check=${f1Result.ok ? 'PASS(ok) — expected, kill criterion (b)' : 'REJECTED — unexpected, see Verdict'}` +
      (f1Result.offending.length ? ` offending=${JSON.stringify(f1Result.offending)}` : ''),
  );

  const f3 = 'The data covers the single voyage of the Titanic, which sank in April 1912.';
  const f3Result = groundingCheck(f3, titanicAllowed);
  console.log(`F3: "${f3}"`);
  console.log(
    `  check=${f3Result.ok ? 'PASS(ok) — unexpected, see Verdict' : 'REJECTED — expected, kill criterion (a)'}` +
      (f3Result.offending.length ? ` offending=${JSON.stringify(f3Result.offending)}` : ''),
  );

  const falseRejectRate = accurateTotal > 0 ? accurateRejected / accurateTotal : 0;
  console.log(
    `\naccurate rows: ${accurateTotal}, false-rejected: ${accurateRejected} (${(falseRejectRate * 100).toFixed(0)}%)`,
  );
  console.log(`fabricated (recorded) rows: ${fabricatedTotal}, caught: ${fabricatedCaught}`);

  fs.writeFileSync(
    path.resolve(__dirname, 'ZERO-COST-RESULTS.json'),
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        source: 'eval/synthesis/SYNTHESIS-VARIANT-RESULTS.json (recorded, no new model calls)',
        closureRules: CLOSURE_RULES,
        rows,
        f1: { statement: f1, ok: f1Result.ok, offending: f1Result.offending },
        f3: { statement: f3, ok: f3Result.ok, offending: f3Result.offending },
        accurateTotal,
        accurateRejected,
        falseRejectRate,
        fabricatedTotal,
        fabricatedCaught,
      },
      null,
      2,
    ),
  );
}

main();
