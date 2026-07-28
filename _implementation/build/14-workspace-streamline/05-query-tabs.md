# S5 — Query tabs + the registry amendment

**Tier:** v0.70 (the workspace streamline, D73 execution) · **Master spec:** §19 (the v0.70
subsection, S5 row), §13.3 ("The canvas and the tab model" / "The tab registry after D73" / "The
tab strip scrolls horizontally, and query tabs get a ceiling" / the drawer section's three orphaned
affordances), §10 Module 2's D73 workbench amendment, §12.2 (export recipe) · **Decision row:**
D73, calls (2) and (4), plus the consequential calls on Settings and Export · **Depends on:** S3
(the drawer console) and S4 (the shared guarded run path) · **Gated by S0:** the **ceiling number
and the at-the-ceiling behaviour only** — see scope call 16. Nothing else in this leaf waits on the
probe.

This leaf lands before its own implementation, per §19's binding constraint — the acceptance
criteria below are checked as the code lands, not written up afterward.

## Objective

Give the artifact tab kind its first live member and close the SQL tab's deletion. **(a)** A
**query tab** — independent, editable, re-runnable, per-instance, never deduped, with its own
editor, Run, results and name — reachable through both of D73's producers. **(b)** The registry
amendment that goes with it: `'sql'` out of `TabType` / `TAB_TYPE_BY_MODULE` / the palette,
`'query'` in, seven singletons → six singletons + one artifact type, as **one** change. **(c)**
The three things the deleted page took with it that are still homeless — Pivot's results, the
export-recipe action, and Export's own entry point.

The load-bearing constraint is not the tab. It is that `stores/query.ts` holds **one** `sql`,
**one** `result` and **one** `status` for the whole app, and `services/sql.ts` holds **one**
module-level `inFlight`. N independent runners cannot share that. Scope calls 1–3 are that change,
and they are what the rest of the phase is built on.

S5 does not retire the options strip, build Suggested Explorations, or wire the map's finding
columns — those are S6, and S5 ships the *API* the second producer calls (scope call 10) rather
than its caller.

## Scope calls

**1. The query store becomes keyed by session; there is still exactly one execution path.** N live
query tabs need N result sets, so `useQueryStore` grows `sessions: Record<QuerySessionId,
QuerySession>` — the console is `CONSOLE_SESSION`, Pivot is `PIVOT_SESSION` (scope call 4), and each
query tab's session id **is its tab id**. Every store action and `runQuery` / `requestRun` take the
session as a first argument **defaulting to the console**, so S4's call sites and `runInConsole`
keep working with no edit. D49's one-execution-path discipline is not weakened by this and is the
reason it is done this way: one path, N destinations for the state it writes.

**2. History stays global, and a query tab renders none.** One session, one log of what ran — the
console keeps the History list because the console is the scratchpad, where "what did I just run"
is the question. A query tab is one query and its result; a per-tab history would be a second
answer to a question the console already answers, and N of them is the memory shape S0 exists to
measure. No `origin` field is added to `QueryHistoryEntry`: nothing would read it.

**3. In-flight tracking becomes per-session, because superseding across sessions would be a bug.**
`services/sql.ts` keeps one module-level `inFlight`; a run in a pinned tab would abort the
console's slow query with it. It becomes a `Map` keyed by session id. **Within** a session, S4
scope call 4's superseding semantics are unchanged; **across** sessions, runs are independent.

**4. Pivot's own results home is its own session, not a second panel.** `PivotModule` renders the
same shared output component against `PIVOT_SESSION`. What was actually wrong with Pivot sharing
`QueryResultsPanel` was the shared *state*, never the shared rendering — D49's "one rendering of
what a query produced" is a feature, and duplicating the component to un-share the store would be
the wrong half. This also fixes a real defect standing today: a pivot re-run currently overwrites
the console's results and pushes onto its history.

**5. `QueryResultsPanel` splits into `QueryOutput` and `QueryHistory`.** `QueryOutput(sessionId)` is
Results + the Download-Parquet-on-CTAS shortcut + the auto-chart block; `QueryHistory` is the list.
The console composes both, a query tab and Pivot compose `QueryOutput` alone. Two of §13.3's three
orphaned affordances (auto-charting a result, Download-Parquet-on-CTAS) therefore reach the query
tabs **by construction** rather than by being copied onto them.

**6. The export recipe stays in the console header — it is not a per-result affordance.** §13.3
groups it with the other two as things the deleted page owned that need a home "on the query tabs
and … in the drawer." It is a §12.2 action over **this session's derived tables**, not over the
result in hand, so putting it on every query tab would put a whole-session action on N per-query
surfaces. S3 already re-homed it into the drawer with the rest of `SqlModule`; it stays there, and
this leaf changes nothing about it. Recorded rather than silently skipped: the sentence's intent is
that none of the three is lost, and this one is not.

**7. A query tab is `type: 'query'`, `TAB_KIND` `'artifact'`, and its tab id is its session id.**
`openTab` already declines to dedupe artifact types (W3), so per-instance-never-deduped needs no
store change — this is the first caller that exercises the branch. `TabHeaderGlyph`'s
artifact/violet branch, dead since V2, becomes reachable for the same reason.

**8. The name is `Query N`, assigned at creation, and there is no rename UI.** §13.3's "its own
editor, Run, results and name" is the tab carrying a name of its own instead of a `type · subject`
label — the strip's label becomes `tabLabel(tab)`, which prints an artifact tab's subject alone and
leaves every singleton reading `type · subject` as before. Rename would add a `renameTab` action and
inline editing in the strip; nothing in D73 or the tier asks for it, so it is flagged here and not
built. A pre-run suggestion (S6) supplies its own name through the same parameter.

**9. Pin lives in the console, is one-way, and re-runs nothing.** `Pin to tab` sits beside Run in
the console header, enabled when the buffer is non-empty. It opens a query tab seeded with the
console's current SQL and — when there is one in hand — the console's current result **by
reference**: results are treated as immutable everywhere in the app already, so the keeper shows
what the user just saw without a re-run and without a copy. Pinning does not clear, alter, or
navigate away from the console; promotion is explicit and one-way (§13.3), and there is no
un-pin.

**10. The second producer ships as an API with one real caller, not as dead code.**
`openQueryTab({ sql, name, autoRun })` is the single creation path both producers use. S6 wires
Suggested Explorations to it with `autoRun: true` ("born already running, never seeding the
console"). So that nothing ships unreachable, S5's own callers are Pin (scope call 9) and the
palette's **New query tab** entry (scope call 12) — an empty tab, `autoRun` absent.

**11. `'sql'` leaves the union in one amendment, and the `sql` *module* keeps a destination.**
`TabType`, `TAB_KIND` and `TAB_GLYPH` lose `'sql'` and gain `'query'`; `TAB_TYPE_BY_MODULE` loses
its `sql` entry. `openDestination('sql', …)` must then route to the console **whether or not the
action carries SQL** — S4 covered the with-SQL case, and without one the call would now fall
through to the `?? 'map'` default, which is a silent regression, not a deletion.
`isDestinationReady('sql')` stays **true**: the destination exists, it is simply not a tab, and the
strip/palette gating it feeds is about reachability. `MODULE_LABELS.sql` becomes `SQL console`.

**12. The palette's one SQL entry becomes two.** "SQL playground" → **"SQL console"**
(`{ kind: 'open-console' }` → `activateConsole()`) plus a new **"New query tab"**
(`{ kind: 'new-query-tab' }` → `openQueryTab({})`). `WiredModule` loses `'sql'`, and `entryTabType`
stops being able to return a tab type for either — `EntryGlyph` resolves the console entry to
`Terminal` (the glyph `'sql'` used to carry) and the new-tab entry to `TAB_GLYPH.query`. The palette
is the app's only cross-tab launcher (§13.3), so both destinations must be nameable there.

**13. Export's entry point moves to the title-bar cluster; the tab stays.** A labelled Export
control beside ⌘K and Settings calling `openDestination('export')`. §13.3 makes the mixed cluster an
explicit call — export is work you return to, settings is an errand you dismiss — so the two do not
have to look like one kind of thing. The palette's Export / Share entry stays where it is; the
palette must still reach every home.

**14. Settings is confirmed as the overlay, and the only deliverable is an assertion.** D73's third
reversal resolves a divergence in favour of what the code already ships (`AISettingsPanel`, a modal,
mounted in `ShellGrid`). Nothing is built. One test asserts no `TabType` member names settings, so
the reversal is recorded in the suite rather than only in prose.

**15. Tab-strip horizontal scrolling is a test and one class, not a feature.** The strip is already
`overflow-x-auto`; what is missing is `shrink-0` on the headers, without which many tabs compress
instead of scrolling — which is precisely the failure §13.3 rules out ("a strip that silently
compresses or drops tabs is worse than one that scrolls"). This ships regardless of S0, as decided.

**16. No ceiling ships, deliberately — this is a recorded absence, not an oversight.** S0's Probe B
has not run. §13.3 is explicit: "until it reports, no ceiling is written into a leaf doc." So
`openQueryTab` refuses nothing and evicts nothing, and the number plus the refuse-vs-evict choice
land later as a change to that one function. S0's own **interim** default (a fixed soft cap of 20
with refuse-with-reason) is labeled there as a default to ship behind if the probe is deferred; this
leaf does not adopt it, because adopting an unmeasured number inside a leaf is exactly what the
constraint forbids. The consequence is stated plainly: **between this phase and the ceiling's
arrival, a user can open query tabs without limit.**

**17. Closing a query tab drops its session and cancels its in-flight query.** Otherwise the store
retains a result per closed tab — the memory shape S0 is measuring, made worse by the one gesture a
user makes to relieve it. `closeTab` has exactly one caller in the app (`TabHost`'s ×), so the
cleanup goes in `services/queryTabs.ts` alongside `openQueryTab` rather than becoming a cross-store
reach from `stores/tabs.ts`.

**18. Viewer mode grows nothing, and needs no branch.** `ViewerMode` renders no tab strip, no
console and no palette, so neither producer is reachable there — the same structural absence S3 and
S4 recorded (D62 consumption-only). One assertion, no `viewerMode` conditional.

## Spec

### `src/stores/query.ts` (rewritten around sessions)

```ts
export type QuerySessionId = string;
export const CONSOLE_SESSION = 'console';
export const PIVOT_SESSION = 'pivot';

export interface QuerySession {
  sql: string;
  status: QueryStatus;
  result: QueryResult | null;
  error: string | null;
  charts: ChartSpec[];
}

interface QueryState {
  sessions: Record<QuerySessionId, QuerySession>;
  /** Session-wide, not per-session (scope call 2). */
  history: QueryHistoryEntry[];
  /** The session that most recently started a run — what the status bar reports. */
  lastRunSession: QuerySessionId;

  setSql: (id: QuerySessionId, sql: string) => void;
  queryStarted: (id: QuerySessionId, sql: string) => void;
  querySucceeded: (id: QuerySessionId, result: QueryResult) => void;
  queryFailed: (id: QuerySessionId, error: string) => void;
  clearResult: (id: QuerySessionId) => void;
  addChart: (id: QuerySessionId, chart: ChartSpec) => void;
  removeChart: (id: QuerySessionId, index: number) => void;
  /** Drops a closed query tab's state (scope call 17). */
  dropSession: (id: QuerySessionId) => void;
}

export const EMPTY_SESSION: QuerySession;
/** Selector hook — returns the stable `EMPTY_SESSION` for an id with no state yet. */
export function useQuerySession(id: QuerySessionId): QuerySession;
```

`addChart` / `removeChart` / `services/sql.ts`'s `getHistory` have no callers today and gain none
here; they move as-is rather than being deleted, which is not this phase's call to make.
`lastRunSession` exists because `StatusBar` reports query state and, with N runners, "the console's"
would be the wrong answer the moment a tab runs.

### `src/services/queryTabs.ts` (new)

```ts
interface OpenQueryTabOptions {
  /** Seeds the tab's editor. Absent for an empty tab. */
  sql?: string;
  /** The tab's name. Defaults to `Query N` (scope call 8). */
  name?: string;
  /** Run on creation — the pre-run producer (§13.3). */
  autoRun?: boolean;
  /** A result already in hand, adopted by reference rather than re-run (Pin). */
  result?: QueryResult;
}

/** The single creation path for both producers. Returns the new tab's id. */
export function openQueryTab(options?: OpenQueryTabOptions): string;

/** Closes any tab; for an artifact tab, cancels and drops its session first. */
export function closeQueryTab(tab: TabSpec): void;

/** Pin: promote the console's buffer and result into a keeper. One-way. */
export function pinConsoleQuery(): void;
```

`openQueryTab` calls `openTab('query', name)`, seeds `setSql(tabId, sql)`, adopts `result` when
given, and calls `requestRun(sql, tabId)` when `autoRun` — never `runInConsole`, which is the
console's entry and would defeat the point.

### `src/features/sql/QueryTab.tsx` (new)

The tab body: a header (name, Run, `RunSqlButton`'s big sibling — the console's own Run treatment),
`MonacoWrapper` behind the same `lazy()` boundary `SqlModule` uses, and `QueryOutput`. No
`QuerySuggestions`, no History, no export-recipe (scope calls 2, 5, 6). Every piece is
session-parameterised; the component holds no query state of its own.

### Session-parameterised call sites

| File | Change |
| :--- | :--- |
| `services/sql.ts` | `runQuery(sql, session = CONSOLE_SESSION)`; `inFlight` → `Map<QuerySessionId, InFlightQuery>`; `cancelQuery(session, queryId?)` (scope call 3) |
| `services/runPath.ts` | `requestRun(sql, session = CONSOLE_SESSION)`; `runAndTrack` takes the session; `runInConsole` unchanged in signature and behaviour; the guard store holds the pending statement **and its session** so a resolution runs where it was raised |
| `features/sql/QueryResultsPanel.tsx` | splits into `QueryOutput({ sessionId })` + `QueryHistory` (scope call 5) |
| `features/sql/SqlModule.tsx` | reads/writes `CONSOLE_SESSION` explicitly; composes `QueryOutput` + `QueryHistory`; gains the **Pin to tab** control (scope call 9) |
| `features/sql/MonacoWrapper.tsx` | takes `sessionId`; its store read, its `setSql`, and its external-change subscription all scope to that session |
| `features/sql/PivotModule.tsx`, `PivotBuilder.tsx` | `PIVOT_SESSION` — `setSql` and `runQuery` both (scope call 4) |
| `features/sql/QuerySuggestions.tsx`, `features/inspector/Inspector.tsx`, `features/inspector/DrawerConsole.tsx` | `CONSOLE_SESSION`, explicitly — behaviour unchanged (S3's seeding rule and the expand prompt both stay the console's) |
| `features/status/StatusBar.tsx` | reads `lastRunSession`'s session, not a fixed one |
| `types/tabs.ts` | `'sql'` → `'query'` in `TabType` / `TAB_KIND` (`'artifact'`) / `TAB_GLYPH` (`Terminal` moves to it); new `tabLabel(tab)` (scope call 8) |
| `services/navigation.ts` | `TAB_TYPE_BY_MODULE.sql` removed; `openDestination('sql', …)` routes to the console with or without SQL; `isDestinationReady` special-cases `'sql'`; `MODULE_LABELS.sql` → `SQL console` (scope call 11) |
| `lib/paletteRegistry.ts` | `WiredModule` loses `'sql'`; two new actions and two entries (scope call 12) |
| `features/palette/CommandPalette.tsx` | dispatches the two new action kinds; `EntryGlyph` covers them |
| `app/WorkbenchShell.tsx` | `TabContent`: `'sql'` branch → `'query'` (`<QueryTab tabId={tab.id} />`); the strip renders `tabLabel(tab)` and gains `shrink-0`; × calls `closeQueryTab(tab)`; `TitleBar` gains the Export control |
| `app/TitleBar.tsx` | the Export entry point (scope call 13) |

## Files

New: `src/services/queryTabs.ts` + `queryTabs.test.ts`, `src/features/sql/QueryTab.tsx` +
`QueryTab.test.tsx`.
Modified: the fourteen call-site files above plus their tests, `src/stores/query.ts` +
`query.test.ts`, `src/stores/runGuard.ts` + `runGuard.test.ts`,
`src/features/viewer/ViewerMode.test.tsx` (one added assertion).
Deleted: nothing — `SqlModule` survives as the console's body, which is what S3 made it.
Unchanged: `features/sql/ResultsGrid.tsx` and `AutoChartPanel.tsx` (both already take props, not
store reads), `features/sql/RunSqlButton.tsx`, `features/sql/TransformGuardModal.tsx`,
`app/TransformGuardHost.tsx`, `services/transforms.ts`, `lib/capabilities.ts` (a SQL-bearing
`RankedAction` is unchanged; only its consumer moved, at S4), `stores/ui.ts`'s `SidebarModule`
(the `sql` *module* still exists — it is the tab type that goes), `features/export/ExportModule.tsx`.

## Dependencies

S3 (the drawer console `SqlModule` now lives in) and S4 (the shared run path every query tab must
call — a query tab that ran unguarded is the data-loss path D73 calls the one non-optional item).
S6 depends on this leaf for `openQueryTab`. **S0 gates the ceiling only** (scope call 16); nothing
else here waits on it.

## Acceptance criteria

- [x] `TabType` contains no `'sql'` and one `'query'`; `TAB_KIND.query === 'artifact'`; the union is
      six singletons + one artifact type, and `TAB_KIND` still forces every member to be classified
- [x] Two query tabs opened from the same SQL are **two tabs**, with independent editors, results and
      run state — editing or running one leaves the other's `sql`, `status` and `result` untouched
- [x] Running a query tab does not disturb the console: the console's buffer, result and in-flight
      query all survive, and vice versa (scope calls 1, 3)
- [x] A source-mutating statement run **from a query tab** raises the guard and executes nothing,
      and resolving it runs in that tab's session — S4's interception holds for every new runner
- [x] Pin opens a tab carrying the console's SQL and result, re-runs nothing, and leaves the console
      exactly as it was
- [x] `openQueryTab({ sql, autoRun: true })` runs in the new tab's session and **never** writes the
      console's session
- [x] A pivot run writes only `PIVOT_SESSION`; the console's result and history are untouched
- [x] Closing a query tab drops its session and cancels its in-flight query; closing a singleton tab
      is unchanged
- [x] `openDestination('sql', …)` opens no tab, with or without a prefill, and reaches the console
      both ways; `isDestinationReady('sql')` is true
- [x] The palette offers "SQL console" and "New query tab", both enabled, both with a glyph, and
      offers no "SQL playground"; every other entry is unchanged
- [x] The title bar has an Export control that opens the Export tab; the palette's Export entry
      still works
- [x] No `TabType` names settings, and `AISettingsPanel` is still an overlay (scope call 14)
- [x] With more tabs open than fit, the strip scrolls and no header is compressed below its label
      width
- [x] The strip labels a query tab by its name alone; every singleton still reads `type · subject`
- [x] Monaco is still absent from the shell's startup graph: a query tab mounts its editor lazily,
      the console's boundary (S3) is unchanged, and a session with no tab and no console open pulls
      neither
- [x] Viewer mode exposes no query tab, no producer and no console
- [x] **No ceiling is enforced anywhere** (scope call 16) — asserted, so the absence is deliberate
      and visible rather than assumed
- [x] `tsc -b` clean; every test this leaf adds or changes passes; `oxlint` clean over `src/` apart
      from the pre-existing unrelated warnings S1–S4's criteria already record

**Not a criterion here, by design:** the options strip's retirement, Suggested Explorations and the
map's finding columns (S6); a ceiling number, eviction or refusal (S0); renaming a query tab (scope
call 8); un-pinning; persisting tabs or sessions across a reload (§13.3 defers full tab-list
serialization to D61); a second free-typing surface outside the console and the query tabs.

## Test plan

- `query.test.ts`: two sessions mutate independently; `dropSession` removes one and leaves the
  other; `useQuerySession` on an unknown id returns `EMPTY_SESSION` and the same object identity
  twice; history accumulates across sessions; `lastRunSession` follows `queryStarted`.
- `sql.test.ts`: a second run **in the same session** aborts the first; a run in a *different*
  session does not; `cancelQuery` only touches its own session.
- `runPath.test.ts` (extending S4's): `requestRun` with a session argument writes that session;
  a mutation raised from a query tab holds the guard, and each resolution executes in the raising
  session, asserted as "the console's session never changed".
- `queryTabs.test.ts`: `openQueryTab` creates an artifact tab, never dedupes across two identical
  calls, seeds SQL, adopts a passed result without running, runs on `autoRun`, and names
  `Query N` in sequence; `pinConsoleQuery` copies buffer + result and leaves the console alone;
  `closeQueryTab` drops the session and cancels, and is a plain close for a singleton tab.
- `QueryTab.test.tsx`: renders editor + output, no History list, no suggestions, no export recipe;
  Run goes through `requestRun` with the tab's own session.
- `SqlModule.test.tsx`: Pin present and disabled on an empty buffer; History still rendered here.
- `PivotModule.test.tsx`: renders `QueryOutput` on `PIVOT_SESSION` and no History.
- `navigation.test.ts`: `'sql'` with and without a prefill both reach the console and open no tab;
  `isDestinationReady('sql')`; every other module unchanged.
- `paletteRegistry.test.ts` / `CommandPalette.test.tsx`: the two entries, their actions, their
  glyphs, and the absence of the old one.
- `tabs.test.ts` / `WorkbenchShell.test.tsx`: `'query'` never dedupes; `tabLabel`; the strip's
  scroll/`shrink-0` composition; the × path; the title bar's Export control; no settings tab type.
- `ViewerMode.test.tsx`: no query tab, no console, no Pin.

## Definition of done

The registry amendment has landed as one change — `'sql'` is gone, `'query'` is the artifact kind's
first live member, and the app is six singletons + one artifact type. Under it, the state model
actually supports what the tab claims to be: the query store is keyed by session, in-flight
tracking is per session, and a query tab, the console and Pivot each own their SQL, results and run
state without touching one another — through the *same* execution path and the *same* guarded run
path, so D49 and D73's non-optional item both survive N runners. J4 ("keep that one") runs end to
end through Pin; S6's producer has an API to call; J6 (pivot without SQL, D53) survives the
deletion with a results home of its own. What is deliberately absent is the ceiling: it is S0's to
report, and until it does, this phase enforces none. `tsc -b`/suite/`oxlint` clean.
