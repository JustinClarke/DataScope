# 05.3 Distribution Analysis

**Tier:** v0 · Phase 3 · **Master spec:** §10 Module 5 · **Gate:** `canDoDistribution`
(≥ 1 Quantitative)

## Objective

Shape-of-the-data views for any quantitative column.

## Spec

- **Histogram** with configurable bin count.
- **Box plot** (quartiles, median, outliers — IQR rule).
- **Descriptive stats panel:** mean, median, mode, std dev, skewness, kurtosis.
- Column toggle via dropdown (`numericColumns`); all stats computed in DuckDB SQL, shown in
  the educational panel.
- The skew/outlier machinery here is recast as report findings in Phase 7 (§20.8) — keep
  the stat computations in `src/lib/`, not buried in components.

## Files

`src/features/charts/distribution/`; binning + moments SQL builders in `src/lib/`.

## Dependencies

Broker flag + `numericColumns`.

## Acceptance criteria

- [ ] Titanic `Age`/`Fare`: histogram, box plot, and stats panel all correct (known values)
- [ ] Bin-count change re-queries and re-renders
- [ ] Outliers marked on the box plot per IQR
- [ ] Disabled with "Needs a numeric column" tooltip when no Quantitative exists

## Test plan

Unit: binning SQL (edge: constant column, single row, nulls); moment calculations against
known fixtures. E2E: Titanic Fare walkthrough.

## Definition of done

Stats verified against an external reference (e.g. pandas describe on the same sample);
lib functions documented for Phase-7 reuse.
