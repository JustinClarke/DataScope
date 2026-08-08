import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor, fireEvent, within } from "@testing-library/react";
import { IngestionPanel } from "./IngestionPanel";
import { useDatasetsStore } from "../../stores/datasets";
import { useUIStore } from "../../stores/ui";
import { useDspsReceiverStore } from "../../stores/dspsReceiver";
import * as ingestionService from "../../services/ingestion";
import * as transformsService from "../../services/transforms";
import type { Dataset, TableRegistryEntry } from "../../types";

function fileOfSize(name: string, bytes: number): File {
  const file = new File([], name);
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

const MB = 1024 * 1024;

// The engine itself needs a live DuckDB worker (a real browser), verified
// separately — this covers the panel's own state machine and wiring against
// a mocked service boundary. Queries are scoped to each test's own `container`
// (no RTL auto-cleanup is configured in vitest.config.ts, matching the rest of
// this test suite's convention) rather than the global `screen`.
vi.mock("../../services/ingestion", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/ingestion")
  >("../../services/ingestion");
  return {
    ...actual,
    loadDataset: vi.fn(),
    loadFiles: vi.fn(),
    removeTable: vi.fn(),
    loadUrl: vi.fn(),
    refreshTableFromSource: vi.fn(),
  };
});

vi.mock("../../services/transforms", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/transforms")
  >("../../services/transforms");
  return { ...actual, runTransform: vi.fn() };
});

describe("IngestionPanel", () => {
  beforeEach(() => {
    useDatasetsStore.setState({
      tables: [],
      datasets: [],
      workerStatus: "idle",
      workerError: null,
    });
    useUIStore.setState({
      activeModule: "ingestion",
      activeTabId: null,
      pendingPrefill: null,
    });
    useDspsReceiverStore.setState({ document: null, error: null });
    vi.mocked(ingestionService.loadDataset).mockReset();
    vi.mocked(ingestionService.loadFiles).mockReset();
    vi.mocked(ingestionService.removeTable).mockReset();
    vi.mocked(ingestionService.loadUrl).mockReset();
    vi.mocked(ingestionService.refreshTableFromSource).mockReset();
    vi.mocked(transformsService.runTransform).mockReset();
  });

  it("renders the drop zone and every bundled sample", () => {
    const { container } = render(<IngestionPanel />);
    expect(container.textContent).toContain("Drop files, a folder, or a ZIP");
    expect(container.textContent).toContain("E-commerce mini-warehouse");
    expect(container.textContent).toContain("Titanic Passengers");
  });

  it("shows the xlsx rejection modal without calling loadDataset", async () => {
    const { container } = render(<IngestionPanel />);

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["x"], "report.xlsx", {
      type: "application/vnd.ms-excel",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(within(container).getByRole("dialog")).toBeTruthy(),
    );
    expect(container.textContent).toContain(
      "Excel files are not supported directly",
    );
    expect(ingestionService.loadDataset).not.toHaveBeenCalled();
  });

  it("opens a dropped .dsps file through the receiver store instead of ingesting it (D62)", async () => {
    const doc = {
      dspsVersion: "1.0.0",
      generatedAt: "2026-07-23T00:00:00.000Z",
      tables: [
        { tableName: "orders", rowCount: 5, columnCount: 1, columns: [] },
      ],
      insights: [],
    };
    const { container } = render(<IngestionPanel />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([JSON.stringify(doc)], "report.dsps", {
      type: "application/json",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(useDspsReceiverStore.getState().document).toEqual(doc),
    );
    expect(ingestionService.loadDataset).not.toHaveBeenCalled();
    expect(ingestionService.loadFiles).not.toHaveBeenCalled();
  });

  it("surfaces a malformed .dsps file as a receiver error rather than crashing", async () => {
    const { container } = render(<IngestionPanel />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["not json at all"], "broken.dsps", {
      type: "application/json",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(useDspsReceiverStore.getState().error).toMatch(/isn't valid JSON/),
    );
    expect(useDspsReceiverStore.getState().document).toBeNull();
  });

  it("surfaces a .dsps file from a newer major version by the version it saw, not opaquely", async () => {
    const doc = {
      dspsVersion: "9.0.0",
      generatedAt: "2026-07-23T00:00:00.000Z",
      tables: [],
      insights: [],
    };
    const { container } = render(<IngestionPanel />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([JSON.stringify(doc)], "future.dsps", {
      type: "application/json",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(useDspsReceiverStore.getState().error).toMatch(/saw 9\.0\.0/),
    );
  });

  it("loads a sample on click and reflects it via the datasets store", async () => {
    const dataset: Dataset = {
      id: "ds-1",
      name: "Titanic Passengers",
      sourceType: "sample",
      tableNames: ["titanic"],
      ingestedAt: new Date().toISOString(),
    };
    const table: TableRegistryEntry = {
      id: "t-1",
      tableName: "titanic",
      datasetId: "ds-1",
      origin: "sample",
      rowCount: 891,
      columnCount: 10,
      memoryBytes: 1024,
      createdAt: dataset.ingestedAt,
    };
    vi.mocked(ingestionService.loadDataset).mockImplementation(async () => {
      useDatasetsStore.getState().registerDataset(dataset, [table]);
      return dataset;
    });

    const { container } = render(<IngestionPanel />);
    fireEvent.click(within(container).getByText("Titanic Passengers"));

    await waitFor(() => expect(container.textContent).toContain("titanic"));
    expect(ingestionService.loadDataset).toHaveBeenCalledWith("titanic");
  });

  it("removes a registered table when its remove button is clicked", () => {
    const dataset: Dataset = {
      id: "ds-1",
      name: "my_file.csv",
      sourceType: "file",
      tableNames: ["my_file"],
      ingestedAt: new Date().toISOString(),
    };
    useDatasetsStore.getState().registerDataset(dataset, [
      {
        id: "t-1",
        tableName: "my_file",
        datasetId: "ds-1",
        origin: "file",
        rowCount: 10,
        columnCount: 2,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
      },
    ]);
    vi.mocked(ingestionService.removeTable).mockResolvedValue(undefined);

    const { container } = render(<IngestionPanel />);
    fireEvent.click(within(container).getByLabelText("Remove my_file"));

    expect(ingestionService.removeTable).toHaveBeenCalledWith("t-1");
  });

  it("shows a summary toast naming skips after a batch (folder/multi-select) ingest", async () => {
    const dataset: Dataset = {
      id: "ds-batch",
      name: "3 files",
      sourceType: "folder",
      tableNames: ["customers", "orders", "products"],
      ingestedAt: new Date().toISOString(),
    };
    const tables: TableRegistryEntry[] = dataset.tableNames.map(
      (tableName, i) => ({
        id: `t-${i}`,
        tableName,
        datasetId: dataset.id,
        origin: "file",
        rowCount: 10,
        columnCount: 3,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
      }),
    );
    vi.mocked(ingestionService.loadFiles).mockImplementation(async () => {
      useDatasetsStore.getState().registerDataset(dataset, tables);
      return {
        dataset,
        skipped: [{ name: "notes.xlsx", kind: "unsupported", reason: "x" }],
        aggregateBytes: 1024,
        aggregateWarning: false,
      };
    });

    const { container } = render(<IngestionPanel />);
    const input = container.querySelectorAll(
      'input[type="file"]',
    )[0] as HTMLInputElement;
    const files = [
      new File(["a"], "customers.csv"),
      new File(["b"], "orders.csv"),
      new File(["c"], "products.csv"),
    ];
    fireEvent.change(input, { target: { files } });

    await waitFor(() =>
      expect(ingestionService.loadFiles).toHaveBeenCalledWith(files),
    );
    await waitFor(() =>
      expect(container.textContent).toContain(
        "Ingested 3 tables; skipped 1 unsupported file (.xlsx).",
      ),
    );
  });

  it("shows the size-refusal modal for an oversized file without calling loadDataset", async () => {
    const { container } = render(<IngestionPanel />);

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [fileOfSize("huge.csv", 301 * MB)] },
    });

    await waitFor(() =>
      expect(within(container).getByRole("dialog")).toBeTruthy(),
    );
    expect(container.textContent).toContain(
      "too large for in-browser analysis (~301 MB)",
    );
    expect(ingestionService.loadDataset).not.toHaveBeenCalled();
  });

  it("shows the warning banner with an estimated footprint for a 60MB file", async () => {
    vi.mocked(ingestionService.loadDataset).mockImplementation(
      async (source) => {
        const dataset: Dataset = {
          id: "ds-warn",
          name: (source as File).name,
          sourceType: "file",
          tableNames: ["huge"],
          ingestedAt: new Date().toISOString(),
        };
        useDatasetsStore.getState().registerDataset(dataset, [
          {
            id: "t-warn",
            tableName: "huge",
            datasetId: dataset.id,
            origin: "file",
            rowCount: 100,
            columnCount: 2,
            memoryBytes: 100,
            createdAt: dataset.ingestedAt,
          },
        ]);
        return dataset;
      },
    );

    const { container } = render(<IngestionPanel />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [fileOfSize("warn.csv", 60 * MB)] },
    });

    await waitFor(() =>
      expect(container.textContent).toContain("Large file detected"),
    );
    expect(container.textContent).toContain("Estimated memory footprint");
  });

  it("shows the persistent sampled banner and per-table badge for a 150MB file", async () => {
    vi.mocked(ingestionService.loadDataset).mockImplementation(
      async (source) => {
        const dataset: Dataset = {
          id: "ds-sampled",
          name: (source as File).name,
          sourceType: "file",
          tableNames: ["sampled_table"],
          ingestedAt: new Date().toISOString(),
        };
        useDatasetsStore.getState().registerDataset(dataset, [
          {
            id: "t-sampled",
            tableName: "sampled_table",
            datasetId: dataset.id,
            origin: "file",
            rowCount: 100_000,
            columnCount: 2,
            memoryBytes: 100,
            createdAt: dataset.ingestedAt,
            sampled: true,
            sampleRowLimit: 100_000,
          },
        ]);
        return dataset;
      },
    );

    const { container } = render(<IngestionPanel />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [fileOfSize("big.csv", 150 * MB)] },
    });

    await waitFor(() =>
      expect(container.textContent).toContain("Showing a 100K-row sample"),
    );
    expect(container.textContent).toContain("sampled — first 100,000 rows");
  });

  it("shows the relay disclosure note when Tier 2 carried the fetch (build/07-connectivity/02)", async () => {
    const dataset: Dataset = {
      id: "ds-relay",
      name: "https://blocked.example.com/data",
      sourceType: "api",
      tableNames: ["data"],
      ingestedAt: new Date().toISOString(),
    };
    useDatasetsStore.getState().registerDataset(dataset, [
      {
        id: "t-relay",
        tableName: "data",
        datasetId: dataset.id,
        origin: "api",
        rowCount: 5,
        columnCount: 2,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
      },
    ]);
    vi.mocked(ingestionService.loadUrl).mockResolvedValue({
      dataset,
      pagesFetched: 1,
      bytesAccumulated: 100,
      sizeTier: "full",
      usedRelay: true,
    });

    const { container } = render(<IngestionPanel />);
    fireEvent.change(within(container).getByLabelText("API URL"), {
      target: { value: "https://blocked.example.com/data" },
    });
    fireEvent.click(within(container).getByText("Fetch"));

    await waitFor(() =>
      expect(container.textContent).toContain(
        "passed through DataScope's relay",
      ),
    );
    // A live pass caught this note being unmountable-before-paint: the panel
    // auto-navigated to Blueprint in the same render that set the disclosure,
    // so no real user ever saw it. Skipping auto-navigate on the relay path
    // is what keeps this note actually visible (§5.2 "clearly labeled").
    expect(useUIStore.getState().activeModule).toBe("ingestion");
  });

  it("still navigates to the post-ingest landing when Tier 1 succeeded without the relay", async () => {
    const dataset: Dataset = {
      id: "ds-direct",
      name: "https://api.example.com/data",
      sourceType: "api",
      tableNames: ["data"],
      ingestedAt: new Date().toISOString(),
    };
    useDatasetsStore.getState().registerDataset(dataset, [
      {
        id: "t-direct",
        tableName: "data",
        datasetId: dataset.id,
        origin: "api",
        rowCount: 5,
        columnCount: 2,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
      },
    ]);
    vi.mocked(ingestionService.loadUrl).mockResolvedValue({
      dataset,
      pagesFetched: 1,
      bytesAccumulated: 100,
      sizeTier: "full",
      usedRelay: false,
    });

    const { container } = render(<IngestionPanel />);
    fireEvent.change(within(container).getByLabelText("API URL"), {
      target: { value: "https://api.example.com/data" },
    });
    fireEvent.click(within(container).getByText("Fetch"));

    await waitFor(() =>
      expect(useUIStore.getState().activeModule).toBe("dossier"),
    );
  });

  it("surfaces a relay rate-limit failure as a plain error banner, not a hang or retry", async () => {
    vi.mocked(ingestionService.loadUrl).mockRejectedValue(
      new ingestionService.IngestionError(
        "The relay is rate-limited right now — try again in a bit.",
        "rate-limited",
      ),
    );

    const { container } = render(<IngestionPanel />);
    fireEvent.change(within(container).getByLabelText("API URL"), {
      target: { value: "https://blocked.example.com/data" },
    });
    fireEvent.click(within(container).getByText("Fetch"));

    await waitFor(() =>
      expect(container.textContent).toContain("rate-limited right now"),
    );
    expect(ingestionService.loadUrl).toHaveBeenCalledTimes(1);
  });

  it("undoing a derived table offers Redo, which replays its generating SQL", async () => {
    const dataset: Dataset = {
      id: "ds-1",
      name: "high_value_orders",
      sourceType: "derived",
      tableNames: ["high_value_orders"],
      ingestedAt: new Date().toISOString(),
    };
    useDatasetsStore.getState().registerDataset(dataset, [
      {
        id: "t-1",
        tableName: "high_value_orders",
        datasetId: "ds-1",
        origin: "derived",
        rowCount: 10,
        columnCount: 2,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
        generatingSql:
          "CREATE TABLE high_value_orders AS SELECT * FROM orders WHERE total > 100",
      },
    ]);
    vi.mocked(ingestionService.removeTable).mockImplementation(
      async (tableId) => {
        useDatasetsStore.getState().removeTable(tableId);
      },
    );
    vi.mocked(transformsService.runTransform).mockResolvedValue({
      columnNames: ["result"],
      columnTypes: ["Utf8"],
      rows: [["ok"]],
      rowCount: 1,
      executionTimeMs: 0,
    });

    const { container } = render(<IngestionPanel />);
    fireEvent.click(within(container).getByLabelText("Undo high_value_orders"));

    await waitFor(() => expect(container.textContent).toContain("Dropped"));
    expect(container.textContent).toContain("high_value_orders");

    fireEvent.click(within(container).getByRole("button", { name: "Redo" }));

    await waitFor(() =>
      expect(transformsService.runTransform).toHaveBeenCalledWith(
        "CREATE TABLE high_value_orders AS SELECT * FROM orders WHERE total > 100",
      ),
    );
    await waitFor(() => expect(container.textContent).not.toContain("Dropped"));
  });

  it("shows an error banner when Redo fails, and keeps the offer visible", async () => {
    const dataset: Dataset = {
      id: "ds-1",
      name: "high_value_orders",
      sourceType: "derived",
      tableNames: ["high_value_orders"],
      ingestedAt: new Date().toISOString(),
    };
    useDatasetsStore.getState().registerDataset(dataset, [
      {
        id: "t-1",
        tableName: "high_value_orders",
        datasetId: "ds-1",
        origin: "derived",
        rowCount: 10,
        columnCount: 2,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
        generatingSql:
          "CREATE TABLE high_value_orders AS SELECT * FROM orders WHERE total > 100",
      },
    ]);
    vi.mocked(ingestionService.removeTable).mockImplementation(
      async (tableId) => {
        useDatasetsStore.getState().removeTable(tableId);
      },
    );
    vi.mocked(transformsService.runTransform).mockRejectedValue(
      new Error("orders no longer exists"),
    );

    const { container } = render(<IngestionPanel />);
    fireEvent.click(within(container).getByLabelText("Undo high_value_orders"));
    await waitFor(() => expect(container.textContent).toContain("Dropped"));

    fireEvent.click(within(container).getByRole("button", { name: "Redo" }));

    await waitFor(() =>
      expect(container.textContent).toContain("orders no longer exists"),
    );
    expect(container.textContent).toContain("Dropped");
  });

  it("removing a non-derived table never offers Redo", async () => {
    const dataset: Dataset = {
      id: "ds-1",
      name: "my_file.csv",
      sourceType: "file",
      tableNames: ["my_file"],
      ingestedAt: new Date().toISOString(),
    };
    useDatasetsStore.getState().registerDataset(dataset, [
      {
        id: "t-1",
        tableName: "my_file",
        datasetId: "ds-1",
        origin: "file",
        rowCount: 10,
        columnCount: 2,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
      },
    ]);
    vi.mocked(ingestionService.removeTable).mockResolvedValue(undefined);

    const { container } = render(<IngestionPanel />);
    fireEvent.click(within(container).getByLabelText("Remove my_file"));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).not.toContain("Dropped");
  });

  it("refreshes an API-sourced table and shows its updated last-fetched timestamp (build/07-connectivity/03)", async () => {
    const dataset: Dataset = {
      id: "ds-api",
      name: "https://api.example.com/data",
      sourceType: "api",
      tableNames: ["data"],
      ingestedAt: "2026-07-20T00:00:00.000Z",
    };
    useDatasetsStore.getState().registerDataset(dataset, [
      {
        id: "t-api",
        tableName: "data",
        datasetId: dataset.id,
        origin: "api",
        rowCount: 5,
        columnCount: 2,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
        sourceUrl: "https://api.example.com/data",
        lastFetchedAt: "2026-07-20T00:00:00.000Z",
      },
    ]);
    vi.mocked(ingestionService.refreshTableFromSource).mockImplementation(
      async (tableId) => {
        useDatasetsStore
          .getState()
          .setTableStats(tableId, {
            rowCount: 9,
            columnCount: 2,
            memoryBytes: 150,
          });
        useDatasetsStore
          .getState()
          .setTableRefreshMeta(tableId, {
            sampled: false,
            lastFetchedAt: "2026-07-23T00:00:00.000Z",
          });
        return {
          pagesFetched: 1,
          bytesAccumulated: 150,
          sizeTier: "full",
          usedRelay: false,
        };
      },
    );

    const { container } = render(<IngestionPanel />);
    fireEvent.click(
      within(container).getByLabelText("Refresh data from source"),
    );

    expect(ingestionService.refreshTableFromSource).toHaveBeenCalledWith(
      "t-api",
      expect.any(Function),
    );
    await waitFor(() =>
      expect(container.textContent).toContain(
        new Date("2026-07-23T00:00:00.000Z").toLocaleString(),
      ),
    );
    expect(
      useDatasetsStore.getState().tables.find((t) => t.id === "t-api")
        ?.rowCount,
    ).toBe(9);
  });

  it("leaves the previous table intact and shows a clear error when a refresh fails", async () => {
    const dataset: Dataset = {
      id: "ds-api",
      name: "https://api.example.com/data",
      sourceType: "api",
      tableNames: ["data"],
      ingestedAt: "2026-07-20T00:00:00.000Z",
    };
    const originalTable: TableRegistryEntry = {
      id: "t-api",
      tableName: "data",
      datasetId: dataset.id,
      origin: "api",
      rowCount: 5,
      columnCount: 2,
      memoryBytes: 100,
      createdAt: dataset.ingestedAt,
      sourceUrl: "https://api.example.com/data",
      lastFetchedAt: "2026-07-20T00:00:00.000Z",
    };
    useDatasetsStore.getState().registerDataset(dataset, [originalTable]);
    vi.mocked(ingestionService.refreshTableFromSource).mockRejectedValue(
      new ingestionService.IngestionError(
        "The API returned 500 Internal Server Error",
        "http-error",
      ),
    );

    const { container } = render(<IngestionPanel />);
    fireEvent.click(
      within(container).getByLabelText("Refresh data from source"),
    );

    await waitFor(() =>
      expect(container.textContent).toContain(
        "The API returned 500 Internal Server Error",
      ),
    );
    expect(
      useDatasetsStore.getState().tables.find((t) => t.id === "t-api"),
    ).toEqual(originalTable);
  });

  it("shows the relay disclosure note when a refresh falls back to Tier 2", async () => {
    const dataset: Dataset = {
      id: "ds-api",
      name: "https://blocked.example.com/data",
      sourceType: "api",
      tableNames: ["data"],
      ingestedAt: "2026-07-20T00:00:00.000Z",
    };
    useDatasetsStore.getState().registerDataset(dataset, [
      {
        id: "t-api",
        tableName: "data",
        datasetId: dataset.id,
        origin: "api",
        rowCount: 5,
        columnCount: 2,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
        sourceUrl: "https://blocked.example.com/data",
        lastFetchedAt: "2026-07-20T00:00:00.000Z",
      },
    ]);
    vi.mocked(ingestionService.refreshTableFromSource).mockResolvedValue({
      pagesFetched: 1,
      bytesAccumulated: 100,
      sizeTier: "full",
      usedRelay: true,
    });

    const { container } = render(<IngestionPanel />);
    fireEvent.click(
      within(container).getByLabelText("Refresh data from source"),
    );

    await waitFor(() =>
      expect(container.textContent).toContain(
        "passed through DataScope's relay",
      ),
    );
  });

  it("shows a possibly-stale badge on a derived table after its source is refreshed", async () => {
    const dataset: Dataset = {
      id: "ds-api",
      name: "https://api.example.com/orders",
      sourceType: "api",
      tableNames: ["orders"],
      ingestedAt: "2026-07-20T00:00:00.000Z",
    };
    useDatasetsStore.getState().registerDataset(dataset, [
      {
        id: "t-api",
        tableName: "orders",
        datasetId: dataset.id,
        origin: "api",
        rowCount: 5,
        columnCount: 2,
        memoryBytes: 100,
        createdAt: dataset.ingestedAt,
        sourceUrl: "https://api.example.com/orders",
        lastFetchedAt: "2026-07-20T00:00:00.000Z",
      },
      {
        id: "t-derived",
        tableName: "high_value_orders",
        datasetId: "ds-derived",
        origin: "derived",
        rowCount: 2,
        columnCount: 2,
        memoryBytes: 50,
        createdAt: dataset.ingestedAt,
        generatingSql:
          "CREATE TABLE high_value_orders AS SELECT * FROM orders WHERE total > 100",
      },
    ]);
    vi.mocked(ingestionService.refreshTableFromSource).mockImplementation(
      async () => {
        useDatasetsStore.getState().markTablesStale(["t-derived"]);
        return {
          pagesFetched: 1,
          bytesAccumulated: 100,
          sizeTier: "full",
          usedRelay: false,
        };
      },
    );

    const { container } = render(<IngestionPanel />);
    fireEvent.click(
      within(container).getByLabelText("Refresh orders from source"),
    );

    await waitFor(() =>
      expect(container.textContent).toContain("possibly stale"),
    );
  });
});
