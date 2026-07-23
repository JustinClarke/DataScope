# ADR-002: State library

**Status:** Accepted — 2026-07-19. Decided from the Phase-1 ingestion-spike's worker-communication shape (ADR-001) plus the frozen §21.7 state tree, per D18 (spike-first process).

**Referenced by:** `build/01-foundation/02-state-management.md`

## Context
Resolves the store-library choice (Zustand / Jotai / Redux / etc.) and confirms the boundary of what lives in React state vs. a store vs. inside the worker. The state tree (`build/01-foundation/02-state-management.md`) was already frozen up front (D18 item 7): five coarse domains (`datasets`, `query`, `ui`, `settings`, `aiSession`), each a flat, mostly independent slice — no cross-domain derived/computed graph was specified. What the ingestion spike (ADR-001) added is the *shape of the writes*: state updates driven by worker responses arrive through a lazy-initialized singleton worker's `onmessage` handler and promise-resolution, correlated by `WorkerMessage`/`WorkerResponse` ids — i.e., from plain async code outside any component's render, not from a user event inside one.

## Decision
**Zustand.** One store per domain (`src/stores/{datasets,query,ui,settings,aiSession}.ts`), created with `create<T>()`, actions colocated on the store itself (no separate action-creator/reducer files).

Key fit points:
1. **Store methods are callable from anywhere, not just components.** `useDatasetsStore.getState().setWorkerStatus(...)` works identically inside a worker `onmessage` callback, a promise `.then()`, or a component. This matches the ADR-001 write shape directly — no dispatch-context or provider-tree indirection needed to update state from the worker boundary.
2. **Matches the state tree's granularity.** Five flat domains with no specified derived/computed relationships between them is exactly Zustand's sweet spot — a handful of independent stores. Redux's normalized-store/slice/selector machinery and Jotai's atom-composition model both solve problems (cross-cutting derived state, fine-grained atomic subscriptions) the frozen state tree doesn't have; adopting either would be solving for a shape the spec doesn't ask for.
3. **Bundle cost is a non-issue.** Zustand's core is ~1KB min+gzip. Confirmed empirically: adding it plus five stores moved the production bundle from 60.16KB to 60.16KB gzip (rounds to the same figure) — nowhere near the 500KB budget (§18/§22).
4. **TypeScript-first, no boilerplate.** `create<T>()` infers state + actions from one object literal; no action-type unions, no combineReducers, no context boilerplate — keeps `strict: true` friction low.
5. **Testable without a DOM.** `useXStore.getState()` and `useXStore.setState()` are plain functions — the acceptance criterion "stores are unit-testable without a DOM" is satisfied by construction, confirmed by the 23 passing unit tests (`src/stores/*.test.ts`) that never render a component.

## Alternatives considered
- **Redux (Redux Toolkit).** Rejected: action-type/reducer/selector boilerplate is disproportionate to five flat domains with no normalized-relational shape; heavier bundle than justified here.
- **Jotai.** Rejected for v0: its atomic-composition model earns its keep when state has a real derived/dependency graph (many small interdependent atoms). The frozen state tree doesn't have that — each domain here is closer to "one bucket of related fields" than an atom graph. Revisit if a later phase (e.g., the broker's derived `DataCapabilities`) needs fine-grained cross-store reactivity Zustand's `subscribe`/selector API can't express cleanly.
- **React Context + `useReducer`.** Rejected: no ergonomic way to read/write state from outside a component tree (the worker-response write path) without smuggling a ref or an external event bus alongside it — reinventing what a store library already does, for equivalent code volume.
- **Valtio / MobX (proxy-based).** Not evaluated in depth: proxy-based mutation-tracking is a bigger paradigm shift for marginal benefit over Zustand at this state-tree size, and mutation-based updates are a worse match for the explicit action-log the query/history and undo/redo (§12.1) rows will eventually want.

## Consequences
- Every state-tree row now has exactly one implemented home: `src/stores/{datasets,query,ui,settings,aiSession}.ts` (`ui.ts` also holds the "active tab" half of its row; `settings.ts` absorbs the state tree's separate "Theme" row since both persist together under one `localStorage` key).
- Dataset row *data* still never enters a store — `datasets.ts` holds only `Dataset`/`TableRegistryEntry` catalog metadata (D58's registry contract); the worker's DuckDB VFS remains the only place actual rows live, unchanged from the frozen state tree.
- `settings.ts` is the **only** store using Zustand's `persist` middleware (`zustand/middleware`, `createJSONStorage(() => localStorage)`); every other store is plain in-memory `create()`. This is enforced by a unit test (`privacy.test.ts`) that populates a dataset, changes a setting, and asserts `localStorage` contains exactly the settings key afterward — the §22 privacy-checklist row, exercised at the state layer.
- Because store actions are plain functions callable outside components, later services (`services/ingestion.ts`, `services/sql.ts`, etc. — currently stubs) will call directly into store actions from their async implementations without needing a React-specific bridge.
- No dependency was added to bridge the worker boundary itself (no "worker-aware store" package) — the `WorkerMessage`/`WorkerResponse` envelope (ADR-001) plus plain store actions is enough; adding one would be a parallel path the D58 no-parallel-pipelines principle argues against.

## Spike evidence
No new spike was run for this ADR. Decision is derived from: (a) the frozen §21.7 state tree (D18 item 7, `build/01-foundation/02-state-management.md`), which fixed the domain granularity before any library was chosen; (b) ADR-001's ingestion-spike finding that worker communication is async, id-correlated message-passing outside the component tree — the shape a store library's API needs to accommodate; (c) this phase's own build — the empirical bundle-size measurement above (60.16KB gzip, unchanged) and the 23 passing store unit tests are the evidence for this ADR specifically, recorded in `../../BUILD-ORDER.md`'s log.
