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

`src/features/ingestion/` (URL input UI, fetch + pagination loop, tier fallback logic).

## Dependencies

Ingestion JSON path + registry + telemetry (Phase 1/2); Tier-2 client for fallback.

## Acceptance criteria

- [ ] CORS-permissive JSON API → registered, profiled table
- [ ] Paginated API accumulates pages with visible telemetry before table creation
- [ ] CORS-blocked URL falls back to Tier 2 transparently (§22)
- [ ] Non-JSON/garbage response → clear error, no half-registered table
- [ ] Oversized accumulated response hits the §7.3 tiers

## Test plan

Integration with a local mock API (CORS on/off, paginated, malformed). E2E: public JSON API
→ table → query it.

## Definition of done

Tier-1 path works standalone and as the front half of the tier cascade; failure cases (§21.6:
provider timeout, malformed response) covered.
