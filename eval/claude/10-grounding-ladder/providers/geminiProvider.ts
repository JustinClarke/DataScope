// Phase 4's chat-arm provider (11-gemini-comparison-arm.md, "What ships" §6) —
// eval-scoped, **not** `src/services/`, per the doc's scope decision. Implements
// the product's own `AIProvider` contract (`ProviderMessage[]` → `contents`,
// `AITool[]` → `functionDeclarations`, returning `ProviderTurn`), the same
// interface `askAI` is written against, so `runChat.ts` swaps providers by
// construction rather than by a second driving loop.
//
// Unlike `ollamaProvider.ts` (and `webllmProvider.ts`), which append an explicit
// SQL/answer instruction because their models don't reliably emit a structured
// tool call from the tool definitions alone, Gemini has real function calling —
// this mirrors `cloudProvider.ts`'s directness instead: tools are always passed,
// and the model's own `functionCall` part (not a regex over prose) is what
// produces a `tool_call` turn. Verify this holds on contact with the live API
// (doc's own Phase 4 checklist item) rather than assuming it.
import type { AIProvider, AITool, ProviderMessage, ProviderTurn } from '../../../../src/types';
import { GEMINI_MODEL, GEMINI_TEMPERATURE, GEMINI_THINKING_LEVEL, requireApiKey } from '../geminiRig';

const GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_RETRIES = 5;

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}
interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  usageMetadata?: GeminiUsageMetadata;
}

/** `tool` messages carry a `toolCallId`, not a function name — Gemini's
 * `functionResponse` is matched by name, not id (the same simplification
 * `ollamaProvider.ts` makes), so the name is threaded from the assistant
 * message that made the call. */
function toGeminiContents(messages: ProviderMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  let lastCallName = 'unknown';
  for (const m of messages) {
    switch (m.role) {
      case 'system':
        continue; // handled separately as systemInstruction
      case 'user':
        contents.push({ role: 'user', parts: [{ text: m.content }] });
        break;
      case 'assistant':
        if (m.toolCalls !== undefined && m.toolCalls.length > 0) {
          lastCallName = m.toolCalls[m.toolCalls.length - 1].name;
          contents.push({
            role: 'model',
            parts: m.toolCalls.map((call) => ({
              functionCall: { name: call.name, args: (call.input ?? {}) as Record<string, unknown> },
            })),
          });
        } else {
          contents.push({ role: 'model', parts: [{ text: m.content }] });
        }
        break;
      case 'tool':
        contents.push({ role: 'user', parts: [{ functionResponse: { name: lastCallName, response: { result: m.content } } }] });
        break;
    }
  }
  return contents;
}

function toGeminiTools(tools: AITool[]): Array<{ functionDeclarations: unknown[] }> | undefined {
  if (tools.length === 0) return undefined;
  return [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })) }];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry-with-backoff, same policy as `geminiRig.ts`'s panel-arm call — kept
 * self-contained here rather than shared, matching the existing precedent
 * that the panel rig and the chat provider are separate implementations
 * (doc: "one env var, two seams — do not try to unify them"). */
async function fetchWithRetry(doFetch: typeof fetch, apiKey: string, body: unknown, signal?: AbortSignal): Promise<GeminiResponse> {
  for (let attempt = 0; ; attempt++) {
    const res = await doFetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal,
    });
    if (res.ok) return (await res.json()) as GeminiResponse;
    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
      const backoffMs = 1000 * 2 ** attempt;
      console.error(`  [gemini http ${res.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${backoffMs}ms]`);
      await sleep(backoffMs);
      continue;
    }
    throw new Error(`gemini http ${res.status}: ${await res.text()}`);
  }
}

/**
 * Build a chat-arm Gemini provider. `onUsage` reports each call's real
 * `promptTokenCount`/`candidatesTokenCount` back to the caller — `AIProvider`'s
 * `complete()` return shape has no room for usage metadata, so `runChat.ts`
 * reads it the same way it reads Ollama's via `rigFetch`'s response
 * interception, just through a callback instead of a wire-level wrapper.
 */
export function createGeminiProvider(
  options: { fetchImpl?: typeof fetch; onUsage?: (usage: { promptTokens: number; responseTokens: number }) => void } = {},
): AIProvider {
  const doFetch = options.fetchImpl ?? fetch;

  return {
    id: 'gemini',
    async complete(messages: ProviderMessage[], tools: AITool[], opts): Promise<ProviderTurn> {
      const apiKey = requireApiKey();
      const systemMessage = messages.find((m) => m.role === 'system');
      const body: Record<string, unknown> = {
        contents: toGeminiContents(messages),
        generationConfig: {
          temperature: GEMINI_TEMPERATURE,
          thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL },
        },
      };
      if (systemMessage) body.systemInstruction = { parts: [{ text: systemMessage.content }] };
      const geminiTools = toGeminiTools(tools);
      if (geminiTools) body.tools = geminiTools;

      const data = await fetchWithRetry(doFetch, apiKey, body, opts?.signal);
      options.onUsage?.({
        promptTokens: data.usageMetadata?.promptTokenCount ?? -1,
        responseTokens: data.usageMetadata?.candidatesTokenCount ?? -1,
      });

      // Every `functionCall` part, in order — Gemini emits parallel calls as
      // sibling parts, and `find()` kept only the first (A4 defect iii).
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      return {
        text: parts.map((p) => p.text ?? '').join('').trim(),
        calls: parts.flatMap((p) =>
          p.functionCall ? [{ id: crypto.randomUUID(), name: p.functionCall.name, input: p.functionCall.args ?? {} }] : [],
        ),
      };
    },
  };
}
