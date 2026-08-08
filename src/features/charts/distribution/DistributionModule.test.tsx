import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { DistributionModule } from "./DistributionModule";
import { useDatasetsStore } from "../../../stores/datasets";
import * as chartsService from "../../../services/charts";
import * as analystService from "../../../services/analyst";
import type { AnalystCore } from "../../../lib/analyst/core";
import type { QueryResult, TableRegistryEntry } from "../../../types";

vi.mock("../../../services/charts", async () => {
  const actual = await vi.importActual<typeof chartsService>(
    "../../../services/charts",
  );
  return { ...actual, runChartQuery: vi.fn() };
});

// A0 re-pointed this panel's quartiles at the analyst core, so the box plot's
// numbers now arrive as an `OpResult` rather than as a raw `QueryResult` from
// a builder only this module used.
vi.mock("../../../services/analyst", () => ({ analystCore: vi.fn() }));

const emptyResult: QueryResult = {
  columnNames: [],
  columnTypes: [],
  rows: [],
  rowCount: 0,
  executionTimeMs: 1,
};

const COLUMN_STATS_SQL =
  'SELECT count(*) AS row_count, CAST(quantile_cont("Age", 0.25) AS DOUBLE) AS q1, ' +
  'CAST(quantile_cont("Age", 0.5) AS DOUBLE) AS median, CAST(quantile_cont("Age", 0.75) AS DOUBLE) AS q3 FROM "titanic"';

/** The core's envelope for `column_stats`, built from the same q1/median/q3 row the old quartiles query returned. */
function columnStatsOutcome(quartiles: QueryResult) {
  return {
    op: "column_stats",
    sql: COLUMN_STATS_SQL,
    resultId: null,
    schema: [
      { name: "row_count", type: "BIGINT" },
      { name: "q1", type: "DOUBLE" },
      { name: "median", type: "DOUBLE" },
      { name: "q3", type: "DOUBLE" },
    ],
    rowCount: quartiles.rows.length,
    rows: quartiles.rows.map(([q1, median, q3]) => [891, q1, median, q3]),
    complete: true,
    nextOffset: null,
    elapsedMs: 1,
  };
}

function mockAnalystCore(quartiles: QueryResult) {
  vi.mocked(analystService.analystCore).mockReturnValue({
    call: vi.fn().mockResolvedValue(columnStatsOutcome(quartiles)),
  } as unknown as AnalystCore);
}

function resultOf(columnNames: string[], rows: unknown[][]): QueryResult {
  return {
    columnNames,
    columnTypes: columnNames.map(() => "Float64"),
    rows,
    rowCount: rows.length,
    executionTimeMs: 1,
  };
}

const titanic: TableRegistryEntry = {
  id: "t-1",
  tableName: "titanic",
  datasetId: "ds-1",
  origin: "sample",
  rowCount: 891,
  columnCount: 1,
  memoryBytes: 4096,
  createdAt: new Date().toISOString(),
  columns: [
    {
      name: "Age",
      semanticType: "Quantitative",
      physicalType: "DOUBLE",
      cardinality: 88,
      nullPercentage: 20,
      min: 0.42,
      max: 80,
      mean: 29.7,
      stdDev: 14.5,
    },
  ],
};

/** Routes each mocked query by its distinguishing SQL fragment rather than call order — the module fires up to 5 real queries across two Promise.all batches. */
function mockDistributionQueries({
  histogram = emptyResult,
  quartiles = emptyResult,
  moments = emptyResult,
  whiskers = emptyResult,
  outliers = emptyResult,
}: Partial<
  Record<
    "histogram" | "quartiles" | "moments" | "whiskers" | "outliers",
    QueryResult
  >
> = {}) {
  mockAnalystCore(quartiles);
  vi.mocked(chartsService.runChartQuery).mockImplementation((sql: string) => {
    if (sql.includes("skewness")) return Promise.resolve(moments);
    if (sql.includes("whisker_low")) return Promise.resolve(whiskers);
    if (sql.includes("LIMIT 500")) return Promise.resolve(outliers);
    return Promise.resolve(histogram);
  });
}

describe("DistributionModule", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useDatasetsStore.setState({
      datasets: [],
      tables: [],
      workerStatus: "idle",
      workerError: null,
    });
    vi.mocked(chartsService.runChartQuery).mockReset();
    // A default so the tests that only script `runChartQuery` still get a core.
    mockAnalystCore(emptyResult);
  });

  it("shows a clear message with no table that has a numeric column", () => {
    const identifierOnly: TableRegistryEntry = {
      ...titanic,
      columns: [
        {
          name: "id",
          semanticType: "Identifier",
          physicalType: "BIGINT",
          cardinality: 891,
          nullPercentage: 0,
          min: 1,
          max: 891,
          mean: null,
          stdDev: null,
        },
      ],
    };
    useDatasetsStore.setState({ tables: [identifierOnly] });
    const { container } = render(<DistributionModule />);
    expect(container.textContent).toContain("numeric column");
  });

  it("runs histogram/quartiles/moments queries and renders all three views", async () => {
    mockDistributionQueries({
      histogram: resultOf(
        ["bucket", "freq"],
        [
          [0, 50],
          [9, 3],
        ],
      ),
      quartiles: resultOf(["q1", "median", "q3"], [[20, 28, 38]]),
      moments: resultOf(
        ["mean", "median", "mode", "std_dev", "skewness", "kurtosis"],
        [[29.7, 28, 24, 14.5, 0.4, -0.5]],
      ),
      whiskers: resultOf(["whisker_low", "whisker_high"], [[0.42, 64]]),
      outliers: resultOf(["value"], [[66], [70]]),
    });
    useDatasetsStore.setState({ tables: [titanic] });
    const { container } = render(<DistributionModule />);

    await waitFor(() =>
      expect(
        within(container).getByLabelText("Value distribution histogram"),
      ).toBeTruthy(),
    );
    expect(within(container).getByLabelText(/^Box plot:/)).toBeTruthy();
    expect(container.textContent).toContain("29.7"); // mean
    expect(container.textContent).toContain("2 outliers");
    expect(container.textContent).toContain("Histogram");
    expect(container.textContent).toContain("Descriptive statistics");
  });

  it("asks the analyst core for the quartiles and shows the SQL the core ran", async () => {
    mockDistributionQueries({
      histogram: resultOf(["bucket", "freq"], [[0, 50]]),
      quartiles: resultOf(["q1", "median", "q3"], [[20, 28, 38]]),
      moments: resultOf(
        ["mean", "median", "mode", "std_dev", "skewness", "kurtosis"],
        [[29.7, 28, 24, 14.5, 0.4, -0.5]],
      ),
      whiskers: resultOf(["whisker_low", "whisker_high"], [[0.42, 64]]),
    });
    useDatasetsStore.setState({ tables: [titanic] });
    const { container } = render(<DistributionModule />);

    await waitFor(() =>
      expect(within(container).getByLabelText(/^Box plot:/)).toBeTruthy(),
    );
    const core = vi.mocked(analystService.analystCore).mock.results[0]!
      .value as AnalystCore;
    expect(core.call).toHaveBeenCalledWith("column_stats", {
      table: "titanic",
      column: "Age",
    });
    // The panel now shows the core's own `sql` — the same statement a model
    // calling `column_stats` would be handed back (master §11.5, D58).
    expect(container.textContent).toContain(COLUMN_STATS_SQL);
  });

  it("opens on the answer (D68e) — a prefill seeds the table and column instead of the first-eligible default", async () => {
    mockDistributionQueries();
    const weather: TableRegistryEntry = {
      ...titanic,
      id: "t-2",
      tableName: "weather",
      columns: [{ ...titanic.columns![0], name: "Temp" }],
    };
    useDatasetsStore.setState({ tables: [titanic, weather] });
    const { container } = render(
      <DistributionModule
        prefill={{ tableName: "weather", columns: ["Temp"] }}
      />,
    );

    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalled());
    expect(
      (
        within(container).getByLabelText(
          "Distribution table",
        ) as HTMLSelectElement
      ).value,
    ).toBe("t-2");
    expect(
      (
        within(container).getByLabelText(
          "Distribution column",
        ) as HTMLSelectElement
      ).value,
    ).toBe("Temp");
  });

  it("offers a table picker only once more than one table qualifies", () => {
    mockDistributionQueries();
    useDatasetsStore.setState({ tables: [titanic] });
    const { container: single } = render(<DistributionModule />);
    expect(within(single).queryByLabelText("Distribution table")).toBeNull();
    cleanup();

    const secondTable: TableRegistryEntry = {
      ...titanic,
      id: "t-2",
      tableName: "weather",
    };
    useDatasetsStore.setState({ tables: [titanic, secondTable] });
    const { container: multi } = render(<DistributionModule />);
    expect(within(multi).queryByLabelText("Distribution table")).not.toBeNull();
  });

  it("re-queries and re-renders when the bin count changes", async () => {
    mockDistributionQueries({
      histogram: resultOf(["bucket", "freq"], [[0, 10]]),
      quartiles: resultOf(["q1", "median", "q3"], [[20, 28, 38]]),
      moments: resultOf(
        ["mean", "median", "mode", "std_dev", "skewness", "kurtosis"],
        [[29.7, 28, 24, 14.5, 0.4, -0.5]],
      ),
      whiskers: resultOf(["whisker_low", "whisker_high"], [[0.42, 64]]),
    });
    useDatasetsStore.setState({ tables: [titanic] });
    const { container } = render(<DistributionModule />);

    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalled());
    const initialCalls = vi.mocked(chartsService.runChartQuery).mock.calls
      .length;

    fireEvent.change(within(container).getByLabelText("Bin count"), {
      target: { value: "20" },
    });

    await waitFor(() =>
      expect(
        vi.mocked(chartsService.runChartQuery).mock.calls.length,
      ).toBeGreaterThan(initialCalls),
    );
    const histogramCalls = vi
      .mocked(chartsService.runChartQuery)
      .mock.calls.map((c) => c[0])
      .filter((sql) => sql.includes("LEAST(GREATEST"));
    expect(histogramCalls.at(-1)).toContain(", 19)"); // binCount - 1 = 19
  });

  it("shows a friendly error when a query fails", async () => {
    vi.mocked(chartsService.runChartQuery).mockRejectedValue(new Error("boom"));
    useDatasetsStore.setState({ tables: [titanic] });
    const { container } = render(<DistributionModule />);
    await waitFor(() => expect(container.textContent).toContain("boom"));
  });
});
