# v0.25.1 Blueprint-forward opening

**Tier:** v0.25 · Phase: §19 v0.25 block · **Master spec:** §13.1, §19 (v0.25) ·
**Decisions:** D70, D48, D68 (a–d), D69, D55, D56 · **Builder:** Sonnet

## Objective

Promote the Dataset Dossier / D68 Verdict to the **primary post-ingest surface** — the app
opens on an informative Dossier-forward "Blueprint," not the mechanical sidebar flow.
**Presentation over shipped v0 modules, no new engine** (D48/D68/D69): the same deterministic
ViewSpec the v0 Dossier already emits ([`../03-profiling/05-dataset-dossier.md`](../03-profiling/05-dataset-dossier.md)),
made the default landing and structured around the D69 intelligence-layers.

## Spec

- **Default landing after ingest (D70, §13.1).** Completing an ingest routes straight to the
  Blueprint (the promoted Dossier), replacing the D68-C nav flow's neutral landing as the
  *first* thing a user sees. The **tier-1 Verdict paints first** — identity band + one headline
  `FactRef` + top-3 `RankedAction`s (D68c) — one screen, no scroll, before any AI resolves.
- **The D69 intelligence-layers are the opening view's structure (D69, D68c).** The Blueprint
  presents its findings by *layer* — **profiling** (per-table stats), **heuristics**
  (data-sniffer / relationship signals), **AI-synthesis** (the optional narration) — mapped
  **onto** the existing `tier: 1|2|3` disclosure axis, never written **into** it: heuristics
  findings render at tier 2, per-table profiling cards at tier 3, the AI-synthesis layer at
  tier 2 or 3 and **never tier 1**. The `tier:` enum stays exactly `1|2|3` (no `1.5`). This is
  presentation of layers already computed by v0 modules, not a new layer engine.
- **"Skip to data" escape hatch preserved (D68d, §2).** A persistent, sticky affordance jumps
  past the Blueprint straight to the raw table / SQL surface for the §2 second audience (the
  analyst who wants the data, not the briefing). The Blueprint is the *opinionated default*,
  never a wall.
- **The Blueprint is the async-upgrade container (D56).** It is the deterministic ViewSpec
  producer that later hosts the edge-warm synthesis ([02-edge-synthesis.md](02-edge-synthesis.md))
  and the WebLLM takeover ([03-webllm-handoff.md](03-webllm-handoff.md)) as **"tailored this
  view" upgrade badges** resolving async **after** the deterministic paint — never load-bearing,
  never breaking wifi-off. With AI off/down/uncached the Blueprint **is** the deterministic
  Verdict (D2/D28), unchanged.
- **The D48 four-rung cut ladder is unchanged** and lives entirely in the deterministic
  producer; promoting the Dossier to the opening surface does not alter any rung.

## Files

`src/app/` (routing / default-landing change — the D68-C nav restructure already established
`activeModule`), `src/features/profiling/dossier/` (the existing ViewSpec producer, presented
as the opening surface with the D69-layer structure and the D68d skip-to-data control). **No
new engine, no new store, no ViewSpec schema change.**

## Dependencies

The v0 Dataset Dossier ([`../03-profiling/05-dataset-dossier.md`](../03-profiling/05-dataset-dossier.md)),
the D68-C nav restructure ([`../01-foundation/03-routing.md`](../01-foundation/03-routing.md)),
the D68-B tiered Verdict. **No dependency on 02/03** — the Blueprint ships and is complete
with AI off; edge synthesis and WebLLM layer on top.

## Acceptance criteria

- [ ] After ingest the app opens on the Blueprint; the tier-1 Verdict paints one screen (identity + one headline fact + top-3 actions) before any AI resolves
- [ ] The D69 layers (profiling / heuristics / AI-synthesis) render onto tiers 2–3 only — no layer renders at tier 1; the `tier:` enum is exactly `1|2|3` (grep: no `1.5`)
- [ ] "Skip to data" is present, sticky, and jumps to the raw table / SQL surface (D68d)
- [ ] With AI off/down/uncached the Blueprint is the deterministic Verdict, byte-for-byte the v0 Dossier — no empty frame, no "AI unavailable" apology
- [ ] Below the interest floor the Verdict states "no single dominant finding — here's the structure," never a manufactured headline (D68c)
- [ ] The four-rung D48 cut ladder still produces a coherent screen at each rung

## Test plan

Reuse the v0 Dossier E2E (it must still pass unchanged with AI off — the Blueprint-off case
is the v0 Dossier). Add a routing test: ingest → lands on the Blueprint. Layer-to-tier
assertion (no AI-synthesis panel at tier 1). Skip-to-data navigation test. `grep` guard for
the `tier:` enum staying `1|2|3`.

## Definition of done

The app opens on the Blueprint after ingest; the deterministic Verdict paints first and is
the complete surface with AI off; the D69 layers map onto the disclosure tiers; the D68d
skip-to-data escape hatch works; the v0 Dossier E2E passes unchanged. No engine, store, or
ViewSpec schema change landed.
