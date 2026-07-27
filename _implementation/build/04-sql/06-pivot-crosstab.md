# 04.6 Pivot / Cross-tab

**Tier:** v0 · Phase 2 (surface) / Phase 3 (ship gate) · **Master spec:** §10 Module 7 (D53), §12.2 (export)

> **Amended by D73 (2026-07-26) — v0.70 / S5.** Pivot **keeps its tab and gains its own results
> home.** It shares `QueryResultsPanel` with the SQL page today, and that sharing is deliberate
> (D49 — one execution path, not two), so deleting the page cannot leave Pivot inheriting its
> leftovers. J6 — pivot without SQL — is a D53 commitment, not a nice-to-have, and must survive
> the deletion intact.

## Objective

The no-SQL on-ramp for the business analyst (§2): drag fields into **rows**, **columns**, and
**values** and get a cross-tab, compiled to a single DuckDB `GROUP BY` behind the scenes — an
answer without typing SQL, with the generating SQL still shown.

## Spec

- **Field wells:** rows / columns / values, plus an **aggregation picker** per value
  (sum / avg / count / min / max). Fields come from the registry's classified columns; the
  pivot compiles to one `GROUP BY` (rows × columns → grouping keys, values → aggregates) and
  runs through the same `QueryEngine` as the playground — **no new execution path** (D49).
- **Generated SQL shown alongside** (same educational-panel pattern as every module); the
  compiled query is copy-able (the §12.2 copy-SQL action) and one-click chartable via the
  SQL → Chart translator (`04-chart-translator.md`).
- **Legibility on wide results:** subtotals, sort, and a **top-N cap** on high-cardinality
  fields (with an "expand" affordance), so a cross-tab on a messy real dataset stays readable.
- **Multi-table for free:** because it is just `GROUP BY`, once related tables are registered
  the pivot inherits joins from the transformation layer (`05-transformation-layer.md`).
- The result is a first-class table — it renders in the shared results grid
  (`03-results-grid.md`) and exports with it (CSV/Excel, D53).
- **Internal cut line (D53/D27):** if the drag-and-drop builder threatens the date it degrades
  to a **guided GROUP-BY builder** — dropdowns for group-by / measure / aggregate reusing the
  `02-query-suggestions.md` engine — which is near-free; the full pivot UI then slips to v0.5.
  The pivot sits **above** the Join Graph in the D27 cut order (cuttable to protect the date;
  the graph stays last-cut).

## Files

`src/features/sql/` (pivot builder UI + field wells), pivot→SQL compiler in `src/lib/`
(pure: field-well state → DuckDB `GROUP BY`), reusing `services/sql.ts` (`runQuery`), the
results grid, and the chart translator. No new service contract.

## Dependencies

[03-results-grid.md](03-results-grid.md) (renders + exports the result),
[04-chart-translator.md](04-chart-translator.md) (chart-from-result),
[../03-profiling/03-capability-engine.md](../03-profiling/03-capability-engine.md)
(fields + types), [../02-ingestion/03-table-registry.md](../02-ingestion/03-table-registry.md)
(multi-table joins).

## Acceptance criteria

- [x] Dragging rows/columns/values with an aggregation produces a correct cross-tab against every bundled sample, matching an equivalent hand-written `GROUP BY`
- [x] The generated SQL is shown, copy-able, and chartable; the result exports to CSV/Excel (D53)
- [x] High-cardinality fields honor the top-N cap with expand; subtotals + sort work
- [x] The guided GROUP-BY fallback produces the same query from dropdowns (cut-line parity)
- [x] A business analyst can pivot the e-commerce folder and export to Excel without writing SQL (§19 Phase 3 deliverable)

## Test plan

Unit: pivot→SQL compiler across row/col/value/aggregate combinations (snapshot the SQL).
Integration: execute compiled queries against each bundled sample; assert results equal a
reference `GROUP BY`. E2E: build a cross-tab on the e-commerce folder, chart it, export to CSV.

## Definition of done

Pivot compiles to a single verified `GROUP BY` through the shared engine, renders/exports via
the results grid, and the guided GROUP-BY fallback is proven at parity so the internal cut line
is real.
