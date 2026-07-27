// The Workers-AI-backed SynthesisProvider — the model call behind the synthesis
// endpoint. The model is never asked for the slice itself: it returns only a
// re-phrased headline, a permutation of the baseline's action indices, and a
// re-phrased verb per action, and this adapter reassembles the full slice from
// the baseline it already holds. Adding, dropping, or altering an action is
// therefore unrepresentable in the model's output format, not merely forbidden —
// the same structural bind the endpoint's re-phrase/re-order contract promises.
// The client's seam validators remain the trust boundary on top of this; the
// producer never self-certifies.
//
// One non-streaming `env.AI.run` per call: the output is a single small JSON
// object, not a conversation, so there is nothing to stream. Any malformed or
// out-of-contract model output throws, and the endpoint echoes the baseline back
// (the caller stays on the deterministic answer it already painted).
import type { Ai } from '../bindings'
import type { SynthesisProvider } from '../handlers/synthesis'
import type { SynthesisRequest, SynthesisResponse, WireProviderMessage } from '../protocol'
import { WorkersAiCeilingError, type ByokResolver, type InferenceProvider } from '../handlers/ai-router'
import { isCeilingSignal } from '../adapters'

/**
 * Loose shape of a non-streaming Workers AI chat result. Read defensively:
 * `choices[0].message.content` is the stable text field; the top-level
 * `response` mirror is type-unstable (probed live — when the model answers
 * with a JSON object, Workers AI hands `response` back *already parsed* as an
 * object, not a string), so it is only a fallback.
 */
interface ChatResult {
  response?: unknown
  choices?: Array<{ message?: { content?: unknown } }>
}

/** The model's answer text, from whichever field carried it. Throws when neither did. */
function modelText(result: ChatResult): string {
  const content = result.choices?.[0]?.message?.content
  if (typeof content === 'string' && content.trim() !== '') return content
  if (typeof result.response === 'string') return result.response
  if (typeof result.response === 'object' && result.response !== null) {
    // The pre-parsed mirror; re-serialize so one parse path validates the shape.
    return JSON.stringify(result.response)
  }
  throw new Error('no text response')
}

/** The only shape the model may answer with. */
interface ModelAnswer {
  headline: string
  actions: Array<{ index: number; verb: string }>
}

// Wording the client's honesty guard rejects (permanence / causal / "verified"
// claims). Named in the prompt so a compliant answer passes the guard instead of
// burning the call on a rephrase that gets degraded client-side. Exported so a
// widened-prompt variant (S0 Probe A) cites the identical guard instead of a
// second, drifting copy.
export const FORBIDDEN_WORDS =
  'always, never, permanent, permanently, guaranteed, invariant, certain, certainly, proven, verified, confirmed, because, causes, caused, due to, leads to, results in, drives'

// Exported (with `synthesisUserPrompt` and `parseModelAnswer`) so the
// in-browser WebLLM producer speaks the exact same contract: same instructions,
// same only-representable-output shape, same parse-time invariants. The edge
// never imports the app; the app importing these pure pieces keeps one contract.
export const SYNTHESIS_SYSTEM_PROMPT = [
  'You polish the opening screen of a data-analysis app. You receive a dataset\'s',
  'structure (tables, columns, types, null rates — never any data rows), a',
  'deterministic headline sentence about it, and a numbered list of suggested',
  'next explorations.',
  '',
  'Rewrite the headline as one short, inviting, concrete sentence, different',
  'from the given one. Every number in the given headline MUST appear verbatim',
  'in yours — same digits, same decimal places, same % sign ("0.976" stays',
  '"0.976", "5.4% null" keeps "5.4%"). Keep table/column names exactly as',
  `given; add no new claims. Never use any of these words: ${FORBIDDEN_WORDS}.`,
  '',
  'Then re-order the suggested explorations from most to least interesting for',
  'this specific dataset, and re-phrase each one\'s label as a short imperative',
  '(at most ~8 words). You may not add, drop, or merge explorations — return',
  'exactly the given indices, each exactly once.',
  '',
  'Answer with ONLY this JSON, no prose, no code fences:',
  '{"headline": "...", "actions": [{"index": 0, "verb": "..."}, ...]}',
].join('\n')

export function synthesisUserPrompt(req: SynthesisRequest): string {
  return JSON.stringify({
    structure: req.facts,
    headline: req.baseline.headlineFact.statement,
    explorations: req.baseline.actions.map((a, index) => ({ index, verb: a.verb })),
  })
}

/** Settles with the promise or an AbortError when `signal` fires (Ai.run takes no signal). */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new DOMException('aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e) => {
        signal.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}

/**
 * Parses the model's text into a ModelAnswer, tolerating a fenced or
 * prose-wrapped JSON object but nothing structurally out of contract. Throws on
 * any violation — a non-permutation, a wrong length, a missing field — so the
 * endpoint degrades to the baseline instead of serving a mangled slice.
 */
export function parseModelAnswer(raw: string, actionCount: number): ModelAnswer {
  // Models sometimes fence or preface the JSON despite instructions; take the
  // outermost object literal.
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('no JSON object in model output')
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<ModelAnswer>

  if (typeof parsed.headline !== 'string' || parsed.headline.trim() === '') {
    throw new Error('missing headline')
  }
  if (!Array.isArray(parsed.actions) || parsed.actions.length !== actionCount) {
    throw new Error('action count mismatch')
  }
  const seen = new Set<number>()
  for (const entry of parsed.actions) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof entry.index !== 'number' ||
      !Number.isInteger(entry.index) ||
      entry.index < 0 ||
      entry.index >= actionCount ||
      seen.has(entry.index) ||
      typeof entry.verb !== 'string' ||
      entry.verb.trim() === ''
    ) {
      throw new Error('actions are not a re-phrased permutation')
    }
    seen.add(entry.index)
  }
  return { headline: parsed.headline.trim(), actions: parsed.actions }
}

/** Reassembles the full slice from the baseline + the model's answer — the only
 * path to a response. Exported so a harness testing a substitute system prompt
 * (S0 Probe A) can reassemble a `SynthesisResponse` from a `ModelAnswer` too,
 * without a second reassembly path (D58). */
export function sliceFromAnswer(req: SynthesisRequest, answer: ModelAnswer): SynthesisResponse {
  return {
    headlineFact: { ...req.baseline.headlineFact, statement: answer.headline },
    actions: answer.actions.map(({ index, verb }) => ({
      ...req.baseline.actions[index],
      verb,
    })),
  }
}

export function createWorkersAiSynthesisProvider(ai: Ai, model: string): SynthesisProvider {
  return {
    async synthesize(req: SynthesisRequest, signal: AbortSignal): Promise<SynthesisResponse> {
      let result: ChatResult
      try {
        result = (await raceAbort(
          ai.run(model, {
            messages: [
              { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
              { role: 'user', content: synthesisUserPrompt(req) },
            ],
            max_tokens: 512,
          }),
          signal,
        )) as ChatResult
      } catch (err) {
        // The account-wide free pool's ceiling, classified like the ai-router's
        // provider does, so the routing wrapper can overflow to a BYOK key.
        if (isCeilingSignal(err)) throw new WorkersAiCeilingError()
        throw err
      }

      return sliceFromAnswer(req, parseModelAnswer(modelText(result), req.baseline.actions.length))
    },
  }
}

/** The synthesis contract run over a generic `InferenceProvider` (the BYOK adapters):
 * same prompts, no tools, the final text parsed through the same only-representable
 * answer shape. The key custody is the provider's own (byok.ts) — nothing here sees it. */
async function synthesizeVia(
  provider: InferenceProvider,
  req: SynthesisRequest,
  signal: AbortSignal,
): Promise<SynthesisResponse> {
  const messages: WireProviderMessage[] = [
    { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
    { role: 'user', content: synthesisUserPrompt(req) },
  ]
  const gen = provider.infer(messages, [], signal)
  let text: string | null = null
  for (let step = await gen.next(); !step.done; step = await gen.next()) {
    if (step.value.type === 'done') {
      text = step.value.turn.kind === 'text' ? step.value.turn.text : null
      break
    }
  }
  if (text === null) throw new Error('no text response')
  return sliceFromAnswer(req, parseModelAnswer(text, req.baseline.actions.length))
}

/**
 * The D3 routing wrapper behind the synthesis seam. Prefer-key runs 100% via the
 * user's provider (an unresolvable credential throws, so the endpoint echoes the
 * baseline — no silent fallback to the free pool). Free-tier-first runs Workers AI
 * and overflows to the key only on the pool's ceiling — a parse failure never
 * spends the user's key on a retry. Any other failure propagates, and the endpoint
 * degrades to the deterministic baseline the client already painted.
 */
export function createRoutingSynthesisProvider(
  workersAi: SynthesisProvider,
  byok: ByokResolver,
): SynthesisProvider {
  return {
    async synthesize(req: SynthesisRequest, signal: AbortSignal): Promise<SynthesisResponse> {
      if (req.routing === 'prefer-key') {
        if (req.byok === undefined) throw new Error('prefer-key without a credential')
        const provider = await byok.resolve(req.byok, signal)
        if (provider === null) throw new Error('unresolvable credential')
        return synthesizeVia(provider, req, signal)
      }
      try {
        return await workersAi.synthesize(req, signal)
      } catch (err) {
        if (err instanceof WorkersAiCeilingError && req.byok !== undefined) {
          const provider = await byok.resolve(req.byok, signal)
          if (provider !== null) return synthesizeVia(provider, req, signal)
        }
        throw err
      }
    },
  }
}
