// The DSPS-serving MCP surface (build/09-edge/01, D38 stage A). A read-only
// window onto *explicitly shared* artifacts only: `list_shared` returns the
// caller's shared artifact ids, `get_dsps` returns one shared artifact's
// structure-only facts (the same rows-free boundary as the share export). It
// serves nothing that was not explicitly shared — the store enforces that, and an
// unshared or unknown id is a plain not-found, never a leak.
//
// Stage-B tools and any server-side execution stay behind the D39 design round
// (v1+); this surface reads, it does not run. It sits on the same shared infra as
// the ai-router and synthesis: the per-endpoint kill-switch, the dual-keyed
// limiter, and the content-free counters — its own namespace, its own flag.
import type { McpRequest, McpResponse, StructuralFacts } from '../protocol'
import { typedError, readCappedJson } from '../shared/http'
import { isPaused } from '../shared/killSwitch'
import { checkRateLimit, type RateStore, type RateLimits } from '../shared/limiter'
import { latencyBucket, type CounterSink, type McpOutcome } from '../shared/counters'

/**
 * The shared-artifact store. `listShared` returns only ids the session may see;
 * `getDsps` returns an artifact's structural facts only when it is explicitly
 * shared, else null. Injected — build/08-persistence/03-dsps-spec + the R2
 * share store back it in production; a map backs it under test.
 */
export interface SharedArtifactStore {
  listShared(sessionId: string): Promise<string[]>
  getDsps(artifactId: string): Promise<StructuralFacts | null>
}

export interface McpEnv {
  store: SharedArtifactStore
  rateStore: RateStore
  sink: CounterSink
  /** Kill-switch flag; unset or 'off' means live. */
  MCP_KILL_SWITCH?: string
  perMinuteLimits?: RateLimits
  maxBodyBytes?: number
}

const DEFAULT_PER_MINUTE: RateLimits = { perSession: 30, perIp: 60, windowSeconds: 60 }
const DEFAULT_MAX_BODY_BYTES = 8 * 1_024

function isWellFormed(body: unknown): body is McpRequest {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  const toolOk = b.tool === 'list_shared' || b.tool === 'get_dsps'
  return typeof b.sessionId === 'string' && toolOk
}

export async function handleMcp(request: Request, env: McpEnv): Promise<Response> {
  const started = Date.now()
  const perMinute = env.perMinuteLimits ?? DEFAULT_PER_MINUTE
  const maxBodyBytes = env.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES

  const finish = (response: Response, outcome: McpOutcome): Response => {
    env.sink.record({ endpoint: 'mcp', outcome, latency: latencyBucket(Date.now() - started) })
    return response
  }

  if (isPaused(env.MCP_KILL_SWITCH)) {
    return finish(typedError('paused', 503), 'paused')
  }

  const body = await readCappedJson<unknown>(request, maxBodyBytes)
  if (body === null || !isWellFormed(body)) {
    return finish(typedError('bad-request', 400), 'bad-request')
  }

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const withinRate = await checkRateLimit(env.rateStore, 'mcp', body.sessionId, ip, perMinute)
  if (!withinRate) {
    return finish(typedError('rate-limited', 429), 'rate-limited')
  }

  if (body.tool === 'list_shared') {
    const artifactIds = await env.store.listShared(body.sessionId)
    const result: McpResponse = { tool: 'list_shared', artifactIds }
    return finish(json(result), 'ok')
  }

  // get_dsps
  if (typeof body.artifactId !== 'string') {
    return finish(typedError('bad-request', 400), 'bad-request')
  }
  const facts = await env.store.getDsps(body.artifactId)
  if (facts === null) {
    // Unshared or unknown — indistinguishable by design, so a probe learns nothing.
    return finish(typedError('not-found', 404), 'not-found')
  }
  const result: McpResponse = { tool: 'get_dsps', artifactId: body.artifactId, facts }
  return finish(json(result), 'ok')
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export default {
  fetch(request: Request, env: McpEnv): Promise<Response> {
    return handleMcp(request, env)
  },
}
