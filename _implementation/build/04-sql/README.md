# 04 — SQL Playground

**Tier:** v0 · **Phase:** 2 (§19) · **Depends on:** [`../03-profiling/`](../03-profiling/)
(classified columns drive suggestions + autocomplete).

Monaco-based SQL editor with contextual suggestions, results grid, the shared SQL → Chart
translator, and the transformation layer (derived tables + undo). JSON/JSONL ingestion also
lands in Phase 2 (extends [`../02-ingestion/01-file-drop.md`](../02-ingestion/01-file-drop.md)).
The **analyst-completion surface (D53)** rides on this section's machinery — a no-SQL floor for
the business analyst — since pivot, guided answers, and take-with-me export are all thin layers
over the same engine. Modules in this section accept an optional **`ThreadConfig` prefill (D68e)**
so a Verdict `RankedAction` opens them *on the answer* — pre-selected columns, pre-run query —
rather than an empty form.

| Doc | Covers |
| :--- | :--- |
| [01-monaco-editor.md](01-monaco-editor.md) | Lazy-load, DuckDB autocomplete |
| [02-query-suggestions.md](02-query-suggestions.md) | §10 M2 — templates from classified columns + **guided task-shaped answers (D53)** |
| [03-results-grid.md](03-results-grid.md) | Sortable, virtualized, paginated results + **take-it-with-me export: CSV/Excel, copy-SQL (D53)** |
| [04-chart-translator.md](04-chart-translator.md) | §10 M2 — SQL → chart auto-mapper (**shared with AI stage 6**) |
| [05-transformation-layer.md](05-transformation-layer.md) | §12.1 — `CREATE TABLE AS`, undo, re-profile + **reproducible transform recipe (D53)** |
| [06-pivot-crosstab.md](06-pivot-crosstab.md) | §10 M7 — **pivot / cross-tab, the no-SQL on-ramp (D53)**; internal cut line to a guided GROUP-BY builder |

**Exit criteria (= Phase-2 deliverable):** write and execute SQL; results as tables and
auto-selected charts; a `CREATE TABLE AS` yields a new profiled, undoable table; a business
analyst can pivot a sample and export it to Excel **without writing SQL** (D53; the pivot's
full UI is a Phase-3 ship-gate item, cuttable above the Join Graph).
