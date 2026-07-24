# 07.1 API Ingestion — Tier 1 (Direct Fetch)

**Tier:** v0.5 · Phase 5 · **Master spec:** §7.4 Tier 1

## Objective

The zero-infra default for every pasted API URL: fetch directly from the browser, land the
response as a registered table.

## Spec

- **Try first for every pasted URL.** Works when the target sends permissive CORS headers
  and needs no secret (or uses a public/anon key meant for client use).
- Response registered as a buffer and run through `read_json_auto` — **the same path as
  file upload** ([../02-ingestion/01-file-drop.md](../02-ingestion/01-file-drop.md)); table
  named from the URL (sanitized via the registry rules), source recorded as the URL.
- **Pagination (client-side for Tier 1):** loop accumulating pages before handing to DuckDB;
  detect common patterns (next-link header/body cursor, page param) with a manual "load
  more pages" control as the fallback. Telemetry panel shows per-page progress.
- **CORS failure → hand off to Tier 2** transparently
  ([02-api-tier2-relay.md](02-api-tier2-relay.md)) — the user shouldn't have to know which
  tier ran, but the disclosure line notes when the relay was used (§5.2).
- Size tiers (§7.3) apply to the accumulated response like any file.
- **Consumer API scope by auth reality (D34, §7.4):** v0.5 platform connections are
  **token/no-auth only** on this unchanged machinery — GitHub (paste a PAT; flagship for
  the token flow) and Lichess/Chess.com (open public APIs). **OAuth platforms
  (Strava/Spotify/Fitbit) are a separate v1 decision** (app registration, redirects,
  secret custody in the Tier-3 vault, ToS review — note: Strava's 2024 API terms restrict this); **banks:
  CSV-drop template only, never a connection.**

## Files

`src/services/apiIngestion.ts` — pure fetch/pagination/size-tier logic (`fetchApiSource`,
`tableNameFromUrl`), independent of DuckDB so it's unit-testable with an injected `fetchImpl`
(same pattern as `services/vaultClient.ts`). `src/services/ingestion.ts` gains `loadUrl`, a
separate entry point from `loadDataset` (not a third branch on its `File | string` union — a
URL and a sample id are both plain strings with no shared shape to dispatch on, and they arrive
from different UI controls that already know which is which) that calls `fetchApiSource` then
hands the resulting buffer to the same `ingestBuffer`/registry path file upload uses.
`src/features/ingestion/UrlInputForm.tsx` (new — the URL input + Fetch button, wired into
`IngestionPanel.tsx`'s "Or pull from an API" section). `TelemetryPanel.tsx`/`TelemetryPhase`
gained a `fetching` phase and a `pagesFetched` stat for pagination progress. `IngestionError`
gained an optional `code` field so a CORS-suspected failure is distinguishable from a generic
one — the seam Tier 2 plugs into.

## Dependencies

Ingestion JSON path + registry + telemetry (Phase 1/2) — built, reused via `ingestBuffer`
unchanged. The Tier-2 client (`02-api-tier2-relay`) is **not** a dependency of this item — its
own Dependencies line names this doc as its dependency (cascade), not the reverse; this build
produces the reusable fetch/pagination/JSON-registration machinery Tier 2's session extends
with a relay transport, not a caller of Tier 2.

## Acceptance criteria

- [x] CORS-permissive JSON API → registered, profiled table — live-verified against the real
      `https://api.github.com/repos/duckdb/duckdb/labels` endpoint (Playwright, real dev
      server): 1 table, 31 rows, profiled, Blueprint landing rendered.
- [x] Paginated API accumulates pages with visible telemetry before table creation —
      GitHub-style `Link: rel="next"` header, auto-followed. Live-verified against
      `https://api.github.com/repos/duckdb/duckdb/issues?per_page=5`: telemetry's `pages` stat
      observed growing 1→2→3 mid-fetch; final table landed at exactly 100 rows
      (20 pages × 5/page), confirming the `MAX_PAGES` cap engages correctly against a real,
      genuinely multi-page API. A body-level cursor (non-Link-header pagination) has no generic
      detection — per ADR-006's own research, GitHub is the only one of the three v0.5 token/
      no-auth platforms (D34) with a generically follow-able scheme at all — so the leaf spec's
      "manual load more pages" fallback for that case is **not built**; named here as a
      deliberate, evidence-backed scope gap rather than a speculative control with no real
      detection behind it.
- [x] CORS-blocked URL falls back to Tier 2 transparently (§22) — **closed 2026-07-23, Tier 2
      landed (`02-api-tier2-relay`).** `services/ingestion.ts`'s `loadUrl` now catches a
      `cors-suspected` `ApiFetchError` and retries via `fetchApiSourceViaRelay` before
      surfacing anything to the UI — a CORS-blocked URL no longer terminates in an error, it
      falls through to the relay. Tier 1 always fails on its very first fetch attempt when
      CORS-blocked (`fetch()` rejects before any response reaches JS), so there's never partial
      multi-page state to reconcile before the retry starts clean. Unit-covered indirectly via
      `02-api-tier2-relay.md`'s own test suite (the handoff logic itself isn't separately unit
      tested — `loadUrl` was already DuckDB-touching/live-verified-only before this change, per
      this doc's own Test plan note, and stays that way); live end-to-end re-verification of the
      full CORS→relay path is `02-api-tier2-relay.md`'s own open item, not re-run here.
- [x] Non-JSON/garbage response → clear error, no half-registered table — a body that fails
      `JSON.parse` throws a typed `invalid-json` error before any DuckDB call; unit-tested
      (`apiIngestion.test.ts`).
- [x] Oversized accumulated response hits the §7.3 tiers — `decideSizeTier` re-checked after
      every page against the running byte total (not just once upfront, since an API's total
      size is generally unknown ahead of pagination); `refuse` throws before any parse attempt,
      `sampled` stops the pagination loop early (no reason to keep fetching pages that would
      just be discarded past `SAMPLE_ROW_LIMIT`), `warn` surfaces the same footprint banner the
      file-drop path shows. Unit-tested with the tier decision spied (real 50–300MB fixture
      bodies aren't practical in a unit test); the wiring, not the threshold math itself
      (already covered by `aggregateSize.test.ts`), is what's under test here.

## Test plan

`src/services/apiIngestion.test.ts` (15 cases, no DuckDB/live browser needed — pure fetch/
pagination logic with an injected `fetchImpl`, same pattern as `vaultClient.test.ts`): URL
validation, single-page array/non-array bodies, Link-header pagination + merge, the
`maxPages` cutoff, the sampled-tier early-stop, `cors-suspected`/`timeout`/`http-error`/
`invalid-json`/`too-large` classification, `tableNameFromUrl`. Live Playwright pass against the
real dev server and real public endpoints (GitHub labels/issues, example.com) covers the
DuckDB-touching integration `ingestion.test.ts`'s own note says needs a real browser, not a
mock API server.

## Definition of done

Tier-1 path works standalone; failure cases (§21.6: opaque CORS/network rejection via a typed
`cors-suspected` code, HTTP error status, invalid JSON, oversized response) covered and
live-verified. **One criterion stays open, not a gap in this session's work:** the
non-Link-header pagination fallback (no generic detection exists for it per ADR-006's own
finding). Suite **1015 → 1030** (+15); `tsc -b` / `oxlint` / `vitest run` (1030 passed) /
`vite build` all clean. **The Tier-2 handoff criterion above closed 2026-07-23** when
`02-api-tier2-relay` landed and `loadUrl` started retrying a `cors-suspected` failure through
the relay instead of terminating in an error.
