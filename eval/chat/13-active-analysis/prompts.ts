import type { Phase5Question } from '../12-verified-claims/phase5Protocol';
import { selectContextPackets, type LoopState } from './analysisLoop';
import type { AnalysisOfferCard, ProbeCandidateCard } from './contracts';
import type { DatasetMap } from './datasetMap';

/**
 * Arm B's prompt surface, extracted so a diagnostic can issue the exact prompts a scored run
 * issues rather than a copy that can drift. Byte-identical to the prompt Checkpoint 3's
 * diversity screen ran under.
 */
export const SYSTEM_PROMPT = [
  'You are the analysis planner in a bounded evidence-acquisition loop.',
  'Take exactly one action per turn, expressed as a single JSON object matching one of these four shapes:',
  '{"action":"request_probes","candidateIds":[...]} to request evidence from one or two of the listed candidate computation ids.',
  '{"action":"final_claim","claim":{...}} to state a verified factual claim from evidence already shown to you in this conversation.',
  '{"action":"final_offer","offerId":"..."} to select a precomputed executable offer by its exact id.',
  '{"action":"unsupported","reason":"..."} to report that the question cannot be answered with the available data.',
  'Only candidate ids present in the candidate menu are valid for request_probes, and only offer ids present in the offer menu are valid for final_offer.',
  'final_claim is only legal when the evidence it cites has already been shown to you in this conversation.',
  'Return exactly one JSON object and nothing else outside it.',
].join(' ');

export function turn1Prompt(
  question: Phase5Question,
  datasetMap: DatasetMap,
  candidates: readonly ProbeCandidateCard[],
  offers: readonly AnalysisOfferCard[],
): string {
  return [
    `Question: ${question.text}`,
    `Dataset map: ${JSON.stringify(datasetMap)}`,
    `Available candidate computations: ${JSON.stringify(candidates)}`,
    `Available executable offers: ${JSON.stringify(offers)}`,
    'Budgets: at most 2 candidate ids per request_probes call, at most 2 probe rounds, at most 4 probes total per question.',
    'No evidence has been computed yet for this question. Choose your next action.',
  ].join('\n');
}

/**
 * § Turn 2: regenerated from minimal state — question, compact evidence so far, unresolved
 * candidates, remaining budgets, the same output contract. It deliberately omits the dataset
 * map, the first prompt, SQL, full query results, and any raw provider response or thinking.
 */
export function laterTurnPrompt(
  question: Phase5Question,
  state: LoopState,
  unresolved: readonly ProbeCandidateCard[],
  offers: readonly AnalysisOfferCard[],
): string {
  const remainingRounds = state.budgets.maxRounds - state.round;
  const remainingProbes = state.budgets.maxProbesTotal - state.executedCandidateIds.length;
  const mayRequest = remainingRounds > 0 && remainingProbes > 0 && unresolved.length > 0;
  return [
    `Question: ${question.text}`,
    `Evidence computed so far: ${JSON.stringify(selectContextPackets(state))}`,
    `Candidate computations not yet run: ${JSON.stringify(unresolved)}`,
    `Available executable offers: ${JSON.stringify(offers)}`,
    `Budgets: ${remainingRounds} probe round(s) and ${remainingProbes} probe(s) remaining.`,
    mayRequest
      ? 'Choose your next action: request more evidence, or conclude with final_claim, final_offer, or unsupported.'
      : 'No probe budget remains. Conclude with final_claim, final_offer, or unsupported.',
  ].join('\n');
}
