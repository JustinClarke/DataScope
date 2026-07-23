import { describe, expect, it, vi } from 'vitest';
import { askAI, MAX_SQL_ATTEMPTS, type AskAIDeps } from './ai';
import { createScriptedProvider, ProviderQuotaExhaustedError } from './aiProvider';
import type { AIProvider, ProviderTurn, QueryResult, TableRegistryEntry, ChartRecommendation } from '../types';

const SALES: TableRegistryEntry = {
  id: 'sales',
  tableName: 'sales',
  datasetId: 'd1',
  origin: 'file',
  rowCount: 240,
  columnCount: 3,
  memoryBytes: 0,
  createdAt: '2026-07-21T00:00:00.000Z',
  columns: [
    { name: 'product', semanticType: 'Categorical', physicalType: 'VARCHAR', cardinality: 4, nullPercentage: 0, min: null, max: null, mean: null, stdDev: null },
    { name: 'amount', semanticType: 'Quantitative', physicalType: 'DOUBLE', cardinality: 200, nullPercentage: 0, min: null, max: null, mean: null, stdDev: null },
    { name: 'fare', semanticType: 'Quantitative', physicalType: 'DOUBLE', cardinality: 200, nullPercentage: 0, min: null, max: null, mean: null, stdDev: null },
  ],
};

const RESULT: QueryResult = {
  columnNames: ['product', 'total'],
  columnTypes: ['VARCHAR', 'DOUBLE'],
  rows: [['A', 100], ['B', 80]],
  rowCount: 2,
  executionTimeMs: 4,
};

const toolCall = (id: string, sql: string): ProviderTurn => ({ kind: 'tool_call', call: { id, name: 'execute_local_sql', input: { sql } } });
const text = (t: string): ProviderTurn => ({ kind: 'text', text: t });

function deps(over: Partial<AskAIDeps> & { provider: AIProvider }): AskAIDeps {
  return {
    tables: [SALES],
    runSql: vi.fn(async () => RESULT),
    timeoutMs: 1000,
    ...over,
  };
}

describe('askAI — tool-use loop (§11.1 stages 3–6)', () => {
  it('runs a query, records the audit trail, and auto-charts the final result', async () => {
    const provider = createScriptedProvider([toolCall('t1', 'SELECT product, sum(amount) AS total FROM sales GROUP BY product'), text('Product A leads with 100.')]);
    const recommendChart = vi.fn((): ChartRecommendation => ({ kind: 'chart', spec: { type: 'categorical', title: 'x', xField: 'product', yFields: ['total'] } }));
    const runSql = vi.fn(async () => RESULT);
    const turn = await askAI('total amount by product', deps({ provider, runSql, recommendChart }));

    expect(turn.content).toBe('Product A leads with 100.');
    expect(turn.error).toBeUndefined();
    expect(turn.attempts).toHaveLength(1);
    expect(turn.attempts?.[0]).toMatchObject({ attempt: 1, status: 'ok', rowCount: 2, executionTimeMs: 4 });
    expect(turn.attempts?.[0].sql).toContain('GROUP BY product');
    expect(recommendChart).toHaveBeenCalledWith(RESULT, expect.stringContaining('GROUP BY product'));
    expect(turn.chart).toEqual({ kind: 'chart', spec: expect.objectContaining({ type: 'categorical' }) });
  });

  it('normalizes a typo (stage 1) and records the correction', async () => {
    const provider = createScriptedProvider([toolCall('t1', 'SELECT avg(fare) FROM sales'), text('The average fare is 33.')]);
    const turn = await askAI('average fair', deps({ provider }));
    expect(turn.corrections).toEqual([{ from: 'fair', to: 'fare' }]);
  });

  it('self-corrects a failing query within the cap and feeds the error trace back', async () => {
    const provider = createScriptedProvider([
      toolCall('t1', 'SELECT product, sum(amt) FROM sales GROUP BY product'), // wrong column
      toolCall('t2', 'SELECT product, sum(amount) AS total FROM sales GROUP BY product'),
      text('Fixed — Product A leads.'),
    ]);
    const runSql = vi
      .fn<AskAIDeps['runSql']>()
      .mockRejectedValueOnce(new Error('Binder Error: column "amt" not found'))
      .mockResolvedValueOnce(RESULT);
    const turn = await askAI('sales by product', deps({ provider, runSql }));

    expect(turn.content).toBe('Fixed — Product A leads.');
    expect(turn.attempts).toHaveLength(2);
    expect(turn.attempts?.[0]).toMatchObject({ attempt: 1, status: 'error' });
    expect(turn.attempts?.[0].error).toContain('amt');
    expect(turn.attempts?.[1]).toMatchObject({ status: 'ok' });
    // The retry prompt carried the error trace back to the model.
    const retryMessages = provider.calls[1].messages;
    expect(retryMessages.some((m) => m.role === 'tool' && m.content.includes('amt'))).toBe(true);
  });

  it('stops at exactly MAX_SQL_ATTEMPTS on repeated failure with a clean error', async () => {
    const provider = createScriptedProvider([
      toolCall('t1', 'SELECT 1 FROM nope'),
      toolCall('t2', 'SELECT 1 FROM nope'),
      toolCall('t3', 'SELECT 1 FROM nope'),
      toolCall('t4', 'SELECT 1 FROM nope'), // must never be reached
    ]);
    const runSql = vi.fn(async () => { throw new Error('Catalog Error: table "nope" does not exist'); });
    const turn = await askAI('anything', deps({ provider, runSql }));

    expect(turn.error).toContain(`${MAX_SQL_ATTEMPTS} attempts`);
    expect(turn.attempts).toHaveLength(MAX_SQL_ATTEMPTS);
    expect(runSql).toHaveBeenCalledTimes(MAX_SQL_ATTEMPTS);
    expect(provider.calls).toHaveLength(MAX_SQL_ATTEMPTS); // no 4th round-trip
  });

  it('blocks a dialect fault before execution (stage 4) and never runs the SQL', async () => {
    const provider = createScriptedProvider([
      toolCall('t1', 'SELECT TOP 5 product FROM sales'),
      toolCall('t2', 'SELECT TOP 5 product FROM sales'),
      toolCall('t3', 'SELECT TOP 5 product FROM sales'),
    ]);
    const runSql = vi.fn(async () => RESULT);
    const turn = await askAI('top products', deps({ provider, runSql }));

    expect(runSql).not.toHaveBeenCalled();
    expect(turn.error).toContain('runnable SQL');
    expect(turn.attempts?.[0].lint?.some((f) => f.rule === 'top-clause')).toBe(true);
    // The correction hint about LIMIT was fed back to the model.
    expect(provider.calls[1].messages.some((m) => m.role === 'tool' && m.content.includes('LIMIT'))).toBe(true);
  });

  it('surfaces a provider timeout as a clean error, not a hung chat (§21.6)', async () => {
    const hanging: AIProvider = { id: 'slow', complete: () => new Promise(() => {}) };
    const turn = await askAI('anything', deps({ provider: hanging, timeoutMs: 10 }));
    expect(turn.error).toContain('timed out');
    expect(turn.content).toBe('');
  });

  it('surfaces a provider transport failure cleanly', async () => {
    const broken: AIProvider = { id: 'down', complete: () => Promise.reject(new Error('network down')) };
    const turn = await askAI('anything', deps({ provider: broken }));
    expect(turn.error).toContain('could not be reached');
  });

  it('renders the shared-budget-exhausted state, not a generic failure, on a quota error (§11.2)', async () => {
    const exhausted: AIProvider = { id: 'cloud', complete: () => Promise.reject(new ProviderQuotaExhaustedError()) };
    const turn = await askAI('anything', deps({ provider: exhausted }));
    expect(turn.error).toMatch(/free AI budget is used up/i);
    expect(turn.error).toMatch(/bring your own key|local model|retry tomorrow/i);
  });
});

describe('askAI — D3 client-orchestrated Ollama overflow (2026-07-23)', () => {
  it('swaps to the overflow provider on the very first call and marks the turn', async () => {
    const primary: AIProvider = { id: 'cloud', complete: () => Promise.reject(new ProviderQuotaExhaustedError()) };
    const overflow = createScriptedProvider([
      toolCall('t1', 'SELECT product, sum(amount) AS total FROM sales GROUP BY product'),
      text('Finished on Ollama.'),
    ], 'ollama');
    const runSql = vi.fn(async () => RESULT);
    const turn = await askAI('sales by product', deps({ provider: primary, overflowProvider: overflow, runSql }));

    expect(turn.content).toBe('Finished on Ollama.');
    expect(turn.servedByOllamaOverflow).toBe(true);
    expect(overflow.calls).toHaveLength(2);
  });

  it('fires mid-turn (not on call 1) and persists the swap for the rest of the turn', async () => {
    let primaryCalls = 0;
    const primary: AIProvider = {
      id: 'cloud',
      complete: async () => {
        primaryCalls += 1;
        if (primaryCalls === 1) return toolCall('t1', 'SELECT product, sum(amount) AS total FROM sales GROUP BY product');
        throw new ProviderQuotaExhaustedError();
      },
    };
    const overflow = createScriptedProvider([text('Finished on Ollama after the swap.')], 'ollama');
    const runSql = vi.fn(async () => RESULT);
    const turn = await askAI('sales by product', deps({ provider: primary, overflowProvider: overflow, runSql }));

    expect(primaryCalls).toBe(2); // one successful tool call, then the quota error
    expect(overflow.calls).toHaveLength(1); // the retried iteration, served entirely by the overflow
    expect(turn.content).toBe('Finished on Ollama after the swap.');
    expect(turn.servedByOllamaOverflow).toBe(true);
    expect(turn.attempts).toHaveLength(1); // the SQL that ran before the swap is still in the audit trail
  });

  it('a quota error with no overflow provider configured still renders the standard exhausted state', async () => {
    const primary: AIProvider = { id: 'cloud', complete: () => Promise.reject(new ProviderQuotaExhaustedError()) };
    const turn = await askAI('anything', deps({ provider: primary }));
    expect(turn.servedByOllamaOverflow).toBeUndefined();
    expect(turn.quotaExhausted).toBe(true);
  });

  it('surfaces a distinct, endpoint-naming message when the overflow provider itself fails', async () => {
    const primary: AIProvider = { id: 'cloud', complete: () => Promise.reject(new ProviderQuotaExhaustedError()) };
    const overflow: AIProvider = { id: 'ollama', complete: () => Promise.reject(new Error('fetch failed')) };
    const turn = await askAI(
      'anything',
      deps({ provider: primary, overflowProvider: overflow, overflowBaseUrl: 'http://localhost:11434' }),
    );
    expect(turn.error).toContain('http://localhost:11434');
    expect(turn.error).toMatch(/prefer my key/i);
    expect(turn.servedByOllamaOverflow).toBeUndefined(); // never got a successful turn to mark
  });
});

describe('askAI — §11.3 data-sampled repair (06-ai/03, metadataOnlyRepair)', () => {
  const SAMPLE: QueryResult = {
    columnNames: ['product', 'amount'],
    columnTypes: ['VARCHAR', 'DOUBLE'],
    rows: [['A', 1], ['B', 2], ['C', 3], ['D', 4], ['E', 5]],
    rowCount: 5,
    executionTimeMs: 1,
  };

  it('metadata-only (the default): a failed attempt carries only the error trace, never sample rows', async () => {
    const provider = createScriptedProvider([
      toolCall('t1', 'SELECT product, sum(amt) FROM sales GROUP BY product'),
      toolCall('t2', 'SELECT product, sum(amount) AS total FROM sales GROUP BY product'),
      text('Fixed.'),
    ]);
    const runSql = vi
      .fn<AskAIDeps['runSql']>()
      .mockRejectedValueOnce(new Error('Binder Error: column "amt" not found'))
      .mockResolvedValueOnce(RESULT);
    const turn = await askAI('sales by product', deps({ provider, runSql })); // metadataOnlyRepair defaults true

    expect(turn.attempts?.[0].sampledRows).toBeUndefined();
    expect(runSql).toHaveBeenCalledTimes(2); // the failing exec + the corrected retry — no resample call
    const retryMessages = provider.calls[1].messages;
    expect(retryMessages.some((m) => m.role === 'tool' && /Sample rows/i.test(m.content))).toBe(false);
  });

  it('data-sampled repair (metadataOnlyRepair: false): a failed attempt resamples up to 3 rows and the transcript marks it', async () => {
    const provider = createScriptedProvider([
      toolCall('t1', 'SELECT product, sum(amt) FROM sales GROUP BY product'),
      toolCall('t2', 'SELECT product, sum(amount) AS total FROM sales GROUP BY product'),
      text('Fixed.'),
    ]);
    const runSql = vi
      .fn<AskAIDeps['runSql']>()
      .mockRejectedValueOnce(new Error('Binder Error: column "amt" not found'))
      .mockResolvedValueOnce(SAMPLE) // the resample query (5 rows available)
      .mockResolvedValueOnce(RESULT); // the corrected retry
    const turn = await askAI('sales by product', deps({ provider, runSql, metadataOnlyRepair: false }));

    expect(turn.attempts?.[0].sampledRows).toBe(true);
    expect(runSql).toHaveBeenCalledTimes(3);
    expect(runSql.mock.calls[1][0]).toContain('LIMIT 3');
    expect(runSql.mock.calls[1][0]).toContain('"sales"');

    const retryMessages = provider.calls[1].messages;
    const toolMsg = retryMessages.find((m) => m.role === 'tool' && m.content.includes('amt'));
    expect(toolMsg?.content).toContain('Sample rows from "sales"');
    // At most 3 rows even though the mock's table has 5 — the defensive slice, not just the SQL LIMIT.
    expect(toolMsg?.content).toContain('"C"');
    expect(toolMsg?.content).not.toContain('"D"');
    expect(toolMsg?.content).not.toContain('"E"');
  });

  it('degrades silently to metadata-only when the resample itself fails — no crash, no sampledRows flag', async () => {
    const provider = createScriptedProvider([
      toolCall('t1', 'SELECT product, sum(amt) FROM sales GROUP BY product'),
      toolCall('t2', 'SELECT product, sum(amount) AS total FROM sales GROUP BY product'),
      text('Fixed.'),
    ]);
    const runSql = vi
      .fn<AskAIDeps['runSql']>()
      .mockRejectedValueOnce(new Error('Binder Error: column "amt" not found'))
      .mockRejectedValueOnce(new Error('resample also failed'))
      .mockResolvedValueOnce(RESULT);
    const turn = await askAI('sales by product', deps({ provider, runSql, metadataOnlyRepair: false }));

    expect(turn.content).toBe('Fixed.');
    expect(turn.attempts?.[0].sampledRows).toBeUndefined();
  });

  it('never resamples on the terminal failed attempt (no wasted query once the turn is about to fail)', async () => {
    const provider = createScriptedProvider([
      toolCall('t1', 'SELECT 1 FROM nope'),
      toolCall('t2', 'SELECT 1 FROM nope'),
      toolCall('t3', 'SELECT 1 FROM nope'),
    ]);
    const runSql = vi.fn(async (sql: string) => {
      if (sql.includes('LIMIT 3')) return SAMPLE;
      throw new Error('Catalog Error: table "nope" does not exist');
    });
    const turn = await askAI('anything', deps({ provider, runSql, metadataOnlyRepair: false }));

    expect(turn.error).toContain(`${MAX_SQL_ATTEMPTS} attempts`);
    expect(turn.attempts?.[0].sampledRows).toBe(true);
    expect(turn.attempts?.[1].sampledRows).toBe(true);
    expect(turn.attempts?.[2].sampledRows).toBeUndefined(); // the terminal attempt — never sampled
    // 2 resamples (attempts 1–2) + 3 executions = 5; the terminal attempt adds no 6th call.
    expect(runSql).toHaveBeenCalledTimes(5);
  });
});
