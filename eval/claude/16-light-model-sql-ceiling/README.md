# 16 — light-model SQL ceiling: probe harnesses

Harnesses used for Probes 3–8 of
[`16-light-model-sql-ceiling.md`](../../../_implementation/_misc/_ideation/_experiments/16-light-model-sql-ceiling.md).
Not part of the app build. Two kinds:

- **Browser HTML pages** (Probes 3–5) test Chrome's on-device Gemini Nano
  (`window.LanguageModel`, the Prompt API) or WebLLM in-tab — both only exist in a real browser
  tab, so they can't run under this repo's normal Vitest/Playwright harness or inside a sandboxed
  environment. See "Running" below.
- **Node/tsx scripts** (Probes 6–8) test local Ollama models against the same fixtures with real
  execution, no browser needed — see "Ollama scripts" below.

## Browser pages (Probes 3–5)

- **`4table-schema-probe.html`** — Probe 3. Same 4-table schema and 8 questions as the earlier
  Ollama sweep, unconstrained prose vs. `responseConstraint`-constrained output. Syntactic
  validity only (no execution check) — kept for the record, but its "8/8 valid" headline
  overstates real correctness; see Probe 4/experiment doc for why.
- **`flat-schema-probe.html`** — Probe 4. Single flat table, no joins, real DuckDB-WASM execution
  against a precomputed ground-truth value per question. The one that actually measures
  correctness, not just parseability.
- **`flat-schema-webllm-probe.html`** — Probe 5. Identical fixture, questions, and scoring to
  Probe 4, run against `Qwen3-1.7B-q4f16_1-MLC` over WebLLM in-tab instead of Nano — the
  top-VRAM candidate (~2037MB) under a raised 2GB WebLLM download budget, directly comparable to
  Probe 4's 7/8 Nano result. No `responseConstraint` equivalent exists in WebLLM, so this uses
  the app's own fence/prose `extractSql` regex instead of JSON-schema-constrained decoding.
  **Run — 8/8 execution-verified correct**, on the real MLC/WebGPU build. Needed a load retry
  loop (large multi-shard download can drop mid-transfer), `<think>` stripped from output before
  extraction (Qwen3 is a reasoning model), and `max_tokens: 2048` (512 truncated some answers
  mid-thought) — see the experiment doc for detail.
- **`4table-webllm-probe.html`** — Probe 9. Same 4-table schema/questions/gold SQL as
  `ollama4TableProbe.ts` (Probe 7, 24/24 via Ollama), run against `Qwen3-1.7B-q4f16_1-MLC` over
  WebLLM in-tab — the real-build counterpart to Probe 7, and the harder fixture Probe 5 didn't
  cover. Carries over all three of Probe 5's fixes (load retry, `<think>` stripping, 2048
  `max_tokens`) from the start. **Run — 8/8, N=1** (documented in the experiment doc). Updated
  since to run **N=3** in-page (repeats against the same loaded engine, stability summary
  rendered per question) — closing the N=1 gap flagged as the last rigor item; not yet re-run at
  N=3.
- **`one-join-webllm-probe.html`** — Probe 12. Same one-join schema (`customers`/`orders`, no
  fan-out)/questions/gold SQL as `ollamaOneJoinProbe.ts` (Probe 10, 21/24 via Ollama), run
  against `Qwen3-1.7B-q4f16_1-MLC` over WebLLM in-tab — the real-build counterpart to Probe 10,
  resolving its Ollama-proxy caveat. Runs N=3 in-page from the start. Not yet run.

## Running

All three need to be served over HTTP(S) — the Prompt API requires a secure context (and
`file://` doesn't reliably qualify), and WebLLM's model fetch needs a real origin for Cache
Storage. `flat-schema-probe.html` and `flat-schema-webllm-probe.html` also reference this repo's
own `node_modules` (DuckDB-WASM, Arrow, tslib, flatbuffers, and for the WebLLM variant,
`@mlc-ai/web-llm`) via relative paths and an import map, so they must be served **from the repo
root** so `../../../node_modules/...` resolves, and `npm install` must already have been run.

```bash
# from the repo root
python3 -m http.server 8080
```

Then open, in a real Chrome (desktop) tab:

```
http://localhost:8080/eval/claude/16-light-model-sql-ceiling/flat-schema-probe.html
http://localhost:8080/eval/claude/16-light-model-sql-ceiling/4table-schema-probe.html
http://localhost:8080/eval/claude/16-light-model-sql-ceiling/flat-schema-webllm-probe.html
http://localhost:8080/eval/claude/16-light-model-sql-ceiling/4table-webllm-probe.html
http://localhost:8080/eval/claude/16-light-model-sql-ceiling/one-join-webllm-probe.html
```

`4table-webllm-probe.html` and `one-join-webllm-probe.html` now run the question set **3 times**
against the same loaded engine per click (no reload needed between runs) and render a
per-question stability summary (stable vs. flaky, same read as the Ollama scripts' `runProbe()`)
instead of a single pass.

Click "Run probe". Results render in-page and can be copied as JSON via the button next to it.
`flat-schema-webllm-probe.html` and `4table-webllm-probe.html` need a WebGPU-capable browser/GPU
and download ~900MB-1GB of model shards on first run (cached in Cache Storage after, shared
between the two pages since they load the same model); this can take several minutes on a slow
connection, and the load button retries automatically (up to 10 attempts) if a shard drops
mid-download.

If `LanguageModel` isn't found for the Nano probes, check
`chrome://flags/#prompt-api-for-gemini-nano` or your Chrome version's current API surface — this
is a fast-moving, still-experimental browser API.

## Ollama scripts (Probes 6–8)

- **`ollamaFlatSchemaProbe.ts`** — Probe 6. Flat single-table schema, real execution vs. ground
  truth, run against a local Ollama model instead of a browser.
- **`ollama4TableProbe.ts`** — Probes 7/8. Same discipline, Probe 3's 4-table schema (rephrased
  slightly so every question has a single scalar ground truth). This is the fixture that
  discriminates by model size — see the experiment doc.
- **`probeShared.ts`** — extraction (`extractSql`, byte-identical to `toolLadder.ts`), value
  matching, the Ollama HTTP call, and a repeat-loop runner (`runProbe`) shared by both scripts
  above.

Both scripts take `[model] [repeats]` as positional CLI args (model defaults to `qwen3:1.7b`,
repeats defaults to `1`). Requires `ollama serve` running and the model already pulled:

```bash
ollama pull qwen3:1.7b
npx tsx eval/claude/16-light-model-sql-ceiling/ollamaFlatSchemaProbe.ts qwen3:1.7b 3
npx tsx eval/claude/16-light-model-sql-ceiling/ollama4TableProbe.ts qwen2.5-coder:0.5b 3
```

No HTTP server or browser needed — these run headless via `eval/duckdb/duckdb.ts`'s Node DuckDB
engine, the same one the D40 eval harness uses.
