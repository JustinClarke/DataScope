import { describe, expect, it } from 'vitest';
import type { ClassifiedColumn, SemanticType, TableRegistryEntry } from '../types';
import { buildTaskSuggestions, buildTemplateSuggestions } from './querySuggester';

function col(semanticType: SemanticType, name: string): ClassifiedColumn {
  return {
    name,
    physicalType: 'DOUBLE',
    semanticType,
    cardinality: 10,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
  };
}

let tableSeq = 0;
function table(columns: ClassifiedColumn[] | undefined, tableName = 't'): TableRegistryEntry {
  return {
    id: `tbl-${tableSeq++}`,
    tableName,
    datasetId: 'ds-1',
    origin: 'file',
    rowCount: 100,
    columnCount: columns?.length ?? 0,
    memoryBytes: 1024,
    createdAt: '2026-07-19T00:00:00.000Z',
    columns,
  };
}

describe('buildTemplateSuggestions', () => {
  it('produces no group for an unclassified table', () => {
    expect(buildTemplateSuggestions([table(undefined)])).toEqual([]);
  });

  it('always includes the preview template for any classified table', () => {
    const [group] = buildTemplateSuggestions([table([col('Identifier', 'id')])]);
    expect(group.suggestions.map((s) => s.kind)).toEqual(['preview']);
    expect(group.suggestions[0].sql).toBe('SELECT * FROM "t" LIMIT 100');
  });

  it('only emits templates whose capability requirement is met', () => {
    const [group] = buildTemplateSuggestions([
      table([col('Categorical', 'segment'), col('Quantitative', 'revenue')]),
    ]);
    const kinds = group.suggestions.map((s) => s.kind);
    expect(kinds).toContain('categorical-numeric');
    expect(kinds).toContain('categorical-breakdown');
    expect(kinds).toContain('preview');
    expect(kinds).not.toContain('temporal-numeric-trend');
    expect(kinds).not.toContain('correlation');
    expect(kinds).not.toContain('textual-search');
  });

  it('emits both temporal-numeric templates once a date and a numeric column are present', () => {
    const [group] = buildTemplateSuggestions([table([col('Temporal', 'order_date'), col('Quantitative', 'total')])]);
    const kinds = group.suggestions.map((s) => s.kind);
    expect(kinds).toContain('temporal-numeric-trend');
    expect(kinds).toContain('temporal-numeric-moving-avg');
  });

  it('emits a correlation template only once two numeric columns are present', () => {
    const one = buildTemplateSuggestions([table([col('Quantitative', 'a')])])[0];
    expect(one.suggestions.map((s) => s.kind)).not.toContain('correlation');

    const two = buildTemplateSuggestions([table([col('Quantitative', 'a'), col('Quantitative', 'b')])])[0];
    const correlation = two.suggestions.find((s) => s.kind === 'correlation');
    expect(correlation?.sql).toBe('SELECT CORR("a", "b") as correlation FROM "t"');
  });

  it('emits a textual-search template only once a textual column is present', () => {
    const [group] = buildTemplateSuggestions([table([col('Textual', 'notes')])]);
    const search = group.suggestions.find((s) => s.kind === 'textual-search');
    expect(search?.sql).toBe(`SELECT "notes" FROM "t" WHERE "notes" ILIKE '%keyword%' LIMIT 50`);
  });

  it('quotes identifiers containing double quotes', () => {
    const [group] = buildTemplateSuggestions([table([col('Categorical', 'weird "col"')], 'weird "table"')]);
    const preview = group.suggestions.find((s) => s.kind === 'preview');
    expect(preview?.sql).toBe('SELECT * FROM "weird ""table""" LIMIT 100');
  });

  it('every suggestion carries a non-empty tooltip', () => {
    const [group] = buildTemplateSuggestions([
      table([col('Categorical', 'segment'), col('Quantitative', 'revenue'), col('Temporal', 'date'), col('Textual', 'notes')]),
    ]);
    for (const suggestion of group.suggestions) {
      expect(suggestion.tooltip.length).toBeGreaterThan(0);
    }
  });

  it('groups suggestions per table for a multi-table registry', () => {
    const groups = buildTemplateSuggestions([
      table([col('Categorical', 'x')], 'customers'),
      table([col('Quantitative', 'y')], 'orders'),
    ]);
    expect(groups.map((g) => g.tableName)).toEqual(['customers', 'orders']);
    expect(groups[0].suggestions.every((s) => s.sql.includes('"customers"'))).toBe(true);
    expect(groups[1].suggestions.every((s) => s.sql.includes('"orders"'))).toBe(true);
  });
});

describe('buildTaskSuggestions', () => {
  it('produces no group for an unclassified table', () => {
    expect(buildTaskSuggestions([table(undefined)])).toEqual([]);
  });

  it('emits no tasks when no capability is met', () => {
    const [group] = buildTaskSuggestions([table([col('Identifier', 'id')])]);
    expect(group.tasks).toEqual([]);
  });

  it('gates trend-over-time and period-over-period on Temporal + Quantitative', () => {
    const numericOnly = buildTaskSuggestions([table([col('Quantitative', 'revenue')])])[0];
    expect(numericOnly.tasks.map((t) => t.kind)).not.toContain('trend-over-time');
    expect(numericOnly.tasks.map((t) => t.kind)).not.toContain('period-over-period');

    const [group] = buildTaskSuggestions([table([col('Temporal', 'order_date'), col('Quantitative', 'revenue')])]);
    const kinds = group.tasks.map((t) => t.kind);
    expect(kinds).toContain('trend-over-time');
    expect(kinds).toContain('period-over-period');
  });

  it('gates top-n-by-segment on a Categorical column, falling back to COUNT(*) with no numeric column', () => {
    const [group] = buildTaskSuggestions([table([col('Categorical', 'segment')])]);
    const task = group.tasks.find((t) => t.kind === 'top-n-by-segment');
    expect(task?.sql).toContain('COUNT(*) AS value');
  });

  it('uses SUM of the numeric column for top-n-by-segment once one is present', () => {
    const [group] = buildTaskSuggestions([table([col('Categorical', 'segment'), col('Quantitative', 'revenue')])]);
    const task = group.tasks.find((t) => t.kind === 'top-n-by-segment');
    expect(task?.sql).toContain('SUM("revenue") AS value');
  });

  it('gates outliers on a Quantitative column', () => {
    const withNum = buildTaskSuggestions([table([col('Quantitative', 'revenue')])])[0];
    expect(withNum.tasks.map((t) => t.kind)).toContain('outliers');

    const withoutNum = buildTaskSuggestions([table([col('Categorical', 'segment')])])[0];
    expect(withoutNum.tasks.map((t) => t.kind)).not.toContain('outliers');
  });

  it('gates simple-cohort on Identifier + Temporal', () => {
    const [group] = buildTaskSuggestions([table([col('Identifier', 'customer_id'), col('Temporal', 'signup_date')])]);
    const task = group.tasks.find((t) => t.kind === 'simple-cohort');
    expect(task?.sql).toBe(
      `SELECT DATE_TRUNC('month', "signup_date") AS cohort_month, COUNT(DISTINCT "customer_id") AS cohort_size FROM "t" GROUP BY 1 ORDER BY 1`,
    );
  });

  it('every task carries a plain-language description', () => {
    const [group] = buildTaskSuggestions([
      table([
        col('Categorical', 'segment'),
        col('Quantitative', 'revenue'),
        col('Temporal', 'order_date'),
        col('Identifier', 'customer_id'),
      ]),
    ]);
    expect(group.tasks.length).toBeGreaterThan(0);
    for (const task of group.tasks) {
      expect(task.description.length).toBeGreaterThan(0);
    }
  });
});

// Bundled-sample suggestion sets (Definition of Done: "documented in tests").
// Only name/semanticType are given — the rest of ClassifiedColumn is inert
// for this module, same simplification classifier.test.ts's own bundled-
// sample fixture uses. Real column lists mirrored from that file's SAMPLES
// table so this stays in sync with what the live classifier actually
// produces for each of the five v0 samples.
const BUNDLED_SAMPLES: Array<{ table: string; columns: Array<[name: string, type: SemanticType]> }> = [
  {
    table: 'titanic',
    columns: [
      ['PassengerId', 'Identifier'],
      ['Survived', 'Categorical'],
      ['Pclass', 'Categorical'],
      ['Name', 'Textual'],
      ['Sex', 'Categorical'],
      ['Age', 'Quantitative'],
      ['SibSp', 'Categorical'],
      ['Parch', 'Categorical'],
      ['Fare', 'Quantitative'],
      ['Embarked', 'Categorical'],
    ],
  },
  {
    table: 'stock_prices',
    columns: [
      ['Date', 'Temporal'],
      ['Open', 'Quantitative'],
      ['High', 'Quantitative'],
      ['Low', 'Quantitative'],
      ['Close', 'Quantitative'],
      ['Volume', 'Identifier'],
    ],
  },
  {
    table: 'product_reviews',
    columns: [
      ['ReviewId', 'Identifier'],
      ['ProductId', 'Quantitative'],
      ['Rating', 'Categorical'],
      ['ReviewText', 'Categorical'],
      ['ReviewDate', 'Temporal'],
    ],
  },
  {
    table: 'weather',
    columns: [
      ['Date', 'Temporal'],
      ['City', 'Categorical'],
      ['TempHighC', 'Quantitative'],
      ['TempLowC', 'Quantitative'],
      ['Humidity', 'Quantitative'],
      ['WindKph', 'Quantitative'],
    ],
  },
  {
    table: 'ecommerce/customers',
    columns: [
      ['customer_id', 'Identifier'],
      ['name', 'Categorical'],
      ['email', 'Identifier'],
      ['country', 'Categorical'],
      ['signup_date', 'Temporal'],
    ],
  },
  {
    table: 'ecommerce/products',
    columns: [
      ['product_id', 'Identifier'],
      ['name', 'Identifier'],
      ['category', 'Categorical'],
      ['unit_price', 'Identifier'],
    ],
  },
  {
    table: 'ecommerce/orders',
    columns: [
      ['order_id', 'Identifier'],
      ['customer_id', 'Quantitative'],
      ['order_date', 'Temporal'],
      ['status', 'Categorical'],
    ],
  },
  {
    table: 'ecommerce/order_items',
    columns: [
      ['order_item_id', 'Identifier'],
      ['order_id', 'Quantitative'],
      ['product_id', 'Quantitative'],
      ['quantity', 'Categorical'],
      ['unit_price', 'Quantitative'],
    ],
  },
];

describe('bundled samples — suggestion sets', () => {
  for (const sample of BUNDLED_SAMPLES) {
    it(`${sample.table}: every template and task is non-empty, valid-looking SQL`, () => {
      const t = table(
        sample.columns.map(([name, semanticType]) => col(semanticType, name)),
        sample.table,
      );

      const [templateGroup] = buildTemplateSuggestions([t]);
      const [taskGroup] = buildTaskSuggestions([t]);

      // Every bundled sample has at least one classified column, so it always
      // gets at least the "Any dataset" preview template.
      expect(templateGroup.suggestions.length).toBeGreaterThan(0);
      for (const suggestion of templateGroup.suggestions) {
        expect(suggestion.sql).toContain(`"${sample.table}"`);
        expect(suggestion.sql.trim().toUpperCase().startsWith('SELECT')).toBe(true);
      }
      for (const task of taskGroup.tasks) {
        expect(task.sql).toContain(`"${sample.table}"`);
        expect(task.sql.trim().toUpperCase().startsWith('SELECT') || task.sql.trim().toUpperCase().startsWith('WITH')).toBe(
          true,
        );
      }
    });
  }
});
