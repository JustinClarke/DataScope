# A6 — Charts and pins as operations

**Tier:** v0.71 · **Depends on:** A5, **v0.70 S5** (query tabs) · **Spec:** master §11.5, §13.3,
§19 v0.71, D55, D74 · **Status:** built 2026-08-02

> **Load the `viewspec-guard` checklist before touching any code in this phase.**

*This is the phase that delivers the actual goal:* the model can compute, transform, chart and pin —
so **a user can drive DataScope by asking.** Everything before this makes the model a good analyst;
this makes its work land in the app.

## The operations

**`create_chart(resultId | sql, { type, spec })`** → a chart recommendation plus a ViewSpec panel
rendered by the **existing deterministic renderer**. Uses `chartMapper` / `charts.ts` — the same
translator §11.1 stage 6 already calls, never a second chart path.

**`pin_result(resultId, title)`** → a query tab. v0.70 S5 built query tabs as the artifact tab
kind's first live member with two producers (pin-from-console, chosen-suggestion); this adds a
**third producer** and nothing else. Per-instance, never deduped, exactly as S5 specified.

**Both are excluded from the D74 scored run** — they produce no gradeable analytical fact. They are
product surface, and they are why the tier exists.

## The D55 seam is the whole of this phase's risk

The envelope invariant is load-bearing and does not weaken:

> **The tab *envelope*** — type from a fixed tab-type registry, identity, active-tab selection,
> initializer — **is authored only by the app, never by a model. The only model-producible content
> is the inner artifact spec** (ChartSpec / ViewSpec), **validated by `producerValidators` before
> any tab opens.**

So: `pin_result` does **not** let a model author a tab. It hands the app a **result id and a title**;
the app authors the envelope. `create_chart` does **not** let a model emit a rendered panel. It
emits an inner spec that is **validated before it reaches the renderer**, and a spec that fails
validation produces a structured `OpError` — never a partially-rendered panel, never a fallback
that quietly drops the invalid parts.

**The renderer never executes model output.** That sentence has survived D55, D56, D68, D71 and D73
unchanged, and it survives this phase.

## Componentless failure is a real state

A model will ask for a chart the data cannot support. That is not an error condition to paper over:
`create_chart` returns a structured refusal naming **why** (no temporal column for a time series, a
categorical with 4,000 distinct values for a bar chart), the model reads it on an ordinary turn, and
it composes something else. This is the **capabilities broker's grammar** (§9) applied to a model
caller — the same gate that stops the app offering a map for a dataset with no geo columns.

## Definition of done

- [x] `viewspec-guard` checklist run and its items satisfied — **before** any code lands.
- [x] `create_chart` emits only an **inner artifact spec**; `producerValidators` runs before the
      renderer sees it; a failing spec yields `OpError` and **no partial render**.
- [x] `pin_result` cannot author a tab envelope. A test asserts the model-supplied payload reaches
      only the inner spec and the title.
- [x] Charts route through the existing `chartMapper` / `charts.ts` translator — no second chart
      path (D58).
- [x] Query tabs created this way are **indistinguishable** from S5's two existing producers'
      output: per-instance, never deduped, independently editable and re-runnable.
- [x] Broker-illegal chart requests return a structured refusal naming the reason, and the loop
      continues on an ordinary turn.
- [x] A pinned result carries its `sql`, so the user can edit and re-run what the model pinned —
      the tier's whole premise, verified at its last mile.
- [x] Viewer mode (D62) is unaffected: consumption-only sessions gain no chart or pin operation,
      as they gain no console.

## Built (2026-08-02)

The catalog is **nineteen** operations: seventeen analysis plus these two, tagged
`PRODUCT_SURFACE_OPERATIONS` in `toolSchemas.ts`. `runHarness.ts` filters the scored run on that
tag rather than on a name list copied into `eval/`, so **D74's scored surface is still the
seventeen the published numbers were established against** — the tag is the mechanism, not a
promise, and a third operation of the same kind is excluded without anyone remembering to.

**The `Workspace` seam is the phase's structural claim.** `pin_result` does not refuse to author a
tab envelope — it *cannot express one*. `PinRequest` (`lib/analyst/types.ts`) has fields for a
title, a statement, and a result; there is no field for a tab type, id, subject or initializer, so
the D55 invariant holds by the shape of the seam rather than by the handler being careful. The
test asserts the request's **whole key set**, so a future field cannot be added without failing
first. A core built without the seam is *headless* and the operation returns a new `unavailable`
`OpError` — which is what the conformance harness gets, and, by construction, what a
consumption-only viewer session would get: it builds no workspace because it has no console.

**`create_chart` returns the charted result's own envelope with a spec attached**, rather than a
row describing a chart. That composition is worth more than the tidiness: the same `resultId` can
then be pinned or paged, and the host has the rows to draw without a second read. The one
model-influenced field on the envelope is `chart`, and `chartSpecValidator` (seam 3 in
`producerValidators.ts`, alongside the ranking and narration validators) is what makes it safe: a
candidate is accepted only as a **narrowing** of the deterministic baseline — same type, same
axis, a subset of its measures, a re-title clearing the D45 phrasing guard. **No field name in an
accepted spec came from the model**, because every one was already in a baseline `chartMapper`
built from the result's own schema. A rejection is total: a structured `OpError` and no `chart` on
the envelope at all, asserted both in unit tests and across the MCP boundary in conformance.

Two calls where the leaf doc left room:

- **Where the panel renders.** The doc says "a ViewSpec panel rendered by the existing
  deterministic renderer." The `ViewSpec` component registry is the Dossier's, and adding a chart
  componentId to it would have created a panel nothing renders. The chart instead lands where the
  model's work already lands — the transcript — through `AutoChartPanel`, which *is* the existing
  deterministic chart renderer (the console's and every query tab's). It gained one optional
  `spec` prop: the validated spec to open on. `AITurnView` previously rendered the stage-6
  recommendation as a one-line text label; it now draws the chart, and falls back to that label
  when a turn carries a recommendation but no rows.
- **The scored-run exclusion is a filter, not a gate.** Both operations stay in `ANALYST_TOOLS`
  and on the MCP server — a second list is how two surfaces drift, which is the guarantee A5
  exists to make. Only the harness narrows what it advertises.

An explicit `create_chart` now outranks stage 6's auto-chart on the turn: stage 6 guesses at what
ran last, and this is the model saying which result was worth drawing and how.

**Not touched, and worth naming:** `stores/query.ts` carries `charts: ChartSpec[]` per session with
`addChart`/`removeChart`, and nothing renders it. It predates this phase and stayed untouched —
pinning a chart *as its own artifact* is the surface that slot was cut for, and it is not this
phase's scope.

30 new tests across 6 files — `lib/analyst/chartsAndPins.test.ts` (the seam and the validator gate,
20), `services/analystWorkspace.test.ts` (the browser half: same producer, per-instance, never
deduped), plus additions to `producerValidators`, `toolSchemas`, `ai` and `AITurnView`. Two-engine
conformance covers both operations with **exact-value** assertions rather than envelope equality
alone, since two engines failing identically would have satisfied the latter and proved nothing.
Full suite green: `npx vitest run` (204 files, 2131 tests), `npx tsc --noEmit` and `npx oxlint`
clean.
