import { describe, expect, it } from "vitest";
import {
  buildPivotSql,
  pivotOutputColumns,
  type PivotSpec,
} from "./pivotCompiler";

const base: PivotSpec = {
  table: "orders",
  rows: [],
  columns: [],
  values: [],
};

describe("pivotOutputColumns", () => {
  it("lists grouping keys first, then one alias per value field", () => {
    const spec: PivotSpec = {
      ...base,
      rows: ["region"],
      columns: ["quarter"],
      values: [{ field: "amount", aggregate: "sum" }],
    };
    expect(pivotOutputColumns(spec)).toEqual([
      "region",
      "quarter",
      "sum_amount",
    ]);
  });

  it("dedupes a repeated aggregate_field alias with a numeric suffix", () => {
    const spec: PivotSpec = {
      ...base,
      values: [
        { field: "amount", aggregate: "sum" },
        { field: "amount", aggregate: "sum" },
      ],
    };
    expect(pivotOutputColumns(spec)).toEqual(["sum_amount", "sum_amount_2"]);
  });

  it("sanitizes a field with non-identifier characters into a valid alias", () => {
    const spec: PivotSpec = {
      ...base,
      values: [{ field: "order total ($)", aggregate: "avg" }],
    };
    expect(pivotOutputColumns(spec)).toEqual(["avg_order_total"]);
  });
});

describe("buildPivotSql", () => {
  it("throws on an empty spec", () => {
    expect(() => buildPivotSql(base)).toThrow(/empty/i);
  });

  it("compiles rows + one value field to a plain GROUP BY", () => {
    const spec: PivotSpec = {
      ...base,
      rows: ["region"],
      values: [{ field: "amount", aggregate: "sum" }],
    };
    expect(buildPivotSql(spec)).toBe(
      'SELECT "region", SUM("amount") AS "sum_amount"\nFROM "orders"\nGROUP BY 1',
    );
  });

  it("compiles rows + columns as one flat grouping-key list, rows first", () => {
    const spec: PivotSpec = {
      ...base,
      rows: ["region"],
      columns: ["quarter"],
      values: [{ field: "amount", aggregate: "sum" }],
    };
    expect(buildPivotSql(spec)).toBe(
      'SELECT "region", "quarter", SUM("amount") AS "sum_amount"\nFROM "orders"\nGROUP BY 1, 2',
    );
  });

  it("compiles multiple value fields with different aggregates", () => {
    const spec: PivotSpec = {
      ...base,
      rows: ["region"],
      values: [
        { field: "amount", aggregate: "sum" },
        { field: "amount", aggregate: "avg" },
        { field: "order_id", aggregate: "count" },
      ],
    };
    expect(buildPivotSql(spec)).toBe(
      'SELECT "region", SUM("amount") AS "sum_amount", AVG("amount") AS "avg_amount", COUNT(*) AS "count_order_id"\n' +
        'FROM "orders"\nGROUP BY 1',
    );
  });

  it("compiles values with no rows or columns as an ungrouped aggregate", () => {
    const spec: PivotSpec = {
      ...base,
      values: [{ field: "amount", aggregate: "sum" }],
    };
    expect(buildPivotSql(spec)).toBe(
      'SELECT SUM("amount") AS "sum_amount"\nFROM "orders"',
    );
  });

  it("applies ROLLUP over the grouping keys when subtotals is true", () => {
    const spec: PivotSpec = {
      ...base,
      rows: ["region", "city"],
      values: [{ field: "amount", aggregate: "sum" }],
      subtotals: true,
    };
    expect(buildPivotSql(spec)).toBe(
      'SELECT "region", "city", SUM("amount") AS "sum_amount"\nFROM "orders"\nGROUP BY ROLLUP("region", "city")',
    );
  });

  it("applies a top-N semi-join ranked by the first value field", () => {
    const spec: PivotSpec = {
      ...base,
      rows: ["customer"],
      values: [{ field: "amount", aggregate: "sum" }],
      topN: { field: "customer", n: 20 },
    };
    expect(buildPivotSql(spec)).toBe(
      'SELECT "customer", SUM("amount") AS "sum_amount"\nFROM "orders"\n' +
        'WHERE "customer" IN (SELECT "customer" FROM "orders" GROUP BY 1 ORDER BY SUM("amount") DESC LIMIT 20)\n' +
        "GROUP BY 1",
    );
  });

  it("ranks a top-N semi-join by row count when there are no value fields", () => {
    const spec: PivotSpec = {
      ...base,
      rows: ["customer"],
      topN: { field: "customer", n: 5 },
    };
    expect(buildPivotSql(spec)).toBe(
      'SELECT "customer"\nFROM "orders"\n' +
        'WHERE "customer" IN (SELECT "customer" FROM "orders" GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 5)\n' +
        "GROUP BY 1",
    );
  });

  it("applies ORDER BY on the given output column index and direction", () => {
    const spec: PivotSpec = {
      ...base,
      rows: ["region"],
      values: [{ field: "amount", aggregate: "sum" }],
      sort: { columnIndex: 1, direction: "desc" },
    };
    expect(buildPivotSql(spec)).toBe(
      'SELECT "region", SUM("amount") AS "sum_amount"\nFROM "orders"\nGROUP BY 1\nORDER BY 2 DESC',
    );
  });

  it("quotes identifiers containing double quotes", () => {
    const spec: PivotSpec = {
      ...base,
      rows: ['weird"col'],
      values: [{ field: "amount", aggregate: "sum" }],
    };
    expect(buildPivotSql(spec)).toBe(
      'SELECT "weird""col", SUM("amount") AS "sum_amount"\nFROM "orders"\nGROUP BY 1',
    );
  });
});
