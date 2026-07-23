import { describe, expect, it } from 'vitest';
import { pruneSchema } from './schemaPrune';
import type { TableRegistryEntry } from '../types';
import type { FkEdge } from './relationshipInference';

function table(name: string, columns: Array<[string, string, string]>, rows = 100): TableRegistryEntry {
  return {
    id: name,
    tableName: name,
    datasetId: 'd1',
    origin: 'file',
    rowCount: rows,
    columnCount: columns.length,
    memoryBytes: 0,
    createdAt: '2026-07-21T00:00:00.000Z',
    columns: columns.map(([n, semanticType, physicalType]) => ({
      name: n,
      semanticType: semanticType as 'Quantitative' | 'Categorical' | 'Temporal' | 'Textual' | 'Identifier',
      physicalType,
      cardinality: 10,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    })),
  };
}

const SALES = table('sales', [
  ['product', 'Categorical', 'VARCHAR'],
  ['amount', 'Quantitative', 'DOUBLE'],
  ['order_date', 'Temporal', 'DATE'],
  ['customer_id', 'Identifier', 'BIGINT'],
]);
const CUSTOMERS = table('customers', [
  ['id', 'Identifier', 'BIGINT'],
  ['region', 'Categorical', 'VARCHAR'],
]);
const INVENTORY = table('inventory', [['sku', 'Identifier', 'VARCHAR'], ['qty', 'Quantitative', 'INTEGER']]);

describe('pruneSchema (§11.1 stage 2)', () => {
  it('includes only the table the question names, dropping unrelated tables', () => {
    const result = pruneSchema('total amount by product', [SALES, CUSTOMERS, INVENTORY]);
    expect(result.includedTables).toEqual(['sales']);
    expect(result.prompt).toContain('Table sales');
    expect(result.prompt).not.toContain('inventory');
  });

  it('renders each column with its semantic role and physical type (facts only)', () => {
    const result = pruneSchema('sales by product', [SALES]);
    expect(result.prompt).toContain('product: Categorical (VARCHAR)');
    expect(result.prompt).toContain('amount: Quantitative (DOUBLE)');
    // No provenance / versioning machinery on the per-turn path (D45).
    expect(result.prompt).not.toMatch(/dsps_version|provenance/i);
  });

  it('pulls in an FK-joinable neighbour of a mentioned table', () => {
    const edge: FkEdge = {
      childTable: 'sales',
      childColumn: 'customer_id',
      parentTable: 'customers',
      parentColumn: 'id',
      containment: 0.99,
      confidence: 'confident',
    } as FkEdge;
    const result = pruneSchema('revenue per region', [SALES, CUSTOMERS, INVENTORY], [edge]);
    // "region" names the customers table; the edge pulls sales in as its join partner.
    expect(result.includedTables.sort()).toEqual(['customers', 'sales']);
    expect(result.prompt).toContain('Relationships:');
    expect(result.prompt).toContain('sales.customer_id → customers.id');
    expect(result.includedTables).not.toContain('inventory');
  });

  it('falls back to the full schema when the question matches nothing', () => {
    const result = pruneSchema('what is interesting here', [SALES, CUSTOMERS, INVENTORY]);
    expect(result.includedTables.sort()).toEqual(['customers', 'inventory', 'sales']);
  });
});
