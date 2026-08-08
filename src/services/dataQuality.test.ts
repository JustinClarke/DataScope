import { describe, expect, it, vi } from "vitest";
import type {
  ClassifiedColumn,
  QueryResult,
  TableRegistryEntry,
} from "../types";
import { loadDatasetQualityReport } from "./dataQuality";

const duplicateCountByTable: Record<
  string,
  { total: number; distinct: number }
> = {};

vi.mock("../workers/duckdb.worker", () => ({
  duckDBEngine: {
    execute: vi.fn((sql: string): Promise<QueryResult> => {
      const tableName = Object.keys(duplicateCountByTable).find((name) =>
        sql.includes(`"${name}"`),
      );
      const counts =
        tableName !== undefined
          ? duplicateCountByTable[tableName]
          : { total: 0, distinct: 0 };
      return Promise.resolve({
        columnNames: ["total", "distinct_count"],
        columnTypes: ["Int64", "Int64"],
        rows: [[counts.total, counts.distinct]],
        rowCount: 1,
        executionTimeMs: 0,
      });
    }),
  },
}));

function column(
  overrides: Partial<ClassifiedColumn> &
    Pick<ClassifiedColumn, "name" | "semanticType">,
): ClassifiedColumn {
  return {
    physicalType: "VARCHAR",
    cardinality: 0,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
    ...overrides,
  };
}

function table(
  overrides: Partial<TableRegistryEntry> &
    Pick<TableRegistryEntry, "id" | "tableName">,
): TableRegistryEntry {
  return {
    datasetId: "ds-1",
    origin: "sample",
    rowCount: 100,
    columnCount: 1,
    memoryBytes: 100,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("loadDatasetQualityReport", () => {
  it("aggregates findings across tables with table-qualified descriptions, and clean rules land in passedRules", async () => {
    duplicateCountByTable.customers = { total: 100, distinct: 100 };
    duplicateCountByTable.orders = { total: 100, distinct: 100 };

    const customers = table({
      id: "t-customers",
      tableName: "customers",
      columns: [
        column({
          name: "email",
          semanticType: "Categorical",
          nullPercentage: 61,
        }),
        column({ name: "status", semanticType: "Categorical", cardinality: 1 }),
      ],
    });
    const orders = table({
      id: "t-orders",
      tableName: "orders",
      columns: [
        column({ name: "id", semanticType: "Identifier", cardinality: 100 }),
      ],
    });

    const report = await loadDatasetQualityReport([customers, orders]);

    expect(
      report.warnings.some(
        (w) =>
          w.rule === "null-pattern" &&
          w.description.includes("customers.email"),
      ),
    ).toBe(true);
    expect(
      report.warnings.some(
        (w) =>
          w.rule === "zero-variance" &&
          w.description.includes("customers.status"),
      ),
    ).toBe(true);
    expect(report.passedRules).toContain("duplicates");
    expect(report.passedRules).not.toContain("null-pattern");
    expect(report.passedRules).not.toContain("zero-variance");
  });

  it("a rule with zero findings anywhere across the dataset lands in passedRules, not warnings", async () => {
    duplicateCountByTable.customers = { total: 100, distinct: 100 };

    const customers = table({
      id: "t-customers",
      tableName: "customers",
      columns: [
        column({ name: "id", semanticType: "Identifier", cardinality: 100 }),
      ],
    });

    const report = await loadDatasetQualityReport([customers]);

    expect(report.warnings).toHaveLength(0);
    expect(report.passedRules.sort()).toEqual([
      "duplicates",
      "null-pattern",
      "zero-variance",
    ]);
  });

  it("a table with columns undefined contributes no null/zero-variance findings but still runs the duplicates probe", async () => {
    duplicateCountByTable.pending = { total: 100, distinct: 88 };

    const pending = table({ id: "t-pending", tableName: "pending" });

    const report = await loadDatasetQualityReport([pending]);

    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0].rule).toBe("duplicates");
    expect(report.warnings[0].description).toContain("pending");
    expect(report.warnings[0].tableId).toBe("t-pending");
  });

  it("with zero registered tables, every rule passes trivially and no engine call is needed", async () => {
    const report = await loadDatasetQualityReport([]);
    expect(report.warnings).toHaveLength(0);
    expect(report.passedRules.sort()).toEqual([
      "duplicates",
      "null-pattern",
      "zero-variance",
    ]);
  });
});
