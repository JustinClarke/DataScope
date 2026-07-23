# 05.2 Correlation Matrix

**Tier:** v0 · Phase 3 · **Master spec:** §10 Module 4 · **Gate:** `canDoCorrelation`
(≥ 2 Quantitative)

## Objective

Pairwise Pearson correlation across all numeric columns, with drill-through.

## Spec

- **Heatmap grid** of pairwise Pearson coefficients between all numeric columns
  (`SELECT CORR(col_a, col_b) FROM dataset` per pair — batch into one query).
- **Click any cell → drill into a scatter plot** of those two variables (D3 canvas mode
  when points > 10k, §15).
- **Color scale:** dark blue (strong positive) → white (none) → dark red (strong negative).
- SQL shown in the educational panel.
- Identifier columns excluded by default (they're not in `numericColumns`).

## Files

`src/features/charts/correlation/`; the pairwise-CORR SQL builder in `src/lib/` (reused by
the insight feed's leakage-flag rule).

## Dependencies

Broker flag + `numericColumns`; results grid for drill-through's underlying data view.

## Acceptance criteria

- [ ] Weather/stock samples produce a correct, complete matrix (spot-check known pairs)
- [ ] Cell click opens the right scatter; 10k+ points render on canvas without jank
- [ ] Color scale matches spec ends and midpoint
- [ ] Disabled with "Needs 2+ numeric columns" tooltip on a 1-numeric dataset

## Test plan

Unit: matrix SQL builder (n columns → n·(n−1)/2 pairs, one query). Numerical spot-checks
against known sample correlations. E2E: drill-through on weather.

## Definition of done

Matrix + drill-through verified on two samples; canvas threshold behavior confirmed.
