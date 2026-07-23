# 10.1 — Phase 7: Data-Quality Report ("Lighthouse for data")

**Tier:** v1 · **Phase:** 7 (§19, D14) — **but the Drift Report component (D44) is pulled
forward to v0.5 as the first post-launch ship** · **Design:** §20.8 · **Depends on:** the v0
profiling substrate (§8/§10) proven via the §18 gate.

## Objective

The engineer-facing maturation of the auto-profile dashboard and insight feed: less BI,
more diagnostics — a report you run against an unfamiliar dataset the way Lighthouse is run
against a page. Deterministic and SQL-derived throughout; identical in local-only mode.

## Components (§20.8)

- **Quality score.** Composite 0–100 with per-dimension sub-scores:
  *completeness* (null rates weighted by column role — a null metric hurts more than a null
  free-text field), *uniqueness* (duplicate rows, candidate-key violations), *consistency*
  (mixed formats within a column, casing variants, stray whitespace), *validity* (values
  outside plausible type/range bounds). **The formula is visible and every component clicks
  through to its generating SQL** — a number an engineer can defend, not a black box.
- **Null heatmap.** Column × row-block missingness grid — reveals structural patterns a
  per-column percentage hides (nulls concentrated in a date range or one source file). The
  insight feed's null-pattern rule, matured.
- **Duplicate detection.** Full-row duplicates plus near-duplicates on candidate keys
  ("412 rows share `order_id` but differ in `amount`").
- **Skew & outliers.** Distribution-shape flags per quantitative column
  (skewness/kurtosis thresholds, IQR outliers) — Module 5's stats recast as report findings
  (reuse the `src/lib/` builders from
  [../../05-charting/03-distribution.md](../../05-charting/03-distribution.md)).
- **FK-candidate findings.** Cross-table containment analysis surfaced as quality findings
  ("`orders.customer_id` has 3% orphan values") — **shares its engine with Phase 8's
  relationship discovery**, so building either advances both.
- **Schema drift → the Drift Report (D44 — pulled forward to v0.5).** Re-drop a newer
  version of an already-profiled dataset → an aggregate **Drift Report**: rows added/removed,
  per-column % of values changed, null-rate and cardinality drift, and distribution shift
  (PSI or KS distance, thresholds shown, never silent), on top of the column-level schema diff
  (added/removed/retyped). Matching keys are **inferred** (the D24 engine) and it is
  **folder-aware** across a multi-table drop; both versions stay in-browser (zero server, zero
  egress). **Aggregate summary only — never a cell-level diff viewer** (cell-level CSV diff is
  the commodity cottage lane,
  [`../../../product/competitive-landscape.md`](../../../product/competitive-landscape.md);
  the unclaimed piece is inferred-key, folder-aware *statistical* drift). It is the product's
  **retention mechanic** and pillar #2 of the structure × time arc (D52), so it **ships v0.5
  as the first post-launch feature**, ahead of the rest of this phase; Phase 7 later
  **absorbs it as this one report section**.
- **Report export.** Self-contained HTML/Markdown artifact suitable for pasting into a PR
  or a data-quality ticket.

## Files

`src/features/studio/quality/`, `src/lib/qualityScore.ts` (per §16), drift comparison flow
in ingestion.

## Deliverable & acceptance (§19 Phase 7)

- [ ] Drop an unfamiliar dataset → a quality report an engineer would paste into a PR
- [ ] Every score component clicks through to its SQL; formula visible
- [ ] Zero network requests in local-only mode
- [ ] Drift Report (D44) works across two versions of a sample dataset — inferred keys, rows
      added/removed, per-column %-changed, null/cardinality drift, PSI/KS distribution shift;
      **aggregate summary only, no cell-level diff view**
- [ ] Exported HTML/Markdown report is self-contained and readable

## Definition of done

Report validated against deliberately-corrupted sample fixtures (planted duplicates, null
blocks, orphan FKs, drifted re-ingest); export reviewed by a real engineer eye before ship.
