// CSV -> persistent DuckDB tables for all 5 sample datasets in one catalog —
// the realistic scenario (a user with every sample dataset loaded at once),
// and the harder test for FK inference: nothing stops `generateCandidates`
// from proposing a cross-dataset pair (e.g. some titanic column against some
// stock_prices column) if it happens to look key-like. Deliberately not
// scoped per-dataset so that risk is visible rather than designed away.
import { readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(HERE, '..', '..', '..', 'public', 'samples');

export interface TableSource {
  tableName: string;
  csvPath: string;
}

export const ALL_TABLE_SOURCES: TableSource[] = [
  { tableName: 'titanic', csvPath: join(SAMPLES_DIR, 'titanic.csv') },
  { tableName: 'weather', csvPath: join(SAMPLES_DIR, 'weather.csv') },
  { tableName: 'stock_prices', csvPath: join(SAMPLES_DIR, 'stock_prices.csv') },
  { tableName: 'product_reviews', csvPath: join(SAMPLES_DIR, 'product_reviews.csv') },
  { tableName: 'customers', csvPath: join(SAMPLES_DIR, 'ecommerce', 'customers.csv') },
  { tableName: 'products', csvPath: join(SAMPLES_DIR, 'ecommerce', 'products.csv') },
  { tableName: 'orders', csvPath: join(SAMPLES_DIR, 'ecommerce', 'orders.csv') },
  { tableName: 'order_items', csvPath: join(SAMPLES_DIR, 'ecommerce', 'order_items.csv') },
];

function csvRowCount(path: string): number {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n').filter((line, i, arr) => line.length > 0 || i < arr.length - 1);
  return Math.max(0, lines.length - 1);
}

export interface AllDatasetsBootstrapReport {
  dbPath: string;
  tables: Array<{ table: string; expectedRowCount: number; loadedRowCount: number }>;
}

/** Builds a fresh combined database at `dbPath` from all 8 base tables across the 5 sample datasets. Overwrites any existing file. */
export async function bootstrapAllDatasets(dbPath: string): Promise<{ conn: DuckDBConnection; report: AllDatasetsBootstrapReport; close: () => void }> {
  mkdirSync(dirname(dbPath), { recursive: true });
  if (existsSync(dbPath)) unlinkSync(dbPath);

  const instance = await DuckDBInstance.create(dbPath);
  const conn = await instance.connect();
  const tables: AllDatasetsBootstrapReport['tables'] = [];

  for (const source of ALL_TABLE_SOURCES) {
    const expectedRowCount = csvRowCount(source.csvPath);
    await conn.run(
      `CREATE TABLE ${source.tableName} AS SELECT * FROM read_csv_auto('${source.csvPath.replace(/'/g, "''")}')`,
    );
    const result = await conn.run(`SELECT COUNT(*) FROM ${source.tableName}`);
    const loadedRowCount = Number((await result.getRowsJS())[0]![0]);
    if (loadedRowCount !== expectedRowCount) {
      throw new Error(
        `bootstrap: ${source.tableName} loaded ${loadedRowCount} rows but ${source.csvPath} has ${expectedRowCount} data rows.`,
      );
    }
    tables.push({ table: source.tableName, expectedRowCount, loadedRowCount });
  }

  return { conn, report: { dbPath, tables }, close: () => conn.closeSync() };
}
