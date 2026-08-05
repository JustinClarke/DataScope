import type { TableRegistryEntry } from '../../../src/types';
import type { EvalEngine } from '../../duckdb/duckdb';
import type {
  ColumnRef,
  DatasetPassport,
  PassportColumn,
  PassportTable,
  QualityFinding,
  Relationship,
} from './contracts';

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function qualified(ref: ColumnRef): string {
  return `${quoteIdentifier(ref.table)}.${quoteIdentifier(ref.column)}`;
}

function comparableType(type: string): string {
  if (/INT|DECIMAL|DOUBLE|FLOAT|REAL|NUMERIC/i.test(type)) return 'number';
  if (/DATE|TIME/i.test(type)) return 'date';
  return type.toUpperCase();
}

async function buildTable(engine: EvalEngine, table: TableRegistryEntry): Promise<PassportTable> {
  const columns: PassportColumn[] = (table.columns ?? []).map((column) => ({
    table: table.tableName,
    column: column.name,
    physicalType: column.physicalType,
    semanticType: column.semanticType,
    distinctCount: column.cardinality,
    nullCount: Math.round(((column.nullPercentage ?? 0) / 100) * table.rowCount),
    min: column.min,
    max: column.max,
  }));
  const duplicateResult = await engine.execute(
    `SELECT COUNT(*) - (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM ${quoteIdentifier(table.tableName)})) AS duplicate_rows ` +
      `FROM ${quoteIdentifier(table.tableName)}`,
  );
  return {
    name: table.tableName,
    rowCount: table.rowCount,
    columns,
    candidateKeys: columns
      .filter(
        (column) =>
          column.distinctCount === table.rowCount &&
          column.nullCount === 0 &&
          /(^id$|_id$)/i.test(column.column),
      )
      .map((column) => column.column),
    duplicateRows: Number(duplicateResult.rows[0]?.[0] ?? 0),
  };
}

async function inferRelationships(engine: EvalEngine, tables: PassportTable[]): Promise<Relationship[]> {
  const relationships: Relationship[] = [];
  for (let leftIndex = 0; leftIndex < tables.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < tables.length; rightIndex++) {
      const left = tables[leftIndex]!;
      const right = tables[rightIndex]!;
      for (const leftColumn of left.columns) {
        const rightColumn = right.columns.find(
          (candidate) =>
            candidate.column === leftColumn.column &&
            comparableType(candidate.physicalType) === comparableType(leftColumn.physicalType),
        );
        if (!rightColumn) continue;
        const leftUnique = left.candidateKeys.includes(leftColumn.column);
        const rightUnique = right.candidateKeys.includes(rightColumn.column);
        if (leftUnique === rightUnique) continue;
        const one = leftUnique ? leftColumn : rightColumn;
        const many = leftUnique ? rightColumn : leftColumn;
        const orphanResult = await engine.execute(
          `SELECT COUNT(*) FROM ${quoteIdentifier(many.table)} m ` +
            `LEFT JOIN ${quoteIdentifier(one.table)} o ON m.${quoteIdentifier(many.column)} = o.${quoteIdentifier(one.column)} ` +
            `WHERE m.${quoteIdentifier(many.column)} IS NOT NULL AND o.${quoteIdentifier(one.column)} IS NULL`,
        );
        relationships.push({ one, many, orphanCount: Number(orphanResult.rows[0]?.[0] ?? 0) });
      }
    }
  }
  return relationships;
}

function buildQuality(tables: PassportTable[], relationships: Relationship[]): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const table of tables) {
    if (table.duplicateRows > 0) {
      findings.push({
        severity: 'warning',
        code: 'duplicates',
        message: `${table.name} has ${table.duplicateRows} duplicate rows.`,
      });
    }
    for (const column of table.columns) {
      if (column.nullCount > 0) {
        findings.push({
          severity: 'warning',
          code: 'nulls',
          message: `${table.name}.${column.column} has ${column.nullCount} null values.`,
        });
      }
      if (table.rowCount > 0 && column.distinctCount === 1) {
        findings.push({
          severity: 'info',
          code: 'constant',
          message: `${table.name}.${column.column} is constant.`,
        });
      }
    }
  }
  for (const relationship of relationships) {
    if (relationship.orphanCount > 0) {
      findings.push({
        severity: 'warning',
        code: 'orphans',
        message: `${relationship.many.table}.${relationship.many.column} has ${relationship.orphanCount} values without a matching ${relationship.one.table}.${relationship.one.column}.`,
      });
    }
  }
  return findings;
}

function dateRange(tables: PassportTable[]): { min: string; max: string } | null {
  const dates = tables
    .flatMap((table) => table.columns)
    .filter((column) => column.semanticType === 'Temporal' && column.min !== null && column.max !== null)
    .map((column) => ({ min: String(column.min), max: String(column.max) }));
  if (dates.length === 0) return null;
  return {
    min: dates.map((item) => item.min).sort()[0]!,
    max: dates.map((item) => item.max).sort().at(-1)!,
  };
}

export async function buildPassport(
  engine: EvalEngine,
  datasetId: string,
  registryTables: TableRegistryEntry[],
): Promise<DatasetPassport> {
  const tables: PassportTable[] = [];
  for (const table of registryTables) tables.push(await buildTable(engine, table));
  const relationships = await inferRelationships(engine, tables);
  return {
    datasetId,
    header: {
      tableCount: tables.length,
      totalRows: tables.reduce((sum, table) => sum + table.rowCount, 0),
      dateRange: dateRange(tables),
    },
    tables,
    relationships,
    quality: buildQuality(tables, relationships),
  };
}

export function compactPassport(passport: DatasetPassport): object {
  return {
    datasetId: passport.datasetId,
    header: passport.header,
    tables: passport.tables.map((table) => ({
      name: table.name,
      rowCount: table.rowCount,
      candidateKeys: table.candidateKeys,
      columns: table.columns.map((column) => ({
        name: column.column,
        type: column.physicalType,
        semanticType: column.semanticType,
        distinct: column.distinctCount,
        nulls: column.nullCount,
        min: column.min,
        max: column.max,
      })),
    })),
    relationships: passport.relationships,
    quality: passport.quality,
  };
}

export const passportSql = { quoteIdentifier, qualified };
