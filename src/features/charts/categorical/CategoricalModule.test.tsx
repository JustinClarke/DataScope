import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { CategoricalModule, DONUT_MAX_SLICES } from "./CategoricalModule";
import { CHART_SERIES_DARK } from "../../../lib/chartPalette";
import { useDatasetsStore } from "../../../stores/datasets";
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

function resultOf(columnNames: string[], rows: unknown[][]): QueryResult {
  return {
    columnNames,
    columnTypes: columnNames.map(() => "Utf8"),
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
  columnCount: 2,
  memoryBytes: 4096,
  createdAt: new Date().toISOString(),
  columns: [
    {
      name: "Pclass",
      semanticType: "Categorical",
      physicalType: "BIGINT",
      cardinality: 3,
      nullPercentage: 0,
      min: 1,
      max: 3,
      mean: null,
      stdDev: null,
    },
    {
      name: "Fare",
      semanticType: "Quantitative",
      physicalType: "DOUBLE",
      cardinality: 200,
      nullPercentage: 0,
      min: 0,
      max: 512,
      mean: 32,
      stdDev: 49,
    },
  ],
};

/** Routes each mocked query by its distinguishing SQL fragment rather than call order — the module fires up to two real queries per render. */
function mockCategoricalQueries({
  frequency = emptyResult,
  grouped = emptyResult,
}: Partial<Record<"frequency" | "grouped", QueryResult>> = {}) {
  vi.mocked(chartsService.runChartQuery).mockImplementation((sql: string) => {
    if (sql.includes("AS total,")) return Promise.resolve(grouped);
    return Promise.resolve(frequency);
  });
}

describe("CategoricalModule", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useDatasetsStore.setState({
      datasets: [],
      tables: [],
      workerStatus: "idle",
      workerError: null,
    });
    vi.mocked(chartsService.runChartQuery).mockReset();
  });

  it("shows a clear message with no table that has a categorical column", () => {
    const numericOnly: TableRegistryEntry = {
      ...titanic,
      columns: [
        {
          name: "Fare",
          semanticType: "Quantitative",
          physicalType: "DOUBLE",
          cardinality: 200,
          nullPercentage: 0,
          min: 0,
          max: 512,
          mean: 32,
          stdDev: 49,
        },
      ],
    };
    useDatasetsStore.setState({ tables: [numericOnly] });
    const { container } = render(<CategoricalModule />);
    expect(container.textContent).toContain("categorical column");
  });

  it("runs a frequency query, sorted descending, for the eligible table", async () => {
    mockCategoricalQueries({
      frequency: resultOf(
        ["category", "count"],
        [
          ["1", 216],
          ["3", 491],
          ["2", 184],
        ],
      ),
    });
    useDatasetsStore.setState({ tables: [titanic] });
    const { container } = render(<CategoricalModule />);

    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalled());
    const freqSql = vi
      .mocked(chartsService.runChartQuery)
      .mock.calls.map((c) => c[0])
      .find((sql) => sql.includes("AS count"));
    expect(freqSql).toContain('"titanic"');
    expect(freqSql).toContain('"Pclass"');
    expect(freqSql).toContain("ORDER BY 2 DESC");
    await waitFor(() => expect(container.textContent).toContain("Frequency"));
  });

  it("caps donut wedges at the palette it has slots for, plus Other", () => {
    expect(DONUT_MAX_SLICES - 1).toBe(CHART_SERIES_DARK.length);
  });

  it("offers the Donut tab at low cardinality and switches views", async () => {
    mockCategoricalQueries({
      frequency: resultOf(
        ["category", "count"],
        [
          ["1", 216],
          ["3", 491],
          ["2", 184],
        ],
      ),
    });
    useDatasetsStore.setState({ tables: [titanic] });
    const { container } = render(<CategoricalModule />);
    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalled());

    const donutTab = within(container).getByText("Donut") as HTMLButtonElement;
    expect(donutTab.disabled).toBe(false);
    fireEvent.click(donutTab);
    expect(donutTab.getAttribute("aria-pressed")).toBe("true");
  });

  it("disables the Donut tab past the cardinality limit", async () => {
    const highCardinality: TableRegistryEntry = {
      ...titanic,
      columns: [
        {
          name: "City",
          semanticType: "Categorical",
          physicalType: "VARCHAR",
          cardinality: 40,
          nullPercentage: 0,
          min: null,
          max: null,
          mean: null,
          stdDev: null,
        },
      ],
    };
    mockCategoricalQueries();
    useDatasetsStore.setState({ tables: [highCardinality] });
    const { container } = render(<CategoricalModule />);
    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalled());

    const donutTab = within(container).getByText("Donut") as HTMLButtonElement;
    expect(donutTab.disabled).toBe(true);
    expect(donutTab.getAttribute("title")).toContain("Too many categories");
  });

  it("runs a grouped-bar summary query once a numeric column is available and the tab is selected", async () => {
    mockCategoricalQueries({
      frequency: resultOf(
        ["category", "count"],
        [
          ["1", 216],
          ["3", 491],
          ["2", 184],
        ],
      ),
      grouped: resultOf(
        ["grp", "total", "mean", "rows"],
        [
          ["1", 18177, 84.15, 216],
          ["3", 15694, 13.68, 491],
        ],
      ),
    });
    useDatasetsStore.setState({ tables: [titanic] });
    const { container } = render(<CategoricalModule />);
    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalled());

    const groupedTab = within(container).getByText(
      "Grouped bar",
    ) as HTMLButtonElement;
    expect(groupedTab.disabled).toBe(false);
    fireEvent.click(groupedTab);

    const grpSql = vi
      .mocked(chartsService.runChartQuery)
      .mock.calls.map((c) => c[0])
      .find((sql) => sql.includes("AS total,"));
    expect(grpSql).toContain('"Pclass"');
    expect(grpSql).toContain('SUM("Fare")');
    expect(grpSql).toContain('AVG("Fare")');
    await waitFor(() => expect(container.textContent).toContain("Grouped bar"));
  });

  it("disables the Grouped bar tab with no numeric column on the table", () => {
    const catOnly: TableRegistryEntry = {
      ...titanic,
      columns: [
        {
          name: "Pclass",
          semanticType: "Categorical",
          physicalType: "BIGINT",
          cardinality: 3,
          nullPercentage: 0,
          min: 1,
          max: 3,
          mean: null,
          stdDev: null,
        },
      ],
    };
    mockCategoricalQueries();
    useDatasetsStore.setState({ tables: [catOnly] });
    const { container } = render(<CategoricalModule />);

    const groupedTab = within(container).getByText(
      "Grouped bar",
    ) as HTMLButtonElement;
    expect(groupedTab.disabled).toBe(true);
    expect(groupedTab.getAttribute("title")).toBe("Needs a numeric column");
  });

  it("opens on the answer (D68e) — a [category, measure] prefill seeds both columns and lands on Grouped bar", async () => {
    mockCategoricalQueries({
      frequency: resultOf(["category", "count"], [["1", 216]]),
      grouped: resultOf(
        ["grp", "total", "mean", "rows"],
        [["1", 18177, 84.15, 216]],
      ),
    });
    useDatasetsStore.setState({ tables: [titanic] });
    const { container } = render(
      <CategoricalModule
        prefill={{ tableName: "titanic", columns: ["Pclass", "Fare"] }}
      />,
    );

    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalled());
    const groupedTab = within(container).getByRole("button", {
      name: "Grouped bar",
    });
    expect(groupedTab.getAttribute("aria-pressed")).toBe("true");
    const grpSql = vi
      .mocked(chartsService.runChartQuery)
      .mock.calls.map((c) => c[0])
      .find((sql) => sql.includes("AS total,"));
    expect(grpSql).toContain('SUM("Fare")');
  });

  it("a category-only prefill (the generic fallback) seeds the column but stays on Frequency", async () => {
    mockCategoricalQueries({
      frequency: resultOf(["category", "count"], [["1", 216]]),
    });
    useDatasetsStore.setState({ tables: [titanic] });
    const { container } = render(
      <CategoricalModule
        prefill={{ tableName: "titanic", columns: ["Pclass"] }}
      />,
    );

    await waitFor(() => expect(chartsService.runChartQuery).toHaveBeenCalled());
    expect(
      within(container)
        .getByRole("button", { name: "Frequency" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("offers a table picker only once more than one table qualifies", () => {
    mockCategoricalQueries();
    useDatasetsStore.setState({ tables: [titanic] });
    const { container: single } = render(<CategoricalModule />);
    expect(within(single).queryByLabelText("Categorical table")).toBeNull();
    cleanup();

    const secondTable: TableRegistryEntry = {
      ...titanic,
      id: "t-2",
      tableName: "reviews",
    };
    useDatasetsStore.setState({ tables: [titanic, secondTable] });
    const { container: multi } = render(<CategoricalModule />);
    expect(within(multi).queryByLabelText("Categorical table")).not.toBeNull();
  });

  it("shows a friendly error when a query fails", async () => {
    vi.mocked(chartsService.runChartQuery).mockRejectedValue(new Error("boom"));
    useDatasetsStore.setState({ tables: [titanic] });
    const { container } = render(<CategoricalModule />);
    await waitFor(() => expect(container.textContent).toContain("boom"));
  });
});
