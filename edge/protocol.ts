// The synthesis wire contract — the boundary between the browser and the edge.
//
// This file is deliberately self-contained: the edge is a separate deploy and
// must not import the app's store/UI layer, so the crossing shapes are declared
// here as plain data. They mirror the frozen composition-layer slices the app
// computes (the headline claim-carrier and the ranked-action list) field for
// field, but keep `module`/enum fields as open strings — the edge never
// interprets them, it only re-orders and re-phrases. The client validates the
// response back against its own typed baseline before trusting a single field.
//
// What crosses is structure only: schema, types, and profile aggregates plus the
// deterministic baseline the model re-phrases. Never a data row, never a raw
// registry. Column names are themselves re-identifiable, so the whole call is
// behind an explicit opt-in on the client. The one non-structural field is the
// optional BYOK credential — same stateless pass-through custody as the
// ai-router: attached, forwarded to the user's own provider, never persisted.

/** A claim-carrier as it crosses the wire (mirrors the app's FactRef). */
export interface WireFact {
  statement: string;
  sql: string;
  snapshot: string;
  confidence: string;
  provenance: string;
}

/** A ranked action as it crosses the wire (mirrors the app's RankedAction). */
export interface WireAction {
  verb: string;
  module: string;
  tab?: string;
  prefill: { module: string; prefilledConfig: Record<string, unknown> };
  evidence: WireFact;
  score: number;
}

/**
 * Structure-only description of the dataset — the same rows-free boundary as the
 * share export: table/column names, semantic + physical types, and aggregate
 * profile signals (null %, distinct count). No cell values, no sample rows. The
 * eventual DSPS spec (build/08-persistence/03-dsps-spec) formalizes this; this is
 * the minimal structured shape the synthesis call needs today.
 */
export interface StructuralFacts {
  tables: Array<{
    name: string;
    rowCount: number;
    columns: Array<{
      name: string;
      semanticType: string;
      physicalType: string;
      nullPercentage: number | null;
      cardinality: number;
      /** Earliest/latest value, Temporal columns only — never present otherwise. */
      minDate?: string | null;
      maxDate?: string | null;
    }>;
  }>;
}

/**
 * The request body. Carries the deterministic baseline the model re-ranks and
 * re-phrases (never originates) plus the structure-only facts for context. A
 * per-session id keys the shared limiter; it is opaque and content-free.
 */
export interface SynthesisRequest {
  sessionId: string;
  facts: StructuralFacts;
  baseline: {
    headlineFact: WireFact;
    actions: WireAction[];
  };
  /** The D3 routing toggle; absent means free-tier-first. Declared below with the ai-router contract. */
  routing?: RoutingMode;
  /** BYOK credential (D9) — same stateless pass-through custody as the ai-router: attached, forwarded, never persisted. */
  byok?: ByokCredential;
}

/** The success body: the same slices, re-ordered and re-phrased in place. */
export interface SynthesisResponse {
  headlineFact: WireFact;
  actions: WireAction[];
}

/** Typed error codes the client branches on — never a bare 500 with prose. */
export type SynthesisErrorCode =
  | 'bad-request' // malformed or over-cap body (400/413)
  | 'rate-limited' // dual-keyed limiter tripped (429)
  | 'paused'; // per-endpoint kill-switch flipped (503)

export interface SynthesisError {
  error: SynthesisErrorCode;
}

// ── AI router wire contract (build/09-edge/01, §11.2) ──────────────────────
// The NL→SQL cloud path. Unlike synthesis, this call *does* carry prompt content
// (the schema-pruned messages + generated SQL) — that is the cloud-AI trade the
// user opted into (§11.4: "API mode: schema, prompts, generated SQL"). The shapes
// mirror src/types/ai.ts (ProviderMessage / AITool / ProviderTurn) field for
// field, declared here because the edge is a separate deploy and must not import
// the app. The router re-routes and re-serves; it never re-interprets a message.

/** A model's request to call a tool, as it crosses the wire (mirrors ProviderToolCall). */
export interface WireToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** A conversation message (mirrors ProviderMessage). */
export type WireProviderMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCall?: WireToolCall }
  | { role: 'tool'; toolCallId: string; content: string };

/** A tool the model may call (mirrors AITool). */
export interface WireTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** One provider turn: a final text answer, or a tool-call request (mirrors ProviderTurn). */
export type WireProviderTurn =
  | { kind: 'text'; text: string }
  | { kind: 'tool_call'; call: WireToolCall };

/** The D3 routing toggle: user's key first, or Workers-AI free tier until its ceiling. */
export type RoutingMode = 'prefer-key' | 'free-tier-first';

/**
 * The user's BYOK credential (D9). Exactly one custody form is present:
 * `key` is a raw pass-through key (attached to the provider call, never
 * persisted/logged/echoed) or `vaultRef` + `vaultSession` name a vaulted key the
 * router resolves server-side via build/09-edge/03-vault. Required for
 * prefer-key; an optional overflow target for free-tier-first.
 *
 * The vault form carries its own session id rather than reusing the request's
 * `sessionId`: the vault's session is the durable one the browser persists
 * alongside the reference (that is what "remember my key across sessions"
 * means), while `sessionId` is per-page-load and keys the rate limiter. Both
 * halves are required to resolve — a reference alone names nothing.
 */
export interface ByokCredential {
  provider: string; // 'openai' | 'anthropic' | ...
  model?: string;
  key?: string; // pass-through raw key
  vaultRef?: string; // vault reference token
  vaultSession?: string; // the durable session the reference is scoped to
}

export interface AiRouterRequest {
  sessionId: string;
  routing: RoutingMode;
  byok?: ByokCredential;
  messages: WireProviderMessage[];
  tools: WireTool[];
  /** Request an SSE token stream for a text answer (§15 latency). */
  stream?: boolean;
  /** 1-based §11.1 loop attempt — numeric only, for the D41 retry/repair metric. */
  attempt?: number;
}

/** Which provider served the response — surfaced so the client can label it (D3). */
export type ServedBy = 'workers-ai' | 'byok';

/** The non-streamed success body. */
export interface AiRouterResponse {
  turn: WireProviderTurn;
  servedBy: ServedBy;
}

/**
 * Typed error codes the client branches on. `quota-exhausted`, `pool-exhausted`,
 * and `paused` are the shared-free-budget-spent / kill-switch states the client
 * renders as ProviderQuotaExhaustedError (§11.2); `timeout` is the §21.6 path.
 */
export type AiRouterErrorCode =
  | 'bad-request' // malformed / over-64KB body, or prefer-key with no key (400)
  | 'rate-limited' // per-minute per-session limiter tripped (429)
  | 'quota-exhausted' // per-session daily Workers-AI turn quota spent, no key to overflow to (429)
  | 'pool-exhausted' // account-wide free pool spent (Workers-AI ceiling), no key to overflow to (429)
  | 'paused' // kill-switch flipped (503)
  | 'timeout' // upstream provider timed out (504)
  | 'upstream-error'; // upstream provider failed (e.g. a BYOK key the provider rejected) (502)

export interface AiRouterError {
  error: AiRouterErrorCode;
}

// ── DSPS-serving MCP surface (build/09-edge/01, D38 stage A) ────────────────
// A read-only MCP surface over *explicitly shared* artifacts only. Two tools:
// `list_shared` (the caller's shared artifact ids) and `get_dsps` (one shared
// artifact's structural facts). Stage-B tools + server-side execution stay behind
// the D39 design round (v1+). It inherits the same limiter/kill-switch/counters.

export type McpTool = 'list_shared' | 'get_dsps';

export interface McpRequest {
  sessionId: string;
  tool: McpTool;
  /** Required for get_dsps: the explicitly-shared artifact id. */
  artifactId?: string;
}

/**
 * list_shared → ids only; get_dsps → the *identical* client-generated DSPS
 * document (build/08-persistence/03-dsps-spec), passed through verbatim —
 * `dsps` is deliberately `unknown` here: the edge transports the artifact, it
 * never re-derives or re-shapes it (D38's "DSPS itself is unchanged by MCP").
 */
export type McpResponse =
  | { tool: 'list_shared'; artifactIds: string[] }
  | { tool: 'get_dsps'; artifactId: string; dsps: unknown };

export type McpErrorCode = 'bad-request' | 'not-found' | 'rate-limited' | 'paused' | 'unavailable';

export interface McpError {
  error: McpErrorCode;
}

// ── Tier-2 CORS relay wire contract (build/09-edge/02-cors-relay.md, §7.4) ──
// A strict single-fetch pass-through: one target URL in, one response out.
// Pagination is entirely client-driven (decided 2026-07-23, ADR-006) — the
// client calls this endpoint once per page; the relay has no concept of "page"
// and never inspects or rewrites the response body, only forwards it streamed.
// GET only, both inbound and to the target; the target URL and sessionId travel
// as query params since there is no request body to carry them.

/** Typed error codes the client branches on — never a bare 500 with prose. */
export type CorsRelayErrorCode =
  | 'bad-request' // missing/malformed url or sessionId, or a non-GET request (400)
  | 'blocked' // target resolves to a private/loopback/link-local address (400)
  | 'rate-limited' // dual-keyed per-minute or per-hour limiter tripped (429)
  | 'paused' // per-endpoint kill-switch flipped (503)
  | 'too-many-redirects' // exceeded the 5-redirect cap (502)
  | 'oversized' // target response exceeded the 100MB cap (502)
  | 'upstream-error' // target fetch failed, or redirected without a usable Location (502)
  | 'timeout'; // exceeded the 30s ceiling (504)

export interface CorsRelayError {
  error: CorsRelayErrorCode;
}

// ── BYOK credential vault (build/09-edge/03-vault.md, §11.2 D9) ─────────────
// The opt-in half of D9 custody: "Remember my key" trades browser-memory-only
// for a server-side store, so the browser holds a reference instead of the key.
//
// The client surface is deliberately two operations. `store` takes a key and
// returns a reference; `delete` removes it. There is no client-facing resolve:
// the raw key is only ever read router-internally, on its way into an outbound
// provider call, and no response on this endpoint can carry key material back.
// That absence is the custody guarantee — not a rule a later edit must recall.

export interface VaultStoreRequest {
  op: 'store';
  /** The durable vault session the reference is scoped to (client-minted, opt-in). */
  sessionId: string;
  provider: string;
  model?: string;
  /** The raw bearer key. Encrypted at rest; never returned, logged, or counted. */
  key: string;
}

export interface VaultDeleteRequest {
  op: 'delete';
  sessionId: string;
  ref: string;
}

export type VaultRequest = VaultStoreRequest | VaultDeleteRequest;

/** `store` answers with the reference only; `delete` answers with an ack only. */
export type VaultResponse = { ref: string } | { deleted: true };

export type VaultErrorCode =
  | 'bad-request' // malformed body, unknown op, or an over-cap key (400)
  | 'not-found' // no such reference in this session (404)
  | 'cap-reached' // this session already holds the maximum vaulted credentials (409)
  | 'rate-limited' // dual-keyed vault-operation limiter tripped (429)
  | 'paused' // per-endpoint kill-switch flipped (503)
  | 'unavailable'; // the vault is not configured on this deploy (503)

export interface VaultError {
  error: VaultErrorCode;
}

// ── R2 save/share (build/09-edge/04-persistence-endpoints.md, §12.3 D5) ─────
// The Worker endpoints behind save/share: `save` (dataset buffer in, share
// token out), `get` (token → object), `delete` (token + ownership proof →
// gone). Client half: build/08-persistence/02-r2-save-share.md.
//
// Save/get carry the object as a raw request/response body, not JSON — a
// dataset buffer can run to the 100MB per-object cap, and base64-in-JSON would
// inflate that by a third for no reason. Control fields (sessionId, token, the
// ownership proof) travel as query params instead, the same shape cors-relay
// uses for its own bodyless GET. Delete stays a POST + `op` query param
// (rather than the DELETE method) so it needs no change to the Worker's fixed
// CORS allow-list — every endpoint on this deploy is GET/POST only.
//
// The retention TTL (30 days, launch default) is enforced by the
// Terraform-owned R2 lifecycle rule (§23.3), not by this endpoint — the
// disclosed number and the infrastructure rule are the same number by
// construction, not by an app-code check re-deriving it.

/** `save`'s success body. `deleteToken` is the ownership proof — returned once, never stored raw. */
export interface PersistenceSaveResponse {
  token: string;
  deleteToken: string;
  ttlSeconds: number;
}

/** `delete`'s success body. */
export interface PersistenceDeleteResponse {
  deleted: true;
}

export type PersistenceErrorCode =
  | 'bad-request' // missing sessionId/token, or a save with no declared Content-Length (400)
  | 'not-found' // no such token, or a delete's ownership proof didn't match (404)
  | 'too-large' // exceeds the 100MB per-object cap (413)
  | 'rate-limited' // dual-keyed daily save-count limiter tripped (429)
  | 'quota-exceeded' // the 300MB/session/day aggregate byte cap tripped (429)
  | 'paused' // per-endpoint kill-switch flipped (503)
  | 'unavailable'; // R2 is not bound on this deploy (503)

export interface PersistenceError {
  error: PersistenceErrorCode;
}
