// Node-native DuckDB engine for the D40 eval harness (§11.4) — dev/CI only,
// never product runtime. The product app talks to DuckDB-Wasm through a
// browser Worker (src/workers/duckdb.worker.ts); this harness runs headless
// under Node via duckdb-wasm's synchronous Node binding (no browser, no
// Worker plumbing) so `npm run eval` needs nothing but Node.
import { createDuckDB, ConsoleLogger, LogLevel, NODE_RUNTIME } from '@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs';
import type { DuckDBBundles } from '@duckdb/duckdb-wasm';
import { DataType } from 'apache-arrow';
import path from 'node:path';
import type { QueryResult } from '../../src/types';

const require = (await import('node:module')).createRequire(import.meta.url);
const DUCKDB_DIST = path.dirname(require.resolve('@duckdb/duckdb-wasm'));

const MANUAL_BUNDLES: DuckDBBundles = {
  mvp: {
    mainModule: path.resolve(DUCKDB_DIST, 'duckdb-mvp.wasm'),
    mainWorker: path.resolve(DUCKDB_DIST, 'duckdb-node-mvp.worker.cjs'),
  },
  eh: {
    mainModule: path.resolve(DUCKDB_DIST, 'duckdb-eh.wasm'),
    mainWorker: path.resolve(DUCKDB_DIST, 'duckdb-node-eh.worker.cjs'),
  },
};

export interface EvalEngine {
  execute(sql: string): Promise<QueryResult>;
  /** `csvPath` must be an absolute filesystem path. */
  loadCsv(tableName: string, csvPath: string): Promise<void>;
  close(): Promise<void>;
}

function arrowToQueryResult(table: import('apache-arrow').Table, startedAt: number): QueryResult {
  const fields = table.schema.fields;
  const columnNames = fields.map((f) => f.name);
  const columnTypes = fields.map((f) => String(f.type));
  const rows: unknown[][] = [];
  for (const row of table) {
    rows.push(
      fields.map((field) => {
        const v = (row as unknown as Record<string, unknown>)[field.name];
        if (v === null || v === undefined) return v;
        if (typeof v === 'bigint') return Number(v);
        // Arrow hands DECIMAL values back as their raw unscaled integer (a
        // SUMMARIZE null_percentage of 5.39 arrives as "539"); apply the
        // type's scale so downstream parsers see the real number.
        if (DataType.isDecimal(field.type)) return Number(String(v)) / 10 ** field.type.scale;
        return v;
      }),
    );
  }
  return {
    columnNames,
    columnTypes,
    rows,
    rowCount: table.numRows,
    executionTimeMs: performance.now() - startedAt,
  };
}

export async function createEvalEngine(): Promise<EvalEngine> {
  const bundle = MANUAL_BUNDLES.eh!;
  const logger = new ConsoleLogger(LogLevel.WARNING);
  const bindings = await createDuckDB(MANUAL_BUNDLES, logger, NODE_RUNTIME);
  await bindings.instantiate(bundle.mainModule);
  const conn = bindings.connect();

  return {
    async execute(sql: string): Promise<QueryResult> {
      const t0 = performance.now();
      const table = conn.query(sql);
      return arrowToQueryResult(table, t0);
    },
    async loadCsv(tableName: string, csvPath: string): Promise<void> {
      conn.query(
        `CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${csvPath.replace(/'/g, "''")}')`,
      );
    },
    async close(): Promise<void> {
      conn.close();
      bindings.dispose?.();
    },
  };
}
