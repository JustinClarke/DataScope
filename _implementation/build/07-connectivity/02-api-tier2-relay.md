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

`src/features/ingestion/` (relay client, disclosure note, 429 handling);
`src/services/ingestion.ts` gains the relay transport.

## Dependencies

[01-api-tier1-fetch.md](01-api-tier1-fetch.md) (cascade),
[../09-edge/02-cors-relay.md](../09-edge/02-cors-relay.md) (the endpoint itself).

## Acceptance criteria

- [ ] CORS-blocked API ingests successfully via the relay; table identical to a Tier-1 ingest
- [ ] Disclosure note visible whenever the relay was used
- [ ] Relay 429 → friendly rate-limit message, no retry storm
- [ ] Relay typed 503 (kill switch) → "relay paused/unavailable" state; ingest/profile/SQL
      stay fully usable, no hang (§4, §23.5)
- [ ] No credentials or headers beyond the target URL are ever sent to the relay
- [ ] Pagination loop stops at 20 relay calls per ingestion action, surfacing a clear
      message rather than looping forever

## Test plan

Integration against a local Worker (wrangler dev): CORS-blocked mock API through the relay;
seeded 429. Assert request bodies to the relay contain URL only.

## Definition of done

Tier cascade (1 → 2) verified end-to-end against the deployed Worker; §22 "API URL that
fails CORS → relay fallback engages transparently" passes.
