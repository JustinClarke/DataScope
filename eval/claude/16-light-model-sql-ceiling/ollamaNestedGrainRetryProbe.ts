// Probe 15: does the shipped execution-retry rung fix Probe 14's three stable nested-grain
// failures, the way Probe 11 showed it fixes Probe 10's? Same replay shape as Probe 11 —
// first-attempt SQL as an assistant turn, the real DuckDB error as a user turn, SQL_INSTRUCTION
// again — against all three of Probe 14's stable failures for qwen3:1.7b: the hallucinated
// `product` table alias, and the two ambiguous-`customer_id` recurrences (west-region filter,
// triple-hop). Same 4-table schema/seed as ollamaNestedGrainProbe.ts, so the reproduced errors
// are directly comparable to Probe 14's.
// Run: `npx tsx eval/claude/16-light-model-sql-ceiling/ollamaNestedGrainRetryProbe.ts [model] [repeats]`
import { createEvalEngine } from '../../duckdb/duckdb.js';
import { OLLAMA_URL, SQL_INSTRUCTION, execScalar, extractSql, valuesMatch } from './probeShared.js';

const MODEL = process.argv[2] ?? 'qwen3:1.7b';
const REPEATS = Number(process.argv[3] ?? '3');
// No cap here hung indefinitely on Case 2/3 during manual curl replay (Probe 15) — mirrors
// Probe 5's max_tokens: 2048 fix for WebLLM. Left CLI-adjustable to test whether a bigger
// budget lets the reasoning loop converge instead of just burning longer.
const NUM_PREDICT = Number(process.argv[4] ?? '2048');

const SCHEMA_TEXT = `Tables:
customers(customer_id INTEGER, name TEXT, region TEXT, signed_up_at DATE)
products(product_id INTEGER, name TEXT, category TEXT, price DECIMAL)
orders(order_id INTEGER, customer_id INTEGER, ordered_at DATE, status TEXT)
order_items(order_item_id INTEGER, order_id INTEGER, product_id INTEGER, quantity INTEGER)`;

// The exact first-attempt SQL Probe 14 produced for each of its three stable failures
// (byte-identical across all 3 of Probe 14's runs), so the retry step is tested in isolation
// without re-deriving the first failure from scratch each time.
const CASES: { label: string; q: string; gold: string; firstSql: string }[] = [
  {
    label: 'hallucinated table alias (product vs products)',
    q: 'What is the highest total amount any single customer has spent, summed across all their orders?',
    gold: `WITH customer_totals AS (
      SELECT o.customer_id, SUM(oi.quantity * p.price) AS total
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.order_id
      JOIN products p ON p.product_id = oi.product_id
      GROUP BY o.customer_id
    ) SELECT MAX(total) FROM customer_totals`,
    firstSql: `SELECT MAX(total_spent)
FROM (
    SELECT customer_id, SUM(product.price * order_items.quantity) AS total_spent
    FROM orders
    JOIN order_items ON orders.order_id = order_items.order_id
    JOIN products ON order_items.product_id = products.product_id
    GROUP BY customer_id
) AS customer_spends`,
  },
  {
    label: 'ambiguous customer_id (west-region filter)',
    q: 'Among customers in the "west" region, what is the average total amount spent per customer (summed across their orders)?',
    gold: `WITH order_totals AS (
      SELECT o.customer_id, SUM(oi.quantity * p.price) AS total
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.order_id
      JOIN products p ON p.product_id = oi.product_id
      JOIN customers c ON c.customer_id = o.customer_id
      WHERE c.region = 'west'
      GROUP BY o.customer_id
    ) SELECT AVG(total) FROM order_totals`,
    firstSql: `SELECT AVG(total_spent) FROM (SELECT customer_id, SUM(price * quantity) AS total_spent FROM order_items JOIN orders ON order_items.order_id = orders.order_id JOIN customers ON orders.customer_id = customers.customer_id WHERE customers.region = 'west' GROUP BY customer_id) AS customer_spends`,
  },
  {
    label: 'ambiguous customer_id (triple-hop)',
    q: "What is the average, across customers, of each customer's own average order value?",
    gold: `WITH order_totals AS (
      SELECT o.order_id, o.customer_id, SUM(oi.quantity * p.price) AS total
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.order_id
      JOIN products p ON p.product_id = oi.product_id
      GROUP BY o.order_id, o.customer_id
    ), customer_avg AS (
      SELECT customer_id, AVG(total) AS avg_total FROM order_totals GROUP BY customer_id
    ) SELECT AVG(avg_total) FROM customer_avg`,
    firstSql: `SELECT AVG(average_order_value) FROM (
    SELECT
        customer_id,
        SUM(products.price * order_items.quantity) / COUNT(*) AS average_order_value
    FROM
        orders
        JOIN order_items ON orders.order_id = order_items.order_id
        JOIN products ON order_items.product_id = products.product_id
        JOIN customers ON orders.customer_id = customers.customer_id
    GROUP BY
        customers.customer_id
) AS customer_avg_orders`,
  },
];

async function askOllamaChat(
  model: string,
  messages: { role: string; content: string }[],
): Promise<{ content: string; doneReason?: string }> {
  // Bounded retry: some of these questions take 40-90s to reason through, and a transient
  // undici headers-timeout can fire mid-call even with Ollama healthy (observed once building
  // this probe) — same shape of flake Probe 5 hit on WebLLM downloads, same fix.
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
          options: { temperature: 0, num_predict: NUM_PREDICT },
        }),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { message?: { content?: string }; done_reason?: string };
      return { content: json.message?.content ?? '', doneReason: json.done_reason };
    } catch (e) {
      lastError = e;
      console.log(`  (attempt ${attempt}/3 failed: ${String(e)}${attempt < 3 ? ', retrying...' : ''})`);
    }
  }
  throw lastError;
}

async function seed(engine: Awaited<ReturnType<typeof createEvalEngine>>) {
  await engine.execute(`
    CREATE TABLE customers AS
    SELECT
      i AS customer_id,
      ('cust_' || i) AS name,
      (['west','east','north','south'])[1 + (i % 4)] AS region,
      DATE '2023-01-01' + ((i * 3 % 700)::INTEGER) AS signed_up_at
    FROM range(1, 31) t(i)
  `);
  await engine.execute(`
    CREATE TABLE products AS
    SELECT
      i AS product_id,
      ('product_' || i) AS name,
      (['electronics','apparel','home','toys'])[1 + (i % 4)] AS category,
      ROUND(5 + (i * 7 % 200), 2) AS price
    FROM range(1, 41) t(i)
  `);
  await engine.execute(`
    CREATE TABLE orders AS
    SELECT
      i AS order_id,
      (1 + (i % 30)) AS customer_id,
      DATE '2024-01-01' + ((i % 365)::INTEGER) AS ordered_at,
      CASE WHEN i % 9 = 0 THEN 'cancelled' ELSE 'completed' END AS status
    FROM range(1, 501) t(i)
  `);
  await engine.execute(`
    CREATE TABLE order_items AS
    SELECT
      i AS order_item_id,
      (1 + (i % 500)) AS order_id,
      (1 + ((i * 3) % 40)) AS product_id,
      (1 + (i % 5)) AS quantity
    FROM range(1, 1501) t(i)
  `);
}

async function main() {
  const engine = await createEvalEngine();
  await seed(engine);

  const summary: { label: string; recovered: number }[] = [];

  for (const c of CASES) {
    console.log(`\n=== ${c.label} ===`);
    console.log(`Question: ${c.q}`);

    const gold = await execScalar(engine, c.gold);

    let firstError: string;
    try {
      await execScalar(engine, c.firstSql);
      console.log('First-attempt SQL unexpectedly succeeded — case is stale, update CASES.');
      summary.push({ label: c.label, recovered: -1 });
      continue;
    } catch (e) {
      firstError = String(e);
    }
    console.log(`Reproduced first-attempt failure:\n  error: ${firstError}\n`);

    let recovered = 0;
    for (let run = 1; run <= REPEATS; run++) {
      const messages = [
        { role: 'user', content: `${SCHEMA_TEXT}\n\nQuestion: ${c.q}\n\n${SQL_INSTRUCTION}` },
        { role: 'assistant', content: '```sql\n' + c.firstSql + '\n```' },
        { role: 'user', content: `Result of running that SQL:\n${firstError}` },
        { role: 'user', content: SQL_INSTRUCTION },
      ];
      const { content: text, doneReason } = await askOllamaChat(MODEL, messages);
      const sql = extractSql(text);
      if (!sql) {
        console.log(
          `run ${run}: no_sql_extracted (done_reason: ${doneReason ?? 'unknown'}) — raw: ${text.slice(0, 200)}`,
        );
        continue;
      }
      try {
        const actual = await execScalar(engine, sql);
        const ok = valuesMatch(actual, gold);
        if (ok) recovered++;
        console.log(
          `run ${run}: ${ok ? 'RECOVERED' : 'wrong_value'} — sql: ${sql}  actual: ${JSON.stringify(actual)}  gold: ${JSON.stringify(gold)}`,
        );
      } catch (e) {
        console.log(`run ${run}: still execution_error — sql: ${sql}  error: ${String(e)}`);
      }
    }
    console.log(`Recovered on retry: ${recovered}/${REPEATS}`);
    summary.push({ label: c.label, recovered });
  }

  await engine.close();

  console.log('\n--- Summary ---');
  for (const s of summary) {
    console.log(`[${s.recovered}/${REPEATS}] ${s.label}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
