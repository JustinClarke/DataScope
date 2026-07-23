import { describe, it, expect } from 'vitest'
import { handlePersistence, createMemoryPersistenceStore, type PersistenceEnv } from './persistence'
import { createMemoryRateStore } from '../shared/limiter'
import { createMemorySink } from '../shared/counters'

function makeEnv(overrides: Partial<PersistenceEnv> = {}): PersistenceEnv & {
  sink: ReturnType<typeof createMemorySink>
} {
  const sink = createMemorySink()
  return {
    store: createMemoryPersistenceStore(),
    rateStore: createMemoryRateStore(),
    sink,
    ...overrides,
  } as PersistenceEnv & { sink: ReturnType<typeof createMemorySink> }
}

function persistenceUrl(params: Record<string, string> = {}): string {
  const u = new URL('https://edge.example/persistence')
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return u.toString()
}

function saveRequest(
  bytes: Uint8Array<ArrayBuffer>,
  opts: { sessionId?: string; contentType?: string; declaredLength?: number; ip?: string } = {},
): Request {
  const { sessionId = 'sess-1', contentType = 'application/octet-stream', declaredLength = bytes.byteLength, ip = '203.0.113.7' } = opts
  return new Request(persistenceUrl({ sessionId }), {
    method: 'POST',
    headers: {
      'content-type': contentType,
      'content-length': String(declaredLength),
      'cf-connecting-ip': ip,
    },
    // A raw typed-array body, not a Blob: jsdom's Request/Blob interop mangles
    // a Blob body into the literal text "undefined" when streamed back via
    // `.body`, a test-environment quirk unrelated to the handler under test.
    body: bytes,
  })
}

function getRequest(token: string, ip = '203.0.113.7'): Request {
  return new Request(persistenceUrl({ token }), { method: 'GET', headers: { 'cf-connecting-ip': ip } })
}

function deleteRequest(token: string, deleteToken: string, ip = '203.0.113.7'): Request {
  return new Request(persistenceUrl({ op: 'delete', token, deleteToken }), {
    method: 'POST',
    headers: { 'cf-connecting-ip': ip },
  })
}

// .slice() (not the raw TextEncoder().encode() result) so the typed array is
// backed by a plain, non-shared ArrayBuffer — BlobPart's stricter generic
// otherwise rejects the SharedArrayBuffer-compatible type TextEncoder returns.
const PAYLOAD = new TextEncoder().encode('the quick brown fox jumps over the lazy dog').slice()

describe('persistence — save / get / delete round trip', () => {
  it('saves an object and answers with a token, delete token, and TTL only', async () => {
    const env = makeEnv()
    const res = await handlePersistence(saveRequest(PAYLOAD), env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string; deleteToken: string; ttlSeconds: number }
    expect(Object.keys(body).sort()).toEqual(['deleteToken', 'token', 'ttlSeconds'])
    expect(body.ttlSeconds).toBe(30 * 24 * 60 * 60)
  })

  it('round-trips the exact bytes and content-type back through get', async () => {
    const env = makeEnv()
    const saved = (await (await handlePersistence(saveRequest(PAYLOAD, { contentType: 'application/vnd.apache.parquet' }), env)).json()) as {
      token: string
    }
    const res = await handlePersistence(getRequest(saved.token), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/vnd.apache.parquet')
    // Array.from, not a direct typed-array toEqual: jsdom's Response.arrayBuffer()
    // returns a Uint8Array from a different realm than this file's globals, so
    // even byte-identical arrays fail a same-constructor deep-equal check.
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(PAYLOAD))
  })

  it('get on an unknown token is a typed not-found', async () => {
    const env = makeEnv()
    const res = await handlePersistence(getRequest('nope'), env)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not-found' })
  })

  it('delete with the correct ownership proof removes the object; a later get 404s', async () => {
    const env = makeEnv()
    const saved = (await (await handlePersistence(saveRequest(PAYLOAD), env)).json()) as { token: string; deleteToken: string }

    const del = await handlePersistence(deleteRequest(saved.token, saved.deleteToken), env)
    expect(del.status).toBe(200)
    expect(await del.json()).toEqual({ deleted: true })

    const after = await handlePersistence(getRequest(saved.token), env)
    expect(after.status).toBe(404)
  })

  it('delete with a wrong ownership proof is a typed not-found, and the object survives', async () => {
    const env = makeEnv()
    const saved = (await (await handlePersistence(saveRequest(PAYLOAD), env)).json()) as { token: string }

    const del = await handlePersistence(deleteRequest(saved.token, 'forged-delete-token'), env)
    expect(del.status).toBe(404)
    expect(await del.json()).toEqual({ error: 'not-found' })

    const after = await handlePersistence(getRequest(saved.token), env)
    expect(after.status).toBe(200)
  })

  it('delete on an unknown token is a typed not-found', async () => {
    const env = makeEnv()
    const res = await handlePersistence(deleteRequest('nope', 'also-nope'), env)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not-found' })
  })

  it('mints unguessable, non-repeating tokens (256 bits, base64url)', async () => {
    const env = makeEnv({ saveLimits: { perSession: 50, perIp: 50, windowSeconds: 86_400 } })
    const tokens = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const saved = (await (await handlePersistence(saveRequest(PAYLOAD), env)).json()) as { token: string; deleteToken: string }
      expect(saved.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(saved.deleteToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(saved.token).not.toBe(saved.deleteToken)
      tokens.add(saved.token)
    }
    expect(tokens.size).toBe(10)
  })

  it('never stores the raw delete token — a store dump has no occurrence of it', async () => {
    const env = makeEnv()
    const saved = (await (await handlePersistence(saveRequest(PAYLOAD), env)).json()) as { token: string; deleteToken: string }
    const meta = await env.store!.head(`share:${saved.token}`)
    expect(JSON.stringify(meta)).not.toContain(saved.deleteToken)
  })
})

describe('persistence — validation', () => {
  it('rejects a save with no sessionId', async () => {
    const env = makeEnv()
    const req = new Request(persistenceUrl(), {
      method: 'POST',
      headers: { 'content-length': String(PAYLOAD.byteLength), 'cf-connecting-ip': '203.0.113.7' },
      body: PAYLOAD,
    })
    const res = await handlePersistence(req, env)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad-request' })
  })

  it('rejects a save with no declared Content-Length', async () => {
    const env = makeEnv()
    const req = new Request(persistenceUrl({ sessionId: 'sess-1' }), {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.7' },
      body: PAYLOAD,
    })
    const res = await handlePersistence(req, env)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad-request' })
  })

  it('rejects an unsupported method', async () => {
    const env = makeEnv()
    const req = new Request(persistenceUrl({ token: 'x' }), { method: 'PUT' })
    const res = await handlePersistence(req, env)
    expect(res.status).toBe(400)
  })
})

describe('persistence — abuse controls', () => {
  it('rejects a declared object size over the per-object cap up front', async () => {
    const env = makeEnv({ maxObjectBytes: 50 })
    const res = await handlePersistence(saveRequest(PAYLOAD, { declaredLength: 500 }), env)
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'too-large' })
  })

  // A lying Content-Length (declares less than the real body) isn't a case
  // this file's own logic enforces or the in-memory store can simulate — it's
  // caught by the real R2 binding's known-length contract on `request.body`
  // (the HTTP layer frames the body to the declared length before this
  // handler runs), verified live against a real Miniflare R2 binding
  // (build/09-edge/04's build log records the run) rather than here.

  it('trips the daily save-count limiter on the Nth+1 save', async () => {
    const env = makeEnv({ saveLimits: { perSession: 2, perIp: 10, windowSeconds: 86_400 } })
    expect((await handlePersistence(saveRequest(PAYLOAD), env)).status).toBe(200)
    expect((await handlePersistence(saveRequest(PAYLOAD), env)).status).toBe(200)
    const third = await handlePersistence(saveRequest(PAYLOAD), env)
    expect(third.status).toBe(429)
    expect(await third.json()).toEqual({ error: 'rate-limited' })
  })

  it('trips the daily aggregate byte cap, spending quota even on the rejected save', async () => {
    const env = makeEnv({
      saveLimits: { perSession: 10, perIp: 10, windowSeconds: 86_400 },
      maxSessionBytesPerDay: PAYLOAD.byteLength + 10,
    })
    expect((await handlePersistence(saveRequest(PAYLOAD), env)).status).toBe(200)
    const second = await handlePersistence(saveRequest(PAYLOAD), env)
    expect(second.status).toBe(429)
    expect(await second.json()).toEqual({ error: 'quota-exceeded' })
  })

  it('a fresh session is unaffected by another session exhausting its own limits', async () => {
    const env = makeEnv({ saveLimits: { perSession: 1, perIp: 10, windowSeconds: 86_400 } })
    expect((await handlePersistence(saveRequest(PAYLOAD, { sessionId: 'sess-a' }), env)).status).toBe(200)
    const blocked = await handlePersistence(saveRequest(PAYLOAD, { sessionId: 'sess-a' }), env)
    expect(blocked.status).toBe(429)
    const other = await handlePersistence(saveRequest(PAYLOAD, { sessionId: 'sess-b' }), env)
    expect(other.status).toBe(200)
  })
})

describe('persistence — kill switch and unavailable', () => {
  it('answers paused on every operation when the kill switch is flipped', async () => {
    const env = makeEnv({ PERSISTENCE_KILL_SWITCH: 'on' })
    expect((await handlePersistence(saveRequest(PAYLOAD), env)).status).toBe(503)
    expect((await handlePersistence(getRequest('x'), env)).status).toBe(503)
    expect((await handlePersistence(deleteRequest('x', 'y'), env)).status).toBe(503)
  })

  it('answers unavailable, not a crash, when no store is bound', async () => {
    const env = makeEnv({ store: undefined })
    const res = await handlePersistence(saveRequest(PAYLOAD), env)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'unavailable' })
  })
})

describe('persistence — content-free metrics', () => {
  it('records outcome/size/latency only — never a token or the object bytes', async () => {
    const env = makeEnv()
    const saved = (await (await handlePersistence(saveRequest(PAYLOAD), env)).json()) as { token: string; deleteToken: string }
    await handlePersistence(getRequest(saved.token), env)
    await handlePersistence(deleteRequest(saved.token, saved.deleteToken), env)

    expect(env.sink.metrics.map((m) => m.outcome)).toEqual(['ok', 'ok', 'deleted'])
    const dump = JSON.stringify(env.sink.metrics)
    expect(dump).not.toContain(saved.token)
    expect(dump).not.toContain(saved.deleteToken)
    expect(dump).not.toContain('fox')
  })
})
