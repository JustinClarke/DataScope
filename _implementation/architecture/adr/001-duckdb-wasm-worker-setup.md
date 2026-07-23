# ADR-001: DuckDB-Wasm worker setup

**Status:** Accepted — 2026-07-19. Decided from Phase-1 ingestion-spike evidence, per D18 (spike-first process).

**Referenced by:** `foundations/security-model.md`, `build/01-foundation/01-project-bootstrap.md`, `build/02-ingestion/02-duckdb.md`

## Context
Resolves how DuckDB-Wasm is initialized and hosted: worker init strategy, lazy-load, Cache API use, and COOP/COEP hosting for SharedArrayBuffer (with a single-threaded fallback where headers can't be set). Deferred to post-spike (D18) because the choice turned on measured cold-start, memory behavior, and threading-fallback results — now supplied by the Phase-1 ingestion spike (2026-07-19; verdict in master §21 and §23.1, mirrored in `../decisions.md` "Spike findings log").

## Decision
1. **Worker init & lazy-load.** Keep DuckDB-Wasm's default single-Web-Worker model — no custom worker router. **Lazy-init on ingestion *intent*** (first file drop / ingestion action), not app boot, wrapped in a **module-level singleton promise**. The singleton also guards React StrictMode's dev double-invoke, which the spike observed spawning two worker instances.
2. **Asset caching.** Rely on ordinary **HTTP caching** — serve the content-hashed `.wasm`/worker assets with a long-lived `immutable` `Cache-Control` header — rather than a hand-rolled Cache API layer. The measured warm-start gain (799 ms → 631 ms, ~21%) came mostly from V8's compiled-module code cache, not from avoiding the HTTP fetch, so a Cache API layer for the WASM bytes is unnecessary unless offline support is later required.
3. **Threading is an enhancement, not a requirement — and currently not offered at all.** Do **not** hard-gate the app on COOP/COEP. **Amended 2026-07-19 (01-file-drop build):** the `coi` (threaded) bundle is not in the app's `BUNDLES` map and is never selected, regardless of `crossOriginIsolated`. Live verification found DuckDB's CDN-hosted loadable extensions (`parquet`, `json` — required for two of the three v0 formats) fail to link under `coi` with a WASM shared-memory mismatch (`declared = 0, imported = 1`); the same extensions load and run correctly under `eh`. CSV was unaffected either way (compiled into core, no extension). Until the CDN-extension/`coi`-build incompatibility is resolved upstream, or extensions are self-hosted at a matching build, the app runs on `eh` unconditionally — correctness for Parquet/JSON outranks the threading speed bonus. Revisit `coi` (see Backlog).
4. **Asset loading & version pin.** Bundle all DuckDB assets **same-origin** (Vite `?url` imports) and load the worker as an ordinary same-origin `Worker` (not a `blob:` worker), so `COEP: require-corp` never blocks a CDN-fetched `.wasm` and `worker-src` needs only `'self'` (§23.1). **Pin an explicit stable `@duckdb/duckdb-wasm` version** (1.32.0 at decision time) — bare `latest` resolves to a dev prerelease (`1.33.1-dev57.0`).

## Alternatives considered
- **Hard-gate on COOP/COEP (threaded-only).** Rejected: the spike showed the headerless path falls back to `eh` (single-threaded, WASM exception handling) — *fully functional*, not the degraded baseline `mvp` — so gating would refuse a working configuration. Threading is a query-time win on large files only, not a correctness requirement.
- **Custom worker router / worker pool.** Rejected for v0: the default single-worker model met the <3 s cold-start and interactive-query bars; a pool is unjustified complexity absent evidence.
- **Hand-rolled Cache API layer for the WASM bytes.** Deferred: unnecessary given HTTP `immutable` caching plus V8's code cache; revisit only if offline support is required.
- **`blob:` workers and CDN asset loading (`getJsDelivrBundles()`).** Rejected: a CDN `.wasm` under `COEP: require-corp` risks being blocked as a cross-origin subresource lacking CORP; same-origin bundling avoids it and keeps CSP `worker-src` narrow.
- **Eager worker init at app boot.** Rejected: adds startup cost to sessions that may never ingest; lazy-on-intent keeps first paint cheap.

## Consequences
- The app works with **no special headers** (single-threaded `eh`), keeping the D50 self-host zip and header-constrained hosts viable; threading is a bonus where COOP/COEP can be set.
- Cold-start is within budget (799 ms cold / 631 ms warm, production build, headers on; every measured path under the <3 s target) but is **compile-bound over localhost** — a real deployment adds the ~7.8 MB-gzip threaded-bundle download atop the ~0.6–0.8 s compile floor, so served bundle size and its cache headers are load-bearing for first-visit latency.
- Worker-side data memory must be instrumented with `duckdb_memory()` or `performance.measureUserAgentSpecificMemory()`, never main-thread `performance.memory` (§15 budgets) — the spike found the latter useless for this.
- Threading materially helps only heavy operations on large files; the size-cap-in-degraded-state guidance (Decision 3) is the lever for the no-headers case.

**Unverified — do not read broader coverage into this ADR:** only headless Chromium was exercised — **no Firefox or Safari** (Safari has known COOP/COEP/SharedArrayBuffer quirks, moot for now since `coi` is unused, but relevant again if `coi` is revived); all timing was over **localhost** (no real-network/throttled measurement, no CDN); and **no OOM or >50 MB** behavior was probed. **Parquet now exercised (2026-07-19, 01-file-drop):** works correctly under `eh`; the `coi` incompatibility above is why it's the only bundle offered.

**Backlog:** investigate self-hosting the `parquet`/`json` extension `.wasm` binaries same-origin (mirroring the core-bundle approach in Decision 4) at a build matching this package's pinned core, which would remove the CDN-version dependency entirely and might resolve the `coi` mismatch — would restore the threading speed bonus for large-file aggregation. Not scoped to any current checklist item.

## Spike evidence
Phase-1 ingestion spike, 2026-07-19 — **GO**. Full finding in `../decisions.md` "Spike findings log" and master §21 (verdict) / §23.1 (CSP worker-loading). Headline numbers: COOP/COEP confirmed but non-blocking (headerless → `eh`, functional); cold-start 799 ms cold / 631 ms warm (`coi`, production); threaded vs single-threaded on a 50.7 MB / 1.24 M-row CSV — ingest 1.8× (240 vs 426 ms), SUMMARIZE 3.1× (262 vs 800 ms); ~87 MB DuckDB engine memory (~1.7× on-disk, via `duckdb_memory()`). Disposable harness; full numbers in the spike scratchpad.
