// CSV -> persistent DuckDB tables and analytics views (build order step 1).
//
// Bootstrap and chat use different connections (experiment doc, "Database
// bootstrap"): this module only ever touches the read-write connection, reads
// the four named CSVs, and returns after recording hashes and row counts. It
// never sees a model call.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ANALYTICS_VIEW_DDL, SOURCE_TABLE_DDL } from './catalog';
import { openBootstrapConnection } from './database';

const SOURCE_FILES = ['customers.csv', 'products.csv', 'orders.csv', 'order_items.csv'] as const;

/** Static, trusted DDL text only — never run against untrusted input. */
function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** CSV data-row count (total lines minus the header), independent of what DuckDB actually loads. */
function csvRowCount(path: string): number {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n').filter((line, i, arr) => line.length > 0 || i < arr.length - 1);
  return Math.max(0, lines.length - 1);
}

export interface TableBootstrapInfo {
  table: string;
  sourceFile: string;
  sha256: string;
  expectedRowCount: number;
  loadedRowCount: number;
}

export interface BootstrapReport {
  dbPath: string;
  tables: TableBootstrapInfo[];
  bootstrappedAt: string;
}

/**
 * Builds a fresh database at `dbPath` from the four CSVs in `datasetDir`.
 * Overwrites any existing file at `dbPath` — bootstrap output is always
 * regenerated, never patched in place.
 */
export async function bootstrap(dbPath: string, datasetDir: string): Promise<BootstrapReport> {
  for (const file of SOURCE_FILES) {
    const path = join(datasetDir, file);
    if (!existsSync(path)) throw new Error(`bootstrap: missing required source file ${path}`);
  }
  if (existsSync(dbPath)) unlinkSync(dbPath);

  const { conn, exec, close } = await openBootstrapConnection(dbPath);
  try {
    for (const statement of splitStatements(SOURCE_TABLE_DDL)) await exec(statement);

    // Parent tables before children, so DuckDB's FOREIGN KEY constraints never
    // reject a row for a parent that has not loaded yet.
    const loadOrder: Array<{ table: string; file: (typeof SOURCE_FILES)[number] }> = [
      { table: 'customers', file: 'customers.csv' },
      { table: 'products', file: 'products.csv' },
      { table: 'orders', file: 'orders.csv' },
      { table: 'order_items', file: 'order_items.csv' },
    ];

    const tables: TableBootstrapInfo[] = [];
    for (const { table, file } of loadOrder) {
      const path = join(datasetDir, file);
      const expectedRowCount = csvRowCount(path);
      const sha256 = sha256File(path);

      await exec(`COPY ${table} FROM '${path.replace(/'/g, "''")}' (HEADER)`);

      const result = await conn.run(`SELECT COUNT(*) FROM ${table}`);
      const loadedRowCount = Number((await result.getRowsJS())[0]![0]);
      if (loadedRowCount !== expectedRowCount) {
        throw new Error(
          `bootstrap: ${table} loaded ${loadedRowCount} rows but ${file} has ${expectedRowCount} data rows — ` +
            'DuckDB may have silently skipped malformed rows; refusing to proceed.',
        );
      }
      tables.push({ table, sourceFile: basename(file), sha256, expectedRowCount, loadedRowCount });
    }

    for (const statement of splitStatements(ANALYTICS_VIEW_DDL)) await exec(statement);

    const bootstrappedAt = new Date().toISOString();
    await exec(
      'CREATE TABLE _bootstrap_meta (table_name VARCHAR, source_file VARCHAR, sha256 VARCHAR, row_count BIGINT, bootstrapped_at TIMESTAMP)',
    );
    for (const t of tables) {
      await exec(
        `INSERT INTO _bootstrap_meta VALUES ('${t.table}', '${t.sourceFile}', '${t.sha256}', ${t.loadedRowCount}, TIMESTAMP '${bootstrappedAt.replace('T', ' ').replace('Z', '')}')`,
      );
    }

    return { dbPath, tables, bootstrappedAt };
  } finally {
    close();
  }
}
