# 08.1 Client-Side Parquet Export

**Tier:** v0.5 · Phase 5 · **Master spec:** §12.2

## Objective

Download any table (ingested or derived) as Parquet, entirely client-side, with a
zero-infrastructure handoff to Jupyter.

## Spec

- `COPY <table> TO 'out.parquet' (FORMAT PARQUET)` runs in DuckDB-Wasm; the VFS hands back
  the buffer for a browser download. **No Worker involvement.**
- Offer CSV as a secondary format (same COPY mechanism); Parquet is the headline.
- **Copy-to-Jupyter snippet (§12.2):** next to every download, a copy button emits a
  ready-to-paste notebook cell that loads the exported file
  (`duckdb.read_parquet(...)` / `pd.read_parquet(...)`), **with the SQL that produced the
  table included as a comment** — the handoff to the tool data people already trust.
- Export available wherever a table is (registry sidebar, results grid header for derived
  results); Export module card enables when any table exists (§13).

## Files

`src/features/export/` (download UI, snippet generator), `src/services/export.ts`
(COPY → buffer → download).

## Dependencies

DuckDB service ([../02-ingestion/02-duckdb.md](../02-ingestion/02-duckdb.md)); generating-SQL
records from the transformation layer
([../04-sql/05-transformation-layer.md](../04-sql/05-transformation-layer.md)) for the
snippet comment.

## Acceptance criteria

- [ ] Any registered table downloads as valid Parquet (round-trips through `pd.read_parquet`)
- [ ] Derived tables export with their generating SQL in the Jupyter snippet comment
- [ ] Zero network requests during export (client-side guarantee — Network tab)
- [ ] Large-table export doesn't freeze the UI (buffer handling off the main thread)

## Test plan

Integration: export each bundled sample, validate the Parquet (re-ingest it; cross-check in
Python in CI if cheap). Snippet snapshot tests. Network-tab assertion during export.

## Definition of done

Round-trip (export → re-ingest) verified for all samples; snippet paste-tested in a real
notebook once, manually.
