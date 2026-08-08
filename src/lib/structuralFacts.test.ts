import { describe, expect, it } from "vitest";
import { buildStructuralFacts } from "./structuralFacts";
import type { ClassifiedColumn, TableRegistryEntry } from "../types";

function column(overrides: Partial<ClassifiedColumn>): ClassifiedColumn {
  return {
    name: "col",
    physicalType: "VARCHAR",
    cardinality: 10,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
    semanticType: "Categorical",
    ...overrides,
  };
}

function table(columns: ClassifiedColumn[]): TableRegistryEntry {
  return {
    id: "t1",
    tableName: "orders",
    datasetId: "d1",
    origin: "file",
    rowCount: 10,
    columnCount: columns.length,
    memoryBytes: 100,
    createdAt: "2026-07-23T00:00:00.000Z",
    columns,
  };
}

describe("buildStructuralFacts", () => {
  it("carries minDate/maxDate for a Temporal column", () => {
    const facts = buildStructuralFacts([
      table([
        column({
          name: "order_date",
          semanticType: "Temporal",
          min: "2021-01-01",
          max: "2024-01-15",
        }),
      ]),
    ]);
    expect(facts.tables[0].columns[0]).toMatchObject({
      minDate: "2021-01-01",
      maxDate: "2024-01-15",
    });
  });

  it("never carries min/max/mean/stdDev for a non-Temporal column", () => {
    const facts = buildStructuralFacts([
      table([
        column({
          name: "amount",
          semanticType: "Quantitative",
          min: 0,
          max: 500,
          mean: 42,
          stdDev: 3,
        }),
      ]),
    ]);
    expect(facts.tables[0].columns[0]).not.toHaveProperty("minDate");
    expect(facts.tables[0].columns[0]).not.toHaveProperty("maxDate");
    expect(Object.keys(facts.tables[0].columns[0])).toEqual([
      "name",
      "semanticType",
      "physicalType",
      "nullPercentage",
      "cardinality",
    ]);
  });

  it("reports null minDate/maxDate for a Temporal column with no non-null values", () => {
    const facts = buildStructuralFacts([
      table([column({ name: "order_date", semanticType: "Temporal" })]),
    ]);
    expect(facts.tables[0].columns[0]).toMatchObject({
      minDate: null,
      maxDate: null,
    });
  });
});
