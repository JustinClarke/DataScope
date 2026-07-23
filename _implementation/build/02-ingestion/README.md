# 02 — Ingestion

**Tier:** v0 · **Phase:** 1 (§19) · **Depends on:** [`../01-foundation/`](../01-foundation/)
(shell, stores, types).

Getting data into DuckDB-Wasm: file drop, the DuckDB worker itself, the table registry,
folder/multi-file ingestion (D13), and the large-file tiers. API-URL ingestion is v0.5 —
[`../07-connectivity/`](../07-connectivity/).

| Doc | Covers |
| :--- | :--- |
| [01-file-drop.md](01-file-drop.md) | §7.1/7.2 — formats, drop zone, ingestion flow, telemetry |
| [02-duckdb.md](02-duckdb.md) | §6 — DuckDB-Wasm worker, lazy-load, Cache API |
| [03-table-registry.md](03-table-registry.md) | §7.5 — sidebar table list |
| [04-multi-file.md](04-multi-file.md) | §7.5 D13 — folder drop, cross-table catalog |
| [05-large-files.md](05-large-files.md) | §7.3 — size tiers, sampled preview, memory monitoring |

**Two spikes anchor here (D18/D17):**
1. *Ingestion spike* — before freezing ADRs: COOP/COEP hosting requirements, DuckDB-Wasm
   cold-start + memory behavior on target hardware, classifier behavior on messy CSVs.
2. *D17 inference spike* — once the table registry exists: 1–2 days, disposable
   FK-containment/cardinality prototype against the e-commerce sample folder. Findings →
   [`../../architecture/decisions.md`](../../architecture/decisions.md) spike log and §20.6.
   Code thrown away; sequencing of the Studio arc unchanged.

**Exit criteria:** drop a folder of CSVs → every supported file becomes a registered,
queryable table with live telemetry; oversized inputs degrade per the §7.3 tiers.
