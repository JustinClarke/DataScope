# 09.2 CORS Relay (Tier 2, Worker side)

**Tier:** v0.5 · serves Phase 5 · **Master spec:** §7.4 Tier 2

## Objective

The dumb relay: fetch a target URL server-side (no CORS Worker→origin) and return the
response with permissive `Access-Control-Allow-Origin` — plus the rate limiting that keeps
it from becoming a free proxy.

## Spec

- **Pure pass-through, tightly disciplined:** no secrets touch the Worker; **GET-only**;
  **no client-supplied headers are forwarded** to the target; target URL in, response out;
  nothing stored, nothing rewritten beyond CORS headers.
- **Abuse control is a requirement, not polish (§7.4, §17, §23.1):** "paste any API URL,
  we'll proxy it" turns the Worker into a free CORS-bypass proxy for anyone. **Dual-keyed
  rate limits required before public ship** — a per-session limit for fairness plus a coarser
  per-IP floor so fresh-session farming still hits a wall (§23.1). Build the limiter as the
  shared module the other three endpoints reuse (§23.5,
  [04-persistence-endpoints.md](04-persistence-endpoints.md)).
- **Streamed, never buffered:** the response is streamed to the client with a byte-count
  cutoff (never accumulated Worker-side — rules out the 128 MB Worker-memory ceiling).
  Response cap aligns with the §7.3 ingestion tiers (no point relaying what the client will
  refuse). Keep v0.5 simple: size/rate limits + private-IP/localhost target rejection (SSRF
  hygiene), no allowlists.
- **Launch defaults (all tunable; ADR-006 adjusts from evidence):**

  | Control | Launch default |
  | :--- | :--- |
  | Relay rate | 20 req/min, 200 req/hour per session (pagination-friendly burst); per-IP floor 3× |
  | Response cap | 100 MB, streamed with a byte-count cutoff |
  | Timeout / redirects | 30 s; max 5 redirects |

  The client's own 20-relay-call pagination cap (§7.4) is enforced by
  [../07-connectivity/02-api-tier2-relay.md](../07-connectivity/02-api-tier2-relay.md), not
  by this Worker — see below.

- **No pagination logic in the relay** (decided 2026-07-23, ADR-006): the relay is a strict
  single-fetch pass-through — one target URL in, one response out, nothing rewritten beyond
  CORS headers. Pagination is entirely client-driven — the client calls the relay once per
  page, bounded by a client-side 20-call cap owned by
  [../07-connectivity/02-api-tier2-relay.md](../07-connectivity/02-api-tier2-relay.md), not
  enforced here.
- 429 responses carry retry-after so the client can render it.

## Files

`edge/cors-relay.ts`, `edge/` shared rate-limiter module.

## Dependencies

None within edge (first consumer of the limiter).

## Acceptance criteria

- [x] CORS-blocked origin fetches successfully through the relay — `cors-relay.test.ts`
      (injected-mock target) plus a live local `wrangler dev` fetch of `https://example.com`
      through `/cors-relay`, returning the real page body
- [x] Dual-keyed rate limit (per-session + per-IP floor) enforces and returns 429 +
      retry-after; a forged/self-minted session token falls to the per-IP floor (§23.1) —
      both the per-minute and per-hour windows independently tested, each with its own
      retry-after value
- [x] Non-GET methods rejected; client-supplied headers never forwarded to the target —
      unit-tested (405 on POST, no `headers` key ever reaches the injected fetch) and
      live-verified against `wrangler dev`
- [x] Private-IP/localhost targets rejected (SSRF) — 8 cases unit-tested (RFC1918, link-local
      incl. `169.254.169.254`, loopback, `localhost`, IPv6 `::1`, a non-http(s) scheme), plus a
      live `wrangler dev` probe of `http://10.0.0.1`; redirects re-enter the same check per hop
- [x] Response streamed with a byte-count cutoff at the 100 MB cap; oversized targets
      rejected cleanly — a declared `content-length` over the cap is rejected before any byte
      streams; a chunked/undeclared-length response is cut off mid-stream once the cap is
      crossed (the client sees a truncated/errored body, the cleanest signal achievable
      without buffering Worker-side to inspect it first)
- [x] Nothing persisted: no KV/R2 writes on any relay path — true by construction; `CorsRelayEnv`
      carries no KV/R2 binding, only the shared DO rate store and the optional Analytics sink

## Test plan

`cors-relay.test.ts` (26 cases, Vitest, `fetchTarget` injected so no real network call is
made): pass-through + status forwarding, header non-forwarding, method rejection, malformed
input, the 8 SSRF cases above, redirect-following (allowed/blocked/too-many), the two
response-cap paths, both rate-limit windows plus the forged-session-token/per-IP-floor case,
the kill switch, and a content-free-counters check. Supplemented by a live local
`wrangler dev` smoke pass (real Miniflare runtime, real DO binding, one real external fetch)
exercising the SSRF block, the pass-through, and the method rejection end-to-end — not a
substitute for the unit suite, a check that the seam wiring (`worker.ts`, `bindings.ts`,
`wrangler.toml`) actually holds together.

## Definition of done

Limiter reused as the existing shared module (`shared/limiter.ts`, already built for
`09-edge/01`); SSRF and rate-limit tests green (`tsc -b` / `oxlint` / full `vitest run` —
940 passed — all clean). **Closed (2026-07-23):** deployed to staging
(`datascope-edge-staging.justinclarke.workers.dev`) and live-audited the same shape as the
`ai-router` burst audit — a clean, window-boundary-safe burst confirmed the DO-backed
per-session/per-minute limiter enforces exactly at the declared 20/min ceiling (200 for
requests 1–20, genuine `429 {"error":"rate-limited"}` with `retry-after: 60` for 21+), and a
fresh session from the same IP stayed under the per-IP floor. SSRF block, non-GET rejection,
and pass-through all live-verified too. See BUILD-ORDER.md's 2026-07-23 log entry for the full
audit record, including a false-alarm methodology note (an early, badly-timed burst straddled
two rate-limit windows and looked like an under-count — resolved via `wrangler tail`, not a
code bug).
