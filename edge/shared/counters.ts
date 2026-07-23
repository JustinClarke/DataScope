// Content-free operator counters. The endpoint records how it went — never what
// it did. The metric shape below makes content-bearing telemetry *unrepresentable*:
// there is nowhere to put a fact, a narrative, or a column name, only an endpoint
// label, an outcome class, and coarse size/latency buckets. That is the honesty
// guarantee, not a rule a future edit must remember to follow.
//
// In production the sink is a Cloudflare Analytics Engine dataset (owned by the
// shared infra, build/09-edge/01); under test it is an array the audit asserts
// against.

export type SynthesisOutcome = 'ok' | 'degraded' | 'rate-limited' | 'paused' | 'bad-request'

/** Coarse buckets so even sizes/latencies can't fingerprint a specific dataset. */
export type SizeBucket = 'xs' | 'sm' | 'md' | 'lg'
export type LatencyBucket = 'fast' | 'normal' | 'slow'

export interface SynthesisMetric {
  endpoint: 'synthesis'
  outcome: SynthesisOutcome
  size: SizeBucket
  latency: LatencyBucket
}

/**
 * The ai-router's per-turn LLM metric (D41). Numeric-only by construction: an
 * outcome class, which provider served, raw token counts, the attempt number
 * (the §11.1 loop's retry index — the client sends it, content-free), and a
 * latency bucket. There is nowhere here to put a prompt, generated SQL, or an
 * error string — that content stays in the client-side transcript, never the
 * counters. That absence is the D41 guarantee, not a rule a later edit must
 * remember.
 */
export type AiRouterOutcome =
  | 'ok'
  | 'rate-limited'
  | 'quota-exhausted'
  | 'pool-exhausted'
  | 'paused'
  | 'timeout'
  | 'upstream-error'
  | 'bad-request'

export type ServedBy = 'workers-ai' | 'byok' | 'none'

export interface AiRouterMetric {
  endpoint: 'ai-router'
  outcome: AiRouterOutcome
  servedBy: ServedBy
  tokensIn: number
  tokensOut: number
  /** 1-based §11.1 loop attempt; the repair-rate signal, purely numeric. */
  attempt: number
  latency: LatencyBucket
}

/** The DSPS-serving MCP surface's outcome counter (D38 stage A). */
export type McpOutcome = 'ok' | 'not-found' | 'rate-limited' | 'paused' | 'bad-request'

export interface McpMetric {
  endpoint: 'mcp'
  outcome: McpOutcome
  latency: LatencyBucket
}

/** The Tier-2 CORS relay's outcome counter (build/09-edge/02-cors-relay). */
export type CorsRelayOutcome =
  | 'ok'
  | 'rate-limited'
  | 'paused'
  | 'bad-request'
  | 'blocked'
  | 'oversized'
  | 'timeout'
  | 'upstream-error'

export interface CorsRelayMetric {
  endpoint: 'cors-relay'
  outcome: CorsRelayOutcome
  size: SizeBucket
  latency: LatencyBucket
}

/**
 * The BYOK vault's outcome counter (build/09-edge/03-vault). `resolved` and
 * `resolve-miss` are the router-internal lookup's two outcomes; the rest are the
 * client-facing store/delete operations. There is deliberately no field for the
 * reference, the session, or the provider — a vault metric can say how an
 * operation went and nothing about whose key it was.
 */
export type VaultOutcome =
  | 'ok'
  | 'resolved'
  | 'resolve-miss'
  | 'not-found'
  | 'cap-reached'
  | 'rate-limited'
  | 'paused'
  | 'bad-request'
  | 'unavailable'

export interface VaultMetric {
  endpoint: 'vault'
  outcome: VaultOutcome
  latency: LatencyBucket
}

/**
 * R2 save/share's outcome counter (build/09-edge/04-persistence-endpoints,
 * §12.3). Covers all three operations (save/get/delete); `deleted` is
 * `delete`'s own success outcome, kept distinct from `ok` (save/get's) so the
 * three operations' volumes are still distinguishable in the aggregate. No
 * field for the token or the object's content — same discipline as the other
 * four endpoints' metrics.
 */
export type PersistenceOutcome =
  | 'ok'
  | 'deleted'
  | 'not-found'
  | 'too-large'
  | 'rate-limited'
  | 'quota-exceeded'
  | 'paused'
  | 'bad-request'
  | 'unavailable'

export interface PersistenceMetric {
  endpoint: 'persistence'
  outcome: PersistenceOutcome
  size: SizeBucket
  latency: LatencyBucket
}

/** Every content-free metric the shared edge infra records. */
export type EdgeMetric =
  | SynthesisMetric
  | AiRouterMetric
  | McpMetric
  | CorsRelayMetric
  | VaultMetric
  | PersistenceMetric

export interface CounterSink {
  record(metric: EdgeMetric): void
}

export function sizeBucket(bytes: number): SizeBucket {
  if (bytes < 1_024) return 'xs'
  if (bytes < 8_192) return 'sm'
  if (bytes < 32_768) return 'md'
  return 'lg'
}

export function latencyBucket(ms: number): LatencyBucket {
  if (ms < 300) return 'fast'
  if (ms < 1_500) return 'normal'
  return 'slow'
}

/** An in-memory sink for tests — the storage audit reads what landed here. */
export function createMemorySink(): CounterSink & { metrics: EdgeMetric[] } {
  const metrics: EdgeMetric[] = []
  return {
    metrics,
    record(metric) {
      metrics.push(metric)
    },
  }
}
