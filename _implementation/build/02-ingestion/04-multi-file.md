# 02.4 Folder Drop & Multi-File Ingestion (D13)

**Tier:** v0 · Phase 1 · **Master spec:** §7.5

## Objective

Dropping a folder (or multi-selecting files) ingests every supported file as its own named
table — the substrate that makes the Studio arc's structural inference possible.

## Spec (§7.5)

- **Folder traversal:** `DataTransferItem.webkitGetAsEntry()` for drag-drop; a
  directory-picker input as the alternate path. Multi-select in the file picker also works.
- **Unsupported files inside a folder are skipped with one summary toast** — never per-file
  modals ("Ingested 4 tables; skipped 2 unsupported files (.xlsx, .txt)").
- Each supported file → its own table via the [01-file-drop.md](01-file-drop.md) flow,
  named/de-duped by the [registry](03-table-registry.md).
- **Aggregate memory budgeting:** pre-scan file sizes before ingesting anything; the §7.3
  tiers apply to the **aggregate** — warn at the 50MB combined threshold, offer per-file
  sampled mode when the folder exceeds it ([05-large-files.md](05-large-files.md)).
- **Cross-table SQL from day one:** playground and (later) AI see all registered tables;
  schema-pruned prompting (§11.1 stage 2) already assumes a multi-table catalog to prune.
- **ZIP-archive ingestion (D30, §7.5):** consumer platform exports (Spotify, Google
  Takeout) arrive as ZIPs, and consumers won't unzip-then-multi-select. A small client-side
  unzip library (e.g. fflate) expands the archive and feeds its supported files into this
  multi-file path (+1–2 days — the one honest engine addition behind the consumer template
  channel). Everything stays client-side; the ZIP is never uploaded.
- The e-commerce sample folder (§14) is both the demo and the D17 spike input.

## Files

Extends `src/features/ingestion/` (folder traversal, batch orchestration, summary toast,
pre-scan) — no new top-level modules.

## Dependencies

[01-file-drop.md](01-file-drop.md), [03-table-registry.md](03-table-registry.md),
[05-large-files.md](05-large-files.md) (pre-scan tiers).

## Acceptance criteria

- [ ] Folder of mixed supported/unsupported files → every supported file registered as its
      own profiled table; rest skipped with a single summary toast (§18)
- [ ] Cross-table JOIN across two ingested tables runs in the playground (§18)
- [ ] Combined-size warning fires on aggregate, not per file
- [ ] Multi-select behaves identically to folder drop
- [ ] E-commerce sample folder ingests as 4 correctly named tables
- [ ] A ZIP containing supported files ingests like a folder drop (D30); unsupported
      entries land in the summary toast; the aggregate size tiers apply to unzipped sizes

## Test plan

Integration: mixed-content folder fixture (2 CSV + 1 Parquet + 1 xlsx + 1 txt) → 3 tables +
1 toast naming 2 skips. E2E: e-commerce folder → 4 tables → run a JOIN. Aggregate-budget
test with a synthetic >50MB pair.

## Definition of done

D13 acceptance rows in [`../../foundations/testing-strategy.md`](../../foundations/testing-strategy.md)
pass; D17 spike can start (registry + folder ingest exist).
