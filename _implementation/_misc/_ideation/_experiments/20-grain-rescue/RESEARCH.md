# Research: getting a local ≤4B model to answer tabular questions reliably

Phase 1 of the exp20 brief. Sonnet, inline, ~12 web searches/fetches, $0 (no Fable spend).
Scope: what actually moves execution accuracy for small (≤14B, ideally ≤4B) open-weight
models on tabular/SQL question-answering, and what's already current on Ollama as of
2026-08-08.

## Current small-model landscape (gates §2b)

Verified against the live Ollama registry, not training-data recall:

| Model | Q4-ish disk size | Fits 8GB M1? | Notes |
| :--- | ---: | :--- | :--- |
| `qwen3:4b` | 2.5GB | Yes | Already pulled. Known to fail the grain trap unaided (repo prior). |
| `qwen3.5:4b` | ~2.5GB (unverified exact) | Yes | **New** — Qwen3.5 exists on the registry now (official `qwen3.5` tag, sizes 0.8b/2b/4b/9b/27b/35b/122b). Not in the brief's candidate table because it postdates it. Worth one bake-off slot as the 4B-class challenger to `qwen3:4b`. |
| `qwen3:8b` | 5.2GB | Marginal | Confirmed size. Will pressure the 8GB M1 alongside macOS+browser. |
| `qwen3.5:9b` | unverified | No (treat as M4-tier) | Newer than `qwen3:8b`; only worth pulling if the 4B tier is inconclusive and there's spare time — not core to the matrix. |
| `qwen2.5-coder:7b` | 4.7GB | Marginal | Confirmed. Coder-tuned counterpart to `qwen3:8b`-class for the coder-vs-general arm. |
| `qwen2.5-coder:14b`* | 9.0GB | No — M4 only | *Not in original candidate list; exists on registry, could substitute for capacity control if `qwen3:14b` underperforms expectations. |
| `qwen3:14b` | 9.3GB | No — M4 only | Confirmed. The capacity-control arm per §2a. |
| `phi-4` | 9.1GB | **No** — brief estimated ~2.5GB, actual is 9.1GB (14B-class model, not ~3.8B) | **Correction to the brief**: `phi4` on Ollama is the 14B model (9.1GB), not a ~3.8B model. There may be a smaller `phi4-mini` variant but it wasn't confirmed with a size. Drop phi-4 as an 8GB-viable candidate; if used at all, it's another M4-only capacity-control option, not a primary-tier contender. |
| `qwen2.5-coder:0.5b`, `1.5b` | 397MB / 986MB | Yes | Already pulled. Useful as the "small model" floor per §5 controls (`qwen3:1.7b` was named in the brief; either works). |
| Qwen3-Coder-30B | ~18GB | No — neither machine | Confirmed out of reach, as the brief expected. |
| IBM Granite 4.1 8B | exists on registry, 3B/8B/30B tags | Marginal at 8B | Surfaced in research as a coding/tool-calling-strong contender. Not verified against these specific datasets. One optional bake-off slot if time allows; not required for the core matrix. |

**Correction worth flagging plainly**: the brief's phi-4 row (`~3.8B, ~2.5GB, fits 8GB`) is
wrong — Ollama's `phi4` is a 14B/9.1GB model. There is no small phi-4 confirmed on the
registry here. Recommend dropping it from the primary bake-off and not substituting it for
`qwen3:4b`'s slot.

**Bake-off recommendation**: `qwen3:4b` vs `qwen3.5:4b` vs `qwen2.5-coder:1.5b` (small-model
floor) on the 8GB tier; `qwen3:14b` as the sole M4 capacity control. Add `qwen2.5-coder:7b`
only for the dedicated coder-vs-general arm, matched against `qwen3:8b` at the same size class.

## Technique findings

### 1. Schema linking / context pruning — validated, and *more* important as models shrink

Schema-linking (showing only relevant tables/columns) produces accuracy gains of **6.9–46.9
percentage points**, and the effect is reported to grow *larger* as parameter count drops —
the opposite of "small models need more help so pruning matters less." At 0.5B–1.5B scale,
schema-linked pipelines still reach **56.9–67.1% execution accuracy on BIRD** (SLM-SQL, 2025).
A 3B model with schema-context enrichment plus self-correction reaches **67.7% (BIRD) / 85%
(Spider)** (FINER-SQL, 2026). This directly validates A1's premise: profiling-as-context is
not a nice-to-have, it's disproportionately load-bearing at small scale.
Model sizes: 0.5B–7B. Directly applicable — our arms are in this exact range.

### 2. Schema-derived few-shot synthesis (SPS-SQL-class) — real lift, but at Spider-level complexity

SPS-SQL pre-synthesizes query templates from schema alone (no hand-written examples),
embeds them, and retrieves similar ones as few-shot context at inference time. Reported
**81.7–82.1% execution accuracy with Qwen2.5-Coder-7B on Spider**, and 79–80.5% with other
7–9B models (Llama-3.1-8B, GLM-4-9B). This is evidence *for* A3, but caution: Spider is an
easier benchmark than BIRD (less ambiguous grain/filter traps), and none of this was measured
against a grain-trap-style relational schema like our `ecommerce/` set. Treat A3's expected
lift as plausible but unproven for our specific trap category.
Model sizes: 7–9B. Marginally above our primary 4B target — lift at 4B is untested by this
source.

### 3. Execution-guided self-correction — fixes syntax/binding, weak evidence on semantic (grain) errors

This is the most important *negative* finding for the design. Execution errors split into
syntax errors, "no such column," "no such table," and misc — and self-correction
**"consistently reduces... across model scales,"** with 7B models reaching full syntax-error
resolution on BIRD. But: **"no such table" errors are almost entirely eliminated only in
larger models"**, and — critically — the class of error we care about most (wrong grain: the
query runs, returns a plausible number, and is silently wrong) is not a "no such
table/column" error at all. It's a semantically valid, syntactically valid query against the
wrong grain. Execution feedback has nothing to catch here — there's no error to observe. One
source states this plainly: *"existing methods focused on execution feedback mainly address
syntax issues, leaving semantic errors largely unaddressed."*
**Implication for our design**: execution-guided retry (re-running on a DuckDB error) is not
on our arm ladder, and this finding says that's the right call — it wouldn't touch the
grain trap, which is our headline failure mode. Worth stating explicitly in the report as a
reason A2 (structural fix: eliminate the wrong grain from the queryable surface) is the right
lever, not a self-correction loop.
Model sizes: reported across "all model scales" including ≤7B for the syntax-error part;
the semantic-error gap is reported as a general limitation, not size-specific.

### 4. Semantic layers / model-as-router — the single most relevant finding, with an important scale caveat

Two sources, one vendor blog and one arxiv paper, disagree sharply in magnitude and that gap
itself is informative:

- **Vendor claim** (dbt developer blog, 2026): Claude Sonnet 4.6 goes from 90.0% (raw
  text-to-SQL) to 98.2% (semantic layer); GPT-5.4 from 84.1% to 100.0%.
- **Independent arxiv paper** ("Semantic Layers for Reliable LLM-Powered Data Analytics,"
  2604.25149, 2026): tested Claude Opus 4.7, Claude Sonnet 4.6, GPT-5.4 — **frontier models
  only**. Without semantic context: 45.5–50.5%. With a semantic-layer document: 67.7–68.7%.
  That's **+17 to +23 percentage points**, not the vendor's near-ceiling numbers. The paper's
  own conclusion: *"the presence of the semantic-layer document accounts for essentially all
  of the significant variance; model choice within tier does not."*

**Gap in the literature, stated plainly**: neither source tests anything below frontier-scale
models. There is no published evidence, found in this pass, that a semantic layer / curated
view helps a 4B-class *local* model the way it helps GPT-5.4 or Claude Sonnet 4.6. Our A2 arm
is not confirming a known result — it's testing whether the mechanism transfers down two
orders of magnitude in model size. That's a legitimate and useful thing to test, but the
report should not claim the literature already answers this; it doesn't, at this size. Frame
A2 as the frontier-to-local transfer test.

Also relevant: this literature treats the semantic layer as a **fixed, pre-authored** artifact
(dbt MetricFlow / Cube definitions, hand-built). Our A2 differs from all cited work in one
important way — it's generated automatically from inferred keys, not hand-authored. No source
found addresses automatic semantic-layer generation's effect on LLM accuracy; that's this
experiment's actual novel contribution, not just A2 in isolation.

### 5. Automatic grain/key inference — no LLM-accuracy literature found, but the mechanics are well precedented outside the LLM context

No paper directly measures "automatically inferred grain-correct rollup improves LLM SQL
accuracy." But automatic FK/grain detection itself is well-trodden: name-derived lookup +
PK-naming similarity + value-overlap/containment scoring is the standard recipe (matches
what `src/lib/relationshipInference.ts` in this repo already does — see below), and
fanout-cardinality classification via **average records per key** (≤1.2 avg / ≤2 max → "one"
side, else "many") is a documented heuristic (Honeydew docs) directly usable for the "state
each table's grain in plain language" requirement in §6.
Not model-size-dependent — this is a data-side computation, independent of which LLM consumes
its output.

### 6. Plan-first / decomposition prompting — established technique, unclear on semantic (not just structural) complexity

DIN-SQL's classify-then-decompose pipeline and "Query Plan Agent" designs (explicit
step-by-step plan before SQL, mapping intent to schema and subproblems) are established and
reported to help on complex/nested queries. No source quantified whether an explicit
"state the grain before you write SQL" instruction specifically prevents grain-trap errors —
this is closest in spirit to A4 but the literature validates decomposition for *query
complexity* (nested nested subqueries), not specifically for *grain selection under ambiguity*
which is a different failure mode (the query isn't complex, it's just aggregating over the
wrong join). Treat A4's expected lift as an open question this experiment actually tests,
not a confirmed result.

## What this means for the experiment design (Phase 2 input, not a decision)

- A1 (profile-as-context) has the strongest prior evidence of any arm, at the right model
  size range (0.5–7B). Expect it to carry real weight.
- A2 (auto-generated grain-correct views) is the most novel claim in the whole ladder — every
  cited semantic-layer result is frontier-model-only and hand-authored-artifact-only. This is
  the arm where a null result would be most informative, and a positive result would be the
  headline.
- A3 (schema-derived few-shot) has real 7–9B evidence on Spider-class complexity; treat its
  contribution on our grain-trap-heavy question set as untested, not pre-validated.
- Execution-guided self-correction is deliberately **not** on the ladder — literature says it
  doesn't touch semantic/grain errors, which is our target failure mode. Worth one sentence
  in the final report citing why it was excluded rather than silently omitted.
- A4 (forced plan-first) is validated for query-complexity decomposition, not specifically
  for grain selection — also an open test, not a confirmed one.
- The repo already has production-grade, tested building blocks for the *data-side* half of
  A1/A2 — see below. Building the profiler from scratch would be redundant.

## Reusable infrastructure already in this repo (not literature, but changes the build plan)

Found while orienting for this research pass — directly reduces Phase 3 scope:

- `src/services/ingestion.ts` — `summarizeTable()` (DuckDB `SUMMARIZE`-based `ColumnProfile`
  extraction: physical type, cardinality, null %, min/max, mean/stddev) and `classifyTable()`.
- `src/lib/classifier.ts` — `classifyColumns()`: assigns `SemanticType`
  (Temporal/Quantitative/Categorical/Textual/Identifier) from physical type + cardinality
  ratio, with thresholds already tuned (`CATEGORICAL_CARDINALITY_MAX = 15`,
  `IDENTIFIER_UNIQUE_RATIO = 0.95`, etc.) and a human-readable `classificationReason` per
  column — i.e., most of the "deterministic profile" A1 needs already exists as pure,
  tested functions.
- `src/lib/relationshipInference.ts` — full FK inference: `generateCandidates()` (name
  agreement + type-compatible pairing), containment/coverage SQL builders, `scoreCandidate()`,
  `assembleEdges()` producing confidence-tiered (`confident`/`candidate`) edges with evidence
  strings. This is exactly the "infers foreign-key candidates from the data" requirement in
  §6 — inferred, not hardcoded, and already handles the ambiguity/ordering cases.
- **Gap, confirmed**: nothing in the repo generates a plain-language grain statement or
  synthesizes a rollup view from an FK edge. That part of §6 (grain-correct view generation)
  is genuinely new work for this experiment, not reuse.
- `eval/chat/17-duckdb-local-chat/{bootstrap.ts, ollama.ts}` — CSV→DuckDB bootstrap pattern
  and an Ollama structured-output call wrapper (JSON-Schema `format` + independent Zod
  validation, temperature/num_ctx via env, digest-pinned model resolution). Directly reusable
  for the harness's model-call layer.

## Sources

- [SLM-SQL: An Exploration of Small Language Models for Text-to-SQL](https://arxiv.org/abs/2507.22478)
- [FINER-SQL: Boosting Small Language Models for Text-to-SQL](https://arxiv.org/html/2605.03465v1)
- [SPS-SQL: Enhancing Text-to-SQL generation on small-scale LLMs with pre-synthesized queries](https://www.sciencedirect.com/science/article/abs/pii/S0167865525001497)
- [Enhancing text-to-SQL capabilities of small language models via schema context enrichment and self-correction](https://www.researchgate.net/publication/396637198_Enhancing_text-to-SQL_capabilities_of_small_language_models_via_schema_context_enrichment_and_self-correction)
- [LitE-SQL: Vector-based Schema Linking and Execution-Guided Self-Correction](https://arxiv.org/pdf/2510.09014)
- [Semantic Layers for Reliable LLM-Powered Data Analytics (arxiv 2604.25149)](https://arxiv.org/abs/2604.25149)
- [Semantic Layer vs. Text-to-SQL: 2026 Benchmark Update (dbt developer blog)](https://docs.getdbt.com/blog/semantic-layer-vs-text-to-sql-2026)
- [Handling Fan-Out and Chasm Joins — Honeydew Docs](https://honeydew.ai/docs/advanced-modeling/mixing-granularities)
- [DIN-SQL: Decomposed In-Context Learning of Text-to-SQL with Self-Correction](https://arxiv.org/pdf/2304.11015)
- [Qwen3 — Ollama library](https://ollama.com/library/qwen3)
- [Qwen2.5-Coder — Ollama library](https://ollama.com/library/qwen2.5-coder)
- [Phi-4 — Ollama library](https://ollama.com/library/phi4)
- [Best Open-Source Small Language Models in 2026 (BentoML)](https://www.bentoml.com/blog/the-best-open-source-small-language-models)
