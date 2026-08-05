import { CLAIM_IR_SCHEMA, parseClaimIR, type ClaimIR } from './claimIr';
import type { EcommerceEvidencePlan } from './ecommercePipeline';
import { averageOrderValuePlan, monthlyRevenuePlan } from './phase3Plans';

export const UNSUPPORTED_REASONS = [
  'causal_inference',
  'missing_cost',
  'missing_demographic',
  'incomplete_scope',
] as const;

export type UnsupportedReason = typeof UNSUPPORTED_REASONS[number];

export type Phase5Proposal =
  | { disposition: 'claim'; claim: ClaimIR }
  | { disposition: 'unsupported'; reason: UnsupportedReason };

export const PHASE5_PROPOSAL_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: { disposition: { const: 'claim' }, claim: CLAIM_IR_SCHEMA },
      required: ['disposition', 'claim'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: { disposition: { const: 'unsupported' }, reason: { enum: UNSUPPORTED_REASONS } },
      required: ['disposition', 'reason'],
    },
  ],
} as const;

function exactKeys(input: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(input);
  const extras = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !(key in input));
  if (extras.length > 0 || missing.length > 0) {
    throw new Error(`proposal fields mismatch; missing=${missing.join(',')} extras=${extras.join(',')}`);
  }
}

export function parsePhase5Proposal(value: unknown): Phase5Proposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('proposal must be an object');
  const input = value as Record<string, unknown>;
  if (input.disposition === 'claim') {
    exactKeys(input, ['disposition', 'claim']);
    return { disposition: 'claim', claim: parseClaimIR(input.claim) };
  }
  if (input.disposition === 'unsupported') {
    exactKeys(input, ['disposition', 'reason']);
    if (typeof input.reason !== 'string' || !UNSUPPORTED_REASONS.includes(input.reason as UnsupportedReason)) {
      throw new Error(`unsupported reason must be one of ${UNSUPPORTED_REASONS.join(', ')}`);
    }
    return { disposition: 'unsupported', reason: input.reason as UnsupportedReason };
  }
  throw new Error('proposal.disposition must be claim or unsupported');
}

export const categoryRevenuePlan: EcommerceEvidencePlan = {
  id: 'category-revenue',
  metric: {
    kind: 'sum_product',
    left: { table: 'order_items', column: 'quantity' },
    right: { table: 'order_items', column: 'unit_price' },
  },
  dimension: { column: { table: 'products', column: 'category' } },
  filters: [],
  maxRows: 100,
};

export const categoryQuantityPlan: EcommerceEvidencePlan = {
  id: 'category-quantity',
  metric: { kind: 'sum', column: { table: 'order_items', column: 'quantity' } },
  dimension: { column: { table: 'products', column: 'category' } },
  filters: [],
  maxRows: 100,
};

export const statusRevenuePlan: EcommerceEvidencePlan = {
  id: 'status-revenue',
  metric: {
    kind: 'sum_product',
    left: { table: 'order_items', column: 'quantity' },
    right: { table: 'order_items', column: 'unit_price' },
  },
  dimension: { column: { table: 'orders', column: 'status' } },
  filters: [],
  maxRows: 100,
};

export const countryOrdersPlan: EcommerceEvidencePlan = {
  id: 'country-orders',
  metric: { kind: 'count_distinct', column: { table: 'orders', column: 'order_id' } },
  dimension: { column: { table: 'customers', column: 'country' } },
  filters: [],
  maxRows: 100,
};

export const truncatedProductRevenuePlan: EcommerceEvidencePlan = {
  id: 'product-revenue-truncated',
  metric: {
    kind: 'sum_product',
    left: { table: 'order_items', column: 'quantity' },
    right: { table: 'order_items', column: 'unit_price' },
  },
  dimension: { column: { table: 'products', column: 'name' } },
  filters: [],
  maxRows: 5,
};

export interface Phase5Question {
  id: string;
  text: string;
  kind: 'answerable' | 'control';
  plans: readonly EcommerceEvidencePlan[];
  expectedUnsupportedReason?: UnsupportedReason;
}

export const PHASE5_QUESTIONS: readonly Phase5Question[] = [
  { id: 'understand-ecommerce', text: 'What can I understand from this ecommerce data?', kind: 'answerable', plans: [monthlyRevenuePlan, averageOrderValuePlan] },
  { id: 'sales-presentation', text: 'What can I present to a sales team from this data?', kind: 'answerable', plans: [categoryRevenuePlan, categoryQuantityPlan] },
  { id: 'odd-sales-investigation', text: 'What is something odd in the data that could help us investigate how to drive sales?', kind: 'answerable', plans: [monthlyRevenuePlan, statusRevenuePlan] },
  { id: 'further-transforms', text: 'What transforms should I apply to take the analysis further?', kind: 'answerable', plans: [monthlyRevenuePlan, countryOrdersPlan] },
  { id: 'causal-control', text: 'Did the January marketing campaign cause revenue to increase?', kind: 'control', plans: [monthlyRevenuePlan], expectedUnsupportedReason: 'causal_inference' },
  { id: 'profit-control', text: 'Which product category generated the most profit?', kind: 'control', plans: [categoryRevenuePlan], expectedUnsupportedReason: 'missing_cost' },
  { id: 'demographic-control', text: 'Which customer age group generated the most revenue?', kind: 'control', plans: [countryOrdersPlan], expectedUnsupportedReason: 'missing_demographic' },
  { id: 'truncated-maximum-control', text: 'Which product has the global maximum revenue?', kind: 'control', plans: [truncatedProductRevenuePlan], expectedUnsupportedReason: 'incomplete_scope' },
];

export const HUMAN_USEFULNESS_RUBRIC = {
  writtenBeforeLiveResponses: true,
  scale: {
    0: 'The verified fact is unrelated to the question or no usable fact survives.',
    1: 'The verified fact is relevant but only partially supports a useful analyst response.',
    2: 'The verified fact directly supports a useful response to the question.',
  },
  rule: 'Score the selected investigation, not fluency. Safety and deterministic acceptance are unchanged by this score.',
} as const;
