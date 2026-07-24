# 01.3 Routing & App Shell

**Tier:** v0 · Phase 1 · **Master spec:** §13 + §13.2 (layout & navigation; D68 nav restructure)

## Objective

The persistent app shell: sidebar navigation, main workspace, educational panel slot, and
status console — with module cards that reflect capability state.

## Spec (§13)

```
┌───────────────────────────────────────────────────────────────┐
│  DataScope                                  [Dark Mode] [Menu] │
├────────────┬──────────────────────────────────────────────────┤
│  SIDEBAR   │              MAIN WORKSPACE                      │
│  Ingest    │   Active module content (charts, editor, chat)   │
│  Profile   │                                                  │
│  SQL       │  ┌──────────────────────────────────────────┐    │
│  Charts    │  │  Educational Panel / SQL Preview          │    │
│  AI Chat   │  │  (query or explanation alongside every    │    │
│  Export    │  │   visualization)                          │    │
│  Studio    │  └──────────────────────────────────────────┘    │
│  ML        │                                                  │
│  Learn     │                                                  │
├────────────┴──────────────────────────────────────────────────┤
│  CONSOLE: DuckDB v… | 14,232 rows × 12 cols | 2.3 MB          │
│  Query: 4.2ms | Web Worker: Active | Memory: 18 MB            │
└───────────────────────────────────────────────────────────────┘
```

Sidebar module states (§13): every module is a card; disabled capabilities are greyed out
with a tooltip explaining *why* ("Needs 2+ numeric columns — your dataset has 1"). Key rows:

| Module | Enabled when | Disabled copy |
| :--- | :--- | :--- |
| Profile, SQL | always (once a table exists) | — |
| AI Chat | per AI mode (§5.1) | "AI is off — enable in settings" |
| Time Series | `canDoTimeSeries` | "Needs a date column" |
| Correlation | `canDoCorrelation` | "Needs 2+ numeric columns" |
| Distribution | `canDoDistribution` | "Needs a numeric column" |
| Export / Share | any table exists | — |
| Studio | v1 arc | "Coming in Studio" (graph/model entries additionally need ≥ 2 tables) |
| ML | backlog | "Coming soon" |

- The **educational panel** is a shell-level slot, not per-module — every visualization and
  insight shows its SQL/explanation there. Build the slot now; modules fill it.
- The **status console** (bottom bar) shows DuckDB version, active table dims, memory,
  last-query timing, worker status — reads from the worker-status and registry stores.
- Routing: tab/module switching (state-based or router — decide in bootstrap). Rapid module
  switching must not race or show stale state (§22 edge case).

## Navigation — four intent groups, capability-gated (§13.2, D68d)

The flat sidebar sketched above is the **pre-D68 arrangement**; D68d regroups those destinations
into four collapsible, capability-gated **intent groups** and demotes the sidebar to *secondary*
navigation (the *primary* path is Verdict → ranked action → thread):

| Group | Destinations | Expanded when |
| :--- | :--- | :--- |
| **DATA** | Ingest, Dossier, per-table Profile | always; the only group open pre-drop |
| **EXPLORE** | SQL, Charts *(one destination; broker-eligible sub-types as internal tabs)* | data loaded; Charts shown only if ≥ 1 chart capability legal (§9) |
| **ANALYZE** | Pivot / cross-tab, Correlation, (v0.5) AI Chat | per-capability (§9) |
| **OUTPUT** | Export / structure report, Save/Share (v0.5) | any table exists |

- **Sidebar is secondary.** Primary path = Verdict → ranked action → thread
  ([../03-profiling/05-dataset-dossier.md](../03-profiling/05-dataset-dossier.md), D68a/c/e). A
  group auto-expands when it holds the active module and may carry a count badge ("Tables (3)").
- **Sticky "skip to data."** A persistent control (and remembered preference) bypasses the Verdict
  straight to per-table profile / SQL, so the expert / returning user (§2 second audience, D22) is
  never trapped in the guided ladder.
- Chart sub-types are **no longer sidebar modules** — a single `ChartsModule` owns internal tab
  routing, filtered to broker-eligible sub-types, auto-selecting the first. **Studio / ML / Learn
  leave v0 nav** (Learn → header help icon; the Dossier absorbed the guided tour, D48).

New/changed shell pieces: `SidebarGroup` (collapsible label + chevron, auto-expand on active,
count badge); `ChartsModule` (internal tab bar over broker-eligible chart types); `stores/ui.ts`
`SidebarModule` simplified to top-level destinations — `ingestion`, `dossier`, `profile`, `sql`,
`pivot`, `charts`, `correlation`, `relationships`, `ai`, `export` (ten; the original draft list
above omitted `correlation`/`ai`/`relationships`, which the grouping table still needs as real
destinations — corrected here to match what actually ships) — chart sub-type selection (time
series/distribution/categorical only; Correlation stays its own ANALYZE destination, it is a
matrix, not a chart sub-type) becomes local state inside `ChartsModule`, carried across the
module boundary as `activeTabId` when a ranked action names a specific chart type.

**Nav facade (2026-07-24, D71 — master §13.3/§16).** Navigation gains a single facade,
`services/navigation.ts` (`openDestination`): **flag-off it drives the `stores/ui.ts`
destination state above; flag-on (`WORKBENCH_ENABLED`) it drives the Workbench tabs store.**
The flag lives at the composition root (`App.tsx` branching shells) and inside this facade
**only** — a feature module needing to know which shell is live is a facade design error;
modules call `openDestination` and never read the flag. This section's intent-group sidebar
stays the flag-off navigation spec of record until the W8 cutover
([`../12-workbench/`](../12-workbench/README.md)).

## Files

`src/app/` (shell, layout, providers), `src/components/` (SidebarCard, **SidebarGroup**,
EducationalPanel, StatusConsole, Tooltip), `src/features/charts/ChartsModule.tsx` (internal
sub-type tabs, D68d).

## Dependencies

[02-state-management.md](02-state-management.md) (tabs, worker status, registry stores).

## Acceptance criteria

- [ ] Shell renders all sidebar entries with correct enabled/disabled/tooltip states from a mocked `DataCapabilities`
- [ ] Educational panel slot renders content pushed by any module
- [ ] Status console reflects store values live
- [ ] Rapid module switching produces no stale content or races
- [ ] Sidebar renders four intent groups; only DATA expanded pre-drop; a group auto-expands on its active module (D68d)
- [ ] Charts is one capability-gated destination with internal sub-type tabs (first eligible auto-selected); no chart sub-types as sidebar modules
- [ ] "Skip to data" bypasses the Verdict to per-table profile / SQL, and the preference persists (D68d)
- [ ] Studio / ML / Learn are absent from v0 nav

## Test plan

Component tests with mocked capability states (all-on, all-off, partial). E2E smoke: switch
through all modules quickly, assert active panel matches selection.

## Definition of done

A new module can be added by registering a card + a workspace panel, nothing else.
