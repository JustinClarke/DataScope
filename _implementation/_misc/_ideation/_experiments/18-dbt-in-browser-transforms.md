# dbt in the browser: model-proposed, lineage-tracked transforms

**Status (2026-08-08): ideation, unrun.** Supersedes the scope of `duckdb-local-llm-chat.md`, archived
alongside this doc (`_archive/duckdb-local-llm-chat.md`) as experiment 17's ideation record. The harness
at `eval/chat/17-duckdb-local-chat/` is untouched and stays reusable substrate — `sqlGuard.ts`, the
sealed read-only authority, and the two hand-written analytics views are exactly the safety boundary
this idea also needs. This doc synthesizes three previously separate, unrun ideation threads: exp 14's
analyst-chooses-operations-over-MCP layer, exp 15's cleared-context-loop memory model, and one new idea
neither covered — LLM-proposed named transforms with lineage.

The governing sentence:

> The model proposes named, audited transforms. DataScope executes and materializes them client-side.
> Lineage — not chat history — is the memory.

---

## Decision this experiment makes

Whether a model asked to explore a dataset produces a more inspectable, reusable, and *learnable* body
of work when its output is named, lineage-tracked transform definitions — dbt-style models materialized
as DuckDB-Wasm views — instead of disposable one-shot SQL queries or chat prose.

## Why this is not experiment 14, 15, or 17

- **Exp 17** tests one-shot query → explain, entirely disposable; nothing the model produces outlives
  the turn except a compact typed session summary. This idea makes the model's output a durable, named,
  versioned artifact instead.
- **Exp 14** gives the model a deterministic operation catalog over MCP but never asked it to *create*
  new named operations — every operation is one DataScope already had. This idea adds exactly one new
  kind of operation: propose a transform, and once accepted it joins the catalog for later calls.
- **Exp 15** tests whether clearing the transcript at a fixed midpoint helps an analyst loop whose
  memory is a typed checkpoint plus `query_analysis_memory`. It never had a lineage DAG to query. This
  idea gives cleared context an actual structural memory to query instead of an abstract findings ledger.

## What already exists to build on

| Need | Existing seam |
| :--- | :--- |
| Derived-table lineage seed | `src/services/transforms.ts` — `CREATE TABLE AS` already registers a derived table carrying its `generatingSql` |
| Deterministic operation catalog (profiling, stats, relationships, quality) | inventoried in full in `_archive/14-open-analyst-mcp.md`, § "What DataScope already computes" |
| Typed checkpoint / cleared-context memory pattern | `_archive/15-cleared-context-loop.md`'s typed checkpoint + `query_analysis_memory` design (proposed, unrun) |
| Read-only sealed execution boundary, one-statement SQL gate | `eval/chat/17-duckdb-local-chat/sqlGuard.ts`, `database.ts` |
| Grain-explicit named views as a hand-rolled transform precedent | `eval/chat/17-duckdb-local-chat/catalog.ts` (`analytics.sales_lines`, `analytics.order_totals`) |
| DuckDB-Wasm in-browser precedent | `eval/duckdb/duckdb.ts` |
| Small-model SQL generation ceiling data | exp 16, `eval/claude/16-light-model-sql-ceiling/` |

## Sketch

```text
user question or exploration goal
  -> model proposes a named transform: name, upstream tables/views, SQL, one-line semantic description
  -> host validates (same class of gates as exp 17: single statement, allowlisted sources, read-only)
  -> DuckDB-Wasm materializes it as a view, client-side
  -> the transform is registered as a node: name, SQL, upstream nodes, timestamp, accepted assumptions
  -> it immediately becomes queryable AND becomes a node other transforms may build on
  -> the user can open any node and read the exact SQL that produced it -- the audit trail is the
     lineage graph, not a chat log
```

**Memory model** (exp 15's idea, applied to lineage instead of findings): each turn's context is not the
prior transcript. It is the current lineage DAG plus a typed checkpoint of accepted assumptions. A
cleared-context turn queries the DAG the same way exp 15's analyst queried `query_analysis_memory`.

**MCP model** (exp 14's idea): the transform catalog is exposed as one more operation family alongside
the existing ~16. "Propose a transform" and "list existing transforms" become tools; DataScope still
owns execution and hands back the exact SQL it ran.

## Non-goals

- No claim that a model-proposed transform is semantically correct because it executes. Same posture as
  exp 17's non-goals: execution success is not correctness.
- No write access; no transform that mutates a source table. Transforms are views over the allowed
  source set, never `CREATE TABLE` against source data.
- No product/app integration yet. Like exp 17, this stays an isolated `eval/` harness until a staged
  result justifies the master-spec pipeline (Part II governance) for a real product surface.
- No simultaneous test of MCP exposure and cleared-context in the first build — see staged build order.
- No fine-tuning, no vector DB/embeddings, no autonomous unbounded loop — same boundaries as exp 17.

## Staged build order

Three previously-unrun ideas stacked into one build would make a bad result ambiguous — no way to tell
whether the transform interface, the MCP surface, or the clearing boundary caused it. Stage and gate each
addition on the previous stage's harness being green, same discipline as exp 17's build order:

1. **Transform generation + lineage, retained context, no MCP.** Smallest version of the new idea: model
   proposes named transforms in an ordinary chat loop (reuse exp 17's `chat.ts` shape), host validates
   and materializes, lineage recorded and inspectable. This alone tests the actually-new claim —
   everything else here is prior art.
2. **MCP exposure.** Wrap the transform catalog (propose / list / query) as MCP tools per exp 14's
   already-designed operation-catalog shape. Retained context still.
3. **Cleared-context ablation.** Only once 1 and 2 are green: repeat exp 15A's fixed-midpoint clearing
   protocol, but with the lineage DAG plus typed checkpoint as the queryable memory instead of exp 15's
   original `analysis.findings` ledger.

## Open risks

- Exp 14 and exp 15 are both unrun ideation, not validated architecture — this idea inherits their
  design but not any evidence that either works.
- Exp 17's live findings (qwen3:4b misclassifying answerable questions as unsupported with thinking off;
  a SQL-corruption glitch in structured output) apply here too, since transform proposals go through the
  same kind of structured-output contract. Stage 1 should expect the same failure modes and budget for
  them before blaming the new transform mechanism.
- Lineage on top of a session-local DuckDB-Wasm instance raises a question this outline does not answer:
  does the DAG persist only within one browser session, or across a page reload? That has to be decided
  explicitly in stage 1, not discovered by accident.
