import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IngestionError,
  loadDataset,
  loadFiles,
  loadSharedDataset,
  profileTable,
  referencesTableName,
  refreshTableFromSource,
} from "./ingestion";
import { getSharedObject } from "./export";
import { useDatasetsStore } from "../stores/datasets";
import type { Dataset, TableRegistryEntry } from "../types";

vi.mock("./export", () => ({ getSharedObject: vi.fn() }));

// loadDataset/removeDataset/removeTable need a live DuckDB worker (a real
// browser), so they are verified separately, not here — see
// formatPolicy.test.ts for the pure logic (format detection, table naming,
// malformed-CSV detection) they build on. loadFiles' two reject-before-
// touching-the-engine paths below are the exception: both throw ahead of
// loadEngine(), so they're reachable without a real worker. loadDataset's
// oversized-file refusal is a third: the size-tier gate runs on `File.size`
// alone before loadEngine() too.

function fileOfSize(name: string, bytes: number): File {
  const file = new File([], name);
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

describe("ingestion service", () => {
  beforeEach(() => {
    useDatasetsStore.setState({
      tables: [],
      datasets: [],
      workerStatus: "idle",
      workerError: null,
    });
  });

  it("IngestionError is a distinguishable Error subclass", () => {
    const error = new IngestionError("boom");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("boom");
  });

  it("profileTable rejects an unknown table id before touching the engine", async () => {
    await expect(profileTable("does-not-exist")).rejects.toThrow(
      /Unknown table id/,
    );
  });

  it("loadFiles rejects an empty batch before touching the engine", async () => {
    await expect(loadFiles([])).rejects.toThrow(IngestionError);
  });

  it("loadFiles rejects a batch with no supported formats before touching the engine", async () => {
    const files = [
      new File(["x"], "report.xlsx"),
      new File(["y"], "notes.txt"),
    ];
    await expect(loadFiles(files)).rejects.toThrow(
      /2 files dropped are in a supported format/,
    );
  });

  it("loadDataset refuses a file over the size ceiling before touching the engine", async () => {
    const huge = fileOfSize("huge.csv", 301 * 1024 * 1024);
    await expect(loadDataset(huge)).rejects.toThrow(IngestionError);
    await expect(loadDataset(huge)).rejects.toThrow(
      /too large for in-browser analysis \(~301 MB\)/,
    );
  });

  // refreshTableFromSource's engine-touching half (fetch → ingestBuffer →
  // DROP/RENAME swap) needs a live DuckDB worker, same as loadDataset/
  // loadFiles above — verified separately, not here. Its two reject-before-
  // touching-the-engine paths are the exception, same shape as
  // profileTable's unknown-id case.
  it("refreshTableFromSource rejects an unknown table id before touching the engine", async () => {
    await expect(refreshTableFromSource("does-not-exist")).rejects.toThrow(
      /Unknown table id/,
    );
  });

  it("refreshTableFromSource rejects a table with no recorded source URL before touching the engine", async () => {
    const dataset: Dataset = {
      id: "ds-1",
      name: "orders.csv",
      sourceType: "file",
      tableNames: ["orders"],
      ingestedAt: new Date().toISOString(),
    };
    const table: TableRegistryEntry = {
      id: "t-1",
      tableName: "orders",
      datasetId: "ds-1",
      origin: "file",
      rowCount: 10,
      columnCount: 2,
      memoryBytes: 100,
      createdAt: dataset.ingestedAt,
    };
    useDatasetsStore.getState().registerDataset(dataset, [table]);

    await expect(refreshTableFromSource("t-1")).rejects.toThrow(
      /no recorded source URL/,
    );
  });

  it("refreshTableFromSource rejects an api-origin table missing its sourceUrl before touching the engine", async () => {
    const dataset: Dataset = {
      id: "ds-1",
      name: "https://api.example.com/data",
      sourceType: "api",
      tableNames: ["data"],
      ingestedAt: new Date().toISOString(),
    };
    const table: TableRegistryEntry = {
      id: "t-1",
      tableName: "data",
      datasetId: "ds-1",
      origin: "api",
      rowCount: 10,
      columnCount: 2,
      memoryBytes: 100,
      createdAt: dataset.ingestedAt,
    };
    useDatasetsStore.getState().registerDataset(dataset, [table]);

    await expect(refreshTableFromSource("t-1")).rejects.toThrow(
      /no recorded source URL/,
    );
  });
});

// loadSharedDataset's full-dataset branch (ingestBuffer over the fetched
// Parquet bytes) needs a live DuckDB worker, same as loadDataset/loadFiles
// above — verified separately, not here. Its structure-report branch and
// every getSharedObject-failure branch run entirely before any engine touch,
// so they're covered here with getSharedObject mocked at the module boundary
// (it already has its own fetchImpl-injected unit tests in export.test.ts).
describe("loadSharedDataset", () => {
  beforeEach(() => {
    vi.mocked(getSharedObject).mockReset();
  });

  it("returns the parsed structure report for a JSON share, without touching the engine", async () => {
    const report = {
      generatedAt: "2026-07-23T00:00:00.000Z",
      tables: [],
      insights: [],
    };
    vi.mocked(getSharedObject).mockResolvedValue({
      ok: true,
      buffer: new TextEncoder().encode(JSON.stringify(report)),
      contentType: "application/json",
    });

    const result = await loadSharedDataset("tok-1");
    expect(result).toEqual({
      kind: "structure-report",
      structureReport: report,
    });
  });

  it("rejects a JSON share whose body is not valid JSON", async () => {
    vi.mocked(getSharedObject).mockResolvedValue({
      ok: true,
      buffer: new TextEncoder().encode("not json"),
      contentType: "application/json",
    });

    await expect(loadSharedDataset("tok-1")).rejects.toThrow(
      /corrupted or not valid JSON/,
    );
  });

  it("rejects an unknown/expired token with a friendly message", async () => {
    vi.mocked(getSharedObject).mockResolvedValue({
      ok: false,
      code: "not-found",
    });
    await expect(loadSharedDataset("gone")).rejects.toThrow(
      /doesn't exist or has expired/,
    );
  });

  it("rejects when save/share is paused", async () => {
    vi.mocked(getSharedObject).mockResolvedValue({ ok: false, code: "paused" });
    await expect(loadSharedDataset("tok-1")).rejects.toThrow(
      /temporarily paused/,
    );
  });

  it("rejects when the endpoint is unreachable", async () => {
    vi.mocked(getSharedObject).mockResolvedValue({
      ok: false,
      code: "unreachable",
    });
    await expect(loadSharedDataset("tok-1")).rejects.toThrow(
      /Couldn't reach the server/,
    );
  });
});

describe("referencesTableName", () => {
  it("matches a bare identifier as a whole word", () => {
    expect(
      referencesTableName(
        "CREATE TABLE big AS SELECT * FROM orders WHERE total > 100",
        "orders",
      ),
    ).toBe(true);
  });

  it("matches a double-quoted identifier", () => {
    expect(
      referencesTableName('SELECT * FROM "my orders" LIMIT 1', "my orders"),
    ).toBe(true);
  });

  it("does not match a substring of a longer identifier", () => {
    expect(referencesTableName("SELECT * FROM order_items", "orders")).toBe(
      false,
    );
  });

  it("does not match an unrelated table", () => {
    expect(referencesTableName("SELECT * FROM customers", "orders")).toBe(
      false,
    );
  });
});
