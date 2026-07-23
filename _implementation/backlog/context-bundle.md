# Backlog: Context Bundle Export / Structured Knowledge Engine

**Tier:** backlog · **Master spec:** §20.5, §12.3 (future export shape)

The longer-term thesis: DataScope evolves from "upload → explore → SQL → charts" into a
deterministic system that converts raw data into structured knowledge.

**Already shipping elsewhere (don't rebuild here):**
- Deterministic insight layer's v0 seed = the Phase-3 insight feed (D10,
  [`../build/03-profiling/04-profile-ui.md`](../build/03-profiling/04-profile-ui.md)).
- The **schema half** of the Context Bundle (entities, relationships, measures, dimensions)
  = Phase 9's semantic-model export
  ([`../build/10-studio/03-semantic-dbt-export/`](../build/10-studio/03-semantic-dbt-export/)).

**What remains in this backlog item:**
- **Enhanced profiling:** beyond column types — semantic roles, missingness patterns,
  distribution shape, anomaly flags.
- **Transformation compiler:** the transformation layer matured into named, repeatable CTE
  pipelines and feature-engineering layers — DuckDB-Wasm as an in-browser transform engine.
- **Insight-layer maturation:** richer rule library, cross-table insights, better
  interestingness ranking.
- **Context Bundle export (insight/history half):** raw tables + transformed tables + SQL
  history + insights + chart specs in one exportable artifact — the bridge to a downstream
  context-consuming tool ("ContextLab").

**Trigger:** Phase 9 shipped and a concrete downstream consumer for the bundle exists.
