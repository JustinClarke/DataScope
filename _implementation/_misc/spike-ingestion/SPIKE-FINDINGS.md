# DuckDB-Wasm ingestion spike — findings

**Purpose.** De-risk three empirical assumptions before an architecture decision
about in-browser file ingestion powered by DuckDB-Wasm:

1. COOP/COEP hosting requirements for `SharedArrayBuffer` (needed by the threaded build).
2. DuckDB-Wasm cold-start and memory behavior on real hardware.
3. Whether the single-threaded fallback works when COOP/COEP headers are absent.

The harness in this directory is disposable; only the measured numbers below matter.

---

## Test environment

| Item | Value |
| :--- | :--- |
| Machine | macOS (Darwin 24.6.0), Apple Silicon (arm64) |
| Node | v24.14.0, npm 11.9.0 |
| Browser (all browser runs) | Headless Chromium **149.0.7827.55** (Playwright browser build 1228) |
| DuckDB-Wasm | **1.32.0** (pinned; see version gotcha below) |
| apache-arrow (transitive) | ^17.0.0 |
| Dev/preview server | Vite 6.4.3 |
| Small fixture | `fixtures/small.csv` — 20,000 rows, 6 cols, 0.79 MB |
| Large fixture | `fixtures/large.csv` — 1,240,000 rows, 6 cols, 50.7 MB |

Columns in both fixtures: `id` (int), `created` (date), `category` (string),
`price` (float), `qty` (int), `name` (string).

**Confidence:** every number below is from actually running headless Chromium
(Playwright) against the Vite server and reading values back out of the live
page — not estimates or Node-only timings. Caveats and non-verified items are in
the last section.

---

## 1. COOP/COEP requirement — CONFIRMED, and fallback is graceful

Two servers were driven through the identical flow: one sending
`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`,
one sending neither. Headers were confirmed present/absent with `curl -I` and the
in-browser `crossOriginIsolated` flag.

| Signal | With COOP/COEP | Without COOP/COEP |
| :--- | :--- | :--- |
| `crossOriginIsolated` | **true** | **false** |
| `SharedArrayBuffer` defined | **true** | **false** |
| `wasmThreads` feature | true | false |
| Bundle auto-selected | **`coi`** (multi-threaded) | **`eh`** (single-threaded) |
| Ingestion + queries work | yes | **yes** |

**Key correction to the common framing.** The fallback is **not** the MVP bundle.
DuckDB ships three builds — `mvp` (baseline), `eh` (single-threaded + WASM
exception handling), and `coi` (cross-origin-isolated, multi-threaded / pthreads).
`selectBundle()` picks `coi` only when `crossOriginIsolated` is true; otherwise it
picks `eh` (because modern Chromium reports `wasmExceptions: true`). MVP is only
selected on browsers lacking WASM exception handling (ancient). So on any current
browser the "no-headers" path lands on **`eh`, single-threaded but fully
functional** — a graceful degrade, not a break. No error, no hard failure.

The threaded build's only observed advantage is speed on heavy operations over the
large file (see section 4). There is no correctness or capability difference for the
count/SUMMARIZE flow tested.

**COEP gotcha worth flagging:** `require-corp` also blocks *any* cross-origin
subresource that lacks CORP/CORS (images, fonts, third-party scripts, and —
critically — WASM fetched from a CDN). This harness sidesteps it by serving the
`.wasm`/worker files from its own origin (Vite `?url` imports). If you instead use
DuckDB's documented `getJsDelivrBundles()` default, the jsDelivr CDN must return a
compatible `Cross-Origin-Resource-Policy`/CORS response or the WASM load is blocked
under COEP. Same-origin bundling is the safer default when isolation is on.

---

## 2. Cold-start timing — CONFIRMED well under the < 3 s target

Cold init = `selectBundle` + worker spawn + WASM fetch + compile + instantiate,
measured with `performance.now()` around `db.instantiate(...)`.

| Scenario | Bundle | Cold init | Warm init (2nd load) |
| :--- | :--- | ---: | ---: |
| Dev server, headers (`coi`) | coi | **1314 ms** | 1161 ms |
| Dev server, no headers (`eh`) | eh | **517 ms** | — |
| **Production build** (preview, headers, `coi`) | coi | **799 ms** | **631 ms** |

Every path is comfortably under 3 s — the worst case measured (dev-mode threaded)
was 1.31 s, and the production build was ~0.8 s cold / ~0.63 s warm.

Two non-obvious observations:

- **Single-threaded init is *faster* than threaded** (517 ms vs 1314 ms in dev).
  Spawning the pthread workers and wiring up `SharedArrayBuffer` memory adds
  startup cost that the `eh` build skips. Threading is a query-time win, not a
  startup win.
- **Cold-start here is compute-bound (WASM compile), not network-bound.** All runs
  were over localhost, where fetching the 34 MB `.wasm` is near-instant. The ~0.8–1.3 s
  is dominated by compiling/instantiating the module. On a real network you must add
  the download of the compressed WASM (see asset sizes in section 5) on top of this compile
  floor.

### Warm-cache behavior (Cache API / HTTP cache)

Warm = second page load in the same browser context. Improvement was modest
(1314→1161 ms dev; 799→631 ms prod, ~15–21%). Reason: the Vite dev **and** preview
servers both send `Cache-Control: no-cache` on the WASM assets (preview adds an
ETag, so the reload does a conditional `304` and reuses bytes). Because cold-start
is compile-bound on localhost, avoiding the re-fetch saves relatively little; the
residual warm win is mostly V8's compiled-module code cache, not HTTP caching.

**Caveat:** neither Vite server is representative of production caching. A real
static host (Cloudflare Pages / Netlify / Vercel) serves the content-hashed
`/assets/*.wasm` with `Cache-Control: public, max-age=31536000, immutable`, which
eliminates the re-fetch entirely on repeat visits. That matters most on slow
networks where the ~7.8 MB gzip download dominates; it does **not** remove the
~0.6–0.8 s compile floor.

---

## 3. Memory behavior on the larger file

| Signal | Small (0.79 MB) | Large (50.7 MB) |
| :--- | ---: | ---: |
| `duckdb_memory()` engine total (threaded) | 3.28 MB | **86.9 MB** |
| `duckdb_memory()` engine total (single-thr.) | 3.28 MB | 81.9 MB |
| `performance.memory.usedJSHeapSize` before | 11.9 MB | 11.9 MB |
| `performance.memory.usedJSHeapSize` after | 11.9 MB | 11.9 MB |

**The main-thread `performance.memory` is useless as a data-load probe here**, and
this is itself a finding: it reported a flat, quantized `11,900,000` in every run,
before and after loading 50 MB. Two reasons — (a) DuckDB's data lives in the *worker
thread's* WebAssembly heap, which the main-thread `performance.memory` does not see;
and (b) Chrome quantizes and caches `performance.memory` (≈100 KB granularity, ~30 s
cache) specifically to defeat fingerprinting. Do not use it for real memory
accounting.

The trustworthy signal is **DuckDB's own `duckdb_memory()`** table function:
loading the 50.7 MB CSV (1.24 M rows) into a materialized table cost **~87 MB** of
engine memory — i.e. roughly 1.7× the on-disk CSV size once parsed into DuckDB's
columnar format. That is a sane, bounded ratio.

For precise cross-thread totals in production, `performance.measureUserAgentSpecificMemory()`
is available (it requires `crossOriginIsolated`, which was `true` here) and would
capture the worker's WASM heap — but it is async and coarse. It was not wired into
this harness; `duckdb_memory()` was sufficient and direct.

---

## 4. Query round-trip timings (threaded vs single-threaded)

All times are `performance.now()` deltas around the individual `conn.query(...)` calls.

| Step | Small — threaded | Small — single | Large — threaded | Large — single |
| :--- | ---: | ---: | ---: | ---: |
| `registerFileBuffer` | 60.3 ms | 55.2 ms | 11.3 ms | 9.0 ms |
| ingest (`CREATE TABLE AS read_csv_auto`) | 118.1 ms | 101.0 ms | **239.8 ms** | **425.7 ms** |
| `SELECT count(*)` | 8.6 ms | 6.6 ms | 6.3 ms | 4.7 ms |
| `SUMMARIZE` | 36.9 ms | 34.5 ms | **262.0 ms** | **799.6 ms** |

- The whole large-file flow (register + ingest + count + summarize) is **~520 ms
  threaded** / **~1240 ms single-threaded** — both interactive.
- **Threading helps only the heavy operations on the large file:** ~1.8× on ingest,
  ~3.0× on SUMMARIZE. On the small file the difference is within noise. `count(*)`
  is trivial on a materialized table either way.
- `registerFileBuffer` is a cheap zero-copy handoff (9–11 ms for 50 MB); it is not a
  bottleneck.

---

## 5. DuckDB-Wasm gotchas / surprises

1. **`latest` on npm is a *dev build*.** `npm view @duckdb/duckdb-wasm dist-tags`
   returns `latest: 1.33.1-dev57.0` (a prerelease, published 2026-06-22). The newest
   **stable** release is **`1.32.0`** (2025-12-16). A naive `npm install @duckdb/duckdb-wasm`
   pulls the prerelease. This project pins `1.32.0` exactly. **Recommendation: always
   pin an explicit stable version**; do not float on `latest`.

2. **Three bundles, ~34–39 MB each, ~138 MB on disk.** Raw / gzip transfer sizes
   from the production build:

   | Bundle | `.wasm` raw | `.wasm` gzip | worker JS |
   | :--- | ---: | ---: | ---: |
   | coi (threaded) | 34.0 MB | **7.78 MB** | 0.89 MB + 0.67 MB pthread |
   | eh (single) | 34.2 MB | 7.71 MB | 0.77 MB |
   | mvp (baseline) | 39.4 MB | 8.78 MB | 0.84 MB |

   Only the selected bundle is fetched at runtime, but all three are emitted into
   the build output. The real over-the-wire cost of a cold load is ~7.8 MB gzip for
   the threaded build.

3. **CDN default vs COEP conflict** (see section 1) — the documented `getJsDelivrBundles()`
   path can be blocked by `COEP: require-corp`. Same-origin `?url` bundling avoids it.

4. **Vite dependency optimizer breaks the workers** if it pre-bundles the package.
   `optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] }` is set as a safeguard.

5. **React StrictMode double-invokes init in dev.** The init effect runs twice on
   mount in dev, creating two workers/instances. Harmless for this measurement (the
   final instance is read), but production code must guard with a module-level
   singleton promise / ref so a second call reuses the first instance.

Otherwise behavior matched the documented API exactly: `selectBundle` correctly
auto-selected `coi`/`eh` from feature detection, the default `AsyncDuckDB` + Web
Worker setup worked with no custom routing, and `read_csv_auto` type-inferred the
mixed-type columns without hints.

---

## Recommendations for the three open questions

**(a) Worker init / lazy-load strategy.**
Keep DuckDB's default single-Web-Worker model — no custom worker router is needed;
it already runs off the main thread. Do **not** initialize at app boot: init fetches
~7.8 MB and spawns workers. Lazy-init on first ingestion *intent* (entering the
ingestion view / first hover on the drop zone), kicking it off in the background so
compile overlaps with the user choosing a file. Wrap init in a module-level
singleton promise and guard against StrictMode double-mount. Budget ~0.6–0.8 s
compile even when fully cached.

**(b) Cache API caching approach.**
The 80/20 is HTTP caching, not a hand-rolled Cache API layer: ship the
content-hashed `.wasm` with `Cache-Control: public, max-age=31536000, immutable`
(Vite already hashes the filenames; set the header at the host if it isn't automatic).
That kills the ~7.8 MB re-download on repeat visits, which is the dominant warm cost
on real networks. A Service Worker that pre-caches the WASM via the Cache API on idle
is worth adding **only** if repeat-visit cold-start on slow connections proves to be
a problem, or if offline use is required — it does not reduce the ~0.6–0.8 s compile
floor, and V8 already code-caches the compiled module across reloads in a session.
Do not manually store WASM bytes in the Cache API unless you need offline.

**(c) Threading-fallback policy when headers can't be guaranteed.**
Treat threading as an **enhancement, not a requirement**. The no-headers fallback is
graceful and fully functional (`eh`, single-threaded), so do **not** hard-gate the
app on COOP/COEP. Set the two headers wherever you control them (own domain,
Cloudflare, a Netlify `_headers` file, etc.) to unlock ~1.8–3× faster heavy queries
on large files. On static hosts that can't set headers, the app still works — just
slower on big aggregations. Detect `crossOriginIsolated` at runtime and, when false,
either warn on very large files or lower the in-browser size cap. Also weigh the COEP
blast radius: `require-corp` can break unrelated cross-origin subresources, so
consider scoping isolation to the ingestion route, or `COEP: credentialless` where
supported, rather than turning it on app-wide.

---

## What could NOT be verified (honest limits)

- **Chromium only.** Every browser measurement is headless Chromium 149. **Firefox
  and Safari were not tested.** Both support `crossOriginIsolated`, but Safari has a
  history of COOP/COEP + `SharedArrayBuffer` quirks and its own WASM edge cases;
  cross-browser parity is unverified.
- **Localhost only — network fetch time is understated.** Cold-start here is the
  compile floor with a ~free download. Real-world cold-start = measured compile
  (~0.6–0.8 s) **plus** the ~7.8 MB gzip WASM download over the user's connection.
  No real static host / CDN / throttled-network run was performed.
- **`performance.memory` precision.** Chrome quantizes/caches it and it only covers
  the main JS thread; a precise total-process (incl. worker WASM heap) memory figure
  was not captured. `duckdb_memory()` was used as the engine-side proxy;
  `measureUserAgentSpecificMemory()` was available but not wired.
- **Parquet path unexercised.** `read_parquet` is implemented for `.parquet` drops
  but no Parquet fixture was generated, so only CSV ingestion was measured.
- **No large-scale / OOM probing.** Files above ~50 MB, DuckDB's `memory_limit`,
  spill-to-disk, and the WASM32 ~4 GB address-space ceiling were not tested.
- **Interactive drag-drop not hand-driven.** File loading was driven via
  `input.setInputFiles`, which exercises the same `handleFile` code path as a human
  drop, but a manual desktop drag-and-drop was not performed.

---

## How to reproduce

```bash
npm install
npm run gen-csv fixtures/small.csv 0.2     # small fixture
npm run gen-csv fixtures/large.csv 50       # ~50 MB fixture

# with COOP/COEP headers (threaded / coi):
npm run dev                                 # http://localhost:5188
# without headers (single-threaded fallback / eh):
npm run dev:no-headers -- --port 5189

# automated capture (headless Chromium via Playwright):
BASE_URL=http://localhost:5188 SMALL=fixtures/small.csv LARGE=fixtures/large.csv WARM=1 npm run measure

# production-build warm-cache check:
npm run build && npm run preview -- --port 4188
BASE_URL=http://localhost:4188 WARM=1 npm run measure
```

Or just open the dev URL and drag a `.csv`/`.parquet` file onto the drop zone; all
numbers render on the page and are also mirrored to `window.__SPIKE__`.
