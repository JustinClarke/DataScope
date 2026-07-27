# W3 — Tab Model Maturation

**Tier:** v0.60 (the Workbench, D71) · flag-gated `WORKBENCH_ENABLED`, flag-on only ·
**Master spec:** §13.3 ("The canvas and the tab model" — the singleton/artifact split and the
preservation contract), §19 (W3 row), D55 (envelope invariant, unchanged), D68e (`ThreadConfig`
→ initializer)

> **Amended by D73 (2026-07-26) — v0.70 / S5.** This leaf deferred pinning "to whichever phase
> first wires a real result-producing tab type." **S5 is that phase.** The **query tab** becomes
> the artifact kind's first live member after eight W-phases with zero artifact callers — its
> own editor, Run, results and name; editable and re-runnable without touching the console or a
> sibling; per-instance, never deduped. Two producers: pin-from-console and a chosen Suggested
> Exploration (born pre-run). The singleton contract this leaf built is unchanged, but **its
> worked example moves**: `'sql'` leaves the closed union, so the singletons are Profile
> (per table), Pivot, Charts, Correlation and Export — six, plus one artifact type.
> Keep-mounted extends to query tabs unchanged — which makes them the first tab type a user can
> open **arbitrarily many** of, so two things follow. **Decided:** the tab strip gains
> **horizontal scrolling**. **Measured, not guessed:** the ceiling number and the at-the-ceiling
> behaviour (refuse the pin with a reason vs. evict the least-recently-touched tab) come from the
> tier's S0 probe — this leaf's "the memory ceiling is managed, not dissolved" is exactly why.
> See [`../14-workspace-streamline/`](../14-workspace-streamline/README.md) and its
> [`00-synthesis-and-limits-probe.md`](../14-workspace-streamline/00-synthesis-and-limits-probe.md).

## Objective

W0 shipped a minimal open/close store with no dedup, no real switching UI, and no mounted
content. W2 added the `'profile'` tab type and a real caller (`ExplorerPanel`), but tabs still
only ever get created, never reused, and the "crude tab host" (W1) is a display-only list — no
click to switch, and nothing renders per tab, so there is no state to preserve yet. W3 matures
the contract: **singleton tabs dedupe by `(type, subject)`, artifact tabs never do; switching
away and back never resets a tab's state; every open tab stays mounted.**

## Scope call (made this session, confirmed with the human before building)

The charter row also lists **pinning**. Per §13.3 and the pre-fold ideation (formerly
`UI-REDESIGN-LIFECYCLES.md`/`-SPEC.md`, deleted post-v0.69; the master paragraph condenses their
content), "pin" is not a
tab-pinning toggle — it is the `[pin]` action on a produced SQL/chart result that **promotes it
into a new artifact tab** ("a pinned chart, a produced result" are artifact-tab examples, not a
separate mechanic). The Workbench has no result-producing content yet — SQL/Pivot/Charts reach
the canvas only via W5's strip/palette — so there is nothing real to pin. Building a `[pin]`
affordance now would mean inventing a placeholder artifact type with no consumer, which is
exactly the speculative code this repo's Part I/II rules forbid. **Pinning is deferred to W5**
(or whichever phase first wires a real result-producing tab type), same pattern as W2's
Add-data/share-links deferral. What *is* buildable now, and is this leaf's actual scope:

- The **singleton/artifact classification mechanism** — exhaustive over `TabType`, so every
  current and future tab type is force-classified at compile time (the same discipline W0 set
  for `TabType` itself). `openTab`'s dedup branch is written generically; both tab types that
  exist today (`'map'`, `'profile'`) are singletons, so the artifact branch has no live caller
  yet (`_artifactSpec` stays a signature-only parameter, per W0). Proven with real singleton
  calls, not a synthetic type.
- **Keep-mounted-first preservation, for real** — the crude list host is replaced with a host
  that actually switches (tab headers, click-to-activate, close) and actually renders content
  per tab type, so "switching away and back preserves state" is a testable claim instead of a
  vacuous one (there was no mounted state to lose before this phase).

## Spec

- **`types/tabs.ts` gains `TabKind` and `TAB_KIND`.** `TabKind = 'singleton' | 'artifact'`;
  `TAB_KIND: Record<TabType, TabKind>` is a `Record` over the closed `TabType` union, so adding
  a tab type without classifying it is a compile error. Today: `{ map: 'singleton', profile:
  'singleton' }`.
- **`stores/tabs.ts`'s `openTab` dedupes singleton types.** Before appending a new tab: if
  `TAB_KIND[type] === 'singleton'` and a tab with the same `(type, subject)` is already open,
  reuse it — set `activeTabId` to its `id` and return that `id`, without creating a duplicate or
  touching its existing `initializer` (the initializer is set atomically at creation per D68e;
  reuse never overwrites it — re-clicking a ranked action that names an already-open tab
  shouldn't silently discard whatever prefill/state that tab already carries). Artifact types
  skip the dedup check entirely and always append — this is already today's unconditional
  `openTab` behavior, so the artifact branch requires no new logic, only the classification that
  routes to it.
- **`stores/tabs.ts` gains `setActiveTab(id)`.** The only way to switch to an already-open,
  non-active tab without closing something — W0/W1 never needed this because nothing rendered
  per-tab content to switch *to*. No-ops (leaves `activeTabId` unchanged) if `id` doesn't name an
  open tab.
- **`WorkbenchShell.tsx`'s canvas region gets a real tab host.** Two parts, both required for the
  preservation contract to mean anything:
  - **Tab headers** — one per open tab, clickable (`setActiveTab`) plus a close control
    (`closeTab`), with the active one marked. Replaces W1's read-only `<ul>`.
  - **Tab content, keep-mounted.** Every open tab's content renders simultaneously; only the
    active one is visible (native `hidden` attribute — never a conditional `{active && <X/>}`,
    which would unmount and defeat the entire contract). `'profile'` tabs mount the existing
    `ProfileDashboard` component (`features/profiling/ProfileDashboard.tsx`, already
    prop-compatible: `initialTableId={tab.subject}`) — not `ProfileModule`, which reads the old
    shell's `useUIStore.activeTabId` global and would show the same table in every mounted
    Profile tab regardless of which table that tab's `subject` names. `'map'` tabs render a
    placeholder (no real map content exists before W4), matching W1's `Act0`/`Act1` placeholder
    convention.
  - **`WorkbenchShell` wraps its render in `EducationalPanelProvider`.** `ProfileDashboard` (via
    `ColumnCard`'s "Show SQL" and `InsightFeed`'s same action) calls `useEducationalPanel()`,
    which throws outside its provider. The old shell wraps `AppContent` in this provider
    (`App.tsx`); the Workbench branch never has, because nothing under it needed the context
    until now. Rendering the panel's *content* is W7's job (the bottom inspector) — this phase
    only needs the context to exist so mounting real tab content doesn't throw.

## Files

`src/types/tabs.ts` (modified — `TabKind`, `TAB_KIND`), `src/stores/tabs.ts` (modified —
singleton dedup in `openTab`, new `setActiveTab`), `src/app/WorkbenchShell.tsx` (modified — real
tab host: headers + keep-mounted content, `ProfileDashboard` wiring, `EducationalPanelProvider`
wrap). No changes to `services/navigation.ts`, `features/explorer/ExplorerPanel.tsx`, or
`features/profiling/ProfileModule.tsx` (the old shell keeps using the latter unchanged).

## Dependencies

W1 (Workbench scaffold) — satisfied, shipped 2026-07-24. (W2 is also shipped, and W3 reuses its
`'profile'` `TabType` member, but the charter's own dependency row for W3 names only W1.)

## Acceptance criteria

- [x] `TAB_KIND` is exhaustive over `TabType` (a new `TabType` member with no `TAB_KIND` entry is
      a compile error) and both existing members are classified `'singleton'`
- [x] `openTab` called twice with the same singleton `(type, subject)` produces one tab, not two;
      the second call activates the existing tab and does not overwrite its `initializer`
- [x] `openTab` called with different subjects for the same singleton type produces one tab per
      subject (regression: today's `'sql'`-vs-`'charts'`-style distinct-subject behavior is
      unchanged)
- [x] `setActiveTab(id)` switches `activeTabId` among open tabs; a call with an id that names no
      open tab is a no-op
- [x] The canvas region renders clickable tab headers; clicking a non-active tab's header
      switches to it; closing a tab removes it and (per W0's existing `closeTab` behavior)
      reassigns `activeTabId` if it was the closed one
- [x] **The preservation proof:** with two `'profile'` tabs open for two different tables (a
      dataset registering both), changing the active tab's in-component state (its table
      picker's selection, away from the tab's own `subject`), switching to the other tab, then
      switching back — the first tab's changed local state is still there, proving the component
      was never unmounted across the switch
- [x] `WorkbenchShell` renders without throwing when a `'profile'` tab is open (the
      `EducationalPanelProvider` wrap makes `useEducationalPanel()` safe to call from mounted tab
      content)
- [x] Full existing suite green, including W1/W2's existing `WorkbenchShell.test.tsx` assertions
      updated to the new host markup (superseding, not silently diverging from, the "crude tab
      host" tests W1 wrote for a component this phase replaces)

## Test plan

Vitest + React Testing Library. `stores/tabs.test.ts` first: dedup (same subject reuses, no
initializer overwrite; different subjects don't collide) and `setActiveTab` (switches; no-ops on
an unknown id) — extending the existing envelope-invariant/open/close suite, not replacing it.
Then `WorkbenchShell.test.tsx`: update the W1 "lists open tabs" test to the new header/content
markup; add a switching test (click a header, active tab changes) and a close test; then the
preservation test itself — mock `services/profiling` (`loadTableCardStats`) and
`services/insights` (`loadInsights`) the same way `InsightFeed.test.tsx` does (`vi.hoisted` +
`vi.mock`, resolving to empty/no-op) so mounting real `ProfileDashboard` content never reaches
the DuckDB worker in a UI test. Run the full existing suite last.

## Definition of done

Singleton dedup and `setActiveTab` tested at the store level; the canvas region is a real,
switchable, keep-mounted tab host with `ProfileDashboard` as its first real content; the
preservation proof passes; full suite green; `tsc -b` clean; `oxlint` clean on every changed
file; `graphify update .` run. Pinning stays explicitly open scope, deferred to W5.
