# v0.25.3 WebLLM client handoff

**Tier:** v0.25 · Phase: §19 v0.25 block · **Master spec:** §11.2, §13.1, §19 (v0.25) ·
**Decisions:** D70, D43, D2, D56, D28 · **ADRs:** ADR-007 (the D43 verdict — a **hard gate**),
ADR-010 (producer seams) · **Builder:** Opus

> **Gate cleared — the D43 spike passed (GO, 2026-07-21; ADR-007).** The **one genuinely-new
> architectural commitment** of v0.25. In-browser WebLLM/WebGPU is no longer unbuilt/unscoped; this
> build may proceed **within the four ADR-007 constraints**: (1) pin the **Qwen2.5-Coder-1.5B q4f16**
> coder (3B unverified on 8 GB); (2) run it in a **Worker** engine (main-thread load jank); (3) use a
> **resumable/retrying** shard download (the CDN drops the connection ~every 3 shards; resume from
> Cache Storage); (4) treat local SQL quality as a **simple-schema floor with no measured cloud
> head-to-head** — the **D40 eval still gates any "local" claim** (CV, marketing, or a "local" column
> in the harness), watching the aggregate-then-rank failure mode. WebLLM remains **progressive
> enhancement**: the edge/BYOK path ([02-edge-synthesis.md](02-edge-synthesis.md),
> [`../06-ai/02-modes-byok.md`](../06-ai/02-modes-byok.md)) **is** the conversational engine and
> WebLLM takes over only once warm, degrading edge → deterministic on any failure.

## Objective

In-browser WebLLM/WebGPU downloads and warms in the background while the edge paints the warm
synthesis, then **takes over the NL / conversational surface fully client-side, zero egress** —
the privacy "take it further." It is a **client-side provider** behind the existing provider
abstraction, not a new NL→SQL architecture.

## D43 kill criteria (the ADR-007 gate — all three must pass)

- **(a) Memory coexistence with DuckDB-Wasm** on a representative large dataset **without OOM** —
  the load-bearing risk: WebLLM weights and DuckDB-Wasm share the ~2 GB tab ceiling.
- **(b) A documented SQL-generation / synthesis quality floor vs. cloud** — a labeled-set number,
  not a vibe.
- **(c) Acceptable model-download UX** — background download + warm without blocking the
  deterministic Verdict or the edge warm-start.

The pass/fail verdict is recorded in **ADR-007** and the `../../architecture/decisions.md` spike
log (this milestone's "WebLLM spike" checklist row); the D40 harness may report a "local" number
**only** for a path that passed.

## Spec

- **The handoff sequence (D70, §13.1).** Deterministic Verdict paints first (D55/D68c) → edge
  warm-start synthesis resolves as the async upgrade ([02-edge-synthesis.md](02-edge-synthesis.md))
  → WebLLM downloads/warms in the background → **once warm, WebLLM takes over the conversational
  surface client-side**, replacing the edge as the producer with **zero egress**.
- **A client-side provider, not a new pipeline (§11.2, master §11).** WebLLM plugs into the
  existing provider abstraction ([`../09-edge/01-ai-router.md`](../09-edge/01-ai-router.md)'s
  interface) and emits the **same ADR-010 slice** every other producer emits (bound to the broker
  grammar; the seam validator degrades on any violation). It **reuses** the schema-pruned-DSPS
  input; it **does not** build the §11.1 stage 1–6 NL→SQL pipeline, transcript auditability, or
  the D40 gate — **those remain the v0.5 Phase-4 deliverable** ([`../06-ai/01-pipeline.md`](../06-ai/01-pipeline.md)).
- **Zero egress (D2).** WebLLM inference stays in the browser — no payload leaves the device once
  it is the active provider. This is the D2 "local model" mode's honestly-specced in-browser path,
  finally scoped (previously localhost-Ollama only, §11.2).
- **Graceful degradation (D56/D28).** WebGPU absent, download incomplete, spike-failed, or the
  user off → the surface degrades to **edge synthesis, then to the deterministic Verdict** — a
  three-rung ladder, never a broken conversational box, never a blocked first paint.
- **Consent-gated download (amended by human decision, 2026-07-22 — master §13.1/§19).** The
  ~830 MB model download is **never silent**: an eligible session (an AI mode chosen, no BYOK key,
  WebGPU present) is asked once, with a bottom progress bar on accept; declining keeps the quota'd
  cloud free tier as the conversational engine. A user-supplied BYOK key suppresses the handoff
  entirely — they brought their own provider. Serving honors the same gate: turning the local model
  off in settings stops it serving even while warm; local-only mode never serves it (D2).

## Files

As built: `src/workers/webllm.worker.ts` (the Worker engine host — constraint 2),
`src/services/webllm.ts` (engine lifecycle: the download/warm state machine, the resumable
30-attempt retry resuming from Cache Storage — constraint 3 — the pinned 1.5B q4f16 model id —
constraint 1 — and the shared `webllmChat` entry), `src/stores/webllm.ts` (status/progress store),
`src/services/webllmProvider.ts` (the `AIProvider` — deterministic SQL-mode/answer-mode control
flow over plain-text extraction, the shape the spike proved for this small coder),
`src/services/webllmSynthesis.ts` (the local ADR-010 producer, reusing the edge's exact prompt +
parse contract exported from `edge/synthesisProvider.ts`), `src/services/aiProvider.ts` (the
provider ladder), `src/services/synthesis.ts` (local rung → edge rung → baseline; the edge rung is cloud-mode
only — local-model's zero-external contract (§5.1) degrades a cold/failed local rung straight
to the deterministic baseline),
`src/features/ai/WebLLMDock.tsx` (consent banner + bottom progress bar),
`src/features/ai/AIChatModule.tsx` ("Running locally — zero egress" chip),
`src/features/ai/AISettingsPanel.tsx` + `AIModeChooser.tsx` (consent control + honest copy),
`src/stores/settings.ts` (`webllmConsent`), `vite.config.ts` (COEP `credentialless` so the
cross-origin model CDN loads while `crossOriginIsolated` stays true).

## Dependencies

**Hard gate: ADR-007 D43 verdict = PASS (GO, 2026-07-21) — cleared** (build within the four ADR-007
constraints). Then: the provider abstraction
([`../09-edge/01-ai-router.md`](../09-edge/01-ai-router.md)), the edge warm-start it takes over
from ([02-edge-synthesis.md](02-edge-synthesis.md)), the Blueprint container
([01-blueprint-opening.md](01-blueprint-opening.md)), the frozen seams (ADR-010), and the DuckDB
worker it must coexist with in memory ([`../02-ingestion/02-duckdb.md`](../02-ingestion/02-duckdb.md)).

## Acceptance criteria

- [x] Build does not begin / no local claim is made until the ADR-007 D43 verdict is recorded as passing (criteria a/b/c) — *verdict GO recorded 2026-07-21 before this build started*
- [x] WebLLM downloads and warms in the background without blocking the deterministic Verdict or the edge warm-start paint — *live: consent banner off the paint path; zero CDN requests before consent; app navigable during download/warm (Worker engine); progress bar renders while the surface stays interactive*
- [x] Once warm, WebLLM serves the conversational surface **client-side with zero egress** (Network tab shows no payload leaving during local inference, §18) — *live (headed Chrome, real WebGPU): question → local SQL → DuckDB execution → local answer with **zero** external requests across the whole send→answer window*
- [x] WebLLM and the DuckDB-Wasm worker coexist on a representative large dataset without OOM (criterion a, live) — *live: 1,240,000-row CSV ingested with the model warm; full-scan `count(*)` executed in 7 ms; no crash*
- [x] WebGPU absent / download incomplete / off → degrades edge → deterministic, never a broken conversational box — *live: no-WebGPU page never shows the offer, surface intact; pre-warm/declined sessions keep the edge serving (provider ladder); engine failure drops to 'error' so the next turn resolves to the edge (unit-tested)*
- [x] WebLLM emits a valid ADR-010 slice; the seam validator degrades to deterministic on any invariant violation — *live: "Tailored to your data" badge appeared with zero external requests (the local slice passed the real client validators); violation → degrade unit-tested through the same `validateSlice` path both rungs share*
- [x] The §11.1 stage 1–6 pipeline is **not** built here (scope guard — it stays the v0.5 Phase-4 deliverable) — *`services/ai.ts` untouched; the provider plugs into the already-built loop behind the existing seam*

## Test plan

As run: unit tests for the warm state machine (WebGPU gate, progress states, resumable retry,
failure-to-error, idempotent concurrency), the provider's deterministic control flow (SQL mode /
answer mode / error-repair mode, prose fallback, abort), the provider ladder (local-only null even
when warm; BYOK key suppression; cold fallbacks), the synthesis local rung (zero-egress serving,
same-validator degrade, out-of-contract → edge fallback, local-only kill-switch), and the consent
dock (ask-once, decline, BYOK/no-WebGPU/no-mode suppression, progress states). Live E2E (headed
Chrome, real WebGPU, cached shards): the full consent → download → warm → local chat → local
synthesis → no-WebGPU degrade sequence above.

## Definition of done

The ADR-007 D43 verdict is recorded as passing; WebLLM downloads/warms in the background and
takes over the conversational surface client-side with verified zero egress; it coexists with
DuckDB-Wasm without OOM; every failure path degrades edge → deterministic; and the full NL→SQL
pipeline remains untouched in v0.5. If the spike fails, this item does not ship and the
edge/BYOK path stays the conversational engine — logged in ADR-007, no date or tier moved.
