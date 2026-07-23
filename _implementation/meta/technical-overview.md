# DataScope: Technical & Lifecycle Overview

DataScope is a **browser-native analytics IDE**. It's built for people who inherit data they don't understand — CSVs, JSON, Parquet dropped in a folder — and need to see its structure, quality, and relationships without ever uploading the raw rows to a third-party server.

If you know SQL, here's exactly how it works: the user lifecycle, the system design, and the architecture that enforces the privacy claim.

## 1. The User Lifecycle (The "Inherited Data" Journey)

1. **Ingest (zero upload).** Drop one or many CSV/JSON/Parquet files straight into the browser. No cloud staging, no ETL, no remote warehouse.
2. **Understand (Dataset Dossier).** DataScope runs deterministic SQL against your files and assembles a folder-level overview: completeness (null heatmaps), uniqueness (duplicate rows), distribution shape (skew/outliers), time coverage, and a ranked insight feed — all SQL-derived and rule-based, so it works even with AI switched off.
3. **Connect (Join Graph).** For multi-table drops, DataScope infers relationships — candidate keys and matching structures across tables — and draws a confidence-scored ER graph showing how to `JOIN` the data.
4. **Query (SQL-first).** A full Monaco editor gives you an interactive SQL playground against DuckDB's dialect, with auto-suggested queries and a results → chart auto-mapper.
5. **No-SQL escapes.** Business analysts get a drag-and-drop pivot/cross-tab that compiles to `GROUP BY` under the hood, guided task-shaped answer templates (trend, top-N, period-over-period, simple cohort), and **reproducible transform recipes** — the generating SQL DataScope already ran, exported as a script you re-run on next month's file instead of redoing the clicks.
6. **Track (Drift Report).** Drop next month's folder and DataScope statistically diffs the two versions — rows added/removed, per-column % changed, null/cardinality drift, distribution shift (PSI/KS). Aggregate-only, folder-aware — never a cell-level diff.
7. **Export & share.** Export the **structure** — schema, profiling stats, relationships, a generated `dbt` project, or an LLM-ready "Copy for AI" context block — never the raw rows. The machine-readable artifact behind all of these is the **DataScope Profile Spec (DSPS)**, and every fact it carries is labeled with *when and how* it was computed rather than asserted as permanently "verified" (a dataset can drift after the snapshot).

## 2. System Design (Light)

Everything inside the box below runs **only** in your browser tab. The edge is a thin, stateless relay that never sees a raw row unless you take the explicit action of creating a share link.

```
┌──────────────────────────────── Browser Tab ─────────────────────────────────┐
│                                                                                │
│   File Drop ──▶ DuckDB-Wasm (Web Worker) ──▶ Schema Classifier &              │
│                        │                      Capabilities Broker            │
│                        │  bound via the QueryEngine interface                │
│                        │  (execute / register / summarize)                   │
│         ┌──────────────┼───────────────┬───────────────────┐                 │
│         ▼               ▼              ▼                    ▼                │
│    SQL Editor        AI Chat      Chart Modules      Export / DSPS            │
│    (Monaco)          (NL→SQL)     (Recharts / D3)    (Dossier, Copy-for-AI)   │
└─────────┬───────────────┬─────────────────────────────────┬──────────────────┘
          │ (cloud AI     │                                 │ (explicit
          │  mode only)   │                                 │  save / share)
          ▼               ▼                                 ▼
   ┌────────────────────────────────────────┐      ┌─────────────────────────┐
   │        Cloudflare Worker (edge)         │      │      R2 (opt-in)        │
   │  · AI routing — Workers AI / BYOK       │      │  · saved datasets       │
   │  · Tier-2 CORS relay (fetch APIs)       │      │  · share links (TTL,    │
   │  · read-only DSPS MCP endpoint —        │      │    private-by-default)  │
   │    serves already-shared artifacts only │      │                         │
   └────────────────────────────────────────┘      └─────────────────────────┘
```

**The `QueryEngine` seam.** Profiling, classification, insight generation, and DSPS emission are all written against a `QueryEngine` interface (`execute` / `register` / `summarize`) — never directly against `duckdb-wasm`. Today that interface is bound to the in-browser Wasm worker. It costs almost nothing now and is the entire pre-work for the native desktop engine described below: swap the binding, not the app.

**The `ViewSpec` seam.** The Dataset Dossier — and the module layout more broadly — is emitted as a versioned, capability-gated **ViewSpec**: validated JSON of `panels[]` (a fixed component registry + typed props + chart configs), consumed by a renderer that **never executes model output**. v0 ships only the deterministic producer — the Capabilities Broker + Dossier assembly generalized into this artifact — so it paints first, always, and is the whole of the view when AI is off. Same logic as the `QueryEngine` seam above: it costs almost nothing now and makes an optional AI producer (§4) a drop-in later without touching the render contract.

## 3. Technical Rigor & Architecture

### The Engine: DuckDB-Wasm
The heart of DataScope is **DuckDB compiled to WebAssembly**, running in a dedicated Web Worker.
* **No server execution:** queries run on your machine's RAM and CPU. `SELECT`/`JOIN` never leave the tab.
* **Performance:** native Parquet parsing and vectorized execution, directly in the browser.

### The Stack
| Layer | Technology |
| :--- | :--- |
| Frontend | React 18+ with TypeScript, Tailwind CSS |
| Database engine | DuckDB-Wasm (Web Worker), behind the `QueryEngine` interface |
| Code editor | Monaco |
| Visuals | Recharts (declarative), dropping to D3.js/Canvas past ~10,000 points |
| Edge | Cloudflare Worker — AI routing, CORS relay, MCP endpoint — + R2 (opt-in persistence) |

### The "No Upload" Privacy Boundary — and the Trust Surface Around It
The server surface is deliberately tiny, and what exists is designed to be checkable rather than taken on faith:
* **Stateless CORS relay** — fetches APIs that lack CORS headers; no storage.
* **AI routing** — passes prompts to Workers AI or a BYOK provider, stateless pass-through by default.
* **Opt-in persistence (R2)** — only touched when you explicitly save or share an artifact.
* **Sovereignty ladder** — three deployment options that all share the same "no upload" core: the web app (zero install), a **downloadable self-host zip** you can run on your own intranet (a public `/security` page enumerates every network call the app can ever make), and a future **air-gapped desktop build**.
* **Provenance over permanence** — DSPS facts are labeled `derived-this-run` / `user-asserted` / `carried-unverified` with a snapshot date and file hash; the product never emits a bare "verified" or "PII: none found" clearance, since both are false-permanence claims a later re-run could contradict.
* **PII handling is a nudge, not a verdict** — likely-sensitive columns get a "review before sharing" flag in the share flow. Positives-only: there's no all-clear state to trust incorrectly.

### Pragmatic AI (No RAG)
DataScope doesn't run a vector database or generic RAG plumbing. Its AI surface is narrow by design:
1. **Three explicit modes** — (a) local-only / AI off, (b) local model, (c) cloud AI — chosen on first run, never a silent default.
2. **Context via structure, not rows** — NL→SQL generation is grounded in the DSPS (schema + profile stats), never raw data.
3. **The same rule for other agents** — a read-only MCP endpoint serves DSPS for datasets you've already shared, so external AI tools can query a dataset's *structure* the same way DataScope's own chat does. No `run_sql`-over-your-browser-tab tool exists; a tab is not a server.

## 4. Where It's Headed

The lifecycle above is what ships first and is fully local. Two later pieces are worth knowing about because they explain some of the architecture choices above:

* **A native desktop engine.** A Tauri shell with a native `duckdb-rs` sidecar behind the same `QueryEngine` interface — same UI, no browser-memory ceiling, so multi-gigabyte files and real lakehouse folders become first-class. Free, installable, air-gap capable. This is *why* the engine sits behind an interface today instead of calling `duckdb-wasm` directly everywhere.
* **The Studio arc.** The v0 Join Graph (beta) matures into full PK/FK discovery with confidence scoring, then a star-schema proposal that exports as a working `dbt` project and semantic model. Still zero-upload — the model is derived from structure, never from your rows.
* **An optional AI view-composer.** Bounded to the Dataset Dossier and consumer templates, it emits the same ViewSpec artifact rather than a bespoke one — cached per dataset fingerprint, resolved async after the first paint, surfaced as an explicit "tailored this view" upgrade badge. It ships only behind an eval gate (must beat the deterministic layout on a labeled set) and always degrades to the deterministic ViewSpec when AI is off, down, or uncached — offline-by-construction holds by design, not by exception. The maximal "AI redraws the UI live" version was considered and rejected: it isn't the differentiating moat and would put determinism and the free-forever-local promise at risk.

## Summary

DataScope is the "VS Code of local analytics." DuckDB-Wasm gives data workers a fast, private, deterministic way to understand the shape of inherited data — and an architecture (the `QueryEngine` boundary, the declarative `ViewSpec` render layer, the minimal edge surface, provenance-labeled facts) built so that claim keeps holding as the product grows past the browser tab.
