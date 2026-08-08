// Three user-selectable AI modes (D2, §5.1) — all ship; first-run chooser, no silent default.
import type { ChartRecommendation } from "./chart";
import type { QueryResult } from "./query";
import type { LintFinding } from "../lib/sqlLint";
import type { NormalizationCorrection } from "../lib/inputNormalizer";

export type AIMode = "local-only" | "local-model" | "cloud";

/**
 * One execution of generated SQL inside a turn's tool-use loop (§11.1 stage 5).
 * Every attempt is recorded — the chat never runs hidden SQL — so the user can
 * reconstruct exactly what ran, how long it took, and why it was retried.
 */
export interface SqlAttempt {
  /** 1-based attempt number within the turn. */
  attempt: number;
  /**
   * The analyst-core operation this attempt ran (A4). `run_sql` is the model
   * writing a query; `read_result` is it paging a materialization it already
   * has, whose `sql` is the *originating* query, not a new one — the transcript
   * says which, because "suggested SQL · retry 2" over a page read would be a
   * lie about what happened.
   */
  op?: string;
  /** The exact SQL sent to the engine — the "suggested SQL" surfaced in the transcript. */
  sql: string;
  status: "ok" | "error";
  executionTimeMs: number;
  /** Present on success — the true row count (§ result cap reports the real total). */
  rowCount?: number;
  /** Present on failure — the engine error trace, fed back to the model for repair. */
  error?: string;
  /** Stage-4 dialect-lint findings for this SQL, if any (surfaced alongside the query). */
  lint?: LintFinding[];
  /**
   * True when this failed attempt's repair context included up to 3 sample data
   * rows alongside the error trace (§11.3 "data-sampled repair" — cloud mode
   * only, off by default; the metadata-only-repair setting gates it). The
   * transcript is the audit surface for the toggle's effect (06-ai/03).
   */
  sampledRows?: boolean;
}

export interface AITurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Assistant turns: the per-attempt SQL execution log (§11.1 transcript auditability). */
  attempts?: SqlAttempt[];
  /** Assistant turns: the chart to show — an explicit `create_chart` call when the model made one (A6), otherwise the stage-6 auto-chart of the final result set. */
  chart?: ChartRecommendation;
  /**
   * Assistant turns: the rows `chart` is drawn from, so the transcript renders
   * the chart itself rather than a label describing one. Held in memory with the
   * rest of the transcript and never persisted — it is dataset content (D41).
   */
  chartResult?: QueryResult;
  /** Assistant turns: stage-1 typo corrections applied to the user's question. */
  corrections?: NormalizationCorrection[];
  /** Assistant turns: a clean user-facing failure (timeout, retry cap, no provider). */
  error?: string;
  /** Assistant turns: `error` is specifically the shared free-budget-exhausted state (§11.2) — the chat can offer the local-model fallback inline. */
  quotaExhausted?: boolean;
  /** Assistant turns: this answer finished on the local-Ollama D3 overflow after the shared cloud budget ran out mid-turn (2026-07-23). */
  servedByOllamaOverflow?: boolean;
}

export interface AISession {
  mode: AIMode;
  /** D3 toggle: route to the user's own key first, or overflow to it after the free tier. */
  byokPreference: "prefer-key" | "free-tier-first";
  /** Against the per-session daily Workers-AI quota (§11.2). */
  turnsUsedToday: number;
  transcript: AITurn[];
}

// ── Provider abstraction (§11.1 stages 3–5) ────────────────────────────────
// The tool-use loop is written against this interface, never a concrete
// provider. The cloud edge router (build/09-edge/01-ai-router), BYOK
// (build/06-ai/02-modes-byok), and the WebLLM client (build/v0.25) each
// implement it; the pipeline itself stays provider-agnostic. ADR-007 owns
// routing/model/cost; this owns only the loop's request/response shape.

/** A tool the model may call. `inputSchema` is JSON Schema, validated by the provider's tool-calling. */
export interface AITool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** A model's request to call a tool. */
export interface ProviderToolCall {
  id: string;
  name: string;
  input: unknown;
}

/**
 * Conversation messages exchanged with a provider across the loop.
 *
 * The assistant variant carries **every** call the model emitted, in emitted
 * order, and the loop appends it verbatim before executing any of them — so the
 * conversation the model sees on the next round-trip contains exactly what it
 * said, followed by one correlated `tool` message per call.
 */
export type ProviderMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ProviderToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

/**
 * One provider round-trip.
 *
 * `calls` is an array because providers emit arrays — Ollama's `tool_calls`,
 * OpenAI's `tool_calls`, Gemini's `functionCall` parts. A singular field is what
 * silently discarded every call after the first (A4 defect iii), so the shape
 * makes that impossible rather than forbidding it by discipline.
 *
 * `text` is prose the model emitted **alongside** its calls; it is preserved and
 * execution continues. An **empty `calls` is what makes a turn terminal** — then
 * `text` is the answer. That is the only terminal condition, so a provider can
 * never end a turn by withholding tools.
 */
export interface ProviderTurn {
  text: string;
  calls: ProviderToolCall[];
}

export interface AIProvider {
  /** Stable id for the operator metrics / transcript ('mock', 'cloud-edge', 'byok-*', 'webllm'). */
  readonly id: string;
  /**
   * One round-trip: given the running conversation and the available tools,
   * return the model's next turn. Rejects on transport failure; honors
   * `signal` for the §21.6 provider-timeout path.
   */
  complete(
    messages: ProviderMessage[],
    tools: AITool[],
    options?: { signal?: AbortSignal },
  ): Promise<ProviderTurn>;
}
