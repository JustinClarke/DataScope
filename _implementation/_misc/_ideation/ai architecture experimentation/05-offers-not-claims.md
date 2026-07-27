# 05 — Offers, not claims

**Thesis:** stop asking the model for **statements about the data** and ask it for **things the user
might want to do**. A wrong statement is a falsehood the app must stand behind. A wrong suggestion is
just a suggestion the user declines — and DataScope already has first-class infrastructure for
suggestions.

**Status:** untested. **This is a product-shape move, not a validation move** — it changes what the
honesty contract has to cover rather than enforcing it harder. **Cost class:** cheapest of all, because
most of it is already built.

Read [`README.md`](README.md) first.

---

## The reframe

Look closely at §4's target sentence. It is **already an offer wearing a claim's clothes**:

| As written (a claim) | As an offer |
| :--- | :--- |
| "This dataset is well-suited for calculating Customer Lifetime Value." | "Calculate customer lifetime value →" |
| "…analyzing churn, and forecasting seasonal demand." | "Find customers who stopped ordering →" / "Chart orders by month →" |
| "This appears to be an e-commerce dataset." | *(drop it, or make it a question: "Working with orders and customers?")* |

The left column obliges the app to be right about *suitability* — an interpretive claim about arbitrary
user data, which the probe doc correctly identifies as the category the seam refuses. The right column
obliges it only to produce a **runnable query** and a label. If the label is a bad fit, the user ignores
it. **The epistemic burden drops from "true" to "useful", and the failure mode drops from
misinformation to noise.**

## Why this is cheap here specifically

An offer is already a first-class object in this codebase, and there are already homes for it:

- **`RankedAction`** — the D58 ranker, one ranker, already carrying `{module, tab, prefill, evidence,
  score, verb}`, and `rankedActionValidator` already permits the model to **re-order and re-verb** while
  holding `module`/`tab`/`prefill`/`evidence`/`score` byte-identical
  ([`producerValidators.ts`](../../../src/lib/producerValidators.ts) L30).
- **Suggested Explorations** (S6) — top 3 + view-more, opening a pre-run query tab.
- **The Data Quality & Health panel** (S2) — findings carrying a run action.

So the model's job becomes the thing the existing validator **already safely permits**: choosing which
offers to surface, in what order, with what verb. **No new validator is strictly required for the
actions half.** That is a striking result worth stating plainly: the shipped seam may already be the
right shape, and the mistake was asking it to narrate instead of to offer.

## Mechanism

**1. The app enumerates candidate offers deterministically.** Each is a real `RankedAction` with real
`prefill` and real SQL, generated from detected shape (this is the same detection
[01](01-phrase-library.md) builds — `detectCapabilities`; the two share that module).

**2. The model selects, orders and phrases the verb.** Exactly the existing permitted envelope.

**3. Nothing narrates.** The dataset header shows deterministic counts (D65-style, no model), and the
model's whole contribution is the offer list. A rejected model answer degrades to the deterministic
ranking — which is already implemented.

### The honesty property

An offer's truth claim is only *"this query runs and returns something"*, which the app can verify by
**actually running it**. That is checkable in a way "well-suited for CLV" never is. Consider running the
top offers eagerly and dropping any that error or return zero rows — an offer verified by execution is
the strongest guarantee anything in this folder can make.

## What to build

1. Offer generation from detected capabilities → `RankedAction[]` with working `prefill` + SQL. Shares
   `detectCapabilities` with [01](01-phrase-library.md).
2. A mock-up (static HTML or the real component) of the dataset header as **counts + offers**, no
   narrative paragraph — because criterion (c) below is a judgement call that needs to be *seen*.
3. Harness arm `offers`: score selection/ordering through the **existing** `rankedActionValidator`.
4. Optional but high-value: execute-then-filter, dropping offers whose SQL errors or returns nothing.

## Kill criteria (pre-commit, D18)

- **(a)** Zero fabrications — trivially expected, since no free-text claim is emitted. **If any arm
  here produces a sentence about what the data means, the approach was implemented wrong.**
- **(b)** Every surfaced offer, on all five samples, produces **runnable SQL against the real table**
  (execute it — don't eyeball it). An offer that errors is this approach's version of a fabrication.
- **(c)** **The judgement call:** does counts + offers actually satisfy the §4 ambition, or does it feel
  like the app dodged the question? Put the mock-up next to §4's paragraph and decide honestly. This is
  the criterion that decides the approach, and it cannot be automated.
- **(d)** Offer relevance: on ecommerce, do CLV/churn/seasonality-shaped offers appear? On titanic, are
  the offers about survival/class/fare rather than generic `SELECT *`?
- **(e)** R2 determinism on ordering: N=5. Does the offer *set* stay stable even if the order moves? A
  set that churns between loads is a product problem even though it's not a safety one.

## Ollama run

The smallest model call in the folder (select + order + verb over a short candidate list), so this is
fast to iterate. Verify the model doesn't smuggle a claim into the **verb** field — "verb" is free text
and `rankedActionValidator` does **not** run `passesPhrasingGuard` on it. **That is a real gap this
approach should close** (apply the phrasing guard to verbs), and finding it is part of the session.

## Porting to Cloudflare

Cleanest port of any candidate: small prompt, small output, existing validator, existing degrade path.
Likely **cheaper than today's synthesis call.**

## What it does not solve

- **It does not deliver §4's paragraph.** It argues the paragraph was the wrong ask. If the paragraph is
  genuinely wanted as prose, this approach needs [01](01-phrase-library.md) or
  [04](04-model-as-editor.md) alongside it for the header line.
- The "domain guess" ("this appears to be e-commerce") is dropped entirely, or demoted to a question.
  Decide deliberately and record which.
- Verbs need the phrasing guard extended to them (above) — small, but real, and currently unguarded.

## Verdict

_Unrun. Append here: the seven rubric rows, the offer-relevance table per sample, SQL-executes results
for (b), and a plain answer to (c)._
