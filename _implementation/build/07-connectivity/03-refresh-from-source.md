# 07.3 Refresh from Source

**Tier:** v0.5 · Phase 5 · **Master spec:** §7.4

## Objective

A manual re-run that replaces an API-sourced table on demand — most of the "live-ish" feel
without touching wire protocols or persistent connections (and the standing answer to
live-DB requests until D6's revisit trigger fires).

## Spec

- Every API-sourced registry entry gets a **"Refresh from source"** action: re-runs the
  original pull (same tier cascade, same pagination) and **replaces the table**.
- Replacement is atomic from the UI's perspective: old table stays queryable until the new
  ingest succeeds; on failure the old table remains with an error toast.
- Post-refresh: re-profile → re-classify → broker re-evaluation (standard derived-table
  path); dependent derived tables are *not* auto-rebuilt — flag them as possibly stale
  (their recorded SQL makes manual re-run cheap, §12.1).
- Refresh metadata on the registry entry: last-fetched timestamp shown in the sidebar.

## Files

`src/features/ingestion/` (refresh action + staleness flags), registry store (source spec:
URL, tier used, pagination params, last-fetched).

## Dependencies

[01-api-tier1-fetch.md](01-api-tier1-fetch.md), [02-api-tier2-relay.md](02-api-tier2-relay.md);
registry + profiling re-run path.

## Acceptance criteria

- [ ] Refresh replaces the table and re-profiles; broker updates
- [ ] Failed refresh leaves the previous table intact with a clear error
- [ ] Derived tables built on the refreshed table get a staleness indicator
- [ ] Last-fetched timestamp visible per API-sourced table

## Test plan

Integration with the mock API: change served data → refresh → assert new contents + intact
failure path (kill the mock mid-refresh). E2E: refresh a paginated source.

## Definition of done

Refresh round-trip solid on both tiers; failure semantics tested; staleness flags render.
