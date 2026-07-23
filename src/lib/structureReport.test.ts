import { describe, expect, it } from 'vitest';
import type { ClassifiedColumn, TableRegistryEntry } from '../types';
import type { TableInsights } from './dossier';
import type { FkEdge } from './relationshipInference';
import { buildStructureReport } from './structureReport';

const edge: FkEdge = {
  id: 'orders.customer_id->customers.id',
  childTable: 'orders',
  childColumn: 'customer_id',
  parentTable: 'customers',
  parentColumn: 'id',
  containment: 0.87,
  coverage: 0.9,
  parentKeyUniqueness: 1,
  nameAgreement: true,
  confidence: 'confident',
  confidenceScore: 0.87,
  evidence: '87% of `orders.customer_id` values appear in `customers.id`',
  source: 'inferred',
};

function column(name: string): ClassifiedColumn {
  return {
    name,
    semanticType: 'Quantitative',
    physicalType: 'DOUBLE',
    cardinality: 42,
    nullPercentage: 1.5,
    min: 0,
    max: 100,
    mean: 50,
    stdDev: 10,
    classificationReason: '99% unique',
  };
}

function table(overrides: Partial<TableRegistryEntry> & Pick<TableRegistryEntry, 'id' | 'tableName'>): TableRegistryEntry {
  return {
    datasetId: 'ds1',
    origin: 'file',
    rowCount: 100,
    columnCount: 1,
    memoryBytes: 1000,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildStructureReport', () => {
  it('carries schema, semantic types, and profile aggregates per table', () => {
    const t = table({ id: 't1', tableName: 'orders', columns: [column('amount')] });
    const report = buildStructureReport([t], []);
    expect(report.tables).toEqual([
      {
        tableName: 'orders',
        rowCount: 100,
        columnCount: 1,
        columns: [
          {
            name: 'amount',
            semanticType: 'Quantitative',
            physicalType: 'DOUBLE',
            nullPercentage: 1.5,
            cardinality: 42,
            classificationReason: '99% unique',
          },
        ],
      },
    ]);
  });

  it('flattens the insight feed with table attribution', () => {
    const t = table({ id: 't1', tableName: 'orders' });
    const tableInsights: TableInsights[] = [
      {
        table: t,
        insights: [{ id: 'x', rule: 'duplicates', description: '412 duplicate rows', sql: 'SELECT 1', effectSize: 1, coverage: 1 }],
      },
    ];
    const report = buildStructureReport([t], tableInsights);
    expect(report.insights).toEqual([{ tableName: 'orders', rule: 'duplicates', description: '412 duplicate rows' }]);
  });

  it('handles an unclassified table (no columns yet) without throwing', () => {
    const t = table({ id: 't1', tableName: 'orders' });
    const report = buildStructureReport([t], []);
    expect(report.tables[0].columns).toEqual([]);
  });

  it('is JSON-serializable and stamps a generatedAt timestamp', () => {
    const t = table({ id: 't1', tableName: 'orders' });
    const report = buildStructureReport([t], []);
    expect(() => JSON.parse(JSON.stringify(report))).not.toThrow();
    expect(new Date(report.generatedAt).toString()).not.toBe('Invalid Date');
  });

  it('includes the relationships section when edges are supplied (join graph on)', () => {
    const t = table({ id: 't1', tableName: 'orders' });
    const report = buildStructureReport([t], [], [edge]);
    expect(report.relationships).toEqual([
      {
        childTable: 'orders',
        childColumn: 'customer_id',
        parentTable: 'customers',
        parentColumn: 'id',
        confidence: 'confident',
        containment: 0.87,
        evidence: '87% of `orders.customer_id` values appear in `customers.id`',
      },
    ]);
  });

  it('omits the relationships field entirely when the graph is cut (no edges)', () => {
    const t = table({ id: 't1', tableName: 'orders' });
    expect(buildStructureReport([t], []).relationships).toBeUndefined();
    expect(buildStructureReport([t], [], []).relationships).toBeUndefined();
  });
});
