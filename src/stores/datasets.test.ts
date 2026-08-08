import { beforeEach, describe, expect, it } from "vitest";
import { DATASETS_STORAGE_KEY, useDatasetsStore } from "./datasets";
import type { Dataset, TableRegistryEntry } from "../types";

const dataset: Dataset = {
  id: "ds-1",
  name: "orders.csv",
  sourceType: "file",
  tableNames: ["orders"],
  ingestedAt: "2026-07-19T00:00:00.000Z",
};

const table: TableRegistryEntry = {
  id: "tbl-1",
  tableName: "orders",
  datasetId: "ds-1",
  origin: "file",
  rowCount: 100,
  columnCount: 5,
  memoryBytes: 4096,
  createdAt: "2026-07-19T00:00:00.000Z",
};

beforeEach(() => {
  localStorage.clear();
  useDatasetsStore.setState({
    datasets: [],
    tables: [],
    workerStatus: "idle",
    workerError: null,
  });
});

describe("datasets store", () => {
  it("starts empty with an idle worker", () => {
    const state = useDatasetsStore.getState();
    expect(state.datasets).toEqual([]);
    expect(state.tables).toEqual([]);
    expect(state.workerStatus).toBe("idle");
  });

  it("registerDataset adds the dataset and its tables", () => {
    useDatasetsStore.getState().registerDataset(dataset, [table]);
    const state = useDatasetsStore.getState();
    expect(state.datasets).toEqual([dataset]);
    expect(state.tables).toEqual([table]);
  });

  it("removeDataset drops the dataset and only its tables", () => {
    const otherTable: TableRegistryEntry = {
      ...table,
      id: "tbl-2",
      datasetId: "ds-2",
    };
    useDatasetsStore.getState().registerDataset(dataset, [table]);
    useDatasetsStore
      .getState()
      .registerDataset({ ...dataset, id: "ds-2", name: "other.csv" }, [
        otherTable,
      ]);

    useDatasetsStore.getState().removeDataset("ds-1");

    const state = useDatasetsStore.getState();
    expect(state.datasets.map((d) => d.id)).toEqual(["ds-2"]);
    expect(state.tables).toEqual([otherTable]);
  });

  it("removeTable drops one table but keeps its siblings and the dataset", () => {
    const sibling: TableRegistryEntry = {
      ...table,
      id: "tbl-2",
      tableName: "orders_2",
    };
    useDatasetsStore
      .getState()
      .registerDataset({ ...dataset, tableNames: ["orders", "orders_2"] }, [
        table,
        sibling,
      ]);

    useDatasetsStore.getState().removeTable("tbl-1");

    const state = useDatasetsStore.getState();
    expect(state.tables).toEqual([sibling]);
    expect(state.datasets).toEqual([{ ...dataset, tableNames: ["orders_2"] }]);
  });

  it("removeTable also removes the dataset once its last table is gone", () => {
    useDatasetsStore.getState().registerDataset(dataset, [table]);

    useDatasetsStore.getState().removeTable("tbl-1");

    const state = useDatasetsStore.getState();
    expect(state.tables).toEqual([]);
    expect(state.datasets).toEqual([]);
  });

  it("removeTable is a no-op for an unknown id", () => {
    useDatasetsStore.getState().registerDataset(dataset, [table]);

    useDatasetsStore.getState().removeTable("does-not-exist");

    const state = useDatasetsStore.getState();
    expect(state.tables).toEqual([table]);
    expect(state.datasets).toEqual([dataset]);
  });

  it("registerDataset carries a derived table's generating SQL untouched", () => {
    const derived: TableRegistryEntry = {
      ...table,
      id: "tbl-derived",
      tableName: "high_value_orders",
      origin: "derived",
      generatingSql:
        "CREATE TABLE high_value_orders AS SELECT * FROM orders WHERE total > 100",
    };
    useDatasetsStore.getState().registerDataset(dataset, [derived]);

    const state = useDatasetsStore.getState();
    expect(
      state.tables.find((t) => t.id === "tbl-derived")?.generatingSql,
    ).toBe(derived.generatingSql);
  });

  it("setTableColumns attaches classification output to the right table only", () => {
    const otherTable: TableRegistryEntry = { ...table, id: "tbl-2" };
    useDatasetsStore.getState().registerDataset(dataset, [table, otherTable]);

    const columns = [
      {
        name: "id",
        physicalType: "BIGINT",
        semanticType: "Identifier" as const,
        cardinality: 100,
        nullPercentage: 0,
        min: 1,
        max: 100,
        mean: null,
        stdDev: null,
      },
    ];
    useDatasetsStore.getState().setTableColumns("tbl-1", columns);

    const state = useDatasetsStore.getState();
    expect(state.tables.find((t) => t.id === "tbl-1")?.columns).toEqual(
      columns,
    );
    expect(state.tables.find((t) => t.id === "tbl-2")?.columns).toBeUndefined();
  });

  const classifiedColumns = [
    {
      name: "Survived",
      physicalType: "BIGINT",
      semanticType: "Categorical" as const,
      cardinality: 2,
      nullPercentage: 0,
      min: 0,
      max: 1,
      mean: null,
      stdDev: null,
      classificationReason:
        "low-cardinality numbers (2 distinct) — likely encoded categories",
    },
    {
      name: "Fare",
      physicalType: "DOUBLE",
      semanticType: "Quantitative" as const,
      cardinality: 836,
      nullPercentage: 0,
      min: 0,
      max: 512,
      mean: 32,
      stdDev: 49,
      classificationReason: "continuous numeric (836 distinct values)",
    },
  ];

  it("reclassifyColumn overrides one column and records a manual reason", () => {
    useDatasetsStore.getState().registerDataset(dataset, [table]);
    useDatasetsStore.getState().setTableColumns("tbl-1", classifiedColumns);

    useDatasetsStore
      .getState()
      .reclassifyColumn("tbl-1", "Survived", "Quantitative");

    const columns = useDatasetsStore
      .getState()
      .tables.find((t) => t.id === "tbl-1")?.columns;
    expect(columns?.find((c) => c.name === "Survived")).toMatchObject({
      semanticType: "Quantitative",
      classificationReason: "Set manually to Quantitative",
    });
    // The sibling column is untouched.
    expect(columns?.find((c) => c.name === "Fare")?.semanticType).toBe(
      "Quantitative",
    );
    expect(columns?.find((c) => c.name === "Fare")?.classificationReason).toBe(
      "continuous numeric (836 distinct values)",
    );
  });

  it("reclassifyColumn is a no-op for an unknown table or column", () => {
    useDatasetsStore.getState().registerDataset(dataset, [table]);
    useDatasetsStore.getState().setTableColumns("tbl-1", classifiedColumns);

    useDatasetsStore.getState().reclassifyColumn("nope", "Survived", "Textual");
    useDatasetsStore
      .getState()
      .reclassifyColumn("tbl-1", "DoesNotExist", "Textual");

    const columns = useDatasetsStore
      .getState()
      .tables.find((t) => t.id === "tbl-1")?.columns;
    expect(columns).toEqual(classifiedColumns);
  });

  it("reclassifyColumn is a no-op when the table has no classified columns yet", () => {
    useDatasetsStore.getState().registerDataset(dataset, [table]);

    useDatasetsStore
      .getState()
      .reclassifyColumn("tbl-1", "Survived", "Textual");

    expect(
      useDatasetsStore.getState().tables.find((t) => t.id === "tbl-1")?.columns,
    ).toBeUndefined();
  });

  it("setTableStats updates row/column count and memory footprint on the right table only", () => {
    const otherTable: TableRegistryEntry = { ...table, id: "tbl-2" };
    useDatasetsStore.getState().registerDataset(dataset, [table, otherTable]);

    useDatasetsStore
      .getState()
      .setTableStats("tbl-1", {
        rowCount: 50,
        columnCount: 4,
        memoryBytes: 2048,
      });

    const state = useDatasetsStore.getState();
    expect(state.tables.find((t) => t.id === "tbl-1")).toMatchObject({
      rowCount: 50,
      columnCount: 4,
      memoryBytes: 2048,
    });
    expect(state.tables.find((t) => t.id === "tbl-2")).toMatchObject({
      rowCount: 100,
      columnCount: 5,
      memoryBytes: 4096,
    });
  });

  it("setTableRefreshMeta updates sampled/sampleRowLimit/lastFetchedAt on the right table only", () => {
    const otherTable: TableRegistryEntry = { ...table, id: "tbl-2" };
    useDatasetsStore.getState().registerDataset(dataset, [table, otherTable]);

    useDatasetsStore
      .getState()
      .setTableRefreshMeta("tbl-1", {
        sampled: true,
        sampleRowLimit: 100_000,
        lastFetchedAt: "2026-07-23T00:00:00.000Z",
      });

    const state = useDatasetsStore.getState();
    expect(state.tables.find((t) => t.id === "tbl-1")).toMatchObject({
      sampled: true,
      sampleRowLimit: 100_000,
      lastFetchedAt: "2026-07-23T00:00:00.000Z",
    });
    expect(
      state.tables.find((t) => t.id === "tbl-2")?.lastFetchedAt,
    ).toBeUndefined();
  });

  it("markTablesStale flags exactly the given ids and nothing else", () => {
    const derivedA: TableRegistryEntry = {
      ...table,
      id: "tbl-derived-a",
      origin: "derived",
    };
    const derivedB: TableRegistryEntry = {
      ...table,
      id: "tbl-derived-b",
      origin: "derived",
    };
    useDatasetsStore
      .getState()
      .registerDataset(dataset, [table, derivedA, derivedB]);

    useDatasetsStore.getState().markTablesStale(["tbl-derived-a"]);

    const state = useDatasetsStore.getState();
    expect(state.tables.find((t) => t.id === "tbl-derived-a")?.stale).toBe(
      true,
    );
    expect(
      state.tables.find((t) => t.id === "tbl-derived-b")?.stale,
    ).toBeUndefined();
    expect(state.tables.find((t) => t.id === "tbl-1")?.stale).toBeUndefined();
  });

  it("setWorkerStatus records status and an optional error", () => {
    useDatasetsStore.getState().setWorkerStatus("loading");
    expect(useDatasetsStore.getState().workerStatus).toBe("loading");
    expect(useDatasetsStore.getState().workerError).toBeNull();

    useDatasetsStore.getState().setWorkerStatus("error", "worker crashed");
    expect(useDatasetsStore.getState().workerStatus).toBe("error");
    expect(useDatasetsStore.getState().workerError).toBe("worker crashed");
  });

  describe("persistence (07c)", () => {
    it("persists exactly the catalog whitelist — no row data, no worker status", () => {
      useDatasetsStore.getState().registerDataset(dataset, [table]);
      useDatasetsStore.getState().setWorkerStatus("ready");

      const raw = localStorage.getItem(DATASETS_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      // Exact match proves nothing beyond `datasets`/`tables` reaches storage —
      // no `workerStatus`/`workerError`, and no raw row data (neither field's
      // type carries any), even though `columns`/`profile` are aggregates.
      expect(parsed.state).toEqual({ datasets: [dataset], tables: [table] });
    });

    it('never persists workerStatus/workerError — a restored "ready" would be a lie the app reads', () => {
      useDatasetsStore.getState().setWorkerStatus("ready");
      const raw = localStorage.getItem(DATASETS_STORAGE_KEY);
      const parsed = JSON.parse(raw!);
      expect(parsed.state.workerStatus).toBeUndefined();
      expect(parsed.state.workerError).toBeUndefined();
    });

    it("a persisted payload from an old schema version rehydrates to a safe, array-shaped default rather than crashing", async () => {
      localStorage.setItem(
        DATASETS_STORAGE_KEY,
        JSON.stringify({
          state: { datasets: "not-an-array", tables: { garbage: true } },
          version: 0,
        }),
      );

      await useDatasetsStore.persist.rehydrate();

      const state = useDatasetsStore.getState();
      expect(Array.isArray(state.datasets)).toBe(true);
      expect(Array.isArray(state.tables)).toBe(true);
    });
  });
});
