import { describe, it, expect } from "vitest";
import { buildCompletionItems } from "./completionProvider";
import type { TableRegistryEntry } from "../../types";

const baseTable: Omit<
  TableRegistryEntry,
  "id" | "tableName" | "origin" | "columns"
> = {
  datasetId: "dataset-1",
  rowCount: 10,
  columnCount: 2,
  memoryBytes: 1024,
  createdAt: new Date().toISOString(),
};

describe("buildCompletionItems", () => {
  it("returns no suggestions for an empty registry", () => {
    expect(buildCompletionItems([])).toEqual([]);
  });

  it("offers a table suggestion for every registered table", () => {
    const tables: TableRegistryEntry[] = [
      { ...baseTable, id: "t1", tableName: "orders", origin: "file" },
      { ...baseTable, id: "t2", tableName: "customers", origin: "file" },
    ];

    const items = buildCompletionItems(tables);
    const tableLabels = items
      .filter((i) => i.kind === "table")
      .map((i) => i.label);
    expect(tableLabels).toEqual(["orders", "customers"]);
  });

  it("labels a derived table distinctly from a file-origin table", () => {
    const tables: TableRegistryEntry[] = [
      { ...baseTable, id: "t1", tableName: "orders", origin: "file" },
      { ...baseTable, id: "t2", tableName: "big_spenders", origin: "derived" },
    ];

    const items = buildCompletionItems(tables);
    expect(items.find((i) => i.label === "orders")?.detail).toBe("table");
    expect(items.find((i) => i.label === "big_spenders")?.detail).toBe(
      "derived table",
    );
  });

  it("offers column suggestions sourced from classified columns", () => {
    const tables: TableRegistryEntry[] = [
      {
        ...baseTable,
        id: "t1",
        tableName: "orders",
        origin: "file",
        columns: [
          {
            name: "id",
            physicalType: "BIGINT",
            cardinality: 10,
            nullPercentage: 0,
            min: 1,
            max: 10,
            mean: null,
            stdDev: null,
            semanticType: "Identifier",
          },
          {
            name: "total",
            physicalType: "DOUBLE",
            cardinality: 10,
            nullPercentage: 0,
            min: 1,
            max: 99,
            mean: 50,
            stdDev: 10,
            semanticType: "Quantitative",
          },
        ],
      },
    ];

    const items = buildCompletionItems(tables);
    const columnItems = items.filter((i) => i.kind === "column");
    expect(columnItems.map((i) => i.label)).toEqual(["id", "total"]);
    expect(columnItems[0].detail).toBe("column · orders");
  });

  it("offers no column suggestions for a table not yet classified", () => {
    const tables: TableRegistryEntry[] = [
      { ...baseTable, id: "t1", tableName: "orders", origin: "file" },
    ];

    const items = buildCompletionItems(tables);
    expect(items.filter((i) => i.kind === "column")).toEqual([]);
  });

  it("reflects an updated registry snapshot (added, dropped, and derived tables)", () => {
    const initial: TableRegistryEntry[] = [
      { ...baseTable, id: "t1", tableName: "orders", origin: "file" },
    ];
    expect(buildCompletionItems(initial).map((i) => i.label)).toEqual([
      "orders",
    ]);

    const afterDropAndDerive: TableRegistryEntry[] = [
      {
        ...baseTable,
        id: "t2",
        tableName: "orders_summary",
        origin: "derived",
      },
    ];
    expect(
      buildCompletionItems(afterDropAndDerive).map((i) => i.label),
    ).toEqual(["orders_summary"]);
  });
});
