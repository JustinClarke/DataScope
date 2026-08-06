// Checkpoint 2 — provider usage accounting (§ "The only build 15A requires"
// #1: "Normalized provider usage accounting — raw and billable prompt/output
// tokens per call... every 'equal enforced ceiling' claim in this protocol
// rests on it. This is the hard prerequisite.").
//
// 15A runs on Ollama `qwen3:8b` per the 2026-08-06 amendment to § What is held
// constant, which supersedes the Gemini Flash proposal this directory's
// `geminiProvider.ts` was built against. That file stays: the amendment names
// cloud-model portability as the later ablation, and deleting the seam would
// mean rebuilding it to run one.
//
// Self-contained rather than an import from `../13-active-analysis/qwen3Rig.ts`,
// following the same precedent `geminiProvider.ts` records for experiment 10's
// two Gemini seams. It is not merely a style rule here: 13's rig drives the
// model through **constrained JSON output** (`format: schema`), and 15A drives
// it through **native tool calls**, so the two callers agree on a base URL and
// a model tag and on almost nothing else.
//
// Three things this file must get right, all of them amendment consequences:
//
//   1. **Truncation.** Ollama serves a default `num_ctx` of 4096 and truncates
//      an over-long prompt without erroring. 15A's control arm carries the whole
//      phase-one transcript and the treatment carries only the briefing, so a
//      too-small window would cut the control and never the treatment — the
//      measured effect would be Ollama's truncation policy wearing the
//      mechanism's name. `num_ctx` is served identically to both arms and a
//      prompt that reaches it fails the cell rather than scoring truncated.
//   2. **Thinking tokens.** Experiment 13 recorded `eval_count` silently
//      excluding the thinking trace (`../13-active-analysis/qwen3Rig.ts` L76).
//      Thinking is sampling, not infrastructure, so it belongs in raw output
//      tokens — the same reasoning `geminiProvider.ts` applies to
//      `thoughtsTokenCount`.
//   3. **Missing counts throw.** Same rule as the Gemini seam: 15A's ceilings
//      and its frozen verdict are keyed to raw tokens, so a `-1` sentinel
//      flowing into `accountUsage` would corrupt every downstream sum rather
//      than being cosmetically wrong. 13's rig uses that sentinel; this one
//      cannot.
import type { AIProvider, AITool, ProviderMessage, ProviderTurn } from '../../../src/types';
import type { CallUsage } from './contracts';

export const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? 'http://100.126.157.97:11434').replace(/\/$/, '');
export const QWEN3_MODEL_TAG = process.env.QWEN3_MODEL_TAG ?? 'qwen3:8b';

/**
 * The served context window, frozen in § What is held constant and identical in
 * both arms. Sized to hold the control's worst-case phase-two prompt — the
 * whole shared transcript plus the briefing — with headroom; the pilot measures
 * the real worst case and this is re-pinned from it before the scored run.
 */
export const NUM_CTX = Number(process.env.QWEN3_NUM_CTX ?? 32_768);

/**
 * How close a prompt may come to `NUM_CTX` before the cell is failed. A prompt
 * at 100% of the window has already been truncated; the margin catches the
 * cell that was one token from it, because that trajectory tells us nothing
 * about clearing either.
 */
export const TRUNCATION_MARGIN = Number(process.env.QWEN3_TRUNCATION_MARGIN ?? 0.98);

const CALL_TIMEOUT_MS = Number(process.env.OLLAMA_CALL_TIMEOUT_MS ?? 600_000);

/** Frozen sampler. Qwen3's published non-thinking defaults, matching 13's `NON_THINKING_MODE`. */
export const SAMPLER = {
  think: process.env.QWEN3_THINK === '1',
  temperature: Number(process.env.QWEN3_TEMPERATURE ?? 0.7),
  topP: Number(process.env.QWEN3_TOP_P ?? 0.8),
  topK: Number(process.env.QWEN3_TOP_K ?? 20),
} as const;

/** Raised when a prompt reached the served window. The harness fails the cell `harness_error`; it must never be scored. */
export class ContextTruncationError extends Error {
  readonly promptTokens: number;
  readonly numCtx: number;

  constructor(promptTokens: number, numCtx: number) {
    super(
      `prompt of ${promptTokens} tokens reached the served num_ctx of ${numCtx} — Ollama truncates silently, ` +
        'so this trajectory has been cut off rather than cleared and cannot be scored (§ What is held constant)',
    );
    this.name = 'ContextTruncationError';
    this.promptTokens = promptTokens;
    this.numCtx = numCtx;
  }
}

export interface ResolvedModel {
  tag: string;
  digest: string;
  quantizationLevel: string | null;
  parameterSize: string | null;
  capabilities: string[];
}

interface OllamaTagsBody {
  models?: Array<{
    name?: string;
    model?: string;
    digest?: string;
    details?: { quantization_level?: string; parameter_size?: string };
    capabilities?: string[];
  }>;
}

/**
 * The preflight § What is held constant means by "resolved to an exact digest
 * before any scored call". Throws rather than returning a partial result: an
 * unresolved digest means the run cannot state which weights produced it, and
 * a model without the `tools` capability cannot drive 15A's harness at all —
 * the whole operation loop is native tool calls.
 *
 * The `tools` check is the one that has to happen here rather than being
 * assumed. 13 drove this model through constrained JSON precisely because
 * structured tool calling was not a settled property of the small models this
 * repo has used (`DATASCOPE.md` §872 records `qwen2.5-coder:1.5b` never
 * emitting `tool_calls`, and `edge/adapters.ts` L32 the coder free-texting
 * them). Finding out at call 400 of a scored run is not an option.
 */
export async function resolveQwen3(fetchImpl: typeof fetch = fetch): Promise<ResolvedModel> {
  const response = await fetchImpl(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(20_000) });
  const raw = await response.text();
  if (!response.ok) throw new Error(`ollama tags request failed with HTTP ${response.status}: ${raw}`);
  const body = JSON.parse(raw) as OllamaTagsBody;
  const match = body.models?.find((m) => m.name === QWEN3_MODEL_TAG || m.model === QWEN3_MODEL_TAG);
  if (!match?.digest) {
    const available = (body.models ?? []).map((m) => m.name ?? m.model).filter(Boolean).join(', ');
    throw new Error(`ollama tag ${QWEN3_MODEL_TAG} was not present with a digest. Available: ${available || '(none)'}`);
  }
  const capabilities = match.capabilities ?? [];
  if (!capabilities.includes('tools')) {
    throw new Error(
      `ollama reports ${QWEN3_MODEL_TAG} without the "tools" capability (got: ${capabilities.join(', ') || 'none'}). ` +
        "15A's operation loop is native tool calls; a model that cannot emit them cannot run this experiment.",
    );
  }
  return {
    tag: QWEN3_MODEL_TAG,
    digest: match.digest,
    quantizationLevel: match.details?.quantization_level ?? null,
    parameterSize: match.details?.parameter_size ?? null,
    capabilities,
  };
}

interface OllamaToolCall {
  function?: { name?: string; arguments?: Record<string, unknown> | string };
}
interface OllamaChatBody {
  message?: { content?: string; thinking?: string; tool_calls?: OllamaToolCall[] };
  prompt_eval_count?: number;
  eval_count?: number;
  done_reason?: string;
}

export interface Qwen3CallUsage extends CallUsage {
  /**
   * True when `rawOutputTokens` includes a local byte estimate of the thinking
   * trace rather than a counted figure — the exposure § Model and provider
   * requires a thinking-enabled run to report. Always false with thinking off,
   * which is why the frozen sampler defaults to off.
   */
  outputTokensEstimated: boolean;
}

/**
 * Ollama has no billing and no provider-side prefix cache, so billable equals
 * raw — the amendment's "collapses to one number". Kept as four fields anyway
 * so `accountUsage` and every downstream sum stay provider-agnostic.
 *
 * The thinking correction: when a trace is present and `eval_count` plainly
 * did not count it, the counted figure is replaced by an estimate over content
 * plus thinking and the call is flagged. Detection is deliberately conservative
 * — only when `eval_count` is below the byte estimate of the thinking trace
 * *alone* is it certain the trace was excluded, since no tokenizer produces
 * fewer tokens than roughly a quarter of the character count.
 */
export function usageFromChatBody(body: OllamaChatBody): Qwen3CallUsage {
  if (body.prompt_eval_count === undefined || body.eval_count === undefined) {
    throw new Error(
      `ollama response is missing token counts (prompt_eval_count=${body.prompt_eval_count}, ` +
        `eval_count=${body.eval_count}) — 15A's enforced-ceiling and raw-token verdict rules ` +
        'cannot run without a real per-call usage figure',
    );
  }
  const thinking = body.message?.thinking ?? '';
  const content = body.message?.content ?? '';
  const estimated = Math.ceil((content.length + thinking.length) / 4);
  const excludedThinking = thinking.length > 0 && body.eval_count < Math.ceil(thinking.length / 4);
  const rawOutputTokens = excludedThinking ? estimated : body.eval_count;

  return {
    rawPromptTokens: body.prompt_eval_count,
    rawOutputTokens,
    billablePromptTokens: body.prompt_eval_count,
    billableOutputTokens: rawOutputTokens,
    outputTokensEstimated: excludedThinking,
  };
}

/** Ollama returns arguments as an object, but has been observed to hand back a JSON string; both become one shape here rather than at every call site. */
function toCallInput(args: Record<string, unknown> | string | undefined): Record<string, unknown> {
  if (args === undefined) return {};
  if (typeof args !== 'string') return args;
  try {
    const parsed = JSON.parse(args) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    // A malformed argument string is a malformed tool call, which the harness
    // already counts as a failed operation — the amendment's "converted into a
    // measured quantity". Losing the call entirely would hide it from that count.
    return {};
  }
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
}

function toOllamaMessages(messages: ProviderMessage[]): OllamaMessage[] {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.toolCalls !== undefined && m.toolCalls.length > 0) {
      return {
        role: 'assistant' as const,
        content: m.content,
        tool_calls: m.toolCalls.map((call) => ({
          function: { name: call.name, arguments: (call.input ?? {}) as Record<string, unknown> },
        })),
      };
    }
    // `tool` maps straight through — Ollama takes a bare `role: 'tool'` message
    // whose content is the result, so unlike the Gemini seam there is no
    // name-matching workaround for a missing call id.
    return { role: m.role, content: m.content };
  });
}

/**
 * Implements the product's `AIProvider` contract, so the forked harness
 * (Checkpoint 6) drives it exactly as it drives the Gemini seam, and reports
 * each call's usage through `onUsage` — `ProviderTurn` has no room for usage
 * metadata.
 */
export function createUsageTrackedQwen3Provider(options: {
  fetchImpl?: typeof fetch;
  onUsage: (usage: Qwen3CallUsage) => void;
  /** Served context window. Defaults to the frozen `NUM_CTX`; both arms must be given the same value. */
  numCtx?: number;
}): AIProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const numCtx = options.numCtx ?? NUM_CTX;

  return {
    id: 'qwen3-ollama',
    async complete(messages: ProviderMessage[], tools: AITool[], opts): Promise<ProviderTurn> {
      const body: Record<string, unknown> = {
        model: QWEN3_MODEL_TAG,
        messages: toOllamaMessages(messages),
        think: SAMPLER.think,
        stream: false,
        keep_alive: '30m',
        options: {
          num_ctx: numCtx,
          temperature: SAMPLER.temperature,
          top_p: SAMPLER.topP,
          top_k: SAMPLER.topK,
        },
      };
      if (tools.length > 0) {
        body.tools = tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        }));
      }

      const response = await doFetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts?.signal ?? AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`ollama http ${response.status}: ${raw}`);
      const parsed = JSON.parse(raw) as OllamaChatBody;

      const usage = usageFromChatBody(parsed);
      // Checked before `onUsage`, so a truncated call never enters the totals
      // it would otherwise contaminate.
      if (usage.rawPromptTokens >= numCtx * TRUNCATION_MARGIN) {
        throw new ContextTruncationError(usage.rawPromptTokens, numCtx);
      }
      options.onUsage(usage);

      return {
        text: (parsed.message?.content ?? '').trim(),
        calls: (parsed.message?.tool_calls ?? []).flatMap((call) =>
          call.function?.name
            ? [{ id: crypto.randomUUID(), name: call.function.name, input: toCallInput(call.function.arguments) }]
            : [],
        ),
      };
    },
  };
}
