# 04.1 Monaco Editor Integration

**Tier:** v0 · Phase 2 · **Master spec:** §10 Module 2, §15

> **Amended by D73 (2026-07-26) — v0.70 / S3.** The lazy boundary moves: Monaco loads on **the
> console's first open**, never on the shell's mount, because the drawer hosting it is present in
> every session. "Never touches the initial bundle" is unchanged as a requirement; what counts as
> the trigger is not (§15).

## Objective

Monaco with SQL highlighting and DuckDB-aware autocomplete, lazy-loaded so it never touches
the initial bundle.

## Spec

- **Lazy-load** via `React.lazy()` + `Suspense` when the SQL tab is first opened (§15);
  the ~2MB chunk must not load before that (§22 gate).
- SQL syntax highlighting; **auto-completion for table and column names** sourced from the
  table registry + schema store — updates when tables are added/dropped/derived.
- Run action (button + keyboard shortcut) dispatches through `services/sql.ts`
  (`runQuery()`), showing timing in the status console.
- Editor content is session state (query store); query history recorded (`getHistory()`).
- Integration approach (raw `monaco-editor` vs `@monaco-editor/react`) is **ADR-004**.

## Files

`src/features/sql/` (MonacoWrapper, completion provider), `src/services/sql.ts` wiring.

## Dependencies

[../02-ingestion/02-duckdb.md](../02-ingestion/02-duckdb.md) (execution),
[../02-ingestion/03-table-registry.md](../02-ingestion/03-table-registry.md) (completion source).

## Acceptance criteria

- [x] Monaco chunk lazy-loads on first SQL-tab click, not before (§22)
- [x] Autocomplete offers current table + column names, including derived tables
- [x] Query executes and reports timing; errors surface in the results area, user-friendly
- [x] History records every executed statement

## Test plan

Bundle analysis for the lazy gate. Component test: completion source reflects a mocked
registry. E2E: open SQL tab (observe chunk load), autocomplete a column, run a query.

## Definition of done

ADR-004 recorded; editor usable against any bundled sample with working completion.
