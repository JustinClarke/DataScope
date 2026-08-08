import { beforeEach, describe, expect, it } from "vitest";
import {
  isSourceMutation,
  MutationGuardRequired,
  TransformError,
} from "./transforms";
import { classifyStatement } from "../lib/statementClass";
import { useDatasetsStore } from "../stores/datasets";
import type { Dataset, TableRegistryEntry } from "../types";

// runTransform/materializeInsteadOfMutation/forceMutation need a live DuckDB
// worker (a real browser), so they are verified separately, not here — see
// statementClass.test.ts for the pure classification logic they build on.
// isSourceMutation is the one function in this service that's reachable
// without an engine (it only reads the store), so it's covered directly.

const dataset: Dataset = {
  id: "ds-1",
  name: "orders.csv",
  sourceType: "file",
  tableNames: ["orders"],
  ingestedAt: "2026-07-20T00:00:00.000Z",
};

const sourceTable: TableRegistryEntry = {
  id: "tbl-1",
  tableName: "orders",
  datasetId: "ds-1",
  origin: "file",
  rowCount: 100,
  columnCount: 5,
  memoryBytes: 4096,
  createdAt: "2026-07-20T00:00:00.000Z",
};

const derivedTable: TableRegistryEntry = {
  ...sourceTable,
  id: "tbl-2",
  tableName: "orders_edit",
  origin: "derived",
  generatingSql: "CREATE TABLE orders_edit AS SELECT * FROM orders",
};

beforeEach(() => {
  useDatasetsStore.setState({
    datasets: [],
    tables: [],
    workerStatus: "idle",
    workerError: null,
  });
});

describe("isSourceMutation", () => {
  it("is true for a mutation targeting a registered source table", () => {
    useDatasetsStore.getState().registerDataset(dataset, [sourceTable]);
    const info = classifyStatement("UPDATE orders SET status = 'shipped'");
    expect(isSourceMutation(info)).toBe(true);
  });

  it("is false for a mutation targeting a derived table", () => {
    useDatasetsStore.getState().registerDataset(dataset, [derivedTable]);
    const info = classifyStatement("DROP TABLE orders_edit");
    expect(isSourceMutation(info)).toBe(false);
  });

  it("is false for a mutation targeting an unregistered table (DuckDB will raise its own catalog error)", () => {
    const info = classifyStatement("DELETE FROM nonexistent");
    expect(isSourceMutation(info)).toBe(false);
  });

  it("is false for a non-mutation statement", () => {
    useDatasetsStore.getState().registerDataset(dataset, [sourceTable]);
    expect(isSourceMutation(classifyStatement("SELECT * FROM orders"))).toBe(
      false,
    );
    expect(
      isSourceMutation(
        classifyStatement("CREATE TABLE t AS SELECT * FROM orders"),
      ),
    ).toBe(false);
  });
});

describe("error classes", () => {
  it("MutationGuardRequired carries the parsed StatementInfo and a readable message", () => {
    const info = classifyStatement("DROP TABLE orders");
    const error = new MutationGuardRequired(info);
    expect(error).toBeInstanceOf(Error);
    expect(error.info).toBe(info);
    expect(error.message).toContain("orders");
  });

  it("TransformError is a distinguishable Error subclass", () => {
    const error = new TransformError("boom");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("boom");
  });
});
