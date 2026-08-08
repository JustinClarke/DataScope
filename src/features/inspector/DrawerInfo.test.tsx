import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DrawerInfo, PROMPT_ABOVE_ROWS } from "./DrawerInfo";
import {
  useDrawerStore,
  DRAWER_DEFAULT_HEIGHT,
  INFO_DEFAULT_RATIO,
} from "../../stores/drawer";
import {
  useQueryStore,
  CONSOLE_SESSION,
  EMPTY_SESSION,
} from "../../stores/query";
import { useDatasetsStore } from "../../stores/datasets";
import { useSelectionStore } from "../../stores/selection";
import { useTabsStore } from "../../stores/tabs";
import type { Dataset, QueryResult, TableRegistryEntry } from "../../types";

function resultWith(rowCount: number): QueryResult {
  return {
    columnNames: ["id"],
    columnTypes: ["INTEGER"],
    rows: Array.from({ length: rowCount }, (_, i) => [i]),
    rowCount,
    executionTimeMs: 1,
  };
}

function seedConsole(session: Partial<typeof EMPTY_SESSION>) {
  useQueryStore.setState({
    sessions: { [CONSOLE_SESSION]: { ...EMPTY_SESSION, ...session } },
    history: [],
    lastRunSession: CONSOLE_SESSION,
  });
}

const dataset: Dataset = {
  id: "ds-1",
  name: "orders.csv",
  sourceType: "file",
  tableNames: ["orders"],
  ingestedAt: "2026-07-28T00:00:00.000Z",
};

const sourceTable: TableRegistryEntry = {
  id: "tbl-1",
  tableName: "orders",
  datasetId: "ds-1",
  origin: "file",
  rowCount: 10,
  columnCount: 2,
  memoryBytes: 512,
  createdAt: "2026-07-28T00:00:00.000Z",
};

describe("DrawerInfo (S6.5/S6.7)", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useDrawerStore.setState({
      open: true,
      expanded: false,
      height: DRAWER_DEFAULT_HEIGHT,
      infoRatio: INFO_DEFAULT_RATIO,
      infoSignal: 0,
      consoleSignal: 0,
    });
    useDatasetsStore.setState({
      datasets: [],
      tables: [],
      workerStatus: "idle",
      workerError: null,
    });
    useSelectionStore.getState().clearSelection();
    useTabsStore.setState({ tabs: [], activeTabId: null });
    seedConsole({});
  });

  /**
   * The pane's whole shape, and the reason the phase exists: what you selected,
   * then what you ran. The SQL editor next door holds neither.
   */
  it("leads with the selection scent and follows with what the query produced", () => {
    useSelectionStore.getState().selectTable("tbl-1");
    render(<DrawerInfo />);
    const scent = screen.getByTestId("info-scent-strip");
    const output = screen.getByTestId("info-output-region");

    expect(output.textContent).toContain("Results");
    expect(
      scent.compareDocumentPosition(output) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // The reported complaint, exactly: "Select a table, column, or relationship
  // to inspect it." sitting on top of a result it has nothing to do with.
  it("mounts no scent strip at all with nothing selected (S6.7)", () => {
    render(<DrawerInfo />);
    expect(screen.queryByTestId("info-scent-strip")).toBeNull();
    expect(
      screen.queryByText(/Select a table, column, or relationship/),
    ).toBeNull();
  });

  // `ResultsGrid` truncates every cell and the pane is now half the drawer, so
  // a wide result without a horizontal scroll box is a wall of ellipses.
  it("scrolls the output on both axes, and caps the scent so it cannot crowd it out", () => {
    useSelectionStore.getState().selectTable("tbl-1");
    render(<DrawerInfo />);
    expect(screen.getByTestId("info-output-region").className).toContain(
      "overflow-auto",
    );
    expect(screen.getByTestId("info-scent-strip").className).toContain(
      "max-h-[40%]",
    );
    expect(screen.getByTestId("info-scent-strip").className).toContain(
      "overflow-y-auto",
    );
  });

  it("carries the session actions — pin the query, the history, export the recipe", () => {
    render(<DrawerInfo />);
    expect(screen.getByRole("button", { name: /pin to tab/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^history$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /export recipe/i })).toBeTruthy();
  });

  /**
   * Scope call 5: Pin is about *this result* and leads; History and Export
   * recipe are about the session and follow. The hierarchy is the decision —
   * position above the Results header, and the accent fill only Pin carries.
   */
  it("leads with Pin to tab above the result, with History and Export recipe below it", () => {
    render(<DrawerInfo />);
    const primary = screen.getByTestId("info-primary-actions");
    const output = screen.getByTestId("info-output-region");
    const secondary = screen.getByTestId("info-session-actions");

    expect(
      primary.contains(screen.getByRole("button", { name: /pin to tab/i })),
    ).toBe(true);
    expect(
      primary.compareDocumentPosition(output) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      output.compareDocumentPosition(secondary) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      secondary.contains(screen.getByRole("button", { name: /^history$/i })),
    ).toBe(true);
    expect(
      secondary.contains(
        screen.getByRole("button", { name: /export recipe/i }),
      ),
    ).toBe(true);

    expect(
      screen.getByRole("button", { name: /pin to tab/i }).className,
    ).toContain("bg-(--color-accent)");
    expect(
      screen.getByRole("button", { name: /^history$/i }).className,
    ).not.toContain("bg-(--color-accent)");
  });

  it("opens the run log in its own singleton tab, deduping repeat clicks", () => {
    render(<DrawerInfo />);
    const history = screen.getByRole("button", { name: /^history$/i });
    fireEvent.click(history);
    fireEvent.click(history);

    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useTabsStore.getState().tabs[0].type).toBe("history");
  });

  // Scope call 3: a chart is a different *view* of the result and the log is
  // every result this session — neither is "this result".
  it("renders neither a chart nor the history list inside the pane", () => {
    seedConsole({
      status: "success",
      sql: "select 1",
      lastRunSql: "select 1",
      result: resultWith(3),
    });
    render(<DrawerInfo />);
    expect(screen.queryByText("Chart")).toBeNull();
    expect(
      screen.queryByText("No statements run yet this session."),
    ).toBeNull();
  });

  it("disables Pin on an empty buffer and enables it once there is a query", () => {
    render(<DrawerInfo />);
    expect(
      (screen.getByRole("button", { name: /pin to tab/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    cleanup();

    seedConsole({ sql: "select 1" });
    render(<DrawerInfo />);
    const pin = screen.getByRole("button", {
      name: /pin to tab/i,
    }) as HTMLButtonElement;
    expect(pin.disabled).toBe(false);
    fireEvent.click(pin);
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useTabsStore.getState().tabs[0].type).toBe("query");
  });

  it('enables "Export recipe" only once a derived table exists', () => {
    render(<DrawerInfo />);
    expect(
      (
        screen.getByRole("button", {
          name: /export recipe/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    cleanup();

    useDatasetsStore
      .getState()
      .registerDataset(dataset, [{ ...sourceTable, origin: "derived" }]);
    render(<DrawerInfo />);
    expect(
      (
        screen.getByRole("button", {
          name: /export recipe/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("keeps no history disclosure in the pane — the log is a tab now (S6.7)", () => {
    render(<DrawerInfo />);
    expect(document.querySelector("details")).toBeNull();
  });

  // Scope call 2 — the single largest contributor to the reported scroll
  // distance. S6 keeps only the map-side placement.
  it("renders no query-suggestions block anywhere in the drawer", () => {
    render(<DrawerInfo />);
    expect(screen.queryByText("Suggested queries")).toBeNull();
    expect(screen.queryByText("Guided answers")).toBeNull();
  });

  describe("the result overflow prompt", () => {
    it("offers to expand when a successful result overflows the unexpanded drawer", () => {
      seedConsole({
        status: "success",
        result: resultWith(PROMPT_ABOVE_ROWS + 1),
      });
      render(<DrawerInfo />);
      expect(screen.getByTestId("drawer-expand-prompt").textContent).toContain(
        `${PROMPT_ABOVE_ROWS + 1} rows — click to expand`,
      );
    });

    // §13.3: "results never auto-expand" — the offer is the whole mechanism, so
    // the drawer's geometry must be untouched until the user takes it.
    it("changes neither height nor expansion by itself — the result only offers", () => {
      seedConsole({
        status: "success",
        result: resultWith(PROMPT_ABOVE_ROWS + 500),
      });
      render(<DrawerInfo />);
      expect(useDrawerStore.getState().expanded).toBe(false);
      expect(useDrawerStore.getState().height).toBe(DRAWER_DEFAULT_HEIGHT);
    });

    it("expands only once the user clicks it, and leaves the dragged height alone", () => {
      seedConsole({
        status: "success",
        result: resultWith(PROMPT_ABOVE_ROWS + 1),
      });
      render(<DrawerInfo />);
      fireEvent.click(screen.getByTestId("drawer-expand-prompt"));
      expect(useDrawerStore.getState().expanded).toBe(true);
      expect(useDrawerStore.getState().height).toBe(DRAWER_DEFAULT_HEIGHT);
    });

    it("stays silent for a result that fits, for a non-success status, and once already expanded", () => {
      seedConsole({ status: "success", result: resultWith(PROMPT_ABOVE_ROWS) });
      const fits = render(<DrawerInfo />);
      expect(fits.queryByTestId("drawer-expand-prompt")).toBeNull();
      cleanup();

      seedConsole({
        status: "running",
        result: resultWith(PROMPT_ABOVE_ROWS + 1),
      });
      const running = render(<DrawerInfo />);
      expect(running.queryByTestId("drawer-expand-prompt")).toBeNull();
      cleanup();

      useDrawerStore.setState({ expanded: true });
      seedConsole({
        status: "success",
        result: resultWith(PROMPT_ABOVE_ROWS + 1),
      });
      const already = render(<DrawerInfo />);
      expect(already.queryByTestId("drawer-expand-prompt")).toBeNull();
    });
  });
});
