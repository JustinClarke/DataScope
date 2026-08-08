import type * as arrow from "apache-arrow";
import { DataType, util } from "apache-arrow";
import type { QueryResult } from "../types";

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

function bigintToCell(value: bigint): number | string {
  return value <= MAX_SAFE && value >= MIN_SAFE
    ? Number(value)
    : value.toString();
}

/**
 * DuckDB returns BIGINT columns as JS `bigint` and HUGEINT/DECIMAL columns
 * (e.g. `SUM(bigint_col)`, `SUMMARIZE`'s `null_percentage`) as Arrow's `BN` —
 * a `Uint32Array` subclass, not a bigint — which cannot be JSON-serialized
 * either and silently degrades to an indexed object `{0:.., 1:..}` if passed
 * through as-is. A plain HUGEINT has no fractional scale, so it collapses via
 * `bigNumToBigInt` like any other bigint; a DECIMAL's `BN` is the *unscaled*
 * integer (e.g. `25.00` stored as `2500` for `DECIMAL(9,2)`) — collapsing it
 * the same way silently returns a value 10^scale too large, so its type's
 * `scale` (found on the Arrow field, not the value) must divide it back down
 * first (`util.bigNumToNumber`'s own scale-aware path).
 */
function bigNumToCell(
  value: Uint32Array,
  type: arrow.DataType | undefined,
): number | string {
  // `DataType.isDecimal` compares Arrow's own `typeId`, not class identity.
  // `type instanceof Decimal` is the obvious spelling and it is wrong here:
  // apache-arrow ships dual ESM/CJS builds, so a DuckDB result carrying a
  // `Decimal` from one build fails `instanceof` against the other and the
  // value silently falls through to the unscaled-integer path — a DECIMAL(9,2)
  // of 25.00 rendering as 2500, with no error anywhere. Caught by A0's
  // two-engine conformance suite (`eval/analyst/conformance.test.ts`).
  if (DataType.isDecimal(type)) {
    return util.bigNumToNumber(
      value as unknown as Parameters<typeof util.bigNumToNumber>[0],
      type.scale,
    );
  }
  return bigintToCell(
    util.bigNumToBigInt(
      value as unknown as Parameters<typeof util.bigNumToBigInt>[0],
    ),
  );
}

export function normalizeCell(value: unknown, type?: arrow.DataType): unknown {
  if (typeof value === "bigint") return bigintToCell(value);
  if (value instanceof Uint32Array) return bigNumToCell(value, type);
  return value;
}

/**
 * Flatten an Arrow query result into the engine-agnostic `QueryResult` every
 * downstream module reads. Read column-major (Arrow's native layout) and emit
 * row-major so callers never touch Arrow types directly.
 */
export function tableToQueryResult(
  table: arrow.Table,
  executionTimeMs: number,
): QueryResult {
  const fields = table.schema.fields;
  const columnNames = fields.map((field) => field.name);
  const columnTypes = fields.map((field) => String(field.type));
  const columns = fields.map((_, index) => table.getChildAt(index));
  const rowCount = table.numRows;

  const rows: unknown[][] = new Array(rowCount);
  for (let r = 0; r < rowCount; r++) {
    const row: unknown[] = new Array(columns.length);
    for (let c = 0; c < columns.length; c++) {
      row[c] = normalizeCell(columns[c]?.get(r), fields[c]?.type);
    }
    rows[r] = row;
  }

  return { columnNames, columnTypes, rows, rowCount, executionTimeMs };
}
