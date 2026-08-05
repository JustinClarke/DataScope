import { describe, expect, it, vi } from 'vitest';
import { createAnalystCore } from './core';
import { AUTHORITY_STATEMENTS } from './authority';
import type { Executor } from './types';

/**
 * A scripted engine that can be held open, so cancellation, the timeout and
 * the one-query-at-a-time rule are asserted as *behaviour* rather than as the
 * presence of a `signal` parameter. Real-engine behaviour is covered by
 * `eval/analyst/conformance.test.ts`.
 */
function fakeExecutor(options: { delayMs?: number } = {}) {
  const statements: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const executor: Executor = {
    engine: 'duckdb-wasm',
    execute(sql, signal) {
      statements.push(sql);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const rows = sql.includes('information_schema')
        ? [['orders', 'id', 'BIGINT'], ['orders', 'label', 'VARCHAR']]
        : [];
      // `SET` returns instantly on both real engines, so the configured delay
      // stands for query time only — otherwise a test that holds a query open
      // would also hold the authority setup open, which no engine does.
      const delayMs = sql.startsWith('SET ') ? 0 : (options.delayMs ?? 0);
      return new Promise((resolve, reject) => {
        const settle = (fn: () => void) => {
          inFlight--;
          fn();
        };
        const timer = setTimeout(
          () => settle(() => resolve({ columnNames: ['a', 'b', 'c'], rows, elapsedMs: 1 })),
          delayMs,
        );
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            settle(() => reject(new DOMException('Query cancelled', 'AbortError')));
          },
          { once: true },
        );
      });
    },
  };

  return { executor, statements, peakConcurrency: () => maxInFlight };
}

describe('the single door', () => {
  it('names the engine it is driving', () => {
    const { executor } = fakeExecutor();
    expect(createAnalystCore(executor).engine).toBe('duckdb-wasm');
  });

  it('rejects an unknown operation with the nearest catalog match', async () => {
    const { executor } = fakeExecutor();
    const outcome = await createAnalystCore(executor).invoke('get_schemas', {});
    expect(outcome).toMatchObject({ ok: false, code: 'invalid_argument', hint: 'get_schema' });
  });

  it('rejects params that are not an object', async () => {
    const { executor } = fakeExecutor();
    const outcome = await createAnalystCore(executor).invoke('get_schema', 'orders');
    expect(outcome).toMatchObject({ ok: false, code: 'invalid_argument' });
  });

  it('applies the authority configuration once, however many operations run', async () => {
    const { executor, statements } = fakeExecutor();
    const core = createAnalystCore(executor);
    await core.invoke('get_schema', {});
    await core.invoke('get_schema', {});
    await core.ready();

    const settings = statements.filter((s) => s.startsWith('SET '));
    expect(settings).toEqual([...AUTHORITY_STATEMENTS.shared]);
  });
});

describe('one cancellation path', () => {
  it('reports cancelled without touching the engine when the signal is already aborted', async () => {
    const { executor, statements } = fakeExecutor();
    const controller = new AbortController();
    controller.abort();

    const outcome = await createAnalystCore(executor).invoke('get_schema', {}, { signal: controller.signal });
    expect(outcome).toMatchObject({ ok: false, code: 'cancelled' });
    expect(statements).toEqual([]);
  });

  it('reaches the engine when a caller aborts mid-flight', async () => {
    const { executor, statements } = fakeExecutor({ delayMs: 5_000 });
    const controller = new AbortController();
    const pending = createAnalystCore(executor).invoke('get_schema', {}, { signal: controller.signal });

    // Abort only once the query is genuinely in flight — otherwise this would
    // re-test the already-aborted case above.
    await vi.waitFor(() => expect(statements.some((s) => s.includes('information_schema'))).toBe(true));
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, code: 'cancelled' });
  });

  it('distinguishes a timeout from a cancellation', async () => {
    const { executor } = fakeExecutor({ delayMs: 5_000 });
    const core = createAnalystCore(executor, { timeoutMs: 10 });
    expect(await core.invoke('get_schema', {})).toMatchObject({ ok: false, code: 'timeout' });
  });
});

describe('one query at a time', () => {
  it('serializes concurrent operations rather than refusing them', async () => {
    const { executor, peakConcurrency } = fakeExecutor({ delayMs: 5 });
    const core = createAnalystCore(executor);

    const outcomes = await Promise.all([
      core.invoke('get_schema', {}),
      core.invoke('get_schema', {}),
      core.invoke('get_schema', {}),
    ]);

    expect(outcomes.every((outcome) => !('ok' in outcome))).toBe(true);
    expect(peakConcurrency()).toBe(1);
  });

  it('keeps running after an operation fails', async () => {
    const { executor } = fakeExecutor();
    const core = createAnalystCore(executor);
    await core.invoke('describe_table', {});
    expect(await core.invoke('get_schema', {})).not.toHaveProperty('ok');
  });
});
