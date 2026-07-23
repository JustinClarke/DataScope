// The real cloud provider for the eval harness — posts to the live staging
// Worker endpoint and scores the result through the same six-stage pipeline the
// product runs.
//
// Two things keep the router's production rate limits from confounding a quality
// measurement (the limiter itself is unit-tested separately in
// edge/ai-router.test.ts):
//   1. A unique session id per question. The daily Workers-AI quota is
//      per-session (20/day); reusing one session id across the whole set spends
//      that quota within the first ~20 questions and 429s the rest. A fresh
//      session per question gives each its own budget, and its ≤3 retries stay
//      far under both the 20/day and the 10/min per-session limits.
//   2. Request pacing. The one production limit that is keyed on the caller's IP,
//      not the session (30/min), can't be sidestepped with session ids, so the
//      harness spaces its requests to stay under it.
import type { AIProvider, AITool, ProviderMessage, ProviderTurn } from '../../src/types/ai';
import type { AiRouterRequest, AiRouterResponse } from '../../edge/protocol';

// ≥2s between requests keeps the harness under the router's 30/min per-IP floor.
const MIN_REQUEST_SPACING_MS = 2200;
let lastRequestAt = 0;

async function paceRequests(): Promise<void> {
  const wait = lastRequestAt + MIN_REQUEST_SPACING_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

let questionCounter = 0;

export function createCloudEdgeProvider(endpoint: string): AIProvider {
  // One fresh session per provider instance — runHarness creates one instance
  // per question, so each question is its own session (see the note above).
  const sessionId = `eval-${Date.now()}-${questionCounter++}`;
  let attempt = 0;
  return {
    id: 'cloud-edge',
    async complete(messages: ProviderMessage[], tools: AITool[]): Promise<ProviderTurn> {
      attempt += 1;
      await paceRequests();
      // Map to wire format (structurally identical; the cast is safe).
      const wireMessages = messages.map((m) => m as AiRouterRequest['messages'][number]);
      const request: AiRouterRequest = {
        sessionId,
        routing: 'free-tier-first',
        messages: wireMessages,
        tools,
        attempt,
      };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error: string };
        throw new Error(`cloud-edge ${response.status}: ${body.error}`);
      }
      const data = (await response.json()) as AiRouterResponse;
      return data.turn;
    },
  };
}
