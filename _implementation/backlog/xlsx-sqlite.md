# Backlog: XLSX & SQLite Support

**Tier:** backlog · **Master spec:** §7.1 (D8), §20.4

**XLSX (D8):** not in the foundation releases. Until revived, the drop zone shows the error
modal: *"Excel files are not supported directly. Please export your spreadsheet as CSV
(File → Save As → CSV) and re-upload."* Revival path: SheetJS integration — deferred because
it costs ~300KB gzipped against a 500KB initial-bundle budget
([`../foundations/performance-budgets.md`](../foundations/performance-budgets.md)); if
added, it must be a lazy chunk.

**SQLite:** DuckDB can attach SQLite databases — post-MVP; the natural shape is another
ingestion format row in
[`../build/02-ingestion/01-file-drop.md`](../build/02-ingestion/01-file-drop.md) mapping
`.sqlite`/`.db` to an ATTACH flow, with each contained table registering in the table
registry like a folder drop.

**Trigger:** recurring user requests; XLSX especially is a likely early ask from the
analyst audience.
