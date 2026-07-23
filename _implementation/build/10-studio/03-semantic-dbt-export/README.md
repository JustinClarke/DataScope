# 10.3 — Phase 9: Semantic Model & dbt Export

**Tier:** v1 · **Phase:** 9 (§19, D11) · **Design:** §20.6 · **Depends on:**
[Phase 8](../02-relationship-graph/)'s *accepted* graph — never raw inference (§17).

## Objective

Turn the accepted schema graph into artifacts an analytics engineer can own: a star-schema
proposal, a runnable dbt project, and a portable semantic model. The end of the §1 arc.

## Components (§19 Phase 9, §20.6)

- **Star-schema proposal** with one-click materialization — `CREATE TABLE AS` via the §10
  transformation layer
  ([../../04-sql/05-transformation-layer.md](../../04-sql/05-transformation-layer.md)),
  so proposals are undoable like any derived table.
- **dbt project export:** staging models (renames/casts), dimensional models, and a
  `schema.yml` carrying column descriptions plus `not_null`/`unique`/`relationships` tests
  **inferred from the profiling stats**. A scaffold for a human to review and own, not a
  deployed pipeline (§2).
- **Semantic-model export:** entities, relationships, measures, dimensions as a portable
  artifact — the schema half of the Context Bundle
  ([`../../../backlog/context-bundle.md`](../../../backlog/context-bundle.md)); the
  insight/history half stays backlog.
- **KPI suggestion** from the measures × dimensions grid ("revenue by month by region"),
  each backed by generated SQL and pre-wired into the chart modules.
- **Interactive schema documentation view**, linked to the graph.
- **Optional GitHub handoff:** commit the exported dbt project to a user repo
  (user-supplied token, explicit action; **zip download stays the default path**).
- **Companion "how-to" notebook** showing the dbt export → `dbt run` flow against the
  exported project.

## Files

`src/features/studio/export/` (proposal UI, dbt generator, semantic-model serializer, KPI
grid, docs view), GitHub handoff client.

## Deliverable & acceptance (§19 Phase 9)

- [ ] **Folder of Parquet in → reviewed semantic model + runnable dbt project out**
- [ ] Exported dbt project passes `dbt parse` / `dbt run` against the materialized tables
      (verify with the companion notebook flow)
- [ ] `schema.yml` tests reflect profiling stats (a column that's 100% unique gets `unique`)
- [ ] Everything generated traces to the accepted graph; edits to the graph regenerate cleanly
- [ ] KPI suggestions open as working charts
- [ ] GitHub handoff is explicit-action, token never stored; zip is the default

## Definition of done

The e-commerce sample round-trips to a dbt project that runs; export formats documented;
the §1 headline arc is demoable end-to-end, offline.
