// Local /api/chat client: structured-output query proposals, plain-text
// answers, and model digest/usage capture (experiment doc, "Model contract").
// Wire shape follows the repo's existing Ollama structured-output precedent
// (`eval/chat/13-active-analysis/qwen3Rig.ts`, `eval/claude/10-grounding-ladder/ollamaRig.ts`):
// a hand-written JSON Schema goes in `format`, the parsed JSON is independently
// validated with Zod (never trusted just because it matched the schema, since a
// small model can still emit a syntactically valid but semantically wrong
// object), and thinking is frozen off per run for latency and exact token
// accounting.
import { Agent, setGlobalDispatcher } from 'undici';
import { z } from 'zod';

// Node's built-in `fetch` (undici) has its own default 300_000ms headersTimeout
// and bodyTimeout, independent of the AbortSignal timeout below. A slow local
// thinking-mode call can exceed that, and the connection then dies with
// UND_ERR_HEADERS_TIMEOUT regardless of OLLAMA_CALL_TIMEOUT_MS — raise both here.
setGlobalDispatcher(new Agent({ headersTimeout: 600_000, bodyTimeout: 600_000 }));

export const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
export const CHAT_NUM_CTX = Number(process.env.CHAT_NUM_CTX ?? 16_384);
export const CHAT_TEMPERATURE = Number(process.env.CHAT_TEMPERATURE ?? 0);
export const CHAT_THINK = process.env.CHAT_THINK === '1';

const CALL_TIMEOUT_MS = Number(process.env.OLLAMA_CALL_TIMEOUT_MS ?? 120_000);

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
 * Resolves `tag` to an exact digest before any scored call — "a tag without a
 * digest is not a reproducible model identity" (experiment doc, "Local
 * prerequisites"). Throws if the tag is not present locally.
 */
export async function resolveModel(tag: string, baseUrl: string = OLLAMA_BASE_URL): Promise<ResolvedModel> {
  const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(20_000) });
  const raw = await response.text();
  if (!response.ok) throw new Error(`ollama tags request failed with HTTP ${response.status}: ${raw}`);
  const body = JSON.parse(raw) as OllamaTagsBody;
  const match = body.models?.find((m) => m.name === tag || m.model === tag);
  if (!match?.digest) {
    const available = (body.models ?? []).map((m) => m.name ?? m.model).filter(Boolean).join(', ');
    throw new Error(`ollama tag "${tag}" is not pulled locally. Available: ${available || '(none)'}`);
  }
  return {
    tag,
    digest: match.digest,
    quantizationLevel: match.details?.quantization_level ?? null,
    parameterSize: match.details?.parameter_size ?? null,
    capabilities: match.capabilities ?? [],
  };
}

// ---- structured query proposal ----

export const QueryProposalSchema = z.object({
  status: z.literal('query'),
  sql: z.string().min(1),
  assumptions: z.array(z.string()),
  result_shape: z.enum(['scalar', 'table']),
});
export const UnsupportedProposalSchema = z.object({
  status: z.literal('unsupported'),
  reason: z.string().min(1),
});
export const ModelProposalSchema = z.discriminatedUnion('status', [QueryProposalSchema, UnsupportedProposalSchema]);
export type ModelProposal = z.infer<typeof ModelProposalSchema>;

/** Hand-written JSON Schema for the `format` field — see `ANALYSIS_ACTION_SCHEMA` for the repo's existing `oneOf`-at-top-level precedent with this same Ollama structured-output path. */
export const MODEL_PROPOSAL_JSON_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { const: 'query' },
        sql: { type: 'string' },
        assumptions: { type: 'array', items: { type: 'string' } },
        result_shape: { enum: ['scalar', 'table'] },
      },
      required: ['status', 'sql', 'assumptions', 'result_shape'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { const: 'unsupported' },
        reason: { type: 'string' },
      },
      required: ['status', 'reason'],
    },
  ],
};

export interface CallUsage {
  promptTokens: number;
  outputTokens: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatBody {
  message?: { content?: string; thinking?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

async function callOllama(
  model: string,
  messages: readonly ChatMessage[],
  format: unknown,
  baseUrl: string,
): Promise<{ rawContent: string; usage: CallUsage }> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      think: CHAT_THINK,
      stream: false,
      ...(format !== undefined ? { format } : {}),
      options: { num_ctx: CHAT_NUM_CTX, temperature: CHAT_TEMPERATURE },
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`ollama http ${response.status}: ${raw}`);
  const body = JSON.parse(raw) as OllamaChatBody;
  if (body.prompt_eval_count === undefined || body.eval_count === undefined) {
    throw new Error('ollama response is missing token counts (prompt_eval_count/eval_count)');
  }
  return {
    rawContent: (body.message?.content ?? '').trim(),
    usage: { promptTokens: body.prompt_eval_count, outputTokens: body.eval_count },
  };
}

export interface ProposalCallResult {
  proposal: ModelProposal | null;
  parseError: string | null;
  rawContent: string;
  usage: CallUsage;
}

/** One structured-output call constrained to `MODEL_PROPOSAL_JSON_SCHEMA`, independently re-validated with Zod. */
export async function callForProposal(
  model: string,
  messages: readonly ChatMessage[],
  baseUrl: string = OLLAMA_BASE_URL,
): Promise<ProposalCallResult> {
  const { rawContent, usage } = await callOllama(model, messages, MODEL_PROPOSAL_JSON_SCHEMA, baseUrl);
  try {
    const parsed: unknown = JSON.parse(rawContent);
    const result = ModelProposalSchema.safeParse(parsed);
    if (!result.success) return { proposal: null, parseError: result.error.message, rawContent, usage };
    return { proposal: result.data, parseError: null, rawContent, usage };
  } catch (error) {
    return { proposal: null, parseError: error instanceof Error ? error.message : String(error), rawContent, usage };
  }
}

export interface TextCallResult {
  text: string;
  usage: CallUsage;
}

/** Plain-text call for answer generation on a grouped result — no `format` constraint. */
export async function callForText(
  model: string,
  messages: readonly ChatMessage[],
  baseUrl: string = OLLAMA_BASE_URL,
): Promise<TextCallResult> {
  const { rawContent, usage } = await callOllama(model, messages, undefined, baseUrl);
  return { text: rawContent, usage };
}
