# 08 — Persistence & Export

**Tier:** v0.5 · **Phase:** 5 (§19) · **Depends on:** [`../04-sql/`](../04-sql/) (tables
worth exporting); save/share additionally on
[`../09-edge/04-persistence-endpoints.md`](../09-edge/04-persistence-endpoints.md).

Getting results *out*: client-side Parquet export (no server involved) and the explicit,
opt-in R2 save/share layer (D5).

| Doc | Covers |
| :--- | :--- |
| [01-parquet-export.md](01-parquet-export.md) | §12.2 — client-side COPY, copy-to-Jupyter snippet |
| [02-r2-save-share.md](02-r2-save-share.md) | §12.3 D5 — share links, TTL, delete, abuse controls (client side) |
| [03-dsps-spec.md](03-dsps-spec.md) | §12.2 D31/**D37** — DSPS as a first-class interface: `dsps_version`, forward/backward-compat, schema-only degradation, MCP-served (D38) |

The boundary matters (§12.2): export is fully client-side — **a server component only
enters when persistence beyond the tab is wanted**, and then only via explicit action with
disclosure ([`../../foundations/privacy-model.md`](../../foundations/privacy-model.md)).

Future export shape (backlog): the Context Bundle —
[`../../backlog/context-bundle.md`](../../backlog/context-bundle.md).
