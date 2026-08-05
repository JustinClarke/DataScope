import { Agent, setGlobalDispatcher } from 'undici';
import type {
  AnalysisPlan,
  ColumnRef,
  DatasetPassport,
  DraftAnswer,
  EvidencePacket,
  MetricSpec,
  ProbeFilter,
  ProbePlan,
} from './contracts';
import { compactPassport } from './passport';

export const OLLAMA_CHAT_URL =
  process.env.OLLAMA_CHAT_URL ?? 'http://100.126.157.97:11434/api/chat';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:7b';
export const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 8192);
const TIMEOUT_MS = Number(process.env.OLLAMA_CALL_TIMEOUT_MS ?? 600_000);

setGlobalDispatcher(new Agent({ headersTimeout: TIMEOUT_MS, bodyTimeout: TIMEOUT_MS }));

const COLUMN_REF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { table: { type: 'string' }, column: { type: 'string' } },
  required: ['table', 'column'],
} as const;

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rationale: { type: 'string' },
    probes: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          kind: { type: 'string', enum: ['breakdown', 'ranking', 'trend', 'summary'] },
          metric: {
            oneOf: [
              {
                type: 'object',
                additionalProperties: false,
                properties: { aggregate: { const: 'count' }, table: { type: 'string' } },
                required: ['aggregate', 'table'],
              },
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  aggregate: { type: 'string', enum: ['count_distinct', 'sum', 'average'] },
                  column: COLUMN_REF_SCHEMA,
                },
                required: ['aggregate', 'column'],
              },
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  aggregate: { const: 'sum_product' },
                  left: COLUMN_REF_SCHEMA,
                  right: COLUMN_REF_SCHEMA,
                },
                required: ['aggregate', 'left', 'right'],
              },
            ],
          },
          dimension: { oneOf: [COLUMN_REF_SCHEMA, { type: 'null' }] },
          timeGrain: { enum: ['day', 'month', 'quarter', 'year', null] },
          filters: {
            type: 'array',
            maxItems: 2,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                column: COLUMN_REF_SCHEMA,
                operator: { type: 'string', enum: ['equals', 'not_equals'] },
                value: { type: ['string', 'number'] },
              },
              required: ['column', 'operator', 'value'],
            },
          },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
        required: ['id', 'title', 'kind', 'metric', 'dimension', 'timeGrain', 'filters', 'limit'],
      },
    },
  },
  required: ['rationale', 'probes'],
} as const;

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          observation: { type: 'string' },
          implication: { type: 'string' },
          evidenceIds: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string' } },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['observation', 'implication', 'evidenceIds', 'confidence'],
      },
    },
    presentationIdeas: { type: 'array', maxItems: 3, items: { type: 'string' } },
    transformIdeas: { type: 'array', maxItems: 3, items: { type: 'string' } },
    limits: { type: 'array', maxItems: 3, items: { type: 'string' } },
  },
  required: ['summary', 'findings', 'presentationIdeas', 'transformIdeas', 'limits'],
} as const;

interface OllamaResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface CallMetadata {
  promptTokens: number;
  responseTokens: number;
}

async function callJson(system: string, user: string, format: object): Promise<{ value: unknown; metadata: CallMetadata }> {
  const request = () => fetch(OLLAMA_CHAT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: false,
        keep_alive: '30m',
        format,
        options: { num_ctx: OLLAMA_NUM_CTX, temperature: 0 },
      }),
    });
  let response: Response;
  try {
    response = await request();
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
    response = await request();
  }
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as OllamaResponse;
  const raw = body.message?.content ?? '';
  return {
    value: JSON.parse(raw) as unknown,
    metadata: { promptTokens: body.prompt_eval_count ?? -1, responseTokens: body.eval_count ?? -1 },
  };
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function assertKeys(object: Record<string, unknown>, allowed: string[], label: string): void {
  const extras = Object.keys(object).filter((key) => !allowed.includes(key));
  if (extras.length > 0) throw new Error(`${label} contains unsupported fields: ${extras.join(', ')}`);
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value;
}

function columnRef(value: unknown, label: string): ColumnRef {
  const object = objectValue(value, label);
  assertKeys(object, ['table', 'column'], label);
  return { table: stringValue(object.table, `${label}.table`), column: stringValue(object.column, `${label}.column`) };
}

function metricSpec(value: unknown): MetricSpec {
  const object = objectValue(value, 'metric');
  assertKeys(object, ['aggregate', 'table', 'column', 'left', 'right'], 'metric');
  const aggregate = stringValue(object.aggregate, 'metric.aggregate');
  if (aggregate === 'count') return { aggregate, table: stringValue(object.table, 'metric.table') };
  if (aggregate === 'count_distinct' || aggregate === 'sum' || aggregate === 'average') {
    return { aggregate, column: columnRef(object.column, 'metric.column') };
  }
  if (aggregate === 'sum_product') {
    return { aggregate, left: columnRef(object.left, 'metric.left'), right: columnRef(object.right, 'metric.right') };
  }
  throw new Error(`unsupported metric aggregate ${aggregate}`);
}

function parseFilter(value: unknown): ProbeFilter {
  const object = objectValue(value, 'filter');
  assertKeys(object, ['column', 'operator', 'value'], 'filter');
  const operator = stringValue(object.operator, 'filter.operator');
  if (operator !== 'equals' && operator !== 'not_equals') throw new Error(`unsupported filter operator ${operator}`);
  if (typeof object.value !== 'string' && typeof object.value !== 'number') {
    throw new Error('filter.value must be a string or number');
  }
  return { column: columnRef(object.column, 'filter.column'), operator, value: object.value };
}

function parseProbe(value: unknown): ProbePlan {
  const object = objectValue(value, 'probe');
  assertKeys(object, ['id', 'title', 'kind', 'metric', 'dimension', 'timeGrain', 'filters', 'limit'], 'probe');
  const kind = stringValue(object.kind, 'probe.kind');
  if (!['breakdown', 'ranking', 'trend', 'summary'].includes(kind)) throw new Error(`unsupported probe kind ${kind}`);
  const timeGrain = object.timeGrain;
  if (timeGrain !== undefined && timeGrain !== null && !['day', 'month', 'quarter', 'year'].includes(String(timeGrain))) {
    throw new Error(`unsupported time grain ${String(timeGrain)}`);
  }
  const filters = Array.isArray(object.filters) ? object.filters.map(parseFilter) : [];
  return {
    id: stringValue(object.id, 'probe.id'),
    title: stringValue(object.title, 'probe.title'),
    kind: kind as ProbePlan['kind'],
    metric: metricSpec(object.metric),
    ...(object.dimension === undefined || object.dimension === null ? {} : { dimension: columnRef(object.dimension, 'probe.dimension') }),
    ...(timeGrain === undefined || timeGrain === null ? {} : { timeGrain: String(timeGrain) as ProbePlan['timeGrain'] }),
    filters,
    limit: Number(object.limit),
  };
}

export function parsePlan(value: unknown): AnalysisPlan {
  const object = objectValue(value, 'plan');
  assertKeys(object, ['rationale', 'probes'], 'plan');
  if (!Array.isArray(object.probes)) throw new Error('plan.probes must be an array');
  return { rationale: stringValue(object.rationale, 'plan.rationale'), probes: object.probes.map(parseProbe) };
}

export function parseDraftAnswer(value: unknown): DraftAnswer {
  const object = objectValue(value, 'answer');
  if (!Array.isArray(object.findings)) throw new Error('answer.findings must be an array');
  const list = (name: string): string[] => {
    const valueAtName = object[name];
    if (!Array.isArray(valueAtName) || !valueAtName.every((item) => typeof item === 'string')) {
      throw new Error(`answer.${name} must be a string array`);
    }
    return valueAtName as string[];
  };
  return {
    summary: stringValue(object.summary, 'answer.summary'),
    findings: object.findings.map((item) => {
      const finding = objectValue(item, 'finding');
      const confidence = stringValue(finding.confidence, 'finding.confidence');
      if (!['high', 'medium', 'low'].includes(confidence)) throw new Error(`invalid confidence ${confidence}`);
      if (!Array.isArray(finding.evidenceIds) || !finding.evidenceIds.every((id) => typeof id === 'string')) {
        throw new Error('finding.evidenceIds must be a string array');
      }
      return {
        observation: stringValue(finding.observation, 'finding.observation'),
        implication: stringValue(finding.implication, 'finding.implication'),
        evidenceIds: finding.evidenceIds as string[],
        confidence: confidence as 'high' | 'medium' | 'low',
      };
    }),
    presentationIdeas: list('presentationIdeas'),
    transformIdeas: list('transformIdeas'),
    limits: list('limits'),
  };
}

export async function planQuestion(
  passport: DatasetPassport,
  question: string,
  rejectedPlanError?: string,
): Promise<{ plan: AnalysisPlan; metadata: CallMetadata }> {
  const system = `You are the semantic planner in a local data-analysis system. Select 1-4 useful probes for the question. You may ONLY fill the typed probe grammar; never emit SQL. Use exact table and column names from the passport.

Metric grammar:
- count: {aggregate:"count", table:"..."}
- count_distinct/sum/average: {aggregate:"...", column:{table,column}}
- sum_product: multiply two numeric columns in the SAME table before summing. This is useful for quantity * unit_price.

Kinds:
- summary: dimension=null and timeGrain=null.
- breakdown/ranking: require a dimension and timeGrain=null.
- trend: require a temporal dimension and a timeGrain.
The compiler automatically follows inferred relationships. Prefer measures rooted at the table where the measured event occurs. Filters are optional. Keep ids lowercase and simple.`;
  const repair = rejectedPlanError
    ? `\n\nA previous typed plan was rejected before execution: ${rejectedPlanError}\nReturn a corrected plan using only fields in the passport.`
    : '';
  const user = `Question: ${question}${repair}\n\nDeterministic dataset passport:\n${JSON.stringify(compactPassport(passport))}`;
  const result = await callJson(system, user, PLAN_SCHEMA);
  try {
    return { plan: parsePlan(result.value), metadata: result.metadata };
  } catch (error) {
    throw new Error(`${String(error)}; planner output=${JSON.stringify(result.value)}`);
  }
}

export async function draftAnswer(
  passport: DatasetPassport,
  question: string,
  evidence: EvidencePacket[],
): Promise<{ answer: DraftAnswer; metadata: CallMetadata }> {
  const system = `You are a careful data analyst. Answer only from the deterministic passport and executed evidence packets. Each factual finding must cite the evidence id(s) that support it.

Rules:
- observation is factual. Do not put any number in it unless that exact displayed number occurs in the cited evidence statement.
- implication is an explicitly cautious interpretation, not a proven causal claim.
- presentationIdeas and transformIdeas may be recommendations, but name real columns and state their purpose.
- Never claim customer intent, causation, profitability, or future outcomes from descriptive evidence.
- Mention important limitations.`;
  const packets = evidence.map((packet) => ({ id: packet.id, statement: packet.statement }));
  const user = `Question: ${question}\n\nPassport:\n${JSON.stringify(compactPassport(passport))}\n\nExecuted evidence:\n${JSON.stringify(packets)}`;
  const result = await callJson(system, user, ANSWER_SCHEMA);
  return { answer: parseDraftAnswer(result.value), metadata: result.metadata };
}
