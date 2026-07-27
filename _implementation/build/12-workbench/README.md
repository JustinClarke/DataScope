# 12 — The Workbench (D71)

**Tier:** the app's shell (built as parallel-shell work behind `WORKBENCH_ENABLED` through
W0–W8; **§9.1 ship-timing decided Workbench-only 2026-07-25, code cutover landed the same
day**) · **Phases:** W0–W8 (§19) · **Depends on:** the committed v0 baseline. Spec of
record: master **§13.3**; decision row **D71**; consent surface **§5.1** (D2 amendment);
egress persistence boundary **§5.2**.

**Cutover complete (2026-07-25, human directive) — the Workbench is the app's only shell.**
§9.1 is resolved: Workbench-only. The on-by-default period since 2026-07-24 plus the full
W4–W8 build/test cycle was accepted as the soak rather than run as a further separate wait.
Master `DATASCOPE.md` describes the Workbench as the app's only shell (§13.0 deleted, §13.2
retired to a stub, D2/D71/D68/D48/D70 amended), and the code side landed the same day:
`AppContent`/`Sidebar`/the module router in `App.tsx` are deleted, `WORKBENCH_ENABLED` and
`VITE_WORKBENCH` are gone, `WebLLMDock` and `?share=` link opening (§12.3) are ported into
`WorkbenchShell.tsx`, and the dependent test suite is updated (131 files / 1289 tests green,
`tsc -b`/`oxlint` clean, live-browser-verified). See `/HANDOFF-W8-CUTOVER.md` at the repo
root for the full file-by-file account and `_implementation/status/BUILD-ORDER.md`'s W8 log
entry for the close-out.

The app's shell: a VS-Code-shaped instrument — left explorer / middle tabbed canvas
opening on the **dataset map** (multi-table ERD with a persistent Verdict band, single-table
Blueprint face = the re-homed D48 Dossier) / broker-ordered options strip / command palette
(⌘K) / optional right AI pane / bottom scent-only inspector / status bar. Visual reference:
the five signed-off hallmark mocks (formerly `_misc/ideation/hallmark/`, deleted once
v0.69/§19 V6e closed on them), with the design-iteration record in `.hallmark/log.json` at the
repo root.

**Binding constraint (now satisfied):** no `src/` code for this redesign starts until the
fold → tree → build-leaf sequence has landed (§19). The fold and tree mirrors have landed;
each W-phase below becomes one build-order leaf in this folder as it is picked up, carrying
its own DoD.

| Phase | Deliverable | Depends on |
| :--- | :--- | :--- |
| W0 | Tab contract + tabs store + nav facade (flag-off, invisible) — envelope invariant tested (§13.3/D55) | committed baseline |
| W1 | Workbench scaffold: grid shell, act assembly (pure-skeleton tests, §13.3), crude tab host | W0 |
| W2 | Left explorer (grown from `TableList`) + shell-wide selection store | W1 |
| W3 | Tab model maturation: singletons/artifacts, keep-mounted-first preservation (per-type calls by manual test), pinning | W1 |
| W4 | The dataset map (ERD + Blueprint face + Verdict band) — auto-layout spike first, timeboxed | W2, hallmark brief ✓ |
| W5 | Options strip (subject-scoped filter, disabled-with-reason) + command palette — **hard gate: palette reaches every feature home** | W3, W4 |
| W6 | Acts 0–2: welcome page + AI defaults per the §5.1 switch model (off-by-default, capable-device WebLLM pre-select, Configure-workspace; no forced gate) | W1, hallmark brief ✓ |
| W7 | Right AI pane (switches + audit trail), bottom inspector, status bar consolidation (density budget) | W2, W3 |
| W7.5 | Module wiring: SQL/Pivot/Charts/Correlation/Export as real Workbench tab types, mounting the existing modules — closes the gap W5 deliberately left open (**inserted 2026-07-25**, discovered blocking W8's row-walk gate) | W5 |
| W8 | Viewer mode (**shipped**); cutover: §9.1 decided Workbench-only, soak accepted, old shell + §13.0 deleted (master-first) — **decision + doc side landed 2026-07-25; code deletion still open**, see note above | all, incl. W7.5 |

Cross-cutting contracts every W-leaf inherits (D71, master §13.3 — restated here because
each is a place a phase could silently drift):

- **The envelope invariant (D55 generalization — the security seam).** Serializability is
  orthogonal to safety: the tab *envelope* — type (fixed, closed registry), identity,
  active-tab selection, initializer — is authored only by the app, never by a model. Model
  output enters solely as validated inner artifact specs (ChartSpec/ViewSpec) through
  `producerValidators` **before** any tab opens; `stores/tabs.openTab` treats model-origin
  payloads as untrusted input. Tested at W0, before anything is visible.
- **Keep-mounted is the v0 tab norm** — switching away and back never resets a tab.
  Restore-from-spec is an opt-in optimization per tab type, called by manual test during W3;
  full tab-list serialization is deferred to the D61 hosted-tier round. The memory ceiling
  is managed, not dissolved.
- **Strip scoping — one ranker (D58).** Strip membership/order = a client-side,
  subject-scoped filter of the dataset-wide `RankedAction[]` (via `ThreadConfig` subject),
  never a second ranking path. Gated actions render disabled-with-reason; the filter is a
  named, tested seam.
- **The palette is Workbench-launch-blocking, not polish.** The strip is map-tab-only, so
  the palette is the only cross-tab launcher for strip-homed analyses and the universal
  escape hatch — its registry must reach **every** §6-inventory feature home (the retired
  §13.0's sidebar table was the row-walk's other historical source; §6's architecture
  diagram is the surviving one) — the hard W5 gate; re-walked at W8.
- **Viewer mode (D62/D63)** = the same shell read-only: strip fully absent, read-only
  explorer/inspector, D63 trust-chrome band, D45 provenance chrome in full, `dsps_version`
  drop-sniff before JSON ingestion at every drop surface; exits = export report /
  start-my-own-session. Cut line: degrade to the Blueprint face / static §12.2 HTML render.
- **Status-bar density budget:** one glyph + one short label per item; anything heavier
  docks as a status-bar item + flyout. The bar may never become the new "too much on
  screen."
- **AI stays additive.** The §5.1 switch model (off by default, capable-device WebLLM
  pre-select behind the D70 confirm, disclosure-precedes-egress, per-session egress
  persistence) is the whole consent surface; the default-off shell carries one passive
  reassurance line — *"Nothing leaves your machine — configure AI when you want it."*

**Amended by D73 (2026-07-26) — the workspace streamline, tier v0.70,
[`../14-workspace-streamline/`](../14-workspace-streamline/README.md).** Three §13.3 positions
this section built to are reversed there, on the record: the bottom inspector's "scent, not
dashboard" charter (it becomes a two-view drawer hosting a SQL console; the charter re-scopes to
the drawer's Info view), the "one SQL playground" singleton *worked example* (the standalone SQL
tab is deleted — the model stands, its illustration changes), and the Settings tab (settings
stays the overlay the code ships). Two of the cross-cutting contracts above gain a consumer
rather than changing: the **strip-scoping** rule outlives the strip itself, inherited whole by
whatever renders the ranked list on the map; **keep-mounted** extends to the artifact kind's
first live member, the query tab. The envelope invariant, viewer-mode read-only-ness, the
palette's launch-blocking gate, and the status-bar density budget are all untouched.

File-structure additions (features/explorer, features/map absorbing `JoinGraphModule` +
`DossierModule` as a move, services/navigation.ts, stores/tabs.ts + selection.ts,
types/tabs.ts, lib/featureFlags.ts) live in §16.
