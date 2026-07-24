# 07.2 API Ingestion — Tier 2 (CORS Relay, client side)

**Tier:** v0.5 · Phase 5 · **Master spec:** §7.4 Tier 2

## Objective

When Tier 1 fails on CORS (the most common blocker, ahead of auth), route the fetch through
the Cloudflare Worker relay and land the response through the same ingestion path.

## Spec

- **Worker as dumb relay:** the Worker fetches server-side (no CORS applies Worker→origin)
  and returns the response with permissive `Access-Control-Allow-Origin`. **No secrets touch
  the Worker — pure pass-through, nothing stored.** Worker implementation:
  [../09-edge/02-cors-relay.md](../09-edge/02-cors-relay.md); this doc is the client half.
- Client sends the target URL to the relay endpoint; response flows into the same
  buffer → `read_json_auto` → registry path as Tier 1.
- **Pagination is client-side** (§7.4; decided 2026-07-23, ADR-006): the relay is a strict
  single-fetch pass-through, so this client owns the loop — follow the target API's own
  next-page cursor, call the relay once per page, feed each page into the same
  buffer → `read_json_auto` → registry path. Capped at **20 relay calls per ingestion
  action** (§7.4 launch default); telemetry shows page progress as each call completes.
- **Disclosure (§5.2):** the target URL and response pass through the Worker — surface this
  in the ingestion UI when the relay engages (a one-line note, not a modal).
- **Rate limits & paused state:** the relay is dual-keyed rate-limited Worker-side before
  public ship (§7.4, §23.1); the client must render the **429** case with a friendly
  retry-later message, and the **typed 503** case (relay kill switch flipped, §23.5) as a
  "relay paused — try a direct fetch or upload" state — never a hang or retry storm (§4
  edge-independent core, §22).

## Files

`src/services/relayClient.ts` (new — the relay transport, `fetchViaRelay`; mirrors
`vaultClient.ts`'s injected-`fetchImpl` DI shape) rather than under `src/features/ingestion/`
as originally sketched here: every other edge-calling client in this codebase
(`vaultClient.ts`, `synthesis.ts`, `cloudProvider.ts`) lives in `src/services/`, and this one
follows that established convention instead. `src/services/apiIngestion.ts` gains
`fetchApiSourceViaRelay`, sharing its `accumulatePages` pagination/size-tier loop with Tier 1's
`fetchApiSource` (both now call into it, parameterized by transport). `src/services/ingestion.ts`'s
`loadUrl` gains the Tier 1 → Tier 2 handoff and a `usedRelay` result flag.
`src/features/ingestion/IngestionPanel.tsx` renders the disclosure note off that flag; 429/503
render through the existing generic error banner, satisfying the doc's "429 handling" note
without a dedicated component. **A live pass (2026-07-23) found the disclosure note was
unmountable-before-paint** — `runIngestUrl` set it and then immediately called
`navigateToPostIngestLanding()` in the same tick, and React batches both into one commit, so
the panel (and the note inside it) unmounted before ever painting; no real user could see it.
Fixed by skipping the auto-navigate specifically when `usedRelay` is true — the panel stays put,
the note renders, and the user moves on to Blueprint/Profile manually (the already-visible
`TableList` shows the new table in the meantime). Every other ingest path's auto-navigate is
unchanged.

## Dependencies

[01-api-tier1-fetch.md](01-api-tier1-fetch.md) (cascade),
[../09-edge/02-cors-relay.md](../09-edge/02-cors-relay.md) (the endpoint itself).

## Acceptance criteria

- [x] CORS-blocked API ingests successfully via the relay; table identical to a Tier-1 ingest
      — **live-verified** (2026-07-23, real Chrome via Playwright, real dev server, the real
      deployed staging relay): a single-page JSON target registers as a correctly typed table
      (1 row × 9 cols, matching the source JSON's top-level keys) exactly like a direct Tier-1
      ingest would. Still not true for a genuinely multi-page target — Link-header pagination
      doesn't survive the relay (named below, unchanged from before).
- [x] Disclosure note visible whenever the relay was used — **live-verified**, and a real bug
      the live pass caught is now fixed (see Definition of done): `IngestionPanel.tsx`'s
      `relayDisclosure` banner is driven by `loadUrl`'s `usedRelay` result and now stays on
      screen because the panel no longer auto-navigates away when the relay was used.
- [x] Relay 429 → friendly rate-limit message, no retry storm — `relayClient.ts` classifies a
      429 as `RelayFetchError('rate-limited', …, retryAfterSeconds)`; no retry logic anywhere
      on this path, so no storm by construction. Unit + component tested.
- [x] Relay typed 503 (kill switch) → "relay paused/unavailable" state; ingest/profile/SQL
      stay fully usable, no hang (§4, §23.5) — classified the same way as 429, rendered
      through the same generic error banner every other ingest failure uses; nothing else in
      the app is touched by this path, so the "stay fully usable" half holds by construction.
- [x] No credentials or headers beyond the target URL are ever sent to the relay —
      `fetchViaRelay` sends only `url`/`sessionId` query params on a bare GET, no `headers` or
      `credentials` option ever set; unit-asserted and live-confirmed against the real
      deployed relay's own response shape.
- [x] Pagination loop stops at 20 relay calls per ingestion action, surfacing a clear
      message rather than looping forever — `MAX_PAGES` (shared with Tier 1) reused as the
      default cap in `fetchApiSourceViaRelay`; unit-tested with a mocked multi-page chain.

## Test plan

Integration against a local Worker (wrangler dev): CORS-blocked mock API through the relay;
seeded 429. Assert request bodies to the relay contain URL only.

**What actually ran (2026-07-23, first pass):** no `wrangler dev`/Playwright in this session
(neither is installed in this repo, and no browser-automation tool was available) — instead,
the transport and pagination logic (`relayClient.test.ts`, 5 cases; the `fetchApiSourceViaRelay`
block added to `apiIngestion.test.ts`, 5 cases; 2 new `IngestionPanel.test.tsx` cases for the
disclosure note and the rate-limit error banner) is unit/component-tested against an injected
`fetchImpl`, same DI pattern as `vaultClient.test.ts`/`apiIngestion.test.ts`. Supplemented with
live `curl` probes of the real deployed staging relay
(`datascope-edge-staging.justinclarke.workers.dev/cors-relay`, already closed and audited by
`09-edge/02-cors-relay`): confirmed the real pass-through response carries only `content-type`
(no `Link` or other target headers — see the finding below) and that the real SSRF block still
returns 400 on a cloud-metadata target. Did not chase a live 429 trip against the shared
staging limiter — 09-edge/02's own definition of done already closed and burst-audited that
exact behavior; redoing it here would be duplicative and risks interfering with that endpoint's
shared rate-limit state for no new information.

**What actually ran (2026-07-23, live browser pass, later session):** a real headless Chrome
(Playwright driving the machine's installed Google Chrome via `channel: 'chrome'` — the sandboxed
`ms-playwright` Chromium download is network-gated in this environment and stayed unavailable,
but the system-Chrome route works and needed no install) drove the real Vite dev server against
the real deployed staging relay end to end. **A genuinely organic CORS-blocked target could not
be produced from this sandbox**: a direct `curl` to a real no-CORS JSON API
(`api.open-meteo.com/v1/forecast`) confirmed no `access-control-allow-origin` header from the
plain shell network path, but the same request observed from the Playwright-driven Chrome came
back with `access-control-allow-origin: *` — this sandbox's browser egress path appears to inject
a permissive CORS header that a direct `curl` does not see, making an organically-blocked target
unreachable-as-blocked from this specific browser. Worked around it the same way the platform
itself makes Tier 1 treat any opaque fetch failure: routed the direct request through
`page.route(...).abort('failed')`, producing the identical opaque `TypeError` a real CORS block
would (fetch() gives the app no way to distinguish the two either, which is why both take the
`cors-suspected` path) — everything downstream of that point (the relay call, the real deployed
staging Worker, the ingest pipeline) is real and unmocked. Result: direct fetch aborted → relay
called → real `200` from `datascope-edge-staging.justinclarke.workers.dev/cors-relay` with the
exact live JSON body → registered as a `forecast` table, 1 row × 9 cols, matching the source
JSON's top-level keys → disclosure note rendered on screen (screenshotted) → **the panel did not
auto-navigate away**, confirming the fix below. Not re-run this pass: the 429/503 cases (already
unit-tested and, per the prior pass, redundant with `09-edge/02-cors-relay`'s own live burst
audit) and a genuinely multi-page relay target (blocked on the same named Link-header gap as
before, unchanged by this session).

## Definition of done

Client transport, pagination loop, and error classification built and unit/component-tested;
`tsc -b` / `oxlint` / full `vitest run` (1043 passed) / `vite build` all clean. The Tier
1 → Tier 2 handoff is now real: a `cors-suspected` failure in `loadUrl`
(`src/services/ingestion.ts`) retries transparently through the relay before surfacing an
error, closing `01-api-tier1-fetch.md`'s own previously-open criterion of the same name.
**Both remaining acceptance criteria are now closed** — live-verified against the real deployed
staging relay in a later session (below), including a real bug the live pass caught and this
session fixed.

**A real constraint found while building this, not by a test:** `edge/handlers/cors-relay.ts`
forwards only the target's `content-type` header on a successful pass-through — every other
response header, including `Link`, is dropped (confirmed both by reading the handler and by a
live `curl` probe of the deployed staging relay). GitHub's `Link: rel="next"` header is the one
generically-follow-able pagination scheme among the v0.5 token/no-auth platforms (D34, per
ADR-006's own research — see `01-api-tier1-fetch.md`) — so `fetchApiSourceViaRelay`'s reuse of
the same Link-header detection `fetchApiSource` uses will never see a next-page cursor through
this transport as currently built, and Tier 2 today always resolves to exactly one page
regardless of the target's own pagination. The loop/cap machinery (`accumulatePages` in
`src/services/apiIngestion.ts`, shared by both tiers) is still built and tested against a
Link-header-carrying mock response, so no rework is needed if the relay ever forwards more
headers — this is a named, evidence-backed transport gap (same treatment Tier 1 gives its own
non-Link-header pagination gap), not a hidden bug.

**A real, live-only bug found and fixed this session, not by a test:** `IngestionPanel.tsx`'s
`runIngestUrl` set the relay-disclosure flag and then, in the same synchronous continuation,
called `navigateToPostIngestLanding()` — React batches both into a single commit, so the panel
(and the disclosure note inside it) unmounted before the browser ever painted it. Every unit/
component test passed because the isolated component test never renders the full `App` shell,
so it never exercises the unmount; only driving the real app in a real browser surfaced it. No
real user could ever have seen the §5.2 disclosure note this build's acceptance criteria claimed
was "visible." Fixed by skipping the auto-navigate specifically when `usedRelay` is true — the
panel stays on Ingestion, the note renders and stays up, and the newly-registered table is
already visible in `TableList` for the user to review before moving on manually. Two new
`IngestionPanel.test.tsx` cases lock in both directions (relay path stays on `'ingestion'`;
non-relay path still auto-navigates to `'dossier'`/`'profile'` as before).
**Also found, evidence for the acceptance criteria above:** this sandbox's browser egress
appears to inject a permissive `access-control-allow-origin` header that a direct `curl` from
the same host does not see, so an organically CORS-blocked target can't be produced live from
this specific environment — worked around with a deterministic `page.route(...).abort()` that
reproduces the identical opaque fetch failure a real CORS block causes (see Test plan). Real
Chrome, real dev server, real deployed staging relay end to end otherwise.

**Next concrete action:** `07-connectivity/03-refresh-from-source` (Sonnet).
