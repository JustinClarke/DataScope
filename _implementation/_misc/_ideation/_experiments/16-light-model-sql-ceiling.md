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

**Relation to this folder's other experiments.** 01–13 (see [`README.md`](README.md)) attack
dataset-*narration* fabrication (F1–F3) under the ADR-010 synthesis seam — a different mechanism
and a different rubric. This experiment is closer in spirit to 13/14/15: it asks how much a small
local model can be trusted, scoped down to one concrete mechanism —
[`src/services/toolLadder.ts`](../../../../src/services/toolLadder.ts)'s NL-question-to-SQL step in
the in-browser analyst loop. It does not use the README's seven-dimension rubric (R1–R7) or the
F1–F4 fixture set; those are specific to the narration-fabrication problem. The one invariant this
experiment does borrow is **F4's spirit**: a single passing run certifies nothing, and every result
below is flagged as single-pass for exactly that reason.

---

## Background

`src/services/webllm.ts` pins the in-browser WebLLM model to
`Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC` (~830MB), chosen to fit alongside DuckDB-WASM in browser
memory. Two hard constraints on any replacement: ≤1.5GB download, and it must actually exist in
`@mlc-ai/web-llm`'s prebuilt model list — only MLC-converted quantized models run in WebLLM.

This model does not reliably emit native structured `tool_calls`. `toolLadder.ts` works around that
with a deterministic prose ladder ([`src/services/toolLadder.ts`](../../../../src/services/toolLadder.ts)):
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
[`toolLadder.ts:65`](../../../../src/services/toolLadder.ts):

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
([`src/workers/duckdb.worker.ts`](../../../../src/workers/duckdb.worker.ts)); they're artifacts of
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

Harness: [`flat-schema-webllm-probe.html`](../../../../eval/claude/16-light-model-sql-ceiling/flat-schema-webllm-probe.html),
run via a real WebGPU Chrome tab per the folder's [`README.md`](../../../../eval/claude/16-light-model-sql-ceiling/README.md).

## Probe 6 — Qwen3-1.7B over Ollama, flat schema, real execution

Motivation: get a real-execution read on `Qwen3-1.7B` quickly, without waiting on a browser run —
Ollama serves as the same kind of proxy Probe 1 used, with the caveat restated there: same base
weights, different quantization scheme than MLC's `q4f16_1`. Unlike Probe 1, this one actually
executes the generated SQL and checks it against ground truth, using the headless Node DuckDB
engine already built for the D40 eval harness
([`eval/duckdb/duckdb.ts`](../../../../eval/duckdb/duckdb.ts)) rather than a syntactic check.

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

Harness: [`ollamaFlatSchemaProbe.ts`](../../../../eval/claude/16-light-model-sql-ceiling/ollamaFlatSchemaProbe.ts),
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

Harness: [`ollama4TableProbe.ts`](../../../../eval/claude/16-light-model-sql-ceiling/ollama4TableProbe.ts),
run via `npx tsx eval/claude/16-light-model-sql-ceiling/ollama4TableProbe.ts qwen3:1.7b 3`. Shares
extraction/matching/repeat-loop code with Probe 6 via a new
[`probeShared.ts`](../../../../eval/claude/16-light-model-sql-ceiling/probeShared.ts), which also
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

Harness: [`4table-webllm-probe.html`](../../../../eval/claude/16-light-model-sql-ceiling/4table-webllm-probe.html).

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
   [`toolLadder.ts`](../../../../src/services/toolLadder.ts)'s `ladderRung()` already returns to
   the `sql` rung whenever the last tool outcome is `'error'` (line ~108), and
   [`webllmProvider.ts`](../../../../src/services/webllmProvider.ts)'s `toChatMessages()` already
   feeds the DuckDB error text back verbatim as `"Result of running that SQL:\n${...}"` (line ~41)
   — so the model sees the real error on the retry prompt, not just a generic "try again." It's
   bounded by the turn's overall `MAX_PROVIDER_CALLS` cap (`ai.ts:87`, 24), not a separate budget,
   and it's already covered by a test:
   [`webllmProvider.test.ts:134`](../../../../src/services/webllmProvider.test.ts) — "asks for
   corrected SQL after an error envelope, not an answer." Probe 8 gives this a fresh reason to
   matter: all 4 of `Qwen2.5-Coder-0.5B`'s 4-table failures are DuckDB execution errors (unlike the
   grain class), so the shipped retry rung has something to trigger on for exactly that model —
   whether it actually recovers on the second attempt is untested here and would need a probe that
   runs the *provider*, not just single-shot Ollama calls, to observe.
4. **One-join ceiling test.** Still open. Real DataScope datasets won't be pre-flattened the way
   Probe 4's fixture was, and Probes 7/8 jumped straight to 4 tables. Step from zero joins to
   exactly one join (2 tables) to find the actual breakpoint between "flat" (8/8 for every model
   tested so far except one Nano miss) and "4-table" (now bimodal by model size per Probes 7/8) —
   the number that matters most for real uploaded datasets, which are rarely fully denormalized but
   also rarely 4-way-joined for a single question.
5. ~~`Qwen2.5-Coder-0.5B-Instruct`~~ **Done — Probe 8.** 8/8 flat, stable 12/24 on 4-table (exactly
   the 4 join questions fail every run). Confirms the capacity-ceiling read, doesn't move the
   candidate decision on its own — the current 1.5B pin sits between 0.5B and 1.7B untested at this
   rigor (Probe 1's read on the 1.5B pin was syntactic-only).
6. **N>1 repeats.** Partially resolved for the Ollama-proxy probes: Probes 7 and 8 both ran N=3 and
   came back fully stable (no flaky questions in either), which is meaningfully stronger evidence
   than every prior single-pass result in this document. Still open for the browser-native probes
   (3, 4, 5, 9) — Nano, and WebLLM/Qwen3-1.7B on both fixtures, have never been repeat-tested.
   Now the single highest-priority open item: Probe 9 is N=1 on the real build, the only rigor gap
   left between "Qwen3-1.7B clears the ceiling" and "clears it reliably enough to ship."
7. **The current 1.5B pin, real execution.** Every real-execution result in this document (Probes
   4, 6, 7, 8, 9) has tested a *candidate* replacement, never the model actually shipping today.
   Probe 1's read on it was syntactic-only. Worth one real-execution pass on `Qwen2.5-Coder-1.5B`
   via Ollama, if only to have a same-rigor baseline to compare 0.5B/1.7B against instead of
   Probe 1's older, weaker read.
8. ~~4-table WebLLM retest.~~ **Done — Probe 9.** 8/8 on the real MLC/WebGPU build, both documented
   bug classes cleared. New open item this surfaced: per-question latency (12–88s, worst on the
   join+grain questions) is a real UX cost that hasn't been weighed against the correctness gain —
   worth surfacing explicitly if this moves toward a candidate decision, not just a footnote here.

## Artifacts

- Probe 3/4 harnesses: standalone HTML pages built in-session under the scratchpad directory
  (ephemeral, not committed — noted here only so the build notes above are reproducible, not as a
  pointer to a persisted asset).
- Probe 5–9 harnesses: **committed**, under
  [`eval/claude/16-light-model-sql-ceiling/`](../../../../eval/claude/16-light-model-sql-ceiling/):
  `flat-schema-webllm-probe.html` (Probe 5, WebLLM/Qwen3-1.7B, flat schema, 8/8),
  `4table-webllm-probe.html` (Probe 9, WebLLM/Qwen3-1.7B, 4-table schema, 8/8),
  `ollamaFlatSchemaProbe.ts` (Probe 6, flat schema, run against both Qwen3-1.7B and
  Qwen2.5-Coder-0.5B), `ollama4TableProbe.ts` (Probes 7/8, 4-table schema, same two models), and
  `probeShared.ts` (extraction/matching/repeat-loop code shared by the two Ollama scripts,
  factored out when repeats and the 4-table fixture needed the same plumbing). Both Ollama scripts
  take `[model] [repeats]` as CLI args. Folder
  [`README.md`](../../../../eval/claude/16-light-model-sql-ceiling/README.md) documents how to run
  the four browser harnesses (Probes 3/4/5/9); the Ollama scripts need `ollama serve` running and
  the model pulled, no browser or HTTP server required.
- Real code change: [`toolLadder.ts:65`](../../../../src/services/toolLadder.ts) fence-regex fix
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
