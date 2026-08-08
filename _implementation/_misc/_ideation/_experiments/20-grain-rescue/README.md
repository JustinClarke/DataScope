# 20 — Grain rescue: does an auto-generated grain-correct layer save small local models?

**Governing question:** a 4B-class local model, given raw table DDL, reproduces the ecommerce
grain trap (averages `order_items` at line grain instead of order grain) and similar traps on
the other sample datasets. Can a **deterministically inferred** (not hand-authored) profiling +
grain-correct view layer measurably close that gap — and if it does, does the fix survive on
the actual 8GB-machine deployment target, not just a headroom machine?

**Status (2026-08-08): design v2, harness built, bake-off run, full ablation not yet run.** See
"Next steps" below for the current roadmap. Literature research done
([`RESEARCH.md`](RESEARCH.md)); v1 of the experiment design was adversarially reviewed by Opus
and found not runnable as written — one dataset was mis-described (`weather.csv` is a
single-location series, not multi-city), the headline mechanism couldn't compute its own target
measure (order value is `quantity × unit_price`; FK inference alone only knows what joins to
what), one arm silently duplicated another, the trap sample had no statistical power, and the
core claim was unfalsifiable as scoped (every question mapped to exactly one name-plausible
generated view, so the mechanism could never be caught being wrong). Full findings in
[`OPUS_REVIEW.md`](OPUS_REVIEW.md); triage (all 5 blocking + 10 important + 9 minor findings
accepted, 3 independently spot-verified before accepting) in [`TRIAGE.md`](TRIAGE.md). The
rewritten design is [`DESIGN.md`](DESIGN.md) — a pre-registered, falsifiable, budget-neutral
ablation (the reviewer's own accounting: a determinism-probe-gated repeat-count cut pays for
every addition the review required).

**What's already built and validated**, ahead of any question actually being asked: the
deterministic profiler (FK inference + grain description + rollup-view synthesis) correctly
identifies `order_items` as line-grain purely from data inference — no dataset-specific
hardcoding — and its auto-generated rollup view reproduces the independently-known-correct
average completed order value (1337.35) exactly. See [`BUILD_NOTES.md`](BUILD_NOTES.md) for
what that build pass found, including a real multi-parent-fanout bug it caught and fixed.

**Where this sits in the pipeline.** This folder is **upstream of master**, per this
directory's index — no session working here edits `DATASCOPE.md`, the Decision Record, or any
leaf doc. Per the exp20 research brief that spawned this run, this experiment is also
explicitly exempt from that brief's own tiered design-doc pipeline while it's running: it's a
clean-slate local-model probe, not a `_implementation/` build-order item.

**Design vs. implementation split** (this directory vs. code): this folder holds the docs —
research, design, review, triage, build log. The actual harness code (profiler, scoring,
Ollama call wrappers, tests) lives at
[`eval/chat/20-grain-rescue/`](../../../../../eval/chat/20-grain-rescue/), reviewed as code, not
through this doc pipeline, per `.claude/CLAUDE.md` Part II.

## Relationship to sibling experiments

Builds directly on **exp17**'s (`eval/chat/17-duckdb-local-chat/`) DuckDB bootstrap and Ollama
structured-output call pattern, reused rather than re-derived, and on its independently-verified
gold value for "average completed order value" (1337.35), which this experiment's profiler
reproduced from inference alone as its first validation. Distinct from **exp18**
(dbt-in-browser transforms, model-proposed lineage DAG) and **exp19** (model-driven silver
layer, full read/write access, memory-erasure test) — both of those give the model authoring
power over its own intermediate layer; this experiment does the opposite, testing whether a
layer the *harness* generates deterministically (never the model) is enough on its own.

## Reading order

1. [`RESEARCH.md`](RESEARCH.md) — literature findings + current Ollama model landscape (Phase 1).
2. [`DESIGN.md`](DESIGN.md) — the current, post-review experiment design (Phase 2, v2).
3. [`OPUS_REVIEW.md`](OPUS_REVIEW.md) — the adversarial review of v1, in full.
4. [`TRIAGE.md`](TRIAGE.md) — what was accepted from the review and why, verification notes.
5. [`BUILD_NOTES.md`](BUILD_NOTES.md) — running implementation log (Phase 3, in progress).

## Next steps (not yet done)

**Roadmap, in recommended order (2026-08-08, post-bake-off)** — each item is independently
startable except where noted; pick one per session rather than trying to chain them:

1. **Diagnose the ladder on `qwen3:4b`** — run all 5 main arms (A0-A4) + the 2 diagnostic arms
   (A2′, A1✗) on `qwen3:4b` alone, all 6 datasets, N=2, reusing `bakeoff.ts`'s exact machinery
   (num_ctx=8192, same question set). No new model pulls, ~20-30 min. **Why first**: the bake-off
   (A0+A4 only, see below) found A4 did *not* clearly beat A0 for `qwen3:4b` — this is the
   cheapest way to find out whether that's a real regression or concentrated in one rung (A2's
   view-selection, A3's worked examples, or A4's plan-first schema specifically) before spending
   the full run's time budget on it.
2. **Fix technical debt the full run actually needs** (the bake-off didn't, since it deliberately
   held num_ctx shared and skipped per-question view-correctness): per-model `num_ctx` pinning
   (currently one shared env var — fine comparing same-tier 4B models, not fine once `qwen3:14b`
   and the 7B pair are in the mix); Ollama-side RSS sampling (`peakRssBytes` currently measures
   this harness process, not Ollama's server process, which is what DESIGN.md §4's viability
   budget — "peak RSS under 6GB" — actually needs); a real per-question `correctViewName` map so
   `viewUsage` can distinguish right-view from wrong-view (currently always `null` → tags
   collapse to "referenced *something*" vs "referenced nothing").
3. **Decide `chasm`'s fate**: the bake-off found 0% correct across every model/arm/attempt,
   confirmed genuine (not a harness bug — see BUILD_NOTES.md). Either report it as a known
   limitation of the current single-hop rollup mechanism in the final report, or build a
   second-order "sibling rollup via shared parent" view (`order_items_rollup_by_products` +
   `product_reviews_rollup_by_products`, joined on `product_id`) before the full run and re-test.
4. **The `ecommerce-dirty/` mutation dataset** (same E-series questions re-asked against seeded
   orphan/null/dupe-key data) — DESIGN.md's own scope note marks this the first item to cut if a
   session runs long. Self-contained, doesn't depend on 1-3.
5. **The full ablation run** — all main + diagnostic arms across `qwen3:1.7b` (floor), the
   confirmed primary (working recommendation: `qwen3:4b`, pending item 1), `qwen3:14b` (capacity
   control), and the `qwen2.5:7b-instruct` vs `qwen2.5-coder:7b-instruct` coder-vs-general pair.
   Needs ~19GB more model pulls (14B ≈9.3GB + two 7Bs ≈4.7GB each) and is multi-hour — do items
   2-3 first so it doesn't need re-running.
6. **The final report** — CI'd comparisons per DESIGN.md §5, the viability budget table (needs
   item 2's RSS sampling to be real), and floor-rule-gated safety-win claims.

Gold-answer computation for all six datasets' explicit-wording questions, the paraphrase pass on
top of it, the run/scoring loop, and the model bake-off are now done (see below).

**Done since the above was written**: A4 wiring, the `viewUsage` regex tagger, and the
run/scoring loop (`runner.ts`, `manifest.ts`) — see `BUILD_NOTES.md`'s "A4 wiring, viewUsage
tagger, and the run/scoring loop built" section. A live smoke test (`qwen3:1.7b`, all five arms,
one question, real Ollama calls) confirmed the full pipeline end to end: A4 (forced plan-first)
answered correctly on the first try where A0-A3 abstained, ran wrong-but-ran, or hit an
unrepaired execution error — an n=1 anecdote, not a scored result, but a real live instance of
the trap this experiment exists to measure. One real gap surfaced: the manifest's `peakRssBytes`
currently measures this harness process, not Ollama's server process, which is what DESIGN.md
§4's viability budget actually needs — still open before the full run.

**Done since the above was written**:
- The `fixtures/dataset-facts.json` generator + premise-assertion gate (`datasetFacts.ts`,
  `premises.ts`) — see `BUILD_NOTES.md`. It caught a real off-by-one in this doc's own
  weather.csv date range on its first run against real data (fixed). The chasm dataset needs no
  new tables to register — `products`, `order_items`, and `product_reviews` are already in the
  combined catalog and the `product_reviews → products` edge is already confirmed `confident`
  (`profiler.otherDatasets.test.ts`); what's left there is just authoring the C1–C4 questions
  themselves, folded into the gold-answer-computation step above.
- **Gold-answer computation, done for all six datasets** (`fixtures/computeGold.ts` →
  `fixtures/questions.json`): all 43 questions (51 checks) across titanic/weather/stock_prices/
  product_reviews/chasm/ecommerce, each gold value computed by two independently-written SQL
  formulations that agreed on the first or second try, every premise gated against
  `dataset-facts.json`, every argmax/top-N checked tie-free. Caught and fixed two real ties
  (R3's review threshold raised 5→7, E9 cut from top-5 to top-4) and independently reproduced
  the known 1337.35 average-completed-order-value to five decimal places as a sanity check —
  see `BUILD_NOTES.md` for the full readout. Explicit-wording questions only; paraphrased
  wordings and the `ecommerce-dirty/` dataset are separate, still-open passes (next).
- The determinism probe (`determinismProbe.ts`) — built, unit-tested, and **run live** against
  every bake-off candidate pulled locally (`qwen3:1.7b`, `qwen3:4b`, `qwen2.5-coder:1.5b`):
  100% identical-output rate over 20 calls, each. Per DESIGN.md §4's pre-registered rule,
  **this experiment runs at N=2**, settled ahead of the full run.
- The arm prompt-assembly layer (`armPrompts.ts`) — A0 through A3, fully generic over any
  dataset's already-computed profile/views (validated against a second, unrelated fanout with
  no code change). Building it surfaced and fixed a real bug in the view generator itself
  (`orders_rollup_by_customers` was offering `SUM(customer_id)` as a "measure" — nonsense,
  the join key isn't a value). An informal live check (not a scored result — n=1 per model,
  anecdote) found A3's worked examples move `qwen3:4b` from a confidently wrong answer to
  exactly correct (1337.35), and shift the other two models' errors from dangerous
  (wrong-but-ran) to caught (execution error) — see BUILD_NOTES.md for the full readout,
  including a live instance of the view-*selection* trap E8/E11-E13 are designed to test.
- **The paraphrase pass, done for all 20 G/X/V/M/TG-tagged questions** (`fixtures/computeGold.ts`):
  each gained a `paraphrase` wording that shares its gold value but avoids the literal
  trap-phrase, graded as a separate check per DESIGN.md §2. A build-time gate
  (`assertParaphrasesPresent`) throws if any tagged question is missing one; verified
  programmatically that the tagged-question set and paraphrased-question set match exactly.
  `fixtures/questions.json` is now 63 entries (43 explicit + 20 paraphrase, 71 checks) — see
  BUILD_NOTES.md for the design choices (E14 mirrors E3's paraphrase verbatim; E2/E7 preserve
  their original items-vs-line-items ambiguity pair).

**Done since the above was written**: **the model bake-off, run live** (`bakeoff.ts`,
`bakeoffSummary.ts` — no sweep driver existed before this pass). `qwen3.5:4b` pulled and
determinism-probed for the first time (100/100 identical — N=2 confirmed for all three
candidates). A0+A4 only, 38 single-check explicit questions across all 6 datasets, N=2, shared
pinned num_ctx=8192, run for real on the 8GB M1 target machine (452/456 cells completed after
one resumed crash — see BUILD_NOTES.md for the full incident and fix). Result: `qwen3.5:4b` wins
the pre-registered "highest A4 correct-rate" rule (50.0% vs `qwen3:4b`'s 47.4%, `qwen2.5-coder:1.5b`'s
36.8%) but **fails DESIGN.md §4's own viability budget** (A4 p95 latency 47.7s vs. the 30s
ceiling) — the gap over `qwen3:4b` also sits inside both models' overlapping 95% CIs. **Working
recommendation: `qwen3:4b`** as the 8GB-viable primary, not yet acted on. Two findings beyond the
raw numbers, both in BUILD_NOTES.md in full: A4 did not clearly beat A0 for 2 of 3 candidates in
this bookend-only slice (only the full 5-arm run on the winner can show whether that's a real
regression or where on the ladder it concentrates), and `chasm` scored 0% correct across every
model/arm/attempt — checked against the real emitted SQL and confirmed genuine (sibling-fanout
join mistakes and malformed SQL), not a harness bug, and not something any arm's current
mechanism (single-hop child→parent rollups only) was built to fix.
