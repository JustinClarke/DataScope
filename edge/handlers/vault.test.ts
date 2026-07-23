import { describe, it, expect } from 'vitest'
import {
  handleVault,
  createVaultResolver,
  createMemoryVaultStore,
  type VaultEnv,
  type VaultStore,
} from './vault'
import { createMemoryRateStore } from '../shared/limiter'
import { createMemorySink } from '../shared/counters'

const SECRET = 'test-vault-secret-0123456789'
const SESSION = 'vault-session-abc'
const KEY = 'sk-live-supersecret-0987654321'

function makeEnv(overrides: Partial<VaultEnv> = {}): VaultEnv & {
  sink: ReturnType<typeof createMemorySink>
  store: VaultStore
} {
  const sink = createMemorySink()
  const store = createMemoryVaultStore()
  return {
    store,
    rateStore: createMemoryRateStore(),
    sink,
    VAULT_SECRET: SECRET,
    ...overrides,
  } as VaultEnv & { sink: ReturnType<typeof createMemorySink>; store: VaultStore }
}

function post(body: unknown, ip = '203.0.113.7'): Request {
  return new Request('https://edge.example/vault', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  })
}

async function storeKey(
  env: VaultEnv,
  key = KEY,
  sessionId = SESSION,
  provider = 'openai',
): Promise<Response> {
  return handleVault(post({ op: 'store', sessionId, provider, key }), env)
}

describe('vault — store / delete round trip', () => {
  it('stores a key and answers with a reference only', async () => {
    const env = makeEnv()
    const response = await storeKey(env)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { ref: string }
    expect(typeof body.ref).toBe('string')
    // The reference is the response, whole — no key, no provider, no echo.
    expect(Object.keys(body)).toEqual(['ref'])
  })

  it('resolves a stored reference router-side to the original credential', async () => {
    const env = makeEnv()
    const { ref } = (await (await storeKey(env)).json()) as { ref: string }
    const resolved = await createVaultResolver(env)(SESSION, ref)
    expect(resolved).toEqual({ provider: 'openai', model: undefined, key: KEY })
  })

  it('delete removes the value; a later resolve fails cleanly', async () => {
    const env = makeEnv()
    const { ref } = (await (await storeKey(env)).json()) as { ref: string }

    const deleted = await handleVault(post({ op: 'delete', sessionId: SESSION, ref }), env)
    expect(deleted.status).toBe(200)
    expect(await deleted.json()).toEqual({ deleted: true })

    expect(await createVaultResolver(env)(SESSION, ref)).toBeNull()
  })

  it('deleting an unknown reference is a typed not-found, not a silent success', async () => {
    const env = makeEnv()
    const response = await handleVault(post({ op: 'delete', sessionId: SESSION, ref: 'nope' }), env)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not-found' })
  })
})

describe('vault — session scoping and reference secrecy', () => {
  it('another session cannot resolve this session’s reference', async () => {
    const env = makeEnv()
    const { ref } = (await (await storeKey(env)).json()) as { ref: string }
    expect(await createVaultResolver(env)('some-other-session', ref)).toBeNull()
  })

  it('another session cannot delete this session’s reference', async () => {
    const env = makeEnv()
    const { ref } = (await (await storeKey(env)).json()) as { ref: string }

    const attacker = await handleVault(post({ op: 'delete', sessionId: 'attacker', ref }), env)
    expect(attacker.status).toBe(404)
    // The real owner's key survives the attempt.
    expect(await createVaultResolver(env)(SESSION, ref)).not.toBeNull()
  })

  it('mints unguessable, non-repeating references (256 bits, base64url)', async () => {
    const env = makeEnv({ credentialCap: 50 })
    const refs = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const { ref } = (await (await storeKey(env)).json()) as { ref: string }
      expect(ref).toMatch(/^[A-Za-z0-9_-]{43}$/)
      refs.add(ref)
    }
    expect(refs.size).toBe(10)
  })

  it('stores the key encrypted — a raw store dump contains no key material', async () => {
    const env = makeEnv()
    await storeKey(env)
    const keys = await env.store.list('vault:')
    expect(keys).toHaveLength(1)
    const raw = await env.store.get(keys[0])
    expect(raw).not.toBeNull()
    expect(raw).not.toContain(KEY)
    expect(raw).not.toContain('openai')
    // The storage key names the session and reference — never the credential.
    expect(keys[0]).not.toContain(KEY)
  })

  it('a record written under a different secret does not resolve', async () => {
    const env = makeEnv()
    const { ref } = (await (await storeKey(env)).json()) as { ref: string }
    const rotated = createVaultResolver({ ...env, VAULT_SECRET: 'a-different-secret' })
    expect(await rotated(SESSION, ref)).toBeNull()
  })
})

describe('vault — idle TTL', () => {
  it('expires a credential left unused for its idle TTL', async () => {
    let clock = 1_000_000
    const env = makeEnv({
      store: createMemoryVaultStore(() => clock),
      idleTtlSeconds: 100,
      now: () => clock,
    })
    const { ref } = (await (await storeKey(env)).json()) as { ref: string }

    clock += 101_000
    expect(await createVaultResolver(env)(SESSION, ref)).toBeNull()
  })

  it('a resolve within the window refreshes the TTL, so the clock restarts', async () => {
    let clock = 1_000_000
    const env = makeEnv({
      store: createMemoryVaultStore(() => clock),
      idleTtlSeconds: 100,
      now: () => clock,
    })
    const { ref } = (await (await storeKey(env)).json()) as { ref: string }
    const resolve = createVaultResolver(env)

    // Past the lazy-refresh threshold but inside the window: this resolve
    // re-writes the record with a fresh TTL.
    clock += 90_000
    expect(await resolve(SESSION, ref)).not.toBeNull()

    // Without the refresh the credential would have expired 80s ago.
    clock += 90_000
    expect(await resolve(SESSION, ref)).not.toBeNull()
  })

  it('does not re-write the record on every resolve (refresh costs 1% of the window)', async () => {
    let clock = 1_000_000
    const memory = createMemoryVaultStore(() => clock)
    let writes = 0
    const counting: VaultStore = { ...memory, put: (k, v, t) => { writes++; return memory.put(k, v, t) } }
    const env = makeEnv({ store: counting, now: () => clock })

    const { ref } = (await (await storeKey(env)).json()) as { ref: string }
    expect(writes).toBe(1) // the store itself
    const resolve = createVaultResolver(env)

    clock += 60_000
    await resolve(SESSION, ref)
    await resolve(SESSION, ref)
    expect(writes).toBe(1) // a minute of use is not worth a write

    // 1% of the 90-day default window is 21.6h.
    clock += 22 * 60 * 60 * 1_000
    await resolve(SESSION, ref)
    expect(writes).toBe(2) // a day later, one refresh
  })
})

describe('vault — abuse controls', () => {
  it('rejects the 4th credential in a session (cap of 3)', async () => {
    const env = makeEnv()
    for (let i = 0; i < 3; i++) expect((await storeKey(env)).status).toBe(200)

    const fourth = await storeKey(env)
    expect(fourth.status).toBe(409)
    expect(await fourth.json()).toEqual({ error: 'cap-reached' })
  })

  it('counts the cap per session, not globally', async () => {
    const env = makeEnv()
    for (let i = 0; i < 3; i++) await storeKey(env)
    expect((await storeKey(env, KEY, 'a-different-session')).status).toBe(200)
  })

  it('rate-limits vault operations beyond 10/session/hour with a typed 429', async () => {
    const env = makeEnv({ credentialCap: 100 })
    // Deletes of unknown refs still count — a blocked or failed op is not free.
    for (let i = 0; i < 10; i++) {
      const r = await handleVault(post({ op: 'delete', sessionId: SESSION, ref: `x${i}` }), env)
      expect(r.status).toBe(404)
    }
    const eleventh = await handleVault(post({ op: 'delete', sessionId: SESSION, ref: 'x10' }), env)
    expect(eleventh.status).toBe(429)
    expect(await eleventh.json()).toEqual({ error: 'rate-limited' })
  })

  it('holds a per-IP floor so fresh session ids do not reset the limit', async () => {
    const env = makeEnv({ credentialCap: 100, opLimits: { perSession: 2, perIp: 3, windowSeconds: 3_600 } })
    expect((await storeKey(env, KEY, 'session-1')).status).toBe(200)
    expect((await storeKey(env, KEY, 'session-2')).status).toBe(200)
    expect((await storeKey(env, KEY, 'session-3')).status).toBe(200)
    // A fourth fresh session from the same IP hits the floor, not the ceiling.
    expect((await storeKey(env, KEY, 'session-4')).status).toBe(429)
  })

  it('a resolve does not consume the client operation budget', async () => {
    const env = makeEnv()
    const { ref } = (await (await storeKey(env)).json()) as { ref: string }
    const resolve = createVaultResolver(env)
    for (let i = 0; i < 50; i++) expect(await resolve(SESSION, ref)).not.toBeNull()
    // The session has spent exactly one op (the store) — 50 AI turns cost none.
    expect((await handleVault(post({ op: 'delete', sessionId: SESSION, ref }), env)).status).toBe(200)
  })
})

describe('vault — configuration and request hygiene', () => {
  it('returns a typed 503 when the kill switch is flipped', async () => {
    const env = makeEnv({ VAULT_KILL_SWITCH: 'on' })
    const response = await storeKey(env)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'paused' })
  })

  it('fails closed with `unavailable` when no at-rest secret is configured', async () => {
    const env = makeEnv({ VAULT_SECRET: undefined })
    const response = await storeKey(env)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    // Nothing was written in the clear on the way to refusing.
    expect(await env.store.list('vault:')).toHaveLength(0)
  })

  it('fails closed with `unavailable` when the store is unbound', async () => {
    const env = makeEnv({ store: undefined })
    const response = await storeKey(env)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
  })

  it('an unconfigured vault resolves nothing rather than throwing', async () => {
    expect(await createVaultResolver(makeEnv({ store: undefined }))('s', 'r')).toBeNull()
    expect(await createVaultResolver(makeEnv({ VAULT_SECRET: '' }))('s', 'r')).toBeNull()
  })

  it('rejects a non-POST request', async () => {
    const env = makeEnv()
    const response = await handleVault(new Request('https://edge.example/vault'), env)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'bad-request' })
  })

  it.each([
    ['an unknown op', { op: 'resolve', sessionId: SESSION, ref: 'r' }],
    ['a store with no key', { op: 'store', sessionId: SESSION, provider: 'openai' }],
    ['a store with an empty key', { op: 'store', sessionId: SESSION, provider: 'openai', key: '' }],
    ['a store with no session', { op: 'store', provider: 'openai', key: KEY }],
    ['a delete with no ref', { op: 'delete', sessionId: SESSION }],
  ])('rejects %s as bad-request', async (_label, body) => {
    const response = await handleVault(post(body), makeEnv())
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'bad-request' })
  })

  it('rejects an over-cap body rather than using the vault as storage', async () => {
    const env = makeEnv({ maxBodyBytes: 256 })
    const response = await storeKey(env, 'k'.repeat(1_000))
    expect(response.status).toBe(400)
  })
})

describe('vault — content-free counters', () => {
  it('records outcome and latency only, for every path', async () => {
    const env = makeEnv()
    const { ref } = (await (await storeKey(env)).json()) as { ref: string }
    await createVaultResolver(env)(SESSION, ref)
    await createVaultResolver(env)('wrong-session', ref)
    await handleVault(post({ op: 'delete', sessionId: SESSION, ref: 'missing' }), env)

    expect(env.sink.metrics.map((m) => m.outcome)).toEqual(['ok', 'resolved', 'resolve-miss', 'not-found'])
    for (const metric of env.sink.metrics) {
      expect(Object.keys(metric).sort()).toEqual(['endpoint', 'latency', 'outcome'])
      // The whole metric serialized carries nothing about the credential.
      const serialized = JSON.stringify(metric)
      expect(serialized).not.toContain(KEY)
      expect(serialized).not.toContain(SESSION)
      expect(serialized).not.toContain(ref)
    }
  })
})
