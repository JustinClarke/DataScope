// A4's mechanism: extends exp17's MODEL_PROPOSAL_JSON_SCHEMA (ollama.ts,
// reused as-is for A0-A3) with a required `plan` object the model must fill
// before `sql` — grain, tables touched, and filters — in the same
// structured-output call. Directive, not optional: per the repo's own prior
// finding (RESEARCH.md / brief §3), a model given a passive option to plan
// never uses it, so the schema makes the field non-optional rather than
// inviting it.
//
// Kept as a separate module rather than editing ollama.ts: exp17's schema is
// frozen for that experiment's own scored runs (its module comment already
// documents ANALYSIS_ACTION_SCHEMA-style precedent), and A0-A3 in this
// experiment deliberately keep using the unmodified schema — only A4/A5 opt
// into this one.
import { z } from 'zod';
import { OLLAMA_BASE_URL, type CallUsage, type ChatMessage } from '../17-duckdb-local-chat/ollama';
import { assembleWithFooter, buildA3ContentBlocks } from './armPrompts';
import type { DatasetFacts } from './datasetFacts';
import type { RollupView } from './profiler';
import type { TableRegistryEntry } from '../../../src/types/dataset';

export const PlanSchema = z.object({
  grain: z.string().min(1),
  tables: z.array(z.string()).min(1),
  filters: z.array(z.string()),
});

export const PlannedQueryProposalSchema = z.object({
  status: z.literal('query'),
  plan: PlanSchema,
  sql: z.string().min(1),
  assumptions: z.array(z.string()),
  result_shape: z.enum(['scalar', 'table']),
});
export const UnsupportedProposalSchema = z.object({
  status: z.literal('unsupported'),
  reason: z.string().min(1),
});
export const PlannedModelProposalSchema = z.discriminatedUnion('status', [
  PlannedQueryProposalSchema,
  UnsupportedProposalSchema,
]);
export type PlannedModelProposal = z.infer<typeof PlannedModelProposalSchema>;

export const PLANNED_PROPOSAL_JSON_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { const: 'query' },
        plan: {
          type: 'object',
          additionalProperties: false,
          properties: {
            grain: { type: 'string', description: 'One sentence: what does one row of your query result represent?' },
            tables: { type: 'array', items: { type: 'string' } },
            filters: { type: 'array', items: { type: 'string' } },
          },
          required: ['grain', 'tables', 'filters'],
        },
        sql: { type: 'string' },
        assumptions: { type: 'array', items: { type: 'string' } },
        result_shape: { enum: ['scalar', 'table'] },
      },
      required: ['status', 'plan', 'sql', 'assumptions', 'result_shape'],
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

// A4's prompt text: A3's content blocks (stats + generated views + worked
// examples — reused via `buildA3ContentBlocks`, never re-derived) under a
// response-format footer that names the `plan` field, since A3's own footer
// (`RESPONSE_FORMAT_INSTRUCTIONS`) doesn't mention it and would contradict
// PLANNED_PROPOSAL_JSON_SCHEMA if reused verbatim. Stated as a directive, not
// left to the schema alone to enforce silently — DESIGN.md §3 is explicit
// that a passive planning *option* goes unused, so the prompt spells out the
// two-step contract in words as well as constraining it structurally.
const PLANNED_RESPONSE_FORMAT_INSTRUCTIONS =
  'Given a question, first fill in "plan": one sentence for "grain" describing what one row of ' +
  'your query result represents, the "tables" you will use, and any "filters" you will apply — ' +
  'then write "sql" consistent with that plan. Respond with a JSON object: ' +
  '{"status":"query","plan":{"grain":"...","tables":[...],"filters":[...]},"sql":"...","assumptions":[...],"result_shape":"scalar"|"table"} ' +
  'or {"status":"unsupported","reason":"..."}.';

export function buildA4Prompt(
  tables: readonly TableRegistryEntry[],
  facts: DatasetFacts,
  grainByTable: ReadonlyMap<string, string>,
  views: readonly RollupView[],
): string {
  return assembleWithFooter(buildA3ContentBlocks(tables, facts, grainByTable, views), PLANNED_RESPONSE_FORMAT_INSTRUCTIONS);
}

interface OllamaChatBody {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

const CALL_TIMEOUT_MS = Number(process.env.OLLAMA_CALL_TIMEOUT_MS ?? 120_000);

export interface PlannedProposalCallResult {
  proposal: PlannedModelProposal | null;
  parseError: string | null;
  rawContent: string;
  usage: CallUsage;
}

/** Same call shape as ollama.ts's callForProposal, against PLANNED_PROPOSAL_JSON_SCHEMA instead — kept separate rather than parameterizing callForProposal so A0-A3's scored path is untouched by A4/A5's schema. */
export async function callForPlannedProposal(
  model: string,
  messages: readonly ChatMessage[],
  baseUrl: string = OLLAMA_BASE_URL,
  /** exp20 roadmap item 2: explicit param instead of reading CHAT_NUM_CTX per call — a single sweep process needs to pin a different num_ctx per model tier, which an env var read (even at call time) can't do without the caller mutating process.env between cells. */
  numCtx: number = Number(process.env.CHAT_NUM_CTX ?? 16_384),
): Promise<PlannedProposalCallResult> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      think: process.env.CHAT_THINK === '1',
      stream: false,
      format: PLANNED_PROPOSAL_JSON_SCHEMA,
      options: { num_ctx: numCtx, temperature: Number(process.env.CHAT_TEMPERATURE ?? 0) },
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`ollama http ${response.status}: ${raw}`);
  const body = JSON.parse(raw) as OllamaChatBody;
  if (body.prompt_eval_count === undefined || body.eval_count === undefined) {
    throw new Error('ollama response is missing token counts (prompt_eval_count/eval_count)');
  }
  const rawContent = (body.message?.content ?? '').trim();
  const usage: CallUsage = { promptTokens: body.prompt_eval_count, outputTokens: body.eval_count };
  try {
    const parsed: unknown = JSON.parse(rawContent);
    const result = PlannedModelProposalSchema.safeParse(parsed);
    if (!result.success) return { proposal: null, parseError: result.error.message, rawContent, usage };
    return { proposal: result.data, parseError: null, rawContent, usage };
  } catch (error) {
    return { proposal: null, parseError: error instanceof Error ? error.message : String(error), rawContent, usage };
  }
}
