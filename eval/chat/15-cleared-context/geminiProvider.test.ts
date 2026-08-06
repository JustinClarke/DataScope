import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createUsageTrackedGeminiProvider, usageFromMetadata } from './geminiProvider';

describe('usageFromMetadata', () => {
  it('splits raw output into candidates + thinking, and billable prompt into non-cached', () => {
    const usage = usageFromMetadata({
      promptTokenCount: 1000,
      candidatesTokenCount: 200,
      thoughtsTokenCount: 50,
      cachedContentTokenCount: 700,
    });
    expect(usage).toEqual({
      rawPromptTokens: 1000,
      rawOutputTokens: 250, // 200 candidates + 50 thinking — thinking is sampling, not infrastructure
      billablePromptTokens: 300, // 1000 - 700 cached
      billableOutputTokens: 250, // output has no caching, so billable === raw
    });
  });

  it('defaults thinking and cache to zero when absent — a valid outcome, not missing data', () => {
    const usage = usageFromMetadata({ promptTokenCount: 100, candidatesTokenCount: 20 });
    expect(usage).toEqual({
      rawPromptTokens: 100,
      rawOutputTokens: 20,
      billablePromptTokens: 100,
      billableOutputTokens: 20,
    });
  });

  it('throws rather than falling back to a sentinel when usageMetadata is entirely absent', () => {
    expect(() => usageFromMetadata(undefined)).toThrow(/missing usageMetadata/);
  });

  it('throws when promptTokenCount is missing', () => {
    expect(() => usageFromMetadata({ candidatesTokenCount: 20 })).toThrow(/missing usageMetadata/);
  });

  it('throws when candidatesTokenCount is missing', () => {
    expect(() => usageFromMetadata({ promptTokenCount: 100 })).toThrow(/missing usageMetadata/);
  });
});

function fakeFetch(response: unknown, init: { status?: number } = {}): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(response), { status: init.status ?? 200 })) as unknown as typeof fetch;
}

describe('createUsageTrackedGeminiProvider', () => {
  const originalKey = process.env.GEMINI_API_KEY;
  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'test-key';
  });
  afterAll(() => {
    process.env.GEMINI_API_KEY = originalKey;
  });

  it('reports CallUsage via onUsage and returns a ProviderTurn built from every functionCall part', async () => {
    const fetchImpl = fakeFetch({
      candidates: [
        {
          content: {
            parts: [
              { text: 'thinking out loud' },
              { functionCall: { name: 'get_schema', args: {} } },
              { functionCall: { name: 'run_sql', args: { sql: 'select 1' } } },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 40, thoughtsTokenCount: 10, cachedContentTokenCount: 200 },
    });

    const onUsage = vi.fn();
    const provider = createUsageTrackedGeminiProvider({ fetchImpl, onUsage });
    const turn = await provider.complete([{ role: 'user', content: 'go' }], []);

    expect(turn.text).toBe('thinking out loud');
    expect(turn.calls.map((c) => c.name)).toEqual(['get_schema', 'run_sql']);
    expect(onUsage).toHaveBeenCalledWith({
      rawPromptTokens: 500,
      rawOutputTokens: 50,
      billablePromptTokens: 300,
      billableOutputTokens: 50,
    });
  });

  it('propagates the usageFromMetadata throw when the provider omits usage — never calls onUsage with bad data', async () => {
    const fetchImpl = fakeFetch({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    const onUsage = vi.fn();
    const provider = createUsageTrackedGeminiProvider({ fetchImpl, onUsage });

    await expect(provider.complete([{ role: 'user', content: 'go' }], [])).rejects.toThrow(/missing usageMetadata/);
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('retries on 429 and eventually succeeds', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return new Response('rate limited', { status: 429 });
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'done' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const onUsage = vi.fn();
    const provider = createUsageTrackedGeminiProvider({ fetchImpl, onUsage });
    const turn = await provider.complete([{ role: 'user', content: 'go' }], []);

    expect(turn.text).toBe('done');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  }, 10_000);
});
