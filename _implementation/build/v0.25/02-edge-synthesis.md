# v0.25.2 Edge synthesis Worker (warm start)

**Tier:** v0.25 · Phase: §19 v0.25 block · **Master spec:** §6, §11.2, §13.1, §19 (v0.25),
§23.5 · **Decisions:** D70, D56, D9, D45, D46, D59, D2, D28, D40 · **ADRs:** ADR-006 (edge
infra), ADR-010 (producer seams) · **Builder:** Opus

## Objective

A Cloudflare Worker endpoint (`edge/synthesis.ts`) that emits the Blueprint's initial
dataset-synthesis narrative + suggested explorations **quickly** — the warm start covering
WebLLM's model-download cold-start ([03-webllm-handoff.md](03-webllm-handoff.md)). It is the
**D56 async "tailored this view" upgrade over the deterministic Verdict, never on the
first-paint path** (D55/D68c): the Blueprint paints the deterministic Verdict first and is the
complete surface with AI off (D2/D28).

## Spec

- **Producer over the deterministic baseline (ADR-010, §6).** The Worker emits the **same
  ADR-010 slice a deterministic producer emits** — a re-ranked/re-phrased `RankedAction[]`
  (action-ranking seam) and re-phrased `FactRef.statement` prose (findings-narration seam) —
  so **nothing downstream of the seam changes**. It receives the already-computed slice
  (the DSPS structural facts + the deterministic baseline), **never the raw registry or DSPS
  accumulation**; "bound to the broker grammar, never invents a claim or a route" is
  unrepresentable to violate, not a runtime check. The seam validator (ADR-010, owned by the
  seam, **never self-certified by the producer**) degrades to the deterministic slice on any
  invariant violation.
- **Input is structure-only — DSPS facts, never rows (D45/D59, §12.3).** The edge call carries
  **schema, types, and profile aggregates only** — the same structure-only boundary as the D20
  share — **never data rows**. Column names are themselves re-identifiable (D46), so the whole
  call is behind an explicit opt-in.
- **Opt-in, never a default (D2/D46).** Edge synthesis is an explicit opt-in mode under the D2
  first-run chooser; **local-only mode never calls the edge** (it is a cloud/edge-mode feature).
  **Local-model mode never calls it either** — its §5.1 contract is zero external egress, so its
  only AI synthesis rung is the warm in-browser engine, degrading to the deterministic baseline
  (never to the edge) when cold — mode-matrix E2E verified at the network layer, 2026-07-22.
  No first-run chooser selection → the Blueprint stays fully deterministic.
- **Stateless pass-through, never stored (D9/D59).** The DSPS fragment is attached, forwarded to
  the model, and **nothing is persisted server-side** — no DSPS accumulation, no harvest, no log
  of structure text. Custody is exactly the §11.2 BYOK pass-through shape (D9).
- **Reuses the edge infrastructure, not a new router (ADR-006, §23.5).** The endpoint sits on the
  **shared dual-keyed rate limiter** (per-session + per-IP floor), a **per-endpoint kill-switch
  flag** (typed **503** → client renders "cloud features paused"), and a **request-body cap**
  (the DSPS structural fragment is small). Provider routing reuses
  [`../09-edge/01-ai-router.md`](../09-edge/01-ai-router.md) (Workers AI default; BYOK
  pass-through or vault per the D3 toggle) — this is a sibling endpoint, not a second router.
- **Content-free counters only (D25/D41, §23.5).** Emits numeric-only metrics to the Analytics
  Engine dataset — endpoint, outcome class, size bucket, latency bucket — and **never the DSPS
  text, the narrative, or column names**. No content-bearing tracing (a §5.2 violation).
- **Eval-gated like any AI producer (D40/D56).** A labeled-set check that the composed
  view/narrative **beats the deterministic one** gates the **feature, never the tier** — failing
  it leaves the deterministic Blueprint as the product at zero cost.

## Files

`edge/synthesis.ts` (Worker endpoint, sibling of `edge/ai-router.ts`, routed by `edge/worker.ts`
path dispatch) with the `SynthesisProvider` seam it calls; `edge/synthesisProvider.ts` (the
Workers-AI-backed provider — the model returns only a re-phrased headline, a permutation of
action indices, and re-phrased verbs; the adapter reassembles the slice from the baseline, so an
added/dropped/altered action is unrepresentable in its output format; any out-of-contract output
throws and the endpoint echoes the baseline — plus `createRoutingSynthesisProvider`, the D3
routing wrapper behind the same seam: prefer-key runs 100% via the user's provider through the
router's `ByokResolver`, free-tier-first overflows to the key only on the Workers-AI pool
ceiling, and any failure still degrades to the baseline echo); `edge/protocol.ts` (the
structure-only wire contract — `StructuralFacts` + the baseline slice, plus the optional D3
`routing` + D9 `byok` pass-through credential, the one non-structural field — self-contained so
the edge deploy never imports the app's store layer); `edge/shared/` (the ADR-006 shared infra, now genuinely shared
with the live ai-router: `limiter.ts` dual-keyed rate limiter over the ADR-006 Durable-Object
store, `killSwitch.ts` per-endpoint flag → typed 503, `counters.ts` content-free numeric
metrics, `http.ts` body-cap + typed errors). Eval: `eval/synthesis/run.ts` (the D40/D56 gate —
one labeled item per §14 sample dataset built by the product's own profile → insight → Verdict
pipeline, scored through the product client's seam validators). Client: `src/services/synthesis.ts`
(the thin synthesis client — opt-in/local-only gate, structure-only request, per-seam validate-then-
upgrade-or-degrade, typed-`paused` surfacing), `src/lib/producerValidators.ts` (the two ADR-010 seam
validators — the honesty boundary, incl. the D45 phrasing guard), `src/lib/structuralFacts.ts` (the
rows-free fragment built from the registry), and `src/features/profiling/dossier/useSynthesisUpgrade.ts`
+ `DatasetDossier.tsx` consuming the ADR-010 slice as the D56 "tailored this view" upgrade on
[01-blueprint-opening.md](01-blueprint-opening.md) — the validated headline/actions replace the
Verdict panel's props in place, with the badge (and a "Cloud features paused" chip on the typed
503) in the Blueprint header.

## Dependencies

The Blueprint container ([01-blueprint-opening.md](01-blueprint-opening.md), the D56 upgrade
slot), the frozen producer seams (ADR-010, [`../../architecture/adr/010-ai-producer-seams.md`](../../architecture/adr/010-ai-producer-seams.md)),
the edge router + shared limiter ([`../09-edge/01-ai-router.md`](../09-edge/01-ai-router.md),
ADR-006), the DSPS structural fragment ([`../08-persistence/03-dsps-spec.md`](../08-persistence/03-dsps-spec.md)).

## Acceptance criteria

- [x] Opt-in only: with no first-run cloud/edge selection, no request reaches the edge; local-only mode never calls it (Network tab, §18) — *live browser E2E 2026-07-22: local-only session, Titanic loaded, zero requests to any `workers.dev` host captured at the network layer*
- [x] The request body carries structure only — schema/types/aggregates, **no data rows** (audited against the outbound payload) — *live E2E audited the real outbound POST: per-column fields exactly name/semanticType/physicalType/nullPercentage/cardinality; titanic cell-value canaries absent*
- [x] The Worker emits a valid ADR-010 slice; the seam validator degrades to the deterministic slice on any invariant violation (injected malformed output → deterministic) — *unit-tested (over-claiming headline, invented action → per-seam degrade); provider-side, an out-of-contract model answer throws and the endpoint echoes the baseline*
- [x] Nothing is persisted server-side: no DSPS text, narrative, or column names in KV/logs/counters (audited) — *the Worker binds no KV; the only store is the ADR-006 `RateLimiterDo` numeric counter under `synthesis:{session|ip}:` keys; zero `console.*` in edge code (grep); the metric shape makes content unrepresentable*
- [x] Kill-switch flag flipped → typed 503 → Blueprint renders "cloud features paused" and stays fully deterministic; rate limit exceeded → typed error, never a hang — *live: staging redeployed with `SYNTHESIS_KILL_SWITCH=on` → `503 {"error":"paused"}`, browser E2E showed the paused chip over the intact deterministic Verdict; redeployed off (serving re-verified). 429 path unit-tested on the shared limiter*
- [x] The deterministic Verdict paints first; the synthesis resolves as an async upgrade badge, never blocking first paint — *live E2E: deterministic headline captured on screen before the synthesis response; the validated re-phrase then replaced it in place with the "Tailored to your data" badge*
- [x] Counters recorded are numeric-only (endpoint/outcome/size/latency); no content reaches them (audited, D41) — *unit-audited (sink dump contains no column name/prose; metric keys fixed); Analytics Engine dataset optional and currently unbound (no-op)*
- [x] Eval gate: the composed narrative beats the deterministic baseline on the labeled set before the feature ships; failing it leaves the deterministic Blueprint unchanged — *`eval/synthesis/run.ts`, thresholds declared at build (headline-win ≥ 80% and actions-upgraded ≥ 80%): measured **100% / 100% (5/5 · 5/5)** live against staging, 2026-07-22; ~14 neurons/call*

## Test plan

Seam-level vitest suites with a mocked provider (the same pattern as the ai-router — no
wrangler-dev harness needed): structure-only payload assertion, malformed-output →
validator-degrade, kill-switch → typed 503, rate-limit simulation, sink audit for
structure-text leakage; provider tests for the reassembly contract (permutation violations
throw, abort settles). Client E2E (headless Chromium against the dev server + live staging
Worker): opt-in gate at the network layer, deterministic-first paint, in-place tailored
replacement + badge, paused chip on the typed 503. Network-throw degrade (`ai-down`) is
unit-tested in the client. Eval harness run (D40) on the labeled set (`npm run eval:synthesis`).

## Definition of done

The synthesis endpoint is deployed to staging on the ADR-006 shared infra; the structure-only
+ stateless-pass-through + never-stored custody audit passes; opt-in and local-only-never-calls
are verified against the Network tab; the seam validator degrades cleanly; the deterministic
Verdict is unaffected with AI off/down/uncached; the D40 eval gate is recorded. ADR-007's
routing/model/cost decision is a dependency of the router it reuses, not re-decided here.
