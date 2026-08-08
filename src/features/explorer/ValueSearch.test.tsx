import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { ValueSearch } from "./ValueSearch";
import { useDatasetsStore } from "../../stores/datasets";
import { useSelectionStore } from "../../stores/selection";
import type { Dataset, TableRegistryEntry } from "../../types";

const { openDestinationMock, analystCoreMock } = vi.hoisted(() => ({
  openDestinationMock: vi.fn(),
  analystCoreMock: vi.fn(),
}));
vi.mock("../../services/navigation", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/navigation")
  >("../../services/navigation");
  return { ...actual, openDestination: openDestinationMock };
});
vi.mock("../../services/analyst", () => ({ analystCore: analystCoreMock }));

const dataset: Dataset = {
  id: "ds-1",
  name: "demo",
  sourceType: "sample",
  tableNames: ["orders"],
  ingestedAt: new Date().toISOString(),
};

const orders: TableRegistryEntry = {
  id: "t-orders",
  tableName: "orders",
  datasetId: "ds-1",
  origin: "sample",
  rowCount: 10,
  columnCount: 2,
  memoryBytes: 100,
  createdAt: dataset.ingestedAt,
};

function searchOutcome(rows: unknown[][]) {
  return {
    op: "search_values",
    sql: "WITH matches AS (…) SELECT …",
    resultId: null,
    schema: [
      { name: "table", type: "VARCHAR" },
      { name: "column", type: "VARCHAR" },
      { name: "match_count", type: "BIGINT" },
      { name: "sample_values", type: "VARCHAR[]" },
    ],
    rowCount: rows.length,
    rows,
    complete: true,
    nextOffset: null,
    elapsedMs: 1,
  };
}

describe("ValueSearch (A2) — search_values above the explorer rail", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    openDestinationMock.mockReset();
    analystCoreMock.mockReset();
    useDatasetsStore.setState({
      tables: [orders],
      datasets: [dataset],
      workerStatus: "ready",
      workerError: null,
    });
    useSelectionStore.getState().clearSelection();
  });

  it("renders no results section before anything is typed", () => {
    const { queryByTestId } = render(<ValueSearch />);
    expect(queryByTestId("value-search-results")).toBeNull();
  });

  it("searches after the debounce and lists a matching column with its match count", async () => {
    const callMock = vi
      .fn()
      .mockResolvedValue(
        searchOutcome([["orders", "status", 3, ["completed"]]]),
      );
    analystCoreMock.mockReturnValue({ call: callMock });

    const { getByTestId, findByTestId } = render(<ValueSearch />);
    fireEvent.change(getByTestId("value-search-input"), {
      target: { value: "completed" },
    });

    await waitFor(() =>
      expect(callMock).toHaveBeenCalledWith("search_values", {
        term: "completed",
      }),
    );
    const row = await findByTestId("value-search-row");
    expect(row.textContent).toContain("orders.status");
    expect(row.textContent).toContain("3");
  });

  it("selects the column and opens its profile tab on click", async () => {
    const callMock = vi
      .fn()
      .mockResolvedValue(
        searchOutcome([["orders", "status", 3, ["completed"]]]),
      );
    analystCoreMock.mockReturnValue({ call: callMock });

    const { getByTestId, findByTestId } = render(<ValueSearch />);
    fireEvent.change(getByTestId("value-search-input"), {
      target: { value: "completed" },
    });

    const row = await findByTestId("value-search-row");
    fireEvent.click(row);

    expect(useSelectionStore.getState().selectedColumn).toEqual({
      tableId: "t-orders",
      column: "status",
    });
    expect(openDestinationMock).toHaveBeenCalledWith("profile", "t-orders");
  });

  it("shows a styled empty state rather than silence when no column matches", async () => {
    const callMock = vi.fn().mockResolvedValue(searchOutcome([]));
    analystCoreMock.mockReturnValue({ call: callMock });

    const { getByTestId, findByTestId } = render(<ValueSearch />);
    fireEvent.change(getByTestId("value-search-input"), {
      target: { value: "nope" },
    });

    const empty = await findByTestId("value-search-empty");
    expect(empty.textContent).toContain("No column contains");
  });

  it("surfaces an operation error inline", async () => {
    const callMock = vi
      .fn()
      .mockResolvedValue({ ok: false, code: "sql_error", message: "boom" });
    analystCoreMock.mockReturnValue({ call: callMock });

    const { getByTestId, findByTestId } = render(<ValueSearch />);
    fireEvent.change(getByTestId("value-search-input"), {
      target: { value: "x" },
    });

    const error = await findByTestId("value-search-error");
    expect(error.textContent).toContain("boom");
  });

  it("re-searches with each new debounced term rather than only firing once", async () => {
    const callMock = vi.fn().mockResolvedValue(searchOutcome([]));
    analystCoreMock.mockReturnValue({ call: callMock });

    const { getByTestId } = render(<ValueSearch />);
    const input = getByTestId("value-search-input");
    fireEvent.change(input, { target: { value: "a" } });
    await waitFor(() =>
      expect(callMock).toHaveBeenCalledWith("search_values", { term: "a" }),
    );

    fireEvent.change(input, { target: { value: "ab" } });
    await waitFor(() =>
      expect(callMock).toHaveBeenCalledWith("search_values", { term: "ab" }),
    );
  });
});
