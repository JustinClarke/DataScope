# Vision — DataScope Studio

**Master spec:** §1 (executive summary), §2 (target users), §3 (positioning), §4 (constraints).

## Identity (D12)

DataScope is a **browser-native analytics IDE** — "the VS Code of local analytics" — whose
headline capability is **understanding data structures, not chat**. End state:

```
Drop folder of Parquet/CSV → automatic profiling → relationship inference
→ schema graph → quality report → generated dbt project → SQL playground
→ interactive documentation → export semantic model
```

Entirely client-side, deterministic, no upload. AI chat is a v0.5 pillar but a *supporting
module*, not the identity.

**Foundation pillars (v0 + v0.5, D15):** ingest (multi-table, D13) → profile → SQL → charts
+ a confidence-labeled **Join Graph (beta)** slice and the **structure-report export**
(v0; D20/D24/D31), then AI chat + connectivity/persistence (v0.5). The Studio arc (quality
report, relationship inference, schema graph, dbt/semantic export) is the v1 release —
**Phase 8 inherits the v0 Join Graph (beta) rather than starting from zero (D24)**. ML
modules are designed but deferred behind it ([`../backlog/`](../backlog/), §20.1).

The server-side surface is deliberately minimal and enumerated — three paths, no general backend:
1. a **stateless CORS relay** (Cloudflare Worker) for API ingestion that fails direct fetch,
2. **AI inference routing** (Workers AI default in cloud mode, BYOK via credential vault),
3. an **opt-in R2 persistence layer** for explicitly saved/shared datasets.

No server-side query execution, no server-side schema processing, no always-on state. (The one
chartered future exception — the opt-in D39 hosted staging & server-side execution tier — is the
**chartered second platform rung** on the D61 surface-investment ladder: **browser → hosted tier
→ desktop → the rest on request.** It stays behind its own design round, remains opt-in, and is
never the default or part of the v0/v0.5 launch identity — the ladder is a scale-up path, not the
trust story, D61.)

The machine-readable profile the product emits — **DSPS, the DataScope Profile Spec
(D31/D37)** — is a first-class, open, versioned interface, not an export afterthought: a spec
other tools and agents consume (§6, §12.2,
[`../build/08-persistence/03-dsps-spec.md`](../build/08-persistence/03-dsps-spec.md)), and the
substrate the D38 MCP surface serves. Product identity and launch narrative are unchanged
(D12/D22/D23) — DSPS is promoted as an *interface*, not a re-centering of the product on "the
layer agents consume" (that framing was rejected).

## Target users (§2)

**Lead audience — the privacy-constrained data worker (D22/D23).** Someone in a regulated or
sovereignty-bound environment (finance, healthcare, government) who *cannot upload* and
*cannot share raw data* but must show what their data looks like — and needs proof, not
promises, that nothing leaves the browser ("no upload, by construction — check DevTools").
The launch narrative is built for them ([`strategy.md`](strategy.md), §24).

**Explicit second audience — the Parquet-first data engineer** (DuckDB, MotherDuck,
Iceberg/Delta exports, local lakehouses) who wants a zero-install workbench and profiler for
files that never touch a warehouse. Same engine, different motivation — not a co-headline;
only one audience owns the launch message.

Also served by the same free tool:
- **Data analysts** (SQL-comfortable) — a fast, zero-setup SQL workbench + profiler; already well-served by the core. The regulated beachhead user is usually one of these, so serving analysts better also serves D23.
- **Business analysts** (SQL-averse) — served *without SQL* via the pivot / cross-tab surface and guided task-shaped answers (§10 Modules 2/7), plus take-it-with-me exports into Excel/decks (§12.2). The no-SQL on-ramp for the analyst who never opens Monaco — an **explicitly served audience, not a co-headline** (D53 extends D22/D23; launch voice + beachhead unchanged).
- Analytics engineering students learning SQL, statistical profiling, dimensional modeling
- Anyone wanting to profile a dataset without uploading it to a third-party service

DataScope is a **product measured in users, not a portfolio demonstration** — the public,
shareable, hard-engineering artifact is a side effect, not the stated purpose (D22). It is
still **not a production ETL platform**: the dbt export produces a scaffold for a human to
review and own, not a deployed pipeline.

## Positioning (§3)

- **The problem (§3.0) — the invisible step before analysis.** Working with data is mostly
  a *context-gathering chain* (find tables → decode columns → catch schema drift → join →
  de-dupe → clean), not writing SQL; ~20–30% of the day is analysis, the rest is the
  **orientation tax** (D57) — orienting on data someone else produced, paid again on every
  new export. Six recurring time sinks — *what is this?* (→ Dossier, D48), *how do these
  tables join?* (→ Join Graph, D24), *quality surprises* (→ proactive flags),
  *re-exploration + refresh re-runs* (→ DSPS + Drift Report + transform recipe,
  D31/D44/D53), *explaining findings* (→ evidence + confidence, D45), *packaging the
  answer* (→ take-it-with-me exports, D53; findings narrative, D54) — map to the unnamed
  stage between *receiving* and *analyzing* data: **understand what you've been handed**
  (the D52 inherited-data frame; §3.5, §24).
- **DBMAN.AI** is a different category (live-DB CRUD agent with cloud LLM); not a benchmark
  to beat feature-for-feature. DataScope wins on safety/privacy design for file analysis;
  DBMAN.AI wins on "administers a live production DB today."
- **Prior art absorbed:** Vanna.ai (schema-RAG prompting, auto-charting), LangChain's SQL
  agent (the generate→execute→retry loop, demonstrated on DuckDB), SQL Workbench /
  "Chat with a Duck" (client-side LLM + duckdb-wasm precedent, DuckDB-NSQL local model),
  academic self-correction lineage (DIN-SQL, MAC-SQL, THOR, QUITE — see A.4).
- **What's actually differentiated (§3.3):** nothing in the landscape takes a folder of
  Parquet files and hands back the join graph, fact/dimension split, ER diagram, quality
  report, and a generated dbt project — client-side, deterministic, no upload. For the
  beachhead user, the daily competitor isn't a named tool at all — it's the informal
  CSV → Excel → Google Sheets → ChatGPT → PowerPoint → Slack workflow every analyst
  already runs; DataScope's job is to collapse that chain, not out-feature a BI product.
  Two absorbed adjacent identities: **"Lighthouse for data"** (Phase 7 diagnostics report)
  and **a browser-native DuckDB workbench** for the growing Parquet/lakehouse ecosystem.
- Adjacent-project note (portfolio value is a side effect, not a purpose — D22): off-the-pace
  = a *vertical* analytics product; DataScope Studio = the *horizontal* engine (developer
  tooling). That the pair signals product design, data engineering, and systems thinking is a
  byproduct of building a product measured in users, not the goal.
- **Researched competitive map (§3.4, July 2026)** and **distribution/audience strategy
  (§3.5)**: the six-property lane (*files in → structure inferred → browser → no login → no
  upload → free → shareable*) now **survives on ② alone** — the July 2026 cottage-tool wave
  made "no upload" table stakes, leaving multi-table structure inference the last unclaimed
  capability; the moat is combination + packaging, defended by distribution and speed. The
  **privacy-constrained data worker is the primary v0 audience** (D22/D23); the launch headline
  is the **inherited-data moment** — *someone just sent you data you don't understand* — with
  privacy as the standing **permission line**, and the product arc is **structure × time** (v0
  structure, v0.5 time via the Drift Report; D44/D52 — the frame is fixed, draft copy deferred).
  The free single-player tool is the funnel. Full survey with sources:
  [`competitive-landscape.md`](competitive-landscape.md); strategy, rails/ladder, and launch
  plays: [`strategy.md`](strategy.md). Sharing is structure-first per D20/D21.

## Constraints & non-goals (§4)

| Constraint | Detail |
| :--- | :--- |
| Not a production ML platform | Post-v1 models are educational demos. No export/serving/grids. |
| Desktop-first | Chrome/Firefox/Edge. Tablet nice-to-have; mobile out of scope. |
| Browser memory ceiling | ~2GB tab limit; >100MB files trigger sampling fallback (§7.3). |
| Minimal, enumerated server surface | Only the three paths above, each opt-in/disclosed (§5). The one chartered exception is the opt-in D39 hosted staging/execution tier — the **chartered second platform rung** on the D61 ladder (browser → hosted tier → desktop → rest on request), still design-round-gated, still opt-in, never the default. |
| No real-time collaboration | Single-user, single-tab. Share links are static snapshots. |
| No XLSX native support | Convert to CSV first (D8); clear error modal. |
| No live database connections | No raw TCP in browsers; deferred design in [`../backlog/live-db-bridge.md`](../backlog/live-db-bridge.md). |
| No generic chunking / RAG platform (D32) | No document chunking, embeddings, vector storage, retrieval pipelines, or RAG plumbing — boundary, no revive trigger. The AI-facing surface is DSPS + "Copy for AI" client-side by default (§12.2, D31), plus the D38 MCP surface over shared or explicitly staged artifacts only: **deterministic structural chunking** via client-side DuckDB-Wasm, not text chunking. The D32 no-RAG boundary is unchanged. **Clarification (D47, §4):** a deterministic SQL-derived fact list with evidence and confidence — no vectors, no embeddings, no similarity search — is in-bounds structural metadata, not RAG. **Extension (D66, designed/deferred):** deterministic log/semi-structured template extraction — regex/pattern field extraction turning logs, key-value blobs, and messy JSON into ordinary tables — is likewise in-bounds, not RAG; no embeddings, no vector search, no ML/AI in the extraction path. Not scheduled — [`../backlog/semi-structured-ingestion.md`](../backlog/semi-structured-ingestion.md). |
