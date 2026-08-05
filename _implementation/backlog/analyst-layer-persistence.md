# Analyst-layer persistence — deferred angles

**Tier:** backlog — future plan, unscheduled · **Source:**
[`13-active-analysis-loop.md`](../_misc/_ideation/_experiments/13-active-analysis-loop.md),
[`14-open-analyst-mcp.md`](../_misc/_ideation/_experiments/14-open-analyst-mcp.md) — upstream of
master, no D-row yet.

Surfaced 2026-08-04 while scoping what "give the local LLM persistent context so it makes
smarter observations" should mean for DataScope's analyst-core/MCP direction (experiment 14).
Three shapes of persistence came up. One is being pursued now as a new experiment — mid-loop,
same-dataset, explicit clear-and-reseed from a fact store (llm → mcp → store → clear context →
new turn seeded with stored facts): a direct retry of 13's active arm, this time clearing
context between rounds instead of letting it accumulate, which is the likely reason that arm
diluted rather than sharpened (13's N=1 result: 1.8x context high-water, worse answer than the
fixed-evidence arm — see `13-active-analysis-loop.md` L1358). The other two are recorded here,
deliberately not started.

## 1. Cross-session dataset memory (same dataset, exact recall)

**Idea.** When a user reopens a dataset analyzed in a prior session, the model shouldn't
re-derive schema, relationships, and stats it already computed — recall them from storage keyed
to the dataset's fingerprint and start the next session with that context already loaded.

**Why deferred.** The most tractable of the three — plain keyed lookup, no semantic retrieval,
no vector DB required. But it extends experiment 14's result store, and 14's own primary run
(does the MCP analyst surface beat SQL-only for an 8B model at all) hasn't happened yet
("Verdict: _Unrun_" — `14-open-analyst-mcp.md` L730). Building recall on top of a surface that
hasn't earned its keep is premature.

**Revive trigger.** 14's P0–P3 land and the primary run reports positive. Then extend the
per-cell result store — currently scoped to one process and thrown away after ("Each cell gets
its own server process and catalog" — `14-open-analyst-mcp.md` L532) — with a
`(dataset fingerprint) → last-known facts` store loaded into turn 0 on reopen.

## 2. Cross-dataset pattern memory (semantic recall)

**Idea.** Recognize when a newly uploaded dataset resembles one analyzed before — similar
schema shape, similar quality pattern, similar statistical signature — and draw on findings from
that prior session ("datasets like this tend to have X"). This is the one persistence angle
where a vector/embedding store would do something a keyed lookup can't: DataScope's facts are
otherwise structured and enumerable (schema, stats, relationships), which is exact-match
territory, not similarity-search territory.

**Why deferred.** Untested and unscoped. Every scored run in `_experiments/` (10 through 14) is
single-dataset, single-session by design — nothing measures whether cross-dataset transfer helps
or just adds noise. It also opens a privacy question this project treats carefully elsewhere
([`foundations/privacy-model.md`](../foundations/privacy-model.md)): surfacing facts derived
from one dataset against a different, possibly unrelated upload needs its own scoping, not an
assumed yes.

**Revive trigger.** Concrete demand (an observed user need, not a hypothetical), and item 1
above already shipped and proven useful — this is a strict superset of that problem and
shouldn't be attempted before the easier case is validated.
