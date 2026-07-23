import { describe, expect, it } from 'vitest';
import type { ClassifiedColumn, SemanticType, TableRegistryEntry } from '../types';
import type { InsightCandidate, TableInsights } from './insights';
import { INTEREST_FLOOR, evaluateCapabilities, rankNextActions } from './capabilities';

// A classified column carries ten fields; only `name` and `semanticType` steer
// the broker, so the rest are inert placeholders here.
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

// One table whose columns are exactly the given semantic types, auto-named so
// every column reference is distinct.
function tableOfTypes(types: SemanticType[], tableName = 't'): TableRegistryEntry {
  return table(
    types.map((semanticType, i) => col(semanticType, `${semanticType.toLowerCase()}_${i}`)),
    tableName,
  );
}

// The nine boolean module flags, keyed without the `canDo` prefix to keep the
// scenario table readable.
interface Flags {
  descriptiveStats: boolean;
  timeSeries: boolean;
  correlation: boolean;
  distribution: boolean;
  categoricalBreakdown: boolean;
  kMeans: boolean;
  regression: boolean;
  classification: boolean;
  nlp: boolean;
}

function flagsOf(tables: TableRegistryEntry[]): Flags {
  const c = evaluateCapabilities(tables);
  return {
    descriptiveStats: c.canDoDescriptiveStats,
    timeSeries: c.canDoTimeSeries,
    correlation: c.canDoCorrelation,
    distribution: c.canDoDistribution,
    categoricalBreakdown: c.canDoCategoricalBreakdown,
    kMeans: c.canDoKMeans,
    regression: c.canDoRegression,
    classification: c.canDoClassification,
    nlp: c.canDoNLP,
  };
}

const NONE: Flags = {
  descriptiveStats: false,
  timeSeries: false,
  correlation: false,
  distribution: false,
  categoricalBreakdown: false,
  kMeans: false,
  regression: false,
  classification: false,
  nlp: false,
};

describe('evaluateCapabilities — one row per flag boundary', () => {
  // Each scenario is a synthetic single-table column mix and the exact set of
  // module flags it should enable. Types abbreviate to Q/C/T/X/I.
  const cases: Array<{ label: string; types: SemanticType[]; expected: Flags }> = [
    { label: 'no columns → nothing enabled', types: [], expected: NONE },

    // Quantitative count drives descriptive stats / distribution (>=1) and
    // correlation / k-means / regression (>=2).
    {
      label: '1 Quantitative → descriptive stats + distribution only',
      types: ['Quantitative'],
      expected: { ...NONE, descriptiveStats: true, distribution: true },
    },
    {
      label: '2 Quantitative → adds correlation, k-means, regression',
      types: ['Quantitative', 'Quantitative'],
      expected: {
        ...NONE,
        descriptiveStats: true,
        distribution: true,
        correlation: true,
        kMeans: true,
        regression: true,
      },
    },

    // Time series needs BOTH a temporal axis and a numeric measure.
    { label: '1 Temporal alone → nothing (no numeric to plot)', types: ['Temporal'], expected: NONE },
    {
      label: '1 Temporal + 1 Quantitative → time series on',
      types: ['Temporal', 'Quantitative'],
      expected: { ...NONE, descriptiveStats: true, distribution: true, timeSeries: true },
    },
    {
      label: '2 Temporal + 0 Quantitative → still no time series',
      types: ['Temporal', 'Temporal'],
      expected: NONE,
    },

    // Categorical drives the breakdown (>=1) and one arm of classification.
    {
      label: '1 Categorical → breakdown on, classification still off',
      types: ['Categorical'],
      expected: { ...NONE, categoricalBreakdown: true },
    },
    {
      label: '2 Categorical → classification on via the two-categorical arm',
      types: ['Categorical', 'Categorical'],
      expected: { ...NONE, categoricalBreakdown: true, classification: true },
    },
    {
      label: '1 Categorical + 1 Quantitative → classification on via the numeric arm',
      types: ['Categorical', 'Quantitative'],
      expected: {
        ...NONE,
        categoricalBreakdown: true,
        classification: true,
        descriptiveStats: true,
        distribution: true,
      },
    },

    // Textual is the sole driver of NLP.
    { label: '1 Textual → NLP only', types: ['Textual'], expected: { ...NONE, nlp: true } },

    // Identifiers feed no analysis module at all.
    { label: '2 Identifier → nothing enabled', types: ['Identifier', 'Identifier'], expected: NONE },

    // A realistic mix (Titanic-shaped) lights up everything the columns allow.
    {
      label: 'mixed schema → every supported module on',
      types: ['Identifier', 'Categorical', 'Categorical', 'Textual', 'Quantitative', 'Quantitative', 'Temporal'],
      expected: {
        descriptiveStats: true,
        timeSeries: true,
        correlation: true,
        distribution: true,
        categoricalBreakdown: true,
        kMeans: true,
        regression: true,
        classification: true,
        nlp: true,
      },
    },
  ];

  it.each(cases)('$label', ({ types, expected }) => {
    expect(flagsOf([tableOfTypes(types)])).toEqual(expected);
  });
});

describe('evaluateCapabilities — column-reference arrays', () => {
  it('routes each column name into the array for its semantic type', () => {
    const t = table([
      col('Quantitative', 'age'),
      col('Categorical', 'sex'),
      col('Temporal', 'boarded'),
      col('Textual', 'name'),
      col('Identifier', 'passenger_id'),
    ]);

    expect(evaluateCapabilities([t])).toMatchObject({
      numericColumns: ['age'],
      categoricalColumns: ['sex'],
      dateColumns: ['boarded'],
      textColumns: ['name'],
      identifierColumns: ['passenger_id'],
    });
  });

  it('leaves every array empty for no tables', () => {
    expect(evaluateCapabilities([])).toMatchObject({
      numericColumns: [],
      categoricalColumns: [],
      dateColumns: [],
      textColumns: [],
      identifierColumns: [],
    });
  });
});

describe('evaluateCapabilities — union across multiple tables', () => {
  it('sums numeric columns from two tables to enable correlation neither reaches alone', () => {
    const a = table([col('Quantitative', 'x')], 'a');
    const b = table([col('Quantitative', 'y')], 'b');

    const caps = evaluateCapabilities([a, b]);
    expect(caps.canDoCorrelation).toBe(true);
    expect(caps.canDoDistribution).toBe(true);
  });

  it('unions a temporal axis in one table with a measure in another for time series', () => {
    const dates = table([col('Temporal', 'day')], 'calendar');
    const measures = table([col('Quantitative', 'sales')], 'revenue');

    expect(evaluateCapabilities([dates, measures]).canDoTimeSeries).toBe(true);
  });

  it('qualifies reference names by table only once two tables contribute columns', () => {
    const single = table([col('Quantitative', 'amount')], 'orders');
    expect(evaluateCapabilities([single]).numericColumns).toEqual(['amount']);

    const a = table([col('Quantitative', 'amount')], 'orders');
    const b = table([col('Quantitative', 'amount')], 'refunds');
    expect(evaluateCapabilities([a, b]).numericColumns).toEqual(['orders.amount', 'refunds.amount']);
  });
});

describe('evaluateCapabilities — unclassified tables', () => {
  it('treats a table with no columns as contributing nothing, without erroring', () => {
    const unclassified = table(undefined, 'pending');
    expect(flagsOf([unclassified])).toEqual(NONE);
    expect(evaluateCapabilities([unclassified]).numericColumns).toEqual([]);
  });

  it('skips an unclassified table but still evaluates its classified sibling with bare names', () => {
    const classified = table([col('Quantitative', 'amount'), col('Quantitative', 'tax')], 'orders');
    const pending = table(undefined, 'pending');

    const caps = evaluateCapabilities([classified, pending]);
    // Only one table actually contributes columns, so names stay unqualified.
    expect(caps.numericColumns).toEqual(['amount', 'tax']);
    expect(caps.canDoCorrelation).toBe(true);
  });

  it('ignores a table whose columns array is present but empty', () => {
    const empty = table([], 'empty');
    expect(flagsOf([empty])).toEqual(NONE);
  });
});

describe('rankNextActions — capability → consequence (D68a)', () => {
  function cand(
    id: string,
    rule: InsightCandidate['rule'],
    effectSize: number,
    coverage: number,
    description = 'a computed fact',
  ): InsightCandidate {
    return { id, rule, description, sql: `-- ${id}`, effectSize, coverage };
  }

  // A table shaped like an orders fact table: a time axis, two correlated
  // measures, and a category — affording time-series, correlation, categorical,
  // and distribution, so every insight-driven route below is broker-legal.
  function ordersTable(overrides: Partial<TableRegistryEntry> = {}): TableRegistryEntry {
    return {
      ...table(
        [
          col('Temporal', 'order_date'),
          col('Quantitative', 'revenue'),
          col('Quantitative', 'price'),
          col('Quantitative', 'cost'),
          col('Categorical', 'category'),
        ],
        'orders',
      ),
      ...overrides,
    };
  }

  // Destinations are module+tab now — 'charts' covers three sub-types
  // (time-series/distribution/categorical, D68d), so a bare module lookup
  // would collide two distinct findings onto one key.
  function destKey(a: { module: string; tab?: string }): string {
    return a.tab ? `${a.module}:${a.tab}` : a.module;
  }

  it('routes each finding to the real module that answers it — never "profile again"', () => {
    const t = ordersTable();
    const insights: TableInsights[] = [
      {
        table: t,
        insights: [
          cand('change-point:order_date:revenue', 'change-point', 1, 1, 'revenue rose 38% in March'),
          cand('leakage:price:cost', 'leakage', 0.98, 1, 'price and cost correlate at 0.98'),
          cand('concentration:category:revenue', 'concentration', 0.5, 0.4, 'Electronics is 63% of revenue'),
          cand('duplicates', 'duplicates', 1, 0.5, '412 duplicated rows'),
        ],
      },
    ];
    const actions = rankNextActions([t], insights);
    const byDest = Object.fromEntries(actions.map((a) => [destKey(a), a]));

    // The four findings land on four distinct real destinations, ranked by score.
    expect(actions[0].module).toBe('charts');
    expect(actions[0].tab).toBe('time-series');
    expect(actions[0].verb).toBe('Chart revenue over order_date');
    expect(byDest.correlation.verb).toBe('Compare price and cost in the correlation view');
    expect(byDest['charts:categorical'].verb).toBe('Break down revenue by category');
    expect(byDest.sql.verb).toBe('Find the duplicate rows in orders');

    // None of the insight-driven actions is a "profile again" dead end.
    const insightActions = actions.filter((a) => a.evidence.provenance === 'insight-rule');
    expect(insightActions.every((a) => a.module !== 'profile')).toBe(true);
  });

  it('opens each insight-driven action on the answer (D68e) — table + columns prefilled, sql for the SQL route', () => {
    const t = ordersTable();
    const insights: TableInsights[] = [
      {
        table: t,
        insights: [
          cand('change-point:order_date:revenue', 'change-point', 1, 1),
          cand('leakage:price:cost', 'leakage', 0.98, 1),
          cand('concentration:category:revenue', 'concentration', 0.5, 0.4),
          cand('duplicates', 'duplicates', 1, 0.5),
        ],
      },
    ];
    const actions = rankNextActions([t], insights);
    const byDest = Object.fromEntries(actions.map((a) => [destKey(a), a]));

    expect(byDest['charts:time-series'].prefill).toEqual({
      module: 'charts',
      prefilledConfig: { tableName: 'orders', columns: ['order_date', 'revenue'] },
    });
    expect(byDest.correlation.prefill.prefilledConfig).toEqual({ tableName: 'orders', columns: ['price', 'cost'] });
    expect(byDest['charts:categorical'].prefill.prefilledConfig).toEqual({
      tableName: 'orders',
      columns: ['category', 'revenue'],
    });
    // The sql route's prefill is the exact query that found the duplicates —
    // opens the editor on the real answer, not a template.
    expect(byDest.sql.prefill.prefilledConfig).toEqual({
      tableName: 'orders',
      columns: [],
      sql: '-- duplicates',
    });
  });

  it('attaches a complete FactRef to each action (statement, sql, snapshot, provenance)', () => {
    const t = ordersTable({ createdAt: '2026-05-01T00:00:00.000Z' });
    const insights: TableInsights[] = [
      { table: t, insights: [cand('leakage:price:cost', 'leakage', 0.98, 1, 'price and cost correlate at 0.98')] },
    ];
    const [action] = rankNextActions([t], insights);
    expect(action.evidence).toMatchObject({
      statement: 'price and cost correlate at 0.98',
      sql: '-- leakage:price:cost',
      snapshot: '2026-05-01T00:00:00.000Z',
      confidence: 'high',
      provenance: 'insight-rule',
    });
    expect(action.score).toBeCloseTo(0.98);
  });

  it('marks facts from a sampled table medium-confidence', () => {
    const t = ordersTable({ sampled: true, sampleRowLimit: 100_000 });
    const insights: TableInsights[] = [
      { table: t, insights: [cand('leakage:price:cost', 'leakage', 0.98, 1, 'price and cost correlate')] },
    ];
    expect(rankNextActions([t], insights)[0].evidence.confidence).toBe('medium');
  });

  it('below the interest floor, degrades to generic-but-honest routing — no manufactured finding', () => {
    const t = ordersTable();
    // A single marginal finding: score 0.1 × 0.1 = 0.01, under the floor.
    const insights: TableInsights[] = [
      { table: t, insights: [cand('change-point:order_date:revenue', 'change-point', 0.1, 0.1, 'a marginal blip')] },
    ];
    const actions = rankNextActions([t], insights);
    expect(actions.length).toBeGreaterThan(0);
    // Nothing carries the sub-floor finding: every action is generic schema routing.
    expect(actions.every((a) => a.evidence.provenance === 'schema')).toBe(true);
    expect(actions.every((a) => a.score === 0)).toBe(true);
    expect(actions.every((a) => a.evidence.sql === '')).toBe(true);
    expect(actions.some((a) => a.evidence.statement === 'a marginal blip')).toBe(false);
  });

  it('generic-but-honest routing still opens on the answer (D68e) — single table resolves table + columns', () => {
    const t = ordersTable();
    const insights: TableInsights[] = [{ table: t, insights: [] }];
    const actions = rankNextActions([t], insights);
    const byDest = Object.fromEntries(actions.map((a) => [destKey(a), a]));

    expect(byDest['charts:time-series'].prefill.prefilledConfig).toEqual({
      tableName: 'orders',
      columns: ['order_date', 'revenue'],
    });
    expect(byDest['charts:categorical'].prefill.prefilledConfig).toEqual({ tableName: 'orders', columns: ['category'] });
    expect(byDest['charts:distribution'].prefill.prefilledConfig).toEqual({ tableName: 'orders', columns: ['revenue'] });
    // No specific pair to name for the matrix itself — left unprefilled.
    expect(byDest.correlation.prefill.prefilledConfig).toEqual({});
    expect(byDest.profile.prefill.prefilledConfig).toEqual({ tableName: 'orders' });
  });

  it('generic routing leaves prefill empty rather than guessing when pooled columns split across tables', () => {
    // order_date lives on one table, revenue on another — canDoTimeSeries is
    // legal off the pooled tally, but no single table has both, so there is
    // no honest tableName to name.
    const dates = tableOfTypes(['Temporal'], 'events');
    const nums = tableOfTypes(['Quantitative'], 'metrics');
    const actions = rankNextActions(
      [dates, nums],
      [
        { table: dates, insights: [] },
        { table: nums, insights: [] },
      ],
    );
    const timeSeries = actions.find((a) => a.module === 'charts' && a.tab === 'time-series');
    expect(timeSeries?.prefill.prefilledConfig).toEqual({});
  });

  it('does not turn classification/quality notes (id-exclusion, null-pattern) into profile-again actions', () => {
    const t = ordersTable();
    // Only note-shaped insights: near-unique keys and a null-heavy column. These
    // belong in the quality headline / insight feed, not the action band.
    const insights: TableInsights[] = [
      {
        table: t,
        insights: [
          cand('id-exclusion:customer_id', 'id-exclusion', 1, 0.1, 'customer_id is near-unique'),
          cand('id-exclusion:order_id', 'id-exclusion', 1, 0.1, 'order_id is near-unique'),
          cand('null-pattern:discount_code', 'null-pattern', 1, 0.6, 'discount_code 61% null'),
        ],
      },
    ];
    const actions = rankNextActions([t], insights);
    // Every action is generic capability routing, not a note echoed back to profiling.
    expect(actions.every((a) => a.evidence.provenance === 'schema')).toBe(true);
    expect(actions.every((a) => a.evidence.statement !== 'customer_id is near-unique')).toBe(true);
    // And the analytical modules this table affords are what get offered.
    expect(
      actions.some((a) => a.module === 'correlation' || (a.module === 'charts' && (a.tab === 'categorical' || a.tab === 'time-series'))),
    ).toBe(true);
  });

  it('thin profile (a single non-analyzable column) → honest profile routing only', () => {
    const t = table([col('Textual', 'note')], 'memos');
    const actions = rankNextActions([t], [{ table: t, insights: [] }]);
    expect(actions).toEqual([
      expect.objectContaining({ module: 'profile', verb: 'Profile memos' }),
    ]);
    expect(actions[0].evidence.provenance).toBe('schema');
    expect(actions[0].evidence.sql).toBe('');
  });

  it('offers no correlation route when the data cannot support it', () => {
    const t = table([col('Categorical', 'status')], 'tickets');
    const actions = rankNextActions([t], [{ table: t, insights: [] }]);
    expect(actions.some((a) => a.module === 'correlation')).toBe(false);
    expect(actions.some((a) => a.module === 'charts' && a.tab === 'categorical')).toBe(true);
  });

  it('returns nothing when there are no tables', () => {
    expect(rankNextActions([], [])).toEqual([]);
  });

  it('caps at five actions and never offers the same destination twice', () => {
    const t = ordersTable();
    // Two identical leakage findings (same id) must collapse to one correlation action.
    const insights: TableInsights[] = [
      {
        table: t,
        insights: [
          cand('leakage:price:cost', 'leakage', 0.98, 1),
          cand('leakage:price:cost', 'leakage', 0.98, 1),
          cand('change-point:order_date:revenue', 'change-point', 1, 1),
          cand('concentration:category:revenue', 'concentration', 0.5, 0.4),
          cand('duplicates', 'duplicates', 1, 0.5),
        ],
      },
    ];
    const actions = rankNextActions([t], insights);
    expect(actions.length).toBeLessThanOrEqual(5);
    const destinations = actions.map(destKey);
    expect(new Set(destinations).size).toBe(destinations.length); // no repeated destination
    expect(destinations.filter((d) => d === 'correlation')).toHaveLength(1);
  });

  it('keeps the floor constant honest (a small positive bar)', () => {
    expect(INTEREST_FLOOR).toBeGreaterThan(0);
    expect(INTEREST_FLOOR).toBeLessThan(0.5);
  });
});
