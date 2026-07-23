# 03.1 Summary Statistics Extraction

**Tier:** v0 · Phase 1 · **Master spec:** §8 step 1

## Objective

Extract column-level metadata for every registered table using DuckDB's built-in
`SUMMARIZE` — the single statistical source for the classifier, profile UI, insight feed,
and (v1) quality report.

## Spec

```sql
SELECT
  column_name,
  column_type,
  min,
  max,
  approx_unique,
  avg,
  std,
  null_percentage
FROM (SUMMARIZE dataset);
```

**Deviation from the query above, corrected here rather than left stale:** `count` is
dropped from the actual `SELECT` list. Live-verified: SUMMARIZE's `count` is always the
table's total row count (same value repeated for every column, nulls and all — it is not
a per-column non-null count), which the registry already carries as `TableRegistryEntry.
rowCount`. Selecting it here would just be a second, redundant source of the same number.

- Runs automatically after every ingest **and** after every derived-table creation
  (re-profile on transform, §12.1). v0 build note: ingestion computes the profile inline,
  in the same `Promise.all` as the row-count/memory-size queries, so it lands on the
  `TableRegistryEntry` atomically at creation — no separate store write, and no window
  where a registered table has no profile yet. `services/ingestion.ts` also exports a
  standalone `profileTable(tableId)` for the re-profile-on-transform case; nothing calls it
  yet since `05-transformation-layer` (the only future producer of a table whose shape
  changes after creation) is unbuilt.
- Target: profile generation < 500 ms after ingestion, any supported size (§18). Live-
  verified against all five v0 samples (Playwright, real running dev server, throwaway
  script, same technique as prior items): total ingest+profile time was 25–103 ms warm
  (Titanic, stock_prices, product_reviews, weather, the 4-table ecommerce folder) and
  ~550 ms on the very first call of a session, which is DuckDB-Wasm engine cold-init
  (matches ADR-001's independently measured ~700 ms cold-init baseline), not profiling
  cost — profiling itself is a sub-100ms addition on top of ingest in every case measured.
- Results land in the schema store per table, typed as `ColumnProfile` (this item's own
  addition to `src/types/schema.ts` — the raw pre-classification shape; §21.4 only names
  `ClassifiedColumn`, the *post*-classification output `02-column-classifier.md` produces
  from this one by adding `semanticType`) — never recomputed ad hoc by other modules.
- **SUMMARIZE quirks, live-verified against real DuckDB-Wasm (Playwright, throwaway probe
  CSVs covering a numeric column with a null, a VARCHAR column, a DATE column, a 5000-char
  string value, an all-null column, and a genuinely 0-row table):**
  - `min`/`max`/`avg`/`std` are cast to **VARCHAR for every column**, not just non-numeric
    ones — a BIGINT column's `min` comes back as the string `"1"`, not the number `1`.
    `ColumnProfile.min`/`max` are kept as the string DuckDB gives (no reparse-to-number
    attempt: the type already permits `string | number | null`, and reparsing risks losing
    the exact representation for no benefit). `mean`/`stdDev` are parsed with `Number(...)`
    and fall back to `null` on anything that doesn't parse to a finite value — covers both
    the ordinary non-numeric case (`avg`/`std` already `null` for a VARCHAR column) and a
    DATE column's `avg`, which DuckDB returns as a formatted mean-*timestamp* string (e.g.
    `"2024-02-11 08:00:00"`) rather than a plain number — `Number()` on that is `NaN`,
    correctly collapsed to `null` rather than surfaced as `NaN`.
  - **Real bug found and fixed, upstream of this item's own scope:** `null_percentage` is
    `DECIMAL(9,2)` — DuckDB-Wasm surfaces it through Arrow as a `BN` (`Uint32Array`
    subclass), the same wide-int wrapper HUGEINT sums already used. `lib/arrow.ts`'s
    existing HUGEINT fix (`02-duckdb`'s handoff note) collapsed *any* such value via
    `bigNumToBigInt` with no scale — correct for a scale-less HUGEINT, but silently wrong
    for a scaled DECIMAL: `25.00%` is stored unscaled as `2500`, and `100.00%` as `10000`,
    both 100× too large if the scale isn't divided out. Fixed by giving `normalizeCell` the
    Arrow column type (from the field, not the value) and branching: a `Decimal`-typed `BN`
    now goes through `util.bigNumToNumber(value, type.scale)` (which does the scaled
    division), everything else keeps the original unscaled `bigNumToBigInt` path. Confirmed
    live before and after: the probe CSV's 25%-null `score` column read `2500` before the
    fix, `25` after.
  - **A real type gap, not a bug, found the same way:** a genuinely 0-row table's
    `null_percentage` is SQL `NULL` (DuckDB has no 0/0 percentage to report), not `0` —
    `ColumnProfile.nullPercentage` (and `ClassifiedColumn.nullPercentage`, since the latter
    extends the former) was `number`, unable to represent this; **widened to
    `number | null` master-first** (`DATASCOPE.md` §8, mirrored into this doc,
    `02-column-classifier.md`, and `src/types/schema.ts`) rather than fabricating a `0` for
    a case that isn't actually "no nulls."
  - A 5000-character VARCHAR value round-tripped through `SUMMARIZE` with no truncation or
    error — noted as a real at-scale consideration (a profile can carry large string
    payloads) but not a v0 blocker; no fix needed.
  - `count` — see the Spec deviation note above; it is dropped from the query entirely
    rather than special-cased.

## Rich-profile additions (v0.5 · D69)

**Additive to the v0 shape and acceptance criteria above — not a change to either.** A v0.5
maturation extends `ColumnProfile` with richer per-column statistics feeding the Dossier's tier-3
profiling cards (§13.1, D69): **distribution percentiles** (p25/p50/p75/p99), **top-N distinct
values + counts** (configurable N, default 5), **cardinality %** (`distinctCount / rowCount × 100`),
and **min/max ranges** for numeric and date columns. Computed on the same `SUMMARIZE`/DuckDB path,
stored on the same `ColumnProfile` as new optional fields, and consumed as the profiling layer of
the D69 fold. The v0 fields, spec, and acceptance criteria stay exactly as above — these are new
optional additions, never a re-profile of the shipped shape.

## Files

`src/services/ingestion.ts` (`summarizeTable()` internal helper wired into `ingestBuffer`'s
existing `Promise.all`; exported `profileTable(tableId)` for future re-profile-on-transform
use — replaces the old unimplemented `profileDataset(datasetId)` stub, which was the wrong
shape: profiling is per-table, not per-dataset), `src/lib/profile.ts` (new — pure
`parseSummarizeResult()`, unit-testable without a live engine), `src/lib/arrow.ts` (Decimal-
scale fix above), schema store wiring (`setTableProfile` in `src/stores/datasets.ts`);
consumed by `02-column-classifier.md`'s classifier, not yet written.

## Dependencies

[../02-ingestion/02-duckdb.md](../02-ingestion/02-duckdb.md) (query path),
[../02-ingestion/03-table-registry.md](../02-ingestion/03-table-registry.md) (what to profile).

## Acceptance criteria

- [ ] Every registered table has a profile within 500 ms of ingest
- [ ] 100%-null column → `null_percentage` displays correctly (§22)
- [ ] Derived tables re-profile automatically
- [ ] Profile stored once, referenced everywhere (no duplicate SUMMARIZE calls per render)

## Test plan

Worker integration tests over the bundled samples: assert known stats (Titanic row count,
weather date range). Fixtures: all-null column, single-column, empty (0-row) table.

## Definition of done

Classifier and profile UI consume only this store; benchmark recorded against all samples.
