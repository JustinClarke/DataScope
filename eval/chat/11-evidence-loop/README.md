# 11 — Typed Evidence Loop

An isolated experiment for a hybrid dataset analyst:

1. Code deterministically builds the dataset header, schema, relationships, and quality report.
2. A local LLM may choose analysis probes, but only from a typed grammar. It cannot write SQL.
3. DuckDB compiles and executes the probes.
4. The LLM writes an answer from the resulting evidence packets.
5. Code removes claims with missing citations or numbers absent from their cited evidence.

Transport calls retry once. A rejected typed plan may be sent back to the model once with the deterministic validation error; the rejected plan is never executed.

Nothing in this directory is wired into the application.

## Hypothesis

A 7B model is useful as a semantic planner and narrator if computation and factual authority remain deterministic. The model should decide what is interesting; it should not decide what is true.

## Predeclared acceptance criteria

Mechanical gates (all required):

- 100% of deterministic unit tests pass.
- Invalid tables, columns, disconnected joins, filters, and unsupported probe shapes fail closed before SQL execution.
- Every accepted factual finding cites at least one executed evidence packet.
- Every number in an accepted observation appears in its cited evidence.
- Header, structure, relationships, and quality are identical with or without Ollama.
- No generated SQL is accepted from the model.

Live 7B run (four questions over the ecommerce fixture):

- At least 3/4 plans parse and execute at least one probe.
- At least 3/4 answers retain one grounded finding after validation.
- Citation validity is 100% among retained findings.
- The run must expose rejected claims instead of silently presenting them.

The usefulness of findings, presentation suggestions, and transform suggestions remains a human-scored qualitative result. Passing the mechanical gates does not prove usefulness.

## Run

```bash
npx vitest run --config eval/chat/11-evidence-loop/vitest.config.ts
OLLAMA_CHAT_URL=http://127.0.0.1:11434/api/chat \
OLLAMA_MODEL=qwen2.5-coder:7b \
npx tsx eval/chat/11-evidence-loop/run.ts
```

Defaults: `qwen2.5-coder:7b`, `num_ctx=8192`, temperature `0`, and the repository's existing remote Ollama URL. Set `EVAL_QUESTION_LIMIT=1` for a quick smoke test.
