# 15 — The analyst layer (D74)

**Tier:** v0.71 · **Phases:** A0–A6 (§19) · **Depends on:** v0.70 S1–S6 (none blocking; S4's
shared guarded run path is a real dependency for A3). Spec of record: master **§11.5** and
**§19**'s v0.71 subsection; decision row **D74** (which amends **D38** and **D41**). The
experiment that motivated it — and which consumes this layer without gating it —
is [`14-open-analyst-mcp.md`](../../_misc/_ideation/_experiments/14-open-analyst-mcp.md).

> **The model chooses the analysis. DataScope owns the computation and hands back the SQL it ran.**

## What this tier actually is

§11.1's pipeline answers one question with one query. This tier builds the surface an *analyst*
needs — inspect, compute, derive, page, decide when to stop — as **one operation catalog behind one
door**, and then points both the UI and the model at that same door.

Nothing here constrains the model's *answer*. There is no Claim IR, no verified-claim gate, no
suppression, no renderer between the model and the user. What DataScope owns is the **catalog** —
the set of things it computes deterministically, each returning rows plus the query that produced
them. That boundary is the whole design: constrain the *computation*, not the *prose*.

**Experiments 11–13 are why.** They asked "how tightly must we constrain the model to stay
truthful?" and answered it by exhaustion: 11 proved typed plans execute, 12's verifier produced zero
factual yield on its four answerable questions, and 13's active loop spent twice the tokens and
twice the wall time to return a *worse* answer than its fixed arm. **Constraint is not the lever.**
This tier stops pulling it.

## The load-bearing bet: the `sql` field

Every operation returns the exact SQL DataScope ran. That single field is why this is product work
rather than model scaffolding:

- **For the user** — whatever the model computes can be seen, re-run, edited and pinned. Model work
  lands as **ordinary DataScope artifacts, not a private channel**. This is exactly the
  "run from anywhere" affordance v0.70 S4 already built the path for.
- **For the app** — every panel that displays a computed fact calls the same operations the model
  calls, so **what the UI shows and what a model sees cannot diverge** (D58's no-parallel-pipelines
  rule, applied to the fact layer).

## A0–A3 are worth building whether or not any model succeeds

This inverts the experiment record's first draft, where everything was gated behind a verdict. Each
of these is a user-facing feature on its own terms:

| Operation | The feature it *is* |
| :--- | :--- |
| `search_values` | a value search box — "which column contains `completed`" |
| `text_frequency` | a panel on any text column |
| `time_series` | the period-over-period suggestion D53 currently only *names* |
| `join_coverage` | matched/unmatched/multiplicity on the relationship graph |
| `validate_sql` | a dry-run check in the console that costs no execution |
| result handles + paging | removes the 100k row cap as a correctness cliff |

**The experiment is a consumer of this layer, not a gate on it.**

## Phases

| Phase | Leaf | One line |
| :--- | :--- | :--- |
| A0 | [`00-analyst-core.md`](00-analyst-core.md) | The catalog behind one door; executor interface; result store; memory ceiling measured |
| A1 | [`01-missing-operations.md`](01-missing-operations.md) | The eight operations that don't exist yet |
| A2 | [`02-operation-surfaces.md`](02-operation-surfaces.md) | The user-facing home each new operation earns |
| A3 | [`03-transforms-first-class.md`](03-transforms-first-class.md) | Derive/view/drop as operations, through S4's guarded path; lineage; undo |
| A4 | [`04-tool-loop.md`](04-tool-loop.md) | Four shipped defects that cap the AI at "one query, twenty rows, no follow-up" |
| A5 | [`05-mcp-server.md`](05-mcp-server.md) | The MCP server over the core; the page connected by a linked in-memory pair |
| A6 | [`06-charts-and-pins.md`](06-charts-and-pins.md) | `create_chart` / `pin_result` through the D55 seam — the phase that delivers the goal |

**A4 is sequenced before A5 deliberately.** The experiment record scoped them as one item
("MCP server + app AI rewire"); reading the code showed three of A4's four defects are
*prerequisites* to A5 and **none of them are MCP work** — a breaking change to `AIProvider`, a
replacement determinism strategy for small models in the shipped default path, and a cancellation
fix. Landing them together means you cannot tell which half broke.

## What is deliberately not being built

**Data-custody machinery.** The dataset is local, the engine is local, the model is local or a
private endpoint of the user's choosing. Source-hash checks around every cell, a model-bound data
ledger, egress leases, canonical RFC 8785 result hashing, per-page content hashes, and a hand-frozen
read-only SQL grammar are all **out**. Rows going to a model the user chose to run is the product
working, not an incident.

Two things that *look* like custody machinery stay, for non-custody reasons:

1. **Results are materialized once and paged from that materialization** — not for integrity, but
   because re-running an unordered query for page 2 returns different rows. This is correctness.
2. **The trace is retained** — not for audit, but because a model that cannot see what it already
   established re-derives it, and re-derivation is what exhausts a turn budget (D74h).

## Boundaries inherited, not re-decided

- **D74a/b** — in-process MCP is unrestricted; **any** process boundary re-arms D38's staging gate.
  External clients are deferred, not blocked, and keep their own ADR.
- **D74f** — the §23.5 edge ceilings, kill-switch and counters **stay on**. They bound operator
  cost on a public endpoint; this tier runs in-process and touches none of them.
- **D74g** — AI transcripts persist **locally**. Local-at-rest, not egress; the three conditions
  (clear-history control, no persistence in D62 viewer mode, D46 sensitivity caveat) are not
  optional. See [`../../foundations/privacy-model.md`](../../foundations/privacy-model.md).
- **D55** — anything the model emits that reaches the renderer crosses the producer/validator seam.
  Load the `viewspec-guard` checklist before touching that code (A6 especially).
- **D58** — one ranker, one run path, one fact pipeline. This tier adds a door, never a second path.

**Binding constraint, same as v0.69's and v0.70's:** no `src/` code for a phase starts until that
phase's leaf doc lands carrying its own definition of done.
