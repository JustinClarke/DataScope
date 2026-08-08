import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";
import { ColumnCard } from "./ColumnCard";
import type { ColumnCardStats } from "../../services/profiling";
import type { ClassifiedColumn } from "../../types";

const { runInConsoleMock } = vi.hoisted(() => ({ runInConsoleMock: vi.fn() }));
vi.mock("../../services/runPath", () => ({ runInConsole: runInConsoleMock }));

function column(
  overrides: Partial<ClassifiedColumn> &
    Pick<ClassifiedColumn, "name" | "semanticType">,
): ClassifiedColumn {
  return {
    physicalType: "VARCHAR",
    cardinality: 0,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
    ...overrides,
  };
}

// Queries are scoped to each test's own `container` rather than the global
// `screen` — no RTL auto-cleanup is configured in vitest.config.ts, matching
// the rest of this test suite's convention (see IngestionPanel.test.tsx).

describe("ColumnCard", () => {
  it("shows a loading line while stats are in flight", () => {
    const { container } = render(
      <ColumnCard
        column={column({ name: "fare", semanticType: "Quantitative" })}
        stats={undefined}
        rowCount={1000}
        onShowSql={vi.fn()}
      />,
    );
    expect(within(container).getByText("Loading…")).toBeTruthy();
  });

  it("renders quantitative min/max/mean/median/std dev and the histogram", () => {
    const stats: ColumnCardStats = {
      kind: "Quantitative",
      median: 30,
      medianSql: "SELECT median(...)",
      histogram: [{ rangeStart: 0, rangeEnd: 10, count: 5 }],
      histogramSql: "SELECT ...",
    };
    const { container } = render(
      <ColumnCard
        column={column({
          name: "fare",
          semanticType: "Quantitative",
          min: "0",
          max: "512",
          mean: 32,
          stdDev: 49,
        })}
        stats={stats}
        rowCount={1000}
        onShowSql={vi.fn()}
      />,
    );
    expect(within(container).getByText("median")).toBeTruthy();
    expect(within(container).getByText("30")).toBeTruthy();
    expect(
      within(container).getByLabelText("Value distribution histogram"),
    ).toBeTruthy();
  });

  it("renders top values as a frequency bar list for categorical, as a percentage of the table's row count", () => {
    const stats: ColumnCardStats = {
      kind: "Categorical",
      topValues: [
        { value: "S", count: 644 },
        { value: "C", count: 168 },
      ],
      sql: "SELECT ...",
    };
    const { container } = render(
      <ColumnCard
        column={column({ name: "Embarked", semanticType: "Categorical" })}
        stats={stats}
        rowCount={1000}
        onShowSql={vi.fn()}
      />,
    );
    expect(within(container).getByText("S")).toBeTruthy();
    expect(within(container).getByText("64%")).toBeTruthy();
  });

  it('renders a "No values" fallback for an empty categorical result (100%-null)', () => {
    const stats: ColumnCardStats = {
      kind: "Categorical",
      topValues: [],
      sql: "SELECT ...",
    };
    const { container } = render(
      <ColumnCard
        column={column({
          name: "discount_code",
          semanticType: "Categorical",
          nullPercentage: 100,
        })}
        stats={stats}
        rowCount={500}
        onShowSql={vi.fn()}
      />,
    );
    expect(within(container).getByText("No values.")).toBeTruthy();
    expect(within(container).getByText("(100.0%)")).toBeTruthy();
  });

  it("renders earliest/latest and gap description for temporal", () => {
    const stats: ColumnCardStats = {
      kind: "Temporal",
      range: {
        earliest: "2023-01-01",
        latest: "2023-12-31",
        gapDescription: "No gaps detected",
      },
      sql: "SELECT ...",
    };
    const { container } = render(
      <ColumnCard
        column={column({ name: "order_date", semanticType: "Temporal" })}
        stats={stats}
        rowCount={1000}
        onShowSql={vi.fn()}
      />,
    );
    expect(within(container).getByText("2023-01-01")).toBeTruthy();
    expect(within(container).getByText("No gaps detected")).toBeTruthy();
  });

  it('renders a "No dates" fallback when a temporal column has no non-null values', () => {
    const stats: ColumnCardStats = {
      kind: "Temporal",
      range: null,
      sql: "SELECT ...",
    };
    const { container } = render(
      <ColumnCard
        column={column({
          name: "order_date",
          semanticType: "Temporal",
          nullPercentage: 100,
        })}
        stats={stats}
        rowCount={1000}
        onShowSql={vi.fn()}
      />,
    );
    expect(within(container).getByText("No dates.")).toBeTruthy();
  });

  it("renders avg word count and sample preview for textual", () => {
    const stats: ColumnCardStats = {
      kind: "Textual",
      avgWordCount: 12.4,
      wordCountSql: "SELECT ...",
      samplePreview: ["a great product"],
      sampleSql: "SELECT ...",
    };
    const { container } = render(
      <ColumnCard
        column={column({ name: "ReviewText", semanticType: "Textual" })}
        stats={stats}
        rowCount={1000}
        onShowSql={vi.fn()}
      />,
    );
    expect(within(container).getByText("12.4")).toBeTruthy();
    expect(within(container).getByText("“a great product”")).toBeTruthy();
  });

  it("renders the exclusion note for an identifier column, no stats needed", () => {
    const { container } = render(
      <ColumnCard
        column={column({ name: "row_uuid", semanticType: "Identifier" })}
        stats={{ kind: "Identifier" }}
        rowCount={1000}
        onShowSql={vi.fn()}
      />,
    );
    expect(
      within(container).getByText(/excluded from most analysis/),
    ).toBeTruthy();
  });

  it("omitting onSelect (existing call sites) renders no clickable header (W7 — additive only)", () => {
    const { container } = render(
      <ColumnCard
        column={column({ name: "fare", semanticType: "Identifier" })}
        stats={undefined}
        rowCount={1000}
        onShowSql={vi.fn()}
      />,
    );
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it("clicking the header calls onSelect (W7 — inspector column selection)", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ColumnCard
        column={column({ name: "fare", semanticType: "Identifier" })}
        stats={undefined}
        rowCount={1000}
        onShowSql={vi.fn()}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(within(container).getByText("fare"));
    expect(onSelect).toHaveBeenCalled();
  });

  it("selected renders the same inset-bar indicator a selected table row uses, not a ring", () => {
    const { container } = render(
      <ColumnCard
        column={column({ name: "fare", semanticType: "Identifier" })}
        stats={undefined}
        rowCount={1000}
        onShowSql={vi.fn()}
        selected
      />,
    );
    expect(container.firstElementChild?.className).toContain(
      "shadow-[inset_2px_0_0_var(--color-active)]",
    );
    expect(container.firstElementChild?.className).not.toContain(
      "ring-(--color-accent)",
    );
  });

  it("clicking the header on the full Profile tab (not compact) is a plain open/shut toggle", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ColumnCard
        column={column({ name: "fare", semanticType: "Identifier" })}
        stats={undefined}
        rowCount={1000}
        onShowSql={vi.fn()}
        onSelect={onSelect}
      />,
    );
    const header = within(container).getByText("fare");

    fireEvent.click(header);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(
      within(container).queryByText("excluded from most analysis", {
        exact: false,
      }),
    ).toBeNull();

    fireEvent.click(header);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(
      within(container).getByText(/excluded from most analysis/),
    ).toBeTruthy();
  });

  it("type badges carry no hue encoding — the reserved amber/purple registers stay data-free (V6a)", () => {
    for (const semanticType of [
      "Temporal",
      "Quantitative",
      "Categorical",
      "Textual",
      "Identifier",
    ] as const) {
      const { container, unmount } = render(
        <ColumnCard
          column={column({ name: "c", semanticType })}
          stats={undefined}
          rowCount={1000}
          onShowSql={vi.fn()}
        />,
      );
      // The type name is still the encoding — it just isn't carried by colour.
      expect(container.textContent).toContain(semanticType);
      expect(container.innerHTML).not.toMatch(
        /(text|bg|border)-(red|amber|emerald|purple|blue)-[0-9]/,
      );
      unmount();
    }
  });

  it("pairs a run action with every Show SQL (S4), passing that block's own query", () => {
    runInConsoleMock.mockReset();
    const stats: ColumnCardStats = {
      kind: "Quantitative",
      median: 30,
      medianSql: "SELECT median(fare) FROM t",
      histogram: [{ rangeStart: 0, rangeEnd: 10, count: 5 }],
      histogramSql: "SELECT ...",
    };
    const { container } = render(
      <ColumnCard
        column={column({ name: "fare", semanticType: "Quantitative" })}
        stats={stats}
        rowCount={1000}
        onShowSql={vi.fn()}
      />,
    );

    fireEvent.click(within(container).getByRole("button", { name: /^run$/i }));
    expect(runInConsoleMock).toHaveBeenCalledWith("SELECT median(fare) FROM t");
    expect(within(container).getByText("Show SQL")).toBeTruthy();
  });
});
