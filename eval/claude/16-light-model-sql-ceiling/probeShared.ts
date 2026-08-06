// Shared harness pieces for the Ollama-proxy probes in this folder (Probes 6+): SQL
// extraction (byte-identical to toolLadder.ts's post-fence-fix regex), scalar/text value
// matching against ground truth, and the Ollama HTTP call. Kept here once repeats (N>1) and
// the 4-table fixture needed the same plumbing as Probe 6's flat-schema script.
import type { createEvalEngine } from '../../duckdb/duckdb.js';

export const OLLAMA_URL = 'http://localhost:11434/api/chat';

export const SQL_INSTRUCTION =
  'Reply with ONLY one DuckDB SQL SELECT statement that answers the question — ' +
  'no explanation, no code fence commentary. DuckDB uses Postgres dialect: ' +
  'double-quoted identifiers, LIMIT not TOP.';

// Same regex as toolLadder.ts:65 (post fence-fix).
export function extractSql(text: string): string | null {
  const fence = text.match(/```(?:sql|duckdb)?\s*([\s\S]*?)```/i);
  const candidate = (fence ? fence[1] : text).trim().split(';')[0].trim();
  return /^\(*\s*(select|with)\b/i.test(candidate) ? candidate : null;
}

export function valuesMatch(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return Math.abs(na - nb) < 0.01;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export async function askOllama(model: string, prompt: string): Promise<{ text: string; ms: number }> {
  const t0 = performance.now();
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { message?: { content?: string } };
  return { text: json.message?.content ?? '', ms: Math.round(performance.now() - t0) };
}

export interface RowResult {
  question: string;
  gold: unknown;
  raw?: string;
  sql?: string | null;
  actual?: unknown;
  ms?: number;
  outcome: 'correct' | 'wrong_value' | 'execution_error' | 'no_sql_extracted' | 'engine_error';
  detail?: string;
}

export async function execScalar(
  engine: Awaited<ReturnType<typeof createEvalEngine>>,
  sql: string,
): Promise<unknown> {
  const result = await engine.execute(sql);
  if (result.rows.length === 0) return null;
  return result.rows[0][0];
}

export async function runOneQuestion(
  engine: Awaited<ReturnType<typeof createEvalEngine>>,
  model: string,
  schemaText: string,
  item: { q: string; gold: string },
): Promise<RowResult> {
  const gold = await execScalar(engine, item.gold);

  let text: string;
  let ms: number;
  try {
    ({ text, ms } = await askOllama(model, `${schemaText}\n\nQuestion: ${item.q}\n\n${SQL_INSTRUCTION}`));
  } catch (e) {
    return { question: item.q, gold, outcome: 'engine_error', detail: String(e) };
  }

  const sql = extractSql(text);
  if (!sql) {
    return { question: item.q, gold, raw: text, sql, ms, outcome: 'no_sql_extracted' };
  }

  try {
    const actual = await execScalar(engine, sql);
    return {
      question: item.q,
      gold,
      raw: text,
      sql,
      actual,
      ms,
      outcome: valuesMatch(actual, gold) ? 'correct' : 'wrong_value',
    };
  } catch (e) {
    return { question: item.q, gold, raw: text, sql, ms, outcome: 'execution_error', detail: String(e) };
  }
}

/** Runs the full question set `repeats` times and prints a per-question stability summary. */
export async function runProbe(
  label: string,
  model: string,
  schemaText: string,
  questions: { q: string; gold: string }[],
  seed: (engine: Awaited<ReturnType<typeof createEvalEngine>>) => Promise<void>,
  repeats: number,
  createEngine: typeof createEvalEngine,
) {
  console.log(`${label} — model: ${model}, repeats: ${repeats}\n`);

  const engine = await createEngine();
  await seed(engine);

  // question -> array of per-run outcomes
  const byQuestion = new Map<string, RowResult[]>();

  for (let run = 1; run <= repeats; run++) {
    if (repeats > 1) console.log(`-- run ${run}/${repeats} --`);
    for (const item of questions) {
      process.stdout.write(`- ${item.q} ... `);
      const row = await runOneQuestion(engine, model, schemaText, item);
      console.log(row.outcome + (row.ms ? ` (${row.ms}ms)` : ''));
      const list = byQuestion.get(item.q) ?? [];
      list.push(row);
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
    const stability = repeats > 1 ? (correct === 0 || correct === repeats ? 'stable' : 'FLAKY') : '';
    console.log(`[${correct}/${repeats}] ${stability ? stability + ' ' : ''}${item.q}`);
    if (correct < repeats) {
      for (const r of rows) {
        if (r.outcome !== 'correct') {
          console.log(`    [${r.outcome}] sql: ${r.sql ?? '(none)'}  gold: ${JSON.stringify(r.gold)}  actual: ${JSON.stringify(r.actual)}`);
          if (r.detail) console.log(`      detail: ${r.detail}`);
        }
      }
    }
  }
  console.log(`\nExecution-verified correct: ${totalCorrect}/${totalRuns} (${questions.length} questions x ${repeats} run(s))\n`);

  console.log(
    JSON.stringify(
      { label, model, repeats, totalCorrect, totalRuns, byQuestion: Object.fromEntries(byQuestion) },
      null,
      2,
    ),
  );
}
