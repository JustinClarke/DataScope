// Builds the structure-only fragment the synthesis call carries — the same
// rows-free boundary as the "Copy for AI" block and the share export: table and
// column names, semantic + physical types, and the aggregate profile signals
// already surfaced elsewhere (null %, distinct count). Deliberately excludes
// min/max/mean/stdDev: those are values, not structure, and a range can
// re-identify a small table. Nothing here is a data row.
import type { TableRegistryEntry } from '../types'
import type { StructuralFacts } from '../../edge/protocol'

export function buildStructuralFacts(tables: TableRegistryEntry[]): StructuralFacts {
  return {
    tables: tables.map((table) => ({
      name: table.tableName,
      rowCount: table.rowCount,
      columns: (table.columns ?? []).map((column) => ({
        name: column.name,
        semanticType: column.semanticType,
        physicalType: column.physicalType,
        nullPercentage: column.nullPercentage,
        cardinality: column.cardinality,
      })),
    })),
  }
}
