// The production-prompt scaffolding 16a introduced, extracted so 16b can reuse it.
//
// 16b's first arm has to reproduce 16a's prompt *exactly* — its whole job is to be
// the control that the other two arms are measured against. A copy of this code
// would let the two drift and silently break that comparison, the same argument
// that moved Probe 14's fixture into `nestedGrainFixture.ts`. So: one module, two
// importers.
//
// Everything here calls the real production functions rather than imitating their
// output, so a change to `classifyColumns` or `pruneSchema` shows up in the next
// run instead of quietly invalidating the result.
import type { createEvalEngine } from '../../duckdb/duckdb.js';
import { classifyColumns } from '../../../src/lib/classifier.js';
import type { ClassifiedColumn, ColumnProfile, TableRegistryEntry } from '../../../src/types/index.js';
import type { FkEdge } from '../../../src/lib/relationshipInference.js';

export const TABLES = ['customers', 'products', 'orders', 'order_items'];

/**
 * The FK edges `relationshipInference` would produce on this seed data, supplied
 * directly rather than by running the inference pass (which needs the app's
 * services layer, not the headless eval engine). Every one is a
 * containment-1.0 / name-agreeing edge by construction of the seed — `customer_id`
 * -> `customers`, `product_id` -> `products`, `order_id` -> `orders` — so all
 * three would land in the `confident` tier. `pruneSchema` reads only the four
 * table/column fields; the rest are filled to keep the object honest to its type.
 *
 * This is the one place these probes are *generous* to production: they assume
 * inference recovers all three edges. Noted as a caveat in both write-ups.
 */
function edge(childTable: string, childColumn: string, parentTable: string, parentColumn: string): FkEdge {
  return {
    id: `${childTable}.${childColumn}->${parentTable}.${parentColumn}`,
    childTable,
    childColumn,
    parentTable,
    parentColumn,
    containment: 1,
    coverage: 1,
    parentKeyUniqueness: 1,
    nameAgreement: true,
    confidence: 'confident',
    confidenceScore: 100,
    evidence: `100% of \`${childTable}.${childColumn}\` values appear in \`${parentTable}.${parentColumn}\``,
    source: 'inferred',
  };
}

export const EDGES: FkEdge[] = [
  edge('orders', 'customer_id', 'customers', 'customer_id'),
  edge('order_items', 'order_id', 'orders', 'order_id'),
  edge('order_items', 'product_id', 'products', 'product_id'),
];

/**
 * Profile one table the way §8 step 1 does, but only as far as the prompt needs.
 * `renderColumn()` reads name / semanticType / physicalType, and `classifyColumn()`
 * reads physicalType / cardinality / row count — so those four are computed for
 * real against DuckDB and the remaining `ColumnProfile` fields (min/max/mean/
 * stdDev/nullPercentage) are stubbed, because nothing on this path reads them.
 */
export async function profileTable(
  engine: Awaited<ReturnType<typeof createEvalEngine>>,
  tableName: string,
): Promise<TableRegistryEntry> {
  const described = await engine.execute(`DESCRIBE ${tableName}`);
  const rowCountResult = await engine.execute(`SELECT COUNT(*) FROM ${tableName}`);
  const rowCount = Number(rowCountResult.rows[0][0]);

  const profiles: ColumnProfile[] = [];
  for (const row of described.rows) {
    const name = String(row[0]);
    const physicalType = String(row[1]);
    const distinct = await engine.execute(`SELECT COUNT(DISTINCT "${name}") FROM ${tableName}`);
    profiles.push({
      name,
      physicalType,
      cardinality: Number(distinct.rows[0][0]),
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    });
  }

  const columns: ClassifiedColumn[] = classifyColumns(profiles, rowCount);

  return {
    id: tableName,
    tableName,
    // Inert on this path — `pruneSchema` reads tableName / rowCount / columns only.
    datasetId: '16-nested-grain',
    origin: 'file',
    rowCount,
    columnCount: columns.length,
    memoryBytes: 0,
    createdAt: new Date(0).toISOString(),
    profile: profiles,
    columns,
  };
}

/** Profile all four fixture tables, in the order production would register them. */
export async function buildTables(
  engine: Awaited<ReturnType<typeof createEvalEngine>>,
): Promise<TableRegistryEntry[]> {
  const tables: TableRegistryEntry[] = [];
  for (const name of TABLES) tables.push(await profileTable(engine, name));
  return tables;
}
