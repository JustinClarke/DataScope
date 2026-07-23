# 10 — The Studio Arc (v1)

**Tier:** v1 · **Phases:** 7–9 (§19, D12) · **Depends on:** the complete v0 + v0.5 stack,
**gated on the §18 acceptance criteria holding** — foundation profiling must be proven in
the wild before structural inference is built on it.

This is the identity release (D12): drop a folder of Parquet files → profiling →
relationship inference → schema graph → quality report → generated dbt project → exportable
semantic model. **Everything is deterministic and SQL-derived unless explicitly marked
AI-assisted — the whole arc works in local-only mode.**

**This folder is deliberately three sub-folders, not one file.** Each is a full phase-sized
effort, gated on the layer below being trustworthy first. **Do not build it as one drop.**

| Sub-folder | Phase | Covers |
| :--- | :--- | :--- |
| [01-quality-report/](01-quality-report/) | 7 (D14) | "Lighthouse for data" — diagnostics report (§20.8) |
| [02-relationship-graph/](02-relationship-graph/) | 8 (D11) | Relationship inference + ER schema graph (§20.6) |
| [03-semantic-dbt-export/](03-semantic-dbt-export/) | 9 (D11) | Star schema, dbt project, semantic model, KPIs (§20.6) |

Cross-cutting rules for the arc:
- **Confidence everywhere (§20.6, §17):** every inference carries a confidence label and its
  evidence ("87% of `order.customer_id` values appear in `customer.id`"), and is manually
  overridable — the same override philosophy as the column classifier.
- **Exports are generated only from the *user-accepted* graph, never raw inference** (§17).
- The D17 spike findings (recorded in
  [`../../architecture/decisions.md`](../../architecture/decisions.md) and §20.6) are the
  empirical starting point for Phase 8 — read them before designing the inference engine.
- Sidebar: Studio entries stay "Coming in Studio" until this arc; graph/model entries
  additionally need ≥ 2 tables (§13).
