// Sanity pass for the profiler against the remaining four sample datasets
// (§6: "Test the profiler against all five datasets"). Lighter-touch than
// profiler.test.ts's ecommerce assertions — these datasets don't carry the
// same grain trap, so the bar here is "doesn't crash, grain reads sensibly,
// and the cross-file join (product_reviews.ProductId -> products.product_id,
// a real casing mismatch) is actually found."
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTableRegistry, describeGrain, inferEdges } from './profiler';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(HERE, '..', '..', '..', 'public', 'samples');
const DB_PATH = join(HERE, 'runs', 'test', 'profiler-other.duckdb');

async function loadCsv(conn: DuckDBConnection, tableName: string, csvPath: string): Promise<void> {
  await conn.run(`CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${csvPath.replace(/'/g, "''")}')`);
}

describe('profiler against titanic.csv (flat, single table)', () => {
  let conn: DuckDBConnection;
  beforeAll(async () => {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    if (existsSync(DB_PATH)) rmSync(DB_PATH);
    const instance = await DuckDBInstance.create(DB_PATH);
    conn = await instance.connect();
    await loadCsv(conn, 'titanic', join(SAMPLES_DIR, 'titanic.csv'));
  }, 60_000);
  afterAll(() => conn?.closeSync());

  it('profiles and classifies without error, no FK edges on a single table, grain is one-row-per-entity', async () => {
    const tables = await buildTableRegistry(conn, ['titanic']);
    expect(tables[0]!.rowCount).toBe(891);
    const ageCol = tables[0]!.columns!.find((c) => c.name === 'Age');
    expect(ageCol?.nullPercentage).toBeGreaterThan(0); // known nulls in Age
    const edges = await inferEdges(conn, tables);
    expect(edges).toHaveLength(0);
    const grain = await describeGrain(conn, tables[0]!, edges);
    expect(grain).toMatch(/one row per titanic/i);
  });
});

describe('profiler against weather.csv (multi-entity time series, no FK table)', () => {
  let conn: DuckDBConnection;
  beforeAll(async () => {
    const instance = await DuckDBInstance.create(':memory:');
    conn = await instance.connect();
    await loadCsv(conn, 'weather', join(SAMPLES_DIR, 'weather.csv'));
  }, 60_000);
  afterAll(() => conn?.closeSync());

  it('profiles City as Categorical (low cardinality) and finds no FK edges (City is a value column, not a key)', async () => {
    const tables = await buildTableRegistry(conn, ['weather']);
    expect(tables[0]!.rowCount).toBe(3650);
    const cityCol = tables[0]!.columns!.find((c) => c.name === 'City');
    expect(cityCol?.semanticType).toBe('Categorical');
    const edges = await inferEdges(conn, tables);
    expect(edges).toHaveLength(0);
  });
});

describe('profiler against stock_prices.csv (single-entity OHLCV)', () => {
  let conn: DuckDBConnection;
  beforeAll(async () => {
    const instance = await DuckDBInstance.create(':memory:');
    conn = await instance.connect();
    await loadCsv(conn, 'stock_prices', join(SAMPLES_DIR, 'stock_prices.csv'));
  }, 60_000);
  afterAll(() => conn?.closeSync());

  it('profiles cleanly with all-numeric OHLCV columns classified Quantitative', async () => {
    const tables = await buildTableRegistry(conn, ['stock_prices']);
    expect(tables[0]!.rowCount).toBe(2500);
    const closeCol = tables[0]!.columns!.find((c) => c.name === 'Close');
    expect(closeCol?.semanticType).toBe('Quantitative');
  });
});

describe('profiler against product_reviews.csv + ecommerce/products.csv (cross-file join, casing mismatch)', () => {
  let conn: DuckDBConnection;
  beforeAll(async () => {
    const instance = await DuckDBInstance.create(':memory:');
    conn = await instance.connect();
    await loadCsv(conn, 'product_reviews', join(SAMPLES_DIR, 'product_reviews.csv'));
    await loadCsv(conn, 'products', join(SAMPLES_DIR, 'ecommerce', 'products.csv'));
  }, 60_000);
  afterAll(() => conn?.closeSync());

  it('finds product_reviews.ProductId -> products.product_id despite the casing mismatch', async () => {
    const tables = await buildTableRegistry(conn, ['product_reviews', 'products']);
    const edges = await inferEdges(conn, tables);
    const edge = edges.find((e) => e.childTable === 'product_reviews' && e.parentTable === 'products');
    expect(edge).toBeDefined();
    expect(edge!.childColumn).toBe('ProductId');
    expect(edge!.parentColumn).toBe('product_id');
  });
});
