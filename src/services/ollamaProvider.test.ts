import { describe, expect, it, vi } from "vitest";
import {
  createOllamaProvider,
  isOllamaEndpoint,
  listOllamaModels,
  DEFAULT_OLLAMA_MODEL,
  listRunningOllamaModels,
  unloadOllamaModel,
} from "./ollamaProvider";
import {
  MAX_UNSTRUCTURED_FOLLOW_UPS,
  SQL_TOOL,
  UNAVAILABLE_TOOL_MESSAGE,
  extractTextToolCall,
} from "./toolLadder";
import type { AITool, ProviderMessage } from "../types";

const TOOLS: AITool[] = [
  {
    name: SQL_TOOL,
    description: "run sql",
    inputSchema: {
      type: "object",
      properties: { sql: { type: "string" } },
      required: ["sql"],
    },
  },
];
const MESSAGES: ProviderMessage[] = [
  { role: "system", content: "schema" },
  { role: "user", content: "average fare" },
];

/** The loop's own tool-result shape: an `OpResult` on success, an `OpError` on failure. */
const rowResult = (rows: unknown[][]) =>
  JSON.stringify({
    op: SQL_TOOL,
    sql: "SELECT 1",
    resultId: "r1",
    schema: [],
    rowCount: rows.length,
    rows,
    complete: true,
    nextOffset: null,
    elapsedMs: 1,
  });
const errorResult = (message: string) =>
  JSON.stringify({ ok: false, code: "sql_error", message });

const afterOneQuery = (result: string): ProviderMessage[] => [
  ...MESSAGES,
  {
    role: "assistant",
    content: "",
    toolCalls: [{ id: "t1", name: SQL_TOOL, input: { sql: "SELECT 1" } }],
  },
  { role: "tool", toolCallId: "t1", content: result },
];

function ok(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

const sentBody = (
  fetchImpl: { mock: { calls: ReadonlyArray<readonly unknown[]> } },
  n = 0,
) => JSON.parse((fetchImpl.mock.calls[n][1] as RequestInit).body as string);

describe("createOllamaProvider", () => {
  it("posts to the localhost /api/chat endpoint with mapped tools and returns a text turn", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        ok({
          message: { role: "assistant", content: "The average fare is 33." },
        }),
      ),
    );
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const turn = await provider.complete(MESSAGES, TOOLS);

    expect(turn).toEqual({ text: "The average fare is 33.", calls: [] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    const sent = JSON.parse(init!.body as string);
    expect(sent.model).toBe(DEFAULT_OLLAMA_MODEL);
    expect(sent.stream).toBe(false);
    expect(sent.tools[0]).toMatchObject({
      type: "function",
      function: { name: SQL_TOOL },
    });
  });

  it("maps a structured tool call in the response to a call on the turn", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        ok({
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                function: {
                  name: SQL_TOOL,
                  arguments: { sql: "SELECT avg(fare) FROM t" },
                },
              },
            ],
          },
        }),
      ),
    );
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const turn = await provider.complete(MESSAGES, TOOLS);

    expect(turn.calls).toHaveLength(1);
    expect(turn.calls[0].name).toBe(SQL_TOOL);
    expect(turn.calls[0].input).toEqual({ sql: "SELECT avg(fare) FROM t" });
    expect(turn.calls[0].id).toBeTruthy();
  });

  it("carries EVERY structured call, in emitted order (A4 defect iii — this used to keep only the first)", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        ok({
          message: {
            role: "assistant",
            content: "Checking all three.",
            tool_calls: [
              { function: { name: SQL_TOOL, arguments: { sql: "SELECT 1" } } },
              { function: { name: SQL_TOOL, arguments: { sql: "SELECT 2" } } },
              { function: { name: SQL_TOOL, arguments: { sql: "SELECT 3" } } },
            ],
          },
        }),
      ),
    );
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const turn = await provider.complete(MESSAGES, TOOLS);

    expect(turn.calls.map((c) => (c.input as { sql: string }).sql)).toEqual([
      "SELECT 1",
      "SELECT 2",
      "SELECT 3",
    ]);
    expect(turn.text).toBe("Checking all three."); // prose alongside calls is kept
    expect(new Set(turn.calls.map((c) => c.id)).size).toBe(3); // distinct ids, so results correlate
  });

  it("replays every assistant tool call and the tool result into Ollama message shape", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(ok({ message: { role: "assistant", content: "done" } })),
    );
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: "http://host:9/",
      model: "coder",
    });

    await provider.complete(
      [
        ...MESSAGES,
        {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "t1", name: SQL_TOOL, input: { sql: "SELECT 1" } },
            { id: "t2", name: SQL_TOOL, input: { sql: "SELECT 2" } },
          ],
        },
        { role: "tool", toolCallId: "t1", content: rowResult([]) },
      ],
      TOOLS,
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://host:9/api/chat"); // trailing slash trimmed
    const sent = JSON.parse(init!.body as string);
    expect(sent.model).toBe("coder");
    expect(sent.messages[2]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [
        { function: { name: SQL_TOOL, arguments: { sql: "SELECT 1" } } },
        { function: { name: SQL_TOOL, arguments: { sql: "SELECT 2" } } },
      ],
    });
    expect(sent.messages[3]).toMatchObject({ role: "tool" });
  });

  it("extracts plain-text SQL from a coder that never emits structured tool_calls", async () => {
    // The pinned qwen2.5-coder:1.5b replies with fenced SQL (or prose), not
    // tool_calls — probed live against a real daemon. The provider must wrap
    // the extracted statement as a run_sql call itself.
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        ok({
          message: {
            role: "assistant",
            content:
              'Here you go:\n```sql\nSELECT COUNT(*) FROM "titanic" WHERE "Survived" = 1;\n```',
          },
        }),
      ),
    );
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const turn = await provider.complete(MESSAGES, TOOLS);

    expect(turn.calls).toHaveLength(1);
    expect(turn.calls[0].name).toBe(SQL_TOOL);
    expect(turn.calls[0].input).toEqual({
      sql: 'SELECT COUNT(*) FROM "titanic" WHERE "Survived" = 1',
    });
    // SQL rung: the request carries the tools and appends the SQL instruction.
    const sent = sentBody(fetchImpl);
    expect(sent.tools).toBeDefined();
    expect(sent.messages.at(-1)).toMatchObject({
      role: "user",
      content: expect.stringContaining("ONLY one DuckDB SQL SELECT"),
    });
  });

  it("retries the SQL rung after an error envelope (a failed attempt is not rows)", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        ok({
          message: {
            role: "assistant",
            content: '```sql\nSELECT "Fare" FROM "titanic"\n```',
          },
        }),
      ),
    );
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const turn = await provider.complete(
      afterOneQuery(errorResult('Binder Error: column "fare" not found')),
      TOOLS,
    );

    expect(turn.calls).toHaveLength(1);
    const sent = sentBody(fetchImpl);
    expect(sent.tools).toBeDefined();
    expect(sent.messages.at(-1)).toMatchObject({
      content: expect.stringContaining("ONLY one DuckDB SQL SELECT"),
    });
  });

  it("throws a helpful error when the daemon rejects the request", async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: false,
          status: 404,
          json: async () => ({}),
        }) as unknown as Response,
    );
    const provider = createOllamaProvider({ fetchImpl });

    await expect(provider.complete(MESSAGES, TOOLS)).rejects.toThrow(
      /Ollama request failed \(404\)/,
    );
  });
});

describe("createOllamaProvider — the capability probe and ladder (A4 defect ii)", () => {
  it("keeps tools available after a row result, and lets the model choose to query again", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        ok({
          message: {
            role: "assistant",
            content: '```sql\nSELECT avg("Fare") FROM "titanic"\n```',
          },
        }),
      ),
    );
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const turn = await provider.complete(
      afterOneQuery(rowResult([[342]])),
      TOOLS,
    );

    // The old rule made this impossible: rows in meant tools withdrawn and an
    // answer-only round-trip, so the turn was capped at one query.
    expect(turn.calls).toHaveLength(1);
    const sent = sentBody(fetchImpl);
    expect(sent.tools).toBeDefined();
    expect(sent.messages.at(-1)).toMatchObject({
      content: expect.stringContaining("If they answer the question"),
    });
  });

  it("ends the turn as text when the model answers in prose on that same rung", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        ok({
          message: { role: "assistant", content: "342 passengers survived." },
        }),
      ),
    );
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const turn = await provider.complete(
      afterOneQuery(rowResult([[342]])),
      TOOLS,
    );

    expect(turn).toEqual({ text: "342 passengers survived.", calls: [] });
  });

  it("falls back to an answer-only rung once the unstructured follow-up budget is spent", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        ok({
          message: { role: "assistant", content: "```sql\nSELECT 1\n```" },
        }),
      ),
    );
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // One assistant message per query already asked for, past the budget.
    const spent: ProviderMessage[] = [
      ...MESSAGES,
      ...Array.from(
        { length: MAX_UNSTRUCTURED_FOLLOW_UPS + 1 },
        (_, n): ProviderMessage[] => [
          {
            role: "assistant",
            content: "",
            toolCalls: [
              { id: `t${n}`, name: SQL_TOOL, input: { sql: `SELECT ${n}` } },
            ],
          },
          { role: "tool", toolCallId: `t${n}`, content: rowResult([[n]]) },
        ],
      ).flat(),
    ];

    const turn = await provider.complete(spent, TOOLS);

    expect(turn.calls).toEqual([]); // deterministic termination — the guarantee the old trapdoor gave
    const sent = sentBody(fetchImpl);
    expect(sent.tools).toBeUndefined();
    expect(sent.messages.at(-1)).toMatchObject({
      content: expect.stringContaining("plain-language answer"),
    });
  });

  it("stops coaching a model that proves it emits structured calls, and lets it drive", async () => {
    const fetchImpl = vi
      .fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        ok({
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              { function: { name: SQL_TOOL, arguments: { sql: "SELECT 1" } } },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        ok({
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              { function: { name: SQL_TOOL, arguments: { sql: "SELECT 2" } } },
            ],
          },
        }),
      );
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.complete(MESSAGES, TOOLS);
    // Rows are in, and the old rule would now force an answer. A model that has
    // shown it can drive is instead handed the tools and left alone.
    const second = await provider.complete(
      afterOneQuery(rowResult([[1]])),
      TOOLS,
    );

    expect(second.calls).toHaveLength(1);
    const sent = sentBody(fetchImpl, 1);
    expect(sent.tools).toBeDefined();
    expect(sent.messages.at(-1)).toMatchObject({ role: "tool" }); // no instruction appended at all
  });

  it("never latches the probe the other way — one prose reply does not prove a model cannot call", async () => {
    const fetchImpl = vi
      .fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        ok({ message: { role: "assistant", content: "I need to think." } }),
      )
      .mockResolvedValueOnce(
        ok({
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              { function: { name: SQL_TOOL, arguments: { sql: "SELECT 1" } } },
            ],
          },
        }),
      );
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.complete(MESSAGES, TOOLS);
    const second = await provider.complete(MESSAGES, TOOLS);

    expect(second.calls).toHaveLength(1);
  });
});

describe("isOllamaEndpoint — API mode field-shape detection (D9, 2026-07-22)", () => {
  it("treats http/https URLs as a local Ollama endpoint", () => {
    expect(isOllamaEndpoint("http://localhost:11434")).toBe(true);
    expect(isOllamaEndpoint("https://ollama.local:1234")).toBe(true);
    expect(isOllamaEndpoint("  http://localhost:11434  ")).toBe(true); // whitespace-tolerant
  });

  it("treats an opaque bearer key as not an endpoint", () => {
    expect(isOllamaEndpoint("sk-abcdef1234567890")).toBe(false);
  });

  it("treats a non-http(s) scheme as not an endpoint (never a bearer auth path)", () => {
    expect(isOllamaEndpoint("ftp://localhost:11434")).toBe(false);
  });

  it("treats an empty or malformed string as not an endpoint", () => {
    expect(isOllamaEndpoint("")).toBe(false);
    expect(isOllamaEndpoint("not a url")).toBe(false);
  });
});

describe("listOllamaModels", () => {
  const tagsResponse = (body: unknown) =>
    vi.fn().mockResolvedValue({ ok: true, json: async () => body } as Response);

  it("returns the pulled models, name-sorted, with sizes", async () => {
    const fetchImpl = tagsResponse({
      models: [
        { name: "qwen3.5:4b", size: 3_390_000_000 },
        { name: "qwen2.5-coder:1.5b", size: 990_000_000 },
      ],
    });
    const found = await listOllamaModels({
      baseUrl: "http://localhost:11434",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(found).toEqual([
      { name: "qwen2.5-coder:1.5b", sizeBytes: 990_000_000 },
      { name: "qwen3.5:4b", sizeBytes: 3_390_000_000 },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:11434/api/tags",
      expect.anything(),
    );
  });

  it("strips a trailing slash from the endpoint", async () => {
    const fetchImpl = tagsResponse({ models: [] });
    await listOllamaModels({
      baseUrl: "http://localhost:11434/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:11434/api/tags",
      expect.anything(),
    );
  });

  // An unreachable daemon is a UI state (offer free text), not an error to
  // throw at a user who is only opening a settings panel.
  it("returns an empty list when the daemon is unreachable", async () => {
    const found = await listOllamaModels({
      fetchImpl: vi.fn().mockRejectedValue(new TypeError("failed to fetch")) as unknown as typeof fetch,
    });
    expect(found).toEqual([]);
  });

  it("returns an empty list on a non-ok response or a malformed body", async () => {
    expect(
      await listOllamaModels({
        fetchImpl: vi.fn().mockResolvedValue({ ok: false } as Response) as unknown as typeof fetch,
      }),
    ).toEqual([]);
    expect(
      await listOllamaModels({
        fetchImpl: tagsResponse({}) as unknown as typeof fetch,
      }),
    ).toEqual([]);
  });

  it("falls back to `model` when an entry has no `name`, and drops nameless ones", async () => {
    const found = await listOllamaModels({
      fetchImpl: tagsResponse({
        models: [{ model: "qwen3:8b", size: 5_230_000_000 }, { size: 1 }],
      }) as unknown as typeof fetch,
    });
    expect(found).toEqual([{ name: "qwen3:8b", sizeBytes: 5_230_000_000 }]);
  });
});

describe("extractTextToolCall", () => {
  // The exact payload a qwen2.5-coder:1.5b turn put in the message body, which
  // reached the user as raw JSON on screen.
  const OBSERVED =
    '{"name": "derive_table", "arguments": {"name": "sales_by_order", "sql": "SELECT order_id, customer_id, amount FROM sales"}}';

  it("parses a tool call the model wrote as text", () => {
    expect(extractTextToolCall(OBSERVED)).toEqual({
      name: "derive_table",
      input: {
        name: "sales_by_order",
        sql: "SELECT order_id, customer_id, amount FROM sales",
      },
      raw: OBSERVED,
    });
  });

  it("finds the call when prose surrounds it, and reports the exact span", () => {
    const found = extractTextToolCall(`Sure, here goes:\n${OBSERVED}\nhope that helps`);
    expect(found?.name).toBe("derive_table");
    expect(found?.raw).toBe(OBSERVED);
  });

  // Brace-matching, not a regex: SQL string literals routinely carry braces and
  // quotes that end a naive match early.
  it("handles braces and escaped quotes inside the SQL argument", () => {
    const tricky =
      '{"name": "run_sql", "arguments": {"sql": "SELECT \'a}b\' AS x, \\"y\\" FROM t"}}';
    expect(extractTextToolCall(tricky)?.name).toBe("run_sql");
  });

  it("accepts `parameters` as well as `arguments`", () => {
    expect(
      extractTextToolCall('{"name": "run_sql", "parameters": {"sql": "SELECT 1"}}')?.input,
    ).toEqual({ sql: "SELECT 1" });
  });

  it("ignores JSON that is not a tool call, and plain prose", () => {
    expect(extractTextToolCall('{"rows": 3}')).toBeNull();
    expect(extractTextToolCall("There are 18 distinct manufacturers.")).toBeNull();
    expect(extractTextToolCall('{"name": "run_sql", "arguments": "not an object"}')).toBeNull();
  });

  it("skips a non-call object and finds a later real one", () => {
    const found = extractTextToolCall('{"note": "thinking"} then {"name": "run_sql", "arguments": {"sql": "SELECT 1"}}');
    expect(found?.name).toBe("run_sql");
  });
});

describe("a tool call emitted as text", () => {
  const textCall = (name: string, args: Record<string, unknown>) =>
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: JSON.stringify({ name, arguments: args }) },
      }),
    } as Response);

  it("is honoured as a real call when it names an offered tool", async () => {
    const provider = createOllamaProvider({
      fetchImpl: textCall(SQL_TOOL, { sql: "SELECT count(*) FROM t" }) as unknown as typeof fetch,
    });
    const turn = await provider.complete(MESSAGES, TOOLS);
    expect(turn.calls).toHaveLength(1);
    expect(turn.calls[0].name).toBe(SQL_TOOL);
    expect(turn.calls[0].input).toEqual({ sql: "SELECT count(*) FROM t" });
    // The JSON is the call, not the answer — it must not also be shown.
    expect(turn.text).toBe("");
  });

  it("never shows raw JSON when the tool does not exist", async () => {
    const provider = createOllamaProvider({
      fetchImpl: textCall("derive_table", { sql: "SELECT 1 FROM sales" }) as unknown as typeof fetch,
    });
    const turn = await provider.complete(MESSAGES, TOOLS);
    expect(turn.calls).toHaveLength(0);
    expect(turn.text).toBe(UNAVAILABLE_TOOL_MESSAGE);
    expect(turn.text).not.toContain("derive_table");
    expect(turn.text).not.toContain("{");
  });
});

describe("the `think` flag on the wire", () => {
  const complete = async (think: boolean) => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(ok({ message: { role: "assistant", content: "42" } })),
    );
    const provider = createOllamaProvider({
      think,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await provider.complete(MESSAGES, TOOLS);
    return sentBody(fetchImpl);
  };

  // Ollama 0.32.1 rejects `think: true` on a model without the capability with
  // a 400 (`"qwen2.5-coder:1.5b" does not support thinking`), which fails the
  // whole turn. Omitting the flag leaves a reasoning model reasoning and a
  // plain one unbothered, so think-on must never reach the wire as `true`.
  it("omits the flag entirely when thinking is on", async () => {
    expect(await complete(true)).not.toHaveProperty("think");
  });

  // Think-off still has to be sent: it is what collapses a model that honours
  // it (qwen3.5:4b, 819 tokens -> 8) down to a turn that fits the budget.
  it("sends think:false when thinking is off", async () => {
    expect(await complete(false)).toMatchObject({ think: false });
  });
});

describe("listRunningOllamaModels — what the daemon holds in memory", () => {
  const psBody = {
    models: [
      {
        name: "qwen3:4b",
        size_vram: 3_169_761_361,
        size: 2_497_293_931,
        expires_at: "2026-08-27T16:23:55.130129+05:30",
      },
      { model: "qwen2.5-coder:1.5b", size_vram: 1_160_000_000 },
      { size_vram: 1 },
    ],
  };

  it("reads residency, preferring the in-memory size over the on-disk one", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(ok(psBody)),
    );
    const running = await listRunningOllamaModels({
      baseUrl: "http://localhost:11434/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl.mock.calls[0][0]).toBe("http://localhost:11434/api/ps");
    expect(running).toEqual([
      {
        name: "qwen3:4b",
        sizeBytes: 3_169_761_361,
        expiresAt: new Date("2026-08-27T16:23:55.130129+05:30"),
      },
      // No expiry reported is not an error — the row is still real memory.
      { name: "qwen2.5-coder:1.5b", sizeBytes: 1_160_000_000, expiresAt: null },
    ]);
  });

  it("reports an unreachable daemon as nothing resident, not an error", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("ECONNREFUSED")));
    await expect(
      listRunningOllamaModels({
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual([]);
  });
});

describe("unloadOllamaModel — ending a model's residency", () => {
  it("asks for an empty turn with keep_alive 0, which is what frees the memory", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(ok({ done_reason: "unload" })),
    );
    const freed = await unloadOllamaModel("qwen3:4b", {
      baseUrl: "http://localhost:11434",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(freed).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(JSON.parse((init as RequestInit | undefined)!.body as string)).toEqual({
      model: "qwen3:4b",
      messages: [],
      keep_alive: 0,
    });
  });

  it("reports failure rather than throwing at a dead daemon", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("ECONNREFUSED")));
    await expect(
      unloadOllamaModel("qwen3:4b", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBe(false);
  });
});
