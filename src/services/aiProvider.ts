// Provider resolution + a scripted mock provider for the NL→SQL tool-use loop.
//
// The loop (services/ai.ts) is written against the `AIProvider` interface and
// never against a concrete backend. The concrete backends plug in here: the
// warm in-browser WebLLM engine (zero egress), localhost Ollama, and the cloud
// edge router — resolved as a ladder, so a mode always gets the most private
// backend that can actually serve it right now.
import type {
  AIMode,
  AIProvider,
  ProviderMessage,
  ProviderTurn,
  AITool,
} from "../types";
import { createOllamaProvider, isOllamaEndpoint } from "./ollamaProvider";
import { createCloudProvider, type CloudProviderConfig } from "./cloudProvider";
import { createWebLLMProvider } from "./webllmProvider";
import { isWebLLMServing } from "./webllm";
import { useByokKeyStore } from "../stores/byokKey";
import { useVaultStore } from "../stores/vault";
import { useSettingsStore, type BYOKPreference } from "../stores/settings";

/**
 * Thrown by a cloud/edge provider when the shared free Workers-AI budget is
 * spent for the day (typed quota/pool-exhausted code) or the router's
 * kill-switch is flipped (typed 503, §23.5). Distinct from a transport failure
 * so the loop can render the specific "shared budget used / cloud features
 * paused" state (§11.2) instead of a generic "couldn't reach the provider."
 * The real cloud provider (build/09-edge/01-ai-router) throws it; the client
 * copy lives with the pipeline.
 */
export class ProviderQuotaExhaustedError extends Error {
  constructor(message = "The shared free AI budget is exhausted for today.") {
    super(message);
    this.name = "ProviderQuotaExhaustedError";
  }
}

/**
 * A provider that replays a fixed script of turns, one per `complete` call — the
 * mocked provider the per-stage loop tests drive (scripted wrong-then-right SQL).
 * Records the messages/tools it was handed so tests can assert the loop fed the
 * error trace and lint hints back on retry.
 */
export function createScriptedProvider(
  script: ProviderTurn[],
  id = "mock",
): AIProvider & {
  calls: Array<{ messages: ProviderMessage[]; tools: AITool[] }>;
} {
  let index = 0;
  const calls: Array<{ messages: ProviderMessage[]; tools: AITool[] }> = [];
  return {
    id,
    calls,
    complete(messages, tools, options) {
      if (options?.signal?.aborted)
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      calls.push({ messages: structuredClone(messages), tools });
      const turn = script[index];
      index += 1;
      if (turn === undefined) {
        return Promise.reject(
          new Error(
            "scripted provider exhausted: the loop asked for more turns than scripted",
          ),
        );
      }
      return Promise.resolve(turn);
    },
  };
}

/** Ladder inputs that default to live app state — injectable for tests. */
export interface ProviderContext {
  webllmReady?: boolean;
  /**
   * The API-mode key/endpoint field's raw value (null = not set). Its *shape*
   * decides routing (`isOllamaEndpoint`) — a URL vs. an opaque bearer key —
   * not just its presence, so tests inject the actual value, not a boolean.
   */
  byokValue?: string | null;
  /** The D3 routing toggle (settings store) — injectable for tests. */
  byokPreference?: BYOKPreference;
  /** Whether routing was ever explicitly chosen (settings store) — injectable for tests. */
  byokRoutingTouched?: boolean;
  /**
   * The D9 vault reference, when a key is remembered server-side (null = none).
   * Presence means the user brought their own provider just as a typed key does
   * — the raw key simply isn't in the browser to inspect.
   */
  vaultRef?: string | null;
}

/**
 * Resolve the provider for a mode — a ladder, most private serving rung first.
 *
 * - `local-only`: always null — the AI kill-switch (D2), even with a warm local
 *   engine. Deterministic templates own that path; the loop is never invoked.
 * - `local-model` (renamed-taxonomy narrowing, 2026-07-22, D2/D43): in-browser
 *   WebLLM only. A cold engine returns null — there is no Ollama fallback here
 *   any more; localhost Ollama moved to **API** mode, below.
 * - **API** mode (renamed from "Cloud AI"): warm in-browser WebLLM serves it
 *   with zero egress when the key/endpoint field is empty and no key is
 *   remembered in the vault (D9) — a remembered key is the same standing
 *   choice of provider as a typed one, so it opts out of the handoff too, and
 *   the caller sends its reference for the router to resolve server-side; the conversational
 *   handoff, the edge covering the model's download cold-start until the warm
 *   engine takes over. A field value opts out of the handoff (the user brought
 *   their own provider) and its *shape* picks the backend: a URL routes
 *   directly to a localhost Ollama provider (browser→localhost, never the
 *   Worker — same zero-egress shape as the old "Local model" Ollama path);
 *   anything else is a bearer key routed through the edge AI router (ceiling
 *   detection, free-tier→key overflow, stateless pass-through). The router
 *   needs a deployed endpoint: with a `cloudConfig.endpoint` the caller passes
 *   one and it runs; with none the result is null and the chat shows the
 *   honest "not connected yet" state — a supported outcome, not an error.
 *   A URL-shaped field also honors the D3 routing toggle (2026-07-23): an
 *   untouched or "prefer my key" state goes straight to Ollama, zero-egress;
 *   only an *explicitly* chosen "free tier first" tries the shared cloud
 *   budget first, returning Ollama as `overflowProvider` for the caller
 *   (services/ai.ts) to fall back to when the router's keyless quota/pool/
 *   paused response comes back — the edge Worker cannot reach the user's
 *   localhost, so this overflow can only be client-orchestrated.
 *
 * Returns `{ provider, overflowProvider? }` rather than a bare provider so a
 * caller can tell "this is the only backend" from "this is primary, with a
 * client-side fallback to try on quota exhaustion."
 */
export function resolveProvider(
  mode: AIMode,
  cloudConfig?: CloudProviderConfig,
  context: ProviderContext = {},
): { provider: AIProvider | null; overflowProvider?: AIProvider } {
  if (mode === "local-only") return { provider: null };
  const webllmReady = context.webllmReady ?? isWebLLMServing();

  if (mode === "local-model")
    return { provider: webllmReady ? createWebLLMProvider() : null };

  // mode === 'cloud' (labeled "API" in the UI).
  const byokValue = context.byokValue ?? useByokKeyStore.getState().key;
  const vaultRef = context.vaultRef ?? useVaultStore.getState().ref;
  if (webllmReady && byokValue === null && vaultRef === null)
    return { provider: createWebLLMProvider() };
  if (byokValue !== null && isOllamaEndpoint(byokValue)) {
    const ollama = createOllamaProvider({ baseUrl: byokValue });
    const byokPreference =
      context.byokPreference ?? useSettingsStore.getState().byokPreference;
    const byokRoutingTouched =
      context.byokRoutingTouched ??
      useSettingsStore.getState().byokRoutingTouched;
    if (
      byokRoutingTouched &&
      byokPreference === "free-tier-first" &&
      cloudConfig !== undefined
    ) {
      return {
        provider: createCloudProvider(cloudConfig),
        overflowProvider: ollama,
      };
    }
    return { provider: ollama };
  }
  if (cloudConfig !== undefined)
    return { provider: createCloudProvider(cloudConfig) };
  return { provider: null };
}
