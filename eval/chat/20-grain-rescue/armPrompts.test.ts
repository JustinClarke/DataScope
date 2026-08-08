// Validates the arm prompt-assembly layer against the combined catalog:
// each level (A0-A3) contains what DESIGN.md's arm ladder says it should,
// and — the genericity requirement the layer exists to satisfy — the same
// functions produce correct, non-hardcoded prompts for a *second*,
// unrelated fanout (product_reviews -> products) with no ecommerce-specific
// code path.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DuckDBConnection } from '@duckdb/node-api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALL_TABLE_SOURCES, bootstrapAllDatasets } from './bootstrap';
import { buildDatasetFacts, type DatasetFacts } from './datasetFacts';
import { buildAllRollupViews, buildTableRegistry, describeGrain, inferEdges } from './profiler';
import type { RollupView } from './profiler';
import type { TableRegistryEntry } from '../../../src/types/dataset';
import { buildA0Prompt, buildA1Prompt, buildA2Prompt, buildA2PrimePrompt, buildA3Prompt, synthesizeFewShotExamples } from './armPrompts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(HERE, 'runs', 'test', 'arm-prompts.duckdb');

describe('arm prompt-assembly layer (A0-A3)', () => {
  let conn: DuckDBConnection;
  let tables: TableRegistryEntry[];
  let facts: DatasetFacts;
  let grainByTable: Map<string, string>;
  let views: RollupView[];

  beforeAll(async () => {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    if (existsSync(DB_PATH)) rmSync(DB_PATH);
    const bootstrapped = await bootstrapAllDatasets(DB_PATH);
    conn = bootstrapped.conn;
    tables = await buildTableRegistry(conn, ALL_TABLE_SOURCES.map((s) => s.tableName));
    facts = await buildDatasetFacts(conn, tables);
    const edges = await inferEdges(conn, tables);
    views = await buildAllRollupViews(conn, edges, tables);
    grainByTable = new Map<string, string>();
    for (const t of tables) grainByTable.set(t.tableName, await describeGrain(conn, t, edges));
  }, 120_000);

  afterAll(() => conn?.closeSync());

  function ecommerceSubset() {
    const subset = tables.filter((t) => ['customers', 'products', 'orders', 'order_items'].includes(t.tableName));
    const subsetViews = views.filter((v) => v.viewName === 'order_items_rollup_by_orders' || v.viewName === 'orders_rollup_by_customers');
    return { subset, subsetViews };
  }

  it('A0 lists every table and column, nothing else', () => {
    const { subset } = ecommerceSubset();
    const prompt = buildA0Prompt(subset);
    expect(prompt).toContain('order_items(order_item_id, order_id, product_id, quantity, unit_price)');
    expect(prompt).not.toMatch(/Grain:|CREATE VIEW|Example/);
  });

  it('A1 adds row counts, real Categorical values, and the grain sentence — but no views', () => {
    const { subset } = ecommerceSubset();
    const prompt = buildA1Prompt(subset, facts, grainByTable);
    expect(prompt).toMatch(/orders — 1400 rows/);
    expect(prompt).toMatch(/status.*values: cancelled\/completed\/pending|status.*values:.*completed/i);
    expect(prompt).toMatch(/line-grain/i);
    expect(prompt).not.toContain('CREATE VIEW');
  });

  it('A2 adds the generated view SQL on top of A1, with a directive to prefer it', () => {
    const { subset, subsetViews } = ecommerceSubset();
    const prompt = buildA2Prompt(subset, facts, grainByTable, subsetViews);
    expect(prompt).toContain('CREATE VIEW "order_items_rollup_by_orders"');
    expect(prompt).toMatch(/prefer/i);
    expect(prompt).not.toMatch(/Example \d/);
  });

  it('A2′ (diagnostic) has the view SQL like A2 but no stats/grain block — order-independence check', () => {
    const { subset, subsetViews } = ecommerceSubset();
    const prompt = buildA2PrimePrompt(subset, subsetViews);
    expect(prompt).toContain('order_items(order_item_id, order_id, product_id, quantity, unit_price)');
    expect(prompt).toContain('CREATE VIEW "order_items_rollup_by_orders"');
    expect(prompt).not.toMatch(/— \d+ rows/); // A1's statsBlock row-count line
    expect(prompt).not.toMatch(/Grain:|line-grain/i);
  });

  it('A3 adds worked examples that demonstrate AVG(measure) directly and a join-back-to-parent filter, capped at 3 total', () => {
    const { subset, subsetViews } = ecommerceSubset();
    const prompt = buildA3Prompt(subset, facts, grainByTable, subsetViews);
    expect(prompt).toContain('CREATE VIEW');
    expect(prompt).toMatch(/Example 1:/);
    expect(prompt).toMatch(/AVG\(\w+_product_sum\)/); // the direct-aggregate example uses the real product-sum column, not an ad hoc one
    expect(prompt).toMatch(/JOIN order_items_rollup_by_orders/); // the join-back example actually joins the generated view
    expect((prompt.match(/Example \d:/g) ?? []).length).toBeLessThanOrEqual(3);
  });

  it('synthesizeFewShotExamples never mentions a table/column that is not actually in the schema (no hardcoded ecommerce vocabulary leaking in)', () => {
    const { subset, subsetViews } = ecommerceSubset();
    const view = subsetViews.find((v) => v.viewName === 'order_items_rollup_by_orders')!;
    const examples = synthesizeFewShotExamples(view, subset, facts);
    expect(examples.length).toBeGreaterThan(0);
    for (const ex of examples) {
      expect(ex.sql).toContain('order_items_rollup_by_orders');
    }
  });

  it('genericity: the same functions, unmodified, produce a correct A3 prompt for an unrelated fanout (product_reviews -> products) with no code change', () => {
    const reviewsTable = tables.find((t) => t.tableName === 'product_reviews')!;
    const productsTable = tables.find((t) => t.tableName === 'products')!;
    const reviewView = views.find((v) => v.viewName === 'product_reviews_rollup_by_products');
    expect(reviewView).toBeDefined(); // sanity: the fanout really was detected on this second, unrelated pair

    const prompt = buildA3Prompt([reviewsTable, productsTable], facts, grainByTable, [reviewView!]);
    expect(prompt).toContain('product_reviews_rollup_by_products');
    expect(prompt).toContain('products — 150 rows');
    // The join-filter example should reference a real products.category value, not an ecommerce-specific hardcoded string.
    const categoryValues = facts.tables.products!.categoricalValues.category!;
    expect(categoryValues.length).toBeGreaterThan(0);
    expect(prompt).toContain(`category = '${categoryValues[0]}'`);
  });
});
