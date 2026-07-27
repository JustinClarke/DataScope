import { describe, expect, it } from 'vitest';
import type { StructuralFacts } from '../../edge/protocol';
import { detectCapabilities, isRepeatedEntityKey } from './datasetCapabilities';

type Table = StructuralFacts['tables'][number];
type Column = Table['columns'][number];

// Real §14 sample shapes, hand-derived from the actual CSVs and the real
// classifier (src/lib/classifier.ts) — not the doc's abstract examples. Row
// and distinct counts computed directly from public/samples/*.csv.
function col(
  name: string,
  semanticType: Column['semanticType'],
  cardinality: number,
  extra: Partial<Column> = {},
): Column {
  return { name, semanticType, physicalType: 'n/a', nullPercentage: 0, cardinality, ...extra };
}

function table(name: string, rowCount: number, columns: Column[]): Table {
  return { name, rowCount, columns };
}

const titanic: StructuralFacts = {
  tables: [
    table('titanic', 891, [
      col('PassengerId', 'Identifier', 891),
      col('Survived', 'Categorical', 2),
      col('Pclass', 'Categorical', 3),
      col('Name', 'Textual', 120),
      col('Sex', 'Categorical', 2),
      col('Age', 'Quantitative', 77),
      col('SibSp', 'Categorical', 4),
      col('Parch', 'Categorical', 3),
      col('Fare', 'Quantitative', 836),
      col('Embarked', 'Categorical', 3),
    ]),
  ],
};

const weather: StructuralFacts = {
  tables: [
    table('weather', 3650, [
      col('Date', 'Temporal', 3650),
      col('City', 'Categorical', 1),
      col('TempHighC', 'Quantitative', 281),
      col('TempLowC', 'Quantitative', 291),
      col('Humidity', 'Quantitative', 66),
      col('WindKph', 'Quantitative', 381),
    ]),
  ],
};

const stockPrices: StructuralFacts = {
  tables: [
    table('stock_prices', 2500, [
      col('Date', 'Temporal', 2500),
      col('Open', 'Quantitative', 2295),
      col('High', 'Quantitative', 2294),
      col('Low', 'Quantitative', 2288),
      col('Close', 'Quantitative', 2295),
      col('Volume', 'Identifier', 2499), // ratio 0.9996 > 0.95
    ]),
  ],
};

const productReviews: StructuralFacts = {
  tables: [
    table('product_reviews', 520, [
      col('ReviewId', 'Identifier', 500), // ratio 0.9615 > 0.95
      col('ProductId', 'Quantitative', 119), // >15, non-underscore name
      col('Rating', 'Categorical', 5),
      col('ReviewText', 'Categorical', 10),
      col('ReviewDate', 'Temporal', 360),
    ]),
  ],
};

const ecommerce: StructuralFacts = {
  tables: [
    table('customers', 400, [
      col('customer_id', 'Identifier', 400),
      col('name', 'Categorical', 64),
      col('email', 'Identifier', 400),
      col('country', 'Categorical', 8),
      col('signup_date', 'Temporal', 363),
    ]),
    table('products', 150, [
      col('product_id', 'Identifier', 150),
      col('name', 'Identifier', 150),
      col('category', 'Categorical', 6),
      col('unit_price', 'Identifier', 150), // ratio 1.0 here — every product priced uniquely
    ]),
    table('orders', 1400, [
      col('order_id', 'Identifier', 1400),
      col('customer_id', 'Quantitative', 396), // ratio 0.283, >15 — the classifier's own call
      col('order_date', 'Temporal', 783),
      col('status', 'Categorical', 4),
    ]),
    table('order_items', 3487, [
      col('order_item_id', 'Identifier', 3487),
      col('order_id', 'Quantitative', 1400),
      col('product_id', 'Quantitative', 150),
      col('quantity', 'Categorical', 5),
      col('unit_price', 'Quantitative', 150),
    ]),
  ],
};

describe('detectCapabilities — all five §14 samples', () => {
  it('titanic: group-comparison + correlation-study, never seasonality (no Temporal column at all)', () => {
    expect(detectCapabilities(titanic)).toEqual(['group-comparison', 'correlation-study']);
  });

  it('weather: seasonality + correlation-study (the README F2 case: Date + City + TempHighC/etc.)', () => {
    expect(detectCapabilities(weather)).toEqual(['seasonality', 'correlation-study']);
  });

  it('stock_prices: correlation-study only (no Categorical column at all)', () => {
    expect(detectCapabilities(stockPrices)).toEqual(['correlation-study']);
  });

  it('product_reviews: seasonality only, via the documented false-ish-positive (ProductId misclassified Quantitative)', () => {
    expect(detectCapabilities(productReviews)).toEqual(['seasonality']);
  });

  it('ecommerce: detects lifetime-value and cohort-retention (kill criterion b), plus seasonality and correlation-study', () => {
    const detected = detectCapabilities(ecommerce);
    expect(detected).toContain('lifetime-value');
    expect(detected).toContain('cohort-retention');
    expect(detected).toEqual(['seasonality', 'cohort-retention', 'lifetime-value', 'correlation-study']);
  });
});

describe('isRepeatedEntityKey — the false-positive it exists to prevent', () => {
  it('rejects a continuous measurement even when cardinality/rowCount clears the same band as a real key', () => {
    // weather.TempHighC: 281/3650 = 0.077 — well inside the "repeated, non-trivial
    // cardinality" band a real entity key like customer_id occupies (0.283). Only the
    // name gate tells them apart; without it, cohort-retention would fire on every
    // dataset with a time column and any non-identifier numeric column at all.
    expect(isRepeatedEntityKey(col('TempHighC', 'Quantitative', 281), 3650)).toBe(false);
  });

  it('rejects a PascalCase id column with no underscore (ProductId)', () => {
    expect(isRepeatedEntityKey(col('ProductId', 'Quantitative', 119), 520)).toBe(false);
  });

  it('accepts a snake_case _id column in the repeated, non-trivial-cardinality band', () => {
    expect(isRepeatedEntityKey(col('customer_id', 'Quantitative', 396), 1400)).toBe(true);
  });

  it('rejects a table\'s own near-unique primary key even when it matches the name pattern', () => {
    expect(isRepeatedEntityKey(col('order_item_id', 'Identifier', 3487), 3487)).toBe(false);
  });
});
