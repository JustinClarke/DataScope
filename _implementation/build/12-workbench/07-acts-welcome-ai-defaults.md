# W6 — Acts 0–2: Welcome Page + AI Defaults

**Tier:** v0.60 (the Workbench, D71) · flag-gated `WORKBENCH_ENABLED`, flag-on only ·
**Master spec:** §13.3 ("Act 0 welcome" / "Act 1 upload" / "Act 2 AI defaults" sentence), §5.1
(the switch model, D2 amendment), §19 (W6 row), D70 (WebLLM download-confirm stays the sole
consent gate)

## Objective

W1 gave Act 0/Act 1 chrome-free one-line placeholders (`<div>Welcome (W6)</div>` / `<div>Uploading
(W6)</div>`) and a stopgap sample auto-load standing in for a real welcome page. W6 replaces both
with real content and closes the "AI defaults" half of §13.3's Act 2 sentence — not a third screen,
but the state a fresh Workbench session starts in: off by default, a capable device's WebLLM
switch pre-selected, no forced gate ever blocking the shell.

## Scope calls (made this session, confirmed with the human before building)

**1. Act 0 fidelity — functional-first, not hallmark-faithful.** The signed-off mock
(`welcome-act0.html`, formerly `_misc/ideation/hallmark/`, deleted post-v0.69) is a light-violet
editorial register, visually distinct from the map's dark HUD — the mocks' own "register
coherence" question was still open ideation scope at the time, not this leaf's to resolve as a
side effect. (Resolved later, 2026-07-25, by V6d — see `build/13-hallmark-replication/06d-act0.md`:
composition ports, register does not.)
Same precedent W4 set for the map: functional-first on the existing `--color-*` tokens, the mock
read as content/copy reference only, not a pixel target.

**2. AI defaults — probe + recommendation only, no store wiring.** §13.3 attributes "capable-device
WebLLM pre-select" to W6, but the only surface that could ever *display* or *act on* a pre-selected
switch — the flat Off/Cloudflare/WebLLM/Your-own-key control — is explicitly W7's ("Right AI pane
(switches + audit trail)", charter table). Wiring a recommendation into the shared, persisted
`useSettingsStore.aiMode` now, before any UI reads or shows it, would be an invisible behavior
change to cross-shell state for however many sessions land between W6 and W7 — the same class of
premature-plumbing this project has deferred before (W3 deferred pinning until a real
result-producing tab existed to pin; W5 deferred module-wiring until real `TabType`s existed to
wire). This leaf ships the **pure decision logic**, tested standalone with no store side effects:
`isCapableDevice()` and `recommendedWorkbenchAIMode(capable)`. Wiring them into `aiMode`/
`webllmConsent` and rendering the actual switches is named explicitly as **W7's first job** so it
isn't dropped.

**Capable-device signal, kept narrow on purpose.** The probe reuses exactly the signal
`WebLLMDock.tsx`'s own `eligible` check already uses — WebGPU presence (`'gpu' in navigator`) — and
nothing else. `lib/memoryHeadroom.ts`'s `deviceMemoryGB` signal was considered and rejected here:
no GB threshold for "can this device also carry the pinned WebLLM model" is stated or verified
anywhere in the spec (the 1.5B q4 model's own comment in `services/webllm.ts` only says it's
verified to coexist with DuckDB "on a large dataset" on unspecified hardware) — inventing a number
would overstate certainty this leaf doesn't have. WebGPU-only matches the one signal already proven
in production use for the adjacent (post-consent) eligibility check.

## Spec

### Act 0 + Act 1 (`WorkbenchShell.tsx`)

- Both acts render the **same** `Welcome` component — a headline, the passive reassurance line
  §13.3 names verbatim ("Nothing leaves your machine — configure AI when you want it."), and
  `IngestionPanel` mounted unchanged (drop zone, sample picker, URL form, its own telemetry/error/
  toast machinery). This is "unchanged machinery" read literally: `IngestionPanel` already renders
  honest phase labels via its own `TelemetryPanel` (`fetching`/`loading-engine`/`parsing`/`done`/
  `error`) regardless of the outer act, so Act 1 needs no second progress UI — it is Act 0 staying
  mounted while `workerStatus` is still `loading`/`compiling` in the background, not a different
  screen. The two acts keep separate `data-act="act0"`/`data-act="act1"` wrappers (W1's pure
  skeleton contract, still tested) but identical content.
- `IngestionPanel`'s internal `navigateToPostIngestLanding()` call (old-shell nav via
  `useUIStore.setActiveModule`) fires harmlessly inert in the Workbench — nothing here reads
  `useUIStore.activeModule` — same "additive, no-op in the other shell" shape as `TableList`'s
  `onSelectTable` prop (W2).
- **Remove the W4/W5-era `useSampleAutoLoad` stopgap** (`WorkbenchShell.tsx`) and its dedicated
  test in `WorkbenchShell.test.tsx` — real ingestion entry points now exist, so a fresh Workbench
  session lands on the welcome page and waits for the user to drop a file, paste a URL, or pick a
  sample, exactly like the old shell's own first-run behavior. `useMapAutoOpen` (W4, unrelated to
  seeding sample data) is untouched.

### AI defaults (`app/workbenchAIDefaults.ts`, new)

- `isCapableDevice(hasWebGPU = defaultHasWebGPU): boolean` — WebGPU presence only, injectable for
  tests the same way `services/webllm.ts`'s `WarmDeps.hasWebGPU` already is.
- `recommendedWorkbenchAIMode(capableDevice: boolean): AIMode` — `'local-model'` when capable,
  `'local-only'` (off) otherwise. Pure, no store reads/writes. This is the §5.1 mapping stated
  directly: Off = mode (a) = `'local-only'`; WebLLM = mode (b) = `'local-model'`; a recommendation
  never touches `webllmConsent`, so nothing here downloads anything — D70's download-confirm stays
  the sole consent gate, untouched.
- **Not built this leaf:** any change to `useSettingsStore`, `WorkbenchShell`, or a rendered switch
  of any kind. **No forced gate** is satisfied structurally, not by new code — `WorkbenchShell`
  never has and still doesn't import `AIModeChooser` (the old shell's blocking first-run modal); the
  shells are already separate composition roots (D71), so this needs no defensive code, only this
  note recording that the invariant was checked, not assumed.

## Files

New: `src/app/workbenchAIDefaults.ts` (+ `.test.ts`).
Modified: `src/app/WorkbenchShell.tsx` (`Act0`/`Act1` render real `Welcome` content;
`useSampleAutoLoad` removed), `src/app/WorkbenchShell.test.tsx` (sample-auto-load tests removed;
new Act 0/1 content assertions).
No changes to `useSettingsStore`, `stores/webllm.ts`, `services/webllm.ts`, `AIModeChooser.tsx`,
`AISettingsPanel.tsx`, or `WebLLMDock.tsx` — all old-shell AI surfaces, untouched; the Workbench's
own AI pane is W7.

## Dependencies

W1 (workbench scaffold, act assembly) — shipped 2026-07-24. The hallmark welcome brief
(`welcome-act0.html`) — signed off, read as copy/content reference only per the scope call above.

## Acceptance criteria

- [ ] Act 0 (no datasets, worker idle/ready) renders the headline, the passive reassurance line,
      and a mounted, functioning `IngestionPanel` — dropping a file/picking a sample registers a
      table exactly as it does in the old shell
- [ ] Act 1 (worker `loading`/`compiling`, no datasets yet) renders the same `Welcome` content,
      not a distinct placeholder — `data-act="act1"` is present, content is identical to Act 0's
- [ ] No sample dataset auto-loads on a fresh Act 0 mount; `loadDataset` is never called except by
      an explicit user action through `IngestionPanel`
- [ ] `isCapableDevice()` returns `true` iff its injected WebGPU check does; `recommendedWorkbenchAIMode`
      returns `'local-model'` for `true` and `'local-only'` for `false`, with no store/module
      side effects (assert `useSettingsStore`'s state is untouched by importing/calling either)
- [ ] `WorkbenchShell.tsx` still does not import `AIModeChooser` (grep-checked)
- [ ] Full existing suite green; `tsc -b` clean; `oxlint` clean on every changed file; `graphify
      update .` run

## Test plan

Vitest + React Testing Library, following `WorkbenchShell.test.tsx`'s existing mocking conventions
(`vi.hoisted` + `vi.mock` on the DuckDB-worker-reaching services).

- `workbenchAIDefaults.test.ts`: pure unit tests, no mocking — both capable/incapable branches of
  each function; a spy/assert that neither function reads or writes `useSettingsStore`.
- `WorkbenchShell.test.tsx`: replace the sample-auto-load tests with assertions that `IngestionPanel`
  content (e.g. the drop zone / sample picker) renders inside both `act0` and `act1`; keep the
  existing act-selection tests (act0 chrome-free at idle, act1 chrome-free while loading/compiling,
  shell once datasets exist) since `selectWorkbenchAct` itself is unchanged.
- Run the full existing suite last.

## Definition of done

A fresh Workbench session lands on a real, functional welcome page with working ingestion entry
points instead of a placeholder + stopgap sample load; the capable-device AI recommendation exists
as tested, pure, unwired logic ready for W7 to consume; the "no forced gate" invariant is confirmed,
not newly built. Full suite green, `tsc -b`/`oxlint` clean, `graphify update .` run.
