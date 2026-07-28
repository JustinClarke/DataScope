# S2 — Data Quality & Health panel

**Tier:** v0.70 (the workspace streamline, D73 execution) · **Master spec:** §19 (the v0.70
subsection, S2 row), §13.3 (the detail-ladder table — rung 1's "warning affordance"), §20.8
(D14 — the data-quality report; this leaf ships a slice, not the Phase 7 report) · **Decision
row:** D73 · **Depends on:** S1 (explorer rail reflow, shipped 2026-07-28) · **Gated by S0:**
no — S0 gates S7 entirely and S5's ceiling number only; S2 is explicitly free to proceed.

This leaf lands before its own implementation, per §19's binding constraint (no `src/` code for
a phase before that phase's leaf doc) — the acceptance criteria below are checked as the code
lands, not written up separately afterward.

## Objective

Give the explorer rail a dataset-scoped **Data Quality & Health panel** beneath the table list:
a warnings section for findings and a passed-checks section for what came back clean, both
empty-state-capable, every finding traceable to a deterministic producer and its SQL — closing
the gap S1's own doc named ("no per-column warning producer exists yet — that is S2's Data
Quality & Health panel") and giving D68e's `duplicates` insight, and the two other dataset-quality
signals already computable locally, a persistent home instead of a per-table-only appearance.

## Scope calls

**1. Three checks ship — nulls, uniqueness (duplicates), zero-variance — not §20.8's full
report.** The folder's `README.md` cross-cutting contract draws the line precisely: "S2's
nulls/uniqueness/zero-variance and S6's skew/format-match/correlation are computable locally."
§20.8 (D14) describes a fuller Phase-7 report — a composite 0–100 quality score, a null
heatmap, candidate-key violations, skew/outlier flags, FK-candidate findings, schema drift,
report export — none of which this leaf builds. The reference mock
(`reference-images/02-options-strip-prompts.png`, confirmed as S2's mock per the 2026-07-28
BUILD-ORDER log, correcting the folder README's own mislabel) draws a "High value outliers in
`orders.total_amount`" warning too; that is skew/outlier content, explicitly S6's per the same
contract, and is not reproduced here — the same posture S1 took toward the fuller per-column
mock it also didn't build, and S6 took toward its own unbacked mock detail.

**2. Reuse the existing producers; add exactly one new syntactic rule to the same registry, no
parallel detection system.** Nulls reuse `nullPatternCandidates` (`lib/insights.ts`, already
shipped, syntactic — no query). Uniqueness reuses `buildDuplicatesProbe` (`lib/insights.ts`,
already shipped, probe — full-row duplicate count). Zero-variance is new — `cardinality === 1`
has no existing check — and lands in `lib/insights.ts` as a fourth syntactic rule,
`zeroVarianceCandidates`, in the identical shape `idExclusionCandidates` already uses (a new
`InsightRuleId` member, a `RULE_LABEL` entry, no query). One producer module for the whole app,
not an S2-only fork.

**3. Zero-variance's exact definition.** `COUNT(DISTINCT)` excludes NULLs (confirmed against
`services/ingestion.ts`'s own classification query, the source of `ClassifiedColumn.cardinality`),
so `cardinality === 1` means "exactly one non-null value repeated" — a genuinely different
condition from all-null (`cardinality === 0`), which `nullPatternCandidates`'s 100%-null case
already flags. Zero-variance does not also fire there, to avoid two warnings for one root cause.
Guarded on `rowCount > 1`: a one-row table makes every column trivially `cardinality === 1`,
which is not a finding.

**4. Not wired into the general insight feed or the Action Broker.** `zeroVarianceCandidates`
is not added to `buildInsightProbes`/`loadInsights`'s syntactic list — the Dossier's ranked
top-10 feed (D10) and `rankNextActions`'s scoring are untouched. S2's own aggregation service
(below) calls the three producers directly.

**5. Dataset-wide aggregation writes its own table-qualified description, reusing the producers'
detection, not their prose.** `nullPatternCandidates`/`zeroVarianceCandidates`'s existing
`description` strings are column-only — correct for their existing single-table callers
(`InsightFeed`, one table already named in a header above them). S2 aggregates across every
registered table in one flat list, so its service writes its own sentence at the aggregation
layer, table-qualified (`customers.email`, matching the reference mock's dotted notation) —
the underlying detection (thresholds, which table/column trigger, the SQL shown on "Show SQL")
is still the one shared producer, unchanged.

**6. Pass/warn is decided per rule, dataset-wide — not per table.** A rule (nulls / duplicates /
zero-variance) reports "passed" when it produced zero candidates across every registered table;
otherwise every candidate it produced, from any table, renders under Quality Warnings. Matches
the reference mock's two aggregate passed-lines, not one line per table per rule.

**7. Tables still classifying are skipped, not blocked on.** Nulls and zero-variance need
`table.columns` (post-classification); duplicates only needs a registered table and its
`rowCount`. A table without `columns` yet is simply absent from the nulls/zero-variance scan
until classification finishes and the effect re-runs on the `tables` array changing — the same
lazy-per-table shape `ColumnDisclosure` and `InsightFeed` already use. The panel never blocks its
whole render on the slowest table.

**8. The rail splits into two independently-scrolling regions — the open question's lean, taken
as the answer.** The folder's `README.md` open-questions list named this "leaning yes" and left
it open; this leaf takes that lean, the same precedent S1 set for the multi-open disclosure
question. Context this leaf actually builds from: `WorkbenchShell.tsx`'s
`data-region="explorer"` container and `ExplorerPanel.tsx`'s sticky header were built ad hoc in
session (2026-07-28, a direct "make the rail scrollable and resizable like VS Code" request, not
a leaf doc) ahead of this one — the whole rail is currently one `overflow-y-auto` region. This
leaf splits it: `TableList` keeps its own scroll (`flex-1 min-h-0 overflow-y-auto` wrapper inside
`ExplorerPanel`), and the new panel becomes a second, independently-scrolling region beneath it
bounded by its own `max-h-*`, never growing to push the table list off-screen. The outer
`data-region="explorer"` div moves from `overflow-y-auto` to `flex flex-col overflow-hidden` so
its two children each own their scroll; the drag-to-resize handle against the canvas (also built
that session) is untouched.

**9. Collapsible, not drag-resizable, for v1.** The folder's "every pane drag-resizable"
cross-cutting contract targets the shell-level panes S3/S4 introduce (the drawer, the console);
S2's own listed deliverable doesn't ask for a splitter between the table list and this panel. The
panel gets a chevron header — the same collapse idiom `TableList`'s own table rows already use —
rather than a second drag handle. A resizable split between the two rail regions is a fair
follow-up, not invented here.

**10. No per-column warning icon in the rung-1 disclosure.** S1's doc pointed at this panel as
rung 1's eventual "warning affordance" source. This leaf builds the producer and the aggregate
panel; it does not thread findings back into `TableList`'s per-column row icons — that needs a
table+column lookup threaded through a component this leaf doesn't otherwise touch, beyond what
master's S2 line asks for ("...in the rail's bottom region"). Left for a later pass, same
"flag rather than silently grow scope" posture S1 used for its own deferred content.

**11. Monochrome glyphs, matching the folder's cross-cutting rule.** The mock's colour
shield/check icons become `lucide-react`'s `ShieldAlert` (warnings) and `ShieldCheck` (passed),
styled through `--color-warn`/`--color-ok` — the pair V6a already added — not a new hue and not
an emoji character.

**12. Empty state mirrors `TableList`'s own.** Zero registered tables → the panel renders
nothing, the same early-return `TableList` already does (`tables.length === 0`). This is
distinct from "checks ran clean" (section 6), which always renders — an all-green Health Checks
list, never a blank panel, once at least one table exists.

## Spec

### `src/lib/insights.ts`

- `InsightRuleId` gains `'zero-variance'`.
- `RULE_LABEL['zero-variance'] = 'Zero variance'`.
- New `zeroVarianceCandidates(columns: ClassifiedColumn[], tableName: string, rowCount: number): InsightCandidate[]`
  — returns `[]` when `rowCount <= 1`; otherwise filters `columns` to `cardinality === 1` and maps
  each to a candidate (`id: `zero-variance:${c.name}``, `sql` shown as-is — illustrative, same
  posture `idExclusionCandidates` already takes since the finding itself needs no live query).
- Not added to `buildInsightProbes` (scope call 4).

### `src/services/dataQuality.ts` (new)

- `export interface QualityFinding { id: string; tableId: string; tableName: string; rule: 'null-pattern' | 'duplicates' | 'zero-variance'; description: string; sql: string; }`
- `export interface DatasetQualityReport { warnings: QualityFinding[]; passedRules: Array<'null-pattern' | 'duplicates' | 'zero-variance'>; }`
- `export async function loadDatasetQualityReport(tables: TableRegistryEntry[]): Promise<DatasetQualityReport>`
  — for each table with `columns` present, calls `nullPatternCandidates`/`zeroVarianceCandidates`
  synchronously; for every table regardless of classification state, runs
  `buildDuplicatesProbe(tableName, rowCount)` against the engine, same lazy
  `import('../workers/duckdb.worker')` singleton-promise pattern `services/insights.ts` already
  uses (one shared loader, not a second one). Maps each resulting `InsightCandidate` to a
  table-qualified `QualityFinding` (scope call 5), then buckets by rule into `warnings` (any
  finding) vs. `passedRules` (that rule produced zero findings across every table) — scope call 6.

### `src/features/explorer/DataQualityPanel.tsx` (new)

- Props: `{ tables: TableRegistryEntry[] }`.
- Renders nothing when `tables.length === 0` (scope call 12).
- Otherwise a collapsible section, expanded by default (this is an ambient health signal, meant
  to be seen — collapsible only so a long warnings list doesn't dominate a narrow rail), header:
  `ShieldAlert`/mono label "Data Quality & Health" + a chevron, matching `ExplorerHeader`'s
  existing micro-cap treatment.
- Loads via `loadDatasetQualityReport(tables)` in a `useEffect` keyed on the `tables` array
  (same lazy-effect shape `InsightFeed`/`ColumnDisclosure` already use); shows "Checking data
  quality…" while in flight.
- Once loaded: a **Quality Warnings** group (`--color-warn`, `ShieldAlert`) listing every
  `QualityFinding.description`, each with a "Show SQL" control reusing the existing
  `useEducationalPanel`/`onShowSql` pattern `ColumnDisclosure` already threads through; a
  **Health Checks Passed** group (`--color-ok`, `ShieldCheck`) listing one line per
  `passedRules` entry via a small `PASSED_LABEL` map (e.g. `'duplicates': 'No duplicate rows
  detected.'`). A rule contributes to exactly one of the two groups, never both.

### `src/features/explorer/ExplorerPanel.tsx`

- Restructures into a flex column: the existing sticky `ExplorerHeader` (unchanged), a
  `flex-1 min-h-0 overflow-y-auto` wrapper around `TableList` (scroll moves here from the outer
  region), then `<DataQualityPanel tables={tables} />` as a second region beneath it, bounded by
  its own `max-h-*` and `overflow-y-auto` (scope call 8).

### `src/app/WorkbenchShell.tsx`

- `data-region="explorer"`'s className changes from `shrink-0 overflow-y-auto border-r ...` to
  `shrink-0 overflow-hidden flex flex-col border-r ...` — scroll ownership moves down into
  `ExplorerPanel`'s two child regions (scope call 8). The resize-drag handle and `useExplorerWidth`
  added the same prior session are untouched.

## Files

New: `src/services/dataQuality.ts` + `dataQuality.test.ts`,
`src/features/explorer/DataQualityPanel.tsx` + `DataQualityPanel.test.tsx`.
Modified: `src/lib/insights.ts` + `insights.test.ts`, `src/features/explorer/ExplorerPanel.tsx` +
`ExplorerPanel.test.tsx`, `src/app/WorkbenchShell.tsx`.
Unchanged: `TableList.tsx` (scope call 10), `InsightFeed.tsx`/`services/insights.ts` (scope call
4), every S3–S7 surface.

## Dependencies

S1 (explorer rail reflow) — met, shipped 2026-07-28; this leaf mounts beneath the `TableList`
S1 already reflowed. Not gated by S0.

## Acceptance criteria

- [ ] With zero registered tables, the panel renders nothing
- [ ] With ≥1 registered table and no findings for a given rule (nulls / duplicates /
      zero-variance) across the whole dataset, that rule's line renders under Health Checks
      Passed and contributes nothing to Quality Warnings
- [ ] A column with >5% nulls in any table produces a Quality Warnings line naming
      `{tableName}.{columnName}`, sourced from `nullPatternCandidates`, not a reimplementation
- [ ] A table with fully-duplicated rows produces a Quality Warnings line naming the table and
      the duplicate count, sourced from `buildDuplicatesProbe`
- [ ] A column with `cardinality === 1` (and its table's `rowCount > 1`) produces a Quality
      Warnings line via the new `zeroVarianceCandidates`; a `cardinality === 0` (all-null) column
      produces only the null-pattern warning, never also a zero-variance one; a one-row table
      produces no zero-variance warning regardless of cardinality
- [ ] `zeroVarianceCandidates` is not reachable from `buildInsightProbes`/`loadInsights` — the
      Dossier's ranked feed's candidate count and ranking are unchanged by this leaf
- [ ] A table still classifying (`columns` undefined) is excluded from the nulls/zero-variance
      scan and included once classification finishes, without the panel blocking on it
- [ ] Every rendered finding has a non-empty `sql` reachable through "Show SQL"
- [ ] `TableList`'s own scroll region and the Data Quality & Health panel scroll independently —
      expanding enough tables to overflow the list does not push the panel out of view, and a
      long warnings list does not collapse the table list
- [ ] The panel is collapsible via its own chevron, expanded by default
- [ ] `tsc -b` clean; full suite green, growing by this leaf's new/changed tests; `oxlint` clean
      apart from the pre-existing unrelated warnings already noted in S1's own criteria

**Not a criterion here, by design:** a composite 0–100 quality score, a null heatmap, candidate-key
violations, skew/outlier flags, FK-candidate findings, schema drift, and report export are §20.8's
Phase-7 report, not this leaf (scope call 1). Per-column warning icons inside `TableList`'s rung-1
disclosure are not built (scope call 10). A drag handle between the table list and this panel is
not built (scope call 9).

## Test plan

- `insights.test.ts`: `zeroVarianceCandidates` — fires on `cardinality === 1`; does not fire on
  `cardinality === 0`; does not fire when `rowCount <= 1`; `RULE_LABEL`/`InsightRuleId` cover the
  new member.
- `dataQuality.test.ts`: `loadDatasetQualityReport` — aggregates findings across ≥2 tables with
  table-qualified descriptions; a rule with zero findings anywhere lands in `passedRules`, not
  `warnings`; a table with `columns` undefined contributes no null/zero-variance findings but
  still runs the duplicates probe; the duckdb-worker engine is mocked the same way
  `TableList.test.tsx`/`ExplorerPanel.test.tsx` already mock `services/profiling.ts`.
- `DataQualityPanel.test.tsx`: renders nothing for zero tables; shows the loading line while the
  report is in flight; renders Quality Warnings vs. Health Checks Passed groups from a mocked
  report; collapses/expands via its chevron; "Show SQL" opens the educational panel with the
  finding's `sql`.
- `ExplorerPanel.test.tsx`: `DataQualityPanel` mounts beneath `TableList`; a new case asserting
  the table-list wrapper and the quality-panel wrapper carry independent `overflow-y-auto`
  regions (not a single shared scroll container).

## Definition of done

The rail has a persistent, dataset-wide answer to "is this data trustworthy?" (README's J2
journey) that was previously only visible per-table and only for `duplicates`: nulls, duplicate
rows, and constant-value columns are surfaced as warnings when found and named explicitly as
passed when not, every line traceable to the SQL that produced it, and the panel never blocks its
own render on a table that is still classifying. The table list and the quality panel scroll
independently, closing the folder's open question in the "leaning yes" direction. `tsc -b`/suite/
`oxlint` clean.
