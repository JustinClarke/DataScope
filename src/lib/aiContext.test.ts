import { describe, expect, it } from "vitest";
import type { ClassifiedColumn, TableRegistryEntry } from "../types";
import { buildAIContext } from "./aiContext";
import type { FkEdge } from "./relationshipInference";

function column(name: string): ClassifiedColumn {
  return {
    name,
    semanticType: "Quantitative",
    physicalType: "DOUBLE",
    cardinality: 42,
    nullPercentage: 3,
    // Actual cell values — these must never appear in the AI context.
    min: "SECRET_MIN_VALUE",
    max: "SECRET_MAX_VALUE",
    mean: 123.45,
    stdDev: 10,
  };
}

function table(
  tableName: string,
  columns: ClassifiedColumn[],
): TableRegistryEntry {
  return {
    id: tableName,
    tableName,
    datasetId: "ds1",
    origin: "file",
    rowCount: 1000,
    columnCount: columns.length,
    memoryBytes: 1000,
    createdAt: "2026-01-01T00:00:00.000Z",
    columns,
  };
}

const edge: FkEdge = {
  id: "orders.customer_id->customers.id",
  childTable: "orders",
  childColumn: "customer_id",
  parentTable: "customers",
  parentColumn: "id",
  containment: 0.87,
  coverage: 0.9,
  parentKeyUniqueness: 1,
  nameAgreement: true,
  confidence: "confident",
  confidenceScore: 0.87,
  evidence: "87% of `orders.customer_id` values appear in `customers.id`",
  source: "inferred",
};

describe("buildAIContext", () => {
  it("describes the schema — tables, columns, types — without any raw cell values", () => {
    const context = buildAIContext([table("orders", [column("amount")])]);
    expect(context).toContain("## orders");
    expect(context).toContain("`amount`");
    expect(context).toContain("quantitative · DOUBLE");
    // Zero raw rows (D31): actual min/max cell values never leak.
    expect(context).not.toContain("SECRET_MIN_VALUE");
    expect(context).not.toContain("SECRET_MAX_VALUE");
  });

  it("includes the inferred relationships with confidence when edges are supplied", () => {
    const context = buildAIContext(
      [table("orders", [column("customer_id")])],
      [edge],
    );
    expect(context).toContain("Inferred relationships");
    expect(context).toContain("`orders.customer_id` → `customers.id`");
    expect(context).toContain("confident");
    expect(context).toContain("87%");
  });

  it("degrades to a schema-only block when no relationships are supplied (the cut path)", () => {
    const context = buildAIContext([table("orders", [column("customer_id")])]);
    expect(context).not.toContain("Inferred relationships");
    expect(context).toContain("shape only");
  });

  it("labels an unprofiled table rather than inventing columns", () => {
    const bare = table("raw", []);
    bare.columns = undefined;
    expect(buildAIContext([bare])).toContain("not yet profiled");
  });
});
