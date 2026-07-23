# 02.3 Table Registry

**Tier:** v0 · Phase 1 · **Master spec:** §7.5 (D13)

## Objective

A single catalog of every table in the session — ingested or derived — driving the sidebar
list, the capabilities broker, SQL autocomplete, and (later) AI schema pruning.

This registry is the **table-registry component** named in the architecture doc (D58): the
catalog over the D49 `QueryEngine` that profiling, classification, capabilities, export, AI,
and drift all read. Its "no module keeps its own table list" invariant (see Definition of
done) is the single-catalog case of D58's no-parallel-pipelines principle (§6).

## Spec

- Registry entry (**`TableRegistryEntry`**, D58): **name, rows × cols, source (file / API /
  derived+SQL), memory footprint**, plus derived-from generating SQL. Sidebar renders the
  list (§7.5).
- **Naming:** table names derive from file names — sanitized (valid SQL identifier) and
  de-duplicated (suffix on collision). Single-file drop keeps the simple path (a lone
  `dataset`-style table is fine, but it still registers).
- Each registered table is profiled and classified **independently** (§8); the broker (§9)
  evaluates over the **union** of all registered tables.
- **Derived tables** (`CREATE TABLE AS` from the transformation layer, §12.1) register with
  their generating SQL recorded — that record powers one-click undo and redo/replay.
- Removal: dropping a table clears its profile, classification, and registry entries.
- This registry is the substrate the D17 spike and the whole Studio arc stand on (§7.5).

## Files

`src/stores/datasets.ts` (registry store), sidebar TableList component in
`src/features/ingestion/`, service functions `loadDataset()/removeDataset()/profileDataset()`.

## Dependencies

[02-duckdb.md](02-duckdb.md) (tables must exist in DuckDB), registry store from
[../01-foundation/02-state-management.md](../01-foundation/02-state-management.md).

## Acceptance criteria

- [ ] Every ingest path (file, folder, sample; later API/derived) lands in the registry
- [ ] Name collisions resolved deterministically; names always valid SQL identifiers
- [ ] Sidebar shows name, rows × cols, source, memory per table; updates live
- [ ] Removing a table drops it in DuckDB and purges profile/classification/registry state
- [ ] Derived tables carry their generating SQL

## Test plan

Unit: sanitizer/de-dup (nasty file names: spaces, unicode, dots, duplicates). Integration:
ingest 3-file folder → 3 entries; drop one → clean removal. E2E: §22 "folder with 3 related
CSVs → 3 registered tables, independently profiled."

## Definition of done

Broker, autocomplete, and profiling all read from this registry — no module keeps its own
table list.
