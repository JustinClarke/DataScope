# 07 — Connectivity (API Ingestion)

**Tier:** v0.5 · **Phase:** 5 (§19) · **Depends on:** [`../02-ingestion/`](../02-ingestion/)
(registry, telemetry, JSON path); Tier 2 additionally on
[`../09-edge/02-cors-relay.md`](../09-edge/02-cors-relay.md).

Pulling data from an external API instead of uploading a file (§7.4). v0.5 ships **Tier 1
(direct fetch) + Tier 2 (CORS relay)** only; Tier 3 (credential vault for secret-key
sources) is deferred (D4) — [`../../backlog/tier3-vault-ingestion.md`](../../backlog/tier3-vault-ingestion.md).

| Doc | Covers |
| :--- | :--- |
| [01-api-tier1-fetch.md](01-api-tier1-fetch.md) | §7.4 Tier 1 — direct browser fetch |
| [02-api-tier2-relay.md](02-api-tier2-relay.md) | §7.4 Tier 2 — relay fallback (client side) |
| [03-refresh-from-source.md](03-refresh-from-source.md) | §7.4 — manual re-run |

Shared mechanics across tiers (§7.4): pagination accumulation before handing to DuckDB;
telemetry UI reuse ("fetched page 4…"); the relay's abuse/rate-limit controls are a
pre-public-ship requirement (Worker side, [`../09-edge/`](../09-edge/)).

**Exit criteria (with 08):** pull an API into a table, transform it, download it, and share
a link that works on another device (Phase-5 deliverable).
