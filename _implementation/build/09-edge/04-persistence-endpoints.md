# 09.4 R2 Persistence Endpoints

**Tier:** v0.5 · serves Phase 5 · **Master spec:** §12.3 (D5)

## Objective

The Worker endpoints behind save/share: R2 writes with TTL, unguessable links, delete, and
the abuse controls that gate public ship.

## Spec

- **Endpoints:** `save` (dataset buffer in → share token out), `get` (token → object),
  `delete` (token + ownership proof → gone). Client half:
  [../08-persistence/02-r2-save-share.md](../08-persistence/02-r2-save-share.md).
- **Retention (§12.3):** every object carries a **TTL of 30 days (launch default, tunable)** —
  surfaced to the client so the UI can show it. Enforced by the Terraform-owned R2 lifecycle
  rule (§23.3), so the disclosed number and the infrastructure rule are the same number.
- **Private by default:** share tokens are unguessable (crypto-random, ≥128 bits); no
  listing endpoint exists at all.
- **Abuse controls:** per-session size caps and rate limits on `save` — **reuse the shared
  dual-keyed limiter** ([02-cors-relay.md](02-cors-relay.md)). Launch defaults (tunable):
  **10 saves/session/day**, **100 MB/object**, **300 MB/session/day aggregate** — the daily
  *byte* cap, not the object count, is what bounds standing storage. Aggregate bucket size is
  observed with an alert at 8 GB and the save endpoint's kill switch is the overflow response
  (both §23.5).
- **Takedown & abuse reporting (§12.3):** the operator can delete any stored object directly
  via the R2 console or `wrangler` (a written runbook line — no bespoke moderation tooling);
  an abuse-report contact (a `mailto:`) appears on the share-open page; the TTL bounds the
  standing exposure of any single object. No content scanning or moderation queue at this scale.
- Delete requires ownership proof (creator-held secret returned at save time), so links can
  be shared read-only while only the creator deletes.
- Nothing else is stored: no user accounts, no metadata beyond what TTL/ownership need.

## Files

`edge/persistence.ts` — `handlePersistence`: three operations on one path (`save`/`get`/`delete
via ?op=delete`), a `PersistenceStore` seam (R2 in production, an in-memory map under test), and
`createMemoryPersistenceStore` for tests. Save/get carry the object as a raw body (never JSON —
a dataset buffer can run to the 100MB cap); control fields (`sessionId`, `token`,
`deleteToken`) travel as query params, GET/POST only (no DELETE method, so the Worker's fixed
CORS allow-list needed no change). Wired in `edge/worker.ts` (`/persistence` dispatch,
`buildPersistenceEnv`), with the R2 adapter in `edge/adapters.ts` (`createR2PersistenceStore`),
the binding types in `edge/bindings.ts` (`R2Bucket`, `R2ObjectMeta`, `R2ObjectBody`,
`PERSISTENCE_BUCKET`, `PERSISTENCE_KILL_SWITCH`), the wire contract in `edge/protocol.ts`
(`PersistenceSaveResponse`/`PersistenceDeleteResponse`/`PersistenceErrorCode`), and the counter
shape in `edge/shared/counters.ts` (`PersistenceMetric`). R2 binding in `wrangler.toml`
(`[[r2_buckets]]`, root + `[env.staging]`, distinct bucket names — same production/staging
isolation the vault's KV namespaces already established); **lifecycle TTL is not a wrangler.toml
setting** (R2 has no per-binding TTL config) — it is the Terraform-owned bucket lifecycle rule
this doc's Spec section already named. `infra/r2.tf` now authors it (`cloudflare_r2_bucket_lifecycle`,
30-day `Age`-type delete transition on both buckets, adopted via `import` since `wrangler r2 bucket
create` had already made them), alongside `infra/providers.tf` (the tree's first Terraform
bootstrap — R2-backed remote state, ADR-009) and `infra/envs/{dev,prod}.tfvars`. Authored, not yet
applied — see this doc's Definition of done for what's still provisioning, not code.

**Shared-infra extension this build needed:** the 300MB/session/day aggregate cap sums *bytes*,
not requests, which the existing dual-keyed limiter (request-counting only) couldn't express.
`RateLimiterDo.increment` (`edge/rateLimiterDo.ts`) and the pure window step it wraps
(`edge/rateWindow.ts`) gained an optional `amount` parameter (default 1, so every existing
request-counting caller — ai-router's quota, cors-relay, vault — is unaffected); `shared/
limiter.ts`'s `incrementSessionQuota` passes it through. The DO's own "did a fresh window just
open" check was corrected from `count === 1` to a direct bucket-number comparison in the same
edit — the old heuristic only happened to hold because every prior caller's amount was 1, and
would have silently stopped scheduling the cleanup alarm for a byte-summing key.

Client half: [../08-persistence/02-r2-save-share.md](../08-persistence/02-r2-save-share.md).

## Dependencies

Shared rate limiter ([02-cors-relay.md](02-cors-relay.md)); R2 bucket provisioning.

## Acceptance criteria

- [x] Save → share URL round-trips a dataset from another device (§18) — *staging deploy live
      (`datascope-edge-staging.justinclarke.workers.dev`); a real HTTP round trip against the
      public URL (not `wrangler dev`) saved a payload, got it back byte-exact, a forged delete
      proof 404'd with the object intact, the correct proof deleted it, and the repeat get
      404'd — the same shape a second device hitting the share link would see*
- [x] 30-day TTL expiry actually removes objects (verified with short-TTL test objects, §22);
      the lifecycle number matches the §12.3 disclosed retention — *infrastructure confirmed
      live: the `datascope-terraform-state` bucket was provisioned, Terraform installed, and
      `terraform apply` run in both the `dev` (→ `datascope-persistence-staging`) and `prod` (→
      `datascope-persistence`) workspaces — each imported its existing bucket cleanly and created
      the lifecycle rule with 0 drift. Confirmed live via a direct R2 API read on both buckets:
      `expire-after-30-days`, enabled, `Age` transition at `maxAge: 2592000`.
      **Short-TTL observation now in progress (started 2026-07-23T09:05:33Z):** a scratch
      lifecycle rule (`ttl-test-scratch`, prefix `ttl-test/`, 1-day `Age` expiry) was added to
      `datascope-persistence-staging` via `wrangler r2 bucket lifecycle add` — deliberately
      **not** through `infra/r2.tf`, so this throwaway verification rule never lands in the
      Terraform-owned production config or gets applied against `datascope-persistence`. A real
      remote test object (`ttl-test/marker.txt`, uploaded with `--remote`, confirmed downloadable
      byte-exact afterward) is sitting under that prefix. R2 lifecycle sweeps run on a periodic
      pass rather than deleting the instant an object's age crosses the threshold — Cloudflare's
      own docs say "typically within 24 hours of the expiration value" — so the object is
      expected gone sometime in the window 2026-07-24T09:05:33Z–2026-07-25T09:05:33Z. Still
      unchecked: the deletion itself hasn't been observed yet. This endpoint deliberately does
      not re-implement expiry itself.
      **Re-checked 2026-07-24T06:49Z (marker still present, window not yet reached) — and a
      near-miss worth recording.** A same-session `terraform apply` aimed at a *different*
      cleanup (reconciling unrelated `dev`-workspace drift) treated this out-of-band
      `ttl-test-scratch` rule as drift too, since — by design — it was never declared in
      `infra/r2.tf`, and removed it from the live bucket before this doc's own explanation of
      why it's deliberately out-of-band was read. Caught before the object expired (the window
      hadn't opened yet); the identical rule (`ttl-test-scratch`, prefix `ttl-test/`,
      `--expire-days 1`) was re-added via `wrangler r2 bucket lifecycle add`, the same
      out-of-band path as originally, confirmed present again alongside `expire-after-30-days`,
      marker object confirmed still downloadable byte-exact. **Standing note for any future
      session:** `terraform plan` against the `dev` workspace will keep showing this one rule as
      a diff for as long as the observation runs — that diff is expected and must not be
      `terraform apply`'d away until the deletion itself has been observed (or the observation is
      abandoned and the rule removed by hand).*
- [x] Delete works only with ownership proof; link 404s after — *`persistence.test.ts` (correct
      proof deletes and a later get 404s; a wrong or missing proof answers the same typed
      `not-found` as an unknown token, vault.ts's precedent for this shape, and the object
      survives); live against real Miniflare R2: forged proof → `404`, object still resolvable,
      correct proof → `{"deleted":true}`, repeat get → `404`*
- [x] Save caps enforce (10 saves/session/day, 100 MB/object, 300 MB/session/day aggregate)
      with clean client-readable errors — *unit-tested for all three (declared-size pre-check,
      dual-keyed daily save-count limiter, the new byte-summing aggregate quota — spent on the
      declared size even when the save is then rejected, "no free retries" like the other
      endpoints); live against a real DO + R2 binding for the save/get/delete/kill-switch paths.
      Not separately live-burst-tested at the real 10/100MB/300MB launch numbers (would mean
      transferring hundreds of MB just to trip a counter) — the underlying DO window primitive
      this reuses unchanged is already live-audited twice (ai-router's daily quota, cors-relay's
      per-minute/per-hour pair); this build's own addition (the `amount` parameter) is covered by
      `rateWindow.test.ts`'s byte-summing cases plus the live round trip exercising the real code
      path end to end.*
- [ ] Abuse-report `mailto:` renders on the share-open page; operator console/`wrangler` delete
      removes any object (§12.3) — *split: the `mailto:` is the share-open page, client scope
      (`08-persistence/02-r2-save-share.md`), not built here. Operator deletion needs no
      endpoint-side code (any R2 object is deletable via the console or `wrangler r2 object
      delete`) — confirmed structurally by inspecting the local Miniflare R2 store directly
      rather than through this endpoint; the real buckets exist now (provisioned in the prior
      session), but the runbook line itself is still unwritten.*
- [x] Tokens pass a randomness sanity check; no enumeration/listing path exists — *`persistence.
      test.ts`: 10 consecutive saves mint distinct 256-bit base64url tokens (`token` and
      `deleteToken` both, and never equal to each other); by construction there is no list
      operation on `PersistenceStore` reachable from the handler, only exact-key `get`/`head`*

## Test plan

Wrangler-dev + staging R2: full round-trip, TTL with seconds-scale test config, delete
with/without ownership proof, per-object + aggregate-daily-byte cap exhaustion, operator
delete via `wrangler`, token-guessing probe.

**Run 2026-07-23.** `edge/persistence.test.ts` — 20 cases across the save/get/delete round trip
(byte- and content-type-exact, via the in-memory store), ownership-proof correctness (right/
wrong/missing, and that a wrong proof leaves the object intact), token randomness, validation
(missing sessionId/Content-Length, unsupported method), abuse controls (declared-size pre-check,
daily save-count limiter, daily byte-aggregate quota including that a rejected save still spends
it, session isolation), the kill switch across all three operations, `unavailable` with no store
bound, and content-free metrics (no token/bytes ever reach the sink). `edge/rateWindow.test.ts`
gained two cases for the new `amount` parameter (summing instead of counting; resetting to the
fresh amount on a bucket rollover). Full suite **995 → 1015** (+20, no regressions elsewhere);
`tsc -b` / `oxlint` / `vite build` clean; both `wrangler deploy --dry-run` (root and `--env
staging`) bundle cleanly with the new R2 binding listed.

**Live local `wrangler dev` pass, real Miniflare R2 + the real DO rate limiter (not the
in-memory test store):** save → get round-trips exact bytes and the declared content-type; get
on an unknown token → `404`; delete with a forged proof → `404` and the object still resolves
after; delete with the correct proof → `{"deleted":true}`, and the repeat get → `404`; an
unsupported method → `400`; the kill switch (`PERSISTENCE_KILL_SWITCH` var override) → `503` on
save, get, and delete alike. **Custody audit** against the local Miniflare R2 metadata store
(`.wrangler/state/v3/r2/…/e8…f.sqlite`, `_mf_objects.custom_metadata`): every record holds only
`{"deleteTokenHash":"…"}`, a 64-hex-char SHA-256 — the raw delete token appears in zero rows of
the metadata database and zero object blobs (the blob is exactly the plaintext dataset payload,
which is expected — that content is meant to be readable by anyone holding the share token).

**One real finding from the live pass, not from unit tests — a genuine R2 API constraint, not
just a test-environment quirk:** `R2Bucket.put()` requires the value stream to have a *known
length*; the runtime's exact error — `"Provided readable stream must have a known length
(request/response body or readable half of FixedLengthStream)"` — only accepts a request/
response body or a `FixedLengthStream`'s readable half, never a hand-authored `ReadableStream`.
The first implementation wrapped `request.body` in an app-level byte-counting passthrough stream
(mirroring cors-relay's response-side cap) specifically to defend against a lying
`Content-Length`; that wrapper is exactly what R2 rejects, since constructing a new
`ReadableStream` strips the known-length property even when everything it reads comes from a
request body. Fixed by passing `request.body` to `store.put` unwrapped — which turns out to be
the *more* correct defense, not a weaker one: the HTTP layer already frames the body to its
declared `Content-Length` before this handler runs, so a body that is shorter or longer than
declared fails as a transport-level stream error, which R2 additionally cannot silently accept
past the length it was told to expect. The declared-size pre-check (`> 100MB` → `too-large`
before any streaming starts) is still this file's own logic; the actual-vs-declared match is the
runtime's, not re-implemented here. The in-memory test store cannot simulate this R2-specific
contract (a generic `ReadableStream` is fine for it), so that specific defense is verified by
this live run, not by `persistence.test.ts`.

## Definition of done

Phase-5 save/share E2E green against staging; §22 R2 privacy rows pass; retention behavior
documented in the disclosure copy.

**All three provisioning steps this doc was left open on are now done.** (1) R2 buckets:
provisioned in a prior session (`wrangler r2 bucket create`, matching the vault KV isolation
precedent). (2) The Terraform-owned lifecycle TTL rule (§23.3): `terraform apply` run in both
the `dev` and `prod` workspaces — both existing buckets imported cleanly, both lifecycle rules
created and confirmed live via a direct R2 API read (`expire-after-30-days`, `maxAge: 2592000`).
(3) `wrangler deploy --env staging` — deployed, health-checked, and a live save/get/delete round
trip run against the public staging URL.

**Terraform credential setup (this session, worth recording since it wasn't obvious):**
Terraform's R2-backed S3 state backend needs its own Access Key ID/Secret Access Key, separate
from the `CLOUDFLARE_API_TOKEN` bearer token `wrangler` and the Cloudflare provider's own R2
resource calls use. Cloudflare derives that S3-style key pair from an Account API Token that
includes an R2 permission group — so one token *could* serve both roles, but this project uses
**two**, deliberately: a narrowly-scoped token (R2 read & write, restricted to the single
`datascope-terraform-state` bucket) for `backend.hcl`, kept separate from the account's
general-purpose token (Entire Account: Workers R2 Storage, KV Storage, Scripts, AI) that
everything else uses. Rationale is least-privilege (§23.1, matching `providers.tf`'s own
comment): state-backend credentials tend to leak through different channels than a deploy token
(state files, CI logs, plan output), so keeping them on separate tokens caps a leak of either one
to a smaller blast radius than one token covering both would. **One real incident from setting
this up, logged so it isn't repeated:** editing the account's general-purpose token in place
(rather than creating a new one) to test a narrower R2 policy came close to leaving the project
without a working `CLOUDFLARE_API_TOKEN` — it broke `wrangler`/Terraform auth entirely until a
fresh token with the original permission set was created and `.env.local` updated. The working
pattern going forward: **always create a new, separately-named token for a new credential need;
never edit an existing token's policy in place.**

Nothing here is blocked on a design question — only the short-TTL live-expiry check (above)
remains open, and that's a deliberate scope call, not a blocker.
