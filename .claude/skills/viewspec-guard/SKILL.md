---
name: viewspec-guard
description: "The D55 safety checklist for any change that produces, validates, or renders a ViewSpec or a producer result — AI-generated view output, the deterministic renderer, the producer/validator seam. Load BEFORE editing ViewSpecRenderer, lib/viewspec, lib/producerValidators, types/viewspec, types/producers, or any code path where model output becomes something on screen. Triggers on: ViewSpec, producer, producer validator, AI artifact tab, 'AI opens a tab', renderer registry, componentId, spec-filling."
---

# viewspec-guard

DataScope's single most important safety property: **the AI proposes specs; it never
produces artifacts.** Deterministic code renders. This skill is the checklist that keeps a
change from quietly punching a hole in that boundary. It guards judgment the Stop hooks
can't — lint and `tsc` prove the code compiles, not that model output stays inert.

The contract lives in four files. Read the one you're touching before you touch it:

- `src/features/profiling/dossier/ViewSpecRenderer.tsx` — the deterministic renderer. A
  fixed `switch (panel.componentId)` over a hardcoded component registry.
- `src/lib/viewspec.ts` — `validateViewSpec`, run before render.
- `src/lib/producerValidators.ts` — the `ProducerValidator<T> = (baseline, candidate) => boolean`
  gates. An AI candidate is accepted only if it passes against the deterministic baseline.
- `src/types/viewspec.ts`, `src/types/producers.ts` — the spec + producer types
  (`ProducerResult`, `ProducerSource = 'deterministic' | 'ai'`, `ProducerDegradeReason`).

## The five invariants — every one must still hold after your change

1. **The registry stays a closed switch.** componentId → component is a hardcoded `switch`
   with known cases. No `eval`, no `new Function`, no dynamic `import()` keyed by spec data,
   no `registry[spec.componentId]` object-index over a string the model chose, no
   `React.createElement(variableFromSpec, …)`. An unrecognized componentId renders **nothing**
   — never a crash, never a best-guess fallback component.

2. **Callbacks come from the host, not the spec.** Interaction handlers are passed in via
   `DossierInteractions` / props by the app. A spec is plain, JSON-serializable data end to
   end. If a producer's output can carry a function, a URL that gets fetched, or an event
   handler, that's the hole.

3. **AI output is validated before it renders.** Every `ProducerSource === 'ai'` path runs a
   `ProducerValidator` against the deterministic baseline. Rejection degrades to the
   deterministic result (`ProducerDegradeReason: 'ai-rejected'`) — it does **not** render the
   AI candidate unchecked. Adding an AI producer without a validator is a boundary breach.

4. **New componentIds are declared legal in one place.** Adding a case to the renderer switch
   means the id is also in the ViewSpec type union / broker allow-list. A componentId the
   renderer accepts but the type system doesn't declare is exactly the "future producer
   proposes something never declared legal" case the renderer header warns about.

5. **No `any` bridge to a DOM sink.** Widening `ProducerResult<T>` or a panel's `props` with
   `any`/`unknown`-cast-to-renderable lets model strings flow toward `dangerouslySetInnerHTML`
   or an href. Keep props typed; the renderer's `as unknown as XProps` casts are load-bearing
   *type* assertions, not permission to relax them.

## How to run

Diff-scoped, not a full sweep. For the changed files only:

- Grep the diff for the red flags: `eval(`, `new Function(`, `dangerouslySetInnerHTML`,
  `import(` with a non-literal, `createElement(` with a variable, object-indexed component
  lookup, handlers stored on producer output.
- For any new AI producer: name its validator. If you can't, stop.
- For any new componentId: point to both its `switch` case and its type-union entry.

Report each invariant as HOLDS / AT RISK with the file:line. If everything holds, say so in
one line — this is a gate, not an essay.
