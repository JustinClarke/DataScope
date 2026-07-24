// The real Cloudflare bindings for the deployed Worker — the concrete `env` the
// runtime hands `fetch`, as opposed to the injected seam collaborators the
// handlers (`handleAiRouter`, …) are tested against. Declared locally as minimal
// interfaces (only the members the adapters use) rather than pulling in
// `@cloudflare/workers-types`: that package redeclares the DOM globals the edge
// tsconfig already provides (`Request`/`Response`/…), and a handful of binding
// shapes is all this deploy needs. wrangler bundles the TS directly, so these are
// the only binding types in play.

/** The Workers AI binding (`[ai]` in wrangler.toml). One method: run a model. */
export interface Ai {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>
}

/** An Analytics Engine dataset binding — the content-free metric sink. */
export interface AnalyticsEngineDataset {
  writeDataPoint(event: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void
}

/** One rate-limiter Durable Object stub — the single RPC method the adapter calls. */
export interface RateLimiterStub {
  increment(windowSeconds: number): Promise<number>
}

/**
 * The rate-limiter DO namespace binding, narrowed to name-based routing — the
 * adapter derives one instance per limiter key with `getByName(key)`.
 */
export interface RateLimiterNamespace {
  getByName(name: string): RateLimiterStub
}

/**
 * A KV namespace, narrowed to the four calls the vault store uses. KV is the
 * vault's backing store (D9, §11.2) — a value store, which is what KV is good
 * at, unlike the counters ADR-006 moved off it for consistency reasons.
 */
export interface KvNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
  list(options: { prefix: string; limit?: number }): Promise<{ keys: Array<{ name: string }> }>
}

/**
 * An R2 object's metadata, narrowed to what the persistence endpoint reads —
 * the shape `put`/`head` resolve to. `get` resolves to the body-bearing
 * extension below.
 */
export interface R2ObjectMeta {
  size: number
  httpMetadata?: { contentType?: string }
  customMetadata?: Record<string, string>
}

/** An R2 object plus its readable body — what `get` resolves to. */
export interface R2ObjectBody extends R2ObjectMeta {
  body: ReadableStream<Uint8Array>
}

/**
 * An R2 bucket, narrowed to the four calls the persistence endpoint uses
 * (D5, §12.3). `head` reads metadata only — used to check a delete's
 * ownership proof without pulling the object body into Worker memory.
 */
export interface R2Bucket {
  put(
    key: string,
    value: ReadableStream<Uint8Array> | null,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<R2ObjectMeta>
  get(key: string): Promise<R2ObjectBody | null>
  head(key: string): Promise<R2ObjectMeta | null>
  delete(key: string): Promise<void>
}

/**
 * The staging Worker's bindings + vars. `AI` and `RATE_LIMITER` are required for
 * the ai-router (`RATE_LIMITER` backs both the per-minute limiter and the daily
 * quota); `METRICS` is optional (metrics no-op when unbound); the rest are plain
 * string vars with launch defaults applied downstream.
 */
export interface Env {
  AI: Ai
  RATE_LIMITER: RateLimiterNamespace
  METRICS?: AnalyticsEngineDataset
  /** The BYOK vault's store. Unbound leaves the vault refusing every operation. */
  VAULT_KV?: KvNamespace
  /**
   * At-rest encryption secret for vaulted keys (`wrangler secret put
   * VAULT_SECRET`). Unset means the vault is unconfigured and declines — it
   * never falls back to storing a key in the clear.
   */
  VAULT_SECRET?: string
  /** Per-endpoint kill-switch for /vault — same semantics, independent flag. */
  VAULT_KILL_SWITCH?: string
  /** Kill-switch (§23.5): any value but ''/'off'/unset pauses the endpoint. */
  AI_ROUTER_KILL_SWITCH?: string
  /** Per-endpoint kill-switch for /synthesis — same semantics, independent flag. */
  SYNTHESIS_KILL_SWITCH?: string
  /** Per-endpoint kill-switch for /cors-relay — same semantics, independent flag. */
  CORS_RELAY_KILL_SWITCH?: string
  /** R2 save/share's object store (D5, §12.3). Unbound leaves it answering `unavailable`. */
  PERSISTENCE_BUCKET?: R2Bucket
  /** Per-endpoint kill-switch for /persistence — same semantics, independent flag. */
  PERSISTENCE_KILL_SWITCH?: string
  /** Per-endpoint kill-switch for /mcp — same semantics, independent flag. */
  MCP_KILL_SWITCH?: string
  /** Workers AI model id (ADR-007 default applied when unset). */
  AI_MODEL?: string
  /** Per-session daily Workers-AI turn quota (§11.2 default applied when unset). */
  WORKERS_AI_DAILY_QUOTA?: string
  /** CORS allow-origin; defaults to '*' (no cookies cross the wire, only a body). */
  CORS_ALLOW_ORIGIN?: string
  /** Provider call timeout in ms (§21.6); ai-router.ts's own default applies when unset. */
  AI_ROUTER_TIMEOUT_MS?: string
  /** Request body cap in bytes; ai-router.ts's own default applies when unset. */
  AI_ROUTER_MAX_BODY_BYTES?: string
  /** Per-minute dual-keyed limiter (§23.5) — all three must be set to override the default. */
  AI_ROUTER_PER_SESSION_LIMIT?: string
  AI_ROUTER_PER_IP_LIMIT?: string
  AI_ROUTER_WINDOW_SECONDS?: string
}
