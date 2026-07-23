# 01 — Foundation

**Tier:** v0 · **Phase:** 1 (§19) · **Depends on:** nothing — this is the bottom of the stack.

Project scaffold, state architecture, and app shell. Everything else in `build/` sits on
this. Per D18, the only things frozen before the spikes are the TypeScript interfaces
(§21.4) and the state tree (§21.7) — both specced in this folder.

**Engine-agnostic core — the `QueryEngine` interface (D49, §6).** Among the interfaces frozen
up front is a **`QueryEngine` boundary** (execute / register / summarize): profiling,
classification, insight generation, and DSPS emission are written against it, **never against
duckdb-wasm directly**. The v0 implementation is DuckDB-Wasm; the boundary is ~zero marginal
cost now and the entire pre-work for the D51 desktop native-DuckDB sidecar (and a possible
DSPS CLI/CI surface, gated on Play-4 evidence). No new product surface today — just the seam.
Architecture placement: [`../../architecture/system-design.md`](../../architecture/system-design.md).

| Doc | Covers |
| :--- | :--- |
| [01-project-bootstrap.md](01-project-bootstrap.md) | Vite + React + TS + Tailwind, hosting headers, bundle discipline |
| [02-state-management.md](02-state-management.md) | The state tree: what lives in React state vs. store vs. worker |
| [03-routing.md](03-routing.md) | App shell, sidebar navigation, module states (§13) |

**Exit criteria for the folder:** an empty-but-navigable app shell with the sidebar layout
of §13, typed stores, and CI running lint + unit tests. The Phase-1 deliverable ("drop a
folder of CSVs → every table registered and profiled → correct modules lit up") also needs
[`../02-ingestion/`](../02-ingestion/) and [`../03-profiling/`](../03-profiling/).
