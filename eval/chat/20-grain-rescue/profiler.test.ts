// Validates the profiler's load-bearing claim (DESIGN.md §6): it must
// identify order_items as line-grain relative to orders, and generate a
// rollup view that recovers the correct order-grain average — all from
// inference over the data, never told "order_items is line-grain" directly.
// Cross-checks against the known-correct gold value from
// silverLayerProbe.ts's module comment (average completed order value =
// 1337.35, verified there against the same ecommerce sample).
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance } from '@duckdb/node-api';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { bootstrap } from '../17-duckdb-local-chat/bootstrap';
import {
  buildAllRollupViews,
  buildTableRegistry,
  describeGrain,
  describeGrainCorrupted,
  fanoutStats,
  inferEdges,
} from './profiler';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = join(HERE, '..', '..', '..', 'public', 'samples', 'ecommerce');
const DB_PATH = join(HERE, 'runs', 'test', 'profiler-ecommerce.duckdb');

describe('profiler against the ecommerce grain trap', () => {
  let conn: import('@duckdb/node-api').DuckDBConnection;

  beforeAll(async () => {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    if (existsSync(DB_PATH)) rmSync(DB_PATH);
    await bootstrap(DB_PATH, DATASET_DIR);
    const instance = await DuckDBInstance.create(DB_PATH);
    conn = await instance.connect();
  }, 60_000);

  afterAll(() => {
    conn?.closeSync();
  });

  it('infers order_items -> orders and orders -> customers as confident edges', async () => {
    const tables = await buildTableRegistry(conn, ['customers', 'products', 'orders', 'order_items']);
    const edges = await inferEdges(conn, tables);
    const orderItemsToOrders = edges.find((e) => e.childTable === 'order_items' && e.parentTable === 'orders');
    const ordersToCustomers = edges.find((e) => e.childTable === 'orders' && e.parentTable === 'customers');
    const orderItemsToProducts = edges.find((e) => e.childTable === 'order_items' && e.parentTable === 'products');
    expect(orderItemsToOrders?.confidence).toBe('confident');
    expect(ordersToCustomers?.confidence).toBe('confident');
    expect(orderItemsToProducts?.confidence).toBe('confident');
  });

  it('measures order_items as a genuine fanout child of orders (avg > 1.2x)', async () => {
    const fanout = await fanoutStats(conn, 'order_items', 'order_id');
    expect(fanout.avgRowsPerParentKey).toBeGreaterThan(1.2);
  });

  it('describes order_items grain as line-grain, and customers grain as one-row-per-entity', async () => {
    const tables = await buildTableRegistry(conn, ['customers', 'products', 'orders', 'order_items']);
    const edges = await inferEdges(conn, tables);
    const orderItemsTable = tables.find((t) => t.tableName === 'order_items')!;
    const customersTable = tables.find((t) => t.tableName === 'customers')!;
    const orderItemsGrain = await describeGrain(conn, orderItemsTable, edges);
    const customersGrain = await describeGrain(conn, customersTable, edges);
    expect(orderItemsGrain).toMatch(/line/i);
    expect(orderItemsGrain).toMatch(/fans out/i);
    expect(customersGrain).toMatch(/one row per customer/i);
    expect(customersGrain).not.toMatch(/fans out/i);
  });

  it('generates a rollup view whose quantity*unit_price sum recovers the known-correct average completed order value (1337.35)', async () => {
    const tables = await buildTableRegistry(conn, ['customers', 'products', 'orders', 'order_items']);
    const edges = await inferEdges(conn, tables);
    const views = await buildAllRollupViews(conn, edges, tables);

    const rollup = views.find((v) => v.viewName === 'order_items_rollup_by_orders');
    expect(rollup).toBeDefined();
    expect(rollup!.sql).toMatch(/quantity.*unit_price|unit_price.*quantity/i);

    await conn.run(rollup!.sql);
    const result = await conn.run(
      `SELECT ROUND(AVG(r.quantity_unit_price_product_sum), 2) AS avg_order_value
       FROM orders o JOIN order_items_rollup_by_orders r ON r.order_id = o.order_id
       WHERE o.status = 'completed'`,
    );
    const rows = await result.getRowsJS();
    const avgOrderValue = Number(rows[0]?.[0]);
    expect(avgOrderValue).toBeCloseTo(1337.35, 1);
  });

  it('describeGrainCorrupted (A1x negative control) swaps parent/child and negates the fanout ratio', async () => {
    const tables = await buildTableRegistry(conn, ['customers', 'products', 'orders', 'order_items']);
    const edges = await inferEdges(conn, tables);
    const orderItemsTable = tables.find((t) => t.tableName === 'order_items')!;
    const real = await describeGrain(conn, orderItemsTable, edges);
    const corrupted = await describeGrainCorrupted(conn, orderItemsTable, edges);
    expect(corrupted).not.toBe(real);
    // real: "order_items ... fans out under orders (~N.N ...)"; corrupted: "orders ... fans out under order_items (~-N.N ...)"
    expect(corrupted).toMatch(/orders is line-grain, not entity-grain: it fans out under order_items/);
    expect(corrupted).toMatch(/~-\d/);
  });

  it('also rolls up orders -> customers (1400 orders / 400 customers is a genuine fanout too)', async () => {
    const tables = await buildTableRegistry(conn, ['customers', 'products', 'orders', 'order_items']);
    const edges = await inferEdges(conn, tables);
    const views = await buildAllRollupViews(conn, edges, tables);
    const ordersRollup = views.find((v) => v.viewName === 'orders_rollup_by_customers');
    expect(ordersRollup).toBeDefined();
  });
});
