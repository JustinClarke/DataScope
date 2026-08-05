# Backlog: ERD enhancements (entity inference & fact/dimension classification)

**Tier:** backlog — designed, unscheduled · **Master spec:** §20.6 (D11) · **Cut from:** Studio
Phase 8 (`build/10-studio/02-relationship-graph/`), removed from scheduled v1 scope 2026-08-02.

Phase 7 (quality report, D14) and Phase 8 (relationship inference & schema graph, D11) were
both cut from BUILD-ORDER.md's scheduled `10 studio` v1 tier — the shipped v0 Join Graph
(beta) (`build/05-charting/05-join-graph-beta.md`) and the v0.70 explorer Data Quality &
Health panel (`build/14-workspace-streamline/02-data-quality-health.md`) already deliver the
lightweight version of what those phases targeted. See D11/D12/D14 amendments in
`DATASCOPE.md` for the full record.

Phase 8's two genuinely novel capabilities — the parts the shipped map doesn't do — are kept
here rather than discarded, as a candidate future enhancement to that same map (D24's
"capability-based, not fidelity-based" boundary: these are new *capability*, not a richer
rendering of edges already computed). No decision attaches; revive trigger is a concrete
reason to deepen the map beyond confidence-labeled FK edges.

- **Entity inference.** Cluster columns/tables into candidate business entities (customer,
  order, product, region…) using the classifier's output (§8), column-name heuristics, key
  detection (near-unique Identifier columns), and cross-table value-overlap analysis. Would
  let the map group tables by inferred entity rather than show a flat join graph.
- **Fact/dimension classification.** Row count, FK-richness, additive-measure detection —
  labels each table as fact or dimension. Feeds a visual distinction on the map (and would be
  the prerequisite for any future star-schema/dbt work, already separately backlogged as
  `03-semantic-dbt-export`).
- **Cryptic-column decoding (optional, AI-assisted).** Guessing what `rev_final2` or `tmp_4`
  mean — routes through the standard AI modes (§11.2), skipped in local-only mode. Minor;
  travels with the above if either is revived, not worth reviving alone.

Everything else Phase 8 covered (key detection, FK discovery via containment + cardinality,
confidence + evidence labeling, manual override) is **already shipped** as the v0 Join Graph
(beta) engine (`src/lib/relationshipInference.ts`, D24) and needs no backlog entry — it isn't
being revived, it was never cut.
