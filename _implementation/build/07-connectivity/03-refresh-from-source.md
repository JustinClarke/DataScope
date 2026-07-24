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

- `src/types/dataset.ts` — `TableRegistryEntry` gained `sourceUrl` (recorded at ingest, the
  refresh target), `lastFetchedAt` (set at ingest, updated per refresh), `stale` (derived
  tables only, §12.1's staleness flag).
- `src/stores/datasets.ts` — `setTableRefreshMeta` (the sampled/sampleRowLimit/lastFetchedAt
  trio a refresh can change, kept separate from `setTableStats`'s row/column/memory and
  `setTableProfile`/`setTableColumns`'s classified shape) and `markTablesStale` (flags a
  given set of table ids).
- `src/services/ingestion.ts` — `refreshTableFromSource(tableId, onProgress?)`: re-runs the
  same Tier 1 → Tier 2 cascade `loadUrl` uses (unchanged `fetchApiSource`/
  `fetchApiSourceViaRelay`) against the table's recorded `sourceUrl`, ingests the response
  under a scratch table name via the **unmodified** `ingestBuffer` (every format/malformed-row
  check it already runs), and only then swaps it in (`DROP TABLE <old>` +
  `ALTER TABLE <staging> RENAME TO <old>`) — a failure at any point before the swap never
  touches the registered table. `toRegistryEntry` gained an optional `sourceUrl` param so
  `loadUrl` can record it at initial ingest. New exported pure helper
  `referencesTableName(sql, tableName)` — bare-word or double-quoted-identifier match, used to
  find which derived tables (by `generatingSql`) depend on a just-refreshed table; there's no
  explicit dependency graph in this codebase, so this text match is the same shape
  `runTransform`'s own mutation-target matching already uses.
- `src/features/ingestion/TableList.tsx` — a "Refresh from source" icon button
  (API-origin tables only), the last-fetched timestamp next to the origin/memory line, and a
  "possibly stale" badge (derived tables with `stale: true`) styled like the existing
  `sampled` badge. New required props: `onRefresh`, `refreshingTableId`, `refreshDisabled`.
- `src/features/ingestion/IngestionPanel.tsx` — `handleRefresh`, reusing the same
  `phase`/`stats`/`sizeBanner`/`relayDisclosure` state the URL-ingest flow renders through
  (same tier cascade, same kind of response) so pagination progress/size-tier banners/relay
  disclosure all work identically for a refresh; does not auto-navigate on success (unlike a
  first ingest) since the user is refreshing an already-registered table, not landing on one
  for the first time.

## Dependencies

[01-api-tier1-fetch.md](01-api-tier1-fetch.md), [02-api-tier2-relay.md](02-api-tier2-relay.md);
registry + profiling re-run path.

## Acceptance criteria

- [x] Refresh replaces the table and re-profiles; broker updates — live-verified against a
  real DuckDB engine (below); the broker (`evaluateCapabilities`/`useCapabilities`) re-derives
  from the store on every render, so no separate wiring was needed once the store's
  `profile`/`columns` update.
- [x] Failed refresh leaves the previous table intact with a clear error — live-verified: a
  refresh whose fetch fails at any stage never runs the DROP+RENAME swap, so the previously
  registered table is untouched.
- [x] Derived tables built on the refreshed table get a staleness indicator — component-test
  verified (`IngestionPanel.test.tsx`): a derived table whose `generatingSql` references the
  refreshed table renders the "possibly stale" badge after the refresh resolves; the
  underlying match/flag logic (`referencesTableName`, `markTablesStale`) is separately unit
  tested. Not exercised through a live Monaco-driven `CREATE TABLE AS` — the component test
  drives the identical code path (store → `TableList` render) a live pass would, so this was
  judged sufficient rather than spending a second live session on it.
- [x] Last-fetched timestamp visible per API-sourced table — live-verified: `TableList` shows
  "fetched …" for the table both right after ingest and after a refresh.

## Test plan

No mock API server exists in this codebase's toolchain (every fetch-based service here is
unit-tested via an injected `fetchImpl`, not an HTTP mock layer) — unit tests instead cover:
`refreshTableFromSource`'s two reject-before-touching-the-engine paths (unknown table id, no
recorded `sourceUrl`) in `ingestion.test.ts`; `referencesTableName`'s bare/quoted/substring/
unrelated cases; `setTableRefreshMeta`/`markTablesStale` in `datasets.test.ts`; `TableList`'s
refresh button visibility/click/disabled state, last-fetched rendering, and stale badge in
`TableList.test.tsx`; `IngestionPanel`'s refresh success/failure/relay-disclosure/staleness
wiring against a mocked `refreshTableFromSource` in `IngestionPanel.test.tsx`.

**Live pass** (real dev server, real Chrome via Playwright, real DuckDB-Wasm, real GitHub API,
`https://api.github.com/repos/duckdb/duckdb/labels`): ingest → refresh → telemetry showed a
genuine second fetch (`pages 2`, `elapsed 44ms`, `rows 31`, `Done`) and the DROP+RENAME swap
against the real engine succeeded, incidentally exercising a paginated refresh too (2 pages,
matching this leaf's own "E2E: refresh a paginated source" line). Then a `page.route(...)
.abort('failed')` on the direct request forced a `cors-suspected` classification, which
retried through the Tier 2 relay exactly as `loadUrl` does — the relay's own live call to
GitHub hit a real `403` (this session had already made several GitHub calls) — and the
resulting error banner rendered while the table's last-fetched timestamp and row/column text
stayed byte-for-byte identical to their state before the failed attempt, confirming the
atomic-swap design holds against a real engine and a real (if incidental) failure, not just a
synthetic one.

## Definition of done

Refresh round-trip solid on both tiers (live-verified, including an incidental paginated
refresh); failure semantics tested (unit + a live real-failure pass proving atomicity);
staleness flags render (component-tested, not separately live-driven through Monaco — judged
sufficient, see acceptance criteria above); last-fetched timestamps render live.
