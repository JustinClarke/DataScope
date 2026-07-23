# ADR-008: SQL lint parser choice

**Status:** **Accepted (2026-07-21) — `pgsql-ast-parser`.** Decided during Phase-4 (v0.5)
SQL-lint work. A.3's library survey was re-verified on npm before committing; the `sqlLint.ts`
test suite (representative DuckDB SQL — CTEs, window functions, and each seeded dialect-fault
class) is the parse-fidelity evidence, in lieu of a separate throwaway harness (D18 allows the
build's own verification to stand as the evidence when the stage is pure and test-covered).

**Referenced by:** `build/06-ai/01-pipeline.md`

## Context
Resolves the SQL lint parser choice — `node-sql-parser` vs. `pgsql-ast-parser` — used to validate and lint generated SQL in the AI pipeline. Deferred to Phase-4 pipeline work, and gated on re-verifying Appendix A.3's July-2026 library survey before committing.

## Decision
**`pgsql-ast-parser` (12.0.2).** Stage-4 lint parses generated SQL to a real Postgres AST and
inspects it structurally for the short list of things LLMs get wrong in DuckDB SQL (backticks,
`CONCAT(...)` vs `||`, `TOP n` vs `LIMIT`, non-DuckDB date/time function names). DuckDB's dialect
is deliberately Postgres-close, so a Postgres AST is the right lens. When the parser throws on
input it cannot represent, lint returns a non-blocking "unparseable — skipped structural checks"
result rather than failing the query: the loop still executes and stage 5 catches real errors.

## Alternatives considered
- **`node-sql-parser` (5.4.0).** Genuine multi-dialect AST, runs in-browser. Rejected: broader
  than needed (MySQL/SQLite/… dialects we never target), weaker TS ergonomics (bundled `.d.ts`
  over a JS core), and its Postgres mode still diverges from DuckDB more than a purpose-built
  Postgres parser. The extra dialect surface is cost without benefit here.
- **`pgsql-ast-parser` (chosen).** TypeScript-native Postgres AST parser + mapper built for
  programmatic inspection/rewrite — exactly the scoped-lint use. Postgres-only matches DuckDB's
  Postgres-closeness; the master's own illustrative source tree (§ "sqlLint.ts — Dialect lint via
  pgsql-ast-parser") already named it.
- **Hand-rolled AST.** Rejected on principle (A.3, §17 risk row) — fails silently on the first
  CTE/window function.

## Consequences
- Adds one runtime dependency (`pgsql-ast-parser`), pure-JS, no WASM, tree-shakeable.
- Lint is **advisory, never a hard gate**: parse failures degrade to skip, and the execute-fail-
  retry loop (stage 5) remains the real correctness backstop. This keeps a parser gap from ever
  silently blocking a valid DuckDB query the parser simply doesn't model.

## Spike evidence
No separate throwaway harness: `app/src/lib/sqlLint.test.ts` exercises the chosen parser against
CTEs, window functions, and each seeded dialect-fault class, and is the recorded evidence. Library
survey (A.3) re-verified on npm 2026-07-21: `node-sql-parser` 5.4.0, `pgsql-ast-parser` 12.0.2.
