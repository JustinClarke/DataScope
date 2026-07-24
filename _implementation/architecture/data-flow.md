# Data Flow

**Master spec:** §7 (ingestion), §8 (classification), §9 (broker), §11.1 (AI pipeline),
§21.5 (sequence diagrams). The two sequences below are the minimum set §21.5 requires;
redraw them as real diagrams after the Phase-1 spikes (D18).

## 1. Ingest → classify → broker → modules (the core loop)

```
User drops file(s)/folder
  → pre-scan aggregate size (§7.3 tiers; warn/sample/refuse before loading)
  → file.arrayBuffer() → db.registerFileBuffer(name, bytes)   [DuckDB VFS]
  → CREATE TABLE <name> AS SELECT * FROM read_csv_auto/read_parquet/read_json_auto(...)
  → table registered in the table registry (name, rows × cols, source, memory)
  → SUMMARIZE <table>                                          [per table]
  → classifyColumn() per column → ClassifiedColumn[]           [semantic types]
  → evaluateCapabilities(all registered tables) → DataCapabilities
  → sidebar module cards enable/disable with reason tooltips
  → auto-profile dashboard renders (column cards; insight feed in Phase 3)
```

Key properties:
- Every ingested **or derived** table goes through the same profile → classify → broker
  path (§10 M2 transformation layer; §12.1).
- The broker evaluates over the **union of all registered tables** (D13).
- Ingestion telemetry panel shows size/format/rows/elapsed/memory live during load (§7.2);
  the same UI is reused for API pagination.
- **Workbench shell assembly (D71, master §13.3):** the deterministic shell *skeleton* —
  which panes exist given session state — is a pure function of that state; async producers
  (D56/D70 synthesis, WebLLM warm-up, `.dsps`/`?share=` loads) **layer on as imperative
  state updates over the pure skeleton**, testable at their own seams.

## 2. AI question → chart (§11.1)

```
User question
  → stage 1  input normalization: Levenshtein/Jaccard fuzzy match of tokens
             against known table/column names (typo correction, no embeddings)
  → stage 2  schema-pruned prompt: only relevant DDL + column names/types +
             semantic roles from the classifier — never the whole schema
             (a pruned fragment of the same structural-facts substrate DSPS
              serializes, D37/D58 — facts only, no version/provenance machinery)
  → stage 3  generation via active provider (§11.2 routing)
  → stage 4  dialect lint: real Postgres-dialect parser; catch backticks,
             CONCAT vs ||, TOP vs LIMIT, date/time function names
  → stage 5  execute via execute_local_sql tool → on failure: capture error
             trace + resample context (PRAGMA table_info(), LIMIT 3 rows*)
             → feed back → retry (hard cap 3, THOR-style)
  → stage 6  auto-chart config from returned column types
             (shared SQL → Chart translator, §10 M2)
```

\* Sample rows leave the browser in cloud mode **only** if data-sampled repair is enabled;
the metadata-only-repair toggle restricts retry context to schema + error trace (§11.3).

**Implementation shape:** stages 3–5 are an LLM **tool-use loop** — the model holds an
`execute_local_sql` tool bound to DuckDB-Wasm; retries fall out of the loop for free.
Stages 1–2 preprocess the prompt; stage 4 lints each tool call before execution; stage 6
post-processes the final result set. Every query and per-attempt execution log is visible in
the transcript (auditability, §11.1).

## 3. API ingestion (§7.4, v0.5)

```
Pasted API URL
  → Tier 1: direct browser fetch (works iff permissive CORS, no secret)
  → on CORS failure: Tier 2: Cloudflare Worker as dumb relay (fetch server-side,
    return with permissive ACAO; nothing stored, no secrets)
  → pagination loop accumulates pages (client-side Tier 1, Worker-side Tier 2)
  → response buffer → read_json_auto → same registry/profile path as file drop
  → "Refresh from source" re-runs the pull and replaces the table on demand
```

Tier 3 (credential vault for secret-key APIs) is deferred (D4) —
[`../backlog/tier3-vault-ingestion.md`](../backlog/tier3-vault-ingestion.md).

## 4. Export / persistence (§12)

```
Client-side (always available):  COPY <table> TO 'out.parquet' (FORMAT PARQUET)
                                 → browser download; copy-to-Jupyter snippet alongside
Server-side (explicit action):   "Save to cloud / Create share link" → disclosure dialog
                                 → Worker persistence endpoint → R2 object (TTL, delete
                                 control, unguessable-token URL, size caps)
```

## Failure cases to design for (§21.6)

Malformed CSV, huge Parquet, duplicate columns, 100M rows, empty dataset, mixed column
types, UTF-16 files, null-heavy columns, worker crashes, out-of-memory, AI provider timeout,
relay rate-limit hit, R2 write failure. Each phase doc lists the subset it owns.

**Cancellation / lifecycle (D58) — a distinct class, not errors.** Handled as first-class
control flow: **user abort** (drop the wrong folder, cancel a 4 GB Parquet mid-load, stop a
running query), **superseded request** (a new AI turn preempts an in-flight tool-loop; a new
query preempts a running one; a "Refresh from source" supersedes an in-flight pull), and
**Worker termination/restart**. The `cancelQuery()` / `removeDataset()` service contracts
(`system-design.md`) are the seam; ingestion, the AI tool-loop, and API pagination each own
their abort/supersede semantics in their phase docs.
