// The synthesis endpoint (warm start). It emits the Blueprint's initial dataset
// narrative + suggested explorations quickly, covering the client model's
// download cold-start. It is a *producer over the deterministic baseline*: it
// receives the slice the app already computed and returns the same slice type,
// re-ordered and re-phrased — never a claim or route it originated. Because the
// baseline crosses the wire and the response is validated back against it on the
// client, "bound to the broker grammar" is structural, not a runtime promise the
// endpoint makes about itself.
//
// The endpoint is stateless: the structural fragment is forwarded to the model
// and nothing is persisted. The rate counters hold only numeric counts under
// opaque keys; the metric sink holds only numeric outcome/size/latency buckets.
// No DSPS text, narrative, or column name is ever written down here.
//
// It sits on the shared edge infrastructure (build/09-edge/01): a per-endpoint
// kill-switch, the dual-keyed limiter, a request-body cap, and content-free
// counters. Provider routing (Workers AI default; BYOK pass-through or vault per
// the D3 toggle) is that shared router — injected here as a seam, not a second
// router.
import type { SynthesisRequest, SynthesisResponse } from '../protocol'
import { readCappedJson, errorResponse, jsonResponse } from '../shared/http'
import { isSynthesisPaused } from '../shared/killSwitch'
import { checkRateLimit, type RateStore, type RateLimits } from '../shared/limiter'
import {
  sizeBucket,
  latencyBucket,
  type CounterSink,
  type SynthesisOutcome,
} from '../shared/counters'

/**
 * The model call. In production this is the shared ai-router (Workers AI, or a
 * BYOK/vault pass-through per the D3 toggle); here it is injected so the endpoint
 * is testable with a mocked provider. Structure-only input, same-slice output.
 */
export interface SynthesisProvider {
  synthesize(req: SynthesisRequest, signal: AbortSignal): Promise<SynthesisResponse>
}

/**
 * The endpoint's collaborators. In a real Worker a thin adapter builds these from
 * Cloudflare bindings (a service binding to the router, a KV/DO counter, an
 * Analytics Engine dataset, an env var); that wiring is the shared infra's
 * (build/09-edge/01). The handler itself only ever sees the seam.
 */
export interface SynthesisEnv {
  provider: SynthesisProvider
  rateStore: RateStore
  sink: CounterSink
  /** The kill-switch flag; unset or 'off' means live. */
  SYNTHESIS_KILL_SWITCH?: string
  limits?: RateLimits
  maxBodyBytes?: number
  providerTimeoutMs?: number
}

const DEFAULT_LIMITS: RateLimits = { perSession: 20, perIp: 60, windowSeconds: 60 }
const DEFAULT_MAX_BODY_BYTES = 64 * 1_024
const DEFAULT_PROVIDER_TIMEOUT_MS = 8_000

function isWellFormed(body: unknown): body is SynthesisRequest {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return (
    typeof b.sessionId === 'string' &&
    typeof b.facts === 'object' &&
    b.facts !== null &&
    typeof b.baseline === 'object' &&
    b.baseline !== null &&
    Array.isArray((b.baseline as Record<string, unknown>).actions)
  )
}

export async function handleSynthesis(request: Request, env: SynthesisEnv): Promise<Response> {
  const started = Date.now()
  const limits = env.limits ?? DEFAULT_LIMITS
  const maxBodyBytes = env.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES

  const finish = (response: Response, outcome: SynthesisOutcome, bytes: number): Response => {
    env.sink.record({
      endpoint: 'synthesis',
      outcome,
      size: sizeBucket(bytes),
      latency: latencyBucket(Date.now() - started),
    })
    return response
  }

  if (isSynthesisPaused(env.SYNTHESIS_KILL_SWITCH)) {
    return finish(errorResponse('paused'), 'paused', 0)
  }

  const body = await readCappedJson<unknown>(request, maxBodyBytes)
  if (body === null || !isWellFormed(body)) {
    return finish(errorResponse('bad-request'), 'bad-request', 0)
  }
  const bytes = new TextEncoder().encode(JSON.stringify(body)).length

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const allowed = await checkRateLimit(env.rateStore, 'synthesis', body.sessionId, ip, limits)
  if (!allowed) {
    return finish(errorResponse('rate-limited'), 'rate-limited', bytes)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), env.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS)
  try {
    const slice = await env.provider.synthesize(body, controller.signal)
    return finish(jsonResponse(slice), 'ok', bytes)
  } catch {
    // Model down, timed out, or over budget. The baseline already crossed the
    // wire, so echo it back: the client sees an unchanged slice and stays on the
    // deterministic answer it already painted. Nothing about the failure is stored.
    const baseline: SynthesisResponse = {
      headlineFact: body.baseline.headlineFact,
      actions: body.baseline.actions,
    }
    return finish(jsonResponse(baseline), 'degraded', bytes)
  } finally {
    clearTimeout(timeout)
  }
}
