import { describe, it, expect } from 'vitest'
import { handleSynthesis, type SynthesisEnv, type SynthesisProvider } from './synthesis'
import { createMemoryRateStore } from '../shared/limiter'
import { createMemorySink } from '../shared/counters'
import type { SynthesisRequest, SynthesisResponse } from '../protocol'

const facts: SynthesisRequest['facts'] = {
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
}

const baseline: SynthesisRequest['baseline'] = {
  headlineFact: {
    statement: '1,200 orders across 2 columns.',
    sql: '',
    snapshot: '2026-07-21T00:00:00Z',
    confidence: 'high',
    provenance: 'schema',
  },
  actions: [
    {
      verb: 'Chart revenue over order_id',
      module: 'charts',
      prefill: { module: 'charts', prefilledConfig: { table: 'orders' } },
      evidence: {
        statement: 'revenue spans 900 distinct values.',
        sql: 'SELECT count(distinct revenue) FROM orders',
        snapshot: '2026-07-21T00:00:00Z',
        confidence: 'high',
        provenance: 'insight-rule',
      },
      score: 0.8,
    },
  ],
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://edge.example/synthesis', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...headers },
    body: JSON.stringify(body),
  })
}

function makeEnv(overrides: Partial<SynthesisEnv> = {}): SynthesisEnv {
  const provider: SynthesisProvider = {
    // A re-phrase/re-order producer: swaps the headline prose, leaves structure.
    synthesize(req) {
      return Promise.resolve({
        headlineFact: { ...req.baseline.headlineFact, statement: 'Your 1,200 orders, at a glance.' },
        actions: req.baseline.actions,
      })
    },
  }
  return {
    provider,
    rateStore: createMemoryRateStore(),
    sink: createMemorySink(),
    ...overrides,
  }
}

const body = { sessionId: 's-1', facts, baseline }

describe('synthesis endpoint', () => {
  it('returns the provider-re-phrased slice and records an ok, numeric-only metric', async () => {
    const sink = createMemorySink()
    const res = await handleSynthesis(makeRequest(body), makeEnv({ sink }))
    expect(res.status).toBe(200)
    const slice = (await res.json()) as SynthesisResponse
    expect(slice.headlineFact.statement).toBe('Your 1,200 orders, at a glance.')
    expect(sink.metrics).toEqual([{ endpoint: 'synthesis', outcome: 'ok', size: expect.any(String), latency: expect.any(String) }])
  })

  it('forwards structure only — the provider never receives a data row', async () => {
    let received: SynthesisRequest | null = null
    const provider: SynthesisProvider = {
      synthesize(req) {
        received = req
        return Promise.resolve({ headlineFact: req.baseline.headlineFact, actions: req.baseline.actions })
      },
    }
    await handleSynthesis(makeRequest(body), makeEnv({ provider }))
    const payload = JSON.stringify(received)
    // Structure-only keys are present; no rows/values array smuggled alongside.
    expect(payload).toContain('semanticType')
    expect(received!.facts.tables[0].columns.every((c) => !('values' in c) && !('sample' in c))).toBe(true)
  })

  it('stores nothing content-bearing — the metric sink holds only numeric buckets', async () => {
    const sink = createMemorySink()
    await handleSynthesis(makeRequest(body), makeEnv({ sink }))
    const dumped = JSON.stringify(sink.metrics)
    // No column name, statement prose, or narrative leaked into telemetry.
    expect(dumped).not.toContain('order_id')
    expect(dumped).not.toContain('orders')
    expect(dumped).not.toContain('at a glance')
    expect(Object.keys(sink.metrics[0])).toEqual(['endpoint', 'outcome', 'size', 'latency'])
  })

  it('kill-switch flipped → typed 503, provider never called', async () => {
    let called = false
    const provider: SynthesisProvider = {
      synthesize() {
        called = true
        return Promise.reject(new Error('should not run'))
      },
    }
    const res = await handleSynthesis(makeRequest(body), makeEnv({ provider, SYNTHESIS_KILL_SWITCH: 'on' }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'paused' })
    expect(called).toBe(false)
  })

  it('rate limit exceeded → typed 429, never a hang', async () => {
    const env = makeEnv({ limits: { perSession: 2, perIp: 100, windowSeconds: 60 } })
    await handleSynthesis(makeRequest(body), env)
    await handleSynthesis(makeRequest(body), env)
    const res = await handleSynthesis(makeRequest(body), env)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate-limited' })
  })

  it('over-cap body → typed 400', async () => {
    const res = await handleSynthesis(makeRequest(body), makeEnv({ maxBodyBytes: 10 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad-request' })
  })

  it('malformed body → typed 400', async () => {
    const res = await handleSynthesis(makeRequest({ nope: true }), makeEnv())
    expect(res.status).toBe(400)
  })

  it('provider down → echoes the baseline (client stays deterministic), records degraded', async () => {
    const sink = createMemorySink()
    const provider: SynthesisProvider = { synthesize: () => Promise.reject(new Error('model down')) }
    const res = await handleSynthesis(makeRequest(body), makeEnv({ provider, sink }))
    expect(res.status).toBe(200)
    const slice = (await res.json()) as SynthesisResponse
    expect(slice.headlineFact.statement).toBe(baseline.headlineFact.statement)
    expect(sink.metrics[0].outcome).toBe('degraded')
  })

  it('a BYOK-carrying request reaches the provider; the key never lands in the rate keys or a response — even the degraded echo (D9)', async () => {
    const canary = 'sk-synth-canary-DO-NOT-USE'
    const withByok = { ...body, routing: 'prefer-key', byok: { provider: 'openai', key: canary } }

    const seen: SynthesisRequest[] = []
    const rateStore = (() => {
      const inner = createMemoryRateStore()
      const keys: string[] = []
      return {
        keys,
        increment(key: string, windowSeconds: number) {
          keys.push(key)
          return inner.increment(key, windowSeconds)
        },
      }
    })()

    // Served path: the routing provider gets the credential it needs.
    const provider: SynthesisProvider = {
      synthesize(req) {
        seen.push(req)
        return Promise.resolve({ headlineFact: req.baseline.headlineFact, actions: req.baseline.actions })
      },
    }
    const res = await handleSynthesis(makeRequest(withByok), makeEnv({ provider, rateStore }))
    expect(seen[0].byok?.key).toBe(canary)
    expect(rateStore.keys.join('|')).not.toContain(canary)
    expect(JSON.stringify(await res.json())).not.toContain(canary)

    // Degraded path: the baseline echo must not carry the credential back.
    const failing: SynthesisProvider = { synthesize: () => Promise.reject(new Error('upstream 401')) }
    const res2 = await handleSynthesis(makeRequest(withByok), makeEnv({ provider: failing }))
    expect(res2.status).toBe(200)
    expect(JSON.stringify(await res2.json())).not.toContain(canary)
  })
})
