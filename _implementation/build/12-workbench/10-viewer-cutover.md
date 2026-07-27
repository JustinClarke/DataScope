# W8 — Viewer Mode + Cutover

**Tier:** v0.60 (the Workbench, D71) · **shipped** — the app's only shell, `WORKBENCH_ENABLED`
retired 2026-07-25 · **Master spec:** §13.3 (viewer-mode paragraph, cross-cutting contracts),
D62 (universal `.dsps` receiver, Workbench amendment), D63 (trust-chrome band), D45 (fact
provenance), §19 (W8 row + row-walk gate), §9.1 (ship-timing — resolved Workbench-only
2026-07-25)

> **Extended by D73 (2026-07-26) — v0.70 / S3.** Viewer mode gains one exclusion and no new
> mechanism: **the drawer renders Info only, with no console.** It must not mount one merely
> because it is a shell region — a console would hand a recipient query access over a structure
> report that carries no data to query — so it inherits exactly the consumption-only absence the
> options strip already had here. The other half needs nothing built and is already how the code
> behaves: `ShareDialog`'s full-dataset escalation (a distinct second step, never the default —
> D20/D21) sends a Parquet payload, `loadSharedDataset` registers it, and the recipient lands in
> an **ordinary session**, which has a console because every ordinary session does. See
> [`../14-workspace-streamline/`](../14-workspace-streamline/README.md).

## Objective

W8 closes two very different kinds of work under one charter row, and this leaf treats them
that way on purpose. **Viewer mode** is ordinary, buildable UI work: wire the already-shipped
`.dsps` receiver (`08-persistence/03-dsps-spec`) into the Workbench, satisfying the D62
Workbench amendment this repo has carried as unbuilt scope since 2026-07-24. **Cutover** (§9.1
ship-timing, the soak, deleting the old shell + master §13.0) is an operational/design decision
the project has repeatedly and explicitly named as the human's call, not a model's — confirmed
most recently 2026-07-25: "build W8's mechanics first, decide and execute cutover as a separate,
explicit step at the end." This leaf's acceptance criteria are split the same way: viewer mode's
are built and checked in this session; cutover's stay open, named, and un-owned by any model
tier, pending that explicit human step.

## Scope call (confirmed with the human before building, AskUserQuestion)

Reading the D62/D63 Workbench-amendment paragraphs against the only renderer that exists today
(`SharedStructureReportView`) surfaced a real gap: that renderer is a floating modal
(`role="dialog"`, `fixed inset-0`) showing table/column data only — no insights, no
relationships, no D45 provenance/snapshot fields, no D63 band, no named exits — so it cannot
satisfy the spec's literal requirements (**not a modal**; **D45 provenance chrome renders in
full**; **D63 trust-chrome slot**; **exactly two exits**) by simple reuse. Two ways to close
the gap, put to the human directly:

1. **Map-forward** (matches the D62 Workbench-amendment wording literally): thread a
   `StructureReport`-derived shape through `DatasetMap`/`Erd`/the single-table Blueprint face,
   which today assume a live DuckDB-backed `useDatasetBaseline`. A real refactor of shipped,
   tested code, not just new code.
2. **Structure-forward** (the internal cut line D62 itself names — "degrades to the single-table
   Blueprint face / static HTML report render — never the date"): new, non-modal viewer chrome
   presenting the `StructureReport`'s existing shape (tables/columns/insights/relationships) as
   the canvas content, plus a new D45+D63 trust-chrome band and the two named exits. Touches
   nothing `DatasetMap`/`Erd` already do.

**Answer: structure-forward.** Consistent with every prior phase's mechanism-first precedent
(W5's disabled-with-reason mechanism, W6's probe-without-wiring, W7's reactive-only pause
signal) and the D27 ship-date discipline. The map-forward richness stays available as a named,
explicit follow-up leaf if ever wanted, not silently assumed or foreclosed.

## Spec

### Drop routing — already built, not rebuilt

`IngestionPanel.tsx`'s `handleFiles`/`openDspsFile` (built at `08-persistence/03-dsps-spec`)
already branches a single `.dsps`-suffixed drop into `useDspsReceiverStore` before it reaches
ingestion, and the Workbench's `Welcome` (W6) mounts this exact, unmodified component — so a
`.dsps` dropped on Act 0/Act 1 already reaches the store today; nothing renders it yet. **The
only real drop surface that exists anywhere in this codebase right now is `IngestionPanel`'s own
`DropZone`** — neither shell has a whole-window listener, and the explorer's own Add-data
affordance remains W2's own open deferral (`paletteRegistry.ts`'s `NOT_YET_WIRED`) — so "every
drop surface sniffs `dsps_version`" reduces, honestly, to the one drop surface that actually
exists. No changes to `IngestionPanel.tsx`, `DropZone.tsx`, or `dspsReceiver.ts` are needed for
this half of D62.

### `features/viewer/ViewerMode.tsx` (new)

The Workbench's read-only render of `useDspsReceiverStore()`'s `document`/`error`, mounted at
`WorkbenchShell()`'s top level — checked before `act0`/`act1`/`shell`, since a dropped `.dsps`
should present immediately regardless of dataset state:

- **No options strip, no AI pane** (consumption-only) — the component simply never renders
  either region.
- **Explorer region (read-only):** a flat list of `report.tables` (name, row/column counts) —
  no Add-data, no per-table remove/refresh.
- **Canvas region:** per-table cards — schema/columns (extends `SharedStructureReportView`'s
  existing shape), each table's insights (D45 fields: provenance tag, "computed as of {snapshot
  date + hash}" — already present on every `StructureReportInsight`, just never rendered by the
  old modal).
- **Inspector region (read-only):** `report.relationships` when present, evidence-only (parent/
  child columns, confidence, evidence text) — **no override controls**, a fresh flat list, not a
  reuse of `EdgeEvidencePanel` (its `onRemove`/`onRepoint` props are required, not optional, and
  it expects a live `FkEdge` with an `id` — forcing a read-only mode onto an edit-only component
  would be scope creep the structure-forward call already ruled out).
- **Status bar:** table count, `report.generatedAt`, and the two exits: **Export report**
  (re-download the exact document via the existing `downloadStructureReport`) and **Start my own
  session** (`useDspsReceiverStore.getState().close()`, returning to Act 0/1/shell — tabs and
  datasets untouched).
- **Errors** (`useDspsReceiverStore().error` — a malformed or wrong-major-version file) render
  as a dismissible banner inside this chrome, same copy the old shell already surfaces, `close()`
  on dismiss.

### `features/viewer/TrustChromeBand.tsx` (new)

The D63 slot — a full-width band above the canvas:

- **D45 provenance chrome, in full:** `report.generatedAt` + a structure-only claim worded to
  the D21/D45 discipline this repo already enforces elsewhere (`lib/dsps.ts`'s
  `passesFactWordingGuard`) — "Structure only — no data rows included. Computed
  {generatedAt}." Never "verified" or permanence wording.
- **Signer / signature-verified state:** rendered as **"Unsigned"** / **"Signing not yet
  available"** — an honest, D63.2-not-built state, not a fabricated placeholder. D63.2 (signed
  `.dsps`) is out of scope, named in its own decision row as its own design round.

### `app/WorkbenchShell.tsx`

`WorkbenchShell()` gains one more branch, checked first, before the existing act selection:

```
const dspsDocument = useDspsReceiverStore((state) => state.document);
const dspsError = useDspsReceiverStore((state) => state.error);
if (dspsDocument || dspsError) return <ViewerMode document={dspsDocument} error={dspsError} />;
```

No change to `Act0`/`Act1`/`ShellGrid` themselves.

## Files

New: `src/features/viewer/ViewerMode.tsx` (+ test), `src/features/viewer/TrustChromeBand.tsx`
(+ test). Modified this leaf's viewer-mode half: `src/app/WorkbenchShell.tsx` (+ test
additions); no changes to `IngestionPanel.tsx`, `DropZone.tsx`, `dspsReceiver.ts`, or
`structureReport.ts`. **At the cutover half (2026-07-25):** `dspsReceiver.ts`'s own doc comment
updated (both producers now name `ViewerMode`, not the old renderer); `WorkbenchShell.tsx`
gained the `WebLLMDock` mount + `useShareLinkOpener()`; `SharedStructureReportView.tsx` (the old
shell's own share-link renderer) is deleted — its remaining consumer (`App.tsx`'s `AppContent`)
is gone too, and both its jobs now render through `ViewerMode`.

## Dependencies

W7.5 (module wiring — closed the palette hard gate this leaf's row-walk re-checks below); the
already-shipped `08-persistence/03-dsps-spec` (`dspsReceiver.ts`, `parseDsps`, `StructureReport`,
`IngestionPanel`'s `.dsps` branch).

## Row-walk gate re-check (§19: "every §13.0/§6-inventory capability reachable in the Workbench,
no orphaned exports")

Walked §13.0's sidebar table + §6's architecture diagram against `paletteRegistry.ts` and
`services/navigation.ts`'s `TAB_TYPE_BY_MODULE`:

| §13.0/§6 capability | Workbench home | Status |
| :--- | :--- | :--- |
| Ingest | `Welcome`'s mounted `IngestionPanel` (W6) | reachable, not palette-searchable — W2's own logged deferral |
| Profile | `profile` tab | wired (W2/W3) |
| SQL Playground | `sql` tab | wired (W7.5) |
| Charts (Time Series/Categorical/Distribution, D68c-collapsed) | `charts` tab | wired (W7.5) |
| Correlation | `correlation` tab | wired (W7.5) |
| AI Chat | always-on right AI pane, not a tab (W7) | by design, not an orphan |
| Export / Share | `export` tab | wired (W7.5) |
| Relationships / Join Graph | superseded by the map's ERD (D71) | by design |
| Dossier | superseded by the map's single-table Blueprint face (D71) | by design |
| Studio (Quality/Schema Graph/Model) | v1 Studio arc, `10-studio`, unscheduled | correctly out of scope |
| ML | backlog, `11-ml`, unscheduled | correctly out of scope |
| Learn | folded into the Dossier (D68d) | by design, no separate destination |

Clean — nothing orphaned. `NOT_YET_WIRED` still names exactly `ai`/`ingestion`, both for the
reasons already logged at W5/W7.5, not new gaps this leaf found.

## Acceptance criteria — viewer mode (this session)

- [x] Dropping a `.dsps` file into the Workbench's Act 0/Act 1 `IngestionPanel` renders
      `ViewerMode` — no options strip, no AI pane, read-only explorer/inspector
- [x] `ViewerMode` renders every `StructureReportInsight`'s D45 fields (provenance tag,
      snapshot label) and `report.relationships` when present (confidence, evidence)
- [x] `TrustChromeBand` renders the D45 structure-only claim + `generatedAt`, and an honest
      unsigned state for the signer/signature-verified fields — no banned wording
      (`passesFactWordingGuard`-clean)
- [x] Exactly two exits: Export report (re-downloads the identical document) and Start my own
      session (`close()`, returns to Act 0/1/shell, tabs/datasets untouched)
- [x] A malformed or wrong-major-version `.dsps` drop surfaces the existing error copy as a
      dismissible banner inside `ViewerMode`'s own chrome (not the old shell's fixed-position
      banner)
- [x] Full existing suite green; `tsc -b` clean; `oxlint` clean on every changed file; `graphify
      update .` run

## Acceptance criteria — cutover (explicitly deferred, the human's call)

- [x] §9.1 ship-timing decided (Workbench-only, old-shell-only, or both, for D27's Oct 6 date)
      — **decided 2026-07-25: Workbench-only** (AskUserQuestion, human's explicit call, not
      defaulted)
- [x] Soak period run/confirmed (no defined duration anywhere in spec — an operational call, not
      a build criterion) — **confirmed 2026-07-25:** the on-by-default period since 2026-07-24
      plus the entire W4–W8 build/test cycle (real, repeated usage of the Workbench as the live
      path across five build sessions) was accepted as the soak rather than run as a further
      separate wait — the human's explicit call (AskUserQuestion), not an assumption
- [x] Old shell (`AppContent`/`Sidebar`/the module router in `App.tsx`) + master §13.0 deleted,
      master-first — **master half done 2026-07-25** (§13.0 deleted from `DATASCOPE.md`, §13.2
      retired to a stub, D2/D71/D68/D48/D70 amended, §19's W8 row updated); **the code deletion
      landed 2026-07-25** too — `AppContent` deleted, `App.tsx` now just renders
      `WorkbenchShell`, plus nine further old-shell-only components (`Sidebar`+children,
      `EducationalPanel`, `StatusConsole`, `AIModeChooser`, `DossierModule`, `ProfileModule`,
      `JoinGraphModule`, `SharedStructureReportView`) and their tests — file-by-file account at
      `/HANDOFF-W8-CUTOVER.md` (repo root)
- [x] `WORKBENCH_ENABLED`/`VITE_WORKBENCH` flag itself removed (no longer a parallel shell once
      one side is gone) — removed from `featureFlags.ts`, `navigation.ts`'s `openDestination`,
      and `vitest.config.ts`'s test-baseline pin, 2026-07-25

**Cutover complete 2026-07-25** — doc side (decision + master-first spec update) and code side
(deletion + the two ported functional gaps below) both landed the same day. See
`/HANDOFF-W8-CUTOVER.md` for the exact file-by-file account. The two real functional gaps the
old shell alone still served — `WebLLMDock` and `?share=` opening (§12.3) — are ported into
`WorkbenchShell.tsx`: `WebLLMDock` mounts in `ShellGrid()` above the status bar, and a new
`useShareLinkOpener()` hook (same ref-guarded-effect shape as `useMapAutoOpen`) routes both
share-link outcomes through `useDspsReceiverStore`/`ViewerMode` instead of the now-deleted
`SharedStructureReportView`. Full suite: 131 files / 1289 tests green (138/1345 pre-cutover —
the file-count drop matches the 7 deleted test files exactly); `tsc -b` clean; `oxlint` clean;
`graphify update .` run. Live-browser-verified in a real Chromium session (Playwright): a fresh
load boots straight to Act 0 with no flag/env and no old header/sidebar, a dropped `.dsps` and a
mocked `?share=` structure-report both render `ViewerMode` with the URL param stripped, and the
WebLLM consent dock mounts once a real sample dataset loads and eligibility conditions are met.

## Test plan

Vitest + React Testing Library, following `08-right-ai-pane.md`/`09-module-wiring.md`'s own
conventions.

- `ViewerMode.test.tsx`: renders from a `useDspsReceiverStore` document fixture — asserts no
  strip/AI-pane test-ids, table/insight/relationship content present, both exit buttons call the
  right functions, error state renders and dismisses.
- `TrustChromeBand.test.tsx`: renders the claim/date/unsigned-state text; a
  `passesFactWordingGuard` assertion against the rendered claim string.
- `WorkbenchShell.test.tsx`: a new describe block — setting the store's `document` (or `error`)
  directly and asserting `ViewerMode` renders instead of `Act0`/`Act1`/`ShellGrid`, including
  when datasets already exist (viewer mode wins regardless of act).
- Run the full existing suite last.

## Definition of done

Viewer mode's and cutover's criteria are both met, tested, and checked — this leaf is done in
the all-boxes-checked sense as of 2026-07-25. `▶` in `_implementation/status/BUILD-ORDER.md`
moves to `10-studio` next.
