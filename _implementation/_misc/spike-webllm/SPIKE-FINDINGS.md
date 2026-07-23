# WebLLM local-model spike — findings

**Verdict: GO (2026-07-21).** All three D43 kill criteria pass. In-browser WebLLM/WebGPU is no
longer "unbuilt and unscoped"; it enters as a **client-side provider behind the existing provider
abstraction** and **progressive enhancement** over the edge/BYOK conversational engine — not a new
NL→SQL pipeline. Verdict recorded in `../_implementation/architecture/adr/007-ai-routing.md`
(ADR-007) and the `decisions.md` Spike findings log; mirrored into master §11.2 + §5.1 and
`foundations/privacy-model.md`; the hard gate on `build/v0.25/03-webllm-handoff.md` is cleared.

**Purpose.** De-risk the D43 guardrail empirically before permitting any local-model capability
claim (CV, marketing, or a "local" column in the D40 eval harness): (a) memory coexistence with
DuckDB-Wasm on a large dataset without OOM, (b) a documented SQL-generation quality floor vs. cloud,
(c) acceptable model-download UX.

## Test environment

- **Machine: Apple M1, 8 GB RAM.** The 8 GB ceiling is what makes criterion (a) a real test rather
  than a formality — the model weights and DuckDB-Wasm share one constrained tab.
- **Browser: Chrome 150** (`channel:'chrome'`), headed. WebGPU adapter `apple/metal-3`, 4 GB
  `maxBufferSize`. **WebGPU is headed-only** — headless silently falls back to SwiftShader (1 GB,
  software), which would yield meaningless perf/memory numbers.
- **Model: `Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC`** — 829 MB encoded download (30 shards),
  ~1.6 GB VRAM. Enumerated coder ladder also offers 0.5B @ ~945 MB and 3B @ ~2505 MB VRAM.
- Harness: disposable Vite + `@mlc-ai/web-llm` + `@duckdb/duckdb-wasm`, run via Playwright-driven
  headed Chrome (`run.mjs`). Raw results in `SPIKE-RESULTS.json`. Model shards cached in
  `.chrome-profile/` (~2 GB) so reruns are warm.

**Confidence:** every number below is from actually running the harness on this machine, not
estimated.

## (a) Memory coexistence — PASS, no OOM

`crashed: false`. Resident simultaneously in one tab, no OOM:

- the ~1.6 GB model on the Metal GPU;
- `large.csv` ingested into DuckDB — **1,240,000 rows × 6 cols**, register 20 ms / ingest 244 ms;
- a full-scan `count(*)` over all 1.24 M rows — 3 ms, correct;
- a real WebLLM inference — 1056 ms.

`measureUserAgentSpecificMemory` (JS + WASM heap, **not** GPU) rose **828 MB → 1038 MB** across
ingest + infer; DuckDB WASM heap settled at **87 MB** (matches the ingestion spike's ~87 MB for this
exact file). Total footprint ≈ ~1.04 GB JS/WASM + ~1.6 GB GPU weights ≈ **~2.6 GB on an 8 GB
machine** — headroom exists but is not generous, which is the basis for constraint (1).

## (b) SQL-generation quality — 11/12 (92 %) execution-match

Twelve labeled NL→SQL items over a seeded 240-row single-table `sales` schema; each generated query
executed and scored by **result-set match** against a reference SQL (order-insensitive, rounded) — a
number, not a vibe. **11 passed.** Per-query inference 0.5–1.2 s after a ~2.5 s cold first token.

The one miss: *"Which product has the highest **total** sales amount?"* → the model wrote
`SELECT product FROM sales ORDER BY amount DESC LIMIT 1` (ordered the raw column, no
`GROUP BY sum(amount)`) → returned **P4 vs. expected P1**. A genuine small-coder **aggregate-then-
rank** weakness, not a tie or harness artifact.

**Caveat — this is a floor, not a cloud comparison.** The schema is simple and **no BYOK key was
available**, so "vs. cloud" is by citation only. The fuller D40 eval must confirm before any "local"
column claim (D43 already requires this); it should watch the aggregate-in-`ORDER BY` failure mode.

## (c) Model-download UX — acceptable (warm), with caveats

829 MB encoded across 30 shards. **Warm (fully-cached) load-to-ready ~2.6 s** with smooth progress
reporting (33 progress events, first at ~554 ms). Main-thread `maxFrameGapMs` **~474–556 ms** during
load → the production engine **must run in a Worker** (`src/workers/webllm.worker.ts`), not on the
main thread.

Two honesty caveats: the resource-timing byte counter read 0 (the CDN sends no `Timing-Allow-Origin`),
so the 829 MB figure comes from WebLLM's own progress text; and **the cold network download was not
timed** — this run loaded warm from `.chrome-profile/` cache. Cold/throttled first-run UX is unverified.

## The four carry-over constraints (folded into ADR-007 + the v0.25 handoff build)

1. **Pin the small coder — Qwen2.5-Coder-1.5B q4f16.** Larger models (3B @ ~2.5 GB VRAM) are
   **unverified on 8 GB** and out of budget pending their own probe; 0.5B (~945 MB) is a
   lower-footprint fallback.
2. **Worker engine mandatory** — main-thread load jank (`maxFrameGapMs` ~474–556 ms).
3. **Resumable/retrying download mandatory** — the MLC/HuggingFace CDN drops the connection roughly
   **every ~3 shards** (surfaces as `Failed to fetch` / `Cache.add()` network error — **not** a COEP
   block; shards do land). The fix that got all 30 down: a resumable retry loop that resumes from
   Cache Storage, 30-attempt ceiling.
4. **Quality is a simple-schema floor with no measured cloud head-to-head** — the **D40 eval gates
   any "local" claim**, watching the aggregate-then-rank failure mode.

## Load-bearing hosting / reproduction findings

- **COEP `credentialless`** (not `require-corp`) so WebLLM's cross-origin CDN model fetch loads while
  `crossOriginIsolated` stays true for threaded DuckDB.
- **WebGPU is headed-only.** Use real Chrome (`channel:'chrome'`) or a *headed* Playwright chromium
  for a real `apple/metal-3` adapter; headless → SwiftShader software fallback.
- `navigator.gpu` is `[SecureContext]`-gated — probe over `http://localhost`/https, not `about:blank`.
- On macOS use plain `--enable-unsafe-webgpu`; do **not** pass `--enable-features=Vulkan` /
  `--use-angle=metal` (no Vulkan on Mac; they break GPU init).
- Node **22** required (`/opt/homebrew/opt/node@22/bin`); Vite must bind **`127.0.0.1`** (bare
  `localhost` resolves to IPv6 `::1` first on macOS and the driver's IPv4 port-wait misses it).

## Cloud model / neurons-per-turn — not decided here

WebLLM is **zero-egress**, so it consumes **no** Workers-AI shared pool — **N/A for §11.2 pool
sizing**. The neurons-per-turn cost that sizes the free pool is a **cloud**-router concern, still
owed by the 06-ai provider-routing work.

## What could NOT be verified (honest limits)

Chromium only (no Safari/Firefox WebGPU run); WebGPU-present, 4 GB maxBuffer, single 8 GB machine (no
low-VRAM / WebGPU-absent device); cold/throttled first-run download UX; OOM stress beyond 1.24 M
rows; 3B model coexistence; measured cloud head-to-head quality. The graceful-degradation ladder
(WebGPU absent / download incomplete / low memory → edge synthesis → deterministic Verdict) is
therefore mandatory, and a pre-launch cross-browser + low-VRAM check is required before a general
local-capability claim.

## How to reproduce

```
cd spike-webllm
PATH=/opt/homebrew/opt/node@22/bin:$PATH node run.mjs    # headed Chrome window opens, full run → SPIKE-RESULTS.json
node smoke.mjs                                            # cheap no-model-load preflight
```
