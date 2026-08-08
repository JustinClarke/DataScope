// DESIGN.md §2: "the harness generates fixtures/dataset-facts.json (row
// count, column list, distinct count of every Categorical column, min/max of
// every Temporal column) and every question's premise is asserted against
// it — no question may name an entity dimension the data doesn't actually
// have." This is the gate that would have caught v1's weather.csv error
// (described as multi-city; it's 100% City='Springfield') at design time
// instead of in adversarial review (OPUS_REVIEW.md B1).
//
// Pure formatting + one DISTINCT-values query per Categorical column —
// everything else reuses the already-computed TableRegistryEntry
// (profiler.ts's buildTableRegistry), not re-derived.
import type { DuckDBConnection } from '@duckdb/node-api';
import type { TableRegistryEntry } from '../../../src/types/dataset';

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export interface TableFacts {
  rowCount: number;
  columns: string[];
  /** Every Categorical column's actual distinct values — a bare count can't catch "the data doesn't actually have city X", only the value list can. */
  categoricalValues: Record<string, Array<string | number>>;
  /** Every Temporal column's [min, max], as SUMMARIZE reports them. */
  temporalRange: Record<string, [string | number, string | number]>;
}

export interface DatasetFacts {
  generatedAt: string;
  tables: Record<string, TableFacts>;
}

export async function buildTableFacts(conn: DuckDBConnection, table: TableRegistryEntry): Promise<TableFacts> {
  const columns = table.columns ?? [];
  const categoricalValues: Record<string, Array<string | number>> = {};
  for (const col of columns) {
    if (col.semanticType !== 'Categorical') continue;
    const result = await conn.run(
      `SELECT DISTINCT ${quoteIdent(col.name)} FROM ${quoteIdent(table.tableName)} WHERE ${quoteIdent(col.name)} IS NOT NULL ORDER BY 1`,
    );
    const rows = await result.getRowsJS();
    categoricalValues[col.name] = rows.map((r) => (typeof r[0] === 'bigint' ? Number(r[0]) : (r[0] as string | number)));
  }

  const temporalRange: Record<string, [string | number, string | number]> = {};
  for (const col of columns) {
    if (col.semanticType !== 'Temporal') continue;
    temporalRange[col.name] = [col.min ?? '', col.max ?? ''];
  }

  return { rowCount: table.rowCount, columns: columns.map((c) => c.name), categoricalValues, temporalRange };
}

export async function buildDatasetFacts(conn: DuckDBConnection, tables: TableRegistryEntry[]): Promise<DatasetFacts> {
  const facts: Record<string, TableFacts> = {};
  for (const table of tables) facts[table.tableName] = await buildTableFacts(conn, table);
  return { generatedAt: new Date().toISOString(), tables: facts };
}
