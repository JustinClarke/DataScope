// The provider seam for the panel arm (11-gemini-comparison-arm.md, "What
// ships" §1): one interface every model call goes through, selected by
// EVAL_PROVIDER, rather than an `if (gemini)` fork through run.ts. `ollama` is
// the only registered entry until a later phase adds `geminiRig.ts` — this
// file is the registry, not a place to anticipate that provider's shape.
//
// The chat arm (runChat.ts) is a deliberately separate seam (existing
// `AIProvider` via `askAI`) — see the doc's "one env var, two seams" table.
// Collapsing the two is out of scope.
import { ollamaPanelRig } from '../ollamaRig';
import { geminiPanelRig } from '../geminiRig';
import type { PanelResponseSchema } from '../panelSchema';

export interface ModelCallResult {
  content: string;
  promptTokens: number;
  responseTokens: number;
  /** Gemini's `thoughtsTokenCount`; 0/undefined for non-thinking providers. */
  thinkingTokens?: number;
  /** Gemini's `cachedContentTokenCount` (implicit cache hits) — cost accounting only. */
  cachedTokens?: number;
}

export interface WarmUpResult {
  ok: boolean;
  elapsedMs: number;
  error?: string;
}

export interface PanelRig {
  id: string;
  model: string;
  /** NUM_CTX for ollama; the real limit elsewhere. */
  contextWindow: number;
  /** Pinned, never defaulted — see ollamaRig.ts's own note on why. */
  temperature: number;
  /** Whatever thinking-suppression setting is in effect, for RESULTS.json's
   * metadata — a string because the mechanism varies by provider/generation
   * (Gemini 2.5's numeric thinkingBudget vs. Gemini 3.x's thinkingLevel
   * string). Undefined for providers with no thinking phase. */
  thinkingConfig?: string;
  /** No-op (beyond precondition checks) for hosted providers; ollama's is the cold-load warm-up. */
  warmUp(): Promise<WarmUpResult>;
  /** `schema`, when given, is handed to the provider's structured-output param
   * — Gemini's `responseSchema`, Ollama's `format`, which take the same shape.
   * Both are wired as of session 4's RIG fix; before it, Ollama silently
   * dropped this argument and ran unconstrained (see ollamaRig.ts's `call`).
   * `parsePanelAnswer` stays the runtime authority regardless. */
  call(system: string, user: string, schema?: PanelResponseSchema): Promise<ModelCallResult>;
}

const REGISTRY: Record<string, PanelRig> = {
  ollama: ollamaPanelRig,
  gemini: geminiPanelRig,
};

export function resolvePanelRig(providerId: string): PanelRig {
  const rig = REGISTRY[providerId];
  if (!rig) throw new Error(`unknown EVAL_PROVIDER "${providerId}" (known: ${Object.keys(REGISTRY).join(', ')})`);
  return rig;
}
