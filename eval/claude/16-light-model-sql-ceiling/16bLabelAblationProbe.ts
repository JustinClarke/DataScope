// Sub-experiment 16b — are production's semantic-type labels net-harmful?
//
// 16a served Probe 14's fixture through production's real `pruneSchema` prompt and
// scored 12/24, *below* Probe 14's 15/24 on the bare hand-written block. Three of
// its four failures misplace `price` (`order_items.price`, an unbound `p.price`, an
// invented `oi.product_price`) — and the prompt it was served labels
// `products.price` as **`Identifier`**, the same semantic type it gives
// `product_id`, `order_id` and `name`. The measure column is typographically
// indistinguishable from the keys, and no column in the four tables is labelled as
// the thing the question needs.
//
// That's a hypothesis, not a finding: 16a changed the labels, the row counts and
// the `Relationships:` block all at once. This probe isolates the labels.
//
// Three arms, one variable, everything else held from 16a:
//
//   as-is      production's classifier output, unmodified — the control. Must
//              reproduce 16a's 12/24, or the comparison below means nothing.
//   corrected  the same prompt with five hand-fixed labels (see CORRECTIONS).
//              Distinguishes "wrong labels hurt" from "labels hurt".
//   stripped   the same prompt with the semantic type removed entirely, leaving
//              `  - price (BIGINT)`. Row counts and Relationships stay.
//
// Pruning is unaffected by the arm: `pruneSchema` selects tables by *name* mention
// and FK adjacency, never by semantic type, so all three arms see the identical
// table set per question. Only the rendered label text differs.
//
// Run: `npx tsx eval/claude/16-light-model-sql-ceiling/16bLabelAblationProbe.ts [model] [repeats]`
// (model defaults to qwen3:1.7b, repeats defaults to 1). Requires `ollama serve`
// and the model pulled. `--print-prompts` dumps each arm's first-question prompt
// and exits. `--arms=as-is,corrected` restricts the run — a full N=3 is 72 model
// calls at 14-40s each, so a mid-run failure shouldn't force redoing the rest.
import { createEvalEngine } from '../../duckdb/duckdb.js';
import { runProbe } from './probeShared.js';
import { QUESTIONS, seed } from './nestedGrainFixture.js';
import { pruneSchema } from '../../../src/lib/schemaPrune.js';
import { EDGES, buildTables } from './productionPrompt.js';
import type { SemanticType, TableRegistryEntry } from '../../../src/types/index.js';

const MODEL = process.argv[2]?.startsWith('--') ? 'qwen3:1.7b' : (process.argv[2] ?? 'qwen3:1.7b');
const REPEATS = Number(process.argv[3]?.startsWith('--') ? '1' : (process.argv[3] ?? '1'));
const PRINT_ONLY = process.argv.includes('--print-prompts');
const ARMS_ARG = process.argv.find((a) => a.startsWith('--arms='))?.slice('--arms='.length);

/**
 * The five labels the `corrected` arm changes, and why each one is wrong as
 * shipped. Deliberately minimal: only columns whose production label contradicts
 * the column's role in the gold SQL are touched, so the arm tests *these five*
 * rather than "a nicer schema block". `customers.name` / `products.name` are left
 * as `Identifier` — arguably `Textual`, but they identify a row and no gold query
 * aggregates them, so changing them would add a confound.
 */
const CORRECTIONS: Record<string, SemanticType> = {
  // 40 distinct prices over 40 rows trips IDENTIFIER_UNIQUE_RATIO (0.95). It is
  // the multiplicand of every revenue question in the fixture.
  'products.price': 'Quantitative',
  // 5 distinct values lands under CATEGORICAL_CARDINALITY_MAX (15), but it is the
  // other multiplicand — a measure, not a dimension.
  'order_items.quantity': 'Quantitative',
  // Numeric FKs above the categorical cap read as `Quantitative` — i.e. as things
  // to average. They are join keys.
  'orders.customer_id': 'Identifier',
  'order_items.order_id': 'Identifier',
  'order_items.product_id': 'Identifier',
};

/** Apply CORRECTIONS to a copy — the as-is arm must keep the untouched originals. */
function correctLabels(tables: TableRegistryEntry[]): TableRegistryEntry[] {
  const applied = new Set<string>();
  const out = tables.map((t) => ({
    ...t,
    columns: (t.columns ?? []).map((c) => {
      const key = `${t.tableName}.${c.name}`;
      const override = CORRECTIONS[key];
      if (!override) return c;
      applied.add(key);
      return { ...c, semanticType: override };
    }),
  }));

  // A correction that matches nothing means a column was renamed out from under
  // this map and the arm is quietly testing four changes, not five.
  const missed = Object.keys(CORRECTIONS).filter((k) => !applied.has(k));
  if (missed.length > 0) throw new Error(`CORRECTIONS never matched: ${missed.join(', ')}`);
  return out;
}

/**
 * Drop the semantic type from every rendered column line, turning
 * `  - price: Identifier (BIGINT)` into `  - price (BIGINT)`.
 *
 * Done on the rendered string rather than the data because `renderColumn()` always
 * emits a label — there is no "no semantic type" value to pass it. The regex is
 * anchored to that exact line shape, and the assertion below fails loudly if the
 * renderer's format ever changes underneath it.
 */
function stripLabels(prompt: string): string {
  const stripped = prompt.replace(/^ {2}- (\w+): \w+ \((.+)\)$/gm, '  - $1 ($2)');
  if (/^ {2}- \w+: \w+ \(/m.test(stripped)) throw new Error('stripLabels left a labelled column line');
  if (stripped === prompt) throw new Error('stripLabels matched nothing — renderColumn format changed?');
  return stripped;
}

async function main() {
  const engine = await createEvalEngine();
  await seed(engine);
  const production = await buildTables(engine);
  await engine.close();

  const corrected = correctLabels(production);

  const arms: { name: string; build: (question: string) => string }[] = [
    { name: 'as-is', build: (q) => pruneSchema(q, production, EDGES).prompt },
    { name: 'corrected', build: (q) => pruneSchema(q, corrected, EDGES).prompt },
    { name: 'stripped', build: (q) => stripLabels(pruneSchema(q, production, EDGES).prompt) },
  ];

  const selected = ARMS_ARG ? ARMS_ARG.split(',').map((s) => s.trim()) : arms.map((a) => a.name);
  const unknown = selected.filter((s) => !arms.some((a) => a.name === s));
  if (unknown.length > 0) throw new Error(`unknown arm(s): ${unknown.join(', ')}`);

  // The arms are only comparable if pruning is identical across them; assert it
  // rather than relying on the reading of `pruneSchema` in this file's header.
  for (const item of QUESTIONS) {
    const sets = arms.map((a) => a.build(item.q).match(/^Table (\w+) /gm)?.join(',') ?? '');
    if (new Set(sets).size !== 1) throw new Error(`arms pruned differently for: ${item.q}`);
  }

  for (const arm of arms) {
    if (!selected.includes(arm.name)) continue;
    console.log(`\n===== arm: ${arm.name} — example prompt (first question) =====\n`);
    console.log(arm.build(QUESTIONS[0].q));
  }
  if (PRINT_ONLY) return;

  for (const arm of arms) {
    if (!selected.includes(arm.name)) continue;
    console.log(`\n\n########## ARM: ${arm.name} ##########\n`);
    await runProbe(
      `16b [${arm.name}] — Probe 14 fixture, production prompt, semantic labels ${arm.name}`,
      MODEL,
      arm.build,
      QUESTIONS,
      seed,
      REPEATS,
      createEvalEngine,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
