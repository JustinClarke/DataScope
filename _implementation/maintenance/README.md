# Maintenance — doc consistency runbook

The docs are large and the master ↔ split-tree mirror is easy to break. This folder is the
cheap way to keep it honest: a **sweep script** and this **runbook**. Load this before landing
a doc change so the workflow and the mirror map don't have to be re-derived each time.

- `sweep.sh` — one-command consistency check (D-range headers, master↔tree agreement,
  mirror coverage, dangling D-refs). Run: `bash _implementation/maintenance/sweep.sh`.

## The workflow (CLAUDE.md, restated)

- **Master-first, then mirror.** Edit `DATASCOPE.md` first, then mirror into the citing leaf
  docs. Never land a change in a leaf doc that isn't in the master.
- **Decisions are append-only.** New intent lands as a new `Dn` row in master §0 — never edit
  or reorder the settled record without an explicit human instruction.
- **Snapshot before a synthesizer edits** (this repo is not under git): copy `DATASCOPE.md` +
  `_implementation/` to the scratchpad so the diff is checkable.
- Trivial single-file questions don't need any of this — it's for design changes and reviews.

## Landing a new decision — checklist

1. **Append the `Dn` row** to master §0 (`DATASCOPE.md`) and mirror a condensed row into
   [`../architecture/decisions.md`](../architecture/decisions.md).
2. **Bump the `D1–Dn` range** in all six spots below.
3. **Mirror the content** into every citing leaf doc — find them with the map / greps below.
4. **Route non-landed items:** deferred → `../backlog/` (e.g.
   [`deferred-architecture.md`](../backlog/deferred-architecture.md)); rejected →
   [`../product/rejected-ideas.md`](../product/rejected-ideas.md). Point the `Dn` row at them.
5. **Run `bash maintenance/sweep.sh`** — must print `SWEEP CLEAN`.

### The six places the `D1–Dn` range lives

`sweep.sh` check [2] catches these automatically, but for hand-editing:

| # | File | Location |
|---|------|----------|
| 1 | `DATASCOPE.md` | §Contents table, row 0 ("D1–Dn — the settled decisions…") |
| 2 | `DATASCOPE.md` | §16 file tree, the `decisions.md` comment |
| 3 | `_implementation/README.md` | the `architecture/` folder row |
| 4 | `_implementation/architecture/decisions.md` | the H1 title |
| 5 | `_implementation/architecture/decisions.md` | the dated intro history paragraph (add the new date + one-line round summary here) |
| 6 | `_implementation/meta/question-index.md` | the "Decisions:" bullet |

## Section → leaf mirror map

**Authoritative source:** every leaf doc declares what it mirrors in a `**Master spec:**`
header. Regenerate the true map any time with:

```
grep -rn "Master spec:" _implementation --include='*.md'
```

Snapshot for orientation (confirm against the grep before relying on it):

| Master area | Primary leaf doc(s) |
|-------------|---------------------|
| §0 Decisions | `architecture/decisions.md` |
| §1–§4 identity / users / positioning / non-goals | `product/vision.md`; §3.4 → `product/competitive-landscape.md`; §3.5 + §24 → `product/strategy.md`; rejected → `product/rejected-ideas.md` |
| §5 privacy | `foundations/privacy-model.md` |
| §6 architecture + §16 file structure | `architecture/system-design.md` |
| §7 ingestion | `architecture/data-flow.md`, `build/02-ingestion/*` |
| §8 classification | `build/03-profiling/01`–`02` |
| §9 capabilities broker | `build/03-profiling/03-capability-engine.md` |
| §10 modules | `build/03-profiling/04`, `build/04-sql/*`, `build/05-charting/*` |
| §11 AI (NL→SQL) | `build/06-ai/*`; edge in `build/09-edge/01` |
| §12 modify / export / persistence | `build/04-sql/05`, `build/08-persistence/*` |
| §13 UI / Dossier | `build/01-foundation/03-routing.md`, `build/03-profiling/05-dataset-dossier.md` |
| §14 samples | `foundations/sample-datasets.md` |
| §15 performance | `foundations/performance-budgets.md` |
| §18 metrics / acceptance | `foundations/testing-strategy.md`, `product/strategy.md` |
| §19 phases / roadmap | `product/roadmap.md` |
| §19 v0.25 tier (D70) | `build/v0.25/*`; also `product/roadmap.md`, `foundations/privacy-model.md` (edge-synthesis custody) |
| §20 deferred | `backlog/*` |
| §21 planning / ADRs | `architecture/decisions.md`, `foundations/testing-strategy.md` |
| §23 security / infra | `foundations/security-model.md`, `foundations/infrastructure.md` |
| §24 launch strategy | `product/strategy.md`, `product/competitive-landscape.md` |

## Indexing greps (the docs are big — search, don't scroll)

- **Everything about a decision:** `grep -rn "D24\b" .` (add `-l` for just filenames).
- **Which leaf(s) cite a master section:** `grep -rn "§9\b" _implementation`.
- **Regenerate the mirror map:** `grep -rn "Master spec:" _implementation --include='*.md'`.
- **Navigation for agents / questions:** [`../meta/question-index.md`](../meta/question-index.md).
- **Refresh the question index after a change:** the `refresh-question-index` skill.
