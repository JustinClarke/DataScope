import type { ColumnProfile, QueryResult } from '../types';

/**
 * DuckDB's `SUMMARIZE` casts `min`/`max`/`avg`/`std` to VARCHAR for every
 * column — even a BIGINT column's min comes back as the string `"1"`, and a
 * DATE column's avg as a formatted mean-timestamp string like
 * `"2024-02-11 08:00:00"` — so a non-numeric string here isn't malformed
 * data, just a column type `avg`/`std` doesn't apply to. `ColumnProfile.mean`/
 * `stdDev` are `number | null`, so anything that doesn't parse to a finite
 * number collapses to `null` rather than `NaN`.
 */
function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parses the row shape of `SELECT column_name, column_type, min, max,
 * approx_unique, avg, std, null_percentage FROM (SUMMARIZE tbl)` into
 * `ColumnProfile[]` (§8 step 1). Column order isn't assumed — indices are
 * resolved by name so a future added/reordered SUMMARIZE column doesn't
 * silently misalign fields.
 */
export function parseSummarizeResult(result: QueryResult): ColumnProfile[] {
  const columnIndex = (name: string): number => {
    const index = result.columnNames.indexOf(name);
    if (index === -1) throw new Error(`SUMMARIZE result is missing expected column "${name}".`);
    return index;
  };

  const nameIdx = columnIndex('column_name');
  const typeIdx = columnIndex('column_type');
  const minIdx = columnIndex('min');
  const maxIdx = columnIndex('max');
  const uniqueIdx = columnIndex('approx_unique');
  const avgIdx = columnIndex('avg');
  const stdIdx = columnIndex('std');
  const nullPctIdx = columnIndex('null_percentage');

  return result.rows.map((row) => ({
    name: String(row[nameIdx]),
    physicalType: String(row[typeIdx]),
    cardinality: Number(row[uniqueIdx] ?? 0),
    nullPercentage: toNullableNumber(row[nullPctIdx]),
    min: row[minIdx] as string | number | null,
    max: row[maxIdx] as string | number | null,
    mean: toNullableNumber(row[avgIdx]),
    stdDev: toNullableNumber(row[stdIdx]),
  }));
}
