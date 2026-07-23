# ADR-003: React Query (or not) for async/worker communication

**Status:** Accepted (not adopted for v0) — 2026-07-19. Decided from the Phase-1 ingestion-spike's worker-communication shape (ADR-001), alongside ADR-002.

**Referenced by:** `build/01-foundation/02-state-management.md`

## Context
Resolves whether React Query (or an equivalent async-cache library) mediates async/worker communication, or whether the worker message boundary is handled directly. The ingestion spike (ADR-001) settled the shape of that boundary: a single lazy-initialized worker, one in-flight request per `WorkerMessage`/`WorkerResponse` id, results returned as `Promise`s through the `QueryEngine` interface (`execute`/`registerFile`/`summarize`, D49) — not a network fetch with independent multi-consumer cache semantics.

## Decision
**Not adopted for v0.** Async worker calls are handled with plain store actions: a call site invokes a `QueryEngine` method, the corresponding store action sets `status: 'running'` before the call and `status: 'success' | 'error'` plus the result/error after it resolves/rejects (see `query.ts`'s `queryStarted`/`querySucceeded`/`queryFailed`). No cache layer sits between the worker call and the store.

Reasoning:
1. **React Query solves problems this boundary doesn't have.** Its value — cache-key de-duplication, background refetch/stale-while-revalidate, retry/backoff, pagination — targets *networked* resources with ambiguous freshness and multiple independent consumers racing to read the same key. The v0 async boundary is a local, synchronous-cost DuckDB worker with one caller per query (the SQL editor, a profiling call) and no server to go stale against.
2. **Results already have a named store home.** The §21.7 state tree puts "current query + results" and "chart specs" in the `query` store explicitly — not "wherever a cache library decides to keep them." Wrapping worker calls in React Query would create a second source of truth (the query-cache entry) alongside the store, which then need to agree on what "the current result" is — exactly the kind of duplication D58's no-parallel-pipelines principle (§6) rules out at the architecture level, applied here at the state layer.
3. **No retry/backoff semantics apply.** React Query's retry logic is built for flaky network calls; a same-machine Web Worker call fails deterministically (bad SQL, OOM, cancellation — §21.6's cancellation/lifecycle class) or succeeds, and those failure modes are handled as explicit `WorkerResponse.error` values, not as something to blindly retry.
4. **One dependency not paid for its actual use case.** Adding React Query only to get its `useMutation`/`useQuery` hooks as a thinner Promise-wrapper (without using caching, refetch, or pagination) is weight without the payoff; a two-line store action does the same job and stays inside the Zustand model ADR-002 already committed to.

**Revisit trigger:** `build/07-connectivity/*` (v0.5, Tier-1/Tier-2 API ingestion) introduces genuine networked fetches — real latency, real staleness, and potential multi-consumer reads of the same remote resource (e.g., a Tier-1 API polled by more than one UI surface). That is the point where React Query's actual value proposition applies; this ADR does not commit to adopting it then, only that it's the natural point to re-open the question with real evidence.

## Alternatives considered
- **React Query wrapping every `QueryEngine` call.** Rejected per the reasoning above — solves for network semantics the worker boundary doesn't have, and duplicates the query store's role as the named home for results (state tree, D58 no-parallel-pipelines).
- **SWR.** Same rejection as React Query — same caching/revalidation model, same mismatch with a single-consumer local-worker call.
- **A hand-rolled async-state hook (`useAsync`-style) shared across call sites.** Considered and folded into the decision, not rejected outright: this is effectively what the store actions already are (`queryStarted`/`querySucceeded`/`queryFailed` as the "pending/success/error" triad), just living on the domain store instead of a separate generic hook. No separate abstraction was added because the store already needed these fields per the state tree — a standalone hook would be a second way to express the same three states.

## Consequences
- `query.ts`'s `status: 'idle' | 'running' | 'success' | 'error'` field *is* the async-state machine for SQL execution; no other status representation should be introduced elsewhere for the same call.
- `services/sql.ts`'s `runQuery()`/`cancelQuery()` (currently stubs, D49 service contract) will be implemented as plain async functions that call `QueryEngine.execute()` and drive the `query` store's actions directly — no query-client instance to configure, no cache-key scheme to design.
- Cancellation (§21.6's first-class lifecycle class — `cancelQuery()`, a superseding query preempting a running one) is handled by the store/`AbortSignal` on `QueryEngine.execute()`, not by a library's mutation-cancellation semantics.
- If `07-connectivity` later adopts React Query for the API-fetch paths, it would coexist with the worker-call paths staying on plain store actions — two different async shapes for two genuinely different problems, not a retroactive migration of the SQL/profiling call sites.

## Spike evidence
No new spike was run for this ADR. Decision is derived from the same ADR-001 ingestion-spike finding as ADR-002 — the worker-communication shape is a single-consumer, deterministic-outcome, id-correlated Promise boundary, not a networked multi-consumer cache problem — cross-checked against the already-frozen §21.7 state tree, which names `query` as the one store owning results/history/chart-specs. See `../decisions.md`'s "Spike findings log" section for the underlying ingestion-spike numbers.
