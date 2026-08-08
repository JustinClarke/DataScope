import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearWorkspaceData, restoreStagedTables } from "./workspace";
import {
  setStagingTransportForTests,
  stageTable,
  type StagingTransport,
} from "./opfsStaging";
import { handleStagingRequest } from "../workers/opfsStaging.protocol";
import { SETTINGS_STORAGE_KEY } from "../stores/settings";
import { FakeOpfsRoot, SUPPORTED_SCOPE } from "../test/fakeOpfs";

const execute = vi.fn();
const registerFile = vi.fn();
const resetEngine = vi.fn();

vi.mock("../workers/duckdb.worker", () => ({
  duckDBEngine: {
    execute: (...args: unknown[]) => execute(...args),
    registerFile: (...args: unknown[]) => registerFile(...args),
  },
  resetEngine: () => resetEngine(),
}));

function install(root: FakeOpfsRoot): void {
  const transport: StagingTransport = {
    send: async (request) =>
      (
        await handleStagingRequest(
          request,
          async () => root as unknown as FileSystemDirectoryHandle,
          SUPPORTED_SCOPE,
        )
      ).response,
    dispose: () => {},
  };
  setStagingTransportForTests(() => transport);
}

const csv = new Blob(["id,total\n1,9\n"]);

describe("restoreStagedTables", () => {
  let root: FakeOpfsRoot;

  beforeEach(() => {
    root = new FakeOpfsRoot();
    install(root);
    execute.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    registerFile.mockReset().mockResolvedValue(undefined);
    resetEngine.mockReset().mockResolvedValue(undefined);
  });

  it("reports nothing, and never touches the engine, on a cold workspace", async () => {
    await expect(restoreStagedTables()).resolves.toMatchObject({ tables: [] });
    expect(registerFile).not.toHaveBeenCalled();
  });

  it("re-registers the staged bytes and rebuilds the table", async () => {
    await stageTable(
      {
        tableName: "orders",
        fileName: "orders.csv",
        fileHash: "abc",
        stagedAt: "now",
      },
      csv,
    );

    const report = await restoreStagedTables();

    expect(report.tables).toEqual([
      { tableName: "orders", fileHash: "abc", outcome: "restored" },
    ]);
    expect(registerFile).toHaveBeenCalledWith(
      "orders.csv",
      expect.any(Uint8Array),
    );
    expect(execute).toHaveBeenCalledWith(
      `CREATE OR REPLACE TABLE "orders" AS SELECT * FROM read_csv_auto('orders.csv')`,
    );
  });

  it("picks the reader from the staged file name, not from a default", async () => {
    await stageTable(
      { tableName: "events", fileName: "events.parquet", stagedAt: "now" },
      csv,
    );
    await restoreStagedTables();

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("read_parquet('events.parquet')"),
    );
  });

  it("quotes a table name that would otherwise break the statement", async () => {
    await stageTable(
      { tableName: 'my "odd" table', fileName: "odd.csv", stagedAt: "now" },
      csv,
    );
    await restoreStagedTables();

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE OR REPLACE TABLE "my ""odd"" table"'),
    );
  });

  it("treats evicted bytes as a failed table, not a crash", async () => {
    await stageTable(
      { tableName: "orders", fileName: "orders.csv", stagedAt: "now" },
      csv,
    );
    // OPFS is evictable — `persist()` is denied on both engines (ADR-011), so
    // the manifest can outlive the bytes it points at.
    root.files.delete("t_orders");

    const report = await restoreStagedTables();
    expect(report.tables[0]).toMatchObject({
      tableName: "orders",
      outcome: "failed",
    });
    expect(report.tables[0].reason).toMatch(/no longer on disk/);
  });

  it("restores the good tables when one of them fails (partial recovery is the normal path)", async () => {
    await stageTable(
      { tableName: "a", fileName: "a.csv", stagedAt: "now" },
      csv,
    );
    await stageTable(
      { tableName: "bad", fileName: "bad.csv", stagedAt: "now" },
      csv,
    );
    await stageTable(
      { tableName: "c", fileName: "c.csv", stagedAt: "now" },
      csv,
    );
    execute.mockImplementation((sql: string) =>
      sql.includes('"bad"')
        ? Promise.reject(new Error("Invalid Input Error"))
        : Promise.resolve({ rows: [] }),
    );

    const report = await restoreStagedTables();

    expect(report.tables.map((table) => table.outcome)).toEqual([
      "restored",
      "failed",
      "restored",
    ]);
    expect(report.tables[1].reason).toBe("Invalid Input Error");
  });

  it("carries the file hash through so a mismatch can be judged later", async () => {
    await stageTable(
      {
        tableName: "orders",
        fileName: "orders.csv",
        fileHash: "abc",
        stagedAt: "now",
      },
      csv,
    );
    const report = await restoreStagedTables();

    expect(report.tables[0].fileHash).toBe("abc");
  });
});

describe("clearWorkspaceData", () => {
  let root: FakeOpfsRoot;

  beforeEach(() => {
    root = new FakeOpfsRoot();
    install(root);
    execute.mockReset().mockResolvedValue({ rows: [] });
    registerFile.mockReset().mockResolvedValue(undefined);
    resetEngine.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
  });

  it("terminates the engine before emptying OPFS, then reloads", async () => {
    await stageTable(
      { tableName: "orders", fileName: "orders.csv", stagedAt: "now" },
      csv,
    );
    const order: string[] = [];
    resetEngine.mockImplementation(() => {
      order.push("reset");
      return Promise.resolve();
    });
    const reload = vi.fn(() => order.push("reload"));

    await clearWorkspaceData(reload);

    expect(order).toEqual(["reset", "reload"]);
    expect(root.files.size).toBe(0);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("removes the persisted registry keys but keeps settings", async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{"state":{}}');
    localStorage.setItem("datascope-datasets", '{"state":{}}');
    localStorage.setItem("datascope-tabs", '{"state":{}}');
    localStorage.setItem("unrelated-app-key", "keep me");

    await clearWorkspaceData(() => {});

    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem("unrelated-app-key")).toBe("keep me");
    expect(localStorage.getItem("datascope-datasets")).toBeNull();
    expect(localStorage.getItem("datascope-tabs")).toBeNull();
  });
});
