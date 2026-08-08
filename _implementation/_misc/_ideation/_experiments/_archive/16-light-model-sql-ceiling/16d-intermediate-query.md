# 16d — Does letting the model run intermediate queries against real data beat one-shot nested SQL?

Sub-experiment of [`16-light-model-sql-ceiling`](README.md). The compositional counterpart to 16c:
instead of asking the model to hold a full multi-hop nested query in its head and type it correctly
in one shot, let it run intermediate scratch queries against the real data — see actual results — and
build the final query on top of verified intermediate steps.

**Status (2026-08-07): started, preliminary only, handed off mid-run.** N=1, and only run against
Probe 14's three known failures — not the full 8-question fixture, so whether this regresses any of
the 5 questions that already passed one-shot is **untested**. Not stable-confirmed (no N=3).
Recorded here so the next session doesn't have to rebuild the harness or re-derive these three
results from scratch.

---

## Protocol

Same schema, seed data, and 8 questions as Probe 14/16a/16b (`nestedGrainFixture.ts`, imported
directly — byte-identical, so results are directly comparable). Instead of `SQL_INSTRUCTION`'s "reply
with one SQL statement," the model is told it may reply `RUN: <select>` up to 4 times — each one
actually executed against the real DuckDB engine, its result (or error) fed back as the next turn —
before replying `FINAL: <select>`, which is scored the normal way (execution-verified against ground
truth). `qwen3:1.7b`, temperature 0, `num_predict: 2048` / `num_ctx: 8192` (Probe 15's fix for this
model's reasoning-loop hangs, carried over here since multi-turn history plus `<think>` chains grow
fast across several turns).

Two instruction wordings were tried, in order:

1. **Passive offer** — "you may run scratch queries if useful." Result: the model ignored it
   entirely. 0 scratch queries used, went straight to `FINAL`, reproduced Probe 14's exact
   ambiguous-`customer_id` failure on the west-region question, verbatim. Same shape of finding as
   16a/16b: *offering* a capability in the prompt doesn't change behavior on its own.
2. **Directive** — "for multi-step aggregation, don't write the nested query in one shot; run one
   intermediate query per step, verify it, then build on it." The results below are from this
   version.

## Results (N=1, Probe 14's three stable failures only)

| Question | Probe 14 failure | 16d outcome |
| :--- | :--- | :--- |
| Highest total any single customer has spent | hallucinated table alias (`product` vs `products`) | **correct** |
| Average total spent per customer, west region only | ambiguous `customer_id` | **still fails — different, arguably worse** |
| Average, across customers, of each customer's own average order value (triple-hop) | ambiguous `customer_id` | **still fails — different mechanism** |

**Highest-spend question: fixed.** One scratch query, correctly joining
`orders`→`order_items`→`products`, grouped by `customer_id`; the model saw sane per-customer numbers
back, then wrote a correct final query. The alias typo that broke the one-shot version didn't
recur — plausibly because writing the simpler intermediate query first gave it a verified shape to
copy from, rather than composing the whole thing blind.

**West-region question: fails via a new, more dangerous mechanism.** The scratch query it ran joined
`customers` directly to `order_items` on `c.customer_id = oi.order_id` — comparing a customer ID to
an order ID. Semantically nonsense, but both are integers, so DuckDB doesn't reject it; it just
executes and returns plausible-looking numbers:

```sql
SELECT c.customer_id, SUM(oi.quantity * p.price) AS total_spent
FROM customers c
JOIN order_items oi ON c.customer_id = oi.order_id   -- wrong: never touches `orders`
JOIN products p ON oi.product_id = p.product_id
WHERE c.region = 'west'
GROUP BY c.customer_id
```

The model treated the (garbage) result as a verified intermediate step and built the final answer on
top of it: `715.14` against a gold of `12887.71`. **This is worse than the original failure in one
specific way** — Probe 14's one-shot version at least threw a catchable `Ambiguous reference` error,
something the retry rung has a real chance against (per Probe 11's unrelated success on the same
error class). This version fails silently. Verifying an intermediate result only helps if the model
can tell a *wrong* intermediate result from a right one; here it couldn't, because the query executed
without error and the numbers looked like real output.

**Triple-hop question: fails on a different mechanism again.** Its scratch query correctly computed
the right intermediate values — per-customer total spent and order count, exactly what the final
answer needs:

```sql
SELECT customer_id, SUM(price * quantity) AS total_order_value, COUNT(*) AS num_orders
FROM orders
JOIN order_items ON orders.order_id = order_items.order_id
JOIN products ON order_items.product_id = products.product_id
GROUP BY customer_id
```

But the final query didn't reuse them: the model discarded its own verified result and wrote a new,
different nested query, which then referenced a `price` column that had gone out of scope inside an
inner subquery — a binder error. It did the hard part right, verified it, and then didn't build on
it when composing the final answer.

## What this preliminary read says

Not a clean win, and not nothing. It fixes the case that was a simple typo, at the cost of a new
failure mode on the harder cases: a scratch query that hallucinates a wrong-but-executable join
condition removes the one thing the current one-shot approach has going for it on this bug class —
that it fails loudly, where the retry rung has something to catch. The triple-hop result additionally
shows the model doesn't reliably compose its own verified intermediate steps into the final query,
which is the core premise this sub-experiment set out to test.

**Open, for whoever picks this up next:**

1. **Regression check never run.** The 5 questions that already passed one-shot (Probe 14) were not
   re-tested under this protocol. If this approach makes any of those worse, that's disqualifying on
   its own, before the failure-fixing question even matters. `--only=1,2,3,4,6` runs exactly those 5.
2. **N=1 only** on all three results above — none confirmed stable.
3. **The silent-wrong-value risk needs its own answer before this is a serious candidate** — e.g.
   requiring the model to sanity-check a scratch result's row count / join fan-out against something
   the harness verifies independently, rather than trusting "it ran without erroring" as proof the
   intermediate step was right.
4. Whether a looser or tighter scratch-query budget (currently 4), or explicitly telling the model to
   re-use a prior scratch query's *exact* SQL as a CTE in the final answer (rather than free-composing
   a new query from memory, which is where the triple-hop case broke), changes the composition
   failure — untested.

Harness: [`16dIntermediateQueryProbe.ts`](../../../../../eval/claude/16-light-model-sql-ceiling/16dIntermediateQueryProbe.ts).
Reproduce the table above: `npx tsx eval/claude/16-light-model-sql-ceiling/16dIntermediateQueryProbe.ts qwen3:1.7b 1 4 --only=5,7,8`.
