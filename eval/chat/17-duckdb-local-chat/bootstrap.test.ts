import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from './bootstrap';
import { openBootstrapConnection } from './database';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), '17-duckdb-local-chat-bootstrap-'));
  temporaryDirectories.push(root);
  return root;
}

const REAL_DATASET_DIR = join(import.meta.dirname, '..', '..', '..', 'public', 'samples', 'ecommerce');

describe('bootstrap — against the real dataset', () => {
  it('loads exact row counts and records source hashes', async () => {
    const dir = await temporaryRoot();
    const dbPath = join(dir, 'test.duckdb');

    const report = await bootstrap(dbPath, REAL_DATASET_DIR);

    expect(report.tables.map((t) => [t.table, t.loadedRowCount])).toEqual([
      ['customers', 400],
      ['products', 150],
      ['orders', 1400],
      ['order_items', 3487],
    ]);
    for (const t of report.tables) {
      expect(t.loadedRowCount).toBe(t.expectedRowCount);
      expect(t.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('creates analytics views at the documented grain', async () => {
    const dir = await temporaryRoot();
    const dbPath = join(dir, 'test.duckdb');
    await bootstrap(dbPath, REAL_DATASET_DIR);

    const { conn, close } = await openBootstrapConnection(dbPath);
    try {
      // sales_lines is one row per order_item — same grain, same count.
      const lines = await (await conn.run('SELECT COUNT(*) FROM analytics.sales_lines')).getRowsJS();
      expect(Number(lines[0]![0])).toBe(3487);

      // order_totals is one row per order — same grain, same count.
      const totals = await (await conn.run('SELECT COUNT(*) FROM analytics.order_totals')).getRowsJS();
      expect(Number(totals[0]![0])).toBe(1400);
    } finally {
      close();
    }
  });

  it('records metadata for every source table', async () => {
    const dir = await temporaryRoot();
    const dbPath = join(dir, 'test.duckdb');
    await bootstrap(dbPath, REAL_DATASET_DIR);

    const { conn, close } = await openBootstrapConnection(dbPath);
    try {
      const rows = await (await conn.run('SELECT table_name, row_count FROM _bootstrap_meta ORDER BY table_name')).getRowsJS();
      expect(rows.map((r) => [String(r[0]), Number(r[1])])).toEqual([
        ['customers', 400],
        ['order_items', 3487],
        ['orders', 1400],
        ['products', 150],
      ]);
    } finally {
      close();
    }
  });

  it('overwrites any existing file at dbPath rather than patching in place', async () => {
    const dir = await temporaryRoot();
    const dbPath = join(dir, 'test.duckdb');
    await bootstrap(dbPath, REAL_DATASET_DIR);
    const second = await bootstrap(dbPath, REAL_DATASET_DIR);
    expect(second.tables.map((t) => t.loadedRowCount)).toEqual([400, 150, 1400, 3487]);
  });

  it('throws when a required source file is missing', async () => {
    const dir = await temporaryRoot();
    const emptyDatasetDir = await temporaryRoot();
    const dbPath = join(dir, 'test.duckdb');
    await expect(bootstrap(dbPath, emptyDatasetDir)).rejects.toThrow(/missing required source file/);
  });
});

describe('bootstrap — malformed source data', () => {
  it('rejects rather than silently drops a row violating the typed schema (verified: DuckDB raises its own constraint error on COPY, not a silent skip — the explicit NOT NULL/PRIMARY KEY schema in catalog.ts is what makes "reject malformed rows rather than silently skipping them" hold in practice)', async () => {
    const datasetDir = await temporaryRoot();
    const dbPath = join(join(await temporaryRoot()), 'test.duckdb');

    await writeFile(
      join(datasetDir, 'customers.csv'),
      'customer_id,name,email,country,signup_date\n1,Ann,ann@example.com,US,2022-01-01\n,Bad,bad@example.com,US,2022-01-02\n',
    );
    await writeFile(join(datasetDir, 'products.csv'), 'product_id,name,category,unit_price\n1,Widget,Home,9.99\n');
    await writeFile(join(datasetDir, 'orders.csv'), 'order_id,customer_id,order_date,status\n1,1,2022-01-01,completed\n');
    await writeFile(
      join(datasetDir, 'order_items.csv'),
      'order_item_id,order_id,product_id,quantity,unit_price\n1,1,1,2,9.99\n',
    );

    // A blank customer_id in a NOT NULL INTEGER PRIMARY KEY column: DuckDB's
    // COPY throws its own constraint error directly rather than loading a
    // short table — confirmed empirically, not assumed (a throwaway probe
    // script, not checked in).
    await expect(bootstrap(dbPath, datasetDir)).rejects.toThrow(/NOT NULL constraint failed/);
  });
});
