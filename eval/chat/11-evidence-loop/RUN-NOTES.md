# Run notes

## Environment

- Date: 2026-07-31
- Model: `qwen2.5-coder:7b` (`Q4_K_M`)
- Endpoint: Ollama native `/api/chat` over Tailscale
- Context: 8192
- Temperature: 0
- Dataset: bundled four-table ecommerce fixture

## Iteration 1

The first full pass did not meet the predeclared live threshold:

- Plans with executed evidence: 1/4
- Answers with retained grounded findings: 0/4
- Required: 3/4 for each

Observed causes were two dropped transport calls, one invented column (`orders.total_amount`) rejected before execution, and dates serialized as epoch milliseconds. The epoch formatting led the narrator to invent calendar labels which the numeric validator rejected.

## Iteration 2

After adding ISO date formatting, one transport retry, and one typed-plan repair attempt:

- Plans with executed evidence: 4/4
- Answers with retained grounded findings: 2/4
- Retained findings: 3
- Known citation IDs among retained findings: 100%
- Required grounded answers: 3/4
- Mechanical verdict: **fail**

The run also exposed a validator bug: visible text such as `evidence:3` was treated as the data number `3`. That parser bug is fixed and covered by a unit test after this scored run.

## Human semantic audit

The method is not ready even if the citation-token fix raises the mechanical retention score:

1. An accepted trend claim called January 2022 a “substantial decrease,” but the cited monthly values did not establish that comparison.
2. Two accepted transform-answer claims merely described table structure while citing a revenue aggregate. The citation existed, but it did not entail the prose.
3. A rejected sales answer called a product named “Toys Item 52” a product category, showing that entity-role semantics can drift even when the number is copied correctly.
4. The planner repeatedly labeled a revenue sum as “average order value.” Deterministically generated evidence labels prevented that title from becoming authoritative, but the probe grammar could not express the intended ratio.

## Verdict

Typed probes are a strong boundary for computation: invented columns and invalid shapes fail before SQL, joins and metrics are locally compiled, and the 7B model recovered from a rejected plan when given the exact error.

Prose plus citation IDs is not a sufficient grounding contract. The next experiment should make the model return a claim intermediate representation with explicit operands and operators—for example, evidence row A, evidence row B, and `greater_than`—then have code evaluate the comparison before prose is rendered. Derived metrics such as ratios also need first-class typed definitions rather than persuasive model-authored titles.

