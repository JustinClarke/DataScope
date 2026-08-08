# 16 — Light-model SQL ceiling: how small can the local model go, and where does it break

**Governing finding so far:** every small local model tested (WebLLM's pinned coder model, four
Ollama-served alternatives, and Chrome's Gemini Nano) fails the *same class* of SQL-generation bug
— hallucinated column placement and wrong aggregation grain across a join — regardless of prompt
format, and Nano's JSON-schema-constrained decoding does not fix it. The one variable that *did*
change the pass rate was **schema shape**: collapsing to a single flat table with no joins took one
model (Nano) from real-bug-laden "8/8 syntactically valid" to 7/8 *execution-verified correct*.

**Status (2026-08-06):** six probes run or built, four of them real (live models, real execution),
one informal/prior-session, one built but not yet executed (browser-only, needs a manual run). All
single-pass (N=1 per question) — not statistically robust. This doc records what was found and
what to run next; it does not pick a candidate.

**Update (2026-08-06, same day):** raising WebLLM's download budget from ~1.5GB to 2GB and
retesting against `Qwen3-1.7B-q4f16_1-MLC` — the top-VRAM candidate under that new cap, and the
model Probe 1 already flagged as qualitatively the cleanest of four Ollama-proxy candidates.
Probe 6 (Ollama, real execution) is the first real-execution result for this model and the first
result in this document where a small model cleared the flat-schema fixture 8/8, including the
exact question (category-with-max-revenue, the `GROUP BY` grain question) that broke every other
model tested on it. See Probes 5 and 6 below, and the caveats attached to both — this is one
passing run on the easy fixture, not a reversal of the governing finding.

**Update (2026-08-06, same day, part 3): this now is a reversal, at least via the Ollama proxy.**
Probe 7 extends the real-execution harness to the 4-table schema — the fixture every model in
this document has failed on, including Qwen3-1.7B's own Probe 3 read (informal, syntactic-only).
**Qwen3-1.7B scored 24/24 execution-verified correct across 3 repeats**, including both known
failure points (the aggregation-grain "average order value" question and the
join-plus-`GROUP BY` "category with most revenue" question) — fully stable, not flaky. Probe 8
tested the other standing open item, `Qwen2.5-Coder-0.5B-Instruct` (flagged three times, never
run): 8/8 on the flat schema, but a stable 12/24 (exactly the 4 join-requiring questions fail all
3 runs, the 4 non-join questions pass all 3) on the 4-table schema — reproducing the doc's exact
bug taxonomy (column misattribution across a join, aggregate-in-`WHERE`) as a hard, reproducible
ceiling rather than noise. Together these say the ceiling is real and is capacity-shaped, not a
property of "small local models" as a category: a large-enough small model (1.7B, Ollama
quantization) clears it stably, a smaller one (0.5B) hits it stably. See Probes 7 and 8 below.
**Still not settled:** this is via the Ollama proxy (Probe 1's caveat, never resolved) — Probe 5,
the actual MLC/WebGPU build, is still unrun and is now the one result standing between this and a
real reversal of the governing finding.

**Update (2026-08-07): Probe 5 has run — 8/8 execution-verified correct on the actual MLC/WebGPU
build.** The Ollama-proxy caveat above is now resolved: `Qwen3-1.7B-q4f16_1-MLC`, loaded through
real WebLLM/WebGPU in-tab (not a quantization proxy), clears the flat-schema fixture cleanly. Two
real, model-specific issues surfaced getting a clean run — a download-reliability finding relevant
to the "raise the budget to 2GB" question, and a `<think>`-block extraction gap since Qwen3 is a
reasoning model and no prior model in this document was — both detailed in Probe 5 below. This is
still the flat-schema fixture, not the 4-table one Probe 7 cleared via Ollama; the 4-table WebLLM
retest is the next open item.

**Update (2026-08-07, same day, part 2): the governing finding at the top of this doc is reversed
for this model.** Probe 9 extended Probe 5's fix set to the 4-table schema — the fixture the
opening paragraph above says every small local model fails — and scored **8/8 execution-verified
correct**, on the real WebGPU/MLC build, no proxy. Both named failure classes from the opening
paragraph (hallucinated column placement, wrong aggregation grain across a join) are cleared. The
opening paragraph's "every small local model tested... fails the same class of bug" no longer
describes `Qwen3-1.7B`; it still accurately describes every other model in this document (the
current 1.5B pin, Nano, and `Qwen2.5-Coder-0.5B`). See Probe 9 and the verdict below.

**Relation to this folder's other experiments.** 01–13 (see [`README.md`](../README.md)) attack
dataset-*narration* fabrication (F1–F3) under the ADR-010 synthesis seam — a different mechanism
and a different rubric. This experiment is closer in spirit to 13/14/15: it asks how much a small
local model can be trusted, scoped down to one concrete mechanism —
[`src/services/toolLadder.ts`](../../../../../src/services/toolLadder.ts)'s NL-question-to-SQL step in
the in-browser analyst loop. It does not use the parent README's seven-dimension rubric (R1–R7) or
the F1–F4 fixture set; those are specific to the narration-fabrication problem. The one invariant
this experiment does borrow is **F4's spirit**: a single passing run certifies nothing, and every
result below is flagged as single-pass for exactly that reason.

---

## How this experiment is organised

**Restructured 2026-08-07.** This was a single flat file,
`_experiments/16-light-model-sql-ceiling.md`, through Probe 15. It grew past 1,100 lines and 15
probes while remaining the most promising line of work in this folder, so it became a directory:
this file is now the **parent record** at
`_experiments/16-light-model-sql-ceiling/README.md`, and each new line of inquiry gets its own
sibling doc. Nothing was split out of the parent in the move — Probes 1–15 and the Verdict stay
here verbatim, because they are one continuous argument and splitting them would create a
mirror-maintenance burden for no reading benefit.

**What goes where, from here on:**

- **This file** stays the spine: the governing finding, the running probe record, the open
  questions list, and the Verdict. Every sub-experiment's *result* lands here as a one-paragraph
  entry in the index below plus an update to the Verdict — the parent must remain readable on its
  own.
- **A sibling `16x-*.md`** holds a sub-experiment's full detail: its hypothesis, its exact
  fixture/prompt deltas, its raw per-question tables, and its own caveats. Sub-experiments are
  lettered (`16a`, `16b`, …) rather than continuing the probe numbering, because they are
  *interventions on the harness* — changes to what the model is served or what the host does with
  its output — not further probes of the model's unaided ceiling. Probe numbering (16+) stays
  reserved for the latter.
- **Harnesses stay flat** in [`eval/claude/16-light-model-sql-ceiling/`](../../../../../eval/claude/16-light-model-sql-ceiling/),
  deliberately not mirrored into per-sub-experiment subfolders: the scripts already share
  `probeShared.ts` and every sub-experiment reuses an existing fixture, so a nested layout would
  split tightly-coupled files across directories and break the run commands recorded against every
  probe above.

### Sub-experiment index

Origin: all four were raised after Probe 15 established that the three Probe 14 failures are
**identifier-hygiene** failures (a typo'd table name, an unqualified column ambiguous across a
join), not SQL-reasoning failures — the doc's own reading is that "every question that reached a
clean join graph got the double-hop math right." That reframes the ceiling: the model is spending
capacity on facts the host already holds and could simply serve it. Ordered so the cheapest,
most premise-invalidating run goes first.

| # | Question it answers | Status |
| :--- | :--- | :--- |
| [16a](16a-production-prompt.md) | Is the ceiling real, or an artifact of the probes serving a *thinner* schema prompt than production does? Every probe here hand-writes a bare `Tables:` DDL block; the app sends `pruneSchema`'s output, which also carries row counts, semantic types, and an inferred `Relationships:` block. | **done — 12/24 (N=3), *worse* than Probe 14's 15/24 on the identical fixture** |
| [16b](16b-semantic-labels.md) | Are the semantic-type labels net-harmful? 16a found production labels `products.price` as **`Identifier`**, and three of its four failures misplace `price`. Run the same fixture three ways — labels as-is, labels hand-corrected, labels removed — to separate "wrong labels hurt" from "labels hurt." | **done — yes, net-harmful. 9 → 12 → 15 of 21 as labels go from shipped → corrected → removed.** `stripped` scores 18/24 overall, the best result any prompt has produced on this fixture, beating Probe 14's bare block while carrying *more* context than it. The original fan-out-annotation question is **not** covered and remains open |
| 16c | Can the failures the retry rung provably can't recover be closed **deterministically** instead — nearest-name repair for a typo'd table, schema-driven qualification for an ambiguous column, alias binding for an unbound one — with no model call at all? | not started |
| [16d](16d-intermediate-query.md) | Does letting the model build one intermediate view per hop (`create_view`/`derive_table`, within the ladder's existing follow-up budget) beat asking for the nested query in one shot? | **started, preliminary, handed off mid-run — N=1 on Probe 14's 3 failures: 1 fixed, 2 still fail (one now silently, via a bad-but-executable join condition the scratch step didn't catch). Regression check against the 5 previously-passing questions not yet run.** |
| [16e](16e-structured-spec.md) | Can a structured spec (host compiles SQL, model never hand-writes identifiers) express the fixture at all, before spending a model run on it? | **both gates now checked. Vocabulary/compiler gate: passed — a standalone prototype (one new parameter `as`, a BFS join-path resolver over the `FkEdge` graph) compiled all 8 fixture questions to SQL matching gold exactly, real seeded data, a rejection check caught and fixed a real resolver bug first. Model-emission gate: failed — `Qwen3-1.7B` scored 0/8 execution-correct (3/8 first-attempt schema-valid) emitting JSON calls into that same compiler via a `STEP:`/`FINAL:` protocol, driven by a stuck-repetition failure (the same invalid bare-column reference repeated verbatim across retries) that more turns doesn't fix — a sharp contrast with the same model's 24/24 via plain SQL text on this identical fixture (Probes 7/9/11), pointing at the hand-rolled JSON protocol, not model capacity, as the bottleneck. Schema-constrained decoding (untested) is the next lever, not a bigger step budget.** |

16a ran before the rest because it could invalidate their premise. It did not — it confirmed it,
and inverted the expected direction: the ceiling is not an artifact of underfeeding, because
production's *richer* prompt scores lower than the bare block the probes had been using. 16b then
found the specific thing doing the damage, and that removing it beats every prompt this document
has tried.

**16d was started and handed off mid-run, preliminary only — see [16d](16d-intermediate-query.md).**
Letting the model run intermediate scratch queries against real data before finalizing (rather than
composing one nested query in one shot) fixed one of Probe 14's three failures (a typo'd table
alias) but not the other two, and on one of those two the failure mode got *worse*: the scratch
query itself contained a semantically wrong but syntactically valid join condition
(`customers.customer_id = order_items.order_id`), which DuckDB doesn't reject, so the model
"verified" a garbage intermediate result and built a silently wrong final answer on top of it —
where the original one-shot failure at least threw a catchable error. N=1, only tested against the
3 known failures; the regression check against the 5 previously-passing questions was never run.

**A fifth direction, raised after 16b and not yet lettered — 16e, and on this evidence the most
promising of the set.** Every failure in this experiment except one is *identifier hygiene*: a
typo'd table, an unqualified column, an unbound alias, an invented column. All four are properties
of asking a model to hand-write SQL text. The app already has the alternative and does not offer it
to this model: [`operations.ts`](../../../../../src/lib/analyst/operations.ts)'s `aggregate`
operation takes `{ from, join?, metrics, groupBy?, where?, having? }`, and its `MetricFn` includes
`sum_product` — "exactly two columns to multiply then sum", precisely the `price × quantity`
shape this fixture keeps failing on. But
[`toolLadder.ts`](../../../../../src/services/toolLadder.ts)'s rungs are
`'sql' | 'continue-or-answer' | 'answer'`, so the light model is asked for SQL text and nothing
else. Every probe in this document has measured the one path that requires it to hand-write
identifiers. If the model emitted a validated spec and the *host* compiled the SQL, the host would
qualify every column and resolve every name — making the entire clerical failure class
unrepresentable rather than merely retry-catchable. This is the same producer/validator seam D55
already established for ViewSpec. It would **not** fix the grain failure below, which needs
composition (16d). The untested risk was whether a 1.7B emits schema-valid JSON reliably, and
whether constrained decoding interacts badly with this model's `<think>` chains — cheap to probe,
and the thing to probe first.

**Update (2026-08-07): probed — 0/8, and the compiler/validator half of the thesis holds while the**
**model-emission half does not, at least via free-text JSON.** `16eModelEmissionProbe.ts` ran
`Qwen3-1.7B` against 16e's own compiler (`compileAndRun`, the exact code the prototype above proved
correct) through a `STEP:`/`FINAL:` JSON protocol, up to 4 steps per question. Result: **0/8
execution-verified correct, 3/8 first-attempt schema-valid.** The compiler caught every malformed
spec with a specific, correct error — never a silently wrong answer from bad JSON — but the model
did not reliably produce specs that cleared validation. The dominant failure was a stuck loop: in 5
of 8 questions the model repeated the *identical* invalid construct (same bare unqualified column,
same missing field) across 3–6 consecutive turns despite being told exactly what was wrong each
time — evidence this is a temperature-0 decoding attractor, not slow convergence, so a bigger step
budget would likely reproduce the same loop for longer rather than escape it. This is a sharp
contrast with the same model's 24/24 stable via plain SQL text on this identical fixture (Probes
7/9), including proven self-correction from real execution-error feedback (Probe 11: 3/3 recovered).
That contrast points at the hand-rolled JSON protocol — invented for this experiment, not a shape the
model has likely seen much of in training — as the bottleneck, not the model's underlying capacity or
its comprehension of the vocabulary (which was reasonably good: correct `sum_product` and `as`-chain
usage in several cases). The untested lever that actually follows from this: `qwen3:1.7b` advertises
a `tools` capability in Ollama, meaning schema-constrained decoding is available and would make most
of the observed failures (bare column, missing field, wrong `where` shape) structurally
unrepresentable rather than merely rejected after the fact — a different kind of intervention than
more turns. Full detail, per-question table, and caveats in [16e](16e-structured-spec.md)'s
"Model-emission probe" section.

---

## Background

`src/services/webllm.ts` pins the in-browser WebLLM model to
`Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC` (~830MB), chosen to fit alongside DuckDB-WASM in browser
memory. Two hard constraints on any replacement: ≤1.5GB download, and it must actually exist in
`@mlc-ai/web-llm`'s prebuilt model list — only MLC-converted quantized models run in WebLLM.

This model does not reliably emit native structured `tool_calls`. `toolLadder.ts` works around that
with a deterministic prose ladder ([`src/services/toolLadder.ts`](../../../../../src/services/toolLadder.ts)):
ask for exactly one DuckDB `SELECT` statement in plain text, extract it with `extractSql()` (a regex
over a fenced or bare `SELECT`/`WITH`), execute it, then a bounded number of continue-or-answer
rounds (`MAX_UNSTRUCTURED_FOLLOW_UPS = 2`). The right test for any candidate model is therefore not
"does it call tools correctly" but "does it reliably return one correct SQL statement when prompted
in exactly this shape."

---

## Probe 1 — Ollama proxy sweep across WebLLM candidates (prior session, informal)

Real Ollama-served models, as a proxy for the same base weights MLC quantizes, run through a script
mimicking the ladder's exact prompt shape: fixed 4-table schema, 8 NL questions, `SQL_INSTRUCTION`
appended, checked whether SQL was extractable and referenced real table names. N=1, temp 0, no
execution check — syntactic/regex validation only.

| Model | Size | Clean SQL extracted | Notes |
| :--- | :--- | :--- | :--- |
| Qwen2.5-Coder-1.5B-Instruct (current pin) | ~830MB | 8/8 | One semantic join bug (counted orders, not distinct customers) but syntactically valid |
| Qwen2.5-1.5B-Instruct (general, non-coder) | ~similar | 8/8 | Worse join bug — joined on a nonexistent column, would error at execution |
| Llama-3.2-1B-Instruct | ~700MB class | 6/8 | The two "failures" were a harness bug, not a model bug — fences as `` ```duckdb ``, and the old `extractSql()` regex didn't recognize that tag |
| Qwen3-1.7B | ~1.4GB | 8/8 | Qualitatively the cleanest joins/logic of the four; confirmed in WebLLM's catalog (id has no `-Instruct-` suffix) |

Caveats (stated then, still true): single pass, no repeats, Ollama quantization ≠ MLC's `q4f16_1`
exactly (same base weights, different scheme), no actual DuckDB execution check.

## Fix landed as a byproduct

The Llama-3.2-1B "failures" above were real evidence of a harness bug, not a model bug:
`extractSql()` only matched a `` ```sql `` or bare fence. Fixed this session —
[`toolLadder.ts:65`](../../../../../src/services/toolLadder.ts):

```diff
- const fence = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
+ const fence = text.match(/```(?:sql|duckdb)?\s*([\s\S]*?)```/i);
```

Independent of model choice; keep it regardless of what this experiment concludes.

## Probe 2 — real WebLLM catalog check (this session)

Read directly from the installed `@mlc-ai/web-llm@0.2.84`'s `prebuiltAppConfig.model_list`, not
memory — confirms two models flagged "not yet tested" in Probe 1's session are real, plus one
stronger candidate that wasn't on the radar:

| Model ID | VRAM (MB) | vs. current pin (1630MB) | Notes |
| :--- | ---: | :--- | :--- |
| `Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC` | 945 | −42% | Same coder-tuned family as the current pin, just smaller — untested, highest-priority next candidate |
| `Qwen3-0.6B-q4f16_1-MLC` | 1403 | −14% | Confirmed real. Newer arch, general not coder-tuned |
| `Qwen3.5-0.8B-q4f16_1-MLC` | 1629 | ~0% | Confirmed real, but VRAM is basically identical to the 1.5B pin despite fewer params — verify actual download size before assuming it's lighter |
| `Llama-3.2-1B-Instruct-q4f16_1-MLC` | 879 | −46% | Already tested (Probe 1); retest once the fence fix is in, since 2 of its "failures" were the bug above |

None of these were actually run yet — cataloging only.

## Probe 3 — Gemini Nano, 4-table schema, syntactic vs. execution-level correctness

Motivation: Chrome ships Gemini Nano on-device via the Prompt API, at zero download cost to
DataScope, with JSON-schema-constrained decoding (`responseConstraint`) — a capability WebLLM's
pinned model doesn't reliably have. Tested whether constrained output fixes the reasoning bugs
Probe 1 found, using the same 4-table shape (`customers`, `products`, `orders`, `order_items`), 8
questions, `SQL_INSTRUCTION` unchanged, real Chrome (`LanguageModel.availability()` → `available`).
Two arms per question: unconstrained prose (what the ladder does today) vs. `responseConstraint:
{sql: string}`.

Both arms extracted syntactically valid SQL referencing real table names on all 8/8 questions — but
checking each statement against the schema for real execution correctness surfaced the same bug
class as Probe 1:

| Question | Bug | Arm | Detail |
| :--- | :--- | :--- | :--- |
| "Average order value" | wrong grain | both | `AVG(quantity * price)` over line items, not per-order totals — same multiplicity error as Probe 1's Qwen2.5 join bug. Executes cleanly, silently returns the wrong number |
| "Which category generates the most revenue" | undefined alias | unconstrained | referenced alias `e.category`; no table was ever aliased `e`. Errors on execution |
| "Which category generates the most revenue" | hallucinated column + missing GROUP BY | constrained | `quantity` doesn't exist on `products`; aggregate with no `GROUP BY`. Errors on execution |
| "Total revenue" | hallucinated column | constrained | `SUM(price * quantity) FROM order_items` — `price` lives on `products`, not `order_items`. Errors on execution |

Real per-question correctness: **~6/8 unconstrained, ~5/8 constrained** — worse than the syntactic
headline, and constrained mode was not more *correct*, only more *parseable*. Constrained calls were
faster after warm-up (~1.2–3.1s vs. ~1.0–10.5s unconstrained).

**Conclusion drawn at the time:** `responseConstraint` guarantees output shape, not SQL correctness.
It kills the `extractSql()` regex dependency; it does not touch the hallucinated-column or
join-grain class of bug.

## Probe 4 — Gemini Nano, flat single-table schema, real execution against ground truth

Hypothesis: Probe 3's failures came from cross-table joins and aggregate grain specifically, not
from row count or column count. Tested by collapsing to one flat denormalized table (`sales`: 9
columns, 1500 synthetic rows, no joins possible) and — unlike every prior probe — **actually
executing** the model's generated SQL against a real DuckDB-WASM instance in the browser (the same
bundle the app ships), comparing the returned value to a precomputed ground-truth query. Syntactic
validity was explicitly not trusted as a proxy this time, per Probe 3's finding.

8 questions, same style as Probes 1/3 (counts, sums, distinct counts, filters, group-by-max,
region/category filters), `responseConstraint` arm only.

| Question | Outcome |
| :--- | :--- |
| Total row count | correct |
| Total revenue (`SUM(price * quantity)`) | correct |
| Distinct customers | correct |
| Count filtered by region | correct |
| Average price per row | correct |
| Category with max revenue | **execution_error** — `SELECT category FROM sales ORDER BY SUM(price * quantity) DESC LIMIT 1`, missing `GROUP BY category` |
| Count filtered by status | correct |
| Sum filtered by category | correct |

**7/8 execution-verified correct.** The one failure is a smaller version of the same "forgot the
aggregation grain rule" bug from Probes 1 and 3 — but without a join to also get a column wrong.
Compare to Probe 3's real per-question correctness of ~5–6/8 on the 4-table schema: removing joins
measurably moved the needle, on the one dimension that actually matters (execution correctness, not
syntax).

### Build notes (for reproducing Probe 3/4's harness)

Both probes ran as standalone HTML pages (Chrome's Prompt API is not callable outside a real browser
tab, and not usable inside a sandboxed Artifact iframe) served over `localhost` — the Prompt API
requires a secure context, which `file://` does not reliably satisfy. Probe 4 vendors DuckDB-WASM's
browser bundle directly (copied from `node_modules/@duckdb/duckdb-wasm/dist/`) rather than going
through Vite, which surfaced two build-only failure modes worth remembering if this is rebuilt:

1. The vendored `duckdb-browser.mjs` has bare module specifiers (`apache-arrow`, `tslib`,
   `flatbuffers`) that only a bundler resolves — Vite handles this invisibly in the real app. A raw
   browser needs an import map pointing each at a vendored copy (`apache-arrow` → its `Arrow.dom.mjs`
   browser build specifically, not the Node build).
2. The wasm/worker bundle config must use **absolute** URLs. A relative path resolves against the
   *worker's own* script location once inside the worker, not the page's — a same-named relative
   path silently doubles (`/duckdb/duckdb/...`) and 404s, which surfaces as an opaque
   `WebAssembly.compile: HTTP status code is not ok` rather than a clear 404.

Neither issue exists in the real app, which already resolves both through Vite
([`src/workers/duckdb.worker.ts`](../../../../../src/workers/duckdb.worker.ts)); they're artifacts of
standing up an isolated test page outside the bundler, recorded here so a future probe doesn't
re-debug them from scratch.

## Raising the WebLLM budget to 2GB — is there a better candidate than the current pin?

`src/services/webllm.ts`'s pin is currently constrained to ≤1.5GB (the current
`Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC`, ~830MB download / 1630MB VRAM). Raising that ceiling to
2GB, with Cloudflare covering the cold-start path while the larger model downloads, opens the
question of what the best candidate actually is under the new budget.

Checked directly against the installed `@mlc-ai/web-llm`'s `prebuiltAppConfig.model_list` (not
memory): every model under 2048MB VRAM, sorted descending. The top of that list is
**`Qwen3-1.7B-q4f16_1-MLC` at 2036.66MB** — the largest model in the catalog that fits the new
budget, and the same model Probe 1 already flagged as qualitatively the cleanest of its four
Ollama-proxy candidates. Nothing between it and the cap is a serious alternative: the next entry up
(`RedPajama-INCITE-Chat-3B-v1`, 2041MB) barely exceeds 2GB and is an older base model with no
instruction-quality evidence for this task. No Phi-3, Llama-3.2-3B, Gemma-3, or Mistral variant
exists under 2GB in this catalog at all — those model families only appear at 3B+/3–4GB VRAM,
outside budget entirely. So `Qwen3-1.7B` is not one option among several better ones; it is the
ceiling of what raising the cap to 2GB buys in this ecosystem, given what MLC has actually
converted for WebLLM.

That made it the obvious next candidate to retest for real — Probe 1's read on it was informal
(Ollama proxy, syntactic-only, N=1). Probes 5 and 6 retest it properly.

## Probe 5 — Qwen3-1.7B over WebLLM, flat schema, real execution

Same fixture, 8 questions, and ground-truth scoring as Probe 4, with `Qwen3-1.7B-q4f16_1-MLC`
loaded through WebLLM in-tab (`CreateMLCEngine`, main thread) instead of Nano through the Prompt
API. WebLLM has no `responseConstraint` equivalent, so this uses the app's own fence/prose
`extractSql` regex (duplicated into the probe page per this folder's existing convention, since the
page has no module resolution into `src/` as a browser global) rather than JSON-schema-constrained
decoding.

**Result: 8/8 execution-verified correct.** This is the first result in this document on the actual
MLC/WebGPU build the app would ship, not the Ollama proxy — the one thing every earlier probe in
this document had flagged as unresolved.

Getting a clean run required fixing two probe-harness issues, both real findings about this model,
not artifacts of the test:

1. **Download reliability, not a config/CORS problem.** The first several attempts failed mid-download
   with `NetworkError: Failed to execute 'add' on 'Cache': Cache.add() encountered a network error`,
   at a different shard each time (of 30 total, ~924MB). Verified directly — curling the exact failing
   presigned CDN URL returned a clean `200` with correct CORS headers, and WebLLM's loader already caps
   concurrent shard downloads at 4, so this wasn't a config, CORS, or self-inflicted-parallelism issue.
   It's simply a bigger download than the current pin (~924MB / 30 shards vs. the current pin's ~830MB
   at roughly two-thirds the shard count) — proportionally more exposure to any transient connection
   blip over a longer transfer window. Fixed by wrapping `CreateMLCEngine` in a bounded retry loop
   (10 attempts, 1.5s backoff) in the probe harness; `addToCache()`'s `cache.match()` check before each
   `cache.add()` means every retry only re-fetches shards that failed, not the whole download. **This
   is itself a relevant data point for the "raise the WebLLM budget to 2GB" question**, independent of
   SQL correctness: a ~50% larger download is measurably more exposed to first-run failure on a
   real consumer connection, and the shipped app has no such retry loop today.
2. **Qwen3 is a reasoning model; the harness wasn't ready for that.** All 8 questions initially scored
   `no_sql_extracted` — not a model failure, an extraction bug. Every response wrapped correct SQL in a
   `<think>...</think>` chain-of-thought block, which `extractSql` (a straight regex for a fence or a
   bare `SELECT`/`WITH` at the very start) has never had to handle, since no model in this document's
   test matrix before this one was a reasoning model. (Probes 6/7's Ollama runs didn't hit this because
   Ollama's default chat template suppresses `<think>` output; WebLLM doesn't.) Fixed by stripping
   `<think>...</think>` before matching, probe-local only — **not mirrored into `toolLadder.ts`**, since
   the current shipped pin isn't a reasoning model and doesn't need it. If a reasoning model is ever
   shipped, `extractSql` would need this same fix for real, not just in the probe.
3. **512 `max_tokens` truncated 2 of 8 answers mid-`<think>` block**, before the model reached its final
   SQL — long enough chain-of-thought that the response was cut off with no closing `</think>` tag and
   no SQL emitted at all. Raised to 2048 in the probe; the two previously-truncated questions ("average
   price per sale row", "category with most revenue") then answered correctly, taking ~24s and ~37s
   respectively — the most reasoning-heavy questions in the set, consistent with hitting the ceiling
   under the tighter budget.

Harness: [`flat-schema-webllm-probe.html`](../../../../../eval/claude/16-light-model-sql-ceiling/flat-schema-webllm-probe.html),
run via a real WebGPU Chrome tab per the folder's [`README.md`](../../../../../eval/claude/16-light-model-sql-ceiling/README.md).

## Probe 6 — Qwen3-1.7B over Ollama, flat schema, real execution

Motivation: get a real-execution read on `Qwen3-1.7B` quickly, without waiting on a browser run —
Ollama serves as the same kind of proxy Probe 1 used, with the caveat restated there: same base
weights, different quantization scheme than MLC's `q4f16_1`. Unlike Probe 1, this one actually
executes the generated SQL and checks it against ground truth, using the headless Node DuckDB
engine already built for the D40 eval harness
([`eval/duckdb/duckdb.ts`](../../../../../eval/duckdb/duckdb.ts)) rather than a syntactic check.

Same fixture, same 8 questions and gold SQL as Probes 4 and 5, `qwen3:1.7b` pulled via
`ollama pull`, temperature 0, one HTTP call per question against `localhost:11434`.

| Question | Outcome |
| :--- | :--- |
| Total row count | correct |
| Total revenue | correct |
| Distinct customers | correct |
| Count filtered by region | correct |
| Average price per row | correct |
| Category with max revenue | **correct** — `GROUP BY category` present, unlike every other model tested on this question |
| Count filtered by status | correct |
| Sum filtered by category | correct |

**8/8 execution-verified correct.** The one question every other model in this document got wrong
on the flat schema — Probe 4's Nano missed exactly this one, via a missing `GROUP BY` — Qwen3-1.7B
got right. Per-query latency was 7–11 seconds against local Ollama, materially slower than either
Nano (Probe 3: ~1–10s) or what WebLLM/WebGPU would be expected to deliver once quantized and
running in-browser; not directly comparable to either.

Harness: [`ollamaFlatSchemaProbe.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/ollamaFlatSchemaProbe.ts),
run via `npx tsx eval/claude/16-light-model-sql-ceiling/ollamaFlatSchemaProbe.ts qwen3:1.7b`.

**Caveats — this is one clean run, not a reversal:**
- **N=1**, same limitation as every other probe here.
- **Flat schema is the easy fixture.** This is exactly the shape Probe 4 already showed *helps*
  every model tested; it says nothing about the 4-table case, which is where Probe 3's models
  (including a comparably-sized Qwen2.5) still hallucinated columns and got join grain wrong.
- **Ollama ≠ WebLLM quantization.** This confirms the base model handles the flat schema well; it
  does not confirm the MLC-converted `q4f16_1` browser build (Probe 5, untested) behaves
  identically.
- **Latency is not comparable across providers** as noted above — Ollama-local numbers say nothing
  about in-browser WebGPU latency.

The natural next step this result points at directly: retest Qwen3-1.7B (via either Ollama or,
better, the Probe 5 WebLLM harness once run) against the 4-table schema — the fixture every model
in this document has actually failed on. A clean flat-schema run does not by itself say anything
about the join/grain ceiling; it is the fixture that has never discriminated between models so far
(every model tested has done reasonably well on it except Nano's one miss, which this result now
also closes).

## Probe 7 — Qwen3-1.7B over Ollama, 4-table schema, real execution, N=3

The retest Probe 6 pointed at directly: same real-execution discipline (headless Node DuckDB,
ground truth computed per-question, not hardcoded), extended to Probe 3's 4-table schema
(`customers`, `products`, `orders`, `order_items`) — the fixture every model in this document has
failed on. Probe 3 only ever checked this schema syntactically; this is the first real-execution
read on it. Questions are Probe 3's 8 in spirit (same join/grain/filter difficulty mix) but two
were rephrased to have a single, unambiguous scalar ground truth instead of a top-5 list
(`top-selling product`, singular) — noted so the wording isn't mistaken for Probe 3's verbatim
text. `qwen3:1.7b`, temperature 0, ground truth freshly computed against the same seeded tables.

| Question | Run 1 | Run 2 | Run 3 |
| :--- | :--- | :--- | :--- |
| Total customers | correct | correct | correct |
| Total revenue across all orders (join + sum) | correct | correct | correct |
| Distinct customers with an order (join) | correct | correct | correct |
| Total quantity of the top-selling product (join + group + order + limit) | correct | correct | correct |
| Orders from "west"-region customers (join + filter) | correct | correct | correct |
| **Average order value** (join + per-order grain before averaging — the grain bug from Probes 1/3) | correct | correct | correct |
| **Category with most revenue** (join + group + order + limit — the exact question every other model tested has failed) | correct | correct | correct |
| Cancelled orders (filter only) | correct | correct | correct |

**24/24 execution-verified correct across 3 repeats — fully stable, not one lucky pass.** This is
the first result in this document where a model clears the 4-table schema at all, let alone
stably, and it clears it on both documented failure classes (grain, join+group hallucination).

Harness: [`ollama4TableProbe.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/ollama4TableProbe.ts),
run via `npx tsx eval/claude/16-light-model-sql-ceiling/ollama4TableProbe.ts qwen3:1.7b 3`. Shares
extraction/matching/repeat-loop code with Probe 6 via a new
[`probeShared.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/probeShared.ts), which also
retrofit `--repeats` onto Probe 6's script (re-run as a regression check: still 8/8).

**Caveats — same two as Probe 6, now the load-bearing ones:**
- **Ollama ≠ WebLLM quantization.** This is still the base model under `Q4_K_M`, not MLC's
  `q4f16_1` browser build. Probe 5 (built, not run) is the only thing that resolves this.
- **N=3, not a large sample.** Stable across 3 repeats is much stronger evidence than Probe 6's
  N=1, but it is not proof against rarer failure modes.

## Probe 9 — Qwen3-1.7B over WebLLM, 4-table schema, real execution

The retest Probe 7's caveats pointed at directly: same 4-table schema, questions, and gold SQL as
`ollama4TableProbe.ts` (byte-identical fixture, so results are directly comparable to Probe 7's
24/24), run against the real MLC/WebGPU build instead of the Ollama proxy — the 4-table counterpart
to Probe 5's flat-schema WebLLM clear. Carries forward all three fixes Probe 5 needed from the
start: a bounded load retry loop, `<think>...</think>` stripped before SQL extraction, and
`max_tokens: 2048`.

**Result: 8/8 execution-verified correct**, including both documented failure classes — the grain
bug (average order value: `AVG` over a `GROUP BY order_id` subquery, correctly collapsing the join's
fan-out before averaging) and the join+`GROUP BY` hallucination (category with most revenue: joined
`order_items`→`products` correctly, grouped on the real `category` column). This is the first result
in this document clearing the hard fixture on the actual shipped-architecture build, not a proxy.

| Question | Outcome | ms |
| :--- | :--- | ---: |
| Total customers | correct | 12,459 |
| Total revenue across all orders (join + sum) | correct | 53,011 |
| Distinct customers with an order (join) | correct | 43,036 |
| Total quantity of the top-selling product (join + group + order + limit) | correct | 56,950 |
| Orders from "west"-region customers (join + filter) | correct | 39,455 |
| **Average order value** (grain bug class) | correct | 88,071 |
| **Category with most revenue** (join+group hallucination class) | correct | 87,107 |
| Cancelled orders (filter only) | correct | 15,702 |

**Latency is the one real cost this surfaces.** 12–88 seconds per question in-browser via WebGPU —
materially slower than the same questions via Ollama (Probe 7: not directly timed per-question in
the same units, but qualitatively much faster) and slower than this document's flat-schema WebLLM
numbers (Probe 5: 10–24s). The join-heavy, grain-sensitive questions (average order value, category
revenue) took the longest, consistent with more reasoning tokens for harder questions. If this ships,
that's a real UX tradeoff against the correctness gain — a ~90-second wait for one query is
noticeable in an interactive analyst loop, independent of whether the answer is right.

**Caveats:**
- **N=1.** Unlike Probe 7's N=3 Ollama read, this is a single pass on the real build. The fixes
  applied (retry loop, `<think>` stripping, token budget) are now known-necessary, not experimental,
  so a repeat run mainly derisks flakiness in the model's answers themselves, not the harness.
- **Latency numbers are this machine/connection only** — not a general claim about WebGPU
  performance across hardware.

Harness: [`4table-webllm-probe.html`](../../../../../eval/claude/16-light-model-sql-ceiling/4table-webllm-probe.html).

**Update (2026-08-07): re-run at N=3 on the real WebGPU build — 24/24, fully stable.** The harness
was extended to run the question set 3 times against the same loaded engine and report
per-question stability, closing the N=1 gap flagged as the last open rigor item. Every one of the
8 questions passed all 3 runs, including both documented failure classes (grain, join+`GROUP BY`
hallucination) — byte-identical stability read to Probe 7's Ollama N=3 result (24/24), now
confirmed on the actual MLC/WebGPU build, not the proxy. Latency stayed in the same range as the
original N=1 run (avg 14–83s/question across the 3 repeats; join+grain questions still the
slowest). This was the single highest-priority open item in this document; it's now closed for
the 4-table schema. Only the one-join schema (Probe 10/12) still needs its WebGPU N=3 confirmation.

## Probe 8 — Qwen2.5-Coder-0.5B-Instruct over Ollama, both schemas

The other standing open item (flagged in Probe 2's cataloging, never actually run). Same harness
and scoring as Probes 6/7, `qwen2.5-coder:0.5b` (397MB — well under the WebLLM download budget,
in the same coder-tuned family as the current pin), temperature 0.

Flat schema, N=1: **8/8 execution-verified correct**, and markedly faster than Qwen3-1.7B
(~0.4–2.2s per call vs. ~7–30s) — expected from the 3.4x-smaller parameter count.

4-table schema, N=3: **12/24, stable — not flaky.** The 4 non-join questions (count, distinct
count, region filter, status filter) passed all 3 runs; the 4 join-requiring questions
(total revenue, top-selling product, average order value, category with most revenue) *failed all
3 runs*, each hitting DuckDB execution errors rather than silently wrong values:

| Question | Failure mode (identical across all 3 runs) |
| :--- | :--- |
| Total revenue across all orders | `SUM(quantity * price)` against `order_items` alone — `price` lives on `products`; never joins |
| Total quantity of top-selling product | `WHERE product_id = (SELECT ... ORDER BY SUM(quantity) ...)` — aggregate inside `WHERE`, a DuckDB binder error, not a semantic mistake |
| Average order value | joins `customers`+`orders` (has `customer_id`) instead of `orders`+`order_items`+`products` (has `price`) — wrong join entirely, not just a missing one |
| Category with most revenue | joins `orders`+`order_items` only, never reaches `products` — `category` doesn't exist on either table it queried |

This is the doc's governing bug taxonomy (column misattribution, wrong-table joins) reproduced
exactly, and reproduced as a *hard, stable ceiling*: every failure is the same shape every run, not
scattered noise. Unlike the grain-error class (Probes 1/3/4), all four failures here are
execution errors — DuckDB's binder catches them — which means (unlike the grain class) an
execution-retry rung has something to trigger on for this model. Whether one bounded repair
attempt fixes any of these four is untested here (see the retry-rung note below).

Harness: same `ollama4TableProbe.ts`/`ollamaFlatSchemaProbe.ts`, `qwen2.5-coder:0.5b` as the
model argument.

---

## Probe 10 — one-join schema (customers/orders, no fan-out), real execution, N=3, two models

Open item #4, finally run: the step between the flat schema (0 joins) and the 4-table schema
(a fan-out join via `order_items`) that's more representative of what real DataScope datasets
look like than jumping straight to 4-way joins. Two tables, `customers` and `orders`, with
`amount` denormalized directly onto `orders` — deliberately **no fan-out** (unlike the 4-table
schema's `order_items`), to isolate whether a single join *by itself* is enough to break a
model that's fine at 0 joins, independent of the grain-collapsing problem Probes 1/3/4/7
documented. 8 questions, 4 requiring the join (filter, avg-with-filter, group/order/limit) and
4 not (mirroring Probe 7/8's mix ratio), real execution against headless Node DuckDB, N=3,
same two models as Probes 7/8 for a direct capacity-gradient comparison.

**Qwen3-1.7B: 21/24, stable.** All 4 join questions passed every run. The one failure, stable
across all 3 runs, is a **new bug class not seen anywhere else in this document**: `SELECT
COUNT(DISTINCT customer_id) FROM customers INNER JOIN orders ON customers.customer_id =
orders.customer_id` — a DuckDB binder error, `Ambiguous reference to column name
"customer_id"`, because the model never qualified the column despite it existing on both
sides of the join. Notably this is a *simpler* bug than the grain/hallucination classes this
model has otherwise cleared (Probes 7/9) — it doesn't require reasoning about aggregation
semantics at all, just consistent qualification once a join is added, and it happened on the
one question where the join added nothing (no filter, no grouping — the join was pure noise
relative to what the query needed). Latency: 8–16s/question, in line with Probe 7's Ollama
numbers.

**Qwen2.5-Coder-0.5B: 15/24, stable.** All 4 non-join questions passed every run; all 3
join-requiring questions that reference `region` (a `customers`-only column) failed every
run, plus the join produced by the "region" bug class is different from the 4-table doc's
join failures — twice it skipped the join entirely and queried `region` directly against
`orders` (`Referenced column "region" not found in FROM clause!`), and once it did add the
join but then referenced the wrong side's alias for the joined-in column
(`Table "T2" does not have a column named "region"` — `T2` was `orders`, `region` lives on
`T1`/`customers`). This reproduces Probe 8's finding (all failures are DuckDB execution
errors, not silent wrong values, so the shipped retry rung has something to trigger on) on a
schema half the size of the 4-table one — the model isn't only failing at fan-out/grain, it's
failing at **join presence and side-tracking at all**, once any join exists. The one
join-adjacent question it got right (`COUNT(DISTINCT customer_id) FROM orders`, no join
needed since `customer_id` already lives on `orders`) is really a no-join question in
disguise, consistent with that read. Latency: 0.26–1.4s/question (first-call warm-up aside),
consistent with Probe 8's numbers.

**What this settles:** the doc's "4-table failures are about fan-out/grain" framing was
incomplete. Qwen2.5-Coder-0.5B doesn't make it to fan-out — it fails at the *presence of a
join at all*, on a schema with no grain problem to solve. Qwen3-1.7B, by contrast, handles
every join-reasoning question here cleanly and only trips on a narrower, join-adjacent
qualification bug that the 4-table probes never surfaced (because Probes 7/9's 4-table schema
uses no naturally-colliding column names in a query where the join added nothing). Net: the
capacity gradient from Probes 7/8 holds at one join too, but the *specific* one-join failure
mode for 1.7B (ambiguous-column qualification, not grain or hallucination) is new information,
not a repeat of the doc's existing bug taxonomy.

**Caveats:**
- **N=3, not the N=1 that most of this document's Nano/WebLLM results carry**, but still not
  a large sample.
- **Ollama, not the MLC/WebGPU build** — same standing caveat as every other Ollama-run probe
  here for 1.7B specifically (Probe 9 already resolved this for the 4-table schema; this
  fixture hasn't had a WebLLM retest).
- **Schema-specific column-collision setup.** The `customer_id` ambiguity bug for 1.7B is
  conditional on the join key sharing a name across tables with no alias qualification
  required by the question — a schema where join keys are named uniquely (e.g.
  `orders.customer_id` vs. some `customers.id`) might not surface it at all. Worth noting
  before treating this as a general "1.7B can't do joins" finding — it can, on 7 of 8
  questions here and all 24/24 of Probe 7's harder 4-table joins; this is a narrower,
  real, but schema-shape-dependent miss.

Harness: [`ollamaOneJoinProbe.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/ollamaOneJoinProbe.ts),
run via `npx tsx eval/claude/16-light-model-sql-ceiling/ollamaOneJoinProbe.ts [model] [repeats]`.

## Probe 12 — Qwen3-1.7B over WebLLM, one-join schema, real execution, N=3

The WebGPU counterpart to Probe 10, the way Probe 9 was to Probe 7 — same one-join fixture,
questions, and gold SQL as `ollamaOneJoinProbe.ts`, run against `Qwen3-1.7B-q4f16_1-MLC` over
real WebLLM/WebGPU in-tab, N=3 from the start (the harness was built after Probe 9/11 already
established the value of repeat-testing on the real build, so this skipped the N=1-then-retest
step Probes 5/9 needed).

**Result: 24/24, fully stable — every question passed all 3 runs, including the one Probe 10
got wrong via Ollama.** Probe 10's stable failure was `SELECT COUNT(DISTINCT customer_id) FROM
customers INNER JOIN orders ON customers.customer_id = orders.customer_id` — a binder error
from an unqualified column after an unnecessary join. On the real WebGPU build the model didn't
make that mistake at all: it answered with `SELECT COUNT(DISTINCT customer_id) FROM orders`,
no join, which is both simpler and correct (Probe 11 already showed the Ollama version
*self-corrects* this same failure via the shipped retry rung — this shows the WebGPU build
doesn't need to, because it doesn't produce the ambiguous query in the first place). Whether
that's genuine model behavior divergence between Ollama's `Q4_K_M` and MLC's `q4f16_1`
quantization, or just this fixture's temp-0 determinism landing on a different (also valid)
plan, isn't distinguishable from a single N=3 run — but it's a second, independent way this
question now resolves correctly, on top of Probe 11's confirmed retry-recovery path.

Latency: 12–65s/question, in the same range as Probe 9's 4-table numbers (join+group questions
still the slowest — "which region generates the most revenue" averaged 41.6s).

**This closes the last open rigor gap in this document.** Every fixture built here (flat,
4-table, one-join) now has an N≥3 execution-verified clean result on the real MLC/WebGPU build
for the candidate model, not just the Ollama proxy.

Harness: [`one-join-webllm-probe.html`](../../../../../eval/claude/16-light-model-sql-ceiling/one-join-webllm-probe.html).

---

## Probe 11 — does the shipped retry rung actually fix Probe 10's failures?

`toolLadder.ts`'s `ladderRung()` already returns to the `sql` rung on any execution error, and
`webllmProvider.ts`'s `toChatMessages()` already feeds the DuckDB error back verbatim — this
was confirmed as shipped code in an earlier open item, not assumed. What was never tested is
whether a model actually *uses* that feedback to self-correct. This replays the exact retry
shape (first SQL as an assistant turn, the real DuckDB error as a user turn, `SQL_INSTRUCTION`
again) against Probe 10's two stable failures, N=3 each.

**Qwen3-1.7B: 3/3 recovered.** Given `Ambiguous reference to column name "customer_id"`, every
retry re-emitted the same query with both instances of `customer_id` qualified
(`COUNT(DISTINCT customers.customer_id)`) and got the correct answer. The retry rung fully
closes this bug for the model that's actually the shipping candidate — this failure mode
needs no additional fix beyond what's already in `toolLadder.ts`/`webllmProvider.ts`.

**Qwen2.5-Coder-0.5B: 0/3 recovered.** Given `Referenced column "region" not found in FROM
clause!` with the candidate bindings listed, the model re-emitted the *exact same* incorrect
SQL verbatim on all 3 retries — it didn't add the join at all, just repeated the query that
already failed. Not relevant to the shipping decision (0.5B isn't the candidate), but it's a
sharper data point on the capacity gradient: 1.7B doesn't just produce correct SQL more often
than 0.5B, it can *use* execution feedback to repair a wrong query, and 0.5B — at least for
this failure — cannot.

**Bottom line for "how do we fix this":** for the candidate model, it's already fixed. No new
product code needed — the retry rung shipped before this document existed and handles exactly
this class of error for Qwen3-1.7B. The one thing this doesn't cover is Probe 3/4's grain-error
class (wrong-but-executing SQL, nothing for the retry to trigger on) — but that's a pre-existing
gap already noted in this document, not something Probe 10/11 changes.

Harness: [`ollamaRetryProbe.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/ollamaRetryProbe.ts),
run via `npx tsx eval/claude/16-light-model-sql-ceiling/ollamaRetryProbe.ts [model] [repeats]`.

---

## Probe 13 — the current 1.5B pin and Qwen3-0.6B, same rigor, all three fixtures

Closes open item #7 (never tested the model actually shipping today at this rigor) and answers
a second question the doc hadn't asked yet: is there a candidate that gets some of 1.7B's
correctness gain **without** raising the WebLLM download budget at all? `Qwen3-0.6B-q4f16_1-MLC`
(1403MB VRAM, confirmed real in Probe 2's catalog check) is the obvious candidate — same
architecture/reasoning family as 1.7B, smaller. Both run via the Ollama proxy (same standing
caveat as every other Ollama probe here), same harnesses (`ollamaFlatSchemaProbe.ts`,
`ollama4TableProbe.ts`, `ollamaOneJoinProbe.ts`), N=3 where completed.

**`qwen2.5-coder:1.5b` (current shipped pin):**

| Fixture | Result |
| :--- | :--- |
| Flat schema | **24/24 stable** |
| One-join schema | **24/24 stable** — the pin handles a single join fine when there's no fan-out to collapse |
| 4-table schema | **18/24** — 2 of 8 questions fail all 3 runs, stably |

The two stable 4-table failures are the doc's exact governing bug taxonomy:

- **Top-selling product** (aggregate-in-`WHERE`, execution error): `SELECT SUM(quantity) FROM
  order_items WHERE product_id = (SELECT product_id FROM products ORDER BY SUM(quantity) DESC
  LIMIT 1)` — aggregate inside `WHERE`, a DuckDB binder error. Same shape as Probe 8's
  `Qwen2.5-Coder-0.5B` failure on the identical question.
- **Average order value** (grain error, silently wrong): `SELECT AVG(T1.price * T2.quantity)
  ... FROM products AS T1 INNER JOIN order_items AS T2 ... INNER JOIN orders AS T3 ...` —
  averages per line item, not per order. Gold `818.74`, returned `272.91`. This is the doc's
  original governing bug, reproduced exactly, in the model that's actually shipping today.

**`qwen3:0.6b`:**

| Fixture | Result |
| :--- | :--- |
| Flat schema | **24/24 stable** |
| 4-table schema | **not completed — real reliability finding, not a correctness one** |
| One-join schema | not run (moot, see below) |

The 4-table run was killed after being stuck for 10+ minutes on a single question ("average
order value" — the hardest reasoning question in the set) with the Ollama process alive and the
model loaded, not crashed. Root cause: `probeShared.ts` sets no `num_predict`/`max_tokens` on
this call path. (**Correction, added at Probe 15:** the parenthetical originally here also named
`toolLadder.ts`/`webllmProvider.ts` as setting no cap at all — checked directly against the code
while writing Probe 15's build note, and that part was wrong.
[`webllmProvider.ts:76`](../../../../../src/services/webllmProvider.ts) does set
`{ maxTokens: 256 }` on every rung; it was never the unbounded path this sentence implied, just a
cap sized for the non-reasoning model that's actually shipped, not for a reasoning-model
candidate. See open item 13 and Verdict part 7.) `Qwen3-0.6B` is a
reasoning model — on a question that requires genuine multi-step reasoning (collapsing a join's
fan-out before averaging), unbounded generation can run for a very long time before emitting
final SQL or exhausting Ollama's default 4096-token context. This reproduced on a second,
fully isolated attempt (no concurrent Ollama load), so it isn't a resource-contention artifact of
this session running two probes at once (confirmed separately: two concurrent Ollama calls did
cause a similar-looking stall, but that stall was distinguishable and resolved once isolated —
this one didn't). Probe 5 already found the same class of problem for `Qwen3-1.7B` on WebLLM
(512 `max_tokens` truncated 2/8 answers) and fixed it there with `max_tokens: 2048`; this probe
didn't carry that fix over, and given the hang was on the hardest question in the set (not a
truncation, an actual unbounded stall), a bounded budget might convert "unbounded hang" into
"truncated wrong answer" rather than a full fix.

**What this settles:** the current 1.5B pin already clears the easy and medium fixtures (flat,
one-join) stably and only fails the two hard 4-table questions this document has always flagged
as the ceiling — it is not broken across the board, it has the same two-bug ceiling every
smaller-than-1.7B model in this document has. `Qwen3-0.6B` is not a free correctness win at
zero download cost: it inherits 1.7B's reasoning-model architecture (and therefore its
`<think>`-block/token-budget needs) without inheriting a harness or ladder that accounts for
that, and on the one question that most needs bounded reasoning, that gap surfaced as an
unbounded stall rather than a fast wrong answer. Untested whether a properly token-capped
`Qwen3-0.6B` would clear the 4-table fixture — that's the natural follow-up if this candidate is
revisited, not resolved here.

Harness: same `ollamaFlatSchemaProbe.ts`/`ollama4TableProbe.ts`/`ollamaOneJoinProbe.ts`,
`qwen2.5-coder:1.5b` and `qwen3:0.6b` as the model argument.

---

## Probe 14 — nested/compound grain (double- and triple-hop aggregation), real execution, N=3

The first of four candidate "break 1.7B" directions raised after Probe 12 closed the last rigor
gap (see item 11 below for the other three: deeper join chains, ambiguous NL questions, messier
data). Every fixture through Probe 13 stacked at most one aggregation level (`order_items` → order,
or `order_items`+`orders` → customer); this probe stacks two, and one question stacks three, on the
exact same 4-table schema and seed data as `ollama4TableProbe.ts` (Probes 7/8/13) for direct
comparability — only the questions changed. 8 questions: 2 controls carried over verbatim (a
trivial count, and Probe 7's known-cleared single-hop grain question), 5 double-hop questions
varying the inner/outer aggregate (`SUM`→`AVG`, `COUNT`→`AVG`, `COUNT DISTINCT`→`AVG`, `SUM`→`MAX`,
and one combining a `WHERE` filter with the double hop), and one deliberate triple-hop "reach"
question — "the average, across customers, of each customer's own average order value" (line-item
→ order via `SUM`, order → customer via `AVG`, customer → overall via `AVG`). `qwen3:1.7b`,
temperature 0, N=3.

| Question | Hops | Run 1 | Run 2 | Run 3 |
| :--- | :--- | :--- | :--- | :--- |
| Total customers | 0 (control) | correct | correct | correct |
| Average order value | 1 (control) | correct | correct | correct |
| Average total spent per customer | 2 | correct | correct | correct |
| Average orders per customer | 2 | correct | correct | correct |
| **Highest total any single customer has spent** | 2 | **execution_error** | **execution_error** | **execution_error** |
| Average distinct products per order | 2 | correct | correct | correct |
| **Average total spent per customer, west region only** | 2 + filter | **execution_error** | **execution_error** | **execution_error** |
| **Average of each customer's average order value** | 3 | **execution_error** | **execution_error** | **execution_error** |

**15/24, stable across 3 repeats — the same 3 of 8 questions fail, byte-identical SQL and error
every run (temp-0 determinism).** This is the first fixture in this document where `Qwen3-1.7B`
does not clear 24/24 — every earlier fixture (flat, one-join, 4-table, all confirmed N≥3 on both
Ollama and the real WebGPU build) had.

**The failures are not new grain-reasoning mistakes.** In every failing query the "aggregate, then
aggregate again" structure is conceptually right — a `GROUP BY`-then-outer-aggregate CTE is present
and shaped correctly. What breaks is identifier hygiene under the added structural complexity, and
it's the doc's already-known bug shapes recurring, not a new one:

- **Highest-spend question:** `SUM(product.price * order_items.quantity)` — `product` (singular)
  instead of `products`. A hallucinated/typo'd table alias; DuckDB's binder catches it
  (`Referenced table "product" not found!`). Not seen in this document in this exact shape before
  (prior hallucinations put a real column on the wrong real table; this typos the table name
  itself), but it's the same family as the doc's column-misattribution class.
- **West-region and triple-hop questions:** both hit `Ambiguous reference to column name
  "customer_id"` — **Probe 10's exact bug**, recurring. It fires under the same condition Probe 10
  identified: whenever both `orders` and `customers` are joined *and* the inner `GROUP BY`
  references the unqualified `customer_id` that exists on both. The "average total spent per
  customer" question joins `orders`+`order_items`+`products` but never joins `customers`, and
  passed cleanly — consistent with that being the actual trigger condition, not "customer"
  appearing in the question.

**This narrows what "nested grain breaks 1.7B" actually means.** The hypothesis going in was that
stacking aggregation levels would itself be the hard part; what actually broke is that added
structural complexity (more tables in play, more subquery scaffolding) gives more surface area for
the model's two pre-existing weak spots (identifier typos, ambiguous-column qualification after a
join) to fire — not that the double/triple-hop aggregation logic itself is unreliable. Every
question that reached a clean join graph got the double-hop math right.

**Relation to the shipped retry rung.** All three failures are hard DuckDB execution errors, not
silently-wrong values — the class the doc's execution-retry rung (`toolLadder.ts`) can trigger on.
Probe 11 already showed `Qwen3-1.7B` recovers the identical ambiguous-`customer_id` error 3/3 via
that exact retry shape, so the west-region and triple-hop failures are plausibly already
self-healing in the shipped ladder — untested here, since this probe (like 6–10/13) calls the model
directly, not through the retry-capable provider. The hallucinated-table-alias failure is a new
error shape for the retry rung to prove itself against; also untested.

**Caveats:**
- **Ollama, not the MLC/WebGPU build** — same standing caveat every fixture here carried before its
  WebLLM retest (Probes 5/9/12 resolved it for flat/4-table/one-join respectively; this fixture
  hasn't had one).
- **N=3**, same as this document's other stability reads — stable across 3 repeats, not proof
  against rarer failure modes.
- **Whether the retry rung actually recovers these three failures is untested**, not assumed — see
  above.

Harness: [`ollamaNestedGrainProbe.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/ollamaNestedGrainProbe.ts),
run via `npx tsx eval/claude/16-light-model-sql-ceiling/ollamaNestedGrainProbe.ts qwen3:1.7b 3`.

---

## Probe 15 — does the shipped retry rung recover Probe 14's three failures?

The direct follow-up to Probe 14's own speculation: it guessed the retry rung "plausibly
already self-healing" 2 of its 3 stable failures, on the strength of Probe 11's unrelated
result, but never actually tested it. This replays Probe 11's exact retry shape — first-attempt
SQL as an assistant turn, the real DuckDB error as a user turn, `SQL_INSTRUCTION` again — against
all three of Probe 14's stable failures, same 4-table schema/seed, `qwen3:1.7b`, N=3 each.

| Case | Bug (from Probe 14) | Recovered |
| :--- | :--- | :--- |
| Highest-spend question | hallucinated table alias (`product` vs `products`) | **3/3** |
| West-region average-spend question | ambiguous `customer_id` after a join | **0/3** |
| Triple-hop average-of-averages question | ambiguous `customer_id` after a join | **0/3** |

**The hallucinated-alias case recovers cleanly, exactly like Probe 11's case.** All 3 retries
re-emitted the corrected query (`products.price` in place of `product.price`) and got the right
answer. No surprises here — this is a new error *shape* for the retry rung (a typo'd table name
rather than a missing qualifier), but the mechanism handles it the same way.

**Both ambiguous-`customer_id` cases fail to recover at all — a materially different result from
Probe 11's identical bug class.** Every one of the 6 retries (3 runs × 2 cases) ends the same way:
`no_sql_extracted (done_reason: length)`, empty `content`. This is not the model producing a bad
answer — it's producing *no* answer, having exhausted `num_predict` (2048, the cap this probe's
script was missing until now — see "Build note" below) mid-reasoning without ever reaching SQL.
Reading the model's own chain-of-thought (captured via a direct, uncapped-then-capped `curl`
replay against the west-region case's exact retry prompt, outside the probe script) shows why:
the model correctly restates the error, correctly identifies that the subquery's `customer_id`
"is from the customers table," then loops — "So why is it ambiguous? ... Wait, maybe the subquery
is using customer_id from the orders table. But how? ... I'm stuck. Maybe the error is
because..." — revisiting the same dead-end line of reasoning with near-identical phrasing rather
than converging on "qualify both references." Uncapped, this ran past a 5-minute `curl -m 300`
with no response at all (genuinely hung, not slow).

**Doubling the token budget doesn't fix it — a real, current data point, not an assumption.**
The same west-region retry prompt was sent again at `num_predict: 4096` (double Probe 15's
default cap), via a direct API call replaying the exact messages `ollamaNestedGrainRetryProbe.ts`
sends. Result: `done_reason: "length"` again, `content` still empty, `eval_count: 4096` (the full
budget consumed), 120 seconds wall-clock. The response's `thinking` field (18,886 characters —
on this Ollama version the reasoning trace is a separate `message.thinking` field, not an inline
`<think>...</think>` block in `content` the way Probe 5 found on WebLLM; a harness detail, not a
new model behavior) shows the loop is genuinely non-convergent, not just slow: partway through
(around character 9000 of ~18,886) the model writes "I'm stuck," then spends the remaining ~10,000
characters cycling through near-verbatim restatements of the same failed hypothesis ("I think I
need to conclude that the error is due to... But how? ... I think I need to write the query
again...") all the way to the budget ceiling. More tokens didn't move it closer to an answer —
it just extended the identical unproductive loop. This is evidence against "it would converge
given enough budget," not proof (no budget is infinite, and 8192+ was not tested), but the
tail-end repetition is a stronger signal than a simple timeout would have been.

**Why this diverges from Probe 11, despite being the identical bug class.** Probe 11 showed
`Qwen3-1.7B` recovers this *exact* `Ambiguous reference to column name "customer_id"` error 3/3,
on Probe 10's one-join schema. The error text, the fix (qualify both references), and the model
are all the same here. What differs is what the model has to hold in context to find the fix:
Probe 10's case is a two-table join with the ambiguity at the top level of the query; Probes
14/15's failing cases require the same fix *inside a subquery* that's itself nested inside a join
across three or four tables. Probe 15 confirms, with real retry data rather than the
speculation Probe 14 left behind, the hypothesis raised at Probe 14 was too optimistic about:
retry-recovery success depends on how much structural complexity surrounds the required fix, not
just on whether the failure is in the execution-error class. An error being "catchable" by the
retry rung and an error being *recoverable* by it turn out to be different properties.

**Relation to Probe 13's `Qwen3-0.6B` stall.** Probe 13 flagged an unbounded-generation hang on
`Qwen3-0.6B` — a smaller, more clearly under-provisioned model — on a hard first-pass question,
with no `num_predict` cap on that code path at all. Probe 15 reproduces the same failure *shape*
(reasoning-model, no token cap, indefinite generation) on the candidate model, `Qwen3-1.7B`, which
has cleared every other fixture in this document stably. The trigger here isn't model size or a
first-pass question — it's a multi-turn retry carrying a nested-query error, a narrower and more
specific condition than Probe 13's. Both findings point at the same missing piece: nothing on
this code path bounds generation by default, and this document has now found two independent ways
that gap turns into a real hang rather than a slow-but-eventual answer.

**Correction to Probe 14's text.** Probe 14 wrote that the retry rung "plausibly already
self-healing" 2 of its 3 failures. That's now confirmed wrong for those two (0/3 each); it's
confirmed right only for the third (the hallucinated-alias case, 3/3). The Verdict section below
is updated accordingly.

**Build note — the probe script itself was missing a token cap until this session.**
`ollamaNestedGrainRetryProbe.ts`'s `askOllamaChat()` set no `num_predict`, the same gap Probe 13
flagged in `probeShared.ts`'s Ollama call (not, it turns out, in production's `webllmProvider.ts`
— see the correction to Probe 13 above). Fixed here: a `NUM_PREDICT` constant (CLI-overridable as
a 4th argument, default 2048, mirroring Probe 5's WebLLM fix) is now threaded into every Ollama
call this script makes, and `done_reason` is surfaced in the `no_sql_extracted` log line
specifically so a future run can tell a real truncation apart from an extraction bug at a glance.

**Caveats:**
- **N=3 for all three cases, real script run, not a manual approximation** — the west-region and
  triple-hop failures are fully stable (0/3, byte-identical `done_reason: length` outcome every
  run), same rigor as this document's other N=3 reads.
- **The 4096-token retest was N=1**, a single direct API call outside the probe script's repeat
  loop — informative about the shape of the failure (genuine non-convergence, not truncation),
  not a stability claim at that budget.
- **8192+ token budgets remain untested.** The tail-end repetition at 4096 is suggestive that
  more budget wouldn't help, not conclusive — a model could theoretically break out of a
  20,000-character loop given enough room. Not pursued further here: the cost of finding out
  (multi-minute hangs, `num_predict` values well past what a shipped product would ever wait for)
  outweighs what the answer would change, since even a late convergence at, say, 8192 tokens would
  still be a UX non-starter for an interactive analyst loop.
- **Ollama, not the MLC/WebGPU build** — same standing caveat as Probe 14 itself, unresolved here.
- **This bypasses the actual retry-capable provider**, same as Probe 11 and Probe 14 — it replays
  the ladder's retry *shape*, not a call through `webllmProvider.ts` itself.

Harness: [`ollamaNestedGrainRetryProbe.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/ollamaNestedGrainRetryProbe.ts),
run via `npx tsx eval/claude/16-light-model-sql-ceiling/ollamaNestedGrainRetryProbe.ts [model] [repeats] [num_predict]`.

---

## Idea — tiered routing: 1.5B first, escalate to 1.7B on a hard question

Raised as an alternative to a flat model swap: keep the 1.5B pin's zero-extra-download default
and only pay for 1.7B (and its ~2GB budget, its 12–88s latency) when the question actually needs
it. Whether this is buildable splits cleanly along Probe 13's two failure classes — one is a
cheap wire-up, the other needs a different mechanism entirely.

**Execution-error class (aggregate-in-`WHERE`, wrong-table joins) — buildable, cheap.** These
already surface as a real DuckDB error, and the retry rung that catches them already exists and
is already wired up (`toolLadder.ts`'s `ladderRung()` returns to `sql` on any `'error'` outcome;
`webllmProvider.ts` feeds the error back verbatim). Escalating instead of retrying same-model is a
small change to that same rung: on the first execution error, load/call 1.7B instead of re-asking
1.5B. Probe 11 already showed 1.7B *can* self-correct this exact bug class from an error message
(3/3 recovered on the one-join ambiguous-column case); this would be using that same recovery
path, just triggered by a 1.5B failure instead of a 1.7B one. No new detection logic needed — the
DuckDB error *is* the detection signal.

**Grain-error class (silently wrong, executes cleanly) — not buildable this way.** This is the
one Probe 13's 1.5B run reproduced exactly (`AVG` over line items, not per-order totals — gold
818.74, returned 272.91, no error). Nothing about the model's own output signals it's wrong: the
query runs, returns a plausible-looking number, and 1.5B is not less *confident* about a wrong
grain than a right one — there's no uncertainty signal to escalate on, self-reported or otherwise.
Detecting "this question is hard" has to happen **before** generation, from something other than
the small model's own output.

The candidate mechanism for that: a **deterministic, model-independent pre-check on schema
shape**, not on the question text or the model's behavior. DataScope already has the join graph
for a dataset; the grain bug specifically requires (a) an aggregate function (`SUM`/`AVG`/`COUNT`)
(b) applied across a join where the aggregated table is on the "many" side of a one-to-many
relationship relative to the grain the question is actually asking about. That's answerable from
the schema graph and a lightweight parse of the NL question's aggregation verb, independent of
which model would generate the SQL — route straight to 1.7B (or inject an explicit
grain-collapsing instruction) whenever that shape is detected, regardless of what 1.5B would have
said. **Untested and unbuilt** — this is a design sketch, not a probed result; the open item is
whether such a pre-check can be made precise enough to avoid over-escalating on questions that
merely *look* join-heavy but aren't actually grain-sensitive (e.g. Probe 10's one-join fixture,
where 1.5B/1.7B both handled the join cleanly because there was no fan-out to collapse).

**Net:** a tiered 1.5B→1.7B router is real for the error-class half (small change to existing
code, one probed data point already supporting it) but not for the grain-class half without a new,
separate schema-shape classifier that doesn't yet exist. Not pursued further in this document —
the next probes below stay focused on 1.7B's own ceiling rather than routing design.

---

## Analysis — what's actually going on

**This is a capability ceiling, not a formatting or prompting defect.** Every model tested — from
the current pin to Nano, unconstrained or JSON-constrained — makes the same two mistakes:

1. **Column/table misattribution.** Placing a column on the wrong table (`price` on `order_items`
   instead of `products`). This throws a real DuckDB error and is therefore *catchable*: an
   execution-retry rung (feed the error back, ask for one repair) is a plausible fix, untested here.
2. **Aggregation-grain errors.** Averaging over line items instead of per-order totals — collapsing
   a join's fan-out to the right grain before aggregating is an implicit extra step the model
   doesn't reliably plan for. This is the harder half: the SQL **executes successfully** and returns
   a confidently wrong number. Nothing errors, so retry-on-error has nothing to trigger on.

Constrained decoding (`responseConstraint`) only affects (1) indirectly, by making output easier to
parse — it does not touch (2) at all, and in Probe 3 it did not even reliably help (1), since a
different hallucinated column surfaced in the constrained arm than the unconstrained one.

**Update (Probes 7/8): this is a capacity ceiling, and it moves with capacity.** The paragraph
above was written before any model had actually cleared the 4-table schema under real execution.
Qwen3-1.7B now has, stably (Probe 7, 24/24 across 3 repeats); `Qwen2.5-Coder-0.5B` — smaller,
same coder-tuned family as the current 1.5B pin — has not, also stably (Probe 8, 12/24, the exact
4 join questions failing all 3 runs). That is a clean two-point capacity gradient on the identical
fixture: 1.7B clears every join/grain question in this document, 0.5B clears none of them, both
fully reproducibly. This tracks with the general expectation that multi-hop schema-constraint
tracking scales with model capacity and reasoning depth — now with a real data point on each side
of the line, not just Probe 1's qualitative "cleanest of four" read. The open question this
sharpens rather than closes: where between 0.5B/1.5B (current pin, known to fail per Probe 1) and
1.7B does the line actually sit, and does it hold on the MLC/WebGPU build (Probe 5) the way it
holds via Ollama.

## Is Gemini Nano worth optimizing for?

No, not on its own. It has one real advantage (zero download, since Chrome already ships it) and
one real cost saving (materially faster per-call latency once warm, per Probe 3). It does not solve
the correctness ceiling, it's Chrome-desktop-only (so WebLLM can't be dropped for other browsers),
and it's a model DataScope doesn't control the version of. Worth it only as an opportunistic Chrome
fast-path (`responseConstraint` for parsing, same execute-and-verify discipline as everything else)
layered on top of a real fix to the ceiling above — not as a replacement architecture.

---

## Open questions / next probes

1. ~~Run Probe 5.~~ **Done.** 8/8 execution-verified correct on the real WebGPU/MLC build — resolves
   the Ollama-proxy caveat that had carried unresolved through Probes 1–8. New open item this
   surfaced: a 4-table WebLLM retest (the flat schema is the easy fixture; Probe 7's 4-table clear
   was Ollama-only) and whether the download-reliability finding (item below) needs a real fix in
   `webllm.ts` before shipping, not just a probe-harness workaround.
2. ~~4-table retest for Qwen3-1.7B.~~ **Done — Probe 7.** 24/24 across 3 repeats, stable, both
   documented bug classes cleared.
3. ~~Execution-retry rung.~~ **Already shipped, not a gap.** Checked the code, not just the doc:
   [`toolLadder.ts`](../../../../../src/services/toolLadder.ts)'s `ladderRung()` already returns to
   the `sql` rung whenever the last tool outcome is `'error'` (line ~108), and
   [`webllmProvider.ts`](../../../../../src/services/webllmProvider.ts)'s `toChatMessages()` already
   feeds the DuckDB error text back verbatim as `"Result of running that SQL:\n${...}"` (line ~41)
   — so the model sees the real error on the retry prompt, not just a generic "try again." It's
   bounded by the turn's overall `MAX_PROVIDER_CALLS` cap (`ai.ts:87`, 24), not a separate budget,
   and it's already covered by a test:
   [`webllmProvider.test.ts:134`](../../../../../src/services/webllmProvider.test.ts) — "asks for
   corrected SQL after an error envelope, not an answer." Probe 8 gives this a fresh reason to
   matter: all 4 of `Qwen2.5-Coder-0.5B`'s 4-table failures are DuckDB execution errors (unlike the
   grain class), so the shipped retry rung has something to trigger on for exactly that model —
   whether it actually recovers on the second attempt is untested here and would need a probe that
   runs the *provider*, not just single-shot Ollama calls, to observe.
4. ~~One-join ceiling test.~~ **Done — Probe 10.** Qwen3-1.7B: 21/24, all join-reasoning
   questions correct, one stable failure on a new bug class (unqualified `customer_id` after a
   join, a binder error, not grain/hallucination). Qwen2.5-Coder-0.5B: 15/24, fails every
   join-requiring question, not just the fan-out ones — the model doesn't reach grain problems
   because it fails at join presence/side-tracking first. Confirms the capacity gradient holds
   at one join, but the specific failure modes at this schema size are new information, not a
   repeat of the 4-table taxonomy.
5. ~~`Qwen2.5-Coder-0.5B-Instruct`~~ **Done — Probe 8.** 8/8 flat, stable 12/24 on 4-table (exactly
   the 4 join questions fail every run). Confirms the capacity-ceiling read, doesn't move the
   candidate decision on its own — the current 1.5B pin sits between 0.5B and 1.7B untested at this
   rigor (Probe 1's read on the 1.5B pin was syntactic-only).
6. ~~N>1 repeats on the real WebGPU build, all fixtures.~~ **Done.** `4table-webllm-probe.html`:
   24/24, fully stable (matches Probe 7's Ollama N=3 exactly). `one-join-webllm-probe.html`
   (Probe 12): 24/24, fully stable — including the one question Probe 10 failed via Ollama
   (resolved two independent ways: Probe 11 showed the Ollama version self-corrects it via the
   shipped retry rung; Probe 12 shows the WebGPU build doesn't produce the failing query at all).
   Every fixture in this document now has an N≥3 execution-verified clean result on the real
   MLC/WebGPU build, not just the Ollama proxy. This was the last open rigor gap.
7. ~~The current 1.5B pin, real execution.~~ **Done — Probe 13.** 24/24 flat, 24/24 one-join,
   18/24 4-table (fails the same two questions — aggregate-in-`WHERE`, averaging grain — that
   define this doc's governing bug taxonomy). The pin is not broadly broken; it has the same
   ceiling every sub-1.7B model here has. Also tried `Qwen3-0.6B` as a no-budget-increase
   alternative to 1.7B: flat schema clean, but the 4-table run stalled indefinitely on the
   hardest reasoning question — an unbounded-generation reliability gap (no `max_tokens` cap on
   this code path, and it's a reasoning model), not a correctness result. New open item this
   surfaces: whether a token-capped `Qwen3-0.6B` would clear 4-table, untested.
8. ~~4-table WebLLM retest.~~ **Done — Probe 9.** 8/8 on the real MLC/WebGPU build, both documented
   bug classes cleared. New open item this surfaced: per-question latency (12–88s, worst on the
   join+grain questions) is a real UX cost that hasn't been weighed against the correctness gain —
   worth surfacing explicitly if this moves toward a candidate decision, not just a footnote here.
9. **Tiered routing: 1.5B first, escalate to 1.7B only on a hard question.** Design sketch only
   (see "Idea — tiered routing" above), not built or probed. The execution-error half is a small
   change to the already-shipped retry rung (escalate model instead of same-model retry) and has
   one supporting data point already (Probe 11's 3/3 recovery). The grain-error half needs a new
   schema-shape pre-check (join graph + aggregation-verb parse, independent of any model's output)
   that doesn't exist yet and would need its own precision/recall testing against fixtures like
   Probe 10's one-join schema (join present, no grain risk — must not over-escalate on those).
   Deliberately not pursued further here; next probes stay focused on 1.7B's own ceiling.
10. **Nested/compound grain.** **Done — Probe 14.** 15/24, stable — the first fixture this model
    doesn't clear 24/24. All three failures are the doc's known execution-error bug shapes
    (a hallucinated/typo'd table alias, and Probe 10's ambiguous-`customer_id`-after-a-join)
    recurring under added structural complexity, not new grain-reasoning failures — every question
    that reached a clean join graph got the double/triple-hop math right. New open items this
    surfaces: (a) ~~whether the shipped retry rung recovers these three failures~~ **done — Probe
    15: only 1 of 3 (the alias case, 3/3). The two ambiguous-`customer_id` cases don't recover at
    all (0/3 each) — the model exhausts its token budget in a non-convergent reasoning loop instead
    of emitting SQL, confirmed not to be a simple budget shortfall (doubling the cap to 4096 just
    extended the identical loop).** (b) a WebGPU retest, the standing pattern for every other
    fixture in this document — still open.
11. ~~**Are these results measured against the prompt production actually sends?**~~ **Answered —
    [16a](16a-production-prompt.md), and the answer was no.** Every probe in this document
    hand-writes a bare `Tables:` DDL block; `src/services/ai.ts` sends `pruneSchema()`'s output,
    which additionally carries row counts, classifier-assigned semantic types, and an inferred
    `Relationships:` block. Re-running Probe 14's fixture with the real production prompt (calling
    `pruneSchema`/`classifyColumns` directly, not imitating them) scored **12/24 vs Probe 14's
    15/24** — richer input, lower score, stable at N=3. Two things this surfaces that belong in
    this list rather than only in 16a's write-up: **(a)** the ambiguous-`customer_id` bug is *not*
    fixed by telling the model how the tables join — it persisted, on a different question;
    **(b)** production's classifier labels `products.price` as **`Identifier`**
    (`IDENTIFIER_UNIQUE_RATIO` fires on a 40-row table with 40 distinct prices), making the measure
    column typographically identical to the key columns, and three of 16a's four failures misplace
    `price` in some form. That is a **shipped, provider-independent prompt defect**, not a
    local-model problem — `pruneSchema` builds the same block for the cloud router. Whether it
    matters at cloud-model capacity is untested.
14. ~~**Are the semantic-type labels net-harmful, or just miscalibrated?**~~ **Answered —
    [16b](16b-semantic-labels.md): net-harmful.** Three arms on Probe 14's fixture, one variable
    (the rendered label), N=3: shipped labels **9/21**, five labels hand-corrected **12/21**,
    labels removed entirely **15/21**, on the 7 questions all arms could answer. Monotonic in
    three-point steps — correcting the classifier buys back half the gap, and the other half is
    only available by not sending the labels at all. `stripped` scores **18/24** over the full set,
    the best any prompt has scored on this fixture, and it beats Probe 14's bare block (15/24)
    while carrying *more* context (row counts and `Relationships:` are still present). New open
    items this surfaces: (a), (b) and (c) below.
15. **The `Relationships:` block may invite joins the question doesn't need.** 16a raised this as a
    secondary hypothesis; 16b's `stripped` arm produced it cleanly. "Average distinct products per
    order" — which passes in Probe 14, `as-is` and `corrected` — fails 0/3 under `stripped` because
    the model joins `products` (an edge the block states unconditionally) and then trips on
    `Ambiguous reference to column name "product_id"`. Untested as its own variable: a fourth arm
    holding `stripped` and removing or conditionalizing the relationships block would isolate it.
16. **A structured qualification hint, untested and cheap.** The single most common failure across
    every probe and arm in this document is an unqualified column ambiguous across a join. The host
    knows exactly which column names appear in more than one table in a question's pruned scope, and
    can say so in one line. This is ~5 lines against the existing harness and targets the failure
    class Probe 15 proved the retry rung cannot recover. Not run.
17. **Two separable shipped changes, which should not be conflated.** (a) Tighten
    `IDENTIFIER_UNIQUE_RATIO` so a near-unique *measure* on a small table stops reading as a key —
    this affects every consumer of `semanticType`, not just this prompt, and 16b supports it only
    indirectly. (b) Stop rendering `semanticType` into the NL→SQL schema prompt — this affects only
    this prompt, and 16b supports it directly. Neither is made; both are now evidenced.
18. **A prompt change produced a hang, not a wrong answer — for the second time in this document.**
    Under 16b's `corrected` labels, "average orders per customer" — the *simplest* double-hop
    question in the set, passing 3/3 everywhere else — kills the Ollama call outright
    (`TypeError: fetch failed`), deterministically, 6 attempts across two independent runs, with the
    questions either side completing normally. The harness sets no `num_predict`, and Probe 15
    documented this model's non-convergent spiral when its prompt argues against the answer — the
    corrected arm is the only one labelling `orders.customer_id` as `Identifier`, i.e. telling the
    model the one column it needs is "not an analysis dimension." That is a hypothesis with one
    precedent, not a finding. The diagnostic is the instrumentation Probe 15 already added to
    `ollamaNestedGrainRetryProbe.ts` (`num_predict` + `done_reason`), applied to this single call.
    **This is the first thing to run next session.**
12. **Three other candidate directions for finding 1.7B's ceiling, not yet run:** deeper join
    chains (5–6 tables, or a join-of-joins — past the current max of 3-way joins via
    `order_items`); ambiguous/underspecified NL questions (every question in this document so far
    has one unambiguous gold answer); larger row counts / messier data (nulls, duplicate names,
    mixed types — current fixtures are clean synthetic data).
13. ~~Production's token cap is real but sized for the wrong model.~~ **Superseded — the swap
    happened.** As of this session, `src/services/webllm.ts`'s pin is `Qwen3-1.7B-q4f16_1-MLC` (not
    the 1.5B coder this item was written against), `webllmProvider.ts:78` sends `maxTokens: 2048`
    on every rung (Probe 5/9/12's fix, mirrored into product code), and `toolLadder.ts` now exports
    `stripThink()`, applied before parsing/display — the `<think>`-stripping fix this item said was
    "unmirrored" is mirrored. **This is uncommitted in the working tree, not yet a shipped commit** —
    worth flagging so it isn't lost. Probe 15's specific spiral (ambiguous-`customer_id`-in-a-subquery
    retry exhausting the budget with no SQL emitted) is therefore now live in the app, not just in a
    probe script — a real ~90s hang with no visible error, not a hypothetical landmine anymore. See
    16c (deterministic repair, so the retry rung never has to trigger on this class) and 16e
    (structured spec, same effect via a different mechanism) for what closes it.

## Artifacts

- Probe 3/4 harnesses: standalone HTML pages built in-session under the scratchpad directory
  (ephemeral, not committed — noted here only so the build notes above are reproducible, not as a
  pointer to a persisted asset).
- Probe 5–15 harnesses: **committed**, under
  [`eval/claude/16-light-model-sql-ceiling/`](../../../../../eval/claude/16-light-model-sql-ceiling/):
  `flat-schema-webllm-probe.html` (Probe 5, WebLLM/Qwen3-1.7B, flat schema, N=1, 8/8),
  `4table-webllm-probe.html` (Probe 9, WebLLM/Qwen3-1.7B, 4-table schema, now N=3, 24/24 stable),
  `one-join-webllm-probe.html` (Probe 12, WebLLM/Qwen3-1.7B, one-join schema, N=3, 24/24 stable),
  `ollamaFlatSchemaProbe.ts` (Probe 6, flat schema, run against both Qwen3-1.7B and
  Qwen2.5-Coder-0.5B), `ollama4TableProbe.ts` (Probes 7/8, 4-table schema, same two models),
  `ollamaOneJoinProbe.ts` (Probe 10, one-join schema, same two models),
  `ollamaRetryProbe.ts` (Probe 11, replays the shipped ladder's exact retry shape against
  Probe 10's two stable failures), `ollamaNestedGrainProbe.ts` (Probe 14, nested/compound grain,
  same 4-table schema/seed as Probes 7/8, Qwen3-1.7B only so far, 15/24 stable),
  `ollamaNestedGrainRetryProbe.ts` (Probe 15, replays the same retry shape as
  `ollamaRetryProbe.ts` against Probe 14's three stable failures; now takes an optional
  `num_predict` CLI arg, default 2048), and `probeShared.ts` (extraction/matching/repeat-loop code
  shared by the Ollama scripts). The Ollama scripts take `[model] [repeats]` as CLI args
  (`[model]` only for `ollamaRetryProbe.ts`, which has one seeded case per model;
  `ollamaNestedGrainRetryProbe.ts` additionally takes `[num_predict]` as a 3rd arg).
  **Sub-experiment harnesses** live in the same flat folder:
  [`16aProductionPromptProbe.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/16aProductionPromptProbe.ts)
  (16a — Probe 14's fixture under production's real `pruneSchema` prompt; imports
  `classifyColumns`/`pruneSchema` from `src/` rather than imitating their output, and takes
  `--print-prompts` to dump the built prompt per question without calling the model), and
  [`16bLabelAblationProbe.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/16bLabelAblationProbe.ts)
  (16b — the same prompt three ways; `--print-prompts` dumps each arm, `--arms=as-is,corrected`
  restricts the run, and it asserts the arms prune identically before calling the model). Two
  shared modules keep the comparisons honest:
  [`nestedGrainFixture.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/nestedGrainFixture.ts)
  — Probe 14's schema block, questions, gold SQL and seed, extracted byte-for-byte so Probe 14 and
  16a import one fixture and cannot drift — and
  [`productionPrompt.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/productionPrompt.ts)
  — 16a's table profiling and FK edge set, extracted so 16b's control arm reproduces 16a's prompt
  structurally rather than by copy (verified byte-identical across the extraction). Folder
  [`README.md`](../../../../../eval/claude/16-light-model-sql-ceiling/README.md) documents how to run
  the browser harnesses (Probes 3/4/5/9/12); the Ollama scripts need `ollama serve` running and
  the model pulled, no browser or HTTP server required.
- Real code change: [`toolLadder.ts:65`](../../../../../src/services/toolLadder.ts) fence-regex fix
  (see "Fix landed as a byproduct" above).

## Verdict

_Updated 2026-08-07 after Probe 9. Still not a formal candidate decision — that's a product call,
not this doc's to make — but every technical caveat this document has carried is now resolved for
one specific model on the real shipped architecture._
What's established: (a) the SQL-correctness ceiling is real and reproducible, and it is
capacity-shaped rather than a blanket property of "small local models" — `Qwen3-1.7B` clears every
join/grain question in this document stably (Probe 7, 24/24 across 3 repeats), `Qwen2.5-Coder-0.5B`
clears none of them stably (Probe 8, 12/24, same 4 questions failing all 3 runs every time); (b)
schema shape (join count/grain) still measurably moves correctness, but Probes 7/8 show model
capacity now moves it further, on the identical fixture; (c) one concrete, cheap harness bug
(`extractSql()`'s fence regex) is fixed and shared across all probe scripts; (d) an
execution-retry rung — flagged as an open item earlier in this doc — turned out to already be
shipped, tested, and working (`toolLadder.ts`, `webllmProvider.ts`, `webllmProvider.test.ts`); no
new code was needed there, only a correction to this doc.

**Update (2026-08-07): the Ollama-proxy caveat is resolved for the flat schema.** Probe 5 ran
`Qwen3-1.7B-q4f16_1-MLC` on the real MLC/WebGPU build and scored 8/8 execution-verified correct,
matching Probe 7's Ollama read on the easy fixture. What's now established across the real build:
(e) the model itself produces correct SQL reliably once two harness gaps are closed — `<think>`
chain-of-thought stripped before extraction (Qwen3 is the first reasoning model in this document's
matrix; `toolLadder.ts` has never needed this and doesn't need it today, since the current pin
isn't a reasoning model), and enough `max_tokens` headroom (512 truncated 2/8 responses mid-thought;
2048 did not); (f) the download itself is measurably more failure-prone than the current pin's —
not a CORS/config issue (verified directly against the CDN), just a ~50%-bigger transfer with more
exposure to transient connection drops, worth a real retry-loop fix in `webllm.ts` (not just the
probe harness) before this ships, independent of the SQL-correctness question.

**Update (2026-08-07, same day): Probe 9 closed the remaining gap — 8/8 on the 4-table schema, on
the real WebGPU build.** `Qwen3-1.7B-q4f16_1-MLC` cleared all 8 questions, including both documented
failure classes: the grain bug ("average order value" — collapsing the join's fan-out to per-order
totals before averaging) and the join+`GROUP BY` hallucination ("category with most revenue" — the
exact question every other model in this document, including Nano and the current pin's own Probe 1
read, has gotten wrong). This is no longer a proxy result — every technical caveat this document
carried since Probe 1 (Ollama-quantization-as-proxy, flat-schema-only) is now resolved for this
model. Latency was materially higher than the flat schema (39–88s per question vs. 10–24s) and
higher than Probe 7's Ollama numbers for the same questions — expected, given more reasoning tokens
for join-heavy questions plus in-browser WebGPU vs. local Ollama, but a real UX cost to weigh
against the correctness gain if this ships, not yet quantified against the current pin. N=1 on this
specific build (Probe 7's N=3 stability was via Ollama, not WebGPU) — see open items above.

**Update (2026-08-07, part 4): every remaining rigor gap is now closed.** Three things happened
in sequence: Probe 10 ran the one-join schema — the step between flat and 4-table that's most
representative of real DataScope datasets — via Ollama, N=3, and found a new-but-narrow failure
(21/24: `Qwen3-1.7B` clears every join-reasoning question but trips on an unqualified-column
binder error on one question where the join added nothing). Probe 11 asked "how do we fix this"
literally, by replaying the shipped ladder's exact retry shape against that failure — no new
product code was needed; `toolLadder.ts`'s existing execution-retry rung, already shipped, already
tested, made the model self-correct 3/3. Probe 12 then re-ran the one-join schema on the real
WebGPU build at N=3 and got 24/24 — the failure didn't even recur, independent of the retry path.
In parallel, `4table-webllm-probe.html` was re-run at N=3 on the real build: 24/24, matching Probe
7's Ollama read exactly.

**Net effect:** every fixture this document has built (flat, one-join, 4-table) now has an N≥3
execution-verified clean result for `Qwen3-1.7B-q4f16_1-MLC` on the real shipped MLC/WebGPU
architecture, not a proxy. The one bug this rigor pass surfaced that the earlier N=1 runs missed
(one-join's column-ambiguity case) turned out to be already self-healing via code that shipped
before this document existed. What remains genuinely open is unchanged from before this pass: the
grain-error class (wrong-but-executing SQL, nothing for the retry to trigger on — still a real,
unfixed gap), and the latency-vs-correctness product tradeoff (12–88s/question) — not technical
unknowns anymore, just open decisions.

**Update (2026-08-07, part 5): Probe 13 closes item 7 and answers "is there a cheaper option than
1.7B."** The current 1.5B pin, tested at the same rigor as everything else for the first time,
turns out to already clear two of the three fixtures stably (flat 24/24, one-join 24/24) and only
fails the two hard 4-table questions this document has always used to define the ceiling
(aggregate-in-`WHERE`, averaging grain) — it is not broken across the board, it is exactly as
capacity-limited as the doc's model predicts for something under 1.7B. `Qwen3-0.6B`, tried as a
no-download-increase alternative, is **not** a safe substitute as tested: it stalled indefinitely
on the hardest 4-table question rather than answering it, a reasoning-model/unbounded-generation
gap this document already knows how to fix (Probe 5's `max_tokens: 2048`) but that fix was never
applied here, so this result is a reliability gap, not a correctness verdict, on 0.6B.

**Update (2026-08-07, part 6): the clean sweep is over — Probe 14 finds the first fixture
`Qwen3-1.7B` doesn't clear.** Every fixture through Probe 13 (flat, one-join, 4-table) had scored
24/24 for this model at N≥3. Probe 14 tested a different axis than any prior probe — two or three
aggregation levels stacked instead of more joins, on the same 4-table schema/data as Probes 7/8/13
— and scored **15/24, stable across 3 repeats**: the same 3 of 8 questions fail, byte-identical SQL
and error every run. This is not the grain-error class the doc originally worried about (silently
wrong, nothing for a retry to catch) — every failure is a hard DuckDB execution error, and the
underlying double/triple-hop aggregation logic is shaped correctly in every failing query. What
breaks is identifier hygiene under added structural complexity: one hallucinated/typo'd table alias
(`product` for `products`, a new sub-shape of the doc's column-misattribution class), and two
recurrences of Probe 10's exact ambiguous-`customer_id`-after-a-join bug. Probe 11 already showed
the shipped retry rung recovers that ambiguous-column error 3/3 for this model, so two of the three
failures are plausibly already self-healing in the real ladder — untested directly here, since this
probe calls the model outside the retry-capable provider, same as Probes 6–10/13. **Net: the
capacity ceiling this document has tracked since Probe 7 is not "1.7B can't do nested aggregation"
— it's the same two known weak spots (identifier typos, join-column ambiguity) getting more surface
area to fire on as query structure grows, largely still error-shaped and therefore still
retry-catchable.** Still open: whether this holds on the real WebGPU build (untested for this
fixture), and whether the retry rung actually closes these three specific failures (plausible from
Probe 11, not directly confirmed).

**Update (2026-08-07, part 7): Probe 15 tested it, and part 6's "plausibly already self-healing"
call was wrong for two of the three failures — a correction, not a supplement.** The retry rung
recovers the hallucinated-table-alias case cleanly (3/3), exactly like Probe 11's case. It does
**not** recover either ambiguous-`customer_id` case (0/3 each, fully stable) — the model doesn't
produce a wrong retry, it produces no retry at all, exhausting its token budget in a repetitive,
non-convergent chain-of-thought instead of emitting corrected SQL. This was checked at double the
usual token budget too (4096 vs. Probe 5's 2048 default), specifically to rule out "it would
converge given more room": it didn't, `done_reason` was still `"length"`, and the reasoning trace
shows the model explicitly stuck and looping through to the new, larger ceiling rather than
trending toward an answer late. **Net effect on the doc's model of the retry rung:** an execution
error being retry-*catchable* (the DuckDB error is real and gets fed back) is not the same property
as being retry-*recoverable* — Probe 11 showed the identical error class recovers when the fix is
one join away from the ambiguity; Probe 15 shows it does not reliably recover when the same fix is
buried inside a subquery nested in a multi-table join, even though nothing about the *error text*
changed. This narrows what "the retry rung already handles it" can be claimed for going forward:
true for simple structural contexts, unconfirmed and now actively counter-evidenced for complex
ones. Separately, Probe 15 surfaced a real, specific product-code finding while checking this:
[`webllmProvider.ts:76`](../../../../../src/services/webllmProvider.ts) hardcodes `maxTokens: 256` on
every rung, which is a non-issue for the non-reasoning 1.5B pin shipping today but would need to
rise to at least 2048 (mirroring Probe 5/9/12, not just the `<think>`-stripping fix Probe 5 already
flagged) before any reasoning-model candidate from this document could be promoted to that pin
without immediately reproducing Probe 15's silent-truncation failure mode.

**Update (2026-08-07, part 8): every result above was measured against a prompt the app does not
send — and the real one is worse.** Sub-experiment [16a](16a-production-prompt.md) re-ran Probe
14's fixture with the only change being the schema block: production's `pruneSchema()` output
(row counts, classifier semantic types, an inferred `Relationships:` block) in place of the
hand-written `Tables:` DDL every probe here has used. **12/24 versus Probe 14's 15/24**, stable at
N=3, on a byte-identical fixture now shared by both scripts. Three consequences for this
document's model of the ceiling:

1. **The ceiling is not an artifact of underfeeding.** This was the cheap way that Probes 1–15
   could have been invalidated, and it isn't — if anything they were measured under favourable
   conditions. The remaining sub-experiments keep their premise.
2. **"More structure" is not monotonic.** Richer schema description made this model *worse* at the
   schema. The `Relationships:` block did not fix the ambiguous-`customer_id` bug Probe 15 proved
   unrecoverable by retry — that bug simply moved to a different question.
3. **A shipped, provider-independent prompt defect surfaced.**
   [`classifier.ts`](../../../../../src/lib/classifier.ts)'s `IDENTIFIER_UNIQUE_RATIO` fires on
   `products.price` (40 distinct values over 40 rows), so production tells the model its measure
   column is an `Identifier` — the same label as every key column in the block. Three of 16a's
   four failures misplace `price` (`order_items.price`, an unbound `p.price`, an invented
   `oi.product_price`), where Probe 14 on the bare block reached `products.price` correctly and
   failed only by typo'ing the table name. `pruneSchema` is provider-independent, so the cloud
   router's prompt carries the same defect; whether it matters at cloud-model capacity is
   untested. Confirming or clearing the causal link is the re-scoped 16b.

**Update (2026-08-07, part 9): 16b confirmed the causal link and then overshot it — the labels are
not miscalibrated, they are net-harmful.** Three arms on Probe 14's fixture, one variable (the
rendered semantic-type label), everything else held from 16a, N=3. On the 7 questions every arm
could answer: shipped labels **9/21**, five labels hand-corrected **12/21**, labels removed
entirely **15/21** — monotonic in three-point steps. Over the full set `stripped` scores **18/24**,
the best result any prompt has produced on this fixture, beating Probe 14's bare block (15/24)
while carrying strictly *more* context than it (row counts and `Relationships:` are present in all
three arms; only the label varies). What this changes in this document's model of the ceiling:

1. **16a's price hypothesis is confirmed, and bounded.** Correcting `products.price` to
   `Quantitative` eliminated two of 16a's three price-misplacement failures — the model now writes
   `SUM(products.price * order_items.quantity)`, right table, right measure — and cleared "highest
   total per customer" 3/3, a question that had failed in *both* Probe 14 and 16a and that nothing
   else in this document has moved. It did not clear the west-region question, which still reaches
   for `order_items.price`. The label is a substantial cause of the price confusion, not the whole
   of it.
2. **The shipped defect is the prompt design, not only the classifier threshold.** A corrected
   classifier recovers half the gap; the other half is only available by not sending the labels at
   all. These are two separable changes (open items 17a/17b) and this experiment supports the
   second directly and the first only indirectly.
3. **The ceiling is now almost entirely one reasoning failure plus a pile of clerical ones.** After
   stripping the labels, exactly one question fails by returning a *wrong number* rather than an
   error — the triple-hop average-of-averages, which computes `SUM(price*qty)/COUNT(*)` at item
   grain in every arm and returns 272.9 against a gold of 818.7. Every other failure on the board,
   across every probe and every arm, is identifier hygiene. That asymmetry is the argument for the
   unlettered **16e** direction in the sub-experiment index: a model that emits a validated spec and
   lets the host compile the SQL cannot commit a clerical error at all, and the app already has the
   vocabulary (`operations.ts`'s `aggregate` / `sum_product`) but does not offer it to this model
   (`toolLadder.ts`'s rungs are `sql | continue-or-answer | answer`).
4. **Two new open items that are not results.** The `stripped` arm's one regression came from the
   `Relationships:` block inviting an unnecessary join (item 15), and the `corrected` arm has a
   question that deterministically kills the Ollama call rather than answering it (item 18) —
   diagnosed but not resolved, and the first thing to pick up next session.
