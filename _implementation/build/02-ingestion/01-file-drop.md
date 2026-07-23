# 02.1 File Drop & Format Policy

**Tier:** v0 · Phase 1 · **Master spec:** §7.1 (formats), §7.2 (flow)

## Objective

A drop zone (plus file picker and sample selector) that ingests CSV/TSV, Parquet, and
JSON/JSONL through DuckDB's native readers, with clear rejection of everything else and live
telemetry during load.

## Format policy (§7.1 — DuckDB native readers only, no third-party parsers)

| Format | Support | Implementation |
| :--- | :--- | :--- |
| CSV / TSV | primary | `read_csv_auto()` — auto headers, delimiters, encoding, types |
| Parquet | primary | `read_parquet()` — columnar, metadata-first, fast |
| JSON / JSONL | Full | `read_json_auto()` — nested objects auto-flattened |
| Excel XLSX | not supported (D8) | Modal: *"Excel files are not supported directly. Please export your spreadsheet as CSV (File → Save As → CSV) and re-upload."* SheetJS is backlog. |
| SQLite | future | DuckDB attach; backlog |

## Ingestion flow (§7.2)

```typescript
// 1. User drops a file into the React drop zone
const buffer = await file.arrayBuffer();

// 2. Register in DuckDB's virtual filesystem (VFS)
await db.registerFileBuffer(file.name, new Uint8Array(buffer));

// 3. Create a queryable table
const conn = await db.connect();
const ext = file.name.split('.').pop()?.toLowerCase();

if (ext === 'parquet') {
  await conn.query(`CREATE TABLE dataset AS SELECT * FROM read_parquet('${file.name}')`);
} else if (ext === 'json' || ext === 'jsonl') {
  await conn.query(`CREATE TABLE dataset AS SELECT * FROM read_json_auto('${file.name}')`);
} else {
  await conn.query(`CREATE TABLE dataset AS SELECT * FROM read_csv_auto('${file.name}')`);
}
```

(Table naming/de-dup comes from the registry — [03-table-registry.md](03-table-registry.md);
size checks run *before* step 1 — [05-large-files.md](05-large-files.md).)

**Ingestion telemetry panel** (live during load): file size + detected format, rows/columns
parsed, elapsed time (DuckDB is typically < 500 ms for a 50MB CSV), tab memory footprint.
Build it reusable — the same UI shows API pagination progress in v0.5 (§7.4).

## Files

`src/features/ingestion/` (DropZone, SamplePicker, TelemetryPanel, format policy),
`src/services/ingestion.ts` (`loadDataset()` / `removeDataset()`).

## Dependencies

[02-duckdb.md](02-duckdb.md) (worker + VFS APIs — build together); registry for naming.

## Acceptance criteria

- [ ] CSV, Parquet, JSONL each ingest into a queryable table via the correct reader
- [ ] .xlsx / .pdf / .zip → clear, non-technical error modal (exact D8 copy for xlsx)
- [ ] Malformed CSV (mismatched column counts) → DuckDB error caught, shown user-friendly (§22)
- [ ] Empty CSV (headers only) → graceful empty state, not a crash (§22)
- [ ] Telemetry panel shows size/format/rows/elapsed/memory during ingest
- [ ] Bundled samples selectable and loading from the ingestion screen (§14)

## Test plan

Worker integration tests per format + the §21.6 failure fixtures (malformed CSV, duplicate
columns, UTF-16, null-heavy, empty). E2E: drop each bundled sample, assert table exists and
telemetry rendered.

## Definition of done

All §22 ingestion edge cases pass; unsupported-format copy reviewed; telemetry component
documented for reuse.
