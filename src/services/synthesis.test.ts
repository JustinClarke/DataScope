import { describe, it, expect, vi } from "vitest";
import { requestSynthesis, type SynthesisInput } from "./synthesis";
import type { SynthesisResponse } from "../../edge/protocol";
import type { FactRef, RankedAction, TableRegistryEntry } from "../types";

const headlineFact: FactRef = {
  statement: "1,200 orders across 2 columns.",
  sql: "",
  snapshot: "2026-07-21T00:00:00Z",
  confidence: "high",
  provenance: "schema",
};

const action: RankedAction = {
  verb: "Chart revenue over order_date",
  module: "charts",
  prefill: { module: "charts", prefilledConfig: { table: "orders" } },
  evidence: {
    ...headlineFact,
    statement: "revenue spans 900 distinct values.",
    provenance: "insight-rule",
  },
  score: 0.8,
};

const tables = [
  {
    id: "t1",
    tableName: "orders",
    rowCount: 1200,
    columns: [
      {
        name: "revenue",
        semanticType: "Quantitative",
        physicalType: "DOUBLE",
        nullPercentage: 0,
        cardinality: 900,
      },
    ],
  },
] as unknown as TableRegistryEntry[];

const baseline = { headlineFact, actions: [action] };

function input(overrides: Partial<SynthesisInput> = {}): SynthesisInput {
  return { aiMode: "cloud", sessionId: "s-1", tables, baseline, ...overrides };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("requestSynthesis — opt-in gate", () => {
  it("never calls the edge in local-only mode", async () => {
    const fetchImpl = vi.fn();
    const result = await requestSynthesis(input({ aiMode: "local-only" }), {
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.headlineFact).toEqual({
      value: headlineFact,
      source: "deterministic",
      degradeReason: "ai-off",
    });
  });

  it("never calls the edge before a first-run selection (aiMode null)", async () => {
    const fetchImpl = vi.fn();
    await requestSynthesis(input({ aiMode: null }), { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends structure only — no data rows in the outbound payload", async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const sent = JSON.parse((init as RequestInit).body as string);
      expect(sent.facts.tables[0].columns[0]).toEqual({
        name: "revenue",
        semanticType: "Quantitative",
        physicalType: "DOUBLE",
        nullPercentage: 0,
        cardinality: 900,
      });
      // Value fields (min/max/mean) never cross the wire.
      expect(sent.facts.tables[0].columns[0]).not.toHaveProperty("min");
      return jsonResponse({
        headlineFact,
        actions: [action],
      } satisfies SynthesisResponse);
    });
    await requestSynthesis(input(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("requestSynthesis — BYOK routing (D3/D9)", () => {
  it("cloud mode with a key sends the credential + routing; without one, neither field crosses", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url, init) => {
      bodies.push(JSON.parse((init as RequestInit).body as string));
      return jsonResponse({
        headlineFact,
        actions: [action],
      } satisfies SynthesisResponse);
    }) as unknown as typeof fetch;

    await requestSynthesis(
      input({ routing: "prefer-key", byokKey: "sk-user-key" }),
      { fetchImpl },
    );
    expect(bodies[0].routing).toBe("prefer-key");
    expect(bodies[0].byok).toEqual({ provider: "openai", key: "sk-user-key" });

    await requestSynthesis(input({ routing: "prefer-key", byokKey: null }), {
      fetchImpl,
    });
    expect(bodies[1]).not.toHaveProperty("byok");
  });

  it("local-model mode never sends the key — no request leaves the tab at all", async () => {
    // The key is a cloud-mode credential AND local-model's contract is zero
    // external egress — with a cold local engine the ladder degrades to the
    // deterministic baseline instead of falling to the edge.
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await requestSynthesis(
      input({ aiMode: "local-model", byokKey: "sk-user-key" }),
      { fetchImpl, isLocalReady: () => false },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.headlineFact).toEqual({
      value: headlineFact,
      source: "deterministic",
      degradeReason: "ai-uncached",
    });
  });

  it("a key opts out of the warm local rung — the user’s provider serves (mirrors the chat ladder)", async () => {
    const synthesizeLocal = vi.fn();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        headlineFact,
        actions: [action],
      } satisfies SynthesisResponse),
    ) as unknown as typeof fetch;
    await requestSynthesis(input({ byokKey: "sk-user-key" }), {
      fetchImpl,
      isLocalReady: () => true,
      synthesizeLocal,
    });
    expect(synthesizeLocal).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("requestSynthesis — validate then upgrade or degrade", () => {
  it("applies a re-phrased headline + re-ordered actions that pass the validators", async () => {
    const upgraded: SynthesisResponse = {
      headlineFact: {
        ...headlineFact,
        statement: "Your 1,200 orders, at a glance.",
      },
      actions: [{ ...action, verb: "Plot revenue by day" }],
    };
    const fetchImpl = vi.fn(async () => jsonResponse(upgraded));
    const result = await requestSynthesis(input(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.headlineFact.source).toBe("ai");
    expect(result.headlineFact.value.statement).toBe(
      "Your 1,200 orders, at a glance.",
    );
    // Non-prose fields are taken from the typed baseline, not the wire.
    expect(result.headlineFact.value.provenance).toBe("schema");
    expect(result.actions.source).toBe("ai");
    expect(result.actions.value[0].verb).toBe("Plot revenue by day");
    expect(result.actions.value[0].module).toBe("charts");
  });

  it("degrades the narration seam alone when the headline over-claims", async () => {
    const bad: SynthesisResponse = {
      headlineFact: { ...headlineFact, statement: "Orders always grow." },
      actions: [{ ...action, verb: "Plot revenue by day" }],
    };
    const result = await requestSynthesis(input(), {
      fetchImpl: (async () => jsonResponse(bad)) as unknown as typeof fetch,
    });
    expect(result.headlineFact).toEqual({
      value: headlineFact,
      source: "deterministic",
      degradeReason: "ai-rejected",
    });
    expect(result.actions.source).toBe("ai"); // the other seam still upgrades independently
  });

  it("degrades the ranking seam when an action is invented", async () => {
    const bad: SynthesisResponse = {
      headlineFact: { ...headlineFact, statement: "A calm 1,200 orders." },
      actions: [{ ...action, module: "sql" }],
    };
    const result = await requestSynthesis(input(), {
      fetchImpl: (async () => jsonResponse(bad)) as unknown as typeof fetch,
    });
    expect(result.actions).toEqual({
      value: [action],
      source: "deterministic",
      degradeReason: "ai-rejected",
    });
    expect(result.headlineFact.source).toBe("ai");
  });

  it("degrades both seams (ai-down) on a typed 503", async () => {
    const paused = () =>
      new Response(JSON.stringify({ error: "paused" }), { status: 503 });
    const result = await requestSynthesis(input(), {
      fetchImpl: (async () => paused()) as unknown as typeof fetch,
    });
    expect(result.headlineFact.degradeReason).toBe("ai-down");
    expect(result.actions.degradeReason).toBe("ai-down");
  });

  it("degrades (ai-down) when the network throws", async () => {
    const result = await requestSynthesis(input(), {
      fetchImpl: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    expect(result.headlineFact.degradeReason).toBe("ai-down");
  });
});

describe("requestSynthesis — the warm local rung", () => {
  it("serves from the local producer with zero egress — the edge is never called", async () => {
    const fetchImpl = vi.fn();
    const synthesizeLocal = vi.fn(async () => ({
      headlineFact: {
        ...headlineFact,
        statement: "Your 1,200 orders, at a glance.",
      },
      actions: [{ ...action, verb: "Plot revenue by day" }],
    }));
    const result = await requestSynthesis(input(), {
      fetchImpl,
      isLocalReady: () => true,
      synthesizeLocal,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(synthesizeLocal).toHaveBeenCalledOnce();
    expect(result.headlineFact.source).toBe("ai");
    expect(result.actions.value[0].verb).toBe("Plot revenue by day");
  });

  it("validates the local slice through the same seams — an over-claim degrades, never retries a claim", async () => {
    const fetchImpl = vi.fn();
    const result = await requestSynthesis(input(), {
      fetchImpl,
      isLocalReady: () => true,
      synthesizeLocal: async () => ({
        headlineFact: { ...headlineFact, statement: "Orders always grow." },
        actions: [{ ...action, verb: "Plot revenue by day" }],
      }),
    });
    expect(result.headlineFact).toEqual({
      value: headlineFact,
      source: "deterministic",
      degradeReason: "ai-rejected",
    });
    expect(result.actions.source).toBe("ai");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls to the edge rung when the local pass throws out of contract", async () => {
    const upgraded: SynthesisResponse = {
      headlineFact: { ...headlineFact, statement: "A calm 1,200 orders." },
      actions: [{ ...action, verb: "Plot revenue by day" }],
    };
    const fetchImpl = vi.fn(async () => jsonResponse(upgraded));
    const result = await requestSynthesis(input(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      isLocalReady: () => true,
      synthesizeLocal: async () => {
        throw new Error("actions are not a re-phrased permutation");
      },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.headlineFact.source).toBe("ai");
  });

  it("local-model serves from the warm local rung with zero egress", async () => {
    const upgraded: SynthesisResponse = {
      headlineFact: { ...headlineFact, statement: "A calm 1,200 orders." },
      actions: [{ ...action, verb: "Plot revenue by day" }],
    };
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await requestSynthesis(input({ aiMode: "local-model" }), {
      fetchImpl,
      isLocalReady: () => true,
      synthesizeLocal: async () => upgraded,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.headlineFact.source).toBe("ai");
  });

  it("local-model never falls to the edge — a throwing local pass degrades, zero egress", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await requestSynthesis(input({ aiMode: "local-model" }), {
      fetchImpl,
      isLocalReady: () => true,
      synthesizeLocal: async () => {
        throw new Error("actions are not a re-phrased permutation");
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.headlineFact).toEqual({
      value: headlineFact,
      source: "deterministic",
      degradeReason: "ai-uncached",
    });
  });

  it("local-only mode never reaches the local producer either — the kill-switch is total", async () => {
    const synthesizeLocal = vi.fn();
    await requestSynthesis(input({ aiMode: "local-only" }), {
      isLocalReady: () => true,
      synthesizeLocal,
    });
    expect(synthesizeLocal).not.toHaveBeenCalled();
  });
});
