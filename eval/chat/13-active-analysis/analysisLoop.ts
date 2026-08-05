import type { EvalEngine } from '../../duckdb/duckdb';
import type { ArtifactWriter } from '../12-verified-claims/artifactWriter';
import { renderFact } from './renderer';
import { verifyClaim, type RejectionReason, type VerifiedFact } from '../12-verified-claims/verifier';
import { buildCapabilityGapMap, corroborateUnsupported, type CapabilityGapMap } from './capabilityGaps';
import { candidateCacheKey, datasetContentHash, type EvidenceCache } from './cache';
import { artifactStem } from './repeats';
import {
  resolveComparePeriodsCandidate,
  resolveJoinCoverageCandidate,
  resolveMissingnessCandidate,
  resolvePlanCandidate,
} from './compactEvidence';
import {
  DEFAULT_LOOP_BUDGETS,
  type AnalysisAction,
  type AnalysisOffer,
  type CapabilityGapCode,
  type ClaimIR,
  type CompactEvidencePacket,
  type DatasetPassport,
  type LoopBudgets,
  type ProbeCandidate,
} from './contracts';

export interface LoopState {
  readonly questionId: string;
  readonly passport: DatasetPassport;
  readonly datasetHash: string;
  readonly candidates: readonly ProbeCandidate[];
  readonly offers: readonly AnalysisOffer[];
  readonly gaps: CapabilityGapMap;
  readonly budgets: Readonly<LoopBudgets>;
  readonly cache: EvidenceCache;
  readonly round: number;
  readonly executedCandidateIds: readonly string[];
  readonly resolvedByCandidateId: ReadonlyMap<string, CompactEvidencePacket>;
  readonly repeatId?: string;
}

export function createLoopState(options: {
  questionId: string;
  passport: DatasetPassport;
  candidates: readonly ProbeCandidate[];
  offers: readonly AnalysisOffer[];
  cache: EvidenceCache;
  budgets?: Readonly<LoopBudgets>;
  repeatId?: string;
}): LoopState {
  return {
    questionId: options.questionId,
    passport: options.passport,
    datasetHash: datasetContentHash(options.passport),
    candidates: options.candidates,
    offers: options.offers,
    gaps: buildCapabilityGapMap(options.passport),
    budgets: options.budgets ?? DEFAULT_LOOP_BUDGETS,
    cache: options.cache,
    round: 0,
    executedCandidateIds: [],
    resolvedByCandidateId: new Map(),
    ...(options.repeatId === undefined ? {} : { repeatId: options.repeatId }),
  };
}

/** § Metrics and ROI, "context high-water": the most recent packets win when the context cap binds. */
export function selectContextPackets(state: LoopState): CompactEvidencePacket[] {
  return [...state.resolvedByCandidateId.values()].slice(-state.budgets.maxPacketsInContext);
}

export type ProbeRejectionCode = 'unknown_candidate' | 'duplicate_probe' | 'over_budget' | 'wrong_type' | 'dependency_unresolved';

export interface ProbeRejection {
  candidateId: string;
  code: ProbeRejectionCode;
}

export type LoopDisposition =
  | { kind: 'final_claim'; claim: ClaimIR; fact: VerifiedFact; rendered: string }
  | { kind: 'rejected_claim'; claim: ClaimIR; reason: RejectionReason; detail: string }
  | { kind: 'final_offer'; offerId: string }
  | { kind: 'rejected_offer'; offerId: string }
  | { kind: 'unsupported'; reason: CapabilityGapCode }
  | { kind: 'rejected_unsupported'; reason: CapabilityGapCode }
  | { kind: 'no_useful_verified_result' };

export type StepOutcome =
  | { status: 'probes_resolved'; state: LoopState; resolved: CompactEvidencePacket[] }
  | { status: 'probes_rejected'; state: LoopState; rejections: ProbeRejection[] }
  | { status: 'terminal'; state: LoopState; disposition: LoopDisposition };

function classifyRequest(
  state: LoopState,
  candidateIds: readonly string[],
): { accepted: string[] } | { rejections: ProbeRejection[] } {
  if (candidateIds.length === 0) return { rejections: [{ candidateId: '', code: 'over_budget' }] };
  const unique = [...new Set(candidateIds)];
  const hadDuplicatesWithinRequest = unique.length !== candidateIds.length;

  const idIssues = unique
    .map((id): ProbeRejection | null => {
      if (state.offers.some((offer) => offer.id === id)) return { candidateId: id, code: 'wrong_type' };
      if (!state.candidates.some((candidate) => candidate.id === id)) return { candidateId: id, code: 'unknown_candidate' };
      if (state.executedCandidateIds.includes(id)) return { candidateId: id, code: 'duplicate_probe' };
      return null;
    })
    .filter((rejection): rejection is ProbeRejection => rejection !== null);
  if (idIssues.length > 0) return { rejections: idIssues };

  const overBudget =
    hadDuplicatesWithinRequest ||
    unique.length > state.budgets.maxProbesPerRound ||
    state.round >= state.budgets.maxRounds ||
    state.executedCandidateIds.length + unique.length > state.budgets.maxProbesTotal;
  if (overBudget) return { rejections: unique.map((id) => ({ candidateId: id, code: 'over_budget' as const })) };

  return { accepted: unique };
}

async function resolveOne(
  engine: EvalEngine,
  state: LoopState,
  candidate: ProbeCandidate,
  resolvedByCandidateId: Map<string, CompactEvidencePacket>,
  writer: ArtifactWriter | undefined,
): Promise<CompactEvidencePacket> {
  const cacheKey = candidateCacheKey({
    datasetHash: state.datasetHash,
    candidate,
    ...(state.repeatId === undefined ? {} : { repeatId: state.repeatId }),
  });
  const cached = state.cache.get(cacheKey);
  if (cached) {
    await writer?.appendEvent('cache_hit', { questionId: state.questionId, candidateId: candidate.id, cacheKey });
    return cached;
  }

  const resolution = candidate.resolution;
  let sql: string | null = null;
  let packet: CompactEvidencePacket;
  switch (resolution.mode) {
    case 'plan': {
      const result = await resolvePlanCandidate(engine, resolution.plan);
      sql = result.sql;
      packet = result.packet;
      break;
    }
    case 'missingness':
      packet = resolveMissingnessCandidate(candidate.id, state.passport);
      break;
    case 'join_coverage':
      packet = resolveJoinCoverageCandidate(candidate.id, state.passport);
      break;
    case 'compare_periods': {
      const source = resolvedByCandidateId.get(resolution.sourceCandidateId);
      if (!source) throw new Error(`dependency ${resolution.sourceCandidateId} not resolved for ${candidate.id}`);
      packet = resolveComparePeriodsCandidate(candidate.id, source);
      break;
    }
  }

  state.cache.set(cacheKey, packet);
  await writer?.appendEvent('cache_miss', { questionId: state.questionId, candidateId: candidate.id, cacheKey });
  const artifactName = `${artifactStem(state.questionId, state.repeatId)}-r${state.round + 1}-${candidate.id}`;
  if (sql) await writer?.writeSqlArtifact(`${artifactName}.sql`, sql);
  await writer?.writeJsonArtifact('evidence', `${artifactName}.json`, packet);
  await writer?.appendEvent('probe_executed', { questionId: state.questionId, candidateId: candidate.id, cacheKey });
  return packet;
}

async function handleRequestProbes(
  engine: EvalEngine,
  state: LoopState,
  candidateIds: readonly string[],
  writer: ArtifactWriter | undefined,
): Promise<StepOutcome> {
  await writer?.appendEvent('probe_requested', { questionId: state.questionId, round: state.round + 1, candidateIds });
  const classification = classifyRequest(state, candidateIds);
  if ('rejections' in classification) {
    await writer?.appendEvent('probe_rejected', { questionId: state.questionId, rejections: classification.rejections });
    return { status: 'probes_rejected', state, rejections: classification.rejections };
  }

  const byId = new Map(state.candidates.map((candidate) => [candidate.id, candidate]));
  const dependencyRejections = classification.accepted
    .map((id): ProbeRejection | null => {
      const candidate = byId.get(id)!;
      if (candidate.resolution.mode !== 'compare_periods') return null;
      return state.resolvedByCandidateId.has(candidate.resolution.sourceCandidateId)
        ? null
        : { candidateId: id, code: 'dependency_unresolved' };
    })
    .filter((rejection): rejection is ProbeRejection => rejection !== null);
  if (dependencyRejections.length > 0) {
    await writer?.appendEvent('probe_rejected', { questionId: state.questionId, rejections: dependencyRejections });
    return { status: 'probes_rejected', state, rejections: dependencyRejections };
  }

  const resolvedByCandidateId = new Map(state.resolvedByCandidateId);
  const resolved: CompactEvidencePacket[] = [];
  for (const id of classification.accepted) {
    const packet = await resolveOne(engine, state, byId.get(id)!, resolvedByCandidateId, writer);
    resolvedByCandidateId.set(id, packet);
    resolved.push(packet);
  }

  const nextState: LoopState = {
    ...state,
    round: state.round + 1,
    executedCandidateIds: [...state.executedCandidateIds, ...classification.accepted],
    resolvedByCandidateId,
  };
  return { status: 'probes_resolved', state: nextState, resolved };
}

async function handleFinalClaim(state: LoopState, claim: ClaimIR, writer: ArtifactWriter | undefined): Promise<StepOutcome> {
  const evidence = [...state.resolvedByCandidateId.values()];
  const result = verifyClaim(claim, evidence);
  if (!result.accepted) {
    await writer?.appendEvent('claim_evaluated', { questionId: state.questionId, accepted: false, reason: result.reason });
    return {
      status: 'terminal',
      state,
      disposition: { kind: 'rejected_claim', claim, reason: result.reason, detail: result.detail },
    };
  }
  const rendered = renderFact(result.fact, claim, evidence);
  await writer?.writeJsonArtifact('claims', `${artifactStem(state.questionId, state.repeatId)}-claim.json`, {
    claim,
    fact: result.fact,
    rendered,
  });
  await writer?.appendEvent('claim_evaluated', { questionId: state.questionId, accepted: true });
  return { status: 'terminal', state, disposition: { kind: 'final_claim', claim, fact: result.fact, rendered } };
}

async function handleFinalOffer(state: LoopState, offerId: string, writer: ArtifactWriter | undefined): Promise<StepOutcome> {
  const accepted = state.offers.some((offer) => offer.id === offerId);
  await writer?.appendEvent('offer_evaluated', { questionId: state.questionId, offerId, accepted });
  return {
    status: 'terminal',
    state,
    disposition: accepted ? { kind: 'final_offer', offerId } : { kind: 'rejected_offer', offerId },
  };
}

async function handleUnsupported(
  state: LoopState,
  reason: CapabilityGapCode,
  writer: ArtifactWriter | undefined,
): Promise<StepOutcome> {
  const corroborated = corroborateUnsupported(reason, state.gaps, [...state.resolvedByCandidateId.values()]);
  await writer?.appendEvent('unsupported_evaluated', { questionId: state.questionId, reason, corroborated });
  return {
    status: 'terminal',
    state,
    disposition: corroborated ? { kind: 'unsupported', reason } : { kind: 'rejected_unsupported', reason },
  };
}

export interface StepInput {
  engine: EvalEngine;
  state: LoopState;
  action: AnalysisAction;
  writer?: ArtifactWriter;
}

export async function step({ engine, state, action, writer }: StepInput): Promise<StepOutcome> {
  if (action.action === 'request_probes') return handleRequestProbes(engine, state, action.candidateIds, writer);
  if (action.action === 'final_claim') return handleFinalClaim(state, action.claim, writer);
  if (action.action === 'final_offer') return handleFinalOffer(state, action.offerId, writer);
  return handleUnsupported(state, action.reason, writer);
}

/** Budget exhaustion without a terminal action is failure, not fabricated success (§ Hard stop). */
export function exhausted(): LoopDisposition {
  return { kind: 'no_useful_verified_result' };
}
