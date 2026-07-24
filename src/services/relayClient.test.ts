import { describe, expect, it, vi } from 'vitest';
import { fetchViaRelay, RelayFetchError } from './relayClient';

const ENDPOINT = 'https://edge.test/cors-relay';

function jsonFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }),
    ),
  );
}

describe('fetchViaRelay — pass-through', () => {
  it('sends the target url and sessionId as query params, GET only', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('hello', { status: 200 })));
    const response = await fetchViaRelay('https://api.example.com/data', 'sess-1', {
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await response.text()).toBe('hello');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(ENDPOINT);
    expect(parsed.searchParams.get('url')).toBe('https://api.example.com/data');
    expect(parsed.searchParams.get('sessionId')).toBe('sess-1');
    expect(init.method ?? 'GET').toBe('GET');
    // No credentials or custom headers beyond the target URL/sessionId query
    // params ever leave the browser — §7.4's "no headers beyond the target
    // URL" client-side requirement.
    expect(init.headers).toBeUndefined();
    expect(init.credentials).toBeUndefined();
  });

  it('returns a non-ok response other than 429/503 as-is, for the caller to classify', async () => {
    const fetchImpl = jsonFetch(404, { error: 'nope' });
    const response = await fetchViaRelay('https://api.example.com/missing', 'sess-1', {
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(response.status).toBe(404);
  });
});

describe('fetchViaRelay — relay control-plane failures', () => {
  it('classifies a 429 as rate-limited, carrying retry-after', async () => {
    const fetchImpl = jsonFetch(429, { error: 'rate-limited' }, { 'retry-after': '60' });
    const call = fetchViaRelay('https://api.example.com/data', 'sess-1', {
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(call).rejects.toBeInstanceOf(RelayFetchError);
    await expect(call).rejects.toMatchObject({ code: 'rate-limited', retryAfterSeconds: 60 });
  });

  it('classifies a 503 as paused', async () => {
    const fetchImpl = jsonFetch(503, { error: 'paused' });
    const call = fetchViaRelay('https://api.example.com/data', 'sess-1', {
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(call).rejects.toMatchObject({ code: 'paused' });
  });

  it('classifies an unreachable relay as unreachable rather than throwing a bare TypeError', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const call = fetchViaRelay('https://api.example.com/data', 'sess-1', {
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(call).rejects.toMatchObject({ code: 'unreachable' });
  });
});
