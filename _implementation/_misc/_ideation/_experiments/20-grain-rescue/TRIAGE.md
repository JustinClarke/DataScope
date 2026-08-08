# Triage of OPUS_REVIEW.md

Verified independently before triage (not taken on faith): B1 (weather.csv is 100%
`City='Springfield'` — confirmed via direct query), B2 (`order_items.unit_price` equals
`products.unit_price` on every row — confirmed, 0 mismatches across the join), and B2's
corollary (every confident edge in the ecommerce dataset carries an `ambiguity` annotation
from a 0.001-wide name-agreement tiebreak — confirmed by running `inferEdges` directly).
All three checked out exactly as claimed. Given that hit rate, the remaining findings are
accepted on the reviewer's evidence rather than re-derived one by one.

**Decision: accept all 5 BLOCKING and all 10 IMPORTANT findings, accept all 9 MINOR findings,
accept the over-engineering note (N=5 → determinism-probe-gated N=2).** No rejections. Every
finding had a concrete failure scenario, a cited verification, and a specific fix — the bar
for pushback wasn't met anywhere. Two items get scope notes rather than straight acceptance:

- **I9 (dirty-data mutation dataset)**: accepted, but flagged as the first thing to cut if
  the session runs long — it's the one addition that extends the claim's generality rather
  than fixing a correctness/attribution defect in what's already being measured. Everything
  else is load-bearing for the core claim to be true at all.
- **B3's diagnostic arms (A2′, A1✗)**: accepted, scoped to ecommerce-only as proposed —
  keeps the added cost bounded rather than multiplying across all datasets.

## Applied to DESIGN.md (rewritten in place, this doc superseded)

- B1: weather.csv recast as single-location temporal-grain dataset; new W1–W7 question set;
  `TG` trap tag added; `dataset-facts.json` premise-assertion gate added to §7.
- B2: A2's view generator now specified as the deterministic dual-measure rule already
  implemented in `profiler.ts`'s `findValuePairs`/`buildRollupView` (built independently
  before the review landed, and already emits both the wrong-measure distractor and the
  correct product-sum in the same view — confirmed by `profiler.test.ts`'s passing
  1337.35 check). DESIGN.md now documents this as the pre-registered rule rather than
  leaving A2 underspecified. Ambiguity-annotation handling decided: model-facing prompt
  text shows the resolved edge only, never the `evidence` string's near-tie clause — logged
  in the audit fixture, not shown to the model.
- B3: ladder deduplicated to A0–A4 (A4 = full stack); A2′ and A1✗ added as ecommerce-scoped
  diagnostic arms.
- B4: question bank expanded (chasm dataset, temporal-grain weather/stock questions,
  view-selection questions, paraphrased wordings) to ≥20 grain-family checks across ≥4
  schemas/trap families; N=5 replaced with a determinism-probe-gated N=2; McNemar
  pre-registered analysis plan with a stated falsification threshold added to §5.
- B5: 6 view-selection questions (E11–E16) added with `V`/`M` trap tags; `viewUsage`
  instrumentation added to §5's scoring.
- I1: chasm dataset (products + order_items + product_reviews) and a temporal-grain
  stock_prices question added.
- I2: bucket 3 split into 3a/3b/3c (abstained/malformed/execution-error) with a floor rule
  on claiming a "safety win."
- I3: one-shot execution repair applied uniformly to all arms (not just excluded as an arm);
  binding-error rate reported per arm.
- I4: `num_ctx` pinned and asserted (`prompt_eval_count < 0.8 × num_ctx` fails the run, not
  scored silently).
- I5: coder-vs-general pair replaced with a same-base, same-size, same-quant pair
  (`qwen2.5:7b-instruct` vs `qwen2.5-coder:7b-instruct`); claim scope note added.
- I6: `qwen3:14b` control runs A0 and A4, not A0 only.
- I7: covered by B3's A1✗ arm; token-count logging kept as a secondary signal, not the
  primary evidence.
- I8: every G/V/TG-tagged question gets a paraphrased second wording sharing one gold value.
- I9: `ecommerce-dirty/` mutation variant added (scoped as the first cut candidate — see
  above).
- I10: gold answers require two independently-formulated SQL queries agreeing before a
  fixture is committed.
- M1: hand-computed counts removed from prose; counts are generated from the committed
  fixture by the harness.
- M2: T6 retagged/replaced with the under-18 fraction question (a genuine null trap).
- M3: tolerance rule restated as one unambiguous rule; `score.ts` updated accordingly
  (max(0.01, 0.1% relative) rather than round-then-exact-equality).
- M4: tie-freedom check added as a build-order gate for argmax/top-N questions.
- M5: titanic caption notes it's synthetic and non-canonical; memorization-flag language
  added to the report requirements.
- M6: stock_prices' role stated explicitly as the regression guard.
- M7: viability budget (p95 latency, peak RSS) added as a pre-registered pass/fail axis.
- M8: `num_ctx` pinning requirement folded into I4's fix.
- M9: grading granularity (scalar/row-set/ranked) stated per question; reported separately.
