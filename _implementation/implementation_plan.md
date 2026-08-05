# Make the Reveal Page a Self-Contained Experience

The reveal page currently acts as a beautiful but thin landing screen — it shows stats and teaser cards, then funnels everyone to the workspace. The goal is to **make the four action cards interactive and expand into real content inline**, so a casual user can explore schema, data quality, relationships, and query/chart without ever needing the full workspace. The workspace becomes the power-user complement, not the requirement.

## User Review Required

> [!IMPORTANT]
> **The big design question: How deep should each card go?**
> The action cards currently show: Inspect Schema, Data Quality, Relationships, Query & Chart. Each could expand to different levels of depth:
> - **Option A — Inline summaries**: Each card expands into a panel below the cards grid showing key data (column list, quality stats, join graph preview, a simple query runner). All on one scrollable page. Feels like a dashboard.
> - **Option B — Tabbed sections**: Clicking a card swaps the lower half of the reveal into that section's full content (reuses existing `ProfileDashboard`, `ChartsModule`, the join graph, the SQL console). Feels like a lightweight app.
> - **Option C — Hybrid**: Cards expand to show summaries first, with a "go deeper" affordance that swaps to the full component. Best of both, but more UI states.
>
> I'm leaning toward **Option B** because it reuses the existing, battle-tested components (the Dossier ViewSpecRenderer, ProfileDashboard, ChartsModule, SqlModule) without re-implementing anything — and gives a casual user the full power of each surface without the cognitive load of the workspace's multi-panel layout.

> [!WARNING]
> **"Enter Workspace" stays available** but becomes a secondary affordance (not the hero CTA). It moves to a small persistent link in the footer/header of the reveal, for users who want the multi-panel layout.

## Open Questions

1. **Should the Dossier (Blueprint) surface on the reveal too?** It's already the richest post-ingest summary — the Verdict, top insights, identity band. Right now those are workspace-only. Surfacing the full `DatasetDossier` as a fifth section (or the default landing within the reveal) would give the most value with the least work.

2. **AI Pane on the reveal?** Should the AI chat be accessible from the reveal page, or is that firmly workspace territory? A floating chat button could make it available without the full workspace layout.

3. **SQL console**: The workspace has the SQL console in the drawer. On the reveal, should this be a standalone inline editor with results below it, or a simplified "ask a question" interface?

## Proposed Changes

### Reveal Page Architecture

The reveal page transitions from a static landing to a **single-page app with sections**, keeping its beautiful aesthetic.

#### [MODIFY] [WorkbenchShellReveal.tsx](file:///Users/justin/github/DataScope/src/app/WorkbenchShellReveal.tsx)

The `AnalystReveal` component changes from a static greeting to an interactive hub:

1. **Action cards become navigation tabs**: Clicking "Inspect Schema" / "Data Quality" / "Relationships" / "Query & Chart" opens that section's content below the cards.
2. **A content viewport** appears below the cards grid, hosting the relevant component:
   - **Inspect Schema** → `ProfileDashboard` (column cards, stats, per-table picker)
   - **Data Quality** → `DataQualityPanel` (nulls, outliers, distributions — already exists in `features/explorer/DataQualityPanel.tsx`)
   - **Relationships** → `DatasetMap` (the join graph / ERD view)
   - **Query & Chart** → `SqlModule` + `ResultsGrid` + `AutoChartPanel` (the SQL editor with auto-charting)
3. **The stat pills and type breakdown stay** at the top as the persistent "data identity" band.
4. **"Enter Workspace →"** moves from the hero CTA to a subtle persistent affordance in the reveal header — a small "Open workspace" link for power users who want multi-panel.
5. **The reveal page no longer auto-transitions** to the workspace on any card click. The workspace is opt-in.

**Key implementation details:**
- Add a `activeSection` state: `'overview' | 'schema' | 'quality' | 'relationships' | 'query'`
- When `activeSection !== 'overview'`, the content viewport slides in with a spring animation below the cards
- The active card gets the amber accent ring treatment
- A "back to overview" / close button returns to the card grid view
- The existing `useDatasetBaseline` hook provides the data all sections need
- Each section mounts the real component — no re-implementation

**Animations:**
- Content panel slides up from below the cards with the existing `reveal-card-in` spring
- Cards that are not active dim slightly
- Active card gets elevated border glow
- Smooth height transition on the content viewport

#### [MODIFY] [WorkbenchShellReveal.tsx](file:///Users/justin/github/DataScope/src/app/WorkbenchShellReveal.tsx) — State machine amendment

The `RevealPhase` state machine gains nuance:
```
'welcome' → 'reveal' → user stays in reveal, exploring sections
                      ↘ 'sweeping' → 'shell'  (explicit "Open workspace" click)
```
The `handleEnterWorkspace` callback is no longer the primary path — it's the escape hatch to the workspace.

---

### Minimal New Code

The beauty of this approach is that nearly everything already exists:
- `ProfileDashboard` — column cards, stats, table picker ✅
- `DataQualityPanel` — nulls/outliers/distributions ✅
- `DatasetMap` — join graph / ERD ✅
- `SqlModule` — SQL editor + results + auto-chart ✅
- `useDatasetBaseline` — data loading hook ✅

We're just **re-hosting** these components inside the reveal page's layout instead of requiring the workspace grid.

## Verification Plan

### Manual Verification
1. Drop a dataset → the reveal page should appear with the four action cards
2. Click each card → the corresponding section should expand with real content
3. Use the SQL editor → queries should run against the loaded data
4. Click "Open workspace" → should transition to the full workspace as before
5. Each section should be fully functional (profile columns visible, charts renderable, join graph interactive)
6. Back navigation between sections should be smooth
7. Mobile/narrow viewport should stack sections naturally

### Automated Tests
- Existing `WorkbenchShellReveal.test.tsx` should continue passing (the welcome → reveal → shell flow is unchanged)
- New tests for section activation/deactivation state
