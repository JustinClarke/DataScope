# 05.4 Categorical Breakdown

**Tier:** v0 · Phase 3 · **Master spec:** §10 Module 6 · **Gate:** `canDoCategoricalBreakdown`
(≥ 1 Categorical)

## Objective

Group-level views for categorical columns, alone or against a quantitative measure.

## Spec

- **Frequency bar chart** — horizontal, sorted descending (`GROUP BY … ORDER BY COUNT(*) DESC`).
- **Pie / donut chart** for small-cardinality categories (cap slices; lump the tail into
  "other" past a threshold).
- **Grouped bar chart** combining Categorical + Quantitative (e.g., average salary by
  department) when both exist.
- Column pickers from `categoricalColumns` / `numericColumns`; SQL in the educational panel.

## Files

`src/features/charts/categorical/`; frequency/grouped SQL builders in `src/lib/` (reused by
the insight feed's concentration + outlier-group rules).

## Dependencies

Broker flag + column refs.

## Acceptance criteria

- [ ] Titanic `Pclass`/`Survived` and reviews `Rating` render correct frequencies
- [ ] Donut only offered at small cardinality; tail lumping works
- [ ] Grouped bar renders Categorical × Quantitative correctly (Titanic: avg Fare by Pclass)
- [ ] Disabled with a clear tooltip on a no-Categorical dataset

## Test plan

Unit: SQL builders incl. tail-lumping. E2E: Titanic walkthrough across all three chart
shapes. Gate check on stock-prices (no Categorical → disabled).

## Definition of done

All four §14 samples with categorical columns verified; v0 ship-gate checklist for charts
can run end-to-end.
