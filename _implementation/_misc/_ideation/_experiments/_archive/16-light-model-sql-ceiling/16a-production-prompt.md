# 16a — Does the ceiling survive production's actual schema prompt?

Sub-experiment of [`16-light-model-sql-ceiling`](README.md). See the parent's "How this
experiment is organised" for why this is lettered rather than numbered: it changes what the
**host serves the model**, not what the model is asked to do unaided.

**Status (2026-08-07): run, N=3.** Result and analysis below.

---

## The question

Every probe in the parent document — 1 through 15, across three fixtures, two providers and
five models — hand-writes its schema block in this shape:

```text
Tables:
customers(customer_id INTEGER, name TEXT, region TEXT, signed_up_at DATE)
products(product_id INTEGER, name TEXT, category TEXT, price DECIMAL)
orders(order_id INTEGER, customer_id INTEGER, ordered_at DATE, status TEXT)
order_items(order_item_id INTEGER, order_id INTEGER, product_id INTEGER, quantity INTEGER)
```

**The app does not send that.** [`src/services/ai.ts`](../../../../../src/services/ai.ts) builds
its system prompt from `pruneSchema()`
([`src/lib/schemaPrune.ts`](../../../../../src/lib/schemaPrune.ts)), which carries three things the
hand-written block does not:

1. **row counts** per table,
2. each column's **semantic type** from the real classifier
   ([`src/lib/classifier.ts`](../../../../../src/lib/classifier.ts)) alongside its physical type,
3. an inferred **`Relationships:`** block naming the FK edges
   ([`src/lib/relationshipInference.ts`](../../../../../src/lib/relationshipInference.ts)).

That matters because of what Probe 14/15 actually found. The three stable Probe 14 failures are
**identifier-hygiene** failures — a typo'd table name (`product` for `products`) and an
unqualified `customer_id` ambiguous across a join — not aggregation-reasoning failures. The
parent doc's own reading: *"every question that reached a clean join graph got the double-hop
math right."* An explicit `Relationships:` block is precisely the kind of structure that could
prevent a model from guessing at a join, and precisely what the probes have been withholding.

So: **is the parent document's ceiling a property of the model, or partly an artifact of the
probes underfeeding it relative to production?**

This ran first among the four sub-experiments because it could invalidate the others' premise: if
the production prompt already cleared Probe 14's fixture, 16b and 16c would be fixes for a bug
production never produces. It didn't clear it — and the result re-scoped 16b, which was planned as
fan-out annotation and now leads with the semantic-type question this run surfaced.

## Protocol

Exactly **one** thing changes versus Probe 14: the schema block. Same 4-table fixture, same seed
data, same 8 questions, same gold SQL, same model (`qwen3:1.7b`), same temperature (0), same
`SQL_INSTRUCTION`, same extraction regex, same execution-against-ground-truth scoring, N=3.

The comparability is enforced structurally rather than by care: the fixture was extracted into
[`nestedGrainFixture.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/nestedGrainFixture.ts)
and is now imported by both Probe 14's script and this one, so the two cannot drift. The
extraction was byte-for-byte; Probe 14's behaviour is unchanged.

The prompt is built by **calling the real production functions**, not by imitating their output
format — `classifyColumns()` and `pruneSchema()` are imported directly from `src/`. Reimplementing
the format here would have repeated the exact mistake this sub-experiment exists to catch, and it
would let a future change to either function silently invalidate the comparison.

## What production actually sends

Built against the seeded fixture, this is the block for the first question:

```text
Table customers (30 rows):
  - customer_id: Identifier (BIGINT)
  - name: Identifier (VARCHAR)
  - region: Categorical (VARCHAR)
  - signed_up_at: Temporal (DATE)

Table products (40 rows):
  - product_id: Identifier (BIGINT)
  - name: Identifier (VARCHAR)
  - category: Categorical (VARCHAR)
  - price: Identifier (BIGINT)

Table orders (500 rows):
  - order_id: Identifier (BIGINT)
  - customer_id: Quantitative (BIGINT)
  - ordered_at: Temporal (DATE)
  - status: Categorical (VARCHAR)

Table order_items (1,500 rows):
  - order_item_id: Identifier (BIGINT)
  - order_id: Quantitative (BIGINT)
  - product_id: Quantitative (BIGINT)
  - quantity: Categorical (BIGINT)

Relationships:
  - orders.customer_id → customers.customer_id
  - order_items.order_id → orders.order_id
  - order_items.product_id → products.product_id
```

**Three labels in that block are wrong or misleading, and the classifier produced all three
deterministically from its shipped rules.** This was visible before the model was called once:

- **`price: Identifier (BIGINT)`.** `price` has 40 distinct values across 40 rows — a
  distinct/row ratio of 1.0, above `IDENTIFIER_UNIQUE_RATIO` (0.95), so the identifier heuristic
  fires. The prompt therefore tells the model that the column every revenue question must
  multiply by is an *identifier* — a column type whose whole meaning is "not an analysis
  dimension." The hand-written block's `price DECIMAL` was strictly more useful.
- **`customer_id: Quantitative` on `orders`.** 30 distinct over 500 rows, numeric, above the
  categorical cardinality cap — so the FK column reads as a measure, something to average.
- **`quantity: Categorical`.** 5 distinct values, so it lands in the categorical bucket despite
  being the multiplicand in every revenue calculation.

The identifier misfire on `price` is partly a fixture artifact — a 40-row product table with
distinct prices is a small-data edge case, and the rule exists for good reasons documented in
`classifier.ts`. But it is what production would send for this table, which is the only question
16a asked.

**Pruning behaviour.** `pruneSchema` is question-dependent. Seven of the eight questions pulled in
all four tables; "On average, how many distinct products appear in each order?" correctly pruned
to `products, order_items` only. Worth noting for later: the FK neighbour expansion is a *single
ordered pass* over the edge list with `mentioned` mutating mid-iteration, so transitive pull-in
(customers → orders → order_items → products) depends on edge ordering rather than being
guaranteed. It happened to work here.

## Result

**12/24, stable across 3 repeats — worse than Probe 14's 15/24 on the identical fixture.**
Serving the model production's richer schema prompt did not close the ceiling. It lowered the
score, and it changed the bug taxonomy underneath.

| Question | Hops | Probe 14 (bare block) | 16a (production prompt) |
| :--- | :--- | :--- | :--- |
| Total customers | 0 (control) | 3/3 | 3/3 |
| Average order value | 1 (control) | 3/3 | 3/3 |
| **Average total spent per customer** | 2 | **3/3** | **0/3 — regression** |
| Average orders per customer | 2 | 3/3 | 3/3 |
| Highest total any single customer has spent | 2 | 0/3 | 0/3 |
| Average distinct products per order | 2 | 3/3 | 3/3 |
| Average total spent per customer, west region only | 2 + filter | 0/3 | 0/3 |
| Average of each customer's average order value | 3 | 0/3 | 0/3 |

Every failure is stable — byte-identical SQL and error across all 3 runs, temp-0 determinism —
and every one is a hard DuckDB binder error, not a silently wrong value. Latency ran 14–40s per
question, at the top of this document's Ollama range for `qwen3:1.7b`, consistent with a longer
prompt.

### The failure modes changed almost completely

| Question | Probe 14 failure | 16a failure |
| :--- | :--- | :--- |
| Average total spent per customer | *(passed)* | `Table "order_items" does not have a column named "price"` |
| Highest total per customer | `Referenced table "product" not found` — typo'd table name | `Ambiguous reference to column name "customer_id"` |
| West-region average spend | `Ambiguous reference to column name "customer_id"` | `Referenced table "p" not found!` — used alias `p.price` while joining `products` **unaliased** |
| Triple-hop average-of-averages | `Ambiguous reference to column name "customer_id"` | `Table "oi" does not have a column named "product_price"` — invented a `product_price` column on `order_items` |

Only one question fails the same way in both arms, and it isn't the same question — the
ambiguous-`customer_id` bug moved from two questions to a different one. **It was not fixed by
the `Relationships:` block.** Probe 15 established that this specific failure is the one the
shipped retry rung cannot recover; it is still here.

### The pattern: three of four failures misplace `price`

This is the finding worth carrying forward. In 16a the model reaches for a price column that
does not exist, in three different ways, on three different questions:

- `order_items.price`
- `p.price`, where `p` was never bound (`products` is joined without an alias)
- `oi.product_price`, a column invented on `order_items`

Probe 14, on the bare block, did none of this. Its passing questions reached `products.price`
correctly, and its one price-related failure (`product.price`) was a *typo of the right table* —
the model knew where `price` lived and misspelled the table. Under the production prompt it
appears not to know where `price` lives at all.

The obvious candidate cause is the misclassification flagged above: production labels
`products.price` as **`Identifier`** — the same semantic type it gives `product_id`, `order_id`,
`customer_id` and `name`. In the rendered block, `price` is typographically indistinguishable from
a key column, and no column anywhere in the four tables is labelled as the measure the question
needs. The bare block's `price DECIMAL` carried strictly more usable signal.

A second, non-exclusive candidate: the `Relationships:` block states
`order_items.product_id → products.product_id`, which correctly says the two tables connect, and
may make a price attribute *feel* reachable from `order_items` without an explicit join projection.

Neither is established by one N=3 run on one fixture. Both are directly testable, and testing the
first is now the highest-value thing 16b can do.

## What this settles, and what it doesn't

**Settles the question 16a was built to ask:** the ceiling is not an artifact of the probes
underfeeding the model. Production's prompt is richer and the score is lower. 16b, 16c and 16d
keep their premise, and the parent document's Probe 1–15 results are not invalidated by having
used a thinner schema block — if anything they were measured under favourable conditions.

**Overturns an assumption worth stating plainly:** "serve the model more structure" is not
monotonic. More context about the schema made this model worse at the schema. The parent doc's
open item 11 (messier data, deeper joins) has been treating richer input as a difficulty axis;
16a shows richer *description* is one too, in the wrong direction.

**Surfaces a production bug that has nothing to do with model choice.** `IDENTIFIER_UNIQUE_RATIO`
firing on a 40-row product table means the shipped app tells the model its price column is an
identifier. That is wrong for any dataset where a measure happens to be near-unique — small
tables, prices, timestamps-as-numbers, per-row amounts. It costs nothing to observe that this
would affect the cloud providers' prompts too, not just the local model, since `pruneSchema` is
provider-independent. Whether it *matters* at cloud-model capacity is untested.

**Does not settle** whether the semantic-type labels are net-harmful or whether it's specifically
the `price: Identifier` misfire. 16b should run the same fixture three ways — labels as-is, labels
corrected by hand, labels removed entirely — to separate "wrong labels hurt" from "labels hurt."

**Does not settle** whether the new alias-hygiene failures are retry-recoverable. All four errors
name the correct candidate table or column in their error text, so they are retry-*catchable*;
Probe 15's catchable-vs-recoverable distinction means recovery has to be measured, not assumed.
That is a direct extension of 16c.

## Caveats

- **N=3**, same standard as the parent document's stability reads — stable across 3 repeats, not
  proof against rarer failure modes.
- **Ollama, not the MLC/WebGPU build** — the standing caveat on every Ollama probe in the parent.
  Probe 14, the comparison baseline, carries the identical caveat, so the *comparison* is sound
  even though neither arm is the shipped build.
- **FK edges are hand-supplied, not inference-derived.** Running the real inference pass needs the
  app's services layer, not the headless eval engine. The three edges given are the ones inference
  would find on this seed data (containment 1.0, name agreement, unique parent key → `confident`
  tier for all three), so this is **generous to production**: it assumes inference recovers every
  edge. On a real dataset with orphan rows or renamed keys it might not, and a missing or wrong
  edge would leave the model guessing at a join it was here told explicitly — so the real-world
  result is plausibly *worse* than 12/24, not better.
- **Non-prompt `ColumnProfile` fields are stubbed** (min/max/mean/stdDev/nullPercentage). Nothing
  on this path reads them — `renderColumn()` reads name/semanticType/physicalType, `classifyColumn()`
  reads physicalType/cardinality/rowCount — so they cannot affect the result.
- **One fixture.** This is Probe 14's nested-grain fixture only. The production prompt has not been
  retested against the flat, one-join or plain 4-table fixtures, all of which `qwen3:1.7b` already
  cleared 24/24 with the bare block; there is no reason to expect a richer prompt to break them,
  but it is untested.

Harness:
[`16aProductionPromptProbe.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/16aProductionPromptProbe.ts),
run via `npx tsx eval/claude/16-light-model-sql-ceiling/16aProductionPromptProbe.ts [model] [repeats]`.
Pass `--print-prompts` to dump the built prompt for every question without calling the model.
