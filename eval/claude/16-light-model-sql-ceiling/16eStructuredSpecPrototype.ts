// 16e's own "next step, in order" item (1): prototype `as` + structured `join`/`groupBy`
// against all 8 fixture questions and confirm the compiled SQL matches gold. Started with
// Q2 and Q7 — the smallest slice that exercises the join resolver's tree case (Q7: `orders`
// is a hub with `order_items→products` off one edge and `customers` off a sibling edge) —
// then widened to the rest per the doc's "Status" note: the 2- and 3-hop chains (Q3, Q8),
// the no-join cases (Q1, Q4, Q6), and the 1-hop+MAX variant (Q5). No model call in this
// script at all; see 16e-structured-spec.md for why that's deliberately the second step,
// not this one.
//
// This is a standalone prototype of the resolver/compiler sketched in 16e-structured-spec.md,
// not a change to src/lib/analyst/operations.ts. FK edges are hand-supplied (the fixture's true
// FKs are known ahead of time) rather than run through relationshipInference.ts's inference —
// that subsystem is already shipped and out of scope here; this isolates the join-resolver and
// `as`-composition logic under test, per the doc's framing.
//
// Run: `npx tsx eval/claude/16-light-model-sql-ceiling/16eStructuredSpecPrototype.ts`
//
// `compileAndRun`, the spec types, and `BASE_SCHEMA`/`SchemaMap` are exported for reuse by
// item (2), `16eModelEmissionProbe.ts` — same compiler/validator under test, different
// question (does a model, not a human, emit valid calls into it).
import { createEvalEngine, type EvalEngine } from '../../duckdb/duckdb.js';
import { QUESTIONS, seed } from './nestedGrainFixture.js';

// ---- minimal FkEdge shape (subset of relationshipInference.ts's real FkEdge) ----
interface Edge {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
}

const EDGES: Edge[] = [
  { childTable: 'order_items', childColumn: 'order_id', parentTable: 'orders', parentColumn: 'order_id' },
  { childTable: 'order_items', childColumn: 'product_id', parentTable: 'products', parentColumn: 'product_id' },
  { childTable: 'orders', childColumn: 'customer_id', parentTable: 'customers', parentColumn: 'customer_id' },
];

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// ---- join-path resolver: BFS over the edge set, undirected, from `from` to each requested table ----
interface JoinStep {
  table: string;
  onSql: string;
}

function resolveJoinPath(from: string, joinTables: string[], edges: Edge[]): JoinStep[] {
  const wanted = new Set(joinTables);
  const visited = new Set([from]);
  const parent = new Map<string, { via: string; onSql: string }>();
  const order: string[] = []; // BFS discovery order, excludes `from` itself
  const queue: string[] = [from];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      let next: string | null = null;
      let onSql: string | null = null;
      if (edge.childTable === current && !visited.has(edge.parentTable)) {
        next = edge.parentTable;
        onSql = `${quoteIdentifier(edge.childTable)}.${quoteIdentifier(edge.childColumn)} = ${quoteIdentifier(edge.parentTable)}.${quoteIdentifier(edge.parentColumn)}`;
      } else if (edge.parentTable === current && !visited.has(edge.childTable)) {
        next = edge.childTable;
        onSql = `${quoteIdentifier(edge.childTable)}.${quoteIdentifier(edge.childColumn)} = ${quoteIdentifier(edge.parentTable)}.${quoteIdentifier(edge.parentColumn)}`;
      }
      if (next && onSql) {
        visited.add(next);
        parent.set(next, { via: current, onSql });
        order.push(next);
        queue.push(next);
      }
    }
  }

  const missing = joinTables.filter((t) => !visited.has(t));
  if (missing.length > 0) {
    throw new Error(`No join path from "${from}" to: ${missing.join(', ')} (no FK edge connects them, directly or transitively)`);
  }

  // A wanted table can be reachable only *through* an unrequested table (e.g. "join
  // order_items to customers" needs `orders` as a hop) — that hop has to become a real
  // JOIN step too, or the emitted SQL references a table never added to the FROM
  // clause. Walk each wanted table's parent chain back to `from` and union in every
  // table on the way, not just the ones the caller named.
  const needed = new Set<string>();
  for (const w of wanted) {
    let node: string | undefined = w;
    while (node !== undefined && node !== from) {
      needed.add(node);
      node = parent.get(node)?.via;
    }
  }

  // Filtering the BFS discovery order preserves dependency order: a node's parent is
  // always discovered before the node itself, whether or not the parent is `needed`.
  return order.filter((t) => needed.has(t)).map((t) => ({ table: t, onSql: parent.get(t)!.onSql }));
}

// ---- schema scope tracking: base tables known up front; derived tables registered via DESCRIBE ----
export type SchemaMap = Map<string, Set<string>>;

export const BASE_SCHEMA: SchemaMap = new Map([
  ['customers', new Set(['customer_id', 'name', 'region', 'signed_up_at'])],
  ['products', new Set(['product_id', 'name', 'category', 'price'])],
  ['orders', new Set(['order_id', 'customer_id', 'ordered_at', 'status'])],
  ['order_items', new Set(['order_item_id', 'order_id', 'product_id', 'quantity'])],
]);

/** Split "table.column", validate both halves against the in-scope schema, return the requalified quoted form. */
function qualifyColumn(ref: string, scope: string[], schema: SchemaMap): string {
  const parts = ref.split('.');
  if (parts.length !== 2) {
    throw new Error(`Column reference "${ref}" must be "table.column" — bare/unqualified references are exactly the bug class this resolver exists to remove.`);
  }
  const [table, column] = parts;
  if (!scope.includes(table!)) {
    throw new Error(`Column reference "${ref}" names table "${table}", which is not in scope (scope: ${scope.join(', ')}).`);
  }
  const columns = schema.get(table!);
  if (!columns || !columns.has(column!)) {
    throw new Error(`Column reference "${ref}": "${table}" has no column "${column}".`);
  }
  return `${quoteIdentifier(table!)}.${quoteIdentifier(column!)}`;
}

// ---- structured aggregate spec (the vocabulary sketched in 16e-structured-spec.md) ----
export type MetricFn = 'count_rows' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max' | 'sum_product';
export interface MetricSpec {
  fn: MetricFn;
  column?: string; // "table.column"
  columns?: string[]; // sum_product only, exactly two "table.column" entries
  alias: string;
}
export interface WhereSpec {
  column: string; // "table.column"
  op: '=' | '<' | '>' | '<=' | '>=' | '!=';
  value: string | number;
}
export interface AggregateSpec {
  from: string;
  join?: string[];
  metrics: MetricSpec[];
  groupBy?: string[]; // "table.column"
  where?: WhereSpec;
  as?: string; // persist the result as a view under this name
}

function compileMetric(metric: MetricSpec, scope: string[], schema: SchemaMap): string {
  const alias = quoteIdentifier(metric.alias);
  if (metric.fn === 'count_rows') return `COUNT(*) AS ${alias}`;
  if (metric.fn === 'sum_product') {
    if (!metric.columns || metric.columns.length !== 2) {
      throw new Error(`sum_product requires exactly two columns (metric "${metric.alias}").`);
    }
    const [a, b] = metric.columns.map((c) => qualifyColumn(c, scope, schema));
    return `SUM(${a} * ${b}) AS ${alias}`;
  }
  if (!metric.column) throw new Error(`Metric "${metric.alias}" (${metric.fn}) requires a column.`);
  const col = qualifyColumn(metric.column, scope, schema);
  const fnSql: Record<Exclude<MetricFn, 'count_rows' | 'sum_product'>, string> = {
    count_distinct: 'COUNT(DISTINCT',
    sum: 'SUM(',
    avg: 'AVG(',
    min: 'MIN(',
    max: 'MAX(',
  };
  return `${fnSql[metric.fn as keyof typeof fnSql]}${col}) AS ${alias}`;
}

/** Compile a structured spec to SQL, resolving the join path and validating every column reference. Optionally persists the result as a view (`as`) and returns its DESCRIBE'd schema for chaining. */
export async function compileAndRun(
  spec: AggregateSpec,
  engine: EvalEngine,
  schema: SchemaMap,
): Promise<{ sql: string; result: import('../../../src/types').QueryResult }> {
  if (!schema.has(spec.from)) throw new Error(`Unknown table/view "${spec.from}".`);
  const joinTables = spec.join ?? [];
  const scope = [spec.from, ...joinTables];

  const joinSteps = joinTables.length > 0 ? resolveJoinPath(spec.from, joinTables, EDGES) : [];
  const fromClause = [quoteIdentifier(spec.from), ...joinSteps.map((s) => `JOIN ${quoteIdentifier(s.table)} ON ${s.onSql}`)].join(' ');

  const groupBy = spec.groupBy ?? [];
  const groupSelect = groupBy.map((g) => qualifyColumn(g, scope, schema));
  const metricSelect = spec.metrics.map((m) => compileMetric(m, scope, schema));
  const selectList = [...groupSelect, ...metricSelect].join(', ');

  const clauses = [`SELECT ${selectList}`, `FROM ${fromClause}`];
  if (spec.where) {
    const col = qualifyColumn(spec.where.column, scope, schema);
    const value = typeof spec.where.value === 'number' ? String(spec.where.value) : quoteLiteral(spec.where.value);
    clauses.push(`WHERE ${col} ${spec.where.op} ${value}`);
  }
  if (groupBy.length > 0) {
    clauses.push(`GROUP BY ${groupSelect.map((_, i) => `${i + 1}`).join(', ')}`);
  }
  const sql = clauses.join('\n');

  if (spec.as) {
    const viewSql = `CREATE OR REPLACE VIEW ${quoteIdentifier(spec.as)} AS\n${sql}`;
    await engine.execute(viewSql);
    const described = await engine.execute(`DESCRIBE ${quoteIdentifier(spec.as)}`);
    const columns = new Set(described.rows.map((r) => String(r[0])));
    schema.set(spec.as, columns);
    const result = await engine.execute(`SELECT * FROM ${quoteIdentifier(spec.as)}`);
    return { sql: viewSql, result };
  }

  const result = await engine.execute(sql);
  return { sql, result };
}

// ---- Q2 and Q7 as structured spec chains ----

async function runQ2(engine: EvalEngine, schema: SchemaMap) {
  console.log('\n=== Q2 (control, 1-hop, linear chain: orders -> order_items -> products) ===');
  console.log('Question:', QUESTIONS[1]!.q);

  const step1 = await compileAndRun(
    {
      from: 'orders',
      join: ['order_items', 'products'],
      metrics: [{ fn: 'sum_product', columns: ['order_items.quantity', 'products.price'], alias: 'total' }],
      groupBy: ['orders.order_id'],
      as: 'order_totals_q2',
    },
    engine,
    schema,
  );
  console.log('\n-- step 1 (as: order_totals_q2) --\n' + step1.sql);

  const step2 = await compileAndRun(
    { from: 'order_totals_q2', metrics: [{ fn: 'avg', column: 'order_totals_q2.total', alias: 'answer' }] },
    engine,
    schema,
  );
  console.log('\n-- step 2 (final) --\n' + step2.sql);

  const answer = step2.result.rows[0]![0];
  const gold = await engine.execute(QUESTIONS[1]!.gold);
  const goldValue = gold.rows[0]![0];
  console.log(`\nCompiled answer: ${answer}`);
  console.log(`Gold answer:     ${goldValue}`);
  console.log(Math.abs(Number(answer) - Number(goldValue)) < 0.01 ? 'MATCH' : 'MISMATCH');
}

async function runQ7(engine: EvalEngine, schema: SchemaMap) {
  console.log('\n=== Q7 (1-hop + filter, tree join: orders hub, order_items->products branch + customers branch) ===');
  console.log('Question:', QUESTIONS[6]!.q);

  const step1 = await compileAndRun(
    {
      from: 'orders',
      join: ['order_items', 'products', 'customers'],
      metrics: [{ fn: 'sum_product', columns: ['order_items.quantity', 'products.price'], alias: 'total' }],
      groupBy: ['orders.customer_id'],
      where: { column: 'customers.region', op: '=', value: 'west' },
      as: 'order_totals_q7',
    },
    engine,
    schema,
  );
  console.log('\n-- step 1 (as: order_totals_q7) --\n' + step1.sql);

  const step2 = await compileAndRun(
    { from: 'order_totals_q7', metrics: [{ fn: 'avg', column: 'order_totals_q7.total', alias: 'answer' }] },
    engine,
    schema,
  );
  console.log('\n-- step 2 (final) --\n' + step2.sql);

  const answer = step2.result.rows[0]![0];
  const gold = await engine.execute(QUESTIONS[6]!.gold);
  const goldValue = gold.rows[0]![0];
  console.log(`\nCompiled answer: ${answer}`);
  console.log(`Gold answer:     ${goldValue}`);
  console.log(Math.abs(Number(answer) - Number(goldValue)) < 0.01 ? 'MATCH' : 'MISMATCH');
}

async function runQ1(engine: EvalEngine, schema: SchemaMap) {
  console.log('\n=== Q1 (control, 0-hop: no join, no derived table) ===');
  console.log('Question:', QUESTIONS[0]!.q);

  const step1 = await compileAndRun(
    { from: 'customers', metrics: [{ fn: 'count_rows', alias: 'answer' }] },
    engine,
    schema,
  );
  console.log('\n-- final --\n' + step1.sql);

  const answer = step1.result.rows[0]![0];
  const gold = await engine.execute(QUESTIONS[0]!.gold);
  const goldValue = gold.rows[0]![0];
  console.log(`\nCompiled answer: ${answer}`);
  console.log(`Gold answer:     ${goldValue}`);
  console.log(Math.abs(Number(answer) - Number(goldValue)) < 0.01 ? 'MATCH' : 'MISMATCH');
}

async function runQ3(engine: EvalEngine, schema: SchemaMap) {
  console.log('\n=== Q3 (2-hop: order_totals -> customer_totals -> avg) ===');
  console.log('Question:', QUESTIONS[2]!.q);

  const step1 = await compileAndRun(
    {
      from: 'orders',
      join: ['order_items', 'products'],
      metrics: [{ fn: 'sum_product', columns: ['order_items.quantity', 'products.price'], alias: 'total' }],
      groupBy: ['orders.order_id', 'orders.customer_id'],
      as: 'order_totals_q3',
    },
    engine,
    schema,
  );
  console.log('\n-- step 1 (as: order_totals_q3) --\n' + step1.sql);

  const step2 = await compileAndRun(
    {
      from: 'order_totals_q3',
      metrics: [{ fn: 'sum', column: 'order_totals_q3.total', alias: 'total' }],
      groupBy: ['order_totals_q3.customer_id'],
      as: 'customer_totals_q3',
    },
    engine,
    schema,
  );
  console.log('\n-- step 2 (as: customer_totals_q3) --\n' + step2.sql);

  const step3 = await compileAndRun(
    { from: 'customer_totals_q3', metrics: [{ fn: 'avg', column: 'customer_totals_q3.total', alias: 'answer' }] },
    engine,
    schema,
  );
  console.log('\n-- step 3 (final) --\n' + step3.sql);

  const answer = step3.result.rows[0]![0];
  const gold = await engine.execute(QUESTIONS[2]!.gold);
  const goldValue = gold.rows[0]![0];
  console.log(`\nCompiled answer: ${answer}`);
  console.log(`Gold answer:     ${goldValue}`);
  console.log(Math.abs(Number(answer) - Number(goldValue)) < 0.01 ? 'MATCH' : 'MISMATCH');
}

async function runQ4(engine: EvalEngine, schema: SchemaMap) {
  console.log('\n=== Q4 (2-hop, no join: orders grouped by customer_id alone) ===');
  console.log('Question:', QUESTIONS[3]!.q);

  const step1 = await compileAndRun(
    {
      from: 'orders',
      metrics: [{ fn: 'count_rows', alias: 'n' }],
      groupBy: ['orders.customer_id'],
      as: 'customer_order_counts_q4',
    },
    engine,
    schema,
  );
  console.log('\n-- step 1 (as: customer_order_counts_q4) --\n' + step1.sql);

  const step2 = await compileAndRun(
    { from: 'customer_order_counts_q4', metrics: [{ fn: 'avg', column: 'customer_order_counts_q4.n', alias: 'answer' }] },
    engine,
    schema,
  );
  console.log('\n-- step 2 (final) --\n' + step2.sql);

  const answer = step2.result.rows[0]![0];
  const gold = await engine.execute(QUESTIONS[3]!.gold);
  const goldValue = gold.rows[0]![0];
  console.log(`\nCompiled answer: ${answer}`);
  console.log(`Gold answer:     ${goldValue}`);
  console.log(Math.abs(Number(answer) - Number(goldValue)) < 0.01 ? 'MATCH' : 'MISMATCH');
}

async function runQ5(engine: EvalEngine, schema: SchemaMap) {
  console.log('\n=== Q5 (1-hop, join resolver, MAX instead of AVG) ===');
  console.log('Question:', QUESTIONS[4]!.q);

  const step1 = await compileAndRun(
    {
      from: 'orders',
      join: ['order_items', 'products'],
      metrics: [{ fn: 'sum_product', columns: ['order_items.quantity', 'products.price'], alias: 'total' }],
      groupBy: ['orders.customer_id'],
      as: 'customer_totals_q5',
    },
    engine,
    schema,
  );
  console.log('\n-- step 1 (as: customer_totals_q5) --\n' + step1.sql);

  const step2 = await compileAndRun(
    { from: 'customer_totals_q5', metrics: [{ fn: 'max', column: 'customer_totals_q5.total', alias: 'answer' }] },
    engine,
    schema,
  );
  console.log('\n-- step 2 (final) --\n' + step2.sql);

  const answer = step2.result.rows[0]![0];
  const gold = await engine.execute(QUESTIONS[4]!.gold);
  const goldValue = gold.rows[0]![0];
  console.log(`\nCompiled answer: ${answer}`);
  console.log(`Gold answer:     ${goldValue}`);
  console.log(Math.abs(Number(answer) - Number(goldValue)) < 0.01 ? 'MATCH' : 'MISMATCH');
}

async function runQ6(engine: EvalEngine, schema: SchemaMap) {
  console.log('\n=== Q6 (1-hop, no join: count_distinct within order_items alone) ===');
  console.log('Question:', QUESTIONS[5]!.q);

  const step1 = await compileAndRun(
    {
      from: 'order_items',
      metrics: [{ fn: 'count_distinct', column: 'order_items.product_id', alias: 'n' }],
      groupBy: ['order_items.order_id'],
      as: 'order_distinct_products_q6',
    },
    engine,
    schema,
  );
  console.log('\n-- step 1 (as: order_distinct_products_q6) --\n' + step1.sql);

  const step2 = await compileAndRun(
    { from: 'order_distinct_products_q6', metrics: [{ fn: 'avg', column: 'order_distinct_products_q6.n', alias: 'answer' }] },
    engine,
    schema,
  );
  console.log('\n-- step 2 (final) --\n' + step2.sql);

  const answer = step2.result.rows[0]![0];
  const gold = await engine.execute(QUESTIONS[5]!.gold);
  const goldValue = gold.rows[0]![0];
  console.log(`\nCompiled answer: ${answer}`);
  console.log(`Gold answer:     ${goldValue}`);
  console.log(Math.abs(Number(answer) - Number(goldValue)) < 0.01 ? 'MATCH' : 'MISMATCH');
}

async function runQ8(engine: EvalEngine, schema: SchemaMap) {
  console.log('\n=== Q8 (3-hop: order_totals -> customer_avg -> avg-of-avg) ===');
  console.log('Question:', QUESTIONS[7]!.q);

  const step1 = await compileAndRun(
    {
      from: 'orders',
      join: ['order_items', 'products'],
      metrics: [{ fn: 'sum_product', columns: ['order_items.quantity', 'products.price'], alias: 'total' }],
      groupBy: ['orders.order_id', 'orders.customer_id'],
      as: 'order_totals_q8',
    },
    engine,
    schema,
  );
  console.log('\n-- step 1 (as: order_totals_q8) --\n' + step1.sql);

  const step2 = await compileAndRun(
    {
      from: 'order_totals_q8',
      metrics: [{ fn: 'avg', column: 'order_totals_q8.total', alias: 'avg_total' }],
      groupBy: ['order_totals_q8.customer_id'],
      as: 'customer_avg_q8',
    },
    engine,
    schema,
  );
  console.log('\n-- step 2 (as: customer_avg_q8) --\n' + step2.sql);

  const step3 = await compileAndRun(
    { from: 'customer_avg_q8', metrics: [{ fn: 'avg', column: 'customer_avg_q8.avg_total', alias: 'answer' }] },
    engine,
    schema,
  );
  console.log('\n-- step 3 (final) --\n' + step3.sql);

  const answer = step3.result.rows[0]![0];
  const gold = await engine.execute(QUESTIONS[7]!.gold);
  const goldValue = gold.rows[0]![0];
  console.log(`\nCompiled answer: ${answer}`);
  console.log(`Gold answer:     ${goldValue}`);
  console.log(Math.abs(Number(answer) - Number(goldValue)) < 0.01 ? 'MATCH' : 'MISMATCH');
}

async function runRejectionChecks(schema: SchemaMap) {
  console.log('\n=== Rejection checks (does the validator actually catch what it should?) ===');

  // The exact 16d failure: a wrong-but-executable join condition. Structured `join` doesn't let
  // the model author the ON clause at all, so this class of bug becomes a validator error, not a
  // silent wrong answer, PROVIDED the model can't just invent an edge that doesn't exist.

  // customers -> order_items has no *direct* edge, but there is a real transitive path through
  // `orders` (customers <- orders -> order_items). This should resolve — and, per the fix above,
  // must include `orders` as an actual join step even though the caller never named it, or the
  // emitted ON clause would reference a table that was never joined in.
  const transitivePath = resolveJoinPath('customers', ['order_items'], EDGES);
  const includesImplicitHop = transitivePath.some((s) => s.table === 'orders');
  console.log(
    includesImplicitHop
      ? `OK: customers -> order_items resolves transitively through the unrequested hub \`orders\`, and \`orders\` is included as a real join step: ${JSON.stringify(transitivePath)}`
      : `FAIL: transitive path found but \`orders\` was not included as a join step — the emitted SQL would reference an unjoined table: ${JSON.stringify(transitivePath)}`,
  );

  // A genuine no-path case: restrict the edge set to just the products<->order_items edge, so
  // customers is actually disconnected from order_items in this smaller graph.
  const disconnectedEdges = EDGES.filter((e) => e.parentTable === 'products' || e.childTable === 'products');
  try {
    resolveJoinPath('customers', ['order_items'], disconnectedEdges);
    console.log('FAIL: should have thrown — no edge connects customers to order_items in this restricted edge set.');
  } catch (e) {
    console.log('OK: genuinely disconnected tables rejected:', (e as Error).message);
  }

  // Unqualified column — the single most common failure in the whole document.
  try {
    qualifyColumn('customer_id', ['orders'], schema);
    console.log('FAIL: unqualified "customer_id" should have been rejected.');
  } catch (e) {
    console.log('OK: unqualified column rejected:', (e as Error).message);
  }

  // Ambiguous-but-qualified: customer_id qualified to either side of a join should both be
  // accepted (they're equal post-join) — this is the case that broke Probes 10/14 via DuckDB's
  // binder when left unqualified.
  const okA = qualifyColumn('orders.customer_id', ['orders', 'customers'], schema);
  const okB = qualifyColumn('customers.customer_id', ['orders', 'customers'], schema);
  console.log(`OK: both sides of a joined-equal column qualify cleanly: ${okA} / ${okB}`);

  // Column that exists, but on a table not in scope.
  try {
    qualifyColumn('products.category', ['orders', 'order_items'], schema);
    console.log('FAIL: "products.category" should have been rejected — products is not in scope.');
  } catch (e) {
    console.log('OK: out-of-scope table rejected:', (e as Error).message);
  }
}

async function main() {
  const engine = await createEvalEngine();
  const schema: SchemaMap = new Map(BASE_SCHEMA);
  try {
    await seed(engine);
    await runQ1(engine, schema);
    await runQ2(engine, schema);
    await runQ3(engine, schema);
    await runQ4(engine, schema);
    await runQ5(engine, schema);
    await runQ6(engine, schema);
    await runQ7(engine, schema);
    await runQ8(engine, schema);
    await runRejectionChecks(schema);
  } finally {
    await engine.close();
  }
}

// Guarded: 16eModelEmissionProbe.ts imports compileAndRun/BASE_SCHEMA/the spec types from
// this module, and an unguarded call here would re-run this whole 8-question prototype +
// rejection-check suite as an import side effect on every one of that probe's invocations.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
