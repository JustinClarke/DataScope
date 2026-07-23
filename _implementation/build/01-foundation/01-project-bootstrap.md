# 01.1 Project Bootstrap

**Tier:** v0 · Phase 1 · **Master spec:** §6 (stack), §16 (structure), §15 (budgets), §17 (COOP/COEP risk)

## Objective

A Vite + React 18 + TypeScript + Tailwind project matching the frozen §16 layout, deployable
as a static site with the headers DuckDB-Wasm needs.

## Spec

- Vite scaffold, strict TypeScript, Tailwind + CSS custom properties (theme tokens for the
  later dark/light toggle).
- **COOP/COEP headers:** DuckDB-Wasm's threaded build needs `SharedArrayBuffer`, which
  requires `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy:
  require-corp`. Configure in dev (Vite server headers) and prod (host config). This is a
  §17 compatibility risk — verify in the Phase-1 ingestion spike (D18) whether the
  single-threaded fallback suffices where headers can't be set; record in ADR-001.
- Define the §21.4 interfaces in `src/types/` **before** feature code: `Dataset`,
  `ClassifiedColumn`, `DataCapabilities`, `ChartSpec`, `ViewSpec`, `QueryEngine`,
  `TableRegistryEntry`, `QueryResult`, `WorkerMessage`, `WorkerResponse`, `AIMode`,
  `AISession` — the master's own §16 file-tree comment and §8/§9 worked examples are
  authoritative on naming (`ClassifiedColumn`/`DataCapabilities`), not this list's earlier
  placeholder names (`ColumnMetadata`/`AnalysisCapability`), which §21 item 4 predates.
- Service contract stubs in `src/services/` (§21.8).
- Bundle discipline from day one: initial gzipped JS < 500KB; DuckDB and Monaco are lazy
  chunks, never in the entry (see [`../../foundations/performance-budgets.md`](../../foundations/performance-budgets.md)).
- **Samples location wrinkle resolved:** `/public/samples/` (§14) is authoritative, not
  `src/data/samples/` (§16 corrected) — samples are static assets fetched at runtime by the
  sample picker, never imported into the JS bundle, so `public/` is the correct Vite
  convention and keeps them out of the §18 bundle budget.

## Files

`package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config`, `src/app/`,
`src/types/*.ts`, `src/services/*.ts` (stubs), empty feature folders per §16.

## Dependencies

None. First code in the repo.

## Acceptance criteria

- [ ] `npm run dev` serves the shell with COOP/COEP headers active (`crossOriginIsolated === true` in console)
- [ ] `npm run build` output's initial gzipped JS < 500KB
- [ ] All §21.4 types exist and compile under `strict`
- [ ] Folder layout matches §16 exactly

## Test plan

CI: typecheck + lint + a bundle-size check on the entry chunk. Manual: verify
`crossOriginIsolated` in dev and on the deployed static host.

## Definition of done

Shell deploys as a static site; a teammate can `git clone && npm i && npm run dev` and see
the app frame; ADR-001 notes captured from the spike.
