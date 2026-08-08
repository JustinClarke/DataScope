import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTurnSummary, createSession, recordTurn, resolveStandaloneQuestion, type Session } from './session';
import type { TurnResult } from './chat';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchOnce(content: string, usage: { prompt?: number; output?: number } = {}): ReturnType<typeof vi.fn> {
  const fn = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ message: { content }, prompt_eval_count: usage.prompt ?? 100, eval_count: usage.output ?? 20 }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

function answeredResult(over: Partial<TurnResult> = {}): TurnResult {
  return {
    status: 'answered',
    question: 'q',
    sql: 'SELECT 1',
    assumptions: [],
    result: { columnNames: ['n'], rows: [[1]], totalCount: 1, rowTruncated: false, byteTruncated: false, elapsedMs: 5 },
    answer: '1',
    reason: null,
    unsupportedDisputed: false,
    repaired: false,
    followUpsUsed: 0,
    malformedReplies: 0,
    salvagedSql: [],
    usage: [],
    totalElapsedMs: 10,
    ...over,
  };
}

describe('createSession', () => {
  it('starts empty', () => {
    expect(createSession()).toEqual({ turns: [] });
  });
});

describe('buildTurnSummary', () => {
  it('summarizes a single-row single-column answer without repeating raw rows in a longer form', () => {
    const summary = buildTurnSummary(1, 'How many orders?', 'How many orders?', answeredResult());
    expect(summary.resultSummary).toBe('1 row: 1');
    expect(summary.status).toBe('answered');
    expect(summary.sql).toBe('SELECT 1');
  });

  it('summarizes a multi-row result by count and columns, not raw values', () => {
    const result = answeredResult({
      result: {
        columnNames: ['category', 'revenue'],
        rows: [
          ['Books', 100],
          ['Toys', 50],
        ],
        totalCount: 2,
        rowTruncated: false,
        byteTruncated: false,
        elapsedMs: 5,
      },
    });
    const summary = buildTurnSummary(1, 'q', 'q', result);
    expect(summary.resultSummary).toBe('2 row(s), columns: category, revenue');
  });

  it('flags truncation in the summary', () => {
    const result = answeredResult({
      result: {
        columnNames: ['a'],
        rows: [['x'], ['y']],
        totalCount: 500,
        rowTruncated: true,
        byteTruncated: false,
        elapsedMs: 5,
      },
    });
    expect(buildTurnSummary(1, 'q', 'q', result).resultSummary).toBe('500 row(s) (truncated), columns: a');
  });

  it('summarizes an unsupported turn with its reason, never a raw result', () => {
    const result: TurnResult = {
      status: 'unsupported',
      question: 'q',
      sql: null,
      assumptions: [],
      result: null,
      answer: null,
      reason: 'no cost field exists',
      unsupportedDisputed: false,
      repaired: false,
      followUpsUsed: 0,
      malformedReplies: 0,
      salvagedSql: [],
      usage: [],
      totalElapsedMs: 5,
    };
    expect(buildTurnSummary(1, 'q', 'q', result).resultSummary).toBe('unsupported — no cost field exists');
  });

  it('summarizes a refused turn with its guard reason', () => {
    const result: TurnResult = {
      status: 'refused',
      question: 'q',
      sql: 'DELETE FROM order_totals',
      assumptions: [],
      result: null,
      answer: null,
      reason: 'statement must start with SELECT or WITH',
      unsupportedDisputed: false,
      repaired: false,
      followUpsUsed: 0,
      malformedReplies: 0,
      salvagedSql: [],
      usage: [],
      totalElapsedMs: 5,
    };
    expect(buildTurnSummary(1, 'q', 'q', result).resultSummary).toBe('refused — statement must start with SELECT or WITH');
  });
});

describe('recordTurn', () => {
  it('keeps only the most recent 3 turns', () => {
    let session: Session = createSession();
    for (let i = 1; i <= 5; i++) {
      session = recordTurn(session, buildTurnSummary(i, `q${i}`, `q${i}`, answeredResult()));
    }
    expect(session.turns.map((t) => t.turnId)).toEqual([3, 4, 5]);
  });
});

describe('resolveStandaloneQuestion', () => {
  it('costs no model call on the first turn of a session', async () => {
    const fetchSpy = mockFetchOnce('should never be called');
    const { standaloneQuestion, usage } = await resolveStandaloneQuestion('qwen3:4b', 'How many orders?', createSession());
    expect(standaloneQuestion).toBe('How many orders?');
    expect(usage).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rewrites a follow-up using the session\'s typed history and returns the trimmed model text', async () => {
    mockFetchOnce('  Break completed revenue down by category.  ', { prompt: 300, output: 15 });
    const session: Session = {
      turns: [buildTurnSummary(1, 'Show revenue by category.', 'Show completed revenue by category.', answeredResult())],
    };
    const { standaloneQuestion, usage } = await resolveStandaloneQuestion('qwen3:4b', 'Only completed.', session);
    expect(standaloneQuestion).toBe('Break completed revenue down by category.');
    expect(usage).toEqual({ promptTokens: 300, outputTokens: 15 });
  });

  it('includes the prior turn\'s question, resolved question, status, SQL, and result summary in the model prompt', async () => {
    const fetchSpy = mockFetchOnce('Now by month.');
    const session: Session = {
      turns: [buildTurnSummary(1, 'Show revenue by category.', 'Show completed revenue by category.', answeredResult({ sql: 'SELECT category, SUM(x) FROM sales_lines GROUP BY category' }))],
    };
    await resolveStandaloneQuestion('qwen3:4b', 'Now by month.', session);

    const call = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((call[1] as RequestInit).body as string) as { messages: Array<{ role: string; content: string }> };
    const systemMessage = body.messages.find((m) => m.role === 'system')!.content;
    expect(systemMessage).toContain('Show revenue by category.');
    expect(systemMessage).toContain('Show completed revenue by category.');
    expect(systemMessage).toContain('status answered');
    expect(systemMessage).toContain('SELECT category, SUM(x) FROM sales_lines GROUP BY category');
  });
});
