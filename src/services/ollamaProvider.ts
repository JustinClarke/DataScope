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
import type { AIProvider, AITool, ProviderMessage, ProviderToolCall, ProviderTurn } from '../types';
import { RUNG_INSTRUCTION, SQL_TOOL, createCapabilityProbe, extractSql, ladderRung } from './toolLadder';

/** Default localhost Ollama endpoint (the daemon's standard port). */
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
/** A small coder model that fits the local honesty guardrail (D43/ADR-007). */
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5-coder:1.5b';

/**
 * API mode's key/endpoint field auto-detects its own shape (D9, 2026-07-22): a
 * value that parses as a URL is a local Ollama base endpoint, not a bearer key.
 * Rejected alternative: an explicit provider-type selector — one field over a
 * cleaner data model, per the human's own call.
 */
export function isOllamaEndpoint(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Ollama's /api/chat wire shapes — only the fields the loop uses.
interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}
interface OllamaChatResponse {
  message?: OllamaMessage;
}

function toOllamaMessages(messages: ProviderMessage[]): OllamaMessage[] {
  return messages.map((m): OllamaMessage => {
    switch (m.role) {
      case 'assistant':
        // Every call, in emitted order — the history the model gets back has to
        // match what it actually asked for (A4 defect iii).
        return m.toolCalls !== undefined && m.toolCalls.length > 0
          ? {
              role: 'assistant',
              content: m.content,
              tool_calls: m.toolCalls.map((call) => ({
                function: { name: call.name, arguments: (call.input ?? {}) as Record<string, unknown> },
              })),
            }
          : { role: 'assistant', content: m.content };
      case 'tool':
        // Ollama identifies a tool result by position, not id — the id is dropped.
        return { role: 'tool', content: m.content };
      default:
        return { role: m.role, content: m.content };
    }
  });
}

function toOllamaTools(tools: AITool[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

/**
 * Build a local-model provider bound to an Ollama endpoint. `baseUrl` and
 * `model` default to a localhost daemon and a small coder; both are overridable
 * so a test (or a settings-driven model picker) can inject them.
 */
export function createOllamaProvider(
  options: { baseUrl?: string; model?: string; fetchImpl?: typeof fetch } = {},
): AIProvider {
  const baseUrl = (options.baseUrl ?? DEFAULT_OLLAMA_URL).replace(/\/$/, '');
  const model = options.model ?? DEFAULT_OLLAMA_MODEL;
  const doFetch = options.fetchImpl ?? fetch;

  // Per instance, and an instance is per turn — so a tool-tuned model reveals
  // itself on the first round-trip and a small one is never wrongly latched.
  const probe = createCapabilityProbe();

  return {
    id: 'ollama',
    async complete(messages, tools, opts): Promise<ProviderTurn> {
      const sqlTool = tools.find((t) => t.name === SQL_TOOL);
      // A model that drives itself gets the tools and no coaching. One that does
      // not gets the ladder's rung — and tools alongside it on every rung that
      // could carry a call, which is how it gets the chance to prove otherwise.
      const rung = probe.structured ? null : ladderRung(messages, sqlTool !== undefined);
      const offerTools = tools.length > 0 && rung !== 'answer';

      const res = await doFetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            ...toOllamaMessages(messages),
            ...(rung === null ? [] : [{ role: 'user', content: RUNG_INSTRUCTION[rung] }]),
          ],
          ...(offerTools ? { tools: toOllamaTools(tools) } : {}),
          stream: false,
        }),
        signal: opts?.signal,
      });
      if (!res.ok) {
        throw new Error(`Ollama request failed (${res.status}). Is the model "${model}" pulled and the daemon running?`);
      }
      const data = (await res.json()) as OllamaChatResponse;
      const content = data.message?.content ?? '';

      const structured = (data.message?.tool_calls ?? []).map(
        (call): ProviderToolCall => ({ id: crypto.randomUUID(), name: call.function.name, input: call.function.arguments }),
      );
      probe.observe(structured.length);
      if (structured.length > 0) return { text: content.trim(), calls: structured };

      // No structured calls: on a rung that asked for SQL, extracted SQL is the
      // call. Prose without SQL means the model answered (or declined) — that is
      // the turn's terminal state, and the only one.
      const sql = rung === null || rung === 'answer' || sqlTool === undefined ? null : extractSql(content);
      if (sql !== null) {
        return { text: content.trim(), calls: [{ id: crypto.randomUUID(), name: sqlTool!.name, input: { sql } }] };
      }
      return { text: content.trim(), calls: [] };
    },
  };
}
