# DataScope — System Design & Engineering Highlights

> **Target Audience:** Data Engineers, ML/AI Engineers, Solutions Architects, and Technical Interviewers  
> **Key Value Proposition:** 100% client-side, zero-upload local analytics IDE with DuckDB-Wasm, WebLLM on WebGPU, and structured schema profiling (DSPS).

---

## 1. Executive Summary

**DataScope** is a browser-native analytics workspace designed to inspect, profile, query, model, and visualize un-curated datasets (CSV, TSV, Parquet, JSON, JSONL, ZIP archives) entirely on the client. Using **DuckDB-Wasm** executing inside Web Workers, **WebLLM on WebGPU**, and a structured schema profile specification (**DSPS**), DataScope provides deep data profiling and NL-to-SQL generation while ensuring **0% data row egress to remote servers**.

```
┌──────────────────────────────── Browser Tab (100% Local) ────────────────────────────────┐
│                                                                                          │
│   File Drop ──▶ DuckDB-Wasm (Web Worker) ──▶ Schema Classifier &                         │
│                        │                      Capabilities Broker                        │
│                        │  bound via the QueryEngine interface                            │
│                        │  (execute / register / summarize)                               │
│         ┌──────────────┼───────────────┬───────────────────┐                             │
│         ▼               ▼              ▼                    ▼                            │
│    SQL Editor        AI Chat      Chart Modules      Export / DSPS                       │
│    (Monaco)          (NL→SQL)     (Recharts / D3)    (Dossier, Copy-for-AI)              │
└─────────┬───────────────┬─────────────────────────────────┬──────────────────────────────┘
          │ (cloud AI     │                                 │ (explicit
          │  mode only)   │                                 │  save / share)
          ▼               ▼                                 ▼
   ┌────────────────────────────────────────┐      ┌─────────────────────────┐
   │        Cloudflare Worker (edge)        │      │       R2 (opt-in)       │
   │  · AI routing — Workers AI / BYOK      │      │  · saved datasets       │
   │  · Tier-2 CORS relay (fetch APIs)      │      │  · share links          │
   │  · read-only DSPS MCP endpoint         │      │                         │
   └────────────────────────────────────────┘      └─────────────────────────┘
```

---

## 2. Core System Design Architecture

### A. Decoupled OLAP Engine Abstraction (`QueryEngine` Seam)
* **Design Pattern:** All profiling, schema classification, relationship inference, and metric extraction are written against an abstract `QueryEngine` interface (`execute`, `register`, `summarize`) rather than calling DuckDB directly.
* **Engineering Impact:** Decouples feature code from the underlying execution runtime. Switching from browser-based DuckDB-Wasm to a native `duckdb-rs` sidecar (Tauri desktop shell) requires changing a single dependency injection point without modifying UI or analytics logic.

### B. Capability-Gated Declarative Rendering (`ViewSpec` Contract)
* **Design Pattern:** The UI layout engine consumes a versioned, validated JSON schema ([`ViewSpec`](../src/types/index.ts)).
* **Security & Reliability:** Models and AI generators **never execute raw client code or arbitrary UI specs**. Deterministic algorithms paint views first; AI components only compose within legal `ViewSpec` component grammars and gracefully fall back to deterministic specs if execution fails.

### C. Web Worker Architecture & Client Memory Tiering
* **Design Pattern:** Heavy analytical queries, DuckDB Wasm execution, and local model inference (WebLLM) run off the main thread inside dedicated Web Workers via **Apache Arrow** memory buffers.
* **Backpressure & Memory Protection:** Implements strict dataset tiering rules (50MB warning, 100MB automated sampling, 300MB browser refusal with alternative guidance) to prevent browser tab crashes during high-cardinality operations.

### D. Distributed Edge Architecture (Cloudflare Workers + Durable Objects)
* **Architecture:** Optional server-side capabilities run on an edge-native Cloudflare Worker ([`edge/`](../edge/)).
* **Privacy & Isolation:** Provides stateless CORS relays, BYOK AI routing, opt-in R2 persistence, and per-user rate limiting via **Cloudflare Durable Objects** without touching raw data rows.

---

## 3. Role-Specific Standout Technical Highlights

### 📊 Data / Analytics Engineering
1. **In-Browser Multi-Table Relationship & FK Inference Engine:**
   * Built a containment probe service ([`src/services/relationships.ts`](../src/services/relationships.ts)) that computes parent-key stats once per `(table, column)` and runs pairwise containment checks to automatically infer primary key / foreign key (PK/FK) join graphs across dropped folders.
2. **Automated Data Profiling & Statistical Drift Detection:**
   * Derives completeness heatmaps, cardinality, distribution shapes, and statistical drift (Kolmogorov-Smirnov / PSI shift tests between folder versions) in SQL.
3. **Data Modeling & dbt Export Pipeline:**
   * Translates inferred relationships into star-schema proposals and reproducible transformations that export directly into `dbt` project templates.

### 🤖 ML / AI / Systems Engineering
1. **Pragmatic Context Injection (DSPS Over Naive RAG):**
   * Replaced generic vector embeddings / row-level RAG with **DataScope Profile Spec (DSPS)**—a structured metadata & profiling context block injected into prompts. Reduces context bloat, guarantees data privacy, and improves LLM SQL syntax compliance.
2. **Tool Ladder Strategy for Small & Local LLMs:**
   * Architected a resilient LLM fallback loop ([`src/services/toolLadder.ts`](../src/services/toolLadder.ts)) that extracts structured SQL tool calls from unformatted prose/JSON emitted by small models (e.g., 1.5B local models via WebLLM or Ollama) with chain-of-thought (`<think>`) stripping and fixed step-budget guarantees.
3. **Rigorous NL-to-SQL Evaluation Harness:**
   * Built a CI/dev evaluation harness ([`eval/harness/scorer.ts`](../eval/harness/scorer.ts)) that benchmarks LLM performance across providers on:
     * **Execution Rate (`execOk`):** Syntactically valid SQL output.
     * **Result Correctness (`resultCorrect`):** Order-insensitive, numerically-rounded row evaluation against DuckDB ground truth.
     * **Self-Repair Rate (`repairSucceeded`):** Success rate when feeding SQL execution error tracebacks back into prompt context.
4. **Model Context Protocol (MCP) Server Integration:**
   * Implemented a read-only MCP endpoint exposing DSPS artifacts, allowing external agents (e.g. Claude Desktop) to query dataset structures securely.

---

## 4. Resume Bullet Points

### Data / Analytics Engineer Bullets
* *Architected a zero-upload in-browser OLAP workspace using **DuckDB-Wasm** and **Apache Arrow**, enabling 100% client-side SQL execution over multi-gigabyte CSV/Parquet files in Web Workers.*
* *Engineered an automated FK/PK relationship inference engine running concurrent containment probes in SQL to construct confidence-scored entity-relationship (ER) join graphs.*
* *Designed statistical drift detection algorithms (PSI & KS tests) to profile distribution shifts and null heatmaps across multi-table dataset releases.*

### ML / AI / Systems Engineer Bullets
* *Built a zero-egress NL-to-SQL pipeline with **WebLLM (WebGPU)** and cloud APIs, utilizing a custom schema context protocol (**DSPS**) to eliminate the need for row-level RAG.*
* *Implemented a deterministic tool-ladder fallback strategy ([`toolLadder.ts`](../src/services/toolLadder.ts)) for small LLMs (1.5B params), enabling reliable tool execution from unstructured model outputs.*
* *Developed an end-to-end evaluation harness ([`eval/`](../eval/)) measuring execution rates, result correctness, repair loops, and token costs across multiple LLM backends.*

---

## 5. Technical Interview Cheat Sheet

| Question | Technical Answer & Architecture Trade-off |
| :--- | :--- |
| **Why DuckDB-Wasm over client JS libraries?** | *DuckDB provides vectorized execution, native Parquet parsing, and full Postgres-dialect SQL in a Web Worker, allowing near-native query speeds without blocking the main UI thread.* |
| **Why DSPS metadata injection instead of RAG?** | *RAG on raw data rows leaks PII and creates high vector database overhead. Structuring the metadata (schema, column types, min/max, null ratios) into DSPS gives LLMs exact schema bounds to write valid SQL while guaranteeing 0% raw data egress.* |
| **How do you handle small LLM unreliability?** | *Small models often output tool calls as JSON prose or fail to follow function-calling contracts. The Tool Ladder acts as a deterministic state machine: it parses raw JSON strings, strips reasoning tags like `<think>`, and enforces step limits.* |
| **How do you verify AI NL-to-SQL correctness?** | *Our eval harness runs generated SQL against DuckDB ground-truth data, normalizes floating-point outputs and row order, and checks if execution results match actual reference query outputs.* |
