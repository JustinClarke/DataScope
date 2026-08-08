// Probe 14: nested/compound grain — two aggregation levels stacked (e.g. "average of each
// customer's total order value"), not the single-hop grain collapse Probes 1/3/4/7 tested.
// Same 4-table schema and seed data as ollama4TableProbe.ts (Probes 7/8/13), for direct
// comparability — this probe changes only the questions. Two single-hop questions are carried
// over verbatim as controls (a trivial count and Probe 7's known-cleared single-hop grain
// question); the rest stack a second aggregation level on top, up to one deliberate
// triple-hop "reach" question at the end.
//
// The schema block, questions and seed now live in `nestedGrainFixture.ts` so sub-experiment
// 16a can re-run this exact fixture with only the schema prompt changed. Extraction was
// byte-for-byte; this probe's behaviour is unchanged.
// Run: `npx tsx eval/claude/16-light-model-sql-ceiling/ollamaNestedGrainProbe.ts [model] [repeats]`
// (model defaults to qwen3:1.7b, repeats defaults to 1). Requires `ollama serve` running and
// the model pulled.
import { createEvalEngine } from '../../duckdb/duckdb.js';
import { runProbe } from './probeShared.js';
import { QUESTIONS, SCHEMA_TEXT, seed } from './nestedGrainFixture.js';

const MODEL = process.argv[2] ?? 'qwen3:1.7b';
const REPEATS = Number(process.argv[3] ?? '1');

runProbe(
  'Probe 14 — nested/compound grain (double- and triple-hop aggregation), real execution vs ground truth',
  MODEL,
  SCHEMA_TEXT,
  QUESTIONS,
  seed,
  REPEATS,
  createEvalEngine,
).catch((e) => {
  console.error(e);
  process.exit(1);
});
