// Probe 6: same fixture, questions, and scoring as Probe 4/5's flat-schema harness, run
// against a local Ollama model instead of a browser (Nano or WebLLM). Real DuckDB execution
// (headless Node engine, eval/duckdb/duckdb.ts), real ground truth — not the syntactic-only
// check Probe 1 used.
// Run: `npx tsx eval/claude/16-light-model-sql-ceiling/ollamaFlatSchemaProbe.ts [model] [repeats]`
// (model defaults to qwen3:1.7b, repeats defaults to 1). Requires `ollama serve` running and
// the model pulled.
import { createEvalEngine } from '../../duckdb/duckdb.js';
import { runProbe } from './probeShared.js';

const MODEL = process.argv[2] ?? 'qwen3:1.7b';
const REPEATS = Number(process.argv[3] ?? '1');

const SCHEMA_TEXT =
  'Table: sales(sale_id INTEGER, customer_name TEXT, region TEXT, category TEXT, product_name TEXT, price DECIMAL, quantity INTEGER, status TEXT, sold_at DATE)';

// Identical fixture and question/gold-SQL set to Probes 4 and 5, so results are directly comparable.
const QUESTIONS = [
  { q: 'How many rows are there in total?', gold: 'SELECT COUNT(*) FROM sales' },
  { q: 'What is the total revenue (price times quantity, summed)?', gold: 'SELECT SUM(price * quantity) FROM sales' },
  { q: 'How many distinct customers are there?', gold: 'SELECT COUNT(DISTINCT customer_name) FROM sales' },
  { q: 'How many sales were made in the "west" region?', gold: "SELECT COUNT(*) FROM sales WHERE region = 'west'" },
  { q: 'What is the average price per sale row?', gold: 'SELECT AVG(price) FROM sales' },
  {
    q: 'Which category generates the most revenue?',
    gold: 'SELECT category FROM sales GROUP BY category ORDER BY SUM(price * quantity) DESC LIMIT 1',
  },
  { q: 'How many sales have a status of "cancelled"?', gold: "SELECT COUNT(*) FROM sales WHERE status = 'cancelled'" },
  {
    q: 'What is the total quantity sold in the "electronics" category?',
    gold: "SELECT SUM(quantity) FROM sales WHERE category = 'electronics'",
  },
];

async function seed(engine: Awaited<ReturnType<typeof createEvalEngine>>) {
  await engine.execute(`
    CREATE TABLE sales AS
    SELECT
      i AS sale_id,
      ('cust_' || (i % 23)) AS customer_name,
      (['west','east','north','south'])[1 + (i % 4)] AS region,
      (['electronics','apparel','home','toys'])[1 + (i % 4)] AS category,
      ('product_' || (i % 40)) AS product_name,
      ROUND(5 + (i * 7 % 200), 2) AS price,
      1 + (i % 5) AS quantity,
      CASE WHEN i % 9 = 0 THEN 'cancelled' ELSE 'completed' END AS status,
      DATE '2024-01-01' + ((i % 365)::INTEGER) AS sold_at
    FROM range(1500) t(i)
  `);
}

runProbe('Probe 6 — flat single-table schema, real execution vs ground truth', MODEL, SCHEMA_TEXT, QUESTIONS, seed, REPEATS, createEvalEngine).catch(
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
