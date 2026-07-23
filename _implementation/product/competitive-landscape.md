# Competitive Landscape — researched July 2026

**Master spec:** §3.4 (competitive map), §3.3 (differentiation), §24.3 (competitor-response
scenario), §0 D20–D21.
**Status:** snapshot — re-verify before the v0 launch narrative is written (same rule as
Appendix A's library survey). If a rival announcement lands mid-build: **hold the date and
sharpen the counter-positioning copy — never add scope (§24.3, D27).**

## The six-property lane

DataScope's lane is defined by the combination of six properties:

**① ingests raw files · ② infers structure/relationships · ③ browser-native · ④ no login
· ⑤ no upload (client-side) · ⑥ free.**

Web-verified finding (July 2026): **no surveyed tool holds all six**, and the intersection
has now narrowed to **② alone** — the July 2026 cottage-tool wave (below) made ③④⑤⑥ table
stakes, leaving multi-table structure/relationship inference the last unclaimed capability.
Every competitor drops at least one, and every *new* arrival drops ②.

## Lane-by-lane

### Draw-your-own ER diagramming — drops ②
- [drawDB](https://github.com/drawdb-io/drawdb) — free, browser-native, no-login ER editor.
  Does **not** ingest data or infer anything; you draw the schema by hand.
- [ChartDB](https://chartdb.io/) — visualizes an *existing database* from pasted metadata
  JSON ("smart query"); doesn't profile files or infer relationships from data.

**Read:** these validate the ③④⑥ distribution model (drawDB beat draw.io on free + instant
+ no-login, not on inventing diagramming) — but produce the wrong artifact. The playbook is
proven; nobody has pointed it at *inferred-from-data* structure.

### Infer-from-files data modeling — drops ③④⑥
- [DbSchema](https://dbschema.com/database-designer/CSVFiles.html) — reverse-engineers a
  model from CSV/JSON/XML files, including virtual FKs. Desktop install, paid.
- [Hackolade](https://hackolade.com/help/InferPrimaryKeysandForeignKeyRel.html) — infers
  PKs/FKs, samples data for cardinality. Enterprise, paid, install.
- SmartDraw, Lucidchart — CSV/DDL import to diagrams; paid/login-gated diagramming suites.

**Read:** the *capability* DataScope's Studio arc builds (files → inferred PK/FK model) is
commercially proven — the **packaging** (instant, free, client-side, no-login) is what's
missing from every player in the lane. **ER-diagram intent note:** SmartDraw, Lucidchart, and
DbSchema contest the schema-diagram SEO, but they import *definitions/metadata* — none infers
relationships from raw data *values*, in-browser, free, no-login. Launch copy exploits that
honesty gap: *"they diagram your definitions; we infer from your data"* (§24.1 Play 3).

### In-browser DuckDB-Wasm AI workspace *(new — QueryPad, July 2026)* — drops deterministic core, DSPS export, & studio UX
- [QueryPad](https://github.com/vericontext/querypad) — local-first AI workspace using
  DuckDB-Wasm in-browser to scan folders of CSV/Parquet files, infer foreign-key relationships
  with confidence scores, and generate semantic models.

**Read:** the **closest architectural neighbor.** Validates that folder scanning + DuckDB-Wasm +
FK confidence scoring is a compelling browser workflow. DataScope's differentiators:
1. **Studio-grade UI/UX packaging:** QueryPad uses a basic, light-mode SQL editor shell; DataScope delivers a premium dark-mode analytics IDE (Dataset Dossier, visual Join Graph, structured modules, sample cards, and responsive layout).
2. **Granular AI privacy & BYOK controls:** QueryPad forces LLM dependency; DataScope provides user-choice AI modes (Local-only / AI off, Local Ollama, Cloud AI) with flexible key routing (shared budget vs. BYOK) and tab-memory stateless key custody (D2, D3, D9).
3. **Deterministic-first operations:** works zero-AI without requiring an LLM in the core loop.
4. **DSPS spec standardization & shape sharing:** exportable structure reports + offline quality diagnostics.

### Viewer/profiler cottage lane *(updated — July 2026)* — drops ②
- [viewparquet.com](https://viewparquet.com/), [parquet-viewer.com](https://parquet-viewer.com/),
  [parquetexplorer.com](https://parquetexplorer.com/), [exploremydata.com](https://exploremydata.com/),
  [Kanaries](https://kanaries.net/), [parquetreader.com](https://parquetreader.com/),
  [TRIRIGA Data Workbench](https://github.com/karbasia/tririga-data-workbench),
  [ParquetKit](https://github.com/igorbarinov/awesome-data-engineering),
  [parquetly](https://github.com/Gilbert09/parquetly),
  [parquet.online](https://github.com/zsh0518/parquet.online),
  [Bedevere](https://github.com/a-curated-list-of-awesome-DuckDB-resources),
  [Huey](https://github.com/a-curated-list-of-awesome-DuckDB-resources),
  [DataStory](https://github.com/dinesh0666/data-story),
  [Quak](https://github.com/manzt/quak) — free,
  no-login, DuckDB-WASM viewers/profilers/workbenches, all messaging "your data never leaves your browser."
  None infers multi-table structure or relationships.

**Read:** the decisive July 2026 shift. **"No upload" is now table stakes in this micro-lane,
not a differentiator** — ③④⑤⑥ have commoditized, so the six-property intersection has narrowed
to **② alone**. DataScope must lead with multi-table structure inference, not "client-side."

### Single-file client-side profiler *(new — SplitForge, Feb 2026)* — drops ②
- [SplitForge](https://splitforge.app/data-profiler) — client-side, free, no-login CSV profiler
  with quality checks and "candidate FK" hints, but **single file only**. Holds ①③④⑤⑥.

**Read:** the **closest new neighbor** and a threat to watch. It reaches for ② with hint-column
"candidate FK" suggestions but stops at one file — DataScope's differentiator is a **system**:
multi-table, folder-aware inference with evidence + confidence and the Join Graph (D24), not
per-column hints.

### CSV-diff cottage lane *(new — July 2026)* — drops ②
- [csvdiff.app](https://csvdiff.app/), [Datablist CSV Diff](https://datablist.com/tools/csv-diff),
  [DataFlowMapper](https://dataflowmapper.com/tools/csv-diff), [csvkit](https://csvkit.org/),
  [Apify diff actor](https://apify.com/automation-lab/csv-diff-tool) — free, in-browser,
  cell-level diffs on user-picked key columns.

**Read:** the commodity boundary the **D44 Drift Report** deliberately does not enter. None
infers the key, handles a folder, or reports distribution shift — the unclaimed piece is
inferred-key, folder-aware *statistical* drift, which requires a profiling engine.
Aggregate-only is a competitive boundary as well as a privacy one (D44).

### Cloud DuckDB + AI — drops ④⑤
- [MotherDuck](https://motherduck.com/product/) — funded, DuckDB-native cloud warehouse.
  Column Explorer (profiling UI) and the
  [AI data-app generator](https://motherduck.com/blog/data-app-generator/) are the
  encroachment vector toward "understand structure." Login-gated, cloud-resident data.
  **Update (Dec 2025–Feb 2026):** a [free tier](https://motherduck.com/product/pricing) now
  exists (3 users / 10 GB / 10 compute-hrs), and the free local **DuckDB Local UI**
  (`duckdb -ui`, Column Explorer) largely closes the *viewer* need for the Parquet-first
  engineer.

**Read:** still **threat #1.** The free tier + Local UI narrow the viewer gap, but neither
does relationship inference, quality scoring, or shareable artifacts, and login+cloud still
gates sharing — the §24.3 counter-positioning stands. Speed to claim the no-login *structure*
lane matters.

### BI-as-code / notebooks — drop ④ (mostly ③⑥ too)
- [Rill](https://www.rilldata.com/) — DuckDB-backed instant dashboards; requires login even
  for basic use.
- Evidence, Hex, Count, Deepnote — team notebooks/BI; login, cloud workspaces.

**Read:** different artifact (dashboards, notebooks), different buyer (teams). Not the
identity fight; confirms the no-login lane is genuinely open.

### Chat-with-CSV AI — drops ②⑤
- ChatGPT Advanced Data Analysis, Claude, [Julius, Powerdrill, camelAI, et al.](https://julius.ai/articles/julius-ai-alternatives)
  — upload-based, server-side Python, row-level Q&A. Commoditized: frontier labs bundle it
  into consumer subscriptions.

**Read:** confirms D12 — chat is not the identity. This lane is a bloodbath DataScope
deliberately does not enter; AI chat stays a supporting v0.5 module.

### Local-first DuckDB studio — drops ②③
- [Duckle](https://github.com/ducklelabs/duckle) ([duckle.org](https://duckle.org/)) —
  open-source local-first ETL/ELT studio on DuckDB: visual pipelines, 290+ connectors, dbt,
  on-device AI. **Update (July 2026):** a **Tauri desktop** app, beta v0.0.12 — desktop-native,
  **not a browser threat**; its headline is pipeline/ETL, not instant structure understanding.

**Read:** an adjacent neighbor, no longer a top threat: desktop ETL identity works against
instant browser structure understanding. Its Tauri-desktop lane *validates* the D51 desktop
charter rather than contesting the web funnel.

### Desktop-native viewer *(new — Duckling; distinct product from Duckle, do not merge)* — drops ②③ (and the browser surface)
- [Duckling](https://github.com/l1xnan/duckling) — Tauri-based fast viewer for
  CSV/Parquet/DuckDB/SQLite, native engine, open-source. Occupies the desktop-viewer lane.

**Read:** it **validates the D51 architecture** (native engine behind a desktop shell) but
drops the browser surface and inference — desktop is a *surface*, not a differentiator (D51).
Duckling and Duckle together own the Tauri-desktop lane; ②, the Drift Report, and the
travelling artifact differentiate whatever the shell.

## Conclusions (folded into master as §3.4–§3.5, D20–D21)

1. **The intersection now survives on ② alone:** *drop raw files → infer structure →
   in-browser → no login → no upload → free → shareable.* The July 2026 cottage-tool wave
   commoditized ③④⑤⑥ ("no upload" is table stakes), so multi-table structure/relationship
   inference is the last unclaimed capability — lead with it, not with "client-side."
2. **Honest moat:** every individual capability exists somewhere; the novelty is the
   combination + packaging. Defense = distribution, execution speed, brand — not technology.
   For a solo builder, that's winnable (the drawDB playbook, aimed at a higher-value output).
3. **Sharing is the multiplier:** competitors gate output behind auth; a public shareable
   structure artifact (D20) is the viral loop — per D26 it is screenshotable and carries a
   tagged attribution footer, so every shared report recruits (portfolio value is a side
   effect, not the purpose — D22). The privacy-native share tiers (D21, §20.11) are the
   seam none of them has.
4. **Threats to watch:** MotherDuck (free tier + Local UI now closing the *viewer* need),
   QueryPad (closest architectural neighbor for FK inference), and SplitForge (closest client-side
   profiler, single-file-only today). Duckle and Duckling are desktop-native, not browser threats.
   Re-check at each release gate; the response is pre-written below.

## Competitor-response scenario (§24.3 — written in advance, not improvised)

§3.4 names **MotherDuck and SplitForge** as the threats to watch; "speed" (D27) is necessary
but not sufficient, so the response is pre-written.

**If MotherDuck ships a "structure view" or "local mode":** their version still requires
signup and (for anything shared) upload — the business model guarantees it. The two
**MotherDuck-proof assets**:

1. **Offline-by-construction (§24 Play 1).** A login-gated cloud warehouse cannot run the
   wifi-kill demo without abandoning its revenue model — a structural moat, not a feature
   race. Counter-positioning line, ready in advance: *"Theirs needs your data. Ours never
   sees it."*
2. **The structure report as a portable format (§24 Play 4, DSPS/D31).** A format spreads
   user-to-user and lives in tickets, PRs, and inboxes; a rival feature does not neutralize
   artifacts already circulating.

**If SplitForge (or another cottage/OSS neighbor) grows multi-table inference:**
differentiation is that DataScope infers a **system, not hint columns** — folder-aware,
multi-table containment/cardinality inference with evidence + confidence and the Join Graph
(D24), plus the D44 Drift Report and the travelling artifact — against a single-file
profiler's per-column "candidate FK" hint. A cottage tool validating the *inference* intent
likely *helps* v0 distribution more than it hurts; the moat is the system + the format, not
the hint.

## Sources

- https://github.com/drawdb-io/drawdb
- https://chartdb.io/
- https://dbschema.com/database-designer/CSVFiles.html
- https://hackolade.com/help/InferPrimaryKeysandForeignKeyRel.html
- https://motherduck.com/product/ · https://motherduck.com/blog/data-app-generator/ ·
  https://motherduck.com/product/pricing (free tier) · DuckDB Local UI (`duckdb -ui`) blog
- https://www.rilldata.com/
- https://julius.ai/articles/julius-ai-alternatives (landscape roundup)
- https://github.com/vericontext/querypad (QueryPad — in-browser DuckDB-Wasm FK inference workspace)
- Viewer/profiler cottage lane: https://viewparquet.com/ · https://parquet-viewer.com/ ·
  https://parquetexplorer.com/ · https://exploremydata.com/ · https://kanaries.net/ ·
  https://parquetreader.com/ · https://github.com/karbasia/tririga-data-workbench ·
  https://github.com/igorbarinov/awesome-data-engineering (ParquetKit) ·
  https://github.com/Gilbert09/parquetly · https://github.com/zsh0518/parquet.online ·
  https://github.com/dinesh0666/data-story · https://github.com/manzt/quak
- https://splitforge.app/data-profiler (SplitForge — single-file client-side profiler)
- CSV-diff cottage lane: https://csvdiff.app/ · https://datablist.com/tools/csv-diff ·
  https://dataflowmapper.com/tools/csv-diff · https://csvkit.org/ ·
  https://apify.com/automation-lab/csv-diff-tool
- https://github.com/ducklelabs/duckle · https://duckle.org/ (Duckle — Tauri desktop ETL)
- https://github.com/l1xnan/duckling (Duckling — Tauri desktop viewer, distinct from Duckle)
- Re-identification / disclosure-control grounding for the share tiers:
  https://www.nature.com/articles/s41598-025-04907-3 (practical re-identification risk
  methodology) · https://arxiv.org/pdf/2601.22434 (membership-inference attacks on
  synthetic tabular data, 2026)
