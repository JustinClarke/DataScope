// @vitest-environment node
//
// The A0 operation-conformance suite (master §11.5, `00-analyst-core.md`).
//
// The one real cost of writing the core against an executor interface is that
// DuckDB-Wasm and native DuckDB can diverge — on extension availability, on
// some functions, on memory behaviour — so an operation validated in Node
// could behave differently in the tab. This suite is the answer to that cost:
// the same script runs on both engines and any difference in the envelope
// fails here, rather than surfacing later as a bug report. A1 extends the
// script per operation.
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createAnalystCore, type AnalystCore } from '../../src/lib/analyst/core';
import { connectAnalystMcp } from '../../src/lib/analyst/mcp/connect';
import { OPERATION_NAMES, type OpName } from '../../src/lib/analyst/operations';
import { ANALYST_TOOLS, analystTool } from '../../src/lib/analyst/toolSchemas';
import { MAX_PLOTTABLE_ROWS, specForType } from '../../src/lib/chartMapper';
import type { ChartType } from '../../src/types/chart';
import type { QueryResult } from '../../src/types';
import type { OpError, OpOutcome, OpResult } from '../../src/lib/analyst/types';
import { createWasmConformanceExecutor, type ClosableExecutor } from './wasmExecutor';
import { createNativeConformanceExecutor } from './nativeExecutor';
import { FIXTURE_TABLES, loadFixture, runConformanceScript, type ConformanceStep } from './fixtures';
import { createHarnessCatalog } from './harnessCatalog';

/** `elapsedMs` is wall time; it is the one field two engines are never expected to agree on. */
function comparable(outcome: OpOutcome): unknown {
  if ('ok' in outcome) return outcome;
  const { elapsedMs: _elapsedMs, ...rest } = outcome;
  return rest;
}

/**
 * Two independently compiled engines aggregate a float in different orders, so
 * `corr()` over the same rows can differ in the last couple of ULP. Asserting
 * bit-equality there would make the suite fail on a property neither engine
 * promises. Everything else — row counts, schemas, types, ids, integers,
 * strings, error codes, hints — is compared exactly, which is where a real
 * divergence would show.
 */
const FLOAT_TOLERANCE = 1e-9;

function divergence(left: unknown, right: unknown, path = ''): string | null {
  if (typeof left === 'number' && typeof right === 'number') {
    if (Number.isInteger(left) && Number.isInteger(right)) {
      return left === right ? null : `${path}: ${left} vs ${right}`;
    }
    const scale = Math.max(Math.abs(left), Math.abs(right), 1);
    return Math.abs(left - right) <= FLOAT_TOLERANCE * scale ? null : `${path}: ${left} vs ${right}`;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return `${path}.length: ${left.length} vs ${right.length}`;
    for (let i = 0; i < left.length; i++) {
      const found = divergence(left[i], right[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      const found = divergence(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
      if (found) return found;
    }
    return null;
  }
  return Object.is(left, right) ? null : `${path}: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`;
}

function coreFor(executor: ClosableExecutor): AnalystCore {
  return createAnalystCore(executor, {
    authority: 'sealed',
    // A3's catalog seam. The two fixture tables are the harness's "sources",
    // which is what gives `drop_derived` a source table to refuse.
    catalog: createHarnessCatalog(executor, FIXTURE_TABLES),
  });
}

async function scriptFor(executor: ClosableExecutor): Promise<ConformanceStep[]> {
  await loadFixture(executor);
  return runConformanceScript(coreFor(executor));
}

/**
 * A5: the same script, reached over MCP instead of by calling the core.
 *
 * `runConformanceScript` only ever calls `core.invoke`, so the MCP arm is that
 * one method re-pointed at a `tools/call` — which is exactly the substitution
 * being tested. If the protocol boundary drops a field, reorders a row, turns a
 * structured `OpError` into a transport fault, or mangles a `bigint` on the way
 * through JSON, the envelope stops matching the direct arm and this fails.
 *
 * It needs its own executor: the script derives and drops objects, so a second
 * pass over the same catalog would collide on names that already exist.
 */
async function scriptOverMcp(executor: ClosableExecutor): Promise<{ steps: ConformanceStep[]; close: () => Promise<void> }> {
  await loadFixture(executor);
  const core = coreFor(executor);
  const session = await connectAnalystMcp(core);
  const overMcp: AnalystCore = {
    ...core,
    invoke: (op, params, options) => session.call(op, params, options),
  };
  return { steps: await runConformanceScript(overMcp), close: () => session.close() };
}

describe('operation conformance across DuckDB-Wasm and native DuckDB', () => {
  let wasm: ClosableExecutor;
  let native: ClosableExecutor;
  let wasmMcpEngine: ClosableExecutor;
  let nativeMcpEngine: ClosableExecutor;
  let wasmSteps: ConformanceStep[];
  let nativeSteps: ConformanceStep[];
  let wasmMcpSteps: ConformanceStep[];
  let nativeMcpSteps: ConformanceStep[];
  let closeSessions: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    wasm = await createWasmConformanceExecutor();
    native = await createNativeConformanceExecutor();
    wasmSteps = await scriptFor(wasm);
    nativeSteps = await scriptFor(native);

    // A5: the same script again, over the protocol, on each engine.
    wasmMcpEngine = await createWasmConformanceExecutor();
    nativeMcpEngine = await createNativeConformanceExecutor();
    const wasmMcp = await scriptOverMcp(wasmMcpEngine);
    const nativeMcp = await scriptOverMcp(nativeMcpEngine);
    wasmMcpSteps = wasmMcp.steps;
    nativeMcpSteps = nativeMcp.steps;
    closeSessions = [wasmMcp.close, nativeMcp.close];
  }, 360_000);

  afterAll(async () => {
    await Promise.all(closeSessions.map((close) => close().catch(() => undefined)));
    await wasm?.close();
    await native?.close();
    await wasmMcpEngine?.close();
    await nativeMcpEngine?.close();
  });

  it('runs the same script on both engines', () => {
    expect(wasmSteps.map((s) => s.name)).toEqual(nativeSteps.map((s) => s.name));
    expect(wasmSteps.length).toBeGreaterThan(20);
  });

  // Without this, a suite in which every operation failed identically on both
  // engines would pass. Agreement is only worth asserting over real results.
  it.each(['schema:all', 'describe:orders', 'stats:numeric', 'sample:orders', 'correlate:auto', 'run_sql:ordered', 'read:page2'])(
    '%s returned rows on both engines',
    (name) => {
      for (const steps of [wasmSteps, nativeSteps]) {
        const outcome = steps.find((s) => s.name === name)!.outcome;
        expect(outcome, `${name} errored: ${JSON.stringify(outcome)}`).not.toHaveProperty('ok');
        expect((outcome as { rows: unknown[][] }).rows.length).toBeGreaterThan(0);
        expect((outcome as { sql: string | null }).sql).toBeTruthy();
      }
    },
  );

  it('produces an identical envelope for every operation', () => {
    // Named individually so a failure says which operation diverged and in
    // which field, not just that something did.
    const divergent = wasmSteps
      .map((step, i) => {
        const found = divergence(comparable(step.outcome), comparable(nativeSteps[i]!.outcome));
        return found ? `${step.name}${found}` : null;
      })
      .filter((entry): entry is string => entry !== null);
    expect(divergent).toEqual([]);
  });

  it('agrees on the exact SQL each operation ran', () => {
    for (let i = 0; i < wasmSteps.length; i++) {
      const wasmOutcome = wasmSteps[i]!.outcome;
      const nativeOutcome = nativeSteps[i]!.outcome;
      if ('ok' in wasmOutcome || 'ok' in nativeOutcome) continue;
      expect(nativeOutcome.sql, wasmSteps[i]!.name).toBe(wasmOutcome.sql);
    }
  });

  // ---- A5: the same suite, reached through MCP (`05-mcp-server.md`) ----

  describe.each([
    ['duckdb-wasm', () => wasmSteps, () => wasmMcpSteps],
    ['duckdb-native', () => nativeSteps, () => nativeMcpSteps],
  ] as const)('%s — through MCP and direct', (_engine, direct, viaMcp) => {
    it('runs the whole script over the protocol', () => {
      expect(viaMcp().map((s) => s.name)).toEqual(direct().map((s) => s.name));
    });

    it('produces an identical envelope for every operation', () => {
      // The claim: MCP is a transport, not a semantic layer. Anything the
      // protocol changed about a result would appear here as a divergence.
      const divergent = direct()
        .map((step, i) => {
          const found = divergence(comparable(step.outcome), comparable(viaMcp()[i]!.outcome));
          return found ? `${step.name}${found}` : null;
        })
        .filter((entry): entry is string => entry !== null);
      expect(divergent).toEqual([]);
    });

    it('carries structured errors and their hints across the boundary', () => {
      const errors = direct()
        .map((step, i) => ({ name: step.name, left: step.outcome, right: viaMcp()[i]!.outcome }))
        .filter(({ left }) => 'ok' in left);
      expect(errors.length).toBeGreaterThan(5);
      for (const { name, left, right } of errors) {
        // Not merely "also an error" — the same code, the same message, the same
        // mechanical hint. A boundary that degraded hints would still let a
        // looser assertion pass.
        expect(right, name).toEqual(left);
      }
    });
  });

  it('agrees on error codes and mechanical hints', () => {
    const errors = wasmSteps
      .map((step, i) => ({ name: step.name, left: step.outcome, right: nativeSteps[i]!.outcome }))
      .filter(({ left }) => 'ok' in left);
    expect(errors.length).toBeGreaterThan(5);
    for (const { name, left, right } of errors) {
      expect(right, name).toEqual(left);
    }
  });

  // ---- A1: per-operation invariants (definition of done, `01-missing-operations.md`) ----

  it('validate_sql costs no execution and consumes no result slot', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      for (const name of ['validate:ok', 'validate:mutation', 'validate:syntax-error', 'validate:unknown-table']) {
        const outcome = steps.find((s) => s.name === name)!.outcome;
        expect((outcome as { resultId: string | null }).resultId, name).toBeNull();
      }
      // The UPDATE that `validate:mutation` validated never ran: this later
      // read of the same column must match the pre-validation read exactly
      // (elapsedMs excluded — it is wall time, not part of the answer).
      const before = steps.find((s) => s.name === 'stats:numeric')!.outcome;
      const after = steps.find((s) => s.name === 'validate:mutation-not-applied')!.outcome;
      expect(comparable(after)).toEqual(comparable(before));
    }
  });

  it('data_quality recomputes the null-pattern threshold live and finds no false zero-variance', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      const byName = stepsByName(steps);

      const orders = byName.get('quality:orders') as { rows: unknown[][] };
      // Exactly quantity and amount cross 5% null; note (~4.35%) does not, and
      // no column in this fixture has cardinality 1, so there is no
      // zero-variance finding and no duplicates finding (order_id is unique).
      expect(orders.rows.map((r) => [r[0], r[2]]).sort()).toEqual([
        ['null-pattern', 'amount'],
        ['null-pattern', 'quantity'],
      ]);
      for (const row of orders.rows) expect(row[4]).toBeTruthy(); // every finding carries its own re-runnable SQL

      const customers = byName.get('quality:customers') as { rows: unknown[][] };
      expect(customers.rows).toEqual([]);

      const all = byName.get('quality:all') as { rows: unknown[][] };
      expect(all.rows).toHaveLength(orders.rows.length);

      const unknown = byName.get('quality:unknown-table') as { ok: boolean; code: string };
      expect(unknown.ok).toBe(false);
      expect(unknown.code).toBe('unknown_object');
    }
  });

  it('time_series flags unpopulated periods explicitly rather than omitting the rows', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      const outcome = steps.find((s) => s.name === 'timeseries:gaps')!.outcome as { schema: { name: string }[]; rows: unknown[][] };
      const gapIndex = outcome.schema.findIndex((f) => f.name === 'is_gap');
      expect(gapIndex, 'is_gap column present').toBeGreaterThanOrEqual(0);
      expect(outcome.rows.length, 'calendar has rows').toBeGreaterThan(0);
      expect(outcome.rows.some((row) => row[gapIndex] === true), 'at least one gap period').toBe(true);
      expect(outcome.rows.some((row) => row[gapIndex] === false), 'at least one populated period').toBe(true);
    }
  });

  it('join_coverage defaults `on` to the inferred edge and returns the join SQL', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      const outcome = steps.find((s) => s.name === 'join:inferred')!.outcome as { rows: unknown[][]; sql: string | null };
      expect(outcome.rows).toHaveLength(1);
      const [leftTable, rightTable, leftColumn, rightColumn] = outcome.rows[0]!;
      expect({ leftTable, rightTable, leftColumn, rightColumn }).toEqual({
        leftTable: 'orders',
        rightTable: 'customers',
        leftColumn: 'customer',
        rightColumn: 'customer',
      });
      expect(outcome.sql).toMatch(/INNER JOIN/);
    }
  });

  // ---- A3: the derive verbs (definition of done, `03-transforms-first-class.md`) ----

  /** Every A3 step, on one engine, as `name → outcome`. */
  const stepsByName = (steps: ConformanceStep[]) => new Map(steps.map((s) => [s.name, s.outcome]));

  it('derive_table composes the CREATE TABLE AS itself and reports the object it made', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      const outcome = stepsByName(steps).get('derive:table')!;
      expect(outcome, JSON.stringify(outcome)).not.toHaveProperty('ok');
      const result = outcome as { sql: string | null; rows: unknown[][] };
      expect(result.sql).toMatch(/^CREATE TABLE "big_orders" AS SELECT/);
      const [name, kind, rowCount, columnCount] = result.rows[0]!;
      expect({ name, kind, columnCount }).toEqual({ name: 'big_orders', kind: 'table', columnCount: 3 });
      expect(rowCount as number).toBeGreaterThan(0);
    }
  });

  it('applies ingestion’s naming rules rather than a second set, and says when it renamed', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      const byName = stepsByName(steps);
      // `9 Big Orders!` is not a usable object name; sanitizeTableName's own
      // rules produce `_9_big_orders`.
      const sanitized = byName.get('derive:sanitized-name') as { rows: unknown[][]; note?: string };
      expect(sanitized.rows[0]![0]).toBe('_9_big_orders');
      expect(sanitized.note).toContain('9 Big Orders!');

      // A taken name dedupes rather than failing or overwriting.
      const taken = byName.get('derive:name-taken') as { rows: unknown[][]; note?: string };
      expect(taken.rows[0]![0]).toBe('big_orders_2');
      expect(taken.note).toContain('was taken');
    }
  });

  it('refuses a body that is not a query, naming the parameter that was wanted', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      const byName = stepsByName(steps);
      const nested = byName.get('derive:body-is-ctas') as { ok: boolean; code: string; message: string };
      expect(nested.ok).toBe(false);
      expect(nested.code).toBe('invalid_argument');
      expect(nested.message).toContain('"name"');

      const mutation = byName.get('derive:body-is-mutation') as { ok: boolean; code: string };
      expect(mutation.ok).toBe(false);
      expect(mutation.code).toBe('invalid_argument');
    }
  });

  it('creates a view that is in the schema and queryable by name', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      const byName = stepsByName(steps);
      const created = byName.get('view:create') as { sql: string | null; rows: unknown[][] };
      expect(created.sql).toMatch(/^CREATE VIEW "priority_orders" AS SELECT/);
      expect(created.rows[0]![1]).toBe('view');

      const schema = byName.get('view:in-schema') as { rows: unknown[][] };
      expect(schema.rows.length).toBeGreaterThan(0);

      const queried = byName.get('view:queryable') as { rows: unknown[][] };
      expect(Number(queried.rows[0]![0])).toBeGreaterThan(0);
    }
  });

  it('carries lineage on describe_table in both directions, and not on a source table', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      const byName = stepsByName(steps);
      // Before anything derives from it: sources only.
      const before = byName.get('lineage:derived-from') as { note?: string };
      expect(before.note).toContain('Derived from orders');
      expect(before.note).not.toContain('derive from this');

      // After a second object derives from it: dependents too.
      const after = byName.get('lineage:dependents') as { note?: string };
      expect(after.note).toContain('big_orders_by_customer');

      // A source table has neither, so its envelope is unchanged from A0's.
      const source = byName.get('lineage:source-has-none') as { note?: string };
      expect(source.note).toBeUndefined();
    }
  });

  it('drop_derived refuses a source table with a hint naming what is droppable', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      const refused = stepsByName(steps).get('drop:source-refused') as {
        ok: boolean;
        code: string;
        message: string;
        hint?: string;
      };
      expect(refused.ok).toBe(false);
      expect(refused.code).toBe('invalid_argument');
      expect(refused.message).toContain('source table');
      expect(refused.hint).toContain('big_orders');
      // The hint is mechanical — the droppable set — never an instruction.
      expect(refused.hint).not.toMatch(/try|should|instead/i);
    }
  });

  it('names what a drop orphans and hands back the SQL that rebuilds it', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      const byName = stepsByName(steps);
      const dropped = byName.get('drop:orphan-warning') as { sql: string | null; rows: unknown[][]; note?: string };
      expect(dropped.sql).toBe('DROP TABLE "big_orders"');
      const [name, kind, generatingSql] = dropped.rows[0]!;
      expect({ name, kind }).toEqual({ name: 'big_orders', kind: 'table' });
      // Undo is this string: `derive_table` with it rebuilds the object.
      expect(String(generatingSql)).toMatch(/^CREATE TABLE "big_orders" AS SELECT/);
      expect(dropped.note).toContain('big_orders_by_customer');

      expect((byName.get('drop:view') as { sql: string | null }).sql).toBe('DROP VIEW "priority_orders"');
      // Gone from the catalog, so a second drop is an unknown object rather
      // than a silently successful no-op.
      const again = byName.get('drop:already-dropped') as { ok: boolean; code: string };
      expect(again.ok).toBe(false);
      expect(again.code).toBe('unknown_object');
    }
  });

  it('pages the same offset of a materialized result identically on repeat reads', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      const a = steps.find((s) => s.name === 'aggregate:read-repeat-a');
      const b = steps.find((s) => s.name === 'aggregate:read-repeat-b');
      if (!a || !b) continue; // absent only if the aggregate step itself errored
      expect((b.outcome as { rows: unknown[][] }).rows).toEqual((a.outcome as { rows: unknown[][] }).rows);
    }
  });

  /**
   * A6. The envelope comparison above would be satisfied by both engines failing
   * identically, which for these steps would prove nothing — so this states what
   * each one actually returned. The refusals matter as much as the successes:
   * they are the capabilities-broker grammar a model recovers on, and it has to
   * be the same grammar wherever the core runs.
   */
  it('create_chart emits a validated spec, and refuses what the data cannot carry', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      // `OpOutcome` is a union, and every assertion below is about one arm of it
      // or about `chart` being absent — so this reads the fields directly rather
      // than narrowing twice per case.
      const chart = (name: string) =>
        steps.find((s) => s.name === name)!.outcome as Partial<OpResult> & Partial<OpError>;

      // Chosen by the translator from the result's own columns.
      expect(chart('chart:temporal').chart).toEqual({
        kind: 'chart',
        spec: { type: 'time-series', title: 'revenue over ordered_at', xField: 'ordered_at', yFields: ['revenue'] },
      });
      // A caller's narrowing: kept, and the envelope says who produced it.
      expect(chart('chart:refined').chart).toEqual({
        kind: 'chart',
        spec: { type: 'categorical', title: 'Revenue by customer', xField: 'customer', yFields: ['revenue'] },
      });
      expect(chart('chart:refined').note).toContain('refined by the caller');
      // The D55 gate, across the seam: a column the result never had is refused
      // outright and **no chart rides back** for a host to render.
      expect(chart('chart:invented-field')).toMatchObject({ ok: false, code: 'invalid_argument' });
      expect(chart('chart:invented-field').chart).toBeUndefined();
      // Broker-illegal: no temporal column, so no time series — hinting what fits.
      expect(chart('chart:unsupported-type')).toMatchObject({ ok: false, code: 'invalid_argument', hint: 'categorical' });
      expect(chart('chart:mutation-refused')).toMatchObject({ ok: false, code: 'not_read_only' });
      expect(chart('chart:both-inputs')).toMatchObject({ ok: false, code: 'invalid_argument' });
    }
  });

  it('pin_result refuses on a headless core rather than half-working', () => {
    for (const steps of [wasmSteps, nativeSteps]) {
      // The harness supplies a catalog but no workspace — there is no tab strip
      // in Node — so the operation says so instead of inventing a surface.
      expect(steps.find((s) => s.name === 'pin:headless')!.outcome).toMatchObject({
        ok: false,
        code: 'unavailable',
      });
    }
  });

  // ---- 15A checkpoint 8: descriptions conform to real output ----
  //
  // Experiment 15A's build list ends with "truthful tool descriptions for the
  // operations in the frozen profile," because a reasoning model cannot choose
  // tools from aspirational ones — and its §2 item 9 named four that overstated
  // their handlers. `get_schema` claimed row counts, semantic classes, null
  // fractions and inferred relationships while returning three columns of
  // `information_schema`; `describe_table` claimed classification reasons, key
  // columns and time coverage while running `SUMMARIZE`; `column_stats` claimed
  // a histogram, IQR bounds, outliers, top values and word counts, and claimed
  // to branch on semantic class when it branches on declared SQL type; and
  // `create_chart` offered two chart forms `specForType` has no case for.
  //
  // Those are now corrected, and this block is what stops them drifting back.
  // It lives here rather than in `toolSchemas.test.ts` because the assertion is
  // against *real* output — the unit test has no engine, and a description can
  // only be checked truthful against what the handler actually returned.
  describe('descriptions promise what the handler returns (15A §2 item 9)', () => {
    /** A field name as descriptions write them, matched whole so `min` does not match inside `min_length`. */
    const names = (description: string, field: string) =>
      new RegExp(`\\b${field.replace(/_/g, '_')}\\b`).test(description);

    /** Every snake_case identifier a description uses. These are the checkable claims: a description that names `null_percentage` is asserting a column by that name exists. */
    const identifiersIn = (description: string) => description.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [];

    const schemaFields = (outcome: OpOutcome): string[] =>
      'ok' in outcome ? [] : outcome.schema.map((f) => f.name);

    /** Each op, and the steps whose real output its description has to cover. `column_stats` needs all five because its projection is chosen per declared type. */
    const COVERAGE: ReadonlyArray<readonly [OpName, readonly string[]]> = [
      ['get_schema', ['schema:all']],
      ['describe_table', ['describe:orders']],
      ['column_stats', ['stats:numeric', 'stats:integer', 'stats:text', 'stats:date', 'stats:boolean']],
    ];

    it.each(COVERAGE)('%s names every column it actually returns', (op, stepNames) => {
      const description = analystTool(op)!.description;
      for (const steps of [wasmSteps, nativeSteps]) {
        const byName = stepsByName(steps);
        const fields = [...new Set(stepNames.flatMap((step) => schemaFields(byName.get(step)!)))];
        expect(fields.length, `${op} returned no columns to check`).toBeGreaterThan(0);
        const unmentioned = fields.filter((field) => !names(description, field));
        // The direction that catches an operation growing output nobody was
        // told about — a column the model never learns to read.
        expect(unmentioned, `${op} returns these but its description omits them`).toEqual([]);
      }
    });

    it.each(COVERAGE)('%s names no column it does not return', (op, stepNames) => {
      const description = analystTool(op)!.description;
      for (const steps of [wasmSteps, nativeSteps]) {
        const byName = stepsByName(steps);
        const fields = new Set(stepNames.flatMap((step) => schemaFields(byName.get(step)!)));
        // The drift direction §2 item 9 actually found. A snake_case token is
        // either a column this operation returns or the name of a sibling
        // operation the description is pointing at; anything else is a promise
        // with no handler behind it.
        const invented = identifiersIn(description).filter(
          (token) => !fields.has(token) && !(OPERATION_NAMES as readonly string[]).includes(token),
        );
        expect(invented, `${op} names these but returns no such column`).toEqual([]);
      }
    });

    it('column_stats branches on declared SQL type, as its description now says', () => {
      for (const steps of [wasmSteps, nativeSteps]) {
        const byName = stepsByName(steps);
        const fieldsOf = (step: string) => schemaFields(byName.get(step)!);
        const COUNTS = ['row_count', 'non_null', 'nulls', 'distinct_count'];

        // Every branch carries the counts, and then exactly what the
        // description says its type adds — no histogram, no outlier bounds, no
        // top values, and no separate categorical branch at all: `customer` is
        // a VARCHAR and gets the text projection like any other.
        expect(fieldsOf('stats:numeric')).toEqual([...COUNTS, 'min', 'max', 'mean', 'stddev', 'q1', 'median', 'q3']);
        expect(fieldsOf('stats:integer')).toEqual(fieldsOf('stats:numeric'));
        expect(fieldsOf('stats:date')).toEqual([...COUNTS, 'min', 'max']);
        expect(fieldsOf('stats:boolean')).toEqual(COUNTS);
        expect(fieldsOf('stats:text')).toEqual([...COUNTS, 'min_length', 'max_length', 'mean_length']);
      }
    });

    it('describe_table returns a handle, not the inline answer it used to claim', () => {
      for (const steps of [wasmSteps, nativeSteps]) {
        // The old description said "returns inline and complete". It
        // materializes, which is why the description now points at read_result.
        expect((stepsByName(steps).get('describe:orders') as { resultId: string | null }).resultId).not.toBeNull();
      }
    });

    it('get_schema returns no statistic, which is why its description promises none', () => {
      for (const steps of [wasmSteps, nativeSteps]) {
        const outcome = stepsByName(steps).get('schema:all') as { schema: { name: string }[]; resultId: string | null };
        // Three columns of catalog metadata. The old description promised row
        // counts, null fractions, distinct counts, semantic classes and
        // inferred relationships with join SQL — none of which are here.
        expect(outcome.schema.map((f) => f.name)).toEqual(['table_name', 'column_name', 'data_type']);
        expect(outcome.resultId).toBeNull();
      }
    });

    it('create_chart offers only the forms the translator can build', () => {
      // `ChartType` has five members and `create_chart` accepts all five, but
      // `specForType` has cases for three: naming `distribution` or
      // `join-graph` is refused for every result shape, so the schema stops
      // offering them. Proven against the mapper rather than asserted from a
      // list, so adding a case there is what re-opens the enum.
      const SHAPES: QueryResult[] = [
        { columnNames: ['t', 'v'], columnTypes: ['DATE', 'DOUBLE'], rows: [], rowCount: 0, executionTimeMs: 0 },
        { columnNames: ['c', 'v'], columnTypes: ['VARCHAR', 'DOUBLE'], rows: [], rowCount: 0, executionTimeMs: 0 },
        { columnNames: ['a', 'b'], columnTypes: ['DOUBLE', 'DOUBLE'], rows: [], rowCount: 0, executionTimeMs: 0 },
      ];
      // `satisfies` makes this exhaustive: a sixth `ChartType` fails to compile
      // here rather than quietly going unconsidered.
      const ALL_CHART_TYPES = Object.keys({
        'time-series': 0,
        correlation: 0,
        distribution: 0,
        categorical: 0,
        'join-graph': 0,
      } satisfies Record<ChartType, number>) as ChartType[];
      const buildable = ALL_CHART_TYPES.filter((type) => SHAPES.some((shape) => specForType(shape, type) !== null));
      const offered = (analystTool('create_chart')!.inputSchema.properties as Record<string, { enum: string[] }>).type.enum;
      expect([...offered].sort()).toEqual([...buildable].sort());
      expect(offered).not.toContain('distribution');
      expect(offered).not.toContain('join-graph');
    });

    /**
     * The half of §2 item 9's drift that field names cannot catch. `column_stats`
     * did not promise a column called `histogram`; it promised "a 10-bucket
     * histogram" in prose, and "IQR bounds, whiskers, outliers", and "top values
     * with counts and shares" — none of which any handler computes. So this
     * checks prose claims, and grounds the list in real output rather than in a
     * belief about the catalog: each term is first shown to name nothing any
     * operation returns, and only then required to be absent-or-denied.
     *
     * Denial is the exception because a truthful description often has to say
     * what it does *not* do — that is the D74 boundary clause, and it is the
     * reason `column_stats` may write "no histogram" while nothing may write
     * "a histogram".
     */
    const UNCOMPUTED = ['histogram', 'outlier', 'IQR', 'whisker', 'tail share', 'time coverage', 'key column', 'semantic class'];

    it('no operation returns any of the statistics these terms name', () => {
      for (const steps of [wasmSteps, nativeSteps]) {
        const everyField = steps.flatMap((step) => schemaFields(step.outcome)).map((f) => f.toLowerCase());
        for (const term of UNCOMPUTED) {
          const collapsed = term.toLowerCase().replace(/ /g, '_');
          expect(
            everyField.filter((field) => field.includes(collapsed)),
            `${term} is on the uncomputed list but an operation returns a column named for it`,
          ).toEqual([]);
        }
      }
    });

    it.each(ANALYST_TOOLS.map((tool) => [tool.name, tool.description] as const))(
      '%s claims none of them except to deny it',
      (_name, description) => {
        /** A claim is a mention with no negation in the clause leading up to it. */
        const claimed = UNCOMPUTED.filter((term) => {
          const pattern = new RegExp(term, 'gi');
          for (let match = pattern.exec(description); match !== null; match = pattern.exec(description)) {
            const runUp = description.slice(Math.max(0, match.index - 40), match.index);
            if (!/\b(no|not|never|without)\b/i.test(runUp)) return true;
          }
          return false;
        });
        expect(claimed, 'promised in prose, computed by no handler').toEqual([]);
      },
    );

    it('create_chart states the row ceiling it actually enforces', () => {
      // The description names 5000 in prose; if the mapper's ceiling moves, the
      // prose is wrong and nothing else would catch it.
      expect(analystTool('create_chart')!.description).toContain(String(MAX_PLOTTABLE_ROWS));
    });
  });
});
