import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";
import { ViewerMode } from "./ViewerMode";
import type { StructureReport } from "../../lib/structureReport";

// `downloadStructureReport` is a DOM-only side effect (Blob/URL, kept
// deliberately untested against jsdom by `structureReport.ts`'s own design —
// see its header comment) — mocked at the module boundary so this stays a UI
// wiring test, not a claim about jsdom's Blob/URL support.
const { downloadStructureReportMock } = vi.hoisted(() => ({
  downloadStructureReportMock: vi.fn(),
}));
vi.mock("../../lib/structureReport", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/structureReport")
  >("../../lib/structureReport");
  return { ...actual, downloadStructureReport: downloadStructureReportMock };
});

const { closeMock } = vi.hoisted(() => ({ closeMock: vi.fn() }));
vi.mock("../../stores/dspsReceiver", () => ({
  useDspsReceiverStore: { getState: () => ({ close: closeMock }) },
}));

const REPORT: StructureReport = {
  dspsVersion: "1.0.0",
  generatedAt: "2026-07-25T12:00:00.000Z",
  tables: [
    {
      tableName: "orders",
      rowCount: 5,
      columnCount: 2,
      columns: [
        {
          name: "id",
          semanticType: "Categorical",
          physicalType: "VARCHAR",
          nullPercentage: 0,
          cardinality: 5,
        },
      ],
    },
  ],
  insights: [
    {
      tableName: "orders",
      rule: "duplicates",
      description: "No duplicate rows found.",
      provenance: "derived-this-run",
      snapshot: { date: "2026-07-25T12:00:00.000Z", fileHash: "abc123" },
    },
  ],
  relationships: [
    {
      childTable: "orders",
      childColumn: "customer_id",
      parentTable: "customers",
      parentColumn: "id",
      confidence: "confident",
      containment: 1,
      evidence: "100% containment",
    },
  ],
};

describe("ViewerMode (W8, D62 Workbench amendment)", () => {
  beforeEach(() => {
    downloadStructureReportMock.mockReset();
    closeMock.mockReset();
  });

  it("renders read-only chrome with no options strip and no AI pane", () => {
    const { container } = render(<ViewerMode document={REPORT} error={null} />);
    expect(container.querySelector('[data-region="explorer"]')).not.toBeNull();
    expect(container.querySelector('[data-region="canvas"]')).not.toBeNull();
    expect(container.querySelector('[data-region="inspector"]')).not.toBeNull();
    expect(
      container.querySelector('[data-region="status-bar"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-region="strip"]')).toBeNull();
    expect(container.querySelector('[data-region="ai-pane"]')).toBeNull();
  });

  it("renders table/column content, D45 insight fields, and relationship evidence", () => {
    const { container } = render(<ViewerMode document={REPORT} error={null} />);
    expect(within(container).getAllByText("orders").length).toBeGreaterThan(0);
    expect(container.textContent).toContain("No duplicate rows found.");
    expect(container.textContent).toContain("derived-this-run");
    expect(container.textContent).toContain(
      "orders.customer_id → customers.id",
    );
    expect(container.textContent).toContain("confident");
  });

  it("renders the D63 trust-chrome band", () => {
    const { container } = render(<ViewerMode document={REPORT} error={null} />);
    expect(
      container.querySelector('[data-testid="trust-chrome-band"]'),
    ).not.toBeNull();
  });

  it('"Export report" re-downloads the identical document', () => {
    const { container } = render(<ViewerMode document={REPORT} error={null} />);
    fireEvent.click(within(container).getByText("Export report"));
    expect(downloadStructureReportMock).toHaveBeenCalledWith(REPORT);
  });

  it('"Start my own session" closes the receiver', () => {
    const { container } = render(<ViewerMode document={REPORT} error={null} />);
    fireEvent.click(within(container).getByText("Start my own session"));
    expect(closeMock).toHaveBeenCalled();
  });

  it("surfaces a receiver error as a dismissible banner, with no document chrome", () => {
    const { container } = render(
      <ViewerMode
        document={null}
        error="not a DSPS document this version can read"
      />,
    );
    expect(container.textContent).toContain("not a DSPS document");
    expect(container.querySelector('[data-region="canvas"]')).toBeNull();
    fireEvent.click(within(container).getByText("Dismiss"));
    expect(closeMock).toHaveBeenCalled();
  });

  it("renders a no-relationships note when the report carries none", () => {
    const schemaOnly: StructureReport = { ...REPORT, relationships: undefined };
    const { container } = render(
      <ViewerMode document={schemaOnly} error={null} />,
    );
    expect(container.textContent).toContain("No relationships in this report.");
  });

  // Structural, not conditional (S4, same posture as S3): viewer mode renders
  // no console, no chart module, no AI pane and no explorer, so no run
  // affordance is reachable here and no `viewerMode` branch is needed to keep
  // it that way.
  it("exposes no run action and no transform guard", () => {
    const { container } = render(<ViewerMode document={REPORT} error={null} />);
    expect(
      within(container).queryByRole("button", { name: /^run$/i }),
    ).toBeNull();
    expect(within(container).queryByRole("dialog")).toBeNull();
  });

  // S3/S6.5 (D62 consumption-only): the drawer is a shell region viewer mode
  // never assembles, so the console's absence is structural — there is no
  // `viewerMode` branch inside the drawer to keep it that way. S6.5 makes
  // §13.3's "Info only, no console" a layout claim as well as a mount one,
  // which is exactly what would invite that branch: a split rendered here with
  // an empty console pane would hand a `.dsps` recipient query access over a
  // report that carries no rows to query.
  it("renders no console, no editor, no splitter and no view switcher", () => {
    const { container } = render(<ViewerMode document={REPORT} error={null} />);
    expect(
      container.querySelector('[data-testid="inspector-drawer"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="drawer-console-pane"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="drawer-info-pane"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="console-editor-region"]'),
    ).toBeNull();
    expect(
      within(container).queryByRole("separator", { name: "Resize info panel" }),
    ).toBeNull();
    expect(
      within(container).queryByRole("button", { name: "SQL Console" }),
    ).toBeNull();
    expect(
      within(container).queryByRole("button", { name: "Info" }),
    ).toBeNull();
  });

  // S5, same structural posture: neither query-tab producer is reachable here,
  // because there is no console to pin from and no tab strip to open into.
  it("exposes neither query-tab producer", () => {
    const { container } = render(<ViewerMode document={REPORT} error={null} />);
    expect(
      within(container).queryByRole("button", { name: /pin to tab/i }),
    ).toBeNull();
    expect(container.querySelector('[data-testid="tab-host"]')).toBeNull();
  });
});
