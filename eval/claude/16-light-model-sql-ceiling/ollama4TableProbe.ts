// Probe 7: real-execution counterpart to Probe 3's 4-table schema (customers/products/
// orders/order_items) — Probe 3 only checked syntax; this checks generated SQL against real
// ground truth via the headless Node DuckDB engine, the way Probe 6 did for the flat schema.
// Same difficulty class as Probe 3's questions (join, grain-sensitive average, group/order/
// limit on both a numeric and a text column) but rephrased where needed to have a single
// scalar ground truth to compare against.
// Run: `npx tsx eval/claude/16-light-model-sql-ceiling/ollama4TableProbe.ts [model] [repeats]`
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
  { q: 'How many customers do we have in total?', gold: 'SELECT COUNT(*) FROM customers' },
  {
    q: 'What is the total revenue across all orders?',
    gold: 'SELECT SUM(oi.quantity * p.price) FROM order_items oi JOIN products p ON p.product_id = oi.product_id',
  },
  {
    q: 'How many distinct customers have placed at least one order?',
    gold: 'SELECT COUNT(DISTINCT customer_id) FROM orders',
  },
  {
    q: 'What is the total quantity sold of the single top-selling product (by total quantity)?',
    gold: 'SELECT SUM(quantity) FROM order_items GROUP BY product_id ORDER BY SUM(quantity) DESC LIMIT 1',
  },
  {
    q: 'How many orders were placed by customers in the "west" region?',
    gold: "SELECT COUNT(*) FROM orders o JOIN customers c ON c.customer_id = o.customer_id WHERE c.region = 'west'",
  },
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
  {
    q: 'Which product category generates the most revenue?',
    gold: `SELECT p.category FROM order_items oi JOIN products p ON p.product_id = oi.product_id
      GROUP BY p.category ORDER BY SUM(oi.quantity * p.price) DESC LIMIT 1`,
  },
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

runProbe('Probe 7 — 4-table schema, real execution vs ground truth', MODEL, SCHEMA_TEXT, QUESTIONS, seed, REPEATS, createEvalEngine).catch(
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
