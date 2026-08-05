# A2 — Operation surfaces

**Tier:** v0.71 · **Depends on:** A1 · **Spec:** master §11.5, §19 v0.71, §13.3, D74

The user-facing home each A1 operation earns. **This phase is why A0–A3 are worth building whether
or not any model succeeds** — if this phase is cut, the tier degrades from "a product improvement
that also serves a model" to "scaffolding", which is exactly the framing D74 rejects.

Every surface here inherits the locked design system (`.hallmark/design.md`) and the v0.70 shell
(§13.3). This phase adds **no new shell region** — each surface lands in a region that already
exists.

| Operation | Home | Region |
| :--- | :--- | :--- |
| `search_values` | a **value search** input — "which column contains this?" | explorer rail, above the table list |
| `text_frequency` | a **term-frequency panel** on any textual column | drawer Info, selection-scoped |
| `time_series` | **period-over-period** in the suggestion set (D53 surface 4) | map → Suggested Explorations |
| `join_coverage` | **matched / unmatched / multiplicity** on an inferred edge | drawer Info, edge selection |
| `validate_sql` | a **dry-run check** that costs no execution | drawer console, beside Run |
| `distinct_values` | the existing top-values display, now **parameterized** | drawer Info, column selection |
| paging | **result paging** replacing the 100k cliff | console results grid, query tabs |

## The detail ladder is not re-opened

v0.70 D73 resolved the three "click a thing, see detail" mechanisms into **one escalation**: the
explorer rail is the lightest rung (structure only — names, key markers, type chips) and always
links out; the drawer's Info is **ambient**, filling from the selection while the user explores; the
tab is full depth. **Each rung hands off to the next and no rung duplicates the one below.**

This phase obeys that ladder rather than negotiating with it. Concretely: the rail gains a **search
input**, not a stats panel — search results *link into* the drawer, they do not render depth in the
rail. Text frequency and join coverage are **Info-view** content because they are selection-scoped
ambient detail. Anything a user wants to keep escalates to a **query tab** through the existing
pin producer.

## Findings must name their producer

v0.70's load-bearing gate applies unchanged, and it is the reason this phase is schedulable while
S7 is not: **every finding is a claim about the user's data and must name its producer.** Everything
here is **deterministic and locally computed** — term counts, coverage counts, multiplicity classes,
distinct-value shares — so each surface renders as a computed fact with its `sql` available, and
none of it may borrow the visual language of AI synthesis. A block that looks like the AI synthesis
block but was computed deterministically is as much a mislabel as the reverse (§5.2).

## Definition of done

- [x] Each surface calls the A1 operation — **never a second, separately-computed stat path** (D58).
- [x] Every displayed figure carries its `sql` and is runnable through the **v0.70 S4 run action**,
      landing in the console without navigating away.
- [x] Value search returns "no column contains this" as a **real, styled empty state**, not silence
      — that answer is the operation's most useful output.
- [x] `validate_sql` surfaces in the console as a check that visibly **costs no execution**.
- [x] Paging replaces the 100k cap in the results grid; the true `rowCount` is always shown next to
      the loaded count, so a truncation is never silent.
- [x] Empty/degenerate states specced for every panel: no textual column, no inferred edge, a
      single-value column, a column that is entirely null.
- [x] No new shell region; no new tab type; the detail ladder's three rungs unchanged.

## Built (2026-08-02)

All seven land in existing regions, none opening a new shell region or tab type.
`src/features/explorer/ValueSearch.tsx` sits above `TableList` in `ExplorerPanel`: a debounced
`search_values` call renders structure-only rows (table.column, match count) capped to a small
scroll strip, with a "no column contains…" styled empty state and a Run action on the batched
search SQL; a row click selects the column, which is the rail's existing link into the drawer —
no depth rendered in the rail itself. `src/features/inspector/ColumnInfoPanels.tsx` adds
`DistinctValuesPanel` (every column selection), `TextFrequencyPanel` (`Textual` columns only, with
a word/bigram/trigram toggle), and `JoinCoveragePanel` (edge selection) into `Inspector.tsx`'s
existing `ColumnScent`/`EdgeScent` — `join_coverage` is always called with the selected edge's own
`on`, never re-inferred, so the panel can never disagree with the edge the user clicked. `validate_sql`
lands as a "Check" button beside Run in `SqlModule.tsx`'s toolbar, EXPLAIN-ing the console's buffer
into a pass/fail banner naming the statement class and referenced objects; the banner clears itself
the moment the buffer changes so it never answers for stale SQL. The period-over-period suggestion
(`SynthesisPanel.tsx`'s `PeriodOverPeriodRow`) calls `time_series` directly for the first table
offering a Temporal + Quantitative pair rather than pre-building comparable SQL by hand (the D58
gap this closes: `querySuggester.ts`'s own hand-rolled "period vs last" task, left untouched since
it is a different region, was exactly the kind of second implementation this phase exists to avoid
duplicating with) — clicking it opens a query tab and adopts the result already in hand (Pin's own
pattern) instead of re-running the query.

Paging required one real architectural call: **replace, not extend.** The console's existing run
path (`services/sql.ts`) stays untouched — its per-session concurrency and abort semantics are load-
bearing (S4/S5) and the analyst core serializes globally (§11.5's one-query-at-a-time queue), so
rerouting every run through it would have changed concurrent query-tab behavior for a paging
feature that doesn't need to. Instead, `loadMoreRows` (`services/sql.ts`) is called only once a
result is already capped: its first call materializes the statement fresh through `run_sql` and
**replaces** the ad hoc preview outright (never appends to it) — an unordered query's two
executions are not obliged to agree row-for-row, which is `resultStore.ts`'s own reason for
existing — and every call after that pages the same materialization via `read_result`, a genuine
append. `ResultsGrid.tsx` gained a `skipNextResetRef` guard so growing a result in place is never
mistaken for a new query landing (which would otherwise reset the grid's local page/sort state on
every "Load more" click). The 100k figure itself is gone from the UI; the ceiling is now
`resultStore`'s measured 256 MB, surfaced as an honest `result_too_large` message rather than a
silent cutoff.

34 new tests across 4 files (`ValueSearch`, `ColumnInfoPanels`, plus additions to `Inspector`,
`SqlModule`, `SynthesisPanel`, `ResultsGrid`); the analyst-core mock in each follows
`DistributionModule.test.tsx`'s existing pattern rather than reaching the real DuckDB-Wasm engine.
Full suite green: `npx vitest run` (197 files, 1980 tests), `npx tsc --noEmit` and `npx oxlint`
clean.
