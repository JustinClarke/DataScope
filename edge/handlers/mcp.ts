// The DSPS-serving MCP surface (build/09-edge/01 scaffold, build/08-persistence/
// 03-dsps-spec wiring, D38 stage A). A read-only window onto *explicitly
// shared* artifacts only: `list_shared` returns the caller's shared artifact
// ids, `get_dsps` returns the identical client-generated DSPS document for one
// shared artifact (the same rows-free boundary as the share export, §12.3) —
// passed through verbatim, never re-derived (D38: "DSPS itself is unchanged by
// MCP"). It serves nothing that was not explicitly shared — the store enforces
// that, and an unshared or unknown id is a plain not-found, never a leak.
//
// Stage-B tools and any server-side execution stay behind the D39 design round
// (v1+); this surface reads, it does not run. It sits on the same shared infra as
// the ai-router and synthesis: the per-endpoint kill-switch, the dual-keyed
// limiter, and the content-free counters — its own namespace, its own flag.
import type { McpRequest, McpResponse } from '../protocol'
import { typedError, readCappedJson } from '../shared/http'
import { isPaused } from '../shared/killSwitch'
import { checkRateLimit, type RateStore, type RateLimits } from '../shared/limiter'
import { latencyBucket, type CounterSink, type McpOutcome } from '../shared/counters'
import { shareObjectKey, type PersistenceStore } from './persistence'

/**
 * The shared-artifact store. `listShared` returns only ids the session may see;
 * `getDsps` returns an artifact's raw DSPS JSON only when it is explicitly
 * shared, else null. Injected — `createR2SharedArtifactStore` below backs it
 * in production; a map backs it under test.
 */
export interface SharedArtifactStore {
  listShared(sessionId: string): Promise<string[]>
  getDsps(artifactId: string): Promise<unknown | null>
}

/**
 * The content type a structure-only save uses (mirrors
 * `src/services/export.ts`'s `STRUCTURE_REPORT_CONTENT_TYPE` — duplicated,
 * not imported: the edge is a separate deploy and must not import the app,
 * same boundary `protocol.ts`'s header comment already states). A
 * full-dataset share (raw Parquet bytes) never matches this, so MCP can never
 * surface one even if handed its token.
 */
const DSPS_CONTENT_TYPE = 'application/vnd.datascope.dsps+json'

async function readJsonBody(body: ReadableStream<Uint8Array>): Promise<unknown> {
  const text = await new Response(body).text()
  return JSON.parse(text)
}

/**
 * The production `SharedArtifactStore`, backed by the same R2 bucket
 * build/09-edge/04-persistence-endpoints already writes to — `getDsps` is a
 * plain `get` by the share token, gated on content type so a full-dataset
 * share (raw rows) is never returned as if it were a DSPS document.
 *
 * `listShared` is a named, deliberate gap: the persistence store records no
 * session↔token association server-side (`build/09-edge/04`'s own design
 * explicitly stores "nothing beyond what TTL/ownership need" — no session on
 * the object), and building that index is new scope this leaf doc's
 * acceptance criteria don't ask for (only `get_dsps`'s pass-through is
 * tested). Returns `[]` rather than fabricating a list.
 */
export function createR2SharedArtifactStore(store: PersistenceStore): SharedArtifactStore {
  return {
    listShared() {
      return Promise.resolve([])
    },
    async getDsps(artifactId) {
      const object = await store.get(shareObjectKey(artifactId))
      if (object === null) return null
      if (object.httpMetadata?.contentType !== DSPS_CONTENT_TYPE) return null
      try {
        return await readJsonBody(object.body)
      } catch {
        return null
      }
    },
  }
}

export interface McpEnv {
  /** Unbound (no R2 bucket on this deploy) leaves this endpoint reporting itself unavailable, never half-working — vault's/persistence's own shape. */
  store?: SharedArtifactStore
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

  if (request.method !== 'POST') {
    return finish(typedError('bad-request', 400), 'bad-request')
  }

  if (env.store === undefined) {
    return finish(typedError('unavailable', 503), 'unavailable')
  }
  const store = env.store

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
    const artifactIds = await store.listShared(body.sessionId)
    const result: McpResponse = { tool: 'list_shared', artifactIds }
    return finish(json(result), 'ok')
  }

  // get_dsps
  if (typeof body.artifactId !== 'string') {
    return finish(typedError('bad-request', 400), 'bad-request')
  }
  const dsps = await store.getDsps(body.artifactId)
  if (dsps === null) {
    // Unshared, unknown, or not a DSPS-shaped share (e.g. a full-dataset
    // share) — indistinguishable by design, so a probe learns nothing.
    return finish(typedError('not-found', 404), 'not-found')
  }
  const result: McpResponse = { tool: 'get_dsps', artifactId: body.artifactId, dsps }
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
