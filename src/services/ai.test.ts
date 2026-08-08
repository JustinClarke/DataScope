import { afterEach, describe, expect, it, vi } from "vitest";
import {
  askAI,
  DEFAULT_TOOL_PREVIEW_ROWS,
  MAX_CONSECUTIVE_FAILURES,
  MAX_PROVIDER_CALLS,
  MAX_TOOL_CALLS,
  type AskAIDeps,
} from "./ai";
import {
  createScriptedProvider,
  ProviderQuotaExhaustedError,
} from "./aiProvider";
import { SQL_TOOL } from "./toolLadder";
import type { AnalystCore } from "../lib/analyst/core";
import {
  connectAnalystMcp,
  type AnalystMcpSession,
} from "../lib/analyst/mcp/connect";
import { ANALYST_TOOLS } from "../lib/analyst/toolSchemas";
import type { OpOutcome, OpResult } from "../lib/analyst/types";
import type {
  AIProvider,
  ProviderTurn,
  TableRegistryEntry,
  ChartRecommendation,
} from "../types";

const SALES: TableRegistryEntry = {
  id: "sales",
  tableName: "sales",
  datasetId: "d1",
  origin: "file",
  rowCount: 240,
  columnCount: 3,
  memoryBytes: 0,
  createdAt: "2026-07-21T00:00:00.000Z",
  columns: [
    {
      name: "product",
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
      name: "amount",
      semanticType: "Quantitative",
      physicalType: "DOUBLE",
      cardinality: 200,
      nullPercentage: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
    },
    {
      name: "fare",
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

/** A complete two-row result — the ordinary success envelope. */
function rows(sql: string, over: Partial<OpResult> = {}): OpResult {
  return {
    op: "run_sql",
    sql,
    resultId: "r1",
    schema: [
      { name: "product", type: "VARCHAR" },
      { name: "total", type: "DOUBLE" },
    ],
    rowCount: 2,
    rows: [
      ["A", 100],
      ["B", 80],
    ],
    complete: true,
    nextOffset: null,
    elapsedMs: 4,
    ...over,
  };
}

const failed = (message: string): OpOutcome => ({
  ok: false,
  code: "sql_error",
  message,
});

/**
 * A scripted analyst core. The loop's contract with the core is `invoke` —
 * everything the core itself does (materializing once, stable paging, receipts,
 * engine authority) is A0's, covered by `lib/analyst/*.test.ts` and the
 * two-engine conformance suite. What these tests own is what the *loop* does
 * with the envelopes it gets back.
 */
function fakeCore(
  handler: (op: string, params: unknown) => OpOutcome | Promise<OpOutcome> = (
    op,
    params,
  ) => rows(String((params as { sql?: string }).sql ?? op)),
): AnalystCore & {
  calls: Array<{ op: string; params: unknown; aborted: boolean }>;
  contributions: string[];
} {
  const calls: Array<{ op: string; params: unknown; aborted: boolean }> = [];
  const contributions: string[] = [];
  const invoke = async (
    op: string,
    params: unknown,
    options?: { signal?: AbortSignal },
  ) => {
    calls.push({ op, params, aborted: options?.signal?.aborted === true });
    if (options?.signal?.aborted)
      throw new DOMException("Aborted", "AbortError");
    return handler(op, params);
  };
  return {
    engine: "duckdb-wasm",
    calls,
    contributions,
    invoke,
    call: invoke as AnalystCore["call"],
    ready: async () =>
      ({ profile: "shared", applied: [], refused: [] }) as never,
    noteContribution: (id: string) => contributions.push(id),
    store: null as never,
    close: async () => {},
  };
}

const toolCalls = (...specs: Array<[string, string]>): ProviderTurn => ({
  text: "",
  calls: specs.map(([id, sql]) => ({ id, name: SQL_TOOL, input: { sql } })),
});
const sqlCall = (id: string, sql: string): ProviderTurn => toolCalls([id, sql]);
const text = (t: string): ProviderTurn => ({ text: t, calls: [] });

/**
 * Every case in this file drives `askAI` over a **real** MCP session (A5) — a
 * `Server` and a `Client` on a linked in-memory pair — with the fake core behind
 * it. Not for realism's own sake: the loop's tool list, its argument encoding and
 * its error envelope now all cross the protocol, so a regression that only shows
 * up over MCP (a dropped `hint`, a JSON-RPC error where a tool error belonged,
 * a schema the provider layer cannot read) fails here rather than in the app.
 */
const openSessions: AnalystMcpSession[] = [];

async function deps(
  over: Partial<AskAIDeps> & { provider: AIProvider },
): Promise<AskAIDeps> {
  const core = over.core ?? fakeCore();
  let session = over.session;
  if (!session) {
    session = await connectAnalystMcp(core);
    openSessions.push(session);
  }
  return { tables: [SALES], timeoutMs: 1000, ...over, core, session };
}

// Each case connects a client and a server; left open, their pending work can
// reject into a torn-down environment and surface as an intermittent unhandled
// error with no test attached to it.
afterEach(async () => {
  await Promise.all(
    openSessions.splice(0).map((s) => s.close().catch(() => undefined)),
  );
});

describe("askAI — tool-use loop (§11.1 stages 3–6, executing through the analyst core)", () => {
  it("runs a query through the core, records the audit trail, and auto-charts the final result", async () => {
    const provider = createScriptedProvider([
      sqlCall(
        "t1",
        "SELECT product, sum(amount) AS total FROM sales GROUP BY product",
      ),
      text("Product A leads with 100."),
    ]);
    const recommendChart = vi.fn((): ChartRecommendation => ({
      kind: "chart",
      spec: {
        type: "categorical",
        title: "x",
        xField: "product",
        yFields: ["total"],
      },
    }));
    const core = fakeCore();
    const turn = await askAI(
      "total amount by product",
      await deps({ provider, core, recommendChart }),
    );

    expect(turn.content).toBe("Product A leads with 100.");
    expect(turn.error).toBeUndefined();
    expect(core.calls).toEqual([
      {
        op: SQL_TOOL,
        params: {
          sql: expect.stringContaining("GROUP BY product"),
          limit: DEFAULT_TOOL_PREVIEW_ROWS,
        },
        aborted: false,
      },
    ]);
    expect(turn.attempts).toHaveLength(1);
    expect(turn.attempts?.[0]).toMatchObject({
      attempt: 1,
      op: SQL_TOOL,
      status: "ok",
      rowCount: 2,
      executionTimeMs: 4,
    });
    expect(recommendChart).toHaveBeenCalledWith(
      expect.objectContaining({
        columnNames: ["product", "total"],
        columnTypes: ["VARCHAR", "DOUBLE"],
        rowCount: 2,
      }),
      expect.stringContaining("GROUP BY product"),
    );
    expect(turn.chart).toEqual({
      kind: "chart",
      spec: expect.objectContaining({ type: "categorical" }),
    });
  });

  it("prefers a chart the model asked for over stage 6’s guess, and carries its rows (A6)", async () => {
    const spec = {
      type: "time-series" as const,
      title: "Revenue by month",
      xField: "month",
      yFields: ["revenue"],
    };
    const provider = createScriptedProvider([
      {
        text: "",
        calls: [{ id: "t1", name: "create_chart", input: { resultId: "r1" } }],
      },
      text("Revenue climbs through Q1."),
    ]);
    // Stage 6 would chart whatever ran last; `create_chart` says which result was
    // worth drawing and how, with a spec its own validator already cleared.
    const recommendChart = vi.fn((): ChartRecommendation => ({
      kind: "kpi",
      label: "ignored",
      value: "0",
    }));
    const core = fakeCore((op) =>
      op === "create_chart"
        ? {
            ...rows("SELECT month, revenue FROM monthly", {
              op: "create_chart",
            }),
            chart: { kind: "chart", spec },
          }
        : rows("SELECT 1"),
    );

    const turn = await askAI(
      "chart revenue by month",
      await deps({ provider, core, recommendChart }),
    );

    expect(turn.chart).toEqual({ kind: "chart", spec });
    expect(recommendChart).not.toHaveBeenCalled();
    // The rows ride along so the transcript draws the chart rather than
    // describing one — and they are the charted result's, not a later query's.
    expect(turn.chartResult).toMatchObject({
      columnNames: ["product", "total"],
      rowCount: 2,
    });
  });

  it("normalizes a typo (stage 1) and records the correction", async () => {
    const provider = createScriptedProvider([
      sqlCall("t1", "SELECT avg(fare) FROM sales"),
      text("The average fare is 33."),
    ]);
    const turn = await askAI("average fair", await deps({ provider }));
    expect(turn.corrections).toEqual([{ from: "fair", to: "fare" }]);
  });

  it("marks every materialization it read as contributing, so compaction retains it (D74h)", async () => {
    const provider = createScriptedProvider([
      toolCalls(["t1", "SELECT 1"], ["t2", "SELECT 2"]),
      text("Both look fine."),
    ]);
    const core = fakeCore((_op, params) =>
      rows(String((params as { sql: string }).sql), {
        resultId:
          (params as { sql: string }).sql === "SELECT 1" ? "r-a" : "r-b",
      }),
    );
    await askAI("two things", await deps({ provider, core }));
    expect(core.contributions.sort()).toEqual(["r-a", "r-b"]);
  });

  it("does not mark contributions on a turn that never reached an answer", async () => {
    const provider = createScriptedProvider([sqlCall("t1", "SELECT 1")]);
    const core = fakeCore(() => failed("Catalog Error"));
    await askAI("anything", await deps({ provider, core }));
    expect(core.contributions).toEqual([]);
  });
});

describe("askAI — a turn carries any number of calls (A4 defect iii)", () => {
  it("executes every emitted call in order, each with its own correlated tool message", async () => {
    const provider = createScriptedProvider([
      toolCalls(["t1", "SELECT 1"], ["t2", "SELECT 2"], ["t3", "SELECT 3"]),
      text("All three ran."),
    ]);
    const core = fakeCore();
    const turn = await askAI("three things", await deps({ provider, core }));

    expect(core.calls.map((c) => (c.params as { sql: string }).sql)).toEqual([
      "SELECT 1",
      "SELECT 2",
      "SELECT 3",
    ]);
    expect(turn.attempts?.map((a) => a.sql)).toEqual([
      "SELECT 1",
      "SELECT 2",
      "SELECT 3",
    ]);

    // One tool message per call, correlated by the id the model itself emitted.
    const second = provider.calls[1].messages;
    expect(
      second
        .filter((m) => m.role === "tool")
        .map((m) => (m as { toolCallId: string }).toolCallId),
    ).toEqual(["t1", "t2", "t3"]);
  });

  it("appends the assistant message verbatim before executing anything", async () => {
    const provider = createScriptedProvider([
      {
        text: "Let me check both tables.",
        calls: [
          { id: "t1", name: SQL_TOOL, input: { sql: "SELECT 1" } },
          { id: "t2", name: SQL_TOOL, input: { sql: "SELECT 2" } },
        ],
      },
      text("Done."),
    ]);
    const turn = await askAI("check both", await deps({ provider }));

    const assistant = provider.calls[1].messages.find(
      (m) => m.role === "assistant",
    );
    expect(assistant).toEqual({
      role: "assistant",
      content: "Let me check both tables.", // prose preserved, not dropped
      toolCalls: [
        { id: "t1", name: SQL_TOOL, input: { sql: "SELECT 1" } },
        { id: "t2", name: SQL_TOOL, input: { sql: "SELECT 2" } },
      ],
    });
    // ...and it sits ahead of every result it produced.
    const order = provider.calls[1].messages.map((m) => m.role);
    expect(order.indexOf("assistant")).toBeLessThan(order.indexOf("tool"));
    expect(turn.content).toBe("Done.");
  });

  it("prose alongside tool calls is not terminal — only a response with no calls ends the turn", async () => {
    const provider = createScriptedProvider([
      {
        text: "I think the answer is A.",
        calls: [{ id: "t1", name: SQL_TOOL, input: { sql: "SELECT 1" } }],
      },
      text("Confirmed: A."),
    ]);
    const core = fakeCore();
    const turn = await askAI("which product", await deps({ provider, core }));

    expect(core.calls).toHaveLength(1); // the call ran despite the prose
    expect(turn.content).toBe("Confirmed: A.");
  });
});

describe("askAI — tools stay available after a row result (A4 defect ii, host half)", () => {
  it("offers the same tools on every round-trip, including after rows come back", async () => {
    const provider = createScriptedProvider([
      sqlCall("t1", "SELECT count(*) FROM sales"),
      sqlCall(
        "t2",
        "SELECT product, sum(amount) AS total FROM sales GROUP BY product",
      ),
      text("240 rows, and A leads."),
    ]);
    const core = fakeCore();
    const turn = await askAI(
      "how many rows, and which product leads",
      await deps({ provider, core }),
    );

    expect(core.calls).toHaveLength(2); // the second query was reachable at all
    expect(provider.calls).toHaveLength(3);
    for (const call of provider.calls) {
      // The whole catalog, unchanged across the turn — and sourced from the MCP
      // server's `tools/list`, not from a list this loop keeps. A4 advertised
      // two of seventeen here; that this now reads the full set is the A5 change.
      expect(call.tools.map((t) => t.name)).toEqual(
        ANALYST_TOOLS.map((t) => t.name),
      );
      expect(call.tools.every((t) => t.description.length > 0)).toBe(true);
    }
    expect(turn.attempts).toHaveLength(2);
  });

  it("previews a prompt-sized page by default, and lets the model ask for a bigger one", async () => {
    const provider = createScriptedProvider([
      toolCalls(["t1", "SELECT 1"]),
      {
        text: "",
        calls: [
          { id: "t2", name: SQL_TOOL, input: { sql: "SELECT 2", limit: 400 } },
        ],
      },
      text("done"),
    ]);
    const core = fakeCore();
    await askAI("anything", await deps({ provider, core }));

    expect(core.calls[0].params).toEqual({
      sql: "SELECT 1",
      limit: DEFAULT_TOOL_PREVIEW_ROWS,
    });
    expect(core.calls[1].params).toEqual({ sql: "SELECT 2", limit: 400 }); // the model's own size wins
  });

  it("pages a large result through read_result rather than stopping at the preview (A4 defect i)", async () => {
    const provider = createScriptedProvider([
      sqlCall("t1", "SELECT * FROM sales"),
      {
        text: "",
        calls: [
          {
            id: "t2",
            name: "read_result",
            input: { resultId: "r1", offset: 100 },
          },
        ],
      },
      text("240 rows in total; the tail looks the same."),
    ]);
    const core = fakeCore((op, params) =>
      op === "read_result"
        ? rows("SELECT * FROM sales", {
            op: "read_result",
            rowCount: 240,
            complete: false,
            nextOffset: 200,
          })
        : rows(String((params as { sql: string }).sql), {
            rowCount: 240,
            complete: false,
            nextOffset: 100,
          }),
    );
    const turn = await askAI(
      "show me everything",
      await deps({ provider, core }),
    );

    expect(core.calls[1]).toMatchObject({
      op: "read_result",
      params: { resultId: "r1", offset: 100 },
    });
    // The model saw the true total, not the preview length.
    const firstResult = JSON.parse(
      (
        provider.calls[1].messages.find((m) => m.role === "tool") as {
          content: string;
        }
      ).content,
    );
    expect(firstResult).toMatchObject({
      rowCount: 240,
      complete: false,
      nextOffset: 100,
    });
    expect(turn.attempts?.map((a) => a.op)).toEqual([SQL_TOOL, "read_result"]);
  });
});

describe("askAI — structured errors, recovered on an ordinary turn", () => {
  it("feeds the core’s own OpError back verbatim, with no host-authored repair prompt", async () => {
    const provider = createScriptedProvider([
      sqlCall("t1", "SELECT product, sum(amt) FROM sales GROUP BY product"),
      sqlCall(
        "t2",
        "SELECT product, sum(amount) AS total FROM sales GROUP BY product",
      ),
      text("Fixed — Product A leads."),
    ]);
    let first = true;
    const core = fakeCore((_op, params) => {
      if (first) {
        first = false;
        return {
          ok: false,
          code: "sql_error",
          message: 'Binder Error: column "amt" not found',
          hint: "amount",
        };
      }
      return rows(String((params as { sql: string }).sql));
    });
    const turn = await askAI(
      "sales by product",
      await deps({ provider, core }),
    );

    expect(turn.content).toBe("Fixed — Product A leads.");
    expect(turn.attempts).toHaveLength(2);
    expect(turn.attempts?.[0]).toMatchObject({ attempt: 1, status: "error" });

    const toolMessage = provider.calls[1].messages.find(
      (m) => m.role === "tool",
    ) as { content: string };
    expect(JSON.parse(toolMessage.content)).toEqual({
      ok: false,
      code: "sql_error",
      message: 'Binder Error: column "amt" not found',
      hint: "amount", // the core's mechanical hint survives; nothing else is added
    });
    expect(toolMessage.content).not.toMatch(
      /try again|correct the sql|fix these/i,
    );
  });

  it("returns a structured error for a tool it does not advertise, naming the ones it does", async () => {
    // `derive_table` used to be the fixture here, back when the loop advertised
    // two tools and the core accepted seventeen. A5 closed that gap, so the only
    // way to be an unadvertised tool now is not to be in the catalog at all.
    const provider = createScriptedProvider([
      {
        text: "",
        calls: [{ id: "t1", name: "summarize_everything", input: {} }],
      },
      text("Understood."),
    ]);
    const core = fakeCore();
    await askAI("summarize it all", await deps({ provider, core }));

    expect(core.calls).toHaveLength(0); // never reached the core
    const toolMessage = provider.calls[1].messages.find(
      (m) => m.role === "tool",
    ) as { content: string };
    const envelope = JSON.parse(toolMessage.content);
    expect(envelope).toMatchObject({
      ok: false,
      code: "invalid_argument",
      message: "No tool named summarize_everything.",
    });
    // The hint is the advertised catalog, and the catalog is what the server
    // declared — not a list this file keeps.
    expect(envelope.hint.split(", ")).toEqual(ANALYST_TOOLS.map((t) => t.name));
  });

  it("blocks a dialect fault before execution (stage 4) and never runs the SQL", async () => {
    const provider = createScriptedProvider([
      sqlCall("t1", "SELECT TOP 5 product FROM sales"),
      sqlCall("t2", "SELECT TOP 5 product FROM sales"),
      sqlCall("t3", "SELECT TOP 5 product FROM sales"),
    ]);
    const core = fakeCore();
    const turn = await askAI("top products", await deps({ provider, core }));

    expect(core.calls).toHaveLength(0);
    expect(turn.error).toMatch(/failed 3 times in a row/i);
    expect(turn.attempts?.[0].lint?.some((f) => f.rule === "top-clause")).toBe(
      true,
    );
    const toolMessage = provider.calls[1].messages.find(
      (m) => m.role === "tool",
    ) as { content: string };
    expect(JSON.parse(toolMessage.content)).toMatchObject({
      ok: false,
      code: "sql_error",
      hint: "top-clause",
    });
  });
});

describe("askAI — ceilings and the termination guarantee (A4 defect v)", () => {
  it("stops at exactly MAX_CONSECUTIVE_FAILURES", async () => {
    const provider = createScriptedProvider([
      sqlCall("t1", "SELECT 1 FROM nope"),
      sqlCall("t2", "SELECT 1 FROM nope"),
      sqlCall("t3", "SELECT 1 FROM nope"),
      sqlCall("t4", "SELECT 1 FROM nope"), // must never be reached
    ]);
    const core = fakeCore(() =>
      failed('Catalog Error: table "nope" does not exist'),
    );
    const turn = await askAI("anything", await deps({ provider, core }));

    expect(turn.error).toContain(`${MAX_CONSECUTIVE_FAILURES} times in a row`);
    expect(turn.attempts).toHaveLength(MAX_CONSECUTIVE_FAILURES);
    expect(core.calls).toHaveLength(MAX_CONSECUTIVE_FAILURES);
    expect(provider.calls).toHaveLength(MAX_CONSECUTIVE_FAILURES); // no 4th round-trip
  });

  it("counts failures consecutively, not cumulatively — a recovered failure does not accrue", async () => {
    // fail, succeed, fail, fail, fail: the cumulative rule would have ended this
    // turn at the third failure overall; the consecutive rule ends it at the
    // third in a row, which is the one that means "not recovering".
    const provider = createScriptedProvider([
      sqlCall("a", "SELECT 1"),
      sqlCall("b", "SELECT 2"),
      sqlCall("c", "SELECT 3"),
      sqlCall("d", "SELECT 4"),
      sqlCall("e", "SELECT 5"),
      sqlCall("f", "SELECT 6"),
    ]);
    const outcomes = [
      failed("e1"),
      rows("SELECT 2"),
      failed("e2"),
      failed("e3"),
      failed("e4"),
    ];
    let i = 0;
    const core = fakeCore(() => outcomes[i++]);
    const turn = await askAI("anything", await deps({ provider, core }));

    expect(core.calls).toHaveLength(5); // reached the fifth call — the cumulative rule would have stopped at four
    expect(turn.error).toMatch(/3 times in a row/);
  });

  it("terminates at MAX_PROVIDER_CALLS against a model that never stops calling", async () => {
    const provider: AIProvider = {
      id: "looper",
      complete: async () => sqlCall("t", "SELECT 1"),
    };
    const core = fakeCore();
    const turn = await askAI("anything", await deps({ provider, core }));

    expect(core.calls).toHaveLength(MAX_PROVIDER_CALLS);
    expect(turn.content).toBe("Here are the results of the last query.");
    expect(turn.error).toBeUndefined();
  });

  it("bounds total operations when a model emits many calls per round-trip", async () => {
    const wide = Array.from({ length: 20 }, (_, n): [string, string] => [
      `t${n}`,
      `SELECT ${n}`,
    ]);
    const provider: AIProvider = {
      id: "wide",
      complete: async () => toolCalls(...wide),
    };
    const core = fakeCore();
    const turn = await askAI("anything", await deps({ provider, core }));

    expect(core.calls.length).toBeLessThanOrEqual(MAX_TOOL_CALLS);
    expect(turn.error).toContain(`${MAX_TOOL_CALLS} operations`);
  });
});

describe("askAI — cancellation reaches the engine (A4 defect iv)", () => {
  it("passes the caller signal into every core call", async () => {
    const provider = createScriptedProvider([
      sqlCall("t1", "SELECT 1"),
      text("done"),
    ]);
    const controller = new AbortController();
    const core = fakeCore();
    await askAI(
      "anything",
      await deps({ provider, core, signal: controller.signal }),
    );
    expect(core.calls[0].aborted).toBe(false);
  });

  it("re-throws AbortError when a superseding question aborts an in-flight operation", async () => {
    const controller = new AbortController();
    const provider = createScriptedProvider([
      sqlCall("t1", "SELECT 1"),
      text("never reached"),
    ]);
    // The core is the one that observes the abort — because the loop hands it the
    // signal, which is the whole of defect (iv): `runChartQuery` accepted none.
    const core = fakeCore(() => {
      throw new DOMException("Aborted", "AbortError");
    });
    controller.abort();

    await expect(
      askAI(
        "anything",
        await deps({ provider, core, signal: controller.signal }),
      ),
    ).rejects.toThrow(/abort/i);
  });
});

describe("askAI — provider failures", () => {
  it("surfaces a provider timeout as a clean error, not a hung chat (§21.6)", async () => {
    const hanging: AIProvider = {
      id: "slow",
      complete: () => new Promise(() => {}),
    };
    const turn = await askAI(
      "anything",
      await deps({ provider: hanging, timeoutMs: 10 }),
    );
    expect(turn.error).toContain("timed out");
    expect(turn.content).toBe("");
  });

  it("surfaces a provider transport failure cleanly", async () => {
    const broken: AIProvider = {
      id: "down",
      complete: () => Promise.reject(new Error("network down")),
    };
    const turn = await askAI("anything", await deps({ provider: broken }));
    expect(turn.error).toContain("could not be reached");
  });

  it("renders the shared-budget-exhausted state, not a generic failure, on a quota error (§11.2)", async () => {
    const exhausted: AIProvider = {
      id: "cloud",
      complete: () => Promise.reject(new ProviderQuotaExhaustedError()),
    };
    const turn = await askAI("anything", await deps({ provider: exhausted }));
    expect(turn.error).toMatch(/free AI budget is used up/i);
    expect(turn.error).toMatch(
      /bring your own key|local model|retry tomorrow/i,
    );
  });
});

describe("askAI — D3 client-orchestrated Ollama overflow (2026-07-23)", () => {
  it("swaps to the overflow provider on the very first call and marks the turn", async () => {
    const primary: AIProvider = {
      id: "cloud",
      complete: () => Promise.reject(new ProviderQuotaExhaustedError()),
    };
    const overflow = createScriptedProvider(
      [
        sqlCall(
          "t1",
          "SELECT product, sum(amount) AS total FROM sales GROUP BY product",
        ),
        text("Finished on Ollama."),
      ],
      "ollama",
    );
    const turn = await askAI(
      "sales by product",
      await deps({ provider: primary, overflowProvider: overflow }),
    );

    expect(turn.content).toBe("Finished on Ollama.");
    expect(turn.servedByOllamaOverflow).toBe(true);
    expect(overflow.calls).toHaveLength(2);
  });

  it("fires mid-turn (not on call 1) and persists the swap for the rest of the turn", async () => {
    let primaryCalls = 0;
    const primary: AIProvider = {
      id: "cloud",
      complete: async () => {
        primaryCalls += 1;
        if (primaryCalls === 1)
          return sqlCall(
            "t1",
            "SELECT product, sum(amount) AS total FROM sales GROUP BY product",
          );
        throw new ProviderQuotaExhaustedError();
      },
    };
    const overflow = createScriptedProvider(
      [text("Finished on Ollama after the swap.")],
      "ollama",
    );
    const turn = await askAI(
      "sales by product",
      await deps({ provider: primary, overflowProvider: overflow }),
    );

    expect(primaryCalls).toBe(2); // one successful tool call, then the quota error
    expect(overflow.calls).toHaveLength(1); // the retried iteration, served entirely by the overflow
    expect(turn.content).toBe("Finished on Ollama after the swap.");
    expect(turn.servedByOllamaOverflow).toBe(true);
    expect(turn.attempts).toHaveLength(1); // the SQL that ran before the swap is still in the audit trail
  });

  it("a quota error with no overflow provider configured still renders the standard exhausted state", async () => {
    const primary: AIProvider = {
      id: "cloud",
      complete: () => Promise.reject(new ProviderQuotaExhaustedError()),
    };
    const turn = await askAI("anything", await deps({ provider: primary }));
    expect(turn.servedByOllamaOverflow).toBeUndefined();
    expect(turn.quotaExhausted).toBe(true);
  });

  it("surfaces a distinct, endpoint-naming message when the overflow provider itself fails", async () => {
    const primary: AIProvider = {
      id: "cloud",
      complete: () => Promise.reject(new ProviderQuotaExhaustedError()),
    };
    const overflow: AIProvider = {
      id: "ollama",
      complete: () => Promise.reject(new Error("fetch failed")),
    };
    const turn = await askAI(
      "anything",
      await deps({
        provider: primary,
        overflowProvider: overflow,
        overflowBaseUrl: "http://localhost:11434",
      }),
    );
    expect(turn.error).toContain("http://localhost:11434");
    expect(turn.error).toMatch(/prefer my key/i);
    expect(turn.servedByOllamaOverflow).toBeUndefined(); // never got a successful turn to mark
  });
});

describe("askAI — §11.3 data-sampled repair (06-ai/03, metadataOnlyRepair)", () => {
  const SAMPLE: OpResult = {
    op: "sample_rows",
    sql: 'SELECT * FROM "sales" LIMIT 3',
    resultId: "s1",
    schema: [
      { name: "product", type: "VARCHAR" },
      { name: "amount", type: "DOUBLE" },
    ],
    rowCount: 3,
    rows: [
      ["A", 1],
      ["B", 2],
      ["C", 3],
    ],
    complete: true,
    nextOffset: null,
    elapsedMs: 1,
  };

  /** Fails the first query, samples on demand, then succeeds. */
  function repairCore(sampleOutcome: OpOutcome = SAMPLE) {
    let queries = 0;
    return fakeCore((op, params) => {
      if (op === "sample_rows") return sampleOutcome;
      queries += 1;
      return queries === 1
        ? failed('Binder Error: column "amt" not found')
        : rows(String((params as { sql: string }).sql));
    });
  }

  const repairProvider = () =>
    createScriptedProvider([
      sqlCall("t1", "SELECT product, sum(amt) FROM sales GROUP BY product"),
      sqlCall(
        "t2",
        "SELECT product, sum(amount) AS total FROM sales GROUP BY product",
      ),
      text("Fixed."),
    ]);

  it("metadata-only (the default): a failed attempt carries only the error envelope, never sample rows", async () => {
    const provider = repairProvider();
    const core = repairCore();
    const turn = await askAI(
      "sales by product",
      await deps({ provider, core }),
    ); // metadataOnlyRepair defaults true

    expect(turn.attempts?.[0].sampledRows).toBeUndefined();
    expect(core.calls.some((c) => c.op === "sample_rows")).toBe(false);
    expect(
      provider.calls[1].messages.some(
        (m) => m.role === "tool" && /sampleRows/.test(m.content),
      ),
    ).toBe(false);
  });

  it("data-sampled repair (metadataOnlyRepair: false): a failed attempt attaches up to 3 rows and the transcript marks it", async () => {
    const provider = repairProvider();
    const core = repairCore();
    const turn = await askAI(
      "sales by product",
      await deps({ provider, core, metadataOnlyRepair: false }),
    );

    expect(turn.attempts?.[0].sampledRows).toBe(true);
    expect(core.calls[1]).toMatchObject({
      op: "sample_rows",
      params: { table: "sales", limit: 3 },
    });

    const toolMessage = provider.calls[1].messages.find(
      (m) => m.role === "tool",
    ) as { content: string };
    const payload = JSON.parse(toolMessage.content);
    expect(payload.ok).toBe(false); // still the structured envelope
    expect(payload.sampleRows).toEqual({
      table: "sales",
      columns: ["product", "amount"],
      rows: [
        ["A", 1],
        ["B", 2],
        ["C", 3],
      ],
    });
  });

  it("degrades silently to metadata-only when the sample itself fails — no crash, no sampledRows flag", async () => {
    const provider = repairProvider();
    const core = repairCore(failed("sample also failed"));
    const turn = await askAI(
      "sales by product",
      await deps({ provider, core, metadataOnlyRepair: false }),
    );

    expect(turn.content).toBe("Fixed.");
    expect(turn.attempts?.[0].sampledRows).toBeUndefined();
  });

  it("never samples on the terminal failed attempt (no wasted query once the turn is about to fail)", async () => {
    const provider = createScriptedProvider([
      sqlCall("t1", "SELECT 1 FROM nope"),
      sqlCall("t2", "SELECT 1 FROM nope"),
      sqlCall("t3", "SELECT 1 FROM nope"),
    ]);
    const core = fakeCore((op) =>
      op === "sample_rows"
        ? SAMPLE
        : failed('Catalog Error: table "nope" does not exist'),
    );
    const turn = await askAI(
      "anything",
      await deps({ provider, core, metadataOnlyRepair: false }),
    );

    expect(turn.error).toMatch(/3 times in a row/);
    expect(turn.attempts?.[0].sampledRows).toBe(true);
    expect(turn.attempts?.[1].sampledRows).toBe(true);
    expect(turn.attempts?.[2].sampledRows).toBeUndefined(); // the terminal attempt — never sampled
    expect(core.calls.filter((c) => c.op === "sample_rows")).toHaveLength(2);
  });
});
