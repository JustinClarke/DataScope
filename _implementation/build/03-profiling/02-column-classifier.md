# 03.2 Semantic Column Classifier

**Tier:** v0 · Phase 1 · **Master spec:** §8 step 2, §17 (misclassification risk)

## Objective

Classify every column into a semantic type that determines which modules are available —
plus a manual override, because the heuristics will be wrong sometimes.

## Types & interface (§8)

```typescript
type SemanticType = 'Temporal' | 'Quantitative' | 'Categorical' | 'Textual' | 'Identifier';

interface ClassifiedColumn {
  name: string;
  physicalType: string;       // DuckDB type: VARCHAR, BIGINT, DOUBLE, DATE, ...
  semanticType: SemanticType;
  cardinality: number;        // approx_unique from SUMMARIZE
  nullPercentage: number | null; // null on a 0-row table (01-summary-statistics finding)
  min: string | number | null;
  max: string | number | null;
  mean: number | null;
  stdDev: number | null;
  classificationReason?: string; // why this semanticType was assigned — powers the §17 reasoning tooltip; "Set manually" after a user override
}
```

## Classification rules (§8 — implement exactly, then tune from spike evidence)

| DuckDB physical type | Cardinality | Semantic type | Rationale |
| :--- | :--- | :--- | :--- |
| `DATE`, `TIMESTAMP`, `TIME` | any | **Temporal** | Time-series, trends |
| numeric | high (> 15) | **Quantitative** | Continuous — stats, regression |
| `BIGINT`, `INTEGER` | very low (2–5) | **Categorical** | Encoded labels (0/1, 1/2/3) |
| `VARCHAR`, `BOOLEAN` | low (< 15) | **Categorical** | Discrete groups |
| `VARCHAR` | high (> 100) | **Textual** | Free text — search, (later) NLP |
| `VARCHAR`, `BIGINT` | ≈ row count | **Identifier** | PKs, URLs, UUIDs — skip for analysis |

```typescript
function classifyColumn(col: DuckDBSummaryRow, totalRows: number): SemanticType {
  const { column_type, approx_unique } = col;
  const uniqueRatio = approx_unique / totalRows;

  if (['DATE', 'TIMESTAMP', 'TIMESTAMPTZ', 'TIME'].includes(column_type)) return 'Temporal';
  if (uniqueRatio > 0.95) return 'Identifier';

  if (['BIGINT', 'INTEGER', 'DOUBLE', 'FLOAT', 'HUGEINT', 'SMALLINT', 'TINYINT', 'DECIMAL'].includes(column_type)) {
    if (approx_unique <= 15) return 'Categorical';   // encoded categories (e.g. survived 0/1)
    return 'Quantitative';
  }

  if (column_type === 'VARCHAR' || column_type === 'BOOLEAN') {
    if (approx_unique <= 15) return 'Categorical';
    if (approx_unique > 100) return 'Textual';
    return 'Categorical';                            // moderate-cardinality strings
  }

  return 'Identifier';                               // unknown types → non-analytical
}
```

**Cardinality source for the identifier rule (§8).** The pseudocode reads `approx_unique`, but `SUMMARIZE`'s HyperLogLog estimate was measured overshooting the row count on the bundled samples (Titanic `Fare` at ~105% "unique", `PassengerId` at ~118%) — enough to mislabel `Fare` as Identifier and break this item's own acceptance criterion. The near-unique test is decided on an **exact `COUNT(DISTINCT)`** per column (one extra single-pass query); `ColumnProfile.cardinality` keeps the raw `approx_unique` for display, `ClassifiedColumn.cardinality` carries the exact count.

## Manual override (§17 mitigation — required, not optional)

Users can re-classify any column; the UI shows classification reasoning in a tooltip
("classified Identifier: 99.8% unique"). Overrides re-run the broker and persist for the
session. Enforcement UI lands with Phase-6 polish, but the override *mechanism* ships now.

## Double duty (§8)

Output feeds (a) the capabilities broker (§9) and (b) the AI layer's schema-pruned prompts
(§11.1 stage 2) — names, types, semantic roles are exactly the NL→SQL context.

## Files

`src/lib/classifier.ts`, `src/hooks/useSchemaClassifier.ts`, override action in the schema
store.

## Dependencies

[01-summary-statistics.md](01-summary-statistics.md).

## Acceptance criteria

- [ ] Mixed-type CSV → all columns correctly classified (§18)
- [ ] Titanic: `Survived`/`Pclass` → Categorical (low-cardinality ints), `Age`/`Fare` → Quantitative
- [ ] Near-unique VARCHAR/BIGINT → Identifier; excluded from analysis defaults
- [ ] Override re-classifies, re-runs broker, shows reasoning tooltip
- [ ] Unknown/exotic DuckDB types fall back to Identifier, never crash

## Test plan

Unit table-driven tests per rule row + boundary cardinalities (15/16, 100/101, ratio 0.95).
All five bundled samples asserted column-by-column. Spike note: log real-world
misclassifications from messy CSVs and tune thresholds *with recorded rationale*.

## Definition of done

Sample-by-sample expected classifications documented in the test file; broker and profile UI
consume `ClassifiedColumn[]` only.
