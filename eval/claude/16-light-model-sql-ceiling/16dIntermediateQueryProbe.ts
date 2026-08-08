// Sub-experiment 16d — does letting the model run intermediate scratch queries against the
// real data, instead of writing one nested query in one shot, close the two retry-resistant
// failures Probe 15 found (ambiguous customer_id buried inside a subquery nested across 3-4
// tables)?
//
// Same 4-table schema/seed/questions as Probe 14 (imported from nestedGrainFixture.ts,
// byte-identical) so this is directly comparable to Probe 14's 15/24 and Probe 15's 0/3
// retry-recovery on the two ambiguous-customer_id cases.
//
// Protocol: instead of "reply with one SQL statement," the model may reply with
// `RUN: <select>` any number of times up to MAX_SCRATCH_QUERIES — each RUN is actually
// executed against the real DuckDB engine and its result (or error) is fed back as the next
// turn — before finally replying `FINAL: <select>`, which is scored the normal way. This is
// the doc's own D55-adjacent framing: let the model build the answer up from real intermediate
// results (e.g. a per-order-total view, then a per-customer view) rather than holding the whole
// nested structure in its head and typing it correctly on the first pass.
//
// Run: `npx tsx eval/claude/16-light-model-sql-ceiling/16dIntermediateQueryProbe.ts [model] [repeats] [maxScratch]`
// (model defaults to qwen3:1.7b, repeats defaults to 1, maxScratch defaults to 4).
// `--only=5,7,8` restricts to specific question indices (1-based) — useful for a quick smoke
// test against just Probe 14's three known failures before spending a full 8-question run.
import { createEvalEngine } from '../../duckdb/duckdb.js';
import { OLLAMA_URL, execScalar, extractSql, valuesMatch } from './probeShared.js';
import { QUESTIONS, SCHEMA_TEXT, seed } from './nestedGrainFixture.js';
import type { QueryResult } from '../../../src/types/index.js';

const MODEL = process.argv[2]?.startsWith('--') ? 'qwen3:1.7b' : (process.argv[2] ?? 'qwen3:1.7b');
const REPEATS = Number(process.argv[3]?.startsWith('--') ? '1' : (process.argv[3] ?? '1'));
const MAX_SCRATCH_QUERIES = Number(process.argv[4]?.startsWith('--') ? '4' : (process.argv[4] ?? '4'));
const NUM_PREDICT = 2048; // Probe 5/9/12/15's fix — default cap hangs this model mid-reasoning.
const NUM_CTX = 8192; // multi-turn history plus this model's <think> traces can exceed Ollama's 4096 default.
const ONLY_ARG = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const ONLY = ONLY_ARG ? new Set(ONLY_ARG.split(',').map((s) => Number(s.trim()))) : null;

const AGENTIC_INSTRUCTION = `If this question requires aggregating in more than one step (for example: a total per order, then an average of those totals per customer), do NOT write the whole nested query in one shot. Instead, run one intermediate query per aggregation step, look at its real result, and build the next step on top of that — the same way you'd break the problem down on paper.

To run a scratch query, reply with ONLY:
RUN: <one SELECT statement>
You will be shown its actual result. You have at most ${MAX_SCRATCH_QUERIES} scratch queries.

Only once you've verified each intermediate step, reply with ONLY:
FINAL: <one SELECT statement>

If the question is a single simple lookup with no multi-step aggregation, you may skip straight to FINAL.

DuckDB uses Postgres dialect: double-quoted identifiers, LIMIT not TOP. Only SELECT/WITH statements are allowed, one at a time.`;

interface Step {
  kind: 'run' | 'final';
  sql: string;
}

function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function parseStep(raw: string): Step | null {
  const text = stripThink(raw);
  const fenced = text.match(/```(?:sql|duckdb)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : text;
  const m = body.match(/^(RUN|FINAL)\s*:\s*([\s\S]+)$/i);
  if (m) {
    const kind = m[1].toUpperCase() === 'RUN' ? 'run' : 'final';
    const sqlCandidate = m[2].trim().split(';')[0].trim();
    const innerFence = sqlCandidate.match(/```(?:sql|duckdb)?\s*([\s\S]*?)```/i);
    const sql = (innerFence ? innerFence[1] : sqlCandidate).trim();
    return /^\(*\s*(select|with)\b/i.test(sql) ? { kind, sql } : null;
  }
  // Fallback: a bare SQL statement with no RUN:/FINAL: prefix is treated as a final answer,
  // matching extractSql's tolerance elsewhere in this folder.
  const sql = extractSql(text);
  return sql ? { kind: 'final', sql } : null;
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
  outcome: 'correct' | 'wrong_value' | 'execution_error' | 'no_sql_extracted';
  scratchQueries: number;
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
  const messages: { role: string; content: string }[] = [
    { role: 'user', content: `${SCHEMA_TEXT}\n\nQuestion: ${item.q}\n\n${AGENTIC_INSTRUCTION}` },
  ];

  let scratchUsed = 0;
  for (let turn = 0; turn <= MAX_SCRATCH_QUERIES + 1; turn++) {
    const forcingFinal = turn === MAX_SCRATCH_QUERIES + 1;
    if (forcingFinal) {
      messages.push({
        role: 'user',
        content: `You have used all ${MAX_SCRATCH_QUERIES} scratch queries. Reply now with ONLY: FINAL: <one SELECT statement>`,
      });
    }

    const raw = await askOllamaChat(model, messages);
    messages.push({ role: 'assistant', content: raw });
    const step = parseStep(raw);

    if (!step) {
      if (forcingFinal) return { outcome: 'no_sql_extracted', scratchQueries: scratchUsed, gold };
      messages.push({
        role: 'user',
        content: 'Could not parse that. Reply with ONLY "RUN: <select>" or "FINAL: <select>".',
      });
      continue;
    }

    if (step.kind === 'run' && !forcingFinal && scratchUsed < MAX_SCRATCH_QUERIES) {
      scratchUsed++;
      console.log(`\n    [scratch ${scratchUsed}] RUN: ${step.sql}`);
      try {
        const result = await engine.execute(step.sql);
        const formatted = formatResult(result);
        console.log(`    [scratch ${scratchUsed}] result: ${formatted.split('\n').slice(0, 3).join(' / ')}`);
        messages.push({ role: 'user', content: `Result:\n${formatted}` });
      } catch (e) {
        console.log(`    [scratch ${scratchUsed}] error: ${String(e)}`);
        messages.push({ role: 'user', content: `Error running that query: ${String(e)}` });
      }
      continue;
    }

    // step.kind === 'final', or it tried to RUN after exhausting its budget — score it as final.
    try {
      const actual = await execScalar(engine, step.sql);
      return {
        outcome: valuesMatch(actual, gold) ? 'correct' : 'wrong_value',
        scratchQueries: scratchUsed,
        finalSql: step.sql,
        actual,
        gold,
      };
    } catch (e) {
      return {
        outcome: 'execution_error',
        scratchQueries: scratchUsed,
        finalSql: step.sql,
        gold,
        detail: String(e),
      };
    }
  }

  return { outcome: 'no_sql_extracted', scratchQueries: scratchUsed, gold };
}

async function main() {
  const questions = ONLY ? QUESTIONS.filter((_, i) => ONLY.has(i + 1)) : QUESTIONS;
  console.log(
    `16d — intermediate-query probe — model: ${MODEL}, repeats: ${REPEATS}, maxScratch: ${MAX_SCRATCH_QUERIES}, questions: ${questions.length}\n`,
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
      console.log(`${result.outcome} (${result.scratchQueries} scratch queries, ${ms}ms)`);
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
  let totalRuns = 0;
  for (const item of questions) {
    const rows = byQuestion.get(item.q)!;
    const correct = rows.filter((r) => r.outcome === 'correct').length;
    totalCorrect += correct;
    totalRuns += rows.length;
    const avgScratch = (rows.reduce((s, r) => s + r.scratchQueries, 0) / rows.length).toFixed(1);
    const stability = REPEATS > 1 ? (correct === 0 || correct === REPEATS ? 'stable' : 'FLAKY') : '';
    console.log(`[${correct}/${REPEATS}] ${stability ? stability + ' ' : ''}avg ${avgScratch} scratch queries — ${item.q}`);
  }
  console.log(`\nExecution-verified correct: ${totalCorrect}/${totalRuns} (${questions.length} questions x ${REPEATS} run(s))`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
