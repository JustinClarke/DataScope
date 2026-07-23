import { describe, expect, it } from 'vitest';
import type { ColumnProfile, SemanticType } from '../types';
import {
  CATEGORICAL_CARDINALITY_MAX,
  IDENTIFIER_UNIQUE_RATIO,
  TEXTUAL_CARDINALITY_MIN,
  classificationReason,
  classifyColumn,
  classifyColumns,
  manualOverrideReason,
} from './classifier';

// A profile carries eight fields; only `physicalType` and `cardinality` steer
// classification, so the rest are filled with inert placeholders here.
function profile(physicalType: string, cardinality: number): ColumnProfile {
  return {
    name: 'col',
    physicalType,
    cardinality,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
  };
}

describe('classifyColumn — one row per classification rule', () => {
  const cases: Array<{ label: string; type: string; cardinality: number; rows: number; expected: SemanticType }> = [
    { label: 'DATE is temporal at any cardinality', type: 'DATE', cardinality: 3650, rows: 3650, expected: 'Temporal' },
    { label: 'TIMESTAMP is temporal', type: 'TIMESTAMP', cardinality: 12, rows: 1000, expected: 'Temporal' },
    { label: 'TIMESTAMPTZ is temporal', type: 'TIMESTAMPTZ', cardinality: 500, rows: 500, expected: 'Temporal' },
    { label: 'TIME is temporal', type: 'TIME', cardinality: 24, rows: 1000, expected: 'Temporal' },
    { label: 'high-cardinality BIGINT is quantitative', type: 'BIGINT', cardinality: 66, rows: 3650, expected: 'Quantitative' },
    { label: 'high-cardinality DOUBLE is quantitative', type: 'DOUBLE', cardinality: 281, rows: 3650, expected: 'Quantitative' },
    { label: 'very-low-cardinality INTEGER is categorical', type: 'INTEGER', cardinality: 2, rows: 891, expected: 'Categorical' },
    { label: 'low-cardinality BIGINT is categorical', type: 'BIGINT', cardinality: 5, rows: 500, expected: 'Categorical' },
    { label: 'low-cardinality VARCHAR is categorical', type: 'VARCHAR', cardinality: 4, rows: 1400, expected: 'Categorical' },
    { label: 'BOOLEAN is categorical', type: 'BOOLEAN', cardinality: 2, rows: 1000, expected: 'Categorical' },
    { label: 'moderate-cardinality VARCHAR is categorical', type: 'VARCHAR', cardinality: 64, rows: 400, expected: 'Categorical' },
    { label: 'high-cardinality VARCHAR is textual', type: 'VARCHAR', cardinality: 120, rows: 891, expected: 'Textual' },
    { label: 'near-unique VARCHAR is an identifier', type: 'VARCHAR', cardinality: 400, rows: 400, expected: 'Identifier' },
    { label: 'near-unique BIGINT is an identifier', type: 'BIGINT', cardinality: 891, rows: 891, expected: 'Identifier' },
  ];

  it.each(cases)('$label', ({ type, cardinality, rows, expected }) => {
    expect(classifyColumn(profile(type, cardinality), rows)).toBe(expected);
  });
});

describe('classifyColumn — boundary cardinalities', () => {
  // Categorical/Quantitative split for numerics is at CATEGORICAL_CARDINALITY_MAX (15):
  // `<= 15` categorical, `> 15` quantitative.
  it(`numeric with cardinality exactly ${CATEGORICAL_CARDINALITY_MAX} is categorical`, () => {
    expect(classifyColumn(profile('BIGINT', 15), 10_000)).toBe('Categorical');
  });
  it(`numeric with cardinality ${CATEGORICAL_CARDINALITY_MAX + 1} is quantitative`, () => {
    expect(classifyColumn(profile('BIGINT', 16), 10_000)).toBe('Quantitative');
  });
  it(`string with cardinality exactly ${CATEGORICAL_CARDINALITY_MAX} is categorical`, () => {
    expect(classifyColumn(profile('VARCHAR', 15), 10_000)).toBe('Categorical');
  });
  it(`string with cardinality ${CATEGORICAL_CARDINALITY_MAX + 1} is categorical (moderate)`, () => {
    expect(classifyColumn(profile('VARCHAR', 16), 10_000)).toBe('Categorical');
  });

  // Categorical/Textual split for strings is at TEXTUAL_CARDINALITY_MIN (100):
  // `<= 100` categorical, `> 100` textual.
  it(`string with cardinality exactly ${TEXTUAL_CARDINALITY_MIN} is categorical`, () => {
    expect(classifyColumn(profile('VARCHAR', 100), 10_000)).toBe('Categorical');
  });
  it(`string with cardinality ${TEXTUAL_CARDINALITY_MIN + 1} is textual`, () => {
    expect(classifyColumn(profile('VARCHAR', 101), 10_000)).toBe('Textual');
  });

  // Identifier split is at unique ratio IDENTIFIER_UNIQUE_RATIO (0.95), strictly
  // greater. A ratio of exactly 0.95 is NOT an identifier.
  it(`unique ratio exactly ${IDENTIFIER_UNIQUE_RATIO} is not an identifier`, () => {
    // 950 / 1000 = 0.95 exactly → falls through to the numeric rule.
    expect(classifyColumn(profile('BIGINT', 950), 1000)).toBe('Quantitative');
  });
  it(`unique ratio just above ${IDENTIFIER_UNIQUE_RATIO} is an identifier`, () => {
    // 951 / 1000 = 0.951 > 0.95 → identifier.
    expect(classifyColumn(profile('BIGINT', 951), 1000)).toBe('Identifier');
  });
  it('temporal wins over a near-unique ratio (a DATE key is still a time axis)', () => {
    expect(classifyColumn(profile('DATE', 1000), 1000)).toBe('Temporal');
  });
});

describe('classifyColumn — unrecognized and degenerate inputs never crash', () => {
  it.each(['STRUCT', 'LIST', 'BLOB', 'INTERVAL', 'MAP', 'UUID', 'ENUM', ''])(
    'exotic type %s falls back to Identifier',
    (type) => {
      expect(classifyColumn(profile(type, 5), 100)).toBe('Identifier');
    },
  );

  it('a 0-row table does not divide by zero (ratio treated as 0)', () => {
    expect(classifyColumn(profile('BIGINT', 0), 0)).toBe('Categorical');
    expect(classifyColumn(profile('VARCHAR', 0), 0)).toBe('Categorical');
    expect(classifyColumn(profile('DATE', 0), 0)).toBe('Temporal');
  });

  it('DECIMAL(9,2) with a precision suffix is still numeric', () => {
    expect(classifyColumn(profile('DECIMAL(9,2)', 3), 1000)).toBe('Categorical');
    expect(classifyColumn(profile('DECIMAL(18,4)', 900), 1000)).toBe('Quantitative');
  });
});

describe('classificationReason describes the deciding rule', () => {
  it('reports the unique percentage for an identifier', () => {
    expect(classificationReason(profile('VARCHAR', 998), 1000)).toBe('99.8% unique — near one value per row');
  });
  it('names the distinct count for a low-cardinality numeric category', () => {
    expect(classificationReason(profile('BIGINT', 2), 891)).toBe(
      'low-cardinality numbers (2 distinct) — likely encoded categories',
    );
  });
  it('describes a continuous numeric column', () => {
    expect(classificationReason(profile('DOUBLE', 836), 891)).toBe('continuous numeric (836 distinct values)');
  });
  it('describes free text', () => {
    expect(classificationReason(profile('VARCHAR', 120), 891)).toBe('free text (120 distinct values)');
  });
  it('describes a temporal column', () => {
    expect(classificationReason(profile('DATE', 2500), 2500)).toBe('DATE values — treated as a time axis');
  });
  it('manualOverrideReason names the chosen type', () => {
    expect(manualOverrideReason('Quantitative')).toBe('Set manually to Quantitative');
  });
});

describe('classifyColumns attaches semanticType and reason to every column', () => {
  it('produces a ClassifiedColumn per profile, carrying other fields through', () => {
    const profiles: ColumnProfile[] = [
      { ...profile('BIGINT', 2), name: 'Survived', min: 0, max: 1 },
      { ...profile('DOUBLE', 836), name: 'Fare', mean: 32.2 },
    ];
    const classified = classifyColumns(profiles, 891);

    expect(classified).toHaveLength(2);
    expect(classified[0]).toMatchObject({
      name: 'Survived',
      semanticType: 'Categorical',
      min: 0,
      max: 1,
      classificationReason: 'low-cardinality numbers (2 distinct) — likely encoded categories',
    });
    expect(classified[1]).toMatchObject({
      name: 'Fare',
      semanticType: 'Quantitative',
      mean: 32.2,
      classificationReason: 'continuous numeric (836 distinct values)',
    });
  });
});

// ---------------------------------------------------------------------------
// Bundled-sample expected classifications (Definition of Done: documented in
// the test file). Each row is (columnName, DuckDB physicalType, cardinality,
// expected semanticType). Cardinalities are the distinct counts in the
// generated fixtures under public/samples/; DuckDB reports them via
// approx_unique (HyperLogLog), so the live pipeline may differ by a few counts
// on high-cardinality columns without changing any classification here.
//
// Heuristic notes worth calling out (the §17 manual override exists precisely
// for these — the rules are deliberately simple, not always semantically
// "right"):
//   - Any near-unique numeric reads as Identifier: stock_prices.Volume,
//     products.unit_price. Really continuous, but > 95% unique.
//   - Foreign-key integers with many distinct values read as Quantitative:
//     product_reviews.ProductId, orders.customer_id, order_items.order_id /
//     product_id. Really identifiers/categories, but > 15 distinct and < 95%
//     unique.
//   - A free-text column with few distinct values reads as Categorical:
//     product_reviews.ReviewText (10 templated bodies in the fixture).
// ---------------------------------------------------------------------------

type ColumnSpec = [name: string, physicalType: string, cardinality: number, expected: SemanticType];

const SAMPLES: Array<{ table: string; rows: number; columns: ColumnSpec[] }> = [
  {
    table: 'titanic',
    rows: 891,
    columns: [
      ['PassengerId', 'BIGINT', 891, 'Identifier'],
      ['Survived', 'BIGINT', 2, 'Categorical'],
      ['Pclass', 'BIGINT', 3, 'Categorical'],
      ['Name', 'VARCHAR', 120, 'Textual'],
      ['Sex', 'VARCHAR', 2, 'Categorical'],
      ['Age', 'BIGINT', 77, 'Quantitative'],
      ['SibSp', 'BIGINT', 4, 'Categorical'],
      ['Parch', 'BIGINT', 3, 'Categorical'],
      ['Fare', 'DOUBLE', 836, 'Quantitative'],
      ['Embarked', 'VARCHAR', 3, 'Categorical'],
    ],
  },
  {
    table: 'stock_prices',
    rows: 2500,
    columns: [
      ['Date', 'DATE', 2500, 'Temporal'],
      ['Open', 'DOUBLE', 2295, 'Quantitative'],
      ['High', 'DOUBLE', 2294, 'Quantitative'],
      ['Low', 'DOUBLE', 2288, 'Quantitative'],
      ['Close', 'DOUBLE', 2295, 'Quantitative'],
      ['Volume', 'BIGINT', 2499, 'Identifier'],
    ],
  },
  {
    table: 'product_reviews',
    rows: 520,
    columns: [
      ['ReviewId', 'BIGINT', 500, 'Identifier'],
      ['ProductId', 'BIGINT', 119, 'Quantitative'],
      ['Rating', 'BIGINT', 5, 'Categorical'],
      ['ReviewText', 'VARCHAR', 10, 'Categorical'],
      ['ReviewDate', 'DATE', 360, 'Temporal'],
    ],
  },
  {
    table: 'weather',
    rows: 3650,
    columns: [
      ['Date', 'DATE', 3650, 'Temporal'],
      ['City', 'VARCHAR', 1, 'Categorical'],
      ['TempHighC', 'DOUBLE', 281, 'Quantitative'],
      ['TempLowC', 'DOUBLE', 291, 'Quantitative'],
      ['Humidity', 'BIGINT', 66, 'Quantitative'],
      ['WindKph', 'DOUBLE', 381, 'Quantitative'],
    ],
  },
  {
    table: 'ecommerce/customers',
    rows: 400,
    columns: [
      ['customer_id', 'BIGINT', 400, 'Identifier'],
      ['name', 'VARCHAR', 64, 'Categorical'],
      ['email', 'VARCHAR', 400, 'Identifier'],
      ['country', 'VARCHAR', 8, 'Categorical'],
      ['signup_date', 'DATE', 363, 'Temporal'],
    ],
  },
  {
    table: 'ecommerce/products',
    rows: 150,
    columns: [
      ['product_id', 'BIGINT', 150, 'Identifier'],
      ['name', 'VARCHAR', 150, 'Identifier'],
      ['category', 'VARCHAR', 6, 'Categorical'],
      ['unit_price', 'DOUBLE', 150, 'Identifier'],
    ],
  },
  {
    table: 'ecommerce/orders',
    rows: 1400,
    columns: [
      ['order_id', 'BIGINT', 1400, 'Identifier'],
      ['customer_id', 'BIGINT', 396, 'Quantitative'],
      ['order_date', 'DATE', 783, 'Temporal'],
      ['status', 'VARCHAR', 4, 'Categorical'],
    ],
  },
  {
    table: 'ecommerce/order_items',
    rows: 3487,
    columns: [
      ['order_item_id', 'BIGINT', 3487, 'Identifier'],
      ['order_id', 'BIGINT', 1400, 'Quantitative'],
      ['product_id', 'BIGINT', 150, 'Quantitative'],
      ['quantity', 'BIGINT', 5, 'Categorical'],
      ['unit_price', 'DOUBLE', 150, 'Quantitative'],
    ],
  },
];

describe('bundled samples — column-by-column expected classifications', () => {
  for (const sample of SAMPLES) {
    describe(sample.table, () => {
      it.each(sample.columns)('%s (%s) → %s', (_name, type, cardinality, expected) => {
        expect(classifyColumn(profile(type, cardinality), sample.rows)).toBe(expected);
      });
    });
  }
});
