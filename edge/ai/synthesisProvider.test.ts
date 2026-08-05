import { describe, it, expect } from 'vitest'
import {
  createWorkersAiSynthesisProvider,
  createRoutingSynthesisProvider,
  parseModelAnswer,
} from './synthesisProvider'
import { WorkersAiCeilingError, type ByokResolver, type InferenceProvider } from '../handlers/ai-router'
import type { SynthesisProvider } from '../handlers/synthesis'
import type { Ai } from '../bindings'
import type { ByokCredential, SynthesisRequest, WireProviderMessage } from '../protocol'

const request: SynthesisRequest = {
  sessionId: 's-1',
  facts: {
    tables: [
      {
        name: 'orders',
        rowCount: 1200,
        columns: [
          { name: 'order_id', semanticType: 'identifier', physicalType: 'BIGINT', nullPercentage: 0, cardinality: 1200 },
          { name: 'revenue', semanticType: 'measure', physicalType: 'DOUBLE', nullPercentage: 0, cardinality: 900 },
        ],
      },
    ],
  },
  baseline: {
    headlineFact: {
      statement: '1,200 orders across 2 columns.',
      sql: 'SELECT count(*) FROM orders',
      snapshot: '2026-07-21T00:00:00Z',
      confidence: 'high',
      provenance: 'schema',
    },
    actions: [
      {
        verb: 'Chart revenue over order_id',
        module: 'charts',
        prefill: { module: 'charts', prefilledConfig: { table: 'orders' } },
        evidence: { statement: 'e1', sql: 'q1', snapshot: 's', confidence: 'high', provenance: 'insight-rule' },
        score: 0.8,
      },
      {
        verb: 'Profile orders',
        module: 'profile',
        prefill: { module: 'profile', prefilledConfig: { table: 'orders' } },
        evidence: { statement: 'e2', sql: 'q2', snapshot: 's', confidence: 'high', provenance: 'insight-rule' },
        score: 0.6,
      },
    ],
  },
}

function fakeAi(response: unknown): Ai & { calls: Array<{ model: string; inputs: Record<string, unknown> }> } {
  const calls: Array<{ model: string; inputs: Record<string, unknown> }> = []
  return {
    calls,
    run(model, inputs) {
      calls.push({ model, inputs })
      return Promise.resolve(response)
    },
  }
}

const goodAnswer = JSON.stringify({
  headline: 'Your 1,200 orders, ready to explore.',
  actions: [
    { index: 1, verb: 'Profile the orders table' },
    { index: 0, verb: 'Chart revenue' },
  ],
})

describe('createWorkersAiSynthesisProvider', () => {
  it('reassembles the slice from the baseline: only order, verbs, and headline change', async () => {
    const ai = fakeAi({ response: goodAnswer })
    const provider = createWorkersAiSynthesisProvider(ai, 'test-model')
    const slice = await provider.synthesize(request, new AbortController().signal)

    expect(slice.headlineFact).toEqual({ ...request.baseline.headlineFact, statement: 'Your 1,200 orders, ready to explore.' })
    // Re-ordered: baseline[1] first, baseline[0] second; every non-verb field intact.
    expect(slice.actions.map((a) => a.module)).toEqual(['profile', 'charts'])
    expect(slice.actions.map((a) => a.verb)).toEqual(['Profile the orders table', 'Chart revenue'])
    expect(slice.actions[0]).toEqual({ ...request.baseline.actions[1], verb: 'Profile the orders table' })
    expect(slice.actions[1]).toEqual({ ...request.baseline.actions[0], verb: 'Chart revenue' })
  })

  it('sends structure + baseline only, non-streaming', async () => {
    const ai = fakeAi({ response: goodAnswer })
    await createWorkersAiSynthesisProvider(ai, 'test-model').synthesize(request, new AbortController().signal)

    expect(ai.calls).toHaveLength(1)
    const { model, inputs } = ai.calls[0]
    expect(model).toBe('test-model')
    expect(inputs.stream).toBeUndefined()
    const wire = JSON.stringify(inputs.messages)
    // The structural fragment and the baseline verbs cross; nothing row-shaped exists to cross.
    expect(wire).toContain('semanticType')
    expect(wire).toContain('Chart revenue over order_id')
  })

  it('tolerates fenced / prose-wrapped JSON', () => {
    const fenced = '```json\n' + goodAnswer + '\n```'
    expect(parseModelAnswer(fenced, 2).headline).toBe('Your 1,200 orders, ready to explore.')
  })

  it('throws on garbled output', async () => {
    const ai = fakeAi({ response: 'sorry, here is a poem about your data' })
    await expect(
      createWorkersAiSynthesisProvider(ai, 'm').synthesize(request, new AbortController().signal),
    ).rejects.toThrow()
  })

  it('throws when the answer is not a permutation (dropped, duplicated, or out-of-range index)', () => {
    expect(() => parseModelAnswer(JSON.stringify({ headline: 'h', actions: [{ index: 0, verb: 'v' }] }), 2)).toThrow()
    expect(() =>
      parseModelAnswer(JSON.stringify({ headline: 'h', actions: [{ index: 0, verb: 'v' }, { index: 0, verb: 'w' }] }), 2),
    ).toThrow()
    expect(() =>
      parseModelAnswer(JSON.stringify({ headline: 'h', actions: [{ index: 0, verb: 'v' }, { index: 2, verb: 'w' }] }), 2),
    ).toThrow()
  })

  it('throws on a missing text response', async () => {
    const ai = fakeAi({ tool_calls: [] })
    await expect(
      createWorkersAiSynthesisProvider(ai, 'm').synthesize(request, new AbortController().signal),
    ).rejects.toThrow('no text response')
  })

  it('reads choices[0].message.content (the live non-streaming shape)', async () => {
    const ai = fakeAi({ choices: [{ message: { content: goodAnswer } }], response: 123 })
    const slice = await createWorkersAiSynthesisProvider(ai, 'm').synthesize(request, new AbortController().signal)
    expect(slice.headlineFact.statement).toBe('Your 1,200 orders, ready to explore.')
  })

  it('accepts the pre-parsed response-mirror object (type-unstable live shape)', async () => {
    const ai = fakeAi({ response: JSON.parse(goodAnswer) })
    const slice = await createWorkersAiSynthesisProvider(ai, 'm').synthesize(request, new AbortController().signal)
    expect(slice.actions.map((a) => a.module)).toEqual(['profile', 'charts'])
  })

  it('abort mid-call settles with AbortError instead of hanging', async () => {
    const hanging: Ai = { run: () => new Promise(() => undefined) }
    const controller = new AbortController()
    const pending = createWorkersAiSynthesisProvider(hanging, 'm').synthesize(request, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('classifies a pool-ceiling error so the routing wrapper can overflow', async () => {
    const ai: Ai = { run: () => Promise.reject(new Error('3040: account limited, too many requests')) }
    await expect(
      createWorkersAiSynthesisProvider(ai, 'm').synthesize(request, new AbortController().signal),
    ).rejects.toBeInstanceOf(WorkersAiCeilingError)
  })
})

// ── The D3 routing wrapper ──────────────────────────────────────────────────

const credential: ByokCredential = { provider: 'openai', key: 'sk-test-canary' }

/** An InferenceProvider that answers with a fixed text turn, recording its inputs. */
function fakeInference(text: string): InferenceProvider & { calls: WireProviderMessage[][] } {
  const calls: WireProviderMessage[][] = []
  return {
    id: 'byok',
    calls,
    // eslint-disable-next-line require-yield
    async *infer(messages) {
      calls.push(messages)
      yield { type: 'done' as const, turn: { text, calls: [] }, tokensIn: 10, tokensOut: 5 }
    },
  }
}

function fakeResolver(provider: InferenceProvider | null): ByokResolver & { resolved: ByokCredential[] } {
  const resolved: ByokCredential[] = []
  return {
    resolved,
    resolve(cred) {
      resolved.push(cred)
      return Promise.resolve(provider)
    },
  }
}

function fakeSynthesis(behavior: () => ReturnType<SynthesisProvider['synthesize']>): SynthesisProvider & { calls: number[] } {
  const calls: number[] = []
  return {
    calls,
    synthesize() {
      calls.push(1)
      return behavior()
    },
  }
}

describe('createRoutingSynthesisProvider', () => {
  const signal = () => new AbortController().signal

  it('prefer-key runs 100% via the user’s provider; Workers AI is never called', async () => {
    const byokProvider = fakeInference(goodAnswer)
    const workersAi = fakeSynthesis(() => Promise.reject(new Error('must not be called')))
    const routing = createRoutingSynthesisProvider(workersAi, fakeResolver(byokProvider))

    const slice = await routing.synthesize({ ...request, routing: 'prefer-key', byok: credential }, signal())
    expect(slice.actions.map((a) => a.module)).toEqual(['profile', 'charts'])
    expect(workersAi.calls).toHaveLength(0)
    expect(byokProvider.calls).toHaveLength(1)
    // Same contract as the Workers-AI rung: prompts carry structure + baseline, never the key.
    expect(JSON.stringify(byokProvider.calls[0])).not.toContain('sk-test-canary')
  })

  it('prefer-key with no or an unresolvable credential throws (baseline echo), never falls back to the pool', async () => {
    const workersAi = fakeSynthesis(() => Promise.reject(new Error('must not be called')))
    const routing = createRoutingSynthesisProvider(workersAi, fakeResolver(null))

    await expect(routing.synthesize({ ...request, routing: 'prefer-key' }, signal())).rejects.toThrow()
    await expect(
      routing.synthesize({ ...request, routing: 'prefer-key', byok: credential }, signal()),
    ).rejects.toThrow()
    expect(workersAi.calls).toHaveLength(0)
  })

  it('free-tier-first serves from Workers AI without touching the resolver', async () => {
    const workersAi = fakeSynthesis(() =>
      Promise.resolve({ headlineFact: request.baseline.headlineFact, actions: request.baseline.actions }),
    )
    const resolver = fakeResolver(fakeInference(goodAnswer))
    const routing = createRoutingSynthesisProvider(workersAi, resolver)

    await routing.synthesize({ ...request, routing: 'free-tier-first', byok: credential }, signal())
    expect(workersAi.calls).toHaveLength(1)
    expect(resolver.resolved).toHaveLength(0)
  })

  it('free-tier-first overflows to the key on the pool ceiling only', async () => {
    const byokProvider = fakeInference(goodAnswer)
    const ceiling = fakeSynthesis(() => Promise.reject(new WorkersAiCeilingError()))
    const routing = createRoutingSynthesisProvider(ceiling, fakeResolver(byokProvider))

    const slice = await routing.synthesize({ ...request, routing: 'free-tier-first', byok: credential }, signal())
    expect(slice.headlineFact.statement).toBe('Your 1,200 orders, ready to explore.')
    expect(byokProvider.calls).toHaveLength(1)

    // A non-ceiling failure (e.g. a parse error) never spends the user's key.
    const parseFail = fakeSynthesis(() => Promise.reject(new Error('actions are not a re-phrased permutation')))
    const resolver = fakeResolver(byokProvider)
    const routing2 = createRoutingSynthesisProvider(parseFail, resolver)
    await expect(
      routing2.synthesize({ ...request, routing: 'free-tier-first', byok: credential }, signal()),
    ).rejects.toThrow()
    expect(resolver.resolved).toHaveLength(0)
  })

  it('a ceiling with no credential propagates (baseline echo)', async () => {
    const ceiling = fakeSynthesis(() => Promise.reject(new WorkersAiCeilingError()))
    const routing = createRoutingSynthesisProvider(ceiling, fakeResolver(null))
    await expect(routing.synthesize({ ...request }, signal())).rejects.toBeInstanceOf(WorkersAiCeilingError)
  })
})
