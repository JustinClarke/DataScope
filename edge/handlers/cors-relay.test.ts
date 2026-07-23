import { describe, it, expect, vi } from 'vitest'
import { handleCorsRelay, type CorsRelayEnv } from './cors-relay'
import { createMemoryRateStore } from '../shared/limiter'
import { createMemorySink } from '../shared/counters'

function makeRequest(url: string, init: { method?: string; headers?: Record<string, string> } = {}): Request {
  return new Request(url, {
    method: init.method ?? 'GET',
    headers: { 'cf-connecting-ip': '203.0.113.7', ...init.headers },
  })
}

function relayUrl(target: string, sessionId = 'sess-1'): string {
  const u = new URL('https://edge.example/cors-relay')
  u.searchParams.set('url', target)
  u.searchParams.set('sessionId', sessionId)
  return u.toString()
}

// A fresh Response per call — a body stream can only ever be read once, and
// several tests here call the mock more than once (redirects, repeated calls
// against a shared rate-limit env).
function mockFetch(makeResponse: () => Response): { fetchTarget: typeof fetch; calls: Array<[string, RequestInit]> } {
  const calls: Array<[string, RequestInit]> = []
  const fetchTarget = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push([String(input), init ?? {}])
    return makeResponse()
  }) as unknown as typeof fetch
  return { fetchTarget, calls }
}

function makeEnv(overrides: Partial<CorsRelayEnv> = {}): CorsRelayEnv {
  return {
    rateStore: createMemoryRateStore(),
    sink: createMemorySink(),
    ...overrides,
  }
}

describe('cors-relay: pass-through', () => {
  it('fetches a CORS-blocked origin successfully through the relay', async () => {
    const { fetchTarget, calls } = mockFetch(
      () => new Response('hello world', { status: 200, headers: { 'content-type': 'text/plain' } }),
    )
    const env = makeEnv({ fetchTarget })
    const res = await handleCorsRelay(makeRequest(relayUrl('https://api.example.com/data')), env)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello world')
    expect(res.headers.get('content-type')).toBe('text/plain')
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('https://api.example.com/data')
  })

  it('forwards the target status verbatim (e.g. a 404) rather than wrapping it', async () => {
    const { fetchTarget } = mockFetch(() => new Response('not found', { status: 404 }))
    const res = await handleCorsRelay(makeRequest(relayUrl('https://api.example.com/missing')), makeEnv({ fetchTarget }))
    expect(res.status).toBe(404)
  })

  it('forwards no client-supplied headers to the target', async () => {
    const { fetchTarget, calls } = mockFetch(() => new Response('ok'))
    await handleCorsRelay(
      makeRequest(relayUrl('https://api.example.com/data'), { headers: { 'x-secret-token': 'abc123' } }),
      makeEnv({ fetchTarget }),
    )
    const [, init] = calls[0]
    expect(init.method).toBe('GET')
    expect(init.headers).toBeUndefined()
  })
})

describe('cors-relay: method + validation', () => {
  it('rejects non-GET requests', async () => {
    const { fetchTarget, calls } = mockFetch(() => new Response('ok'))
    const res = await handleCorsRelay(
      makeRequest(relayUrl('https://api.example.com/data'), { method: 'POST' }),
      makeEnv({ fetchTarget }),
    )
    expect(res.status).toBe(405)
    expect(await res.json()).toEqual({ error: 'bad-request' })
    expect(calls).toHaveLength(0)
  })

  it('rejects a missing url or sessionId', async () => {
    const env = makeEnv()
    const noUrl = new URL('https://edge.example/cors-relay')
    noUrl.searchParams.set('sessionId', 'sess-1')
    const res1 = await handleCorsRelay(makeRequest(noUrl.toString()), env)
    expect(res1.status).toBe(400)

    const noSession = new URL('https://edge.example/cors-relay')
    noSession.searchParams.set('url', 'https://api.example.com/data')
    const res2 = await handleCorsRelay(makeRequest(noSession.toString()), env)
    expect(res2.status).toBe(400)
  })

  it('rejects a malformed target URL', async () => {
    const res = await handleCorsRelay(makeRequest(relayUrl('not-a-url')), makeEnv())
    expect(res.status).toBe(400)
  })
})

describe('cors-relay: SSRF hygiene', () => {
  it.each([
    'http://10.0.0.1',
    'http://172.16.0.5',
    'http://192.168.1.1',
    'http://169.254.169.254', // cloud metadata
    'http://localhost',
    'http://127.0.0.1',
    'http://[::1]',
    'ftp://example.com',
  ])('rejects %s as a target', async (target) => {
    const { fetchTarget, calls } = mockFetch(() => new Response('ok'))
    const res = await handleCorsRelay(makeRequest(relayUrl(target)), makeEnv({ fetchTarget }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: expect.stringMatching(/blocked|bad-request/) })
    expect(calls).toHaveLength(0)
  })

  it('allows a public target', async () => {
    const { fetchTarget } = mockFetch(() => new Response('ok'))
    const res = await handleCorsRelay(makeRequest(relayUrl('https://api.github.com/users/octocat')), makeEnv({ fetchTarget }))
    expect(res.status).toBe(200)
  })

  it('follows a redirect to a public target', async () => {
    const redirect = new Response(null, { status: 302, headers: { location: 'https://api.example.com/next' } })
    const final = new Response('final', { status: 200 })
    const fetchTarget = vi.fn().mockResolvedValueOnce(redirect).mockResolvedValueOnce(final) as unknown as typeof fetch
    const res = await handleCorsRelay(makeRequest(relayUrl('https://api.example.com/start')), makeEnv({ fetchTarget }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('final')
  })

  it('blocks a redirect to a private target', async () => {
    const redirect = new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } })
    const fetchTarget = vi.fn().mockResolvedValue(redirect) as unknown as typeof fetch
    const res = await handleCorsRelay(makeRequest(relayUrl('https://api.example.com/start')), makeEnv({ fetchTarget }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'blocked' })
  })

  it('rejects a redirect chain past the max-redirects cap', async () => {
    let hop = 0
    const fetchTarget = vi.fn(async () => {
      hop += 1
      return new Response(null, { status: 302, headers: { location: `https://api.example.com/hop${hop}` } })
    }) as unknown as typeof fetch
    const res = await handleCorsRelay(
      makeRequest(relayUrl('https://api.example.com/start')),
      makeEnv({ fetchTarget, maxRedirects: 2 }),
    )
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'too-many-redirects' })
  })
})

describe('cors-relay: response cap (§7.4)', () => {
  it('rejects a target whose declared content-length exceeds the cap, before streaming', async () => {
    const { fetchTarget } = mockFetch(
      () => new Response('irrelevant', { status: 200, headers: { 'content-length': '1000' } }),
    )
    const res = await handleCorsRelay(
      makeRequest(relayUrl('https://api.example.com/big')),
      makeEnv({ fetchTarget, responseCapBytes: 100 }),
    )
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'oversized' })
  })

  it('cuts off a streamed (no content-length) response once the byte cap is exceeded', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('a'.repeat(60)))
        controller.enqueue(new TextEncoder().encode('b'.repeat(60)))
        controller.close()
      },
    })
    const { fetchTarget } = mockFetch(() => new Response(body, { status: 200 }))
    const res = await handleCorsRelay(
      makeRequest(relayUrl('https://api.example.com/stream')),
      makeEnv({ fetchTarget, responseCapBytes: 100 }),
    )
    expect(res.status).toBe(200) // headers already committed by the time the cap is hit mid-stream
    await expect(res.text()).rejects.toThrow()
  })

  it('streams a response under the cap through cleanly', async () => {
    const { fetchTarget } = mockFetch(() => new Response('small payload', { status: 200 }))
    const res = await handleCorsRelay(
      makeRequest(relayUrl('https://api.example.com/small')),
      makeEnv({ fetchTarget, responseCapBytes: 1_000 }),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('small payload')
  })
})

describe('cors-relay: dual-keyed rate limit (§23.1)', () => {
  it('trips the per-session ceiling and returns 429 + retry-after', async () => {
    const { fetchTarget } = mockFetch(() => new Response('ok'))
    const env = makeEnv({ fetchTarget, perMinuteLimits: { perSession: 1, perIp: 100, windowSeconds: 60 } })
    const first = await handleCorsRelay(makeRequest(relayUrl('https://api.example.com/a')), env)
    expect(first.status).toBe(200)
    const second = await handleCorsRelay(makeRequest(relayUrl('https://api.example.com/a')), env)
    expect(second.status).toBe(429)
    expect(second.headers.get('retry-after')).toBe('60')
    expect(await second.json()).toEqual({ error: 'rate-limited' })
  })

  it('a forged/self-minted session token still falls to the per-IP floor', async () => {
    const { fetchTarget } = mockFetch(() => new Response('ok'))
    const env = makeEnv({ fetchTarget, perMinuteLimits: { perSession: 100, perIp: 2, windowSeconds: 60 } })
    // Same IP, a fresh (self-minted) session id on every call — the per-session
    // ceiling never trips, but the per-IP floor still does.
    const r1 = await handleCorsRelay(makeRequest(relayUrl('https://api.example.com/a', 'forged-1')), env)
    const r2 = await handleCorsRelay(makeRequest(relayUrl('https://api.example.com/a', 'forged-2')), env)
    const r3 = await handleCorsRelay(makeRequest(relayUrl('https://api.example.com/a', 'forged-3')), env)
    expect([r1.status, r2.status]).toEqual([200, 200])
    expect(r3.status).toBe(429)
  })

  it('trips the per-hour ceiling independently of the per-minute one', async () => {
    const { fetchTarget } = mockFetch(() => new Response('ok'))
    const env = makeEnv({
      fetchTarget,
      perMinuteLimits: { perSession: 100, perIp: 100, windowSeconds: 60 },
      perHourLimits: { perSession: 1, perIp: 100, windowSeconds: 3_600 },
    })
    const first = await handleCorsRelay(makeRequest(relayUrl('https://api.example.com/a')), env)
    expect(first.status).toBe(200)
    const second = await handleCorsRelay(makeRequest(relayUrl('https://api.example.com/a')), env)
    expect(second.status).toBe(429)
    expect(second.headers.get('retry-after')).toBe('3600')
  })
})

describe('cors-relay: kill switch (§23.5)', () => {
  it('returns a typed 503 when paused, without touching the target', async () => {
    const { fetchTarget, calls } = mockFetch(() => new Response('ok'))
    const res = await handleCorsRelay(
      makeRequest(relayUrl('https://api.example.com/a')),
      makeEnv({ fetchTarget, CORS_RELAY_KILL_SWITCH: 'on' }),
    )
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'paused' })
    expect(calls).toHaveLength(0)
  })
})

describe('cors-relay: content-free counters (§23.5)', () => {
  it('records only numeric-only outcome/size/latency — never the target URL', async () => {
    const { fetchTarget } = mockFetch(() => new Response('hello'))
    const sink = createMemorySink()
    const res = await handleCorsRelay(makeRequest(relayUrl('https://api.example.com/secret-path')), makeEnv({ fetchTarget, sink }))
    await res.text() // the metric records once the streamed body actually drains, same as a real client consuming it
    expect(sink.metrics).toHaveLength(1)
    const m = sink.metrics[0]
    expect(m).toEqual({ endpoint: 'cors-relay', outcome: 'ok', size: expect.any(String), latency: expect.any(String) })
    expect(JSON.stringify(m)).not.toContain('secret-path')
  })
})
