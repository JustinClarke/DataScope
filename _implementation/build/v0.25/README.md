# v0.25 — Blueprint-forward opening + edge synthesis → WebLLM handoff + BYOK

**Tier:** v0.25 (D70) · **Phase:** the §19 v0.25 block (between Phase 3 and Phase 4) ·
**Depends on:** the full v0 stack — the Dataset Dossier / D68 Verdict
([`../03-profiling/05-dataset-dossier.md`](../03-profiling/05-dataset-dossier.md)), the
D55/D68 ViewSpec, and the frozen producer seams
([`../../architecture/adr/010-ai-producer-seams.md`](../../architecture/adr/010-ai-producer-seams.md)).
Cloud routing reuses [`../09-edge/01-ai-router.md`](../09-edge/01-ai-router.md); BYOK reuses
[`../06-ai/02-modes-byok.md`](../06-ai/02-modes-byok.md).

A **post-launch** tier — shipped **after** the v0 Oct 6 launch and **before** v0.5 (§19,
D70). It never touches the v0 cutline or the D27 date. v0.25 is a *re-sequencing* of
already-decided AI work (D2/D43/D56) around one UX thesis: the app **opens on the
informative Dossier-forward "Blueprint," not the mechanical sidebar flow.** Everything
except the WebLLM handoff expresses or curates settled decisions; the tier is recorded as a
curation row like D67/D68, not new AI scope.

| Doc | Covers | New surface |
| :--- | :--- | :--- |
| [01-blueprint-opening.md](01-blueprint-opening.md) | The Dossier / D68 Verdict promoted to the primary post-ingest surface (D48/D68/D69, D55/D68 ViewSpec) | none — presentation over shipped v0 modules |
| [02-edge-synthesis.md](02-edge-synthesis.md) | Cloudflare-edge warm-start synthesis Worker over DSPS structural facts (D56 async upgrade; D9/D45/D59 custody) | `edge/synthesis.ts` |
| [03-webllm-handoff.md](03-webllm-handoff.md) | In-browser WebLLM/WebGPU background download → client-side conversational takeover, zero egress (D43 gate cleared — GO, 2026-07-21, ADR-007) | `src/workers/webllm.worker.ts` |

## What is re-sequenced, not re-authored

Two of the milestone's five checklist items reuse existing leaf docs rather than adding
scope — build to the doc named, no duplicate here:

- **BYOK forward** → [`../06-ai/02-modes-byok.md`](../06-ai/02-modes-byok.md) exactly —
  D2 mode (c) / D3 "prefer my key" / D9 stateless pass-through custody, no new custody design.
- **Edge AI routing** → [`../09-edge/01-ai-router.md`](../09-edge/01-ai-router.md)'s provider
  routing is reused as-is; the synthesis Worker (02) is a sibling endpoint on the same
  dual-keyed limiter / kill-switch / content-free-counter infrastructure (ADR-006), not a new
  router.

The **WebLLM spike (D43)** has **no build leaf doc** — like the v0 ingestion and
relationship-inference spikes, its brief and verdict live in **ADR-007** (which already
reserves the D43 local-model verdict) and the `../../architecture/decisions.md` spike log.
Its kill criteria — DuckDB-Wasm memory coexistence, a documented SQL-quality floor vs.
cloud, acceptable model-download UX — gate `03-webllm-handoff.md`; the spike **passed (GO,
2026-07-21) and its verdict + four constraints are recorded in ADR-007**, clearing that gate.
The D40 eval still gates any comparative "local" claim.

## Load-bearing invariant (all three docs answer to it)

The **deterministic Verdict paints first, always** (D55/D68c) and is the complete surface
with AI off (D2/D28). Every AI layer here — edge synthesis, then WebLLM — is a **D56 async
upgrade over that Verdict**, degrading cleanly to the deterministic ViewSpec when AI is off,
down, or uncached. Edge synthesis is **opt-in, structure-only (DSPS facts, never rows,
D45/D59), a stateless pass-through (D9), never stored (D59)**, and **local-only mode never
calls the edge (D2)**. WebLLM is **zero-egress**; the D43 spike passed (GO, ADR-007), so it
ships within its four constraints. Every
AI producer is **eval-gated like D40/D56 — on the feature, never the tier**: failing the
labeled-set check leaves the deterministic Blueprint as the product at zero cost.

## Open sequencing call (unresolved — a human decision)

Where v0.25 slots **relative to `06-ai`** is deliberately **not decided here** (§19/D70). Its
BYOK and edge-routing items re-sequence v0.5 rows and it reuses 06-ai's provider routing, so
it does not cleanly precede `06-ai/01-pipeline`; the `▶` in [`../../status/BUILD-ORDER.md`](../../status/BUILD-ORDER.md)
is left at `06-ai/01-pipeline` pending that call. This folder is **order-neutral** — authoring
it does not move the pointer or commit the sequence.

## Exit criteria (= the §19 v0.25 deliverable)

Drop a dataset → the Blueprint opens with a deterministic Verdict; an edge-warm synthesis
resolves as an "tailored this view" upgrade badge (opt-in, structure-only); WebLLM, once
warmed, serves conversation client-side; and a BYOK key routes per the D3 toggle — every AI
surface degrading cleanly to deterministic when AI is off, down, or uncached.
