# 10 — The Studio Arc (backlog)

**Tier:** backlog · **Phase:** 9 only (§19, D11) · Phases 7–8 cut to backlog 2026-08-02
(D11/D14 amendments — see `DATASCOPE.md` Revised (19)).

**Phases 7 and 8 are cut, not paused.** `01-quality-report/` (Phase 7, D14) and
`02-relationship-graph/` (Phase 8, D11) are deleted — the shipped v0 Join Graph (beta) and
the v0.70 explorer Data Quality & Health panel already deliver the lightweight version each
targeted, and the deeper capabilities weren't judged worth building. Phase 8's entity
inference + fact/dimension classification are preserved as a candidate future ERD
enhancement: [`../../backlog/relationship-graph-erd-ideas.md`](../../backlog/relationship-graph-erd-ideas.md).
Quality-report has no backlog entry.

Only Phase 9 remains, itself already unscheduled beforehand (BUILD-ORDER.md's Backlog
section) and untouched by this cut:

| Sub-folder | Phase | Covers |
| :--- | :--- | :--- |
| [03-semantic-dbt-export/](03-semantic-dbt-export/) | 9 (D11) | Star schema, dbt project, semantic model, KPIs (§20.6) |

Cross-cutting rules that still apply to Phase 9:
- **Confidence everywhere (§20.6, §17):** every inference carries a confidence label and its
  evidence ("87% of `order.customer_id` values appear in `customer.id`"), and is manually
  overridable — the same override philosophy as the column classifier.
- **Exports are generated only from the *user-accepted* graph, never raw inference** (§17).
  Note this now implies a dependency the cut leaves unresolved: Phase 9's star-schema
  proposal needs Phase 8's entity inference + fact/dimension classification as input, and
  that's backlog, not built — reviving Phase 9 means reviving (or re-scoping around) that
  output first.
- Sidebar: Studio entries stay "Coming in Studio" until this arc; graph/model entries
  additionally need ≥ 2 tables (§13).
