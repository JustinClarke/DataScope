// A3's app-side guarantee: the derive operations and the SQL console are one
// path, not two that agree.
//
// The conformance suite (`eval/analyst/conformance.test.ts`) already proves the
// operations behave identically on both engines. What it cannot see is the half
// that only exists in the browser — the registry. That is what this covers.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryResult, TableRegistryEntry } from '../types';
import { useDatasetsStore } from '../stores/datasets';
import { connectAnalystMcp } from '../lib/analyst/mcp/connect';

/**
 * A fake engine that answers the handful of statements the derivation path
 * issues. It records every statement it saw, which is how the "nothing reaches
 * the engine around the shared path" assertion is made.
 */
const executed: string[] = [];
const catalog = new Map<string, string[]>([['orders', ['order_id', 'amount']]]);

function result(columnNames: string[], rows: unknown[][]): QueryResult {
  return {
    columnNames,
    columnTypes: columnNames.map(() => 'Utf8'),
    rows,
    rowCount: rows.length,
    executionTimeMs: 0,
  };
}

vi.mock('../workers/duckdb.worker', () => ({
  duckDBEngine: {
    execute: vi.fn((sql: string): Promise<QueryResult> => {
      executed.push(sql);
      const named = /"([^"]+)"/.exec(sql)?.[1] ?? '';

      if (/^CREATE (TABLE|VIEW)/i.test(sql)) {
        catalog.set(named, ['order_id', 'amount']);
        return Promise.resolve(result([], []));
      }
      if (/^DROP (TABLE|VIEW)/i.test(sql)) {
        catalog.delete(named);
        return Promise.resolve(result([], []));
      }
      if (sql.startsWith('DESCRIBE')) {
        return Promise.resolve(result(['column_name'], (catalog.get(named) ?? []).map((c) => [c])));
      }
      if (sql.includes('information_schema.columns')) {
        return Promise.resolve(
          result(
            ['table_name', 'column_name', 'data_type'],
            [...catalog].flatMap(([table, columns]) => columns.map((column) => [table, column, 'BIGINT'])),
          ),
        );
      }
      if (sql.includes('duckdb_tables()')) return Promise.resolve(result(['estimated_size'], [[2048]]));
      if (sql.includes('SUMMARIZE')) {
        return Promise.resolve(
          result(
            ['column_name', 'column_type', 'min', 'max', 'approx_unique', 'avg', 'std', 'null_percentage'],
            (catalog.get(named) ?? []).map((c) => [c, 'BIGINT', '1', '9', 3, '5', '1', '0.0']),
          ),
        );
      }
      if (/COUNT\(DISTINCT/i.test(sql)) {
        return Promise.resolve(result(['d0', 'd1'], [[3, 3]]));
      }
      // Both the transform layer's `COUNT(*) AS n` and the operation's own
      // `count(*) AS row_count`.
      if (/count\(\*\)/i.test(sql)) return Promise.resolve(result(['n'], [[3]]));
      return Promise.resolve(result([], []));
    }),
  },
}));

// The staging layer is OPFS-backed and irrelevant to a derived object, which
// has no bytes to stage.
vi.mock('./opfsStaging', () => ({
  stageTable: vi.fn(() => Promise.resolve()),
  unstageTable: vi.fn(() => Promise.resolve()),
  clearStagedTables: vi.fn(() => Promise.resolve()),
}));

const { analystCore, resetAnalystCore } = await import('./analyst');
const transforms = await import('./transforms');
const { askAI } = await import('./ai');
const { createScriptedProvider } = await import('./aiProvider');
const { SQL_TOOL } = await import('./toolLadder');

/** Everything about a registry entry except the fields that are random, clock-derived, or the name itself. */
function comparable(entry: TableRegistryEntry | undefined) {
  if (!entry) return entry;
  const { id: _id, datasetId: _datasetId, createdAt: _createdAt, tableName: _tableName, generatingSql: _sql, ...rest } = entry;
  return rest;
}

beforeEach(async () => {
  executed.length = 0;
  catalog.clear();
  catalog.set('orders', ['order_id', 'amount']);
  useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
  useDatasetsStore.getState().registerDataset(
    { id: 'ds-1', name: 'orders.csv', sourceType: 'file', tableNames: ['orders'], ingestedAt: '2026-08-02T00:00:00.000Z' },
    [
      {
        id: 'tbl-1',
        tableName: 'orders',
        datasetId: 'ds-1',
        origin: 'file',
        rowCount: 3,
        columnCount: 2,
        memoryBytes: 2048,
        createdAt: '2026-08-02T00:00:00.000Z',
      },
    ],
  );
  await resetAnalystCore();
});

describe('derive_table and the SQL console are one path', () => {
  it('registers an entry indistinguishable from one the console produced', async () => {
    // The console's path: exactly what typing this into Module 2 runs.
    await transforms.runTransform('CREATE TABLE "typed" AS SELECT order_id FROM orders');
    const typed = useDatasetsStore.getState().tables.find((t) => t.tableName === 'typed');

    // The operation's path.
    const outcome = await analystCore().call('derive_table', { name: 'derived', sql: 'SELECT order_id FROM orders' });
    expect(outcome, JSON.stringify(outcome)).not.toHaveProperty('ok');
    const derived = useDatasetsStore.getState().tables.find((t) => t.tableName === 'derived');

    expect(comparable(derived)).toEqual(comparable(typed));
    expect(derived?.origin).toBe('derived');
    expect(derived?.generatingSql).toBe('CREATE TABLE "derived" AS SELECT order_id FROM orders');
  });

  it('reaches the engine only through the shared guarded path', async () => {
    const spy = vi.spyOn(transforms, 'runTransformDetailed');
    // A fresh core, so the spy is in place before the module captures anything.
    await resetAnalystCore();
    await analystCore().call('derive_table', { name: 'guarded', sql: 'SELECT order_id FROM orders' });

    // Every CREATE the engine saw was issued by the transform layer. A derive
    // route that called `duckDBEngine.execute` itself would show up here as a
    // CREATE with no corresponding call — the D73 failure this asserts against.
    const creates = executed.filter((sql) => /^CREATE /i.test(sql));
    expect(creates).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith(creates[0]);
    spy.mockRestore();
  });

  it('registers a view as a view, and drops it with the right keyword', async () => {
    await analystCore().call('create_view', { name: 'recent', sql: 'SELECT order_id FROM orders' });
    const view = useDatasetsStore.getState().tables.find((t) => t.tableName === 'recent');
    expect(view?.kind).toBe('view');
    expect(view?.origin).toBe('derived');

    const dropped = await analystCore().call('drop_derived', { name: 'recent' });
    expect(dropped, JSON.stringify(dropped)).not.toHaveProperty('ok');
    expect(executed).toContain('DROP VIEW "recent"');
    expect(useDatasetsStore.getState().tables.find((t) => t.tableName === 'recent')).toBeUndefined();
  });

  it('refuses to drop a source table and never issues the statement', async () => {
    const outcome = await analystCore().call('drop_derived', { name: 'orders' });
    expect(outcome).toMatchObject({ ok: false, code: 'invalid_argument' });
    expect(executed.some((sql) => /^DROP /i.test(sql))).toBe(false);
    expect(useDatasetsStore.getState().tables.find((t) => t.tableName === 'orders')).toBeDefined();
  });

  it('a dropped derived table is rebuildable from the SQL the drop returned', async () => {
    await analystCore().call('derive_table', { name: 'temp', sql: 'SELECT order_id FROM orders' });
    const dropped = await analystCore().call('drop_derived', { name: 'temp' });
    const generatingSql = String((dropped as { rows: unknown[][] }).rows[0]![2]);

    // Undo (§12.1) is replaying that statement through the same path — which is
    // what `IngestionPanel`'s redo offer already does for a derived table.
    await transforms.runTransform(generatingSql);
    expect(useDatasetsStore.getState().tables.find((t) => t.tableName === 'temp')).toBeDefined();
  });
});

/**
 * A4's half of the same guarantee. The chat used to execute through
 * `runChartQuery`, which reaches `duckDBEngine` directly — so the AI path
 * skipped the guard entirely. That was masked while the only tool was a
 * `SELECT`, and unmasked the moment A3 shipped mutations.
 *
 * Now the chat runs through this core, so there is no AI-shaped route to the
 * engine at all: a mutation in the model's SQL meets the statement gate, and a
 * derivation (when A5/A6 offer one) can only cross `runTransformDetailed`.
 */
describe('the AI path is the same guarded path (A4 defect iv)', () => {
  it('refuses a mutation in the model’s SQL and issues nothing to the engine', async () => {
    const provider = createScriptedProvider([
      { text: '', calls: [{ id: 't1', name: SQL_TOOL, input: { sql: 'DELETE FROM orders WHERE amount < 5' } }] },
      { text: 'I cannot modify your data.', calls: [] },
    ]);
    const turn = await askAI('delete the small orders', {
      provider,
      tables: useDatasetsStore.getState().tables,
      core: analystCore(),
      session: await connectAnalystMcp(analystCore()),
    });

    expect(turn.content).toBe('I cannot modify your data.');
    expect(executed.some((sql) => /^DELETE/i.test(sql))).toBe(false);

    // The model was told which operation the statement belongs at — mechanically,
    // by the gate, not by a host-authored suggestion.
    const toolMessage = provider.calls[1].messages.find((m) => m.role === 'tool') as { content: string };
    expect(JSON.parse(toolMessage.content)).toMatchObject({ ok: false, code: 'not_read_only' });
  });

  it('runs the model’s SELECT through the core, so every statement is one the core composed', async () => {
    const provider = createScriptedProvider([
      { text: '', calls: [{ id: 't1', name: SQL_TOOL, input: { sql: 'SELECT order_id FROM orders' } }] },
      { text: 'Three orders.', calls: [] },
    ]);
    const turn = await askAI('how many orders', {
      provider,
      tables: useDatasetsStore.getState().tables,
      core: analystCore(),
      session: await connectAnalystMcp(analystCore()),
    });

    expect(turn.error).toBeUndefined();
    // The core materializes into a temp table it owns; nothing ran the model's
    // SQL against the engine directly, which is what `runChartQuery` used to do.
    expect(executed.some((sql) => /^CREATE TEMP TABLE/i.test(sql))).toBe(true);
  });
});
