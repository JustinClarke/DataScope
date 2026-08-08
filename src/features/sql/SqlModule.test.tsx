import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  render,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { SqlModule } from "./SqlModule";
import { useQueryStore, getSession, CONSOLE_SESSION } from "../../stores/query";
import { useDatasetsStore } from "../../stores/datasets";
import { useRunGuardStore } from "../../stores/runGuard";
import * as sqlService from "../../services/sql";
import * as transformsService from "../../services/transforms";
import type { Dataset, TableRegistryEntry } from "../../types";

// The real MonacoWrapper statically imports `monaco-editor`, which needs a real
// browser (canvas/layout) to mount — out of scope for a jsdom unit test,
// verified live instead. Stubbed here so this exercises the pane's own wiring:
// the Suspense boundary, Run, and Format.
vi.mock("./MonacoWrapper", () => ({
  default: ({ onRunQuery }: { onRunQuery: () => void }) => (
    <button type="button" data-testid="fake-monaco" onClick={onRunQuery}>
      fake editor
    </button>
  ),
}));

vi.mock("../../services/sql", async () => {
  const actual = await vi.importActual<typeof sqlService>("../../services/sql");
  return { ...actual, runQuery: vi.fn() };
});

vi.mock("../../services/transforms", async () => {
  const actual = await vi.importActual<typeof transformsService>(
    "../../services/transforms",
  );
  return {
    ...actual,
    runTransform: vi.fn(),
    materializeInsteadOfMutation: vi.fn(),
    forceMutation: vi.fn(),
  };
});

// A2's Check button calls `validate_sql` directly — mocked the same way
// DistributionModule.test.tsx mocks the analyst core.
const { analystCoreMock } = vi.hoisted(() => ({ analystCoreMock: vi.fn() }));
vi.mock("../../services/analyst", () => ({ analystCore: analystCoreMock }));

const dataset: Dataset = {
  id: "ds-1",
  name: "orders.csv",
  sourceType: "file",
  tableNames: ["orders"],
  ingestedAt: "2026-07-20T00:00:00.000Z",
};

const sourceTable: TableRegistryEntry = {
  id: "tbl-1",
  tableName: "orders",
  datasetId: "ds-1",
  origin: "file",
  rowCount: 10,
  columnCount: 2,
  memoryBytes: 512,
  createdAt: "2026-07-20T00:00:00.000Z",
};

const RESULT = {
  columnNames: [],
  columnTypes: [],
  rows: [],
  rowCount: 0,
  executionTimeMs: 0,
};

describe("SqlModule — the console pane (S6.5)", () => {
  beforeEach(() => {
    useQueryStore.setState({
      sessions: {},
      history: [],
      lastRunSession: CONSOLE_SESSION,
    });
    useDatasetsStore.setState({
      datasets: [],
      tables: [],
      workerStatus: "idle",
      workerError: null,
    });
    useRunGuardStore.setState({
      pending: null,
      pendingSession: CONSOLE_SESSION,
    });
    // `requestRun` chains off the real runQuery's promise, so the mock returns one too.
    vi.mocked(sqlService.runQuery).mockReset().mockResolvedValue(RESULT);
    vi.mocked(transformsService.runTransform)
      .mockReset()
      .mockResolvedValue(RESULT);
    analystCoreMock.mockReset();
  });

  it("lazy-loads the editor behind Suspense and renders it", async () => {
    const { container } = render(<SqlModule />);
    await waitFor(() =>
      expect(within(container).getByTestId("fake-monaco")).toBeTruthy(),
    );
  });

  /**
   * The phase's dividing line: this pane writes SQL and runs it, and holds
   * nothing that a run *produced*. All of it lives in Info now, so a reader of
   * this pane never has to scroll past a result to reach the editor.
   */
  it("holds the code and nothing a run produced — no results, chart, history, pin or export", () => {
    useQueryStore.getState().queryStarted(CONSOLE_SESSION, "select 1");
    useQueryStore.getState().querySucceeded(CONSOLE_SESSION, {
      columnNames: ["n"],
      columnTypes: ["BIGINT"],
      rows: [[1]],
      rowCount: 1,
      executionTimeMs: 7,
    });

    const { container } = render(<SqlModule />);
    expect(within(container).queryByText("Results")).toBeNull();
    expect(within(container).queryByText("Chart")).toBeNull();
    expect(within(container).queryByText("History")).toBeNull();
    expect(
      within(container).queryByRole("button", { name: /pin to tab/i }),
    ).toBeNull();
    expect(
      within(container).queryByRole("button", { name: /export recipe/i }),
    ).toBeNull();
    // Nor the suggestions block the drawer's scroll distance was mostly made of.
    expect(within(container).queryByText("Suggested queries")).toBeNull();
  });

  it("lays the editor above its toolbar, with only the editor region flexible", () => {
    const { container } = render(<SqlModule />);
    const editor = within(container).getByTestId("console-editor-region");
    const toolbar = within(container).getByTestId("console-toolbar");
    expect(editor.parentElement).toBe(toolbar.parentElement);
    expect(
      editor.compareDocumentPosition(toolbar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(toolbar.className).toContain("shrink-0");
  });

  it("disables Run on an empty buffer and runs through the shared path once there is SQL", async () => {
    const empty = render(<SqlModule />);
    await waitFor(() =>
      expect(
        (
          within(empty.container).getByRole("button", {
            name: /^run/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );

    act(() => {
      useQueryStore.getState().setSql(CONSOLE_SESSION, "select 1");
    });
    const run = within(empty.container).getByRole("button", {
      name: /^run/i,
    }) as HTMLButtonElement;
    expect(run.disabled).toBe(false);
    fireEvent.click(run);
    expect(sqlService.runQuery).toHaveBeenCalledWith(
      "select 1",
      CONSOLE_SESSION,
    );
  });

  // S4's interception reaches this pane like every other runner — the guard is
  // in the run path, not in the surface that raised it.
  it("hands a source mutation to the guard instead of running it", () => {
    useDatasetsStore.getState().registerDataset(dataset, [sourceTable]);
    useQueryStore.getState().setSql(CONSOLE_SESSION, "DROP TABLE orders");

    const { container } = render(<SqlModule />);
    fireEvent.click(within(container).getByRole("button", { name: /^run/i }));

    expect(transformsService.runTransform).not.toHaveBeenCalled();
    expect(useRunGuardStore.getState().pending?.mutationTarget).toBe("orders");
    // The modal belongs to `TransformGuardHost`, mounted once in the shell.
    expect(within(container).queryByRole("dialog")).toBeNull();
  });

  describe("Format", () => {
    it("is disabled with nothing to format", () => {
      const { container } = render(<SqlModule />);
      expect(
        (
          within(container).getByRole("button", {
            name: /format/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });

    // Writes through the store, not the editor instance, so the buffer stays
    // the single source of truth and the editor picks the change up the same
    // way it picks up a prefill.
    it("rewrites the buffer in place, and never runs it", async () => {
      useQueryStore
        .getState()
        .setSql(CONSOLE_SESSION, "select a,b from t where x=1");
      const { container } = render(<SqlModule />);

      fireEvent.click(
        within(container).getByRole("button", { name: /format/i }),
      );

      await waitFor(() =>
        expect(getSession(CONSOLE_SESSION).sql).toContain("\n"),
      );
      expect(getSession(CONSOLE_SESSION).sql).toMatch(/select\n\s+a,\n\s+b/);
      expect(sqlService.runQuery).not.toHaveBeenCalled();
    });
  });

  describe("Check (A2) — validate_sql beside Run", () => {
    const VALIDATE_SCHEMA = [
      { name: "ok", type: "BOOLEAN" },
      { name: "statement_class", type: "VARCHAR" },
      { name: "referenced_objects", type: "VARCHAR[]" },
      { name: "plan", type: "VARCHAR" },
      { name: "error", type: "VARCHAR" },
    ];

    function validateOutcome(row: unknown[]) {
      return {
        op: "validate_sql",
        sql: "EXPLAIN select * from orders",
        resultId: null,
        schema: VALIDATE_SCHEMA,
        rowCount: 1,
        rows: [row],
        complete: true,
        nextOffset: null,
        elapsedMs: 1,
      };
    }

    it("is disabled with nothing to check", () => {
      const { container } = render(<SqlModule />);
      expect(
        (
          within(container).getByRole("button", {
            name: /^check/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });

    it("shows a valid banner naming the statement class and referenced objects, and never runs the query", async () => {
      const callMock = vi
        .fn()
        .mockResolvedValue(
          validateOutcome([true, "query", ["orders"], "plan text", null]),
        );
      analystCoreMock.mockReturnValue({ call: callMock });
      useQueryStore.getState().setSql(CONSOLE_SESSION, "select * from orders");

      const { container } = render(<SqlModule />);
      fireEvent.click(
        within(container).getByRole("button", { name: /^check/i }),
      );

      await waitFor(() =>
        expect(
          within(container).getByTestId("console-validate-result").textContent,
        ).toContain("Valid"),
      );
      expect(callMock).toHaveBeenCalledWith("validate_sql", {
        sql: "select * from orders",
      });
      const banner = within(container).getByTestId(
        "console-validate-result",
      ).textContent;
      expect(banner).toContain("orders");
      expect(banner).toContain("costs no execution");
      expect(sqlService.runQuery).not.toHaveBeenCalled();
    });

    it("shows the failure message from an invalid statement", async () => {
      const callMock = vi
        .fn()
        .mockResolvedValue(
          validateOutcome([
            false,
            "other",
            [],
            null,
            'syntax error at or near "selct"',
          ]),
        );
      analystCoreMock.mockReturnValue({ call: callMock });
      useQueryStore.getState().setSql(CONSOLE_SESSION, "selct * from orders");

      const { container } = render(<SqlModule />);
      fireEvent.click(
        within(container).getByRole("button", { name: /^check/i }),
      );

      await waitFor(() =>
        expect(
          within(container).getByTestId("console-validate-result").textContent,
        ).toContain("syntax error"),
      );
    });

    it("clears a stale check result once the buffer changes", async () => {
      const callMock = vi
        .fn()
        .mockResolvedValue(validateOutcome([true, "query", [], "plan", null]));
      analystCoreMock.mockReturnValue({ call: callMock });
      useQueryStore.getState().setSql(CONSOLE_SESSION, "select 1");

      const { container } = render(<SqlModule />);
      fireEvent.click(
        within(container).getByRole("button", { name: /^check/i }),
      );
      await waitFor(() =>
        expect(
          within(container).queryByTestId("console-validate-result"),
        ).toBeTruthy(),
      );

      act(() => {
        useQueryStore.getState().setSql(CONSOLE_SESSION, "select 2");
      });
      expect(
        within(container).queryByTestId("console-validate-result"),
      ).toBeNull();
    });
  });

  describe("Save as… (A3) — the first-class derive action", () => {
    function deriveOutcome(
      name: string,
      kind: "table" | "view",
      note?: string,
    ) {
      return {
        op: kind === "view" ? "create_view" : "derive_table",
        sql: `CREATE ${kind === "view" ? "VIEW" : "TABLE"} "${name}" AS select * from orders`,
        resultId: null,
        schema: [
          { name: "name", type: "VARCHAR" },
          { name: "kind", type: "VARCHAR" },
          { name: "row_count", type: "BIGINT" },
          { name: "column_count", type: "BIGINT" },
        ],
        rowCount: 1,
        rows: [[name, kind, 12, 3]],
        complete: true,
        nextOffset: null,
        elapsedMs: 1,
        ...(note === undefined ? {} : { note }),
      };
    }

    function openDeriveBar(sql = "select * from orders") {
      useQueryStore.getState().setSql(CONSOLE_SESSION, sql);
      const rendered = render(<SqlModule />);
      fireEvent.click(
        within(rendered.container).getByRole("button", { name: /^save as/i }),
      );
      return rendered;
    }

    it("is disabled with nothing to save", () => {
      const { container } = render(<SqlModule />);
      expect(
        (
          within(container).getByRole("button", {
            name: /^save as/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });

    it("calls derive_table with the buffer and the typed name, never touching runTransform directly", async () => {
      const callMock = vi
        .fn()
        .mockResolvedValue(deriveOutcome("big_orders", "table"));
      analystCoreMock.mockReturnValue({ call: callMock });

      const { container } = openDeriveBar();
      fireEvent.change(
        within(container).getByLabelText(/save this query as/i),
        { target: { value: "big_orders" } },
      );
      fireEvent.click(within(container).getByTestId("console-derive-confirm"));

      await waitFor(() => expect(callMock).toHaveBeenCalled());
      expect(callMock).toHaveBeenCalledWith("derive_table", {
        name: "big_orders",
        sql: "select * from orders",
      });
      // The operation owns the statement and the registry write; the console
      // never composes a CREATE of its own for this action.
      expect(transformsService.runTransform).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(
          within(container).getByTestId("console-derive-result").textContent,
        ).toContain("big_orders created"),
      );
    });

    it("routes to create_view when the kind is switched", async () => {
      const callMock = vi
        .fn()
        .mockResolvedValue(deriveOutcome("recent", "view"));
      analystCoreMock.mockReturnValue({ call: callMock });

      const { container } = openDeriveBar();
      fireEvent.change(within(container).getByLabelText(/what to create/i), {
        target: { value: "view" },
      });
      fireEvent.change(
        within(container).getByLabelText(/save this query as/i),
        { target: { value: "recent" } },
      );
      fireEvent.click(within(container).getByTestId("console-derive-confirm"));

      await waitFor(() =>
        expect(callMock).toHaveBeenCalledWith("create_view", {
          name: "recent",
          sql: "select * from orders",
        }),
      );
    });

    it("reports the operation’s note, so a renamed object says so", async () => {
      const callMock = vi
        .fn()
        .mockResolvedValue(
          deriveOutcome(
            "_9_big",
            "table",
            'Named "_9_big" — "9 Big!" was not a usable object name, or was taken.',
          ),
        );
      analystCoreMock.mockReturnValue({ call: callMock });

      const { container } = openDeriveBar();
      fireEvent.change(
        within(container).getByLabelText(/save this query as/i),
        { target: { value: "9 Big!" } },
      );
      fireEvent.click(within(container).getByTestId("console-derive-confirm"));

      await waitFor(() =>
        expect(
          within(container).getByTestId("console-derive-result").textContent,
        ).toContain("not a usable object name"),
      );
    });

    it("keeps the form open on failure so the name and the message sit together", async () => {
      const callMock = vi
        .fn()
        .mockResolvedValue({
          ok: false,
          code: "invalid_argument",
          message: "that name is taken",
        });
      analystCoreMock.mockReturnValue({ call: callMock });

      const { container } = openDeriveBar();
      fireEvent.change(
        within(container).getByLabelText(/save this query as/i),
        { target: { value: "orders" } },
      );
      fireEvent.click(within(container).getByTestId("console-derive-confirm"));

      await waitFor(() =>
        expect(
          within(container).getByTestId("console-derive-result").textContent,
        ).toContain("that name is taken"),
      );
      expect(
        within(container).queryByTestId("console-derive-bar"),
      ).toBeTruthy();
    });
  });
});
