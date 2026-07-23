# 01.2 State Management

**Tier:** v0 · Phase 1 · **Master spec:** §21.7 (state tree), §16 (`src/stores/`)

## Objective

Decide and implement where every piece of app state lives — React state vs. store vs. inside
the DuckDB worker — so later features never invent ad-hoc state channels.

## The state tree (§21.7 — defined up front per D18)

| State | Lives in | Notes |
| :--- | :--- | :--- |
| Dataset registry (tables: name, rows × cols, source, memory) | store | Fed by ingestion; consumed by sidebar, broker, SQL autocomplete |
| Schema / classified columns (per table) | store | Output of the classifier (§8); input to broker + AI prompts |
| Worker status (loading/compiling/ready/error) | store | Drives ingestion UX and error boundaries |
| Actual table data | **inside the worker** (DuckDB VFS) | Never copied into JS state; UI gets query results only |
| Active tab / module | store | Sidebar navigation |
| Current query + results | store (results possibly windowed) | Results grid virtualizes; don't hold 1M rows in JS |
| Chart specs | store | `ChartSpec` from the translator |
| AI session (transcript, attempts, mode) | store | v0.5; shape defined now (`AISession` type) |
| Settings (AI mode, BYOK reference, theme) | store, persisted to `localStorage` | The **only** persisted state — never dataset contents (§5.2) |
| Query history | store | Also feeds undo/redo for derived tables (§12.1) |
| Theme | store, persisted | |

Store-library choice (Zustand/Jotai/Redux/etc.) is **ADR-002**, written after the ingestion
spike shows the worker-communication shape; React Query or not is **ADR-003**.

## Files

`src/stores/` (one store per domain: `datasets.ts`, `query.ts`, `ui.ts`, `settings.ts`,
`aiSession.ts` stub), selectors/hooks alongside.

## Dependencies

[01-project-bootstrap.md](01-project-bootstrap.md) (types must exist first).

## Acceptance criteria

- [ ] Every row of the table above has exactly one implemented home
- [ ] Dataset contents provably never enter a JS store (only `QueryResult` windows)
- [ ] Settings survive reload; nothing else does; `localStorage` contains settings keys only
- [ ] Stores are unit-testable without a DOM

## Test plan

Unit tests per store (actions → state). A privacy-gate test: populate a dataset, reload,
assert `localStorage`/`IndexedDB` hold settings keys only (§22 privacy checklist).

## Definition of done

ADR-002/003 written from spike evidence; all later phase docs can name their state home by
pointing at this table.
