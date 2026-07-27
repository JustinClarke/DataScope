// Builds the structure-only fragment the synthesis call carries — the same
// rows-free boundary as the "Copy for AI" block and the share export: table and
// column names, semantic + physical types, and the aggregate profile signals
// already surfaced elsewhere (null %, distinct count). Deliberately excludes
// min/max/mean/stdDev for Quantitative columns: those are values, not
// structure, and a range can re-identify a small table. A Temporal column's
// earliest/latest is the one carve-out (S0 Probe A finding, 2026-07-26): it
// stays in the same D45 aggregate category as nullPercentage/cardinality, adds
// no re-identification exposure beyond what those already carry, and closes
// the one gap structure-only synthesis couldn't state on its own. Nothing here
// is a data row.
import type { TableRegistryEntry } from '../types'
import type { StructuralFacts } from '../../edge/protocol'

/** `ColumnProfile.min`/`max` come back VARCHAR-cast from SUMMARIZE even for a
 * DATE column (`src/lib/profile.ts`) — already a date string, never a raw
 * number, but typed loosely at the source. */
function asDateString(value: string | number | null): string | null {
  return value === null ? null : String(value)
}

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
        ...(column.semanticType === 'Temporal'
          ? { minDate: asDateString(column.min), maxDate: asDateString(column.max) }
          : {}),
      })),
    })),
  }
}
