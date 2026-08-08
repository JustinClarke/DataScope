# 16b — Are production's semantic-type labels net-harmful?

Sub-experiment of [`16-light-model-sql-ceiling`](README.md), and a direct follow-on from
[16a](16a-production-prompt.md). Re-scoped by 16a's result: it was planned as a join-fan-out
annotation test, and 16a surfaced a more urgent question ahead of it.

**Status (2026-08-07): run, N=3, three arms.** Result and analysis below.

---

## The question

16a served Probe 14's fixture through production's real `pruneSchema` prompt and scored **12/24**,
below Probe 14's 15/24 on the bare hand-written block. Three of its four failures misplace `price`
— `order_items.price`, an unbound `p.price`, an invented `oi.product_price` — and the prompt it was
served labels `products.price` as **`Identifier`**, the same semantic type it gives `product_id`,
`order_id` and `name`.

That was a hypothesis, not a finding. 16a changed three things at once: it added row counts, it
added a `Relationships:` block, and it added a semantic-type label to every column. This
sub-experiment isolates the labels.

Three questions, in order of what each would license:

1. Do the *wrong* labels hurt? (Fix the five bad ones; does the score move?)
2. Do labels *as such* hurt? (Remove them; does the score move further?)
3. If both, is the shipped classifier the bug, or is the shipped *prompt design* the bug?

## Protocol

Exactly one thing varies across arms: the rendered semantic-type label. Same fixture, same seed
data, same 8 questions, same gold SQL, same model (`qwen3:1.7b`), same temperature (0), same
`SQL_INSTRUCTION`, same extraction regex, same execution-against-ground-truth scoring, N=3.

| Arm | Prompt | Purpose |
| :--- | :--- | :--- |
| `as-is` | production's classifier output, untouched | control — must reproduce 16a's 12/24 |
| `corrected` | five labels hand-fixed (below) | separates "wrong labels hurt" from "labels hurt" |
| `stripped` | semantic type removed: `  - price (BIGINT)` | isolates the labels as the variable |

Row counts and the `Relationships:` block are present in **all three** arms. `stripped` is
therefore *not* a return to Probe 14's bare block — it carries strictly more context than Probe 14
did, and differs from `as-is` only in the label.

### The five corrections

Deliberately minimal: only columns whose production label contradicts the column's role in the gold
SQL. `customers.name` / `products.name` are left as `Identifier` — arguably `Textual`, but they do
identify a row and no gold query aggregates them, so changing them would add a confound.

| Column | Production label | Corrected to | Why production is wrong |
| :--- | :--- | :--- | :--- |
| `products.price` | `Identifier` | `Quantitative` | 40 distinct over 40 rows trips `IDENTIFIER_UNIQUE_RATIO` (0.95); it is the multiplicand of every revenue question |
| `order_items.quantity` | `Categorical` | `Quantitative` | 5 distinct lands under `CATEGORICAL_CARDINALITY_MAX` (15); it is the other multiplicand |
| `orders.customer_id` | `Quantitative` | `Identifier` | numeric FK above the categorical cap reads as a measure to average |
| `order_items.order_id` | `Quantitative` | `Identifier` | as above |
| `order_items.product_id` | `Quantitative` | `Identifier` | as above |

### Comparability guards

Three, because 16a was expensive to interpret and the arms here differ by one rendered word:

- **The control is structurally identical to 16a, not a copy of it.** 16a's table profiling and FK
  edge set were extracted into
  [`productionPrompt.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/productionPrompt.ts)
  and are now imported by both scripts. Verified: 16a's built prompt is byte-identical before and
  after the extraction, and the `as-is` arm reproduces it exactly.
- **Pruning is asserted equal across arms.** `pruneSchema` selects tables by name mention and FK
  adjacency, never by semantic type, so all three arms must see the identical table set per
  question. The script asserts this rather than relying on a reading of the code.
- **`stripLabels` fails loudly.** It throws if its regex matches nothing (i.e. `renderColumn`'s
  format changed) or if any labelled column line survives, rather than silently passing labels
  through.

## Result

**Stripping the labels scores highest — and beats the bare block that Probes 1–15 used.**

| Question | Hops | Probe 14 (bare block) | `as-is` | `corrected` | `stripped` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Total customers | 0 (control) | 3/3 | 3/3 | 3/3 | 3/3 |
| Average order value | 1 (control) | 3/3 | 3/3 | 3/3 | 3/3 |
| Average total spent per customer | 2 | 3/3 | 0/3 | 0/3 | **3/3** |
| Average orders per customer | 2 | 3/3 | 3/3 | **n/a — see below** | 3/3 |
| Highest total any single customer has spent | 2 | 0/3 | 0/3 | **3/3** | **3/3** |
| Average distinct products per order | 2 | 3/3 | 3/3 | 3/3 | **0/3** |
| Average total spent per customer, west region only | 2 + filter | 0/3 | 0/3 | 0/3 | **3/3** |
| Average of each customer's average order value | 3 | 0/3 | 0/3 | 0/3 | 0/3 |
| **Total, all 8** | | **15/24** | **12/24** | *(1 unscorable)* | **18/24** |
| **Total, common 7** | | 12/21 | **9/21** | **12/21** | **15/21** |

Every scorable cell is stable across its 3 repeats — no arm produced a flaky question.

**The `corrected` arm has one unscorable question.** "Average orders per customer" returns
`TypeError: fetch failed` — the Ollama call itself does not complete, so the model never answers.
This is *not* noise: it reproduced on all 3 repeats of the first pass and again on a full
independent re-run of the arm, 6 attempts in total, always the same question, while the questions
either side of it complete normally. The arm is therefore scored over its 7 answerable questions.
See "The `corrected` arm's dead question" below — it is treated here as an open finding, not as a
result to be averaged away.

### Answering the three questions

On the 7 questions every arm could answer, the three arms are **monotonic in exactly three-point
steps: 9 → 12 → 15 out of 21.** Each step removes one layer of label misinformation and buys the
same amount back.

1. **Wrong labels hurt: yes, and measurably.** Correcting five labels moved 9/21 → 12/21. It
   cleared "highest total per customer" 3/3 — a question that had failed 0/3 in *both* Probe 14 and
   16a, and that nothing else tried in this document has moved — and eliminated two of 16a's three
   price-misplacement failures.
2. **Labels as such hurt, by the same margin again.** Removing them entirely moved 12/21 → 15/21,
   reaching 18/24 over the full set: three points above Probe 14's bare block while carrying *more*
   context than Probe 14 did (row counts and relationships are still present), and six above
   production's own prompt.
3. **So the shipped defect is the prompt design, not only the classifier threshold.** Fixing the
   classifier buys back half the gap; the other half is only available by not sending the labels at
   all. A corrected classifier would still leave three points on the table.

### The price hypothesis, confirmed and bounded

16a's leading candidate holds up. Under `as-is` the model reaches for a price column that does not
exist, three different ways. Under `corrected`, two of those three are gone: the "average total
spent per customer" query now writes `SUM(products.price * order_items.quantity)` — right table,
right measure — and fails on something else entirely (see below). Under `stripped`, every
price-misplacement failure is gone.

The bound: correcting `price` did **not** clear the west-region question, which still reaches for
`order_items.price`. So the label is a substantial cause of the price confusion, not the whole of
it.

### What stripping the labels cost

One regression, and it is informative. "Average distinct products per order" — which passed in
Probe 14, `as-is` and `corrected` — fails 0/3 under `stripped`, because the model adds a join to
`products` the question does not need and then trips over `Ambiguous reference to column name
"product_id"`.

Note where that join comes from. `stripped` still carries the `Relationships:` block, which states
`order_items.product_id → products.product_id` unconditionally. That is 16a's secondary
hypothesis — the relationships block reading as an invitation to join rather than a fact about how
to join *if* you need to — surfacing on its own, with the labels out of the way. It is untested,
and it is a candidate arm for a follow-up.

### The `corrected` arm's dead question

"On average, how many orders has each customer placed?" — the *simplest* double-hop question in the
set, and one that passes 3/3 in every other arm and in Probe 14 — kills the Ollama call outright
under the corrected labels. Not a wrong answer, not a binder error: `TypeError: fetch failed`, the
HTTP request never returning.

It is deterministic. Six attempts across two independently-launched runs of the arm, always this
question, never any other, with the questions before and after it completing normally in the same
process. That rules out load and rules out a dead server.

What is different about this question under this arm: it is the only question whose gold answer
needs *no* join and no measure column, and the corrected arm is the only one that labels
`orders.customer_id` as `Identifier` rather than `Quantitative`. A model told that the only column
it needs is an identifier — a type whose whole meaning is "not an analysis dimension" — has been
given a prompt that argues against the answer. Probe 15 documented what this model does when its
prompt argues against the answer: a non-convergent reasoning loop that exhausts the token budget
without emitting SQL. This harness sets no `num_predict`, so an unbounded version of that loop is
consistent with what is observed.

That is a hypothesis with one supporting precedent, not a finding. It is not established that the
call dies for that reason rather than an Ollama-side fault, and the distinction matters: the first
would be a real property of over-tight identifier labelling, the second a harness artifact. The
diagnostic is cheap — reproduce the single call with `num_predict` set and `done_reason` surfaced,
exactly the instrumentation Probe 15 added to `ollamaNestedGrainRetryProbe.ts` — and it is the
first thing the next session should do.

Two things follow regardless of which way it resolves. It does not disturb the arm comparison,
because the question is excluded from all three arms' scorable totals. And it is the second time in
this document that a *correct-looking* prompt change has produced a hang rather than a wrong
answer, which is worth carrying into any decision about shipping a reasoning model.

### The one failure no arm touches

"Average of each customer's average order value" fails 0/3 in all four columns above, and it is the
only question in the set that fails by returning a **wrong number** rather than a hard error. Under
both `corrected` and `stripped` the model writes `SUM(p.price * oi.quantity) / COUNT(*)` grouped by
customer — averaging at item grain instead of averaging per-order totals — and returns
272.9 against a gold of 818.7.

This is the document's only genuine grain-reasoning failure that survives every intervention tried
so far. Everything else on the board is identifier hygiene.

## What this settles, and what it doesn't

**Settles that the semantic-type labels are net-harmful on this path.** Not "miscalibrated" —
net-harmful. The best score comes from removing them, and that holds against both the shipped
labels and a hand-corrected version of them.

**Settles that the `IDENTIFIER_UNIQUE_RATIO` misfire is real but is not the whole defect.** Fixing
it (and four other labels) recovers 3 of the 6 points that separate `as-is` from `stripped`.

**Raises the shipped-code question properly.** `pruneSchema` is provider-independent — it builds
the same block for the cloud router. Two separable changes are now on the table, and they should
not be conflated: (a) tighten the classifier's identifier heuristic, which affects every consumer
of `semanticType`, not just this prompt; (b) stop rendering `semanticType` into the NL→SQL schema
prompt, which affects only this prompt. This experiment supports (b) directly and (a) only
indirectly.

**Does not settle whether this generalises.** One fixture, one model, N=3, Ollama rather than the
shipped MLC/WebGPU build. In particular the flat, one-join and plain 4-table fixtures all score
24/24 with the bare block, so they cannot show a gain from stripping — only a regression, if there
is one, and that is untested.

**Does not settle the `Relationships:` block's effect**, which the `stripped` regression now makes
worth isolating on its own.

**Does not touch the grain failure**, which needs composition rather than a better prompt — the
territory 16d was already opened for.

## Caveats

- **N=3**, the parent document's standard: stable across 3 repeats, not proof against rarer modes.
- **Ollama, not the MLC/WebGPU build** — the standing caveat on every Ollama probe here. All arms
  and the Probe 14 baseline carry it identically, so the comparison is sound even though no arm is
  the shipped build.
- **FK edges are hand-supplied, not inference-derived** — inherited from 16a via the shared module,
  and generous to production in the same way: it assumes inference recovers every edge.
- **`stripped` is not Probe 14's prompt.** It removes labels from production's block; it does not
  restore the hand-written `Tables:` DDL. The two differ in row counts, relationships and format,
  so "18/24 beats 15/24" says stripping labels beats the bare block, not that format is irrelevant.
- **The `corrected` arm's labels are the author's judgement**, not an oracle. They are defensible
  against the gold SQL, but a different reasonable labelling might score differently.
- **The `corrected` arm is scored over 7 questions, not 8**, for the reason given above. The
  three-point ladder is stated on that common 7 so all arms are measured on the same set; the
  per-question table also reports each arm's raw cells over all 8. The excluded question passes
  3/3 in both other arms, so excluding it costs `as-is` and `stripped` three points each and does
  not favour either.

Harness:
[`16bLabelAblationProbe.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/16bLabelAblationProbe.ts),
run via `npx tsx eval/claude/16-light-model-sql-ceiling/16bLabelAblationProbe.ts [model] [repeats]`.
`--print-prompts` dumps each arm's prompt without calling the model; `--arms=as-is,corrected`
restricts the run.
