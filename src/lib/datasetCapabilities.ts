// Capability detection for the phrase-library synthesis candidate
// (_implementation/_misc/_ideation/ai architecture experimentation/01-phrase-library.md).
// Reduces StructuralFacts to a set of capability keys — pure, deterministic, no
// model call. Each key names a class of analysis the dataset's *shape* (never
// its values) supports; eval/claude/01-phrase-library looks up authored phrasings for
// whatever this returns and a model only selects among them. A key this
// function doesn't return is never offered — this function is the whole
// contract, so its false positives and false negatives are the candidate's.
//
// Real product code, kept independent of the candidate's eventual fate (the
// design doc's own "What to build" #1 calls it worth having either way).
import type { StructuralFacts } from '../../edge/protocol';

export type CapabilityKey =
  | 'seasonality'
  | 'cohort-retention'
  | 'group-comparison'
  | 'lifetime-value'
  | 'correlation-study';

/** Fixed, stable presentation/iteration order — output order never depends on table iteration order. */
export const CAPABILITY_KEY_ORDER: CapabilityKey[] = [
  'seasonality',
  'cohort-retention',
  'group-comparison',
  'lifetime-value',
  'correlation-study',
];

type Table = StructuralFacts['tables'][number];
type Column = Table['columns'][number];

// Mirrors src/lib/classifier.ts's own thresholds — a column's classification
// already encodes cardinality-vs-rowCount, so these are only needed here for
// the ratio check `isRepeatedEntityKey` runs directly (see its comment below).
const CATEGORICAL_CARDINALITY_MAX = 15;
const IDENTIFIER_UNIQUE_RATIO = 0.95;

// A column name conventionally naming a foreign/entity key (this dataset's own
// ecommerce sample uses this convention throughout: customer_id, order_id,
// product_id). Required, not just cardinality/ratio: verified against the real
// samples that ratio+cardinality alone over-fires — weather's TempHighC
// (281 distinct / 3650 rows, cardinality 281 > 15) clears the same band a
// genuine repeated entity key does, despite being a continuous measurement,
// not a foreign key. The name gate is what keeps cohort-retention from reading
// "the same customers keep coming back" into a dataset with no customer
// concept in it at all.
const ENTITY_KEY_NAME_PATTERN = /_id$/i;

// A Quantitative column name that reads as a monetary amount — the signal
// `lifetime-value`'s cross-table join needs to tell a price-like column from
// an arbitrary numeric one (verified against order_items.unit_price).
const MONEY_NAME_PATTERN = /price|cost|amount|revenue|total|fee|charge|value/i;

/**
 * True when `column` reads as a repeated reference to some other entity: named
 * like a foreign key, and neither near-unique (a table's own primary key) nor
 * a small handful of categories (a low-cardinality Categorical). Exported so
 * the eval harness's extractive-floor control arm can cite the same evidence
 * this detector used, rather than re-deriving a second definition of it.
 */
export function isRepeatedEntityKey(column: Column, rowCount: number): boolean {
  if (!ENTITY_KEY_NAME_PATTERN.test(column.name)) return false;
  const ratio = rowCount > 0 ? column.cardinality / rowCount : 0;
  return column.cardinality > CATEGORICAL_CARDINALITY_MAX && ratio <= IDENTIFIER_UNIQUE_RATIO;
}

/** Temporal + Quantitative + Categorical, all on one table (README's F2 case: weather's
 * Date + TempHighC/etc. + City). Deliberately does not exclude ID-shaped Quantitative
 * columns (see the Verdict for the two samples where that produces a known,
 * documented false-ish-positive rather than a silently patched one). */
function hasSeasonality(table: Table): boolean {
  const temporal = table.columns.some((c) => c.semanticType === 'Temporal');
  const quantitative = table.columns.some((c) => c.semanticType === 'Quantitative');
  const categorical = table.columns.some((c) => c.semanticType === 'Categorical');
  return temporal && quantitative && categorical;
}

/** Temporal + a repeated entity key, same table (orders.order_date + orders.customer_id). */
function hasCohortRetention(table: Table): boolean {
  const temporal = table.columns.some((c) => c.semanticType === 'Temporal');
  if (!temporal) return false;
  return table.columns.some((c) => isRepeatedEntityKey(c, table.rowCount));
}

/** A Categorical column with exactly 2 values, alongside a Quantitative column, same table
 * (titanic's Survived/Sex, card 2, + Age/Fare). */
function hasGroupComparison(table: Table): boolean {
  const twoValueCategorical = table.columns.some((c) => c.semanticType === 'Categorical' && c.cardinality === 2);
  const quantitative = table.columns.some((c) => c.semanticType === 'Quantitative');
  return twoValueCategorical && quantitative;
}

/** 2 or more Quantitative columns, same table — the weakest proxy here: StructuralFacts
 * carries no correlation field at all, so this is a structural stand-in, not a claim
 * of an actually-computed correlation (see the Verdict). */
function hasCorrelationStudy(table: Table): boolean {
  return table.columns.filter((c) => c.semanticType === 'Quantitative').length >= 2;
}

/** Cross-table only: two distinct tables sharing a column name (the join key), one side
 * carrying a Temporal column and the other a money-ish-named Quantitative column
 * (orders.order_date + order_items.unit_price, joined on order_id). */
function hasLifetimeValue(tables: readonly Table[]): boolean {
  for (const a of tables) {
    for (const b of tables) {
      if (a.name === b.name) continue;
      const bNames = new Set(b.columns.map((c) => c.name));
      const sharesJoinKey = a.columns.some((c) => bNames.has(c.name));
      if (!sharesJoinKey) continue;
      const aTemporal = a.columns.some((c) => c.semanticType === 'Temporal');
      const bMoney = b.columns.some((c) => c.semanticType === 'Quantitative' && MONEY_NAME_PATTERN.test(c.name));
      if (aTemporal && bMoney) return true;
    }
  }
  return false;
}

/**
 * Reduces `facts` to the capability keys the dataset's shape supports. Checks
 * every table for the four same-table rules and the whole dataset once for the
 * one cross-table rule; a key fires if any table (or table pair) satisfies its
 * rule. Order is fixed (`CAPABILITY_KEY_ORDER`), not table-iteration order.
 */
export function detectCapabilities(facts: StructuralFacts): CapabilityKey[] {
  const found = new Set<CapabilityKey>();
  for (const table of facts.tables) {
    if (hasSeasonality(table)) found.add('seasonality');
    if (hasCohortRetention(table)) found.add('cohort-retention');
    if (hasGroupComparison(table)) found.add('group-comparison');
    if (hasCorrelationStudy(table)) found.add('correlation-study');
  }
  if (hasLifetimeValue(facts.tables)) found.add('lifetime-value');
  return CAPABILITY_KEY_ORDER.filter((key) => found.has(key));
}
