import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import { ResultsGrid } from "./ResultsGrid";
import type { QueryResult } from "../../types";
import * as resultsExport from "./resultsExport";
import * as sqlService from "../../services/sql";

// jsdom never runs real layout, so every element reports 0×0 — @tanstack/react-virtual
// (offsetWidth/offsetHeight-based) would then compute a zero-height viewport and render
// no rows at all. A fixed non-zero size here is a jsdom-only stand-in for a real browser
// layout pass; it doesn't touch how the component behaves outside tests.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 480,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 800,
  });
});

vi.mock("./resultsExport", async () => {
  const actual = await vi.importActual<typeof resultsExport>("./resultsExport");
  return {
    ...actual,
    downloadCsv: vi.fn(),
    downloadXlsx: vi.fn(async () => {}),
    copySql: vi.fn(async () => {}),
  };
});

// A2's `loadMoreRows` talks to the analyst core; this component only needs to
// know it was called and how it settled, not what happens inside it.
vi.mock("../../services/sql", async () => {
  const actual = await vi.importActual<typeof sqlService>("../../services/sql");
  return { ...actual, loadMoreRows: vi.fn().mockResolvedValue(null) };
});

function makeResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    columnNames: ["id", "name"],
    columnTypes: ["BIGINT", "VARCHAR"],
    rows: [
      [3, "Carol"],
      [1, "Alice"],
      [2, null],
    ],
    rowCount: 3,
    executionTimeMs: 12,
    ...overrides,
  };
}

describe("ResultsGrid", () => {
  it("shows a prompt before any query has run", () => {
    const { container } = render(
      <ResultsGrid
        sessionId="console"
        status="idle"
        result={null}
        error={null}
        sql=""
      />,
    );
    expect(container.textContent).toContain("Run a query to see results here.");
  });

  it("shows a running indicator while a query executes", () => {
    const { container } = render(
      <ResultsGrid
        sessionId="console"
        status="running"
        result={null}
        error={null}
        sql="select 1"
      />,
    );
    expect(container.textContent).toContain("Running");
  });

  it("renders an error in place of the grid", () => {
    const { container } = render(
      <ResultsGrid
        sessionId="console"
        status="error"
        result={null}
        error="Catalog Error: boom"
        sql="select * from missing"
      />,
    );
    expect(within(container).getByRole("alert").textContent).toContain("boom");
  });

  it("renders columns and rows, the row-count/timing summary, and NULL distinct from empty string", () => {
    const { container } = render(
      <ResultsGrid
        sessionId="console"
        status="success"
        result={makeResult()}
        error={null}
        sql="select id, name from t"
      />,
    );
    expect(
      within(container).getByRole("columnheader", { name: "id" }),
    ).toBeTruthy();
    expect(
      within(container).getByRole("columnheader", { name: "name" }),
    ).toBeTruthy();
    expect(container.textContent).toContain("3 rows in 12 ms");
    expect(container.textContent).toContain("Carol");
    expect(container.textContent).toContain("NULL");
  });

  it("sorts a column ascending then descending on repeated header clicks", () => {
    const { container } = render(
      <ResultsGrid
        sessionId="console"
        status="success"
        result={makeResult()}
        error={null}
        sql="select id, name from t"
      />,
    );
    const idHeader = within(container).getByRole("columnheader", {
      name: "id",
    });

    fireEvent.click(idHeader);
    let cells = within(container).getAllByRole("cell");
    expect(cells[0].textContent).toBe("1");
    expect(idHeader.getAttribute("aria-sort")).toBe("ascending");

    fireEvent.click(idHeader);
    cells = within(container).getAllByRole("cell");
    expect(cells[0].textContent).toBe("3");
    expect(idHeader.getAttribute("aria-sort")).toBe("descending");
  });

  it("shows the true row count next to the loaded count when the preview is short of it", () => {
    const { container } = render(
      <ResultsGrid
        sessionId="console"
        status="success"
        result={makeResult({ rowCount: 500_000 })}
        error={null}
        sql="select * from huge"
      />,
    );
    expect(container.textContent).toContain("500,000 rows");
    expect(container.textContent).toContain("3 loaded");
  });

  it("offers Load more rows while capped and not yet exhausted, and calls loadMoreRows for the session", async () => {
    const { container } = render(
      <ResultsGrid
        sessionId="console"
        status="success"
        result={makeResult({ rowCount: 500_000 })}
        error={null}
        sql="select * from huge"
      />,
    );
    const button = within(container).getByTestId("results-load-more");
    fireEvent.click(button);
    await waitFor(() =>
      expect(sqlService.loadMoreRows).toHaveBeenCalledWith("console"),
    );
  });

  it("hides Load more once nextOffset is explicitly null, even while still capped", () => {
    const { container } = render(
      <ResultsGrid
        sessionId="console"
        status="success"
        result={makeResult({ rowCount: 500_000, nextOffset: null })}
        error={null}
        sql="select * from huge"
      />,
    );
    expect(within(container).queryByTestId("results-load-more")).toBeNull();
  });

  it("surfaces a Load more failure inline rather than throwing", async () => {
    vi.mocked(sqlService.loadMoreRows).mockResolvedValueOnce(
      "The result needs about 400 MB.",
    );
    const { container } = render(
      <ResultsGrid
        sessionId="console"
        status="success"
        result={makeResult({ rowCount: 500_000 })}
        error={null}
        sql="select * from huge"
      />,
    );
    fireEvent.click(within(container).getByTestId("results-load-more"));
    await waitFor(() =>
      expect(
        within(container).getByTestId("results-load-more-error").textContent,
      ).toContain("400 MB"),
    );
  });

  it("shows pagination controls once the result spans more than one page", () => {
    const bigRows = Array.from({ length: 1500 }, (_, i) => [i, `row-${i}`]);
    const { container } = render(
      <ResultsGrid
        sessionId="console"
        status="success"
        result={makeResult({ rows: bigRows, rowCount: bigRows.length })}
        error={null}
        sql="select * from t"
      />,
    );
    expect(container.textContent).toContain("Page 1 of 2");
    fireEvent.click(
      within(container).getByRole("button", { name: /next page/i }),
    );
    expect(container.textContent).toContain("Page 2 of 2");
  });

  it("wires the CSV, Excel, and copy-SQL actions to the export service", async () => {
    const { container } = render(
      <ResultsGrid
        sessionId="console"
        status="success"
        result={makeResult()}
        error={null}
        sql="select id, name from t"
      />,
    );
    fireEvent.click(within(container).getByRole("button", { name: /csv/i }));
    expect(resultsExport.downloadCsv).toHaveBeenCalledWith(makeResult());

    fireEvent.click(within(container).getByRole("button", { name: /excel/i }));
    await waitFor(() => expect(resultsExport.downloadXlsx).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        (
          within(container).getByRole("button", {
            name: /excel/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );

    fireEvent.click(
      within(container).getByRole("button", { name: /copy sql/i }),
    );
    await waitFor(() =>
      expect(resultsExport.copySql).toHaveBeenCalledWith(
        "select id, name from t",
      ),
    );
  });
});
