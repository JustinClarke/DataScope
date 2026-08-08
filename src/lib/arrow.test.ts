import { describe, expect, it } from "vitest";
import { Decimal, Table, tableFromArrays, vectorFromArray } from "apache-arrow";
import { normalizeCell, tableToQueryResult } from "./arrow";

// Arrow represents a DECIMAL's underlying value as an unscaled 128-bit
// integer split across four 32-bit words (little-endian); build one exactly
// as duckdb-wasm's own DecimalBuilder does, without going through DuckDB.
function decimalWords(unscaled: number): Uint32Array {
  const words = new Uint32Array(4);
  words[0] = unscaled >>> 0;
  return words;
}

describe("tableToQueryResult", () => {
  it("maps names, types, and row-major values from an Arrow table", () => {
    const table = tableFromArrays({
      id: Int32Array.from([1, 2, 3]),
      name: ["a", "b", "c"],
    });

    const result = tableToQueryResult(table, 12);

    expect(result.columnNames).toEqual(["id", "name"]);
    expect(result.columnTypes[1]).toContain("Utf8");
    expect(result.rowCount).toBe(3);
    expect(result.rows).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
    expect(result.executionTimeMs).toBe(12);
  });

  it("collapses an in-range BIGINT column to a number", () => {
    const table = tableFromArrays({ n: BigInt64Array.from([1n, 42n]) });

    const result = tableToQueryResult(table, 0);

    expect(result.rows).toEqual([[1], [42]]);
    expect(typeof result.rows[0][0]).toBe("number");
  });

  it("preserves an empty result set with its columns intact", () => {
    const table = tableFromArrays({ id: Int32Array.from([]) });

    const result = tableToQueryResult(table, 5);

    expect(result.columnNames).toEqual(["id"]);
    expect(result.rowCount).toBe(0);
    expect(result.rows).toEqual([]);
  });

  // Real bug this surfaced (03-profiling/01-summary-statistics): SUMMARIZE's
  // null_percentage is DECIMAL(9,2) — 25.00% is stored as the unscaled
  // integer 2500. Reusing the plain HUGEINT collapse (bigNumToBigInt, no
  // scale) silently returned 2500 instead of 25.
  it("divides a DECIMAL column by its scale instead of returning the raw unscaled integer", () => {
    const type = new Decimal(2, 9);
    const vector = vectorFromArray(
      [decimalWords(2500), decimalWords(0), null],
      type,
    );
    const table = new Table({ pct: vector });

    const result = tableToQueryResult(table, 0);

    expect(result.rows).toEqual([[25], [0], [null]]);
  });
});

describe("normalizeCell", () => {
  it("keeps a BIGINT beyond Number.MAX_SAFE_INTEGER as a decimal string", () => {
    expect(normalizeCell(9007199254740993n)).toBe("9007199254740993");
  });

  it("passes through null and non-bigint values unchanged", () => {
    expect(normalizeCell(null)).toBeNull();
    expect(normalizeCell("hello")).toBe("hello");
    expect(normalizeCell(3.14)).toBe(3.14);
  });
});
