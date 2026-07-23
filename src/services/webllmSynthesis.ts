// The in-browser synthesis producer — the same re-phrase/re-rank contract the
// edge Worker serves, run on the warm local model with zero egress. It reuses
// the edge's exact prompt and parse invariants (one contract, two hosts): the
// model may return only a re-phrased headline, a permutation of action indices,
// and re-phrased verbs, so adding, dropping, or altering an action stays
// unrepresentable in its output. The caller's seam validators remain the trust
// boundary on top — this producer never self-certifies.
import type { SynthesisRequest, SynthesisResponse } from '../../edge/protocol';
import {
  SYNTHESIS_SYSTEM_PROMPT,
  synthesisUserPrompt,
  parseModelAnswer,
} from '../../edge/ai/synthesisProvider';
import { webllmChat, type WebLLMChatMessage } from './webllm';

/**
 * One local synthesis pass. Throws on any out-of-contract model output (the
 * caller falls to the next rung — edge, then the deterministic baseline).
 */
export async function synthesizeLocally(
  request: SynthesisRequest,
  chat: (messages: WebLLMChatMessage[], options?: { maxTokens?: number }) => Promise<string> = webllmChat,
): Promise<SynthesisResponse> {
  const raw = await chat(
    [
      { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
      { role: 'user', content: synthesisUserPrompt(request) },
    ],
    { maxTokens: 512 },
  );
  const answer = parseModelAnswer(raw, request.baseline.actions.length);
  return {
    headlineFact: { ...request.baseline.headlineFact, statement: answer.headline },
    actions: answer.actions.map(({ index, verb }) => ({
      ...request.baseline.actions[index],
      verb,
    })),
  };
}
