// The deployed Worker entrypoint (build/09-edge/01). The runtime hands it real
// Cloudflare bindings; it builds the ai-router's seam collaborators from those
// bindings (adapters.ts, byok.ts) and dispatches by path. The tested surface is
// still `handleAiRouter` — this file is only binding wiring, CORS, and routing,
// none of which the seam-level tests need to cover.
//
// Scope of this staging deploy: the ai-router endpoint backed by a real Workers
// AI binding (what the D40 eval harness and the E2E point at), the synthesis
// endpoint — the Blueprint's warm-start re-phrase/re-rank producer — the
// cors-relay endpoint (build/09-edge/02, §7.4 Tier 2), the persistence
// endpoint (build/09-edge/04, R2 save/share), and the MCP endpoint
// (build/08-persistence/03-dsps-spec, D38 stage A) — all on the same shared
// limiter/kill-switch/Analytics-sink infra.
import { handleAiRouter, type AiRouterEnv } from './handlers/ai-router'
import { handleSynthesis, type SynthesisEnv } from './handlers/synthesis'
import { handleCorsRelay, type CorsRelayEnv } from './handlers/cors-relay'
import { handleVault, createVaultResolver, type VaultEnv } from './handlers/vault'
import { handlePersistence, type PersistenceEnv } from './handlers/persistence'
import { handleMcp, createR2SharedArtifactStore, type McpEnv } from './handlers/mcp'
import { createWorkersAiSynthesisProvider, createRoutingSynthesisProvider } from './ai/synthesisProvider'
import { createByokResolver } from './ai/byok'
import {
  createDurableObjectRateStore,
  createAnalyticsSink,
  createKvVaultStore,
  createR2PersistenceStore,
  createWorkersAiProvider,
  DEFAULT_AI_MODEL,
} from './adapters'
import type { Env } from './bindings'

// The runtime binds the Durable Object by this exported class name (wrangler.toml
// durable_objects.bindings + migration). It backs both counter stores — the
// per-minute limiter and the daily quota — one instance per limiter key.
export { RateLimiterDo } from './rate-limit/rateLimiterDo'

function corsHeaders(env: Env, request: Request): Record<string, string> {
  const configured = env.CORS_ALLOW_ORIGIN
  // No cookies cross this wire (the key rides in the body, not a credential), so a
  // wildcard is safe; a configured origin is reflected when the caller matches it.
  const origin = request.headers.get('origin')
  const allow =
    configured === undefined || configured === '*'
      ? '*'
      : origin !== null && configured.split(',').includes(origin)
        ? origin
        : configured.split(',')[0]
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  }
}

/** Re-emits a response with CORS headers merged in, preserving a streamed body. */
function withCors(response: Response, cors: Record<string, string>): Response {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(cors)) headers.set(k, v)
  return new Response(response.body, { status: response.status, headers })
}

/** Parses a numeric var, falling back to undefined (the caller's own default) when unset/invalid. */
function numVar(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function buildVaultEnv(env: Env): VaultEnv {
  return {
    // An unbound namespace leaves `store` undefined, which is how the vault
    // reports itself unconfigured instead of half-working.
    store: env.VAULT_KV === undefined ? undefined : createKvVaultStore(env.VAULT_KV),
    rateStore: createDurableObjectRateStore(env.RATE_LIMITER),
    sink: createAnalyticsSink(env.METRICS),
    VAULT_SECRET: env.VAULT_SECRET,
    VAULT_KILL_SWITCH: env.VAULT_KILL_SWITCH,
  }
}

function buildAiRouterEnv(env: Env): AiRouterEnv {
  const perSession = numVar(env.AI_ROUTER_PER_SESSION_LIMIT)
  const perIp = numVar(env.AI_ROUTER_PER_IP_LIMIT)
  const windowSeconds = numVar(env.AI_ROUTER_WINDOW_SECONDS)
  // Both stores share the one DO namespace: keys are already namespaced apart
  // (`ai-router:session:`/`ai-router:ip:` vs `ai-router:quota:`), and each key
  // routes to its own instance, so the counters never collide.
  const doStore = createDurableObjectRateStore(env.RATE_LIMITER)
  return {
    workersAi: createWorkersAiProvider(env.AI, env.AI_MODEL ?? DEFAULT_AI_MODEL),
    // Both D9 custody forms behind one resolver: a pass-through key from the
    // request, or a vaulted one read server-side (build/09-edge/03).
    byok: createByokResolver(createVaultResolver(buildVaultEnv(env))),
    rateStore: doStore,
    quotaStore: doStore,
    sink: createAnalyticsSink(env.METRICS),
    AI_ROUTER_KILL_SWITCH: env.AI_ROUTER_KILL_SWITCH,
    workersAiDailyQuota: numVar(env.WORKERS_AI_DAILY_QUOTA),
    providerTimeoutMs: numVar(env.AI_ROUTER_TIMEOUT_MS),
    providerIdleTimeoutMs: numVar(env.AI_ROUTER_IDLE_TIMEOUT_MS),
    maxBodyBytes: numVar(env.AI_ROUTER_MAX_BODY_BYTES),
    perMinuteLimits:
      perSession !== undefined && perIp !== undefined && windowSeconds !== undefined
        ? { perSession, perIp, windowSeconds }
        : undefined,
  }
}

function buildCorsRelayEnv(env: Env): CorsRelayEnv {
  return {
    rateStore: createDurableObjectRateStore(env.RATE_LIMITER),
    sink: createAnalyticsSink(env.METRICS),
    CORS_RELAY_KILL_SWITCH: env.CORS_RELAY_KILL_SWITCH,
  }
}

function buildPersistenceEnv(env: Env): PersistenceEnv {
  return {
    // An unbound bucket leaves `store` undefined, which is how the endpoint
    // reports itself unconfigured instead of half-working (vault's own shape).
    store: env.PERSISTENCE_BUCKET === undefined ? undefined : createR2PersistenceStore(env.PERSISTENCE_BUCKET),
    rateStore: createDurableObjectRateStore(env.RATE_LIMITER),
    sink: createAnalyticsSink(env.METRICS),
    PERSISTENCE_KILL_SWITCH: env.PERSISTENCE_KILL_SWITCH,
  }
}

function buildMcpEnv(env: Env): McpEnv {
  return {
    // Same "unbound bucket ⇒ unavailable" shape as /persistence — the two
    // endpoints share one R2 binding.
    store: env.PERSISTENCE_BUCKET === undefined ? undefined : createR2SharedArtifactStore(createR2PersistenceStore(env.PERSISTENCE_BUCKET)),
    rateStore: createDurableObjectRateStore(env.RATE_LIMITER),
    sink: createAnalyticsSink(env.METRICS),
    MCP_KILL_SWITCH: env.MCP_KILL_SWITCH,
  }
}

function buildSynthesisEnv(env: Env): SynthesisEnv {
  return {
    // The D3 routing wrapper: Workers AI by default, the user's own provider on
    // prefer-key, ceiling-only overflow on free-tier-first — same pass-through
    // key custody as the ai-router (byok.ts).
    provider: createRoutingSynthesisProvider(
      createWorkersAiSynthesisProvider(env.AI, env.AI_MODEL ?? DEFAULT_AI_MODEL),
      createByokResolver(createVaultResolver(buildVaultEnv(env))),
    ),
    rateStore: createDurableObjectRateStore(env.RATE_LIMITER),
    sink: createAnalyticsSink(env.METRICS),
    SYNTHESIS_KILL_SWITCH: env.SYNTHESIS_KILL_SWITCH,
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env, request)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    const { pathname } = new URL(request.url)
    // A binding-only liveness probe for post-deploy verification — no model call.
    if (pathname === '/health') {
      return withCors(
        new Response(JSON.stringify({ ok: true, model: env.AI_MODEL ?? DEFAULT_AI_MODEL }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
        cors,
      )
    }

    if (pathname === '/ai-router') {
      if (request.method !== 'POST') {
        return withCors(
          new Response(JSON.stringify({ error: 'bad-request' }), {
            status: 405,
            headers: { 'content-type': 'application/json' },
          }),
          cors,
        )
      }
      const response = await handleAiRouter(request, buildAiRouterEnv(env))
      return withCors(response, cors)
    }

    if (pathname === '/cors-relay') {
      const response = await handleCorsRelay(request, buildCorsRelayEnv(env))
      return withCors(response, cors)
    }

    if (pathname === '/vault') {
      // Method rejection lives inside the handler (like /cors-relay) so this
      // file's untested wiring isn't the only thing that enforces it.
      const response = await handleVault(request, buildVaultEnv(env))
      return withCors(response, cors)
    }

    if (pathname === '/persistence') {
      // GET (fetch a shared object) needs no preflight; POST (save, or delete
      // via ?op=delete) does its own method/op branching inside the handler,
      // like /cors-relay and /vault, so it stays exercised by this file's own
      // tests rather than only reachable through untested worker.ts.
      const response = await handlePersistence(request, buildPersistenceEnv(env))
      return withCors(response, cors)
    }

    if (pathname === '/mcp') {
      // Method rejection lives inside the handler, like /vault and /persistence.
      const response = await handleMcp(request, buildMcpEnv(env))
      return withCors(response, cors)
    }

    if (pathname === '/synthesis') {
      if (request.method !== 'POST') {
        return withCors(
          new Response(JSON.stringify({ error: 'bad-request' }), {
            status: 405,
            headers: { 'content-type': 'application/json' },
          }),
          cors,
        )
      }
      const response = await handleSynthesis(request, buildSynthesisEnv(env))
      return withCors(response, cors)
    }

    return withCors(
      new Response(JSON.stringify({ error: 'not-found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
      cors,
    )
  },
}
