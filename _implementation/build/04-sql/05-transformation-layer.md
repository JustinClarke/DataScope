# 04.5 Transformation Layer (Derived Tables + Undo)

**Tier:** v0 · Phase 2 · **Master spec:** §10 Module 2 (transformation), §12.1 (undo)

## Objective

The playground is not read-only: users run DDL against their session — joins across
ingested tables, CTE pipelines, derived/feature tables — with cheap reversibility.

## Spec

Canonical example (§10 M2):

```sql
CREATE TABLE customer_features AS
SELECT
  customer_id,
  COUNT(orders) AS order_count,
  AVG(order_value) AS avg_order,
  MAX(order_date) AS last_order
FROM orders
GROUP BY customer_id;
```

- Derived tables are **re-profiled and re-classified like any ingested table** (registry →
  SUMMARIZE → classifier → broker), are exportable (§12.2), and appear in autocomplete.
- **One-click undo (§12.1):** transforms derive new tables rather than mutating sources, so
  every `CREATE TABLE AS` is recorded with its generating SQL; each derived table carries an
  undo that drops it and clears its profile/registry entries. The recorded SQL doubles as
  redo/replay.
- **Mutation guard:** statements that would mutate an ingested source table in place
  (UPDATE/DELETE/ALTER/DROP on a source) get a confirm prompt offering **"materialize as a
  new table instead" as the default**.
- Detection of statement class (query vs DDL vs mutation) happens before execution — a
  lightweight statement-type check now; it can graduate to the real parser once
  [`sqlLint`](../06-ai/01-pipeline.md) lands in Phase 4.
- **Reproducible transform recipe (D53, §12.1):** the ordered generating SQL of a session's
  derived tables *is* a recipe — export it as a re-runnable artifact ("do it once, re-run on
  next month's export"). v0 exports the recipe (the SQL is already recorded — free); one-click
  re-run against a newly dropped file is v0.5. The transform-side twin of the D44 Drift Report
  ritual and the analyst's retention hook.

## Files

`src/services/transforms.ts` (CTAS registration, mutation guard, materialize/force — the
engine-facing transform logic, following the same one-service-per-concern shape as
`services/charts.ts`/`services/ingestion.ts` rather than living in `features/sql/`),
`src/lib/statementClass.ts` (the statement-class helper) and `src/lib/recipeExport.ts` (pure
recipe-script builder), `src/features/sql/TransformGuardModal.tsx` (the confirm-prompt UI) plus
wiring in `SqlModule.tsx`, undo UI in `features/ingestion/TableList.tsx` (registry-store
actions: `registerDataset`/`removeTable`/new `setTableStats`).

## Dependencies

[../02-ingestion/03-table-registry.md](../02-ingestion/03-table-registry.md) (derived
entries), [../03-profiling/](../03-profiling/) (re-profiling path).

## Acceptance criteria

- [x] `CREATE TABLE AS` → new registered, profiled, classified, autocompletable table
- [x] Undo drops the derived table and purges all its state; redo replays the recorded SQL
- [x] Broker re-evaluates after derive and after undo
- [x] In-place mutation of a source table → confirm prompt with materialize-as-new default
- [ ] Derived table exports like any other (once §12.2 lands) — not gated by this item's own
      Definition of Done; a derived table is already queryable/exportable via the ordinary
      results-grid CSV/XLSX export (`04-sql/03-results-grid`) exactly like any other table, but
      the dedicated per-table Parquet export this row describes is `08-persistence/
      01-parquet-export`'s job (v0.5, unbuilt) — left unchecked until that item lands
- [x] A session's derived-table SQL exports as an ordered, re-runnable recipe artifact (D53)

## Test plan

Integration: derive from the e-commerce sample (the §10 example) → assert registry/profile/
undo/redo cycle. Unit: statement-class detection (SELECT / CTAS / UPDATE / DROP, with CTEs).
E2E: cross-table JOIN materialized, charted, undone.

## Definition of done

Derive → re-profile → undo loop demonstrably closed; mutation guard covered by tests; this
layer is what Phase 9's star-schema materialization will call (§20.6).
