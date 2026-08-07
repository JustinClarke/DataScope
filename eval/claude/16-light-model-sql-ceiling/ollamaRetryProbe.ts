// Probe 11: does the shipped execution-retry rung actually fix Probe 10's failures, or does it
// just have something to trigger on? toolLadder.ts's ladderRung() returns to the 'sql' rung on
// any execution error, and webllmProvider.ts's toChatMessages() feeds the DuckDB error back
// verbatim as "Result of running that SQL:\n${error}" — that mechanism is real and shipped
// (checked in the prior session, not assumed), but no probe in this document has ever run a
// second round-trip to see whether a model actually self-corrects from that feedback. This
// replays the exact retry shape — first-attempt SQL as an assistant turn, the DuckDB error as
// a user turn, then SQL_INSTRUCTION again — against Probe 10's two stable failures: Qwen3-1.7B's
// unqualified customer_id ambiguity, and Qwen2.5-Coder-0.5B's missing/mis-aliased join.
// Run: `npx tsx eval/claude/16-light-model-sql-ceiling/ollamaRetryProbe.ts [model] [repeats]`
import { createEvalEngine } from '../../duckdb/duckdb.js';
import { OLLAMA_URL, SQL_INSTRUCTION, execScalar, extractSql, valuesMatch } from './probeShared.js';

const MODEL = process.argv[2] ?? 'qwen3:1.7b';
const REPEATS = Number(process.argv[3] ?? '3');

const SCHEMA_TEXT = `Tables:
customers(customer_id INTEGER, name TEXT, region TEXT, signed_up_at DATE)
orders(order_id INTEGER, customer_id INTEGER, ordered_at DATE, status TEXT, amount DECIMAL)`;

// One case per model, seeded with the exact first-attempt SQL Probe 10 produced (stable across
// all 3 runs for both models), so this tests the retry step in isolation without re-deriving
// the first failure from scratch each time.
const CASES: Record<string, { q: string; gold: string; firstSql: string }> = {
  'qwen3:1.7b': {
    q: 'How many distinct customers have placed at least one order?',
    gold: 'SELECT COUNT(DISTINCT customer_id) FROM orders',
    firstSql:
      'SELECT COUNT(DISTINCT customer_id) FROM customers INNER JOIN orders ON customers.customer_id = orders.customer_id',
  },
  'qwen2.5-coder:0.5b': {
    q: 'How many orders were placed by customers in the "west" region?',
    gold: "SELECT COUNT(*) FROM orders o JOIN customers c ON c.customer_id = o.customer_id WHERE c.region = 'west'",
    firstSql: "SELECT COUNT(order_id) FROM orders WHERE region = 'west'",
  },
};

async function askOllamaChat(model: string, messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0 } }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { message?: { content?: string } };
  return json.message?.content ?? '';
}

async function main() {
  const c = CASES[MODEL];
  if (!c) throw new Error(`No known first-attempt failure seeded for model ${MODEL}`);

  const engine = await createEvalEngine();
  await engine.execute(`
    CREATE TABLE customers AS
    SELECT i AS customer_id, ('cust_' || i) AS name,
      (['west','east','north','south'])[1 + (i % 4)] AS region,
      DATE '2023-01-01' + ((i * 3 % 700)::INTEGER) AS signed_up_at
    FROM range(1, 31) t(i)
  `);
  await engine.execute(`
    CREATE TABLE orders AS
    SELECT i AS order_id, (1 + (i % 30)) AS customer_id,
      DATE '2024-01-01' + ((i % 365)::INTEGER) AS ordered_at,
      CASE WHEN i % 9 = 0 THEN 'cancelled' ELSE 'completed' END AS status,
      ROUND(10 + (i * 13 % 490), 2) AS amount
    FROM range(1, 301) t(i)
  `);

  const gold = await execScalar(engine, c.gold);

  // Reproduce the first-attempt failure for real (don't assume Probe 10's error text is stable
  // across DuckDB versions/table defs) so the fed-back error is genuine, not hardcoded.
  let firstError: string;
  try {
    await execScalar(engine, c.firstSql);
    console.log('First-attempt SQL unexpectedly succeeded — case is stale, update CASES.');
    await engine.close();
    return;
  } catch (e) {
    firstError = String(e);
  }
  console.log(`Reproduced first-attempt failure for ${MODEL}:\n  sql: ${c.firstSql}\n  error: ${firstError}\n`);

  let recovered = 0;
  for (let run = 1; run <= REPEATS; run++) {
    const messages = [
      { role: 'user', content: `${SCHEMA_TEXT}\n\nQuestion: ${c.q}\n\n${SQL_INSTRUCTION}` },
      { role: 'assistant', content: '```sql\n' + c.firstSql + '\n```' },
      { role: 'user', content: `Result of running that SQL:\n${firstError}` },
      { role: 'user', content: SQL_INSTRUCTION },
    ];
    const text = await askOllamaChat(MODEL, messages);
    const sql = extractSql(text);
    if (!sql) {
      console.log(`run ${run}: no_sql_extracted — raw: ${text.slice(0, 200)}`);
      continue;
    }
    try {
      const actual = await execScalar(engine, sql);
      const ok = valuesMatch(actual, gold);
      if (ok) recovered++;
      console.log(`run ${run}: ${ok ? 'RECOVERED' : 'wrong_value'} — sql: ${sql}  actual: ${JSON.stringify(actual)}  gold: ${JSON.stringify(gold)}`);
    } catch (e) {
      console.log(`run ${run}: still execution_error — sql: ${sql}  error: ${String(e)}`);
    }
  }

  await engine.close();
  console.log(`\nRecovered on retry: ${recovered}/${REPEATS}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
