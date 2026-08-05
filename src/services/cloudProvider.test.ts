import { describe, it, expect, vi } from 'vitest';
import { createCloudProvider } from './cloudProvider';
import { ProviderQuotaExhaustedError } from './aiProvider';
import type { AITool, ProviderMessage } from '../types';

const messages: ProviderMessage[] = [{ role: 'user', content: 'how many orders?' }];
const tools: AITool[] = [{ name: 'execute_local_sql', description: '', inputSchema: {} }];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sseResponse(frames: string[]): Response {
  const body = frames.map((f) => `data: ${f}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('cloudProvider: request mapping', () => {
  it('posts the routing preference, session id, and loop attempt', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ turn: { text: 'ok', calls: [] }, servedBy: 'workers-ai' })),
      );
    const provider = createCloudProvider({
      endpoint: 'https://edge/ai-router',
      sessionId: 's-1',
      routing: 'free-tier-first',
      fetchImpl,
    });
    await provider.complete(messages, tools);
    await provider.complete(messages, tools);
    const secondBody = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(secondBody).toMatchObject({
      sessionId: 's-1',
      routing: 'free-tier-first',
      attempt: 2, // each complete() call is one loop attempt
    });
  });

  it('returns the router’s turn on a JSON response, every call intact', async () => {
    const turn = {
      text: 'Checking both.',
      calls: [
        { id: 'c1', name: 'run_sql', input: { sql: 'SELECT 1' } },
        { id: 'c2', name: 'run_sql', input: { sql: 'SELECT 2' } },
      ],
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ turn, servedBy: 'byok' }));
    const provider = createCloudProvider({ endpoint: 'https://e', sessionId: 's', routing: 'prefer-key', fetchImpl });
    expect(await provider.complete(messages, tools)).toEqual(turn);
  });

  it('names a router still on the pre-A4 turn shape rather than reading it as a no-call answer', async () => {
    const legacy = { kind: 'tool_call', call: { id: 'c1', name: 'execute_local_sql', input: { sql: 'SELECT 1' } } };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ turn: legacy, servedBy: 'byok' }));
    const provider = createCloudProvider({ endpoint: 'https://e', sessionId: 's', routing: 'prefer-key', fetchImpl });
    await expect(provider.complete(messages, tools)).rejects.toThrow(/redeploy the edge Worker/);
  });

  it('attaches the BYOK credential when configured; omits the field entirely without one', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ turn: { text: 'ok', calls: [] }, servedBy: 'byok' })),
      );
    const withKey = createCloudProvider({
      endpoint: 'https://e',
      sessionId: 's',
      routing: 'prefer-key',
      byok: { provider: 'openai', key: 'sk-user-key' },
      fetchImpl,
    });
    await withKey.complete(messages, tools);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).byok).toEqual({ provider: 'openai', key: 'sk-user-key' });

    const withoutKey = createCloudProvider({ endpoint: 'https://e', sessionId: 's', routing: 'free-tier-first', fetchImpl });
    await withoutKey.complete(messages, tools);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).not.toHaveProperty('byok');
  });
});

describe('cloudProvider: typed-error translation', () => {
  const cases: Array<[string, number]> = [
    ['quota-exhausted', 429],
    ['pool-exhausted', 429],
    ['paused', 503],
  ];
  it.each(cases)('maps %s to ProviderQuotaExhaustedError', async (code, status) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: code }, status));
    const provider = createCloudProvider({ endpoint: 'https://e', sessionId: 's', routing: 'free-tier-first', fetchImpl });
    await expect(provider.complete(messages, tools)).rejects.toBeInstanceOf(ProviderQuotaExhaustedError);
  });

  it('maps timeout to a TimeoutError, not a quota error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'timeout' }, 504));
    const provider = createCloudProvider({ endpoint: 'https://e', sessionId: 's', routing: 'free-tier-first', fetchImpl });
    await expect(provider.complete(messages, tools)).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it.each([
    ['rate-limited', 429],
    ['upstream-error', 502], // e.g. the user's own provider rejected their BYOK key
  ] as Array<[string, number]>)('maps %s to a plain transport error', async (code, status) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: code }, status));
    const provider = createCloudProvider({ endpoint: 'https://e', sessionId: 's', routing: 'free-tier-first', fetchImpl });
    const err = await provider.complete(messages, tools).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ProviderQuotaExhaustedError);
  });
});

describe('cloudProvider: streaming', () => {
  it('forwards each delta to onToken incrementally and returns the final turn', async () => {
    const tokens: string[] = [];
    const frames = [
      JSON.stringify({ type: 'delta', text: 'SELECT ' }),
      JSON.stringify({ type: 'delta', text: 'count(*)' }),
      JSON.stringify({ type: 'done', turn: { text: 'SELECT count(*)', calls: [] }, servedBy: 'workers-ai' }),
      '[DONE]',
    ];
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse(frames));
    const provider = createCloudProvider({
      endpoint: 'https://e',
      sessionId: 's',
      routing: 'free-tier-first',
      stream: true,
      onToken: (t) => tokens.push(t),
      fetchImpl,
    });
    const turn = await provider.complete(messages, tools);
    expect(tokens).toEqual(['SELECT ', 'count(*)']);
    expect(turn).toEqual({ text: 'SELECT count(*)', calls: [] });
  });
});
