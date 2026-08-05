// The A0 conformance fixture and script — one dataset and one ordered list of
// operation calls, run identically against both engines (§11.4 dev/CI only).
//
// The script is a function rather than a table of cases because `read_result`
// needs the handle a previous call issued. Running it as a script also means
// the store's id sequence is exercised the way a caller would exercise it, so
// `resultId` is itself part of what conformance compares.
import type { AnalystCore } from '../../src/lib/analyst/core';
import type { Executor, OpOutcome } from '../../src/lib/analyst/types';

/** Nulls, a decimal, a date, a boolean, text, and two columns with real correlation. */
export const FIXTURE_SQL: readonly string[] = [
  `CREATE TABLE orders AS
   SELECT
     i AS order_id,
     ('cust_' || (i % 17)) AS customer,
     CASE WHEN i % 13 = 0 THEN NULL ELSE (i * 3 % 100) END AS quantity,
     CASE WHEN i % 11 = 0 THEN NULL ELSE ROUND(((i * 3 % 100) * 2.5) + (i % 7), 2) END AS amount,
     DATE '2024-01-01' + ((i % 365)::INTEGER) AS ordered_at,
     (i % 5 = 0) AS is_priority,
     CASE WHEN i % 23 = 0 THEN NULL ELSE ('note ' || i) END AS note
   FROM range(2000) t(i)`,
  `CREATE TABLE customers AS
   SELECT ('cust_' || i) AS customer, ('region_' || (i % 4)) AS region FROM range(17) t(i)`,
];

/** What the fixture registers — the harness catalog's "source" set, which is what `drop_derived` has to refuse (A3). */
export const FIXTURE_TABLES: readonly string[] = ['orders', 'customers'];

export async function loadFixture(executor: Executor): Promise<void> {
  for (const statement of FIXTURE_SQL) await executor.execute(statement);
}

export interface ConformanceStep {
  name: string;
  outcome: OpOutcome;
}

/**
 * Every paging case orders in the *source* statement. An unordered query has
 * no cross-engine row order to agree on — materialization freezes one, which
 * is the correctness property the store exists for, but it is a property of a
 * single materialization, not something two engines owe each other.
 */
export async function runConformanceScript(core: AnalystCore): Promise<ConformanceStep[]> {
  const steps: ConformanceStep[] = [];
  const record = async (name: string, op: string, params: unknown): Promise<OpOutcome> => {
    const outcome = await core.invoke(op, params);
    steps.push({ name, outcome });
    return outcome;
  };

  await record('schema:all', 'get_schema', {});
  await record('schema:one', 'get_schema', { table: 'orders' });
  await record('schema:unknown', 'get_schema', { table: 'ordrs' });

  await record('describe:orders', 'describe_table', { table: 'orders' });
  await record('describe:unknown', 'describe_table', { table: 'nope' });

  // `quantity` (~7.7% null) and `amount` (~9.1% null) cross the 5% threshold;
  // `note` (~4.35% null) deliberately does not, and no column in this fixture
  // has cardinality 1 — zero-variance and quiet tables are `03-explorer-...`
  // (browser UI)'s coverage, not this engine-agnostic recomputation's.
  await record('quality:orders', 'data_quality', { table: 'orders' });
  await record('quality:customers', 'data_quality', { table: 'customers' });
  await record('quality:all', 'data_quality', {});
  await record('quality:unknown-table', 'data_quality', { table: 'nope' });

  await record('stats:numeric', 'column_stats', { table: 'orders', column: 'amount' });
  await record('stats:integer', 'column_stats', { table: 'orders', column: 'quantity' });
  await record('stats:text', 'column_stats', { table: 'orders', column: 'note' });
  await record('stats:date', 'column_stats', { table: 'orders', column: 'ordered_at' });
  await record('stats:boolean', 'column_stats', { table: 'orders', column: 'is_priority' });
  await record('stats:unknown-column', 'column_stats', { table: 'orders', column: 'amont' });
  await record('stats:unknown-table', 'column_stats', { table: 'odrers', column: 'amount' });

  await record('sample:orders', 'sample_rows', { table: 'orders', limit: 5 });
  await record('sample:bad-limit', 'sample_rows', { table: 'orders', limit: 0 });

  await record('correlate:auto', 'correlate', { table: 'orders' });
  await record('correlate:named', 'correlate', { table: 'orders', columns: ['quantity', 'amount'] });
  await record('correlate:too-few', 'correlate', { table: 'customers' });

  const paged = await record('run_sql:ordered', 'run_sql', {
    sql: 'SELECT order_id, amount FROM orders WHERE amount IS NOT NULL ORDER BY order_id',
    limit: 10,
  });
  await record('run_sql:mutation', 'run_sql', { sql: "UPDATE orders SET amount = 0 WHERE order_id = 1" });
  await record('run_sql:ctas', 'run_sql', { sql: 'CREATE TABLE t AS SELECT 1' });
  await record('run_sql:syntax', 'run_sql', { sql: 'SELEC 1' });
  await record('run_sql:unknown-table', 'run_sql', { sql: 'SELECT * FROM nope' });

  const resultId = 'resultId' in paged ? paged.resultId : null;
  if (resultId) {
    await record('read:page2', 'read_result', { resultId, offset: 10, limit: 10 });
    await record('read:past-end', 'read_result', { resultId, offset: 100_000, limit: 10 });
    await record('read:columns', 'read_result', { resultId, offset: 0, limit: 5, columns: ['order_id'] });
    await record('read:unknown-column', 'read_result', { resultId, offset: 0, limit: 5, columns: ['nope'] });
  }
  await record('read:unknown', 'read_result', { resultId: 'res_999' });

  await record('catalog:unknown-op', 'no_such_op', {});
  await record('catalog:bad-params', 'describe_table', { table: 42 });

  // ---- A1: the eight missing operations ----

  await record('validate:ok', 'validate_sql', { sql: 'SELECT order_id, amount FROM orders WHERE amount > 10' });
  await record('validate:mutation', 'validate_sql', { sql: "UPDATE orders SET amount = 0 WHERE order_id = 1" });
  await record('validate:syntax-error', 'validate_sql', { sql: 'SELEC 1' });
  await record('validate:unknown-table', 'validate_sql', { sql: 'SELECT * FROM nope' });
  // Proves validate_sql never executed the mutation it just validated.
  await record('validate:mutation-not-applied', 'column_stats', { table: 'orders', column: 'amount' });

  await record('search:hit', 'search_values', { term: 'cust_1', mode: 'ci_contains' });
  await record('search:none', 'search_values', { term: 'no-such-literal-anywhere' });
  await record('search:bad-table', 'search_values', { term: 'cust_1', tables: ['nope'] });

  await record('distinct:default', 'distinct_values', { table: 'orders', column: 'customer' });
  await record('distinct:filtered', 'distinct_values', { table: 'orders', column: 'customer', where: 'quantity > 10', order: 'value_asc', limit: 5 });
  await record('distinct:unknown-column', 'distinct_values', { table: 'orders', column: 'nope' });

  await record('text:word', 'text_frequency', { table: 'orders', column: 'note', unit: 'word', top: 10 });
  await record('text:bigram', 'text_frequency', { table: 'orders', column: 'note', unit: 'bigram', top: 5 });

  await record('timeseries:month', 'time_series', {
    from: 'orders',
    dateColumn: 'ordered_at',
    grain: 'month',
    metrics: [{ fn: 'sum', column: 'amount' }, { fn: 'count_rows' }],
  });
  // A deliberately sparse slice — of the 100 rows with order_id < 100 (one
  // per calendar day, since ordered_at = 2024-01-01 + order_id there),
  // quantity = (order_id*3) % 100 is a bijection, so `> 90` keeps exactly 9
  // of the 100 days and leaves the rest as real, flagged gap rows.
  await record('timeseries:gaps', 'time_series', {
    from: 'orders',
    dateColumn: 'ordered_at',
    grain: 'day',
    where: 'order_id < 100 AND quantity > 90',
    metrics: [{ fn: 'count_rows' }],
  });

  await record('join:inferred', 'join_coverage', { left: 'orders', right: 'customers' });
  await record('join:explicit', 'join_coverage', { left: 'orders', right: 'customers', on: { leftColumn: 'customer', rightColumn: 'customer' } });
  await record('join:unknown-table', 'join_coverage', { left: 'orders', right: 'nope' });

  const agg = await record('aggregate:groupby', 'aggregate', {
    from: 'orders',
    groupBy: ['customer'],
    metrics: [{ fn: 'sum', column: 'amount' }, { fn: 'count_rows' }],
    limit: 5,
  });
  await record('aggregate:no-groupby', 'aggregate', { from: 'orders', metrics: [{ fn: 'count_rows' }, { fn: 'count_distinct', column: 'customer' }] });
  await record('aggregate:bad-metric', 'aggregate', { from: 'orders', metrics: [{ fn: 'sum' }] });

  // Paging stability: reading the same page of an unordered-by-caller,
  // app-materialized result twice must return byte-identical rows both
  // times — the whole reason results are materialized once rather than
  // re-run per page.
  const aggResultId = 'resultId' in agg ? agg.resultId : null;
  if (aggResultId) {
    await record('aggregate:read-repeat-a', 'read_result', { resultId: aggResultId, offset: 0, limit: 5 });
    await record('aggregate:read-repeat-b', 'read_result', { resultId: aggResultId, offset: 0, limit: 5 });
  }

  // ---- A3: the derive verbs ----
  //
  // Appended rather than interleaved: every step above reads a catalog these
  // create objects in, so putting them earlier would change what `get_schema`
  // and `search_values` see and turn an A3 regression into an A0/A1 failure.

  await record('derive:table', 'derive_table', {
    name: 'big_orders',
    sql: 'SELECT order_id, customer, amount FROM orders WHERE amount > 200 ORDER BY order_id',
  });
  // Sanitize + dedupe are ingestion's own rules (§7.1), not a second set: an
  // unusable name is renamed deterministically and the note says so.
  await record('derive:sanitized-name', 'derive_table', {
    name: '9 Big Orders!',
    sql: 'SELECT order_id FROM orders WHERE amount > 400 ORDER BY order_id',
  });
  await record('derive:name-taken', 'derive_table', {
    name: 'big_orders',
    sql: 'SELECT order_id FROM orders WHERE amount > 300 ORDER BY order_id',
  });
  await record('derive:body-is-ctas', 'derive_table', {
    name: 'nested',
    sql: 'CREATE TABLE nested AS SELECT 1',
  });
  await record('derive:body-is-mutation', 'derive_table', {
    name: 'nope',
    sql: 'UPDATE orders SET amount = 0',
  });

  await record('view:create', 'create_view', {
    name: 'priority_orders',
    sql: 'SELECT order_id, amount FROM orders WHERE is_priority ORDER BY order_id',
  });
  // A view is an object like any other from here on: named in the schema, and
  // queryable by name through the ordinary read path.
  await record('view:in-schema', 'get_schema', { table: 'priority_orders' });
  await record('view:queryable', 'run_sql', {
    sql: 'SELECT count(*) AS n FROM priority_orders',
  });

  // Lineage, and the reason there is no seventeenth operation for it: the
  // object description carries it.
  await record('lineage:derived-from', 'describe_table', { table: 'big_orders' });
  await record('lineage:chained', 'derive_table', {
    name: 'big_orders_by_customer',
    sql: 'SELECT customer, count(*) AS n FROM big_orders GROUP BY customer ORDER BY customer',
  });
  await record('lineage:dependents', 'describe_table', { table: 'big_orders' });
  await record('lineage:source-has-none', 'describe_table', { table: 'customers' });

  await record('drop:source-refused', 'drop_derived', { name: 'orders' });
  await record('drop:unknown', 'drop_derived', { name: 'no_such_object' });
  // Names what a drop would orphan, and hands back the SQL that rebuilds it —
  // the two things that make undo comprehensible rather than surprising.
  await record('drop:orphan-warning', 'drop_derived', { name: 'big_orders' });
  await record('drop:view', 'drop_derived', { name: 'priority_orders' });
  await record('drop:already-dropped', 'drop_derived', { name: 'big_orders' });

  // A6's two. `create_chart` is pure computation over a result and runs
  // identically on either engine — including its refusals, which are the part
  // most worth pinning: a broker-illegal request has to name the same reason on
  // both, or the app and an external agent learn different grammars. The
  // harness core is headless, so `pin_result` refuses; that refusal is itself
  // the conformance claim, and the browser half is `analystWorkspace.test.ts`'s.
  await record('chart:temporal', 'create_chart', {
    sql: 'SELECT ordered_at, sum(amount) AS revenue FROM orders WHERE ordered_at IS NOT NULL GROUP BY 1 ORDER BY 1',
  });
  await record('chart:refined', 'create_chart', {
    sql: 'SELECT customer, sum(amount) AS revenue, count(*) AS orders FROM orders GROUP BY 1 ORDER BY 1',
    spec: { type: 'categorical', title: 'Revenue by customer', xField: 'customer', yFields: ['revenue'] },
  });
  await record('chart:invented-field', 'create_chart', {
    sql: 'SELECT customer, sum(amount) AS revenue FROM orders GROUP BY 1 ORDER BY 1',
    spec: { type: 'categorical', title: 'Margin by customer', xField: 'customer', yFields: ['margin'] },
  });
  await record('chart:unsupported-type', 'create_chart', {
    sql: 'SELECT customer, sum(amount) AS revenue FROM orders GROUP BY 1 ORDER BY 1',
    type: 'time-series',
  });
  await record('chart:mutation-refused', 'create_chart', { sql: 'UPDATE orders SET amount = 0' });
  await record('chart:both-inputs', 'create_chart', { sql: 'SELECT 1', resultId: 'r1' });
  await record('pin:headless', 'pin_result', { resultId: resultId ?? 'r1', title: 'Kept' });

  return steps;
}
