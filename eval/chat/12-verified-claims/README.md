# Verified Claim IR

This directory contains the smaller feasibility proof authorized by experiment 12's session-2
handoff, the full protocol's Phase 1 immutable artifact writer, Phase 2's complete deterministic
Claim IR gold/adversarial suite, Phase 3's isolated ecommerce metric/evidence pipeline, Phase 4's
single-call 7B smoke driver, and Phase 5's predeclared N=5 core protocol. It has no product imports,
model-authored SQL or free-form renderer.

`artifacts.ts` remains the deliberately tiny writer used by the already-recorded minimal run.
`artifactWriter.ts` is the full protocol boundary for future runs: manifest-first allocation,
append-only events, numbered immutable calls, secret redaction, terminal dispositions, incomplete
run inspection and additive re-scores. Phase 1 made no model call and did not retrofit the old run
into a format it never produced.

`syntheticCases.ts` is the named source of truth for Phase 2's confusion matrix. The verifier uses
cell addresses, explicit chronology, metric/unit/scope compatibility and a declared absolute
tolerance. Parser and verifier failures have stable reason codes. Phase 2 made no model call.

`metrics.ts` bounds recursive metrics to one ratio over primitive aggregate operands.
`ecommercePipeline.ts` compiles those typed metrics to DuckDB SQL with guarded division and emits
stable evidence-cell addresses, compiler-authored metric ids and schema-derived units. Phase 3's
hand-authored driver persists its plan, SQL, evidence, claims, verifier results and deterministic
sentences through the immutable writer. It makes no model call and accepts no free-text title.

```sh
npx vitest run --config eval/chat/12-verified-claims/vitest.config.ts
npx tsc -p eval/tsconfig.json --noEmit --pretty false
npx tsx eval/chat/12-verified-claims/run.ts
npx tsx eval/chat/12-verified-claims/runPhase3.ts
npx tsx eval/chat/12-verified-claims/runPhase4.ts
npx tsx eval/chat/12-verified-claims/runPhase5.ts
```

Each driver invocation creates a new directory under `runs/` and refuses to replace an artifact.
The already-recorded minimal live driver remains on its original tiny writer. The Phase 4 driver
uses `ArtifactWriter`, fixes the model to `qwen2.5-coder:7b`, makes exactly one first-pass claim
call, performs no repair, and stops after its immutable smoke verdict.

Phase 5 runs five complete repeats over the four retained ecommerce questions and four negative
controls. It permits one structural repair, preserves hashes for every response, rejects control
claims before display, and computes its mechanical score by reading the persisted artifacts.
