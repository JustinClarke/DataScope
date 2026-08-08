// 16e's own "next step, in order" item (2): the compiler/resolver side is already proven
// correct (16eStructuredSpecPrototype.ts — all 8 fixture questions compile to gold by hand).
// This is the other, still-untested half: does a 1.7B reasoning model actually emit valid
// calls into that vocabulary, reliably, with `<think>` in the mix — the risk flagged at the
// end of both 16e-structured-spec.md and the parent README's index and never yet probed.
//
// Protocol mirrors 16d's RUN:/FINAL: shape but swaps raw SQL text for one JSON
// `AggregateSpec` object per turn: `STEP: <json>` (`as` required) to persist an
// intermediate result and chain off it, `FINAL: <json>` (no groupBy, exactly one metric
// aliased "answer") to submit the scored value. Deliberately does NOT tell the model the FK
// graph — per the design note closing 16e-structured-spec.md's Prototype section, the host
// silently resolves whatever hub tables a join needs; the model only names the tables it
// wants data from. Reuses the exact resolver/compiler under test
// (`compileAndRun`, imported from 16eStructuredSpecPrototype.ts) — this script's own code is
// the model harness and the JSON-shape validation gate in front of it.
//
// Run: `npx tsx eval/claude/16-light-model-sql-ceiling/16eModelEmissionProbe.ts [model] [repeats] [maxSteps]`
// (model defaults to qwen3:1.7b, repeats defaults to 1, maxSteps defaults to 4).
// `--only=5,7,8` restricts to specific question indices (1-based) — same convention as 16d.
import { createEvalEngine } from '../../duckdb/duckdb.js';
import { OLLAMA_URL, execScalar, valuesMatch } from './probeShared.js';
import { QUESTIONS, SCHEMA_TEXT, seed } from './nestedGrainFixture.js';
import {
  compileAndRun,
  BASE_SCHEMA,
  type AggregateSpec,
  type MetricFn,
  type MetricSpec,
  type SchemaMap,
  type WhereSpec,
} from './16eStructuredSpecPrototype.js';
import type { QueryResult } from '../../../src/types/index.js';

const MODEL = process.argv[2]?.startsWith('--') ? 'qwen3:1.7b' : (process.argv[2] ?? 'qwen3:1.7b');
const REPEATS = Number(process.argv[3]?.startsWith('--') ? '1' : (process.argv[3] ?? '1'));
const MAX_STEPS = Number(process.argv[4]?.startsWith('--') ? '4' : (process.argv[4] ?? '4'));
const NUM_PREDICT = 2048; // same fix 16d needed — default cap hangs this model mid-reasoning.
const NUM_CTX = 8192; // multi-turn history plus <think> traces can exceed Ollama's 4096 default.
const ONLY_ARG = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const ONLY = ONLY_ARG ? new Set(ONLY_ARG.split(',').map((s) => Number(s.trim()))) : null;

const VALID_FNS: MetricFn[] = ['count_rows', 'count_distinct', 'sum', 'avg', 'min', 'max', 'sum_product'];
const VALID_OPS: WhereSpec['op'][] = ['=', '<', '>', '<=', '>=', '!='];

const VOCAB_INSTRUCTION = `You don't write SQL. Instead, reply with a JSON object describing one aggregation step, in this exact shape:

{
  "from": "table_name",
  "join": ["other_table", ...],        // optional — tables whose columns you also need. You do NOT need to know how they connect; name only the tables you want data from and the host resolves the join path itself.
  "metrics": [
    { "fn": "count_rows", "alias": "n" },
    { "fn": "count_distinct" | "sum" | "avg" | "min" | "max", "column": "table.column", "alias": "name" },
    { "fn": "sum_product", "columns": ["table.column", "table.column"], "alias": "name" }
  ],
  "groupBy": ["table.column", ...],    // optional
  "where": { "column": "table.column", "op": "=" | "<" | ">" | "<=" | ">=" | "!=", "value": <string or number> },  // optional, one condition only
  "as": "name_for_this_result"         // set this to persist the result so a later step can build on it
}

Every column reference anywhere (metrics, groupBy, where) MUST be written as "table.column" — never a bare column name.

If a question needs more than one aggregation step (for example: a total per order, then an average of those totals per customer), do NOT try to express it in one step. Instead:

Reply with ONLY:
STEP: <one JSON spec, with "as" set>
You'll be shown the resulting columns and a few sample rows. Build the next step on top of that — set "from" to the "as" name of any earlier step.
You have at most ${MAX_STEPS} steps.

Once you have the single answer value, reply with ONLY:
FINAL: <one JSON spec>
Its "metrics" must contain exactly one entry aliased "answer", and it must have no "groupBy" (so it returns a single row).

If the question is a single simple lookup with no multi-step aggregation, you may skip straight to FINAL.

Reply with ONLY the STEP:/FINAL: line and its JSON — no explanation, no markdown commentary outside the JSON.`;

function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/** Pulls a JSON payload out of a raw model reply: an explicit STEP:/FINAL:-labeled block (optionally
 * fenced) if present, otherwise a bare fenced or unfenced JSON object — mirroring 16d's own precedent
 * of treating an unlabeled reply as a legitimate answer, not an automatic failure (16d: "a bare SQL
 * statement with no RUN:/FINAL: prefix is treated as a final answer"). Unlike 16d, a bare object here
 * is ambiguous between step/final, so the caller infers kind from whether "as" is set. */
function extractJson(raw: string): { kind: 'step' | 'final' | null; json: string } | null {
  const text = stripThink(raw);
  const labeledFenced = text.match(/(STEP|FINAL)\s*:?\s*```(?:json)?\s*([\s\S]*?)```/i);
  const labeled = labeledFenced ?? text.match(/(STEP|FINAL)\s*:\s*([\s\S]+)/i);
  if (labeled) return { kind: labeled[1]!.toUpperCase() === 'STEP' ? 'step' : 'final', json: labeled[2]!.trim() };
  const bareFenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bareFenced) return { kind: null, json: bareFenced[1]!.trim() };
  if (text.trim().startsWith('{')) return { kind: null, json: text.trim() };
  return null;
}

function validateMetric(m: unknown, i: number): MetricSpec {
  if (typeof m !== 'object' || m === null) throw new Error(`metrics[${i}] must be an object`);
  const mm = m as Record<string, unknown>;
  if (typeof mm.fn !== 'string' || !VALID_FNS.includes(mm.fn as MetricFn)) {
    throw new Error(`metrics[${i}].fn must be one of ${VALID_FNS.join(', ')}`);
  }
  if (typeof mm.alias !== 'string' || !mm.alias) throw new Error(`metrics[${i}].alias must be a non-empty string`);
  if (mm.fn === 'sum_product') {
    if (!Array.isArray(mm.columns) || mm.columns.length !== 2 || !mm.columns.every((c) => typeof c === 'string')) {
      throw new Error(`metrics[${i}] (sum_product) requires "columns": exactly two "table.column" strings`);
    }
  } else if (mm.fn !== 'count_rows') {
    if (typeof mm.column !== 'string' || !mm.column) throw new Error(`metrics[${i}] (${String(mm.fn)}) requires "column": "table.column"`);
  }
  return { fn: mm.fn as MetricFn, column: mm.column as string | undefined, columns: mm.columns as string[] | undefined, alias: mm.alias };
}

function validateWhere(w: unknown): WhereSpec {
  if (typeof w !== 'object' || w === null) throw new Error('"where" must be an object');
  const ww = w as Record<string, unknown>;
  if (typeof ww.column !== 'string' || !ww.column) throw new Error('"where.column" must be "table.column"');
  if (typeof ww.op !== 'string' || !VALID_OPS.includes(ww.op as WhereSpec['op'])) {
    throw new Error(`"where.op" must be one of ${VALID_OPS.join(', ')}`);
  }
  if (typeof ww.value !== 'string' && typeof ww.value !== 'number') throw new Error('"where.value" must be a string or number');
  return { column: ww.column, op: ww.op as WhereSpec['op'], value: ww.value };
}

/** Runtime shape gate in front of `compileAndRun` — the model's JSON is untrusted input, unlike the hand-written specs 16eStructuredSpecPrototype.ts feeds it. */
function validateSpecShape(value: unknown): AggregateSpec {
  if (typeof value !== 'object' || value === null) throw new Error('spec must be a JSON object');
  const v = value as Record<string, unknown>;
  if (typeof v.from !== 'string' || !v.from) throw new Error('"from" must be a non-empty string');
  if (v.join !== undefined && (!Array.isArray(v.join) || !v.join.every((t) => typeof t === 'string'))) {
    throw new Error('"join" must be an array of table-name strings');
  }
  if (!Array.isArray(v.metrics) || v.metrics.length === 0) throw new Error('"metrics" must be a non-empty array');
  const metrics = v.metrics.map((m, i) => validateMetric(m, i));
  if (v.groupBy !== undefined && (!Array.isArray(v.groupBy) || !v.groupBy.every((c) => typeof c === 'string'))) {
    throw new Error('"groupBy" must be an array of "table.column" strings');
  }
  const where = v.where !== undefined ? validateWhere(v.where) : undefined;
  if (v.as !== undefined && typeof v.as !== 'string') throw new Error('"as" must be a string');
  return {
    from: v.from,
    join: v.join as string[] | undefined,
    metrics,
    groupBy: v.groupBy as string[] | undefined,
    where,
    as: v.as as string | undefined,
  };
}

interface ParsedTurn {
  kind: 'step' | 'final';
  spec: AggregateSpec;
}

/** Two distinct failure classes worth telling apart in the summary: the model didn't emit anything JSON-shaped at all (parseError) vs. it did, but the JSON violated the vocabulary's shape (validationError). */
function parseTurn(raw: string): { parsed: ParsedTurn | null; parseError?: string; validationError?: string } {
  const extracted = extractJson(raw);
  if (!extracted) return { parsed: null, parseError: 'no JSON object found' };
  let json: unknown;
  try {
    json = JSON.parse(extracted.json);
  } catch (e) {
    return { parsed: null, parseError: `invalid JSON: ${String(e)}` };
  }
  try {
    const spec = validateSpecShape(json);
    // Unlabeled bare JSON: infer step/final from "as", the vocabulary's own persistence signal.
    const kind = extracted.kind ?? (spec.as ? 'step' : 'final');
    return { parsed: { kind, spec } };
  } catch (e) {
    return { parsed: null, validationError: (e as Error).message };
  }
}

function formatResult(result: QueryResult, maxRows = 15): string {
  if (result.rowCount === 0) return '(0 rows)';
  const header = result.columnNames.join(' | ');
  const shown = result.rows.slice(0, maxRows).map((r) => r.map((v) => String(v)).join(' | '));
  const rest = result.rowCount > maxRows ? `\n... (${result.rowCount - maxRows} more rows not shown)` : '';
  return `${header}\n${shown.join('\n')}${rest}`;
}

async function askOllamaChat(model: string, messages: { role: string; content: string }[]): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: { temperature: 0, num_predict: NUM_PREDICT, num_ctx: NUM_CTX },
        }),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { message?: { content?: string } };
      return json.message?.content ?? '';
    } catch (e) {
      lastError = e;
      console.log(`    (attempt ${attempt}/3 failed: ${String(e)}${attempt < 3 ? ', retrying...' : ''})`);
    }
  }
  throw lastError;
}

interface RunResult {
  outcome: 'correct' | 'wrong_value' | 'compile_error' | 'no_valid_response';
  firstAttemptValid: boolean; // the metric this probe exists to measure: did the model's very first reply parse as a schema-valid spec, before any error feedback?
  steps: number;
  parseFailures: number;
  validationFailures: number;
  finalSql?: string;
  actual?: unknown;
  gold?: unknown;
  detail?: string;
}

async function runOneQuestionAgentic(
  engine: Awaited<ReturnType<typeof createEvalEngine>>,
  model: string,
  item: { q: string; gold: string },
): Promise<RunResult> {
  const gold = await execScalar(engine, item.gold);
  const schema: SchemaMap = new Map(BASE_SCHEMA);
  const messages: { role: string; content: string }[] = [
    { role: 'user', content: `${SCHEMA_TEXT}\n\nQuestion: ${item.q}\n\n${VOCAB_INSTRUCTION}` },
  ];

  let steps = 0;
  let parseFailures = 0;
  let validationFailures = 0;
  let firstAttemptValid: boolean | null = null;

  for (let turn = 0; turn <= MAX_STEPS + 1; turn++) {
    const forcingFinal = turn === MAX_STEPS + 1;
    if (forcingFinal) {
      messages.push({
        role: 'user',
        content: `You have used all ${MAX_STEPS} steps. Reply now with ONLY: FINAL: <one JSON spec>`,
      });
    }

    const raw = await askOllamaChat(model, messages);
    messages.push({ role: 'assistant', content: raw });
    const { parsed, parseError, validationError } = parseTurn(raw);
    if (firstAttemptValid === null) firstAttemptValid = parsed !== null;

    if (!parsed) {
      const errMsg = parseError ?? validationError!;
      if (parseError) parseFailures++;
      else validationFailures++;
      const rawPreview = stripThink(raw).slice(0, 300).replace(/\n/g, ' ');
      console.log(`\n    [turn ${turn}] ${parseError ? 'parse' : 'validation'} error: ${errMsg}\n    [turn ${turn}] raw: ${rawPreview}`);
      if (forcingFinal) {
        return { outcome: 'no_valid_response', firstAttemptValid: firstAttemptValid!, steps, parseFailures, validationFailures, gold };
      }
      messages.push({ role: 'user', content: `Error: ${errMsg}\nReply with ONLY "STEP: <json>" or "FINAL: <json>".` });
      continue;
    }

    if (parsed.kind === 'final' && (parsed.spec.groupBy?.length || parsed.spec.metrics.length !== 1)) {
      validationFailures++;
      console.log(`\n    [turn ${turn}] FINAL rejected: must have exactly one metric and no groupBy`);
      messages.push({
        role: 'user',
        content: 'Error: "FINAL" must have exactly one entry in "metrics" and no "groupBy" — it must resolve to a single value. Reply with ONLY "STEP: <json>" or "FINAL: <json>".',
      });
      continue;
    }

    if (parsed.kind === 'step' && !parsed.spec.as) {
      validationFailures++;
      console.log(`\n    [turn ${turn}] STEP rejected: missing "as"`);
      messages.push({
        role: 'user',
        content: 'Error: "STEP" must set "as" so its result can be reused by a later step. Reply with ONLY "STEP: <json>" (with "as") or "FINAL: <json>".',
      });
      continue;
    }

    if (parsed.kind === 'step' && !forcingFinal && steps < MAX_STEPS) {
      steps++;
      try {
        const { sql, result } = await compileAndRun(parsed.spec, engine, schema);
        console.log(`\n    [step ${steps}] as: ${parsed.spec.as}\n${sql}`);
        console.log(`    [step ${steps}] result: ${formatResult(result).split('\n').slice(0, 3).join(' / ')}`);
        messages.push({ role: 'user', content: `Result:\n${formatResult(result)}` });
      } catch (e) {
        validationFailures++;
        console.log(`\n    [step ${steps}] compile/execution error: ${String(e)}`);
        messages.push({ role: 'user', content: `Error: ${String(e)}` });
      }
      continue;
    }

    // final, or it tried STEP after exhausting its step budget — score it as final.
    try {
      const { sql, result } = await compileAndRun(parsed.spec, engine, schema);
      const actual = result.rows[0]?.[0];
      return {
        outcome: valuesMatch(actual, gold) ? 'correct' : 'wrong_value',
        firstAttemptValid: firstAttemptValid!,
        steps,
        parseFailures,
        validationFailures,
        finalSql: sql,
        actual,
        gold,
      };
    } catch (e) {
      return {
        outcome: 'compile_error',
        firstAttemptValid: firstAttemptValid!,
        steps,
        parseFailures,
        validationFailures,
        gold,
        detail: String(e),
      };
    }
  }

  return { outcome: 'no_valid_response', firstAttemptValid: firstAttemptValid ?? false, steps, parseFailures, validationFailures, gold };
}

async function main() {
  const questions = ONLY ? QUESTIONS.filter((_, i) => ONLY.has(i + 1)) : QUESTIONS;
  console.log(
    `16e model-emission probe — model: ${MODEL}, repeats: ${REPEATS}, maxSteps: ${MAX_STEPS}, questions: ${questions.length}\n`,
  );

  const engine = await createEvalEngine();
  await seed(engine);

  const byQuestion = new Map<string, RunResult[]>();

  for (let run = 1; run <= REPEATS; run++) {
    if (REPEATS > 1) console.log(`-- run ${run}/${REPEATS} --`);
    for (const item of questions) {
      process.stdout.write(`- ${item.q} ... `);
      const t0 = performance.now();
      const result = await runOneQuestionAgentic(engine, MODEL, item);
      const ms = Math.round(performance.now() - t0);
      console.log(
        `${result.outcome} (firstAttemptValid: ${result.firstAttemptValid}, ${result.steps} steps, ${result.parseFailures} parse fails, ${result.validationFailures} validation fails, ${ms}ms)`,
      );
      if (result.outcome !== 'correct') {
        console.log(`    finalSql: ${result.finalSql ?? '(none)'}`);
        console.log(`    gold: ${JSON.stringify(result.gold)}  actual: ${JSON.stringify(result.actual)}`);
        if (result.detail) console.log(`    detail: ${result.detail}`);
      }
      const list = byQuestion.get(item.q) ?? [];
      list.push(result);
      byQuestion.set(item.q, list);
    }
  }

  await engine.close();

  console.log('\n--- Summary ---');
  let totalCorrect = 0;
  let totalFirstAttemptValid = 0;
  let totalRuns = 0;
  for (const item of questions) {
    const rows = byQuestion.get(item.q)!;
    const correct = rows.filter((r) => r.outcome === 'correct').length;
    const firstValid = rows.filter((r) => r.firstAttemptValid).length;
    totalCorrect += correct;
    totalFirstAttemptValid += firstValid;
    totalRuns += rows.length;
    const stability = REPEATS > 1 ? (correct === 0 || correct === REPEATS ? 'stable' : 'FLAKY') : '';
    console.log(
      `[${correct}/${REPEATS} correct, ${firstValid}/${REPEATS} first-attempt-valid] ${stability ? stability + ' ' : ''}${item.q}`,
    );
  }
  console.log(
    `\nExecution-verified correct: ${totalCorrect}/${totalRuns} (${questions.length} questions x ${REPEATS} run(s))`,
  );
  console.log(`First-attempt schema-valid: ${totalFirstAttemptValid}/${totalRuns}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
