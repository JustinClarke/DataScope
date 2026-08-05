// A6 — charts and pins as operations. The D55 seam is the whole of this
// phase's risk, so most of what follows asserts a boundary rather than an
// output: what a model may put into a chart spec, and what it can never put
// into a tab envelope.
import { describe, expect, it, vi } from 'vitest';
import { OPERATIONS, type OpContext } from './operations';
import type { Page, ResultReceipt, ResultStore } from './resultStore';
import { isOpError, type Executor, type OpOutcome, type OpSchemaField, type Workspace } from './types';

const MONTHLY_SCHEMA: OpSchemaField[] = [
  { name: 'month', type: 'DATE' },
  { name: 'revenue', type: 'DOUBLE' },
  { name: 'orders', type: 'BIGINT' },
];
const MONTHLY_ROWS: unknown[][] = [
  [1704067200000, 1200.5, 40],
  [1706745600000, 1980.25, 61],
  [1709251200000, 1540, 52],
];

/**
 * A store holding one already-materialized result. The handlers under test read
 * a materialization rather than produce one, so scripting the store directly is
 * both smaller and more honest than driving a fake engine to build one — the
 * engine's own behaviour is `eval/analyst/conformance.test.ts`'s job.
 */
function fakeStore(
  overrides: { schema?: OpSchemaField[]; rows?: unknown[][]; rowCount?: number; materialized?: boolean } = {},
) {
  const receipt: ResultReceipt = {
    id: 'r1',
    op: 'aggregate',
    sql: 'SELECT month, revenue, orders FROM monthly ORDER BY 1',
    schema: overrides.schema ?? MONTHLY_SCHEMA,
    rowCount: overrides.rowCount ?? (overrides.rows ?? MONTHLY_ROWS).length,
    materialized: overrides.materialized ?? true,
  };
  const page: Page | null = receipt.materialized
    ? { rows: overrides.rows ?? MONTHLY_ROWS, nextOffset: null, elapsedMs: 3 }
    : null;

  return {
    receipt: (id: string) => (id === receipt.id ? receipt : null),
    inventory: () => [receipt],
    page: async () => page,
  } as unknown as ResultStore;
}

const executor: Executor = {
  engine: 'duckdb-wasm',
  execute: async () => ({ columnNames: [], rows: [], elapsedMs: 0 }),
};

function context(store: ResultStore, workspace?: Workspace): OpContext {
  return { executor, store, ...(workspace ? { workspace } : {}) };
}

function expectResult(outcome: OpOutcome) {
  if (isOpError(outcome)) throw new Error(`expected a result, got ${outcome.code}: ${outcome.message}`);
  return outcome;
}

function expectError(outcome: OpOutcome) {
  if (!isOpError(outcome)) throw new Error(`expected an OpError, got a ${outcome.op} result`);
  return outcome;
}

describe('create_chart routes through the one translator', () => {
  it('charts a stored result and hands back the rows it charted', async () => {
    const result = expectResult(await OPERATIONS.create_chart({ resultId: 'r1' }, context(fakeStore())));

    // A temporal axis carrying measures — `chartMapper`'s call, not this file's.
    expect(result.chart).toEqual({
      kind: 'chart',
      spec: {
        type: 'time-series',
        title: 'revenue, orders over month',
        xField: 'month',
        yFields: ['revenue', 'orders'],
      },
    });
    // The envelope is the charted result's own, which is what lets the same
    // resultId then be pinned, paged, or read back.
    expect(result.resultId).toBe('r1');
    expect(result.rows).toEqual(MONTHLY_ROWS);
    expect(result.sql).toContain('FROM monthly');
    expect(result.note).toContain('chosen by the translator');
  });

  it('honours an explicit type the result can support', async () => {
    const result = expectResult(
      await OPERATIONS.create_chart({ resultId: 'r1', type: 'correlation' }, context(fakeStore())),
    );
    expect(result.chart).toMatchObject({ kind: 'chart', spec: { type: 'correlation' } });
  });

  it('reports a single aggregate value as a stat, not a chart', async () => {
    const store = fakeStore({ schema: [{ name: 'total', type: 'BIGINT' }], rows: [[42]] });
    const result = expectResult(await OPERATIONS.create_chart({ resultId: 'r1' }, context(store)));
    expect(result.chart).toEqual({ kind: 'kpi', label: 'total', value: '42' });
  });
});

describe('a chart the data cannot support is an answer, not a failure', () => {
  it('names why, and what the result could support instead', async () => {
    // Two text columns: no measure to plot, so no chart form fits.
    const store = fakeStore({
      schema: [
        { name: 'city', type: 'VARCHAR' },
        { name: 'country', type: 'VARCHAR' },
      ],
      rows: [['Lisbon', 'PT']],
    });
    const error = expectError(await OPERATIONS.create_chart({ resultId: 'r1' }, context(store)));
    expect(error.code).toBe('invalid_argument');
    expect(error.message).toMatch(/no clear chart/i);
    expect(error.hint).toBe('no chart type fits this result shape');
  });

  it('refuses a requested type the shape cannot carry, hinting the ones it can', async () => {
    const store = fakeStore({
      schema: [
        { name: 'city', type: 'VARCHAR' },
        { name: 'population', type: 'BIGINT' },
      ],
      rows: [['Lisbon', 545000]],
    });
    // No temporal column, so a time series is exactly the broker-illegal case.
    const error = expectError(await OPERATIONS.create_chart({ resultId: 'r1', type: 'time-series' }, context(store)));
    expect(error.code).toBe('invalid_argument');
    expect(error.hint).toBe('categorical');
  });

  it('refuses a result past the plotting ceiling before loading a single row', async () => {
    const page = vi.fn();
    const store = {
      receipt: () => ({ id: 'r1', op: 'run_sql', sql: 'SELECT * FROM big', schema: MONTHLY_SCHEMA, rowCount: 120_000, materialized: true }),
      inventory: () => [],
      page,
    } as unknown as ResultStore;

    const error = expectError(await OPERATIONS.create_chart({ resultId: 'r1' }, context(store)));
    expect(error.message).toMatch(/past the 5,000-row plotting ceiling/);
    expect(page).not.toHaveBeenCalled();
  });

  it('refuses a resultId it does not have, and a call naming neither input', async () => {
    expect(expectError(await OPERATIONS.create_chart({ resultId: 'nope' }, context(fakeStore()))).code).toBe('unknown_object');
    expect(expectError(await OPERATIONS.create_chart({}, context(fakeStore()))).code).toBe('invalid_argument');
    expect(
      expectError(await OPERATIONS.create_chart({ resultId: 'r1', sql: 'SELECT 1' }, context(fakeStore()))).message,
    ).toMatch(/not both/);
  });
});

describe('a model-supplied spec is validated before anything renders', () => {
  const baseline = {
    type: 'time-series' as const,
    title: 'revenue, orders over month',
    xField: 'month',
    yFields: ['revenue', 'orders'],
  };

  it('accepts a narrowing — a re-title and a dropped measure — and names the producer', async () => {
    const result = expectResult(
      await OPERATIONS.create_chart(
        { resultId: 'r1', spec: { ...baseline, title: 'Revenue by month', yFields: ['revenue'] } },
        context(fakeStore()),
      ),
    );
    expect(result.chart).toEqual({
      kind: 'chart',
      spec: { type: 'time-series', title: 'Revenue by month', xField: 'month', yFields: ['revenue'] },
    });
    expect(result.note).toContain('refined by the caller');
  });

  it.each([
    ['an invented measure', { yFields: ['revenue', 'profit_margin'] }],
    ['a different axis', { xField: 'quarter' }],
    ['a different chart form', { type: 'categorical' as const }],
    ['no measures at all', { yFields: [] }],
    ['a causal title', { title: 'Revenue rose because of the March promotion' }],
    ['an empty title', { title: '   ' }],
  ])('refuses %s, and emits no chart at all', async (_case, patch) => {
    const outcome = await OPERATIONS.create_chart(
      { resultId: 'r1', spec: { ...baseline, ...patch } },
      context(fakeStore()),
    );
    const error = expectError(outcome);
    expect(error.code).toBe('invalid_argument');
    // The refusal is total: no partial spec, no quiet drop of the invalid
    // parts, no silent fall back to the baseline the caller did not ask for.
    expect(error.hint).toContain('yFields revenue, orders');
    expect(outcome).not.toHaveProperty('chart');
  });
});

describe('pin_result cannot author a tab', () => {
  function fakeWorkspace() {
    // Typed by the seam, so `mock.calls` is the request rather than an empty
    // tuple — and so a change to `PinRequest` fails this file, which is the
    // point of asserting the key set below.
    const pin = vi.fn<Workspace['pin']>(async () => ({ id: 'tab-7' }));
    return { workspace: { pin } satisfies Workspace, pin };
  }

  it('hands the host a result and a title, and nothing that could be an envelope', async () => {
    const { workspace, pin } = fakeWorkspace();
    const result = expectResult(
      await OPERATIONS.pin_result(
        // Everything an envelope is made of, offered by the caller and ignored:
        // there is no parameter for any of it, so none of it can arrive.
        { resultId: 'r1', title: 'Monthly revenue', type: 'map', subject: 'orders', id: 'tab-1', initializer: { module: 'sql' } },
        context(fakeStore(), workspace),
      ),
    );

    expect(pin).toHaveBeenCalledTimes(1);
    // The exact key set the host receives — asserted as a whole, so a future
    // field cannot be added to the request without this failing first.
    expect(Object.keys(pin.mock.calls[0]![0]).sort()).toEqual([
      'elapsedMs',
      'nextOffset',
      'resultId',
      'rowCount',
      'rows',
      'schema',
      'sql',
      'title',
    ]);
    const request = pin.mock.calls[0]![0];
    expect(request.title).toBe('Monthly revenue');
    // The tier's whole premise, verified at its last mile: the pin carries the
    // statement, so the user can edit and re-run what the model pinned.
    expect(request.sql).toBe('SELECT month, revenue, orders FROM monthly ORDER BY 1');
    expect(request.rows).toEqual(MONTHLY_ROWS);
    expect(result.rows).toEqual([['tab-7', 'Monthly revenue', request.sql, 3]]);
  });

  it('trims an over-long title to a label and says that it did', async () => {
    const { workspace, pin } = fakeWorkspace();
    const result = expectResult(
      await OPERATIONS.pin_result({ resultId: 'r1', title: 'x'.repeat(200) }, context(fakeStore(), workspace)),
    );
    expect(pin.mock.calls[0]![0].title).toHaveLength(60);
    expect(result.note).toMatch(/truncated/i);
  });

  it('pins a compacted result for its SQL alone rather than refusing', async () => {
    const { workspace, pin } = fakeWorkspace();
    const store = fakeStore({ materialized: false, rowCount: 900 });
    const result = expectResult(await OPERATIONS.pin_result({ resultId: 'r1', title: 'Kept' }, context(store, workspace)));

    expect(pin.mock.calls[0]![0].rows).toEqual([]);
    expect(pin.mock.calls[0]![0].sql).toContain('FROM monthly');
    expect(result.note).toMatch(/released by compaction/i);
  });

  it('refuses an unknown result, hinting the ids it has', async () => {
    const { workspace } = fakeWorkspace();
    const error = expectError(await OPERATIONS.pin_result({ resultId: 'r9', title: 'Kept' }, context(fakeStore(), workspace)));
    expect(error.code).toBe('unknown_object');
    expect(error.hint).toBe('r1');
  });

  it('refuses on a headless core rather than half-working', async () => {
    // The conformance harness, an embedded core — and, by construction, a
    // consumption-only viewer session (D62), which builds no workspace because
    // it has no console.
    const error = expectError(await OPERATIONS.pin_result({ resultId: 'r1', title: 'Kept' }, context(fakeStore())));
    expect(error.code).toBe('unavailable');
    expect(error.message).toMatch(/headless/);
  });
});
