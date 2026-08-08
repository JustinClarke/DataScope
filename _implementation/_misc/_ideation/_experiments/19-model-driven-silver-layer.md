# Model-driven silver layer: full transform permission + context-amnesia persistence test

**Status (2026-08-08): ideation, one live probe run** (`eval/chat/17-duckdb-local-chat/silverLayerProbe.ts`,
not part of exp 17's scored harness). Sibling to `18-dbt-in-browser-transforms.md`, deliberately narrower
and blunter: no lineage DAG, no MCP, no typed checkpoint — just full read/write DuckDB access and a literal
wipe of conversation history between two passes at the same question, to see what a model does with the
freedom before designing any scaffolding around it.

The governing question:

> If a model can write real tables, not just propose queries, does it choose to build itself a reusable
> intermediate layer — and if it does, does that layer substitute for the memory that gets erased when its
> context is cleared?

---

## Decision this experiment makes

Whether unrestricted read/write DuckDB access (real tables under a `silver` schema, not curated read-only
views) leads a local model to spontaneously materialize reusable intermediate results, and whether a
second, memory-less pass at the same question can lean on what a first pass persisted.

## Why this is not experiment 17 or 18

- **Exp 17** is read-only and pre-scoped: the model may only touch two hand-built views
  (`analytics.sales_lines`, `analytics.order_totals`) that already resolve the line-vs-order grain question.
  This experiment removes both restrictions — full read/write, raw base tables only, no curated view — to
  see what happens without that scaffold.
- **Exp 18** is also model-proposed transforms, but explicitly ruled out write access as a non-goal
  ("no `CREATE TABLE` against source data... transforms are views") and models memory as a lineage DAG plus
  typed checkpoint queried on each cleared-context turn. This experiment is the blunter version of the same
  question: literal `CREATE TABLE`, and literal deletion of the message array — no DAG, no checkpoint, no
  framework — to find out whether the plain version works at all before building any of 18's scaffolding
  around it.

## What already exists to build on

| Need | Existing seam |
| :--- | :--- |
| Raw base-table DDL, no curated views | `eval/chat/17-duckdb-local-chat/catalog.ts` (`SOURCE_TABLE_DDL`) |
| Read-write DuckDB connection | `eval/chat/17-duckdb-local-chat/database.ts` (`openBootstrapConnection`) — exp 17 only ever uses this before sealing the runtime read-only; this experiment keeps it open instead |
| Structured-output step loop (propose SQL, execute, feed result back) | `eval/chat/17-duckdb-local-chat/ollama.ts` (`callForProposal` pattern), reimplemented locally in the probe with a `{sql, done, note}` shape since exp 17's fixed `ModelProposalSchema` doesn't fit |
| Known grain-trap question + gold answer | exp 17's `questions.ts` Q8 ("average completed order value", gold `1337.35`; line-grain average is the documented wrong-answer trap, exp 16-derived) |
| "Passive capability offers go unused" precedent | `_archive/16-light-model-sql-ceiling/16d-intermediate-query.md` Finding 1 — telling the model it *may* run scratch queries, with no directive push, produced zero uptake and reproduced the one-shot failure unchanged |

## Sketch

```text
Phase 1 (build):
  fresh conversation, empty database except raw tables
  loop up to N steps:
    model replies {sql, done, note}
    host executes sql verbatim, no allowlist, no guard
    result or error fed back; ask again unless done=true
  whatever ran on the done=true step is read as the phase's answer

  -- conversation history discarded here; database file is not --

Phase 2 (reuse):
  fresh conversation, same question, same database file
  system prompt lists any tables that now exist under `silver.*`,
  framed explicitly as: "built in a previous session you don't remember"
  same loop as phase 1
```

No guard, no object allowlist, no correction budget beyond the step cap — deliberate, not an oversight.
The point of this first pass was to observe raw behavior before deciding which rules earn their place;
see Open risks.

## Live finding (2026-08-08) — qwen3:4b, thinking off, N=1

Temperature is 0; a second full run reproduced the same result byte-for-byte.

**1. The grain trap reproduced exactly as expected.** With no curated view, the model joined `order_items`
to `orders` and averaged at line grain: `533.44`, not gold `1337.35`. Confirms — again, on a new harness —
that exp 17's `order_totals` view is doing real correctness work, not just convenience.

**2. The transform permission went completely unused.** Despite the system prompt explicitly offering
`CREATE SCHEMA silver` / `CREATE TABLE silver.*` and inviting it, the model ran the *exact same* single
`SELECT`, verbatim, three times across 3 steps — same query, same boilerplate note text, no exploration, no
materialization attempt — then flipped `done=true` on the third repeat with no new reasoning. This is
16d's "a passive offer does nothing" finding, replicated in a new setting: capability without a directive
push goes unused.

**3. Constraint 2 (persistence across cleared context) is still untested.** Because phase 1 never created
anything under `silver.*`, phase 2 started with an identical "no silver-layer tables exist yet" prompt and
reproduced phase 1's result exactly. The actual question this experiment set out to answer — does a
memory-less second pass benefit from a first pass's persisted work — has zero evidence either way yet.

## Non-goals (this pass)

- No claim that materializing a table makes a query correct — same posture as exp 17/18.
- No guard, no allowlist, no safety boundary of any kind yet — deliberate, to see unconstrained behavior
  first (see Open risks — this must not be mistaken for a decision that none is needed).
- No product/app integration; stays an isolated `eval/` probe.
- No stability testing yet (N=1, no repeats).

## Next step (not yet run)

Make the nudge directive instead of passive, per 16d's precedent that only explicit instruction moved the
needle: e.g. "Don't answer from raw tables directly — first build an intermediate table capturing per-order
totals, then answer from that." That would force at least one real transform into existence, which is the
minimum needed to test the actual persistence question this run skipped past.

## Open risks

- **No safety boundary at all right now.** The probe runs arbitrary SQL — including DDL/DML — against a
  DuckDB file with no guard, no read-only seal, no allowlist. Mitigated only by using an isolated throwaway
  file (`runs/dev/silver-probe.duckdb`, rebuilt fresh each run), not by any property of the harness. If this
  idea proceeds past ideation, a safety boundary (read-only seal on source tables, write access scoped to a
  `silver` schema only, still no DML/extensions/file access — the exp 17 `sqlGuard.ts` class of checks) has
  to exist before this touches anything that matters, per "add rules from then on."
- **N=1, one model.** Temperature 0 makes a single run reproducible but says nothing about stability across
  seeds/models; qwen3:1.7b or a bigger model might behave differently.
- **The governing question is still open.** One run found the model doesn't reach for the capability
  unprompted — it did not find out whether the capability helps once used. Those are different findings and
  only the first one has evidence yet.
