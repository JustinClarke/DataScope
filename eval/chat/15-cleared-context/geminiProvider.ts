// Checkpoint 2 — provider usage accounting (§ "The only build 15A requires"
// #1: "Normalized provider usage accounting — raw and billable prompt/output
// tokens per call... every 'equal enforced ceiling' claim in this protocol
// rests on it. This is the hard prerequisite.").
//
// 15A proposes Gemini Flash (§ Model and provider — "the working key is
// already in place"). This file is a third, self-contained Gemini caller
// alongside `../10-grounding-ladder/geminiRig.ts` and
// `../10-grounding-ladder/providers/geminiProvider.ts` rather than an import
// from either — that experiment's own header comment already establishes the
// precedent this repo follows: "the panel rig and the chat provider are
// separate implementations... one env var, two seams — do not try to unify
// them." 15A is a new lineage, not a descendant of experiment 10, so it gets
// its own seam rather than reaching across.
//
// Unlike those two callers, which treat a missing `usageMetadata` field as
// informational (falling back to a `-1` sentinel), this one throws: 15A's
// enforced ceilings and its frozen statistical test are both keyed to raw
// token counts (§ Caching policy), so a silently-poisoned `-1` flowing into
// `accountUsage`'s sums would corrupt every downstream total rather than
// merely being cosmetically wrong.
import type { AIProvider, AITool, ProviderMessage, ProviderTurn } from '../../../src/types';
import type { CallUsage } from './contracts';

/** Freeze the exact model id and digest at the end of the pilot (§ Model and provider). Until then, overridable for local iteration the same way experiment 10's rigs are. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';
const GEMINI_TEMPERATURE = Number(process.env.GEMINI_TEMPERATURE ?? 0.8);
const GEMINI_THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL ?? 'minimal';
const GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_RETRIES = 5;

export function requireApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY is unset. This repo has no dotenv (.env.local is Vite\'s, not tsx\'s) — export it into the shell first, ' +
        'e.g. export GEMINI_API_KEY=$(grep \'^GEMINI_API_KEY=\' .env.local | cut -d= -f2-)',
    );
  }
  return key;
}

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
  /** Thinking tokens — real generated output, billed, but not part of `candidatesTokenCount`. Excluding it from `rawOutputTokens` would undercount what the model actually produced (§ Caching policy: caching changes price, not sampling — the same principle applies to thinking, which is sampling, not infrastructure). */
  thoughtsTokenCount?: number;
  /** The portion of `promptTokenCount` served from the provider's prefix cache. */
  cachedContentTokenCount?: number;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  usageMetadata?: GeminiUsageMetadata;
}

/**
 * Pure conversion, tested without a network call. Throws on missing
 * `usageMetadata` or missing prompt/candidates counts — see file header.
 * `cachedContentTokenCount` and `thoughtsTokenCount` legitimately default to
 * 0 (no cache hit / no thinking is a valid outcome, not a missing-data error).
 *
 * "Billable" here means "not served from cache" for the prompt side — Gemini
 * bills cached tokens at a reduced, not zero, rate, so this is the
 * not-full-price/full-price split the doc's raw-vs-billable distinction
 * needs, not a claim that cached tokens cost nothing. Output has no caching,
 * so billable output equals raw output.
 */
export function usageFromMetadata(usage: GeminiUsageMetadata | undefined): CallUsage {
  if (usage === undefined || usage.promptTokenCount === undefined || usage.candidatesTokenCount === undefined) {
    throw new Error(
      `gemini response is missing usageMetadata (got ${JSON.stringify(usage)}) — 15A's enforced-ceiling and ` +
        'raw-token verdict rules cannot run without a real per-call usage figure',
    );
  }
  const rawOutputTokens = usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0);
  return {
    rawPromptTokens: usage.promptTokenCount,
    rawOutputTokens,
    billablePromptTokens: usage.promptTokenCount - (usage.cachedContentTokenCount ?? 0),
    billableOutputTokens: rawOutputTokens,
  };
}

/** `tool` messages carry a `toolCallId`, not a function name — matched by name via the last assistant call, same simplification as experiment 10's chat provider. */
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
 * Implements the product's `AIProvider` contract (so the forked harness,
 * Checkpoint 6, drives it the same way `askAI` does) and reports each call's
 * `CallUsage` through `onUsage` — `ProviderTurn` itself has no room for usage
 * metadata (same shape gap `providers/geminiProvider.ts` documents), so this
 * is a callback rather than an extended return type.
 */
export function createUsageTrackedGeminiProvider(options: {
  fetchImpl?: typeof fetch;
  onUsage: (usage: CallUsage) => void;
}): AIProvider {
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
      options.onUsage(usageFromMetadata(data.usageMetadata));

      // Every `functionCall` part, in order — Gemini emits parallel calls as
      // sibling parts (A4 defect iii: a `find()` here would keep only the first).
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
