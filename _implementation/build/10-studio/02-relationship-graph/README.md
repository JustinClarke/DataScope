# 10.2 — Phase 8: Relationship Inference & Schema Graph

**Tier:** v1 · **Phase:** 8 (§19, D11) · **Design:** §20.6 · **Depends on:**
[Phase 7](../01-quality-report/) (shared containment engine) and the D17 spike findings
([`../../../architecture/decisions.md`](../../../architecture/decisions.md), §20.6) — read
them first.

**Starting point (D24):** this phase **inherits the v0 Join Graph (beta)**
([`../../05-charting/05-join-graph-beta.md`](../../05-charting/05-join-graph-beta.md))
rather than starting from zero — it hardens the confidence-labeled FK slice into full key
detection, entity inference, fact/dimension classification, and the export-grade graph.

## Objective

Reverse-engineer the business model behind a folder of tables: keys, relationships,
entities, fact/dimension split — rendered as a correctable ER graph. The least crowded part
of the landscape (§3.3) and the heart of the D12 identity claim.

## Components (§19 Phase 8, §20.6)

- **Key detection.** PK candidates from near-unique Identifier columns (classifier output, §8).
- **FK discovery.** Cross-table **containment + cardinality analysis** — the mechanism the
  D17 spike returned **GO** on (§20.6, 2026-07-12). Row-weighted containment + exact PK
  detection; **confidence is name-gated** — solid edges where the FK name agrees with the
  target, dashed candidates where only structure matches (a real renamed FK and a coincidental
  dense key are otherwise indistinguishable). Implemented in `src/lib/relationshipInference.ts`
  (§16); shares its engine with Phase 7's FK-candidate findings.
- **Entity inference.** Cluster columns/tables into candidate business entities (customer,
  order, product…) using classifier output, column-name heuristics, key detection, and
  cross-table value-overlap analysis.
- **Interactive ER-style schema graph.** Every edge carries **confidence + evidence**
  ("87% of `order.customer_id` values appear in `customer.id`"); every inference manually
  correctable. User corrections produce the *accepted graph* — the only thing Phase 9
  exports from.
- **Fact/dimension classification.** Row count, FK-richness, additive-measure detection.
- **Cryptic-column decoding (optional, AI-assisted).** Guessing what `rev_final2` means is
  the one step that genuinely benefits from an LLM; routes through the standard AI modes
  (§11.2) and is **simply skipped in local-only mode**. All structural inference above is
  deterministic and fully offline.

## Risk posture (§17)

"Structural inference wrong but confident" is the arc's headline risk: wrong join graph →
wrong dbt models → eroded trust. Mitigation is structural, not aspirational — confidence +
evidence on every edge, override everywhere, exports only from the accepted graph.

## Files

`src/features/studio/graph/`, `src/lib/relationshipInference.ts`.

## Deliverable & acceptance (§19 Phase 8)

- [ ] Drop the e-commerce sample folder → **correct join graph with fact/dim labels, zero
      configuration**
- [ ] Every edge shows confidence + evidence; every inference correctable in the UI
- [ ] Corrections persist as the accepted graph and survive re-profiling
- [ ] Local-only mode: identical structural output, decoding step skipped
- [ ] Wrong-inference fixture (misleading column names, coincidental containment) is
      correctable and stays corrected

## Definition of done

Zero-config correctness on the e-commerce sample; adversarial fixtures documented with
observed confidence behavior; accepted-graph handoff contract to Phase 9 frozen.
