# 02.2 DuckDB-Wasm Worker

**Tier:** v0 · Phase 1 · **Master spec:** §6, §15, §17 (risks), A.2

## Objective

DuckDB-Wasm running in a dedicated Web Worker — lazy-loaded, cached, typed message
protocol — as the single query engine every module talks to.

## Spec

- Use `@duckdb/duckdb-wasm`'s documented default setup: the library already instantiates the
  DB inside a Web Worker so queries don't block the page. **There is no custom "execution
  routing" layer to design** (A.2 debunked it).
- **Lazy-load:** the ~8MB WASM bundle loads only after a file is dropped or a sample
  selected — never in the entry chunk. Progress bar during WASM compile.
- **Cache:** rely on immutable HTTP caching of content-hashed assets, not a hand-rolled
  Cache API (§15, corrected from the ingestion spike — the measured warm-start gain was
  V8's compiled-module code cache, not the fetch). Cold init target: < 3 s (§18), including
  on throttled "Fast 3G" (§22).
- **Threading:** the threaded build needs `SharedArrayBuffer` → COOP/COEP from
  [bootstrap](../01-foundation/01-project-bootstrap.md). Safari is best-effort (§17);
  fall back to the single-threaded build where isolation is unavailable — spike this.
- **Protocol:** typed `WorkerMessage`/`WorkerResponse` (§21.4) wrapping: register buffer,
  create table, run query, cancel query, drop table, SUMMARIZE. Exposed to React through
  `hooks/useDuckDB.ts` and `services/sql.ts` (`runQuery()/cancelQuery()/getHistory()`).
- **Failure handling:** worker crash and out-of-memory are §21.6 cases — the shell's worker
  status store must show a recoverable error state (offer reload + re-ingest), not a blank app.

## Files

`src/workers/duckdb.worker.ts`, `src/hooks/useDuckDB.ts`, `src/services/sql.ts`,
worker-status store wiring.

## Dependencies

[../01-foundation/01-project-bootstrap.md](../01-foundation/01-project-bootstrap.md)
(COOP/COEP, types). This doc is the subject of the **Phase-1 ingestion spike** (D18) — run
the spike before freezing ADR-001.

## Acceptance criteria

- [ ] DuckDB chunk absent from initial bundle; loads on first ingest with progress UI
- [ ] Cold init < 3 s (cable) and on "Fast 3G" throttle; warm init hits the Cache API
- [ ] Query round-trip through the typed protocol; simple aggregation < 100 ms on < 1M rows (§18)
- [ ] Cancel actually aborts a long-running query
- [ ] Killed worker → visible recoverable error state, not a hang

## Test plan

Worker integration suite (register → create → query → cancel → drop). Performance benchmark
against the 50MB reference CSV on Chrome/Firefox/Edge (§22). Manual Safari check
(best-effort, document findings).

## Definition of done

ADR-001 written from spike evidence (init strategy, threading fallback, Cache API behavior);
all modules from here on consume DuckDB only through this service.
