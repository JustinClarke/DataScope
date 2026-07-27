## Log

- **2026-07-19** — Checklist created. No code exists; the spec is complete through D67
  and the split tree covers every item above. Next: the ingestion spike — stand up
  DuckDB-Wasm in a worker and prove file drop → registered table end to end.
- **2026-07-19** — Ingestion spike done: a disposable Vite + DuckDB-Wasm harness (outside
  this doc tree, thrown away) proved a file drop reaches a queryable table with real
  measured numbers, not estimates. Headline result — COOP/COEP is confirmed but not
  load-bearing: without the headers DuckDB-Wasm falls back to its `eh` (single-threaded)
  bundle, not the degraded `mvp` baseline, and stays fully functional, just slower on
  heavy aggregations over large files (1.8–3× slower on a 50MB CSV). Cold-start measured
  at 799ms/631ms (cold/warm, production build) against a <3s bar. ADR-001 is now Accepted
  from this evidence; full verdict in `architecture/decisions.md`'s Spike findings log and
  mirrored into master §21/§23.1. Next: **01-foundation/01-project-bootstrap** — stand up
  the real Vite+React+TS shell per ADR-001's decisions (same-origin asset bundling, lazy
  singleton worker init, COOP/COEP headers, `@duckdb/duckdb-wasm` pinned to 1.32.0 not
  `latest`). Open item, not a blocker: the D17 relationship-inference spike (row above)
  already has a full GO verdict recorded in `decisions.md` (dated 2026-07-12, predates this
  checklist file) but its box was never checked — the ▶ currently sits there since it's the
  next unchecked spike row, but a human should confirm whether that spike is actually done
  (and check it) or still needs running before trusting the pointer.
- **2026-07-19** — Confirmed: the D17 relationship-inference spike's GO verdict in master
  §20.6 (dated 2026-07-12, predates this checklist) is the real pre-written-kill-criteria
  result D17/D24 call for — clean recall 4/4 and 9/9 across the e-commerce and TPC-H
  corpora, zero confident false edges across 15 test cases, performance within budget on
  TPC-H and 24-table TPC-DS. Both spike rows are now checked. Next: **01-foundation/01-project-bootstrap**
  — stand up the real Vite+React+TS shell per ADR-001 (same-origin asset bundling, lazy
  singleton worker init, COOP/COEP headers, `@duckdb/duckdb-wasm` pinned to 1.32.0).
- **2026-07-19** — First real code lands: `01-project-bootstrap` done. **Code lives in
  `DataScope/app/` — a separate git repo, sibling to this docs tree, never referencing
  `_implementation/` or `DATASCOPE.md` per the writing rules above** (human decision, this
  session). Vite 8 + React 19 + TypeScript (`strict: true`, added — the template didn't turn
  it on by default) + Tailwind v4 via `@tailwindcss/vite`, with CSS custom properties for
  light/dark theme tokens. COOP/COEP (`same-origin`/`require-corp`) set in `vite.config.ts`
  for dev and preview, plus a `public/_headers` file (Cloudflare Pages/Netlify convention)
  for the deployed host — confirmed with a live headless-Chromium check (reusing the spike's
  cached Playwright browser), not just header inspection: `crossOriginIsolated === true`,
  `SharedArrayBuffer` defined. Production build is 60.16 KB gzip (budget: <500KB). §16 folder
  layout stood up (`features/*`, `components/`, `hooks/`, `workers/`, `services/`, `lib/`,
  `stores/`, `types/`, `public/samples/`), with the §21.4 interfaces (`Dataset`,
  `ClassifiedColumn`, `DataCapabilities`, `ChartSpec`, `ViewSpec`, `QueryEngine`,
  `TableRegistryEntry`, `QueryResult`, `WorkerMessage`, `WorkerResponse`, `AIMode`,
  `AISession`) and §21.8 service-contract stubs (`ingestion.ts`, `sql.ts`, `charts.ts`,
  `ai.ts`, `export.ts`) written and compiling clean under strict TS. **Two doc corrections
  landed master-first while building** (leaf doc predated later decision rounds): (1) §16's
  file tree said `src/data/samples/`, contradicting §14's `/public/samples/` — resolved to
  `public/samples/` (static, fetched at runtime, never bundled) and the tree fixed; (2) §21
  item 4 and the `01-project-bootstrap.md` type list still had D58's superseded placeholder
  names `ColumnMetadata`/`AnalysisCapability` instead of the actual `ClassifiedColumn`/
  `DataCapabilities` already used in §8/§9 and §16 itself — corrected in both places. `@duckdb/duckdb-wasm`
  itself is **not yet a dependency** — that's `02-ingestion/02-duckdb.md`'s job. Next:
  **01-foundation/02-state-management** — the stores (dataset, schema, tabs, query, AI
  session, settings) per the §21 state-tree item. No blockers.
- **2026-07-19** — `01-foundation/02-state-management` done. Five Zustand stores now give
  every §21.7 state-tree row exactly one home: `stores/datasets.ts` (dataset registry +
  per-table classified columns + worker status — the D58 registry catalog; never raw row
  data), `stores/query.ts` (current SQL + windowed result + history + chart specs, as a
  plain running/success/error state machine, no cache library involved), `stores/ui.ts`
  (active sidebar module + tab), `stores/settings.ts` (the only persisted store —
  `zustand/middleware`'s `persist` to `localStorage`, AI mode/BYOK preference/theme), and
  `stores/aiSession.ts` (v0.5 stub matching the `AISession` type, never persisted since its
  transcript is content-bearing). 23 unit tests pass with no DOM except a jsdom-backed
  privacy-gate test that populates a dataset, changes a setting, and asserts `localStorage`
  holds the settings key only — the dataset's name and id never appear in the persisted
  blob. Typecheck, lint, and build are clean; production bundle is still 60.16 KB gzip
  (Zustand's cost didn't move the number). **ADR-002 (state library) and ADR-003 (React
  Query) written and accepted** from ADR-001's worker-communication finding (single
  lazy-init worker, id-correlated async calls, one caller per query) rather than a new
  spike: Zustand fits because store actions are callable from the worker's `onmessage`
  handler with no dispatch/provider indirection; React Query is explicitly **not** adopted
  for v0 because the worker boundary has no networked staleness/multi-consumer-cache problem
  to solve — plain store actions (`queryStarted`/`querySucceeded`/`queryFailed`) cover it,
  revisit trigger is `07-connectivity`'s real network fetches in v0.5. Next:
  **01-foundation/03-routing** (Haiku) — the last foundation item; §16's file layout and the
  `ui` store's `activeModule`/`activeTabId` fields already give it a home to route into. No
  blockers.
- **2026-07-19** — `01-foundation/03-routing` done: the persistent app shell renders — header,
  sidebar, main workspace, educational panel slot, status console — with a live headless-browser
  check (not just component-test assertions) confirming computed colors and a fully-visible,
  pinned status console at 1280×800. Sidebar renders eleven cards (`Sidebar.tsx`) gated live off
  `useDatasetsStore`/`useSettingsStore`: Ingest and Learn always on; Profile/SQL/Export gate on
  `tables.length > 0`; AI Chat gates on `aiMode !== null`; Studio/ML are hardcoded off with
  "Coming in Studio"/"Coming soon" copy pending their own build items. Time Series/Correlation/
  Distribution gate on a new pure helper, `deriveShellCapabilities(tables)`, that reads each
  table's optional `ClassifiedColumn[]` — today always empty since no classifier has landed, so
  all three correctly render disabled; the profiling item just needs to populate `columns` for
  this to light up, no shell change required. **Correction to `02-state-management`'s `ui.ts`,
  not a leaf-doc deviation** (`02-state-management.md` only specified "active tab/module" as a
  concept, no concrete union) — `SidebarModule`'s single `'charts'` value didn't match §13's
  module table, which gates time-series/correlation/distribution independently with distinct
  tooltip copy ("Needs 2+ numeric columns" etc.); replaced with the three specific ids plus
  `'learn'`, which §13's sidebar list included but the store never had. Routing is state-based
  (`activeModule`/`activeTabId`, no router dependency) per the open call `03-routing.md` left to
  this item. Caught and fixed two bugs the Haiku build's own `make check` couldn't see, since
  nothing in it renders real CSS or a real viewport: (1) every new component styled itself with
  `text-color-fg`/`border-color-border`/`bg-color-accent`-style classes that don't exist in
  Tailwind's generated set — the `@theme` block names the token `fg`/`border`/`accent`, not
  `color-fg`/`color-border`/`color-accent` — so the whole shell compiled clean and passed 50
  component tests while rendering with zero color, border, or background styling; fixed by
  switching to the arbitrary-value form (`text-(--color-fg)`) the bootstrap item already
  established. (2) the root shell used `min-h-svh` (a floor, not a cap), so content taller than
  the viewport grew the whole page instead of clipping — the status console rendered correctly
  but sat below the fold, unreachable without scrolling the document; fixed to `h-svh`. Verified
  with Playwright (borrowing the ingestion spike's browser install — `app/` has no browser-test
  dependency of its own yet) rather than trusting textContent-only component tests. 61.55 KB→
  63.45 KB gzip entry chunk (budget 500KB). `make check` clean: lint, typecheck, 50/50 tests.
  **Open gap, not a blocker for the next item:** `01-foundation/README.md`'s folder exit
  criteria requires "CI running lint + unit tests," but no leaf doc under `01-foundation`
  actually scopes a CI workflow file, and `app/` has none — the folder's outer checklist row
  stays unchecked pending a human call on whether that's a fourth foundation item or folds into
  a later one. Next: **02-ingestion/01-file-drop** (Sonnet) — the file-drop zone Ingest already
  has a sidebar destination for; no blockers on this item itself.
- **2026-07-19** — Follow-up refinement to the already-shipped `01-foundation/03-routing`, human
  request, no functional change: the sidebar and menu button rendered emoji glyphs as icons; now
  `lucide-react` — tree-shaken per-icon imports (FolderInput, ClipboardList, Terminal, LineChart,
  ScatterChart, BarChart3, Bot, Share2, Network, Brain, BookOpen, Menu), verified as real SVGs in
  a live render, +1.74 KB gzip (65.19 KB, still well under the 500KB budget). Master and every
  leaf doc's ASCII mockups/tables also had their emoji-as-icon shorthand and status glyphs
  (done/warning/future/sparkle marks, the color-square legend) stripped to plain text
  master-first — human request
  covered docs as well as code, since the emoji in diagrams describe the same UI the app renders.
  No design/behavior changed, only notation; §13's diagram now labels the hamburger control
  "[Menu]" instead of a glyph, keeping the two-control header intent legible without one.
- **2026-07-19** — In progress, session ended on context limits before either box below could be
  checked — **substrate for `02-ingestion/02-duckdb` landed, `01-file-drop` not started.** What
  exists: `src/workers/duckdb.worker.ts` (an Opus build) is a lazy-singleton DuckDB-Wasm engine —
  reuses the ingestion spike's proven same-origin-bundle/`selectBundle` approach, pinned exact
  `@duckdb/duckdb-wasm@1.32.0` + `apache-arrow@17.0.0` (not caret-ranges — bare `latest` resolves
  to a dev prerelease per the spike), guards React StrictMode's double-invoke with a module-level
  singleton *promise*, and implements the `QueryEngine` interface from `types/query.ts`
  (`execute`/`registerFile`/`summarize`) rather than the `WorkerMessage`/`WorkerResponse` envelope
  — that envelope is for a future *actual* custom worker (`ml.worker.ts`), and wrapping
  `AsyncDuckDB` in a second postMessage layer on top of the one it already runs internally would
  be exactly the redundant routing layer A.2 debunks. Cancellation rides `execute`'s `AbortSignal`
  via `conn.send()`/`conn.cancelSent()`, normalized to a real `AbortError` so a cancel is
  distinguishable from a failure; worker crash/OOM drives `workerStatus: 'error'` with a message
  and drops the dead singleton so the next use rebuilds clean. `src/services/sql.ts` now has a
  real `runQuery`/`cancelQuery`/`getHistory` on top (single in-flight query, a new run supersedes
  the previous one — matches the one query panel that exists today). `src/hooks/useDuckDB.ts`
  exposes status + explicit init/reset. New: `src/lib/arrow.ts` (`QueryResult` shaping from a real
  Arrow table — BigInt columns collapse to `number` in-range, decimal string out-of-range, since
  BigInt isn't JSON-safe). Entry chunk unaffected (65.19 KB gzip, unchanged) — the engine is only
  reachable via dynamic `import()` and nothing calls it yet, confirmed via `make build`.
  **One deviation caught and corrected in review, this session:** the build agent placed the
  engine at `src/lib/duckdb.ts` reasoning that `*.worker.ts` misdescribes a file that runs on the
  main thread and only owns a `Worker` — reasonable in isolation, but §16 freezes
  `workers/duckdb.worker.ts` by exact path (twice — the tree and this leaf doc's own Files line)
  and `lib/` is documented as a specific, disjoint set of pure-logic modules (classifier,
  capabilities, chartMapper, etc.), none of them engine code. Moved back to the frozen path,
  fixed the two import sites; no doc change needed since this restores rather than deviates from
  §16. **Also this session, unrelated to either checklist item:** `Tooltip.tsx` positioned
  disabled-card tooltips centered (`left-1/2 -translate-x-1/2`) inside the 128px sidebar — on
  `SidebarCard`'s longer `disabledReason` strings (e.g. "Drop a dataset to get started") the
  tooltip overflowed both edges and got clipped unreadable by an ancestor `overflow-hidden` (human
  caught this live, screenshot showed the text sheared to "...o a dataset to get sta..."). Fixed
  to open rightward (`left-full ml-2`, vertically centered) — the standard pattern for an
  edge-docked icon sidebar; only consumer is `SidebarCard`, so no other call site to check.
  `make check` (57 tests) and `make build` both clean as of this entry.
  **Not done, explicitly out of scope for the agent that built the substrate above:** no UI
  (drop zone, sample picker, telemetry panel, progress bar, crash/reload affordance),
  `services/ingestion.ts` is still the stub (`loadDataset`/`removeDataset`/`profileDataset` need
  to call `registerFile`/`execute`/`summarize`), file-format detection/routing (CSV/Parquet/JSON,
  xlsx rejection copy) untouched, no bundled sample CSVs exist yet (`public/samples/` is still
  just `.gitkeep` — §16 names the exact files: `ecommerce/` folder, `titanic.csv`,
  `stock_prices.csv`, `product_reviews.csv`, `weather.csv`), and **nothing has been verified in a
  real browser** — cold-init <3s, an actual query round-trip, and cancel-actually-aborting are all
  unverified beyond `make check`'s jsdom-only unit tests (jsdom can't run a real Worker+WASM
  instantiate; a live check was planned via Playwright, reusing the spike's browser install per
  the `03-routing` precedent, but the session ended first). A silent `worker.terminate()` with no
  `error` event would also still hang `execute()`'s pending promise — flagged by the build agent,
  not closed; likely wants a query-level timeout, a call better made alongside the UI layer.
  Neither checklist box is checked — do not check `02-duckdb` until the live-browser verification
  above actually runs. **Next: live-verify the engine first** (drop the reference sample/a
  hand-made CSV against a real `npm run dev`, confirm init/query/cancel work, check `workerStatus`
  reaches `'error'` on a forced failure), *then* build `01-file-drop` (Sonnet) — DropZone,
  SamplePicker, TelemetryPanel, format policy, wiring `services/ingestion.ts` — using the now-real
  `duckDBEngine`/`sql.ts` surface. Bundled samples need generating from scratch; none exist. No
  blocker, just unfinished.
- **2026-07-19** — `02-ingestion/02-duckdb` live-verified and checked (Sonnet, continuing the
  substrate above). Since nothing calls the engine yet, verification drove it directly in a real
  Chromium tab via Playwright, dynamically importing `src/workers/duckdb.worker.ts` and
  `src/stores/datasets.ts` straight off the Vite dev server (no throwaway UI needed) — closer to
  the actual worker-boundary contract than a mocked unit test. All four acceptance-criteria
  behaviors confirmed live: cold init 726ms / warm init 0.1ms (both well under the 3s bar, though
  this number is dev-server-unthrottled — see gap below), a real CSV register→create→query round
  trip at 10ms (bar: <100ms), cancel genuinely aborts a deliberately slow cross-join mid-flight
  (`AbortError`, not a false-positive fast-finish), and a synthetic `Worker` `error` event correctly
  flips `workerStatus` to `'error'` with a message *and* a subsequent `initEngine()` recovers clean
  in 660ms — the crash path doesn't hang. **Found and fixed a real bug in the process:**
  `lib/arrow.ts`'s `normalizeCell` only handled plain `bigint` (DuckDB `BIGINT`); a `SUM` over a
  `BIGINT` column returns `HUGEINT`, which duckdb-wasm's Arrow layer surfaces as a `BN` (a
  `Uint32Array` subclass), not a `bigint` — that fell through untouched and leaked as a raw indexed
  object (`{0:60,1:0,2:0,3:0}` instead of `60`) once it crossed a serialization boundary (history,
  future exports). Fixed via `apache-arrow`'s own `util.bigNumToBigInt`, then reused the existing
  safe-range-to-`number`/decimal-string collapse — same fix path, one new branch. `make check`
  (57/57 tests, lint, typecheck) clean after the fix. **Two things deliberately left unverified,
  neither a blocker:** the Fast-3G-throttle cold-init acceptance criterion couldn't be measured
  against a real *production* asset — Rollup correctly emits no chunk at all for the engine since
  nothing reachable from `main.tsx` imports it yet (proves the "absent from initial bundle"
  criterion, but means there's no built chunk to throttle-test until a real call site exists); and
  the flagged silent-`worker.terminate()`-without-an-`error`-event hang risk is still open — this
  session's crash test dispatches a genuine synthetic `error` event (what a real crash fires), not
  a silent terminate, so that specific edge case is unchanged from last session's note. Both revisit
  naturally once `01-file-drop` gives the engine a real caller. Next: **02-ingestion/01-file-drop**
  (Sonnet) — DropZone, SamplePicker, TelemetryPanel, format policy, wiring `services/ingestion.ts`
  to the now-verified `duckDBEngine`/`sql.ts` surface; re-measure cold init against that real call
  site once it exists. Bundled samples (§14: `ecommerce/`, `titanic.csv`, `stock_prices.csv`,
  `product_reviews.csv`, `weather.csv`) still need generating from scratch.
- **2026-07-19** — `02-ingestion/01-file-drop` done (Sonnet), all six acceptance criteria live-verified
  end-to-end through the real running app (`npm run dev`, Playwright driving the actual DropZone/
  SamplePicker/file-input/modal — not a mocked harness), plus 85/85 unit tests and a clean production
  build. **A real, load-bearing engine bug surfaced and got fixed along the way, upstream of this
  item's own scope:** live-testing Parquet/JSON — flagged unverified in ADR-001 — found DuckDB's
  CDN-hosted loadable extensions (`parquet`, `json`) fail to link under the `coi` (threaded) bundle
  with a WASM shared-memory mismatch (`declared = 0, imported = 1`); confirmed the same extensions
  load and run correctly under `eh` (single-threaded), and that `coi` was genuinely being selected
  (`crossOriginIsolated: true`, `selectBundle()` picks `coi`) — not a bundle-selection bug on our
  side. Fixed by dropping `coi` from `duckdb.worker.ts`'s `BUNDLES` map so `eh` is the only bundle
  offered; **ADR-001 amended** (Decision 3, Unverified section, new Backlog note) with the finding
  and the self-hosted-extension follow-up idea. This trades away `coi`'s large-file aggregation
  speedup (still logged as a real cost, not hand-waved) for Parquet/JSON actually working — the
  correct call since two of the three v0-required formats were silently broken otherwise. Also
  **corrected `01-file-drop.md`'s own format table master-first**: it still said JSON/JSONL "lands
  Phase 2", contradicting master §7.1's "Full" — master is authoritative and already required JSONL
  in this item's own acceptance criteria, so the leaf doc was stale, not the source of truth; fixed
  to match. **What shipped:** `features/ingestion/formatPolicy.ts` (pure — format detection, D8's
  exact xlsx copy, DuckDB reader-function mapping, table-name sanitize/de-dup per §7.5's "named from
  the file name, sanitized, de-duplicated" rule reused early since 03-table-registry hasn't landed
  the fuller registry yet); `services/ingestion.ts` (`loadDataset`/`removeDataset` real, `File` and
  bundled-sample-id sources; `FileSystemDirectoryHandle` explicitly rejected with a clear message —
  folder/multi-file drop is 04-multi-file's scope, not guessed at here); `features/ingestion/`
  components (`DropZone`, `SamplePicker`, `TelemetryPanel` — built reusable per the leaf doc, phase-
  labeled rather than a fabricated percentage since `QueryEngine.execute()` has no progress callback
  to report against, `FormatRejectionModal`, `IngestionPanel` composing all four, wired into
  `App.tsx` for the `ingestion` module); `lib/formatBytes.ts` (deduped out of `StatusConsole`, now
  shared). **Two more real bugs caught live, both fixed:** (1) `registerFileBuffer` transfers the
  input `Uint8Array`'s underlying `ArrayBuffer` to the worker, detaching it on the main thread —
  code that read the buffer *after* registering it (for the malformed-CSV header sanity check) threw
  `Cannot perform Construct on a detached ArrayBuffer`; fixed by reading the header line before the
  register call, not after. (2) `read_csv_auto` never throws on a header/row column-count mismatch —
  verified live with both an under-count and over-count fixture — it silently falls back to a single
  generic column or to `column0..N` names, discarding the real header; DuckDB itself gives no error
  to catch here, so `formatPolicy.ts`'s `looksMalformed()` adds the sanity check §22 assumes exists
  (compare the header line's own field count against the ingested table's actual column count),
  dropping the bad table and raising a friendly error instead of silently registering garbage.
  Bundled samples generated (`scripts/gen-samples.mjs`, seeded/deterministic, not real passenger/
  customer data): `titanic.csv` (891 rows), `stock_prices.csv` (2,500), `product_reviews.csv` (500),
  `weather.csv` (3,650), `ecommerce/{customers,products,orders,order_items}.csv` (~5,400 rows across
  4 FK-linked tables) — all five §14 v0 samples; Spotify/Google-Takeout are unmarketed v0.5 template
  work per D30/D23, correctly out of this item's scope. Empty-CSV and null-heavy fixtures needed no
  special handling — verified live that DuckDB already degrades gracefully (0-row table, nulls in
  place) on its own. **Consistent with 02-duckdb/03-routing precedent, no permanent Playwright suite
  was added to `app/`** (still no browser-test dependency of its own) — verification was live and
  thorough but throwaway, same as those items' own handoff notes describe. Entry chunk 69.48 KB gzip
  (was 65.19 KB; +4.3 KB for the new UI, still far under the 500 KB budget); DuckDB/extension chunks
  confirmed absent from it via `npm run build`'s own output, first real evidence for that criterion
  now that a call site exists. Next: **02-ingestion/03-table-registry** (Sonnet) — the fuller
  registry (rename, replace, memory dashboard per §7.5) on top of the `registerDataset`/
  `removeDataset` primitives this item already uses directly. No blockers.
- **2026-07-19** — `02-ingestion/03-table-registry` done (Sonnet). The registry is now table-level,
  not dataset-level: a new `TableList` component (`src/features/ingestion/TableList.tsx`, mounted in
  `IngestionPanel`, replacing the old per-dataset "Loaded datasets" list it grew out of) renders every
  `TableRegistryEntry` — name, rows × cols, source (`file`/`sample`/`API`/`derived`), memory footprint
  — reading `stores/datasets.ts` directly so it updates live with no separate fetch. Name
  sanitize/de-dup (valid-SQL-identifier, collision-suffixed) was already built in `01-file-drop`'s
  `formatPolicy.ts` and reused as-is — confirmed still correct, no changes needed there. **New:
  table-level removal**, not just dataset-level: `removeTable()` (store action + `services/
  ingestion.ts` function) drops one DuckDB table and purges its registry entry without touching
  sibling tables from the same ingestion event — the ecommerce sample (one dataset, four tables) is
  today's real case for this, until `04-multi-file` adds folder drop as a second multi-table path.
  Removing a dataset's last table also removes the now-empty dataset itself (no orphan entry). Type
  addition: `TableRegistryEntry.generatingSql?: string`, so the registry shape already carries what
  `04-sql/05-transformation-layer` needs for derived tables — **that item still owns actually building
  `CREATE TABLE AS` registration, undo, and redo/replay; nothing here calls the new field yet**,
  deliberately, since the SQL-execution surface it depends on doesn't exist and guessing at that
  item's Dataset-vs-derived-table shape would be scope creep on a future item's design call.
  `profileDataset()` stays the unimplemented stub it already was — confirmed via `technical-overview.md`
  and `01-summary-statistics.md` that its real implementation is `03-profiling`'s job, not this one's;
  the Files line names it only because it lives in the same `ingestion.ts` file. **Test-plan deviation,
  not a leaf-doc error:** the leaf doc's own test plan assumes folder ingestion ("ingest 3-file folder
  → 3 entries"), which `04-multi-file` hasn't built yet; used the ecommerce sample (4 tables, one
  ingestion event) as the live stand-in for "multiple tables register independently, and removing one
  doesn't cascade to its siblings" — same shape the acceptance criteria actually require. Live-verified
  in a real Chromium tab (Playwright, throwaway script, same pattern as prior items): sample load
  produces 4 correctly-shaped rows (e.g. `customers 400 rows × 5 cols · sample · 400 B`); removing
  `products` leaves the other three both in the UI *and* queryable in DuckDB (confirmed a direct
  post-removal query against the live engine — `products` throws Catalog Error, `customers` still
  returns its row count); removing all four tables one at a time correctly removes the dataset too
  (heading disappears, no orphan). 16/16 test files, 93/93 tests, lint and typecheck clean; `npm run
  build` clean, entry chunk 69.68 KB gzip (was 69.48 KB; +0.2 KB), DuckDB chunks still absent from it.
  No blockers. Next: **02-ingestion/04-multi-file** (Sonnet) — folder drop / multi-select
  (`DataTransferItem.webkitGetAsEntry()` / directory-picker input), each file its own table via the
  now-live `TableList`/`removeTable` primitives, unsupported files skipped with one summary toast per
  §7.5, cross-file memory budgeting per §7.3's aggregate-threshold rule.
- **2026-07-19** — `02-ingestion/04-multi-file` done (Sonnet), all six acceptance rows live-verified
  through the real running app (`npm run dev`, Playwright driving the actual `<input>` elements —
  folder-picker, multi-select, and drag-drop's underlying handlers — not a mocked harness), plus
  113/113 unit tests (was 93) and a clean production build. **What shipped:** one Dataset, many
  tables per ingestion event (§7.5) — `services/ingestion.ts`'s new `loadFiles(files: File[])`
  mirrors `loadSample`'s existing one-dataset/N-tables shape rather than inventing a second one.
  Folder drag-drop and multi-select converge on the exact same `File[]` at the `DropZone` boundary
  and the exact same `loadFiles` call in `IngestionPanel` — satisfying "multi-select behaves
  identically to folder drop" by construction, not by parallel-tested code paths. New
  `features/ingestion/`: `folderTraversal.ts` (recursive `webkitGetAsEntry`/`FileSystemDirectoryReader`
  traversal, repeated `readEntries()` until empty per spec), `zip.ts` (`fflate`, new dependency —
  expands a ZIP's contents into the same batch path per D30, one level deep only, deliberately not
  recursing into a zip-in-a-zip to bound expansion work; `__MACOSX/` and `.DS_Store` entries dropped
  silently rather than counted as skips, or every macOS-zipped Takeout/Spotify export would misreport
  real skips), `aggregateSize.ts` (the pre-scan primitive — `AGGREGATE_WARN_THRESHOLD_BYTES` = 50MB,
  `aggregateBytes`/`exceedsAggregateWarnThreshold`), `SummaryToast.tsx` + `summarize.ts` (one
  dismissible toast per batch, never per-file modals — exact §7.5 copy shape: "Ingested 4 tables;
  skipped 2 unsupported files (.xlsx, .txt)."; a `kind: 'unsupported' | 'failed'` tag on `SkippedFile`
  keeps format-rejections and mid-ingest failures (a malformed file inside an otherwise-good batch)
  in separate toast clauses instead of string-sniffing reasons). `DropZone.tsx` now gathers files from
  three input methods — drag-drop (folder-recursing), a `multiple` file input, and a `webkitdirectory`
  folder-picker input (no first-class JSX/React typing for that attribute; suppressed with a
  documented `@ts-expect-error`, standard practice for this API) — accepts `.zip`, and reports a flat
  `File[]` either way. **Dependency-order note, not a deviation:** `04-multi-file.md` itself lists
  `05-large-files.md` as a dependency for "pre-scan tiers," but the checklist (rule 6) orders 04 before
  05 and 04's own acceptance criteria only require "Combined-size warning fires on aggregate, not per
  file" — built exactly that (the amber banner + `aggregateSize.ts` pre-scan, computed before the
  ingest loop starts) and left the fuller tier ladder (150MB sampled-preview mode, 400MB refusal,
  device-memory-headroom auto-downgrade) to 05, which should extend `aggregateSize.ts` rather than
  duplicate it. **Live-verified (Playwright, throwaway, real fixtures generated via a real DuckDB-Wasm
  `COPY TO ... FORMAT PARQUET` round-trip for the Parquet fixture, `fflate` for the ZIP ones — not
  committed, regenerable by any future session from the same recipe):** a mixed 5-file batch (2 CSV +
  1 Parquet + 1 xlsx + 1 txt) → 3 tables + toast "skipped 2 unsupported files (.txt, .xlsx)"; the real
  `public/samples/ecommerce/` folder through the folder-picker input → 4 correctly named tables, no
  skips; a cross-table `JOIN` over two of those tables returns rows (no SQL-playground UI exists yet —
  `04-sql` is unbuilt — so this verified the engine substrate directly, same technique
  `02-duckdb`/`03-table-registry` used, not a UI click-through); a ZIP with two supported entries plus
  `__MACOSX/`/`.DS_Store` noise → 2 tables, no false skips; a second ZIP with one supported + one
  unsupported entry → 1 table + toast correctly naming the 1 skip, confirming D30's own "unsupported
  entries land in the summary toast" bullet specifically, not just the general case; two ~30MB CSVs
  dropped together (>50MB combined) → aggregate warning banner fires, while one of the same files
  dropped alone does not — confirming the threshold is genuinely aggregate, not per-file. **One gap
  deliberately not closed, flagged rather than silently skipped:** the drag-and-drop folder-traversal
  code path itself (`folderTraversal.ts`'s recursive `webkitGetAsEntry` walk) could not be
  live-verified — Playwright/CDP has no way to synthesize a real OS-level folder drag-and-drop event
  with populated `FileSystemEntry` data, only real file picks (which Playwright's directory-path
  `setInputFiles` support did let it drive natively, and which share 100% of the code downstream of
  `DropZone`). That function is instead unit-tested against hand-built objects that faithfully
  duck-type the real `webkitGetAsEntry`/`FileSystemFileEntry`/`FileSystemDirectoryEntry`/
  `FileSystemDirectoryReader` contract, including the call-`readEntries()`-repeatedly-until-empty
  requirement the spec actually imposes — a reasonable substitute, not equivalent to a live drag.
  Entry chunk 74.70 KB gzip (was 69.68 KB; +5.02 KB — the new `fflate` dependency plus the
  batch/zip/toast code), DuckDB chunks still confirmed absent from it. `make check` clean (lint,
  typecheck, 113/113 tests). No blockers. Next: **02-ingestion/05-large-files** (Sonnet) — the full
  size-tier ladder (150MB sampled preview, 400MB refusal-with-guidance, low-headroom auto-downgrade)
  built on top of this item's `aggregateSize.ts` pre-scan rather than a second one; needs synthetic
  150MB/400MB fixtures generated at test time per its own test plan (don't commit them).
- **2026-07-19** — In progress, session ended on user handoff before the box could be checked —
  **implementation and unit tests are done and clean; one live-verification path has an unresolved
  failure, so the box stays unchecked.** What exists: `aggregateSize.ts` grew the full per-file tier
  ladder (`decideSizeTier`, `SIZE_WARN_THRESHOLD_BYTES`/`SIZE_SAMPLE_THRESHOLD_BYTES`/
  `SIZE_REFUSE_THRESHOLD_BYTES` at 50/100/300MB, `SAMPLE_ROW_LIMIT` = 100,000, `refusalMessage`
  producing D16's exact three-option copy) on top of the existing aggregate pre-scan, per this item's
  own handoff note above rather than a second pre-scan module. New `src/lib/memoryHeadroom.ts`: a
  pure `headroomExceeded(predictedBytes, signals)` over an injected `{ usedJSHeapSize,
  jsHeapSizeLimit, deviceMemoryGB }` — the "simulated" low-headroom acceptance criterion is exactly
  this injectability — plus a thin live wrapper reading `performance.memory`/`navigator.deviceMemory`;
  no signal available (Safari/Firefox) never forces a downgrade on a guess. The 1.7x estimated-
  footprint multiplier and the ~2GB tab-ceiling-scaled-by-`deviceMemory` budget are both derived from
  numbers already on record elsewhere in this tree (the ingestion spike's measured 50.7MB→~87MB ratio;
  master's own ~2GB tab ceiling), not invented. **Streaming registration lands**: `QueryEngine.
  registerFile` now takes `Uint8Array | File`; `duckdb.worker.ts` branches to `registerFileHandle(...,
  BROWSER_FILEREADER, true)` for a `File` (the duckdb-wasm package's own documented pattern for large
  uploads) instead of reading the whole thing into a buffer first. `services/ingestion.ts`: `loadFile`
  and `loadFiles`' per-file loop both gate on `decideSizeTier(file.size, ...)` using nothing but
  `File.size` before any read — refuse throws/skips before `loadEngine()` is ever reached for that
  file, sampled routes the raw `File` through the streaming path with `LIMIT 100000` appended to the
  `CREATE TABLE AS SELECT`, full/warn keep the original `arrayBuffer()` path unchanged. `TableRegistryEntry`
  gained `sampled?`/`sampleRowLimit?`; `TableList.tsx` renders a persistent, no-dismiss-control
  "sampled — first N rows" badge straight off the store (survives navigating away and back — verified
  live). `IngestionPanel.tsx` gates the size check client-side before calling the service (same
  precedent as the existing xlsx-rejection modal), showing the refusal modal, a warn-tier footprint
  banner, or a sampled-tier banner. `SkippedFile` gained a `'refused'` kind so a batch with one
  oversized file among otherwise-good ones still ingests the rest (`summarizeBatch` extended to name
  it). **A real, separate defect found and left flagged, not fixed:** this app repo's own
  `BUILD-ORDER.md` writing rules (above) ban section-number and decision-number citations in its code
  comments so the repo stands alone in a fresh clone — essentially every non-test source file already
  violates this (checked live: 28 files), predating this session. New/touched code in this session was
  written clean of those citations, but no attempt was made to retroactively clean the other ~25
  files — that's a repo-wide comment pass, out of scope for a single build item, and needs a human
  call on whether it's worth a dedicated cleanup pass. **make check is clean** (lint, typecheck,
  133/133 unit tests — up from 113, all new tests for the tier boundaries named in this item's own
  test plan: 49/51/99/101/299/301MB, plus headroom injection tests and component tests for the modal/
  banners/badge). **Live verification (Playwright, throwaway script + synthetic fixtures generated at
  test time via `spike-ingestion`'s existing `gen-csv.mjs`, none committed, reusing that project's
  playwright install per the 02-duckdb/01-file-drop precedent — `app/` still carries no browser-test
  dependency): 4 of 5 checks passed.** Passing: 60MB → warn banner with a real footprint estimate
  shown; 400MB → refusal modal in 10ms with all three guidance options and the engine never spun up
  (confirms the "no path reaches a read without a tier decision" property, not just unit-tested);
  low-headroom simulation (`navigator.deviceMemory` patched to 1 via `page.addInitScript`, matching
  the spec's named signal) correctly downgraded an otherwise-warn-tier 60MB file to sampled; the
  sampled badge was confirmed to survive navigating to another sidebar module and back. **Failing,
  unresolved:** the 150MB → sampled-preview check itself. The persistent-banner text ("Showing a
  100K-row sample") did appear and unblocked the wait, but the follow-up assertions in the same run —
  the "sampled — first 100,000 rows" `TableList` badge and a capped "100,000 rows" count in the page
  body — were both false at the moment they were checked. Not yet diagnosed: could be a real bug (the
  `LIMIT 100000` not taking effect against a `read_csv_auto` source, or `sampled`/`sampleRowLimit` not
  landing on the registry entry for this path specifically), or could be a test-script timing issue
  (checked `body.textContent` immediately after the banner text appeared, possibly before a re-render
  settled — the second sub-check in the same test, "badge persists across navigation," *did* pass a
  moment later, which argues for timing over a real bug, but this is not confirmed either way). **Next:
  diagnose the 150MB failure before checking this box** — rerun the same fixture with the row-count
  and badge assertions on a longer/retrying wait (or check `useDatasetsStore` state directly via
  `page.evaluate` instead of scraping body text) to tell a real LIMIT/registry bug apart from a test
  artifact; only check `02-ingestion/05-large-files` once that path is confirmed clean live, per this
  file's own rule that boxes only get checked against a met definition of done. No other blockers —
  the 60MB/400MB/headroom paths and all unit tests are solid. Housekeeping for the next session: the
  dev server this session started on port 5183 was stopped before handoff; synthetic fixtures lived
  only in this session's scratchpad (a fresh session gets a different scratchpad path, so regenerate
  via `spike-ingestion/scripts/gen-csv.mjs`, not carried over) — matches this item's own test plan,
  which never wanted them committed anyway.
- **2026-07-19** — `02-ingestion/05-large-files` diagnosed and checked (Sonnet). The 150MB
  sampled-preview failure flagged in the previous entry was confirmed live to be a test-timing
  artifact, not an engine or registry bug: a synthetic 150MB CSV
  (`spike-ingestion/scripts/gen-csv.mjs`, regenerated fresh, not carried over) dropped through the
  real running app (`npm run dev`, Playwright) shows the "Showing a 100K-row sample" banner at
  +453ms — fired optimistically in `IngestionPanel.tsx`'s `runIngest` from the size-tier decision
  alone, before `loadDataset` is even called — while the actual async ingest (streamed
  `registerFileHandle`, `CREATE TABLE AS SELECT ... LIMIT 100000`, registry write) doesn't settle
  until +1270ms. Checking the `TableList` badge immediately after the banner (the previous
  session's exact sequence) reproduces the failure (`count=0`); waiting past the ~800ms gap shows
  the badge correctly reading "sampled — first 100,000 rows" against a real "100,000 rows × 6
  cols" — the `LIMIT` and `sampled`/`sampleRowLimit` registry fields were never broken. No code
  changed; this was a diagnosis-only session. `make check` reconfirmed clean (22/22 test files,
  133/133 tests, lint, typecheck) with no changes made. Next: **03-profiling/01-summary-statistics**
  (Sonnet) — the first profiling item, first thing to read `ClassifiedColumn`-shaped output for
  real; no blockers, `02-ingestion` is now fully checked.
- **2026-07-19** — `03-profiling/01-summary-statistics` done (Sonnet). Every registered table now
  carries a real `SUMMARIZE`-derived profile, computed inline in `ingestBuffer`'s existing
  `Promise.all` (alongside the row-count/memory-size queries) so it lands on the
  `TableRegistryEntry` atomically at creation — live-verified against all five v0 samples
  (Playwright, real `npm run dev`, throwaway script): 25–103 ms warm ingest+profile per table/folder,
  ~550 ms on the session's first call (DuckDB-Wasm cold-init, matches ADR-001's ~700 ms baseline, not
  profiling cost). **New `ColumnProfile` type** (`src/types/schema.ts`) — the raw pre-classification
  shape §21.4 never named (it only names `ClassifiedColumn`); `ClassifiedColumn` now `extends
  ColumnProfile` by adding `semanticType`, so `02-column-classifier` (next) only has to add that one
  field. `TableRegistryEntry` gained `profile?: ColumnProfile[]`; `stores/datasets.ts` gained
  `setTableProfile`. **A real, previously-undetected bug found and fixed, upstream of this item's own
  scope:** `SUMMARIZE`'s `null_percentage` is `DECIMAL(9,2)`, surfaced through Arrow as the same `BN`
  wide-int wrapper HUGEINT sums use (`02-duckdb`'s earlier fix) — `lib/arrow.ts`'s existing collapse
  ignored the decimal's scale, so `25.00%` silently came back as `2500` (100x too large). Fixed by
  passing the Arrow column type through to `normalizeCell` and branching: a `Decimal`-typed value now
  divides by its `type.scale` (`util.bigNumToNumber`), everything else keeps the original path;
  confirmed live before (`2500`) and after (`25`) the fix. **A real type gap, not a bug, also found
  live:** a genuinely 0-row table's `null_percentage` is SQL `NULL` (no 0/0 to report), not `0` —
  `nullPercentage` was `number`, unable to represent this; **widened to `number | null` master-first**
  (`DATASCOPE.md` §8, mirrored into both profiling leaf docs and `schema.ts`) rather than fabricating
  a `0`. **Other live-verified SUMMARIZE quirks, all handled, none blocking:** `min`/`max`/`avg`/`std`
  are VARCHAR-cast for every column regardless of physical type (a BIGINT's `min` is the string `"1"`,
  not the number `1`) — kept as the given string rather than reparsed; a DATE column's `avg` is a
  formatted mean-timestamp string, not a number — `Number()`-parsed with a `null` fallback rather than
  surfacing `NaN`; a 5000-char VARCHAR value round-tripped with no truncation; `count` is always the
  table's total row count repeated per column (not a per-column non-null count), already available as
  `TableRegistryEntry.rowCount` — dropped from the query rather than special-cased, correcting this
  leaf doc's own SQL spec block to match. **Also fixed two stale references to D58's already-
  superseded `ColumnMetadata`/`AnalysisCapability` placeholder names** (`01-project-bootstrap`'s log
  already fixed two occurrences; these two — `architecture/system-design.md`'s §21.4 interfaces-first
  list and this leaf doc's own store-typing line — had lagged behind) — renamed to
  `ClassifiedColumn`/`DataCapabilities`, no functional change. **Re-profile-on-transform** (this
  item's other acceptance criterion) has no real caller yet since `05-transformation-layer` (the only
  future producer of a table whose shape changes post-creation) is unbuilt — added a standalone
  exported `profileTable(tableId)` alongside the inline ingest-time path specifically so that item can
  call it directly rather than reinventing profiling; nothing calls it today outside its own unit test
  (the unknown-table-id rejection path). 140 unit tests pass (up from 133 — new coverage:
  `lib/profile.test.ts`'s parser against fixture rows shaped exactly like the live-observed output,
  `lib/arrow.test.ts`'s Decimal-scale regression test built from a hand-constructed Arrow `Decimal`
  vector), lint and typecheck clean, production build clean (entry chunk 75.88 KB gzip, was 74.70 KB —
  the new profiling code; DuckDB chunks still separate). No blockers. Next:
  **03-profiling/02-column-classifier** (Opus — inference/judgment tier, per this file's own model
  rule) — reads `ColumnProfile[]` off the registry this item populates, adds `semanticType` per §8's
  classification-rules table, and the manual-override affordance §17 calls for; the store's
  `setTableColumns` action already exists (built ahead of need, in `01-foundation/02-state-management`)
  and is this item's obvious write target.
- **2026-07-19** — `03-profiling/02-column-classifier` done and checked (Opus). Every ingested table now
  lands in the registry already semantically typed: `lib/classifier.ts` is the pure classifier
  (`classifyColumn` per the exact §8 rules table — Temporal → near-unique Identifier → numeric
  Categorical/Quantitative split at 15 distinct → string Categorical/Textual split at 100), and
  `services/ingestion.ts` classifies inline off the SUMMARIZE profile at ingest time, so `ClassifiedColumn[]`
  is written atomically alongside the profile with no second store round-trip. The sidebar's
  `deriveShellCapabilities` (built in `03-routing`, dormant until now because no table had `columns`)
  lights up for real for the first time — Time Series / Correlation / Distribution gate off live temporal
  and quantitative column counts. **What now works, verified live** (Playwright driving real ingestion
  through the actual service + worker + DuckDB off `npm run dev`, then reading `ClassifiedColumn[]`
  straight from the store — not a mocked harness): all four v0 sample datasets (7 tables, 41 columns)
  classified end-to-end in ~760ms warm; every named acceptance example holds against the real engine —
  Titanic `Survived`/`Pclass` → Categorical, `Age`/`Fare` → Quantitative, near-unique `PassengerId`/
  `email`/`order_id` → Identifier, `Date`/`signup_date`/`order_date` → Temporal, low-cardinality `status`/
  `country`/`Embarked` → Categorical. A manual override applied live (`reclassifyColumn` on
  `PassengerId` → Quantitative) re-wrote just that column and stamped its reason "Set manually to
  Quantitative", leaving siblings untouched. **A real, load-bearing bug found in live verification and
  fixed — the classifier as literally specified was wrong on real data.** §8's reference `classifyColumn`
  decides the near-unique identifier rule on `SUMMARIZE`'s `approx_unique`; that value is a HyperLogLog
  estimate, and against the real samples it *overshot the row count* — Titanic `PassengerId` reported
  1051 distinct on 891 rows (118%), `Fare` 936 (105%) — pushing `Fare`, a textbook continuous column
  named in this item's own acceptance criteria, over the 0.95 threshold and mislabeling it **Identifier**.
  No clamp or threshold tweak on `approx_unique` can separate `Fare` (true ratio 0.938) from a genuine ID,
  because the estimate for `Fare` exceeds the row count outright. Fixed by deciding the near-unique test on
  an **exact `COUNT(DISTINCT)`** per column (one extra single-pass query at ingest — cheap at v0 local
  sizes); `ColumnProfile.cardinality` keeps the raw `approx_unique` for display, `ClassifiedColumn.cardinality`
  now carries the exact count that drove classification. With the fix, every column's live classification
  matches the documented per-sample table exactly (`Fare` → Quantitative on 836 exact distinct, `Volume` →
  Identifier on 2499). **Corrected master-first**: added a "cardinality source for the identifier rule"
  rationale note to §8 and the leaf doc explaining the exact-count decision, and added an optional
  `classificationReason?: string` to `ClassifiedColumn` (§8 + leaf doc + `schema.ts`) — the human-readable
  justification the §17 reasoning tooltip needs ("99.8% unique", "low-cardinality numbers (3 distinct)"),
  which reads "Set manually" after an override so the stale heuristic rationale doesn't linger.
  **What shipped:** `lib/classifier.ts` (pure — `classifyColumn`, `classificationReason`, `classifyColumns`,
  exported thresholds), `hooks/useSchemaClassifier.ts` (thin store-wrapping read + override surface,
  mirroring `useDuckDB`'s shape), `reclassifyColumn(tableId, columnName, semanticType)` on the datasets
  store (single-column override, no-op on unknown table/column/unclassified table), and the ingestion
  wiring (`classifyTable` + `exactDistinctCounts`) plus a re-classify pass in the standalone `profileTable`
  re-profile hook. `make check` clean: lint, typecheck, 232/232 tests (up from 140 — the classifier's
  per-rule table, boundary cardinalities at 15/16, 100/101, and ratio 0.95 both sides, exotic-type and
  0-row fallbacks, all five bundled samples asserted column-by-column with the full expected-classification
  table documented in `lib/classifier.test.ts` per the Definition of Done, plus store and hook override
  tests). Production build clean, entry chunk 76.59 KB gzip (was 75.88 KB; +0.71 KB), DuckDB chunks still
  separate. No permanent Playwright dependency added to `app/` (reused `spike-ingestion`'s install, throwaway
  script — same precedent as every prior item). **Two open items carried forward, neither a blocker, both
  the named forward-dependency kind this build order already handles by note:** (1) the acceptance line
  "override re-runs the broker" is a no-op today — `03-capability-engine` (next) is the broker and doesn't
  exist yet; the override *mechanism* ships now and correctly re-writes `ClassifiedColumn[]`, and the broker
  will simply re-read that store slice when built (no classifier change needed). (2) The reasoning *tooltip
  UI* is not built — there is no profiling UI surface to host it (`04-profile-ui` is a later unbuilt item);
  the data it needs ships now as the per-column `classificationReason` string, so that item is pure
  presentation with nothing to compute. Next: **03-profiling/03-capability-engine** (Opus, per the model
  rule — inference/judgment) — consumes `ClassifiedColumn[]` off the registry to build `DataCapabilities`
  (§9), replacing `deriveShellCapabilities`'s three-flag sidebar stand-in with the full broker.
- **2026-07-19** — Session paused on user-initiated handoff (out of usage), mid-build on
  **`03-profiling/03-capability-engine` — box stays unchecked, real but incomplete progress
  exists in the working tree.** The build agent (Opus, per the model rule) was deliberately
  stopped rather than left running, right as it started writing the hook's own unit test —
  no test run, lint pass, or live verification has happened this session; nothing below is
  confirmed beyond a clean `npx tsc -b --noEmit`. **What exists in `app/` right now (still
  uncommitted — this repo has zero commits, see the standing open question below):**
  `src/lib/capabilities.ts` + `src/lib/capabilities.test.ts` (new), `src/hooks/
  useCapabilities.ts` (new, **no test file yet** — `useCapabilities.test.ts` was the very
  next file, per the agent's last progress note, when it was stopped), `src/components/
  Sidebar.tsx` rewired to `useCapabilities()` in place of the old stand-in (time-series
  tooltip already updated to "Needs a date and a numeric column," matching the real
  temporal+quantitative rule instead of the stand-in's temporal-only check),
  `src/app/deriveShellCapabilities.ts` deleted with no orphaned references left behind
  (confirmed by grep). Not confirmed at all: whether `capabilities.ts` actually implements
  §9's `evaluateCapabilities` correctly (union-across-tables semantics, the qualified-name
  shape for column-reference arrays once ≥2 tables exist — leaf doc explicitly punted that
  design call to implementation time, unclear if it was ever made), whether the unit tests
  in `capabilities.test.ts` are complete or even passing, whether `make check` is clean, and
  none of the required live verification (all 5 samples → correct module set; union over a
  multi-table folder; reclassify/table-drop re-evaluating live) has run. **Next session must
  not assume any of the above is correct** — read `src/lib/capabilities.ts` and `capabilities.
  test.ts` cold against the leaf doc's §9 spec first, then run `make check`, before deciding
  whether to finish this build agent's work in place or restart the item. **Standing item,
  not new this session:** `app/` still has zero git commits across everything logged in this
  file through `02-column-classifier` plus this session's partial capability-engine work —
  still an open question for a human, not resolved by this handoff.
- **2026-07-19** — `03-profiling/03-capability-engine` done and checked (Opus's prior-session
  broker, finished and live-verified this session — Sonnet, mechanical completion only, no
  design judgment exercised; logged per the model rule's "correct the column and log the
  reason" clause since this closing pass wasn't Opus). Read `src/lib/capabilities.ts` cold
  against §9 first, as the prior handoff demanded: the broker exactly implements the spec's
  flag logic, and its union-across-tables design (qualify column-reference names with
  `tableName.` only once ≥2 tables actually contribute columns, bare names otherwise) is a
  reasonable resolution of the design call the leaf doc explicitly left open at implementation
  time — no changes needed. `capabilities.test.ts` (30 cases: every flag boundary, reference
  arrays, multi-table union, unclassified-table skip) was already complete and passing. The one
  real gap was exactly what the prior note flagged: `useCapabilities.test.ts` didn't exist.
  Added it (`app/src/hooks/useCapabilities.test.ts`, mirroring `useSchemaClassifier.test.ts`'s
  store-driven `renderHook` shape) — covers zero-table default, ingest growing the union live,
  manual reclassify flipping a flag live, table-drop resetting to none, and memo referential
  stability across an unrelated re-render. `make check` clean: lint, typecheck, 259/259 tests
  (up from 253). **All five acceptance-criteria rows live-verified** (Playwright against a real
  `npm run dev`, dynamically importing `capabilities.ts`/`datasets.ts` off the dev server per
  the `02-duckdb` precedent, reusing `spike-ingestion`'s browser install — no permanent
  Playwright dependency added to `app/`, same as every prior item): a synthetic numeric-only CSV
  (3 continuous columns, cardinality kept well under the near-unique threshold) enables
  Correlation/descriptive-stats/distribution while Time Series and Categorical Breakdown stay
  off, sidebar cards reflect it live; a synthetic single-column CSV enables descriptive-stats/
  distribution only, Correlation card genuinely disabled in the DOM; the ecommerce sample
  (4-table folder) evaluates over the union with every column reference correctly table-
  qualified once ≥2 tables contribute; reclassifying Titanic's `Pclass` to Quantitative through
  the real store action grows `numericColumns` and flips the sidebar's Correlation card live,
  with zero page interaction beyond the store call; dropping the table resets every flag to
  false and the sidebar back to disabled, live; all 5 bundled samples produce sane, verified
  module sets. **Two findings surfaced while picking sample expectations, both confirmed as
  correct classifier/broker behavior, not bugs — logged since they contradict a naive reading
  of the acceptance criteria's sample descriptions:** (1) Titanic's `Name` column is genuinely
  high-cardinality free text, so `canDoNLP` is correctly `true` for that sample (the §14 sample
  description only advertises "categorical breakdown by class and survival," but NLP lighting up
  too is correct, not a leak). (2) Product Reviews' `ReviewText` column is **not** actually free
  text in the bundled sample — `scripts/gen-samples.mjs` draws from only 10 templated sentences
  across 500 rows, so the classifier correctly reads it as Categorical (10 < the 100-distinct
  Textual threshold) and `canDoNLP` is `false`, even though `samples.ts`'s own description text
  says "free-text reviews." **Open item, not a blocker, flagged for whoever next touches sample
  generation or the NLP path:** the product_reviews sample doesn't actually exercise
  `canDoNLP`/the Textual classification as its own description implies; fixing it means widening
  `gen-samples.mjs`'s review-text template pool past 100 distinct phrases, out of scope for this
  item since capabilities.ts and the classifier are both behaving correctly against the data as
  it exists today. `03-profiling` section now has two of five items checked. Next:
  **03-profiling/04-profile-ui** (Sonnet) — the first UI surface for `ColumnProfile`/
  `ClassifiedColumn`/`classificationReason`/`DataCapabilities`, all of which have shipped with no
  consumer yet; no blockers. **Standing item, still open:** `app/` remains at zero git commits.
- **2026-07-19** — `03-profiling/04-profile-ui` (Sonnet): Phase-1 column cards done and
  live-verified; Phase-3 insight feed built and live-verified but **box stays unchecked** —
  this leaf doc's own Definition of Done requires "open as chart" to reuse the SQL → Chart
  translator, and `04-sql/04-chart-translator.md` doesn't exist yet (04-sql is entirely
  unbuilt) — no amount of work in this item can satisfy that criterion today. Building the
  rest of Phase 3 now anyway (rules, SQL, ranking, cards) rather than deferring the whole
  slice matches this file's own precedent (`03-table-registry` shipped `generatingSql` unused
  for `05-transformation-layer`; `02-column-classifier` shipped the override mechanism with
  the broker re-read as a no-op) — only the actual chart-open action is blocked, everything
  else is real and independently useful. **What shipped:** `src/lib/columnStats.ts` (pure SQL
  builders + parsers — histogram via explicit FLOOR+clamp binning rather than trusting
  `width_bucket`'s edge semantics, `median()`, top-10 value frequencies matching the
  leaf doc's exact educational SQL, date range + a gap heuristic — max distinct-date spacing
  vs. double the median spacing — via one CTE'd query, word count via space-counting
  arithmetic rather than guessing a list-function name); `src/services/profiling.ts`
  (per-column stat orchestration, direct-engine calls like `services/ingestion.ts` rather than
  routing through `sql.ts`'s single-query-panel store, which many concurrent per-column
  queries would fight over); `src/features/profiling/ColumnCard.tsx` + `ProfileDashboard.tsx`
  (type badge, null bar, per-type body, a table picker that only renders past one table,
  wired into `App.tsx`'s existing `'profiling'` sidebar slot — no Sidebar change needed, that
  card already existed, disabled-until-now); `src/lib/insights.ts` (the seven-rule engine —
  concentration/change-point/outlier-group as SQL-driven "probes" pairing a query with a pure
  `describe` closure, null-pattern/id-exclusion as zero-query "syntactic" rules reading
  already-classified data, ranked by effect size × coverage and capped at 10 per D10) +
  `src/services/insights.ts` (execution) + `InsightFeed.tsx`/`ColumnCard`'s `SqlButton` (both
  push their generating SQL into the educational panel via `useEducationalPanel` — the first
  real consumer of that context; every prior use was test-only). **Concentration rule design
  note, not a leaf-doc deviation:** gating on raw top-slice share alone is degenerate with few
  categories (2 groups split 51/49 always has "top 1 of 2" holding >50%, which is arithmetic,
  not a finding) — gated on *disproportion* instead (share minus the slice's "fair" share
  `k/n`) so only a genuinely skewed concentration fires; caught by a unit test before it ever
  reached live data. **A real, load-bearing bug found and fixed in live verification:**
  DuckDB-Wasm's Arrow layer surfaces `DATE` values — including `date_trunc()` output — as raw
  epoch-millisecond numbers, not strings (confirmed live: `SELECT date_trunc('month', DATE
  '2023-05-15')` came back `1682899200000`, type `Date32<DAY>`); the first pass at both the
  date-range earliest/latest formatting and the change-point period label used `String(cell)`
  directly, producing garbled output live ("TempLowC rose 19350% in 1454284" instead of "in
  2016-02"). Fixed with a shared `formatDateCell()` helper (`columnStats.ts`, epoch-ms → ISO
  date or "YYYY-MM" via `precision`), used in both places. **The unit tests for both had the
  same wrong assumption** — hand-built fixtures used plain date strings (`'2024-01-01'`),
  which is exactly why the bug reached live verification instead of being caught by `make
  check`; both test files were corrected to real epoch-ms fixtures (`MS()` helper converting
  ISO strings) so a regression to naive `String()` formatting would be caught next time.
  **Live-verified** (Playwright against a real `npm run dev`, throwaway scripts — service-level
  across all 5 bundled samples plus a synthetic 100%-null fixture, and a separate UI-level
  click-through, same precedent as every prior item; reused `spike-ingestion`'s browser
  install, no permanent Playwright dependency added to `app/`): card-stats computation for
  every table in all 5 samples (7 tables total) completed in 1.25–27.3ms, far under the
  <500ms bar; a synthetic table with a genuinely 100%-null column (classified Categorical at
  0 cardinality — the classifier's own existing, previously-verified behavior, not something
  this item changed) rendered its null-pattern insight and a `(null)` top-value row correctly,
  no crash, no `NaN`; zero network requests fired during `loadInsights` (confirmed via
  Playwright's request listener); insight count never exceeded the 10 cap (`stock_prices` hit
  it exactly); the UI click-through confirmed "Show SQL" correctly pushes into the educational
  panel, "Open as chart" renders `aria-disabled="true"` with an explanatory tooltip rather than
  being hidden (matches the sidebar's own disabled-card convention), and zero console/page
  errors. **Two specific Phase-3 acceptance gaps, logged rather than forced:** (1) "open as
  chart" — as above, categorically blocked on `04-sql/04-chart-translator.md`. (2) the
  `product_reviews` sample surfaces only 2 insights (`ReviewId` id-exclusion + a `ProductId`
  change-point), short of the "≥3 correct, non-trivial insights per sample" row — traced live
  to the sample's own generated data (`Rating`/`ReviewText`/`ProductId` are independently
  random in `gen-samples.mjs`, so there's genuinely no concentration/outlier/leakage signal to
  find; the concentration/outlier rules correctly emitted nothing rather than manufacturing a
  false one) — the same root-cause category already logged against this exact sample in
  `03-capability-engine` ("the classifier is behaving correctly against the data as it exists
  today"), not an insight-engine bug. Fixing `gen-samples.mjs` is out of scope for this item.
  `make check` clean: lint, typecheck, 309/309 tests (up from 259 — new: `columnStats.test.ts`,
  `insights.test.ts`, `ColumnCard.test.tsx`, `InsightFeed.test.tsx`). Production build clean,
  entry chunk 81.54 KB gzip (was 76.59 KB; +4.95 KB for the new profiling UI), DuckDB chunks
  still separate. **`▶` stays on this item** (rule 3 — only moves on a checked box); do not
  check `04-profile-ui` until `04-sql/04-chart-translator.md` exists and "open as chart" is
  wired for real, at which point also re-check whether `product_reviews`' insight count is
  still short. Next, in dependency order: **03-profiling/05-dataset-dossier** (Sonnet) can
  proceed — it degrades to this item's per-table profile view (already real) and doesn't
  depend on the chart translator — OR a human may prefer to jump to **04-sql** to unblock this
  item's own remaining gap first; either is a legitimate next step, not a blocker either way.
  **Standing item, still open:** `app/` remains at zero git commits.
- **2026-07-19** — `03-profiling/05-dataset-dossier` done and checked (Sonnet). The Profile
  sidebar card now opens on the **Dataset Dossier** — the post-ingest folder-level overview
  (§13.1, D48) — with the existing per-table profile view one click away, matching the
  item's own internal cut-line language. **`▶` stays on `04-profile-ui`** (rule 3 — it only
  moves when its own box is checked; that item is still genuinely blocked on
  `04-sql/04-chart-translator.md`, unrelated to this item, per the prior entry). **What
  shipped, no new engine work — pure packaging of already-shipped modules:** `lib/viewspec.ts`
  (the D55 fixed component registry + `validateViewSpec`), `lib/dossier.ts` (the pure
  deterministic ViewSpec producer — shared-column detection, key-column extraction, the
  positives-only quality headline, the honesty-guarded suggested-next-steps generator, ranked
  top-insight rows), `lib/structureReport.ts` (D20's one-click client-side export — JSON only,
  zero server surface, no dependency on the unbuilt `08-persistence` share flow),
  `services/dossier.ts` (cross-table insight loading reusing `services/insights.ts`, time
  coverage reusing `columnStats.ts`'s existing date-range+gap query), and
  `features/profiling/dossier/` — `ViewSpecRenderer` (componentId → hardcoded component via
  the fixed registry, no eval, unknown ids render nothing) plus one presentational component
  per panel (`IdentityBand`, `HeroTableGrid`, `TableStrip`, `QualityHeadline`, `TimeCoverage`,
  `SuggestedNextSteps`, `TopInsights`). New `features/profiling/ProfilingModule.tsx` composes
  `DatasetDossier` and the existing `ProfileDashboard` behind local view state (not global —
  `App.tsx` unmounts it on every sidebar departure, so re-entering Profile always lands on the
  Dossier again, not just the first post-ingest visit); `ProfileDashboard` gained optional
  `initialTableId`/`onBack` props for this, no other behavior change. `IngestionPanel.tsx` now
  calls `setActiveModule('profiling')` on both the single-file and batch success paths (D48:
  "opens immediately after ingest"). **Several scoping decisions made and logged here, all
  deliberate, not leaf-doc deviations:** (1) the D24 above-the-fold hedge always resolves to
  the graph-cut hero (`hero-table-grid`) today, since `05-charting/05-join-graph-beta.md` is
  unbuilt — `hero-join-graph` is a reserved-but-unemitted registry id, so swapping the graph in
  later is a reflow of which panel the producer emits, not a rebuild, exactly as §13.1
  describes. (2) Suggested next steps route **only** to the per-table profile, never to SQL or
  a chart module — both `04-sql` and `05-charting` are entirely unbuilt (their sidebar cards
  fall through to `App.tsx`'s generic placeholder text), so a step phrased as "chart X" or
  "query Y" would point at a broken promise; `InsightFeed`'s own disabled "Open as chart"
  already establishes this exact precedent for the identical reason. (3) The Dossier scopes
  over **every currently registered table**, not one dataset in isolation — matches
  `ProfileDashboard`/`TableList`'s existing flat, dataset-agnostic model; a human may want true
  per-dataset isolation later if multi-dataset sessions become common, not built here. (4) The
  D45 "file hashes on hover" mockup detail is deferred — no hashing infrastructure exists
  anywhere in this tree yet (that's `08-persistence/03-dsps-spec.md` territory, unbuilt); the
  identity band shows only the profiled date. (5) The four-rung internal cut ladder has **no
  runtime toggle** — verified by construction instead (identity band + hero + quality headline
  stand alone above the fold; suggested-next-steps and the below-fold bands are each
  independently omittable per `lib/dossier.ts`'s own empty-result-omits-the-panel logic; rung 4
  is the pre-existing `ProfileDashboard` table-switcher, reachable via any hero/table-strip
  click or "← Back to overview") — the acceptance criterion asks each rung produce a coherent
  screen, not that a button exists to preview one. **A real, flagged gap, not fixed here:** the
  batch-ingest summary toast (`SummaryToast`, from `04-multi-file`) still renders into
  `IngestionPanel`'s own local state, which is now hidden the instant a batch succeeds and
  auto-navigation fires — a skip-heavy batch's "skipped 2 unsupported files" heads-up goes
  unseen unless the user manually navigates back to Ingest. D48 and `04-multi-file`'s toast
  design predate each other and neither anticipated this; fixing it means promoting
  batch-summary notifications to something cross-module, out of scope for the Dossier itself.
  **Live-verified** (Playwright against a real `npm run dev`, throwaway scripts, reused
  `spike-ingestion`'s browser install and deleted after use — no permanent Playwright
  dependency added to `app/`, same precedent as every prior item): the e-commerce sample (4
  tables) auto-navigates off Ingest straight to the Dossier with the hero grid, correct
  aggregate table/row counts, and a live "shares `customer_id` with orders"-style line, all
  within the first 800×1280 viewport; a full sweep of banned all-clear/sensitive-data copy
  (`"0 sensitive columns"`, `"none found"`, `"scan complete"`, `"personal data"`, etc.) found
  none, anywhere; clicking a suggested step, a hero card, and the table strip each correctly
  opens that table's per-table profile with a working "← Back to overview"; re-entering Profile
  from another module lands on the Dossier again, not the last-viewed table; "Export structure
  report" triggers a real file download whose JSON content was parsed back and checked (4
  tables, per-column `semanticType`, a populated insight array); the Titanic sample (1 table,
  thinner profile) still renders identity band + hero + a suggested-next-steps band via the
  generic-routing degrade path, no crash; the stock-prices sample (temporal) renders a real
  Time Coverage band citing an actual date range and a Top Insights band whose "Show SQL"
  pushes real, executable SQL into the educational panel. Zero console/page errors across every
  run. `make check` clean: lint, typecheck, 337/337 tests (up from 309 — 28 new, covering
  `viewspec.ts`'s registry/validation branches and `dossier.ts`'s shared-column detection,
  quality-headline positives-only behavior, suggested-steps ranking/degrade/cap, and
  `structureReport.ts`'s shape/JSON-serializability). Production build clean, entry chunk 84.31
  KB gzip (was 81.54 KB; +2.77 KB for the new Dossier code), DuckDB chunks still absent from it.
  `03-profiling` now has four of five items checked — only `04-profile-ui`'s box remains open,
  blocked purely on the chart translator, unrelated to anything this item touched. Next, in
  dependency order: **`04-sql/01-monaco-editor`** (Sonnet) is the next unblocked item and, once
  `04-sql/04-chart-translator.md` lands later in that same section, is what finally lets
  `04-profile-ui`'s box close too. **Standing item, still open:** `app/` remains at zero git
  commits.
- **2026-07-19** — `04-sql/01-monaco-editor` done and checked (Sonnet). The SQL sidebar card
  now opens a real, working query editor: Monaco with SQL highlighting and live DuckDB-aware
  autocomplete, gated entirely behind `React.lazy()`/`Suspense` so it never touches the initial
  bundle. **ADR-004 resolved from real spike evidence, not left as a stub**: raw `monaco-editor`
  (pinned exact, `0.55.1`) beat `@monaco-editor/react` — measured identical core-editor chunk cost
  either way (927.04 KB vs. 926.82 KB gzip, same underlying package), but the React wrapper adds
  ~13 KB gzip of its own overhead (110.70 KB/27.49 KB gzip vs. a 53.68 KB/14.43 KB gzip hand-written
  equivalent) plus a CDN-avoidance config step, for zero reduction in the manual worker-hosting or
  completion-wiring work either path still requires. A hand-narrowed import graph (core + SQL-only,
  skipping Monaco's ~70 other basic-language tokenizers) was also tried and rejected — measured
  925.38 KB vs. 927.04 KB gzip, noise-level, because Monaco already internally code-splits each
  language contribution into its own chunk regardless of entry point. Full reasoning and numbers in
  `architecture/adr/004-monaco-integration.md`. **What shipped:** `src/features/sql/` —
  `completionProvider.ts` (pure `buildCompletionItems(tables)`, reads `TableRegistryEntry[]` off the
  live datasets store, no Monaco dependency so it's testable headless), `MonacoWrapper.tsx` (the
  actual lazy-loaded mount — self-hosted same-origin worker matching ADR-001's convention, a
  Ctrl/Cmd+Enter run keybinding, bidirectional editor↔query-store sync), `SqlModule.tsx` (the
  `Suspense` boundary, Run button, minimal results/history panel), `ResultsView.tsx` (a deliberately
  minimal capped-200-row preview table — the full sortable/virtualized/paginated grid stays
  `04-sql/03-results-grid.md`'s job, not duplicated here). `App.tsx` wired `activeModule === 'sql'`
  to `SqlModule` following the existing ingestion/profiling pattern exactly. `StatusConsole.tsx`'s
  placeholder query-timing text is now real, sourced from the query store. **All four acceptance
  criteria live-verified against the real running app** (production build + `vite preview`,
  headless Chromium, throwaway script — no permanent Playwright dependency added to `app/`, same
  precedent as every prior item): a production network capture shows zero Monaco-chunk requests on
  initial load, both Monaco chunks firing only after the SQL card's first click; autocomplete
  against the live `ecommerce` sample returned real table/column names (`orders`, `order_items`,
  `order_id`, `order_date`, etc.); `SELECT * FROM customers LIMIT 5` returned real rows at 4–5 ms,
  reflected in the results pane, status console ("query 4 ms"), and history; a query against a
  nonexistent table surfaced DuckDB's own readable catalog error non-crashingly. **A real bug found
  and fixed in live verification:** the Run handler's `void runQuery(...)` produced a genuine
  unhandled promise rejection on every failed query, since `runQuery` re-throws after recording the
  failure into the store (confirmed via Playwright's `pageerror` event) — fixed to
  `runQuery(...).catch(() => {})` with the store already the UI's source of truth. **Flagged, not
  corrected here (out of this item's authorized scope):** the Monaco core chunk measures 3.6 MB
  raw / ~925 KB gzip, materially larger than master's own "~2MB" description at line 1000 of
  `DATASCOPE.md` — logged in ADR-004's Consequences; the lazy-load architecture is unaffected
  either way (confirmed zero-Monaco-before-click holds regardless of the true size), but the master
  bundle-size table itself is now stale and a human should decide whether it's worth a dedicated
  correction pass. Entry chunk 84.31 KB → 85.58 KB gzip (+1.27 KB, this feature's own non-Monaco
  code — Monaco itself never reaches it). `make check` clean: lint, typecheck, 351/351 tests (up
  from 337 — 14 new: `completionProvider.test.ts`, `SqlModule.test.tsx`, `StatusConsole` timing
  tests). **`▶` moves off `04-profile-ui`** (that item's block on `04-chart-translator` is
  untouched by this one — its box stays open, unrelated) **onto `04-sql/02-query-suggestions`**,
  the next item in dependency order. No blockers. **Standing item, still open:** `app/` remains at
  zero git commits.
- **2026-07-19** — `04-sql/02-query-suggestions` (Sonnet): the column-shaped templates and the
  D53 guided task-shaped answers are both built and live-verified end-to-end — **box stays
  unchecked**, same shape of gap as `04-profile-ui`: this item's own last acceptance-criteria
  row requires each guided task to "one-click to a query + chart," and `04-sql/04-chart-translator.md`
  doesn't exist yet, so that half of the criterion can't be satisfied by any amount of work here.
  **What shipped:** `src/lib/querySuggester.ts` (pure — `buildTemplateSuggestions`/
  `buildTaskSuggestions`, both operating per table rather than over the global multi-table union);
  `src/features/sql/QuerySuggestions.tsx` (the rail, wired into `SqlModule.tsx` above the editor —
  the "what do I even ask?" on-ramp belongs before the blank editor, not after it); `SqlModule.tsx`
  gained one import, no other change. **Design call, not a leaf-doc deviation:** rather than
  reimplementing the §10 M2 template table's column-type bucketing, `querySuggester.ts` calls the
  existing `evaluateCapabilities` (03-capability-engine) one table at a time — an array of one
  table never triggers its qualified-name (`table.column`) behavior, so this is a straight reuse,
  not a workaround. **Ambiguity resolved, logged since it isn't obvious from the table alone:**
  the template table's "Temporal" row (moving-average trend line) needs a numeric column to fill
  its own `[num_col]` placeholder just like the adjacent "Temporal + Numeric" row (month-bucketed
  sum) — both are gated on Temporal+Numeric together, emitted as two separate suggestions once
  that pair is present, rather than trying to make sense of a "Temporal-only" trigger that the
  template's own SQL couldn't satisfy. **Guided tasks, deterministic and column-aware, no LLM
  (D53):** trend-over-time + period-over-period (Temporal+Quantitative), top-N-by-segment
  (Categorical, falling back to `COUNT(*)` with no numeric column present, `SUM()` once one is),
  outliers (Quantitative — mean/stddev CTE, |z| > 3), simple-cohort (Identifier+Temporal — distinct
  entities per month). Each task's "Run" both inserts its SQL into the editor and executes it
  immediately (`services/sql.ts`'s existing `runQuery`) — live-verified this actually populates
  Results and History, not just the store. **Chart half of each task, same convention InsightFeed
  already established for its own "Open as chart":** a disabled affordance with a
  `Tooltip` reading "Available once the SQL Playground's chart translator ships," not hidden.
  **Educational-panel tooltip wiring:** each template card's "Why?" pushes the plain-language
  explanation into the shell's educational panel (`useEducationalPanel`, the same context
  `ProfileDashboard`'s "Show SQL" already uses) rather than a native hover tooltip, matching the
  leaf doc's explicit "rendered via the shell's educational panel pattern" line; "Insert" is a
  separate action next to it, so viewing the explanation never mutates the editor. **Test-file
  side effect, not a design change:** `SqlModule.test.tsx` now wraps every render in
  `EducationalPanelProvider` (added a `renderSqlModule()` helper) and resets `useDatasetsStore` in
  `beforeEach` — `QuerySuggestions`, now rendered inside `SqlModule`, calls `useEducationalPanel()`
  unconditionally, which throws outside a provider; this matches how `SqlModule` is actually
  mounted in `App.tsx` today, not a new constraint. `make check` clean: lint, typecheck, 384/384
  tests (up from 351 — 33 new: `querySuggester.test.ts`'s capability-mix gating tests plus a
  bundled-sample suggestion-set fixture mirrored from `classifier.test.ts`'s own SAMPLES table
  per this item's Definition of Done ("documented in tests"), and `QuerySuggestions.test.tsx`'s
  UI-wiring tests). Production build clean, entry chunk 87.45 KB gzip (was 85.58 KB; +1.87 KB),
  DuckDB/Monaco chunks still absent from it. **Live-verified** (Playwright against a real
  `npm run dev`, throwaway script, reused `spike-ingestion`'s browser install, deleted after use —
  no permanent Playwright dependency added to `app/`, same precedent as every prior item): all
  five bundled samples (8 tables total) ingested, every generated template and task query executed
  directly against the real engine with **zero failures** — satisfies the execute-all acceptance
  row for real, not just via unit fixtures; capability gating confirmed correct live, not just in
  tests (e.g. `ecommerce/customers`, which has no numeric column, correctly produced only
  `categorical-breakdown`/`preview` templates and `top-n-by-segment`/`simple-cohort` tasks — every
  Temporal/Quantitative-gated suggestion correctly absent even though the table has a date column);
  a real UI click-through on the SQL module confirmed the rail renders, "Insert" changes the query
  store's `sql` (verified the value, not just that *something* changed), "Why?" pushes the
  tooltip text into the educational panel, a task's "Run" both inserts its SQL and populates
  Results/History with real row/timing output, and the disabled "Chart" affordance is present with
  its reason. Zero console/page errors across every run. **Also fixed, unrelated to this item's
  own build:** this file's own checklist had a duplicated `02 query-suggestions` row (two
  consecutive lines, only one carrying the `▶`) — collapsed to one row; a doc-integrity typo from
  a prior session's edit, not a content or process change. **`▶` stays on this item** (rule 3 —
  only moves on a checked box); do not check `04-sql/02-query-suggestions` until
  `04-chart-translator.md` exists and the guided tasks' chart action is wired for real. Next, in
  dependency order: **`04-sql/03-results-grid`** (Sonnet) is unblocked — its own Dependencies line
  names only `01-monaco-editor`/`services/sql.ts`'s `QueryResult` shape, not this item — and can
  proceed now, OR a human may prefer to jump to `04-chart-translator` first to close both this
  item's and `04-profile-ui`'s open gaps in one pass; either is a legitimate next step, not a
  blocker either way. **Standing item, still open:** `app/` remains at zero git commits.
- **2026-07-19** — `04-sql/03-results-grid` done: the SQL playground's tabular results
  now sort, paginate, and virtualize instead of the old 200-row static preview.
  **Real gap found and closed, not just a UI build:** the leaf doc's own spec line —
  "never hold a full 1M-row result in JS state" — wasn't actually true of the shipped
  `runQuery()`/`duckdb.worker.ts` path, which materialized *every* row of *any* result
  into a JS array regardless of size. Fixed in `services/sql.ts` only (worker/Arrow
  flattening untouched): a `SELECT`/`WITH` statement now runs as two concurrent
  subqueries — `count(*)` for the true total, `LIMIT 100,000` for the materialized page
  — so `QueryResult.rowCount` always reports the real total but `rows.length` never
  exceeds 100,000 no matter the source table's size; DDL/DML runs unwrapped, exactly as
  before. This is additive to the already-checked `01-monaco-editor` item (its own
  acceptance criteria still hold — query executes, timing/errors/history all unchanged),
  not a reopen, so its box stays checked; documented directly in `03-results-grid.md`'s
  Spec section as the chosen windowing mechanism rather than a master-spec change (master
  only specifies the perf outcome, §19 Phase 6, never a mechanism). New shared primitive
  `src/components/DataTable.tsx` (virtualized via `@tanstack/react-virtual`, new
  dependency) — presentation-only, sort/cell-format state owned by the caller — so the
  chart drill-throughs and AI transcript items can reuse it instead of re-inventing a
  grid. `ResultsGrid.tsx` composes it: click-to-sort headers (NULLs always last), 1,000
  row/page pagination over the capped window, NULL rendered as a distinct literal `NULL`
  (never collapsed into empty string), long strings truncate with a click-to-expand
  (expands in place inside the fixed row height via internal scroll, so virtualized row
  offsets never have to shift), DATE/TIMESTAMP columns formatted consistently
  (`YYYY-MM-DD` / `YYYY-MM-DD HH:mm:ss`), and a cap-notice line when `rows.length <
  rowCount`. **Export (D53, §12.2):** CSV always (hand-rolled RFC 4180 writer, no
  dependency); Excel via a **hand-rolled minimal OOXML writer** (`xlsxWriter.ts`) built on
  `fflate`'s `zipSync` — already a dependency (ingestion's ZIP support) — rather than
  pulling in a new xlsx library, kept numeric columns as real numeric cells (not strings)
  so Excel can sum/format them natively; copy-SQL copies the query that produced the
  current result (`history[0].sql`, not the live editor buffer, so it stays correct if
  the user edits the query after running it). **Old `ResultsView.tsx` deleted** — its own
  comment already flagged it as a stand-in for this item; `ResultsGrid` is now the single
  tabular-results component in the app (Definition of Done), confirmed via
  `grep -rl ResultsView src` returning nothing but this build's own history. `make check`
  clean: lint, typecheck, 405/405 tests (up from 384 — 21 new: `cellFormat`,
  `resultsExport`'s CSV quoting/NULL rules, `xlsxWriter`'s OOXML structure via
  `unzipSync`, `isSelectLike`'s DDL/DML-vs-SELECT gating, and `ResultsGrid`'s
  sort/paginate/NULL/error/export-wiring — the last of these needed a jsdom-only
  `offsetHeight`/`offsetWidth` stub since jsdom's zero-layout would otherwise make
  `@tanstack/react-virtual` compute a zero-height viewport and render no rows; doesn't
  affect real-browser behavior). Production build clean; entry chunk 100.41 KB gzip (was
  87.45 KB) — the +13 KB is `@tanstack/react-virtual` plus the grid/export code, all
  eagerly bundled same as every other feature module in this app (only Monaco/DuckDB/the
  xlsx writer are lazy-gated); `xlsxWriter-*.js` confirmed as its own chunk, absent from
  `dist/index.html`'s initial script tags. **Live-verified** (Playwright against a real
  `npm run dev`, throwaway script in `spike-ingestion/`, reused its existing Playwright +
  Chromium install, deleted after use — same precedent as every prior item needing a real
  browser): against a real DuckDB-Wasm instance, `SELECT * FROM generate_series(1,
  250000)` correctly showed the true 250,000-row total with a "showing first 100,000"
  cap notice, ascending/descending header-click sort actually re-ordered the loaded
  window (verified the rendered cell values, not just an attribute), pagination advanced
  from page 1 to 2 of 100, a NULL-producing query rendered the literal text `NULL`, CSV
  export downloaded a real file with the correct header/NULL/data rows (read back and
  checked, not just "a download fired"), Excel export downloaded a real, non-empty
  `.xlsx` (proving the lazy `xlsxWriter` chunk actually loads and runs against live data),
  copy-SQL put the real executed query text on the clipboard, and a `CREATE TABLE AS`
  statement still ran unwrapped with no crash (regression check on the new
  `isSelectLike` gate). Zero console/page errors across every run. Next, in dependency
  order: **`04-chart-translator`** (Opus — inference/judgment, per the model rule) is now
  the item that unblocks the most other open work — it closes `02-query-suggestions`'s
  remaining chart-action gap, `04-profile-ui`'s open chart-translator dependency, *and*
  is `03-results-grid`'s own listed sibling in the SQL section — building it next clears
  three blockers in one pass rather than one. **Standing item, still open:** `app/`
  remains at zero git commits.
- **2026-07-20** — `04-sql/04-chart-translator` done and checked (Opus, per the model rule —
  inference/judgment). The SQL → Chart translator ships as one pure detector shared by every
  consumer: `src/lib/chartMapper.ts` (`recommendChart(result, sql?)` → a `ChartRecommendation`,
  plus `buildChart`, `availableChartTypes`, `specForType`, `classifyColumnType`), wrapped by
  `src/services/charts.ts` (delegates + `runChartQuery`, a one-off direct-engine execute for the
  "open as chart" actions so a feed/suggestion chart never clobbers the playground's query panel
  — same direct-engine pattern as `services/insights.ts`). **The ChartType mismatch is resolved
  without touching master or the `ChartType` union:** the three visual rows reduce to existing
  types (Bar → `categorical`, Line → `time-series`, Scatter → `correlation`); the other two
  mapping rows fall outside `ChartSpec` — a single aggregate value is a **KPI stat** (a plain
  number, no axes, no `ChartSpec`) and any ambiguous/too-wide/too-large result **degrades to the
  data grid** — so the translator returns a `{ chart, spec } | { kpi, … } | { grid, reason }`
  union, not a bare `ChartSpec`. Documented in the leaf doc's new "Type resolution" note
  (mechanism only; master specifies the outcome — the same "leaf doc gets the mechanism"
  precedent `03-results-grid` set). **No new ADR:** Recharts is already the pinned §6 charting
  stack, so adopting it here is the settled choice, not a new decision; ADR-005's real open
  questions (the Recharts+D3 split and the large-series canvas threshold) stay deferred to the
  `05-charting` modules, and the translator's interim large-series row cap (degrade-to-grid past
  ~5,000 points) is a placeholder for that threshold, logged as such. **Three consumers wired,
  one shared function:** (1) the playground's new auto-chart panel (`AutoChartPanel` in
  `features/sql/`, mounted below the results grid) with a chart-type override picker that
  re-derives the spec per chosen type; (2) `InsightFeed`'s "Open as chart" — was a disabled span,
  now runs the insight's SQL via `runChartQuery` and renders inline through the same
  `AutoChartPanel`; (3) `QuerySuggestions`' guided-task "Chart" — was disabled, now runs the
  task's query so the playground's auto-panel charts it (one click from a plain-language task to a
  query + chart). Recharts is the renderer, gated behind `React.lazy()` in a shared primitive
  (`components/charts/ChartRenderer.tsx`) the `05-charting` modules will reuse; `KpiCard` is a
  dependency-free sibling so a KPI result never loads the charting library.
  **A real, load-bearing bug found in live verification and fixed — the mapper as first written
  was wrong on every integer column.** `QueryResult.columnTypes` carries **Arrow** type strings
  (`Int64`, `Float64`, `Utf8`, `Date32<DAY>`), not DuckDB SQL names (`BIGINT`/`VARCHAR`) —
  confirmed live (`lib/arrow.ts` stores `String(field.type)`). The first `classifyColumnType`
  matched only SQL spellings, so `Int64` fell through to "other": a `GROUP BY Pclass, COUNT(*)`
  (both `Int64`) recommended **grid instead of bar**, and an `Age, Fare` scatter
  (`Int64`/`Float64`) also degraded to grid. Fixed by matching Arrow spellings first
  (ints/floats/decimals, `Date32`/`Timestamp`, `Interval` ahead of `Int`) while keeping SQL
  spellings for any DESCRIBE/SUMMARIZE caller; unit fixtures rewritten to the real Arrow names so
  the regression is caught next time. **Live-verified** (Playwright against a real `npm run dev`,
  throwaway scripts, reused `spike-ingestion`'s browser install, deleted after — no permanent
  Playwright dependency in `app/`, same precedent as every prior item): every mapping row
  auto-selects correctly against **real DuckDB/Arrow result shapes**, not just unit fixtures —
  `GROUP BY Pclass, COUNT(*)` → bar, `SELECT Date, Open ORDER BY Date` and a `DATE_TRUNC('month',
  …)` group-by → line, `Age, Fare` → scatter, `CORR(Age, Fare)` → KPI, `SELECT * LIMIT 100`
  (10 cols) and `SELECT Name` (all-text) → grid; the playground panel rendered a real Recharts
  SVG for both a bar and a scatter with zero console/page errors and the picker re-rendered on
  switch; `InsightFeed`'s "Open as chart" ran a real probe query and drew a chart inline (toggles
  to "Hide chart"); all six `QuerySuggestions` "Chart" buttons ran their query and charted it.
  Production build clean: the Recharts chunk (`ChartRenderer-*.js`, 111.73 KB gzip) is confirmed
  **absent from the entry HTML's script tags** — entry chunk 99.81 KB gzip (was 100.41; the
  translator's own code is a few KB, Recharts never reaches it). `make check` clean: lint,
  typecheck, 426 tests (up from 405 — `chartMapper.test.ts`'s per-mapping-row + edge-shape suite
  in real Arrow types, plus rewired `InsightFeed`/`QuerySuggestions` consumer tests).
  **Two other items' gaps closed in the same pass, per this section's own "unblocks three at once"
  note:** `04-sql/02-query-suggestions` **checked** — its only open half was the guided task's
  chart action ("one-click to a query + chart"), now wired and live-verified; its DoD (suggestion
  set documented in tests, execute-all suite green) was already met last session, so the box is
  now fully green. `03-profiling/04-profile-ui` **stays unchecked** — the chart-translator blocker
  it waited on is cleared (`InsightFeed`'s "open as chart" is real and verified), but that is
  **not** its only DoD gate: acceptance requires "each bundled sample surfaces ≥ 3 correct,
  non-trivial insights." Re-verified live (`loadInsights` over all five samples): `product_reviews`
  surfaces **2** (id-exclusion + change-point), short of 3 — the same synthetic-data limitation
  already logged against this sample twice (`03-capability-engine`, `04-profile-ui`):
  `gen-samples.mjs` draws `Rating`/`ReviewText`/`ProductId` independently at random, so there is
  genuinely no concentration/outlier/leakage signal to find and the rules correctly emit nothing
  rather than a false finding — confirmed unaffected by the chart translator. So `04-profile-ui`
  remains open on the ≥3-insights gate for `product_reviews` alone; closing it needs
  `gen-samples.mjs` widened past the classifier's Textual threshold (a real free-text review
  pool), out of scope for this item. **`▶` moves off `02-query-suggestions` onto
  `04-sql/05-transformation-layer`** (rule 3), the next item in dependency order; `04-profile-ui`
  stays unchecked without the `▶`, since its remaining gate is sample-data quality, not a build
  step. Next: **`04-sql/05-transformation-layer`** (Sonnet) — `CREATE TABLE AS` registration,
  undo, and re-profile of derived tables on top of the `generatingSql` field `03-table-registry`
  already shipped unused. **Standing item, still open:** `app/` remains at zero git commits.
- **2026-07-20** — `03-profiling/04-profile-ui` checked (Sonnet). Its only remaining gate —
  `product_reviews` surfacing just 2 insights, short of the DoD's "≥3 correct, non-trivial
  insights" row — is closed by planting one genuine, realistic signal rather than relaxing the
  bar: `scripts/gen-samples.mjs`'s Product Reviews block now appends 20 exact re-submitted rows
  (byte-for-byte duplicates of 20 already-generated reviews, deterministic via the existing
  seeded RNG) after the original 500, modeling a retry-on-timeout double-insert. Live-verified
  (Playwright against a real `npm run dev`, throwaway scripts, reused `spike-ingestion`'s browser
  install, deleted after use — same precedent as every prior item): `product_reviews` now surfaces
  exactly 3 real insights — `ReviewId` id-exclusion (96.2% unique, 500/520 distinct — still safely
  above the 0.95 identifier threshold, unaffected by the new duplicate rows), a new "20 fully
  duplicated rows detected" duplicates card, and the pre-existing `ProductId` change-point — each
  with real generating SQL and a working "Open as chart" (UI click-through confirmed a real
  Recharts bar render off the ID-exclusion card's SQL, zero console/page errors). Re-swept all
  five bundled samples' insight counts to confirm nothing regressed: titanic (3), stock_prices
  (10, capped), weather (5) unaffected; the four ecommerce tables individually sit at 1–3
  (customers 2, products 3, orders 2, order_items 1) but were never individually gated — the
  Dossier's `services/dossier.ts` pools `loadInsights` output across all four tables into one
  cross-table Top Insights band (8 pooled), which is the actual "sample" the DoD's per-sample
  language means for a multi-table folder; this was already true before this session and explains
  why no ecommerce table was ever flagged in this file despite none individually reaching 3.
  Updated `classifier.test.ts`'s documented-fixture `rows: 500` → `520` for `product_reviews` to
  match the regenerated CSV (per-column cardinalities otherwise unchanged — the 20 duplicates
  repeat existing value combinations, so `ProductId`/`Rating`/`ReviewText`/`ReviewDate`
  classifications hold exactly as before). `make check` clean: lint, typecheck, 426/426 tests
  (no new tests needed — the fixed fixture is covered by the existing parametrized classification
  suite). **Deliberately not touched, a separate already-logged item:** `ReviewText`'s
  10-template pool still classifies Categorical, not Textual — the `canDoNLP`/free-text gap
  flagged against this sample in `03-capability-engine`'s and this item's own prior entries is
  unrelated to the ≥3-insight gate and stays open for whoever next widens the review-text
  template pool. **`▶` stays on `04-sql/05-transformation-layer`** (rule 3 — it only moves when
  its own item is checked; profile-ui wasn't holding the pointer). `03-profiling` section is now
  fully checked. **Standing item, still open:** `app/` remains at zero git commits.
- **2026-07-20** — `04-sql/05-transformation-layer` done and checked (Sonnet). The playground can
  now derive, undo, and safely edit tables, not just read them. `src/lib/statementClass.ts` is
  the pure statement-class detector the leaf doc calls for (query / ctas / mutation / other,
  regex-anchored per its own "lightweight now, real parser once sqlLint lands" scope note) —
  classifies a `CREATE TABLE AS`'s target table name, and an `UPDATE`/`DELETE FROM`/
  `ALTER TABLE`/`DROP TABLE`'s target plus the exact offset of that identifier in the
  statement, the latter so a guarded mutation can be rewritten onto a clone by span-splice
  rather than a second parse. `src/services/transforms.ts` is the engine-facing layer:
  `runTransform` registers a CTAS as a fully profiled/classified/autocompletable derived table
  (reusing `services/ingestion.ts`'s own `summarizeTable`/`classifyTable`/`quoteIdentifier`,
  now exported, rather than a second implementation of HUGEINT/Decimal-aware profiling), and
  throws `MutationGuardRequired` for a mutation targeting a **source** (non-derived) table
  before anything runs. **Design call on "materialize as a new table instead" (§12.1's own
  wording, not fully spelled out mechanically):** for UPDATE/DELETE/ALTER, materialize clones
  the source (`<table>_edit`, deduped) via `CREATE TABLE AS SELECT * FROM <target>`, then
  redirects the original statement onto the clone by splicing in the clone's name at the
  target-identifier offset `statementClass.ts` already located — the source is never touched,
  so it keeps the free-undo-by-never-mutating property instead of forfeiting it. For DROP
  specifically, there's nothing left to redirect toward once the clone exists — an untouched
  copy of the table the user was about to lose *is* what "materialize instead" means for that
  statement kind, so the DROP itself is simply never re-run against the clone. The alternate
  guard choice, "Modify original anyway" (`forceMutation`), runs the raw statement against the
  source with no undo, then re-profiles it (or, for a DROP, purges its registry entry) so the
  registry doesn't go stale — confirmed live this actually updates `rowCount`, not just
  `profile`/`columns`. **Real gap found and closed, upstream of this item's own scope:**
  `services/ingestion.ts`'s existing `profileTable` (built by `03-profiling/01-summary-
  statistics`, this item is its first real caller) re-summarized and re-classified a table but
  never refreshed `rowCount`/`columnCount`/`memoryBytes` — harmless when nothing changed a
  table's shape after ingest, silently stale the moment something does (exactly what a forced
  UPDATE/DELETE does). Fixed by having `profileTable` also re-run `DESCRIBE`/`COUNT(*)`/
  `duckdb_tables()` and write them via a new `setTableStats` store action; live-verified a
  `DELETE FROM customers WHERE customer_id = 1` (guard → "Modify original anyway") moved the
  registry's own row count from 400 to 399, not just the profile. **Undo/redo (§12.1):**
  `TableList.tsx` already is the registry's one shared view across modules, so a derived row's
  existing remove button is relabeled "Undo" (icon and `aria-label` swap only, `Undo2` vs
  `Trash2`) rather than adding a second control — dropping a derived table and purging its
  entry *is* undo, no new drop logic needed. Redo is new: `IngestionPanel.tsx` captures the
  table's `generatingSql` before the drop and offers a dismissible "Dropped `x`. [Redo]" banner
  that replays it through `runTransform`, surfacing a failure in the existing error banner
  rather than a new UI. **Broker re-evaluation (AC row) needed no new code** — confirmed by
  reading `hooks/useCapabilities.ts`: it's a `useMemo` keyed on the `tables` array reference,
  and every action here (`registerDataset`/`removeTable`/`setTableStats`) already replaces that
  array, so the capabilities broker re-evaluates on its own; live-verified new-table
  autocomplete (which reads the same live registry) updated with no reload. **Recipe export
  (D53, second AC row):** `src/lib/recipeExport.ts`'s pure `buildRecipeScript` orders every
  derived table's `generatingSql` by `createdAt` and formats it as a re-runnable `.sql` file;
  `resultsExport.ts` gained `downloadRecipe` (reusing its existing `downloadBlob`), wired to a
  new "Export recipe" button in `SqlModule.tsx`'s toolbar, disabled with no derived tables yet.
  **One AC row deliberately left unchecked, not a gap in this item's own work:** "Derived table
  exports like any other (once §12.2 lands)" — §12.2 is `08-persistence/01-parquet-export`,
  unbuilt (v0.5); this item's Definition of Done doesn't gate on it, and a derived table is
  already exportable via the ordinary results-grid CSV/XLSX path exactly like any other table,
  so the row is left unchecked with that note in the leaf doc rather than blocking this item's
  own box (same "future item's gap, not this one's" precedent `04-profile-ui`/
  `02-query-suggestions` set against `04-chart-translator`). **Files-line deviation, corrected
  in the leaf doc, not master (master cites no file paths for this item):** the leaf doc said
  transform handling lives entirely in `features/sql/`; the actual engine-facing logic went in
  `services/transforms.ts` instead, following the established one-service-per-concern shape
  every other module uses (`services/charts.ts`, `services/ingestion.ts`) — `features/sql/`
  still owns the UI half (`TransformGuardModal.tsx`, `SqlModule.tsx` wiring). Also widened
  `Dataset.sourceType` to add `'derived'` (a code-level type, not master/leaf-doc field
  content, so no doc citation needed) since a derived table needs its own single-table Dataset
  wrapper, the same 1:1 shape `loadFile` already uses for a single dropped file. `make check`
  clean: lint, typecheck, 464 tests (up from 426 — new: `statementClass.test.ts`'s full
  class/target/redirect matrix including CTEs, `recipeExport.test.ts`, `transforms.test.ts`'s
  pure `isSourceMutation`/error-class coverage — `runTransform`/`materializeInsteadOfMutation`/
  `forceMutation` themselves need a live engine, verified separately per this repo's own
  precedent — `TransformGuardModal.test.tsx`, `TableList.test.tsx`'s Undo-label case, and new
  `SqlModule.test.tsx`/`IngestionPanel.test.tsx` cases for CTAS routing, the guard's three
  outcomes, and the redo flow). Production build clean, entry chunk 102.41 KB gzip (was 99.81
  KB; +2.6 KB for this item's own code — DuckDB/Monaco chunks still confirmed separate).
  **Live-verified** (Playwright against a real `npm run dev`, throwaway scripts, reused
  `spike-ingestion`'s browser install, deleted after use — same precedent as every prior item):
  against the real ecommerce sample, a `CREATE TABLE AS` derived and registered
  `high_value_orders` end-to-end; `DROP TABLE orders` (a source) showed the guard modal naming
  `orders`, materialize kept `orders` queryable afterward with `orders_edit` as an untouched
  copy; a separate `UPDATE products SET category = 'Discontinued' WHERE product_id = 1` guard's
  materialize choice left `products` reading `Toys` while the redirected clone
  `products_edit` correctly read `Discontinued` — the identifier-splice redirect confirmed
  correct against a real DuckDB result, not just the unit-level offset math; `DELETE FROM
  customers ...` guard's "Modify original anyway" actually removed the row (400 → 399) with no
  guard on the second attempt (customers stayed a source, only derived tables skip the guard);
  undo removed `high_value_orders`'s row/Undo control and showed the Redo banner, Redo
  re-created it; Export recipe downloaded a `.sql` file containing both derived tables'
  generating SQL, ordered by creation time. Zero console/page errors across every run. Next, in
  dependency order: **`04-sql/06-pivot-crosstab`** (Sonnet) is unblocked — its own Dependencies
  are `04-sql`'s already-checked items (Monaco, results grid) plus `03-capability-engine`'s
  broker, not this item specifically — and is next per the checklist's row order; closing it
  finishes the `04 sql` section. **Standing item, still open:** `app/` remains at zero git
  commits.
- **2026-07-20** — `04-sql/06-pivot-crosstab` done, closing the `04 sql` section. A business
  analyst can now drag fields into Rows/Columns/Values wells (or use the Guided dropdown
  fallback) and get a cross-tab with no SQL typed — `src/lib/pivotCompiler.ts` is a pure
  `PivotSpec → GROUP BY` compiler (no engine access), and `src/features/sql/PivotBuilder.tsx`
  runs the compiled SQL through the ordinary `runQuery` path, so it lands in the existing query
  store and SqlModule's already-built Results grid, History, and `AutoChartPanel` render it with
  **zero new display code** — the reuse this item's own leaf doc implied by requiring the result
  render in `03-results-grid.md`. **Reading of "cross-tab" that unlocked this reuse:** the leaf
  doc's own wording — "compiles to one `GROUP BY` (rows × columns → grouping keys)" — plus the
  results grid only ever rendering a flat `QueryResult` (no widened-matrix rendering path exists
  anywhere in this codebase) means Rows and Columns are both grouping-key wells feeding one flat
  `GROUP BY`, not an Excel-style spread of values into dynamic per-value output columns; this
  reading is what makes every AC implementable as ordinary flat SQL with no new execution path
  (D49) and no join-shaped pivoting logic for "multi-table for free" to compose against.
  **Scope decision, logged per this file's own rule 3 (not a gap in this item):** pivot operates
  over one selected table per run (a table picker appears once ≥2 classified tables are
  registered), the same per-table scoping `02-query-suggestions.md` already established
  ("relationship-aware JOIN is out of scope for v0") — cross-table joins are Studio's
  relationship-graph (item 10, v1), not this item's job. **Top-N cap needed no discovery
  query:** `ClassifiedColumn.cardinality` is already computed at classification time
  (`03-capability-engine`), so the builder reactively caps whichever Rows/Columns field has the
  highest cardinality once it exceeds 20, with a "Show all" affordance that clears the cap — pure
  client-side decision, no extra round-trip. **Subtotals compile to a real DuckDB
  `GROUP BY ROLLUP(...)`** over the grouping keys, not a second query. **Guided-mode parity is
  structural, not tested-into-existence:** Guided mode's dropdowns write into the exact same
  `{ rows, columns: [], values }` spec shape Builder mode does and both compile through the same
  `buildPivotSql`, so "same query from dropdowns" (the D27 cut-line AC) can't drift — confirmed
  both in `PivotBuilder.test.tsx` and live. `make check` clean: lint, typecheck, 488 tests (up
  from 464 — new: `pivotCompiler.test.ts`'s 13 cases across row/column/value/aggregate
  combinations, rollup subtotals, top-N semi-join ranking, sort, alias-dedup, and identifier
  quoting; `PivotBuilder.test.tsx`'s 11 cases for the click-to-add wells — real native
  drag-and-drop isn't simulable in jsdom's `DataTransfer`, so jsdom coverage uses the same
  wells' click affordances while real dragging is live-verified below — aggregate picker,
  subtotals/sort wiring, the top-N banner appearing/clearing, the debounced run, and Guided/
  Builder SQL-text parity). Production build clean, entry chunk 105.16 KB gzip (was 102.41 KB;
  +2.75 KB for this item's own code — DuckDB/Monaco/Chart chunks still confirmed separate).
  **Live-verified** (Playwright against a real `npm run dev`, throwaway script, reused
  `spike-ingestion`'s browser install, deleted after use — same precedent as every prior item):
  against the real e-commerce sample's `orders` table (1,400 rows), a **real drag-and-drop**
  (`locator.dragTo`, not a click) of `status` into Rows and `order_id` into Values (aggregate
  `count`) produced `SELECT "status", COUNT(*) AS "count_order_id" FROM "orders" GROUP BY 1`
  and a 4-row grid — completed 712, cancelled 243, shipped 213, refunded 232 — summing to
  exactly 1,400, cross-checked against `wc -l orders.csv`; the Chart section and CSV/Excel
  export buttons were present and enabled off that same result with no extra wiring, confirming
  the "no new display code" claim above against a live browser, not just the reuse argument;
  dropping `customer_id` (396 distinct) into Rows showed the "showing top 20" banner and added
  the expected `WHERE "customer_id" IN (SELECT ...)` semi-join to the generated SQL; switching
  to Guided mode and driving the equivalent dropdowns (`status` group-by, `order_id`/`count`
  measure) produced **byte-identical** generated SQL to the drag-built version — cut-line parity
  confirmed live. Zero console/page errors across every run. **Test-plan scope, logged rather
  than blocking:** the leaf doc's test plan also calls for integration tests executing the
  compiled SQL against *every* bundled sample; only `ecommerce` was live-verified. Judgment call:
  the compiler holds no sample-specific branching (unlike the classifier's distribution-dependent
  heuristics) — it is a pure syntactic transform from `PivotSpec` to SQL text, already exhaustively
  unit-tested across shapes independent of any one sample's schema — so per-sample re-verification
  wasn't judged to add meaningfully different coverage; flagged here rather than silently assumed.
  Next, in dependency order: **`05-charting/01-time-series`** (Sonnet) is next per the checklist's
  row order — the v0 ship gate section. **Standing item, still open:** `app/` remains at zero git
  commits.
- **2026-07-20** — `05-charting/01-time-series` done and checked (Sonnet), opening the `05 charting`
  v0 ship-gate section. `src/lib/timeSeriesSql.ts` is the pure SQL-builder layer (mirroring
  `pivotCompiler.ts`'s shape — a spec in, one statement out, `quoteIdentifier` reused from
  `services/ingestion.ts`): `buildTrendSql` (granularity-bucketed trend, optionally wrapped in the
  §10 Module 2 `AVG(...) OVER (ORDER BY … ROWS BETWEEN n PRECEDING AND CURRENT ROW)` pattern for the
  moving-average overlay), `buildPeriodComparisonSql` (latest two periods, `ORDER BY period DESC
  LIMIT 2`), and `buildSeasonalitySql` (`EXTRACT(dow FROM …)` × `EXTRACT(hour FROM …)`), plus
  `parsePeriodComparison`/`parseSeasonality` result parsers. `src/features/charts/time-series/`:
  `TimeSeriesModule.tsx` (table + date/value column pickers, three sub-view tabs), `TrendView.tsx`,
  `PeriodComparisonView.tsx`, `SeasonalityHeatmap.tsx` (a bespoke DOW×hour grid — no `ChartType`/
  `ChartSpec` change; a heatmap isn't one of the shared translator's shapes, same "module-specific
  visual, shared primitive stays untouched" precedent as the pivot builder), `GeneratedSql.tsx` (the
  shared pre+copy block, reusing `resultsExport.ts`'s `copySql`). Wired into `App.tsx`; the sidebar's
  Time Series card was already gated on `capabilities.canDoTimeSeries` since `01-foundation/
  03-routing`, dormant until this item gave it something to render. **Design calls, logged per this
  file's own rule 3, not gaps:** (1) trend and its moving-average overlay are one query/one view, not
  two — the window's 7/30/90 label is periods-of-the-current-granularity (reads as literal days at
  the `day` default, the common case) rather than a second calendar-day-locked query, keeping one
  coherent chart instead of two overlays that could show different bucket widths. (2) "this month vs
  last month" is implemented as the two most recent periods **present in the data**, not
  `DATE_TRUNC('month', CURRENT_DATE)` — the bundled stock-prices sample's date range doesn't reach
  today, so a literal "this month" would be silently empty regardless of which day the demo runs on.
  (3) Per-table eligibility (a table needs both a Temporal *and* a Quantitative column itself, not
  just contribute to the pooled broker flag) is computed locally in `TimeSeriesModule.tsx`, same
  defensive shape `PivotBuilder` already uses for its own table list — the broker's `canDoTimeSeries`
  is a pooled OR across every registered table's columns, so a pathological split (dates in one
  table, numbers in another) could in principle satisfy the sidebar gate with no single table
  actually queryable; the module now degrades to a clear message instead of a broken query in that
  case. **Chart primitive reused unmodified, per this item's own Dependencies line:** the trend
  view's own `ChartSpec` (`type: 'time-series'`, `yFields: [value, movingAvg?]`) is fed straight into
  the existing lazy-loaded `ChartRenderer` — its multi-line rendering already handled a second
  series with a legend, built for `04-chart-translator`'s generic case, with zero changes needed
  here. **Known data-limitation, not a gap in this item:** both v0 temporal samples (stock_prices,
  weather) are date-only (`isoDate()` in `gen-samples.mjs`, no time-of-day component) — the
  seasonality heatmap correctly concentrates every cell at hour 0 for both, a true rendering of what
  the data contains, not a bug; this item's own AC only requires trend + moving average to render
  correctly on these two samples, not hour-of-day variance, so it isn't blocking. `make check` clean:
  lint, typecheck, 511/511 tests (up from 488 — 23 new: `timeSeriesSql.test.ts`'s 14 cases across
  builders/parsers including a negative-prior-value percent-change edge case, `TimeSeriesModule.
  test.tsx`'s 9 cases for eligibility filtering, SQL reactivity to control changes, sub-view
  switching, and the error state — chart-rendering internals aren't asserted in jsdom, matching this
  repo's own precedent that no test file exists for `ChartRenderer`/`AutoChartPanel` either; that
  coverage is the live verification below). Production build clean, entry chunk 107.53 KB gzip (was
  105.16 KB; +2.37 KB for this item's own code — `ChartRenderer`/DuckDB/Monaco chunks confirmed still
  absent from `dist/index.html`'s script tags). **Live-verified** (Playwright against a real `npm run
  dev`, throwaway script, reused `spike-ingestion`'s browser install, deleted after use — same
  precedent as every prior item): the real stock-prices sample's trend chart renders a genuine
  Recharts SVG at the `day`/`avg` default; switching granularity to `month` re-queries and re-renders
  in 30ms (bar: <500ms) with the new `DATE_TRUNC('month', …)` visible in the SQL panel; enabling the
  moving-average overlay adds the `ROWS BETWEEN 6 PRECEDING AND CURRENT ROW` window function and a
  legend appears for the second series; Copy SQL puts real, correct SQL text on the clipboard;
  Compare periods shows Latest/Prior KPI cards with a real % delta computed off `ORDER BY period DESC
  LIMIT 2`; Seasonality's `EXTRACT(dow FROM …)`/`EXTRACT(hour FROM …)` **confirmed to execute cleanly
  against live DuckDB-Wasm** (the real open technical risk in this item — unverified until now) with
  no query error, grid rendered; the weather sample's trend chart also renders with its own table
  correctly targeted in the generated SQL; the Titanic sample (no date column) leaves the Time Series
  sidebar card disabled with the exact "Needs a date and a numeric column" tooltip. Zero console/page
  errors across every run — 21/21 checks passed. Next: **`05-charting/02-correlation`** (Sonnet) —
  the correlation matrix module (`canDoCorrelation`), next per the checklist's row order.
  **Standing item, still open:** `app/` remains at zero git commits.
- **2026-07-20** — In progress, session ended on user handoff before live-verification ran —
  **implementation and unit tests are done and clean; the box stays unchecked.** `05-charting/
  02-correlation` (Sonnet): `src/lib/correlationSql.ts` is the pure batched pairwise-`corr()` SQL
  builder the leaf doc's Files line calls for (`correlationPairs`, `buildCorrelationMatrixSql`,
  `parseCorrelationMatrix` → a symmetric `CorrelationMatrix`, `buildScatterSql` for the
  drill-through), mirroring `timeSeriesSql.ts`/`pivotCompiler.ts`'s shape — one query, not
  n·(n−1)/2. **Reused where the leaf doc says it should be:** `lib/insights.ts`'s `buildLeakageProbe`
  (§10 Module 1) previously built its own local pairwise-`corr` SQL; refactored to call
  `correlationPairs`/`buildCorrelationMatrixSql` instead, so there is now one implementation of
  "batch every numeric pair into a single query," not two — `insights.test.ts`'s existing leakage
  tests pass unchanged (same `c0, c1, …` aliasing). New `src/features/charts/correlation/`:
  `CorrelationModule.tsx` (table picker gated the same defensive way `TimeSeriesModule`/
  `PivotBuilder` gate their own table lists — re-checks ≥2 Quantitative per table rather than
  trusting the pooled broker flag), `CorrelationHeatmap.tsx` (the grid; off-diagonal cells
  clickable, diagonal shown but disabled), `correlationColor.ts` (the diverging dark-blue →
  white → dark-red scale the master spec fixes, linear per-channel from the white midpoint, plus
  a WCAG-luminance-based black/white cell-text picker so a value is always readable against its
  own fill), `ScatterDrillThrough.tsx` (runs the two-column drill query, decides SVG vs canvas),
  `CanvasScatter.tsx` (plain HTML5 canvas 2D — no d3 dependency added; "D3 canvas mode" read as
  the *technique* §15 names — canvas over per-point SVG nodes — not a literal library requirement,
  consistent with how this tree has read other master-spec library mentions before), `GeneratedSql.tsx`
  (a local copy of the SQL-preview block, not a cross-folder import from `time-series/` —
  `PivotBuilder.tsx` already independently duplicates this exact small block rather than reaching
  into a sibling feature folder, so this follows that precedent instead of introducing new
  coupling). `ChartRenderer.tsx` already had a `correlation` `ChartSpec` case (built for
  `04-chart-translator`'s auto-chart scatter) reused unmodified for the ≤10k drill-through path,
  per this item's own Dependencies line. Wired into `App.tsx`'s `activeModule === 'correlation'`
  branch; the sidebar's Correlation card was already gated on `canDoCorrelation` since
  `01-foundation/03-routing`, dormant until now. `make check` clean: lint (oxlint), typecheck
  (`tsc -b`), 542/542 tests (up from 511 — new: `correlationSql.test.ts`'s pair-order/SQL-batching/
  matrix-symmetry/null-handling cases, `correlationColor.test.ts`'s exact-hex checks at both poles
  and the midpoint (the "matches spec ends and midpoint" AC), `CorrelationHeatmap.test.tsx`
  (diagonal disabled, off-diagonal click fires the right pair, null cell renders "—"),
  `ScatterDrillThrough.test.tsx` (SQL shape, the `CANVAS_POINT_THRESHOLD` = 10,000 switch each way,
  empty/error states), `CorrelationModule.test.tsx` (eligibility filtering, table-picker gating,
  batched-query SQL, cell-click wiring, error state)). Production build clean: entry chunk 109.62 KB
  gzip (was 107.53 KB; +2.09 KB for this item's own code), `ChartRenderer`/DuckDB/Monaco chunks
  confirmed still separate from it. **A real, non-obvious test-harness issue hit and worked around,
  not fully root-caused:** a `beforeEach`-level `vi.fn().mockReset()` shared across a describe
  block, combined with an earlier test in the same file rendering the *same* component with a
  *resolved* mock value, made a later *rejected*-mock test fail even though the component's own
  behavior and assertion were both provably correct (confirmed live via an added `console.log`
  showing the assertion's target text present *and* a custom `process.on('unhandledRejection')`
  listener never firing — so it isn't Node's own unhandled-rejection tracking; likely jsdom's
  window-level `unhandledrejection` event racing React's effect-scheduling tick, but that's a
  hypothesis, not confirmed). Fix: drop the shared `beforeEach` reset and chain `.mockReset()`
  inline before each test's own `.mockResolvedValue`/`.mockRejectedValue` call instead — this is
  already `TimeSeriesModule.test.tsx`'s existing convention for its own error case, just not
  previously understood as load-bearing rather than stylistic; applied to
  `ScatterDrillThrough.test.tsx` (`CorrelationModule.test.tsx` already happened to chain inline and
  needed no change). Worth a human call on whether this pattern should become a documented
  test-writing rule for this repo, since it will bite the next async-effect component test that
  follows the more natural shared-`beforeEach`-reset shape. **Not done, session ended on user
  handoff:** no live-browser verification at all this session (no `npm run dev` + Playwright pass)
  — every acceptance-criteria row (weather/stock matrix spot-check against known correlations,
  cell-click → correct scatter, 10k+ points actually smooth on canvas in a real browser rather than
  just unit-asserted, the disabled "Needs 2+ numeric columns" tooltip on a 1-numeric dataset) is
  unverified beyond `make check`'s jsdom-only tests. **Box stays unchecked, `▶` stays on
  `05-charting/02-correlation`** per this file's own rule that boxes only move on a met definition
  of done. Next: live-verify against the bundled weather/stock_prices samples (matrix values
  spot-checked, a cell click drilling into the right scatter, a 1-numeric-column slice showing the
  disabled tooltip), *then* check the box and move `▶` to `05-charting/03-distribution`. No other
  blockers.
- **2026-07-20** — `05-charting/02-correlation` live-verified and checked (Sonnet, continuing the
  implementation from the previous entry — no code changed, verification-only session). `make check`
  reconfirmed clean first (57 test files, 542/542 tests, lint, typecheck) with no changes made, then
  a real `npm run dev` + Playwright pass (throwaway script, reused `spike-ingestion`'s browser install
  per every prior item's precedent) drove the actual running app, one fresh page load per sample so
  each dataset's registered-table set matched what the acceptance criteria assume — the first attempt
  reused one page across samples, which silently accumulates datasets (each `loadSample` call adds a
  table without removing prior ones) and produced two false failures (stock's matrix picked up
  weather's leftover default-selected table; product_reviews read as correlation-enabled because
  weather+stock's numeric columns were still registered) that were misreads of test-script state, not
  real bugs — confirmed by rerunning fresh per sample. All acceptance rows this item's own next-step
  note called out passed live: weather's TempHighC vs TempLowC matrix cell reads 0.976 (correctly
  strongly positive, matches the two columns' real relationship), stock's Open vs Close reads 1.000;
  clicking the weather cell drills into a real Recharts scatter titled "TempHighC vs TempLowC" with a
  visible linear trend and the correct `WHERE ... IS NOT NULL` SQL beneath it; product_reviews (Rating
  is its only Quantitative column) shows the Correlation sidebar card disabled with the exact "Needs
  2+ numeric columns" tooltip on hover. Zero console/page errors across every run — 7/7 checks passed.
  **Left open, not blocking:** the 10,000+-point canvas-vs-SVG switch (`CANVAS_POINT_THRESHOLD` in
  `ScatterDrillThrough.tsx`) is unit-tested but still not live-verified against a real large table —
  no bundled v0 sample reaches 10k rows in a single table (weather 3,650, stock_prices 2,500), so this
  would need a synthetic fixture generated at test time; deferred rather than blocking this item since
  the leaf doc's own next-step note didn't call it out as part of this verification pass. Next:
  **05-charting/03-distribution** (Sonnet) — the v0 ship gate continues; no blockers on starting it.
  **Standing item, still open:** `app/` remains at zero git commits.
- **2026-07-20** — `05-charting/03-distribution` done and checked (Sonnet), all four acceptance
  rows live-verified through the real running app. **Reused rather than duplicated:**
  `lib/columnStats.ts`'s existing `buildHistogramSql`/`parseHistogram` (built for the profile
  card's fixed 10-bucket sparkline) gained an optional `binCount` parameter defaulting to the
  existing constant — this item's own "configurable bin count" requirement is that same binning
  math with one more parameter, not a second implementation; the profile card's own call site is
  unchanged (still gets 10 buckets by default). New `src/lib/distributionSql.ts` owns what
  `columnStats.ts` doesn't: `buildQuartilesSql`/`parseQuartiles` (`quantile_cont` at 0.25/0.5/0.75),
  a pure `computeIqrBounds` (Tukey's 1.5×IQR fence, no round trip), `buildWhiskersSql` (nearest
  in-fence data point, not the fence itself), `buildOutliersSql` (values outside the fence, capped
  at 500 so a heavy-tailed column doesn't try to plot thousands of dots), and `buildMomentsSql`/
  `parseMoments` — one round trip for mean/median/mode/stddev/skewness/kurtosis via DuckDB's
  `avg`/`median`/`mode`/`stddev`/`skewness`/`kurtosis` aggregates, all confirmed live to be real
  DuckDB-Wasm functions (an open question until this session — nothing in this tree had called
  them before). New `src/features/charts/distribution/`: `DistributionModule.tsx` (table/column/
  bin-count pickers, same per-table eligibility re-check `TimeSeriesModule`/`CorrelationModule`
  already use for their own lists — `hasDistributionShape` needs ≥1 Quantitative column on the
  actual table, not just the pooled broker flag), `Histogram.tsx` (a taller, axis-labelled sibling
  of `ColumnCard.tsx`'s existing sparkline — duplicated rather than sharing a component for one
  reuse, per this tree's own correlation-item precedent for small blocks), `BoxPlot.tsx` (plain
  SVG — no box-plot primitive in Recharts, same reasoning `CanvasScatter`/`CorrelationHeatmap`
  went custom for), `StatsPanel.tsx` (the descriptive-stats grid, `null` cells rendering "—" per
  this tree's established convention rather than a fabricated 0), local `GeneratedSql.tsx` (this
  item runs five queries, not one, so it takes a `label` prop to distinguish each SQL block rather
  than concatenating them into one unlabeled panel). **Deviation from the leaf doc's literal
  wording, resolved by established sibling precedent, not a master conflict:** `03-distribution.md`
  says stats should be "shown in the educational panel," which would mean routing through
  `EducationalPanelContext` (the profiling module's pattern); but `01-time-series`/`02-correlation`
  — built after that leaf doc's own line was written — already established the actual working
  shape for every `05-charting` module: a local inline `GeneratedSql` block beside the chart, not
  the app-level educational-panel slot. Master's own text uses the same generic "educational
  pattern" phrase for every module (§10), so this isn't a master-vs-leaf fact conflict, just a
  leaf doc whose prose predates the concrete shape its own sibling items already fixed; followed
  the shipped precedent rather than the older wording, no doc edit needed since master doesn't
  mandate the literal context-routing. `make check` clean: lint, typecheck, 571/571 tests (up
  from 542 — new: `distributionSql.test.ts`'s quartile/bounds/whisker/outlier/moments cases
  including the constant-column IQR=0 edge and the "leaves undefined moments null, never a
  fabricated value" case, `columnStats.test.ts`'s new configurable-bin-count cases, and
  `Histogram`/`BoxPlot`/`StatsPanel`/`DistributionModule` component tests — the module test mocks
  `runChartQuery` by SQL-fragment matching rather than call order since the component fires two
  sequential `Promise.all` batches). Production build clean: entry chunk 111.66 KB gzip (was
  109.62 KB; +2.04 KB, matching every prior chart module's per-item cost), DuckDB/`ChartRenderer`/
  Monaco chunks confirmed still separate. **Live-verified with an external reference computed
  independently of DuckDB** (this item's own definition-of-done bar): a standalone Python script
  read `public/samples/titanic.csv` directly (no pandas available in this environment, so
  `statistics`/hand-rolled formulas — sample stddev at ddof=1, the same adjusted Fisher-Pearson
  skewness/excess-kurtosis formulas pandas uses, linear-interpolation quantiles matching
  `quantile_cont`) and computed Age/Fare's mean, median, mode, stddev, quartiles, IQR fence,
  whiskers, and outlier list by hand. Every value the running app rendered (Playwright, throwaway
  script against `npm run dev`, reused `spike-ingestion`'s browser install, deleted after use)
  matched the Python reference exactly: Age (n=843) mean 37.9798/median 38/mode 7/stddev 22.029/
  skewness 0.0356/kurtosis -1.186/whiskers [1, 76]/0 outliers; Fare (n=891) mean 36.9264/median
  21.24/mode 3.78/stddev 38.7492/skewness 1.8922/kurtosis 3.0173/whiskers [3.22, 97.25]/89
  outliers, box-plot dot count and aria-label matching. Switching bin count from 10→20 live
  re-queried with a correctly halved bucket width and a `19`-clamped bucket index, confirming the
  re-query acceptance row. Zero console/page errors across the run. **Not separately click-verified,
  covered instead by the already-tested shared mechanism:** the "disabled with 'Needs a numeric
  column' tooltip" row — no bundled v0 sample has zero Quantitative columns to click through live,
  but `capabilities.ts`'s `canDoDistribution: numeric.length >= 1` is unit-tested and the identical
  broker-flag-to-disabled-tooltip wiring was already live-verified for `canDoCorrelation` on
  `product_reviews` in the prior item. Next: **05-charting/04-categorical** (Sonnet) — frequency
  bar chart, pie/donut for small-cardinality categories, grouped bar (Categorical + Quantitative);
  no blockers. **Standing item, still open:** `app/` remains at zero git commits.
- **2026-07-20** — `05-charting/04-categorical` done and checked (Sonnet), closing the v0
  ship-gate's chart-module set (only `05-join-graph-beta` remains in `05 charting`). New
  `src/lib/categoricalSql.ts` (mirroring `correlationSql.ts`/`distributionSql.ts`'s shape):
  `buildFrequencySql`/`parseFrequency` (one categorical column, `GROUP BY 1 ORDER BY 2 DESC`,
  capped at 50 rows so a high-cardinality column doesn't try to render hundreds of bars),
  `lumpTail` (pure — caps a row list at N slices, folding the remainder into one "Other" row),
  `buildCategorySummarySql`/`parseCategorySummary` (`grp`/`total`/`mean`/`rows` per group).
  **Reused rather than duplicated, per this item's own Files line:** `lib/insights.ts`'s
  `buildCatQuantProbe` (§10 Module 1's concentration + outlier-group rules) previously built
  its own local `SUM/AVG/COUNT ... GROUP BY` SQL inline; refactored to call
  `buildCategorySummarySql`/`parseCategorySummary` instead — same exact SQL shape and column
  aliases, so `insights.test.ts`'s existing concentration/outlier-group tests pass unchanged.
  The categorical module's own "Grouped bar" view reuses this same builder a second way: one
  query returns both `total` and `mean`, and a Sum/Average toggle just picks which
  already-computed column feeds the chart — no second query for the toggle. New
  `src/features/charts/categorical/`: `CategoricalModule.tsx` (table/column pickers, the
  same per-table eligibility re-check every prior chart module uses rather than trusting the
  pooled broker flag; three tabs — Frequency/Donut/Grouped bar), `FrequencyBar.tsx` (Recharts
  `BarChart` with `layout="vertical"` — the master spec's literal "horizontal" bar shape,
  distinct from the shared `ChartRenderer`'s vertical bars), `Donut.tsx` (Recharts `PieChart`,
  consumes `lumpTail`'s already-capped rows), `GroupedBarView.tsx` (reuses the shared
  `ChartRenderer` unmodified — `buildCategorySummarySql`'s result is the exact `categorical`
  `ChartSpec` shape `ChartRenderer` already renders for the SQL playground's auto-chart panel,
  so no new chart primitive was needed, this item's own Dependencies note), local
  `GeneratedSql.tsx` (same per-module-copy precedent every chart item follows). **Donut
  eligibility and tail-lumping are both pure client-side decisions off the already-classified
  `cardinality` field** — no discovery query — same "reactively cap, no round trip" shape
  `PivotBuilder`'s own top-N cap established: `DONUT_CARDINALITY_LIMIT = 15` gates whether the
  Donut tab is offered at all, `DONUT_MAX_SLICES = 8` caps visible wedges even under that
  offer-limit. **Bundle-size discipline, matching every prior chart item:** `FrequencyBar`/
  `Donut` are lazy-imported from `CategoricalModule.tsx` (same boundary `TrendView`/
  `ScatterDrillThrough` use for `ChartRenderer`) so Recharts stays out of the entry chunk
  despite `CategoricalModule` itself being imported eagerly in `App.tsx`. Wired into
  `stores/ui.ts` (`SidebarModule` gained `'categorical'`), `components/Sidebar.tsx` (new card,
  `PieChart` icon, gated on `canDoCategoricalBreakdown`, "Needs a categorical column"), and
  `App.tsx`. `make check` clean: lint, typecheck, 589/589 tests (up from 571 — new:
  `categoricalSql.test.ts`'s builder/parser/lump-tail cases including the exact-cap no-op and
  the `maxSlices = 1` degenerate case, `CategoricalModule.test.tsx`'s eligibility filtering,
  tab enable/disable wiring, SQL-fragment-routed query mocks, and the table-picker-only-
  when-multiple case). **No dedicated test file for `FrequencyBar`/`Donut` themselves** — same
  precedent as `ChartRenderer`/`AutoChartPanel` having none: Recharts-wrapper components render
  fine under jsdom (proven live via `CategoricalModule.test.tsx` mounting them through
  `Suspense` with a mocked `runChartQuery`) but their SVG internals aren't meaningfully
  assertable there; that coverage is the live verification below. Production build clean:
  entry chunk 112.94 KB gzip (was 111.66 KB; +1.28 KB, matching every prior chart item's
  per-item cost), DuckDB/Monaco/`ChartRenderer` chunks confirmed still separate — Recharts'
  bar/pie primitives land in their own `BarChart-*`/`Donut-*`/`CategoricalChart-*` chunks, none
  of them in `dist/index.html`'s script tags. **Live-verified** (Playwright against a real
  `npm run dev`, throwaway script, reused `spike-ingestion`'s browser install, deleted after
  use — a fresh page per sample this time, per `02-correlation`'s own live-verify entry
  flagging that reusing one page silently accumulates datasets across `loadSample` calls):
  Titanic's `Pclass` (cardinality 3) — Categorical sidebar card enables, column picker offers
  it, generated SQL matches `buildFrequencySql`'s shape, Donut tab enabled and renders a real
  `recharts-pie`, Grouped bar renders `SUM("Fare")`/`AVG("Fare")` by `"Pclass"`. **Correctness
  cross-check, not just "did it render":** the rendered frequency bars' SVG rect widths, read
  directly from the DOM, are proportional to Pclass's true per-class counts computed
  independently by fetching and parsing the raw `titanic.csv` in-page (451/265/175 — this is a
  synthetic, seeded sample, not the real historical Titanic distribution, so these aren't the
  textbook 216/184/491 figures; an earlier version of this check hardcoded those textbook
  numbers and correctly failed against the synthetic data before being fixed to compare against
  the real fetched reference) — widths matched the count ratios to within 1%, confirming the
  SQL→chart pipeline is genuinely data-correct, not just non-crashing. Product Reviews'
  `Rating` (the other AC-named column) also renders correctly on a fresh page. Stock Prices (no
  Categorical column) correctly leaves the sidebar card disabled — the AC's gate-check row.
  16/16 checks passed, zero console/page errors. **Not separately live-verified, covered by
  unit tests instead:** tail-lumping itself — no bundled v0 sample has a categorical column
  with more than `DONUT_MAX_SLICES` (8) distinct values (ecommerce's `products.category` tops
  out at 6), so the "Other" slice path only has real-CSV coverage once a future sample or
  Studio-era dataset needs it; `lumpTail`'s own unit tests cover the boundary exactly (no-op at
  the cap, lump-past-cap, and the `maxSlices = 1` all-lumped case) with hand-computed expected
  output, same rigor this tree already accepts for `pivotCompiler`'s equivalent top-N logic.
  Next: **05-charting/05-join-graph-beta** (Opus — inference/judgment tier per this file's own
  model rule) — the last `05 charting` item and the D24 Join Graph (beta); closing it clears
  the entire v0 ship-gate chart-module set. **Standing item, still open:** `app/` remains at
  zero git commits.
- **2026-07-20** — `05-charting/05-join-graph-beta` done and checked (Opus), all six acceptance
  rows live-verified through the real running app, and the **D24 kill criteria evaluated live →
  SHIP** (written decision below). This closes the entire v0 ship-gate chart-module set;
  `05 charting` (parent box) is left for a human to check against the *full* §18 v0 gate, since
  its exit criteria span more than this item (consistent with `03 profiling`/`01 foundation`
  parents left unchecked despite their children being done). **What the Join Graph is:** the v0
  seed of the Studio-arc relationship engine — FK-candidate inference across the registered
  tables, rendered as a thin interactive graph, explicitly labeled *beta*, with two honesty
  tiers exactly as the D17 spike's load-bearing finding requires: **confident/solid** only when
  containment is strong *and* the child column name echoes the parent, **dashed candidate**
  otherwise (structure alone cannot tell a real renamed FK from a coincidental dense key). **The
  engine seed lives at the frozen path `src/lib/relationshipInference.ts`** (pure: candidate
  generation, the containment/key SQL, parsers, name-agreement, two-tier scoring, ambiguity
  runner-up, and the override-merge) so Phase 8 (`10-studio/02-relationship-graph`) inherits it
  rather than starting from zero — the DoD's second clause. `src/services/relationships.ts` runs
  the probes against the engine (direct-engine/lazy-import pattern, same as `services/insights.ts`),
  memoizing parent-key stats per (table,column) so a wide fan-in doesn't re-scan a parent.
  `src/stores/relationships.ts` holds the manual overrides (add/remove/re-point) as **session
  state keyed by the stable child side**, so re-running inference re-merges over them — overrides
  survive re-profiling, the same "persist for the session" contract the column-classifier override
  already carries (a reload clears them; localStorage-per-dataset-fingerprint persistence is a
  deliberate v0 non-goal, matching the classifier). The graph view is placed **charts-adjacent**
  (`src/features/charts/relationships/`: `JoinGraphModule`, `JoinGraph` hand-rolled SVG — solid vs
  dashed, no graph-layout dependency, same custom-SVG approach as `BoxPlot`/`CorrelationHeatmap` —
  and `EdgeEvidencePanel`), the placement the leaf doc's Files line explicitly sanctions ("or
  charts-adjacent placement per ADR"); Studio's own sidebar card stays the v1 "Coming in Studio"
  slot, undisturbed. New sidebar card "Join Graph" (`Waypoints` icon) gated on ≥2 registered
  tables; routed in `App.tsx`; `SidebarModule` gained `'relationships'`. **Report + Dossier +
  Copy-for-AI integration (D20/D31/D48):** the inferred (and override-merged, i.e. *accepted*)
  graph now threads into three surfaces, each degrading to schema-only behind a single feature
  flag (`src/lib/featureFlags.ts`, `JOIN_GRAPH_ENABLED`, defaults on, forced off via
  `VITE_JOIN_GRAPH=false`): `structureReport.ts` gains an optional `relationships` section;
  `lib/dossier.ts` emits the previously-reserved `hero-join-graph` thumbnail (new
  `dossier/HeroJoinGraph.tsx`, wired through `ViewSpecRenderer`) leading the hero region with the
  table-grid demoted beneath it rather than removed — exactly what `HeroTableGrid`'s own comment
  anticipated; and a **new minimal "Copy for AI" block** (`src/lib/aiContext.ts`, a Markdown
  schema summary with **zero raw rows** per D31, plus a "Copy for AI" button on the Dossier's
  `IdentityBand`). **Note on scope:** no "Copy for AI" surface existed before this item; its own
  acceptance criterion names it, so a minimal real one was built here — the fuller D37 DSPS-JSON /
  self-contained-HTML renderer suite remains separate future work, and this item delivers the
  relationships *content* all those surfaces will reuse.
  **D24 KILL-CRITERIA DECISION — SHIP (evaluated live, 2026-07-20):** (1) *Quality* — on the
  e-commerce sample, inference recovers **all three first-order FK joins**
  (`orders.customer_id→customers.customer_id`, `order_items.order_id→orders.order_id`,
  `order_items.product_id→products.product_id`), **all confident, with zero spurious edges** — the
  ≤1-spurious-per-3-true budget is met with room to spare (precision beats recall, as required). (2)
  *Ambiguity* — no second spike needed; the near-ties the sequential-integer PKs create are
  correctly **disclosed as ambiguity runner-ups** and the true FK wins on name agreement, which is
  the spike's whole thesis demonstrated live. (3) *Timebox* — demo-ready now. (4) *Performance* —
  full 4-table inference measured **94 ms** (dev server, unthrottled), far inside §18's <500ms-class
  bar; large headroom for the 50MB folder given the spike's native 0.7s/3.0s with 2–4× WASM margin.
  **Three precision guards were added from the live evidence and are the difference between passing
  and failing criterion 1 — Phase 8 inherits them:** (a) a **parent key must be an integer/string
  identifier, never a float or a Quantitative measure** — the classifier promotes any near-unique
  column (including a coincidentally-unique `unit_price` DOUBLE) to Identifier, which without this
  guard drew a *confident false* `order_items.unit_price→products.unit_price` edge; (b) a **child
  that is itself a unique key with no name link is a coincidental sequence overlap, not an FK** (kills
  `product_id→customer_id`-style edges between independent `1..N` id ranges); (c) a **structure-only
  (no-name) candidate must reference a real fraction of the parent key** (kills a `quantity` of 1–5
  sitting inside a 1–400 id range). All three exempt name-agreeing edges, so a real or renamed FK is
  never dropped — the renamed-FK-as-dashed path stays open (unit-tested) even though the clean
  e-commerce sample has no legitimate dashed candidates. **Live verification (Playwright against a
  real `npm run dev`, reused `spike-ingestion`'s browser install per every prior item, throwaway,
  deleted after use):** module-level inference through the real DuckDB engine + real classified
  columns produced the 3-confident/0-spurious result above with correct evidence strings and
  ambiguity; the real UI renders 3 solid edges + the beta badge, edge selection shows evidence,
  **Remove drops 3→2 and the override persists across navigating away to Profile and back** (session
  store, survives re-profiling), the structure report and Copy-for-AI both include the 3
  relationships, the AI context leaks **no** raw row values (asserted against the sample's real
  email/name), and a **single-table (titanic) session correctly disables the Join Graph card with a
  "Needs 2+ tables" tooltip**; zero console errors across every flow. Flag-off degradation (sidebar
  card absent, Dossier on the table-grid hedge, report/AI-context schema-only) is covered by unit
  tests that drive the pure builders with no edges rather than an env-var rebuild. **No spec change
  was needed** — the build implemented §19/D24/§20.6 as written; the only doc-shaped edits were
  stale *code* comments in `structureReport.ts`/`dossier.ts`/`ViewSpecRenderer.tsx` that said the
  graph was unbuilt, corrected in place. `make check` clean: lint (oxlint), typecheck (`tsc -b`),
  **644/644 tests** (up from 589 — new: `relationshipInference.test.ts` 35 cases across
  name-agreement, type/key/measure/coverage guards, scoring boundaries, ambiguity, and override
  merge; `aiContext.test.ts` incl. the zero-raw-rows assertion; `relationships.test.ts` store;
  `JoinGraph`/`JoinGraphModule` component tests; and relationships coverage added to
  `structureReport.test.ts`/`dossier.test.ts`). Production build clean: entry chunk **118.63 KB gzip**
  (was 112.94; +5.69 KB for the module, inference, service, store, AI-context, and thumbnail — pure
  TS/SVG, no chart lib), DuckDB (198KB) and Recharts (`CategoricalChart` 304KB) confirmed still in
  their own chunks, absent from the entry. **v0 is now feature-complete: the entire v0 ship-gate
  chart-module set is done and the D24 slice ships.** Next: `▶` moved to **06-ai/01-pipeline** (Opus)
  as the next dependency-order leaf — but that crosses into **v0.5, which is gated on §18 acceptance
  criteria**; a human should confirm the v0 ship / §18 gate before v0.5 work starts rather than
  rolling straight in. **Standing item, still open:** `app/` remains at zero git commits.
- **2026-07-20** — **D68 landed in the spec (composition-layer round); no code shipped this
  session.** The encapsulated decision ladder — drop → Verdict → Thread → Takeaway, with typed
  rows-free contracts (`FactRef` / `RankedAction` / `DatasetVerdict` / `ThreadConfig`) at each
  seam — is now a settled decision, master-first across `DATASCOPE.md` §0 / §6 / §9 / §10 / §13.1 /
  §13.2 / §16 and mirrored into the citing leaves (`decisions.md`, `03-capability-engine`,
  `05-dataset-dossier`, `01-foundation/03-routing`, `system-design`, `roadmap`, the SQL/charting
  READMEs). It **recomposes the already-built Phases 1–5 — no scope, tier, date, or cut-order
  change** (a build-order emphasis like D67). The checklist gained the **composition-layer
  recompose (D68)** group (A–E) in v0; the affected leaf docs (`capability-engine`,
  `dataset-dossier`, `routing`, the SQL/chart modules) carry **new acceptance-criteria rows the
  shipped code does not yet meet** — the every-step-"profile again" dead loop, the untiered
  Dossier dump, and the flat 12-item sidebar. **`▶` moved from
  `06-ai/01-pipeline` to D68-A (Action Broker)** — dependency-correct: the AI producer plugs into
  these contracts (D56/D68f), so the deterministic seam freezes before AI, and this keeps the next
  step inside v0 rather than crossing the still-unconfirmed §18/v0.5 gate flagged in the entry
  above. A snapshot of the pre-D68 master + tree was kept in that session's scratchpad. Next:
  **D68-A** (Opus) — add `rankNextActions` to `lib/capabilities.ts`,
  delete `buildSuggestedNextSteps`, route each action to a real module; then B → C → D → E.
- **2026-07-20** — In progress on **D68-A (Action Broker), box NOT checked** — implementation and
  all unit tests are done and clean, the real-app UI end-to-end passed, but only the e-commerce
  sample was live-checked and a throwaway engine-level probe hit a test-harness artifact (below), so
  the box waits on one more verification pass. **What now works:** the Dossier's "suggested next
  steps" band is no longer a dead loop. `rankNextActions(tables, insights)` landed in
  `lib/capabilities.ts` (the Action Broker) — it joins broker legality with the D10 insight score and
  emits `RankedAction[]`, each carrying a `FactRef` (statement + producing SQL + snapshot +
  confidence/provenance) and routing to the **real module** that acts on the finding
  (change-point→time-series, leakage→correlation, concentration/outlier-group→categorical,
  duplicates→sql). `buildSuggestedNextSteps` is deleted; `buildDossierViewSpec` consumes the ranker
  and emits the panel as `{ actions }`; `SuggestedNextSteps.tsx` renders each verb + its fact and,
  on click, navigates via a new `onSelectAction` interaction wired through `DatasetDossier` →
  `ProfilingModule` to `useUIStore.setActiveModule` (a profile-bound action opens that table's
  profile in place; every other switches the sidebar module). **New contracts** in
  `src/types/actions.ts`: `FactRef`, `ThreadConfig`, `RankedAction` (the fourth D68 contract,
  `DatasetVerdict`, is deferred to the Verdict work, D68-B). `TableInsights` moved from `lib/dossier.ts`
  to `lib/insights.ts` (upstream of both the ranker and the Dossier, re-exported from `dossier.ts`
  for existing importers) so `capabilities.ts` and `dossier.ts` don't form an import cycle.
  **A real design bug surfaced by LIVE DATA and fixed** (this is the load-bearing find): on the actual
  e-commerce sample the classifier promotes near-unique measures (`unit_price`, `email`, `name`) to
  `Identifier`, so the highest-scoring insights are `id-exclusion` notes — and an early version routed
  all five to `profiling`, rebuilding the exact "review this in the profile" loop D68-A exists to
  kill. Fix: `RULE_ROUTES` covers only the **analytical** rules; the classification/quality notes
  (`id-exclusion`, `null-pattern`) are surfaced in the quality headline / insight feed and produce
  **no action**. When no analytical insight clears the interest floor (`INTEREST_FLOOR = 0.05`), the
  band degrades to **generic capability routing** (correlation matrix / time-series / categorical
  breakdown / distribution, and `Profile <largest table>` only as the honest last-resort floor) —
  never a manufactured finding. **Scope kept to Phase A:** `ThreadConfig.prefilledConfig` is
  *populated* (tableName + columns) but **not consumed** by any module yet — opening a module *on the
  answer* is D68-D (Thread pre-config); Phase A wires routing only. Each `FactRef.snapshot` comes from
  the source table's `createdAt` (no extra clock param); a `sampled` table's facts are marked
  `confidence: 'medium'`. **Docs corrected master-first:** the `rankNextActions` signature in master
  §9 and `03-capability-engine.md` changed `insights: Insight[]` → `insights: TableInsights[]` (there
  was never a real `Insight` type; the ranker needs the per-table pairing to route and to build the
  prefill), plus a note that the analytical-only routing and snapshot-from-`createdAt` are the real
  contract. **`make check` clean under node 22: lint (oxlint), typecheck (`tsc -b`), 651/651 tests**
  (was 644 — deleted 3 `buildSuggestedNextSteps` tests, added 10 `rankNextActions` tests covering
  real-module routing, the note-only-rules exclusion, the interest-floor degrade, the thin-profile
  floor, dedup, the FactRef shape, and sampled→medium confidence). Production build clean: entry
  chunk **119.19 KB gzip** (was 118.63; +0.56 KB, pure TS — no new dependency), DuckDB (198KB) and
  Recharts (`CategoricalChart` 304KB) confirmed still in their own chunks, absent from the entry.
  **Live verification (Playwright against a real `npm run dev`, throwaway, deleted after use):** the
  UI end-to-end **passed** on e-commerce — 4 tables ingest + classify; the Dossier renders 5
  real-module action verbs ("Explore the correlation matrix on the 4 numeric columns", "Chart … over
  …", "Break down the data by …", "Inspect the distribution of …", and the last-resort "Profile
  order_items" — **not** a profile-again loop); clicking the first **navigates to the correlation
  module**; zero console/page errors. The strong analytical insights (price/cost leakage etc.) did
  **not** fire on this synthetic data precisely because those measures classify as Identifiers, so the
  band correctly shows generic capability routing rather than manufacturing intrigue — the
  interest-floor degrade working as designed on real data. **Why the box is NOT checked:** (1) only
  e-commerce was live-checked — the thin single-table case (titanic → expected generic floor "Profile
  titanic") and at least one more sample still want a live pass; (2) the throwaway *engine-level*
  probe (re-importing `stores/datasets.ts` inside `page.evaluate`) read an **empty store**
  (`tablesLen: 0`) — a Vite + Playwright dynamic-`import()` **module-duplication artifact** (the
  re-imported store is a different instance than the running app's), so its direct-engine assertions
  are untrustworthy; the UI-level e2e above is the reliable signal and it passed. **To close D68-A:**
  re-verify the ranker without the module-dup artifact (read the rendered Dossier DOM, or expose the
  app store on `window` for the probe), spot-check titanic + one more sample live, then check the box
  and move `▶` to **D68-B — Tier the Dossier** (Sonnet). **ENVIRONMENT — read before running
  anything:** this session's shell had only Homebrew **node v26.5.0**; the repo pins **node 22**
  (`.nvmrc`). Under node 26, jsdom 29 throws `SecurityError: localStorage is not available for opaque
  origins` and **all 20 jsdom store/DOM tests fail spuriously** (nothing to do with the code). Ran
  everything under node 22 installed via `brew install node@22` (keg-only —
  `/opt/homebrew/opt/node@22/bin`, not on the default PATH); next session must do the same
  (`export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`), and no Playwright browser was cached here so
  `npx playwright install chromium` was needed (chromium-headless-shell). Files touched:
  `types/actions.ts` (new), `types/index.ts`, `lib/capabilities.ts`, `lib/insights.ts`,
  `lib/dossier.ts`, `features/profiling/dossier/{SuggestedNextSteps,ViewSpecRenderer,DatasetDossier}.tsx`,
  `features/profiling/ProfilingModule.tsx`, `lib/capabilities.test.ts`, `lib/dossier.test.ts`, plus
  the master §9 / leaf-doc signature correction. `▶` stays on **D68-A**. **Standing item, still
  open:** `app/` remains at zero git commits.
- **2026-07-20** — **D68-A (Action Broker) box checked; `▶` moved to D68-B.** Closed the two open
  items the prior session left: no code changed, this was verification only, run under node 22
  (`export PATH="/opt/homebrew/opt/node@22/bin:$PATH"` — the repo pins node 22 via `.nvmrc`, and the
  shell's own default `node` was v26, which spuriously breaks jsdom's `localStorage` in tests; the
  browser install from prior sessions was still cached, no reinstall needed). `make check` clean:
  lint (oxlint), typecheck (`tsc -b`), 651/651 tests, matching the number the previous session left.
  **Live verification (Playwright against a real `npm run dev`, throwaway script, deleted after
  use):** (1) titanic — expected to be the thin single-table generic-floor case, but the classifier
  actually finds real analytical structure (Fare/Pclass, Age, correlation), so it correctly surfaces
  three real-module actions ("Compare Fare across Pclass groups", the correlation matrix, Age's
  distribution) plus "Profile titanic" only as the trailing last-resort — not a dead loop either way.
  (2) weather (a second, non-ecommerce sample, date + numeric + one categorical column) — correctly
  surfaces a leakage-flagged correlation ("TempHighC"/"TempLowC" at 0.976), a time-series chart
  action, a categorical breakdown, a distribution action, and the same trailing profile fallback.
  Zero console/page errors on both. (3) Replaced the prior session's untrustworthy engine-level probe
  (the Vite/Playwright dynamic-`import()` module-duplication artifact that read an empty store) with
  a DOM read instead, per this file's own suggested fix — clicked weather's first ranked action
  ("Compare TempHighC and TempLowC…") and confirmed it actually navigates the sidebar to the
  Correlation module (checked the active-tab class on the real rendered button), not just that the
  label text looked plausible. **New, unrelated finding, not fixed here:** D68-A's own new/touched
  files carry `§n`/`D`-number citations in comments and docstrings — `types/actions.ts`,
  `lib/capabilities.ts`, `lib/dossier.ts`, `lib/insights.ts`,
  `features/profiling/dossier/{SuggestedNextSteps,ViewSpecRenderer,DatasetDossier}.tsx`,
  `features/profiling/ProfilingModule.tsx` all have at least one (e.g. `SuggestedNextSteps.tsx`'s own
  docstring: "The §9 Action Broker's render (§13.1, D68a)") — banned by this file's own Writing rules
  section. This is the same defect `02-ingestion/05-large-files` flagged as pre-existing across ~28
  files and left as an unscoped repo-wide cleanup call; D68-A's new code continued the pattern rather
  than closing it, so the gap is growing, not shrinking. Still a human call, not fixed in this
  session — flagging again since it's now spread into the composition-layer files too. Next:
  **D68-B — Tier the Dossier** (Sonnet) — `tier: 1|2|3` on ViewSpec panels, the Verdict band
  (identity + one headline `FactRef` + top-3 actions) + confidence floor, progressive disclosure for
  tiers 2–3, per the amended `05-dataset-dossier.md` acceptance criteria. No blockers.
- **2026-07-20** — **D68-B (Tier the Dossier) box checked; `▶` moved to D68-C.** Every `ViewSpec`
  panel now carries `tier: 1|2|3` (`types/viewspec.ts`, validated structurally by
  `validateViewSpec` — an out-of-range tier fails the same way an unregistered `componentId`
  already did). `identity-band` and a new `verdict` panel are the only tier-1 content; everything
  else (hero graph/grid, table strip, quality headline, time coverage → tier 2; top-insights →
  tier 3) sits behind one `ViewSpecRenderer` "See full profile" disclosure toggle rather than a
  two-step gate — master §13.1/D68c describes the renderer as showing tier 1 and gating
  "2–3" together, not staging them independently, so one toggle is the literal reading, not a
  simplification. **New `DatasetVerdict` contract** (`types/viewspec.ts`, not `types/actions.ts` —
  D68-A's own handoff note said this one lands elsewhere, since unlike `FactRef`/`RankedAction`/
  `ThreadConfig` it's consumed only by the Verdict screen, not threaded through multiple surfaces)
  — `{ identity, headlineFact, grain, timeSpan?, actions }`, built by new `lib/dossier.ts`
  `buildDatasetVerdict`, which `buildDossierViewSpec` now calls once and slices across the
  `identity-band` (identity + grain + timeSpan) and `verdict` (headlineFact + top-3 actions)
  panels. `grain` and `timeSpan` are genuinely new, schema-only derivations (no engine call): grain
  names the largest table's single Identifier column when exactly one exists ("orders: one row per
  order_id"), else falls back to a row count; timeSpan reads the largest table's own row in the
  already-computed `timeCoverage` array. **The confidence floor (D68c)** — `selectHeadlineFact`
  picks the top-scoring insight candidate *across all insights*, not just the ones
  `rankNextActions` can route to a module (a `null-pattern` note carries no route but is still
  headline-worthy), returns the exact floor sentence ("N tables · rows · no single dominant
  finding — here's the structure") via the existing `schemaFact` helper (now exported from
  `capabilities.ts`) when nothing clears `INTEREST_FLOOR`, and breaks a tie in favor of a
  quality-risk rule (duplicates/null-pattern/leakage) per the master §13.1 tie-break line. `verb`
  actions stay capped at the broker's existing 5 (`RANKED_ACTIONS_CAP`, `lib/capabilities.ts`) —
  only the Verdict's own `VERDICT_ACTIONS_CAP = 3` (`lib/dossier.ts`) trims to 3, so a future fuller
  consumer of the ranked list isn't starved. **A real design bug found and fixed via live data,
  not caught by any unit test:** the first live pass (e-commerce sample) surfaced `"customer_id" is
  near-unique — excluded from analysis` — an `id-exclusion` classification note — as the dataset's
  headline, exactly the confidently-banal-headline failure mode D68c exists to prevent (`id-exclusion`
  scores non-trivially on nearly every real table since most have an id column, and was never meant
  to compete with genuine findings — D68-A already excluded it from `RULE_ROUTES` for the same
  reason, just not from the headline). Fixed by filtering `id-exclusion` out of `selectHeadlineFact`'s
  candidate pool (not out of `QUALITY_RULES`, which still legitimately includes `null-pattern` for
  the quality headline and the tie-break); a regression test
  (`dossier.test.ts` — "never headlines an id-exclusion classification note") pins this. Renamed
  `SuggestedNextSteps.tsx` → `Verdict.tsx` and the `suggested-next-steps` registry id →
  `verdict` (no persisted `ViewSpec`s exist anywhere yet, so this was a safe rename, not a
  migration) — the component now renders the headline fact statement plus the (≤3) actions in one
  place rather than actions alone. **`make check` clean under node 22
  (`export PATH="/opt/homebrew/opt/node@22/bin:$PATH"` — the repo still pins node 22 via `.nvmrc`;
  the shell's own default `node` is v26, which spuriously breaks jsdom's `localStorage` in tests
  per the D68-A precedent): lint (oxlint), typecheck (`tsc -b`), 664/664 tests** (was 651; +13 —
  tier-tagging assertions on `buildDossierViewSpec`, `selectHeadlineFact`'s floor/tie-break/
  id-exclusion cases, `buildDatasetVerdict`'s grain/timeSpan/action-cap behavior, an invalid-tier
  case in `viewspec.test.ts`, and a new `ViewSpecRenderer.test.tsx` — three tests, since the
  disclosure toggle is genuinely new interactive UI with no prior test file). Production build
  clean: entry chunk **119.80 KB gzip** (was 119.19; +0.61 KB — the toggle's two new `lucide-react`
  icons plus the tier logic, no new dependency), DuckDB (198.76 KB) and Recharts
  (`CategoricalChart` 303.88 KB) confirmed still in their own chunks. **Live verification
  (Playwright against a real `npm run dev` on port 5190, throwaway scripts, deleted after use,
  reusing the cached `npx`-resolved Playwright install per the established precedent — `app/` still
  carries no browser-test dependency of its own):** e-commerce (multi-table, has a real join
  graph) — tier 1 alone shows identity band with the new grain/timeSpan line
  ("order_items: one row per order_item_id · 2019-01-07 – 2024-09-27"), the Verdict correctly
  degrades to the floor sentence once `id-exclusion` is excluded (every remaining real candidate on
  this synthetic data scores below the floor — an honest result, not a regression), and 3 ranked
  actions; clicking "See full profile" reveals the join-graph hero, table grid, table strip, time
  coverage, and top insights, with the button relabeling to "Hide full profile". titanic
  (single-table, no join graph) — tier 1 shows a real headline
  ("\"1\"'s mean Fare is 1.6σ above the rest."), correct grain ("titanic: one row per PassengerId"),
  no `timeSpan` (no date column, and the props render nothing rather than "undefined"), and 3
  actions; disclosure gate confirmed present. Zero console/page errors on both. **Not separately
  live-verified, covered by unit tests only:** a real dataset where the quality-risk tie-break
  actually fires (both live samples had a single top-scoring candidate, no tie), and the
  zero-Identifier/zero-date grain and timeSpan fallback strings — reasonable unit-test-only coverage
  per this file's own established bar, not a gap specific to this item. Dev server (port 5190)
  stopped before handoff; throwaway scripts lived only in this session's `npx` cache dir and
  scratchpad, not committed. Next: **D68-C — Nav restructure** (Sonnet) — collapse the 12 flat
  sidebar cards into 4 intent groups (DATA/EXPLORE/ANALYZE/OUTPUT), collapse the 4 chart sub-types
  into one capability-gated Charts destination, remove Studio/ML/Learn from v0 nav, add the sticky
  "skip to data" escape hatch (D68d) — full scope in `01-foundation/03-routing.md`'s amended
  criteria. No blockers.
- **2026-07-20** — **D68-C (Nav restructure) box checked; `▶` moved to D68-D.** The sidebar is now
  four collapsible, capability-gated intent groups (§13.2) — **DATA** (Ingest, Dossier, Profile,
  Join Graph), **EXPLORE** (SQL, Charts), **ANALYZE** (Pivot, Correlation, AI Chat), **OUTPUT**
  (Export/Share) — replacing the flat 12-card list. New `SidebarGroup.tsx` (collapsible header,
  chevron, optional badge); `Sidebar.tsx` computes each group's default reveal from §13.2's own
  "Expanded when" column (DATA always; EXPLORE once a table exists; ANALYZE once any of its cards
  is legal; OUTPUT once a table exists) and auto-expands whichever group holds the active module,
  without ever auto-collapsing a group the user or a prior reveal already opened — a manual header
  click always still toggles. **`stores/ui.ts`'s `SidebarModule` shrank from 13 ids to 10** —
  `ingestion`, `dossier`, `profile`, `sql`, `pivot`, `charts`, `correlation`, `relationships`,
  `ai`, `export` — dropping `studio`/`ml`/`learn` (D68d: Studio/ML return when real; Learn moved to
  a header `CircleHelp` icon, a one-line reused tooltip, since no Learn content ever existed to
  carry over) and the three chart sub-type ids (`time-series`/`distribution`/`categorical`), which
  are now internal tabs inside one new **`ChartsModule.tsx`** — filtered to broker-eligible tabs,
  auto-selecting the first, honoring an incoming tab request from `activeTabId` exactly once on
  arrival and never overriding a manual tab switch afterward (a real bug caught before it shipped:
  an earlier draft re-ran the request-matching effect on every capability recompute, which would
  silently snap a user's manual tab choice back to the original request the moment a new table
  landed — fixed by applying the request only once via a mount-scoped ref, then only ever
  correcting *away* from a tab that becomes ineligible). **`activeTabId` is now a generic
  "sub-destination within the active module" hint**, not the dead stub it was — `setActiveModule`
  takes an optional second arg and sets both fields atomically (no two-step race). It carries a
  table id for `profile` (set by the Dossier's "open this table" / a profile-bound ranked action)
  and a chart-type id for `charts` (set by a ranked action naming a specific chart). **`profiling`
  split into two real top-level modules** — `DossierModule.tsx` and `ProfileModule.tsx` — replacing
  the old single module's internal `{kind:'dossier'}|{kind:'table'}` view-switch, matching master's
  three-item DATA row instead of nesting Profile inside Dossier. **Pivot promoted out of the SQL
  playground into its own ANALYZE destination**, per master §13.2 (the nav
  table lists "Pivot / cross-tab" as its own destination, not a SQL sub-panel) — extracted the
  Results/Chart/History block SqlModule and the old inline `PivotBuilder` both fed into a shared
  `QueryResultsPanel.tsx` (props-free, reads the query store directly) so `SqlModule` and the new
  `PivotModule.tsx` render identical output from the same `runQuery` path (D49: still no second
  execution path). **Routing precision preserved across the chart-tab collapse, not just
  regrouped:** `lib/capabilities.ts`'s `RULE_ROUTES`/`genericActions` now target `charts` (+ a new
  optional `tab` field on `RuleRoute`/`RankedAction`, not on `ThreadConfig.prefilledConfig` — kept
  separate from D68-D's still-untouched thread-prefill contract) instead of the three now-defunct
  module ids, so a change-point insight still lands specifically on the Time Series tab and a
  concentration/outlier-group insight on Categorical, not on whichever tab `ChartsModule` happens
  to auto-select. **Caught and fixed a real dedup bug this collapse would otherwise have
  introduced:** `rankNextActions`'s "never offer the same destination twice" logic keyed only on
  `module`; once three formerly-distinct modules became one (`charts`), that key would have let one
  chart-shaped insight action silently block the other two chart-shaped *generic* fallback actions
  from ever appearing (e.g. a change-point finding claiming the `charts` slot would starve the
  distribution/categorical generic routes even though neither was actually offered). Fixed by
  keying on `module:tab` instead — confirmed live (below) that a time-series and a categorical
  action still both appear from the same ranked-action set. **Sticky "skip to data" (D68d):** new
  persisted `settings.skipToData` (defaults `false`); a checkbox at the top of the sidebar toggles
  it and, when turned on with data already loaded, navigates straight to `profile` immediately;
  `IngestionPanel`'s two post-ingest auto-navigate call sites now land on `dossier` or `profile`
  depending on the preference (previously both hardcoded to the old `profiling`). Sidebar width
  `w-32`→`w-56` for the longer group-grouped labels. **Judgment call, not
  dictated by any doc — flagging for a human check:** master §13.2's own DATA/EXPLORE/ANALYZE/OUTPUT
  table never mentions the Join Graph at all (it predates D68d, or the beta was meant to drop out of
  top-level nav entirely in favor of the Dossier's hero click-through — unclear which). Kept
  `relationships` as its own DATA-group card, unchanged gate (`tables.length >= 2`,
  `JOIN_GRAPH_ENABLED`), since removing a shipped, tested nav entry on a *reading* of a silent gap
  felt like the wrong default; a human should confirm whether it belongs in DATA, should move
  elsewhere, or should actually leave top-level nav now that the Dossier hero already links to it.
  **Leaf doc corrected in place** (not master — master's own grouping table was already right):
  `03-routing.md`'s "New/changed shell pieces" line named an incomplete `SidebarModule` list
  (missing `correlation`/`ai`/`relationships`); fixed to the real ten-id set actually shipped, with
  the reasoning for keeping Correlation out of `ChartsModule` (it is a matrix, not a chart-type
  view) spelled out since master states the grouping but not this rationale. **`make check` clean
  under node 22 (`export PATH="/opt/homebrew/opt/node@22/bin:$PATH"` — `.nvmrc` precedent):** lint
  (oxlint), typecheck (`tsc -b`), **676/676 tests** (was 664; +12 — two new component test files,
  `ChartsModule.test.tsx` and `SidebarGroup.test.tsx`, plus a full rewrite of `Sidebar.test.tsx` and
  targeted fixes to `capabilities.test.ts`/`App.test.tsx`/`privacy.test.ts` for the new module ids
  and destination keys). Production build clean: entry chunk **121.38 KB gzip** (was 119.80; +1.58
  KB for the whole restructure), DuckDB (198.76 KB) and Recharts chunks still absent from it; the
  only chunk-size warning is Monaco's pre-existing multi-MB lazy chunk, unrelated to this item.
  **Live verification (Playwright against a real `npm run dev` on port 5199, throwaway scripts,
  deleted after use, reusing the cached `npx`-resolved Playwright install per established
  precedent):** pre-drop sidebar shows all four group labels with only DATA's cards visible,
  Studio/ML/Learn absent, a header Help icon present; loading the e-commerce sample shows a
  "Tables (4)" badge and auto-expands EXPLORE/ANALYZE/OUTPUT without collapsing DATA; clicking the
  Verdict's ranked actions live confirmed **both halves of the tab-hint fix** — "Chart
  orders.customer_id over customers.signup_date" (a generic time-series route) landed on Charts
  with **Time Series** active, "Break down the data by customers.name" (a generic categorical
  route) landed on Charts with **Categorical** active, and "Explore the correlation matrix"
  correctly has no tab bar at all since Correlation is its own module; direct sidebar clicks
  confirmed Profile opens on a real table, Pivot renders `PivotBuilder` over the shared
  Results/History panel, and Correlation stays tab-bar-free; toggling "skip to data" with data
  loaded navigated straight to Profile and the preference round-tripped through `localStorage`.
  Zero console/page errors across the whole flow. Dev server stopped before handoff; throwaway
  scripts lived only in this session's scratchpad. Next: **D68-E — AI seam freeze** is
  next in file order, but **D68-D — Thread pre-config** is next in *dependency* order per this
  file's own D68 rollout note above (D — Thread pre-config: analysis modules accept a
  `ThreadConfig` prefill; ranked actions open modules **on the answer**) — `ThreadConfig` and its
  `prefilledConfig` payload already exist and are already populated by the broker (D68-A) but
  genuinely unconsumed by any module yet; this item wires that consumption in
  `build/04-sql/`/`build/05-charting/`'s amended criteria. No blockers, but the Join Graph nav
  placement judgment call above wants a human answer before it's load-bearing for anything else.
- **2026-07-20** — **D68-D (Thread pre-config) box checked; `▶` moved to D68-E.** All six modules
  master's "Thread pre-configuration" section names (§"Thread pre-configuration — modules open on
  the answer (D68e)") — Time-Series, Distribution, Categorical, Correlation, Pivot, SQL — now
  consume a `RankedAction`'s `ThreadConfig` and open pre-selected/pre-run rather than empty
  (a settled judgment call from that round, "run it"). New `stores/ui.ts` field
  `pendingPrefill` carries the payload atomically with the module switch (`setActiveModule`
  gained an optional third arg); a new `hooks/useThreadPrefill.ts` reads it exactly once on the
  destination module's mount (lazy `useState` initializer, so it's available on the very first
  render) and clears it in a mount-only effect — a module reached again afterward (sidebar click)
  starts empty, unchanged from today. `lib/threadPrefill.ts` holds the typed accessors
  (`prefillTableName`/`prefillColumns`/`prefillString`) every consumer parses the deliberately-open
  `Record<string, unknown>` through, matching the existing defensive-parse pattern
  `DatasetDossier.tsx`'s profile-routing case already used. **A real gap closed that D68-A
  (Action Broker) had explicitly deferred to this item, not new scope:** `genericAction`/
  `genericActions` in `lib/capabilities.ts` always emitted `prefilledConfig: {}` — every
  generic-but-honest fallback route (the common case; most datasets' real findings don't clear the
  interest floor) would have opened empty regardless of how well modules consumed the contract.
  Fixed by having each generic route resolve its already-chosen verb columns (`caps.dateColumns[0]`
  etc.) against the classified tables via new `resolveGenericPrefill` — qualified refs
  (`table.column`, present once ≥2 tables contribute) name their table directly, bare refs resolve
  only when exactly one classified table exists; a genuine cross-table split (a date on one table,
  a measure on another — pooled capabilities can be legal with no single table actually holding
  both) returns `null` and the action opens unprefilled rather than guessing, live-confirmed below.
  **A second, previously-invisible bug surfaced and fixed in the same pass:** the `'profile'`
  generic action's verb has always named a specific table ("Profile orders"), but with
  `prefilledConfig: {}` it could never actually open on that table —
  `DatasetDossier.tsx`'s existing profile-routing special case reads `tableName` off the prefill,
  found nothing, and silently fell through to `ProfileModule`'s own first-table default, which
  needn't be the one named in the verb on a multi-table dataset. Fixed as part of populating
  generic prefill (the profile action now always carries `{ tableName }`); `DatasetDossier.tsx`'s
  `handleSelectAction` was also generalized to thread `prefilledConfig` through `onNavigate`'s new
  third argument for *every* action, not just the profile special case. `insightAction`'s SQL-routed
  case (today only `duplicates`) reuses `candidate.sql` verbatim as the prefill — the exact query
  that produced the finding — rather than a new template. **One within-module judgment call, not
  dictated by any doc:** `CategoricalModule` auto-selects the **Grouped bar** sub-tab (instead of
  the default Frequency) when the prefill names a measure column, since a `concentration`/
  `outlier-group` finding's pair *is* that grouped comparison, not a plain frequency count —
  live-confirmed below. **`make check` clean** (lint, typecheck, **692/692 tests** — was 676; +16
  covering the new resolver/consumption paths: `capabilities.test.ts` (route + generic prefill
  shapes, the sql-reuse case, the honest cross-table-ambiguity `null`), `stores/ui.test.ts`
  (atomic prefill set/clear), and one "opens on the answer" + one graceful-fallback test each for
  `TimeSeriesModule`/`DistributionModule`/`CategoricalModule`/`CorrelationModule`/`SqlModule`/
  `PivotBuilder`). Production build clean: entry chunk **122.03 KB gzip** (was 121.38; +0.65 KB —
  the hook/lib/store additions, no new dependency), DuckDB (198.76 KB) and the chart chunks still
  absent from it. **Live verification (Playwright against a real `npm run dev` on port 5201,
  throwaway scripts run from `spike-ingestion/` to reuse its committed Playwright dependency per
  established precedent, deleted after use — `app/` still carries no browser-test dependency of its
  own):** e-commerce sample (multi-table, every real insight scored below the floor this run, so
  every visible action was generic) — "Break down the data by customers.name" landed on Charts /
  Categorical with the `customers` table and `name` column genuinely pre-selected (not defaults —
  confirmed via the table select's actual value, a UUID matching that table's id); "Chart
  orders.customer_id over customers.signup_date" (date and measure from two *different* tables —
  the honest-ambiguity case) opened Time Series with no crash and a sensible first-eligible-table
  default, confirming `resolveGenericPrefill`'s `null` path degrades cleanly rather than mis-wiring
  two unrelated tables together; "Explore the correlation matrix" opened a real 3-column matrix
  with no pair pre-selected (correct — the generic correlation route names no pair to highlight).
  titanic sample (single-table, real findings) — "Compare Fare across Pclass groups" (an
  `outlier-group` insight) landed on Categorical with **Grouped bar already active**, `Pclass` and
  `Fare` both pre-selected, and the real `SUM("Fare") ... GROUP BY` SQL already run, not an empty
  form; "Inspect the distribution of Age" (generic, single-table) pre-selected `Age` on the
  Distribution tab. Zero console/page errors across every interaction in both runs. **Not
  live-verified, covered by unit tests only:** the `duplicates`→SQL route (neither sample's real
  findings cleared the interest floor for `duplicates` in this session's live runs, so the button
  never appeared to click) and `PivotBuilder`'s consumption (no live route emits `module: 'pivot'`
  today — master names Pivot among the six regardless, for contract completeness and the v0.5+ AI
  producer, so this path is exercised by its own unit test, not yet a real ranked action) — both
  gaps are pre-existing/expected, not caused by this item, and the unit tests assert the exact
  SQL/state each would produce. Dev server (port 5201) stopped before handoff; throwaway scripts
  lived only in `spike-ingestion/` and were deleted, not committed. **Model note:** built on
  Sonnet per this row's own commitment — no correction needed. Next: **D68-E — AI seam freeze**
  (Opus, design only, no AI code) — freeze the two §6 producer interfaces (action ranking,
  narration) so Phase 6 is a drop-in; an ADR + `types/*`. No blockers on this item; the Join Graph
  nav placement judgment call (D68-C's entry above) remains open and unrelated, still wants a
  human answer before it's load-bearing for anything else.
- **2026-07-20** — **D68-E (AI seam freeze) box checked; `▶` moved to 06-ai/01-pipeline.** The two
  AI producer seams the composition layer charters — **action ranking** (§9: re-rank/re-phrase the
  `RankedAction[]`) and **findings narration** (§12.2/§13.1, D65: re-phrase a `FactRef`'s
  `statement`) — now have a frozen drop-in contract, so Phase 6 adds a producer per seam and touches
  no UI, no D68 contract, and no deterministic floor. Deliverable is exactly the item's spec — an
  ADR + `types/*`, **no AI code** (D2/D28 hold: the deterministic ladder is still the complete
  product). New **`architecture/adr/010-ai-producer-seams.md`** (Accepted — an interface-shape
  freeze derived from settled decisions, not a spike-gated one; it explicitly does *not* decide
  model/routing/cost, which stay in the still-Pending ADR-007, and the two ADRs are scoped not to
  overlap). New **`app/src/types/producers.ts`** (wired into the `types` barrel) declaring the
  frozen shapes: `ActionRanker.rerank(baseline, fingerprint)` and `FindingsNarrator.narrate(baseline,
  fingerprint)`, plus `FactFingerprint`, `ProducerResult<T>`/`ProducerSource`/`ProducerDegradeReason`
  (the four honest degrade states — `ai-off`/`ai-down`/`ai-uncached`/`ai-rejected`), and the
  `ProducerValidator<T>` seam-guard type. **The load-bearing design choice** (recorded in ADR-010's
  Decision 2, alternatives, and the type doc-comments): the AI is a **replace-in-place producer over
  the deterministic baseline** — it receives the already-computed slice (never the raw registry or
  DSPS), so "bound to the broker grammar" and "never invents a claim or a route" become
  *unrepresentable to violate* rather than a runtime check a future producer could skip; the ranker
  may only reorder + re-phrase `verb`s (set-identity by module+prefill+evidence enforced), the
  narrator may only re-phrase `statement` prose (every other `FactRef` field byte-identical, D45
  phrasing guard upheld). A seam validator — owned by the seam, applied by the Phase-6 orchestrator,
  **never self-certified by the producer** — degrades to deterministic on any violation. Master
  mirrored: §6 (composition-contracts paragraph) and §9 (the AI-re-rank sentence) now point at
  ADR-010 as the frozen seam contract, and `build/06-ai/README.md` gained the reciprocal pointer
  (the ADR's "Referenced by"). The D68 decision row was left untouched (settled). **`tsc -b
  --noEmit` clean (exit 0)** — the real gate for a type-only freeze; the new file compiles and the
  barrel re-export adds zero runtime (all `export type`/`export interface`, erased at compile).
  **ENVIRONMENT — read before running `make check` here:** this sandbox runs **Node v26.5.0**, whose
  experimental built-in `localStorage` global resolves to `undefined` (no `--localstorage-file`) and
  **shadows jsdom's `localStorage` under vitest 4**, so **23 pre-existing localStorage-backed tests
  fail** (all of `src/app/App.test.tsx`, `src/components/Sidebar.test.tsx`, `src/stores/privacy.test.ts`,
  `src/stores/settings.test.ts` — settings-persistence / sidebar-render / privacy-gate) with
  `TypeError: Cannot read properties of undefined (reading 'clear')`. **669/692 pass; the 23 failures
  are the Node-26 environment, not this change** — proven: this item adds only type declarations
  (imported by none of the failing tests at runtime), the prior session logged 692/692 under a saner
  Node, and a standalone `new JSDOM('', {url})` still yields a working `localStorage`. A speculative
  `environmentOptions.jsdom.url` probe was tried and **reverted** (it fixes jsdom's opaque-origin
  path, not the Node-global shadow — wrong layer). **Standing item for a human:** decide the harness
  fix (pin Node < the Web-Storage-global version for CI, pass `--localstorage-file`, or add a
  `setupFiles` localStorage shim) — out of scope for a design-only ADR item and risky to guess
  (a hand-rolled shim could mask a real persistence regression). **Model note:** built on Opus per
  this row's commitment — correct, no substitution. Next: **06-ai/01-pipeline** (Opus) — but the
  whole v0.5 AI group is **gated on §18 acceptance criteria** (the v0 launch bar), so it is not a
  "just start it" item; confirm the gate before opening it. The Join Graph nav-placement judgment
  call (D68-C) remains open and unrelated.
- **2026-07-21** — Design update, no code: **D70 adds a new post-launch tier, v0.25** — the
  Blueprint-forward opening + Cloudflare-edge dataset synthesis → in-browser WebLLM handoff + BYOK
  (founder direction, from the `app/ideation.html` "Dataset Blueprint" mockup). Landed master-first
  (§0 D70; §19 cutline + a v0.25 phase block; §6/§11/§13.1 pointers) and mirrored into the tree
  (`product/roadmap.md` v0.25 section + cutline; `foundations/privacy-model.md` — the edge-synthesis
  structure-only/opt-in/never-stored stance and WebLLM now scoped-but-D43-gated). A **v0.25 checklist
  section** is added above (before v0.5). **Nothing is built and no box is checked** — this is a
  scope/record change, not a build step. **Two open human calls, deliberately not decided here:**
  (1) v0.25's exact build sequence relative to `06-ai` — its BYOK and edge-router items re-sequence
  existing v0.5 rows (`06-ai/02-modes-byok`, `09-edge/01-ai-router`) and it reuses 06-ai's provider
  routing, so it does not cleanly precede 06-ai; **the `▶` was left at `06-ai/01-pipeline`, not moved**;
  (2) the v0.25 **leaf docs under `build/` still need authoring** before any of its rows are buildable.
  The one genuinely-new architectural commitment is the edge-warm → WebLLM handoff (ADR-007/ADR-010
  territory); everything else curates settled decisions (D2/D43/D48/D56/D68/D69). Snapshot of the
  pre-D70 master + tree is in this session's scratchpad (`snapshot-pre-d70/`) for diff-checking.
  Next (unchanged): **06-ai/01-pipeline** remains the ▶ and stays gated on §18; a human should confirm
  the v0.25-vs-06-ai sequencing and commission the v0.25 leaf docs before v0.25 build starts.
- **2026-07-21** — Docs only, no code, no box checked, **`▶` unchanged at `06-ai/01-pipeline`.** The
  v0.25 leaf docs the D70 landing left owed now exist under [`build/v0.25/`](build/v0.25/), mirroring the
  §19 v0.25 block into the build tree so every v0.25 checklist row resolves to a home. **No master edit**
  — D70 already landed master-first; this is the mirror half. **Authored:** `build/v0.25/README.md` (tier
  brief, the re-sequence map, the load-bearing deterministic-first invariant, and the open sequencing
  call flagged as order-neutral), `01-blueprint-opening.md` (Sonnet — the Dossier/D68 Verdict promoted to
  the primary post-ingest surface, D69 layers mapped **onto** the `1|2|3` disclosure tiers not into them,
  the D68d skip-to-data escape hatch, no new engine), `02-edge-synthesis.md` (Opus — the Cloudflare
  warm-start synthesis Worker `edge/synthesis.ts`, an ADR-010 replace-in-place producer over DSPS
  structural facts only, opt-in / stateless pass-through / never stored / local-only-never-calls, on the
  ADR-006 shared limiter+kill-switch+content-free-counter infra, D40/D56 eval-gated on the feature),
  `03-webllm-handoff.md` (Opus — in-browser WebLLM/WebGPU background download → client-side conversational
  takeover at zero egress, a **hard gate** on the ADR-007 D43 verdict, scoped as a client-side provider
  that does *not* build the §11.1 stage 1–6 pipeline). **Structural decisions (stated for human redirect):**
  (1) a **non-numeric `build/v0.25/` folder** rather than renumbering — v0.25 re-sequences the numbered
  v0/v0.5 modules and this keeps the folder order-neutral, so it does **not** preempt the open
  v0.25-vs-06-ai sequencing call; (2) the **WebLLM spike gets no build leaf doc** — like the two v0 spikes,
  its brief/verdict live in ADR-007 (which already reserves the D43 verdict) + `decisions.md`'s spike log;
  (3) **BYOK re-sequences `06-ai/02-modes-byok.md`** and edge routing reuses `09-edge/01-ai-router.md` — no
  duplicates. **Wiring:** registered the four files in [`meta/doc-index.md`](meta/doc-index.md) (new
  `v0.25` section); added the **missing v0.25 row** to [`README.md`](README.md)'s release-tier table (the
  D70 session mirrored roadmap + privacy-model but not this table); added a mirror-map row in
  [`maintenance/README.md`](maintenance/README.md); acknowledged the synthesis Worker as an **authorized
  new edge path (D70)** in [`build/09-edge/README.md`](build/09-edge/README.md) (that folder's own rule
  forbids an unlisted server path); wired the five v0.25 checklist rows above to their homes; and updated
  the `product/roadmap.md` pointer that still said the leaf docs were "to be authored." **Verified:** all
  31 relative links in the new docs resolve; `maintenance/sweep.sh` clean on D-header range, D70 coverage,
  and forward-ref checks. **Flagged, pre-existing, NOT introduced here — needs a human:** `sweep.sh`'s
  check [3] reports `architecture/decisions.md` is missing the **D70 row** (master §0 has D70; the split-tree
  Decision Record ends at D69 and its title still reads "D1–D69"). This is an unmirrored D-row from the
  D70 landing session, not this task. Left unfixed on purpose — the Decision Record is
  **human-instruction-gated** (CLAUDE.md: "never edit it without an explicit human instruction"); closing
  it means transcribing the settled D70 row into `decisions.md` and bumping its title/intro, which a human
  should authorize. Snapshot of the four edited files pre-change is in this session's scratchpad
  (`snapshot-pre-v025-leafdocs/`). **Next:** a human (1) closes the D70→`decisions.md` mirror gap (or
  authorizes it), and (2) makes the v0.25-vs-06-ai sequencing call — until then `▶` stays at
  `06-ai/01-pipeline` (still §18-gated; v0 has not launched). Once sequenced, v0.25 build starts with the
  **WebLLM spike → ADR-007**, whose passing verdict is the hard gate on `03-webllm-handoff.md`.
- **2026-07-21** — D70→`decisions.md` mirror gap (flagged in the entry above) **closed on human
  instruction.** The settled D70 row is now mirrored into the split-tree Decision Record
  ([`architecture/decisions.md`](architecture/decisions.md)) faithfully to master §0 — its title bumped
  D1–D69 → **D1–D70**, the round-dating intro sentence gained its D70 clause, and the D70 table row
  carries the full four-content decision (Blueprint-forward opening, edge-warm synthesis, WebLLM handoff,
  BYOK) with the privacy reconciliation and the D42/D15/D27 no-scope-creep guardrails, ending with the
  `build/v0.25/` leaf-doc pointer. `maintenance/sweep.sh` now reports **SWEEP CLEAN (D1–D70 consistent
  across master + tree)** — [3] confirms decisions.md tops out at D70. No other doc changed; no code; no
  box checked; `▶` still at `06-ai/01-pipeline`. Remaining open human call (unchanged): the
  **v0.25-vs-06-ai sequencing** — the v0.25 docs stay order-neutral until then.
- **2026-07-21** — **v0.25 build opened; `v0.25/01 Blueprint-forward opening` done and checked; `▶` moved
  to the WebLLM spike.** The **sequencing call is made** (human: "lets go v0.25 · go in the order that seems
  logical"): v0.25 runs before `06-ai`, order **Blueprint-opening → WebLLM spike → (06-ai provider routing)
  → edge synthesis / WebLLM handoff / BYOK** — only the Blueprint opening and the spike have no 06-ai
  dependency, so they lead; the three AI-dependent rows reuse 06-ai's routing and follow it. **What now works
  and why it matters:** the app **opens on the Blueprint** — the promoted Dossier is now a named surface a
  user lands on and reads as the briefing, not an unlabeled overview. The post-ingest route to `dossier`
  already existed (D68-C); this item makes the surface *be* the Blueprint (a sticky "Blueprint" wordmark +
  the sidebar card relabeled `Dossier`->`Blueprint`; **internal module id `dossier` unchanged** — no store
  union churn) and structures the disclosed detail by the **D69 intelligence-layers**. New pure
  `features/profiling/dossier/layers.ts` maps each `componentId` -> layer (**heuristics** = the tier-2
  relationship/quality/coverage signals: join graph, shared-column grid, table strip, quality headline,
  time coverage; **profiling** = the tier-3 per-table insight detail; **ai-synthesis** reserved for
  items 02/03, no v0 producer maps there yet). `ViewSpecRenderer` groups the disclosed tier-2/3 panels into
  labeled semantic `<section>`s by layer, fixed order, empty layers omitted (positives-only — no bare
  "AI synthesis" heading). **The layer is derived from `componentId` at render, never written into the
  `tier` enum** (stays exactly `1|2|3` — grep-guarded + unit-tested); the single "See full profile"
  disclosure still gates 2–3 together (master §4.2). **Skip-to-data escape hatch (D68d):** a *sticky*
  in-Blueprint control (the wordmark row + "Skip to data") jumps to the per-table data surface — resolved
  the leaf doc's "raw table / SQL surface" to the **established D68d target (`profile`)** for consistency
  with the existing sidebar preference (the SQL playground stays one hop away in EXPLORE); the sidebar's
  persistent `skipToData` preference is untouched, this adds the per-view immediate escape bullet 3 calls
  for. Landing decision extracted to a jsdom-testable pure `features/ingestion/landing.ts`
  (`postIngestLandingTarget(skipToData)`), wired into IngestionPanel's existing navigate — **no behavior
  change**. **AI-off = deterministic (held):** with AI off (v0 has none) the Blueprint *is* the
  deterministic Verdict — no empty frame, no "AI unavailable" apology (live-confirmed); the ai-synthesis
  layer slot is the async-upgrade seam items 02/03 fill, **no AI code here**. **Definition-of-done invariant
  held: no engine, no store, no ViewSpec schema change** — `layers.ts`/`landing.ts` are pure
  presentation/routing helpers. No leaf-doc deviation (implemented `01-blueprint-opening.md` as written), so
  no master-first correction owed. **Verified:** `make check` clean (lint, typecheck, **700/700** — was 692;
  +8: `layers.test.ts`, `landing.test.ts`, one renderer layer-grouping test with an `afterEach(cleanup)`
  added to that file, and the two `Dossier`->`Blueprint` sidebar-label assertions in `Sidebar`/`App` tests).
  Production build clean, entry chunk **122.41 KB gzip** (was 122.03; +0.38 KB), DuckDB/chart chunks still
  absent from it. **Live-verified** in a real Chromium tab (Playwright borrowed from `spike-ingestion`,
  throwaway script, deleted — `app/` still carries no browser-test dep): **15/15** — titanic opens on the
  Blueprint with a real tier-1 headline (`'1's mean Fare is 1.6 sigma above the rest`) painted one-screen,
  tiers 2–3 collapsed; no layer heading at tier 1; disclosure reveals the heuristics + profiling sections as
  semantic regions; no AI-synthesis section and no AI-unavailable copy; the skip-to-data bar stays pinned
  scrolling to the bottom (32px from top) and leaves the Blueprint on click; e-commerce (all findings below
  the interest floor) shows the exact honest headline `4 tables · 5,437 rows · no single dominant finding —
  here's the structure`; zero console/page errors. **ENVIRONMENT (resolves the prior entry's Node-26 flag):**
  the sandbox carries both Homebrew `node@26` (default on PATH — the localStorage-global shadow that fails 23
  tests) **and `node@22`** (matches `app/.nvmrc`, which pins `22`). Running under
  `/opt/homebrew/opt/node@22/bin` gives a clean **700/700** with zero localStorage failures — so the Node-26
  breakage is purely a version-on-PATH choice; the standing "decide the harness fix" item resolves by pinning
  CI to Node 22 (the `.nvmrc` already does). No config changed here (harness fix stays human-gated). **Model
  note:** built **inline on the Opus 4.8 main session**, not the proposed Sonnet — per CLAUDE.md's "default
  to inline, not a spawn" rule for a single build-order item (a normal build step, not a cross-cutting design
  change); the v0.25 model column is explicitly a proposal, and this is the logged reason. **Next: ▶ WebLLM
  spike (D43)** — the next v0.25 item and the only remaining one with no 06-ai dependency. Run the in-browser
  WebLLM/WebGPU kill-criteria spike (DuckDB-Wasm memory coexistence, an SQL-quality floor vs. cloud,
  acceptable model-download UX) in a throwaway harness like the v0 ingestion/relationship spikes, and record
  the verdict in **ADR-007** (still Pending) — it is the hard gate on `03-webllm-handoff`. After it,
  `06-ai/01-pipeline`'s provider routing must land before edge-synthesis (02), webllm-handoff (03), and BYOK
  (05), which reuse it. The whole AI arc (06-ai + v0.25's AI items) is nominally a post-Oct-6-launch tier;
  building it now proceeds on the founder's "lets go" direction with v0 code complete — flag if v0.25 should
  instead hold as design-only until launch. **No blockers.** Pre-existing/unrelated open items unchanged: the
  Join Graph nav-placement judgment call (D68-C) still wants a human answer; the ~25-file repo-wide
  comment-citation cleanup still awaits a human call.
- **2026-07-21** — **WebLLM spike (D43) built and run end-to-end; verdict = GO / PASS on all three kill
  criteria — but the verdict is NOT yet recorded in ADR-007 and the box is NOT checked, so the spike row
  stays unchecked and `▶` stays on the WebLLM spike. Recording the verdict is the next session's first task
  (below).** The spike was a disposable Vite + WebLLM + DuckDB-Wasm harness in a **new sibling repo
  `DataScope/spike-webllm/`** (same pattern as `spike-ingestion/`, throwaway, outside the doc tree). Real
  measured numbers on this machine (**Apple M1, 8 GB RAM** — the criterion-(a) constraint made real), model
  **`Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC`** (829 MB encoded download / ~1.6 GB VRAM; the enumerated coder
  ladder also offers 0.5B @ 945 MB and 3B @ 2505 MB VRAM). All raw results in
  `spike-webllm/SPIKE-RESULTS.json`; the 30 model shards are cached in `spike-webllm/.chrome-profile/` (~2 GB)
  so a rerun is warm and fast. **Results:** **(a) Memory coexistence — PASS, no OOM (`crashed:false`):** the
  ~1.6 GB model resident on the Metal GPU **and** `large.csv` ingested into DuckDB (1,240,000 rows × 6 cols,
  register 20 ms / ingest 244 ms) **and** a full-scan `count(*)` over 1.24 M rows (3 ms, correct) **and** a
  real inference (1056 ms) all lived in one tab without a crash; `measureUserAgentSpecificMemory` (JS+WASM,
  **not** GPU) rose 828 MB → 1038 MB across ingest+infer, DuckDB WASM heap 87 MB (matches the ingestion
  spike's ~87 MB for this exact file). Footprint ≈ ~1.04 GB JS/WASM + ~1.6 GB GPU weights ≈ ~2.6 GB on an
  8 GB machine, no OOM. **(b) SQL-generation quality — 11/12 (92 %) execution-match** on a 12-item labeled
  NL→SQL set (a seeded 240-row `sales` schema; each answer scored by result-set match against a reference
  SQL, order-insensitive/rounded — a number, not a vibe), inference 0.5–1.2 s/query after a 2.5 s cold first
  token. The one miss was "which product has the highest **total** sales" → the model wrote `SELECT product
  FROM sales ORDER BY amount DESC LIMIT 1` (ordered the raw column, no `GROUP BY sum(amount)`) → returned P4
  vs. expected P1 — a genuine small-coder aggregation weakness, not a tie or harness artifact. **Caveat:
  simple schema and NO measured cloud head-to-head** (no BYOK key was available), so "vs. cloud" is by
  citation only; the fuller D40 eval must confirm before any "local" column claim (D43 already requires
  this). **(c) Download UX:** 829 MB encoded across 30 shards; **warm (fully-cached) load-to-ready ~2.6 s**
  this run; main-thread jank `maxFrameGapMs` ~474–556 ms during load → **production must use the Worker
  engine (`webllm.worker.ts`, already specified in `03-webllm-handoff.md`)**, not a main-thread engine. My
  resource-timing byte counter read 0 (the CDN sends no `Timing-Allow-Origin`), so the 829 MB figure comes
  from WebLLM's own progress text, not the counter. **Verdict carry-over constraints for `03-webllm-handoff`
  (fold into the ADR-007 decision):** (1) pin a small coder (Qwen2.5-Coder-1.5B q4f16); larger models
  unverified on 8 GB; (2) Worker engine mandatory (main-thread jank); (3) resumable/retrying download
  mandatory; (4) the 92 % is a simple-schema floor with no measured cloud comparison — D40 eval gates any
  "local" claim, and watch the aggregation-in-`ORDER BY` failure mode. **Load-bearing environment findings
  (needed to reproduce or rerun):** WebGPU is **headed-only** — real Chrome 150 (`channel:'chrome'`) or a
  *headed* Playwright chromium give a real `apple/metal-3` adapter (4 GB maxBuffer); **headless silently
  falls back to SwiftShader (1 GB, software)** which would give meaningless perf/memory numbers. `navigator.gpu`
  is `[SecureContext]`-gated (probe over `http://localhost`/https, **not** `about:blank`) and on macOS do
  **not** pass `--enable-features=Vulkan`/`--use-angle=metal` (no Vulkan on Mac; they break GPU init) — plain
  `--enable-unsafe-webgpu` suffices. Node **22** required (`/opt/homebrew/opt/node@22/bin`; the default
  `node@26` breaks, and `npm`/`npx` need node@22 on PATH). Vite must bind **`127.0.0.1`** (host set in
  `vite.config.ts`) — bare `localhost` resolves to IPv6 `::1` first on macOS and the driver's IPv4 port-wait
  misses it. COEP **`credentialless`** (not `require-corp`) so WebLLM's cross-origin CDN model fetch loads.
  **The MLC/HuggingFace CDN link drops the connection every ~3 shards** (surfaces as `Failed to fetch` /
  `Cache.add() network error`, **not** a COEP block — shards do land); the fix that got all 30 down is a
  **resumable retry loop** (each retry resumes from Cache Storage; 30-attempt ceiling in `src/main.ts`
  `loadModel`). To run: `cd spike-webllm && PATH=/opt/homebrew/opt/node@22/bin:$PATH node run.mjs` (a headed
  Chrome window opens); `node smoke.mjs` is the cheap no-model-load preflight. **NEXT — record the verdict,
  then check the box (do these first in the new chat):** (1) **ADR-007** (`architecture/adr/007-ai-routing.md`,
  status Pending → Accepted): fill Decision/Alternatives/Consequences/Spike-evidence with the GO verdict, the
  four carry-over constraints, and the pinned model (note its neurons/turn cost is a **cloud**-router concern
  still owed by 06-ai — the local path is zero-egress, so record it as N/A-for-pool with a pointer). (2)
  **Mirror master-first:** master **§11.2** (the D43 paragraph ~line 840 and the §5.1 local-model mode-table
  row ~line 317) currently says WebLLM/WebGPU is "unbuilt and unscoped" — update to "spike-passed (GO), pinned
  small coder, Worker-engine + resumable-download, still D40-gated for the 'local' number"; then mirror into
  `foundations/privacy-model.md`, unblock the hard gate note in `build/v0.25/03-webllm-handoff.md`, and append
  the WebLLM entry to `architecture/decisions.md`'s **Spike findings log** in the established
  `*Name (date — GO, ADR):* dense-prose` format (write a `spike-webllm/SPIKE-FINDINGS.md` full verdict too,
  like `spike-ingestion/SPIKE-FINDINGS.md`). (3) In **BUILD-ORDER.md**, check the "WebLLM spike (D43)" row and
  move `▶` to **`06-ai/01-pipeline`** — the sequencing puts 06-ai provider routing before edge-synthesis (02),
  webllm-handoff (03), and BYOK (05), which reuse it. The **Decision Record D-rows are human-gated and need no
  edit** — D43 already exists and mandates the ADR-007 verdict. **Snapshot NOT taken** (spike touched only the
  new `spike-webllm/` sibling, no `_implementation/`/`DATASCOPE.md` edits yet — this handoff entry is the only
  doc change this session). **Open flag (carried):** whether v0.25 should build now or hold design-only until
  the Oct-6 launch is still an unanswered human call; the Join Graph nav-placement (D68-C) and the ~25-file
  repo-wide comment-citation cleanup also still await human calls. **No blockers.**
- **2026-07-21** — **WebLLM spike verdict recorded; the D43 gate is cleared and the box is checked.**
  In-browser WebLLM/WebGPU is now an honestly-specced local path — the D43 kill-criteria spike passed
  (GO): the ~1.6 GB Qwen2.5-Coder-1.5B-q4f16 model coexists in one tab with DuckDB-Wasm holding 1.24 M
  rows without OOM (~2.6 GB total on 8 GB), is exec-correct on 11/12 labeled NL→SQL, and warm-loads in
  ~2.6 s. **ADR-007** flipped Pending → Accepted **for the D43 verdict only** (the AI-routing decision
  proper — cloud model + neurons-per-turn, tool-use loop, vault — stays pending 06-ai); Decision +
  four constraints + alternatives + consequences + spike evidence filled in. Four carry-over
  constraints on the v0.25 handoff build: (1) pin the 1.5B q4f16 coder, not 3B (unverified on 8 GB);
  (2) Worker engine mandatory (main-thread load jank); (3) resumable/retrying download mandatory (the
  MLC/HF CDN drops ~every 3 shards → resume from Cache Storage, 30-attempt ceiling); (4) the 92 % is a
  simple-schema floor with no measured cloud head-to-head — D40 gates any "local" claim, watch the
  aggregate-then-rank miss. Mirrored master-first: master **§11.2** D43 paragraph + **§5.1** mode-table
  row (no longer "unbuilt and unscoped"), `foundations/privacy-model.md` mode row,
  `build/v0.25/03-webllm-handoff.md` (gate blockquote + hard-gate dependency both flipped to cleared),
  and `architecture/decisions.md`'s Spike findings log (dense-prose WebLLM entry). Full verdict written
  to `spike-webllm/SPIKE-FINDINGS.md`; raw numbers in `SPIKE-RESULTS.json`. **`▶` moved off the WebLLM
  spike row onto `06-ai/01-pipeline`** (v0.5 06-ai) — the sequencing puts 06-ai provider routing before
  edge-synthesis (02), webllm-handoff (03), and BYOK (05), which reuse it. Snapshot of the five edited
  docs taken to the session scratchpad before editing (repo not under git). **Next concrete action:**
  build **`06-ai/01-pipeline`** (Opus) — the provider routing the three AI-dependent v0.25 rows reuse.
  **Open flag (carried):** whether v0.25 builds now or holds design-only until after the Oct-6 launch is
  still an unanswered human call; the WebLLM cold/throttled first-run download UX and cross-browser /
  low-VRAM behavior remain unverified (spike was Chromium + WebGPU-present + Apple-M1/8 GB + localhost
  only) — verify before any general local claim. **No blockers.**
- **2026-07-22** — **The v0.25 BYOK-forward row is built and live-verified: a user-supplied API
  key now actually routes — the chat sends it as the D9 stateless pass-through, the router's
  prefer-key and quota-overflow paths demonstrably reach the user's provider, and synthesis
  routes per the same D3 toggle — closing the BYOK deferral logged in the edge-synthesis entry.
  The v0.25 section is complete; `▶` moves to `06-ai/02-modes-byok` (v0.5).**
  **Two real client bugs closed by the wiring.** (1) The chat read the D3 toggle from the
  `aiSession` stub store (always `free-tier-first`) while the settings panel wrote it to the
  settings store — the routing toggle was dead; the chat now reads the settings store. (2)
  Neither the chat nor synthesis ever sent the captured key — `AIChatModule` now attaches
  `{provider:'openai', key}` per request, and `services/synthesis.ts` sends `routing` + `byok`
  in cloud mode only (a key also opts the synthesis ladder out of the warm local rung,
  mirroring the chat ladder: the user brought their own provider, so it serves).
  **Router hardening: typed `upstream-error` (502).** The earlier live custody audit observed a
  prefer-key upstream 401 escaping as an uncaught throw → Cloudflare's opaque 1101 page. The
  leaf spec's "upstream errors mapped to clean client-visible error codes" is now true: any
  non-abort inference failure records a numeric-only outcome and returns
  `502 {"error":"upstream-error"}`; the client renders its existing transport-failure state.
  **Synthesis BYOK routing** (the deferral): `SynthesisRequest` gains optional `routing`/`byok`
  (the one non-structural field, same pass-through custody — never logged, never in the echo);
  `createRoutingSynthesisProvider` wraps the seam — prefer-key runs 100% via the user's provider
  through the router's `ByokResolver` (unresolvable → baseline echo, never a silent free-pool
  fallback), free-tier-first runs Workers AI and overflows to the key **only** on the
  pool-ceiling signal (a parse failure never spends the user's key); the byok rung reuses the
  exact prompts + `parseModelAnswer` contract, so add/drop/alter stays unrepresentable there too.
  **Live verification (staging, canary-only by human decision — no real provider key spent):**
  prefer-key + canary → genuine `502 {"error":"upstream-error"}` in ~8 s (the api.openai.com
  roundtrip; previously 1101), canary echoed nowhere; staging temporarily at quota=0 →
  free-tier-first **with** a key overflowed to the key (same typed 502 via the user's provider,
  zero Workers-AI spend) and **without** one returned genuine `429 {"error":"quota-exhausted"}`;
  synthesis prefer-key + canary → byte-identical baseline echo (the byok rung ran; no free-pool
  fallback, no canary in the body) while keyless free-tier synthesis still tailored; quota
  restored and serving re-verified (~4 real inference calls total, all deliberate). One
  propagation trap on record: the first post-deploy request still hit the old version (1101) —
  the identical request ~30 s later returned the typed 502.
  **What stays open, honestly:** the genuine 200-served-by-byok payload path is unit-tested but
  not live-run (canary-only — no real OpenAI key was supplied); the `06-ai/02` leaf box stays
  unchecked on its vault criterion (`09-edge/03` unbuilt) and an Ollama live run.
  **Verification:** suite **872 → 886** (+14: routing-provider matrix, synthesis-handler custody
  incl. the degraded echo, upstream-error mapping, cloudProvider byok field, client synthesis
  byok gating + local-rung opt-out, a §22 storage-scan asserting a set key reaches no
  localStorage entry), `tsc -b` / `oxlint` / `vite build` clean.
  **Docs, master-first:** no master edit needed — §11.2/§19 already state BYOK routing
  (including "a BYOK key routes per the D3 toggle" for the v0.25 deliverable); this change set
  realizes them. Leaves updated: `09-edge/01` (the upstream-error mapping), `v0.25/02-edge-synthesis`
  (routing provider + the protocol's byok field), `06-ai/02` (Files rewritten to the built
  shape; five acceptance boxes ticked with their evidence).
  **Model note:** built on **Opus** per the row's corrected model column (D9 custody,
  security-sensitive edge + client code).
  **Next concrete action:** `06-ai/02-modes-byok`'s remaining non-vault work — drive the
  pipeline live against an actual localhost Ollama daemon and run the mode-switch matrix E2E
  with Network-tab assertions; the vault round-trip criterion waits on `09-edge/03-vault`.
  **Blocker:** none.

- **2026-07-22** — **The v0.25 WebLLM client handoff is built and live-verified: once the user accepts a
  one-time model download, both the chat and the Blueprint's tailored synthesis run entirely on-device —
  a real question produced real SQL, a real DuckDB execution over 1,240,000 rows, and a correct answer
  with zero external requests across the whole send→answer window.** The `▶` moves to the BYOK-forward row.
  **Design decision made this session (human): the download is consent-gated, not silent.** D70's
  "downloads in the background" is amended master-first (§13.1 + §19; mirrored into `product/roadmap.md`,
  `foundations/privacy-model.md`, and the leaf doc): an eligible session (AI mode chosen, no BYOK key,
  WebGPU present) is asked once via a bottom dock banner; accept runs the resumable background download
  with a progress bar; decline keeps the quota'd cloud free tier serving; a BYOK key suppresses the
  handoff entirely (the user brought their own provider); turning it off in settings stops it serving
  even while warm; local-only never serves it.
  **What was built.** (1) `workers/webllm.worker.ts` + `services/webllm.ts`: the Worker-hosted engine
  (ADR-007 constraint 2) pinned to the 1.5B q4f16 coder (constraint 1), with the download/warm state
  machine (`stores/webllm.ts`: idle/unavailable/downloading/warming/ready/error) and the 30-attempt
  resumable retry resuming from Cache Storage (constraint 3). (2) `services/webllmProvider.ts`: the
  `AIProvider` behind the existing seam — the small coder doesn't emit structured tool calls, so control
  flow stays deterministic (SQL mode on a question or error trace, answer mode on rows; plain-text SQL
  extraction, the shape the D43 spike proved) and the model only ever generates content; the built §11.1
  loop, lint, caps, and transcript are reused untouched (the scope guard held — zero edits to
  `services/ai.ts`). (3) `services/webllmSynthesis.ts`: the local ADR-010 producer reusing the edge's
  exact prompt + parse contract (now exported from `edge/synthesisProvider.ts`), so add/drop/alter stays
  unrepresentable in both hosts; `services/synthesis.ts` is now a ladder — warm local rung (zero egress)
  → edge → deterministic — with both rungs flowing through the same `validateSlice`. (4) The provider
  ladder in `resolveProvider`: local-only → null always; warm+consented+keyless → WebLLM for cloud and
  local-model modes; else Ollama (local-model) / edge router (cloud). (5) UI: `WebLLMDock` (ask-once
  banner + bottom progress bar + failure line), the chat's "Running locally — zero egress" chip, an
  AI-settings on/off row, honest chooser copy. (6) `vite.config.ts` COEP `require-corp` →
  `credentialless` — the model CDN sends no CORP headers; `crossOriginIsolated` stays true for threaded
  DuckDB (the spike's hosting finding, now load-bearing in the app).
  **Live verification (headed Chrome, real Metal WebGPU, dev server on the spike's origin so its cached
  shards exercise the warm path):** offer visible with **zero CDN requests before consent** → accept →
  progress bar → ready in **3.3–4.5 s** (cache-warm) → `large.csv` (1.24 M rows) ingested with the model
  resident, deterministic Verdict painted, then the **"Tailored to your data" badge with zero external
  requests** (the local slice passed the real seam validators) → chat: "How many rows are there in
  total?" → `SELECT count(*) FROM large` → `✓ 1 rows · 7 ms` → "There are 1240000 rows in the table." —
  **zero external requests during the entire window**, no crash, JS heap 69 MB beside the GPU-resident
  weights. Degrade rung live: a no-WebGPU page never shows the offer and the surface stays intact; an
  engine failure drops to 'error' so the next turn resolves to the edge (unit-tested).
  **Verification:** suite **832 → 872** (+40: warm state machine, provider control flow, ladder incl.
  BYOK suppression and the local-only kill-switch, synthesis local rung, consent dock), `tsc -b` /
  `oxlint` / `vite build` clean. Two pre-existing tests updated for deliberate surface changes (the
  persisted-settings shape gained `webllmConsent`; a settings label became more specific).
  **Honest limits, on record:** the cold/throttled first-run download UX is still not timed (this run
  reused cached shards; ADR-007 already lists cold-download as unverified) — the consent gate + resumable
  retry are the mitigations, not a measurement. The D40 comparative "local" claim stays gated (constraint
  4): the synthesis eval gate was run against the edge producer, not re-run against the local one (same
  prompt, same contract, same validators — but not the same measured number). Chromium-only, as before.
  **Model note:** built on **Opus** per the model rule (inference/judgment work; human-confirmed switch
  at session start).
  **Next concrete action:** the BYOK-forward row — build `06-ai/02-modes-byok` (**Opus**, per its
  corrected model column): wire the captured key into the router request (the wire protocol and router
  already support `byok`; the UI sends none yet), close the prefer-key/overflow routing criteria against
  the live Worker, and route BYOK for synthesis per the deferral logged in the edge-synthesis entry.
  **Blocker:** none.

- **2026-07-22** — **The v0.25 edge synthesis worker is live on staging and checks: dropping a dataset in
  cloud mode now paints the deterministic Verdict first, then a validated edge re-phrase/re-rank replaces
  it in place under a "Tailored to your data" badge — and the D40/D56 eval gate passed 100%/100%.** The
  E-phase seam files (handler, protocol, validators, client, hook) already existed; what this session
  built is everything that makes them real. **(1) The provider** (`edge/synthesisProvider.ts`, new): the
  model is never asked for the slice — it returns only a re-phrased headline, a permutation of action
  indices, and re-phrased verbs, and the adapter reassembles the slice from the baseline it already
  holds, so adding/dropping/altering an action is unrepresentable in the output format (the client seam
  validators stay the trust boundary on top). One non-streaming `AI.run` per call; out-of-contract
  output throws → the endpoint echoes the baseline. **A live shape trap found and fixed:** on a JSON
  answer, Workers AI hands the top-level `response` mirror back *already parsed as an object* (probed
  via a throwaway passthrough worker, never deployed) — the provider now reads
  `choices[0].message.content` first, with the mirror as fallback. **(2) Wiring:** `/synthesis` routed
  in `worker.ts` on the shared infra (DO limiter under `synthesis:*` keys, Analytics sink,
  `SYNTHESIS_KILL_SWITCH` var root+staging); the stale seam-era default export in `edge/synthesis.ts`
  removed; client default endpoint → the staging URL via `VITE_EDGE_SYNTHESIS`. **(3) A real client gap
  closed:** the E-phase hook only showed a badge and *discarded* the validated upgrade — the Verdict
  still rendered the baseline. Now the seam-validated headline/actions replace the ViewSpec verdict
  panel's props in place (per-seam, independently), and a typed-503 kill-switch answer renders a "Cloud
  features paused" chip instead of degrading silently. **(4) The eval gate** (`eval/synthesis/run.ts`,
  `npm run eval:synthesis`): one labeled item per §14 sample dataset, baselines built by the product's
  own profile → insight-probe → `buildDatasetVerdict` pipeline over the eval engine and scored through
  the product client's validators (no harness-only path); thresholds declared at build — headline-win
  ≥ 80% (validators passed + every numeric token verbatim + differs from template) and actions-upgraded
  ≥ 80%. First run failed honestly (2/5 — the model dropped decimals like "0.976"); a prompt tightening
  (numbers verbatim, no echo) took it to **5/5 · 5/5 PASS** live. **The gate also caught a real eval-
  harness bug:** the Node eval engine returned Arrow DECIMAL columns as raw unscaled integers (Age
  5.39% null → "539"), corrupting every DECIMAL-typed profile value the harness fed the NL→SQL schema
  context too — fixed in `eval/engine/duckdb.ts` (scale applied per the Arrow type), which also
  repaired the titanic baseline (the false 539%-null insight gave way to a real mean-shift finding).
  **Live verification (browser E2E, headless Chromium at 2000×1250 against dev + live staging):**
  local-only session → **zero** requests to any `workers.dev` host (opt-in gate at the network layer);
  cloud session → deterministic headline on screen first, exactly one structure-only POST (per-column
  fields name/semanticType/physicalType/nullPercentage/cardinality; titanic cell-value canaries
  absent), then the in-place tailored replacement; kill-switch flipped live (`SYNTHESIS_KILL_SWITCH=on`
  redeploy) → `503 {"error":"paused"}` and the paused chip over the intact deterministic Blueprint,
  then restored off and serving re-verified. Custody: the Worker binds no KV; the only store is the
  ADR-006 DO's numeric counters; zero `console.*` in edge code. **Cost, measured:** ~14 neurons per
  synthesis call (`usage.neurons`, Mistral Small 3.1) — one call per dataset open, cheaper than a chat
  turn (~63); ~22 real inference calls total this session, all deliberate. **Verification:** suite
  **823 → 832** (+9 provider tests), edge tests 54 → 63, `tsc -b`/`oxlint`/`vite build` clean
  (`tsconfig.eval` gained `vite/client` types — the eval graph now reaches Vite-flavored imports).
  **Deviations, on record:** BYOK routing for synthesis is deferred to the BYOK-forward row (the wire
  protocol carries no key field; the provider seam accepts a routing provider when `02-modes-byok`
  lands), and the ADR-010 fingerprint cache is untouched (explicitly a Phase-6 open detail, not in this
  leaf's criteria). One observed model behavior worth knowing: it may weave in a structure-derived
  side fact (e.g. "0% null values") — within the validators' bounds, noted, not blocked.
  **Docs, master-first:** DATASCOPE.md §23.5 (synthesis in the kill-switch enumeration) + §19 v0.25
  eval note (gate thresholds, result, cost); `foundations/infrastructure.md` (same enumeration);
  ADR-006 (dated interim fact: second path on the one Worker, routing-layout decision still open);
  leaf `02-edge-synthesis.md` (acceptance boxes with evidence, Files/Test-plan reflecting the built
  shape). **Model note:** built on **Opus** per the model rule (human-confirmed switch at session start).
  **Next concrete action:** the v0.25 **WebLLM client handoff** (`build/v0.25/03-webllm-handoff.md`,
  Opus) — background download/warm per the ADR-007 constraints (1.5B q4f16 in a Worker engine,
  resumable download), then client-side takeover of conversation with degrade to edge/deterministic.
  **Blocker:** none.

- **2026-07-22** — **`06-ai/01-pipeline` and `09-edge/01-ai-router` both check: the two deliberate
  deferrals from the entry below (daily-quota counter, real streaming) are resolved, live-verified, and
  were the last open criteria on either leaf doc. `▶` moves to the v0.25 edge-synthesis row.**
  **(1) Daily quota → Durable Object (human decision: DO treatment over accepting KV slop).** The
  KV-backed daily-quota counter that under-counted a burst (21 requests stored as 8, entry below) now
  shares the `RateLimiterDo` backing the per-minute limiter already uses — keys were already namespaced
  apart (`ai-router:quota:` vs `:session:`/`:ip:`), each key routes to its own DO instance, and
  `windowSeconds` rides per-call, so the daily window reuses the class unchanged (one line of wiring in
  `worker.ts`, both seam stores now the same DO store). Everything the change orphaned is removed:
  `createKvRateStore`, the `RATE_KV` binding + `KVNamespace` type, the staging `kv_namespaces` block,
  and the deploy script's KV-create step — the edge Worker no longer uses KV at all (the remote
  `datascope-edge-staging-RATE_KV` namespace is now unbound; deleting it from the account is optional
  manual cleanup). **Live-verified the cheap way the entry below suggested:** staging redeployed with
  `--var WORKERS_AI_DAILY_QUOTA:2`, a fresh session fired 4 requests → exactly 2 served (`200`,
  `servedBy: workers-ai`) then genuine `429 {"error":"quota-exhausted"}` at requests 3–4 — exact
  enforcement at the ceiling, contrast KV's 8-for-21 — then redeployed back to quota=20 (health-checked).
  **(2) Real SSE streaming in `createWorkersAiProvider`.** The chunk format Cloudflare's docs don't
  specify was probed empirically (throwaway `wrangler dev --remote` passthrough worker in the session
  scratchpad, never deployed, 3 tiny probe calls): Workers AI streams OpenAI-style
  `chat.completion.chunk` frames — text as `choices[0].delta.content`, a tool call as a name/id chunk
  then `function.arguments` string fragments keyed by `index`, a trailing no-`choices` usage-summary
  chunk with authoritative totals, then `data: [DONE]`. Two traps the probe caught: the top-level
  `response` mirror is type-unstable (a lone digit arrives as a JSON *number* — never read it), and SSE
  frames split across network reads (buffered parser required). The provider now always runs
  `stream: true`: text tokens yield as `delta` events; tool-call argument fragments are reassembled and
  **never** emitted as deltas (a garbled reassembly surfaces the raw string → client lint rejects →
  the existing repair loop, not a crash); a plain-JSON result despite the stream request falls back to
  the old mapping (the pre-existing unit tests now exercise exactly that path). Abort races each
  `reader.read()`, so the §21.6 timeout still cuts a hung stream.
  **Verification.** +5 streaming tests built from the probed frames (fragmented tool-call reassembly
  across a mid-frame read split, summary-usage accounting, no-[DONE] close, garbled-args fallback,
  mid-stream abort): suite **818 → 823**, edge tests 49 → 54, `tsc -b`/`oxlint` clean. **Live against
  the redeployed staging Worker:** a `stream: true` text turn delivered real per-token `delta` events
  ("Stream"/"ing"/" works"/…) then `done` + `[DONE]`; a `stream: true` tool-call turn arrived whole in
  `done` (valid 9-char id, correct SQL, no fragment leakage); a non-streamed request still drains to the
  same JSON shape as before. 8 real inference calls total this session, all deliberate.
  **Docs, master-first:** DATASCOPE.md §23.5 (both counters DO-backed now), **ADR-006** (a dated
  Correction: the "wide window dwarfs KV's slop" rationale failed its own live burst test — window
  width doesn't protect against burst pacing, and burst is the adversarial shape; the
  keep-KV-as-soft-ceiling alternative recorded and rejected), `foundations/infrastructure.md`, and both
  leaf docs (acceptance boxes ticked with their evidence; `09-edge/01`'s Files/Test-plan reflect the
  KV removal and the tiny-quota live-test method). New edge comments state reasons inline without §/D
  citations; the pre-existing citation cleanup in edge code stays a flagged human call (carried).
  **Model note:** built on **Opus** (session switched before work began) — security-sensitive edge code
  per the model rule, human-confirmed.
  **Next concrete action:** build the v0.25 **edge synthesis worker**
  (`build/v0.25/02-edge-synthesis.md`, Opus) — warm-start synthesis over DSPS structural facts,
  stateless, on the now-frozen deterministic seam; it reuses this router's shared infra (one more
  branch in `worker.ts`'s dispatch).
  **Blocker:** none.

- **2026-07-22** — **Real browser E2E against the live staging Worker: a genuine question through the
  actual chat UI produced a genuine NL→SQL answer, closing the last item of the four this session set
  out to verify — but two others (streaming, daily-quota) stay open, so neither `06-ai/01-pipeline` nor
  `09-edge/01-ai-router` checks yet.** Drove a real headless-Chromium session (`spike-webllm`'s existing
  Playwright install; no `chromium-cli` in this environment) against `npm run dev` at 2000×1250 (the
  window size the earlier `h-full` layout-bug fix used): picked "Cloud AI" at the first-run mode
  chooser, loaded the Titanic sample, opened AI Chat, typed "How many passengers survived?", clicked
  Send. **Two real `200`s hit the live `/ai-router`** — the model's tool call, then its follow-up after
  a real local DuckDB execution — and the transcript rendered the full audit trail: "Read 'passengers'
  as 'PassengerId'." → `SELECT COUNT("PassengerId") FROM "titanic" WHERE "Survived" = 1` (✓ 1 rows · 13
  ms) → "355 passengers survived." (355 is in fact the historical Titanic survivor count — the answer
  is correct, not just well-formed).
  **A genuine bug surfaced and got fixed in the test script, not the product:** the first two attempts
  raced ahead of `IngestionPanel.tsx`'s post-ingest auto-navigation (`navigateToPostIngestLanding`,
  lines 46–47) — the "AI Chat" sidebar card is enabled the moment cloud mode is picked, independent of
  dataset load, so clicking it before ingest+profiling actually finished got yanked back to Blueprint
  mid-submission when the auto-nav fired late. Fixed by waiting for the Titanic row count to actually
  render before navigating to AI Chat, instead of waiting for the sidebar card's mere presence.
  **Where this leaves the two leaf docs:** `06-ai/01-pipeline.md`'s "[ ] Provider timeout (§21.6) → clean
  user-facing error, not a hung chat" is covered by the router-level fix + live 504 confirmation above
  (the UI's existing `turn.error` rendering was not independently re-driven through a live UI timeout —
  judged sufficient given the mechanism is proven end-to-end, but noted as the one inference in this
  entry, not a live observation). `09-edge/01-ai-router.md` still has two open boxes: **"Streaming
  responses reach the client incrementally"** (deliberately deferred, logged above) and **"Per-session
  Workers-AI quota... enforce[s]"** (only the 10/req-min half is live-verified; the 20/day half hit the
  KV under-count and was deliberately not pushed further, logged above) — so per the update rules' "no
  partial checks," neither leaf doc's box moves. This session's four target items (quota, streaming,
  timeout, browser E2E) are now each either resolved or deliberately deferred with a reason on record;
  what's left to actually check both boxes is a human decision on the quota counter (KV slop is
  acceptable vs. give it the ADR-006 DO treatment) and, separately, a real streaming implementation.
  **Blocker:** none technical; two open items are deliberate deferrals awaiting a human call, not stuck
  work. `▶` stays on `06-ai/01-pipeline`.

- **2026-07-22** — **The real-backend §21.6 provider-timeout criterion is live-confirmed, after fixing a
  structural gap the wiring task alone would not have caught: the timeout never actually cut off a
  Workers-AI call.** Tracing the abort path before touching `wrangler.toml` found `ai-router.ts`'s
  timer only reaches a provider through `signal` — `byok.ts`'s `fetch(url, { signal })` honors that
  natively, but `createWorkersAiProvider` (`adapters.ts`) called `ai.run(model, inputs)` with no signal
  wired at all (the `Ai` binding has no such parameter). A hung Workers-AI call would have kept the
  handler waiting past `timeoutMs` indefinitely, regardless of what value the config held.
  **Fix (`edge/adapters.ts`):** added `raceAbort<T>(promise, signal)` — settles with an `AbortError` the
  moment `signal` fires, racing whatever `ai.run()` is doing; it stops the *handler* from waiting, it
  does not cancel the request server-side (the binding has no hook for that, so Workers-AI still runs
  the call to completion on Cloudflare's side — a real, accepted limitation, not silently swept under
  the fix). Human-confirmed approach before writing it (declined the smaller "wire vars only, log the
  gap separately" option once the mechanism was traced).
  **Wiring (`edge/bindings.ts`, `edge/worker.ts`, `wrangler.toml`):** `Env` gains
  `AI_ROUTER_TIMEOUT_MS`/`AI_ROUTER_MAX_BODY_BYTES`/`AI_ROUTER_PER_SESSION_LIMIT`/`AI_ROUTER_PER_IP_LIMIT`/
  `AI_ROUTER_WINDOW_SECONDS`; `buildAiRouterEnv` parses them into `AiRouterEnv`'s existing
  `providerTimeoutMs`/`maxBodyBytes`/`perMinuteLimits` (the per-minute trio is all-or-nothing — all three
  must parse or the router's own default applies, matching `RateLimits`' shape). `wrangler.toml` sets all
  five, root **and** `[env.staging]`, to values that reproduce `ai-router.ts`'s prior hardcoded defaults
  (30000/65536/10/30/60) — introducing the vars changed no behavior until deliberately overridden.
  **Verification.** New test (`adapters.test.ts`): a hanging fake `Ai.run()` (a promise that never
  resolves) + a mid-flight `controller.abort()` now rejects with `AbortError` instead of hanging forever
  — **819/819** passing (was 818), `tsc -b`/`oxlint` clean. Live: redeployed staging with the new vars
  (no-op, confirmed via one live `200`), then redeployed again with `AI_ROUTER_TIMEOUT_MS=50` — a live
  `free-tier-first` request returned genuine `504 {"error":"timeout"}` in 1.4s (real Workers-AI turns
  otherwise take 2–4s), then redeployed a third time restoring `30000`. Three deploys, one real
  inference call total (cost-conscious after the daily-quota entry above).
  **Next concrete action:** browser E2E of the chat UI against the live staging Worker — the last open
  `06-ai/01-pipeline` / `09-edge/01-ai-router` criterion after this. Once that closes, both boxes check
  together (per the entry below); the daily-quota-exhaustion KV-under-count question stays open
  separately (logged above), not a blocker for this pair.
  **Blocker:** none. `▶` stays on `06-ai/01-pipeline`.

- **2026-07-22** — **Live SSE test against the real Workers-AI backend confirms the transport is correct;
  the "streaming reaches the client incrementally" criterion stays open by design, not by omission.**
  A single `stream: true` request (`routing: free-tier-first`) returned `content-type: text/event-stream`
  and well-formed `data: {"type":"done",...}` then `data: [DONE]` framing — the wire contract works
  end-to-end against the live Worker. No `delta` events arrived; re-reading `edge/adapters.ts:184-192`
  found this is already documented as deliberate, not a gap: Workers AI resolves tool-use in one JSON
  response, and streaming a tool call means reassembling partial JSON arguments across chunks — a real
  correctness risk the comment explicitly declines to take on for a first deploy. Re-confirmed with a
  human decision to keep the deferral rather than implement token streaming now (narrowing it to
  text-only turns was also on the table and declined — even that adds branching risk for a criterion
  already knowingly out of scope).
  **Why the box stays unchecked / what it would take:** `build/09-edge/01-ai-router.md`'s "[ ] Streaming
  responses reach the client incrementally" needs `createWorkersAiProvider` to request `stream: true`
  from the `AI` binding and parse its chunk stream into `delta` events, with a tool-call reassembly
  strategy that's been reasoned through (not just the happy path) — deferred, at human instruction, to
  whenever `09-edge/01-ai-router` is built for real rather than verified against a staged deploy.
  **Next concrete action:** wire `providerTimeoutMs`/`maxBodyBytes`/`perMinuteLimits` from `wrangler.toml`
  vars into `worker.ts`'s `buildAiRouterEnv` (currently hardcoded defaults), then the real-backend §21.6
  timeout live test, then browser E2E.
  **Blocker:** none. `▶` stays on `06-ai/01-pipeline`.

- **2026-07-22** — **Redundant re-confirmation of the entry below (context loss across a session
  boundary caused the DO/burst-test verification to be re-run), plus a live-test attempt at the
  daily-quota-exhaustion criterion that was abandoned by human decision before completing — it
  surfaced a real KV under-count and an unnecessary Workers-AI cost, not a pass/fail result.**
  **(1) Redundant redeploy + burst test.** Re-ran `npm run edge:deploy:staging` (new version
  `052b855e…`) and the same live burst methodology as the entry below, independently getting the
  same result (session requests 1–10 → `200`, 11–13 → genuine `429 rate-limited`). This reconfirms
  the DO fix holds but did not need to happen — the entry below already closed this step. No new
  information; logged only so the duplicate deploy version is on record.
  **(2) Daily-quota exhaustion — attempted, then stopped.** Drove 21 real `free-tier-first` requests
  against a fresh session (paced to stay under the 10/min ceiling across 3 windows), expecting
  request 21 to hit `quota-exhausted` (`WORKERS_AI_DAILY_QUOTA=20`). All 21 returned live `200`s.
  Inspecting the live `RATE_KV` key directly (`ai-router:quota:<session>:<daybucket>`) showed a
  stored count of **8**, not 21 — the daily quota's KV-backed counter under-counts a rapid burst
  the same way the pre-ADR-006 KV rate limiter did, even though its 86,400s window was assumed to
  dwarf KV's slop (that assumption holds for organic daily pacing, not for ~20 requests inside
  ~95s). Stopped here, at human instruction, rather than pushing further into real Workers-AI spend
  to chase the count — 44 real inference calls had already gone out this session (23 from the
  redundant re-test above + 21 here) against the account's real, shared Workers-AI free-tier
  budget, which is a genuine cost independent of this app's own per-session counter.
  **Why the box stays unchecked / what's left:** the live daily-quota-exhaustion criterion is
  still unverified. Cheapest path for a future session: temporarily redeploy staging with
  `WORKERS_AI_DAILY_QUOTA` set to something tiny (e.g. `2`) so only ~3 real calls are needed to
  observe both the served and `quota-exhausted` paths against real KV, then redeploy back to `20`.
  Separately, the KV under-count itself is now a real open question — worth a human decision on
  whether the daily quota needs the same DO treatment ADR-006 gave the per-minute limiter, or
  whether KV's slop is acceptable here given the quota is a soft courtesy ceiling, not an
  abuse-hard limit — before spending more live-test budget on it.
  **Next concrete action:** SSE streaming against the real backend and the real-backend §21.6
  timeout (the latter needs `providerTimeoutMs`/`maxBodyBytes`/`perMinuteLimits` wired from
  `wrangler.toml` vars into `worker.ts`'s `buildAiRouterEnv` first) and browser E2E — each needs at
  most one or two real calls, not a burst, so cost is not a blocker for those.
  **Blocker:** none technical; the quota-exhaustion criterion is paused on a human call about KV
  vs. DO for that counter, not stuck. `▶` stays on `06-ai/01-pipeline`.

- **2026-07-22** — **Real browser click-through of AI Chat (the first step of the pending browser-E2E
  criterion) found and fixed a genuine layout bug: the chat input was rendering entirely below the
  visible pane, unreachable, in any window tall enough — a real "can't type anything" bug, not a
  perception issue.** Found by driving a real headless-Chromium session against the local dev server
  (`spike-webllm`'s existing Playwright install; no `chromium-cli` in this environment) at the reporter's
  actual window size (2000×1250) — Chromium at a shorter window (1400×900) happened to mostly hide it
  because Playwright's own actionability checks auto-scroll before interacting, which a real user never
  gets. `document.elementFromPoint()` at the input's coordinates resolved to the bottom status-bar
  footer, not the input — confirmed the input was laid out below the visible, scrollable pane
  (`scrollHeight` 1210 vs `clientHeight` 1136, a 74px gap with no visible scrollbar affordance on macOS).
  **Root cause:** `AIChatModule.tsx`'s root uses `h-full` to lay out a growing transcript above a
  pinned input — correct on its own, but its actual parent in `App.tsx` is a plain (non-flex) scroll
  container that *also* holds the always-rendered `EducationalPanel` above it as a sibling. `h-full`
  resolves against the parent's *total* height, not "height remaining after EducationalPanel," so
  AIChatModule's box was sized too tall by exactly EducationalPanel's rendered height, pushing the
  input that far past the bottom of the visible pane. Grepped every other module root for the same
  `h-full` pattern — AIChatModule is the only one, so the bug is isolated, not systemic.
  **Fix (`src/app/App.tsx`):** made the module-switch container a flex column and wrapped the
  active-module slot in its own `min-h-0 flex-1` box, so it receives the *real* remaining height after
  `EducationalPanel` instead of the whole container's height. Reasoned and confirmed the change is a
  no-op for every other module (none use `h-full`; they still render at natural content size with the
  same overflow-scroll behavior as before). **Verified, not just typechecked:** re-ran the same headless
  session post-fix — `scrollHeight === clientHeight` (no overflow), `elementFromPoint` at the input's
  center now resolves to the input itself, and a scripted click + keystroke sequence (no manual scroll)
  landed real text in the field. Screenshotted the Ingest module before/after as a regression check —
  pixel-identical. Full suite still **818/818**, `tsc -b` / `oxlint` clean.
  **Why this isn't its own checklist line:** it's a bug fix inside already-built `06-ai/01-pipeline`
  scope (the AI Chat surface), not new scope — logged here per the handoff rules rather than as a new row.
  **Next concrete action:** continue the browser-E2E pass this surfaced from (submit a real question end
  to end against the live staging Worker, confirm the transcript renders), then SSE streaming and the
  real-backend timeout — the three remaining `06-ai/01-pipeline` / `09-edge/01-ai-router` criteria.
  **Blocker:** none. `▶` stays on `06-ai/01-pipeline`.

- **2026-07-22** — **Live burst test against the redeployed staging Worker confirms the DO-backed rate
  limiter now enforces correctly, closing the one open step from the entry directly below.** No code
  changed this session — deploy + live verification only.
  **(1) Deploy.** `npm run edge:deploy:staging` (token from `app/.env.local`) shipped version
  `47797c83…`; `env.RATE_LIMITER (RateLimiterDo)` shows as a live Durable Object binding and the
  `new_sqlite_classes` migration applied cleanly. `/health` 200s.
  **(2) Burst test, corrected methodology.** A first attempt (sequential await-then-sleep, 1s pause
  *after* each response) gave a misleading 13/13-succeeded result — real inference latency
  (1.7–3.8s/request) plus the 1s pauses stretched the 13 requests over ~44s wall-clock, crossing a
  60s fixed-window bucket boundary partway through (a 6/7 split, both legitimately under the ceiling).
  `edge/rateWindow.ts`'s bucketing is calendar-aligned (`floor(now/windowSeconds)`, confirmed by
  reading the source), not sliding from the first request, so pacing by response-completion time
  understates burst rate. Corrected by firing all 13 requests on a fixed 1s cadence from **request
  start** (not response completion), checked in advance to land inside one bucket (started at :28.1s
  past the minute, last request fired at :40.1s — no boundary crossed). Same live methodology as the
  original audit otherwise: one `/ai-router` session, `routing: free-tier-first`, real
  `execute_local_sql` tool schema.
  **Result: requests 1–10 → live `200`s (real Workers-AI/Mistral responses), requests 11–13 → genuine
  `429 rate-limited`.** The true request count is now enforced exactly at the declared 10/min/session
  ceiling — contrast the original KV audit's stored-**5**-for-13 under-count on the same shape of
  burst. This is the live confirmation the entry below's box was waiting on.
  **Next concrete action:** pick up the remaining untested `06-ai/01-pipeline` / `09-edge/01-ai-router`
  criteria: daily-quota exhaustion against the live Worker (seeding a DO's state isn't the same
  operation as seeding KV — drive it through real requests, per the caveat noted below), SSE streaming
  against the real backend, the real-backend §21.6 timeout (still structurally hard —
  `providerTimeoutMs`/`maxBodyBytes`/`perMinuteLimits` aren't wired from `wrangler.toml` vars in
  `worker.ts`'s `buildAiRouterEnv` yet), and the browser-level E2E of the chat UI against the live
  Worker. Once those close, `06-ai/01-pipeline` and `09-edge/01-ai-router` can check together.
  **Blocker:** none technical. `▶` stays on `06-ai/01-pipeline`.

- **2026-07-22** — **The per-minute rate limiter no longer under-counts: it is now backed by a Durable
  Object instead of plain KV, which is the fix the prior audit called for. Code is built and fully green;
  the one remaining step — redeploy staging + re-run the live burst test — was NOT run (handed off
  mid-work, out of usage). Box stays unchecked until that live confirmation lands.** What changed and why
  it matters: the audit below measured plain KV under-counting a 60s window badly under burst (13 requests
  ~1s apart → stored 5) because KV is only immediately consistent in one colo (≤60s globally) and the
  window is also 60s — an *under*-count on the abuse-prevention mechanism, i.e. a hole. The limiter seam
  (`RateStore.increment(key, windowSeconds) → count`) now splits by backend along consistency need:
  **per-minute dual-keyed limiter → a Durable Object** (`RateLimiterDo`, one instance per limiter key via
  `getByName`, so a single-threaded actor serializes each key's increments → a strongly consistent count),
  **daily Workers-AI quota → KV, unchanged** (its 86,400s window dwarfs KV's slop; its write volume is
  bounded by the quota itself). The DO is SQLite-backed (`new_sqlite_classes`, free-plan eligible),
  persists the counter per increment (an eviction mid-window must not lose the count — that would re-open
  the under-count), and self-cleans via a cleanup alarm that wipes an idle key's storage one window after
  its last request.
  **Files.** New: `edge/rateWindow.ts` (the pure fixed-window step — same bucket math as the KV store, so
  only the consistency guarantee changed; unit-tested directly), `edge/rateLimiterDo.ts` (the `RateLimiterDo`
  class — runs only in the Cloudflare runtime, reached through untested `worker.ts` like the other binding
  adapters), `edge/cloudflare.d.ts` (minimal ambient `cloudflare:workers` + DO-storage types, declared
  locally to keep avoiding `@cloudflare/workers-types`'s DOM-global clash). Changed: `edge/adapters.ts`
  (`createDurableObjectRateStore` added; the `createKvRateStore` comment corrected — it now backs only the
  daily quota, and the old "rare over-count, not a hazard" comment the audit flagged as understated is
  replaced with the real reason), `edge/bindings.ts` (`RateLimiterNamespace`/`RateLimiterStub` + `RATE_LIMITER`
  on `Env`), `edge/ai-router.ts` (`AiRouterEnv` gains `quotaStore`; the daily-quota call now reads
  `quotaStore`, the per-minute `checkRateLimit` still reads `rateStore`), `edge/worker.ts` (exports
  `RateLimiterDo`; `buildAiRouterEnv` wires `rateStore = DO`, `quotaStore = KV`), `wrangler.toml`
  (`RATE_LIMITER` DO binding + `new_sqlite_classes` migration, at root **and** `[env.staging]` — DO bindings
  and migrations are non-inheritable, same reason its ai/vars/kv blocks are repeated).
  **Verification (all green):** `tsc -b`, `oxlint`, `vite build` clean; full suite **813 → 818** (+4
  `rateWindow` window-math/rollover tests, +1 `createDurableObjectRateStore` per-key-routing test; the
  router's quota tests now share `quotaStore`, and the D9 key-leak audit test now asserts the key reaches
  **neither** store); edge tests **44 → 49**. `wrangler deploy --env staging --dry-run` validates the
  config end-to-end: `env.RATE_LIMITER (RateLimiterDo)` is recognized as a Durable Object binding, the
  migration and class export resolve, bundle 19.37 KiB (was 17.66).
  **Docs, master-first:** DATASCOPE.md §23.5 (the limiter-backend line — replaced the now-overtaken
  "native binding (launch default)" with the decided DO choice), `foundations/infrastructure.md` (its
  "(e.g. the daily AI quota)" DO example was counterfactual to the actual split — reconciled), **ADR-006**
  (was a `Pending` stub explicitly waiting for this evidence; the rate-limiter-backend decision is now
  recorded with the live audit numbers and the three alternatives — the Worker routing layout and R2
  bindings stay pending for the cors-relay/save/vault builds), and leaf `build/09-edge/01-ai-router.md`
  (spec bullet + Files + Test plan).
  **Model note:** built on **Opus** — security-sensitive edge code (the model rule's Opus bucket), matching
  the human handoff decision in the entry below.
  **Why the box stays unchecked / what's left:** the live-Worker confirmation was **not run this session**
  (out-of-usage handoff). The token IS present in `app/.env.local` and the dry-run is green, so the deploy
  is one command away — but the first `--env staging` deploy is also what *runs the `new_sqlite_classes`
  migration* to create the DO on the live Worker, and only a live burst test proves the under-count is
  actually gone.
  **Next concrete action:** `CLOUDFLARE_API_TOKEN=…(from app/.env.local) npm run edge:deploy:staging`, then
  re-run the **same live burst test the audit below ran** — same session id, ~13 requests ~1s apart inside
  one 60s window against the live `/ai-router` — and confirm the DO-backed counter now reflects the **true**
  request count and a genuine **429 `rate-limited`** fires at the 10/min/session ceiling (contrast the
  audit's stored-5-for-13). Note a real difference from the KV audit: you can't seed a DO's state by writing
  KV directly (`wrangler kv key put`) — drive it through real requests. Once that holds, pick up the still-
  untested criteria from the entry below (daily-quota exhaustion, SSE streaming, real-backend §21.6 timeout,
  browser E2E) before `06-ai/01-pipeline` / `09-edge/01-ai-router` can close.
  **Pre-existing, not touched (surgical):** §/ADR citations still sit in edge code (`adapters.ts:172,191`,
  `bindings.ts:50,52,54`, `wrangler.toml:9`) — the code-repo writing rules ban them; a cleanup pass when
  `09-edge/01` formally builds. This session introduced **no new** citations in code (verified by grep).
  **Blocker:** none technical — deploy + live burst re-test remain, simply not started (out-of-usage
  handoff), not a stuck state. `▶` stays on `06-ai/01-pipeline`.

- **2026-07-22** — **Live-Worker key-custody audit run against the deployed staging router; custody is
  clean, but the audit surfaced a real gap in the per-minute rate limiter's enforcement — human decision:
  fix it with a Durable Object, on Opus, next session (this session stays Sonnet; explicit handoff, no
  code changed).** No code was touched this session — read-only audit + live HTTP/KV inspection against
  the existing deploy (version `1286330e…`, unchanged).
  **(1) Custody — PASS.** Sent a real NL→SQL request (`routing: free-tier-first`) and got back a correct
  live tool-call (`SELECT COUNT(*) FROM titanic;`, `servedBy: workers-ai`). Sent a `prefer-key` request
  with a canary fake BYOK key (`sk-audit-canary-DO-NOT-USE-…`); the upstream 401 became an uncaught
  throw → Cloudflare's generic `error code: 1101` page, and the canary string appears nowhere in the
  response. Inspected the live `RATE_KV` namespace directly (`wrangler kv key list/get --remote`): every
  stored key is `ai-router:{session|ip|quota}:<id>:<bucket>` → a plain integer counter, never the
  credential or message content — confirmed on both the normal request and the canary-key request.
  `grep` across `edge/*.ts` found zero `console.*` calls, so there is no log sink to leak through either.
  This clears the "pass-through keys absent from logs, KV, and response bodies (audited)" criterion.
  **(2) Body cap — PASS, live.** A 70,177-byte body → typed `{"error":"bad-request"}` / 400, live.
  **(3) NEW FINDING — the per-minute dual-keyed limiter (`createKvRateStore`, `edge/adapters.ts:36`) does
  not reliably enforce.** It is a plain KV `get`+`put` counter over a 60s window; Cloudflare's own
  consistency model is "write visible immediately in the *same location*, ≤60s globally" (checked against
  current docs, not assumed) — and the window this limiter enforces is also 60s, so ordinary requests
  spaced seconds apart can land on different colos and read stale (undercounted) values for the whole
  window. Measured directly against the live staging Worker, same session, single confirmed 60s bucket:
  13 sequential requests ~1s apart → stored counter **5**; a second run, 8 requests ~3–4s apart → stored
  counter **2**. This was the dominant behavior in testing, not a rare edge case — the existing code
  comment ("a rare over-count near a window edge, not a correctness hazard") understates it, and it is an
  *under*-count, which matters because this is the abuse-prevention mechanism. The daily quota (86,400s
  window) is far less exposed — 60s of slop is negligible against a day, consistent with the earlier
  eval-harness log entry where the daily quota 429'd reliably in practice.
  **Decision (human, this session):** fix with a Durable Object rather than just document the
  limitation — real scope, not a doc correction. Also decided: build it on **Opus**, matching the model
  rule's "security-sensitive edge code" bucket and the precedent already logged twice (BYOK custody, the
  router itself) — **explicit handoff to a new Opus session for this work**; this session stays Sonnet
  and made no code changes.
  **Not yet live-tested this session (unchanged from before):** daily-quota exhaustion against the live
  Worker (a seed-then-check methodology would hit the same KV staleness caveat found in (3), so it was
  deliberately not attempted this session — worth remembering once the DO fix lands, since seeding a DO's
  state is not the same operation as seeding KV), SSE streaming against the real backend, the real-backend
  §21.6 timeout (still structurally hard — the BYOK URL is hardcoded to the real OpenAI endpoint, Workers
  AI responds fast normally, and `providerTimeoutMs`/`maxBodyBytes`/`perMinuteLimits` are not wired from
  `wrangler.toml` vars in `worker.ts`'s `buildAiRouterEnv` yet, so there is no config knob to force a real
  timeout without a code change), and the browser-level E2E of the chat UI against the live Worker.
  **Next concrete action:** on Opus, replace `createKvRateStore`'s per-minute counter with a
  Durable-Object-backed one (KV stays fine for the daily quota, given the analysis above) — add the DO
  class + binding + migration to `wrangler.toml` (root + `[env.staging]`), wire it in `edge/worker.ts`'s
  `buildAiRouterEnv`, redeploy to staging, then re-run the same live burst test this session ran (same
  session id spaced within one window) to confirm the counter now reflects the true request count and a
  genuine 429 fires. Once that holds, pick back up the remaining untested criteria above (quota
  exhaustion, streaming, timeout, browser E2E) before `06-ai/01-pipeline`/`09-edge/01-ai-router` can close.
  **Blocker:** none technical — this is a deliberate human-requested handoff to a fresh Opus session, not
  a stuck state. `▶` stays on `06-ai/01-pipeline`.

- **2026-07-22** — **The staging edge Worker is deployed and live, and a real cloud backend clears the
  D40 eval gate for the first time (98.3% exec / 82.8% correctness / 100% repair over the 58-question
  set) — the single blocker that kept the last five log entries' boxes unchecked. Getting there
  required correcting the ADR-007 cloud model: the code-specialized Qwen coder does not actually emit
  structured tool calls on Workers AI, so the tool-use loop scored 0/58; swapping to Mistral Small 3.1
  fixed it.** The Worker is up at `https://datascope-edge-staging.justinclarke.workers.dev`
  (`/health` → 200; version `1286330e…`); the deploy ran because `CLOUDFLARE_API_TOKEN` is present in
  `app/.env.local` (the earlier "blocked, non-interactive" note is resolved — `wrangler whoami` confirms
  the token authenticates). What happened, in order:
  **(1) The 0/58 root cause.** The first live cloud-edge eval scored **0% exec / 0% correctness / 0
  tokens** — every request threw. Reproduced directly against the live router: `@cf/qwen/qwen2.5-coder-32b-instruct`
  returns an **empty `tool_calls`** and instead free-texts the call as a pseudo-JSON blob in `response`,
  so the `execute_local_sql` loop never runs any SQL. ADR-007 had recorded the coder as tool-calling-capable
  because `tool_calls` *appears in its output schema* — but a schema field is not the model populating it.
  **(2) Empirical model bake-off.** The account's `CLOUDFLARE_API_TOKEN` lacks Workers-AI REST scope (the
  `/ai/run` and `wrangler ai models` endpoints 403), but the **AI binding works**, so I deployed a
  throwaway probe Worker (`env.AI.run` passthrough, since deleted) and probed seven models with the exact
  `execute_local_sql` tool. Result: `@cf/mistralai/mistral-small-3.1-24b-instruct` reliably populates
  structured `tool_calls` **and** writes correct DuckDB/Postgres-dialect SQL (7/7 on varied
  single-table + multi-table-join questions, double-quoted identifiers, proper JOINs). `llama-3.3-70b`
  tool-called but **hallucinated the schema**; `qwen3-30b-a3b` was correct but a reasoning model (~700
  completion tokens/turn → latency/cost bloat); `hermes-2-pro` is **deprecated (2026-05-30)**; `gpt-oss-20b`
  free-texted like the coder. Mistral also returns **real `usage.neurons`** and carries **128K** context.
  **(3) The fix — model swap + one adapter change + one harness change.**
  • Model: `wrangler.toml` (root + staging `AI_MODEL`) and `edge/adapters.ts` `DEFAULT_AI_MODEL` → Mistral
  Small 3.1. • Adapter: Mistral rejects a tool-call id that isn't exactly 9 chars of `[a-zA-Z0-9]` when
  echoed back on the tool result, and the adapter's fixed `call_0` also collided across retry attempts —
  `toWireTurn` now generates a fresh 9-char alphanumeric id per call (`edge/adapters.ts`; asserted by test;
  the two-turn loop verified to terminate cleanly). • Harness: `eval/providers/cloudEdge.ts` reused one
  `sessionId` across all 58 questions, so the router's per-session daily Workers-AI quota (20/day) 429'd
  most of them — now a unique session per question (each gets its own budget) plus ~2.2s pacing to stay
  under the 30/min per-IP floor. No router/limiter behavior changed; the limits are honored, not bypassed.
  **(4) Eval, re-run live:** **cloud-edge (Mistral, real staging Worker) 98.3% / 82.8% / 100%** — clears
  every §11.4 threshold (≥90% / ≥75% / ≥50%). For context: WebLLM 93.1%/72.4%, template floor 67.2%/19.0%,
  mock-cloud 100%/100% (plumbing check). This is the first real cloud provider driven end-to-end through
  the actual `askAI` pipeline against a live backend — it also satisfies the "E2E against a real provider"
  and self-correction (§18) criteria, not just the eval-gate number.
  **(5) Cost, measured not estimated.** Mistral reported **~37 neurons at ~990 in / ~113 out** (live
  `usage.neurons`); scaled to the reference ~1,500 in / ~300 out that is **~63 neurons/turn → ~160 free
  turns/day** account-wide (~8 sessions at the 20-turn default). Cheaper per turn than the old 117 estimate
  (Mistral prices ~half the coder's per-token rate), but the shared-exhaustible-pool reality is unchanged.
  **Docs updated master-first:** DATASCOPE.md §11.2 (model id + pool figures); ADR-007 (a dated **Correction**
  block on the tool-calling finding + the measured neuron cost + the eval numbers + the adapter id note);
  mirrored into `build/09-edge/01-ai-router.md` and `build/06-ai/01-pipeline.md` (whose eval-gate acceptance
  criterion is now checked). **Verification:** full suite **813 pass** (unchanged count; the id assertion
  rides an existing test), `tsc -b` / `oxlint` / `vite build` all clean; edge tests 44 pass.
  **Model note:** done on **Opus** — the inference-model judgment (which cloud model, tool-calling behavior)
  and the D9-adjacent edge wiring are what the model rule reserves for Opus; the session was on Opus for all
  of it.
  **Why the boxes still don't check:** the eval gate (the headline blocker) is cleared and the router E2E is
  green live, but two acceptance items remain, both cheap now that the Worker is up: **(a)** the **live-Worker
  key-custody audit** for `09-edge/01-ai-router` — inspect the live logs / KV / response to confirm no BYOK
  key or prompt/SQL content escapes (only unit-tested so far), and **(b)** the browser-level E2E of the chat
  against the live Worker (the eval runs the pipeline over Node DuckDB, not the in-browser engine) plus a
  real-backend §21.6 timeout (only the mock-timeout path is verified). BYOK is also not yet UI-wired
  (`06-ai/02-modes-byok`). Pre-existing note (not touched, per surgical-changes): `edge/adapters.ts:147,166`
  carry `§`/`D-` citations the code-repo writing rules ban — worth a cleanup pass unrelated to this work.
  **Next concrete action:** run the live-Worker key-custody audit and the browser E2E against the live
  Worker; with those two done, `06-ai/01-pipeline` and `09-edge/01-ai-router` can close together. Then wire
  BYOK from the UI (`06-ai/02-modes-byok`).
  **Blocker:** none technical — the deploy, model, and eval gate are all done and green; the remaining items
  are a custody audit + a browser E2E run, not blocked on anything. `▶` stays on `06-ai/01-pipeline`.

- **2026-07-22** — **The staging edge Worker is deploy-ready: the router's injected seams now have
  real Cloudflare-binding adapters, a Worker entrypoint, and a one-command deploy — but the deploy
  itself is not yet run (it needs a `CLOUDFLARE_API_TOKEN` in the deploying shell, which this
  non-interactive session cannot supply; `wrangler login` is a browser flow). Box stays unchecked:
  the live deploy, the live-Worker key-custody audit, and the D40 cloud eval all still need the
  Worker actually up.** What landed (all checks green — `tsc -b`, `oxlint`, `vite build`, full suite
  **800 → 813**, edge tests **31 → 44**):
  **(1) Worker entrypoint** (`edge/worker.ts`) — CORS (preflight + wildcard, safe since the key
  rides in the body, not a cookie), path routing, and the binding→seam wiring that turns the runtime
  `Env` into the `handleAiRouter` collaborators. `wrangler deploy --dry-run` bundles it clean
  (17.66 KiB); the tested surface is still the pure `handleAiRouter`.
  **(2) Binding adapters** (`edge/adapters.ts`) — `createKvRateStore` (fixed-window counter over KV,
  window-bucketed key + TTL reap), `createAnalyticsSink` (Analytics Engine; writes only outcome
  labels + numeric buckets — the metric shape still makes content unrepresentable; no-ops unbound),
  and `createWorkersAiProvider` (one non-streaming `env.AI.run` per turn against the ADR-007 default
  `@cf/qwen/qwen2.5-coder-32b-instruct`; OpenAI-style message/tool mapping; deterministic tool-call
  parse; a neuron/capacity error → `WorkersAiCeilingError` so the router overflows to a key).
  **(3) D9 BYOK pass-through resolver** (`edge/byok.ts`, isolated for audit) — an OpenAI-compatible
  provider whose raw key lives only in the closure and reaches only the outbound `Authorization`
  header; a unit test asserts the key is in that header and **nowhere** in the body or URL, and that
  an upstream failure throws a status-only, key-free error. `vaultRef` / non-OpenAI creds resolve to
  null (bad-request), leaving the vault to `09-edge/03`.
  **(4) Deploy plumbing** — `wrangler.toml` (root + `[env.staging]`, AI binding, KV namespace, vars,
  Analytics Engine commented until the account enables it), `scripts/deploy-edge-staging.sh`
  (idempotent: creates the KV namespace, fills its id into the toml, `wrangler deploy --env staging`;
  telemetry off), `npm run edge:deploy:staging` + `edge:dev`, `wrangler` devDep, `.gitignore` for
  `.wrangler`/`.dev.vars`. 13 new edge tests cover the adapters + the custody surface.
  **Model note:** built on **Opus** — this is the security-sensitive D9 edge wiring the model rule
  reserves for Opus; the session was switched to Opus before the bindings/BYOK adapter was written.
  **Deviations logged:** (i) the staging Worker routes **only `/ai-router`** (+ a binding-only
  `/health` probe) — synthesis and MCP share this infra but are deliberately not routed yet
  (synthesis needs its producer re-rank design closed against its own eval gate; MCP's shared-artifact
  store lands with `08-persistence`); each is one more branch in `dispatch`. (ii) `WorkersAiProvider`
  is **non-streaming** (one `env.AI.run`, whole turn as a single `done` frame) — token streaming stays
  deferred, consistent with the existing transcript deferral; the router's SSE path still works. (iii)
  BYOK is OpenAI-compatible pass-through only. (iv) Cloudflare binding types are declared locally
  (`edge/bindings.ts`), not via `@cloudflare/workers-types`, to avoid DOM-lib global clashes under the
  edge tsconfig. When `09-edge/01-ai-router` is formally built, its leaf-doc **Files** section should
  gain `worker.ts`/`adapters.ts`/`byok.ts`/`bindings.ts` + the deploy plumbing.
  **Next concrete action:** run `CLOUDFLARE_API_TOKEN=… npm run edge:deploy:staging` (token needs
  Workers Scripts:Edit, Workers KV Storage:Edit, Account Settings:Read), capture the `*.workers.dev`
  URL, `curl …/health` to verify, set `VITE_EDGE_AI_ROUTER` to `<url>/ai-router`, then run a real
  cloud provider through the D40 harness against the live Worker and record the numbers vs. the
  §11.4 thresholds. That closes the E2E + custody-audit + eval criteria on `06-ai/01-pipeline`.
  **Blocker:** the staging deploy needs `CLOUDFLARE_API_TOKEN` present in the deploying shell — a
  non-interactive session cannot run `wrangler login`. Everything up to the deploy is done and green.
  `▶` stays on `06-ai/01-pipeline`.

- **2026-07-22** — **The D40 eval harness is built and has run its first real numbers, closing the
  handoff from the router entry below; `06-ai/01-pipeline`'s eval-gate criterion has a working
  measurement process for the first time, though the box stays unchecked (a real cloud backend
  still needs to clear the declared thresholds).** Lives in `app/eval/` (dev/CI-only, never
  imported by the product bundle — verified: `tsc -b`/`oxlint`/`vite build`/the 800-test suite
  all stay clean with it added). Four parts:
  **(1) A Node-native DuckDB engine** (`app/eval/engine/duckdb.ts`) — duckdb-wasm's synchronous
  Node binding (`duckdb-node-blocking`), no browser and no Worker plumbing, so `npm run eval`
  needs only Node. Real SQL execution, not a mock.
  **(2) A 58-question labeled set** (`app/eval/dataset/questions.ts`) over all five non-personal
  §14 sample datasets (titanic, stock_prices, weather, product_reviews, the 4-table ecommerce
  warehouse — joins included), each with a reference SQL query; every reference query is
  verified to execute cleanly against the real engine. Tables are loaded and classified through
  the *actual* product pipeline (`src/lib/profile.ts` + `src/lib/classifier.ts`, reused directly,
  not re-derived — D58), so the harness sees exactly the schema-prune input a real session would.
  **(3) Three providers, honestly differentiated.** `local-template` (`providers/localTemplate.ts`)
  is a genuine rule-based count/avg/sum/max/min-with-optional-groupby generator — the real,
  no-LLM `local-only` mode floor (product code returns `null` for that mode's provider; this
  measures what a template-only path *could* answer, so the report shows the real gap an LLM
  closes). `mock-cloud` (`providers/mockCloud.ts`) is a scripted oracle — answers from the
  harness's own reference SQL, 100%/100% by construction — explicitly **not** a capability claim,
  only a check that the harness's per-provider plumbing (turn accounting, cost proxy, repair-rate
  columns) is complete ahead of a real `09-edge/01-ai-router` deploy, per D40/D43's own honesty
  rule. `webllm` runs **real inference** — a new `spike-webllm/src/evalRunner.ts` reuses
  `pruneSchema`/`classifyColumns` across a project boundary (`vite.config.ts` `server.fs.allow`)
  against the D43-verified Qwen2.5-Coder-1.5B-q4f16 engine, driven headed via a new
  `spike-webllm/run-eval.ts` (the same headed-Chrome-for-real-WebGPU pattern as the D43 spike's
  own driver — headless silently falls back to SwiftShader). Single-shot SQL extraction, not the
  full tool-use loop — the D43 spike already found plain-text extraction the reliable shape for
  this small quantized model, so this mirrors that finding rather than assuming tool-calling works.
  **(4) The scorer + runner** (`app/eval/scorer.ts`, `runHarness.ts`) drive the *real* pipeline
  function (`askAI()` from `src/services/ai.ts`) for the two Node-side providers — not a
  second, harness-only NL→SQL path — and score exec-rate + result-correctness by
  order-insensitive, numerically-rounded execution match (a differently-shaped but equivalent
  query still scores correct), matching the spike's own criterion-B scorer. Cost is an
  estimated-tokens-per-turn proxy (prompt+completion chars ÷ 4) since no provider here is a
  metered API yet. `npm run eval` prints a combined report and writes `EVAL-RESULTS.json`;
  `spike-webllm`'s `npm run eval` writes `app/eval/webllm/WEBLLM-EVAL-RESULTS.json`, which the
  main run merges in when present.
  **Thresholds declared (§11.4, mirrored into `build/06-ai/01-pipeline.md`):** exec-rate ≥ 90%,
  result-correctness ≥ 75%, repair-rate ≥ 50% among turns needing a retry, no cost ceiling yet.
  **First real numbers, over the 58-question set:** WebLLM (the only D43-cleared "local" claim)
  **93.1% exec-rate / 72.4% correctness** — real Apple WebGPU inference, not simulated — sitting
  under the declared thresholds as expected for a 1.5B model, with headroom left for the intended
  v0.5 32B cloud model to clear them. Local-template baseline (informational, not gated): 67.2%
  exec / 19.0% correctness. Mock-cloud (plumbing check): 100%/100%.
  **Why nothing here checks a BUILD-ORDER box:** the eval harness was never its own checklist row
  (D40 specs it as dev/CI tooling, not a shipped feature) — it exists to *measure* the criteria
  `06-ai/01-pipeline`, `02-modes-byok`, and `v0.25/02-edge-synthesis` already declare, and those
  three still gate on the same missing piece as the 2026-07-22 router entry below: a **staging
  deploy** of the edge Worker so a real cloud provider can be run through this exact harness.
  **Next concrete action:** stand up the staging deploy (Worker + Workers-AI binding), then run
  the real cloud provider through this same harness — the plumbing (mock-cloud) is proven, so
  that run is a provider swap, not new harness work. `▶` stays on `06-ai/01-pipeline`.
  **Blocker:** unchanged from the entry below — a staging deploy.

- **2026-07-22** — **The cloud AI router is built (the first real backend behind the provider
  seam), the cloud NL→SQL model is decided, and the shared edge infra is promoted to serve
  every endpoint; box stays unchecked pending a staging deploy + custody audit + the D40 eval.
  Handoff: D40 eval harness is next, built with WebLLM from the spike as the local-model
  provider so testing can start immediately (labeled question set + harness framework + mock
  cloud); real cloud eval follows once staging Worker is deployed.**
  Four parts:
  **(1) Cloud model decided (ADR-007).** A scout re-checked Cloudflare's live model + pricing pages
  (2026-07-22): the default cloud NL→SQL model is **`@cf/qwen/qwen2.5-coder-32b-instruct`** —
  code-specialized, tool-calling + SSE confirmed on its own model page, 32K context. At Workers-AI
  rates a representative turn (~1,500 in + ~300 out) costs **~117 neurons**, so the **10,000-neuron/day
  free allocation is ~85 turns/day *account-wide*** — at the §11.2 launch default of 20 turns/session/day,
  roughly four sessions drain the whole free pool for the UTC day. That number is the concrete evidence
  behind §11.2's "shared, exhaustible free budget, not a per-user allowance," and it's why the
  shared-budget-exhausted state and BYOK/local overflow are load-bearing. Recorded in ADR-007 (was
  explicitly "owed by the 06-ai router"); the stale DATASCOPE.md §11.2 clause was corrected master-first.
  **(2) The router (`edge/ai-router.ts`).** One tool-use round-trip routed per §11.2/D3: Workers AI by
  default; the *prefer-my-key* / *free-tier-first* toggle; **ceiling detection → overflow to the user's
  key** (labeled `servedBy` so the client shows who answered); a **per-session daily Workers-AI quota**
  (default 20) + **per-minute dual-keyed limiter** (10/min/session + IP floor) + **64 KB body cap**;
  D9 pass-through key custody (attached to the provider call, **never** persisted/logged/echoed — the
  metric shape and rate-store keys make that structurally impossible) with a vault-reference seam for
  09-edge/03; **SSE streaming** proxied through for text answers (§15); and **numeric-only D41 metrics**
  (served-by, token counts, loop attempt, latency bucket, outcome — no prompt/SQL/error text can reach
  the sink). Providers, the vault resolver, the stores, and the kill switch are injected, so it is fully
  tested here ahead of a Worker deploy. **Quota-exhausted** (our per-session limit) and **pool-exhausted**
  (Workers-AI's own account-wide ceiling) are distinct typed 429s; both render as the client's
  shared-budget state.
  **(3) DSPS MCP stage-A surface (`edge/mcp.ts`, D38).** A read-only `list_shared` / `get_dsps` over
  *explicitly shared artifacts only* (an unshared/unknown id is an indistinguishable 404, never a leak),
  on the same limiter/kill-switch/counters. Stage-B tools + server-side execution stay behind the D39
  round (v1+). Backed by an injected `SharedArtifactStore` seam until 08-persistence lands the store.
  **(4) Shared infra promoted + client wired.** `edge/shared/*` moved from `synthesis`-hardcoded to
  per-endpoint namespaces (`checkRateLimit(store, namespace, …)`, a generic `isPaused`/`typedError`, a
  widened `EdgeMetric` union), synthesis still green. Client: `src/services/cloudProvider.ts`
  (`createCloudProvider`) is the first real `AIProvider` behind the seam — maps messages/tools to the
  wire request, reads JSON or SSE, and throws `ProviderQuotaExhaustedError` on quota/pool/paused;
  `resolveProvider('cloud', config)` returns it when an endpoint is configured, else null (unchanged
  honest "not connected" state — no Worker is deployed). **31 new tests pass** (16 router: Workers-AI
  round-trip, tool-call turn, prefer-key 100%, ceiling→overflow, quota/rate/pool/body-cap typed errors,
  kill-switch, timeout, streaming-incremental, numeric-only-metrics audit, pass-through-key-leak audit;
  7 MCP; 8 cloud provider). Full suite **769 → 800 passing**; `tsc -b`, `oxlint`, `vite build` clean.
  **Why the box is unchecked:** the definition of done needs a real backend the seam does not have —
  (a) Workers-AI round-trip + Phase-4 E2E green **against staging**, (b) the key-custody audit run
  against a **live** Worker (logs/KV/response), (c) the **D40 eval gate**. All three need a deploy +
  a real provider. Built against seams exactly as `06-ai/01-pipeline` and `v0.25/02-edge-synthesis` were.
  **Deviations logged:** (i) BYOK **credential capture** (which provider a key is for) stays with
  `06-ai/02-modes-byok` — the UI wires cloud via the free tier (Workers AI) only for now, so the
  AIChatModule config sets `routing` from `byokPreference` but sends no `byok` yet; the router + client
  adapter fully support the BYOK path and are tested, they're just not yet fed a credential from the UI.
  (ii) Incremental **token rendering in the transcript** is deferred (the loop calls `complete()` once
  per attempt and consumes the whole turn); the router streams and the client adapter reads deltas via
  `onToken`, but plumbing deltas into `AITurnView` is a small client follow-up, like the earlier
  live-in-transcript-chart deferral. (iii) The **vault** path is a `ByokResolver` seam; `09-edge/03`
  owns the real KV-backed resolution. (iv) No wrangler/Workers vitest pool — the handlers are pure
  `handle*(request, env)` with injected collaborators under plain vitest, same as synthesis; real
  wrangler-dev integration is a deploy-time follow-up.
  **Next concrete action:** the router now gives `06-ai/01-pipeline` and `06-ai/02-modes-byok` a real
  provider to point at, but their completion (and this box) all gate on the same missing piece: a
  **staging deploy** of the edge Worker + the **D40 eval harness**. Build the D40 eval harness next (it
  gates the whole Phase-4 ship and needs only a provider + the labeled set, both now in hand as seams),
  then stand up the staging deploy to close the three edge boxes together.
  **Blocker:** ai-router completion is gated on a staging deploy (Worker + Workers-AI binding) and the
  D40 eval harness. `▶` stays on `06-ai/01-pipeline`.
  **Handoff to next session:** build the **D40 eval harness** with three providers: (1) local-only
  (deterministic templates), (2) local-model **WebLLM from spike-webllm/** (same Qwen2.5-Coder-1.5B
  the D43 spike proved; harness calls its inference end-to-end), (3) cloud (mock Workers-AI responses
  so the framework is complete). Scope: labeled NL→SQL question set (50–200 items over §14 samples),
  harness test runner (feed Q → provider → execute SQL → score result), metric collection
  (exec-rate/correctness/repair-rate/cost per mode). TypeScript, vitest. This unblocks the full
  harness + labeled set without Ollama install or staging Worker deploy; real cloud numbers follow
  once the Worker is staged. The harness framework gates `06-ai/01-pipeline`, `06-ai/02-modes-byok`,
  and `v0.25/02-edge-synthesis` together.

- **2026-07-21** — **AI modes, the first-run chooser, D9 key custody, and a real local-model
  provider are built; box stays unchecked pending the edge relay + vault + the D40 eval gate.**
  Four parts:
  **(1) First-run chooser (D2).** `aiMode` starts null (no silent default); `AIModeChooser.tsx`
  renders as a blocking overlay until the user picks one of the three modes — local-only (a
  first-class kill-switch choice, not a fallback), local model, or cloud (described as a **shared,
  exhaustible free budget**, never a personal allowance). No inference can run before the choice:
  the AI Chat nav card is `aiMode !== null`-gated and `resolveProvider(null→'local-only')` returns
  null. Mode is switchable later in the new **AI settings** panel (`AISettingsPanel.tsx`, opened
  from the header — the dead Menu button is now a Settings entry point).
  **(2) D9 key custody — the security-sensitive core (why this ran on Opus, not the columned
  Sonnet).** The raw BYOK key lives in a **non-persisted** memory store (`src/stores/byokKey.ts`,
  plain zustand, no `persist`) — gone on tab close, never in localStorage/IndexedDB/cookies. The
  settings panel discloses this in plain words and offers a Clear control; "Remember my key"
  (server-side vault) is shown **disabled** with an honest "not available yet" note so the panel
  never implies a persisted key it can't deliver. **Verified by test:** entering a key never lands
  it in any localStorage entry (the D9 storage-scan criterion).
  **(3) Real local-model provider.** `src/services/ollamaProvider.ts` is a genuine `AIProvider`
  over a **localhost Ollama** `/api/chat` endpoint — the one honestly-specced backend that needs
  no infra of ours (the user runs the daemon), so the NL→SQL loop runs end-to-end locally with
  zero external egress. It maps our provider-agnostic `ProviderMessage[]`/`AITool[]` onto Ollama's
  tool-calling shape and back; `resolveProvider` now returns it for `local-model` (cloud/BYOK stay
  null until the edge relay exists). Defaults: `qwen2.5-coder:1.5b` per the D43/ADR-007 guardrail,
  overridable.
  **(4) Shared-budget-exhausted client state (criterion 7).** A typed `ProviderQuotaExhaustedError`
  (in `aiProvider.ts`) is the contract a cloud/edge provider throws on a quota/pool-exhausted code
  or a flipped kill-switch (§11.2/§23.5); the pipeline (`services/ai.ts`) recognizes it and renders
  the specific *"free AI budget is used up for today — bring your own key, switch to the local
  model, or retry tomorrow"* state instead of a generic "couldn't reach the provider." **14 new
  tests pass** (Ollama mapping/tool-call/replay/error; chooser three-mode + shared-budget copy +
  set-on-click; settings mode/routing switch, cloud-only reveal, memory-only custody storage-scan,
  clear, close; the quota client-state branch). Full suite **755 → 769 passing**; `tsc -b`,
  `oxlint`, `vite build` clean.
  **Why the box is unchecked:** four acceptance criteria need backends that don't exist yet —
  (a) prefer-my-key 100% routing / free-tier-first overflow at ceiling (the router owns overflow —
  `09-edge/01-ai-router`, unbuilt), (b) the "Remember my key" vault round-trip (`09-edge/03-vault`,
  unbuilt), (c) the cloud-mode Network-tab custody/disclosure run against a live Worker, and (d) the
  **D40 eval gate**. Local-only (zero-network), local-model (Ollama pipeline), first-run chooser,
  and default memory-only custody **are** met and tested. Built against the edge seam exactly as
  `06-ai/01-pipeline` and `v0.25/02-edge-synthesis` were.
  **Model-column correction (rule 5):** columned **Sonnet**, built on **Opus** — BYOK key custody
  is the security-sensitive edge code the model rule reserves for Opus. Column updated above.
  **Deviations logged:** (i) mode-setting stayed in the settings store (`setAIMode`), not
  re-added to `services/ai.ts` — the leaf doc's old `services/ai.ts (setAIMode())` Files line was
  stale (the pipeline build already moved it) and is corrected. (ii) A **direct-browser BYOK
  provider was deliberately not built** — the spec routes BYOK through the Worker stateless
  pass-through ("works regardless of provider CORS"), so the real cloud/BYOK provider is
  edge-gated, not a client-only invention. (iii) `AISettingsPanel`/`AIModeChooser` tests add
  explicit `afterEach(cleanup)` (this repo's vitest runs without `globals`/auto-cleanup).
  **Next concrete action:** build **`09-edge/01-ai-router`** (Opus) — it promotes `edge/shared/`
  from seam to real infra, gives the cloud provider a home, and unblocks this item's routing/
  overflow criteria **and** `06-ai/01-pipeline`'s E2E/eval criteria. Then the D40 eval harness.
  **Blocker:** 02-modes-byok completion is gated on the edge router (`09-edge/01`) + vault
  (`09-edge/03`) + the D40 eval harness. `▶` stays on `06-ai/01-pipeline`.

- **2026-07-21** — **NL→SQL pipeline (§11.1) built as a provider-agnostic tool-use loop; box stays
  unchecked pending a real provider.** A plain-English question now runs the full six-stage pipeline
  end-to-end against a provider seam + scripted mock, with the complete transcript audit trail: stage 1
  fuzzy pre-match (`src/lib/inputNormalizer.ts` — Levenshtein typo repair against the schema vocabulary,
  "fair"→"fare", no embeddings), stage 2 schema-pruned prompt (`src/lib/schemaPrune.ts` — relevant
  tables/columns only, FK-neighbour pull-in, facts-only), stages 3–5 as an `execute_local_sql` tool-use
  loop (`src/services/ai.ts` `askAI()`) that lints each call before it runs, executes against the
  DuckDB `QueryEngine`, and on failure feeds the error trace back and retries — **hard cap 3 attempts,
  verified to stop at exactly 3**; stage 4 dialect lint (`src/lib/sqlLint.ts`) and stage 6 auto-chart
  through the shared `chartMapper`. Every generated query + per-attempt execution log (SQL, timing, row
  count, error, retry #) renders in the transcript (`src/features/ai/AITurnView.tsx`), wired into the
  ANALYZE nav as the AI Chat destination (`AIChatModule.tsx`, `App.tsx`). **ADR-008 decided:
  `pgsql-ast-parser` (Accepted) — the `sqlLint.test.ts` CTE/window suite is the parse-fidelity
  evidence; A.3 survey re-verified on npm.** The `AIProvider` seam (`src/services/aiProvider.ts`,
  types in `src/types/ai.ts`) is the contract the cloud router / BYOK / WebLLM providers implement;
  today `resolveProvider` returns null for every mode (no backend wired), so the chat degrades to a
  clean "not connected yet" message. **29 new tests pass** (normalize, lint incl. all four dialect
  classes, prune, loop self-correction / cap / lint-block / provider-timeout / transport-fail /
  auto-chart, transcript render); `tsc -b` and `oxlint` clean.
  **Why the box is unchecked:** three acceptance criteria need a *real* provider, which is not built
  yet — (a) E2E against a real provider for the §18 self-correction demo, (b) provider-timeout §21.6
  proven against a real backend (only the mock-timeout path is verified), (c) the **D40 eval harness**
  clearing its exec-rate/correctness/cost/repair-rate thresholds (harness not built; needs a real
  provider + the labeled set). The pipeline was deliberately built against the seam because 06-ai/01 is
  sequenced *before* the providers (09-edge, 02-modes-byok).
  **Deviations logged:** stage 2 got its own file (`schemaPrune.ts`) rather than overloading the
  "Copy for AI" `aiContext.ts`; the provider seam + mock live in `aiProvider.ts` + `types/ai.ts`; the
  old `services/ai.ts` stub's unused `setAIMode` was dropped (mode lives in the settings/aiSession
  stores). Leaf doc `build/06-ai/01-pipeline.md` **Files** section updated to match (leaf-only detail;
  no master change). Chat does not yet consume computed FK edges (passes `[]`) — edge computation is the
  join-graph module's; wiring it in is a small follow-up. The transcript renders a chart *chip*
  (type + axes), not a live chart — the loop calls the translator (criterion met); live in-transcript
  rendering waits on the provider + a transcript data-retention decision.
  **Next concrete action:** build **`06-ai/02-modes-byok`** (Sonnet) — the BYOK client-side provider is
  the first real `AIProvider` behind this seam; wiring it (+ `resolveProvider`) lets 01's E2E/eval
  criteria close. Then build the D40 eval harness.
  **Blocker:** 01-pipeline completion is gated on a concrete `AIProvider` implementation
  (02-modes-byok BYOK, or 09-edge/01 cloud) **and** the D40 eval harness. `▶` stays on
  `06-ai/01-pipeline`.
  **Pre-existing, unrelated:** 23 store/component tests (App, Sidebar, settings, privacy) fail in their
  `beforeEach` on `localStorage.clear()` — jsdom@29.1.1 in this environment does not expose
  `localStorage` (`window` exists, `window.localStorage` is undefined). Not caused by this work (every
  failure is in test setup, none touch the pipeline diff; jsdom version unchanged). Worth a separate
  test-infra fix (a vitest `setupFiles` localStorage shim) so the suite is green again.

- **2026-07-21** — **Test suite is green (729 → 755 passing) and the edge-synthesis warm-start endpoint
  is built against a seam; box stays unchecked pending a real backend + staging deploy + the D40 eval
  gate.** Two parts:
  **(1) Test-infra fix.** The 23 pre-existing failures are resolved: `src/test/setup.ts` installs a
  spec-faithful in-memory `Storage` (jsdom under an opaque origin exposes none), wired via `setupFiles`.
  One further stale assertion in `App.test.tsx` — it still expected the `'Ai panel'` placeholder for the
  `ai` route, which the NL→SQL pipeline replaced with the real `AIChatModule` — was retargeted to the
  AI-chat empty state. `tsc -b` + `oxlint` + `vite build` clean.
  **(2) Edge synthesis worker.** The warm-start synthesis endpoint (`edge/synthesis.ts`) is a producer
  over the deterministic Verdict: it receives the already-computed baseline slice + structure-only facts
  and returns the same slice type re-ranked/re-phrased, never a new claim or route. It is stateless
  (nothing about a request is persisted), sits on a minimal shared-infra seam (`edge/shared/` — dual-keyed
  limiter → typed 429, per-endpoint kill-switch → typed 503, request-body cap → 400, content-free
  numeric-only counters whose metric shape makes content-bearing telemetry unrepresentable), and forwards
  to an injected provider (the ai-router in prod). The wire contract (`edge/protocol.ts`) is self-contained
  so the edge deploy never imports the app's store layer. Client side: `src/services/synthesis.ts` gates on
  opt-in (cloud/local-model only; local-only and no-first-run-selection never call the edge — verified by
  test), sends structure only (schema/types/aggregates, never rows/min/max/mean), and applies the two
  ADR-010 seam validators (`src/lib/producerValidators.ts` — set-identity for actions, byte-identity +
  the D45 phrasing guard for narration) to validate-then-upgrade-or-degrade **each seam independently**;
  the `useSynthesisUpgrade` hook + a "Tailored to your data" badge on the Blueprint render the D56 upgrade
  deterministic-first (the badge only appears after a successful opted-in upgrade; it never blocks paint).
  **26 new tests pass** (endpoint: ok/structure-only/no-storage-audit/kill-switch-503/rate-limit-429/
  over-cap-400/malformed-400/provider-down-degrade; validators; client opt-in gate + independent-seam
  degrade paths).
  **Why the box is unchecked:** the definition of done needs a real backend the seam does not have —
  (a) staging deploy on the ADR-006 shared infra, (b) the structure-only/stateless/never-stored custody
  audit against a live Worker, (c) opt-in + local-only-never-calls verified against the Network tab, and
  (d) the D40 eval gate recorded (the composed narrative must beat the deterministic baseline on the
  labeled set). None is possible until a provider + the shared router exist.
  **Built ahead of sequence, at explicit human instruction ("wrap this up first").** The `▶` is on
  `06-ai/01-pipeline` and this item's own blockers are unbuilt (`09-edge/01-ai-router` for the shared
  router/limiter/kill-switch/counter infra; `08-persistence/03-dsps-spec` for the DSPS fragment), so it was
  built against seams for all three, mirroring how 06-ai/01 was built against the provider seam. **The `▶`
  stays on `06-ai/01-pipeline`** — neither box is checked.
  **Deviations logged:** (i) no wrangler / Workers vitest pool was added — the endpoint is a pure
  `handleSynthesis(request, env)` with injected collaborators, tested under plain vitest; real wrangler-dev
  integration is a deploy-time follow-up. (ii) The ADR-006 shared infra was authored here as a minimal
  seam (`edge/shared/`) because `09-edge/01` is unbuilt; that row will own and formalize it (limiter store
  backed by KV/DO, counters → Analytics Engine, router service binding). (iii) The DSPS fragment is a
  minimal `StructuralFacts` shape; `08-persistence/03-dsps-spec` will formalize it. (iv) The client artifact
  is the "tailored this view" badge + async hook (the Files section's named deliverable); swapping the
  Verdict prose in place is deferred to the real provider, gated on the D40 eval confirming tailored beats
  deterministic — until then there is no non-mock text to swap in. Leaf doc `build/v0.25/02-edge-synthesis.md`
  **Files** section updated to match (leaf-only detail; no master change). New `edge/` tree typechecks under
  `tsconfig.edge.json` (referenced from the root solution config) and its tests run via the extended vitest
  `include`.
  **Next concrete action:** build **`06-ai/02-modes-byok`** (Sonnet) — the first real `AIProvider`, which
  both closes 06-ai/01's E2E/eval criteria and gives 09-edge/01's router a provider to route to; then
  `09-edge/01-ai-router` promotes `edge/shared/` from seam to real infra and this endpoint's box can close.
  **Blocker:** edge-synthesis completion is gated on a live backend (`09-edge/01-ai-router` + a provider)
  and the D40 eval harness — the same gate as 06-ai/01. `▶` stays on `06-ai/01-pipeline`.

- **2026-07-23** — Repository writing rules amended, human call taken on the citation
  question left open above. `§n` citations, `D-`numbers and links into `_implementation/`
  are **no longer banned** in code, comments, commits or READMEs: the design tree ships in
  this repository, so those references resolve in a fresh clone and the original reason for
  the ban does not hold. The fresh-clone rule itself stands unchanged, as does the ban on
  process narration ("Phase n", "Sprint", "now supports"). The one constraint added is that
  a citation supplements the reason and never replaces it — `renders four intent groups
  (§13.2, D68d)` is correct, a bare `see §13.2` is not. Consequence: the ~571 existing
  citations across 177 files in `src/`, `edge/` and `eval/` are conformant as written; no
  retroactive cleanup pass is needed and none should be run. `BUILD-ORDER.md` **Writing
  rules for the code repo** updated to match.

- **2026-07-22** — **DESIGN DECISION, not yet implemented — recorded here to fold into the next
  build session (whichever item is ticked off next; human instruction: "document it in the logs,
  we will implement it along with the next item we tick off the list").** Human directive:
  re-shape the AI mode taxonomy — rename **"Cloud AI" → "API"**, and move **local Ollama access
  out of "Local model" mode and into "API" mode**, reached the same way a cloud key is: through
  the key/endpoint field, not a separate mode. Four sub-decisions made (via clarifying questions
  this session, each confirmed by the human):
  **(1) Ollama reaches the browser directly, not through the edge Worker.** Same shape as today's
  client-side BYOK pass-through (`services/ollamaProvider.ts` already does a direct `fetch` to
  `localhost:11434` — that provider is reused, just re-triggered from "API" mode's key/endpoint
  field instead of being gated behind "local-model" mode). `edge/byok.ts`'s server-side pass-through
  is unaffected — this does not add Ollama proxying to the Worker.
  **(2) "API" mode keeps both routing choices.** It is "Cloud AI" renamed, not re-scoped — still
  offers "free shared budget first" vs "prefer my key/endpoint"; supplying a key or Ollama URL does
  not become mandatory.
  **(3) The key/endpoint field auto-detects its own shape.** One field, not two: if the entered
  value looks like a URL, treat it as an Ollama base endpoint (no bearer auth); otherwise treat it
  as an OpenAI-style bearer key. Rejected alternative: an explicit provider-type selector — the
  human chose the simpler single-field UI over the cleaner data model.
  **(4) "Local model" mode narrows to in-browser (WebLLM) only.** Drop "or localhost Ollama" from
  its label/description and from the mode's provider resolution — Ollama moves entirely to "API"
  mode's key/endpoint path. `services/webllmProvider.ts` and the download/warm state machine are
  unaffected; only the mode's Ollama fallback branch goes away.
  **What this touches when built (docs first, then code, per this session's human instruction):**
  master `DATASCOPE.md` §5.1 (mode table) and §11.2 (routing), the settled **Decision Record**
  entries **D2** (mode chooser — now two modes' worth of behavior change, not three-way), **D3**
  (routing toggle — confirmed unchanged in shape, now serves "API" instead of "Cloud AI"), and
  **D9** (key custody — the field's contents branch on shape now, still never persisted/logged);
  human instruction is the required authorization to edit the settled D-record (per this repo's
  own rule). Leaf doc `build/06-ai/02-modes-byok.md` mirrors the master change. **Already-built app
  code that will need a follow-up edit pass** (not touched this session — docs-only workspace):
  `AIModeChooser.tsx` / `AISettingsPanel.tsx` (mode copy, the single auto-detecting field, dropping
  the separate Ollama path), `services/ollamaProvider.ts` (triggered from API mode's resolver, not
  `local-model`'s), `src/services/aiProvider.ts` `resolveProvider` (ladder changes: `local-model` →
  WebLLM only; `cloud`/`API` → Workers AI / user key / Ollama-by-URL-detection). `edge/byok.ts`,
  `edge/ai-router.ts`, and the vault seam (`09-edge/03-vault`) are unaffected by this change.
  **Why not implemented now:** human instruction was to log the decision only; implementation is
  deferred to land together with the next build-order item pulled (currently `▶ 06-ai/03-privacy-
  disclosure`, Sonnet) rather than as its own out-of-sequence session.
  **Next concrete action:** build `06-ai/03-privacy-disclosure` (Sonnet), folding in this mode-
  taxonomy change (master-first edits to §5.1/§11.2/D2/D3/D9, mirrored to `06-ai/02-modes-byok`,
  then the app-code follow-up listed above) rather than treating them as separate sessions.
  **Blocker:** none — deliberately deferred, not stuck.

- **2026-07-22** — **Local-model mode is now demonstrably functional against a real localhost
  Ollama daemon, and the leaf's mode-switch matrix E2E ran end-to-end and PASSED — closing every
  `06-ai/02-modes-byok` criterion except the vault round-trip. The box stays unchecked on that one
  criterion (`09-edge/03-vault` unbuilt); `▶` stays.** Ollama 0.32.1 was installed on this machine
  (Homebrew; daemon run ad hoc, not a login service) with the pinned `qwen2.5-coder:1.5b` (~986 MB),
  and a scripted browser session drove the real chat: "How many passengers survived?" → two POSTs to
  `localhost:11434/api/chat` → `SELECT COUNT("PassengerId") FROM titanic WHERE "Survived" = 1` →
  ✓ 1 rows · 8 ms → "There were 355 passengers who survived the Titanic." — zero external requests
  across the whole phase.
  **Two real bugs found by the run, both fixed.** (1) The pinned coder **never emits Ollama's
  structured tool_calls** (probed live against the daemon: 0/4, replying instead with prose, a raw
  JSON blob, or fenced SQL) — so the pipeline's loop took the text as a final answer and **no SQL
  ever ran in local-model mode**. `services/ollamaProvider.ts` now drives the model with the same
  deterministic SQL-mode/answer-mode control flow + plain-text `extractSql` the D43 spike proved and
  the WebLLM provider already uses (instructions + helpers now exported from `webllmProvider.ts`);
  answer mode omits `tools` entirely so the turn can only end as text, and a tool-tuned model's
  structured call is still honored. (2) The matrix's network assertions caught the dataset-open
  **synthesis request reaching the workers.dev host in local-model mode** — the ladder's cold local
  rung fell through to the edge rung, violating §5.1's zero-external contract for the mode.
  `services/synthesis.ts` now gates the edge rung to cloud mode: local-model's only AI synthesis
  rung is the warm in-browser engine, degrading to the deterministic baseline (`ai-uncached`) when
  cold or failed.
  **Matrix result (one scripted headless-Chromium session, 2000×1250, per-phase network
  classification):** chooser — 0 non-devserver requests before a mode is chosen; local-model —
  Ollama only, 0 edge/external; local-only — refusal rendered, 0 requests of any kind; cloud —
  exactly two `200 POST /ai-router` against the live staging Worker and "The average fare was
  approximately $36.93." (One earlier cloud attempt died at the client's 30 s §21.6 abort — a direct
  probe showed Workers AI at ~9 s that minute; retried clean.) ~4 real cloud inference calls total,
  all deliberate; Ollama inference is free.
  **Verification:** suite **886 → 891** (+5: three ollamaProvider control-flow tests built from the
  probed reply shapes, two synthesis egress-gate tests; one synthesis test rewritten to the stronger
  no-request-at-all guarantee), `tsc -b` / `oxlint` / `vite build` clean.
  **Docs, master-first:** no master edit — §5.1's mode table already states local model sends
  nothing; this change set realizes it. Leaves updated: `06-ai/02` (Ollama criterion ticked with
  evidence, Files rewritten to the built provider shape, test-plan note recording the matrix run and
  the leak it caught), `v0.25/02-edge-synthesis` (local-model never calls the edge), and
  `v0.25/03-webllm-handoff` (the ladder's cloud-only edge rung).
  **Model note:** built on **Opus** per the row's corrected model column.
  **Next concrete action:** `06-ai/03-privacy-disclosure` (Sonnet). `06-ai/02`'s box checks when
  `09-edge/03-vault` lands and its round-trip criterion closes.
  **Blocker:** none.

- **2026-07-22** — **`06-ai/03-privacy-disclosure` ships, folding in the mode-taxonomy rename
  logged above in the same session, per that entry's own instruction not to split them.**
  **Mode-taxonomy rename (docs master-first, then app code):** "Cloud AI" → **"API"** everywhere
  user-facing; localhost Ollama moved out of "Local model" (now in-browser WebLLM only) and into
  API mode, reached through the same key/endpoint field a cloud key uses. That field auto-detects
  its own shape (`services/ollamaProvider.ts`'s new `isOllamaEndpoint` — a URL is a local Ollama
  base endpoint, anything else a bearer key). Master edits: §5.1's mode table, §11.2, and D2/D3/D9
  (human-authorized per this repo's own rule for touching the settled Decision Record) — mirrored
  into `foundations/privacy-model.md` and `build/06-ai/02-modes-byok.md` (whose one re-pointed
  acceptance criterion — Ollama's live 2026-07-22 daemon run — is reopened with a note: the
  underlying capability evidence stands, only the trigger moved, and that specific move is
  unit-tested, not re-run live). App code: `aiProvider.ts`'s `resolveProvider` ladder (local-model
  is warm-WebLLM-or-nothing now, no Ollama fallback; API mode branches on field shape before
  falling to the edge router), `AIChatModule.tsx`'s status line (now reports a URL-shaped API-mode
  field honestly as zero-egress local, never as "API"), and the `AIModeChooser`/`AISettingsPanel`
  copy.
  **`06-ai/03-privacy-disclosure` itself:** a `metadataOnlyRepair` setting (default on, persisted
  like the other AI preferences) gates stage 5's retry behavior in `services/ai.ts` — off, a failed
  attempt resamples up to 3 real rows from the question's relevant table (a defensive slice, not
  just the SQL `LIMIT 3`) alongside the error trace, and a resample that itself fails degrades
  silently to metadata-only rather than crashing the turn; the terminal (turn-ending) failed attempt
  never resamples, since there's no further retry to enrich. Every sampled attempt carries
  `sampledRows: true`, which `AITurnView` renders as a transcript badge. `AISettingsPanel` gained
  the toggle plus a disclosure paragraph enumerating the exact §5.1 API-mode payload list
  (schema/prompts/SQL/error-traces, sample rows only if the toggle is off); `AIModeChooser`'s
  first-run blurb was extended to match ("error traces" was missing there before).
  **Verification:** suite **891 → 904** (+13: mode-taxonomy ladder/status/copy tests plus the new
  `isOllamaEndpoint` cases, and the metadata-only-repair/data-sampled-repair cases in `ai.test.ts`
  including the sampling-failure and terminal-attempt-never-samples cases); `tsc -b` / `oxlint` /
  full `vitest run` (904 passed) / `vite build` all clean.
  **Not run this session:** a live E2E flipping the toggle mid-conversation or re-confirming Ollama
  reachability specifically through the new API-mode trigger against a real daemon — both are
  unit/component-tested; the mode-taxonomy fold-in's underlying Ollama-reachability evidence is the
  unchanged 2026-07-22 live run logged above, just re-pointed. Flag if a future session wants the
  live re-confirmation.
  **Docs, master-first:** DATASCOPE.md §5.1/§11.2/D2/D3/D9 amended (dated inline); mirrored to
  `foundations/privacy-model.md` and `build/06-ai/02-modes-byok.md` (Modes/BYOK-routing/Key-custody
  sections and the Files section rewritten to the amended ladder; one acceptance criterion reopened
  per above). `build/06-ai/03-privacy-disclosure.md`'s acceptance criteria checked with evidence
  annotations; its Files/Test-plan/Definition-of-done sections rewritten to the built shape.
  **Next concrete action:** `09-edge/02-cors-relay` (Sonnet) — `06-ai/02`'s box still checks only
  when `09-edge/03-vault` lands and closes the vault round-trip criterion.
  **Blocker:** none.

- **2026-07-23** — Ollama-shaped API-mode fields now honor the D3 routing toggle instead of
  always bypassing it, closing a gap the master spec was silent on (no Decision-Record edit —
  §5.1/§11.2 already define the toggle; this realizes it for Ollama and adds the previously
  undocumented default rule). "Prefer my key" is unchanged: straight to Ollama. "Use free tier
  first", when explicitly chosen, tries the shared Workers-AI budget first and falls back to the
  local Ollama endpoint only on the router's existing keyless quota-exhausted/pool-exhausted/
  paused response — the overflow is client-orchestrated (`src/services/ai.ts`) since the edge
  Worker cannot reach the user's `localhost`; no edge/router code changed. New default rule: an
  Ollama-shaped field defaults to prefer-endpoint (zero-egress) until routing is explicitly
  touched, so the stored D3 default of `free-tier-first` never silently sends a local-Ollama
  user's payloads to the cloud. Master edits: §5.1's API mode table row, §11.2's BYOK bullet.
  Mirrored into `foundations/privacy-model.md` and `build/06-ai/02-modes-byok.md` (mode table,
  BYOK routing section, Files paragraph) and `build/09-edge/01-ai-router.md` (a note that the
  router needs no Ollama awareness — the overflow trigger is its existing keyless typed-error
  response). App code: `aiProvider.ts`'s `resolveProvider` (new `{ provider, overflowProvider? }`
  return shape; a new settings flag tracks whether routing was ever explicitly chosen), `ai.ts`'s
  tool-use loop (persists the provider swap for the rest of the turn on a quota-family error,
  marks `servedByOllamaOverflow`), `AIChatModule.tsx`'s status line and `AITurnView.tsx`'s inline
  disclosure, and `AISettingsPanel.tsx`'s copy (the "never at all"/"Zero egress" strings are now
  conditioned on whether routing was explicitly set to free-tier-first).

- **2026-07-23** — **`09-edge/02-cors-relay` built and unit/local-verified; the box stays open
  on one outstanding criterion (a live staging deploy), `▶` stays.** Before writing code, a
  genuinely open design question surfaced: the leaf doc's own spec text ("target URL in,
  response out; nothing rewritten beyond CORS headers") conflicted with master §7.4's summary
  line ("Worker-side [pagination] for Tier 2/3"), and ADR-006 — the doc both leaves cite as the
  authority — had never actually recorded a pagination decision. Resolved by human decision
  (2026-07-23, asked via clarifying question with a use-case comparison across the three named
  v0.5 platforms): **pagination is client-driven, not Worker-side** — the client loops, calling
  the relay once per page; the relay stays a strict single-fetch pass-through. Reasoning: only
  GitHub (of GitHub/Lichess/Chess.com) has generic follow-able pagination at all; Worker-side
  following would need bespoke response-framing (violates "nothing rewritten"), re-implements
  the SSRF check internally instead of reusing the per-call path, and holds one Worker
  invocation open across many upstream fetches (worse for the §23.5 cost ceiling than many
  short, independently-killable ones); the launch defaults' "pagination-friendly burst" rate
  sizing only makes sense if a multi-page ingest is already many relay calls. **Docs,
  master-first:** DATASCOPE.md §7.4 (the pagination bullet and the abuse/rate-limit sentence)
  and §23.5 (a stale "50-subrequest cap" clause that assumed Worker-side page-following).
  Mirrored into ADR-006 (new "Pagination — Tier 2 relay" decision section, status line updated)
  and both leaf docs (`09-edge/02-cors-relay.md`'s spec + acceptance criteria + test plan;
  `07-connectivity/02-api-tier2-relay.md`'s pagination bullet + a new acceptance criterion for
  the 20-call client-side cap it now owns).
  **`edge/cors-relay.ts` built to the amended spec:** `GET /cors-relay?url=&sessionId=` (no
  body — there's nothing to carry one), kill-switch → validate → SSRF-check → dual-keyed
  rate-limit (two independent windows, per-minute *and* per-hour, both session+IP — a first for
  this codebase's limiter usage; `checkRateLimit` called twice with distinct namespaces so the
  windows don't collide) → a manual `redirect:'manual'` follow loop capped at 5 hops, each hop
  re-entering the same SSRF check (closes a redirect-based SSRF bypass a naive `redirect:
  'follow'` would open) → a streamed `ReadableStream` relay with a byte-count cutoff (100MB
  default): a declared `content-length` over the cap rejects cleanly before any byte streams;
  an undeclared/chunked response that exceeds the cap mid-stream errors the stream (the
  cleanest signal achievable without buffering Worker-side to inspect it first — noted as an
  inherent property of "streamed, never buffered", not a gap). No client-supplied headers ever
  reach the target (the outbound fetch carries only `{method:'GET', signal}`, nothing from the
  inbound request). Content-free metrics via the existing `shared/counters.ts` sink, extended
  with a new `CorsRelayMetric` shape (outcome/size/latency only, same discipline as the other
  three endpoints' metrics — never a URL). New `CorsRelayErrorCode` wire type in `protocol.ts`.
  Wired into `worker.ts` (`buildCorsRelayEnv`, `/cors-relay` dispatch — this endpoint's own
  405-on-non-GET check lives inside the handler itself, not worker.ts's pre-check like the
  other two routes, specifically so it's exercised by this file's own test suite rather than
  only reachable through untested `worker.ts`), `bindings.ts` (`CORS_RELAY_KILL_SWITCH`), and
  `wrangler.toml` (root + `[env.staging]`, matching the non-inheritable-keys pattern the other
  kill switches already established).
  **Verification:** `cors-relay.test.ts`, 26 cases (pass-through + status forwarding, header
  non-forwarding, method rejection, malformed input, 8 SSRF cases including
  `169.254.169.254`/IPv6 `::1`, redirect-following allowed/blocked/too-many, both response-cap
  paths, both rate-limit windows including the forged-session-token/per-IP-floor case, the kill
  switch, content-free counters). Two real test-harness bugs caught and fixed while writing
  these (not production bugs): the mock `fetchTarget` initially reused one `Response` object
  across multiple calls (a body stream can only be read once — surfaced as a spurious 502 on
  the second of three calls in the per-IP-floor test) and a counters test checked the sink
  before consuming the streamed body (the metric only lands once the stream actually drains,
  same as a real client). Full suite **904 → 940** (+36 incl. the 26 new), `tsc -b` / `oxlint` /
  `vite build` all clean. Supplemented by a live local `wrangler dev` smoke pass (real
  Miniflare + real DO binding): `GET /health` → 200; `GET /cors-relay?url=http://10.0.0.1&…` →
  `400 {"error":"blocked"}`; `GET /cors-relay?url=https://example.com&…` → the real page body,
  streamed through; `POST /cors-relay?...` → `405 {"error":"bad-request"}`.
  **Not run this session — the one open Definition-of-done criterion:** the public-ship gate
  ("rate limits active satisfied on staging") needs a live `wrangler deploy --env staging` +
  audit, the same shape as the `ai-router` burst audit that produced ADR-006's rate-limiter
  correction. Held deliberately: a real deploy to shared Cloudflare infrastructure, not done
  autonomously without confirmation.
  **Next concrete action:** confirm and run the staging deploy + live rate-limit audit to close
  `09-edge/02-cors-relay`'s box; then `09-edge/03-vault` (Opus) — which also closes
  `06-ai/02-modes-byok`'s one remaining open criterion (the vault round-trip).
  **Blocker:** none — the staging step is a deliberate pause for confirmation, not stuck.

- **2026-07-23** — **`09-edge/02-cors-relay` closes: staging deploy done and the live rate-limit
  audit confirms the DO-backed limiter enforces correctly — box now checked, `▶` moves to
  `09-edge/03-vault`.** Human confirmed the deploy this session (deliberate pause from the entry
  above, resolved). `CLOUDFLARE_API_TOKEN` (`app/.env.local`) + `npm run edge:deploy:staging` →
  `datascope-edge-staging.justinclarke.workers.dev`, `RATE_LIMITER` DO binding recognized, bundle
  40.76 KiB. Live smoke: `/health` → 200; SSRF block on `http://10.0.0.1` → `400 {"error":"blocked"}`;
  non-GET → `405 {"error":"bad-request"}`; pass-through of `https://example.com` → real body, 200.
  **The burst audit itself hit a false alarm first, worth recording since it shaped the
  methodology:** two early bursts (22 requests spaced ~1.5–2s apart via `sleep 1` plus curl
  overhead, and 30 requests back-to-back) both returned 200 for every request — looked exactly
  like the KV under-count bug ADR-006 found on `ai-router`. Ran `wrangler tail --env staging` live
  against a repeat to see what the DO was actually doing, and the tail log resolved it
  immediately: both suspect bursts spanned **two** 60s fixed-window buckets (an `Alarm` fired
  mid-burst marking the rollover), splitting ~22–30 requests across two windows so neither bucket
  alone crossed 20 — a **test-methodology artifact** (burst too slow / badly timed against the
  window boundary), not a limiter bug. A clean, fast, boundary-safe burst (23 requests, all
  landing inside one window, tail-confirmed via `RateLimiterDo.increment` firing on every request)
  gave the real signal: requests 1–20 → 200, 21–23 → genuine `429 {"error":"rate-limited"}` with
  `retry-after: 60`, exactly at the declared 20/min/session ceiling. A fresh session id from the
  same IP immediately after (well under the 60/min per-IP floor at that point) still passed —
  confirms the dual-keyed shape is live, not just the session ceiling. Matches the `ai-router`
  precedent shape (DO fixes the KV staleness class of bug) — this is the first time that DO path
  was exercised by a *second* endpoint's own namespace (`cors-relay-min`/`cors-relay-hour`
  vs. `ai-router`), confirming the shared-limiter design doesn't collide across endpoints.
  **Not separately live-burst-tested:** the per-hour window (200/session, 3600s — a live burst
  would take too long to be worth it; unit-tested, and the per-minute window's live pass exercises
  the identical code path with a different constant) and the kill switch (flipping it live would
  require a second deploy disrupting the audit in progress; unit-tested, no live-only risk like
  the rate limiter's KV-vs-DO consistency class had).
  **Docs:** no master/ADR change — ADR-006's existing DO-limiter decision already covers this;
  this is the second endpoint proving it, not a new decision. Leaf `09-edge/02-cors-relay.md`'s
  Definition of done — the one outstanding line — closed with this evidence (no acceptance
  criteria reworded; all were already `[x]` from local verification).
  **Next concrete action:** `09-edge/03-vault` (Opus) — also closes `06-ai/02-modes-byok`'s
  remaining open criterion (the vault round-trip).
  **Blocker:** none.

- **2026-07-23** — **`09-edge/03-vault` built and unit/local-verified — the opt-in half of D9
  custody works end to end from the settings checkbox: "Remember my key" now stores a bearer key
  server-side (encrypted, idle-expiring, deletable) and the browser keeps only a reference. The
  box stays open on one criterion (a live staging deploy, which needs two account resources),
  `▶` stays.**
  **Three properties are structural rather than conventions**, which is the substance of this
  build: (1) the endpoint has **two** client operations, store and delete — resolution is an
  in-process function the router calls, so no response shape on `/vault` can carry key material
  back; (2) records are AES-GCM ciphertext under a Worker-held secret, and a deploy missing that
  secret (or the KV binding) answers typed `unavailable` rather than storing a key in the clear
  — the vault fails closed, never quietly weaker; (3) session scoping *is* the storage key
  (`vault:{session}:{ref}`), so a reference presented under another session addresses nothing
  and there is no comparison to forget to write. Entropy lives in the 256-bit reference; the
  session id is client-minted (§23.1's server-minted tokens remain ADR-006's, unbuilt) and the
  code treats it as a scoping key, never a second secret.
  **A durable, vault-specific session id was the one genuinely open design question.** The id
  every other edge call carries is per-page-load, so it cannot address a key across tab closes —
  which is the entire feature. Resolved by minting a durable id **only on the first store**: a
  user who never opts into the vault gains no durable identifier at all, and opting in is
  already opting into a server-side association. Both halves (`vaultRef` + `vaultSession`) are
  required to resolve. Recorded master-first in §5.2.
  **A test caught a real coupling bug before it shipped.** Refresh-on-resolve was written with a
  fixed 24h threshold; with any TTL tuned below a day that silently stops refreshing, turning
  "expires after 90 days *without use*" into a hard expiry. It is now a *fraction* of the TTL
  (1% ≈ 21.6h on the 90-day default — still ~4 writes/year per credential instead of one per
  question).
  **Also decided and documented:** a router-internal resolve is not a vault "operation" and does
  not spend the 10/session/hour budget — it rides an already-rate-limited ai-router call, and
  counting it would cap a remembered-key user at ten questions an hour (master §11.2). The
  3-credential cap is a hygiene bound, not the anti-stuffing control — KV's listing is eventually
  consistent, so the strongly consistent DO-backed op limiter is what actually holds. A vaulted
  record's own provider is authoritative, so a stored key can't be redirected at another provider
  by someone holding only the reference. A failed *delete* deliberately leaves the checkbox
  checked: dropping the reference locally would strand a real stored key with nothing left to
  address it.
  **KV returns to the edge, in the role it is good at.** ADR-006's counter correction ended with
  "the edge Worker no longer uses KV at all"; that line is now corrected there, not contradicted
  — a stale *count* is a wrong number, while a stale *value* read is a brief typed "not found
  yet" the client retries, and KV's native `expirationTtl` is exactly the idle-TTL primitive.
  The edge now runs both backends split by need: DO for counts, KV for values with a TTL.
  **Verification:** suite **940 → 995** (+55: 29 in `edge/vault.test.ts`, 5 vault cases in
  `byok.test.ts`, 6 client-service, 8 settings-panel including the §22 storage row — after
  remembering a key no localStorage entry contains it while the reference does — 3 ladder, 5
  status-line, plus one existing test re-pointed); `tsc -b` / `oxlint` / `vite build` clean.
  Supplemented by a live local `wrangler dev` pass through `worker.ts`'s own wiring (real
  Miniflare KV + DO limiter): store → ref; cross-session delete → 404; the cap → `200 200 409`;
  non-POST → 400; delete → `{"deleted":true}` then 404; the op limiter → 429 from the 11th, with
  a fresh session unaffected. **Custody audit, the piece this build owed alongside the
  ai-router's:** after a live store, the key appears in zero Worker log lines and zero bytes of
  the on-disk KV store (`grep -ri` over `.wrangler/` — the record is ciphertext), and a record
  written under a rotated secret does not resolve.
  **Docs, master-first:** DATASCOPE.md §5.2 (the durable vault session id), §11.2 (resolves not
  counted against vault ops; the lazy-refresh and cap-vs-limiter notes) — no Decision-Record
  edit, D9's custody choice is unchanged and this realizes it. Mirrored into ADR-006 (a new
  "KV's remaining role" section correcting the stale line, and the routing-layout interim fact:
  four of five paths now share one Worker), `foundations/privacy-model.md`,
  `build/09-edge/README.md`, `build/09-edge/03-vault.md` (criteria checked with evidence, Files
  and Test-plan rewritten to the built shape, design notes, the outstanding staging line), and
  `build/06-ai/02-modes-byok.md` (its vault criterion now checked, custody + seam notes updated).
  **Model note:** built on **Opus** per the row's model column.
  **Next concrete action:** confirm and run the staging deploy to close `09-edge/03-vault`'s box
  — it needs `wrangler kv namespace create VAULT_KV` (then uncomment the two binding blocks in
  `wrangler.toml`, root + `[env.staging]`) and `wrangler secret put VAULT_SECRET --env staging`,
  followed by a live round-trip + custody audit against staging. Then
  `09-edge/04-persistence-endpoints` (Sonnet). **Correction to the previous entry's
  expectation:** `06-ai/02-modes-byok` does *not* check on this build — its vault criterion is
  now closed, but the re-pointed Ollama criterion (a live run through API mode's key/endpoint
  field) is still open, and is now that row's only remaining blocker.
  **Blocker:** none — the staging step is a deliberate pause for confirmation, not stuck.

- **2026-07-23** — **`09-edge/03-vault` closes: staging deploy done, live round-trip and custody
  audit both pass — box checked, `▶` moves to `09-edge/04-persistence-endpoints`.** Human
  confirmed the deploy this session ("close it up" — the deliberate pause above, resolved).
  **Two namespaces, not one.** `wrangler kv namespace create VAULT_KV` plus a separate
  `--env staging` one (`staging-VAULT_KV`), against the config's own comment, which assumed the
  staging block would repeat the root id: a shared namespace would let the staging Worker
  resolve production vault records, and the isolation costs nothing. `wrangler.toml`'s two
  binding blocks are now uncommented with their distinct ids and the comment corrected.
  `VAULT_SECRET` was set with `wrangler secret put --env staging` from `openssl rand -base64 32`
  piped straight in — never written to a file, never echoed. Redeploy: 48.90 KiB, `VAULT_KV` +
  `RATE_LIMITER` both bound.
  **Live audit (HTTP-level against the deployed Worker, not through the browser UI — the
  settings-UI path was verified locally last session):** store → ref; cross-session delete →
  `404 not-found`; non-POST → `400 bad-request`; delete → `{"deleted":true}` and the repeat →
  `404`, so the delete is verifiable against production KV and not just Miniflare; the op
  limiter → clean `200`s through op 10 and `429 rate-limited` from op 11, with a fresh session
  id from the same IP unaffected; every record's TTL lands ~90 days out.
  **Custody audit — the piece this build owed.** Every record in the namespace (13) dumped via
  `wrangler kv key get`: all AES-GCM ciphertext, zero occurrences of the stored key, of the
  string `sk-`, or of the provider name across the entire dump. A `wrangler tail` capture
  spanning a store, a delete, and a malformed request: zero occurrences of the key across
  request lines, DO events, logs, and exceptions.
  **The one real finding: the credential cap is *eventual* against real KV, by a much wider
  margin than the design note assumed.** A back-to-back burst seated **5** credentials under a
  cap of 3; spacing stores 3s apart still let all four through; the 4th was rejected
  `409 cap-reached` only after a **~120s** settle. KV's prefix *listing* lags materially longer
  than the ≤60s value propagation ADR-006 reasoned about. This does not change the design — the
  cap was already documented as hygiene with the strongly consistent op limiter (10/session/hour)
  as the actual anti-stuffing ceiling, and that limiter held exactly — but "momentarily one over
  the cap" understated the window, so master §11.2 and ADR-006 now carry the measured numbers.
  **A methodology note, since it wasted a pass:** the first audit run returned route-level
  `404 not-found` for `/vault` on some requests and skewed the limiter count — the new version
  was still propagating across colos and older ones had no `/vault` route. Re-running after it
  settled gave the results above. Same shape as the cors-relay window-boundary false alarm:
  suspect a just-deployed edge before suspecting the code.
  **Docs, master-first:** DATASCOPE.md §11.2 (the measured cap slop), mirrored into ADR-006's
  KV-role section and `build/09-edge/03-vault.md` (the cap criterion's evidence, and the
  Definition of done's outstanding staging line now closed with this audit).
  **Next concrete action:** `09-edge/04-persistence-endpoints` (Sonnet) — the last `09-edge`
  row. `06-ai/02-modes-byok` still waits only on the re-pointed Ollama live run.
  **Blocker:** none.

- **2026-07-23** — **`09-edge/04-persistence-endpoints` built and verified against a real (local)
  R2 binding — the Worker side of R2 save/share works end to end: save a dataset buffer, get it
  back by token, delete only with the ownership proof returned at save time. The box stays open
  (`▶` stays) on three things that need real Cloudflare account resources this session
  deliberately did not create: the R2 bucket itself, the Terraform-owned lifecycle TTL rule, and
  a staging deploy for a real cross-device share URL.**
  **Two design decisions, both forced by a real R2 API constraint found live, not in unit
  tests.** `R2Bucket.put()` requires its value stream to have a *known length* — the runtime's
  own error, hit against a real local Miniflare R2 binding: `"Provided readable stream must have
  a known length (request/response body or readable half of FixedLengthStream)"`. The first
  implementation wrapped `request.body` in an app-level byte-counting passthrough stream (the
  same shape cors-relay uses on its response side) specifically to catch a lying
  `Content-Length`; that wrapper is exactly what R2 rejects, since authoring a new `ReadableStream`
  strips the known-length property even when everything it reads comes from a request body. Fixed
  by passing `request.body` to `store.put` **unwrapped** — which turns out to be the more correct
  defense, not a weaker one: the HTTP layer already frames the body to its declared
  `Content-Length` before the handler runs, so a body shorter or longer than declared fails as a
  transport-level error before R2 even sees it. The declared-size pre-check (`> 100MB` →
  `too-large` before any streaming starts) is still app logic; the actual-vs-declared match is
  the runtime's, not re-implemented here — and the in-memory test store can't simulate an
  R2-specific contract, so that defense is verified by the live run, not by the unit suite.
  **Second, a shared-infra extension:** the 300MB/session/day aggregate save cap sums *bytes*,
  which the existing dual-keyed limiter (request-counting only) couldn't express.
  `RateLimiterDo.increment`/`rateWindow.ts`'s `stepWindow` gained an optional `amount` parameter
  (default 1 — every existing caller, ai-router's quota and cors-relay's dual window, is
  unaffected) and `shared/limiter.ts`'s `incrementSessionQuota` passes it through. Fixed a latent
  bug the extension exposed rather than caused: the DO's "did a fresh window just open" check was
  `count === 1`, which only ever held because every prior caller's amount was 1 — corrected to a
  direct bucket-number comparison, since a byte-summing key could otherwise never schedule its
  cleanup alarm.
  **Delete's ownership-proof shape follows vault.ts's established precedent exactly:** the token
  (the link — anyone holding it can `get`) is separate from the `deleteToken` (returned once at
  save time, stored only as a SHA-256 hash in R2 custom metadata); a wrong or missing proof
  answers the same typed `not-found` as an unknown token, so a dead/foreign object never reports
  *why*. Save/get carry the object as a raw body, not JSON (a dataset buffer can run to the
  100MB cap; base64-in-JSON would inflate that by a third for nothing); control fields
  (`sessionId`, `token`, the proof) travel as query params, and delete stays a POST + `op=delete`
  query param rather than the DELETE method, so the Worker's fixed GET/POST CORS allow-list
  needed no change.
  **Verification:** suite **995 → 1015** (+20 in `persistence.test.ts`, +2 in `rateWindow.test.ts`
  for the `amount` parameter); `tsc -b` / `oxlint` / `vite build` clean; both
  `wrangler deploy --dry-run` (root and `--env staging`) bundle cleanly with the new R2 binding
  listed. **Live local `wrangler dev` pass (real Miniflare R2 + the real DO rate limiter, not the
  test store):** save → get round-trips exact bytes and content-type; unknown-token get → `404`;
  forged-proof delete → `404` with the object surviving; correct-proof delete →
  `{"deleted":true}` then `404`; the kill switch → `503` on all three operations. **Custody
  audit** against the local Miniflare R2 metadata database: every record holds only a
  `deleteTokenHash` (SHA-256 hex) — the raw delete token appears in zero metadata rows and zero
  object blobs.
  **Not live-burst-tested at the real launch numbers** (10 saves/session/day, 100MB/object,
  300MB/session/day) — would mean transferring hundreds of MB just to trip a counter; the
  underlying DO window primitive this reuses unchanged is already live-audited twice (ai-router's
  daily quota, cors-relay's per-minute/per-hour pair), and this build's own addition (the
  `amount` parameter) is covered by `rateWindow.test.ts`'s byte-summing cases plus the live round
  trip exercising the real code path end to end.
  **Docs, master-first:** no master/Decision-Record edit — §12.3's spec (endpoints, retention,
  abuse-control numbers) already covers this build; nothing here revises it, only realizes it (R2
  lifecycle enforcement and the Terraform tree remain as master already described them, D19/
  §23.3). Leaf `build/09-edge/04-persistence-endpoints.md` rewritten to the built shape: Files
  section documents the shared-infra `amount` extension; acceptance criteria checked with
  evidence where the local live run supports it, left open with a named reason otherwise (TTL/
  lifecycle — infra doesn't exist yet; cross-device round-trip and the abuse-report `mailto:` —
  need staging and are partly client-scope); Test plan records the run; Definition of done names
  the three provisioning steps still open.
  **Next concrete action:** provisioning, not more code — confirm and run: `wrangler r2 bucket
  create datascope-persistence` (+ `datascope-persistence-staging`), the Terraform-owned
  lifecycle TTL rule (this repo's first load-bearing use of an `infra/` tree — D19/§23.3's
  sequencing point that Terraform becomes load-bearing at v0.5 is now), and a
  `wrangler deploy --env staging` to close the cross-device criterion. That closes
  `09-edge/04-persistence-endpoints` (the last `09-edge` row) and `09-edge/README.md`'s own exit
  criteria (all four endpoints on staging). After that: `07-connectivity/01-api-tier1-fetch`
  (Sonnet) — `06-ai/02-modes-byok` still separately waits only on the re-pointed Ollama live run.
  **Blocker:** none — the provisioning steps are a deliberate pause for confirmation (real
  Cloudflare account resources), not stuck.

- **2026-07-23** — **R2 buckets provisioned for `09-edge/04-persistence-endpoints`: `datascope-
  persistence` and `datascope-persistence-staging` both created (`wrangler r2 bucket create`),
  matching the isolation `wrangler.toml` already assumed.** One real gap found and fixed along
  the way, not a code issue: the `CLOUDFLARE_API_TOKEN` in `app/.env.local` initially lacked the
  Workers R2 Storage:Edit scope (`10000` auth error on the first create attempt) and the account
  itself hadn't enabled R2 yet (`10042` after the scope was added) — both fixed by the human via
  the dashboard, confirmed live after each fix. Box stays open (`▶` stays) — the bindings now
  resolve, but the Terraform lifecycle TTL rule and the staging deploy are still outstanding.
  **Next concrete action:** author the `infra/` tree's R2 lifecycle rule (Terraform not yet
  installed on this machine), then `wrangler deploy --env staging`.
  **Blocker:** none — Terraform install/authoring is next, paused for confirmation per this
  item's established provisioning pattern.

- **2026-07-23** — **`infra/` Terraform tree authored — R2 lifecycle rule now exists as code,
  closing the design half of `09-edge/04-persistence-endpoints`'s last open criterion. `▶` stays:
  three provisioning steps remain and each needs real Cloudflare account resources or a local
  tool install this session deliberately didn't do without asking first.**
  **ADR-009 decided, from evidence, not left pending any longer.** The stub asked one question:
  R2 S3-compatible backend (native lockfile locking) vs. Terraform Cloud free tier. Checked
  Cloudflare's own R2 API docs and Terraform's S3-backend docs directly rather than assuming:
  Terraform's native `use_lockfile` (GA 1.10, Nov 2024) needs only a conditional `PutObject`
  (`If-None-Match`) to write a `.tflock` object — no DynamoDB-equivalent table — and R2's S3 API
  documents exactly that conditional-write support. (A real but irrelevant caveat surfaced
  alongside it: R2 has no S3 Object Lock/WORM support — a different, compliance-retention
  feature unrelated to what `use_lockfile` actually uses; worth naming so a future reader doesn't
  reopen this as a blocker.) Decided **R2-backed state** — one Cloudflare account to reason
  about, zero external dependency, matching this project's existing KV/R2 isolation-by-environment
  pattern — over Terraform Cloud. Human confirmed the recommendation via a clarifying question
  before it was recorded, same as the cors-relay pagination and vault session-id decisions above.
  **`infra/` bootstrapped** (`app/infra/`, sibling to `app/edge/`): `providers.tf` (Cloudflare
  provider + the R2-backed `backend "s3"`, `use_lockfile = true`, `required_version >= 1.10.0`),
  `variables.tf`, `r2.tf` (one parameterized `cloudflare_r2_bucket` + `cloudflare_r2_bucket_lifecycle`
  pair, 30-day `Age`-type delete transition — the same number §12.3 discloses), and
  `envs/{dev,prod}.tfvars` (bucket name is the one axis that differs; account id and R2
  backend credentials are supplied via `TF_VAR_…`/`-backend-config` at apply time, never
  committed, §23.1). Both existing buckets (`datascope-persistence`,
  `datascope-persistence-staging`, provisioned in the prior session) are adopted via Terraform
  `import` blocks rather than recreated. `.gitignore` extended for `infra/.terraform`,
  `*.tfstate`, and the backend-config file — `.terraform.lock.hcl` deliberately left committed
  (provider hashes, same reasoning as `package-lock.json`).
  **One real bug caught before it shipped, not by a test — by re-reading Terraform's own docs
  while writing `providers.tf`:** the first draft interpolated `var.cloudflare_account_id` into
  the backend's `endpoints` block; backend blocks are parsed before the rest of the configuration
  and cannot reference variables at all, so that block would have failed at `terraform init`
  outright. Fixed by moving the account-specific endpoint (and the R2 credentials) to partial
  configuration (`-backend-config=backend.hcl`, gitignored) supplied at init time instead of the
  checked-in file — which is also the more correct shape per §23.1 (nothing account- or
  credential-specific belongs in a committed `.tf` file).
  **Docs, master-first:** no `DATASCOPE.md`/Decision-Record edit — §23.3 already specced this
  fully; ADR-009 is a separate mechanism explicitly meant to be filled in from evidence once
  v0.5 infra work starts (D18), not a D-record entry, so no human re-authorization was needed to
  write it. `architecture/adr/009-terraform-state-backend.md` rewritten from stub to decided
  (Decision/Alternatives/Consequences/Spike-evidence sections, with links). Mirrored into
  `foundations/infrastructure.md` (State-backend bullet) and `build/09-edge/04-persistence-endpoints.md`
  (Files section, the TTL acceptance criterion, a stale "bucket doesn't exist yet" line fixed
  in the same pass since the buckets were in fact provisioned last session, and Definition of
  done rewritten to name exactly what's left).
  **Next concrete action — three provisioning steps, none blocked on a design question:**
  (1) install Terraform locally (not present on this machine); (2) `wrangler r2 bucket create
  datascope-terraform-state` + a bucket-scoped R2 API token, then `terraform init
  -backend-config=backend.hcl` and `terraform apply -var-file=envs/dev.tfvars` (repeat for
  `prod` in its own workspace) to actually land the lifecycle rule; (3) `wrangler deploy --env
  staging` to close the cross-device share-URL criterion. Confirm before running any of these —
  real Cloudflare account resources and the first `apply` against them, same pause pattern as
  every other provisioning step in this section.
  **Blocker:** none — paused for confirmation before touching real infrastructure, not stuck.

- **2026-07-23** — **The three provisioning steps left open on `09-edge/04-persistence-endpoints`
  are done: Terraform installed, both environments' R2 lifecycle rules applied for real, and a
  staging deploy serving a live cross-device save/get/delete round trip. `▶` moves to
  `07-connectivity/01-api-tier1-fetch`; the persistence-endpoints box stays open on one
  deliberately-deferred criterion (below).**
  **Terraform (1.15.8, via the `hashicorp/tap` — plain `brew install terraform` no longer works,
  HashiCorp pulled it from Homebrew core over licensing) installed; `datascope-terraform-state`
  bucket created (`wrangler r2 bucket create`).** `terraform init -backend-config=backend.hcl`
  against the R2 S3 backend succeeded; a `dev` and `prod` `terraform workspace` were created so
  the two environments' state never collide (matching `r2.tf`'s own comment). `terraform apply`
  ran clean in both — `dev` imported `datascope-persistence-staging`, `prod` imported
  `datascope-persistence`, each creating its `expire-after-30-days` lifecycle rule with 0 drift.
  Confirmed live with a direct R2 API read on both buckets afterward (not just trusting
  Terraform's own state): `enabled: true`, `Age` transition, `maxAge: 2592000`.
  **A credential design question came up mid-session, resolved and worth recording since it
  isn't obvious: does Terraform's R2 state backend need its own separate API token, or can it
  share the account's general-purpose one?** Answer: technically one token can do both — any
  Cloudflare Account API Token that includes an R2 permission group gets a derived S3-style
  Access Key ID/Secret Access Key alongside its bearer value, so the same token `wrangler` and
  the Cloudflare provider already use *could* supply `backend.hcl` too. This project uses **two**
  anyway, deliberately, per `providers.tf`'s own least-privilege comment (§23.1): the
  `backend.hcl` credential is scoped to R2 read/write on `datascope-terraform-state` only, kept
  separate from the account's general token (Entire Account: Workers R2 Storage/KV Storage/
  Scripts/AI) everything else uses — so a leak via a state file, CI log, or plan output caps at
  one bucket rather than the whole account. Human confirmed this tradeoff explicitly before
  proceeding ("as long as it's documented, move on").
  **One real incident while setting this up, logged so the next session doesn't repeat it:**
  attempting to reuse/narrow the account's *existing* general-purpose token in place (editing
  its policy down to test an R2-only scope, then deleting what looked like a stale duplicate)
  came within one step of leaving the project with no working `CLOUDFLARE_API_TOKEN` at all —
  every `wrangler`/Terraform call started failing with an invalid-token error, and enough retries
  while diagnosing it tripped Cloudflare's own auth-failure lockout (`code 10502`, temporary).
  Recovered by creating a fresh token with the original full permission set and updating
  `.env.local`, then a **third**, separately-named token (`datascope-tfstate`-shaped, R2-only on
  the one bucket) for `backend.hcl`. **Rule for future sessions: always create a new,
  separately-named token for a new credential need — never edit an existing token's policy in
  place**, even to "just test" a narrower scope.
  **`wrangler deploy --env staging` redeployed clean** (54.78 KiB, all bindings present
  including `PERSISTENCE_BUCKET` → `datascope-persistence-staging`); `/health` → 200. A live save
  → get → delete round trip against the public staging URL (not `wrangler dev`): save → token +
  deleteToken; get → the exact bytes back; a forged delete proof → `404` with the object intact;
  the correct proof → `{"deleted":true}`; the repeat get → `404` — the same shape a second
  device opening the share link would see, closing the cross-device acceptance criterion.
  **Docs:** no master/Decision-Record edit — this realizes what §12.3/§23.3/ADR-009 already
  specced, doesn't change it. `build/09-edge/04-persistence-endpoints.md` rewritten: the
  cross-device acceptance criterion checked with the staging-round-trip evidence above; the
  30-day-TTL criterion **stays unchecked on purpose** — the infrastructure is confirmed live via
  direct API read, but actually observing an object expire needs either waiting out the real
  30 days or standing up a separate short-TTL rule/bucket to watch a deletion fire, neither done
  this session; Definition of done rewritten to record all this plus the credential-design note.
  **Next concrete action:** `07-connectivity/01-api-tier1-fetch` (Sonnet). `06-ai/02-modes-byok`
  still separately waits only on the re-pointed Ollama live run; `09-edge/04-persistence-
  endpoints`'s box waits only on the short-TTL expiry observation, whenever a session wants to
  spend the time on it.
  **Blocker:** none.

- **2026-07-23** — **Short-TTL live-expiry observation for `09-edge/04-persistence-endpoints`
  started (not yet closed — this needs a wait, not more code).** Rather than waiting out the real
  30-day production rule, added a scratch lifecycle rule directly to the real
  `datascope-persistence-staging` bucket via `wrangler r2 bucket lifecycle add
  datascope-persistence-staging ttl-test-scratch ttl-test/ --expire-days 1` — deliberately done
  through `wrangler`, not `infra/r2.tf`, so this throwaway verification rule never enters the
  Terraform-owned config or risks being applied against the production `datascope-persistence`
  bucket. Uploaded a real remote test object at `ttl-test/marker.txt` (`wrangler r2 object put
  --remote`; confirmed downloadable byte-exact after upload). Cloudflare's lifecycle docs state
  objects are typically swept within ~24h of crossing their configured age, not instantly, so with
  a 1-day `max_age` the object is expected gone sometime in **2026-07-24T09:05:33Z –
  2026-07-25T09:05:33Z**, not immediately and not in 30 days.
  **Next concrete action:** in a future session (dated 2026-07-24 or later), run `wrangler r2
  object get datascope-persistence-staging/ttl-test/marker.txt --remote` — a 404/not-found
  confirms the sweep fired and closes this criterion; update
  `build/09-edge/04-persistence-endpoints.md`'s TTL acceptance criterion with that evidence and
  check `09-edge/04`'s box. Either way, clean up the scratch rule afterward with `wrangler r2
  bucket lifecycle remove datascope-persistence-staging ttl-test-scratch` (and delete the marker
  object if the sweep hasn't already removed it) so it doesn't linger on the staging bucket.
  Meanwhile the `▶` stays at `07-connectivity/01-api-tier1-fetch` (Sonnet) — this observation
  doesn't block it.
  **Blocker:** none — waiting on Cloudflare's own sweep, not stuck.

- **2026-07-23** — **`07-connectivity/01-api-tier1-fetch` built and live-verified against real
  public APIs — the zero-infra direct-fetch path works end to end: paste a URL, get a
  registered/profiled table, with GitHub-style `Link` header pagination auto-followed and
  size-tier gating on the accumulated response. Box stays open (`▶` stays) on two named
  criteria, neither a gap in this session's work.**
  **New module `src/services/apiIngestion.ts`** — pure fetch/pagination/size-tier logic
  (`fetchApiSource`, `tableNameFromUrl`), deliberately independent of DuckDB so it's
  unit-testable with an injected `fetchImpl` (mirrors `services/vaultClient.ts`'s own
  dependency-injection shape) rather than needing the live browser `ingestion.test.ts` already
  notes its DuckDB-touching half requires. `services/ingestion.ts` gained `loadUrl` as a
  **separate** entry point from `loadDataset` rather than a third branch on its `File | string`
  union — a URL and a sample id are both bare strings with no shared shape to dispatch on, and
  the two already arrive from different UI controls (`UrlInputForm` vs `SamplePicker`) that
  know which is which. `loadUrl` calls `fetchApiSource` then hands the buffer to the same
  `ingestBuffer`/registry path file upload uses — no changes to that path at all.
  **A real Fetch API constraint shaped the CORS-handling design, found while writing the code,
  not by a test:** `fetch()` rejects with an opaque `TypeError` for CORS failures, DNS
  failures, and offline networks alike — the spec deliberately gives JS no way to tell these
  apart (no status, no headers, nothing reaches the page). §7.4 calls CORS "the most common
  blocker, ahead of auth," so a bare fetch rejection is classified as a typed `cors-suspected`
  `IngestionError` (presumptive, not confirmed) rather than attempting to actually detect CORS
  specifically, which the platform makes impossible. `IngestionError` gained an optional `code`
  field to carry this — the seam Tier 2 (`02-api-tier2-relay`, next in sequence) plugs into to
  retry via the relay instead of terminating in an error.
  **Pagination follows GitHub's `Link: rel="next"` header** (RFC 5988) up to a 20-page cap —
  chosen to match the Tier-2 relay's own per-ingestion-action cap (§7.4) so the cascade behaves
  the same regardless of which tier lands the pages. Per-page bodies are parsed and merged into
  one JSON array only when more than one page is fetched; a single-page response's raw bytes
  pass through unchanged (no parse/reserialize round-trip, preserving exact number formatting).
  A body-level cursor (any pagination scheme other than the Link header) has no generic
  detection — ADR-006's own research already found GitHub is the only one of the three v0.5
  token/no-auth platforms (D34) with a generically follow-able scheme at all — so the leaf
  spec's "manual load more pages" fallback for that case is **not built**, named as a deliberate
  scope gap rather than a speculative control with no real detection behind it.
  **Size tiers are re-checked after every page** against the running byte total (an API's total
  size is generally unknown ahead of pagination, unlike a file's known `File.size`): `refuse`
  throws before any JSON parse is attempted; `sampled` stops the pagination loop early — no
  reason to keep fetching pages that would just be discarded past `SAMPLE_ROW_LIMIT`; `warn`
  surfaces the same footprint banner the file-drop path already shows, computed post-hoc since
  the size isn't known upfront the way a file's is.
  **Verification:** suite **1015 → 1030** (+15 in `apiIngestion.test.ts`: URL validation,
  single-page array/non-array bodies, Link-header pagination + merge, the `maxPages` cutoff,
  the sampled-tier early-stop, all five `ApiFetchError` codes, `tableNameFromUrl`); `tsc -b` /
  `oxlint` / `vitest run` (1030 passed) / `vite build` all clean. **Live Playwright pass against
  the real dev server and real public endpoints** (no mock API server — `chromium-cli` wasn't
  available in this environment, so the npx-cached `playwright` package drove a real headless
  Chromium directly instead): `https://api.github.com/repos/duckdb/duckdb/labels` → 1 table, 31
  rows, profiled, Blueprint landing rendered; `https://api.github.com/repos/duckdb/duckdb/
  issues?per_page=5` → telemetry's `pages` stat observed growing 1→2→3 mid-fetch, final table
  landed at exactly 100 rows (20 pages × 5/page — a real, unplanned confirmation that the
  `MAX_PAGES` cap engages correctly against a genuinely multi-page live API); `https://
  example.com/` (real, genuine CORS block, no `Access-Control-Allow-Origin`) → browser console
  shows the real CORS block, UI renders "Couldn't reach this URL directly — it may be blocking
  cross-origin requests," table count unaffected — no half-registered table, no hang, no
  unhandled exception.
  **Docs, master-first:** no master/Decision-Record edit — §7.4 already specced this fully;
  nothing here revises it, only realizes it. Leaf `build/07-connectivity/01-api-tier1-fetch.md`
  rewritten to the built shape: Files/Dependencies corrected (the Tier-2-client dependency line
  was backwards — 02 depends on 01, per 02's own Dependencies section, not the other way
  round), acceptance criteria checked with evidence, the two open criteria named with reasons,
  Test plan and Definition of done rewritten.
  **Next concrete action:** `07-connectivity/02-api-tier2-relay` (Sonnet) — closes this item's
  one open Tier-2-handoff criterion by having the `cors-suspected` code retry through the relay
  client this build's `apiIngestion.ts`/`loadUrl` seam is already shaped for, rather than
  terminating in an error.
  **Blocker:** none.

- **2026-07-23** — **`07-connectivity/02-api-tier2-relay` built — the client half of the Tier-2
  CORS relay (Worker side, `09-edge/02-cors-relay`, already deployed/closed). Box checked on
  `07-connectivity/01-api-tier1-fetch` above (all five of its own acceptance criteria now hold,
  including the Tier-2 handoff this item closes); `▶` moves to this item and stays here — one
  criterion of its own needs a real browser + DuckDB to close, unavailable in this session.**
  **New module `src/services/relayClient.ts`** — `fetchViaRelay`, one GET per page through the
  relay (`url`+`sessionId` as query params, no body, mirrors `vaultClient.ts`'s injected-`fetchImpl`
  DI shape). Classifies the relay's own 429/503 control-plane responses as a typed
  `RelayFetchError('rate-limited' | 'paused', …)`; every other status (400/502/504, or a target
  error the relay passed through verbatim) is left as an ordinary `Response` for the existing
  `http-error` classification to handle, since the relay forwards a passed-through target status
  verbatim and there's no reliable way to distinguish "relay's own 502" from "target returned
  502" beyond the two fixed-status control signals (§7.4's acceptance criteria only asks the
  client to distinguish those two anyway). Deviates from this leaf doc's original "Files" sketch
  (`src/features/ingestion/`) in favor of the convention every other edge-calling client in this
  codebase already follows (`vaultClient.ts`/`synthesis.ts`/`cloudProvider.ts`, all in
  `src/services/`) — noted in the doc, not treated as silent scope creep.
  **`src/services/apiIngestion.ts`'s pagination loop is now shared, not duplicated:** extracted
  into `accumulatePages`, parameterized by a per-transport `fetchPage` function — Tier 1's
  `fetchApiSource` and the new `fetchApiSourceViaRelay` both call into it, so the maxPages cap,
  size-tier re-check, and JSON-parse/merge logic exist in exactly one place for both tiers.
  **A real constraint found while building this, not by a test:** `cors-relay.ts`'s handler
  forwards only `content-type` on a successful pass-through — every other response header,
  including `Link`, is dropped. Confirmed two ways: reading the handler source, and a live
  `curl` probe of the real deployed staging relay (`datascope-edge-staging.justinclarke.workers.dev/
  cors-relay?url=https%3A%2F%2Fexample.com%2F&sessionId=probe-headers-1` → only `content-type`
  plus ordinary Cloudflare edge headers came back, no `Link`). GitHub's `Link` header is the one
  generically-follow-able pagination scheme among the v0.5 platforms (D34, ADR-006) — so Tier 2
  as built today always resolves to exactly one page regardless of the target's own pagination,
  even though the shared loop's cap/merge machinery is fully built and tested (against a mocked
  response that does carry a `Link` header, proving the loop itself is correct and ready if the
  relay ever forwards more headers). Named here the same way `01-api-tier1-fetch.md` names its
  own non-Link-header gap — a real, evidence-backed limitation, not a hidden bug.
  **Tier 1 → Tier 2 handoff wired:** `loadUrl` (`services/ingestion.ts`) now catches a
  `cors-suspected` `ApiFetchError` and retries via `fetchApiSourceViaRelay` before surfacing
  anything, closing `01-api-tier1-fetch.md`'s own previously-open criterion of the same name.
  Tier 1 always fails on its first fetch attempt when CORS-blocked, so there's no partial
  multi-page state to reconcile before the relay retry starts clean. A `usedRelay` flag flows
  back through `UrlIngestResult` to `IngestionPanel.tsx`, which renders a one-line §5.2
  disclosure note when true; 429/503 render through the existing generic error banner every
  other ingest failure already uses (its message text is the user-facing copy — no new UI
  states needed beyond the disclosure note itself).
  **Verification:** suite **1030 → 1042** (+12: 5 cases in new `relayClient.test.ts`, 5 more in
  `apiIngestion.test.ts`'s `fetchApiSourceViaRelay` block, 2 new `IngestionPanel.test.tsx` cases
  for the disclosure note and the rate-limit error banner); `tsc -b` / `oxlint` / `vitest run`
  (1042 passed) / `vite build` all clean. **No `wrangler dev`/Playwright pass** — neither is
  installed in this repo, no cached Chromium was present (`~/.cache/ms-playwright` absent), and
  `npx playwright install chromium` didn't complete in this sandboxed session (network-gated,
  not attempted further) — unlike `01-api-tier1-fetch`'s own live Playwright pass, which had
  browser access this session didn't. Supplemented with live `curl` probes of the real deployed
  staging relay instead: confirmed the header-stripping finding above and that the SSRF block
  still returns 400 on a cloud-metadata target live. Did not chase a live 429 trip against the
  shared staging limiter — `09-edge/02-cors-relay`'s own definition of done already closed and
  burst-audited that exact behavior; re-probing it here would be duplicative.
  **Docs, master-first:** no master/Decision-Record edit — §7.4 already specced this fully.
  Leaf `build/07-connectivity/02-api-tier2-relay.md` rewritten to the built shape (Files section
  corrected, four of six acceptance criteria checked with evidence, the remaining two named with
  reasons and a next concrete action); `01-api-tier1-fetch.md`'s Tier-2-handoff criterion and
  Definition of done updated to reflect the closure.
  **Next concrete action:** in a future session with Playwright/browser access, run the real dev
  server against a genuinely CORS-blocked public JSON API through the deployed staging relay
  (mirroring `01-api-tier1-fetch.md`'s own GitHub live passes), confirm the disclosure note
  renders and the resulting table matches a direct ingest, then check `02-api-tier2-relay`'s
  last two boxes and move `▶` to `07-connectivity/03-refresh-from-source`.
  **Blocker:** none — waiting on browser-automation tool access, not stuck on design or code.

- **2026-07-23** — **`07-connectivity/02-api-tier2-relay` closes: both remaining criteria
  live-verified against the real deployed staging relay, and a real live-only bug the pass
  caught is fixed. `▶` moves to `07-connectivity/03-refresh-from-source`.** This session had
  real browser-automation access the prior one lacked: `npx playwright` resolved a cached
  package (from an earlier `npx` invocation, `~/.npm/_npx`) with no sandboxed Chromium binary
  available, but launching it with `channel: 'chrome'` drives the machine's already-installed
  Google Chrome directly — no download needed, no sandbox network dependency.
  **A real, live-only bug found and fixed, not by a test:** `IngestionPanel.tsx`'s
  `runIngestUrl` set the relay-disclosure flag and then, in the same synchronous continuation,
  called `navigateToPostIngestLanding()`; React batches both into one commit, so the panel (and
  the §5.2 disclosure note inside it) unmounted before the browser ever painted it. Every unit/
  component test passed anyway because the isolated component test never renders the full `App`
  shell and so never exercises the unmount — only driving the real app in a real browser
  surfaced it. No real user could ever have seen the note this build's own acceptance criteria
  had marked "visible." Fixed by skipping the auto-navigate specifically when `usedRelay` is
  true — every other ingest path's landing behavior (D48/D70) is unchanged. Two new
  `IngestionPanel.test.tsx` cases lock in both directions (relay path stays on the Ingestion
  panel; a non-relay URL ingest still auto-navigates as before).
  **A genuine environment constraint, not a code issue:** this sandbox's browser egress appears
  to inject a permissive `access-control-allow-origin` header on responses that a direct `curl`
  from the same host does not see (confirmed on a real no-CORS public API — `curl` saw no ACAO
  header, the Playwright-driven Chrome saw `acao: *` on the identical request) — so an
  organically CORS-blocked target can't be produced live from this specific environment.
  Worked around with a deterministic `page.route(...).abort('failed')` on the direct request,
  reproducing the identical opaque `fetch()` rejection a real CORS block causes (the platform
  gives the app no way to tell the two apart either, which is exactly why both take the
  `cors-suspected` path) — everything downstream (the relay call, the real deployed staging
  Worker, the ingest pipeline) was real and unmocked.
  **Live result:** direct fetch aborted → Tier 2 relay called → real `200` from
  `datascope-edge-staging.justinclarke.workers.dev/cors-relay` with the exact live JSON body →
  registered as a table (1 row × 9 cols, matching the source JSON's top-level keys, single-page
  so unaffected by the already-named Link-header gap) → disclosure note rendered and stayed
  visible (screenshotted) → the panel did not auto-navigate away, confirming the fix.
  **Verification:** suite **1042 → 1043** (+1: the fix's own regression-guarding case; a second
  new case reused an existing assertion path); `tsc -b` / `oxlint` / `vitest run` (1043 passed) /
  `vite build` all clean, re-run after the fix.
  **Docs:** no master/Decision-Record edit — §5.2/§7.4 already specced the disclosure and the
  relay; nothing here revises the spec, only closes the verification gap and fixes a bug in
  realizing it. `build/07-connectivity/02-api-tier2-relay.md` rewritten: both acceptance criteria
  checked with evidence, Files section documents the navigation fix, Test plan records the live
  pass and the sandbox CORS-injection finding, Definition of done rewritten to record the bug,
  the fix, and the closure.
  **Next concrete action:** `07-connectivity/03-refresh-from-source` (Sonnet).
  **Blocker:** none.

- **2026-07-23** — **`07-connectivity/03-refresh-from-source` closes — the last `07
  connectivity` row. Every API-sourced table now gets a "Refresh from source" action that
  atomically replaces it in place, live-verified against a real DuckDB engine including a
  real failure. `▶` moves to `08-persistence/01-parquet-export`.**
  **The atomic-replace design:** a refresh re-runs the same Tier 1 → Tier 2 cascade `loadUrl`
  already used (unchanged `fetchApiSource`/`fetchApiSourceViaRelay`) against the table's now-
  recorded `sourceUrl`, ingests the response under a scratch table name through the
  **unmodified** `ingestBuffer` — every format/malformed-row check it already runs — and only
  swaps it in (`DROP` + `RENAME`) once that fully succeeds. A failure at any point before the
  swap never touches the registered table; no DuckDB transaction semantics were needed for
  this, just ordering. `TableRegistryEntry` gained `sourceUrl`/`lastFetchedAt`/`stale`;
  `useDatasetsStore` gained `setTableRefreshMeta` and `markTablesStale`.
  **Staleness is a text match, not a dependency graph.** This codebase has no explicit
  derived-table dependency tracking — the new `referencesTableName(sql, tableName)` helper
  (bare-word or double-quoted-identifier match) finds which derived tables' `generatingSql`
  references a just-refreshed table, the same shape `runTransform`'s own mutation-target
  matching already uses. Flagged tables aren't auto-rebuilt (§12.1 — their recorded SQL
  already makes a manual re-run cheap), just marked with a "possibly stale" badge in
  `TableList`, next to a new "fetched …" timestamp every API-sourced row now shows.
  **Verification:** suite **1043 → 1061** (+18: pre-engine-rejection and `referencesTableName`
  cases in `ingestion.test.ts`, `setTableRefreshMeta`/`markTablesStale` in `datasets.test.ts`,
  refresh-button/last-fetched/stale-badge cases in `TableList.test.tsx`, refresh success/
  failure/relay-disclosure/staleness wiring in `IngestionPanel.test.tsx`); `tsc -b` / `oxlint`
  / `vitest run` (1061 passed) / `vite build` all clean. **Live pass** (real dev server, real
  Chrome via Playwright, real DuckDB-Wasm, real GitHub API): ingested
  `api.github.com/repos/duckdb/duckdb/labels`, refreshed it — telemetry showed a genuine
  second fetch (`pages 2`, incidentally exercising a paginated refresh) and the real
  DROP+RENAME swap succeeded. Then a `page.route(...).abort('failed')` on the direct request
  forced `cors-suspected`, which retried through the Tier 2 relay exactly as `loadUrl` does;
  the relay's own live call to GitHub hit a real `403` (this session had already made several
  GitHub calls) — the resulting error banner rendered while the table's last-fetched
  timestamp and row/column text stayed byte-for-byte identical to before the failed attempt,
  confirming atomicity against a real engine and a real, if incidental, failure.
  **Not live-driven:** the staleness badge's Monaco-SQL path (create a derived table via the
  SQL playground, refresh its source, watch the badge appear) — covered instead by a component
  test exercising the identical store→render path a live pass would, judged sufficient rather
  than spending a second live session chasing GitHub's rate limit further.
  **Docs:** no master/Decision-Record edit — §7.4 already specced "Refresh from source" fully;
  this realizes it. `build/07-connectivity/03-refresh-from-source.md` rewritten: Files section
  documents the built shape, all four acceptance criteria checked with evidence, Test plan
  records the unit suite plus the live pass, Definition of done rewritten.
  **Next concrete action:** `08-persistence/01-parquet-export` (Sonnet) — the first `08`
  row; `06-ai/02-modes-byok` still separately waits only on the re-pointed Ollama live run,
  and `09-edge/04-persistence-endpoints`'s box still waits only on the short-TTL expiry
  observation (2026-07-24 or later).
  **Blocker:** none.

- **2026-07-23** — **`08-persistence/01-parquet-export` closes — the first `08 persistence`
  row. Client-side Parquet/CSV export and the copy-to-Jupyter snippet, live-verified against
  a real DuckDB-Wasm engine for both a source and a derived table. `▶` moves to
  `08-persistence/02-r2-save-share`.**
  **The engine-boundary choice:** rather than a duckdb-wasm-specific back door, `exportTable`
  was added as a fourth method on the `QueryEngine` interface (D49) alongside `execute`/
  `registerFile`/`summarize` — a table export always needs a buffer handoff regardless of
  engine, even though *how* that buffer is produced (`COPY` into DuckDB-Wasm's VFS, then
  `copyFileToBuffer`) is duckdb-wasm-specific. `services/export.ts` and
  `features/export/ExportModule.tsx` are the thin orchestration/UI on top; `jupyterSnippet.ts`
  is a pure, fully unit-tested snippet builder. The Results-header shortcut in
  `QueryResultsPanel.tsx` (the spec's "wherever a table is" for the SQL playground) finds a
  just-created derived table by re-classifying the last-run SQL rather than threading a table
  name through the shared `QueryResult` type — every derived table is already in the registry
  by the time `status` flips to `success`, so no new field was needed on a widely-shared type.
  **A real finding from the live pass, not a bug — flagged rather than silently checked:** the
  "zero network requests during export" criterion holds for every CSV export and every
  *repeat* Parquet export, but the very first Parquet export against a fresh DuckDB-Wasm
  instance fetches `parquet.duckdb_extension.wasm` from `extensions.duckdb.org` — DuckDB-Wasm's
  own loadable-extension mechanism, carrying no user data, and the exact same CDN dependency
  [ADR-001](architecture/adr/001-duckdb-wasm-worker-setup.md) already documents for Parquet/
  JSON *ingestion* (its own Backlog line already defers self-hosting those extension binaries,
  unscoped to any current checklist item). Recorded as a documented exception on this leaf's
  acceptance criteria rather than fixed here — self-hosting the extension is a separate,
  already-tracked infrastructure decision, not something this build should absorb.
  **Verification:** suite **1061 → 1071** (+10: `jupyterSnippet.test.ts`'s pure-function cases,
  `ExportModule.test.tsx`'s render/wiring cases, one new `SqlModule.test.tsx` case for the
  Results-header shortcut); `tsc -b` / `oxlint` / `vitest run` (1071 passed) / `vite build` all
  clean. **Live pass** (real dev server, real Chrome via Playwright, real DuckDB-Wasm): ingested
  the bundled Titanic sample; downloaded it as Parquet and CSV from the Export module and
  copied its Jupyter snippet (clipboard confirmed, correctly no `# Generated by:` header for a
  source table); ran `CREATE TABLE titanic_over_30 AS SELECT * FROM titanic WHERE Age > 30` in
  the SQL playground, downloaded it via the new Results-header shortcut, downloaded it again
  from the Export module (zero network requests, confirming the extension-fetch is genuinely
  one-time per engine instance), and copied its snippet (clipboard confirmed the CTAS SQL as a
  leading comment). All three Parquet files and the CSV were opened and validated in a scratch
  Python venv (pandas 3.0.5 / pyarrow 25.0.0 — installed in an isolated venv under the session
  scratchpad, not a project dependency): row/column counts matched (891×10 for `titanic`, both
  formats; 508×10 for the derived table), and every row of the derived export satisfied
  `Age > 30`, confirming the filter survived the export intact.
  **Not independently stress-tested:** a synthetic multi-GB export, for the "doesn't freeze the
  UI" criterion — judged architecturally guaranteed instead (COPY/`copyFileToBuffer` run inside
  DuckDB-Wasm's own dedicated Worker via the same `execute()` every other query already uses;
  this build added no new main-thread work), rather than spending a session manufacturing a
  multi-GB dataset to prove a property the existing engine architecture already guarantees.
  **Docs:** no master/Decision-Record edit — §12.2 already specced client-side export and the
  Jupyter handoff fully; this realizes it. `build/08-persistence/01-parquet-export.md`
  rewritten: Files section documents the built shape (including the `QueryEngine` boundary
  addition), all four acceptance criteria checked with evidence (including the documented CDN
  exception), Test plan records the unit suite plus the live pass, Definition of done rewritten.
  **Next concrete action:** `08-persistence/02-r2-save-share` (Sonnet).
  **Blocker:** none.

- **2026-07-23** — **`08-persistence/02-r2-save-share` built and live-verified against the
  real deployed staging Worker + real R2 — structure-only and full-dataset shares both
  round-trip end to end, including a real cross-device open and a real delete. `▶` stays:
  the box is left unchecked on one deliberately-deferred sub-criterion (TTL expiry).**
  **D20 structure-first, D46 detector, D21 language rule — all built and live-checked, not
  just unit-tested.** `ShareDialog.tsx` defaults to a structure-only save (`buildStructureReport`
  scoped to §12.3's own field list — no insights/relationships, named below as a scope
  boundary, not an oversight); escalating to a full-dataset share is a second, distinctly
  red-styled step ("Include raw data rows instead" → "Save full dataset (includes raw
  rows)"). A live save of the structure-only artifact was fetched back directly from the
  real R2 object afterward: its JSON carries only `generatedAt`/`tables`/`insights`, and
  each column only `name`/`semanticType`/`physicalType`/`nullPercentage`/`cardinality`/
  `classificationReason` — literally no field exists in the shape for a raw value to
  occupy. The D46 `sensitiveColumns.ts` detector is column-name-pattern-only (no cell reads,
  no engine cost); it renders positives-only in the dialog (an empty result renders nothing,
  never a "none found" line) and pairs with a functional column-name-redaction toggle.
  **Rare-category suppression is named, not built:** `StructureReportColumn` never carried
  raw category values (only `cardinality`, a count), so there's nothing for a suppression
  control to act on without adding a new per-column value-frequency query — out of this
  build's scope, recorded as a gap in the leaf doc rather than shipped as a no-op checkbox.
  **A real bug from real data, not a synthetic test:** the bundled Titanic sample's actual
  `Name` column went unflagged by the D46 detector until a live pass against it (see below)
  caught it — the detector's personal-name pattern required a qualifier
  (`first_name`/`last_name`/`surname`) and never matched a bare `name` column. Fixed with an
  exact-match case for bare `name` (deliberately exact, not substring, so `table_name`/
  `column_name` stay unflagged).
  **A second real bug, also live-pass-only:** `Sidebar.tsx`'s "Export / Share" card and
  `ExportModule.tsx`'s own early return were both gated on `hasDatasets` — since tables are
  in-memory only (never persisted) while `shareLinks` *is* persisted (settings store), a user
  who created a share link and then reloaded, or came back in a fresh session with no
  dataset loaded, could not navigate to Export/Share at all to find their own "delete now"
  control. Every unit/component test passed anyway, the same shape as the
  `02-api-tier2-relay` navigation bug this codebase already hit once before — isolated
  component tests never exercise the real cross-page-reload state boundary. Fixed: the card
  is now `enabled: hasDatasets || shareLinks.length > 0`, and `ExportModule` renders
  `ShareLinksList` unconditionally rather than behind the "drop a dataset" message.
  **Live verification (real Chrome via Playwright `channel: 'chrome'`, real dev server,
  the already-deployed `datascope-edge-staging.justinclarke.workers.dev` — no local
  `wrangler dev` needed, the Worker side shipped with `09-edge/04-persistence-endpoints`):**
  structure-only path — save → real share URL → opened in a second, storage-isolated
  browser context → `SharedStructureReportView` rendered the real fetched schema (zero rows,
  confirmed by direct object inspection above) → back on the first context, reloaded (tables
  gone, share link persisted) → "Export / Share" reachable, "Your share links" showed the
  entry with no dataset loaded → delete → local entry removed → a third context re-opening
  the identical URL got a genuine `404` (both the browser's network log and the app's own
  "doesn't exist or has expired" banner confirmed it) — the rest of the app (ingestion) still
  rendered normally alongside that error banner. Full-dataset path — escalated, saved the
  real Titanic Parquet export → opened on a second context → the real bytes were re-ingested
  through the unmodified `ingestBuffer` path into a genuinely queryable 891-row table
  (`origin: 'shared'`), landing on the Blueprint with "Tables (1)" in the sidebar. Every share
  object created during these passes was deleted afterward — nothing left lingering on the
  real staging bucket.
  **Verification:** suite **1071 → 1121** (+50 across `sensitiveColumns.test.ts`,
  `structureReport.test.ts`, `export.test.ts`, `ingestion.test.ts`, `settings.test.ts`,
  `ShareDialog.test.tsx`, `ShareLinksList.test.tsx`, `SharedStructureReportView.test.tsx`,
  `ExportModule.test.tsx`, `App.test.tsx`, `TableList.test.tsx`, `Sidebar.test.tsx`);
  `tsc -b` / `oxlint` / `vitest run` (1121 passed) / `vite build` all clean.
  **The one thing deliberately not done:** TTL-expiry observation — same open reason
  `09-edge/04-persistence-endpoints.md` already recorded for its own TTL criterion (needs a
  real 30-day wait or a dedicated short-TTL scratch rule, not more code). Every other §18/§22
  row this leaf owns passed live.
  **Docs, master-first:** no master/Decision-Record edit — §12.3/D20/D21/D46 already specced
  this fully; nothing here revises it, only realizes it. `build/08-persistence/02-r2-save-share.md`
  rewritten: Files section documents the built shape plus the two live-pass-found bugs and
  their fixes, acceptance criteria checked with live evidence (the TTL sub-criterion named
  and left open), Test plan records both the unit suite and the live passes, Definition of
  done rewritten.
  **Next concrete action:** `08-persistence/03-dsps-spec` is next in file order, but this
  item's own box stays open — a future session should first decide whether to spend the
  TTL-expiry wait (mirroring `09-edge/04`'s short-TTL-scratch-rule approach) before moving
  `▶` on, or move on and revisit it later the way `09-edge/04`'s own TTL line was left.
  **Blocker:** none — the TTL wait is a deliberate deferral, not stuck.

- **2026-07-23** — **Decision on the fork left open above: `▶` moves to
  `08-persistence/03-dsps-spec` now rather than spending this session on the r2-save-share
  TTL-expiry wait.** Precedent followed exactly: `09-edge/04-persistence-endpoints` already
  moved `▶` forward once with a TTL criterion deliberately left open (its own short-TTL
  scratch-rule observation is itself still pending a 2026-07-24-or-later check), and today's
  date still doesn't clear even that earlier wait — starting a second parallel TTL wait
  before the first has resolved adds nothing. `08-persistence/02-r2-save-share`'s box stays
  unchecked on its named TTL sub-criterion only; every other criterion is live-verified.
  **Blocker:** none.

- **2026-07-23** — **`08-persistence/03-dsps-spec` built, unit-verified, and live-verified —
  DSPS formalized as a real versioned interface end to end: schema/version/provenance
  contract, all three renderers (the new HTML one plus the two that already existed),
  the `.dsps` receiver, a published-shape JSON Schema + independent npm validator package,
  and the MCP `get_dsps` wiring the Phase-1 scaffold had been waiting on. `▶` stays on this
  item — two criteria stay open, both deliberate external-action pauses, not gaps.**
  **The schema/version/provenance layer:** new `src/lib/dsps.ts` (`DSPS_VERSION`,
  `DspsProvenance`, `DspsSnapshot`, `hashBytesHex`, `formatSnapshotLabel`, `parseDsps` — the
  forward-compatible, version-mismatch-surfacing reader) layers the D37 contract onto the
  **existing** document rather than duplicating it: `structureReport.ts`'s `StructureReport`
  *is* the concrete DSPS document, extended in place with `dspsVersion` and, per fact,
  `provenance` + `snapshot`. `passesFactWordingGuard` is `producerValidators.ts`'s existing
  D45 phrasing guard **reused verbatim**, not reimplemented — found while designing the
  banned-wording criterion, it already bans "verified"/"always"/"guaranteed"/etc. for exactly
  this reason on the Verdict seam.
  **The file-hash half of D45's snapshot label, previously an explicitly named gap** (
  `IdentityBand.tsx`'s own comment: "no hashing exists anywhere in this tree yet") **is now
  built:** `ingestion.ts`'s `ingestBuffer` computes a SHA-256 over an already-in-memory
  `Uint8Array` source before it's handed to the worker (source bytes must be read before
  `registerFile` transfers/detaches the buffer — the same ordering `01-file-drop` already
  established). A sampled-tier (large) file is deliberately left unhashed — hashing it would
  mean fully buffering exactly the file its own size tier exists to avoid buffering — a named
  scope boundary, not a silent omission. `TableRegistryEntry` gained `fileHash?: string`.
  **The third renderer, HTML, is genuinely new** (`src/lib/dspsHtml.ts` — self-contained,
  HTML-escaped, the D26 attribution footer); "Copy for AI" and the DSPS JSON export already
  existed pre-build and needed no new renderer, only the version/provenance fields threading
  through. All three now sit on `IdentityBand.tsx`'s button row.
  **The `.dsps` receiver (D62) reuses `SharedStructureReportView.tsx` as-is** — it was already
  a pure, network-free read-only renderer over a `StructureReport` (the share-open flow's own
  view) — rather than building a second renderer or the full live-Dossier ViewSpec path; the
  spec's own internal cut line explicitly sanctions exactly this degraded shape. New
  `stores/dspsReceiver.ts` (open/fail/close) is fed by `IngestionPanel.tsx`'s `handleFiles`,
  which now recognizes a single `.dsps`-suffixed drop and routes it to a local
  `file.text()` → `JSON.parse` → `parseDsps` path *before* ingestion ever sees it — never a
  fetch. `App.tsx` renders the parsed document through that same shared view.
  **JSON Schema + npm validator (D64):** `schemas/dsps.schema.json` (draft 2020-12) at the repo
  root, and a genuinely standalone package, `packages/dsps-validator/` — its own
  `package.json`/`tsconfig.json`/`README.md`, zero runtime dependencies, zero import from this
  app's `src/`, 14 passing tests, typechecks independently of the root `tsc -b` project graph.
  `vitest.config.ts`'s `include` extended so its suite runs alongside the app's own.
  **MCP wiring — completing the build/09-edge/01 Phase-1 scaffold** (`handleMcp`/
  `SharedArtifactStore` already existed, unrouted, since that session; this build is what
  D38 called for it to actually serve): `protocol.ts`'s `get_dsps` response now carries
  `dsps: unknown` (an opaque pass-through) rather than the narrower `StructuralFacts` shape
  synthesis still uses — MCP transports the client-generated artifact verbatim, per D38, never
  re-deriving a smaller one. New `createR2SharedArtifactStore` in `mcp.ts`, backed by the
  **same** R2 bucket `09-edge/04` already writes to, gated on a new specific content type
  (`application/vnd.datascope.dsps+json`, replacing the generic `application/json`
  `STRUCTURE_REPORT_CONTENT_TYPE` `services/export.ts` used before this build) so a
  full-dataset share (raw Parquet bytes) can never surface through MCP as if it were DSPS.
  `listShared` is a **named, deliberate gap** — `persistence.ts`'s object store records no
  session↔token association server-side by its own original design ("nothing stored beyond
  what TTL/ownership need"), and building that index is new server-side scope this leaf doc's
  own acceptance criteria never asked for (only `get_dsps` is tested); it returns `[]` rather
  than fabricating a list. `worker.ts` wires `/mcp` (method check inside the handler, like
  `/persistence`); `bindings.ts` gained `MCP_KILL_SWITCH`; `wrangler.toml` (root +
  `[env.staging]`) declares it — no new binding, since `/mcp` reuses `PERSISTENCE_BUCKET`.
  **A real bug found live, not by a test:** the file-picker's `accept` attribute
  (`DropZone.tsx`) never listed `.dsps` — drag-drop was unaffected, but click-to-browse would
  never show a `.dsps` file as selectable at all. Fixed (accept list now includes `.dsps`),
  confirmed by re-running the live pass.
  **Verification:** suite **1121 → 1168** (+47 across `dsps.test.ts`, `dspsHtml.test.ts`,
  `dspsReceiver.test.ts`, `structureReport.test.ts`'s two new cases, three new
  `IngestionPanel.test.tsx` cases, three new `App.test.tsx` cases, `mcp.test.ts`'s rewrite +
  `createR2SharedArtifactStore` cases, and `dsps-validator`'s own 14); `tsc -b` / `oxlint` /
  `vitest run` (1168 passed) / `vite build` all clean; both root and `--env staging`
  `wrangler deploy --dry-run` bundle cleanly with `MCP_KILL_SWITCH` present. **Live pass** (real
  dev server, real Chrome via Playwright `channel: 'chrome'`, the bundled Titanic sample): all
  three renderer buttons render on the real Blueprint; "Export HTML report" downloaded a
  self-contained file with no `<script>`/`<link>` tags and the real attribution footer; "Export
  structure report" downloaded real DSPS JSON (`dspsVersion: "1.0.0"` confirmed); that same
  file dropped back onto the Ingest drop zone rendered the real read-only viewer with the
  request log showing zero network requests for the entire operation — screenshotted both the
  Blueprint and the receiver's rendered view.
  **Docs, master-first:** no master/Decision-Record edit — §12.2/§1/§6 and D31/D37/D38/D45/
  D62/D64 already specced this fully; nothing here revises the spec, only realizes it.
  `build/08-persistence/03-dsps-spec.md` rewritten: Files section documents the built shape
  (including which of the "three renderers" were genuinely new vs. already-existing), six of
  eight acceptance criteria checked with evidence, the remaining two named with reasons
  (npm publish; a live staging MCP round-trip), Definition of done rewritten.
  **Next concrete action:** two deliberate, confirmation-gated provisioning steps would close
  this item's box: `npm publish` from `packages/dsps-validator/` (a real, externally-visible,
  effectively-irreversible action against the public registry), and a
  `wrangler deploy --env staging` + a live save-a-structure-only-share → `/mcp` `get_dsps`
  round-trip against the real deployed Worker (mirroring every other edge item's own live-audit
  pattern). Neither was run this session without asking first, matching this project's
  established provisioning-pause norm. After those: `08-persistence/02-r2-save-share`'s own
  still-open TTL-expiry wait, or `10-studio` (v1 arc, gated on profiling proven in the wild).
  **Blocker:** none — both open criteria are deliberate pauses for confirmation before touching
  real external systems, not stuck.

- **2026-07-24** — **`06-ai/02-modes-byok` closes: the re-pointed Ollama live run — the one
  criterion left open since the 2026-07-22 mode-taxonomy fold-in — ran for real against a live
  daemon through API mode's own key/endpoint field, not the old Local-model path. Box checked.**
  **Live browser pass** (real Chrome via Playwright, real dev server on `localhost:5174`, a real
  Ollama 0.32.1 daemon restarted fresh for the run, pinned `qwen2.5-coder:1.5b`, the bundled
  Titanic sample): first-run chooser → "API"; `AISettingsPanel` → routing set to "Prefer my key,"
  `http://localhost:11434` typed into the key/endpoint field — the panel's own copy confirmed
  detection ("Detected as a local Ollama endpoint … Zero egress, same as the in-browser model").
  Asking "How many passengers survived?" on AI Chat fired exactly two requests, both
  `POST http://localhost:11434/api/chat` (SQL-mode then answer-mode) and nothing to any other
  host. The suggested SQL (`SELECT COUNT(PassengerId) FROM titanic WHERE Survived = 1`) executed
  for real (✓ 1 rows · 10 ms) and returned the correct count, 355 — matching the original
  2026-07-22 run and confirming the new trigger routes correctly.
  **One real, separate finding, not a plumbing defect:** the model's own prose answer read "192
  passengers survived," disagreeing with the correct row directly beneath it
  (`count(PassengerId): 355`) — the pinned 1.5B coder hallucinating in answer-mode text despite
  being handed the correct tool result. Routing, SQL generation, execution, and row delivery to
  the model were all correct; only the small model's own final-answer composition was wrong.
  Named in the leaf doc as a known sharp edge of the pinned local model (consistent with "Local
  model"'s own disclosed "SQL generation is weaker than cloud" caveat), not a regression against
  anything this leaf doc's criteria test.
  **An unrelated environment issue surfaced and was resolved before the pass above:** the first
  attempt hit a `500` from Ollama itself (`llama-server reported out-of-memory during startup` /
  a macOS Metal-compiler XPC error) — a stale daemon state, not a DataScope or Ollama-model bug.
  Restarting `ollama serve` cleared it; the retried run is the one recorded above.
  **Docs:** no master/Decision-Record edit — D2/D3/D9 already specced this fully as of the
  2026-07-22 fold-in; nothing here revises the spec, only closes its one outstanding live-run
  criterion. `build/06-ai/02-modes-byok.md`'s re-pointed criterion checked with the evidence
  above.
  **Next concrete action:** `08-persistence/03-dsps-spec` remains `▶` (per the prior entry, its
  own two provisioning steps are still open and deliberately deferred this session). Separately,
  `09-edge/04-persistence-endpoints` and `08-persistence/02-r2-save-share` each still wait on
  their own named provisioning/wait steps (Terraform apply + staging deploy; a TTL-expiry
  observation), unaffected by this entry.
  **Blocker:** none.

- **2026-07-24** — **Documentation catch-up: `09-edge/04-persistence-endpoints`'s three
  provisioning steps were actually completed in an untracked prior session (evidence already
  sitting in the leaf doc, timestamped 2026-07-23T09:05:33Z) but this file was never updated to
  match — corrected here. Box stays unchecked; two criteria are still legitimately open.**
  Asked to estimate remaining work for this item and `08-persistence/02-r2-save-share`, checking
  the real infra directly (rather than trusting this file's stale "still needs provisioning"
  language) turned up that `terraform plan` already reports **"No changes"** against production
  (`datascope-persistence`) and, for staging, matches too apart from one deliberate out-of-band
  rule (below). A fresh live save→get→delete round trip against the public
  `datascope-edge-staging.justinclarke.workers.dev` confirmed the staging deploy itself is live
  and correct (`ttlSeconds: 2592000` returned, matching the 30-day rule exactly); the probe
  object was deleted afterward.
  **A real near-miss, caught and fixed this session, worth naming plainly.** Before reading the
  leaf doc's own explanation, an unrelated `terraform apply` (run to reconcile what looked like
  plain drift on the `dev` workspace) deleted the leaf doc's own `ttl-test-scratch` lifecycle
  rule — a 1-day-TTL rule on a `ttl-test/` prefix, deliberately kept **out of** `infra/r2.tf` so
  a throwaway verification rule never lands in the Terraform-owned production config, set up in
  that same prior untracked session specifically to observe `08-persistence/02-r2-save-share`'s
  TTL-expiry criterion faster than a real 30-day wait. The live marker object
  (`ttl-test/marker.txt`) had not yet expired (the expected deletion window,
  2026-07-24T09:05:33Z–2026-07-25T09:05:33Z, hadn't opened yet) — caught before any data was
  lost. The identical rule was re-added the same out-of-band way (`wrangler r2 bucket lifecycle
  add`, not Terraform), confirmed present again, marker confirmed still byte-exact. **Lesson
  recorded in the leaf doc itself:** `terraform plan` against `dev` will keep showing this one
  rule as a diff for as long as the observation runs — expected, and must not be reconciled away
  until the deletion is actually observed.
  **What's still genuinely open, both correctly unchecked:** `09-edge/04-persistence-endpoints`
  waits on (1) the TTL-expiry observation itself completing (marker not yet deleted as of this
  entry) and (2) an operator runbook line for manual `wrangler`-console deletion (documentation,
  not code — the capability itself is already confirmed structurally). `08-persistence/
  02-r2-save-share`'s own TTL-expiry criterion waits on the same observation. Neither is an
  effort estimate in the usual sense — the blocking factor is calendar time on a live R2
  lifecycle sweep ("typically within 24 hours" per Cloudflare's own docs), not engineering work.
  **Docs:** no master/Decision-Record edit. `build/09-edge/04-persistence-endpoints.md`'s TTL
  criterion appended with the 2026-07-24 re-check and the near-miss + recovery, plus the standing
  note for future sessions.
  **Next concrete action:** re-check `ttl-test/marker.txt` after 2026-07-25T09:05:33Z; if
  deleted, check both the TTL-expiry criterion here and in `08-persistence/02-r2-save-share`,
  clean up the now-unneeded scratch rule, and both boxes can close pending only the runbook line.
  `▶` stays at `08-persistence/03-dsps-spec` per the entry above.
  **Blocker:** none — a calendar wait, not a stuck state.

- **2026-07-24** — **File maintenance, no build work:** the 2026-07-22→2026-07-24 log entries
  (DESIGN DECISION mode-taxonomy rename through the doc-catchup TTL entry — everything since the
  last archive point) moved to `BUILD-ORDER-HISTORY.md` per human instruction, keeping this file
  to the pointer line. **New `### v0.60 — the Workbench (D71)` section added between v0.5 and
  v1**, per human instruction — the nine W0–W8 rows from `build/12-workbench/README.md` /
  master §19's W0–W8 table, all unchecked, no leaf docs yet (none exist beyond the charter; each
  is authored when its phase is picked up, per the fold's own binding constraint). Model column
  is a proposal built from this doc's own Model rule (Opus for the envelope-invariant seam W0,
  the auto-layout spike W4, the AI-defaults/consent surface W6, and the cutover W8; Sonnet
  elsewhere), not yet confirmed against any actual build. **No checklist state changed** — the
  `▶` stays exactly where it was, at `08-persistence/03-dsps-spec`; v0.5's existing rows
  (including 06-ai/02 and 06-ai/03, whose leaf docs now carry Workbench-fold deltas building in
  W6/W7) are untouched, since those deltas are new spec content for the *new* W6/W7 leaves, not
  reopened criteria on the already-closed v0.5 ones.
  **Next concrete action:** `08-persistence/03-dsps-spec` (Sonnet) — unchanged; its own two
  open criteria (`npm publish`, a staging `/mcp` round-trip) are still deliberate confirmation
  pauses, per the entry now archived. Separately, whenever `build/12-workbench/`'s W0 leaf is
  authored and picked up, this section's first row and the file's single `▶` move there.
  **Blocker:** none.

- **2026-07-24** — **`▶` moves from `08-persistence/03-dsps-spec` to `12-workbench/W0`, per
  human instruction ("skip the dsps spec we will do it later and lets move to v0.60").**
  `03-dsps-spec` stays unchecked and deferred, not reopened — its remaining two criteria
  (`npm publish`, a live staging `/mcp` round-trip) were already deliberate confirmation
  pauses per the 2026-07-24 entries above, so nothing about its state changed, only its
  priority. Authored `build/12-workbench/01-tab-contract.md` (W0's leaf doc) from the
  charter (`build/12-workbench/README.md`), master §13.3 (envelope invariant, tab model,
  keep-mounted norm) and §19's W0 row — the first leaf doc in this section, so the row now
  links to it.
  **Docs:** no master/Decision-Record edit — §13.3/§19/D71 already specced W0 fully; the new
  leaf doc only restates it as a buildable DoD, per the section's own binding constraint
  (no `src/` code starts until a phase's leaf doc lands).
  **Next concrete action:** build W0 to `build/12-workbench/01-tab-contract.md`'s definition
  of done — `types/tabs.ts` (the closed `TabType` registry + envelope), `stores/tabs.ts`,
  `services/navigation.ts` (`openDestination`, flag-off routes through the existing
  `stores/ui.ts`), `lib/featureFlags.ts` (`WORKBENCH_ENABLED`, same pattern as
  `JOIN_GRAPH_ENABLED`) — flag-off and invisible, envelope-invariant unit tests passing
  before anything renders.
  **Blocker:** none.

- **2026-07-24** — **W0 — Tab contract shipped.** Built to `build/12-workbench/01-tab-contract.md`'s
  definition of done, inline in the orchestrating session (no docs pipeline — implementation
  is reviewed as code, per this repo's `CLAUDE.md`). Added `src/types/tabs.ts` (`TabType`
  closed union, seeded with the `'map'` placeholder; `TabSpec` envelope: `id`/`type`/`subject`/
  `initializer`), `src/stores/tabs.ts` (`useTabsStore` — `openTab`/`closeTab`; `openTab` accepts
  an `artifactSpec` fourth parameter for signature stability but does not persist it onto the
  tab, so a hostile/model-shaped payload with envelope-looking keys has no path into the
  envelope at all — proven by an adversarial test in `stores/tabs.test.ts`), `src/services/
  navigation.ts` (`openDestination(module, tab?, prefill?)` — flag-off calls `stores/ui.ts`'s
  `setActiveModule` unchanged; flag-on calls `stores/tabs.ts`'s `openTab`, wrapping `prefill` as
  the D68e `ThreadConfig` initializer; the module→tab-type/subject mapping is a documented
  placeholder until later phases migrate real modules off the flat sidebar), and
  `src/lib/featureFlags.ts`'s `WORKBENCH_ENABLED` (same read-once `import.meta.env` pattern as
  `JOIN_GRAPH_ENABLED`, default off, `VITE_WORKBENCH` override). Flag-off parity against
  `stores/ui.test.ts` ported through the facade (the `setActiveModule`-touching cases only —
  `setActiveTabId`/`clearPendingPrefill` are separate store methods the facade doesn't wrap);
  flag-on routing proven via `vi.stubEnv('VITE_WORKBENCH', 'true')` + `vi.resetModules()` +
  dynamic re-import (the flag is a module-load-time const, same as `JOIN_GRAPH_ENABLED`, so
  flipping it for a test requires a fresh module graph). `grep -rn WORKBENCH_ENABLED src` is
  clean outside `services/navigation.ts` / `lib/featureFlags.ts`; full existing suite green
  (116 files / 1179 tests); `tsc -b` clean; `graphify update .` run.
  **Model column corrected Opus → Sonnet (Update rule 5):** the proposal anticipated an
  adversarial-design-judgment build, but the envelope invariant reduced to a mechanical,
  fully-specified typed-construction proof once §13.3/the leaf doc pinned the exact fields —
  no open design call was left to make, so the orchestrating (Sonnet) session built it inline
  per this repo's efficiency rules rather than routing to Opus.
  **Docs:** none — the leaf doc's DoD is met as written, no spec gap found during the build.
  **Next concrete action:** `▶` moves to `12-workbench/W1` (Workbench scaffold — grid shell,
  act assembly, crude tab host) — its leaf doc does not exist yet; author it from
  `build/12-workbench/README.md` + master §13.3 before building.
  **Blocker:** none.

- **2026-07-24** — **W1 — Workbench scaffold shipped.** Authored
  `build/12-workbench/02-workbench-scaffold.md` from the charter + master §13.3/§19, then built
  to its definition of done inline in the orchestrating session, same as W0 (no docs pipeline —
  implementation is reviewed as code). Added `src/app/workbenchActs.ts` (`selectWorkbenchAct` —
  a pure function of `{ hasDatasets, workerStatus }` deciding among `'act0' | 'act1' | 'shell'`;
  Act 2 gets no branch — §13.3's "no forced gate" already folded it into the shell's mode
  switches, W7's job), `src/app/WorkbenchShell.tsx` (the flag-on composition root: Act 0/Act 1
  render chrome-free per the signed-off hallmark finding that "the VS Code shell only assembles
  Act 3"; the `'shell'` act mounts five empty, individually-targetable placeholder regions
  —explorer/canvas/ai-pane/inspector/status-bar — plus a crude tab host in the canvas region
  that lists `useTabsStore` tabs read-only, no switching/dedup/preservation, W3's job), and
  `src/app/App.tsx` (branches on `WORKBENCH_ENABLED` to render `WorkbenchShell` instead of the
  existing `AppContent` — the flag now lives at the composition root exactly as §13.3 specifies,
  alongside the nav facade from W0). Suite green (118 files / 1190 tests, up from 116/1179);
  `tsc -b` clean; `graphify update .` run. `grep -rln WORKBENCH_ENABLED src/` shows the flag read
  in `App.tsx` (composition root, expected per §13.3) plus the pre-existing W0 sites — no feature
  module branches on it directly.
  **Docs:** none beyond the new leaf doc — §13.3/§19's W1 row already specced the scope; no gap
  found during the build.
  **Next concrete action:** `▶` moves to `12-workbench/W2` (Left explorer — grown from
  `TableList` + a shell-wide selection store) — its leaf doc does not exist yet; author it from
  `build/12-workbench/README.md` + master §13.3 (`explorer (left)` paragraph) + the existing
  `TableList` component before building.
  **Blocker:** none.

- **2026-07-24** — **W2 — Left explorer shipped, narrower scope than §13.3's full explorer
  paragraph — a deliberate call, confirmed with the human before building.** Authored
  `build/12-workbench/03-left-explorer.md` from the charter + master §13.3 + the existing
  `TableList` component, then built to its definition of done inline in the orchestrating
  session (no docs pipeline). **Scope call:** §13.3's explorer paragraph names five things —
  table list, per-table actions, Add data, the share-links list, click-to-Profile — but only
  the table list + selection store are named in the phase-table row itself, and no later
  W-phase claims Add-data or the share-links list the way W4/W7 unambiguously claim map/AI-pane
  content. Given the human's choice between the two, this leaf takes the narrower reading:
  Add-data (`IngestionPanel.tsx`'s drop/URL/sample pieces don't fit a 256px rail as-is — a real
  recompose, not a corollary of growing `TableList`) and the share-links list (reachable-with-
  zero-datasets in the flat sidebar, but the Workbench explorer only mounts under the `'shell'`
  act — the zero-datasets entry point is Act 0/W6's job) are left as **explicitly open scope**
  for a later leaf, not cut. Built: `src/types/tabs.ts` (`TabType` gains `'profile'` — W0 named
  this as the next registry member), `src/stores/selection.ts` (`useSelectionStore` —
  `selectedTableId` + `selectTable`/`clearSelection`; column/map-edge slots deferred to their
  first consumer, W4 for map edges), `src/features/ingestion/TableList.tsx` (grows an optional
  `onSelectTable` prop — additive only, the flag-off `IngestionPanel` call site is unchanged and
  its existing tests pass unmodified), `src/features/explorer/ExplorerPanel.tsx` (new — wraps
  `TableList` with the Workbench wiring: a table click selects it and calls `openDestination
  ('profile', tableId)`; remove/refresh call the same `services/ingestion.ts` functions
  `IngestionPanel` already calls), `src/services/navigation.ts` (module→tab-type mapping gains
  `profile → 'profile'`; every other module still provisionally maps to `'map'`, unchanged), and
  `src/app/WorkbenchShell.tsx` (explorer region mounts `ExplorerPanel`). **A real cross-test
  bug found and fixed during this build, not a design issue:** the new `ExplorerPanel.test.tsx`
  initially raced `Promise.all([import('./ExplorerPanel'), import('../../services/ingestion'),
  ...])` after `vi.resetModules()` — since `../../services/ingestion` was `vi.mock`'d with an
  async factory (`await importOriginal()`), the concurrent imports let the factory resolve
  twice, so the panel's closure and the test's own `ingestion` reference silently landed on two
  different mock instances (calls recorded on one, asserted on the other — 0 calls, no thrown
  error). Fixed by awaiting the mocked module first, sequentially, before importing the panel
  that depends on it — the same hazard would hit any future flag-on test that both mocks a
  module and dynamic-imports a consumer of it in the same `Promise.all`. Suite green (120 files
  / 1200 tests, up from 118/1190); `tsc -b` clean; `oxlint` clean on every changed file;
  `graphify update .` run.
  **Docs:** none beyond the new leaf doc — the scope call above is recorded there and here, not
  as a master/Decision-Record edit, since it's choosing which already-specced piece to defer, not
  changing spec.
  **Next concrete action:** `▶` moves to `12-workbench/W3` (Tab model maturation — singletons/
  artifacts, keep-mounted-first preservation, pinning) — its leaf doc does not exist yet; author
  it from `build/12-workbench/README.md` + master §13.3 + §19's W3 row before building. Separately,
  Add-data and the share-links list remain open scope on the explorer — flag for whichever future
  session picks up explorer polish.
  **Blocker:** none.

- **2026-07-24** — **W3 — Tab model maturation shipped, pinning deferred to W5 — a scope call
  confirmed with the human before building.** Authored `build/12-workbench/04-tab-model-
  maturation.md` from the charter + master §13.3 + §19's W3 row, then built to its definition of
  done inline (no docs pipeline). **Scope call:** §13.3's "pin" is the `[pin]` action that
  promotes a produced SQL/chart result into a new artifact tab (confirmed against the pre-fold
  `UI-REDESIGN-LIFECYCLES.md`/`-SPEC.md`, which the master paragraph condenses) — not a
  tab-pinning toggle. The Workbench has no result-producing content yet (SQL/Pivot/Charts arrive
  in W5 via the strip/palette), so there is nothing real to pin; building the affordance now
  would mean inventing a placeholder artifact type with no consumer. Pinning is deferred to W5,
  same pattern as W2's Add-data/share-links deferral. Built: `src/types/tabs.ts` (`TabKind` +
  `TAB_KIND` — a `Record<TabType, TabKind>` exhaustive over the closed registry, both current
  members classified `'singleton'`), `src/stores/tabs.ts` (`openTab` now dedupes singleton types
  by `(type, subject)` — reuses and activates an existing tab without touching its `initializer`,
  set once atomically per D68e; artifact types keep today's unconditional-append behavior
  unchanged; new `setActiveTab(id)`, a no-op for an unknown id), `src/app/WorkbenchShell.tsx`
  (the crude W1 list host replaced with a real one: clickable headers switch/close via the store,
  and every open tab's content stays mounted simultaneously — `hidden`, never a conditional
  unmount — so `'profile'` tabs can mount the real `ProfileDashboard` component and prove state
  survives a switch; `'map'` tabs still render a placeholder, no content exists before W4; the
  shell now wraps in `EducationalPanelProvider`, which `ProfileDashboard`'s column-card/insight
  "Show SQL" actions require and which nothing under the Workbench branch had ever provided
  before, since nothing mounted needed it). **Deliberately used `ProfileDashboard` directly, not
  `ProfileModule`:** the latter reads the old shell's `useUIStore.activeTabId` global, which
  would make every mounted Profile tab show whichever table that global names instead of its own
  `tab.subject` — wrong the moment two Profile tabs are open at once. The preservation contract
  is proven, not asserted: two Profile tabs opened for two different tables, one tab's local
  table-picker selection changed away from its own subject, switched away and back — the changed
  local state (not store state) is still there, which a remount would have reset. Suite green
  (120 files / 1208 tests, up from 120/1200); `tsc -b` clean; `oxlint` clean on every changed
  file; `grep -rln WORKBENCH_ENABLED src` shows only the existing facade/flag/composition-root
  sites plus one pre-existing comment mention in `WorkbenchShell.tsx` — no new behavioral
  reference; `graphify update .` run.
  **Docs:** none beyond the new leaf doc — the scope call is recorded there and here, not as a
  master/Decision-Record edit, since it narrows *when* an already-specced piece (pinning) lands,
  not what it means.
  **Next concrete action:** `▶` moves to `12-workbench/W4` (Dataset map — multi-table ERD +
  single-table Blueprint face + persistent Verdict band; auto-layout spike first, timeboxed) —
  its leaf doc does not exist yet; author it from `build/12-workbench/README.md` + master §13.3
  ("The dataset map" paragraph) + §19's W4 row before building. W4 is Opus per the Model rule
  (the auto-layout spike is a genuine judgment call) — confirm that proposal holds once the spike
  scope is actually read. Separately, pinning remains open scope, deferred to whichever phase
  first wires a real result-producing tab type (named W5 above).
  **Blocker:** none.

- **2026-07-24** — **`WORKBENCH_ENABLED` default flipped to on, ahead of the W8 cutover — an
  explicit human directive, deliberately partial.** Not a build-order item; `▶` stays exactly
  where it was, at `12-workbench/W4`, and no box above is checked. A fresh, unconfigured session
  now lands on the Workbench instead of the current shell. This is *only* the default flip:
  old-shell code (`AppContent`/`Sidebar`/the module router in `App.tsx`), §13.0's spec, and the
  `WORKBENCH_ENABLED` flag itself are all untouched and stay reachable with
  `VITE_WORKBENCH=false` — deletion remains gated on W4–W7 landing plus soak, per the existing
  W8 row, unchanged. Presented to the human as an explicit choice (flip-only vs. flip-and-delete-
  now) before building; flip-only was chosen precisely because W5's palette hard gate ("palette
  reaches every feature home") isn't met yet — SQL, Pivot, Charts, Correlation, Relationships, AI
  Chat, and Export have no way to open inside the Workbench until then, so deleting the old shell
  today would strand those features entirely. Built: `src/lib/featureFlags.ts` (`WORKBENCH_ENABLED`'s
  read-once default, `false` → `true`), `vitest.config.ts` (new `test.env: { VITE_WORKBENCH:
  'false' }` — pins the test baseline to the old behavior so `App.test.tsx`, `navigation.test.ts`,
  and `ExplorerPanel.test.tsx`'s existing flag-off coverage keeps exercising the old shell
  unchanged, without rewriting any of those suites; their per-test `vi.stubEnv('VITE_WORKBENCH',
  'true')` + `vi.resetModules()` pattern for flag-on coverage is unaffected). Two test names
  reworded for accuracy (`App.test.tsx`, `navigation.test.ts`) since they no longer describe the
  app's real default, only the test-pinned baseline — no assertion logic changed.
  **Docs:** master-first. `DATASCOPE.md` — D71's row gains a dated amendment (flag-flip decoupled
  from cutover, deletion ungated only by W0–W8 landing as before); the "Two shells during the
  flag-parallel period" paragraph (§13, near line 939) gains the same amendment; §19's W8 table
  row drops "flag default flip" (already done) and gains a footnote. Mirrored into
  `build/12-workbench/README.md` (header note + W8 table row). No Decision Record row renumbered
  or removed — D71 amended in place, same pattern as D2/D68's prior dated amendments.
  **Next concrete action:** `▶` is unchanged, still `12-workbench/W4` (Dataset map). Whoever picks
  up W4 should know the Workbench is now what a fresh session sees by default — worth keeping the
  map's placeholder state in mind for anyone testing manually, not just via `VITE_WORKBENCH=true`.
  **Blocker:** none.

- **2026-07-25** — **W4 — Dataset map shipped.** Authored `build/12-workbench/05-dataset-map.md`
  from the charter + master §13.3 ("The dataset map" paragraph) + §19's W4 row, then built to its
  definition of done inline in the orchestrating session (no docs pipeline). The map tab now
  opens on a real multi-table ERD with a persistent Verdict band, or the single-table Blueprint
  face — the W3 `<div>Dataset map (W4)</div>` placeholder is gone. Built: `src/features/map/
  layout.ts` (the longest-path-layering + barycenter auto-layout, ported from the signed-off
  hallmark mock `_implementation/_misc/ideation/hallmark/dataset-map.html` rather than re-derived
  — see the leaf doc's Objective for why that moves this phase off the charter's Opus proposal),
  `src/features/map/Erd.tsx` (field-row-anchored connectors via `getBoundingClientRect`, D24
  solid/dashed confidence, click-to-select), `src/features/profiling/dossier/
  useDatasetBaseline.ts` (the Dossier's fetch-and-build logic extracted out of `DatasetDossier`
  so the map's Verdict band can share it instead of re-fetching — `DatasetDossier`'s own output
  is unchanged), `src/features/map/VerdictBand.tsx` (props-driven, identity + one headline
  `FactRef` under D68c tier-1 discipline, no action buttons — a deliberately slimmer echo of the
  full Blueprint's Verdict), `src/features/map/DatasetMap.tsx` (the tab's actual content: one
  table → `DatasetDossier` unchanged; two or more → `VerdictBand` + `Erd` hero with a
  `ProfileDashboard` side panel on selection, sharing `useSelectionStore` with the W2 explorer),
  and `src/app/WorkbenchShell.tsx` (`TabContent` wired to `DatasetMap`; a new ref-guarded
  auto-open effect opens the map tab once, the first time datasets exist *and* the tab set is
  still genuinely empty — not just "datasets exist," which would force a second map tab into any
  session that already had tabs open, including this repo's own pre-existing
  `WorkbenchShell.test.tsx` "tab host" tests, found the hard way when they broke on first pass).
  **Model column corrected Opus → Sonnet (Update rule 5):** the charter proposed Opus because the
  auto-layout spike looked like an open judgment call; it wasn't, by the time this phase started
  — the hallmark ideation pass had already designed, prototyped, and gotten human sign-off on the
  exact algorithm (and the visual/interaction pattern), so this phase was a typed, tested port of
  a proven reference implementation, the same class of correction as W0's.
  **A real finding surfaced and corrected during the build, not assumed upfront:** the leaf doc's
  first draft claimed barycenter reordering "measurably reduces the naive crossing count" —
  empirically false for the ported algorithm (checked by actually running it against several
  permutations of the mock's own six-table fixture; one went from 5 crossings to 7, worse, not
  better). This is an inherited property of the mock's frozen-per-pass-snapshot heuristic, not a
  porting bug — the leaf doc and `layout.test.ts` were corrected to assert determinism against
  the reference fixture instead of a false improvement guarantee, with the reasoning kept in both
  places so a future session doesn't re-introduce the same wrong assumption.
  **Scope calls, decided before building, not silently:** functional-first styling on the
  existing `--color-*` tokens rather than the mock's dark-HUD skin (confirmed with the human via
  AskUserQuestion — the mock's palette was signed off as visual reference only, and map
  light-mode theming is still an open ideation question this build didn't want to resolve as a
  side effect); no manual ERD/Blueprint toggle (face selection is structural on table count); the
  "selected-table side panel" reuses `ProfileDashboard`, not `DatasetDossier` (which has no
  per-table view); no edge-editing UI in the ERD (stays the W7 inspector's job). Full reasoning
  for each is in the leaf doc. Suite green (124 files / 1238 tests, up from 120/1208); `tsc -b`
  clean; `oxlint` clean on every changed file; `graphify update .` run.
  **Docs:** none beyond the new leaf doc — §13.3/§19's W4 row already specced the scope; no gap
  found during the build.
  **Next concrete action:** `▶` moves to `12-workbench/W5` (Options strip + command palette —
  subject-scoped filter, disabled-with-reason; hard gate: the palette must reach every feature
  home) — its leaf doc does not exist yet; author it from `build/12-workbench/README.md` +
  master §13.3 (the options-strip and command-palette paragraphs) + §19's W5 row before building.
  Pinning (deferred at W3) is named as W5's job in the W3 log — worth checking against the actual
  strip/palette design once that leaf doc exists, not assumed still correct.

- **2026-07-25** — **W5 — Options strip + command palette shipped, mechanism-only — a scope call
  confirmed with the human before building (AskUserQuestion).** Authored `build/12-workbench/
  06-options-strip-palette.md` from the charter + master §13.3 ("The options strip"/"The command
  palette" paragraphs) + §19's W5 row. §13.3's hard gate reads "the palette's action registry must
  reach every feature home," but today only `'map'` and `'profile'` are real `TabType`s — `sql`,
  `pivot`, `charts`, `correlation`, `export` still have none. Asked directly: wire all five for
  real now (new `TabType` members, mounting `SqlModule`/`PivotModule`/`ChartsModule`/
  `CorrelationModule`/`ExportModule` the way W3 mounted `ProfileDashboard`), or build the strip/
  palette mechanism against today's two real destinations, rendering the rest disabled-with-reason.
  **Answer: mechanism-only.** No new `TabType`, no `TAB_KIND` change, no module mounted — wiring
  the five is explicit open scope for a follow-up leaf, not silently assumed done. Pinning
  (deferred at W3, "or whichever phase first wires a real result-producing tab type") stays
  deferred too — this phase wired no artifact-kind tab type, so there is still nothing real to pin.
  **Built:** `src/lib/paletteRegistry.ts` (pure — `buildPaletteEntries(tables)`: the map entry,
  one profile entry per table, then the seven not-yet-wired destinations disabled-with-reason;
  `dossier`/`relationships` omitted as separate entries — both superseded by the map entry, D71),
  `src/features/palette/CommandPalette.tsx` (⌘K/Ctrl+K global toggle, Escape closes, substring
  filter, mounted once in `WorkbenchShell`'s `ShellGrid`), `src/features/map/OptionsStrip.tsx`
  (multi-table face only — the single-table Blueprint already renders its own tier-1 action band,
  D68c, so a second strip there would duplicate it over the same data; filters
  `rankNextActions(tables, tableInsights)`'s dataset-wide list by the selected subject's table
  name, keeping dataset-wide/unresolvable actions regardless of selection — a client-side filter,
  never a second ranker, D58). `MultiTableMap` (`DatasetMap.tsx`) now also destructures
  `tableInsights` from its existing `useDatasetBaseline` call to feed the strip — no new fetch.
  `services/navigation.ts` gained `isDestinationReady()` and `MODULE_LABELS`, the one shared
  source both surfaces check/label from; `WorkbenchShell.tsx` exported its existing
  `MAP_TAB_SUBJECT` constant for the palette's map entry to reuse rather than re-declaring it.
  **A real fallout found while testing, not assumed:** `DatasetMap.test.tsx` already fully
  replaced `services/navigation`'s module (`vi.mock(() => ({ openDestination: ... }))`) — adding
  named exports to that module left them `undefined` in that test file once `OptionsStrip` started
  importing them, caught by the test run itself, fixed by switching that one mock to a partial
  (`vi.importActual` + spread), the same pattern already used in this leaf's own new test files.
  **Consequence, stated plainly (also in the leaf doc):** with nothing else wired, the strip and
  palette mostly render disabled entries right now — the honest state of "mechanism built, content
  not yet mounted," not a bug. Suite green (127 files / 1253 tests, up from 124/1238); `tsc -b`
  clean; `oxlint` clean on every changed file; `graphify update .` run.
  **Docs:** the new leaf doc's inventory table is the accounting for the "every feature home" gate
  — the only doc gap found.
  **Next concrete action:** `▶` moves to `12-workbench/W6` (Acts 0–2 — welcome page + AI defaults
  per the §5.1 switch model) — its leaf doc does not exist yet; author it from
  `build/12-workbench/README.md` + master §13.3 (Act 0/1/2 paragraphs) + §5.1 + §19's W6 row before
  building. The module-wiring follow-up this leaf deferred (`sql`/`pivot`/`charts`/`correlation`/
  `export` as real `TabType`s) is **not** W6's job either per the charter table — it has no named
  phase yet; whoever picks it up should treat it as its own leaf, not fold it into W6 or W7 by
  default.
  **Blocker:** none.

- **2026-07-25** — **W6 — Acts 0–2 shipped, two scope calls confirmed with the human before
  building (AskUserQuestion).** Authored `build/12-workbench/07-acts-welcome-ai-defaults.md` from
  the charter + master §13.3 (Act 0/1/2 paragraphs) + §5.1 + §19's W6 row. **Scope call 1: Act 0
  fidelity.** Functional-first on the existing `--color-*` tokens, same precedent W4 set for the
  map — the signed-off hallmark mock `welcome-act0.html` (light-violet editorial register) is
  content/copy reference only; the mocks' own open "welcome is light-editorial vs. map is
  dark-HUD" register-coherence question stays open ideation scope, not resolved as a side effect
  here. **Scope call 2: AI defaults wiring.** §13.3 attributes "capable-device WebLLM pre-select"
  to W6, but the only surface that could ever display or act on a recommendation — the flat
  Off/Cloudflare/WebLLM/Your-own-key switches — is explicitly W7's ("Right AI pane," charter
  table). Wiring a recommendation into the shared, persisted `useSettingsStore.aiMode` now, with
  nothing yet rendering it, would be the same premature-plumbing this project has deferred before
  (W3's pinning, W5's module-wiring). Answer: **probe + recommendation only, no store wiring** —
  `isCapableDevice()`/`recommendedWorkbenchAIMode()` ship pure and tested; wiring them into
  `aiMode`/`webllmConsent` and rendering the actual switches is named explicitly as **W7's first
  job**, so it isn't silently dropped.
  **Built:** `src/app/WorkbenchShell.tsx` — `Act0`/`Act1` now render a real `Welcome` component
  (headline, the §13.3 passive reassurance line verbatim, a mounted, unchanged `IngestionPanel`)
  instead of the one-line placeholders; both acts render **identical** content on purpose — read
  literally, "unchanged machinery" means `IngestionPanel`'s own `TelemetryPanel` already supplies
  honest phase labels regardless of the outer act, so Act 1 needed no second progress UI, only to
  keep showing Act 0's content while the DuckDB worker finishes booting in the background. The
  W4/W5-era `useSampleAutoLoad` stopgap (and its dedicated test) is deleted — a fresh Workbench
  session now waits for a real user action (drop/URL/sample) instead of silently loading the
  `ecommerce` sample, matching the old shell's own first-run behavior. New `src/app/
  workbenchAIDefaults.ts` (+ test): `isCapableDevice()` reuses exactly the one signal
  `WebLLMDock.tsx`'s own post-consent eligibility check already uses (WebGPU presence) —
  `lib/memoryHeadroom.ts`'s device-memory signal was considered and rejected, since no GB
  threshold for coexisting with the pinned WebLLM model is stated or verified anywhere in the spec;
  `recommendedWorkbenchAIMode()` maps §5.1 directly (`'local-model'` when capable, `'local-only'`
  otherwise), touches no store, and is asserted side-effect-free against `useSettingsStore` in its
  own test. **No forced gate confirmed, not newly built:** grep-checked that `WorkbenchShell.tsx`
  still does not import `AIModeChooser` (the old shell's blocking first-run modal) — the shells
  were already separate composition roots (D71), so the invariant needed verifying, not new code.
  **A real regression caught by the full suite, fixed in the same pass:** `App.test.tsx`'s own
  Workbench-branch test asserted the now-deleted sample-auto-load call through the full `App`
  composition root — not just `WorkbenchShell.test.tsx`'s copy of that assertion. Updated to assert
  the real Act 0 ingestion entry point (`input[type="file"]`) instead, and dropped the now-unused
  `loadDataset` mock override from that file's `services/ingestion` mock.
  **Model column corrected Opus → Sonnet (Update rule 5):** the charter proposed Opus for the
  AI-defaults/consent-surface judgment; by the time this phase started, the two real scope
  questions were resolvable by reading the existing `WebLLMDock`/`AISettingsPanel`/`useSettingsStore`
  code and the W3/W5 precedents for deferring premature wiring, then confirming with the human — the
  same class of correction as W0/W4's.
  Suite green (128 files / 1258 tests, up from 127/1253); `tsc -b` clean; `oxlint` clean on every
  changed file; `graphify update .` run.
  **Docs:** none beyond the new leaf doc — §13.3/§5.1/§19's W6 row already specced the scope; no
  gap found during the build.
  **Next concrete action:** `▶` moves to `12-workbench/W7` (Right AI pane — mode switches + audit
  trail, bottom inspector, status bar consolidation) — its leaf doc does not exist yet; author it
  from `build/12-workbench/README.md` + master §13.3 (AI pane / inspector / status-bar paragraphs)
  + §19's W7 row before building. **W7 must wire `workbenchAIDefaults.ts`'s
  `isCapableDevice`/`recommendedWorkbenchAIMode` into real state and the switch UI** — this leaf
  deliberately left that undone, named here so it isn't missed. The module-wiring follow-up (W5's
  deferral: `sql`/`pivot`/`charts`/`correlation`/`export` as real `TabType`s) still has no owning
  phase — remains open scope for whoever picks it up next, not W7's either by default.
  **Blocker:** none.

- **2026-07-25** — **W7 — Right AI pane, bottom inspector, status bar: in progress, not shipped.
  `▶` stays at `12-workbench/W7`; the box above is intentionally left unchecked.** Authored
  `build/12-workbench/08-right-ai-pane.md` from the charter + master §13.3 (AI pane/inspector/
  status-bar paragraphs) + §5.1 + D24 + §19's W7 row. **Two scope calls confirmed with the human
  before building (AskUserQuestion):** (1) D72 "deeper cloud grounding" (the graduated cloud
  sample-size control) is **deferred to its own follow-up leaf** — nothing builds it anywhere
  today, and it is materially larger than "wire the switches + reuse the audit trail"; (2) the
  status bar's spec'd kill-switch "paused" item is **reactive/last-known only, no polling** — a
  small new store (`stores/pauseSignal.ts`) that request paths report into when they hit a
  `'paused'` code, wired only at the vault path (the AI-router path already, deliberately,
  collapses `'paused'` into `ProviderQuotaExhaustedError`, an existing design decision this leaf
  does not reopen). Both calls are recorded in the leaf doc's own "Scope calls" section.
  **Built and tested this session (roughly the first half of the leaf doc's file list):**
  `stores/selection.ts` gains `selectedColumn`/`selectedEdgeId`/`lastSelectionKind` (additive,
  independent slots — selecting a column never blanks the table slot `Erd`/`DatasetMap` already
  depend on); `stores/inferredEdges.ts` (new) mirrors the raw pre-override `FkEdge[]`
  `useDatasetBaseline`'s existing `loadRelationships` effect already fetches, so a second consumer
  can apply `applyOverrides` itself without a second concurrent DuckDB inference query —
  `useDatasetBaseline.ts` now writes into it alongside its own local state; `stores/
  pauseSignal.ts` (new) + wired into `AISettingsPanel.tsx`'s existing `STORE_FAILURE` vault-error
  branch; `AISettingsPanel.tsx` also gains the `hideModeSwitch` prop (skips only the `Mode`
  fieldset; every old-shell call site is unaffected, its existing tests pass unmodified) —
  `ModeSwitches`/`AIPane` themselves (the components that will pass this prop) are **not yet
  built**. `Erd.tsx` field-rows and wire `<path>`s are now independently clickable
  (`onSelectColumn`/`onSelectEdge`, optional/additive), `DatasetMap.tsx` wires them to the
  selection store; `ColumnCard.tsx` gains an optional `onSelect`/`selected` pair (same additive
  shape as W2's `TableList.onSelectTable`), wired in `ProfileDashboard.tsx`. **`src/features/
  inspector/Inspector.tsx` (new) is fully built and tested**: table scent (name/rows/cols/
  memory + a profile click-through), column scent (semantic + physical type + click-through), and
  the map-edge scent reusing `EdgeEvidencePanel`/`AddRelationshipForm` unchanged, wired to the
  already-shipped `useRelationshipsStore` — the same store `JoinGraphModule` (old shell) already
  uses, so an override made from either surface is the same override (D24). **Not yet built:**
  `ModeSwitches.tsx`, `AIPane.tsx`, `app/useApplyWorkbenchAIDefault.ts` (the actual wiring of
  `workbenchAIDefaults.ts`'s recommendation into `useSettingsStore`), `features/status/
  StatusBar.tsx`, and — the step that makes any of this reachable in the running app —
  `WorkbenchShell.tsx` still has empty placeholder `<div>`s for all three regions;
  `Inspector`/`ModeSwitches`/`AIPane`/`StatusBar` are not mounted anywhere yet.
  Full existing suite green (131 files / 1282 tests, up from 128/1258, all of it from the work
  landed this session); `tsc -b` clean; `oxlint` clean on every changed file; `graphify update .`
  run.
  **Docs:** none beyond the new leaf doc — the two scope calls are recorded there and here, not
  as a master/Decision-Record edit.
  **Next concrete action (cold-start safe):** build to `build/12-workbench/08-right-ai-pane.md`'s
  remaining Spec sections — "Right AI pane" (`ModeSwitches.tsx`, `AIPane.tsx` composing the
  already-unchanged `AIChatModule`, `useApplyWorkbenchAIDefault.ts`) and "Status bar"
  (`StatusBar.tsx`), then wire all three plus the already-built `Inspector` into
  `WorkbenchShell.tsx`'s `ai-pane`/`inspector`/`status-bar` regions (replacing the empty
  placeholder `<div>`s), extending `WorkbenchShell.test.tsx` accordingly. Only once all of the
  leaf doc's acceptance criteria are met: check the W7 box, move `▶` to `12-workbench/W8`, and log
  the completion the same way W0–W6 above did.
  **Blocker:** none — this is a clean stopping point (each landed piece is independently tested
  and green), not a stuck state.

- **2026-07-25** — **W7 — Right AI pane, bottom inspector, status bar: shipped.** Built the
  remainder of `build/12-workbench/08-right-ai-pane.md`'s file list inline in the orchestrating
  session (no docs pipeline), picking up exactly where the prior session's clean stopping point
  left off. New: `src/features/ai/ModeSwitches.tsx` (+ test) — the flat Off/Cloudflare/WebLLM/
  Your-own-key buttons, each writing the same `(aiMode, byokPreference)` pair the equivalent
  `AISettingsPanel` radio choice would have; a disclosure line renders only in cloud mode;
  "Configure workspace" stays visible in every mode ("no forced gate" holds for mode switching
  too). `src/features/ai/AIPane.tsx` (+ test) — composes `ModeSwitches` above the existing
  `AIChatModule`, reused completely unchanged as the pane's hero; a local collapse toggle renders
  a thin re-expand strip and nothing else when collapsed. `src/app/useApplyWorkbenchAIDefault.ts`
  (+ test) — the actual wiring of W6's pure `isCapableDevice`/`recommendedWorkbenchAIMode` probe
  into `useSettingsStore`, ref-guarded like `useMapAutoOpen` (W4) so it fires at most once and
  never overwrites an already-set `aiMode`. `src/features/status/StatusBar.tsx` (+ test) — the
  same ambient facts `StatusConsole` (old shell) already surfaces (worker state, table/row
  counts, last query timing), plus the posture dot (`aiMode === 'cloud'` → amber, else green) and
  the reactive `usePauseSignalStore.lastPaused` notice; a gear opens the shared settings modal.
  `WorkbenchShell.tsx`'s three placeholder `<div>`s (`ai-pane`/`inspector`/`status-bar`) now mount
  `AIPane`/`Inspector`/`StatusBar` for real, `settingsOpen` state lifted into `ShellGrid` so both
  the AI pane's "Configure workspace" and the status bar's gear open the same `AISettingsPanel
  hideModeSwitch` modal instance — extended `WorkbenchShell.test.tsx` with a new describe block
  proving all three regions render real content and both openers reach the same modal.
  **A real test-coverage gap found and fixed, not assumed complete:** the prior session's `Erd.tsx`
  already had `onSelectEdge`/`onSelectColumn` click handlers wired (built as part of the Inspector
  work), but `Erd.test.tsx` — a pre-existing file from W4 — had never been extended to cover them,
  so the leaf doc's own "clicking an ERD wire selects that edge…; clicking a field row selects both
  the table and the column" acceptance criterion was unverified. Added five tests to `Erd.test.tsx`
  covering wire click/keyboard selection, `data-selected` on the wire, field-row click selecting
  both table and column (the click bubbles to the card's own `onSelectTable` — confirmed as intended
  by re-reading the criterion, not assumed), and a no-regression case for call sites that omit the
  new optional props. All nine of the leaf doc's acceptance criteria are now met and checked off
  there; the ones this session didn't newly build (selection-slot independence, edge
  override-controls wiring, the single-`loadRelationships`-fetch guarantee, the vault
  paused/non-paused signal split) were already covered by tests the prior session landed —
  verified by reading `Inspector.test.tsx`, `selection.test.ts`, and `AISettingsPanel.test.tsx`
  directly rather than assumed from the log. Suite green (135 files / 1312 tests, up from 131/1282);
  `tsc -b` clean; `oxlint` clean on every changed/added file; `graphify update .` run (topology
  unchanged on the second run, after the `Erd.test.tsx` addition).
  **Docs:** leaf doc's acceptance-criteria checkboxes all checked; no master/Decision-Record edit —
  §13.3/§5.1/D24/§19's W7 row already specced the scope, and the two scope calls (D72 deferral,
  reactive-only pause signal) were already recorded in the leaf doc and BUILD-ORDER by the prior
  session.
  **Next concrete action:** `▶` moves to `12-workbench/W8` (Viewer mode + cutover — §9.1
  ship-timing, flag default flip already done ahead of schedule per the 2026-07-24 human
  directive, soak, then old shell + master §13.0 deleted) — its leaf doc does not exist yet;
  author it from `build/12-workbench/README.md` + master §13.3/§9.1/§19's W8 row before building.
  W8 is Opus per the Model rule (the cutover/deletion judgment) — confirm that proposal holds once
  the row is actually picked up, same as every prior phase's correction check. Separately, the
  module-wiring follow-up (W5's deferral: `sql`/`pivot`/`charts`/`correlation`/`export` as real
  `TabType`s) still has no owning phase and is not W8's either by default — flag for whoever picks
  it up, since W8's "palette reaches every feature home" framing may force the question during
  cutover even if it isn't W8's own scope to build.
  **Blocker:** none. Still uncommitted — Justin commits.

- **2026-07-25** — **New phase inserted: `12-workbench/W7.5` (Module wiring), between W7 and
  W8 — `▶` moves there, not to W8.** Picking up W8 per the prior entry's "next concrete action"
  surfaced that its own gate (§19: "every capability reachable in the Workbench, no orphaned
  exports") cannot pass yet — `src/lib/paletteRegistry.ts`'s `NOT_YET_WIRED` list still carries
  SQL, Pivot, Charts, Correlation, and Export, exactly the five W5 deliberately left disabled-
  with-reason and every log since flagged as "no owning phase." Confirmed with the human
  (AskUserQuestion) before doing anything else: **split the gap into its own phase, sequenced
  strictly before W8**, rather than folding it into W8's leaf or building W8's cutover mechanics
  against a failing gate. Docs updated master-first: `DATASCOPE.md` §19's W0–W8 table gains the
  W7.5 row (+ a dated note explaining the insertion) and W8's "Depends on" cell now reads "all,
  incl. W7.5"; mirrored into `build/12-workbench/README.md`'s phase table. This file's own
  checklist gains the W7.5 row between W7 and W8; the `▶` sits there, W8 remains unchecked and
  un-arrowed.
  **Next concrete action:** author `build/12-workbench/09-module-wiring.md` from this entry +
  master §19's new W7.5 row + the existing `TAB_TYPE_BY_MODULE`/`paletteRegistry.ts`/
  `OptionsStrip.tsx` code (the seams W5 already built generically, just not yet populated), then
  build to its DoD: `TabType` gains `'sql' | 'pivot' | 'charts' | 'correlation' | 'export'`
  (`TAB_KIND` singleton, matching the old shell's own single-instance-per-module semantics — none
  of these are per-table); `TAB_TYPE_BY_MODULE` gains the five identity mappings; `WorkbenchShell
  .tsx`'s `TabContent` mounts the five existing modules; `paletteRegistry.ts` moves them out of
  `NOT_YET_WIRED` into real entries. A real design gap found while reading the modules, not
  assumed away: `useThreadPrefill()` unconditionally reads the old shell's global `useUIStore
  .pendingPrefill`, which the Workbench's `openTab` path never writes to, and `ChartsModule`
  separately reads `useUIStore.activeTabId` to select its initial chart sub-type — both already
  exercised today by real `RankedAction`s (`lib/capabilities.ts` has live `module: 'charts', tab:
  'time-series'`/`'categorical'` entries the W5 `OptionsStrip` already calls `openDestination`
  with) — so mounting these modules unchanged would silently drop "opens on the answer" (D68e)
  for every one of them, not a hypothetical gap. Resolution to build against: give
  `useThreadPrefill` an optional override param (explicit value, including `null`, always wins;
  `undefined` preserves today's global-store behavior byte-for-byte, so every old-shell call site
  is unaffected) and thread `tab.initializer?.prefilledConfig` / `tab.subject` down from
  `TabContent` the same way W3's `ProfileDashboard initialTableId={tab.subject}` already does —
  no change to the generic `openDestination`/`ThreadConfig` facade itself, since `tab ?? module`
  already produces the right per-module subject for all five without a new constant.
  **Blocker:** none.

- **2026-07-25** — **W7.5 — Module wiring shipped.** Built to `build/12-workbench/
  09-module-wiring.md`'s definition of done inline in the orchestrating session (no docs
  pipeline — implementation is reviewed as code). SQL, Pivot, Charts, Correlation, and Export are
  now real, reachable, singleton Workbench tabs — the last five orphans on §19's W8 row-walk
  gate. Built: `src/types/tabs.ts` (`TabType`/`TAB_KIND` gain the five members, all `'singleton'`);
  `src/services/navigation.ts` (`TAB_TYPE_BY_MODULE` gains the five identity mappings —
  `isDestinationReady`/`MODULE_LABELS`, already generic since W5, pick these up with no changes of
  their own); `src/hooks/useThreadPrefill.ts` (gains an optional `override` param — an explicit
  value, including `null`, always wins over the old shell's global `pendingPrefill`; `undefined`,
  i.e. every existing call site, is byte-for-byte unchanged); `SqlModule`, `PivotModule`,
  `PivotBuilder`, `CorrelationModule` (each gains an optional `prefill` prop threaded into
  `useThreadPrefill`), `ChartsModule` (gains `prefill` and `requestedTab`, the latter overriding
  the old shell's global `activeTabId` the same way); `src/app/WorkbenchShell.tsx` (`TabContent`
  mounts all five, passing `tab.initializer?.prefilledConfig ?? null` and, for charts,
  `tab.subject` — the same per-tab-instance prop-threading W3 established for `ProfileDashboard
  initialTableId`, never a second global); `src/lib/paletteRegistry.ts` (the five move from
  `NOT_YET_WIRED` into a new `WIRED_MODULES` list, `NOT_YET_WIRED` now holds only `ai`/
  `ingestion`); `src/features/palette/CommandPalette.tsx` (`activate()` gains an `open-module`
  branch). `src/features/map/OptionsStrip.tsx` needed **no changes** — it already called
  `openDestination` generically; populating `TAB_TYPE_BY_MODULE` alone lit up its previously-
  disabled `charts`/`correlation`/`sql` strip actions.
  **A real design gap found while reading the modules, not assumed away (detailed in the leaf
  doc's own Scope call section):** `useThreadPrefill` and `ChartsModule`'s `activeTabId` read both
  unconditionally pointed at the old shell's global `useUIStore`, which the Workbench's `openTab`
  path never writes to — mounting the five modules unchanged would have silently dropped D68e
  "opens on the answer" for every one of them, even though `lib/capabilities.ts` already has live
  `RankedAction`s (`module: 'charts', tab: 'time-series'`/`'categorical'`) that W5's `OptionsStrip`
  was already calling `openDestination` with, just disabled. Fixed via the `override`/prop-
  threading design above rather than a second global or a change to the `openDestination`/
  `ThreadConfig` facade.
  Four pre-existing tests asserted the old "not yet wired" state directly (`navigation.test.ts`'s
  fallback-to-`'map'` case used `'sql'` as its example; `paletteRegistry.test.ts`'s seven-entry
  count; `OptionsStrip.test.tsx`'s disabled-charts case; `CommandPalette.test.tsx`'s disabled-sql
  case) — updated in place to exercise the new reality (an `'ai'`-based fallback example; the
  five-wired/two-remaining split; charts now enabled and calling through; sql now enabled and
  calling through), each also gaining a positive case proving the new behavior rather than just
  losing the old assertion. New coverage: `useThreadPrefill.test.ts` (no test file existed before);
  one override-proving case each in `SqlModule.test.tsx`, `PivotBuilder.test.tsx`,
  `ChartsModule.test.tsx` (two cases — the override winning, and an unmatched override falling
  back), `CorrelationModule.test.tsx`; a new `isDestinationReady` describe block in
  `navigation.test.ts`; a new `WorkbenchShell.test.tsx` describe block mounting all five tab types
  through the real shell. **A real test-isolation bug found while writing that last block, not
  assumed away:** this file has no RTL auto-cleanup between tests (a repo-wide convention already
  noted in `PivotBuilder.test.tsx`'s own comments), and the file's newer describe blocks query via
  `getByText`/`screen`-equivalent bindings that search the whole `document.body` — fine for a
  single-test block, but a five-test block sharing similar content (multiple "Run" buttons inside
  one `SqlModule` render alone, for instance) needs each assertion scoped to that render's own
  `container` via `within(container)`, matching the "tab host"/"keep-mounted" blocks' existing
  convention earlier in the same file. Suite green (136 files / 1332 tests, up from 135/1312);
  `tsc -b` clean; `oxlint` clean on every changed file; `graphify update .` run.
  **Docs:** leaf doc's acceptance-criteria checkboxes all checked; master §19/D71 already carry
  the W7.5 insertion from the prior log entry — no further master edit, this entry is the
  completion record.
  **Next concrete action:** `▶` moves to `12-workbench/W8` (Viewer mode + cutover) — its leaf doc
  does not exist yet; author it from `build/12-workbench/README.md` + master §13.3/§9.1/§19's W8
  row before building. The row-walk gate this phase existed to satisfy should now re-check clean
  (every §13.0/§6-inventory capability reachable in the Workbench) before W8's own cutover work
  begins — worth a fresh walk against the inventory table, not assumed from this entry alone. §9.1
  ship-timing and the old-shell deletion itself remain explicitly the human's call, confirmed
  2026-07-25: build W8's mechanics first, decide and execute cutover as a separate, explicit step
  at the end.
  **Blocker:** none. Still uncommitted — Justin commits.

- **2026-07-25** — **W8 — Viewer mode built and tested; cutover explicitly not started. `▶`
  stays at `12-workbench/W8`; the box above stays unchecked, by design.** Authored
  `build/12-workbench/10-viewer-cutover.md` from the charter + master §13.3 (viewer-mode
  paragraph, cross-cutting contracts), D62/D63/D45, and §19's W8 row, splitting the leaf's own
  acceptance criteria into "viewer mode" (built this session) and "cutover" (explicitly deferred
  — §9.1 ship-timing, the soak, and the old-shell + master §13.0 deletion remain the human's
  call, confirmed 2026-07-25 on the prior W7.5 entry: "build W8's mechanics first, decide and
  execute cutover as a separate, explicit step at the end").
  **Scope call (confirmed with the human before building, AskUserQuestion):** the only renderer
  that existed for a `.dsps` document (`SharedStructureReportView`) is a floating modal showing
  table/column data only — no insights, no relationships, no D45 provenance/snapshot fields, no
  D63 band, no named exits — so it couldn't satisfy the spec's literal requirements by reuse.
  Asked directly: **map-forward** (thread a `StructureReport`-derived shape through
  `DatasetMap`/`Erd`, which assume a live DuckDB-backed `useDatasetBaseline` — a real refactor of
  shipped code) vs. **structure-forward** (new non-modal chrome over the `StructureReport`'s
  existing shape, using the internal cut line D62 itself names — "degrades to the single-table
  Blueprint face / static HTML report render"). **Answer: structure-forward** — consistent with
  every prior phase's mechanism-first precedent (W5/W6/W7) and the D27 ship-date discipline; the
  map-forward richness stays available as a named, explicit follow-up leaf, not foreclosed.
  **Built:** `src/features/viewer/ViewerMode.tsx` (+ test) — the Workbench's read-only render of
  `useDspsReceiverStore`'s `document`/`error`: explorer region (flat read-only table list),
  canvas region (per-table cards extending `SharedStructureReportView`'s shape, plus every
  insight's D45 provenance tag/snapshot label — never rendered by the old modal), inspector
  region (`report.relationships` as a flat evidence list — deliberately **not** a reuse of
  `EdgeEvidencePanel`, whose `onRemove`/`onRepoint` props are required, not optional, and which
  expects a live `FkEdge` with an `id`; forcing a read-only mode onto an edit-only component would
  have been scope creep the structure-forward call already ruled out), status bar (table count +
  the two named exits — Export report re-downloading the identical document, Start my own session
  calling the store's `close()`). `src/features/viewer/TrustChromeBand.tsx` (+ test) — the D63
  slot: the D45 structure-only claim + `generatedAt`, and an honest **"Unsigned" / "Signing not
  yet available"** state for the signer/signature fields rather than a fabricated one (D63.2,
  signed `.dsps`, is its own unbuilt design round). `src/app/WorkbenchShell.tsx` — one new branch
  at the top of `WorkbenchShell()`, checked before act selection, so a dropped `.dsps` presents
  regardless of dataset state: `if (dspsDocument || dspsError) return <ViewerMode ... />`.
  **A real, live gap found while reading the code, not assumed:** `IngestionPanel.tsx`'s
  `.dsps`-drop branch (built at `08-persistence/03-dsps-spec`) already populates
  `useDspsReceiverStore` from inside the Workbench today, since Act 0/1's `Welcome` (W6) mounts
  that exact, unmodified component — but nothing in `WorkbenchShell.tsx` read the store before
  this session, so a `.dsps` dropped into a fresh Workbench session (the default since the
  2026-07-24 flag flip) silently vanished. This session's branch is the fix, not new drop-sniffing
  logic — confirmed **no other real drop surface exists anywhere in this codebase**: no
  whole-window listener in either shell, and the explorer's own Add-data affordance remains W2's
  own open deferral, so "every drop surface sniffs `dsps_version`" reduces honestly to the one
  surface that exists.
  **Row-walk gate re-checked (§19: "every §13.0/§6-inventory capability reachable in the
  Workbench, no orphaned exports"):** walked §13.0's sidebar table + §6's architecture diagram
  against `paletteRegistry.ts`/`TAB_TYPE_BY_MODULE` — clean, nothing orphaned; the leaf doc's own
  table records the walk. `NOT_YET_WIRED` still names only `ai` (by design, the always-on pane)
  and `ingestion` (W2's own logged deferral).
  Suite green (138 files / 1345 tests, up from 136/1332); `tsc -b` clean; `oxlint` clean on every
  changed file; `graphify update .` run.
  **Model:** built inline in the orchestrating (Sonnet) session, not escalated to Opus — the
  charter's Opus proposal was for "the cutover/deletion judgment," but that judgment is
  explicitly the human's, deferred whole rather than resolved by any model tier; the mechanical
  work actually built this session (wiring an already-shipped store into new, scoped-down shell
  chrome) is the same class of correction as W0/W4/W6's Opus→Sonnet corrections, so no column
  change was needed — the charter's Opus tag was always about the deferred half.
  **Docs:** the new leaf doc; no master/Decision-Record edit — D62/D63/§13.3/§19's W8 row already
  specced viewer mode's scope, and the structure-forward scope call narrows *how* it's built, not
  what it means.
  **Next concrete action:** cutover itself — §9.1 ship-timing (Workbench-only, old-shell-only, or
  both, for D27's Oct 6 date), the soak, and deleting the old shell (`AppContent`/`Sidebar`/the
  module router in `App.tsx`) + master §13.0 (master-first) — is explicitly **not** started.
  Whoever picks this up next should raise the ship-timing question with the human directly rather
  than assuming a default; once decided, the deletion itself is master-first per this file's own
  Update rules, and the leaf doc's cutover checkboxes are the acceptance criteria to build against.
  Only once *both* halves of the leaf doc are checked does the W8 box above check and `▶` move to
  `10-studio` (v1, gated on profiling proven in the wild — a different kind of gate entirely).
  **Blocker:** none — this is a clean stopping point (viewer mode is independently tested and
  green), not a stuck state. Still uncommitted — Justin commits.

- **2026-07-25** — **W8 cutover: §9.1 decided Workbench-only, soak accepted, master doc updated
  master-first. Code deletion explicitly not started — `▶` stays at `12-workbench/W8`, the box
  above stays unchecked.** Verified the tree first rather than trusting the prior entry's numbers
  cold: full suite green, 138 files / 1345 tests, matching the last log entry exactly. Raised
  §9.1 ship-timing directly with the human (AskUserQuestion, per this leaf doc's own standing
  instruction that this is never a model's call to default): **Workbench-only**, over keeping
  both shells longer, reverting to old-shell-only, or deferring. Asked a second, narrower
  question — whether the on-by-default period since 2026-07-24 plus the full W4–W8 build/test
  cycle counts as the soak, or whether an explicit further wait was wanted — **confirmed it
  counts; delete now** (not assumed).
  **Investigation before any edit, not assumed from `AppContent`'s import list:** traced every
  old-shell-only file against the rest of the codebase, since most of `AppContent`'s imports
  (SqlModule, ChartsModule, AISettingsPanel, etc.) are Workbench-shared as of W7.5 and must not
  be deleted. Confirmed genuinely old-shell-only: `Sidebar`/`SidebarCard`/`SidebarGroup`,
  `EducationalPanel` (the component, not its Context/hook — those are Workbench-shared),
  `StatusConsole`, `AIModeChooser`, `DossierModule`, `ProfileModule`, `JoinGraphModule` (not
  `JoinGraph.tsx`, shared with `Erd.tsx`), `SharedStructureReportView`. **Two real functional
  gaps found, not just a deletion list:** `WebLLMDock` (the D70 download-consent surface — it's
  what actually calls `warmWebLLM()`) is only mounted by `App.tsx` today, `WorkbenchShell.tsx`
  never mounts it; and the `?share=` URL-opening flow (§12.3) has zero handling anywhere in
  `WorkbenchShell.tsx` — both would silently regress for 100% of users post-cutover if deleted
  around rather than ported. Designed (not yet built) the port: `WebLLMDock` mounts in
  `ShellGrid()` above the status bar; a new `useShareLinkOpener()` hook (colocated like the
  existing `useMapAutoOpen`) routes a structure-report share through
  `useDspsReceiverStore.getState().open(...)`, reusing `ViewerMode` as the renderer for free
  (its own doc comment already frames the store as shared by two producers); a full-dataset
  share needs no extra code since `loadSharedDataset` already registers it and the existing
  `useMapAutoOpen` picks it up. Full findings, the exact file-by-file execution order, and the
  three test files whose `VITE_WORKBENCH` stub ceremony becomes dead weight once the flag goes
  (`App.test.tsx`, `navigation.test.ts`, `ExplorerPanel.test.tsx`) are written up at
  `/HANDOFF-W8-CUTOVER.md` (repo root) — not repeated here.
  **Mid-session redirect from the human:** first told to stop and hand off before any file was
  touched; then clarified to finish the doc updates first, then hand off the code. Docs were
  **not** pre-planned as a separate pass — this is that clarification being honored, not scope
  creep.
  **Docs, master-first, actually landed this session (not just planned):** `DATASCOPE.md` — new
  **Revised (13)** entry; §13's intro rewritten (Workbench is the only shell, code deletion
  named as a tracked gap); **§13.0 deleted**; §13.1's two flag-conditional sentences (Blueprint-
  forward opening, the `.dsps` receiver parenthetical) simplified; **§13.2 retired to a stub**
  (its surviving substance — D68a/c/e/f — pointed at §13.3/§9, not renumbered, so cross-refs and
  the question-index stay valid); §13.3's heading/intro de-flagged; the palette paragraph's
  `§13.0/§6-inventory` citation narrowed to `§6-inventory` (two more occurrences of the same
  fix in §19); §5.1's heading and Workbench-consent paragraph de-shell-conditioned; D2, D71,
  D68, D48, D70 Decision-Record entries amended in place with dated notes (append-only
  convention, not rewritten); §19's heading/intro/W7.5-row/W8-row updated; TOC line 40 fixed.
  Three `§16` file-structure lines (`featureFlags.ts`, `navigation.ts`, `WorkbenchShell.tsx`'s
  comments) were **deliberately left untouched** — they mirror actual code comments, and the
  code hasn't changed yet; updating them now would make the doc describe code that doesn't
  exist, the same drift problem in the other direction. Mirrored into
  `build/12-workbench/README.md` (header, phase table, palette citation). This leaf doc
  (`10-viewer-cutover.md`)'s two decision-only cutover criteria (§9.1 decided, soak confirmed)
  are checked with evidence; the two code-deletion criteria stay open.
  **Docs done; code not started.** `HANDOFF-W8-CUTOVER.md` at the repo root carries the full
  execution plan for the next session: the file-by-file list (delete/modify/add), the two ported-
  behavior designs, the verification steps (suite, `tsc -b`, `oxlint`, `graphify update`, and a
  live-browser check this session never reached), and the leaf-doc/BUILD-ORDER close-out that
  follows once code lands. `▶` deliberately does **not** move to `10-studio` — W8's box stays
  unchecked until the code half closes too.
  **Blocker:** none — a clean, intentional stopping point per explicit human instruction, not a
  stuck state. Still uncommitted — Justin commits.

- **2026-07-25** — **W8 cutover: code landed. Both halves of the leaf doc now checked — W8 box
  checked, `▶` moves to `10-studio`.** Picked up `/HANDOFF-W8-CUTOVER.md`'s execution plan cold,
  per its own "safe to pick up cold" framing; verified Part 3a/3b (master doc + README mirror)
  before touching code rather than trusting the handoff's claim — both confirmed already correct.
  **Code, in the handoff's own dependency order:** `featureFlags.ts` (`WORKBENCH_RAW`/
  `WORKBENCH_ENABLED` removed) → `navigation.ts` (flag-off branch removed from `openDestination`,
  `useUIStore` import dropped, `SidebarModule` now type-only) → `navigation.test.ts` (collapsed
  to one plain `describe('openDestination', …)`, static imports, `isDestinationReady`'s block
  untouched) → `WorkbenchShell.tsx` (`WebLLMDock` mounted in `ShellGrid()` above the status bar;
  new `useShareLinkOpener()` hook, same ref-guarded shape as `useMapAutoOpen`, routing both
  share-link outcomes through `useDspsReceiverStore`) → `App.tsx` (`AppContent` deleted, `App()`
  now just `return <WorkbenchShell />`) → `App.test.tsx` (rewritten to a smoke test; the share-
  link/`.dsps` describe blocks were **not** separately ported — `WorkbenchShell.test.tsx`'s
  existing viewer-mode block already covered the `.dsps` half functionally identically, only the
  share-link half needed genuinely new tests) → `WorkbenchShell.test.tsx` (three new share-link
  tests against a mocked `loadSharedDataset` + one WebLLM-dock-mounts test) →
  `ExplorerPanel.test.tsx` (simplified to a plain `resetStores()` helper, static imports, the
  `vi.resetModules()`/dynamic-import dance dropped) → `vitest.config.ts` (`VITE_WORKBENCH` env
  pin removed) → `dspsReceiver.ts` (doc comment fixed — both producers now name `ViewerMode`) →
  the 10 confirmed old-shell-only files + 7 test files deleted, each re-verified via a fresh
  exact-import grep first (not trusted cold from the handoff).
  **Verification:** `tsc -b` clean; full suite **131 files / 1289 tests green** (down from
  138/1345 — file-count drop matches the 7 deleted test files exactly, sanity-checked per this
  file's own "don't just check still-passes" rule); `oxlint` clean (one pre-existing, unrelated
  warning in `_misc/spike-webllm/smoke.mjs`); `graphify update .` run, real topology change (4038
  nodes/7384 edges). **Live-browser check — the step the prior session never reached:** Playwright
  against a real `npm run dev` Chromium session (no project launch skill existed for this app;
  none authored, since nothing beyond the standard Vite dev-server pattern was needed). Confirmed
  all four §3d criteria: (a) fresh load boots straight to Act 0, no flag/env, no old header/
  sidebar, zero console errors; (b) a dropped `.dsps` file renders `ViewerMode` with the right
  content; (c) a `?share=` URL against a mocked structure-report endpoint (Playwright route
  interception on the persistence endpoint) renders `ViewerMode` and strips the query param; (d)
  loading a real sample dataset mounts the shell grid and the WebLLM consent dock appears with
  its real copy, under real eligibility conditions (aiMode set, no BYOK key, WebGPU present).
  Screenshots confirm all four visually.
  **Docs, master-first:** `DATASCOPE.md` gains a new **Revised (14)** entry (append-only,
  Revised(13) left as historical record); the D71 decision-record row, §13's intro paragraph,
  §19's intro + W8 row + its flag-flip note, and §16's three deliberately-untouched file-structure
  lines (`featureFlags.ts`/`navigation.ts`/`WorkbenchShell.tsx` comments, per Part 0's own
  instruction to update these only once the code landed) are all updated from "code pending" to
  "code landed 2026-07-25." Mirrored into `build/12-workbench/README.md` (header + cutover
  paragraph) and this leaf doc (`10-viewer-cutover.md`'s header, Files section, both remaining
  cutover checkboxes, and Definition of done).
  **Next concrete action:** `▶` moves to `10-studio` (v1, gated on "profiling proven in the
  wild" — flagged explicitly per the section's own standing gate, not started).
  **Blocker:** none. Still uncommitted — Justin commits. `/HANDOFF-W8-CUTOVER.md` is now safe to
  delete once this is committed, same convention as the earlier `/HANDOFF-WORKBENCH-FOLD.md`.

- **2026-07-25** — **`10-studio/03 semantic-dbt-export` reassigned from `Opus` to
  "unscheduled; assign a model when pulled forward," matching `11-ml`'s posture — Justin's
  explicit call ("not a priority").** Build-order status only, same pattern as the earlier
  `08-persistence/03-dsps-spec` deferral: no master edit, D11/D12 untouched — the row keeps its
  place under `10-studio` (Phase 9 still exists, still depends on Phase 8), this only removes
  the standing model commitment and any implication it's next in line once 01/02 land. `▶`
  stays at `10-studio` (01 quality-report is still the first unstarted row); 03 simply carries
  no schedule until someone picks it up.
  **Docs:** none — this doesn't reopen D11's "not an optional extension" framing or §19's Phase
  9 scope, only defers *when* anyone commits to building it, which BUILD-ORDER.md already owns
  without touching the spec.
  **Blocker:** none.

- **2026-07-25** — **v0.69 chartered: the hallmark visual replication. The Workbench's deferred
  visual layer becomes a named tier with six phases, and its token layer works.** W0–W8 built the
  shell against the pre-existing generic tokens and deliberately deferred the mocks' visual
  system; that deferral now has a home (§19's v0.69 subsection, new
  `build/13-hallmark-replication/README.md`, V1–V6) instead of living only in a code comment.
  **Charters no new decision** — D71 already names the five signed-off mocks as the visual
  reference, so no Decision-Record row was created or edited; §19 gains a tier subsection and a
  `Revised (15)` entry, nothing more.
  **What now works:** the app renders on the mocks' dark HUD system rather than the generic
  violet light/dark theme. `src/app/theme.css` (44 → ~250 lines) carries the seven-surface depth
  ladder (`void` → `elev`) with translucent rules, the amber active register, the purple copilot
  register, and the mono-first type scale; `design.md` at the repo root is the locked system every
  later surface defers to, `tokens.css` the framework-free copy. Geist + JetBrains Mono are
  **self-hosted** via `@fontsource-variable/*` rather than the mocks' Google Fonts CDN — a
  third-party font request on every load contradicts this product's "nothing leaves your machine"
  posture; roman only, since the system bans italic headers. The 76 existing components were not
  rewritten: they reference only seven token names, which are kept as an alias layer onto the new
  ladder, so the swap propagated through the whole app in one file.
  **Three real defects found and fixed, not papered over.** (a) `color-scheme: dark light` is
  silently normalised back to `light dark` by Lightning CSS, which would have handed light
  scrollbars and form controls to any user with no OS preference against dark surfaces — now
  declared per-register (`dark` in `:root`, `light` in the media query), verified in the built
  bundle, not just the source. (b) The mocks' `--c-fg-3` measures **3.16:1** against canvas while
  carrying real text (counts, role badges, column headers) — re-solved to clear 4.5:1 (4.57 dark /
  4.79 light). (c) `--color-bg-subtle` was referenced by a component but never defined — a dead
  `var()`, now real. Every colour was converted by round-tripped OKLCH math rather than eyeballed;
  every ink/accent pair clears 4.5:1 against its own surface and every value sits inside sRGB
  gamut. The light register is the invented part (no mock specifies one) and its two
  non-mechanical inversions — accents darkened ~22 points of lightness, hover/selected flipped to
  darker-than-canvas — are recorded in `design.md`, because a mechanical ladder inversion makes
  hover states vanish in a light UI.
  **Verification:** `tsc -b` clean; `vite build` clean (10 woff2 subsets emitted); suite **131
  files / 1289 tests green** — exactly the W8 baseline, so the token swap regressed nothing;
  `oxlint` clean apart from the one pre-existing unrelated warning in
  `_misc/spike-webllm/smoke.mjs`. The emitted CSS was inspected rather than trusted: the new
  tokens resolve because Tailwind's `@theme` output lands in `@layer theme` while the real `:root`
  is unlayered, so unlayered always wins the cascade — the self-referential
  `--color-x: var(--color-x)` pattern the file already used is sound, not order-luck. **No live
  browser check was run** — the session stopped before one.
  **Deviation, logged per Handoff rule 3:** V1's code landed **ahead of its own leaf doc**,
  breaching §13.3's binding constraint (no `src/` code before the phase's leaf doc). The session
  began as an unscoped design request, not a build-order pickup, and the charter was written after
  the fact. V1's box stays **unchecked** per Update rule 1 — there is no definition of done to
  check it against yet. Writing V1's leaf doc against what shipped is its remaining work.
  **Open call, flagged not defaulted:** Act 0's signed-off mock is theme *Specimen* — light paper,
  Fraunces serif, violet accent — handing off to a dark amber HUD. That seam is a real coherence
  risk and wants a human decision (V6). Act 0 currently renders on the HUD tokens, which is what
  the shipped code already did; its Specimen mock stays unported.
  **Next concrete action:** write V1's leaf doc (`build/13-hallmark-replication/01-token-layer.md`)
  documenting the landed token layer against a real DoD, then check its box. V2 (shell chrome —
  the title bar is a sixth region W1 never scaffolded, so it is additive UI, not a re-skin) is the
  first phase needing new code, and needs its own leaf doc first. Phase 2 was **stopped
  deliberately** mid-session by human instruction to be picked up in a fresh chat — no component
  files were edited, so the working tree holds only the token layer plus these docs.
  **Blocker:** none. Still uncommitted — Justin commits.

- **2026-07-25** — **V1 — Token layer + locked system: leaf doc landed, box checked. No code
  changed this session.** Authored `build/13-hallmark-replication/01-token-layer.md` against what
  the previous session shipped — the one piece of V1 that was outstanding, since the code half was
  already in and the box was held open only by the missing definition of done (Update rule 1).
  The doc records the objective (a one-file token swap propagating through the seven-name alias
  layer, not 76 rewrites), the four scope calls (alias layer over rewrites; self-hosted fonts over
  the mocks' Google Fonts CDN, since a third-party request per load contradicts D2/§2; a derived
  light register rather than silently regressing the light face; Act 0's Specimen register flagged,
  not defaulted), the file-by-file spec of `design.md`/`tokens.css`/`theme.css`/`package.json`, and
  the three defects the build fixed rather than ported (the Lightning-CSS `color-scheme`
  normalisation, the mocks' 3.16:1 `--c-fg-3`, the dead `--color-bg-subtle` `var()`).
  **Every acceptance criterion was re-run against the current tree, not transcribed from the prior
  session's log** — the point of writing a DoD after the fact is that it has to be checkable now:
  `tsc -b` clean; suite **131 files / 1289 tests green**, exactly the W8 baseline, which is the
  criterion that actually proves an alias-layer swap changed no behaviour (a *changed* count would
  fail it, so "still green" alone is not the test); `vite build` clean; the built bundle inspected
  for the two things source inspection can't settle — `color-scheme` emerges single-valued per
  register (`dark` in `:root`, `light` in the media query), and there is no `fonts.googleapis`/
  `fonts.gstatic` reference anywhere in `dist/`, only real `@font-face` blocks for the self-hosted
  variable faces; `oxlint` clean apart from the one pre-existing unrelated warning in
  `_misc/spike-webllm/smoke.mjs`. Live-browser verification is **not** a criterion on this leaf and
  is not silently skipped — it is V6's, which owns the tier-wide contrast/slop-test gate; tokens
  alone render no new chrome, so there is nothing visual to check until V2–V5 land. The deviation
  (code before leaf doc) is recorded in the leaf doc itself and in the section README, not just
  here.
  **Docs:** the new leaf doc, plus `build/13-hallmark-replication/README.md`'s per-phase-leaves
  list ("None exist yet" → V1's link). No master or Decision-Record edit — §19's v0.69 subsection
  and D71 already spec V1 fully; this leaf only restates it as a checkable DoD, exactly as the
  section's binding constraint intends.
  **Next concrete action:** `▶` moves to `13-hallmark-replication/V2` (Shell chrome — the title
  bar is a sixth region W1 never scaffolded, so it is **additive UI**, not a re-skin: wordmark,
  active dataset, ⌘K affordance, settings; plus tab-strip voice and region surfaces). Its leaf doc
  does not exist yet and must land before any `src/` code, per the binding constraint V1 breached
  — author it from `build/13-hallmark-replication/README.md`, `design.md`, master §13.3 (the
  region inventory) and the signed-off mocks in `_implementation/_misc/ideation/hallmark/`.
  **Blocker:** none. Still uncommitted — Justin commits.

- **2026-07-25** — **V2 — Shell chrome: leaf doc authored, box stays unchecked, `▶` stays at
  `13-hallmark-replication/V2`. No code changed this session — the leaf doc lands correctly
  *ahead of* its code this time, unlike V1's logged deviation.** Read `README.md`, `design.md`,
  master §13.3, `WorkbenchShell.tsx`/`StatusBar.tsx`/`CommandPalette.tsx`/`types/tabs.ts` as
  shipped, and the `workbench-shell.html` mock's title-bar/tab-strip/status-bar CSS and markup
  before writing anything, rather than trusting the phase-table one-liner alone.
  **A real master-doc gap found, not assumed from the charter's "sixth region" phrasing:** §13.3's
  own macrostructure sentence names six things (explorer, canvas, ai-pane, inspector, palette,
  status bar) and never mentions a title bar — confirms the gap is literal. §13.3's status-bar
  paragraph also currently assigns it "gear → Settings tab"; the mock's status bar carries zero
  gear (posture/engine/rows/theme-toggle only) and puts the only gear in the title bar instead.
  Both need a master-first edit landed *with* V2's code — logged in the leaf doc's own Acceptance
  criteria so the next session doesn't miss it.
  **Five scope calls written into the leaf doc, same discipline as V1's four:** (1) `TitleBar` is
  a new `src/app/` component, not folded inline into `ShellGrid`. (2) The settings gear moves from
  `StatusBar` to `TitleBar` — one entry point, not two, resolving the mock/master disagreement by
  reading the mock's actual status-bar markup rather than guessing. (3) Palette-open state lifts
  out of `CommandPalette`'s local `useState` into a new `stores/paletteOpen.ts`, matching the
  existing `pauseSignal.ts`/`selection.ts` pattern, so `TitleBar`'s button and the `⌘K` keyboard
  listener share one source of truth instead of a synthetic-keydown hack. (4) Per-`TabType`
  glyphs use `lucide-react` icons, not invented dingbats — `design.md`'s six-dingbat set is
  closed and each glyph already carries a semantic role; the mock's artifact/purple glyph branch
  is spec'd but stays inert since `types/tabs.ts`'s `TAB_KIND` has no `'artifact'` member yet, same
  posture V1 took toward the dead `--color-bg-subtle` `var()`. (5) The title bar's "active
  dataset" label degrades honestly for the real multi-dataset session model — `useDatasetsStore`
  is an array with no "active" concept, unlike the mock's single-dataset illustrative data; shows
  the one dataset's name when exactly one is loaded, a plain table count otherwise, reusing
  `StatusBar`'s existing `tables.length` reduction rather than inventing state.
  **Unlike V1, unit tests are in scope** — flagged explicitly in the leaf doc's Acceptance
  criteria — because this phase adds real interactive surface (a shared open/close store, a
  settings-gear callback move), not just a stylesheet swap.
  **Docs:** the new leaf doc; `build/13-hallmark-replication/README.md`'s per-phase-leaves list
  updated (V2 row added, noting the doc lands ahead of code this time). No master edit yet — the
  §13.3 amendment is spec'd in the leaf doc as part of *V2's own future work*, to land master-first
  together with the code, not in this doc-only session.
  **Next concrete action:** build V2's code against `02-shell-chrome.md` — `TitleBar.tsx` +
  `stores/paletteOpen.ts` (new), `WorkbenchShell.tsx`/`StatusBar.tsx`/`CommandPalette.tsx`/
  `types/tabs.ts` (modified), the tab-strip/region-surface CSS, the five new/updated test files,
  and the master §13.3 master-first edit — all in the same session, then check V2's box against
  the leaf doc's own Acceptance criteria and move `▶` to `13-hallmark-replication/V3`.
  **Blocker:** none. Still uncommitted — Justin commits.

