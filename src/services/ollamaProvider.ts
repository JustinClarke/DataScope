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
// SQL instead). So, like the WebLLM provider, control flow stays deterministic:
// when the conversation needs SQL the request appends the SQL instruction and
// the reply's SQL is extracted and wrapped as an execute_local_sql call; when
// the last tool result carries rows the request appends the answer instruction
// and omits tools entirely, so the turn can only end as text. A structured
// tool_call is still honored when a larger, tool-tuned model does emit one.
import type { AIProvider, AITool, ProviderMessage, ProviderTurn } from '../types';
import { ANSWER_INSTRUCTION, SQL_INSTRUCTION, extractSql, lastToolResultIsRows } from './webllmProvider';

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
        return m.toolCall
          ? {
              role: 'assistant',
              content: m.content,
              tool_calls: [{ function: { name: m.toolCall.name, arguments: (m.toolCall.input ?? {}) as Record<string, unknown> } }],
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

  return {
    id: 'ollama',
    async complete(messages, tools, opts): Promise<ProviderTurn> {
      const sqlTool = tools.find((t) => t.name === 'execute_local_sql');
      // Rows are in (or there is no SQL tool): the only valid next turn is a
      // plain-language answer — omit tools so the model cannot be offered a call.
      const answerMode = sqlTool === undefined || lastToolResultIsRows(messages);
      const res = await doFetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            ...toOllamaMessages(messages),
            { role: 'user', content: answerMode ? ANSWER_INSTRUCTION : SQL_INSTRUCTION },
          ],
          ...(answerMode ? {} : { tools: toOllamaTools(tools) }),
          stream: false,
        }),
        signal: opts?.signal,
      });
      if (!res.ok) {
        throw new Error(`Ollama request failed (${res.status}). Is the model "${model}" pulled and the daemon running?`);
      }
      const data = (await res.json()) as OllamaChatResponse;
      const call = data.message?.tool_calls?.[0];
      if (!answerMode && call) {
        return { kind: 'tool_call', call: { id: crypto.randomUUID(), name: call.function.name, input: call.function.arguments } };
      }
      const content = data.message?.content ?? '';
      if (!answerMode && sqlTool !== undefined) {
        const sql = extractSql(content);
        if (sql !== null) {
          return { kind: 'tool_call', call: { id: crypto.randomUUID(), name: sqlTool.name, input: { sql } } };
        }
      }
      // Prose without SQL: the model answered (or declined) — surface it as text.
      return { kind: 'text', text: content.trim() };
    },
  };
}
