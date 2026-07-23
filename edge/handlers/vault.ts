// The BYOK credential vault (§11.2, D9) — the opt-in half of key custody.
//
// Default custody is browser-memory + stateless pass-through (byok.ts) and never
// comes near this file. The vault exists only for a user who chose "Remember my
// key" after explicit disclosure, and it trades that default for a disclosed
// server-side store: encrypted at rest, scoped to the durable session that stored
// it, expiring on idle, and deletable on demand.
//
// Three properties are structural here rather than conventions:
//
//   1. **No path returns key material to a client.** The wire contract has two
//      client operations, `store` and `delete`; resolution is a separate function
//      the router calls in-process (`createVaultResolver`), whose result goes
//      straight into an outbound provider call. There is no response shape on
//      this endpoint that can carry a key back, so a "leak the key" edit would
//      have to invent one.
//   2. **The record is opaque at rest.** Values are AES-GCM ciphertext under a
//      Worker-held secret, so a KV dump is not a key list. A deploy without that
//      secret refuses to store anything (`unavailable`) rather than falling back
//      to plaintext — the vault fails closed, never quietly weaker.
//   3. **Session scoping is the storage key, not a check.** Records live at
//      `vault:{session}:{ref}`, so a reference presented under another session
//      addresses nothing that exists; there is no comparison to forget to write.
//      The entropy is in the 256-bit reference — the session id is client-minted
//      (§23.1's server-minted tokens are ADR-006's, unbuilt), so it is a scoping
//      key, not a second secret, and this file never treats it as one.
//
// Encryption at rest is deliberately the baseline shape: one Worker secret, no
// envelope encryption or KMS. That scope is closed for launch (the leaf doc says
// so explicitly) — revisit from evidence, not up front.
import type { VaultErrorCode, VaultRequest, VaultResponse } from '../protocol'
import { typedError, readCappedJson, jsonResponse } from '../shared/http'
import { isPaused } from '../shared/killSwitch'
import { checkRateLimit, type RateStore, type RateLimits } from '../shared/limiter'
import { latencyBucket, type CounterSink, type VaultOutcome } from '../shared/counters'

/**
 * The record as it exists in plaintext — only ever inside this module, between a
 * decrypt and the provider call it feeds. `refreshedAt` drives the lazy idle-TTL
 * refresh below; nothing here is ever serialized anywhere but the ciphertext.
 */
export interface VaultedCredential {
  provider: string
  model?: string
  key: string
  refreshedAt: number
}

/** The value store the vault sits on: KV in production, a map under test. */
export interface VaultStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, ttlSeconds: number): Promise<void>
  delete(key: string): Promise<void>
  /** Keys under a prefix — the credential cap's count. */
  list(prefix: string): Promise<string[]>
}

export interface VaultEnv {
  store?: VaultStore
  rateStore: RateStore
  sink: CounterSink
  /**
   * The at-rest encryption secret (`wrangler secret put VAULT_SECRET`). Unset
   * means the vault is not configured on this deploy and every operation
   * refuses — the fail-closed rule above.
   */
  VAULT_SECRET?: string
  /** Kill-switch flag; unset or 'off' means live. */
  VAULT_KILL_SWITCH?: string
  opLimits?: RateLimits
  idleTtlSeconds?: number
  credentialCap?: number
  maxBodyBytes?: number
  /** Injected in tests so the TTL-refresh threshold is reachable without waiting days. */
  now?: () => number
}

// Launch defaults (§11.2, leaf 09-edge/03). All tunable from the injected env.
/** Vault *operations* — store/delete. Router-internal resolves are not client ops and never count here. */
const DEFAULT_OP_LIMITS: RateLimits = { perSession: 10, perIp: 30, windowSeconds: 3_600 }
/** 90 days of disuse, refreshed on each resolve. */
const DEFAULT_IDLE_TTL_SECONDS = 90 * 24 * 60 * 60
/** Generous for one key per provider; a fourth is vault-stuffing. */
const DEFAULT_CREDENTIAL_CAP = 3
/** A bearer key is a few hundred bytes; this only stops a body being used as storage. */
const DEFAULT_MAX_BODY_BYTES = 8 * 1_024
/**
 * How much of the idle window a record may burn before a resolve re-writes it.
 * A resolve happens on every cloud turn, and refreshing on each one would mean a
 * store write per AI question; deferring until 1% of the window has elapsed is
 * indistinguishable from exact (21.6 hours of slack on the 90-day default) and
 * costs ~4 writes a year per credential instead. Expressed as a fraction of the
 * TTL rather than a fixed interval on purpose: a fixed one would quietly stop
 * refreshing at all if the TTL were ever tuned below it, turning "expires after
 * 90 days *without use*" into a hard expiry.
 */
const REFRESH_FRACTION = 0.01

const STATUS: Record<VaultErrorCode, number> = {
  'bad-request': 400,
  'not-found': 404,
  'cap-reached': 409,
  'rate-limited': 429,
  paused: 503,
  unavailable: 503,
}

function recordKey(sessionId: string, ref: string): string {
  return `vault:${sessionId}:${ref}`
}

function sessionPrefix(sessionId: string): string {
  return `vault:${sessionId}:`
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * A fresh reference token: 256 bits of CSPRNG entropy, base64url so it survives
 * a URL or a JSON body unescaped. This is the only thing guarding a vaulted key,
 * which is why it is full-width random rather than a shortened id.
 */
function newReference(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Derives the AES-GCM key from the Worker secret. A plain SHA-256 rather than a
 * password KDF on purpose: the secret is a high-entropy machine-generated value
 * from `wrangler secret`, not a human password, so stretching defends against
 * nothing — there is no guessable input to slow down.
 */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** Encrypts a record to `base64(iv ‖ ciphertext)` with a per-write random IV. */
async function encrypt(secret: string, record: VaultedCredential): Promise<string> {
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(record))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  )
  const packed = new Uint8Array(iv.length + ciphertext.length)
  packed.set(iv)
  packed.set(ciphertext, iv.length)
  return toBase64(packed)
}

/**
 * Reverses `encrypt`. Returns null for anything that does not decrypt and parse
 * — a truncated value, a record written under a rotated secret, a forged one.
 * All of those are indistinguishable from "no such reference" to the caller, on
 * purpose: a dead record must not report *why* it is dead.
 */
async function decrypt(secret: string, packed: string): Promise<VaultedCredential | null> {
  try {
    const key = await deriveKey(secret)
    const bytes = fromBase64(packed)
    const iv = bytes.slice(0, 12)
    const ciphertext = bytes.slice(12)
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    const record = JSON.parse(new TextDecoder().decode(plaintext)) as VaultedCredential
    if (typeof record.provider !== 'string' || typeof record.key !== 'string') return null
    return record
  } catch {
    return null
  }
}

function isStoreRequest(body: Record<string, unknown>): boolean {
  return (
    typeof body.sessionId === 'string' &&
    body.sessionId !== '' &&
    typeof body.provider === 'string' &&
    body.provider !== '' &&
    typeof body.key === 'string' &&
    body.key !== '' &&
    (body.model === undefined || typeof body.model === 'string')
  )
}

function isDeleteRequest(body: Record<string, unknown>): boolean {
  return (
    typeof body.sessionId === 'string' &&
    body.sessionId !== '' &&
    typeof body.ref === 'string' &&
    body.ref !== ''
  )
}

function isWellFormed(body: unknown): body is VaultRequest {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  if (b.op === 'store') return isStoreRequest(b)
  if (b.op === 'delete') return isDeleteRequest(b)
  return false
}

/**
 * The client-facing endpoint: store a key, or delete a stored one. Never a
 * resolve — see the header. Errors are typed codes the settings UI branches on,
 * and no error body ever quotes the request.
 */
export async function handleVault(request: Request, env: VaultEnv): Promise<Response> {
  const started = Date.now()
  const opLimits = env.opLimits ?? DEFAULT_OP_LIMITS
  const idleTtl = env.idleTtlSeconds ?? DEFAULT_IDLE_TTL_SECONDS
  const cap = env.credentialCap ?? DEFAULT_CREDENTIAL_CAP
  const maxBodyBytes = env.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const now = env.now ?? Date.now

  const record = (outcome: VaultOutcome): void => {
    env.sink.record({ endpoint: 'vault', outcome, latency: latencyBucket(Date.now() - started) })
  }
  const fail = (code: VaultErrorCode): Response => {
    record(code)
    return typedError(code, STATUS[code])
  }

  if (request.method !== 'POST') return fail('bad-request')
  if (isPaused(env.VAULT_KILL_SWITCH)) return fail('paused')
  // Fail closed: without a store and an at-rest secret there is no custody this
  // endpoint can honor, so it declines rather than storing a key unprotected.
  if (env.store === undefined || env.VAULT_SECRET === undefined || env.VAULT_SECRET === '') {
    return fail('unavailable')
  }
  const store = env.store
  const secret = env.VAULT_SECRET

  const body = await readCappedJson<unknown>(request, maxBodyBytes)
  if (body === null || !isWellFormed(body)) return fail('bad-request')

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const withinRate = await checkRateLimit(env.rateStore, 'vault', body.sessionId, ip, opLimits)
  if (!withinRate) return fail('rate-limited')

  if (body.op === 'delete') {
    const key = recordKey(body.sessionId, body.ref)
    // The existence check is what makes a delete verifiable — a blind delete
    // would report success for a reference that was never this session's.
    const existing = await store.get(key)
    if (existing === null) return fail('not-found')
    await store.delete(key)
    record('ok')
    const response: VaultResponse = { deleted: true }
    return jsonResponse(response)
  }

  // The cap is a hygiene bound, not the anti-stuffing control — the strongly
  // consistent op limiter above is (KV's list is eventually consistent, so a
  // burst could momentarily seat a fourth). Ten ops an hour is what actually
  // stops a session filling the namespace.
  const held = await store.list(sessionPrefix(body.sessionId))
  if (held.length >= cap) return fail('cap-reached')

  const ref = newReference()
  await store.put(
    recordKey(body.sessionId, ref),
    await encrypt(secret, {
      provider: body.provider,
      model: body.model,
      key: body.key,
      refreshedAt: now(),
    }),
    idleTtl,
  )
  record('ok')
  const response: VaultResponse = { ref }
  return jsonResponse(response)
}

/** Resolves a vaulted credential in-process. Null covers every failure alike. */
export type VaultResolver = (
  sessionId: string,
  ref: string,
) => Promise<{ provider: string; model?: string; key: string } | null>

/**
 * The router-internal resolve (§11.2): reference in, credential out, straight
 * into an outbound provider call. Deliberately a function rather than an
 * endpoint — nothing HTTP-reachable returns what this returns.
 *
 * Resolving also refreshes the idle TTL, which is what makes "expire after 90
 * days *without use*" true rather than a hard 90-day expiry; the refresh is
 * lazy (see REFRESH_AFTER_MS). Vault operation limits do not apply: a resolve
 * is a side effect of an ai-router call that has already been rate-limited, and
 * charging it against the 10/hour op budget would cap a user at ten questions.
 */
export function createVaultResolver(env: VaultEnv): VaultResolver {
  const idleTtl = env.idleTtlSeconds ?? DEFAULT_IDLE_TTL_SECONDS
  const now = env.now ?? Date.now
  return async (sessionId, ref) => {
    const started = Date.now()
    const record = (outcome: VaultOutcome): void => {
      env.sink.record({ endpoint: 'vault', outcome, latency: latencyBucket(Date.now() - started) })
    }
    if (env.store === undefined || env.VAULT_SECRET === undefined || env.VAULT_SECRET === '') {
      record('unavailable')
      return null
    }
    if (sessionId === '' || ref === '') {
      record('resolve-miss')
      return null
    }
    const key = recordKey(sessionId, ref)
    const packed = await env.store.get(key)
    if (packed === null) {
      record('resolve-miss')
      return null
    }
    const found = await decrypt(env.VAULT_SECRET, packed)
    if (found === null) {
      record('resolve-miss')
      return null
    }
    const at = now()
    if (at - found.refreshedAt >= idleTtl * 1_000 * REFRESH_FRACTION) {
      await env.store.put(
        key,
        await encrypt(env.VAULT_SECRET, { ...found, refreshedAt: at }),
        idleTtl,
      )
    }
    record('resolved')
    return { provider: found.provider, model: found.model, key: found.key }
  }
}

/**
 * An in-memory VaultStore for tests and local dev. Expiry is evaluated on read
 * (KV drops the value itself), which is enough to exercise the idle-TTL rule.
 */
export function createMemoryVaultStore(now: () => number = Date.now): VaultStore {
  const values = new Map<string, { value: string; expiresAt: number }>()
  const live = (key: string): { value: string; expiresAt: number } | null => {
    const entry = values.get(key)
    if (entry === undefined) return null
    if (now() >= entry.expiresAt) {
      values.delete(key)
      return null
    }
    return entry
  }
  return {
    get(key) {
      return Promise.resolve(live(key)?.value ?? null)
    },
    put(key, value, ttlSeconds) {
      values.set(key, { value, expiresAt: now() + ttlSeconds * 1_000 })
      return Promise.resolve()
    },
    delete(key) {
      values.delete(key)
      return Promise.resolve()
    },
    list(prefix) {
      return Promise.resolve([...values.keys()].filter((k) => k.startsWith(prefix) && live(k) !== null))
    },
  }
}
