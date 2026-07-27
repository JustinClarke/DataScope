# ADR-007: AI routing

**Status:** **Accepted.** Two decisions recorded here: (1) the **D43 local-model spike verdict**
(GO, 2026-07-21; Decision + four constraints below), which opens the v0.25 WebLLM-handoff hard gate;
and (2) the **cloud NL→SQL model + its neurons-per-turn cost** (2026-07-22; the AI-router section
below), recorded as the `build/09-edge/01-ai-router` work lands. The remaining pieces of the
"decision proper" are **settled by prior builds, not re-opened here:** the tool-use loop shape is
built (`build/06-ai/01-pipeline`, the six-stage loop), the provider abstraction is the frozen
`AIProvider` interface (`src/types/ai.ts`), and BYOK **pass-through vs. vault** custody is D9
(default browser-memory pass-through; opt-in vault). This ADR now records the model/cost decision
those builds deferred to it.

**Referenced by:** `build/09-edge/01-ai-router.md`, `build/v0.25/03-webllm-handoff.md` (the D43
verdict is that build's **hard gate**).

> **Pending amendment request (raised 2026-07-26, not yet decided — no part of this ADR has
> changed).** A **Settings model-rating pane** is wanted: several WebLLM models offered for
> download, each with an estimated accuracy, so the user picks the trade-off. That runs into two
> constraints below and cannot proceed without amending this ADR. **Constraint 1** pins exactly
> one model precisely because it is the one measured to coexist with DuckDB-Wasm — the 3B options
> are recorded here as *unverified on 8 GB* — so a chooser means probing each offered model
> against the D43 coexistence criterion. **Constraint 4** forbids an unearned accuracy claim: the
> existing 92% is a simple-schema floor on a seeded single-table set with no cloud head-to-head,
> and **a per-model percentage rendered in Settings is exactly the kind of number D40 gates**, so
> each model needs its own eval run and the figure must carry its scope, never appear bare. The
> D70 download-confirm — currently *the* single WebLLM consent gate for one ~830 MB pull — also
> needs re-reading against a repeatable, multi-size download choice. Recorded as item C in
> [`../../build/14-workspace-streamline/00-synthesis-and-limits-probe.md`](../../build/14-workspace-streamline/00-synthesis-and-limits-probe.md);
> it blocks nothing in v0.70.

## Context
Resolves AI routing: the tool-use loop shape, the provider abstraction, and BYOK pass-through vs. vault. Must record the chosen NL→SQL model **with its neurons-per-turn cost**, since that sets the effective size of the shared free Workers-AI pool (§11.2). Deferred to Phase-4 AI-router work, when the model choice and its measured cost are known.

**Local-model guardrail (D43).** This ADR also records the **D43 local-model spike verdict**. The honestly-specced local path was localhost Ollama (user-deployed); in-browser WebLLM/WebGPU was unbuilt and unscoped pending this spike. Before any local-model capability claim (CV, marketing, or a "local" column in the D40 eval harness), a D18-style throwaway spike had to pass explicit kill criteria: (a) memory coexistence with DuckDB-Wasm on a representative large dataset without OOM, (b) a documented SQL-generation quality floor vs. cloud, (c) acceptable model-download UX. The pass/fail verdict is recorded here; the D40 harness may report a "local" number only for a path that passed.

## Decision — D43 local-model spike: **GO**
In-browser WebLLM/WebGPU **passes** the D43 kill criteria and is no longer "unbuilt and unscoped."
The shipped local model is **`Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC`** (829 MB encoded download /
~1.6 GB VRAM). WebLLM enters as a **client-side provider behind the existing provider abstraction**
and **progressive enhancement** over the edge/BYOK conversational engine — **not** a new NL→SQL
pipeline. This unblocks the v0.25 WebLLM client handoff (`build/v0.25/03-webllm-handoff.md`). A
local-capability claim is now permitted **only within the four constraints below**.

### The four constraints (fold into the v0.25 handoff build)
1. **Pin the small coder — Qwen2.5-Coder-1.5B q4f16.** This is the model verified to coexist with
   DuckDB-Wasm; the 3B options (~2.5 GB VRAM) are **unverified on an 8 GB machine** and out of budget
   pending their own probe. 0.5B is available as a lower-footprint fallback (~945 MB VRAM).
2. **Worker engine mandatory.** Model load caused main-thread jank (`maxFrameGapMs` ~474–556 ms); the
   engine must run in `src/workers/webllm.worker.ts` (already specified in the handoff doc), never on
   the main thread.
3. **Resumable/retrying download mandatory.** The MLC/HuggingFace CDN drops the connection roughly
   every ~3 shards (surfaces as `Failed to fetch` / `Cache.add()` network error — **not** a COEP
   block; shards do land). Getting all 30 shards down required a resumable retry loop that resumes
   from Cache Storage with a 30-attempt ceiling. Ship the download this way, off the first-paint path.
4. **Quality is a simple-schema floor with no measured cloud head-to-head.** The 11/12 (92 %) number
   is on a seeded single-table set; no BYOK key was available, so "vs. cloud" is by citation only. The
   **D40 eval harness still gates any "local" claim** (CV, marketing, or a "local" column), and must
   watch the **aggregate-then-rank** failure mode (the one miss wrote `ORDER BY amount DESC LIMIT 1`
   instead of `GROUP BY … SUM(amount)`).

### Cloud model / neurons-per-turn — **decided (2026-07-22)**
WebLLM is **zero-egress**, so it consumes **no** Workers-AI shared pool — its cost is **N/A for the
§11.2 pool sizing**. The neurons-per-turn cost that sizes the free pool is the **cloud**-router
concern; it is decided here, grounded in a direct re-check of Cloudflare's live model + pricing pages
(retrieved 2026-07-22).

**Default cloud NL→SQL model: `@cf/mistralai/mistral-small-3.1-24b-instruct`** (Cloudflare Workers AI).

> **Correction (2026-07-22, on the first live D40 cloud eval).** The default was first recorded as
> `@cf/qwen/qwen2.5-coder-32b-instruct` on the belief its tool/function-calling was confirmable (the
> `tool_calls` field *appears in its output schema*). Against the live staging Worker, the code-specialized
> Qwen **does not populate `tool_calls`** — it free-texts the call as prose (a pseudo-JSON blob in
> `response`), leaving `tool_calls` empty. That breaks the `execute_local_sql` tool-use loop (§11.1): the
> D40 cloud-edge eval scored **0/58** on it. A schema field for tool calls is not the same as the model
> emitting them; that distinction is the lesson. This is the displacement the "open follow-up" below
> anticipated — a one-line model-id swap (plus one small adapter fix, next paragraph), not a redesign.

- **Why this one:** empirically, across Workers-AI text models probed with the exact `execute_local_sql`
  tool (direct `env.AI.run` through a throwaway Worker, since the account token lacks REST Workers-AI
  scope), **Mistral Small 3.1 reliably populates structured `tool_calls`** and produces correct,
  DuckDB/Postgres-dialect SQL (double-quoted identifiers, proper multi-table JOINs) at representative
  size. `llama-3.3-70b` also tool-called but **hallucinated the schema** (`SUM(revenue)`, a `year`
  column, no joins); `qwen3-30b-a3b` was correct but a **reasoning** model (≈700 completion tokens/turn
  → latency + cost bloat for an interactive loop); `hermes-2-pro-mistral-7b` is **deprecated (2026-05-30)**;
  `gpt-oss-20b` free-texted like the Qwen coder. Mistral Small 3.1 also returns **real `usage.neurons`**
  (better D41 cost telemetry) and carries a **128K** context (more headroom than the coder's 32K, which
  matters since schema-pruning can exceed 32K on a wide schema).
- **One required adapter fix (in `edge/adapters.ts`, not the router):** Mistral rejects a tool-call id
  that isn't exactly 9 chars of `[a-zA-Z0-9]` when the id is echoed back on the tool result. The adapter
  previously emitted a fixed `call_0` (also colliding across retry attempts); it now generates a fresh
  9-char alphanumeric id per call. Verified end-to-end: the two-turn loop (tool call → result → text
  answer) terminates cleanly.
- **Neurons-per-turn (the pool-sizing figure §11.2 owes) — now measured, not estimated:** at a
  representative schema-pruned prompt Mistral Small 3.1 reported **~37 neurons at ~990 input + ~113
  output tokens** (`usage.neurons`, read live). Scaled to the ADR's reference **~1,500 input + ~300
  output**, that is **≈ 63 neurons/turn** — mistral prices roughly *half* the per-token rate the Qwen
  coder estimate assumed, so the free pool is larger than first recorded.
- **What that means for the pool (the reason §11.2's framing is not marketing gloss):** the free
  allocation is **10,000 neurons/day, account-wide, shared across all Workers-AI usage** — so at
  ~63 neurons/turn the *entire account* free budget is **≈ 160 NL→SQL turns/day**. At §11.2's launch
  default of **20 Workers-AI turns/session/day**, roughly **eight active sessions exhaust the whole
  free pool for the UTC day.** Cheaper per turn than the earlier figure, but the §11.2 reality is
  unchanged: a **shared, exhaustible, demo-scale free budget, not a per-user allowance** — which is why
  the shared-budget-exhausted client state and the BYOK/local overflow stay load-bearing, not polish.
- **D40 eval result (first real cloud numbers, 2026-07-22, 58-question §14 set, live staging Worker):**
  Mistral Small 3.1 scored **98.3% exec-rate / 82.8% result-correctness / 100% repair-rate** — clearing
  every §11.4 threshold (≥90% / ≥75% / ≥50%). The plumbing-check mock-cloud is 100%/100% by construction;
  WebLLM (local) 93.1%/72.4%; the no-LLM template floor 67.2%/19.0%.
- **Under-account ceilings the router sits below:** Workers-AI Text Generation rate limit **300
  req/min base** (per-model overrides 150–1,500; design against 300 as the floor). The router's own
  §11.2 per-session limits (**20 Workers-AI turns/session/day**, **10 req/min/session**) sit well
  inside this.

**Confidence & open follow-up.** High confidence — the tool-calling behavior, SQL quality, neuron cost,
and the 98.3%/82.8% eval are all **measured against the live Worker**, not quoted from a docs page (the
correction above is exactly why a docs-page claim is no longer trusted on its own). Streaming for a text
answer (§15) is not yet exercised end-to-end: the Workers-AI adapter is deliberately non-streaming (one
`env.AI.run` per turn), so SSE support is not load-bearing today. If a future model is confirmed **by the
same live-tool probe** with correct SQL, structured `tool_calls`, a larger context, and comparable neuron
cost, it displaces this default; the provider abstraction (below) keeps that a one-line model-id swap.

**BYOK provider abstraction.** Cloud providers sit behind one `InferenceProvider` seam in the router
(Workers AI, and BYOK OpenAI/Anthropic/etc.), selected per request by the D3 routing toggle. The
model id above is the Workers-AI default only; a BYOK request names its own provider + model and never
touches the shared pool.

## Alternatives considered
- **Model size — 0.5B / 1.5B / 3B coder ladder.** 0.5B (944–1060 MB VRAM, low-resource) is smaller
  and faster but weaker on SQL; 3B (2504–2894 MB) is stronger but erodes the shared ~2 GB tab /
  4 GB GPU-buffer headroom beside DuckDB-Wasm and was **not** verified on 8 GB. **1.5B q4f16
  (1630 MB) chosen** as the quality/footprint balance actually measured to coexist. The q4f32 1.5B
  variant (1889 MB) buys marginal quality for ~260 MB more — not chosen.
- **No local path (edge/BYOK only).** Rejected — forgoes the D2/D70 zero-egress "take it further";
  the spike shows in-browser inference is viable within the constraints.
- **localhost Ollama only (status quo ante).** Still supported, but no longer the *only*
  honestly-specced local path.
- **Main-thread engine.** Rejected by constraint (2) — measured load jank.

## Consequences
- The v0.25 WebLLM-handoff **hard gate is open** (`build/v0.25/03-webllm-handoff.md`); the build may
  proceed within the four constraints.
- The **D40 harness may report a "local" number** for this path, honestly labeled; D40 remains the
  gate on any comparative "local vs. cloud" claim.
- The **edge/BYOK path stays the conversational engine**; WebLLM takes over only once warm and
  degrades edge → deterministic on any failure (WebGPU absent, download incomplete, low memory).
- **Cold-download UX and cross-browser / low-VRAM behavior remain open** (spike was Chromium +
  WebGPU-present + Apple-M1/8 GB + localhost only) — verify before a general local claim.
- The **AI-routing decision proper** was untouched by *this D43 verdict*; it is now recorded above
  (the cloud model + neurons-per-turn, 2026-07-22) and settled by prior builds (loop shape, provider
  abstraction, D9 pass-through vs. vault), as the router work (`build/09-edge/01`) lands.

## Spike evidence
*WebLLM local-model spike (2026-07-21 — GO). Disposable Vite + WebLLM + DuckDB-Wasm harness in the
sibling `spike-webllm/` (thrown away, outside the doc tree; full verdict in
`spike-webllm/SPIKE-FINDINGS.md`, raw numbers in `spike-webllm/SPIKE-RESULTS.json`). Machine: Apple
M1, 8 GB RAM (making criterion (a) real), Chrome 150, WebGPU present (`apple/metal-3`, 4 GB
maxBuffer). Model `Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC`.*

- **(a) Memory coexistence — PASS, no OOM (`crashed:false`).** The ~1.6 GB model resident on the
  Metal GPU **and** `large.csv` in DuckDB (1,240,000 rows × 6 cols; register 20 ms / ingest 244 ms)
  **and** a full-scan `count(*)` over 1.24 M rows (3 ms, correct) **and** a real inference (1056 ms)
  all lived in one tab. `measureUserAgentSpecificMemory` (JS+WASM, **not** GPU) rose 828 MB →
  1038 MB across ingest+infer; DuckDB WASM heap 87 MB (matches the ingestion spike for this file).
  Footprint ≈ ~1.04 GB JS/WASM + ~1.6 GB GPU weights ≈ ~2.6 GB on an 8 GB machine.
- **(b) SQL quality — 11/12 (92 %) execution-match** on a 12-item labeled NL→SQL set (seeded 240-row
  `sales` schema; result-set match against a reference SQL, order-insensitive/rounded — a number, not
  a vibe). Inference 0.5–1.2 s/query after a ~2.5 s cold first token. The one miss: "which product has
  the highest **total** sales" → `SELECT product FROM sales ORDER BY amount DESC LIMIT 1` (no
  `GROUP BY sum(amount)`) → P4 vs. expected P1 — a genuine small-coder aggregation weakness. **Caveat:
  simple schema, no measured cloud head-to-head** (no BYOK key) — "vs. cloud" is by citation; the
  fuller D40 eval must confirm before any "local" column.
- **(c) Download UX.** 829 MB encoded across 30 shards; **warm (fully-cached) load-to-ready ~2.6 s**
  with smooth progress reporting (33 events, first at ~554 ms). Main-thread `maxFrameGapMs`
  ~474–556 ms during load → **Worker engine required** (constraint 2). Byte counter read 0 (CDN sends
  no `Timing-Allow-Origin`), so 829 MB is from WebLLM's progress text; the **cold network download was
  not timed** (this run was warm from `spike-webllm/.chrome-profile/` cache).
- **Load-bearing hosting/repro findings.** COEP **`credentialless`** (not `require-corp`) so the
  cross-origin CDN model fetch loads while `crossOriginIsolated` stays true for threaded DuckDB;
  resumable retry loop resuming from Cache Storage (constraint 3); WebGPU is **headed-only** (headless
  silently falls back to SwiftShader software → meaningless perf/memory); on macOS use plain
  `--enable-unsafe-webgpu` (no Vulkan/ANGLE-metal flags).
- **Unverified (honest limits).** Chromium only (no Safari/Firefox WebGPU run); WebGPU-present, 4 GB
  maxBuffer, 8 GB-RAM single machine (no low-VRAM / WebGPU-absent device); cold/throttled first-run
  download UX; OOM stress beyond 1.24 M rows; 3B model coexistence; cloud head-to-head quality.
