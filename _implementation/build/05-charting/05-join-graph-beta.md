# 05.5 Join Graph (beta)

**Tier:** v0 · Phase 3 — v0 ship gate item · **Master spec:** §19 Phases 1/3, D24 (amends
D15/D17/D20), §20.6 (trust rules) · **Gate:** ≥ 2 registered tables

## Objective

A thin, honest, confidence-labeled slice of the Phase-8 magic in the first public ship:
FK-candidate detection across registered tables, rendered as a simple interactive graph.
Explicitly labeled **beta**. No fact/dimension classification, no dbt export — those stay
Phases 8–9 (the arc is unchanged; this pulls a slice, not the arc).

## Spec

- **Detection:** FK candidates via cross-table **containment + cardinality** analysis over
  the table registry — the D17 spike mechanism, built properly (spike code stays disposable).
  Containment is **row-weighted** (fraction of FK rows that would join), not strict
  distinct-value inclusion, so a handful of orphan rows degrades confidence instead of
  erasing the edge; PK detection uses **exact** distinct counts (an approximate count
  spuriously fails genuine keys — the spike's original root-cause bug, §20.6).
- **Two confidence tiers (the load-bearing spike finding, §20.6):** an edge is **solid /
  confident only when the column name agrees with the target** (`customer_id → customers`);
  a structure-only match — strong containment + coverage but no name link — renders as a
  **dashed candidate**, because structure alone cannot separate a real renamed FK from a
  coincidental dense key. Dashed ≠ hidden: it is an honest "candidate, confirm me," never a
  confident false edge.
- **Trust rules (§20.6):** every edge carries a **confidence label and its evidence**
  ("87% of `order.customer_id` values appear in `customer.id`"), and the **ambiguity
  runner-up + score gap** when a near-tie exists; **manual override everywhere** — add,
  remove, re-point edges; overrides survive re-profiling.
- **Rendering:** a simple interactive graph (nodes = tables, edges = FK candidates). The
  Phase-8 boundary is **capability-based, not fidelity-based** — what stays Phases 8–9 is the
  §20.6 semantic *capability* (entity / fact-dimension classification, star-schema proposal,
  dbt export), **not** visual richness; a richer rendering of these *same* solid/dashed edges
  (column-level, expandable) crosses no scope line by itself so long as it adds no §20.6
  capability. **Single connector source (§13.1 guardrail):** the Dossier hero and any richer
  column-level/ERD rendering consume *this* engine's labeled output — solid/dashed tier,
  confidence + evidence, override state — never a parallel name/presence matcher and never a
  cardinality this engine did not compute (`relationshipInference.ts` is the single seed).
- **Report integration (D20/D31):** the accepted graph appears in the structure-report
  export and in the "Copy for AI" block's relationships section (degrading to schema-only
  if this slice is cut).
- **Dossier thumbnail (D48, §13):** when this slice ships, its graph renders as a compact
  **join-graph thumbnail** in the Dataset Dossier (the post-ingest overview); when cut, the
  Dossier simply omits the thumbnail — the Dossier is itself the structural hedge if the graph
  is cut.
- **Performance:** the inference pass must hold §18 targets on a 50MB multi-table folder —
  no full-table rescans breaching the <500ms-class interactions.

## Spike verdict (D17 — 2026-07-12): **GO**

The disposable spike (native DuckDB; KMV-sketch containment pre-filter → exact row-weighted
verification, explainable scoring; one frozen config across all corpora) cleared the
pre-written bars against the e-commerce sample, TPC-H sf 0.1, mess degradations, and a
24-table / 425-col TPC-DS scale run:

- **Clean recall 4/4 (e-commerce) and 9/9 (TPC-H), all confident; zero confident false edges
  across all 15 cases; precision within the ≤ ⅓-spurious budget everywhere.**
- **Performance:** 0.7 s / 0.35 GB (TPC-H), 3.0 s / 0.65 GB (24-table TPC-DS) native — the
  WASM target keeps large headroom under the §18 / 1.5 GB budget.
- **Mess:** 30 % nulls / 5 % orphans / string coercion hold full recall; 20 %-orphan and
  renamed-column variants degrade to **dashed candidates** (found, not confident); zero-padded
  string-vs-int keys fail as the pre-committed expected loss → a **type-normalization pass**
  before matching is the named build-spec mitigation.
- **The finding that shapes the UI:** confidence is gated on **name agreement** (above) —
  solid where FK names echo the parent, dashed candidates otherwise. This is why the graph is
  honest without being timid, and it sets the Dossier join-section copy (D48/§13.1).

This clears the D24 **quality / ambiguity / performance** kill criteria *pre-build* (the
timebox criterion is still evaluated at build time). Full bar-by-bar verdict lives in the
spike scratchpad; the corpus is synthetic with known truth, so real dirty exports may still
surface unmodeled cases — the two-tier honesty is what carries those.

## Kill criteria (D24 — pre-written; miss any one → cut, v0 ships without it)

1. **Spike quality:** on the e-commerce sample the spike recovers all first-order FK joins
   (orders→customers, order_items→orders, order_items→products) with **≤ 1 spurious edge
   per 3 true edges** at default thresholds. Precision beats recall.
2. **Ambiguity = kill:** findings ambiguous enough to want a second spike *are* the kill
   signal — no second spike inside the v0 window.
3. **Timebox:** demo-ready at the end of the **2-week post-spike timebox** — "demo-ready" =
   runs the §24 Play-1 wifi-demo script on the bundled samples without handholding.
4. **Performance:** the §18 breach above.

Cutting the slice **never moves the Oct 6 date (D27)**: a no-graph demo variant is
maintained in parallel from day one, and `/schema-diagram` is replaced by `/parquet-to-csv`
(§24 Play 3). **Cut position (re-ranked 2026-07-12): last in the D27 cut order** — the slice
is **cuttable only by the kill criteria above**, never to save schedule while
lower-differentiation items (consumer templates, tour polish, extra landing pages) survive,
because it is the sole unclaimed capability (§3.4).

## Files

`src/lib/relationshipInference.ts` (shared with Phase 8 — this is its v0 seed);
`src/features/studio/` graph view (thin), or charts-adjacent placement per ADR.

## Dependencies

Table registry (Phase 1, [`../02-ingestion/03-table-registry.md`](../02-ingestion/03-table-registry.md));
D17 spike findings (§20.6); profile/classifier output (§8).

## Acceptance criteria

- [ ] E-commerce sample: all first-order FK edges recovered, ≤ 1 spurious edge per 3 true
- [ ] Name-agreeing edges render **solid/confident**; structure-only matches render as
      **dashed candidates** (never a confident false edge); orphan-bearing edges show a
      degraded confidence, not a dropped edge
- [ ] Every edge shows confidence + evidence (+ ambiguity runner-up when near-tied);
      override add/remove/re-point works and persists
- [ ] Graph renders and stays interactive within §18 targets on a 50MB multi-table folder
- [ ] Structure report + "Copy for AI" include the graph; both degrade to schema-only when
      the feature flag is off (the cut path is a working product, not a broken one)
- [ ] Single-table session: graph entry stays disabled with a clear "needs ≥ 2 tables" tooltip

## Test plan

Unit: containment/cardinality scoring incl. threshold edges. E2E: e-commerce folder →
graph assembles → override an edge → export report → verify graph present. Cut-path E2E:
flag off → report schema-only, no dangling UI.

## Definition of done

D24 kill criteria evaluated and recorded (ship or cut — a written decision against the
written criteria); Phase 8 inherits this code as its starting point rather than zero.
