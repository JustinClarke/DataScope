// Small, deliberately unguarded probe: give the model full read/write DuckDB
// access instead of the two hand-curated `analytics.*` views, and see what it
// does with it. Two constraints only, nothing else:
//   1. "Transform permission" — it may run any SQL, including CREATE
//      SCHEMA/TABLE to persist intermediate results (a self-built "silver"
//      layer), not just SELECT.
//   2. Each step it says whether it's done; when it is, its conversation
//      memory is cleared but the database file (and anything it created in
//      it) is not — then the same question is asked again from scratch, to
//      see whether a memory-less second pass can lean on what a previous
//      pass persisted.
// No guard, no allowlist, no correction budget beyond a step cap — the point
// is to observe raw behavior first and only add rules once we've seen what
// actually happens. Uses 17's known grain-trap question (Q8: "average
// completed order value", gold 1337.35 — averaging at order grain is right,
// averaging at line grain is the wrong-grain failure this dataset was built
// to catch) since we already know both the correct and the tempting-wrong
// path.
//
// Run: `npx tsx eval/chat/17-duckdb-local-chat/silverLayerProbe.ts [model]`
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DuckDBConnection } from '@duckdb/node-api';
import { z } from 'zod';
import { bootstrap } from './bootstrap';
import { openBootstrapConnection } from './database';
import { CHAT_NUM_CTX, CHAT_TEMPERATURE, CHAT_THINK, OLLAMA_BASE_URL, resolveModel, type ChatMessage } from './ollama';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = join(HERE, '..', '..', '..', 'public', 'samples', 'ecommerce');
const DB_PATH = join(HERE, 'runs', 'dev', 'silver-probe.duckdb');
const MAX_STEPS = 6;
const QUESTION = 'What is the average completed order value?';
const GOLD_ANSWER = 1337.35;

const StepSchema = z.object({ sql: z.string().min(1), done: z.boolean(), note: z.string().optional() });
type StepReply = z.infer<typeof StepSchema>;

const STEP_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sql: { type: 'string' },
    done: { type: 'boolean' },
    note: { type: 'string' },
  },
  required: ['sql', 'done'],
};

async function callStep(model: string, messages: ChatMessage[]): Promise<{ reply: StepReply | null; raw: string; parseError: string | null }> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      think: CHAT_THINK,
      stream: false,
      format: STEP_JSON_SCHEMA,
      options: { num_ctx: CHAT_NUM_CTX, temperature: CHAT_TEMPERATURE, num_predict: 2048 },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`ollama http ${response.status}: ${raw}`);
  const body = JSON.parse(raw) as { message?: { content?: string } };
  const content = (body.message?.content ?? '').trim();
  try {
    const parsed = StepSchema.safeParse(JSON.parse(content));
    if (!parsed.success) return { reply: null, raw: content, parseError: parsed.error.message };
    return { reply: parsed.data, raw: content, parseError: null };
  } catch (error) {
    return { reply: null, raw: content, parseError: error instanceof Error ? error.message : String(error) };
  }
}

async function execSql(conn: DuckDBConnection, sql: string): Promise<{ columnNames: string[]; rows: unknown[][] } | { error: string }> {
  try {
    const result = await conn.run(sql);
    const columnNames = result.columnNames();
    const rowsRaw = await result.getRowsJS();
    const rows = rowsRaw.map((row) => row.map((v) => (typeof v === 'bigint' ? Number(v) : v)));
    return { columnNames, rows };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function describeSilverTables(conn: DuckDBConnection): Promise<string> {
  const listResult = await conn.run(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'silver' ORDER BY table_name`,
  );
  const names = (await listResult.getRowsJS()).map((r) => String(r[0]));
  if (names.length === 0) return 'No silver-layer tables exist yet.';
  const parts: string[] = [
    'These silver-layer tables already exist, created during a previous work session — you were not involved in building them and have no memory of doing so, but they are real, already-populated, and safe to query or build on:',
  ];
  for (const name of names) {
    const colResult = await conn.run(`DESCRIBE silver.${name}`);
    const cols = (await colResult.getRowsJS()).map((r) => `${r[0]} ${r[1]}`);
    parts.push(`- silver.${name}(${cols.join(', ')})`);
  }
  return parts.join('\n');
}

function buildSystemPrompt(silverDescription: string): string {
  return `You are working directly against a local DuckDB database with full read/write access.

Base tables (schema "main"):
customers(customer_id, name, email, country, signup_date)
products(product_id, name, category, unit_price)
orders(order_id, customer_id, order_date, status)  -- status is one of 'completed','shipped','cancelled','refunded'
order_items(order_item_id, order_id, product_id, quantity, unit_price)  -- unit_price here is the price at time of sale, do not confuse with products.unit_price

Business rule: a line's revenue is order_items.quantity * order_items.unit_price. An order's revenue is the
sum of its lines' revenue. "Completed" means orders.status = 'completed'.

You may run any SQL, including SELECT to explore and CREATE SCHEMA/CREATE TABLE to persist intermediate
results for later reuse, e.g. CREATE SCHEMA IF NOT EXISTS silver; CREATE TABLE silver.foo AS SELECT ...

${silverDescription}

Question: ${QUESTION}

Work step by step, one SQL statement per reply. Set done=true on the step whose result IS the final answer
to the question. Reply with ONLY the structured JSON {sql, done, note}.`;
}

async function runPhase(
  label: string,
  model: string,
  conn: DuckDBConnection,
  silverDescription: string,
): Promise<{ columnNames: string[]; rows: unknown[][] } | null> {
  console.log(`\n=== ${label} ===`);
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(silverDescription) },
    { role: 'user', content: 'Begin.' },
  ];
  let finalRows: { columnNames: string[]; rows: unknown[][] } | null = null;

  for (let step = 1; step <= MAX_STEPS; step++) {
    const t0 = performance.now();
    const { reply, raw, parseError } = await callStep(model, messages);
    const ms = Math.round(performance.now() - t0);
    if (!reply) {
      console.log(`  step ${step} (${ms}ms): PARSE FAIL (${parseError}) raw=${raw.slice(0, 200)}`);
      break;
    }
    console.log(`  step ${step} (${ms}ms) done=${reply.done}${reply.note ? ` note="${reply.note}"` : ''}`);
    console.log(`    sql: ${reply.sql}`);
    const outcome = await execSql(conn, reply.sql);
    if ('error' in outcome) {
      console.log(`    ERROR: ${outcome.error}`);
      messages.push(
        { role: 'assistant', content: JSON.stringify(reply) },
        { role: 'user', content: `That failed: ${outcome.error}. Try again.` },
      );
      continue;
    }
    console.log(`    -> ${outcome.columnNames.join(' | ')}`);
    for (const row of outcome.rows.slice(0, 5)) console.log(`       ${row.join(' | ')}`);
    if (outcome.rows.length > 5) console.log(`       ... (${outcome.rows.length - 5} more rows)`);
    if (reply.done) {
      finalRows = outcome;
      break;
    }
    messages.push(
      { role: 'assistant', content: JSON.stringify(reply) },
      {
        role: 'user',
        content: `Result: ${outcome.columnNames.join(', ')} = ${JSON.stringify(outcome.rows.slice(0, 20))}. Continue, or set done=true if this result answers the question.`,
      },
    );
  }
  if (finalRows) {
    console.log(`  FINAL ANSWER: ${JSON.stringify(finalRows.rows[0])}`);
  } else {
    console.log(`  (never reached done within ${MAX_STEPS} steps)`);
  }
  return finalRows;
}

async function main(): Promise<void> {
  const model = process.argv[2] ?? 'qwen3:4b';
  const resolved = await resolveModel(model);
  console.log(
    `Using ${resolved.tag} (${resolved.parameterSize ?? '?'}, ${resolved.quantizationLevel ?? '?'}), thinking ${CHAT_THINK ? 'ON' : 'off'}.`,
  );

  mkdirSync(dirname(DB_PATH), { recursive: true });
  console.log(`Bootstrapping fresh dataset at ${DB_PATH} ...`);
  await bootstrap(DB_PATH, DATASET_DIR);

  const { conn, close } = await openBootstrapConnection(DB_PATH);
  try {
    const phase1 = await runPhase('Phase 1 — build (fresh context, empty silver layer)', model, conn, 'No silver-layer tables exist yet.');
    const silverDescription = await describeSilverTables(conn);
    console.log(`\nSilver layer after phase 1:\n${silverDescription}`);
    const phase2 = await runPhase('Phase 2 — context cleared, same question, silver layer persisted', model, conn, silverDescription);

    console.log(`\nGold answer for reference: ${GOLD_ANSWER}`);
    console.log(`Phase 1 final row: ${phase1 ? JSON.stringify(phase1.rows[0]) : '(none)'}`);
    console.log(`Phase 2 final row: ${phase2 ? JSON.stringify(phase2.rows[0]) : '(none)'}`);
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
