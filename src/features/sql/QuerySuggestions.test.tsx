import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor, fireEvent, within } from "@testing-library/react";
import { QuerySuggestions } from "./QuerySuggestions";
import { useDatasetsStore } from "../../stores/datasets";
import { useQueryStore, getSession, CONSOLE_SESSION } from "../../stores/query";
import { EducationalPanelProvider } from "../../app/EducationalPanelContext";
import { useEducationalPanel } from "../../app/useEducationalPanel";
import type { TableRegistryEntry } from "../../types";
import * as sqlService from "../../services/sql";

vi.mock("../../services/sql", async () => {
  const actual = await vi.importActual<typeof sqlService>("../../services/sql");
  return { ...actual, runQuery: vi.fn() };
});

// Renders the panel's live content alongside QuerySuggestions so a test can
// assert on what a "Why?" click pushed into it, the same real wiring
// App.tsx gives every consumer of useEducationalPanel.
function PanelProbe() {
  const { content } = useEducationalPanel();
  return <div data-testid="panel">{content}</div>;
}

function renderWithPanel() {
  return render(
    <EducationalPanelProvider>
      <QuerySuggestions />
      <PanelProbe />
    </EducationalPanelProvider>,
  );
}

const baseTable: TableRegistryEntry = {
  id: "t-1",
  tableName: "orders",
  datasetId: "ds-1",
  origin: "sample",
  rowCount: 100,
  columnCount: 2,
  memoryBytes: 1024,
  createdAt: new Date().toISOString(),
  columns: [
    {
      name: "region",
      semanticType: "Categorical",
      physicalType: "VARCHAR",
      cardinality: 4,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
    {
      name: "revenue",
      semanticType: "Quantitative",
      physicalType: "DOUBLE",
      cardinality: 90,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
  ],
};

describe("QuerySuggestions", () => {
  beforeEach(() => {
    useDatasetsStore.setState({
      datasets: [],
      tables: [],
      workerStatus: "idle",
      workerError: null,
    });
    useQueryStore.setState({
      sessions: {},
      history: [],
      lastRunSession: CONSOLE_SESSION,
    });
    vi.mocked(sqlService.runQuery).mockReset().mockResolvedValue({
      columnNames: [],
      columnTypes: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
    });
  });

  it("renders nothing with no registered tables", () => {
    const { container } = renderWithPanel();
    expect(container.querySelector("h3")).toBeNull();
  });

  it("renders nothing for a table with no classified columns yet", () => {
    useDatasetsStore.setState({
      tables: [{ ...baseTable, columns: undefined }],
    });
    const { container } = renderWithPanel();
    expect(container.querySelector("h3")).toBeNull();
  });

  it("shows only capability-eligible templates and tasks for the live table", async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    const { container } = renderWithPanel();

    await waitFor(() =>
      expect(within(container).getByText("Suggested queries")).toBeTruthy(),
    );
    expect(within(container).getByText("Guided answers")).toBeTruthy();
    // Categorical + Quantitative present: the group-by-average template and
    // the top-N-by-segment task both appear.
    expect(
      within(container).getByText(/Average revenue by region/),
    ).toBeTruthy();
    expect(within(container).getByText("Top-N by segment")).toBeTruthy();
    // No temporal column on this table — the trend/period templates and tasks
    // must not appear.
    expect(within(container).queryByText("Trend over time")).toBeNull();
    expect(within(container).queryByText(/by month/)).toBeNull();
  });

  it("inserting a template lands its SQL in the query store, editable, without running it", async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    const { container } = renderWithPanel();

    await waitFor(() =>
      expect(
        within(container).getByText(/Average revenue by region/),
      ).toBeTruthy(),
    );
    fireEvent.click(within(container).getAllByText("Insert")[0]);

    expect(getSession(CONSOLE_SESSION).sql).toContain('"orders"');
    expect(sqlService.runQuery).not.toHaveBeenCalled();
  });

  it('"Why?" pushes the tooltip explanation into the educational panel', async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    const { container } = renderWithPanel();

    await waitFor(() =>
      expect(
        within(container).getByText(/Average revenue by region/),
      ).toBeTruthy(),
    );
    fireEvent.click(within(container).getAllByText("Why?")[0]);

    await waitFor(() =>
      expect(within(container).getByTestId("panel").textContent).toContain(
        "GROUP BY splits your data into buckets",
      ),
    );
  });

  it("running a guided task inserts its SQL and executes it", async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    const { container } = renderWithPanel();

    await waitFor(() =>
      expect(within(container).getByText("Top-N by segment")).toBeTruthy(),
    );
    fireEvent.click(within(container).getAllByText("Run")[0]);

    expect(getSession(CONSOLE_SESSION).sql).toContain('"orders"');
    expect(sqlService.runQuery).toHaveBeenCalledTimes(1);
  });

  it('running a guided task via "Chart" inserts its SQL and executes it, so the playground auto-charts', async () => {
    useDatasetsStore.setState({ tables: [baseTable] });
    const { container } = renderWithPanel();

    await waitFor(() =>
      expect(within(container).getAllByText("Chart").length).toBeGreaterThan(0),
    );
    fireEvent.click(within(container).getAllByText("Chart")[0]);

    expect(getSession(CONSOLE_SESSION).sql).toContain('"orders"');
    expect(sqlService.runQuery).toHaveBeenCalledTimes(1);
  });

  it("labels each group by table name once two or more tables have suggestions", async () => {
    useDatasetsStore.setState({
      tables: [baseTable, { ...baseTable, id: "t-2", tableName: "customers" }],
    });
    const { container } = renderWithPanel();

    await waitFor(() =>
      expect(within(container).getAllByText("orders").length).toBeGreaterThan(
        0,
      ),
    );
    expect(within(container).getAllByText("customers").length).toBeGreaterThan(
      0,
    );
  });
});
