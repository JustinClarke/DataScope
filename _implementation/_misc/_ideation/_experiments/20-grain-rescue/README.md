# 20 — Grain rescue: does an auto-generated grain-correct layer save small local models?

**Governing question:** a 4B-class local model, given raw table DDL, reproduces the ecommerce
grain trap (averages `order_items` at line grain instead of order grain) and similar traps on
the other sample datasets. Can a **deterministically inferred** (not hand-authored) profiling +
grain-correct view layer measurably close that gap — and if it does, does the fix survive on
the actual 8GB-machine deployment target, not just a headroom machine?

**Status (2026-08-09): design v2, harness built, bake-off run, full-ladder diagnosis run on the
primary candidate, A5 minimal-prompt arm built and awaiting its sweep, full ablation not yet
run.** See
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

1. ~~**Diagnose the ladder on `qwen3:4b`**~~ — **done**, run live (`ladderDiagnosis.ts`, 438/440
   cells, all 5 main arms + both diagnostic arms). Answer: **not concentrated in one rung** — A0
   (bare DDL) is the single best-performing arm (57.9% all-dataset / 66.7% ecommerce-only); A1
   alone accounts for most of the drop, A2 doesn't recover it, A3's few-shot claws back most of
   the gap, A4 gives it back. All CIs overlap (n=76/30, not individually significant). The two
   diagnostic arms both point the same weak-signal direction: A2′ (views, no profile) beats real
   A2 on the same questions (46.7% vs 40.0%) — views help more *without* the profile at this model
   size — and A1x (corrupted grain statement) scores below real A1 (36.7% vs 40.0%), so the model
   is reading the profile, just not benefiting from it net. Most actionable lead: A4's
   view-reference rate (13%, matching the bake-off's own independent measurement) is well below
   A3's (47%) despite A4 = A3 + forced plan-first — the plan-first schema looks like it pulls
   attention away from the pre-built views rather than toward correct grain reasoning. Full
   readout, tables, and caveats in BUILD_NOTES.md's "Full-ladder diagnosis on `qwen3:4b`" section.
   **Implication**: reinforces doing item 2 before item 5 — "referenced a view" and "referenced
   the *right* view" are still conflated (`correctViewName` is `null` throughout), and that's
   exactly what's needed to pin down the A3-vs-A4 engagement gap this run surfaced.
2. ~~**Fix technical debt the full run actually needs**~~ — **done**, all three, in code (not
   run against a live sweep — that's item 5's job). `numCtx` now actually reaches the real
   `/api/chat` call (`ollama.ts`/`planFirstOllama.ts`/`runner.ts`) instead of only feeding the
   overflow-check arithmetic, so a single sweep can pin a different value per model tier.
   `manifest.ts` gained a real `ollamaRssBytes` field sampling the live `llama-server` runner
   subprocess(es) — confirmed live that `ollama serve` itself never exceeds ~50MB regardless of
   what's loaded, so the old `peakRssBytes` (kept, now documented as harness-only) could never
   have reflected DESIGN.md §4's "peak RSS under 6GB" budget; a real call against `qwen3:0.6b`
   showed harness ≈173MB vs. runner ≈1028MB. Every one of `computeGold.ts`'s 28 questions now
   carries a real `correctViewName`, grounded in DESIGN.md §2's own trap prose plus live
   enumeration of the actual generated views — and that pass surfaced a real, previously
   uncharted mechanism gap: `order_items.quantity` and `product_reviews.Rating` both classify
   `Categorical` (not `Quantitative`), so **no generated view anywhere carries a units-sold or a
   rating measure** — E7/E9 and every R/C rating question are `correctViewName: null` for that
   reason, not because DESIGN.md tags them view-selection traps. 153/153 tests pass; full
   rationale, the view-by-view mapping, and both findings in BUILD_NOTES.md's "Roadmap item 2"
   section. `bakeoff.ts`/`ladderDiagnosis.ts` deliberately left as-is (already-reported,
   one-time scripts) — the map exists for item 5's future full-run script to read directly.
3. **Decide `chasm`'s fate** — **investigated, not yet decided; the question changed.** Both
   sibling rollup views (`order_items_rollup_by_products`, `product_reviews_rollup_by_products`)
   turn out to **already exist and already be in the chasm prompt** — there is nothing to build
   for the composition. C4 is fully answerable from them today (verified: joining the two on
   `product_id` with `product_reviews_row_count >= 5` reproduces its gold `Toys Item 24` exactly),
   so C4's 0% is a pure model-composition failure with the right tools in hand. C2/C3 are blocked
   by a different thing entirely: `product_reviews_rollup_by_products` carries no rating measure,
   because `Rating` (cardinality 5) classifies `Categorical` — item 2's already-logged classifier
   gap, not a chasm-specific one. Two of the three scored questions were unwinnable for reasons
   unrelated to the chasm trap. **Superseded in priority by item 3a** — the prompt-size finding is
   the more likely explanation for chasm's 0% and needs to land first. Full detail in
   BUILD_NOTES.md's "Roadmap item 3 investigated" section.
3a. **Run the A5 minimal-prompt probe** — **built, tested, ready; sweep not run** (started, stopped
   after 2 cells at a session boundary). Motivation, measured this session: A0 (bare DDL) is ~102
   tokens and the best-scoring arm, while every arm above it is 6-14x longer and scores worse — and
   only **11 of the run's 38 questions have a view that can help them at all**, while all 38 carry
   the full profile + all-views payload. The ladder never tested the gap between 102 and 604
   tokens. `buildA5Prompt` is that arm: bare DDL + only the one view this question needs (~322
   tokens), byte-identical to A0 when it needs none. It is a **ceiling, not a shippable arm** — the
   view is oracle-selected from `correctViewName`, so if a perfectly selected, minimally packaged
   view still doesn't beat A0, the mechanism's negative result is conclusive rather than a
   packaging artifact. Run: `CHAT_NUM_CTX=8192 npx tsx eval/chat/20-grain-rescue/a5Probe.ts`
   (~15-20 min, 72 cells, resumable — do not delete the manifest).
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
