# Backlog: Adjacent & Alternative Tool Concepts

**Tier:** backlog — unadopted ideation, no decision · **Master spec:** §20.12

These come from the original brainstorm that produced the Studio pivot. The **adopted**
ideas already live in the plan and are *not* repeated here:

| Adopted idea | Where it lives |
| :--- | :--- |
| Broad analytics platform ("Analytics Playground") | DataScope Studio identity — D12 |
| Semantic Layer Builder | Semantic modeling engine — D11, §20.6 |
| dbt export | Generated dbt project (Studio arc) — §20.6 |
| Data-quality / contract checking (report side) | Data-quality report — D14, §20.8 |

Everything below is **uncommitted** — recorded so the discarded options aren't
re-derived. No decision attaches to any of it.

## Bucket A — DataScope-adjacent features

Could extend the Studio arc without a new app. Plausible post-Studio feature backlog.

- **Query optimizer** — paste SQL → `EXPLAIN` plan, bottleneck/join analysis, rewritten
  query, estimated savings. Extends the SQL playground (`../build/04-sql/`).
- **SQL/CTE debugger** — step through a query, showing each CTE's intermediate result set.
  Also a SQL-playground extension.
- **Data-contract validator** — validate a `schema.yaml` against uploaded rows (nullability,
  enum, breaking-change detection). Overlaps the quality report (§20.8); the distinct angle
  is an explicit contract diff / CI gate.
- **Interactive dbt / lineage explorer** — drag-around graph UI over the generated dbt
  project (SQL, docs, tests, freshness, column-level lineage). The *export* already ships
  (§20.6); this is the browsing UI on top of it.

## Bucket B — separate-product concepts

Own apps, not DataScope features. Captured only so the idea survives.

- **Delta Lake / lakehouse visualizer** — commits, checkpoints, versions, schema evolution,
  compaction; plus a Bronze→Silver→Gold simulator animating record movement, merges, and
  replayed failures.
- **BI dashboard reverse-engineer** — ingest PBIX / Tableau / Looker metadata → lineage,
  metrics catalogue, extracted SQL, dependency graph.
- **Data-warehouse "time machine"** — git-for-warehouses: diff schema / rows / columns /
  constraints across snapshots.

**Revive trigger:** an explicit decision to extend the SQL/Studio surface (Bucket A) or to
start a new project (Bucket B). Re-read §20.12 before acting.
