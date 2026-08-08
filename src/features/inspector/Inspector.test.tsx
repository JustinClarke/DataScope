import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { Inspector } from "./Inspector";
import { DatasetMap } from "../map/DatasetMap";
import { useDatasetsStore } from "../../stores/datasets";
import { useSelectionStore } from "../../stores/selection";
import { useRelationshipsStore } from "../../stores/relationships";
import { useInferredEdgesStore } from "../../stores/inferredEdges";
import { useDrawerStore, DRAWER_DEFAULT_HEIGHT } from "../../stores/drawer";
import { useQueryStore, getSession, CONSOLE_SESSION } from "../../stores/query";
import { useTabsStore } from "../../stores/tabs";
import { EducationalPanelProvider } from "../../app/EducationalPanelContext";
import type {
  ClassifiedColumn,
  Dataset,
  TableRegistryEntry,
} from "../../types";
import type { FkEdge } from "../../lib/relationshipInference";

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

// A2's Info panels (top values, term frequency, join coverage) call the
// analyst core directly — mocked here the same way DistributionModule.test.tsx
// does, so these tests never reach the real DuckDB-Wasm engine.
vi.mock("../../services/analyst", () => ({ analystCore: analystCoreMock }));

// Only needed for the single-fetch integration test, which mounts DatasetMap
// alongside Inspector — same mocking convention as DatasetMap.test.tsx.
const {
  loadDossierInsightsMock,
  loadTimeCoverageMock,
  loadRelationshipsMock,
  loadTableCardStatsMock,
  loadInsightsMock,
} = vi.hoisted(() => ({
  loadDossierInsightsMock: vi.fn(),
  loadTimeCoverageMock: vi.fn(),
  loadRelationshipsMock: vi.fn(),
  loadTableCardStatsMock: vi.fn(),
  loadInsightsMock: vi.fn(),
}));
vi.mock("../../services/dossier", () => ({
  loadDossierInsights: loadDossierInsightsMock,
  loadTimeCoverage: loadTimeCoverageMock,
}));
vi.mock("../../services/relationships", () => ({
  loadRelationships: loadRelationshipsMock,
}));
vi.mock("../../services/profiling", () => ({
  loadTableCardStats: loadTableCardStatsMock,
}));
vi.mock("../../services/insights", () => ({ loadInsights: loadInsightsMock }));

function col(
  name: string,
  semanticType: ClassifiedColumn["semanticType"],
): ClassifiedColumn {
  return {
    name,
    semanticType,
    physicalType: "BIGINT",
    cardinality: 100,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
  };
}

function table(
  id: string,
  tableName: string,
  columns: ClassifiedColumn[],
): TableRegistryEntry {
  return {
    id,
    tableName,
    datasetId: "d1",
    origin: "sample",
    rowCount: 100,
    columnCount: columns.length,
    memoryBytes: 2048,
    createdAt: new Date().toISOString(),
    columns,
  };
}

const orders = table("o", "orders", [
  col("order_id", "Identifier"),
  col("customer_id", "Categorical"),
]);
const customers = table("c", "customers", [col("id", "Identifier")]);
const dataset: Dataset = {
  id: "d1",
  name: "orders.csv",
  sourceType: "file",
  tableNames: ["orders", "customers"],
  ingestedAt: new Date().toISOString(),
};

const EDGE: FkEdge = {
  id: "orders.customer_id->customers.id",
  childTable: "orders",
  childColumn: "customer_id",
  parentTable: "customers",
  parentColumn: "id",
  containment: 1,
  coverage: 1,
  parentKeyUniqueness: 1,
  nameAgreement: true,
  confidence: "confident",
  confidenceScore: 1,
  evidence: "100% of `orders.customer_id` values appear in `customers.id`",
  source: "inferred",
};

describe("Inspector", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    openDestinationMock.mockReset();
    analystCoreMock.mockReset().mockReturnValue({
      call: vi
        .fn()
        .mockResolvedValue({
          ok: false,
          code: "sql_error",
          message: "unavailable in test",
        }),
    });
    loadDossierInsightsMock.mockReset().mockResolvedValue([]);
    loadTimeCoverageMock.mockReset().mockResolvedValue([]);
    loadRelationshipsMock.mockReset().mockResolvedValue([]);
    loadTableCardStatsMock.mockReset().mockResolvedValue({});
    loadInsightsMock.mockReset().mockResolvedValue([]);
    useDatasetsStore.setState({
      datasets: [dataset],
      tables: [orders, customers],
      workerStatus: "ready",
      workerError: null,
    });
    useSelectionStore.getState().clearSelection();
    useRelationshipsStore.getState().clearOverrides();
    useInferredEdgesStore.setState({ edges: [] });
    useDrawerStore.setState({
      open: true,
      expanded: false,
      height: DRAWER_DEFAULT_HEIGHT,
      consoleSignal: 0,
    });
    useQueryStore.setState({
      sessions: {},
      history: [],
      lastRunSession: CONSOLE_SESSION,
    });
    useTabsStore.setState({ tabs: [], activeTabId: null });
  });

  it("shows a placeholder when nothing is selected", () => {
    const { getByText } = render(<Inspector />);
    expect(getByText(/Select a table, column, or relationship/)).toBeTruthy();
  });

  it("shows a table scent — name, rows, columns, memory — and an Open table hand-off (S3)", () => {
    useSelectionStore.getState().selectTable("o");
    const { getByText } = render(<Inspector />);
    expect(getByText("orders")).toBeTruthy();
    expect(getByText("100 rows")).toBeTruthy();
    expect(getByText("2 cols")).toBeTruthy();
    fireEvent.click(getByText("Open table →"));
    expect(openDestinationMock).toHaveBeenCalledWith("profile", "o");
    // §13.3: opening a table also hands off to the editor next door. Under
    // S6.5's permanent split that is one signal, not a view change.
    expect(useDrawerStore.getState().consoleSignal).toBe(1);
    expect(useDrawerStore.getState().open).toBe(true);
  });

  it("Open table seeds a SELECT only into an empty console — and never runs it (S3 scope call 10)", () => {
    useSelectionStore.getState().selectTable("o");
    const { getByText } = render(<Inspector />);
    fireEvent.click(getByText("Open table →"));
    expect(getSession(CONSOLE_SESSION).sql).toBe(
      'SELECT * FROM "orders" LIMIT 100',
    );
    expect(getSession(CONSOLE_SESSION).status).toBe("idle");
  });

  it("Open table never overwrites a console buffer that already has text", () => {
    useQueryStore.getState().setSql(CONSOLE_SESSION, "SELECT 1");
    useSelectionStore.getState().selectTable("o");
    const { getByText } = render(<Inspector />);
    fireEvent.click(getByText("Open table →"));
    expect(getSession(CONSOLE_SESSION).sql).toBe("SELECT 1");
  });

  // S6.5 retires `consoleActivated`, so an empty buffer is the whole condition
  // — a console the user has already visited and cleared is seeded like any
  // other empty one. Nothing typed, nothing to lose.
  it("Open table seeds an already-visited console whose buffer is empty", () => {
    useDrawerStore.getState().activateConsole();
    useSelectionStore.getState().selectTable("o");
    const { getByText } = render(<Inspector />);
    fireEvent.click(getByText("Open table →"));
    expect(getSession(CONSOLE_SESSION).sql).toBe(
      'SELECT * FROM "orders" LIMIT 100',
    );
  });

  it("shows a column scent — semantic + physical type — and a profile click-through", () => {
    useSelectionStore.getState().selectColumn("o", "customer_id");
    const { getByText } = render(<Inspector />);
    expect(getByText("orders.customer_id")).toBeTruthy();
    expect(getByText("Categorical")).toBeTruthy();
    expect(getByText("BIGINT")).toBeTruthy();
    fireEvent.click(getByText("Open profile →"));
    expect(openDestinationMock).toHaveBeenCalledWith("profile", "o");
  });

  it("shows edge evidence + confidence + override controls (D24) for a selected edge", () => {
    useInferredEdgesStore.setState({ edges: [EDGE] });
    useSelectionStore.getState().selectEdge(EDGE.id);
    const { getByText } = render(<Inspector />);
    expect(getByText(/orders.customer_id → customers.id/)).toBeTruthy();
    expect(getByText("Confident")).toBeTruthy();
    expect(getByText("Remove edge")).toBeTruthy();
    // The evidence row decomposes the fixture's four real fields (all passing).
    expect(getByText("Name agrees")).toBeTruthy();
    expect(getByText("Containment 100%")).toBeTruthy();
    expect(getByText("Coverage 100%")).toBeTruthy();
    expect(getByText("Parent key 100% unique")).toBeTruthy();
  });

  it("shows a warning glyph on evidence items that miss the engine's thresholds for a candidate-tier edge", () => {
    const candidateEdge: FkEdge = {
      ...EDGE,
      id: "candidate-edge",
      nameAgreement: false,
      containment: 0.6,
      confidence: "candidate",
    };
    useInferredEdgesStore.setState({ edges: [candidateEdge] });
    useSelectionStore.getState().selectEdge(candidateEdge.id);
    const { getByText } = render(<Inspector />);
    expect(getByText("Candidate")).toBeTruthy();
    expect(getByText("Name differs")).toBeTruthy();
    expect(getByText("Containment 60%")).toBeTruthy();
  });

  it("offers an Open map click-through from a selected edge — rung 2 never dead-ends (S3)", () => {
    useInferredEdgesStore.setState({ edges: [EDGE] });
    useSelectionStore.getState().selectEdge(EDGE.id);
    const { getByText } = render(<Inspector />);
    fireEvent.click(getByText("Open map →"));
    expect(useTabsStore.getState().tabs.map((t) => t.type)).toContain("map");
  });

  it("removing an edge from the inspector updates the shared relationships store", () => {
    useInferredEdgesStore.setState({ edges: [EDGE] });
    useSelectionStore.getState().selectEdge(EDGE.id);
    const { getByText } = render(<Inspector />);
    fireEvent.click(getByText("Remove edge"));
    expect(useRelationshipsStore.getState().removed).toContain(
      "orders.customer_id",
    );
  });

  it("shows a graceful message when the selected edge id no longer resolves (e.g. after a repoint changed its id)", () => {
    useInferredEdgesStore.setState({ edges: [] });
    useSelectionStore.getState().selectEdge("stale-edge-id");
    const { getByText } = render(<Inspector />);
    expect(getByText(/changed or was removed/)).toBeTruthy();
    // The add-relationship affordance still renders so the user isn't stuck.
    expect(getByText("Add relationship")).toBeTruthy();
  });

  it("mounting DatasetMap and Inspector together triggers exactly one loadRelationships fetch (no second inference query)", async () => {
    render(
      <EducationalPanelProvider>
        <DatasetMap />
        <Inspector />
      </EducationalPanelProvider>,
    );
    await waitFor(() => expect(loadRelationshipsMock).toHaveBeenCalled());
    expect(loadRelationshipsMock).toHaveBeenCalledTimes(1);
  });
});
