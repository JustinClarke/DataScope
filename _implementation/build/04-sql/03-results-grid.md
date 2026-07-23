# 04.3 Results Grid

**Tier:** v0 · Phase 2 · **Master spec:** §10 Module 2, §15/§19 Phase 6 (virtualization)

## Objective

The tabular result surface under the editor: sortable columns, pagination, virtualization
for large results — used by the playground and reused wherever query results render.

## Spec

- Sortable columns, pagination (§19 Phase 2); **virtualized rows** for 10K+ results
  (§19 Phase 6 performance item — build virtualization-ready now, tune later).
- Results are windowed from the worker — never hold a full 1M-row result in JS state
  (see the state tree, [../01-foundation/02-state-management.md](../01-foundation/02-state-management.md)).
  **Chosen mechanism:** `services/sql.ts` wraps every `SELECT`/`WITH` statement in a
  `count(*)` subquery (the true total) plus a `LIMIT 100,000` subquery (the materialized
  page) run concurrently against the engine — `QueryResult.rowCount` always reports the
  true total, `rows.length` is capped at 100,000 regardless of the source table's real
  size. DDL/DML runs unwrapped, exactly as before this cap existed. The grid then
  virtualizes and paginates (1,000 rows/page) over that already-capped in-memory window —
  it never re-queries the engine per scroll/page, since the window itself is already
  memory-safe.
- Cell rendering handles NULLs distinctly (not empty string), long strings truncated with
  expand, dates formatted consistently.
- Row-count + timing summary line (feeds the status console).
- Errors from execution render here user-friendly, with the DuckDB message accessible.
- **Take-it-with-me export (D53, §12.2):** the grid exports to **CSV** (always) and **Excel**
  (`.xlsx` via a **lazy-loaded** writer — never in the entry bundle, §15), and a **copy-SQL**
  action emits the query behind the current result. The analyst's real destination is Excel/a
  deck, not Parquet; this is the business-analyst export (Parquet stays the engineer/agent
  one). Client-side only — zero server surface. Chart → PNG/SVG export lives with the chart
  modules (§19 Phase 3).

## Files

`src/features/sql/ResultsGrid.tsx` (+ shared grid primitives in `src/components/` — the
chart modules' drill-throughs and the AI transcript reuse them).

## Dependencies

[01-monaco-editor.md](01-monaco-editor.md) / `services/sql.ts` result shape (`QueryResult`).

## Acceptance criteria

- [x] 100K-row result scrolls smoothly (virtualized), sortable, paginated
- [x] NULL vs empty-string visually distinct
- [x] `SELECT * FROM dataset LIMIT 100` renders as a plain data grid (translator's grid case)
- [x] Failed query → readable error in place of the grid, no crash
- [x] Grid exports to CSV and Excel (`.xlsx` writer lazy-loaded, absent from the entry bundle); copy-SQL emits the current query (D53)

## Test plan

Component tests: sorting, pagination, NULL rendering. Performance check with a synthetic
100K-row result (frame timing during scroll).

## Definition of done

Grid is the single tabular-results component in the app; perf check recorded.
