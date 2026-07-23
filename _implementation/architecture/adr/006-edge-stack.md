# ADR-006: Edge stack

**Status:** Partially decided. The **rate-limiter backend** and the **Tier-2 relay pagination model** are resolved below. The Worker **routing layout** and **R2 bindings** remain pending until the cors-relay / save-share / vault builds settle them; keep those sections open.

**Referenced by:** `foundations/infrastructure.md`, `build/09-edge/README.md`, `build/09-edge/02-cors-relay.md`, `build/09-edge/03-vault.md`, `build/07-connectivity/02-api-tier2-relay.md`

## Context
Resolves the edge stack: Worker routing layout, rate limiting, and R2 bindings. Recorded inputs it must satisfy: the §23.1 anonymous-session-identity requirements (server-minted, integrity-protected, per-IP-rate-limited tokens; dual-keyed limits with a per-IP floor) and the limiter-backend constraint (**no plain KV** — the native Workers Rate Limiting binding as launch default, a Durable Object counter only where per-session quota semantics exceed the binding, §23.5). Deferred to when v0.5 edge/infra work starts, so launch defaults are tuned from real evidence.

## Decision

### Rate-limiter backend (decided 2026-07-22, from live evidence)

The router runs two independent counters over the shared limiter seam (`RateStore.increment(key, windowSeconds) → runningCount`), split by backend along their consistency needs:

- **Per-minute dual-keyed limiter → a Durable Object counter** (`RateLimiterDo`, one instance per limiter key via `getByName`). A DO runs single-threaded per key, so increments serialize and the returned count is strongly consistent within the window. SQLite-backed (`new_sqlite_classes`) so it is free-plan eligible; the counter persists per increment (an eviction mid-window must not lose the count) and a cleanup alarm wipes an idle key's storage one window after its last request.
- **Per-session daily Workers-AI quota → plain KV** (`createKvRateStore`, unchanged). Its window is 86,400s and its write volume is bounded by the quota itself (~20/session/day), so KV's ≤60s global-propagation slop is negligible and its free-tier write cost is not a concern. *Overturned by the correction below — the quota now shares the DO.*

### Correction (2026-07-22, same day): the daily quota moves to the DO too

The "wide window dwarfs KV's slop" rationale was tested live and failed under burst: driving 21 real requests over ~95s against the staging Worker left the KV quota counter at a stored count of **8**, not 21 — the same cross-colo staleness mechanism as the per-minute finding, just exposed by burst pacing instead of window width. The assumption held only for *organic* daily pacing, and bursts are exactly how an abuser would spend the shared free pool, so an under-count here is a real hole in the pool's protection (the quota is what keeps one session from draining the account-wide neuron budget, §11.2/D3). Human decision (2026-07-22): give the quota the same DO treatment rather than accept the slop. Both stores now share the one `RateLimiterDo` namespace — keys are already namespaced apart (`ai-router:session:`/`ai-router:ip:` vs `ai-router:quota:`), each key routes to its own instance, and `windowSeconds` is per-call, so the daily window rides the same class unchanged. `createKvRateStore` and the `RATE_KV` binding are removed (nothing else used them); the edge Worker no longer uses KV at all.

The native **Workers Rate Limiting binding was not used**. The dual-keyed limiter needs a *running per-key count* under a session-ceiling-plus-IP-floor contract (the router compares the count to two limits and records the exact number); the binding exposes a simple allow/deny per key, not the count, and does not express the per-session semantics the router already depends on. This is exactly the "per-session quota semantics exceed the binding" carve-out the §23.5 constraint reserves for a DO.

### KV's remaining role — the vault's value store (recorded 2026-07-23, at the vault build)

The correction above removed KV from the edge entirely *as a counter backend*, and its
concluding line ("the edge Worker no longer uses KV at all") was true when written. The vault
build re-introduces KV — **as a value store, which is the opposite case** and is not a
reversal of the counter decision:

- The counters failed on KV because a *stale read is a wrong number*, and the limiter's whole
  job is to be right about that number under burst. A vaulted credential is written once and
  read back; KV's ≤60s cross-colo propagation shows up as a brief "reference not found yet" on
  a just-stored key — a clean typed miss the client can retry, not a silent under-count.
- KV's native `expirationTtl` *is* the idle-TTL primitive the D9 lifecycle needs (§11.2), with
  refresh-on-resolve expressed as a re-put. A DO would have to reimplement expiry by hand.
- The one place the vault's consistency slop is visible is the 3-credential cap, which counts
  by prefix listing. That is accepted deliberately: the cap is hygiene, and the strongly
  consistent DO-backed operation limiter (10/session/hour) is the real anti-stuffing control.
  **The staging audit put a number on the slop:** a burst seated 5 credentials under the cap of
  3, and 3s spacing was not enough either — the cap only bit after a ~120s settle. Prefix
  listing lags materially longer than the ≤60s value propagation above, so the cap is an
  *eventual* bound; during a burst the limiter's 10/session/hour is the ceiling. Right decision,
  bigger window than "momentarily one over" implied.

So the edge now uses **both** backends, split by what each is good at: DO for counts that must
be right under burst, KV for values with a TTL. `RATE_KV` stays deleted; `VAULT_KV` is a new
namespace, and the at-rest encryption secret (`VAULT_SECRET`) is a `wrangler secret`, never a
var in `wrangler.toml`.

### Pagination — Tier 2 relay (decided 2026-07-23, from use-case analysis)

**Client loops; the relay stays a strict single-fetch pass-through.** The client follows the target API's own next-page cursor and calls the relay once per page — the same shape as an unpaginated Tier-2 fetch, repeated. The relay never inspects a response body to find the next page and never accumulates multiple pages into one reply.

Checked against the three v0.5 platforms (§7.4, D34 — GitHub, Lichess, Chess.com):
- **GitHub** is the only one with generic follow-able pagination (`Link: rel="next"`, RFC 5988) — the sole case Worker-side following would help.
- **Lichess** game export is already one long streamed response; nothing to page.
- **Chess.com** archives are fixed monthly URLs the client already knows; there is no cursor to follow.

So Worker-side page-following would only ever accelerate one of three named platforms, against real costs:
- **Contract fit.** `build/09-edge/02-cors-relay.md`'s spec is explicit: "target URL in, response out; nothing stored, nothing rewritten beyond CORS headers." Merging N page bodies into one reply (even NDJSON-framed) is rewriting; a strict single-fetch relay satisfies the contract as written.
- **Security.** Client-looped calls re-enter the relay's SSRF/private-IP check on every page (a malicious `next` link pointed at an internal address is caught the same way page 1 would be). A Worker-side follower would have to reimplement that same check internally, against a target-supplied URL it discovered rather than one the caller gave it directly.
- **Cost/blast radius.** One relay invocation holding open across up to 20 sequential upstream fetches is worse for the §23.5 cost ceiling and much harder to interrupt mid-sequence than 20 short, independently rate-limited/killable invocations.
- **The launch defaults already assume this.** §7.4's relay-rate table sizes the limit as "20 req/min, 200 req/hour per session (**pagination-friendly burst**)" — that headroom only matters if a multi-page ingest is made of multiple relay calls in the first place.

**Consequence for the build:** the 20-page ceiling (§7.4) is a **client-side loop cap**, owned by `build/07-connectivity/02-api-tier2-relay.md` (unbuilt) — not a page-counting mechanism inside `edge/cors-relay.ts`. The relay's own per-invocation limits are a single fetch's response size (100MB, streamed byte-count cutoff) and redirects (≤5); it has no concept of "page" at all.

**Alternative considered — relay follows pages** (RFC 5988 `Link` header, ≤20 hops, NDJSON-framed accumulated response). Would save N−1 client↔Worker round trips (edge-local, ~10–50ms each) against wall-clock dominated by the sequential upstream fetches either way — a marginal win. Rejected: contradicts the explicit no-rewriting contract, only benefits GitHub of the three named platforms, needs a new bespoke wire format the client must learn, and worsens partial-failure semantics (a page-6-of-10 failure mid-Worker-loop is harder to recover from than a client that simply knows it has pages 1–5 and retries page 6 itself).

## Alternatives considered
- **Plain KV for the per-minute limiter (the shipped-then-audited state).** Rejected by live measurement, not theory: a key-custody audit against the staging Worker drove the KV counter and found it under-counting a 60s window badly under ordinary spacing — **13 requests ~1s apart read back as a stored count of 5; 8 requests ~3–4s apart read back as 2** — because KV is visible immediately only in its own colo and within ~60s globally, and the limiter's window is *also* 60s, so requests landing on different colos read stale (undercounted) values for the whole window. §23.1/§23.5 predicted this ("a KV counter doesn't actually limit under burst"); the audit confirmed it. An *under*-count on the abuse-prevention mechanism is a hole, not slop.
- **Native Workers Rate Limiting binding.** Fits a simple per-key limit but not the dual-keyed running-count contract or the per-session daily quota; adopting it would mean reworking the router's limiter logic and tests for weaker semantics. Held as a future option if the per-minute path is ever simplified to allow/deny.
- **Durable Object for the daily quota too.** Initially rejected as unnecessary ("the daily window dwarfs KV's slop") — then adopted the same day when a live burst test measured the KV quota counter storing 8 for 21 real requests (see the Correction above). The original rejection reasoned from window width; the failure mode was burst pacing, which window width does not protect against.
- **Keep KV for the quota, accepting the slop as a soft ceiling.** Considered at the correction point: the quota is a courtesy ceiling, not an abuse-hard limit, so some slop is arguably tolerable. Rejected because the quota is also the shared pool's only per-session spend guard, burst is the adversarial shape, and the DO backing already existed — reusing it costs one line of wiring, not new machinery.

## Consequences
- Both counters are now correct under burst (each audit's stated reason to fix). `RateLimiterDo` + its binding/migration land in `wrangler.toml` (root + `[env.staging]`, non-inheritable keys repeated).
- The limiter seam keeps two stores (`rateStore`, `quotaStore`) — the semantic split stands (the quota counts only Workers-AI-served turns) even though both are DO-backed in production; the handler and its tests distinguish them. The pure window logic (`rateWindow.ts`) is tested directly; the DO class runs only in the Cloudflare runtime and is reached through untested `worker.ts`, like the other binding adapters.
- Free-plan posture holds: SQLite-backed DOs are free-plan eligible; the edge Worker no longer uses KV at all (the staging `RATE_KV` namespace is unbound and can be deleted from the account).
- Idle keys self-clean via the cleanup alarm, so DO storage tracks only active sessions/IPs/quota keys.

## Alternatives considered (routing layout, R2 bindings)
Not yet enumerated — pending the save-share build. **Interim facts (not the decision):** the
v0.25 synthesis endpoint shipped as a second path on the one deployed Worker (2026-07-22), the
Tier-2 relay as a third (2026-07-23), and the BYOK vault as a fourth (2026-07-23) — `/ai-router`,
`/synthesis`, `/cors-relay`, `/vault`, path dispatch in `worker.ts`, all sharing the DO limiter,
kill-switch pattern, and Analytics sink. Four of the five planned paths now fit one Worker with
no strain; the routing-layout decision stays open until the save-share build (the only one
needing R2 bindings) settles it.

## Spike evidence
The rate-limiter decision above is backed by **live** evidence (a staging-Worker audit), not a pre-build spike; the numbers are in the Alternatives section and the BUILD-ORDER log (2026-07-22). See `../decisions.md`'s "Spike findings log" for the index.
