# 05.1 Time-Series Analysis

**Tier:** v0 · Phase 3 · **Master spec:** §10 Module 3 · **Gate:** `canDoTimeSeries`
(≥ 1 Temporal + ≥ 1 Quantitative)

## Objective

Trend analysis over any Temporal + Quantitative pairing, SQL-visible throughout.

## Spec

- **Trend line chart** with selectable granularity: day / week / month / quarter / year
  (`DATE_TRUNC` behind the scenes).
- **Moving average overlay**, configurable window (7 / 30 / 90-day) — window-function SQL
  (the §10 M2 `AVG(...) OVER (...)` pattern).
- **Period-over-period comparison** (this month vs last month).
- **Seasonality detection:** day-of-week × hour-of-day heatmap.
- Date + value column pickers from `dateColumns` / `numericColumns`; SQL for every view
  shown in the educational panel.

## Files

`src/features/charts/time-series/`; SQL builders in `src/lib/` (reused by the insight
feed's change-point rule).

## Dependencies

Broker flag + column refs ([../03-profiling/03-capability-engine.md](../03-profiling/03-capability-engine.md));
chart primitives from [../04-sql/04-chart-translator.md](../04-sql/04-chart-translator.md) work.

## Acceptance criteria

- [x] Stock-prices and weather samples (§14) render trend + moving average correctly
- [x] Granularity switch re-queries and re-renders; timing acceptable (< 500 ms query, §18)
- [x] Generated SQL visible and copy-able for every view
- [x] Disabled with "Needs a date column" tooltip on e.g. Titanic

## Test plan

Unit: SQL builders per granularity/window. E2E on stock-prices: switch granularities,
toggle moving average, check heatmap renders. Verify gate on a no-Temporal sample.

## Definition of done

Both temporal samples fully exercised; SQL panel verified for each sub-view.
