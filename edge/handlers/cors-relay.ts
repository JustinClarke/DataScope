// The Tier-2 CORS relay (§7.4). Most real APIs fail a direct browser fetch on
// CORS alone; this Worker fetches server-side (no CORS applies Worker→origin)
// and streams the response back with permissive CORS headers.
//
// A strict single-fetch pass-through, nothing more: one target URL in, one
// response out. No secrets touch it, no client-supplied headers reach the
// target, nothing is stored, nothing is rewritten beyond the CORS headers
// worker.ts merges on top. Pagination is entirely client-driven (decided
// 2026-07-23, ADR-006) — the client calls this endpoint once per page; the
// relay has no concept of "page" at all. GET only, both inbound (the target
// URL and session id travel as query params — there is no body) and outbound
// (the target is always fetched with GET, redirects followed manually so each
// hop re-enters the same SSRF check as the original URL).
//
// Abuse control is a requirement, not polish (§7.4, §23.1): "paste any API
// URL, we'll proxy it" turns the Worker into a free CORS-bypass proxy for
// anyone. The shared dual-keyed limiter (build/09-edge/01) gates every
// request on two independent windows — a per-minute burst ceiling and a
// per-hour ceiling — each with a per-IP floor so a forged/self-minted session
// id still hits a wall (§23.1); both counters increment on every request, so a
// blocked call still counts (no free retries).
import type { CorsRelayErrorCode } from '../protocol'
import { typedError } from '../shared/http'
import { isPaused } from '../shared/killSwitch'
import { checkRateLimit, type RateStore, type RateLimits } from '../shared/limiter'
import { sizeBucket, latencyBucket, type CounterSink, type CorsRelayOutcome } from '../shared/counters'

export interface CorsRelayEnv {
  rateStore: RateStore
  sink: CounterSink
  /** Kill-switch flag; unset or 'off' means live. */
  CORS_RELAY_KILL_SWITCH?: string
  perMinuteLimits?: RateLimits
  perHourLimits?: RateLimits
  responseCapBytes?: number
  timeoutMs?: number
  maxRedirects?: number
  /** The outbound fetch, injected so tests supply a mock target — never a real network call under test. */
  fetchTarget?: typeof fetch
}

// Launch defaults (§7.4). All tunable from the injected env; ADR-006 adjusts from evidence.
const DEFAULT_PER_MINUTE: RateLimits = { perSession: 20, perIp: 60, windowSeconds: 60 }
const DEFAULT_PER_HOUR: RateLimits = { perSession: 200, perIp: 600, windowSeconds: 3_600 }
const DEFAULT_RESPONSE_CAP_BYTES = 100 * 1_024 * 1_024
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_REDIRECTS = 5

/**
 * True for loopback, RFC1918/CGNAT, and link-local (including the
 * 169.254.169.254 cloud-metadata address) hosts — the SSRF hygiene §7.4/§23.1
 * require. Deliberately string/literal-based, not a DNS resolution (v0.5
 * keeps this simple, no allowlists): a hostname that only *resolves* to a
 * private address at fetch time is out of scope here, same as the redirect
 * check below only ever sees the URL a `Location` header states.
 */
function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === '0.0.0.0') return true

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (v4 !== null) {
    const a = Number(v4[1])
    const b = Number(v4[2])
    if (a === 127) return true // loopback
    if (a === 10) return true // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
    if (a === 192 && b === 168) return true // RFC1918
    if (a === 169 && b === 254) return true // link-local, incl. cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    return false
  }

  if (host.includes(':')) {
    // Coarse IPv6 coverage of the SSRF-relevant ranges: loopback, link-local,
    // and unique-local (fc00::/7, i.e. the fc/fd prefixes).
    if (host === '::1' || host === '::') return true
    if (host.startsWith('fe80:')) return true
    if (host.startsWith('fc') || host.startsWith('fd')) return true
    if (host.startsWith('::ffff:')) return isPrivateOrLoopbackHost(host.slice('::ffff:'.length))
    return false
  }

  return false
}

function isAllowedTarget(url: URL): boolean {
  return (url.protocol === 'http:' || url.protocol === 'https:') && !isPrivateOrLoopbackHost(url.hostname)
}

function relayError(code: CorsRelayErrorCode, status: number): Response {
  return typedError(code, status)
}

function rateLimitedResponse(retryAfterSeconds: number): Response {
  const body: { error: CorsRelayErrorCode } = { error: 'rate-limited' }
  return new Response(JSON.stringify(body), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(retryAfterSeconds) },
  })
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

export async function handleCorsRelay(request: Request, env: CorsRelayEnv): Promise<Response> {
  const started = Date.now()
  const perMinute = env.perMinuteLimits ?? DEFAULT_PER_MINUTE
  const perHour = env.perHourLimits ?? DEFAULT_PER_HOUR
  const responseCap = env.responseCapBytes ?? DEFAULT_RESPONSE_CAP_BYTES
  const timeoutMs = env.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRedirects = env.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const doFetch = env.fetchTarget ?? fetch

  const record = (outcome: CorsRelayOutcome, bytes: number): void => {
    env.sink.record({
      endpoint: 'cors-relay',
      outcome,
      size: sizeBucket(bytes),
      latency: latencyBucket(Date.now() - started),
    })
  }

  if (request.method !== 'GET') {
    // 405, matching the worker.ts-level rejection the other two endpoints give
    // their own wrong inbound method — this endpoint just checks it internally
    // (rather than in worker.ts) so it stays exercised by this file's own tests.
    record('bad-request', 0)
    return relayError('bad-request', 405)
  }

  if (isPaused(env.CORS_RELAY_KILL_SWITCH)) {
    record('paused', 0)
    return relayError('paused', 503)
  }

  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')
  const targetRaw = searchParams.get('url')
  if (sessionId === null || sessionId === '' || targetRaw === null || targetRaw === '') {
    record('bad-request', 0)
    return relayError('bad-request', 400)
  }

  let target: URL
  try {
    target = new URL(targetRaw)
  } catch {
    record('bad-request', 0)
    return relayError('bad-request', 400)
  }
  if (!isAllowedTarget(target)) {
    record('blocked', 0)
    return relayError('blocked', 400)
  }

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const [withinMinute, withinHour] = await Promise.all([
    checkRateLimit(env.rateStore, 'cors-relay-min', sessionId, ip, perMinute),
    checkRateLimit(env.rateStore, 'cors-relay-hour', sessionId, ip, perHour),
  ])
  if (!withinMinute) {
    record('rate-limited', 0)
    return rateLimitedResponse(perMinute.windowSeconds)
  }
  if (!withinHour) {
    record('rate-limited', 0)
    return rateLimitedResponse(perHour.windowSeconds)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const fail = (code: CorsRelayErrorCode, status: number, outcome: CorsRelayOutcome): Response => {
    clearTimeout(timer)
    record(outcome, 0)
    return relayError(code, status)
  }

  try {
    let current = target
    let response: Response
    for (let hop = 0; ; hop++) {
      if (hop > maxRedirects) return fail('too-many-redirects', 502, 'upstream-error')
      // No client-supplied headers are ever forwarded — only the target URL crosses.
      response = await doFetch(current.toString(), { method: 'GET', redirect: 'manual', signal: controller.signal })
      if (response.status < 300 || response.status >= 400) break
      const location = response.headers.get('location')
      if (location === null) return fail('upstream-error', 502, 'upstream-error')
      let next: URL
      try {
        next = new URL(location, current)
      } catch {
        return fail('upstream-error', 502, 'upstream-error')
      }
      if (!isAllowedTarget(next)) return fail('blocked', 400, 'blocked')
      current = next
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength !== null && Number(contentLength) > responseCap) {
      return fail('oversized', 502, 'oversized')
    }

    if (response.body === null) {
      clearTimeout(timer)
      record('ok', 0)
      return new Response(null, {
        status: response.status,
        headers: { 'content-type': response.headers.get('content-type') ?? 'application/octet-stream' },
      })
    }

    const reader = response.body.getReader()
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        let step: ReadableStreamReadResult<Uint8Array>
        try {
          step = await reader.read()
        } catch (err) {
          clearTimeout(timer)
          record(isAbort(err) ? 'timeout' : 'upstream-error', sent)
          streamController.error(err)
          return
        }
        if (step.done) {
          clearTimeout(timer)
          record('ok', sent)
          streamController.close()
          return
        }
        sent += step.value.byteLength
        if (sent > responseCap) {
          clearTimeout(timer)
          record('oversized', sent)
          streamController.error(new Error('cors-relay: target response exceeded the byte-count cutoff'))
          try {
            await reader.cancel()
          } catch {
            // Cancelling an already-errored/closed stream is a no-op failure.
          }
          return
        }
        streamController.enqueue(step.value)
      },
      cancel(reason) {
        clearTimeout(timer)
        return reader.cancel(reason)
      },
    })

    return new Response(body, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'application/octet-stream' },
    })
  } catch (err) {
    return fail(isAbort(err) ? 'timeout' : 'upstream-error', isAbort(err) ? 504 : 502, isAbort(err) ? 'timeout' : 'upstream-error')
  }
}
