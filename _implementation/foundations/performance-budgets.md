# Performance Budgets

**Tier: cross-cutting — every phase answers to this.**
**Master spec:** §15 (concerns/solutions), §18 (targets), §22 (per-phase gates).

## Targets (v0 + v0.5, §18)

| Metric | Target | Measured on |
| :--- | :--- | :--- |
| DuckDB-Wasm cold initialization | < 3 s | Desktop Chrome, cable connection (and < 3 s on throttled "Fast 3G" per §22) |
| CSV ingestion (50MB, ~500K rows) | < 2 s | Desktop Chrome, M1 MacBook Air |
| Parquet ingestion (50MB) | < 1 s | Desktop Chrome, M1 MacBook Air |
| Auto-profile generation | < 500 ms after ingestion | Any supported dataset size |
| SQL query (simple aggregation) | < 100 ms | Dataset < 1M rows |
| SQL query (complex join/window) | < 500 ms | Dataset < 1M rows |
| NL→SQL round trip (cloud, incl. one retry) | Baseline at build time; streaming UI keeps perceived latency low | — |
| Total JS bundle (initial load, gzipped) | < 500 KB | Excluding lazy-loaded Monaco and DuckDB |
| Peak browser memory | < 512 MB | Datasets under 50MB |

ML training targets live with the deferred modules ([`../build/11-ml/`](../build/11-ml/), §20.1).

## Standing solutions (§15)

| Concern | Solution |
| :--- | :--- |
| DuckDB blocking main thread | Dedicated Web Worker via `@duckdb/duckdb-wasm` (library default) |
| DuckDB-Wasm init size (~8MB) | Lazy-load only after a file is dropped or sample selected; progress bar during WASM compile; cache compiled module via the Cache API |
| Monaco bundle size (~2MB) | Lazy-load via `React.lazy()` + `Suspense` when the SQL tab first opens |
| Chart rendering with 10k+ points | Canvas-based rendering (D3 canvas mode) instead of SVG for scatter |
| Large file ingestion (100MB+) | Stream via `FileReader` chunks + progress; tiered fallback (§7.3) |
| AI latency (cloud mode) | Streaming responses in the chat UI; retry loop caps at 3 |
| In-browser local model coexisting with DuckDB-Wasm *(unbuilt)* | **Spike-gated (D43).** An in-browser WebLLM/WebGPU model must coexist with DuckDB-Wasm inside the ~2GB tab ceiling (§4); memory coexistence on a representative large dataset without OOM is one of the D43 spike's explicit kill criteria. No in-browser-local capability claim (or "local" harness number, §11.4) ships before the spike passes; the honestly-specced path today is localhost Ollama (out-of-process, §5.1/§11.2). |
| Device performance variance | Elapsed-time indicators on heavy ops; suggest reducing dataset if a query exceeds 5 s; disable animation-heavy features if `navigator.hardwareConcurrency < 4` (§17) |
| ML training freezing UI *(post-v1)* | Separate ML Web Worker; quantized INT8 models with download progress |

## Bundle-size gate (§22)

- [ ] Initial JS bundle (gzipped) under 500KB excluding lazy chunks
- [ ] DuckDB-Wasm chunk lazy-loaded and cached via Cache API
- [ ] Monaco chunk lazy-loaded on first SQL tab interaction

## Memory gate (§22)

- [ ] Peak memory under 512MB for datasets < 50MB (DevTools → Memory)
- [ ] Memory monitoring before ingestion (`performance.memory` / `navigator.deviceMemory`);
      auto-downgrade to sampled preview if estimated post-load memory > 70% of available (§7.3)
