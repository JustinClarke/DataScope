import type { RawCallArtifact } from '../12-verified-claims/artifactWriter';
import { CLAIM_IR_SCHEMA, parseClaimIR, type ClaimIR } from '../12-verified-claims/claimIr';
import type { EcommerceEvidencePlan, EvidenceFilter } from '../12-verified-claims/ecommercePipeline';
import type { EvidencePacket } from '../12-verified-claims/evidence';
import type { ColumnRef, Metric } from '../12-verified-claims/metrics';
import { UNSUPPORTED_REASONS, type UnsupportedReason } from '../12-verified-claims/phase5Protocol';

export type { DatasetPassport, PassportColumn, PassportTable, Relationship } from '../11-evidence-loop/contracts';
export type { ClaimIR } from '../12-verified-claims/claimIr';
export type { ColumnRef, Metric } from '../12-verified-claims/metrics';
export type { EvidencePacket, EvidenceRow } from '../12-verified-claims/evidence';

/**
 * A capability gap is corroborated or refused deterministically (capabilityGaps.ts); the
 * codes are experiment 12's unchanged UNSUPPORTED_REASONS so a corroborated Checkpoint-1 gap
 * and a Phase 5 negative-control disposition are the same vocabulary.
 */
export type CapabilityGapCode = UnsupportedReason;

export type ProbeCandidateKind =
  | 'summary'
  | 'group_metric'
  | 'time_series'
  | 'compare_periods'
  | 'distribution'
  | 'top_k'
  | 'missingness'
  | 'join_coverage';

export type TypedFilter = EvidenceFilter;

/**
 * How a candidate's evidence is actually produced. Not sent to the model — only
 * ProbeCandidateCard is. 'plan' candidates compile to SQL via experiment 12's unchanged
 * ecommerce compiler; 'missingness'/'join_coverage' read the passport directly (already
 * computed by experiment 11's buildPassport, no SQL needed); 'compare_periods' derives its
 * evidence from an already-resolved source candidate's packet.
 */
export type CandidateResolution =
  | { mode: 'plan'; plan: EcommerceEvidencePlan }
  | { mode: 'missingness' }
  | { mode: 'join_coverage' }
  | { mode: 'compare_periods'; sourceCandidateId: string };

export interface ProbeCandidate {
  id: string;
  kind: ProbeCandidateKind;
  metric: Metric | null;
  dimension?: ColumnRef;
  timeGrain?: 'month' | 'quarter' | 'year';
  filters: TypedFilter[];
  maxResultRows: number;
  estimatedCostClass: 'small' | 'medium';
  /**
   * The pre-registered answer key: which Phase 5 question ids this candidate is relevant to,
   * used only by score.ts's probe-relevance metric. It is deliberately NOT on the card —
   * sending question ids to the model would let it match the asking question's id against a
   * tag string instead of reasoning about the data, making probe relevance circular.
   */
  questionRelevance: string[];
  /** Semantic, data-describing tags. Safe to show a model; carries no question identity. */
  topicTags: string[];
  resolution: CandidateResolution;
}

/**
 * The only candidate shape a model prompt may see (§ Probe candidates: "only `id`, a
 * compiler-authored literal description, cost class, and relevance tags"). `topicTags` is that
 * relevance-tag field, restricted to semantic tags for the reason on `questionRelevance`.
 */
export interface ProbeCandidateCard {
  id: string;
  description: string;
  estimatedCostClass: ProbeCandidate['estimatedCostClass'];
  topicTags: string[];
}

export interface AnalysisOffer {
  id: string;
  description: string;
  /** Scoring-only, same rule as ProbeCandidate.questionRelevance. */
  questionRelevance: string[];
  topicTags: string[];
}

/** The only offer shape a model prompt may see. */
export interface AnalysisOfferCard {
  id: string;
  description: string;
  topicTags: string[];
}

/**
 * The model-facing evidence packet. Structurally a superset of experiment 12's EvidencePacket
 * (same id/metric/unit/dimension/completeness/rows), so it satisfies verifyClaim's
 * `readonly EvidencePacket[]` parameter unchanged (§ Cache and context rules note that the
 * verifier is reused as-is).
 */
export interface CompactEvidencePacket extends EvidencePacket {
  filters: string[];
  sourceRowCount: number;
  returnedRowCount: number;
}

export type AnalysisAction =
  | { action: 'request_probes'; candidateIds: string[] }
  | { action: 'final_claim'; claim: ClaimIR }
  | { action: 'final_offer'; offerId: string }
  | { action: 'unsupported'; reason: CapabilityGapCode };

export interface LoopBudgets {
  maxRounds: number;
  maxProbesPerRound: number;
  maxProbesTotal: number;
  maxRowsPerPacket: number;
  maxPacketsInContext: number;
}

export const DEFAULT_LOOP_BUDGETS: Readonly<LoopBudgets> = {
  maxRounds: 2,
  maxProbesPerRound: 2,
  maxProbesTotal: 4,
  maxRowsPerPacket: 12,
  maxPacketsInContext: 8,
};

/**
 * The exact schema handed to a model as structured-output `format` (§ Thinking and sampling
 * preflight requires "the exact AnalysisAction JSON schema" in both preflight calls). `claim`
 * reuses experiment 12's CLAIM_IR_SCHEMA unchanged rather than re-authoring it.
 */
export const ANALYSIS_ACTION_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { const: 'request_probes' },
        candidateIds: {
          type: 'array',
          minItems: 1,
          maxItems: DEFAULT_LOOP_BUDGETS.maxProbesPerRound,
          items: { type: 'string' },
        },
      },
      required: ['action', 'candidateIds'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: { action: { const: 'final_claim' }, claim: CLAIM_IR_SCHEMA },
      required: ['action', 'claim'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: { action: { const: 'final_offer' }, offerId: { type: 'string' } },
      required: ['action', 'offerId'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: { action: { const: 'unsupported' }, reason: { enum: UNSUPPORTED_REASONS } },
      required: ['action', 'reason'],
    },
  ],
} as const;

/**
 * Arm A's action space (§ Scored arms: "One model call per question; no probe request
 * permitted"). Structurally the same schema minus the `request_probes` branch, so the two arms
 * differ only in whether the loop exists — not in claim/offer/unsupported grammar.
 */
export const FIXED_EVIDENCE_ACTION_SCHEMA = {
  oneOf: ANALYSIS_ACTION_SCHEMA.oneOf.filter((branch) => branch.properties.action.const !== 'request_probes'),
} as const;

export type FixedEvidenceAction = Exclude<AnalysisAction, { action: 'request_probes' }>;

function actionRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('action must be an object');
  return value as Record<string, unknown>;
}

function rejectExtraKeys(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const extras = Object.keys(record).filter((key) => !allowed.includes(key));
  if (extras.length > 0) throw new Error(`${label} contains unsupported fields: ${extras.join(', ')}`);
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value;
}

/** Runtime authority for a model's AnalysisAction JSON — ANALYSIS_ACTION_SCHEMA constrains decoding, this validates it. */
export function parseAnalysisAction(value: unknown): AnalysisAction {
  const record = actionRecord(value);
  const action = record.action;

  if (action === 'request_probes') {
    rejectExtraKeys(record, ['action', 'candidateIds'], 'request_probes');
    if (
      !Array.isArray(record.candidateIds) ||
      record.candidateIds.length === 0 ||
      !record.candidateIds.every((id) => typeof id === 'string' && id.trim() !== '')
    ) {
      throw new Error('request_probes.candidateIds must be a non-empty array of non-empty strings');
    }
    return { action, candidateIds: record.candidateIds as string[] };
  }
  if (action === 'final_claim') {
    rejectExtraKeys(record, ['action', 'claim'], 'final_claim');
    return { action, claim: parseClaimIR(record.claim) };
  }
  if (action === 'final_offer') {
    rejectExtraKeys(record, ['action', 'offerId'], 'final_offer');
    return { action, offerId: nonEmptyString(record.offerId, 'final_offer.offerId') };
  }
  if (action === 'unsupported') {
    rejectExtraKeys(record, ['action', 'reason'], 'unsupported');
    if (typeof record.reason !== 'string' || !UNSUPPORTED_REASONS.includes(record.reason as UnsupportedReason)) {
      throw new Error(`unsupported.reason must be one of ${UNSUPPORTED_REASONS.join(', ')}`);
    }
    return { action, reason: record.reason as CapabilityGapCode };
  }

  throw new Error(`unknown action: ${JSON.stringify(action)}`);
}

/** Runtime authority for Arm A: the same grammar, with `request_probes` unavailable. */
export function parseFixedEvidenceAction(value: unknown): FixedEvidenceAction {
  const action = parseAnalysisAction(value);
  if (action.action === 'request_probes') {
    throw new Error('request_probes is not permitted in the fixed-evidence arm');
  }
  return action;
}

/**
 * Experiment 12's call artifact plus the model's own words (§ Checkpoint 4, Finding 5.2).
 * `parsedValue` and `responseHash` prove that a call happened and that nothing was tampered
 * with afterwards, but they do not let the Checkpoint 5 audit read what the model actually said
 * in a borderline case, which is the audit's purpose. § Artifact additions permits retaining
 * provider reasoning; it is written to the run only, never replayed into a later prompt and
 * never treated as evidence.
 */
export interface CallArtifact extends RawCallArtifact {
  /** Present whenever a response was received; absent on the transport-failure path. */
  rawContent?: string;
  thinking?: string | null;
}

export interface TokenUsage {
  promptTokens: number;
  responseTokens: number;
}

export interface TokenAccounting {
  calls: number;
  totalPromptTokens: number;
  totalResponseTokens: number;
  callHighWaterPromptTokens: number;
}

export const ZERO_TOKEN_ACCOUNTING: Readonly<TokenAccounting> = {
  calls: 0,
  totalPromptTokens: 0,
  totalResponseTokens: 0,
  callHighWaterPromptTokens: 0,
};

export function accountTokens(accounting: Readonly<TokenAccounting>, usage: Readonly<TokenUsage>): TokenAccounting {
  return {
    calls: accounting.calls + 1,
    totalPromptTokens: accounting.totalPromptTokens + usage.promptTokens,
    totalResponseTokens: accounting.totalResponseTokens + usage.responseTokens,
    callHighWaterPromptTokens: Math.max(accounting.callHighWaterPromptTokens, usage.promptTokens),
  };
}
