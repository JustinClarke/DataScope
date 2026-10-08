// Ollama AIProvider: a localhost Ollama endpoint, reached through **API** mode's
// key/endpoint field (D2/D43; renamed from "Cloud AI" and re-pointed off "Local
// model" 2026-07-22 — the field auto-detects a URL and treats it as an Ollama
// base endpoint, never a bearer key). This is the honestly-specced local path
// that needs no backend of ours — the user runs Ollama on their own machine, so
// the NL→SQL tool-use loop (services/ai.ts) runs entirely locally with zero
// external egress, direct browser→localhost, never through the edge Worker. It
// speaks Ollama's /api/chat shape and maps it onto the provider-agnostic
// `AIProvider` contract the loop is written against; the loop, lint, and retry
// cap are unchanged. In-browser WebLLM is "Local model" mode's own path.
//
// The pinned small coder replies in text — probed live, it never emits Ollama's
// structured tool_calls (it writes the call as prose, a JSON blob, or fenced
// SQL instead). A larger, tool-tuned model on the same endpoint does emit them,
// and the two need opposite treatment, so which one is talking is **measured
// per instance rather than assumed** (A4 defect ii): the capability probe
// latches the first structured call, after which tools stay attached, nothing
// is appended, and the model drives itself. Until then the request walks the
// shared ladder in `toolLadder.ts`, which — unlike the rule this replaced —
// leaves a rung for a second query.
import type {
  AIProvider,
  AITool,
  ProviderMessage,
  ProviderToolCall,
  ProviderTurn,
} from "../types";
import {
  SQL_TOOL,
  UNAVAILABLE_TOOL_MESSAGE,
  createCapabilityProbe,
  extractSql,
  extractTextToolCall,
  ladderRung,
  stripThink,
  withRungInstruction,
} from "./toolLadder";

/** Default localhost Ollama endpoint (the daemon's standard port). */
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
/** A small coder model that fits the local honesty guardrail (D43/ADR-007). */
export const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:1.5b";

/**
 * Generation defaults, all three overridable per call so the user decides.
 *
 * These are defaults rather than fixed values because the right setting depends
 * on the model behind the endpoint, which only the user knows. Measured on an
 * 8 GB M1 against the material master extract, one prompt, cold then warm:
 *
 *   qwen3.5:4b  think on   > 120 s   — every question hit the 30 s turn timeout
 *   qwen3.5:4b  think off    7.8 s cold, 1.7 s warm
 *   qwen2.5-coder:1.5b        1.9 s cold, 0.9 s warm
 *
 * `think` defaults off because a hybrid-reasoning model left thinking makes
 * every turn time out on hardware this size, and the reasoning trace is
 * discarded here anyway — only the tool call and the SQL are read.
 *
 * Whether a model *honours* think-off is the model's call, not ours, and it
 * varies within one family — re-measured 2026-08-27 on Ollama 0.32.1, same
 * machine, same one-table prompt with `run_sql` attached:
 *
 *   qwen3.5:4b          think off  819 tok/67.6 s -> 8 tok/1.1 s   honoured
 *   qwen2.5-coder:1.5b  think off  8 tok/2.2 s                     honoured
 *   qwen3:4b            think off  595 tok either way              IGNORED
 *
 * qwen3:4b reasons regardless and, asked not to, writes the reasoning into
 * `content` instead of the separate `thinking` field — so think-off costs it
 * a clean answer and buys no speed. At ~29 s/turn against a 30 s budget it is
 * not a usable model here whatever this flag says; that is a property of the
 * model, not something this provider can flag away.
 *
 * `temperature` defaults to 0 because this provider writes SQL, and a question
 * asked twice should produce the same query. Ollama's own default is 0.8, which
 * makes any eval number a sample rather than a measurement.
 *
 * `keepAlive` defaults to 30m because a cold load on a memory-constrained
 * machine is most of the latency: the same model is 4x faster once resident.
 */
export const DEFAULT_OLLAMA_THINK = false;
export const DEFAULT_OLLAMA_TEMPERATURE = 0;
export const DEFAULT_OLLAMA_KEEP_ALIVE = "30m";

/**
 * API mode's key/endpoint field auto-detects its own shape (D9, 2026-07-22): a
 * value that parses as a URL is a local Ollama base endpoint, not a bearer key.
 * Rejected alternative: an explicit provider-type selector — one field over a
 * cleaner data model, per the human's own call.
 */
export function isOllamaEndpoint(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** One model the daemon has pulled, as reported by `/api/tags`. */
export interface OllamaModelInfo {
  name: string;
  sizeBytes: number;
}

/**
 * Ask an Ollama daemon which models it actually has pulled, so the user picks
 * from a list instead of typing a name and finding out it was wrong on the next
 * question. Same origin the chat calls already reach, so it needs no additional
 * permission the endpoint hasn't already granted.
 *
 * Returns [] rather than throwing when the daemon is unreachable or answers
 * with something unexpected: a missing list means "offer the free-text field
 * instead", which is a UI state, not an error the user needs handed to them.
 */
export async function listOllamaModels(
  options: {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<OllamaModelInfo[]> {
  const baseUrl = (options.baseUrl ?? DEFAULT_OLLAMA_URL).replace(/\/$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${baseUrl}/api/tags`, { signal: options.signal });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      models?: { name?: string; model?: string; size?: number }[];
    };
    return (body.models ?? [])
      .map((m) => ({ name: m.name ?? m.model ?? "", sizeBytes: m.size ?? 0 }))
      .filter((m) => m.name !== "")
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** One model the daemon currently holds in memory, as reported by `/api/ps`. */
export interface OllamaRunningModel {
  name: string;
  /** Resident size. This is the number the user is actually trying to reclaim. */
  sizeBytes: number;
  /** When the daemon will unload it on its own — null when it reports no expiry. */
  expiresAt: Date | null;
}

/**
 * What the daemon is holding in memory right now.
 *
 * Closing the browser tab does not touch any of this: Ollama is a separate
 * daemon, and it keeps a model resident for the request's `keep_alive` (this
 * provider asks for 30m) whether or not anything is still talking to it. On a
 * memory-constrained machine that is the difference between a laptop that is
 * usable after you close the tab and one that is not, so it is worth showing.
 *
 * Returns [] on an unreachable daemon, like `listOllamaModels` — "nothing to
 * show" is a UI state, not an error to hand the user.
 */
export async function listRunningOllamaModels(
  options: {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<OllamaRunningModel[]> {
  const baseUrl = (options.baseUrl ?? DEFAULT_OLLAMA_URL).replace(/\/$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${baseUrl}/api/ps`, { signal: options.signal });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      models?: {
        name?: string;
        model?: string;
        size_vram?: number;
        size?: number;
        expires_at?: string;
      }[];
    };
    return (body.models ?? [])
      .map((m) => {
        const expiry = m.expires_at === undefined ? null : new Date(m.expires_at);
        return {
          name: m.name ?? m.model ?? "",
          // `size_vram` is what it occupies now; `size` is the on-disk figure.
          sizeBytes: m.size_vram ?? m.size ?? 0,
          expiresAt:
            expiry !== null && !Number.isNaN(expiry.getTime()) ? expiry : null,
        };
      })
      .filter((m) => m.name !== "");
  } catch {
    return [];
  }
}

/**
 * Drop one model out of memory now, instead of waiting out its `keep_alive`.
 *
 * This is the whole of what a web page may do to a local daemon, and it is
 * worth being exact about: Ollama exposes **no shutdown endpoint** — a browser
 * cannot stop `ollama serve`, and nothing here pretends to. What it can do is
 * end the model's residency, which is the memory anyone actually wants back.
 * The daemon stays up and will reload the model on the next question.
 *
 * The mechanism is a chat call with no messages and `keep_alive: 0`, which the
 * daemon answers with `done_reason: "unload"`. Verified against Ollama 0.32.1.
 */
export async function unloadOllamaModel(
  model: string,
  options: { baseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  const baseUrl = (options.baseUrl ?? DEFAULT_OLLAMA_URL).replace(/\/$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [], keep_alive: 0 }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Ollama's /api/chat wire shapes — only the fields the loop uses.
interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
}
interface OllamaChatResponse {
  message?: OllamaMessage;
}

function toOllamaMessages(messages: ProviderMessage[]): OllamaMessage[] {
  return messages.map((m): OllamaMessage => {
    switch (m.role) {
      case "assistant":
        // Every call, in emitted order — the history the model gets back has to
        // match what it actually asked for (A4 defect iii).
        return m.toolCalls !== undefined && m.toolCalls.length > 0
          ? {
              role: "assistant",
              content: m.content,
              tool_calls: m.toolCalls.map((call) => ({
                function: {
                  name: call.name,
                  arguments: (call.input ?? {}) as Record<string, unknown>,
                },
              })),
            }
          : { role: "assistant", content: m.content };
      case "tool":
        // Ollama identifies a tool result by position, not id — the id is dropped.
        return { role: "tool", content: m.content };
      default:
        return { role: m.role, content: m.content };
    }
  });
}

function toOllamaTools(tools: AITool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

/**
 * Build a local-model provider bound to an Ollama endpoint. `baseUrl` and
 * `model` default to a localhost daemon and a small coder; both are overridable
 * so a test (or a settings-driven model picker) can inject them.
 */
export function createOllamaProvider(
  options: {
    baseUrl?: string;
    model?: string;
    /** Hybrid-reasoning models only; see `think` handling in the body. */
    think?: boolean;
    temperature?: number;
    /** How long the daemon keeps the model resident after a call. */
    keepAlive?: string;
    fetchImpl?: typeof fetch;
  } = {},
): AIProvider {
  const baseUrl = (options.baseUrl ?? DEFAULT_OLLAMA_URL).replace(/\/$/, "");
  const model = options.model ?? DEFAULT_OLLAMA_MODEL;
  const think = options.think ?? DEFAULT_OLLAMA_THINK;
  const temperature = options.temperature ?? DEFAULT_OLLAMA_TEMPERATURE;
  const keepAlive = options.keepAlive ?? DEFAULT_OLLAMA_KEEP_ALIVE;
  const doFetch = options.fetchImpl ?? fetch;

  // Per instance, and an instance is per turn — so a tool-tuned model reveals
  // itself on the first round-trip and a small one is never wrongly latched.
  const probe = createCapabilityProbe();

  return {
    id: "ollama",
    async complete(messages, tools, opts): Promise<ProviderTurn> {
      const sqlTool = tools.find((t) => t.name === SQL_TOOL);
      // A model that drives itself gets the tools and no coaching. One that does
      // not gets the ladder's rung — and tools alongside it on every rung that
      // could carry a call, which is how it gets the chance to prove otherwise.
      const rung = probe.structured
        ? null
        : ladderRung(messages, sqlTool !== undefined);
      const offerTools = tools.length > 0 && rung !== "answer";

      const res = await doFetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages: withRungInstruction(toOllamaMessages(messages), rung),
          ...(offerTools ? { tools: toOllamaTools(tools) } : {}),
          stream: false,
          // Think-on is the *absence* of the flag, never `think: true`. Ollama
          // 0.32.1 rejects an explicit true outright on a model without the
          // capability — `"qwen2.5-coder:1.5b" does not support thinking`, a
          // 400 that fails the whole turn — whereas omitting it leaves a
          // reasoning model reasoning and a plain one unbothered. Think-off
          // still has to be sent: it is what collapses qwen3.5:4b from 67 s
          // to 1 s. So the flag only ever goes on the wire as `false`.
          ...(think ? {} : { think: false }),
          keep_alive: keepAlive,
          options: { temperature },
        }),
        signal: opts?.signal,
      });
      if (!res.ok) {
        throw new Error(
          `Ollama request failed (${res.status}). Is the model "${model}" pulled and the daemon running?`,
        );
      }
      const data = (await res.json()) as OllamaChatResponse;
      const content = data.message?.content ?? "";

      const structured = (data.message?.tool_calls ?? []).map(
        (call): ProviderToolCall => ({
          id: crypto.randomUUID(),
          name: call.function.name,
          input: call.function.arguments,
        }),
      );
      probe.observe(structured.length);
      if (structured.length > 0)
        return { text: content.trim(), calls: structured };

      // A call written into the message body rather than emitted through the
      // tool-call channel — routine for small models. Honour it when it names a
      // tool actually on offer; either way the JSON never reaches the user,
      // because raw tool-call syntax is not an answer to anyone's question.
      const emitted = extractTextToolCall(content);
      if (emitted !== null) {
        const visible = stripThink(content).replace(emitted.raw, "").trim();
        const offered = offerTools
          ? tools.find((t) => t.name === emitted.name)
          : undefined;
        if (offered !== undefined) {
          return {
            text: visible,
            calls: [
              {
                id: crypto.randomUUID(),
                name: offered.name,
                input: emitted.input,
              },
            ],
          };
        }
        // It asked for something that isn't there (a hallucinated tool, or one
        // withheld on this rung). Say so plainly instead of printing JSON.
        return {
          text: visible === "" ? UNAVAILABLE_TOOL_MESSAGE : visible,
          calls: [],
        };
      }

      // No structured calls: on a rung that asked for SQL, extracted SQL is the
      // call. Prose without SQL means the model answered (or declined) — that is
      // the turn's terminal state, and the only one.
      const sql =
        rung === null || rung === "answer" || sqlTool === undefined
          ? null
          : extractSql(content);
      if (sql !== null) {
        return {
          text: content.trim(),
          calls: [
            { id: crypto.randomUUID(), name: sqlTool!.name, input: { sql } },
          ],
        };
      }
      return { text: content.trim(), calls: [] };
    },
  };
}
