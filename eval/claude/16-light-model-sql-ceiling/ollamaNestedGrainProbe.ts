// Probe 14: nested/compound grain — two aggregation levels stacked (e.g. "average of each
// customer's total order value"), not the single-hop grain collapse Probes 1/3/4/7 tested.
// Same 4-table schema and seed data as ollama4TableProbe.ts (Probes 7/8/13), for direct
// comparability — this probe changes only the questions. Two single-hop questions are carried
// over verbatim as controls (a trivial count and Probe 7's known-cleared single-hop grain
// question); the rest stack a second aggregation level on top, up to one deliberate
// triple-hop "reach" question at the end.
// Run: `npx tsx eval/claude/16-light-model-sql-ceiling/ollamaNestedGrainProbe.ts [model] [repeats]`
// (model defaults to qwen3:1.7b, repeats defaults to 1). Requires `ollama serve` running and
// the model pulled.
import { createEvalEngine } from '../../duckdb/duckdb.js';
import { runProbe } from './probeShared.js';

const MODEL = process.argv[2] ?? 'qwen3:1.7b';
const REPEATS = Number(process.argv[3] ?? '1');

const SCHEMA_TEXT = `Tables:
customers(customer_id INTEGER, name TEXT, region TEXT, signed_up_at DATE)
products(product_id INTEGER, name TEXT, category TEXT, price DECIMAL)
orders(order_id INTEGER, customer_id INTEGER, ordered_at DATE, status TEXT)
order_items(order_item_id INTEGER, order_id INTEGER, product_id INTEGER, quantity INTEGER)`;

const QUESTIONS = [
  // -- controls (carried over verbatim from ollama4TableProbe.ts) --
  { q: 'How many customers do we have in total?', gold: 'SELECT COUNT(*) FROM customers' },
  {
    q: 'What is the average order value (total price of items per order, averaged across orders)?',
    gold: `WITH order_totals AS (
      SELECT o.order_id, SUM(oi.quantity * p.price) AS total
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.order_id
      JOIN products p ON p.product_id = oi.product_id
      GROUP BY o.order_id
    ) SELECT AVG(total) FROM order_totals`,
  },
  // -- double-hop --
  {
    q: "What is the average, across customers, of each customer's total amount spent (summed across all their orders)?",
    gold: `WITH order_totals AS (
      SELECT o.order_id, o.customer_id, SUM(oi.quantity * p.price) AS total
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.order_id
      JOIN products p ON p.product_id = oi.product_id
      GROUP BY o.order_id, o.customer_id
    ), customer_totals AS (
      SELECT customer_id, SUM(total) AS total FROM order_totals GROUP BY customer_id
    ) SELECT AVG(total) FROM customer_totals`,
  },
  {
    q: 'On average, how many orders has each customer placed?',
    gold: `WITH customer_order_counts AS (
      SELECT customer_id, COUNT(*) AS n FROM orders GROUP BY customer_id
    ) SELECT AVG(n) FROM customer_order_counts`,
  },
  {
    q: 'What is the highest total amount any single customer has spent, summed across all their orders?',
    gold: `WITH customer_totals AS (
      SELECT o.customer_id, SUM(oi.quantity * p.price) AS total
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.order_id
      JOIN products p ON p.product_id = oi.product_id
      GROUP BY o.customer_id
    ) SELECT MAX(total) FROM customer_totals`,
  },
  {
    q: 'On average, how many distinct products appear in each order?',
    gold: `WITH order_distinct_products AS (
      SELECT order_id, COUNT(DISTINCT product_id) AS n FROM order_items GROUP BY order_id
    ) SELECT AVG(n) FROM order_distinct_products`,
  },
  {
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
  },
  // -- triple-hop (deliberate reach question) --
  {
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
  },
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
