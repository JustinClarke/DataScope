# 03.4 Auto-Profile Dashboard & Insight Feed

**Tier:** v0 · Phase 1 (column cards) + Phase 3 (insight feed, D10) · **Master spec:** §10 Module 1

## Objective

The always-enabled profile view: per-column statistical cards immediately after ingestion,
plus (Phase 3) the rule-based insight feed — deterministic observations with visible SQL.

## Column cards (Phase 1)

Row/column counts plus per-column cards:
- Data type badge (Temporal / Quantitative / Categorical / Textual / ID)
- Null percentage bar
- Quantitative: min, max, mean, median, std dev, **histogram sparkline**
- Categorical: value frequency bar (top 10)
- Temporal: date range (earliest → latest), gap detection
- Textual: avg word count, sample preview

Auto-generated SQL is shown to the user (educational panel):

```sql
-- Descriptive statistics
SELECT column_name, column_type, min, max, avg, std, approx_unique, null_percentage
FROM (SUMMARIZE dataset);

-- Value frequencies for categorical column
SELECT category_col, COUNT(*) as freq
FROM dataset GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
```

Per-table view — every registry table gets its own profile (D13).

## Insight feed (Phase 3 — D10; rule-based, no LLM, identical in local-only mode)

Ranked list of proactively surfaced observations, computed with plain SQL. v0 rule set:

| Rule | Requires | Example output |
| :--- | :--- | :--- |
| Concentration | Cat + Quant | "Top 10% of customers generate 72% of revenue" |
| Change-point | Temporal + Quant | "Revenue dropped 38% in March — largest period-over-period move" |
| Outlier group | Cat + Quant | "Region A's mean is 2.7σ above the rest" |
| Null pattern | any | "Missing values concentrated in `discount_code` (61% null, all pre-2023)" |
| Duplicates | any | "412 fully duplicated rows detected" |
| Leakage flag | ≥ 2 Quant | "`total_paid` and `target` correlate at 0.998 — possible target leakage" |
| ID exclusion | Identifier | "`row_uuid` is near-unique — excluded from analysis (override in Profile)" |

- Each card shows its generating SQL + an **"open as chart"** action reusing the SQL → Chart
  translator ([../04-sql/04-chart-translator.md](../04-sql/04-chart-translator.md)).
- Ranked by interestingness = **effect size × coverage**; feed caps at **~10 cards** — a
  briefing, not a dump.
- Seed of §20.5's deterministic insight layer (richer rules, cross-table insights, ranking
  maturity live there) and of the Phase-7 quality report (D14).
- The matured rule library is formalized in §20.5 as **`HeuristicFinding`** (**D69, v0.5**): the
  same insight rules, **one pipeline with this feed — never a parallel generator (D58)** — sharing
  the interestingness ranking and feeding `rankNextActions` ([03-capability-engine.md](03-capability-engine.md)).
  Contract carried into the v0.5 layer: **every finding carries its generating `sql` (mandatory)
  and a D45 `FactRef` snapshot**; confidence is the computed interest score, not a bare enum.

## Files

`src/features/profiling/` (dashboard, ColumnCard, InsightFeed, insight rules as SQL
templates + scoring in `src/lib/`).

## Dependencies

Cards: [01-summary-statistics.md](01-summary-statistics.md),
[02-column-classifier.md](02-column-classifier.md).
Feed: additionally the chart translator (Phase 2) — hence its Phase-3 slot.

## Acceptance criteria

- [ ] Cards render < 500 ms after ingestion for every sample (§18)
- [ ] 100%-null column renders correctly (§22)
- [ ] Feed: each bundled sample surfaces **≥ 3 correct, non-trivial insights**, each with SQL
      + working open-as-chart (§18)
- [ ] Feed renders identically in local-only mode, zero network requests (§18)
- [ ] Feed never exceeds ~10 cards; ranking is deterministic

## Test plan

Component tests per card type. Insight rules: unit tests on fixture tables with known
planted patterns (a duplicate block, a null cluster, a 0.998 correlation pair). E2E per
sample asserting the ≥ 3-insight gate. Network-tab assertion in local-only mode.

## Definition of done

Phase-1 slice: cards live for every registered table. Phase-3 slice: the D10 acceptance
rows pass and the v0 ship gate's insight criteria are green.
