// Probe 10: the step between the flat schema (Probe 4/6, 0 joins) and the 4-table schema
// (Probe 7/8, 4 tables with a fan-out join via order_items) that open item #4 in the doc
// flagged as unrun — real DataScope datasets are rarely fully denormalized but also rarely
// 4-way-joined for a single question. This isolates *one join, no fan-out* (amount lives
// directly on `orders`, so there's no line-item multiplicity to collapse before aggregating)
// to test whether a single join alone is enough to break a model that's fine on 0 joins, or
// whether the 4-table failures upstream are specifically about fan-out/grain, not joins per se.
// Same real-execution discipline as Probe 7/8 (headless Node DuckDB, ground truth computed
// per-question). 4 of the 8 questions require the join, 4 don't, same mix ratio as Probe 7/8.
// Run: `npx tsx eval/claude/16-light-model-sql-ceiling/ollamaOneJoinProbe.ts [model] [repeats]`
// (model defaults to qwen3:1.7b, repeats defaults to 1). Requires `ollama serve` running and
// the model pulled.
import { createEvalEngine } from '../../duckdb/duckdb.js';
import { runProbe } from './probeShared.js';

const MODEL = process.argv[2] ?? 'qwen3:1.7b';
const REPEATS = Number(process.argv[3] ?? '1');

const SCHEMA_TEXT = `Tables:
customers(customer_id INTEGER, name TEXT, region TEXT, signed_up_at DATE)
orders(order_id INTEGER, customer_id INTEGER, ordered_at DATE, status TEXT, amount DECIMAL)`;

const QUESTIONS = [
  { q: 'How many customers do we have in total?', gold: 'SELECT COUNT(*) FROM customers' },
  { q: 'What is the total revenue across all orders?', gold: 'SELECT SUM(amount) FROM orders' },
  {
    q: 'How many orders were placed by customers in the "west" region?',
    gold: "SELECT COUNT(*) FROM orders o JOIN customers c ON c.customer_id = o.customer_id WHERE c.region = 'west'",
  },
  {
    q: 'What is the average order value for customers in the "east" region?',
    gold: "SELECT AVG(o.amount) FROM orders o JOIN customers c ON c.customer_id = o.customer_id WHERE c.region = 'east'",
  },
  {
    q: 'Which customer region generates the most total revenue?',
    gold: `SELECT c.region FROM orders o JOIN customers c ON c.customer_id = o.customer_id
      GROUP BY c.region ORDER BY SUM(o.amount) DESC LIMIT 1`,
  },
  {
    q: 'How many distinct customers have placed at least one order?',
    gold: 'SELECT COUNT(DISTINCT customer_id) FROM orders',
  },
  { q: 'What is the average order value across all orders?', gold: 'SELECT AVG(amount) FROM orders' },
  { q: 'How many orders have a status of "cancelled"?', gold: "SELECT COUNT(*) FROM orders WHERE status = 'cancelled'" },
];

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
    CREATE TABLE orders AS
    SELECT
      i AS order_id,
      (1 + (i % 30)) AS customer_id,
      DATE '2024-01-01' + ((i % 365)::INTEGER) AS ordered_at,
      CASE WHEN i % 9 = 0 THEN 'cancelled' ELSE 'completed' END AS status,
      ROUND(10 + (i * 13 % 490), 2) AS amount
    FROM range(1, 301) t(i)
  `);
}

runProbe('Probe 10 — one-join schema, real execution vs ground truth', MODEL, SCHEMA_TEXT, QUESTIONS, seed, REPEATS, createEvalEngine).catch(
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
