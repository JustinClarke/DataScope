# S4 — Run from anywhere + the shared guarded run path

**Tier:** v0.70 (the workspace streamline, D73 execution) · **Master spec:** §19 (the v0.70
subsection, S4 row), §13.3 ("Behaviour that is decided" — run-from-anywhere; "The transform guard
moves into the shared run path"; the ranked-action routing table), §10 Module 2 / §12.1 (the
transformation layer and its guard), §11.1 (the AI pane's audit trail) · **Decision row:** D73,
calls (3) and (5) · **Depends on:** S3 (the drawer console and `activateConsole()`) ·
**Gated by S0:** no.

This leaf lands before its own implementation, per §19's binding constraint — the acceptance
criteria below are checked as the code lands, not written up afterward.

## Objective

Two deliverables that are one change. **(a)** Every surface that *displays* SQL gains a **run
action** that sends the query to the drawer console, opens it, and runs it without navigating away
from the chart or answer on screen. **(b)** `TransformGuardModal` stops being a modal `SqlModule`
mounts and becomes an **interception inside the one run path every runner calls** — so that when
S5 adds N independent query tabs, none of them can execute a source mutation unguarded.

(b) is the reason this is not a chrome phase. Today the guard is correct because there is exactly
one runner. S5 makes that false. S4 is the phase that makes the guard structurally independent of
how many runners exist, and it ships **before** the runners do.

S4 does not delete the `'sql'` tab, add query tabs or Pin, re-home Pivot's results, or move
`QuerySuggestions` — S5 and S6 own those.

## Scope calls

**1. The run path is a service function plus one mounted guard host, not a hook.** A hook would
have to be called from a component, which is precisely what the four `GeneratedSql` blocks, the
history rows, the AI turns and `openDestination` (a plain function) cannot all be. So the path is
`services/runPath.ts` — importable from anywhere, including non-React code — and the modal it can
raise is hoisted to a single `TransformGuardHost` mounted once in `WorkbenchShell`. The guard's
pending statement lives in `stores/runGuard.ts` because those two halves are in different trees.

**2. Two entry points, one path.** `requestRun(sql)` is the path: classify → guard-or-execute.
`runInConsole(sql)` is the remote sender: set the console buffer, `activateConsole()`, then
`requestRun`. The console's own Run button calls `requestRun` directly (it is already the console);
every other surface in the app calls `runInConsole`. There is exactly one place that decides
whether a statement is intercepted, and both entry points go through it.

**3. A run action replaces the console buffer, deliberately — and this is the opposite of S3's
seeding rule, on purpose.** S3 scope call 10 refuses to overwrite a non-empty buffer on a
*navigation* click ("Open table"), because the user did not ask for SQL to change. A run action is
the user asking for exactly this query to run; the console must then show what ran, or the buffer
and the results disagree. The two rules are consistent under one principle: the buffer follows the
user's stated intent, and never a side effect of navigation.

**4. Superseding, not refusing.** `runQuery` already treats a new run as superseding an in-flight
one (`services/sql.ts` — "first-class control flow, not an error"), and a run action inherits that:
clicking Run on a chart's SQL while a slow query is going aborts the old one. The console's own Run
button keeps its `status === 'running'` disable, because it is the surface *showing* the running
state and a disabled button there is information. Remote surfaces have no such context and are
never disabled.

**5. One `RunSqlButton`, even though `GeneratedSql` is four deliberate copies.** The per-folder
`GeneratedSql` duplication is a documented choice about a *panel's layout* within one chart module.
The run action is not layout — it is the entry to the guarded path, and copying an entry to a
data-safety mechanism into six files is how one of them ends up calling `runQuery` directly a year
from now. `features/sql/RunSqlButton.tsx` is shared by all six sites; the panels stay four copies.

**6. SQL-bearing ranked actions re-route inside `openDestination`, and `SqlModule`'s prefill
auto-run effect is deleted.** This is the load-bearing call in the phase. Today a `duplicates`
ranked action (D68e, `capabilities.ts`'s `insightAction`) sets `prefilledConfig.sql`, opens the SQL
tab, and `SqlModule`'s mount effect runs it. With S3 shipped, `SqlModule` is *also* mounted in the
drawer — so that effect is now a mount-time auto-run in a region present in every session, which is
a hazard S3 left standing. S4 removes it and moves the behaviour where §13.3's routing table puts
it: `openDestination` sees `module === 'sql'` with a `sql` prefill and calls `runInConsole(sql)`
instead of opening a tab. Both existing dispatch sites (`OptionsStrip`, `SynthesisPanel`) are
covered without touching either, and S5's removal of `'sql'` from the union then deletes a branch
rather than hunting for callers. "Opens on the answer" (D68e) is preserved exactly — it now opens
on the answer in the console.

**7. A failed AI attempt gets a run action too.** J5 is "the AI answers, the user verifies by
running the model's SQL," and a *failed* attempt is often the one worth running by hand — the user
wants to see the error themselves. `AttemptView` gets the action on every attempt, ok or not. The
D55 seam is untouched: the app renders the model's text, a person reads it and clicks; nothing
here lets a model cause execution.

**8. History rows re-run through the same path.** A history row is already inside the console, so
`runInConsole` is redundant there in one respect (the drawer is open, on the console view) and
correct in every other (buffer, guard, supersede). It calls the same function; no history-specific
code path exists.

**9. Copy SQL is added to, never replaced.** Every existing Copy SQL button stays. Copy is for
taking the query elsewhere; Run is for the journey the app could not do. Removing Copy would be a
regression dressed as a simplification.

**10. `ResultsGrid`'s and `PivotBuilder`'s Copy SQL get no run action.** `ResultsGrid` copies the
query that *just ran* in the console — a Run there is a re-run button on the surface that already
has Run. `PivotBuilder`'s generated SQL belongs to Pivot's own results home, which is S5's
deliverable; adding an affordance here that S5 relocates is churn. Both are named so neither is
"discovered" later as a miss.

**11. The guard host is mounted once, in `WorkbenchShell`, and nowhere else.** Not in `App`, not in
`ViewerMode`: a run cannot originate outside the workbench, and a second mount would reintroduce
exactly the per-surface duplication this phase removes.

**12. Viewer mode grows no run actions, and this needs no branch.** `ViewerMode` renders neither
the explorer, nor chart modules, nor the AI pane, nor a console (S3 scope call 11), so no run
affordance is reachable there structurally. As with S3, this leaf adds an assertion rather than a
`viewerMode` conditional.

**13. A remote run opens the drawer; it never expands it.** `activateConsole()` sets
`open`/`view`/`consoleActivated` and nothing else. S3's rule — nothing about a result changes the
drawer's height or expansion by itself — survives run-from-anywhere unchanged, including when the
result is large. The expand prompt is still the only path to expansion.

## Spec

### `src/stores/runGuard.ts` (new)

```ts
import type { StatementInfo } from '../lib/statementClass';

interface RunGuardState {
  /** The statement held between Run and execution, awaiting the user's call. */
  pending: StatementInfo | null;
  hold: (info: StatementInfo) => void;
  release: () => void;
}
```

Deliberately dumb: it holds one statement. The three resolutions (materialize / modify anyway /
cancel) are functions in `runPath.ts`, not store actions, because two of them execute SQL and this
store must not know how to run anything.

### `src/services/runPath.ts` (new)

```ts
/** Execute, or intercept. The one place that decision is made. */
export function requestRun(sql: string): void;

/** Send SQL to the console, open it, and run it — every remote surface's entry. */
export function runInConsole(sql: string): void;

/** The guard's three outcomes, called only by TransformGuardHost. */
export function materializeGuarded(): void;
export function modifyAnywayGuarded(): void;
export function cancelGuarded(): void;
```

- `requestRun` is `SqlModule.handleRun`'s body, moved verbatim and un-hooked: trim; bail on empty;
  `classifyStatement`; `class === 'query'` → `runQuery(sql).catch(() => {})`; `isSourceMutation`
  → `useRunGuardStore.getState().hold(info)` and return; otherwise `runAndTrack(sql, () =>
  runTransform(sql))`.
- `runAndTrack` moves here from `SqlModule` unchanged — the `queryStarted`/`querySucceeded`/
  `queryFailed` cycle that keeps a CTAS's outcome in Results and History alongside a SELECT's.
- `runInConsole(sql)`: `useQueryStore.getState().setSql(sql)` → `useDrawerStore.getState()
  .activateConsole()` → `requestRun(sql)` (scope calls 2, 3, 13).
- `materializeGuarded` / `modifyAnywayGuarded` read `pending`, `release()`, then `runAndTrack`
  against `materializeInsteadOfMutation(info)` / `forceMutation(info)`. `cancelGuarded` is
  `release()`.
- The in-flight/supersede semantics are `services/sql.ts`'s, unchanged (scope call 4).

### `src/app/TransformGuardHost.tsx` (new)

Renders `TransformGuardModal` when `pending?.mutationTarget` is set, wired to the three functions
above; renders `null` otherwise. Mounted once in `WorkbenchShell` (scope call 11).
`TransformGuardModal.tsx` itself is untouched — same props, same copy.

### `src/features/sql/RunSqlButton.tsx` (new)

One small button — `Play` glyph, `Run` label, `title="Run this query in the SQL console"` —
calling `runInConsole(sql)`. Sized for inline use beside a Copy SQL link (the `text-xs` HUD
register the surrounding affordances already use), not the console's primary Run. Disabled when
`sql.trim()` is empty.

### Call sites

| File | Change |
| :--- | :--- |
| `features/charts/{time-series,distribution,categorical,correlation}/GeneratedSql.tsx` | `RunSqlButton` beside the existing Copy SQL, all four; panels otherwise untouched |
| `features/ai/AITurnView.tsx` | `AttemptView` gains `RunSqlButton` on `attempt.sql`, every attempt (scope call 7) |
| `features/sql/QueryResultsPanel.tsx` | each history row gains `RunSqlButton` on `entry.sql` (scope call 8) |
| `features/explorer/DataQualityPanel.tsx` | `FindingRow` gains `RunSqlButton` on `finding.sql` beside Show SQL — §13.3's quality-panel row, and D68e's lost destination |
| `features/profiling/InsightFeed.tsx` | `InsightCard` gains `RunSqlButton` on `candidate.sql` |
| `features/profiling/ColumnCard.tsx`, `features/profiling/dossier/TopInsights.tsx` | same, beside their Show SQL |
| `services/navigation.ts` | `openDestination`: `module === 'sql'` with a string `prefill.sql` → `runInConsole(sql)`, return; otherwise unchanged (scope call 6) |
| `features/sql/SqlModule.tsx` | `handleRun` → `requestRun`; local `guardInfo` state, `runAndTrack`, the two guard handlers and the `TransformGuardModal` mount all deleted; **the `useThreadPrefill` auto-run effect deleted** (scope call 6) |

## Files

New: `src/stores/runGuard.ts` + `runGuard.test.ts`, `src/services/runPath.ts` +
`runPath.test.ts`, `src/app/TransformGuardHost.tsx` + `TransformGuardHost.test.tsx`,
`src/features/sql/RunSqlButton.tsx` + `RunSqlButton.test.tsx`.
Modified: the eight call-site files above (plus their tests), `src/app/WorkbenchShell.tsx` +
`WorkbenchShell.test.tsx`, `src/features/viewer/ViewerMode.test.tsx` (one added assertion).
Unchanged: `features/sql/TransformGuardModal.tsx`, `services/transforms.ts`,
`services/sql.ts`, `lib/statementClass.ts`, `stores/query.ts`, `stores/drawer.ts`,
`lib/capabilities.ts` (the action still carries `prefilledConfig.sql`; only its consumer moves),
`features/sql/ResultsGrid.tsx` and `PivotBuilder.tsx` (scope call 10), `types/tabs.ts` /
`lib/paletteRegistry.ts` (S5's).

## Dependencies

S3 — `stores/drawer.ts`'s `activateConsole()` is the seam `runInConsole` is built on, and the
console is where every run action lands. Not gated by S0. S5 depends on this phase: query tabs may
not ship before the guard is in the shared path.

## Acceptance criteria

- [x] Exactly one `TransformGuardModal` mount exists in the app, in `TransformGuardHost`; no
      feature component mounts it
- [x] A source-mutating statement is intercepted **whichever entry point ran it** — the console's
      Run button and a remote run action both raise the guard, asserted separately
- [x] Materialize / Modify anyway / Cancel behave exactly as before the move (same three outcomes,
      same resulting history entries)
- [x] A run action from a chart's `GeneratedSql` runs the query **without changing the active tab**
      — the chart is still on screen afterward *(structural: no run path touches `useTabsStore`)*
- [x] Every enumerated surface has a run action: four `GeneratedSql` blocks, AI per-turn SQL
      (including failed attempts), history rows, and the four Show-SQL sites (quality panel,
      `InsightFeed`, `ColumnCard`, `TopInsights`)
- [x] Every existing Copy SQL affordance still exists (scope call 9)
- [x] A run action opens the drawer on the console view and sets the console buffer to the query
      that ran; it does **not** expand the drawer, at any result size
- [x] A SQL-bearing `RankedAction` runs in the console and opens **no tab**; `SqlModule` no longer
      auto-runs anything on mount, in the drawer or anywhere else
- [x] Viewer mode exposes no run action and no guard host
- [x] `tsc -b` clean; the suite grew by this leaf's new/changed tests and every one of them passes;
      `oxlint` clean over `src/` apart from the pre-existing unrelated warnings noted in S1–S3's
      criteria. **Not green overall, and not from this phase:** 11 tests in four files fail on
      surfaces S4 never touches — the uncommitted Welcome/Act-0 redesign (`WorkbenchShell.test.tsx`
      composition assertions, `IngestionPanel.test.tsx`'s drop-zone copy, `conformance.test.ts`'s
      literal allowlist naming `WorkbenchShell.tsx` and `SamplePicker.tsx`) and one S3 drawer test
      (`InspectorDrawer.test.tsx`, which stubs `SqlModule` outright, so no S4 file is in its import
      graph). Recorded rather than absorbed: S4 owns none of them, and none should be closed here.

**Not a criterion here, by design:** `'sql'`'s removal from the tab union, query tabs, Pin, Pivot's
results home, the export-recipe / auto-chart / Download-Parquet re-homing (all S5);
`QuerySuggestions`' move and the options strip's retirement (S6); a run action on `ResultsGrid` or
`PivotBuilder` (scope call 10); any change to `TransformGuardModal`'s own copy or props.

## Test plan

- `runGuard.test.ts`: `hold`/`release` round-trip; `pending` defaults to `null`.
- `runPath.test.ts` — the phase's central file, with `services/sql` and `services/transforms`
  mocked the way `SqlModule.test.tsx` already mocks them:
  - `requestRun` on a SELECT calls `runQuery` and never holds the guard
  - `requestRun` on a CTAS calls `runTransform` through the tracked cycle
  - `requestRun` on a source mutation calls **neither**, and leaves `pending` set — the
    interception assertion, stated as "execution did not happen"
  - `materializeGuarded` / `modifyAnywayGuarded` execute the held statement and clear `pending`;
    `cancelGuarded` clears it and executes nothing
  - `runInConsole` sets the query store's `sql`, sets the drawer to `{open, view:'console',
    consoleActivated:true}`, leaves `expanded` false, and reaches the same interception on a
    mutation
  - empty/whitespace SQL is a no-op at both entry points
- `TransformGuardHost.test.tsx`: renders nothing with no `pending`; renders the modal for a held
  mutation; each button calls its resolution.
- `RunSqlButton.test.tsx`: click calls `runInConsole` with the exact SQL; disabled on empty.
- Call-site tests: one assertion per surface that the run control is present and passes the right
  SQL (`GeneratedSql` ×4 share a parameterised test; `AITurnView` covers a failed attempt;
  `QueryResultsPanel` covers a history row; `DataQualityPanel`, `InsightFeed`, `ColumnCard`,
  `TopInsights` cover the Show-SQL row).
- `navigation.test.ts`: a `'sql'` destination with a `sql` prefill calls `runInConsole` and opens
  no tab; a `'sql'` destination *without* one, and every non-`sql` module, are unchanged.
- `SqlModule.test.tsx`: the guard no longer renders from this component; Run delegates to
  `requestRun`; a mounted `SqlModule` with a pending prefill runs nothing.
- `WorkbenchShell.test.tsx`: exactly one guard host in the tree.
- `ViewerMode.test.tsx`: no run control, no guard host.

## Definition of done

There is one run path in the app, and the transform guard lives inside it — so the answer to "can a
runner execute a source mutation unguarded?" stops depending on how many runners exist, which is
the precondition S5's query tabs need and the reason this phase precedes them. Above that path,
every surface that shows SQL can run it where it stands: a chart's generated query, a model's
suggested SQL, a history row, a quality finding, an insight. J3 ("let me just check something") now
runs end to end without losing what was on screen, D68e's `duplicates` insight has its destination
back, and nothing auto-runs on mount anywhere. `tsc -b`/suite/`oxlint` clean.
