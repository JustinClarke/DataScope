// Sub-experiment 16a — does the ceiling survive production's actual schema prompt?
//
// Every probe in experiment 16 hand-writes its schema block:
//
//     Tables:
//     customers(customer_id INTEGER, name TEXT, region TEXT, signed_up_at DATE)
//
// The app does not send that. `src/services/ai.ts` builds its system prompt from
// `pruneSchema()` (src/lib/schemaPrune.ts), which additionally carries per-table
// **row counts**, each column's **semantic type** from the real classifier, and an
// inferred **`Relationships:`** block naming the FK edges. Probe 14's three stable
// failures are identifier-hygiene failures — a typo'd table name, and an
// unqualified `customer_id` that is ambiguous across a join — exactly the class of
// mistake that extra structure could plausibly prevent. So the doc's ceiling may be
// partly an artifact of underfeeding the model relative to production.
//
// This probe changes ONE thing versus Probe 14: the schema block. Same fixture,
// same seed, same questions, same gold SQL (all imported from
// `nestedGrainFixture.ts`, so they cannot drift), same model, same temperature,
// same extraction and scoring. It calls the real production functions rather than
// reimplementing their output format, so a future change to either one shows up
// here instead of silently invalidating the comparison.
//
// Run: `npx tsx eval/claude/16-light-model-sql-ceiling/16aProductionPromptProbe.ts [model] [repeats]`
// (model defaults to qwen3:1.7b, repeats defaults to 1). Requires `ollama serve`
// running and the model pulled. Pass `--print-prompts` to dump each question's
// built prompt and exit without calling the model.
import { createEvalEngine } from '../../duckdb/duckdb.js';
import { runProbe } from './probeShared.js';
import { QUESTIONS, seed } from './nestedGrainFixture.js';
import { pruneSchema } from '../../../src/lib/schemaPrune.js';
import { EDGES, buildTables } from './productionPrompt.js';

const MODEL = process.argv[2] ?? 'qwen3:1.7b';
const REPEATS = Number(process.argv[3] ?? '1');
const PRINT_ONLY = process.argv.includes('--print-prompts');

async function main() {
  const engine = await createEvalEngine();
  await seed(engine);

  // Table profiling and the FK edge set live in `productionPrompt.ts`, shared with
  // 16b — whose control arm has to build a byte-identical prompt to this one.
  const tables = await buildTables(engine);

  // Production's prompt is question-dependent: pruneSchema keeps the tables the
  // question mentions plus their FK neighbours. Report what each question actually
  // got, so a result can never be read without knowing what the model was served.
  console.log('--- schema prompt per question (pruneSchema, as production builds it) ---\n');
  for (const item of QUESTIONS) {
    const { includedTables } = pruneSchema(item.q, tables, EDGES);
    console.log(`- ${item.q}\n    tables: ${includedTables.join(', ')}`);
  }
  console.log('\n--- example prompt (first question) ---\n');
  console.log(pruneSchema(QUESTIONS[0].q, tables, EDGES).prompt);
  console.log();

  if (PRINT_ONLY) {
    for (const item of QUESTIONS) {
      console.log(`\n===== ${item.q} =====\n`);
      console.log(pruneSchema(item.q, tables, EDGES).prompt);
    }
    await engine.close();
    return;
  }

  await engine.close();

  await runProbe(
    '16a — Probe 14 fixture with production\'s pruneSchema prompt, real execution vs ground truth',
    MODEL,
    (question) => pruneSchema(question, tables, EDGES).prompt,
    QUESTIONS,
    seed,
    REPEATS,
    createEvalEngine,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
