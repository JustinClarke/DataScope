import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { CorrelationModule } from "./CorrelationModule";
import { useDatasetsStore } from "../../../stores/datasets";
import { useUIStore } from "../../../stores/ui";
import * as chartsService from "../../../services/charts";
import type { QueryResult, TableRegistryEntry } from "../../../types";

vi.mock("../../../services/charts", async () => {
  const actual = await vi.importActual<typeof chartsService>(
    "../../../services/charts",
  );
  return { ...actual, runChartQuery: vi.fn() };
});

const emptyResult: QueryResult = {
  columnNames: [],
  columnTypes: [],
  rows: [],
  rowCount: 0,
  executionTimeMs: 1,
};

function matrixResult(pairs: number[]): QueryResult {
  return {
    columnNames: pairs.map((_, i) => `c${i}`),
    columnTypes: pairs.map(() => "Float64"),
    rows: [pairs],
    rowCount: 1,
    executionTimeMs: 1,
  };
}

const weather: TableRegistryEntry = {
  id: "t-1",
  tableName: "weather",
  datasetId: "ds-1",
  origin: "sample",
  rowCount: 3650,
  columnCount: 3,
  memoryBytes: 4096,
  createdAt: new Date().toISOString(),
  columns: [
    {
      name: "temp",
      semanticType: "Quantitative",
      physicalType: "DOUBLE",
      cardinality: 100,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
    {
      name: "humidity",
      semanticType: "Quantitative",
      physicalType: "DOUBLE",
      cardinality: 100,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
    {
      name: "wind",
      semanticType: "Quantitative",
      physicalType: "DOUBLE",
      cardinality: 100,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
  ],
};

// Titanic-shaped: only one numeric column, so it never qualifies (needs ≥2).
const titanic: TableRegistryEntry = {
  id: "t-2",
  tableName: "titanic",
  datasetId: "ds-2",
  origin: "sample",
  rowCount: 891,
  columnCount: 1,
  memoryBytes: 2048,
  createdAt: new Date().toISOString(),
  columns: [
    {
      name: "Fare",
      semanticType: "Quantitative",
      physicalType: "DOUBLE",
      cardinality: 200,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
  ],
};

function getSqlPreview(container: HTMLElement): string {
  return (
    within(container).getByText(/^SELECT/, { selector: "pre" }).textContent ??
    ""
  );
}

describe("CorrelationModule", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useDatasetsStore.setState({
      datasets: [],
      tables: [],
      workerStatus: "idle",
      workerError: null,
    });
    useUIStore.getState().clearPendingPrefill();
    vi.mocked(chartsService.runChartQuery)
      .mockReset()
      .mockResolvedValue(emptyResult);
  });

  it("shows a clear message with no table that has 2+ numeric columns", () => {
    useDatasetsStore.setState({ tables: [titanic] });
    const { container } = render(<CorrelationModule />);
    expect(container.textContent).toContain("2 or more numeric columns");
  });

  it("runs a batched matrix query for the eligible table and renders the heatmap", async () => {
    vi.mocked(chartsService.runChartQuery).mockResolvedValue(
      matrixResult([0.8, -0.2, 0.05]),
    );
    useDatasetsStore.setState({ tables: [titanic, weather] });
    const { container } = render(<CorrelationModule />);

    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalled());
    const sql = vi.mocked(chartsService.runChartQuery).mock.calls[0][0];
    expect(sql).toContain('"weather"');
    expect(sql).toContain('corr("temp", "humidity")');
    expect(sql.match(/corr\(/g)).toHaveLength(3);

    await waitFor(() => expect(getSqlPreview(container)).toBe(sql));
    expect(
      within(container).getByLabelText("temp vs humidity: 0.800"),
    ).toBeTruthy();
  });

  it("offers a table picker only once more than one table qualifies", () => {
    useDatasetsStore.setState({ tables: [weather] });
    const { container: single } = render(<CorrelationModule />);
    expect(within(single).queryByLabelText("Correlation table")).toBeNull();
    cleanup();

    const secondTable: TableRegistryEntry = {
      ...weather,
      id: "t-3",
      tableName: "stock_prices",
    };
    useDatasetsStore.setState({ tables: [weather, secondTable] });
    const { container: multi } = render(<CorrelationModule />);
    expect(within(multi).queryByLabelText("Correlation table")).not.toBeNull();
  });

  it("clicking a cell opens the scatter drill-through for that pair", async () => {
    vi.mocked(chartsService.runChartQuery).mockResolvedValueOnce(
      matrixResult([0.8, -0.2, 0.05]),
    );
    useDatasetsStore.setState({ tables: [weather] });
    const { container } = render(<CorrelationModule />);

    await waitFor(() =>
      expect(
        within(container).getByLabelText("temp vs humidity: 0.800"),
      ).toBeTruthy(),
    );

    vi.mocked(chartsService.runChartQuery).mockResolvedValueOnce({
      columnNames: ["temp", "humidity"],
      columnTypes: ["Float64", "Float64"],
      rows: [[1, 2]],
      rowCount: 1,
      executionTimeMs: 1,
    });
    fireEvent.click(
      within(container).getByLabelText("temp vs humidity: 0.800"),
    );

    expect(container.textContent).toContain("temp vs humidity");
    await waitFor(() =>
      expect(chartsService.runChartQuery).toHaveBeenCalledTimes(2),
    );
    const drillSql = vi.mocked(chartsService.runChartQuery).mock.calls[1][0];
    expect(drillSql).toContain('SELECT "temp", "humidity"');
  });

  it("opens on the answer (D68e) — a leakage prefill selects the table and drills straight into the pair", async () => {
    vi.mocked(chartsService.runChartQuery).mockResolvedValueOnce(
      matrixResult([0.8, -0.2, 0.05]),
    );
    useDatasetsStore.setState({ tables: [weather] });
    useUIStore
      .getState()
      .setActiveModule("correlation", null, {
        tableName: "weather",
        columns: ["humidity", "wind"],
      });

    const { container } = render(<CorrelationModule />);
    await waitFor(() =>
      expect(
        within(container).getByLabelText("humidity vs wind: 0.050"),
      ).toBeTruthy(),
    );

    // Drilled in without a click — the pair from the prefill, not a user selection.
    expect(container.textContent).toContain("humidity vs wind");
    // Consumed exactly once — a later sidebar-reached open of this module starts empty.
    expect(useUIStore.getState().pendingPrefill).toBeNull();
  });

  it("W7.5: a `prefill` prop (the Workbench tab's own initializer) wins over whatever the old shell's global store holds", async () => {
    vi.mocked(chartsService.runChartQuery).mockResolvedValueOnce(
      matrixResult([0.8, -0.2, 0.05]),
    );
    useDatasetsStore.setState({ tables: [weather] });
    // Deliberately different from the prop below — proves the prop is used.
    useUIStore
      .getState()
      .setActiveModule("correlation", null, {
        tableName: "weather",
        columns: ["temp", "humidity"],
      });

    const { container } = render(
      <CorrelationModule
        prefill={{ tableName: "weather", columns: ["humidity", "wind"] }}
      />,
    );
    await waitFor(() =>
      expect(
        within(container).getByLabelText("humidity vs wind: 0.050"),
      ).toBeTruthy(),
    );
    expect(container.textContent).toContain("humidity vs wind");
    // The global store's own prefill is untouched — the override path never reads or clears it.
    expect(useUIStore.getState().pendingPrefill).toEqual({
      tableName: "weather",
      columns: ["temp", "humidity"],
    });
  });

  it("a mismatched prefill pair (names columns not on this table) silently no-ops", async () => {
    vi.mocked(chartsService.runChartQuery).mockResolvedValueOnce(
      matrixResult([0.8, -0.2, 0.05]),
    );
    useDatasetsStore.setState({ tables: [weather] });
    useUIStore
      .getState()
      .setActiveModule("correlation", null, {
        tableName: "weather",
        columns: ["temp", "nonexistent"],
      });

    const { container } = render(<CorrelationModule />);
    await waitFor(() =>
      expect(
        within(container).getByLabelText("temp vs humidity: 0.800"),
      ).toBeTruthy(),
    );
    expect(container.textContent).not.toContain("temp vs nonexistent");
  });

  it("shows a friendly error when the matrix query fails", async () => {
    vi.mocked(chartsService.runChartQuery)
      .mockReset()
      .mockRejectedValue(new Error("boom"));
    useDatasetsStore.setState({ tables: [weather] });
    const { container } = render(<CorrelationModule />);
    await waitFor(() => expect(container.textContent).toContain("boom"));
  });
});
