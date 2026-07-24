// The Worker endpoints behind R2 save/share (D5, §12.3). Three operations
// under one path: `save` (a dataset buffer in, an unguessable share token
// out), `get` (token → the object, streamed back), `delete` (token + the
// ownership proof returned at save time → gone). Client half:
// build/08-persistence/02-r2-save-share.md.
//
// Two properties carry the abuse/privacy contract:
//
//   1. **Delete needs the ownership proof, not the token.** The token is the
//      (unguessable, but shared-by-design) link — anyone holding it can
//      `get`. Only the `deleteToken` returned once at save time can delete —
//      stored as a SHA-256 hash in R2 custom metadata, never the raw value,
//      so a dump of the bucket cannot recover it. A wrong or missing proof
//      answers the same typed `not-found` as an unknown token, on purpose
//      (vault.ts's precedent for this exact shape): a dead/foreign object
//      must not report *why*.
//   2. **The 300MB/session/day aggregate cap is spent on the declared size,
//      before the object is stored** — save requires `Content-Length` for
//      exactly this reason. Nothing here re-checks the actual byte count
//      against it: `request.body` is passed to R2 unwrapped rather than
//      through an app-level counting stream, because R2's `put` requires a
//      stream with a *known length* (its own error, verified live against a
//      real binding: "Provided readable stream must have a known length
//      (request/response body or readable half of FixedLengthStream)") — a
//      hand-rolled passthrough `ReadableStream` doesn't carry that, only a
//      request/response body itself does. That same known-length contract is
//      what makes a lying Content-Length self-defeating: the HTTP layer
//      frames the body to the declared length before this handler ever sees
//      it, so a body that runs short or long fails as a transport error, not
//      as something this file has to police with its own byte counter.
//
// Save/get carry the object as a raw request/response body, not JSON — a
// dataset buffer can run to the 100MB per-object cap, and base64-in-JSON
// would inflate that by a third for no reason. Control fields (sessionId,
// token, the ownership proof) travel as query params instead, the same shape
// cors-relay uses for its own bodyless GET. Delete stays a POST + `op` query
// param rather than the DELETE method, so it needs no change to the Worker's
// fixed CORS allow-list — every endpoint on this deploy is GET/POST only.
//
// TTL enforcement is the Terraform-owned R2 lifecycle rule (§23.3), not this
// file — the disclosed 30-day number and the infrastructure rule are the same
// number by construction, not an app-code check re-deriving it.
import type { PersistenceErrorCode, PersistenceSaveResponse, PersistenceDeleteResponse } from '../protocol'
import { typedError, jsonResponse } from '../shared/http'
import { isPaused } from '../shared/killSwitch'
import { checkRateLimit, incrementSessionQuota, type RateStore, type RateLimits } from '../shared/limiter'
import { sizeBucket, latencyBucket, type CounterSink, type PersistenceOutcome } from '../shared/counters'

/** The subset of an R2 object's metadata this endpoint reads. */
export interface PersistenceObjectMeta {
  size: number
  httpMetadata?: { contentType?: string }
  customMetadata?: Record<string, string>
}

/** An object plus its readable body — what `get` resolves to. */
export interface PersistenceObjectBody extends PersistenceObjectMeta {
  body: ReadableStream<Uint8Array>
}

/** The store this endpoint sits on: R2 in production, a map under test. */
export interface PersistenceStore {
  put(
    key: string,
    value: ReadableStream<Uint8Array> | null,
    options: { httpMetadata?: { contentType?: string }; customMetadata: Record<string, string> },
  ): Promise<PersistenceObjectMeta>
  get(key: string): Promise<PersistenceObjectBody | null>
  /** Metadata only, no body — how `delete` checks the ownership proof without pulling the object into memory. */
  head(key: string): Promise<PersistenceObjectMeta | null>
  delete(key: string): Promise<void>
}

export interface PersistenceEnv {
  store?: PersistenceStore
  rateStore: RateStore
  sink: CounterSink
  /** Kill-switch flag; unset or 'off' means live. */
  PERSISTENCE_KILL_SWITCH?: string
  saveLimits?: RateLimits
  maxObjectBytes?: number
  maxSessionBytesPerDay?: number
  ttlSeconds?: number
}

// Launch defaults (§12.3). All tunable from the injected env.
const DEFAULT_SAVE_LIMITS: RateLimits = { perSession: 10, perIp: 30, windowSeconds: 86_400 }
const DEFAULT_MAX_OBJECT_BYTES = 100 * 1_024 * 1_024
const DEFAULT_MAX_SESSION_BYTES_PER_DAY = 300 * 1_024 * 1_024
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60

const STATUS: Record<PersistenceErrorCode, number> = {
  'bad-request': 400,
  'not-found': 404,
  'too-large': 413,
  'rate-limited': 429,
  'quota-exceeded': 429,
  paused: 503,
  unavailable: 503,
}

/** Exported so `mcp.ts`'s `get_dsps` (build/08-persistence/03-dsps-spec) can address the same R2 objects by share token. */
export function shareObjectKey(token: string): string {
  return `share:${token}`
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/** A fresh unguessable token: 256 bits of CSPRNG entropy, base64url. */
function newToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** SHA-256 of the delete token, hex-encoded — the ownership proof actually stored. */
async function hashDeleteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function handlePersistence(request: Request, env: PersistenceEnv): Promise<Response> {
  const started = Date.now()
  const saveLimits = env.saveLimits ?? DEFAULT_SAVE_LIMITS
  const maxObjectBytes = env.maxObjectBytes ?? DEFAULT_MAX_OBJECT_BYTES
  const maxSessionBytesPerDay = env.maxSessionBytesPerDay ?? DEFAULT_MAX_SESSION_BYTES_PER_DAY
  const ttlSeconds = env.ttlSeconds ?? DEFAULT_TTL_SECONDS

  const record = (outcome: PersistenceOutcome, bytes: number): void => {
    env.sink.record({
      endpoint: 'persistence',
      outcome,
      size: sizeBucket(bytes),
      latency: latencyBucket(Date.now() - started),
    })
  }
  const fail = (code: PersistenceErrorCode, bytes = 0): Response => {
    record(code, bytes)
    return typedError(code, STATUS[code])
  }

  if (isPaused(env.PERSISTENCE_KILL_SWITCH)) return fail('paused')
  if (env.store === undefined) return fail('unavailable')
  const store = env.store

  const { searchParams } = new URL(request.url)
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'

  if (request.method === 'GET') {
    const token = searchParams.get('token')
    if (token === null || token === '') return fail('bad-request')
    const object = await store.get(shareObjectKey(token))
    if (object === null) return fail('not-found')
    record('ok', object.size)
    return new Response(object.body, {
      status: 200,
      headers: { 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream' },
    })
  }

  if (request.method !== 'POST') return fail('bad-request')

  const op = searchParams.get('op')

  if (op === 'delete') {
    const token = searchParams.get('token')
    const deleteToken = searchParams.get('deleteToken')
    if (token === null || token === '' || deleteToken === null || deleteToken === '') return fail('bad-request')
    const key = shareObjectKey(token)
    const meta = await store.head(key)
    if (meta === null || meta.customMetadata?.deleteTokenHash !== (await hashDeleteToken(deleteToken))) {
      return fail('not-found')
    }
    await store.delete(key)
    record('deleted', 0)
    const response: PersistenceDeleteResponse = { deleted: true }
    return jsonResponse(response)
  }

  // Save. sessionId scopes the abuse limiters; the object carries no other
  // identity (§12.3 — nothing stored beyond what TTL/ownership need).
  const sessionId = searchParams.get('sessionId')
  if (sessionId === null || sessionId === '') return fail('bad-request')

  const declaredLength = Number(request.headers.get('content-length'))
  if (!Number.isFinite(declaredLength) || declaredLength <= 0) return fail('bad-request')
  if (declaredLength > maxObjectBytes) return fail('too-large', declaredLength)

  const withinRate = await checkRateLimit(env.rateStore, 'persistence-save', sessionId, ip, saveLimits)
  if (!withinRate) return fail('rate-limited', declaredLength)

  // Spent against the declared size up front — a save that trips this cap
  // still counts, the same "no free retries" shape as the other endpoints'
  // limiters.
  const usedToday = await incrementSessionQuota(env.rateStore, 'persistence-bytes', sessionId, 86_400, declaredLength)
  if (usedToday > maxSessionBytesPerDay) return fail('quota-exceeded', declaredLength)

  if (request.body === null) return fail('bad-request')

  const token = newToken()
  const deleteToken = newToken()
  const contentType = request.headers.get('content-type') ?? 'application/octet-stream'

  try {
    await store.put(shareObjectKey(token), request.body, {
      httpMetadata: { contentType },
      customMetadata: { deleteTokenHash: await hashDeleteToken(deleteToken) },
    })
  } catch {
    // A body that ran long or short of its declared Content-Length fails here
    // as a stream error — the HTTP layer's own framing, not a check this file
    // performs (see the header comment). `too-large` is the closest typed
    // code the client can act on; a store fed a stream that rejects never
    // commits a partial object, so there is nothing to clean up.
    return fail('too-large', maxObjectBytes)
  }

  record('ok', declaredLength)
  const response: PersistenceSaveResponse = { token, deleteToken, ttlSeconds }
  return jsonResponse(response)
}

/** An in-memory PersistenceStore for tests and local dev. */
export function createMemoryPersistenceStore(): PersistenceStore {
  const values = new Map<
    string,
    { body: Uint8Array; httpMetadata?: { contentType?: string }; customMetadata: Record<string, string> }
  >()

  async function drain(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
    if (stream === null) return new Uint8Array()
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      // Propagates a capped stream's error, matching a real R2 put's reject.
      const step = await reader.read()
      if (step.done) break
      chunks.push(step.value)
      total += step.value.byteLength
    }
    const out = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      out.set(chunk, offset)
      offset += chunk.byteLength
    }
    return out
  }

  return {
    async put(key, value, options) {
      const body = await drain(value)
      values.set(key, { body, httpMetadata: options.httpMetadata, customMetadata: options.customMetadata })
      return { size: body.byteLength, httpMetadata: options.httpMetadata, customMetadata: options.customMetadata }
    },
    get(key) {
      const entry = values.get(key)
      if (entry === undefined) return Promise.resolve(null)
      return Promise.resolve({
        size: entry.body.byteLength,
        httpMetadata: entry.httpMetadata,
        customMetadata: entry.customMetadata,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(entry.body)
            controller.close()
          },
        }),
      })
    },
    head(key) {
      const entry = values.get(key)
      if (entry === undefined) return Promise.resolve(null)
      return Promise.resolve({
        size: entry.body.byteLength,
        httpMetadata: entry.httpMetadata,
        customMetadata: entry.customMetadata,
      })
    },
    delete(key) {
      values.delete(key)
      return Promise.resolve()
    },
  }
}
