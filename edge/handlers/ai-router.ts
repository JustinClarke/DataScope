// The AI router — the cloud-mode NL→SQL endpoint (§11.2, D2/D3/D9). It routes a
// single tool-use round-trip to a provider and serves the result back to the
// browser's cloud `AIProvider`. The client runs the six-stage loop (§11.1); the
// router serves one `complete()` call at a time.
//
// What it owns:
//   - Routing (D3): Workers AI by default; the "prefer my key" / "free tier
//     first" toggle; ceiling detection on Workers AI that overflows to the user's
//     key; the served-by label so the client can show which provider answered.
//   - The shared free pool is real and small (ADR-007: ~117 neurons/turn →
//     ~85 turns/day account-wide). So a per-session daily Workers-AI quota and a
//     per-minute limiter (the shared dual-keyed limiter, IP floor included) sit in
//     front of it; exceeding either returns a typed code, never a silent stop.
//   - BYOK custody (D9): a raw pass-through key is attached to the provider call
//     and never persisted, logged, or echoed; a vault reference is resolved
//     server-side (build/09-edge/03). The key never reaches the counters or the
//     rate store — the metric shape makes that structurally impossible.
//   - Streaming (§15): a text answer is proxied to the client as SSE; a tool-call
//     turn is returned whole (there is nothing to stream token-by-token).
//   - LLM metrics (D41): numeric-only per turn — served-by, token counts, the
//     loop attempt, a latency bucket, an outcome class. No prompt, SQL, or error
//     text can reach the sink; that content lives only in the client transcript.
//
// The providers, the vault resolver, the counter/rate stores, and the kill-switch
// flag are all injected. In a real Worker a thin adapter builds them from
// Cloudflare bindings (the Workers AI binding, a Durable Object counter, an
// Analytics Engine dataset, an env var); the handler only ever sees the seam. That is why
// the endpoint is fully testable here with mocked providers, ahead of a staging
// deploy.
import type {
  AiRouterRequest,
  AiRouterResponse,
  ByokCredential,
  ServedBy,
  WireProviderMessage,
  WireProviderTurn,
  WireTool,
} from '../protocol'
import { typedError, readCappedJson } from '../shared/http'
import { isPaused } from '../shared/killSwitch'
import {
  checkRateLimit,
  incrementSessionQuota,
  type RateStore,
  type RateLimits,
} from '../shared/limiter'
import {
  latencyBucket,
  type CounterSink,
  type AiRouterOutcome,
} from '../shared/counters'

/** One event from a provider's inference: a text delta, or the final turn + usage. */
export type InferEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; turn: WireProviderTurn; tokensIn: number; tokensOut: number }

/**
 * A cloud inference backend behind one interface (ADR-007): Workers AI, or a
 * BYOK OpenAI/Anthropic/etc. adapter. `infer` yields text deltas as they arrive
 * and always ends with a `done` event carrying the final turn (text or tool-call)
 * and numeric token usage. One method covers streaming and non-streaming: the
 * router either proxies the deltas as SSE or drains to the final turn.
 */
export interface InferenceProvider {
  readonly id: string
  infer(
    messages: WireProviderMessage[],
    tools: WireTool[],
    signal: AbortSignal,
  ): AsyncGenerator<InferEvent, void, unknown>
}

/**
 * Thrown by the Workers-AI provider when Cloudflare signals a rate/neuron ceiling
 * — the account-wide free pool is spent for the window. The router catches it to
 * overflow to a BYOK key, or returns `pool-exhausted` when there is no key.
 */
export class WorkersAiCeilingError extends Error {
  constructor() {
    super('Workers AI pool ceiling reached')
    this.name = 'WorkersAiCeilingError'
  }
}

/**
 * Resolves a BYOK credential into a provider bound to the user's key. Pass-through
 * binds the raw key from the request; vault mode resolves a reference token
 * server-side (build/09-edge/03). Injected so tests supply a mock and the real
 * adapter (OpenAI/Anthropic) stays out of the handler. Returns null when the
 * credential cannot be resolved (unknown provider, dead vault reference).
 */
export interface ByokResolver {
  resolve(cred: ByokCredential, signal: AbortSignal): Promise<InferenceProvider | null>
}

export interface AiRouterEnv {
  workersAi: InferenceProvider
  byok: ByokResolver
  /** The per-minute dual-keyed limiter store (strongly consistent — a DO in prod). */
  rateStore: RateStore
  /** The daily Workers-AI quota store (also a DO in prod — KV under-counted bursts). */
  quotaStore: RateStore
  sink: CounterSink
  /** Kill-switch flag; unset or 'off' means live. */
  AI_ROUTER_KILL_SWITCH?: string
  perMinuteLimits?: RateLimits
  workersAiDailyQuota?: number
  providerTimeoutMs?: number
  maxBodyBytes?: number
}

// Launch defaults (§11.2, ADR-007). All tunable from the injected env.
const DEFAULT_PER_MINUTE: RateLimits = { perSession: 10, perIp: 30, windowSeconds: 60 }
const DEFAULT_DAILY_QUOTA = 20
const DAY_SECONDS = 86_400
const DEFAULT_MAX_BODY_BYTES = 64 * 1_024
const DEFAULT_TIMEOUT_MS = 30_000

function isWellFormed(body: unknown): body is AiRouterRequest {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  const routingOk = b.routing === 'prefer-key' || b.routing === 'free-tier-first'
  return (
    typeof b.sessionId === 'string' &&
    routingOk &&
    Array.isArray(b.messages) &&
    Array.isArray(b.tools)
  )
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/**
 * Selects the provider and pulls its first event, applying Workers-AI → BYOK
 * overflow. The first event is pulled here (not by the caller) so a ceiling error
 * — which Cloudflare raises before any token — is caught and overflowed before
 * the router commits to a response shape. Once the first event is in hand the
 * provider is fixed for the rest of the stream.
 */
async function startInference(
  primary: InferenceProvider,
  overflow: { provider: InferenceProvider; servedBy: ServedBy } | null,
  messages: WireProviderMessage[],
  tools: WireTool[],
  primaryServedBy: ServedBy,
  signal: AbortSignal,
): Promise<{ gen: AsyncGenerator<InferEvent>; first: IteratorResult<InferEvent>; servedBy: ServedBy }> {
  const gen = primary.infer(messages, tools, signal)
  try {
    const first = await gen.next()
    return { gen, first, servedBy: primaryServedBy }
  } catch (err) {
    if (err instanceof WorkersAiCeilingError && overflow !== null) {
      const gen2 = overflow.provider.infer(messages, tools, signal)
      const first2 = await gen2.next()
      return { gen: gen2, first: first2, servedBy: overflow.servedBy }
    }
    throw err
  }
}

/** Drains a generator from its first event to the terminal `done`. */
async function drain(
  gen: AsyncGenerator<InferEvent>,
  first: IteratorResult<InferEvent>,
): Promise<{ turn: WireProviderTurn; tokensIn: number; tokensOut: number }> {
  let step = first
  while (!step.done) {
    if (step.value.type === 'done') return step.value
    step = await gen.next()
  }
  // A well-behaved provider always yields `done`; a generator that returns
  // without one is a provider bug, surfaced as an empty text turn.
  return { turn: { kind: 'text', text: '' }, tokensIn: 0, tokensOut: 0 }
}

const SSE_HEADERS = { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }

function sseEvent(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)
}

/**
 * Proxies the provider's deltas to the client as SSE, then a final done event
 * carrying the turn + served-by, then `[DONE]`. Records the numeric metric when
 * the stream closes. Token usage comes from the provider's own `done` event, so
 * the metric is complete even on the streamed path.
 */
function streamResponse(
  gen: AsyncGenerator<InferEvent>,
  first: IteratorResult<InferEvent>,
  servedBy: ServedBy,
  record: (outcome: AiRouterOutcome, served: ServedBy, tokensIn: number, tokensOut: number) => void,
): Response {
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let tokensIn = 0
      let tokensOut = 0
      const emit = (ev: InferEvent): boolean => {
        if (ev.type === 'delta') {
          controller.enqueue(sseEvent({ type: 'delta', text: ev.text }))
          return false
        }
        tokensIn = ev.tokensIn
        tokensOut = ev.tokensOut
        controller.enqueue(sseEvent({ type: 'done', turn: ev.turn, servedBy }))
        return true
      }
      try {
        let step = first
        while (!step.done) {
          if (emit(step.value)) break
          step = await gen.next()
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        record('ok', servedBy, tokensIn, tokensOut)
      } catch {
        // Mid-stream failure (timeout/abort or provider drop): close cleanly. The
        // client sees a truncated stream and degrades to its "couldn't reach the
        // provider" turn; nothing about the failure is stored beyond the outcome.
        record('timeout', servedBy, tokensIn, tokensOut)
      } finally {
        controller.close()
      }
    },
  })
  return new Response(body, { status: 200, headers: SSE_HEADERS })
}

export async function handleAiRouter(request: Request, env: AiRouterEnv): Promise<Response> {
  const started = Date.now()
  const perMinute = env.perMinuteLimits ?? DEFAULT_PER_MINUTE
  const dailyQuota = env.workersAiDailyQuota ?? DEFAULT_DAILY_QUOTA
  const maxBodyBytes = env.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const timeoutMs = env.providerTimeoutMs ?? DEFAULT_TIMEOUT_MS

  // One place records the numeric-only metric for every exit. There is nowhere in
  // its shape to put message content — that is the D41 guarantee.
  const record = (
    outcome: AiRouterOutcome,
    servedBy: ServedBy | 'none',
    tokensIn: number,
    tokensOut: number,
    attempt: number,
  ): void => {
    env.sink.record({
      endpoint: 'ai-router',
      outcome,
      servedBy,
      tokensIn,
      tokensOut,
      attempt,
      latency: latencyBucket(Date.now() - started),
    })
  }

  if (isPaused(env.AI_ROUTER_KILL_SWITCH)) {
    record('paused', 'none', 0, 0, 1)
    return typedError('paused', 503)
  }

  const body = await readCappedJson<unknown>(request, maxBodyBytes)
  if (body === null || !isWellFormed(body)) {
    record('bad-request', 'none', 0, 0, 1)
    return typedError('bad-request', 400)
  }
  const attempt = typeof body.attempt === 'number' && body.attempt >= 1 ? Math.floor(body.attempt) : 1

  // Per-minute dual-keyed limiter (session ceiling + IP floor) on every request.
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const withinRate = await checkRateLimit(env.rateStore, 'ai-router', body.sessionId, ip, perMinute)
  if (!withinRate) {
    record('rate-limited', 'none', 0, 0, attempt)
    return typedError('rate-limited', 429)
  }

  // Route (D3). Resolve primary provider + optional overflow target.
  let primary: InferenceProvider
  let primaryServedBy: ServedBy
  let overflow: { provider: InferenceProvider; servedBy: ServedBy } | null = null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    if (body.routing === 'prefer-key') {
      // 100% of inference via the user's provider; the free pool is never touched.
      if (body.byok === undefined) {
        record('bad-request', 'none', 0, 0, attempt)
        return typedError('bad-request', 400)
      }
      const resolved = await env.byok.resolve(body.byok, controller.signal)
      if (resolved === null) {
        record('bad-request', 'none', 0, 0, attempt)
        return typedError('bad-request', 400)
      }
      primary = resolved
      primaryServedBy = 'byok'
    } else {
      // free-tier-first: Workers AI until the per-session daily quota, then the key.
      const used = await incrementSessionQuota(env.quotaStore, 'ai-router', body.sessionId, DAY_SECONDS)
      if (used <= dailyQuota) {
        primary = env.workersAi
        primaryServedBy = 'workers-ai'
        // A ceiling on Workers AI's own account-wide pool overflows to the key too.
        if (body.byok !== undefined) {
          const key = await env.byok.resolve(body.byok, controller.signal)
          if (key !== null) overflow = { provider: key, servedBy: 'byok' }
        }
      } else if (body.byok !== undefined) {
        // Our per-session quota is spent — overflow to the user's key.
        const resolved = await env.byok.resolve(body.byok, controller.signal)
        if (resolved === null) {
          record('bad-request', 'none', 0, 0, attempt)
          return typedError('bad-request', 400)
        }
        primary = resolved
        primaryServedBy = 'byok'
      } else {
        // Quota spent and no key to fall back to.
        record('quota-exhausted', 'none', 0, 0, attempt)
        return typedError('quota-exhausted', 429)
      }
    }

    let session: Awaited<ReturnType<typeof startInference>>
    try {
      session = await startInference(
        primary,
        overflow,
        body.messages,
        body.tools,
        primaryServedBy,
        controller.signal,
      )
    } catch (err) {
      if (err instanceof WorkersAiCeilingError) {
        // Ceiling with no key to overflow to: the shared pool is spent.
        record('pool-exhausted', 'none', 0, 0, attempt)
        return typedError('pool-exhausted', 429)
      }
      if (isAbort(err)) {
        record('timeout', 'none', 0, 0, attempt)
        return typedError('timeout', 504)
      }
      throw err
    }

    if (body.stream === true) {
      // The stream owns the timer's lifetime — clear it when the stream closes.
      const streamRecord = (
        outcome: AiRouterOutcome,
        served: ServedBy,
        tIn: number,
        tOut: number,
      ): void => {
        clearTimeout(timer)
        record(outcome, served, tIn, tOut, attempt)
      }
      return streamResponse(session.gen, session.first, session.servedBy, streamRecord)
    }

    const { turn, tokensIn, tokensOut } = await drain(session.gen, session.first)
    record('ok', session.servedBy, tokensIn, tokensOut, attempt)
    const response: AiRouterResponse = { turn, servedBy: session.servedBy }
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    if (isAbort(err)) {
      record('timeout', 'none', 0, 0, attempt)
      return typedError('timeout', 504)
    }
    // Anything else that escapes here is an upstream provider failure (e.g. the
    // user's own provider rejecting their BYOK key). Map it to a typed code the
    // client can render — never an unhandled throw, which the platform would
    // serve as an opaque error page. The metric records only the outcome class;
    // nothing about the upstream body (which may echo request fragments) is
    // read, stored, or forwarded.
    record('upstream-error', 'none', 0, 0, attempt)
    return typedError('upstream-error', 502)
  } finally {
    // The streamed path clears the timer itself once its body closes; every other
    // path clears it here. Clearing twice is harmless.
    if (body.stream !== true) clearTimeout(timer)
  }
}

/**
 * Cloudflare entrypoint. The real `env` is bindings; a thin adapter (the shared
 * infra this build owns) builds the seam collaborators — the Workers AI binding
 * as `workersAi`, a Durable Object backing both `rateStore` (the per-minute
 * limiter) and `quotaStore` (the daily quota), Analytics Engine as `sink`, the
 * vault service binding behind `byok` — before calling `handleAiRouter`. The
 * tested surface is `handleAiRouter`.
 */
export default {
  fetch(request: Request, env: AiRouterEnv): Promise<Response> {
    return handleAiRouter(request, env)
  },
}
