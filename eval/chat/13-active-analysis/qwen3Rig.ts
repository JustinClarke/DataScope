import { Agent, setGlobalDispatcher } from 'undici';
import { ANALYSIS_ACTION_SCHEMA, parseAnalysisAction, type AnalysisAction } from './contracts';

export const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? 'http://100.126.157.97:11434').replace(/\/$/, '');
export const OLLAMA_CHAT_URL = process.env.OLLAMA_CHAT_URL ?? `${OLLAMA_BASE_URL}/api/chat`;
export const OLLAMA_TAGS_URL = process.env.OLLAMA_TAGS_URL ?? `${OLLAMA_BASE_URL}/api/tags`;
export const QWEN3_MODEL_TAG = 'qwen3:8b';

const CALL_TIMEOUT_MS = Number(process.env.OLLAMA_CALL_TIMEOUT_MS ?? 600_000);
setGlobalDispatcher(new Agent({ headersTimeout: CALL_TIMEOUT_MS, bodyTimeout: CALL_TIMEOUT_MS }));

/** One of the two fixed sampling configurations from § Thinking and sampling preflight. */
export interface SamplerMode {
  id: 'thinking' | 'non-thinking';
  think: boolean;
  temperature: number;
  topP: number;
  topK: number;
}

export const THINKING_MODE: SamplerMode = { id: 'thinking', think: true, temperature: 0.6, topP: 0.95, topK: 20 };
export const NON_THINKING_MODE: SamplerMode = { id: 'non-thinking', think: false, temperature: 0.7, topP: 0.8, topK: 20 };

/** Tried in this order: thinking wins whenever it passes, per "if both pass, thinking mode is the core default". */
export const PREFLIGHT_MODES: readonly SamplerMode[] = [THINKING_MODE, NON_THINKING_MODE];

export interface ResolvedModel {
  tag: string;
  digest: string;
  quantizationLevel: string | null;
  parameterSize: string | null;
  contextLength: number | null;
  capabilities: string[];
}

interface OllamaTagsBody {
  models?: Array<{
    name?: string;
    model?: string;
    digest?: string;
    details?: { quantization_level?: string; parameter_size?: string; context_length?: number };
    capabilities?: string[];
  }>;
}

/** Resolves the exact local tag/digest before any scored call; throws (stopping the run) if the tag isn't present. */
export async function resolveQwen3(): Promise<ResolvedModel> {
  const response = await fetch(OLLAMA_TAGS_URL, { signal: AbortSignal.timeout(20_000) });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Ollama tags request failed with HTTP ${response.status}: ${raw}`);
  const body = JSON.parse(raw) as OllamaTagsBody;
  const match = body.models?.find((model) => model.name === QWEN3_MODEL_TAG || model.model === QWEN3_MODEL_TAG);
  if (!match?.digest) throw new Error(`Ollama tag ${QWEN3_MODEL_TAG} was not present with a digest`);
  return {
    tag: QWEN3_MODEL_TAG,
    digest: match.digest,
    quantizationLevel: match.details?.quantization_level ?? null,
    parameterSize: match.details?.parameter_size ?? null,
    contextLength: match.details?.context_length ?? null,
    capabilities: match.capabilities ?? [],
  };
}

interface OllamaChatBody {
  message?: { content?: string; thinking?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  done_reason?: string;
}

export interface SchemaCallResult {
  rawContent: string;
  thinking: string | null;
  promptTokens: number;
  /** Ollama's own `eval_count`. With `format` + `think:true` this has been observed to count
   * only the final constrained-JSON tokens and silently exclude the thinking trace — do not
   * treat it alone as total generation cost; see `estimatedResponseTokens`. */
  responseTokens: number;
  /** Local byte-based estimate over content + thinking (§ Context accounting: "locally
   * estimated tokens, so estimator error remains visible"). Use max(responseTokens,
   * estimatedResponseTokens) for any token-cap check. */
  estimatedResponseTokens: number;
  doneReason: string | null;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Issues one structured-output chat call under a fixed sampler mode. The schema is a parameter
 * because the two scored arms have different action spaces: Arm B may request probes, Arm A may
 * not (§ Scored arms). Sampler, model, and transport stay identical between them.
 */
export async function callWithSchema(
  messages: readonly ChatMessage[],
  mode: SamplerMode,
  options: { numCtx: number; numPredict: number; keepAlive?: string },
  schema: unknown,
): Promise<SchemaCallResult> {
  const response = await fetch(OLLAMA_CHAT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: QWEN3_MODEL_TAG,
      messages,
      think: mode.think,
      stream: false,
      keep_alive: options.keepAlive ?? '30m',
      format: schema,
      options: {
        num_ctx: options.numCtx,
        num_predict: options.numPredict,
        temperature: mode.temperature,
        top_p: mode.topP,
        top_k: mode.topK,
      },
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${raw}`);
  const body = JSON.parse(raw) as OllamaChatBody;
  const rawContent = body.message?.content ?? '';
  const thinking = body.message?.thinking ?? null;
  return {
    rawContent,
    thinking,
    promptTokens: body.prompt_eval_count ?? -1,
    responseTokens: body.eval_count ?? -1,
    estimatedResponseTokens: Math.ceil((rawContent.length + (thinking?.length ?? 0)) / 4),
    doneReason: body.done_reason ?? null,
  };
}

export interface AnalysisActionCallResult extends SchemaCallResult {
  action: AnalysisAction | null;
  parseError: string | null;
}

/** Issues one AnalysisAction-schema chat call under a fixed sampler mode. Never inspects a task response. */
export async function callAnalysisAction(
  systemPrompt: string,
  userPrompt: string,
  mode: SamplerMode,
  options: { numCtx: number; numPredict: number; keepAlive?: string },
): Promise<AnalysisActionCallResult> {
  const result = await callWithSchema(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    mode,
    options,
    ANALYSIS_ACTION_SCHEMA,
  );
  try {
    return { ...result, action: parseAnalysisAction(JSON.parse(result.rawContent)), parseError: null };
  } catch (error) {
    return { ...result, action: null, parseError: String(error) };
  }
}
