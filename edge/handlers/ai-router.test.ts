import { describe, it, expect } from 'vitest'
import {
  handleAiRouter,
  WorkersAiCeilingError,
  type AiRouterEnv,
  type InferenceProvider,
  type InferEvent,
  type ByokResolver,
} from './ai-router'
import { createMemoryRateStore, type RateStore } from '../shared/limiter'
import { createMemorySink } from '../shared/counters'
import type { AiRouterRequest, WireProviderTurn } from '../protocol'

const TEXT_TURN: WireProviderTurn = { text: 'SELECT 1 answered.', calls: [] }
const TOOL_TURN: WireProviderTurn = {
  text: '',
  calls: [{ id: 'c1', name: 'run_sql', input: { sql: 'SELECT count(*) FROM orders' } }],
}

/** A provider that yields the given events in order, honoring abort between yields. */
function provider(id: string, events: InferEvent[]): InferenceProvider {
  return {
    id,
    async *infer(_messages, _tools, signal) {
      for (const ev of events) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        yield ev
      }
    },
  }
}

/** A provider whose first pull throws the Workers-AI ceiling (pool spent). */
function ceilingProvider(): InferenceProvider {
  return {
    id: 'workers-ai',
    // eslint-disable-next-line require-yield
    async *infer() {
      throw new WorkersAiCeilingError()
    },
  }
}

/** A provider that never produces a turn until aborted, then throws AbortError. */
function hangingProvider(): InferenceProvider {
  return {
    id: 'workers-ai',
    async *infer(_m, _t, signal) {
      await new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        })
      })
      yield { type: 'done', turn: TEXT_TURN, tokensIn: 0, tokensOut: 0 } // unreachable
    },
  }
}

function resolver(p: InferenceProvider | null): ByokResolver {
  return { resolve: () => Promise.resolve(p) }
}

/** Wraps a store to record every key it sees — for the key-leak audit. */
function spyStore(): RateStore & { keys: string[] } {
  const inner = createMemoryRateStore()
  const keys: string[] = []
  return {
    keys,
    increment(key, windowSeconds) {
      keys.push(key)
      return inner.increment(key, windowSeconds)
    },
  }
}

const okWorkersAi = (): InferenceProvider =>
  provider('workers-ai', [{ type: 'done', turn: TEXT_TURN, tokensIn: 1500, tokensOut: 300 }])

function makeEnv(overrides: Partial<AiRouterEnv> = {}): AiRouterEnv {
  return {
    workersAi: okWorkersAi(),
    byok: resolver(null),
    rateStore: createMemoryRateStore(),
    quotaStore: createMemoryRateStore(),
    sink: createMemorySink(),
    ...overrides,
  }
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://edge.example/ai-router', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const base: AiRouterRequest = {
  sessionId: 's-1',
  routing: 'free-tier-first',
  messages: [{ role: 'user', content: 'how many orders?' }],
  tools: [{ name: 'execute_local_sql', description: '', inputSchema: {} }],
}

describe('ai-router: Workers AI default round-trip', () => {
  it('serves a turn from Workers AI with zero user config', async () => {
    const env = makeEnv()
    const res = await handleAiRouter(makeRequest(base), env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ turn: TEXT_TURN, servedBy: 'workers-ai' })
  })

  it('returns a tool-call turn unchanged (the NL→SQL loop path)', async () => {
    const env = makeEnv({
      workersAi: provider('workers-ai', [{ type: 'done', turn: TOOL_TURN, tokensIn: 800, tokensOut: 40 }]),
    })
    const res = await handleAiRouter(makeRequest(base), env)
    const body = await res.json()
    expect(body.turn).toEqual(TOOL_TURN)
    expect(body.servedBy).toBe('workers-ai')
  })
})

describe('ai-router: routing toggle (D3)', () => {
  it('prefer-my-key sends 100% to the user provider, never Workers AI', async () => {
    let workersAiCalled = false
    const workersAi: InferenceProvider = {
      id: 'workers-ai',
      async *infer() {
        workersAiCalled = true
        yield { type: 'done', turn: TEXT_TURN, tokensIn: 0, tokensOut: 0 }
      },
    }
    const key = provider('byok', [{ type: 'done', turn: TEXT_TURN, tokensIn: 10, tokensOut: 5 }])
    const env = makeEnv({ workersAi, byok: resolver(key) })
    const req: AiRouterRequest = { ...base, routing: 'prefer-key', byok: { provider: 'openai', key: 'sk-x' } }
    const res = await handleAiRouter(makeRequest(req), env)
    const body = await res.json()
    expect(body.servedBy).toBe('byok')
    expect(workersAiCalled).toBe(false)
  })

  it('prefer-key with no key is a typed bad-request', async () => {
    const env = makeEnv()
    const res = await handleAiRouter(makeRequest({ ...base, routing: 'prefer-key' }), env)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad-request' })
  })

  it('free-tier-first overflows to the key on a Workers-AI ceiling, labeled byok', async () => {
    const key = provider('byok', [{ type: 'done', turn: TEXT_TURN, tokensIn: 10, tokensOut: 5 }])
    const env = makeEnv({ workersAi: ceilingProvider(), byok: resolver(key) })
    const req: AiRouterRequest = { ...base, byok: { provider: 'anthropic', key: 'sk-y' } }
    const res = await handleAiRouter(makeRequest(req), env)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.servedBy).toBe('byok')
  })
})

describe('ai-router: shared-pool guardrails (§11.2)', () => {
  it('enforces the per-session daily Workers-AI quota → quota-exhausted', async () => {
    // One shared quota store so the daily quota accumulates across turns; a fresh
    // Workers-AI generator each turn (a generator is single-use).
    const quotaStore = createMemoryRateStore()
    const mk = (): AiRouterEnv => ({ ...makeEnv({ workersAiDailyQuota: 2 }), quotaStore })
    expect((await handleAiRouter(makeRequest(base), mk())).status).toBe(200)
    expect((await handleAiRouter(makeRequest(base), mk())).status).toBe(200)
    const third = await handleAiRouter(makeRequest(base), mk())
    expect(third.status).toBe(429)
    expect(await third.json()).toEqual({ error: 'quota-exhausted' })
  })

  it('overflows to the key once the daily quota is spent', async () => {
    const quotaStore = createMemoryRateStore()
    const key = () => provider('byok', [{ type: 'done', turn: TEXT_TURN, tokensIn: 5, tokensOut: 5 }])
    const req: AiRouterRequest = { ...base, byok: { provider: 'openai', key: 'sk-z' } }
    const mk = (): AiRouterEnv => ({
      ...makeEnv({ workersAiDailyQuota: 1 }),
      quotaStore,
      byok: resolver(key()),
      workersAi: okWorkersAi(),
    })
    const first = await handleAiRouter(makeRequest(req), mk())
    expect((await first.json()).servedBy).toBe('workers-ai')
    const second = await handleAiRouter(makeRequest(req), mk())
    expect((await second.json()).servedBy).toBe('byok')
  })

  it('per-minute limiter trips → rate-limited', async () => {
    const rateStore = createMemoryRateStore()
    const env: AiRouterEnv = {
      ...makeEnv({ perMinuteLimits: { perSession: 2, perIp: 100, windowSeconds: 60 } }),
      rateStore,
    }
    await handleAiRouter(makeRequest(base), { ...env, workersAi: okWorkersAi() })
    await handleAiRouter(makeRequest(base), { ...env, workersAi: okWorkersAi() })
    const third = await handleAiRouter(makeRequest(base), { ...env, workersAi: okWorkersAi() })
    expect(third.status).toBe(429)
    expect(await third.json()).toEqual({ error: 'rate-limited' })
  })

  it('a Workers-AI ceiling with no key → pool-exhausted', async () => {
    const env = makeEnv({ workersAi: ceilingProvider() })
    const res = await handleAiRouter(makeRequest(base), env)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'pool-exhausted' })
  })

  it('rejects a body over the 64 KB cap → bad-request', async () => {
    const huge = { ...base, messages: [{ role: 'user', content: 'x'.repeat(70_000) }] }
    const env = makeEnv()
    const res = await handleAiRouter(makeRequest(huge), env)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad-request' })
  })
})

describe('ai-router: kill switch and timeout', () => {
  it('a flipped kill switch → paused 503', async () => {
    const env = makeEnv({ AI_ROUTER_KILL_SWITCH: 'on' })
    const res = await handleAiRouter(makeRequest(base), env)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'paused' })
  })

  it('an upstream hang → timeout 504, no hang', async () => {
    const env = makeEnv({ workersAi: hangingProvider(), providerTimeoutMs: 10 })
    const res = await handleAiRouter(makeRequest(base), env)
    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({ error: 'timeout' })
  })

  it('an upstream failure (e.g. a rejected BYOK key) → typed upstream-error 502, never an unhandled throw', async () => {
    const failing: InferenceProvider = {
      id: 'byok',
      // eslint-disable-next-line require-yield
      async *infer() {
        throw new Error('byok upstream 401')
      },
    }
    const sink = createMemorySink()
    const env = makeEnv({ byok: resolver(failing), sink })
    const res = await handleAiRouter(
      makeRequest({ ...base, routing: 'prefer-key', byok: { provider: 'openai', key: 'sk-x' } }),
      env,
    )
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'upstream-error' })
    expect(sink.metrics.at(-1)).toMatchObject({ outcome: 'upstream-error', servedBy: 'none' })
  })
})

describe('ai-router: streaming (§15)', () => {
  it('streams text deltas incrementally, then a final done turn', async () => {
    const env = makeEnv({
      workersAi: provider('workers-ai', [
        { type: 'delta', text: 'SELECT ' },
        { type: 'delta', text: 'count(*) ' },
        { type: 'delta', text: 'FROM orders' },
        { type: 'done', turn: TEXT_TURN, tokensIn: 1500, tokensOut: 300 },
      ]),
    })
    const res = await handleAiRouter(makeRequest({ ...base, stream: true }), env)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await res.text()
    const deltas = text.match(/"type":"delta"/g) ?? []
    expect(deltas.length).toBe(3)
    expect(text).toContain('"type":"done"')
    expect(text).toContain('[DONE]')
  })
})

describe('ai-router: D41 numeric-only metrics + D9 key custody', () => {
  it('records numeric-only metrics — no prompt, SQL, or key text reaches the sink', async () => {
    const sink = createMemorySink()
    const env = makeEnv({ sink })
    await handleAiRouter(makeRequest(base), env)
    const m = sink.metrics[0]
    expect(m).toEqual({
      endpoint: 'ai-router',
      outcome: 'ok',
      servedBy: 'workers-ai',
      tokensIn: 1500,
      tokensOut: 300,
      attempt: 1,
      latency: expect.any(String),
    })
    const dump = JSON.stringify(sink.metrics)
    expect(dump).not.toContain('orders')
    expect(dump).not.toContain('SELECT')
  })

  it('records the loop attempt number the client sends', async () => {
    const sink = createMemorySink()
    const env = makeEnv({ sink })
    await handleAiRouter(makeRequest({ ...base, attempt: 3 }), env)
    expect(sink.metrics[0]).toMatchObject({ attempt: 3 })
  })

  it('a pass-through key never lands in the counters, either store, or the response', async () => {
    const SECRET = 'sk-live-DEADBEEF-super-secret'
    const rateStore = spyStore()
    const quotaStore = spyStore()
    const sink = createMemorySink()
    const key = provider('byok', [{ type: 'done', turn: TEXT_TURN, tokensIn: 10, tokensOut: 5 }])
    const env: AiRouterEnv = { ...makeEnv({ sink }), rateStore, quotaStore, byok: resolver(key) }
    const req: AiRouterRequest = { ...base, routing: 'prefer-key', byok: { provider: 'openai', key: SECRET } }
    const res = await handleAiRouter(makeRequest(req), env)
    const responseBody = await res.text()
    expect(responseBody).not.toContain(SECRET)
    expect(JSON.stringify(sink.metrics)).not.toContain(SECRET)
    // Both the per-minute limiter and the daily-quota store only ever see keys
    // built from sessionId/IP — never the credential.
    expect(rateStore.keys.join('|')).not.toContain(SECRET)
    expect(quotaStore.keys.join('|')).not.toContain(SECRET)
  })
})
