// The client side of the synthesis upgrade — the D56 "tailored this view"
// upgrade over the deterministic Verdict. It runs only when the user opted into
// a cloud/edge mode; local-only never reaches it, and no first-run selection
// leaves the Blueprint fully deterministic. It fires after the deterministic
// paint, and its result only ever *replaces in place* — the two seam validators
// are the trust boundary, so a malformed, over-claiming, or altered response
// degrades silently back to the baseline the user already sees.
//
// Two producers, one ladder: once the in-browser model is warm it serves the
// same slice locally with zero egress (no request leaves the tab); before that
// — or if the local pass throws — the edge Worker serves it. Both flow through
// the same validators; the last rung is always the deterministic baseline.
import type { AIMode, FactRef, RankedAction } from "../types";
import type { ProducerResult, ProducerDegradeReason } from "../types/producers";
import type { TableRegistryEntry } from "../types";
import type {
  RoutingMode,
  SynthesisRequest,
  SynthesisResponse,
  SynthesisError,
} from "../../edge/protocol";
import { buildStructuralFacts } from "../lib/structuralFacts";
import {
  rankedActionValidator,
  narrationValidator,
} from "../lib/producerValidators";
import { isWebLLMServing } from "./webllm";
import { synthesizeLocally } from "./webllmSynthesis";

export interface SynthesisInput {
  aiMode: AIMode | null;
  /** Opaque, content-free per-session id — keys the edge limiter only. */
  sessionId: string;
  tables: TableRegistryEntry[];
  baseline: { headlineFact: FactRef; actions: RankedAction[] };
  /** The D3 routing toggle; only meaningful in cloud mode. Defaults to free-tier-first. */
  routing?: RoutingMode;
  /** The user's raw BYOK key (memory-only store). Rides the request as the same
   * stateless pass-through the chat path uses (D9) — cloud mode only. */
  byokKey?: string | null;
}

export interface SynthesisDeps {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
  /** The local rung, injectable for tests. Defaults to the warm WebLLM engine. */
  isLocalReady?: () => boolean;
  synthesizeLocal?: (request: SynthesisRequest) => Promise<SynthesisResponse>;
}

/** The deployed synthesis endpoint (same Worker as the ai-router, sibling path). */
const DEFAULT_ENDPOINT = (import.meta.env?.VITE_EDGE_SYNTHESIS ??
  "https://datascope-edge-staging.justinclarke.workers.dev/synthesis") as string;

/** Both seams, resolved independently — either may upgrade or degrade on its own. */
export interface SynthesisUpgrade {
  headlineFact: ProducerResult<FactRef>;
  actions: ProducerResult<RankedAction[]>;
  /** True when the edge declined with its typed kill-switch code — the operator paused cloud features. */
  paused?: boolean;
}

function degrade(
  baseline: SynthesisInput["baseline"],
  reason: ProducerDegradeReason,
): SynthesisUpgrade {
  return {
    headlineFact: {
      value: baseline.headlineFact,
      source: "deterministic",
      degradeReason: reason,
    },
    actions: {
      value: baseline.actions,
      source: "deterministic",
      degradeReason: reason,
    },
  };
}

/** Synthesis is an AI-mode feature; local-only and "not chosen yet" never produce
 * an AI slice (D2/D46). Local-model opts in for the zero-egress local rung only —
 * the edge rung is cloud mode's (the mode-gate below the local rung). */
function isOptedIn(mode: AIMode | null): boolean {
  return mode === "cloud" || mode === "local-model";
}

/**
 * A stable key over the fields the action re-ranker may not change — the same
 * identity the validator enforces. Used to pair a validated candidate action
 * back to its typed baseline, so the upgraded list carries the baseline's typed
 * fields and only the model's re-phrased verb + new order.
 */
function identityOf(a: {
  module: string;
  tab?: string;
  prefill: unknown;
  evidence: unknown;
  score: number;
}): string {
  return JSON.stringify({
    module: a.module,
    tab: a.tab ?? null,
    prefill: a.prefill,
    evidence: a.evidence,
    score: a.score,
  });
}

/** Rebuild the AI-ordered list from typed baseline actions (validator has already proved set-identity). */
function applyRanking(
  baseline: RankedAction[],
  candidate: SynthesisResponse["actions"],
): RankedAction[] {
  const pool = new Map<string, RankedAction[]>();
  for (const action of baseline) {
    const key = identityOf(action);
    (pool.get(key) ?? pool.set(key, []).get(key)!).push(action);
  }
  return candidate.map((c) => {
    const match = pool.get(identityOf(c))!.shift()!;
    return { ...match, verb: c.verb };
  });
}

/** Validate a candidate slice per seam and assemble the upgrade — same trust
 * boundary whichever producer (local or edge) emitted the candidate. */
function validateSlice(
  baseline: SynthesisInput["baseline"],
  slice: SynthesisResponse,
): SynthesisUpgrade {
  const headlineOk = narrationValidator(
    baseline.headlineFact,
    slice.headlineFact as FactRef,
  );
  const actionsOk = rankedActionValidator(
    baseline.actions,
    slice.actions as RankedAction[],
  );

  return {
    headlineFact: headlineOk
      ? {
          value: {
            ...baseline.headlineFact,
            statement: slice.headlineFact.statement,
          },
          source: "ai",
        }
      : {
          value: baseline.headlineFact,
          source: "deterministic",
          degradeReason: "ai-rejected",
        },
    actions: actionsOk
      ? { value: applyRanking(baseline.actions, slice.actions), source: "ai" }
      : {
          value: baseline.actions,
          source: "deterministic",
          degradeReason: "ai-rejected",
        },
  };
}

export async function requestSynthesis(
  input: SynthesisInput,
  deps: SynthesisDeps = {},
): Promise<SynthesisUpgrade> {
  const { aiMode, sessionId, tables, baseline } = input;
  if (!isOptedIn(aiMode)) return degrade(baseline, "ai-off");

  // The key is a cloud-mode credential: only cloud requests carry it (the key
  // form only exists in cloud settings), and the router only sees what a mode
  // the user chose actually needs.
  const byokKey =
    aiMode === "cloud" && typeof input.byokKey === "string"
      ? input.byokKey
      : null;

  const request: SynthesisRequest = {
    sessionId,
    facts: buildStructuralFacts(tables),
    baseline: {
      headlineFact: baseline.headlineFact,
      actions: baseline.actions,
    },
    routing: byokKey !== null ? input.routing : undefined,
    byok: byokKey !== null ? { provider: "openai", key: byokKey } : undefined,
  };

  // Rung 1 — the warm in-browser model, zero egress: nothing leaves the tab.
  // An out-of-contract local answer throws and falls to the edge rung; a
  // validator rejection degrades to the baseline (never a retried claim).
  // A user-supplied BYOK key opts out of the local rung, mirroring the chat
  // ladder: they brought their own provider, so it serves.
  const isLocalReady = deps.isLocalReady ?? isWebLLMServing;
  if (input.byokKey == null && isLocalReady()) {
    try {
      const slice = await (deps.synthesizeLocal ?? synthesizeLocally)(request);
      return validateSlice(baseline, slice);
    } catch {
      // Fall through to the edge rung (cloud mode only, below).
    }
  }

  // Local-model's network contract is zero external egress (§5.1): its only AI
  // rung is the warm in-browser engine. Cold (or failed) local synthesis
  // degrades to the deterministic baseline — never to the edge.
  if (aiMode !== "cloud") return degrade(baseline, "ai-uncached");

  // Rung 2 — the edge Worker.
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const endpoint = deps.endpoint ?? DEFAULT_ENDPOINT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 8_000);

  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Typed 429/503 (limiter/kill-switch) — the edge is up but declining. Down
      // for the user's purposes; the deterministic Verdict is unaffected. The
      // kill-switch code is surfaced so the Blueprint can say "paused" honestly
      // instead of nothing.
      const err = await (res.json() as Promise<SynthesisError>).catch(
        () => null,
      );
      return {
        ...degrade(baseline, "ai-down"),
        paused: err?.error === "paused",
      };
    }
    const slice = (await res.json()) as SynthesisResponse;
    return validateSlice(baseline, slice);
  } catch {
    // Transport failure, wifi off, or the request timed out.
    return degrade(baseline, "ai-down");
  } finally {
    clearTimeout(timer);
  }
}
