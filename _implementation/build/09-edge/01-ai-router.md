# 09.1 AI Router

**Tier:** v0.5 · serves Phase 4 · **Master spec:** §11.2 (D2/D3/D9), §6

## Objective

The Worker endpoint that routes cloud-mode inference: Workers AI by default, BYOK
pass-through or vault-referenced keys, honoring the user's routing toggle.

## Spec

- **Default provider: Cloudflare Workers AI** — the zero-config experience, bounded by
  Workers AI's rate/neuron ceiling.
- **Shared-pool guardrails (§11.2, §23.5):** the Workers-AI free allocation is a **single
  account-wide daily budget shared by every visitor**, not a per-user grant, so the router
  enforces — via the shared dual-keyed limiter (§23.1 per-IP floor included) — a **per-session
  daily Workers-AI quota** (launch default: **20 Workers-AI-served turns/session/day**,
  tunable), **10 requests/min/session**, and a **64 KB request-body cap** (a schema-pruned
  prompt + ≤3 sample rows fit comfortably). **Both the per-minute limiter and the daily quota
  are backed by a Durable Object counter** (one instance per limiter key), not plain KV — live
  audits found KV's cross-colo eventual consistency under-counting each under burst (the 60s
  window first; then the daily quota's "wide window tolerates the slop" assumption failed its
  own burst test, ADR-006/§23.5). On quota- or pool-exhaustion the router returns a
  **typed error code** the client renders as the shared-budget-exhausted state
  ([../06-ai/02-modes-byok.md](../06-ai/02-modes-byok.md)) — never a silent failure. The chosen
  NL→SQL model is recorded in ADR-007 **with its neurons-per-turn cost**, since that sets the
  effective size of the pool.
- **Routing toggle (D3):** request carries the user's preference — *prefer-my-key* (all
  inference via the user's provider) or *free-tier-first* (Workers AI until ceiling, then
  overflow to the key). Ceiling detection (rate/neuron errors from Workers AI) triggers the
  overflow; surface which provider served each response so the client can show it.
  - **Ollama overflow is client-side, not the router's job.** When API mode's field is a local
    Ollama URL and the user has explicitly chosen "Use free tier first" (an Ollama-shaped field
    otherwise defaults to prefer-endpoint and never reaches this handler), the client sends **no
    `byok`** and treats this handler's existing keyless `quota-exhausted` / `pool-exhausted` /
    `paused` response as the signal to retry the turn against `localhost` itself. The edge has no
    route to a user's localhost (D9), so **do not** add Ollama awareness or an Ollama overflow
    target here — the keyless typed error is the whole contract.
- **BYOK handling (D9):**
  - *Pass-through mode (default):* the raw key arrives per-request, is attached to the
    provider call, and is **never persisted, logged, or echoed** — stateless.
  - *Vault mode:* the request carries a reference token; the router resolves it via
    [03-vault.md](03-vault.md) server-side.
- Provider abstraction: OpenAI/Anthropic/etc. behind one interface (ADR-007); streaming
  responses proxied through to the client (§15 latency mitigation). ADR-007 also records the
  **D43 local-model spike verdict** (in-browser WebLLM/WebGPU memory-coexistence, SQL-gen
  quality, download UX) that gates any local-model capability claim.
- Timeouts + upstream errors mapped to clean client-visible error codes (§21.6: AI provider
  timeout). An upstream provider failure — e.g. the user's own provider rejecting their BYOK
  key — returns a typed `upstream-error` (502), never an unhandled throw the platform serves
  as an opaque error page (the live custody audit observed exactly that gap on a canary-key
  401 before this mapping existed).
- **LLM metrics (numeric-only, D41).** The router emits content-free per-turn numbers to the
  §23.5 Analytics Engine dataset — **tokens/turn, retry count, repair-rate, latency bucket**
  (doubles + outcome blob) — and **never prompt text, generated SQL, or error text** (that
  content stays in the client-side §11.1 transcript). Cloud/edge path only; local-only mode is
  uncounted. No OTel-style content-bearing tracing on this path (a §5.2 violation).
- **DSPS-serving MCP endpoint (D38, stage A).** A read-only MCP surface (`get_dsps`,
  `list_shared`) served alongside this router over explicitly shared artifacts only
  ([`../08-persistence/03-dsps-spec.md`](../08-persistence/03-dsps-spec.md)); it inherits the
  dual-keyed limiter, kill switch, and counters. Stage-B tools + server-side execution run
  only over explicitly staged datasets and stay behind the D39 design round (v1+).

## Files

`edge/ai-router.ts` (the router handler + the `InferenceProvider` / `ByokResolver`
seams), `edge/mcp.ts` (the D38 stage-A DSPS surface + `SharedArtifactStore` seam),
`edge/protocol.ts` (the ai-router + MCP wire contract, mirroring `src/types/ai.ts`),
`edge/shared/*` (limiter/killSwitch/counters/http, promoted from synthesis-hardcoded
to multi-endpoint), and the client adapter `src/services/cloudProvider.ts`
(`createCloudProvider`, wired into `resolveProvider('cloud', config)`).

Deploy + backing (added with the DO limiter): `edge/worker.ts` (the deployed entrypoint —
CORS, routing, binding→seam wiring), `edge/adapters.ts` (`createDurableObjectRateStore`
backing both the per-minute limiter and the daily quota, the Analytics Engine sink, the
Workers AI provider), `edge/byok.ts` (D9 pass-through resolver), `edge/rateLimiterDo.ts`
(the `RateLimiterDo` class), `edge/rateWindow.ts` (the pure fixed-window step, unit-tested),
`edge/bindings.ts` + `edge/cloudflare.d.ts` (local binding + runtime types, no
`@cloudflare/workers-types`), and `wrangler.toml` (AI + **`RATE_LIMITER` Durable Object
binding & `new_sqlite_classes` migration**, root + `[env.staging]`; no KV) with
`scripts/deploy-edge-staging.sh`.

**Chosen cloud model (ADR-007, 2026-07-22):** default `@cf/mistralai/mistral-small-3.1-24b-instruct`
— reliably emits structured `tool_calls` on Workers AI (the code-specialized Qwen coder does **not**
— it free-texts the call, breaking the tool-use loop; the D40 cloud-edge eval scored 0/58 on it, then
**98.3% exec / 82.8% correctness / 100% repair** once swapped to Mistral, clearing §11.4). Measured
~63 neurons/turn → ~160 free turns/day account-wide at the 10,000-neuron/day free allocation — a
shared, exhaustible demo-scale budget, which is why the shared-budget-exhausted state and BYOK/local
overflow are load-bearing. One adapter detail: Mistral requires a 9-char alphanumeric tool-call id.

## Dependencies

[03-vault.md](03-vault.md) (reference resolution); wrangler config with Workers AI binding.

## Acceptance criteria

- [x] Workers AI round-trip works with zero user config (live browser E2E against staging, 2026-07-22)
- [x] Prefer-my-key: 100% of requests hit the user's provider (unit-asserted; live custody audit drove the prefer-key path)
- [x] Free-tier-first: simulated ceiling → overflow to BYOK, response labeled with provider
- [x] Per-session Workers-AI quota (20 turns/session/day) and 10 req/min/session enforce;
      exceeding either returns a typed quota-exhausted error, not a silent stop — both
      live-verified against the DO-backed counters, 2026-07-22 (per-minute: 10×200 then
      429 at 11 in one window; quota: staging at quota=2 served exactly 2 then 429
      quota-exhausted)
- [x] Request body over the 64 KB cap is rejected with a typed error (live 400, 2026-07-22)
- [x] Simulated shared-pool exhaustion → typed pool-exhausted error the client can render
- [x] Pass-through keys absent from logs, counter stores, and response bodies (audited live, 2026-07-22)
- [x] Streaming responses reach the client incrementally — live SSE against staging,
      2026-07-22: real per-token `delta` events for a text turn; a tool call arrives
      whole in `done` with no argument fragments leaked
- [x] Upstream timeout → typed error, no hang (live 504 in 1.4 s at a 50 ms staging timeout, 2026-07-22)
- [x] LLM metrics recorded are numeric-only (tokens/retries/repair/latency); no prompt, SQL, or error text reaches the counters (audited, D41)

## Test plan

Wrangler-dev integration tests with mocked providers (ceiling simulation, timeout
injection). Ceiling/quota simulation: drive the per-session daily quota and the per-minute
limit to their caps and simulate account-wide pool exhaustion, asserting the typed
quota/pool-exhausted error codes; oversized-body (>64 KB) rejection. Log/storage audit test
for key leakage. E2E from the Phase-4 chat UI. The per-minute limiter's fixed-window counting
is unit-tested as a pure function (`rateWindow.ts`) and its per-key DO routing against a fake
namespace; the `RateLimiterDo` class runs only in the Cloudflare runtime, so its strong
consistency is verified by a **live burst re-test** against the deployed staging Worker (the
same session id spaced within one window must reflect the true request count and fire a genuine
429) — the check that the KV under-count is actually fixed. The daily quota (same DO class,
86,400s window) is live-verified the cheap way: staging temporarily redeployed with a tiny
quota (e.g. 2) so a handful of real calls exercises both the served and quota-exhausted paths,
then restored.

## Definition of done

ADR-007 recorded; Phase-4 E2E green against staging; key-custody audit documented.
