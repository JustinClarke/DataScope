# 06.1 NL→SQL Pipeline (stages 1–6)

**Tier:** v0.5 · Phase 4 · **Master spec:** §11.1, Appendix A (A.1–A.5)

## Objective

The six-stage NL→SQL pipeline, realized as an LLM tool-use loop with full transcript
auditability.

## Stages (§11.1)

1. **Input normalization (fuzzy pre-match).** Levenshtein/Jaccard string-distance matching
   of user tokens against known table/column names — typo correction before the LLM sees
   the text. Cheap, symbolic, **no embeddings**. (Ex-"Speculative Vector Tokenizer" — the
   branding was rejected as misleading, A.1; describe it plainly.)
2. **Schema-pruned prompting.** Only relevant DDL, column names/types/descriptions, and
   semantic roles from the classifier (§8) — never the whole schema. Vanna's core mechanism;
   standard practice. This pruned bundle is a **fragment of the same structural-facts
   substrate DSPS serializes** (D37/D58): classifier output and DSPS are two views of one
   model, so pruning slices DSPS by relevant table/column rather than maintaining a parallel
   structure representation — facts only, never the `dsps_version`/provenance machinery on
   this per-turn path (D45).
3. **Generation.** Route to the active provider ([02-modes-byok.md](02-modes-byok.md)).
4. **Dialect lint (scoped).** Parse generated SQL with a **real Postgres-dialect JS parser**
   (`node-sql-parser` or `pgsql-ast-parser` — ADR-008, re-verify A.3's survey) and lint for
   the short list LLMs actually get wrong in DuckDB SQL: backticks, `CONCAT` vs `||`,
   `TOP` vs `LIMIT`, date/time function names. DuckDB's dialect is deliberately
   Postgres-close, so this catches most real mistakes. **Never hand-roll the parser** (A.3):
   a hand-rolled "AST" passes demo queries then silently mishandles the first CTE or window
   function — failing quietly is worse than not having the feature (§17 risk row).
5. **Execute-fail-retry loop.** Best-ROI feature in the pipeline. On failure: capture the
   error trace, resample real context (`PRAGMA table_info()`, `LIMIT 3` sample rows —
   privacy-gated, see [03-privacy-disclosure.md](03-privacy-disclosure.md)), feed both back,
   retry. **Hard cap: 3 attempts** (THOR-style). A wrong query visibly self-correcting on
   screen is the strongest demo moment.
6. **Auto-chart config.** Call the shared SQL → Chart translator
   ([../04-sql/04-chart-translator.md](../04-sql/04-chart-translator.md)) on the final
   result set — strictly-typed `ChartSpec`, no fork.

## Implementation shape (§11.1)

Stages 3–5 are an **LLM tool-use loop**, not a bespoke generate→validate→execute pipeline:
the model gets an `execute_local_sql` tool bound to DuckDB-Wasm and calls it directly;
execution results and error traces flow back as tool results, so stage-5 retry behavior
falls out of the loop for free. Stages 1–2 preprocess the prompt; stage 4 lints each tool
call *before* execution; stage 6 post-processes the final result.

The `execute_local_sql` **tool-input schema is the structured contract** for generated SQL
(validated natively by the provider's tool-calling), and stage 6's typed `ChartSpec` is the
other structured output. **No separate `SQLPlan` object** — it was considered and rejected as
a redundant intermediate competing with the tool-use loop (F8).

## Transcript auditability (§11.1 — the trust model)

The chat never executes hidden SQL. Every generated query surfaces as *suggested SQL* in the
transcript; each execution shows an inline log entry: exact query, timing, row count, and —
on failure — the error trace and retry number. The user can always reconstruct what ran and
why it was retried. This transcript **is** the product's content-full, client-side LLM trace
(D41) — the auditability and demo surface, in-browser by design; the content-free operator
LLM metrics (tokens/turn, retries, latency buckets) live separately at §23.5 and never carry
prompt/SQL/error text off the device.

Future extension (post-foundation, flagged not built): QUITE-style distinction between
*syntax* errors (won't run — handled above) and *equivalence* errors (runs but means the
wrong thing) with different correction strategies. Mitigation now: always-visible SQL.

## Evaluation harness (§11.4, D40)

A **dev/CI-only** eval harness (separate `eval/` dir or repo, **never product runtime**) runs
a curated ground-truth NL→SQL question set over the §14 sample datasets — the labeled set is
the expensive artifact — measuring **exec-rate, result-correctness, cost/turn, and
repair-rate** per provider/mode. Thresholds are declared when the harness is built; clearing
them **gates the v0.5 Phase-4 ship** (the gate is the commitment) and never touches v0/Oct 6
(D27). **TypeScript by default** (matches §6/§16 — no second toolchain); Python only if a
D18-style spike documents a concrete TS gap, recording the finding, not a job-market
rationale. Feeds the §18 self-correction metric; may report a "local" number only for a
local-model path that passed the D43 spike.

**Thresholds (declared 2026-07-22).** exec-rate ≥ 90%, result-correctness ≥ 75% (execution-match,
not string match), repair-rate ≥ 50% among turns needing a retry. No cost/turn ceiling yet — no
provider here is metered; cost is an estimated-tokens-per-turn proxy until `09-edge/01-ai-router`
gives it a real dollar shape. Harness built in `app/eval/`; over the labeled 58-question set
(`app/eval/dataset/questions.ts`, §14 samples): **cloud-edge (real staging Worker, Mistral Small 3.1)
98.3% exec / 82.8% correctness / 100% repair — clears all three thresholds**; WebLLM (real, D43-passed)
93.1%/72.4%; local-only deterministic-template baseline (informational, not gated) 67.2%/19.0%; scripted
mock-cloud (plumbing check only, not a capability claim) 100%/100% by construction. The cloud gate first
ran **0/58** on `@cf/qwen/qwen2.5-coder-32b-instruct` (it does not emit structured tool calls on Workers
AI); the fix was the ADR-007 model swap to Mistral Small 3.1, not a pipeline change.

## Files

`src/features/ai/` (chat UI, transcript, tool-use loop), `src/lib/inputNormalizer.ts`
(stage 1), `src/lib/schemaPrune.ts` (stage 2 — the pruned-prompt builder over classifier
output), `src/lib/sqlLint.ts` (stage 4), `src/services/ai.ts` (`askAI()`, the loop),
`src/services/aiProvider.ts` (the `AIProvider` seam + scripted mock provider that the cloud
router / BYOK / WebLLM providers plug into). The `AIProvider` / transcript-audit types live in
`src/types/ai.ts`. The eval harness lives outside `src/` in a dev/CI-only `eval/` dir or repo (D40).

## Dependencies

Classifier output (stage 2), chart translator (stage 6), DuckDB service (tool binding),
edge AI router for cloud mode ([../09-edge/01-ai-router.md](../09-edge/01-ai-router.md)).

## Acceptance criteria

- [x] Typo'd question ("corellation of fair and age") normalized → valid DuckDB SQL (§18)
- [x] Deliberately-broken query visibly self-corrects within 3 retries; cap actually stops at 3 (§22)
- [x] Lint catches each listed dialect mistake class (seeded-fault tests)
- [x] Transcript shows suggested SQL + per-attempt execution log for every turn (unit-asserted; rendered live in the browser E2E, 2026-07-22)
- [x] Final results auto-chart through the shared translator
- [x] Provider timeout (§21.6) → clean user-facing error, not a hung chat — router-level abort live-verified (504); the UI's `turn.error` rendering unit-tested, not re-driven through a live UI timeout (2026-07-22)
- [x] Eval harness (D40, §11.4) clears its declared exec-rate/correctness/cost/repair-rate thresholds before Phase 4 ships (v0.5-only gate) — cloud-edge (Mistral Small 3.1, live staging Worker) 98.3% exec / 82.8% correctness / 100% repair over the 58-question set, 2026-07-22

## Test plan

**Per-stage verification (A.5), in order:** unit tests for normalizer (typo fixtures) and
lint (seeded dialect faults) before any end-to-end run. Loop tests with a mocked provider
(scripted wrong-then-right responses) asserting retry count, cap, and transcript entries.
E2E against a real provider for the §18 self-correction demo case. Baseline the round-trip
latency at build time (§18).

## Definition of done

Each stage verified independently, then the loop end-to-end; the §18 v0.5 AI criteria pass;
retry/latency baselines recorded.
