# W0 — Tab Contract

**Tier:** v0.60 (the Workbench, D71) · flag-gated `WORKBENCH_ENABLED`, flag-off and invisible ·
**Master spec:** §13.3 ("the canvas and the tab model," the envelope-invariant paragraph),
§19 (W0 row), §16 (file-structure additions), D55, D71

## Objective

Freeze the tab envelope contract — a closed tab-type registry, a minimal `stores/tabs.ts`, and
the single nav facade (`services/navigation.ts`) that both shells will route through — behind
the flag, with the envelope invariant (the D55 generalization) unit-tested **before** any
Workbench UI exists. Nothing renders differently with the flag off; this phase is the contract
and its tests, not a visible surface (§19: "no `src/` code for this redesign starts until the
fold → tree → build-leaf sequence has landed" — this leaf *is* that sequence's first `src/`
increment, so it earns its keep by proving the seam, not by shipping pixels).

## Spec

- **The envelope invariant is the hard gate (D55 generalization, §13.3).** A tab is described
  by a spec, but the tab *envelope* — `type` (drawn from a fixed, closed registry), `id`,
  `subject` (the identity a singleton tab is keyed on — deferred enforcement to W3, but the
  field exists now), and `initializer` (the D68e `ThreadConfig`-shaped prefill) — is authored
  **only by app code**, never by a model or any untyped payload. `types/tabs.ts` must make this
  true at the type level: the only way to construct a `TabSpec`'s envelope fields is through
  typed, app-code call sites (`openTab`'s own parameters), never by spreading or casting an
  arbitrary object into them. The only place model output can eventually enter a tab is as an
  *inner* artifact spec (ChartSpec, ViewSpec) — validated by `producerValidators`
  (`types/producers.ts`, the existing D55 seam) — and W0 ships no AI producer wiring at all, so
  the criterion below is proven adversarially: construct a payload shaped like it came from a
  producer, with envelope-looking keys (`type`, `initializer`) sitting where an inner spec
  should be, and confirm `stores/tabs.ts`'s public API has no path that lets those keys reach
  the envelope.
- **`types/tabs.ts` — the closed registry.** `TabType` is a union, not a string — the same
  discipline as `SidebarModule` (`stores/ui.ts`) today, so adding a tab type is a compile-time,
  reviewed change, never a runtime string. W0 does not need to enumerate every eventual tab
  type (later phases add them as they're built — W2's Profile tab, W4's map/Blueprint, W5's
  SQL/Pivot/Charts via the palette); it needs the registry *mechanism* and enough placeholder
  members (at minimum `'map'`) to prove the type compiles and a real `openTab` call round-trips.
- **`stores/tabs.ts` — the minimal store.** A Zustand store holding open `TabSpec[]` +
  `activeTabId`, with `openTab(type, subject, initializer?, artifactSpec?)` and `closeTab(id)`.
  W0 deliberately does **not** implement singleton-per-`(type, subject)` dedup, artifact-tab
  semantics, keep-mounted preservation, or pinning — those are W3's job, building on this base
  contract. Keep the surface small enough that W3 extends it rather than rewrites it.
- **`services/navigation.ts` — the single migration seam (§19).** One function,
  `openDestination(module, tab?, prefill?)`, is the only call site every future ranked-action /
  palette / explorer click goes through. Flag-off (`WORKBENCH_ENABLED === false`, the default):
  routes to `useUIStore.getState().setActiveModule(module, tab, prefill)` — today's exact
  behavior, unchanged, proven by re-running `stores/ui.test.ts`'s cases *through the facade*
  rather than directly against the store. Flag-on: routes to `useTabsStore.getState().openTab`.
  No feature module ever branches on the flag directly — a module needing to know which shell
  is live is a facade design error (§13.3, restated as a lint-by-test here: grep the diff for
  `WORKBENCH_ENABLED` usage outside `services/navigation.ts` and `lib/featureFlags.ts` itself).
- **`lib/featureFlags.ts` — add `WORKBENCH_ENABLED`.** Same `import.meta.env` read-once pattern
  as `JOIN_GRAPH_ENABLED`, but the default is the opposite: **off**, not on — the Workbench is
  invisible until the W8 cutover, where `JOIN_GRAPH_ENABLED` ships live today. `VITE_WORKBENCH`
  overrides for local dev/testing (`'false'`/`'0'` → off, anything else → on, undefined → off).

## Files

`src/types/tabs.ts` (new — `TabType` registry, `TabSpec` envelope), `src/stores/tabs.ts` (new
— minimal open/close store), `src/services/navigation.ts` (new — `openDestination`, the nav
facade), `src/lib/featureFlags.ts` (extended — `WORKBENCH_ENABLED`), `src/stores/ui.ts`
(unchanged in behavior; consumed by the facade's flag-off path, not modified unless a
call-site signature needs to shift to route through `openDestination`).

## Dependencies

None beyond the committed v0 baseline (§19's own dependency row) — this is the first
Workbench leaf, so nothing in `build/12-workbench/` precedes it.

## Acceptance criteria

- [x] `TabType` is a closed union in `types/tabs.ts`; `TabSpec`'s envelope fields (`id`, `type`,
      `subject`, `initializer`) have no code path that constructs them from an untyped or
      model-shaped object — only `openTab`'s typed parameters set them
- [x] Adversarial test: a payload shaped like a producer result, with envelope-looking keys
      (`type`, `initializer`) where an inner artifact spec belongs, does not reach the
      envelope when passed through `stores/tabs.ts`'s public API — the seam `producerValidators`
      will eventually gate is proven closed even with zero AI wiring present
- [x] `openDestination` flag-off reproduces every existing `stores/ui.test.ts` case bit-for-bit
      when called through the facade instead of the store directly (regression, not new
      behavior)
- [x] `WORKBENCH_ENABLED` defaults to `false`; flipping it (test-only, via `VITE_WORKBENCH`)
      routes `openDestination` to `stores/tabs.ts.openTab` instead of `stores/ui.ts`
- [x] No component outside `services/navigation.ts` / `lib/featureFlags.ts` references
      `WORKBENCH_ENABLED` (grep-clean)
- [x] Full existing suite green with the flag at its default (off) — zero behavior change to
      the shipped v0 shell

## Test plan

Vitest unit tests only — this phase is client-side types/store/facade with no edge, no
network, no live verification needed. Write the adversarial envelope-invariant test first (the
phase's namesake gate); then the flag-off regression tests (port `stores/ui.test.ts`'s
assertions to call through `openDestination`); then the flag-on minimal round-trip
(`openTab` → tab appears in `stores/tabs.ts` state). Run the full existing suite last to confirm
zero regression to the flag-off default.

## Definition of done

Envelope-invariant test green; flag-off parity tests green against the existing `stores/ui.ts`
behavior; `WORKBENCH_ENABLED` defaults false and is read only inside the facade/flag module;
full existing suite green; no new rendered UI (W0 ships no visible surface — W1 starts that).
