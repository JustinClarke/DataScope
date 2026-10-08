// Validates the run/scoring loop wiring (DESIGN.md §3-§5): one full
// {arm, model, question} cell against a real bootstrapped DuckDB catalog
// (so executed SQL is real, not a stub) and a mocked Ollama /api/chat
// (this experiment area's queueFetch convention — chat.test.ts,
// determinismProbe.test.ts), covering every branch runOneCall's one-shot
// repair logic can take: correct on the first try, correct after repair,
// still wrong after repair, abstained, malformed, prompt overflow, and the
// destructive-statement guard.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DuckDBConnection } from '@duckdb/node-api';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ALL_TABLE_SOURCES, bootstrapAllDatasets } from './bootstrap';
import { buildDatasetFacts, type DatasetFacts } from './datasetFacts';
import { buildAllRollupViews, buildTableRegistry, describeGrain, describeGrainCorrupted, inferEdges } from './profiler';
import type { RollupView } from './profiler';
import { buildArmPrompt, runOneCall, type ArmContext } from './runner';
import type { GoldCheck } from './score';
import type { TableRegistryEntry } from '../../../src/types/dataset';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(HERE, 'runs', 'test', 'runner.duckdb');

afterEach(() => {
  vi.unstubAllGlobals();
});

function queueFetch(responses: Array<Record<string, unknown>>): void {
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const body = responses[i++];
      if (!body) throw new Error(`queueFetch: no more mocked responses (called ${i} times)`);
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

function proposalResponse(fields: Record<string, unknown>, tokens: { prompt?: number; output?: number } = {}): Record<string, unknown> {
  return {
    message: { content: JSON.stringify(fields) },
    prompt_eval_count: tokens.prompt ?? 100,
    eval_count: tokens.output ?? 20,
  };
}

describe('runner (run/scoring loop wiring)', () => {
  let conn: DuckDBConnection;
  let tables: TableRegistryEntry[];
  let facts: DatasetFacts;
  let grainByTable: Map<string, string>;
  let corruptedGrainByTable: Map<string, string>;
  let views: RollupView[];
  let ctx: ArmContext;
  let ecommerceViewNames: string[];

  beforeAll(async () => {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    if (existsSync(DB_PATH)) rmSync(DB_PATH);
    const bootstrapped = await bootstrapAllDatasets(DB_PATH);
    conn = bootstrapped.conn;
    tables = await buildTableRegistry(conn, ALL_TABLE_SOURCES.map((s) => s.tableName));
    facts = await buildDatasetFacts(conn, tables);
    const edges = await inferEdges(conn, tables);
    views = await buildAllRollupViews(conn, edges, tables);
    for (const v of views) await conn.run(v.sql); // buildAllRollupViews only synthesizes SQL text; executing model-emitted SQL against these views (unlike armPrompts.test.ts, which never executes) requires them to actually exist.
    grainByTable = new Map<string, string>();
    for (const t of tables) grainByTable.set(t.tableName, await describeGrain(conn, t, edges));
    corruptedGrainByTable = new Map<string, string>();
    for (const t of tables) corruptedGrainByTable.set(t.tableName, await describeGrainCorrupted(conn, t, edges));

    const ecommerceTables = tables.filter((t) => ['customers', 'products', 'orders', 'order_items'].includes(t.tableName));
    const ecommerceViews = views.filter(
      (v) => v.viewName === 'order_items_rollup_by_orders' || v.viewName === 'orders_rollup_by_customers',
    );
    ctx = { tables: ecommerceTables, facts, grainByTable, views: ecommerceViews, corruptedGrainByTable };
    ecommerceViewNames = ecommerceViews.map((v) => v.viewName);
  }, 120_000);

  const gold: GoldCheck = { kind: 'scalar', scalar: 1337.35 };

  const correctSql =
    "SELECT ROUND(AVG(r.quantity_unit_price_product_sum), 2) FROM orders o " +
    "JOIN order_items_rollup_by_orders r ON r.order_id = o.order_id WHERE o.status = 'completed'";

  it('correct on the first try: scores correct, no repair spent', async () => {
    queueFetch([proposalResponse({ status: 'query', sql: correctSql, assumptions: [], result_shape: 'scalar' })]);
    const result = await runOneCall({
      arm: 'A2',
      model: 'qwen3:4b',
      question: 'What is the average order value?',
      questionId: 'E3',
      ctx,
      conn,
      gold,
      allViewNames: ecommerceViewNames,
      correctViewName: 'order_items_rollup_by_orders',
      numCtx: 16_384,
    });
    expect(result.bucket).toBe('correct');
    expect(result.repairUsed).toBe(false);
    expect(result.viewUsage).toBe('correct-view');
    expect(result.usage).toHaveLength(1);
  });

  it('a syntax error is repaired once and then scores correct', async () => {
    queueFetch([
      proposalResponse({ status: 'query', sql: 'SELECT AVG(nonexistent_column) FROM order_items_rollup_by_orders', assumptions: [], result_shape: 'scalar' }),
      proposalResponse({ status: 'query', sql: correctSql, assumptions: [], result_shape: 'scalar' }),
    ]);
    const result = await runOneCall({
      arm: 'A2',
      model: 'qwen3:4b',
      question: 'What is the average order value?',
      questionId: 'E3',
      ctx,
      conn,
      gold,
      allViewNames: ecommerceViewNames,
      correctViewName: 'order_items_rollup_by_orders',
      numCtx: 16_384,
    });
    expect(result.bucket).toBe('correct');
    expect(result.repairUsed).toBe(true);
    expect(result.repairSucceeded).toBe(true);
    expect(result.usage).toHaveLength(2);
    expect(result.messages).toHaveLength(4); // system, user, assistant(bad), user(repair instruction)
  });

  it('a repair that still fails to execute scores execution-error, not a silent retry loop', async () => {
    queueFetch([
      proposalResponse({ status: 'query', sql: 'SELECT AVG(nope1) FROM order_items_rollup_by_orders', assumptions: [], result_shape: 'scalar' }),
      proposalResponse({ status: 'query', sql: 'SELECT AVG(nope2) FROM order_items_rollup_by_orders', assumptions: [], result_shape: 'scalar' }),
    ]);
    const result = await runOneCall({
      arm: 'A0',
      model: 'qwen3:1.7b',
      question: 'What is the average order value?',
      questionId: 'E3',
      ctx,
      conn,
      gold,
      allViewNames: ecommerceViewNames,
      correctViewName: null,
      numCtx: 16_384,
    });
    expect(result.bucket).toBe('execution-error');
    expect(result.repairUsed).toBe(true);
    expect(result.repairSucceeded).toBe(false);
    expect(result.usage).toHaveLength(2);
  });

  it('runs but disagrees with gold: wrong-but-ran, the dangerous bucket', async () => {
    queueFetch([proposalResponse({ status: 'query', sql: 'SELECT AVG(unit_price * quantity) FROM order_items', assumptions: [], result_shape: 'scalar' })]);
    const result = await runOneCall({
      arm: 'A0',
      model: 'qwen3:1.7b',
      question: 'What is the average order value?',
      questionId: 'E3',
      ctx,
      conn,
      gold,
      allViewNames: ecommerceViewNames,
      correctViewName: null,
      numCtx: 16_384,
    });
    expect(result.bucket).toBe('wrong-but-ran');
    expect(result.viewUsage).toBe('none');
  });

  it('an unsupported reply scores abstained, no repair spent', async () => {
    queueFetch([proposalResponse({ status: 'unsupported', reason: 'no such column' })]);
    const result = await runOneCall({
      arm: 'A0',
      model: 'qwen3:1.7b',
      question: 'What is the meaning of life?',
      questionId: 'X1',
      ctx,
      conn,
      gold,
      allViewNames: ecommerceViewNames,
      correctViewName: null,
      numCtx: 16_384,
    });
    expect(result.bucket).toBe('abstained');
    expect(result.repairUsed).toBe(false);
  });

  it('a reply that never parses scores malformed before any SQL runs', async () => {
    queueFetch([{ message: { content: 'not json at all' }, prompt_eval_count: 50, eval_count: 5 }]);
    const result = await runOneCall({
      arm: 'A0',
      model: 'qwen3:1.7b',
      question: 'What is the average order value?',
      questionId: 'E3',
      ctx,
      conn,
      gold,
      allViewNames: ecommerceViewNames,
      correctViewName: null,
      numCtx: 16_384,
    });
    expect(result.bucket).toBe('malformed');
  });

  it('a destructive statement is rejected by the read-only guard and treated as a repairable execution failure', async () => {
    queueFetch([
      proposalResponse({ status: 'query', sql: 'DROP TABLE order_items', assumptions: [], result_shape: 'scalar' }),
      proposalResponse({ status: 'unsupported', reason: 'cannot answer safely' }),
    ]);
    const result = await runOneCall({
      arm: 'A0',
      model: 'qwen3:1.7b',
      question: 'What is the average order value?',
      questionId: 'E3',
      ctx,
      conn,
      gold,
      allViewNames: ecommerceViewNames,
      correctViewName: null,
      numCtx: 16_384,
    });
    expect(result.repairUsed).toBe(true);
    expect(result.bucket).toBe('abstained');
    const countAfter = await conn.run('SELECT COUNT(*) FROM order_items');
    expect(Number((await countAfter.getRowsJS())[0]![0])).toBeGreaterThan(0); // table survived
  });

  it('a prompt exceeding the 0.8x num_ctx budget fails the run unscored, per DESIGN.md §4', async () => {
    queueFetch([proposalResponse({ status: 'query', sql: 'SELECT 1', assumptions: [], result_shape: 'scalar' }, { prompt: 9000 })]);
    const result = await runOneCall({
      arm: 'A0',
      model: 'qwen3:1.7b',
      question: 'What is the average order value?',
      questionId: 'E3',
      ctx,
      conn,
      gold,
      allViewNames: ecommerceViewNames,
      correctViewName: null,
      numCtx: 10_000, // 0.8x = 8000, prompt tokens 9000 exceeds it
    });
    expect(result.promptOverflow).toBe(true);
    expect(result.bucket).toBeNull();
  });

  it('sends the per-cell numCtx to the real Ollama call, not just the overflow check (roadmap item 2 — a shared CHAT_NUM_CTX env var can\'t vary per model within one sweep process)', async () => {
    const bodies: Array<{ options?: { num_ctx?: number } }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body));
        return new Response(JSON.stringify(proposalResponse({ status: 'query', sql: correctSql, assumptions: [], result_shape: 'scalar' })), { status: 200 });
      }),
    );
    await runOneCall({
      arm: 'A2',
      model: 'qwen3:4b',
      question: 'What is the average order value?',
      questionId: 'E3',
      ctx,
      conn,
      gold,
      allViewNames: ecommerceViewNames,
      correctViewName: 'order_items_rollup_by_orders',
      numCtx: 4096,
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.options?.num_ctx).toBe(4096);
  });

  it('sends the per-cell numCtx on the A4 (plan-first) path too', async () => {
    const bodies: Array<{ options?: { num_ctx?: number } }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body));
        return new Response(
          JSON.stringify(
            proposalResponse({ status: 'query', plan: { grain: 'one row per order', tables: ['order_items'], filters: [] }, sql: correctSql, assumptions: [], result_shape: 'scalar' }),
          ),
          { status: 200 },
        );
      }),
    );
    await runOneCall({
      arm: 'A4',
      model: 'qwen3:4b',
      question: 'What is the average order value?',
      questionId: 'E3',
      ctx,
      conn,
      gold,
      allViewNames: ecommerceViewNames,
      correctViewName: 'order_items_rollup_by_orders',
      numCtx: 12_288,
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.options?.num_ctx).toBe(12_288);
  });

  it('buildArmPrompt dispatches to the matching arm builder, A0 through A4', () => {
    const a0 = buildArmPrompt('A0', ctx);
    const a4 = buildArmPrompt('A4', ctx);
    expect(a0).not.toContain('CREATE VIEW');
    expect(a4).toContain('CREATE VIEW');
    expect(a4).toMatch(/"plan"/);
  });

  it('buildArmPrompt dispatches A2prime to views-without-profile and A1x to the corrupted grain text', () => {
    const a2prime = buildArmPrompt('A2prime', ctx);
    expect(a2prime).toContain('CREATE VIEW');
    expect(a2prime).not.toMatch(/— \d+ rows/);

    const a1x = buildArmPrompt('A1x', ctx);
    expect(a1x).toMatch(/orders is line-grain, not entity-grain: it fans out under order_items/);
  });

  it('buildArmPrompt throws for A1x when ArmContext.corruptedGrainByTable is missing', () => {
    const { corruptedGrainByTable: _omit, ...rest } = ctx;
    expect(() => buildArmPrompt('A1x', rest)).toThrow(/corruptedGrainByTable/);
  });

  it('buildArmPrompt dispatches A5 to the single selected view, dropping the sibling view A2prime would include', () => {
    const selected = views.find((v) => v.viewName === 'order_items_rollup_by_orders')!;
    const a5 = buildArmPrompt('A5', { ...ctx, selectedView: selected });
    expect(a5).toContain('CREATE VIEW "order_items_rollup_by_orders"');
    expect(a5).not.toContain('orders_rollup_by_customers');
    expect(a5.length).toBeLessThan(buildArmPrompt('A2prime', ctx).length);
  });

  it('buildArmPrompt gives A5 exactly A0 when selectedView is null, and throws when it is left undefined', () => {
    expect(buildArmPrompt('A5', { ...ctx, selectedView: null })).toBe(buildArmPrompt('A0', ctx));
    expect(() => buildArmPrompt('A5', ctx)).toThrow(/selectedView/);
  });
});
