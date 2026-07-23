# 04.2 Auto-Query Suggestions

**Tier:** v0 · Phase 2 · **Master spec:** §10 Module 2

## Objective

Contextual query templates generated from the classified columns, each with a short
educational tooltip — the "what do I even ask?" on-ramp.

## Template table (§10 M2)

| Capability detected | Suggested query template |
| :--- | :--- |
| Categorical + Numeric | `SELECT [cat_col], AVG([num_col]), COUNT(*) FROM dataset GROUP BY 1 ORDER BY 2 DESC` |
| Temporal + Numeric | `SELECT DATE_TRUNC('month', [date_col]) as period, SUM([num_col]) FROM dataset GROUP BY 1 ORDER BY 1` |
| ≥ 2 Numeric | `SELECT CORR([num_col_1], [num_col_2]) as correlation FROM dataset` |
| Temporal | `SELECT [date_col], [num_col], AVG([num_col]) OVER(ORDER BY [date_col] ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as moving_avg FROM dataset` |
| Categorical | `SELECT [cat_col], COUNT(*) as freq FROM dataset GROUP BY 1 ORDER BY 2 DESC LIMIT 20` |
| Textual | `SELECT [text_col] FROM dataset WHERE [text_col] ILIKE '%keyword%' LIMIT 50` |
| Any dataset | `SELECT * FROM dataset LIMIT 100` |

- `[placeholders]` fill from the broker's column-reference arrays; `dataset` is the actual
  registered table name (multi-table: suggest per-table, plus a JOIN template when the D17
  spike or user-defined relationships make one obvious — keep v0 simple).
- **Educational tooltip** per suggestion ("GROUP BY splits your data into buckets, COUNT(*)
  counts rows in each bucket") — rendered via the shell's educational panel pattern.
- Clicking a suggestion inserts it into Monaco (editable), not straight to execution.

## Guided task-shaped answers (D53)

Alongside the column-shaped templates, the rail also offers analyst *tasks* in plain language
— **trend over time · top-N by segment · this period vs last · outliers · simple cohort** —
each mapping to a parameterized DuckDB query + auto-chart (one click → answer; generating SQL
still shown). Deterministic and column-aware (no LLM), so identical in local-only mode. This
is the business analyst's on-ramp: an answer without typing SQL. A task appears only when the
broker capabilities it needs are present (e.g. period-over-period requires a Temporal +
Quantitative pair). Same educational-panel + editable-insertion pattern as the templates.

## Files

`src/lib/querySuggester.ts` (pure: `DataCapabilities` + registry → suggestions),
suggestion UI in `src/features/sql/`.

## Dependencies

[../03-profiling/03-capability-engine.md](../03-profiling/03-capability-engine.md),
[01-monaco-editor.md](01-monaco-editor.md) (insertion target).

## Acceptance criteria

- [ ] Suggestions contextually correct for the uploaded dataset's column names/types (§18)
- [ ] Only templates whose capability requirement is met appear
- [ ] Every suggestion carries a tooltip; insertion lands in the editor, editable
- [ ] Suggested SQL is valid DuckDB SQL for every bundled sample (execute-all test)
- [ ] Task-shaped answers (trend / top-N / period-over-period / outliers / cohort) appear only when their required capabilities are present, and each one-clicks to a query + chart (D53)

## Test plan

Unit: suggester across capability mixes; snapshot the generated SQL per sample. Integration:
execute every generated suggestion against its sample — all must run without error.

## Definition of done

Suggestion set per bundled sample documented in tests; execute-all suite green.
