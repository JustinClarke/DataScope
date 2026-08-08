# 16e — Can a structured spec express the fixture at all, before any model runs?

Sub-experiment of [`16-light-model-sql-ceiling`](README.md). The premise this document has been
building toward since 16b: if the model emits a validated spec and the host compiles the SQL, the
identifier-hygiene failure class (typo'd tables, ambiguous columns, wrong-but-executable joins)
becomes unrepresentable rather than merely retry-catchable. Before spending a model call on it, this
is the cheap check the README's own next-step note called for: **does the vocabulary the app already
has (`operations.ts`'s `aggregate`) actually cover the fixture's 8 questions, or does it need to
grow first?** Paper exercise only — no model, no execution. Hand-write the spec calls for every
question in [`nestedGrainFixture.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/nestedGrainFixture.ts)
and see where the vocabulary runs out.

**Status (2026-08-07): both gates now checked — the compiler side is clean, the model-emission side**
**fails, 0/8, and not for a reason more steps fixes.** (1) Hand-wrote specs for all 8 fixture
questions against a proposed vocabulary — done, see the table below. (2) Prototyped the two
load-bearing new pieces (`as`, structured `join` with a BFS path resolver) standalone and ran all 8
fixture questions against the real seeded fixture data — all 8 compile to SQL matching gold exactly;
see "Prototype" below. A rejection check caught and fixed a real resolver bug before any model was
involved. (3) Ran `Qwen3-1.7B` against the same compiler/validator through a `STEP:`/`FINAL:` JSON
protocol — **0/8 execution-verified correct, 3/8 first-attempt schema-valid.** The dominant failure
is a stuck loop (a bare, unqualified column reference repeated verbatim across 3-4 retries despite
precise validation-error feedback identifying exactly what's wrong each time), not slow convergence
— see "Model-emission probe" below. This is a sharp contrast with the same model's 24/24 stable via
plain SQL text on this identical fixture (parent README's Probes 7/9/11), which points at the
hand-rolled JSON protocol, not the model's underlying capability, as the bottleneck. Nothing was left
running or half-finished; the next lever is Ollama's native schema-constrained decoding (this model
advertises a `tools` capability), not a bigger step budget.

**Result: today's `aggregate` cannot express 7 of the 8 questions, and not for the reason the README
assumed.** The README's framing was that a spec removes hand-typed identifiers. That's true, but
`aggregate`'s `join`, `where`, `having`, and `order` parameters are raw SQL strings today — see
[`operations.ts:1319-1326`](../../../../../src/lib/analyst/operations.ts#L1319-L1326), where each is
type-checked as `string` and pasted into the query verbatim. A model calling `aggregate` today would
still hand-write the exact join condition that breaks in 16d (`c.customer_id = oi.order_id` passes
straight through — nothing validates a join predicate against the catalog). The real gap is smaller
than "rebuild the operation" but larger than "wire up what's there."

## What actually blocks each question

Working through all 8 by hand, three gaps recur; a fourth turned out not to matter as much as
expected.

**1. No way to persist a step's result without hand-written SQL.** `derive_table`'s only parameter is
`sql: string` ([`operations.ts:106`](../../../../../src/lib/analyst/operations.ts#L106)) — using it to
chain `aggregate` steps means the model writes the connecting SQL by hand, which defeats the point.
**Every question except Q1 (trivial count) needs at least one intermediate table**, so this is the
single most load-bearing gap, not a secondary one. The natural fix is folding it into `aggregate`
itself: an `as: string` parameter that registers the compiled SELECT as a derived view through the
same `ctx.catalog.derive()` path `derive_table` already uses, so the model never writes the
connecting SQL.

**2. `join` needs to become a table list the host resolves, not a string the model writes.** The
codebase already has the data for this — `relationshipInference.ts`'s `FkEdge` (`childTable.childColumn
→ parentTable.parentColumn`, with a confidence tier) is exactly the join graph `pruneSchema.ts` already
renders into the `Relationships:` block. What doesn't exist anywhere in the codebase (checked directly,
no hits) is a path-finder over that edge set. `pruneSchema` only pulls direct neighbors of a mentioned
table one hop out; it never stitches a path. Building `orders → order_items → products` from
`join: ["order_items", "products"]` needs real graph traversal — and **Q7 shows it needs to be a tree,
not a chain**: `orders` is the hub with `order_items→products` off one edge and `customers` off a
second, sibling edge. A linear path-walker isn't enough; the resolver has to build a join DAG rooted at
`from`.

**3. `groupBy`/metric columns need per-column validation and requalification, not `quoteIdentifier`
applied to whatever string arrives.** Today [`operations.ts:1348`](../../../../../src/lib/analyst/operations.ts#L1348)
quotes each `groupBy` entry whole, so `"customers.customer_id"` becomes one literal column name with a
dot in it — not a qualified reference. There's no way to express a qualified column at all today. The
fix is cheap relative to #2: accept `"table.column"`, split it, validate both halves against the
catalog independently, and requote each piece — `"customers"."customer_id"`, not
`"customers.customer_id"`.

**4. `where`/`having` need at least identifier-level validation.** This is the piece that would have
caught 16d's actual failure — `customers.customer_id = order_items.order_id` is syntactically a valid
predicate and semantically nonsense, and no amount of column-quoting catches that, because both sides
resolve to real columns. What a validator *can* catch is a column that doesn't exist or isn't in the
join's scope. A minimal version — parse identifiers out of the predicate string, reject if any doesn't
resolve against `from`+`join` — doesn't need a full expression grammar and closes the class of error
that actually recurs in this document (referencing a column from a table never joined). It would not
have caught 16d's specific bug (both columns are real, just the wrong pairing) — that failure needs the
join resolver in #2 to own the equality condition itself, not the model.

## Working the fixture by hand

Vocabulary sketch used below (design sketch, not implemented): `aggregate` gains `as?: string` to
persist its result; `join?: string[]` becomes a table list instead of a SQL fragment; `groupBy` and
metric `column`/`columns` accept `"table.column"` and the host validates+requalifies each part.

| Q | Hops | Needs beyond today's `aggregate` | New primitive load-bearing? |
| :--- | :--- | :--- | :--- |
| Total customers | 0 | none — already expressible today | — |
| Average order value (control) | 1 | `as`, structured `join` (2-hop chain), qualified `groupBy` | `as`, join resolver |
| Average total spent per customer | 2 | `as` only — step 2's `groupBy: ["customer_id"]` is unambiguous once step 1's output is a fresh derived table with one `customer_id` column | `as` |
| Average orders per customer | 2 | `as` only — no join needed at all (`customer_id` lives on `orders` alone) | `as` |
| Highest total per customer | 1 | same as "average order value" | `as`, join resolver |
| Average distinct products per order | 1 | `as` only — no join, groupBy on `order_items.order_id` alone | `as` |
| West-region average spend | 1 + filter | `as`, tree-shaped `join` (3 tables off one hub), validated `where` | `as`, join resolver (tree), where-validator |
| Triple-hop average-of-averages | 3 | same as "average order value", one more chained step | `as`, join resolver |

**The pattern that fell out and wasn't obvious going in: composing through `as`-derived tables kills
the qualification problem for every step after the first join.** Once step 1 registers `order_totals`
as its own table with one `customer_id` column, step 2's `groupBy: ["customer_id"]` has nothing to be
ambiguous against — the derived table has a clean, single-table namespace. The ambiguous-`customer_id`
bug this document has hit four separate times (Probes 10, 14×2, and 16d) is a property of writing one
big nested query against the *original* schema, not of multi-hop aggregation itself. A compositional
spec sidesteps most of its own hardest bug just by being compositional — that's a stronger argument for
16e than the README's original framing (host qualifies names) on its own.

**What this does not fix.** The one genuine reasoning failure in this document — Q8's
average-of-averages, which every prompt arm gets wrong by aggregating at the wrong grain (272.9 vs.
gold 818.7) — requires choosing the right 3-step decomposition (group by order, average per customer,
average those). A structured spec makes every step in that plan execute correctly once chosen; it does
not choose the plan. This confirms rather than assumes the README's own caveat ("this would not fix
the grain failure below, which needs composition") — now checked against the actual 8 questions rather
than stated in general terms.

## Net

The vocabulary gap is real but narrow: one new parameter (`as`, load-bearing for 7 of 8 questions),
one genuinely new subsystem (a join-path resolver over the existing `FkEdge` graph, which must handle
branching, not just chains), and one cheap validation pass (qualified-column parsing, already half-done
by existing `quoteIdentifier`/catalog-lookup machinery). No question in the fixture needs a shape
outside this vocabulary. Building the resolver is the one piece that isn't a small edit — everything
else is close to what `operations.ts` already has patterns for (`unknownTable`'s nearest-name lookup,
`quoteIdentifier`, catalog validation in `aggregate` itself).

**What this doesn't test, and was flagged in the README as the other open risk:** whether a 1.7B
reasoning model emits schema-valid structured calls reliably, and whether `<think>` chains interact
badly with constrained/tool-call decoding. That's a model question, not a vocabulary question, and
this exercise deliberately didn't touch it — it answers "is there something to build" before spending a
run on "does the model use it correctly." **Update: this gate has now been run — see "Model-emission
probe" below. Result: 0/8. Both gates have now been checked; the vocabulary gate passed, the
model-emission gate failed.**

**Next step, in order:** (1) prototype `as` + structured `join`/`groupBy` against the fixture and
confirm the compiled SQL matches gold by hand — done: first against the two smallest slices that
exercise the join resolver's tree case (Q2, Q7), then widened to all 8; (2) probe whether the model
can emit the call shape at all — **done, see below, 0/8.**

---

## Prototype — step (1) run, all 8 questions match gold

[`16eStructuredSpecPrototype.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/16eStructuredSpecPrototype.ts)
implements the sketch above standalone (not a change to `operations.ts`): the BFS join-path resolver
over a hand-supplied `Edge[]` (the fixture's true FKs — `relationshipInference.ts`'s actual inference
is a separate, already-shipped subsystem, deliberately out of scope here so this isolates the
resolver/compiler logic under test), a `qualifyColumn` validator that splits and requalifies
`"table.column"` against an in-scope schema map, and a compiler that persists a step's result as a
real DuckDB view (`as`) so a second `aggregate` call can chain off it. Run against the real seeded
fixture data via `eval/duckdb/duckdb.ts`, not mocked.

Run first against the two smallest slices that exercise the join resolver's tree case (Q2, Q7), then
widened to the remaining six (the 2- and 3-hop chains, the no-join cases, and the 1-hop+`MAX`
variant) in the same run, same harness, no code changes to the resolver/compiler/validator.

**All 8 questions compile to correct SQL and match gold exactly, byte-exact to what
`nestedGrainFixture.ts`'s gold queries return:**

| Q | Shape | Compiled answer | Gold |
| :--- | :--- | :--- | :--- |
| Q1 | 0-hop, no join, no `as` | 30 | 30 |
| Q2 | 1-hop chain, `as` | 818.74 | 818.74 |
| Q3 | 2-hop chain (two `as` steps) | 13645.666... | 13645.666... |
| Q4 | 2-hop, no join | 16.666... | 16.666... |
| Q5 | 1-hop chain, `MAX` instead of `AVG` | 30155 | 30155 |
| Q6 | 1-hop, no join, `count_distinct` | 2 | 2 |
| Q7 | 1-hop + filter, tree join | 12887.71... | 12887.71... |
| Q8 | 3-hop chain (two `as` steps) | 818.71568... | 818.71568... |

Q3 and Q8 are the first cases to chain three steps (two `as`-persisted intermediate views), and Q8 in
particular reruns the exact 3-hop shape that every model-driven probe in this document has failed at
the reasoning level (Probes 1–16d, the average-of-averages question) — here the decomposition is
hand-chosen, not model-chosen, so this only confirms the *compiler* gets the shape right once given
the right plan; see "What this does not fix" above, unchanged. Compiled Q2:

```sql
-- step 1, as: order_totals_q2
SELECT "orders"."order_id", SUM("order_items"."quantity" * "products"."price") AS "total"
FROM "orders" JOIN "order_items" ON "order_items"."order_id" = "orders"."order_id"
              JOIN "products" ON "order_items"."product_id" = "products"."product_id"
GROUP BY 1
-- step 2
SELECT AVG("order_totals_q2"."total") AS "answer" FROM "order_totals_q2"
```

Q7's tree case (`orders` as hub, `order_items→products` off one edge, `customers` off a sibling
edge, plus the `where` filter) compiled and matched gold on the first correct run of the resolver —
confirming the design note's claim that a linear chain-walker isn't enough, a tree-shaped resolver is
needed, and that a BFS over the edge set (not a single linear path search) handles it without special
casing.

**A real bug surfaced by the rejection checks, not by Q2/Q7 themselves.** Both target questions only
ever request tables that sit on a direct path from `from`, so they didn't exercise the case where a
*wanted* table is reachable only *through* an *unrequested* one. A rejection check for
`resolveJoinPath('customers', ['order_items'], EDGES)` — expected to have no path, since there's no
direct FK between them — instead found a real transitive path through `orders` (`customers ← orders →
order_items`). The first implementation resolved the path correctly but only emitted join steps for
*explicitly requested* tables, silently dropping `orders` from the output — which would have compiled
to SQL whose `ON` clause referenced a table never added to the `FROM` clause, a bug of exactly the
"looks fine, breaks at execution" shape this whole document is about eliminating. Fixed: the resolver
now walks each wanted table's parent chain back to `from` and includes every table on the path,
requested or not, in BFS discovery order (which is always a valid dependency order, since a parent is
discovered strictly before its children). Re-verified: `customers → order_items` now correctly emits
`orders` as a real join step, and a deliberately disconnected edge subset still throws a clean
no-path error.

**What this changes in the design going in.** The resolver should be *more* forgiving of what the
model has to say than 16e's original vocabulary sketch implied — the model doesn't need to know
DataScope's join topology precisely enough to name every intermediate hop; it names the tables it
actually wants data from, and the host silently fills in whatever hub tables the FK graph requires to
connect them. That's a stronger version of "the host resolves the path" than the design note stated,
and it removes one more way a model could get this wrong (naming an incomplete join list) that hadn't
been anticipated before running it.

**Caveats:** N=1 (no repeats needed — this is deterministic compilation, not a model call), all 8
questions exercised but each with only one hand-chosen decomposition (the compiler wasn't tested
against alternative, possibly-wrong plans), `where` only tested with a single `=` predicate, and FK
edges were hand-supplied rather than run through the real inference pipeline. The model-emission risk
(does a 1.7B reliably produce schema-valid structured calls) remains completely untested — this only
confirms the *target* the model would need to hit is reachable and correct once hit, for every
question in the fixture, not just the two originally tried.

---

## Model-emission probe — step (2) run: 0/8, and not for the reason expected

[`16eModelEmissionProbe.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/16eModelEmissionProbe.ts)
runs `Qwen3-1.7B` (Ollama, temperature 0) against the same `compileAndRun` resolver/validator the
Prototype section proved correct — imported directly from
[`16eStructuredSpecPrototype.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/16eStructuredSpecPrototype.ts),
not reimplemented, so a failure here is about the model's calls, not a second copy of the compiler
under test. Protocol mirrors 16d's `RUN:`/`FINAL:` shape but swaps raw SQL text for one JSON
`AggregateSpec` object per turn: `STEP: <json>` (`as` required) to persist an intermediate result and
chain off it, `FINAL: <json>` (no `groupBy`, exactly one metric aliased `answer`) to submit the scored
value. The model is deliberately **not** told the FK graph — per the design note above, it names the
tables it wants data from and the host resolves the join path. Up to 4 steps per question, `num_ctx:
8192`, `num_predict: 2048` (16d's own fix for this model hanging mid-`<think>` at the default cap).

**A harness bug caught and fixed mid-run, worth recording because it changed the result.** The first
pass required an explicit `STEP:`/`FINAL:` text label before parsing the JSON at all — 0/8
first-attempt-valid, because the model's very first reply on every question was a bare JSON object
with no label, often otherwise well-formed. 16d already established the right handling for this
("a bare SQL statement with no `RUN:`/`FINAL:` prefix is treated as a final answer") and this probe
didn't carry that convention over. Fixed: a bare JSON object (fenced or not) is now accepted, with
`step`/`final` inferred from whether `as` is set — the vocabulary's own persistence signal doubles as
the routing signal, so the text label becomes optional rather than required. Re-run with the fix.

**Result: 0/8 execution-verified correct, 3/8 first-attempt schema-valid.** The compiler/validator did
its job throughout — every malformed spec was rejected with a specific, correct error (never a silent
wrong answer from bad JSON) — but the model did not reliably produce specs that cleared validation, or
reliably use the specific answer once it did.

| Q | First-attempt valid | Outcome | What actually happened |
| :--- | :--- | :--- | :--- |
| Total customers | yes | wrong_value | Built `n` (view, `COUNT(*)`→30) correctly, was shown the real result, then on every retry re-sent an invalid `FINAL` missing `"from"` — identical text, 4 times. On the forced final turn it recovered valid JSON but ran `count_rows` over the 1-row view again (→1) instead of reading the stored value |
| Average order value | no | no_valid_response | Repeated an invalid `where: {}` / bare-column shape 6 times, never once produced a spec matching `WhereSpec`'s `{column,op,value}` shape despite the identical error message each time |
| Avg total spent per customer | no | compile_error | Never escaped a bare, unqualified `"answer"` column reference across 3 attempts |
| Avg orders per customer | no | no_valid_response | Alternated between an invented `fn: "count"` (not in the vocabulary) and `FINAL` specs carrying a `groupBy` (disallowed) — never converged |
| Highest customer spend | yes | wrong_value | First-attempt spec had two real bugs (`order_items.price` doesn't exist; a join scoping error) that recurred identically across all 4 retries; the version that finally executed summed the wrong column and answered 3 vs. gold 30155 |
| Avg distinct products/order | yes | compile_error | Referenced its own unregistered step name (`"step1"`) without ever setting `as: "step1"` on the step that was supposed to create it — a new bug class not seen in the SQL-based probes |
| West-region avg spend | no | no_valid_response | Same bare-column loop as above, escalating to a bare multi-column expression (`"products.price * order_items.quantity"`) as a single "column" string |
| Avg-of-averages (3-hop) | no | no_valid_response | Never produced valid JSON at all until turn 4, then hit the same bare-column-in-`where` bug (plus an invalid `!=` encoding attempt) |

**The dominant failure is a stuck loop, not slow convergence.** In 5 of 8 questions the model repeated
the *identical* invalid construct (same bare column, same missing field, same disallowed shape)
across 3–6 consecutive turns, each time after being told in plain language exactly which field was
wrong. This is meaningfully different from "hasn't found the right shape yet" — under temperature-0
decoding, near-identical trailing context reliably reproduces near-identical output, so the retries
were not independent attempts; more steps would very likely have reproduced the same loop for longer,
not escaped it. This was tested directly, not assumed: `MAX_STEPS` was 4 (5–6 total turns per question
including the forced-final turn), and the loop pattern is visible within that budget already.

**This is a sharp contrast with the same model on the same fixture via plain SQL text — 24/24 stable**
**(parent README, Probes 7/9), including self-correction from real execution-error feedback (Probe**
**11: 3/3 recovered from an `Ambiguous reference` error).** The model's in-context error-correction
ability is real and already demonstrated; it just isn't showing up here. That points at the
hand-rolled `STEP:`/`FINAL:` JSON protocol — invented for this experiment, not a shape the model has
likely seen much of in training — as the bottleneck, not the model's underlying reasoning capacity or
its comprehension of the vocabulary itself. The vocabulary comprehension read is actually reasonably
good: 3/8 first-attempt-valid, correct use of `sum_product` for the `price × quantity` shape, correct
`as`-based chaining attempted in most multi-step questions, and `"table.column"` qualification used
correctly in a majority of individual field references — the failures cluster in a few specific spots
(the `where` clause's `{column,op,value}` shape, the final answer's single-metric/no-`groupBy`
constraint, and consistent qualification of every field, not just most of them) rather than being
uniform across the whole vocabulary.

**Access to real data specifically does not look like the fix.** Two cases show why: the "total
customers" question was shown the correct computed value (`n | 30`) after a successful step and then
asked a question that couldn't produce it (`COUNT(*)` over a 1-row view) on its very next reply: and
the "highest customer spend" question's final SQL executed without any error at all — real data, no
compile-time catch — and returned 3 against a gold of 30155, because the step that produced it was
already semantically wrong (summed price without multiplying by quantity) in a way the model never
flagged despite seeing the (implausible) result. This echoes 16d's own finding, in a different
modality: a model can "verify" a garbage intermediate result and build a confident wrong answer on top
of it, rather than using real data as a check on its own reasoning.

**Net for 16e:** the compiler/validator half of the thesis holds — every failure above was either
caught before reaching the database (a validation error, specific and correct) or executed to a wrong
answer that a human reviewing the compiled SQL could catch on sight, never a *silently* wrong query
past the DuckDB binder the way raw hand-written SQL fails elsewhere in this document. But the
model-emission half fails outright with this harness: 0/8, driven by a stuck-repetition pattern under
free-text JSON generation that more turns does not fix, based on what the 4-step budget already shows.

**What would actually test the open question, and hasn't been tried:** `qwen3:1.7b` advertises a
`tools` capability in Ollama's own catalog, meaning schema-constrained decoding is available and
untested here. A JSON-schema-enforced call would make most of the failures above — a bare column
string, a missing `"from"`, a `where` with the wrong shape, a `FINAL` carrying `groupBy` — structurally
unrepresentable rather than merely rejected after the fact, which is a fundamentally different lever
than a bigger step budget: it changes what the model is allowed to sample, not how much context it
gets to retry in. The parent README's Probe 3 (Gemini Nano's `responseConstraint`) is the relevant
precedent and the reason not to assume this fixes everything: constrained decoding there fixed
shape-compliance but left semantic correctness (wrong grain, hallucinated columns) untouched. The
likely split here is the same — constrained decoding should plausibly close most of the `where`-shape
and missing-field failures above, but probably not the wrong-metric-on-a-view or
summed-without-multiplying bugs, which are choices, not shape violations.

**Caveats:** N=1, temperature 0 — the same standing caveat as most of this document, sharper here
because the observed stuck-loop behavior is itself a predictable consequence of greedy decoding over
near-identical context, so a repeat run would likely reproduce very similar transcripts rather than
independently confirm the finding; a temperature>0 or multi-seed run would be a more informative
repeat than a literal re-run at temp 0. Single step budget (`MAX_STEPS=4`) — not varied. One model
only (`Qwen3-1.7B`, the document's standing candidate) — not compared against `Qwen2.5-Coder-1.5B`
(the current shipped pin) or `Qwen3-0.6B` on this protocol.
