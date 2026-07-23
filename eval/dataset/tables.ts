// Loads the §14 bundled sample datasets into the eval engine and builds real
// `TableRegistryEntry[]` — profiled and classified exactly as the product
// does (same `parseSummarizeResult` + `classifyColumns` pipeline, §8), so the
// harness hands `askAI` the identical schema-prune input a real session
// would see. No second, harness-only classification path (D58).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSummarizeResult } from '../../src/lib/profile';
import { classifyColumns } from '../../src/lib/classifier';
import type { TableRegistryEntry } from '../../src/types';
import type { EvalEngine } from '../duckdb/duckdb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.resolve(__dirname, '../../public/samples');

export interface EvalDataset {
  /** Groups tables that belong to one question set (e.g. the 4-table ecommerce warehouse). */
  id: string;
  tables: TableRegistryEntry[];
}

const MANIFEST: { dataset: string; tableName: string; csv: string }[] = [
  { dataset: 'titanic', tableName: 'titanic', csv: 'titanic.csv' },
  { dataset: 'stock_prices', tableName: 'stock_prices', csv: 'stock_prices.csv' },
  { dataset: 'weather', tableName: 'weather', csv: 'weather.csv' },
  { dataset: 'product_reviews', tableName: 'product_reviews', csv: 'product_reviews.csv' },
  { dataset: 'ecommerce', tableName: 'customers', csv: 'ecommerce/customers.csv' },
  { dataset: 'ecommerce', tableName: 'products', csv: 'ecommerce/products.csv' },
  { dataset: 'ecommerce', tableName: 'orders', csv: 'ecommerce/orders.csv' },
  { dataset: 'ecommerce', tableName: 'order_items', csv: 'ecommerce/order_items.csv' },
];

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function exactDistinctCounts(
  engine: EvalEngine,
  tableName: string,
  columnNames: string[],
): Promise<Map<string, number>> {
  if (columnNames.length === 0) return new Map();
  const projections = columnNames
    .map((name, i) => `COUNT(DISTINCT ${quoteIdentifier(name)}) AS d${i}`)
    .join(', ');
  const result = await engine.execute(`SELECT ${projections} FROM ${quoteIdentifier(tableName)}`);
  const row = result.rows[0] ?? [];
  return new Map(columnNames.map((name, i) => [name, Number(row[i] ?? 0)]));
}

/** Loads every §14 sample table into `engine` and returns them grouped by dataset. */
export async function loadEvalDatasets(engine: EvalEngine): Promise<EvalDataset[]> {
  const byDataset = new Map<string, TableRegistryEntry[]>();

  for (const entry of MANIFEST) {
    const csvPath = path.resolve(SAMPLES_DIR, entry.csv);
    await engine.loadCsv(entry.tableName, csvPath);

    const summarize = await engine.execute(
      `SELECT column_name, column_type, min, max, approx_unique, avg, std, null_percentage
       FROM (SUMMARIZE ${quoteIdentifier(entry.tableName)})`,
    );
    const profile = parseSummarizeResult(summarize);

    const countResult = await engine.execute(`SELECT count(*) AS n FROM ${quoteIdentifier(entry.tableName)}`);
    const rowCount = Number(countResult.rows[0]?.[0] ?? 0);

    const exact = await exactDistinctCounts(engine, entry.tableName, profile.map((p) => p.name));
    const classifyInput = profile.map((p) => ({ ...p, cardinality: exact.get(p.name) ?? p.cardinality }));
    const columns = classifyColumns(classifyInput, rowCount);

    const table: TableRegistryEntry = {
      id: entry.tableName,
      tableName: entry.tableName,
      datasetId: entry.dataset,
      origin: 'sample',
      rowCount,
      columnCount: profile.length,
      memoryBytes: 0,
      createdAt: new Date().toISOString(),
      profile,
      columns,
    };

    const list = byDataset.get(entry.dataset) ?? [];
    list.push(table);
    byDataset.set(entry.dataset, list);
  }

  return [...byDataset.entries()].map(([id, tables]) => ({ id, tables }));
}
