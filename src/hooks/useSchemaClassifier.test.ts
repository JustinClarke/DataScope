import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSchemaClassifier } from "./useSchemaClassifier";
import { useDatasetsStore } from "../stores/datasets";
import type { ClassifiedColumn, Dataset, TableRegistryEntry } from "../types";

const dataset: Dataset = {
  id: "ds-1",
  name: "titanic.csv",
  sourceType: "file",
  tableNames: ["titanic"],
  ingestedAt: "2026-07-19T00:00:00.000Z",
};

const columns: ClassifiedColumn[] = [
  {
    name: "Survived",
    physicalType: "BIGINT",
    semanticType: "Categorical",
    cardinality: 2,
    nullPercentage: 0,
    min: 0,
    max: 1,
    mean: null,
    stdDev: null,
    classificationReason:
      "low-cardinality numbers (2 distinct) — likely encoded categories",
  },
];

const table: TableRegistryEntry = {
  id: "tbl-1",
  tableName: "titanic",
  datasetId: "ds-1",
  origin: "file",
  rowCount: 891,
  columnCount: 1,
  memoryBytes: 4096,
  createdAt: "2026-07-19T00:00:00.000Z",
  columns,
};

beforeEach(() => {
  useDatasetsStore.setState({
    datasets: [],
    tables: [],
    workerStatus: "idle",
    workerError: null,
  });
});

describe("useSchemaClassifier", () => {
  it("reads a table's classified columns from the store", () => {
    useDatasetsStore.getState().registerDataset(dataset, [table]);

    const { result } = renderHook(() => useSchemaClassifier("tbl-1"));
    expect(result.current.columns).toEqual(columns);
  });

  it("returns undefined columns for an unknown or unbound table", () => {
    const { result } = renderHook(() => useSchemaClassifier("missing"));
    expect(result.current.columns).toBeUndefined();

    const { result: unbound } = renderHook(() => useSchemaClassifier());
    expect(unbound.current.columns).toBeUndefined();
  });

  it("reclassify overrides a column and the hook re-renders with the new value", () => {
    useDatasetsStore.getState().registerDataset(dataset, [table]);

    const { result } = renderHook(() => useSchemaClassifier("tbl-1"));
    act(() => result.current.reclassify("Survived", "Quantitative"));

    expect(result.current.columns?.[0]).toMatchObject({
      semanticType: "Quantitative",
      classificationReason: "Set manually to Quantitative",
    });
  });

  it("reclassify is a no-op when no table is bound", () => {
    useDatasetsStore.getState().registerDataset(dataset, [table]);

    const { result } = renderHook(() => useSchemaClassifier());
    act(() => result.current.reclassify("Survived", "Textual"));

    expect(useDatasetsStore.getState().tables[0].columns).toEqual(columns);
  });
});
