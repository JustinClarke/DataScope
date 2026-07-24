import { describe, expect, it, vi } from 'vitest';
import * as aggregateSize from '../features/ingestion/aggregateSize';

// decideSizeTier's own threshold math is covered by aggregateSize.test.ts;
// here it's spied so a few tests can force a 'warn'/'sampled'/'refuse' tier
// without allocating a real 50–300MB response body just to cross a byte
// threshold. Every other test relies on the real implementation via
// tiny fixture bodies, which naturally land in 'full'.
vi.mock('../features/ingestion/aggregateSize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/ingestion/aggregateSize')>();
  return { ...actual, decideSizeTier: vi.fn(actual.decideSizeTier) };
});

import { ApiFetchError, fetchApiSource, fetchApiSourceViaRelay, tableNameFromUrl } from './apiIngestion';
import { RelayFetchError } from './relayClient';

const mockedDecideSizeTier = vi.mocked(aggregateSize.decideSizeTier);

function jsonResponse(body: unknown, init: { status?: number; link?: string } = {}): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.link) headers.link = init.link;
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

async function decodeBuffer(buffer: Uint8Array): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(buffer));
}

describe('fetchApiSource — URL validation', () => {
  it('rejects a malformed URL before ever calling fetch', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchApiSource('not a url', { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow(
      ApiFetchError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a non-http(s) protocol before ever calling fetch', async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchApiSource('ftp://example.com/data.json', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: 'invalid-url' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('fetchApiSource — single page', () => {
  it('registers a JSON array response as one buffer, raw bytes preserved', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ id: 1 }, { id: 2 }]));
    const result = await fetchApiSource('https://api.example.com/items', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.pagesFetched).toBe(1);
    expect(result.sizeTier).toBe('full');
    expect(await decodeBuffer(result.buffer)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('registers a single non-array JSON body as-is, ignoring any Link header', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ foo: 'bar' }, { link: '<https://api.example.com/p2>; rel="next"' }));
    const result = await fetchApiSource('https://api.example.com/thing', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.pagesFetched).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await decodeBuffer(result.buffer)).toEqual({ foo: 'bar' });
  });
});

describe('fetchApiSource — pagination', () => {
  it('follows a GitHub-style Link rel="next" header and merges pages into one array', async () => {
    const page1 = 'https://api.example.com/items?page=1';
    const page2 = 'https://api.example.com/items?page=2';
    const onProgress = vi.fn();
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === page1) return jsonResponse([1, 2], { link: `<${page2}>; rel="next"` });
      if (url === page2) return jsonResponse([3]);
      throw new Error(`unexpected url ${url}`);
    });

    const result = await fetchApiSource(page1, { fetchImpl: fetchImpl as unknown as typeof fetch, onProgress });

    expect(result.pagesFetched).toBe(2);
    expect(await decodeBuffer(result.buffer)).toEqual([1, 2, 3]);
    expect(fetchImpl).toHaveBeenNthCalledWith(2, page2, expect.anything());
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, expect.any(Number));
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, expect.any(Number));
  });

  it('stops at maxPages rather than following an unbounded Link chain', async () => {
    const fetchImpl = vi.fn(async (url: string) => jsonResponse([url], { link: `<${url}-next>; rel="next"` }));
    const result = await fetchApiSource('https://api.example.com/items', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxPages: 3,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.pagesFetched).toBe(3);
  });

  it('stops paginating once the accumulated response crosses into sampled territory', async () => {
    mockedDecideSizeTier.mockReturnValueOnce('sampled');
    const page1 = 'https://api.example.com/items?page=1';
    const fetchImpl = vi.fn(async () =>
      jsonResponse([1, 2], { link: '<https://api.example.com/items?page=2>; rel="next"' }),
    );
    const result = await fetchApiSource(page1, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.sizeTier).toBe('sampled');
  });
});

describe('fetchApiSource — failure classification', () => {
  it('classifies a bare fetch rejection as cors-suspected', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(
      fetchApiSource('https://api.example.com/items', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: 'cors-suspected' });
  });

  it('classifies an aborted request as a timeout', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('The operation was aborted', 'AbortError');
    });
    await expect(
      fetchApiSource('https://api.example.com/items', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('surfaces a non-ok HTTP response with its status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'nope' }, { status: 404 }));
    await expect(
      fetchApiSource('https://api.example.com/items', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: 'http-error', message: expect.stringContaining('404') });
  });

  it('surfaces a non-JSON body as invalid-json rather than half-registering anything', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>not json</html>', { status: 200 }));
    await expect(
      fetchApiSource('https://api.example.com/items', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: 'invalid-json' });
  });

  it('surfaces too-large without ever attempting to parse the body', async () => {
    mockedDecideSizeTier.mockReturnValueOnce('refuse');
    const fetchImpl = vi.fn(async () => jsonResponse([{ id: 1 }]));
    await expect(
      fetchApiSource('https://api.example.com/items', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: 'too-large' });
  });
});

describe('fetchApiSourceViaRelay — Tier 2 (build/07-connectivity/02-api-tier2-relay)', () => {
  const ENDPOINT = 'https://edge.test/cors-relay';

  function targetParam(fetchImpl: ReturnType<typeof vi.fn>, callIndex = 0): string | null {
    const [url] = fetchImpl.mock.calls[callIndex] as unknown as [string];
    return new URL(url).searchParams.get('url');
  }

  it('fetches a single page through the relay, sessionId and target url as query params', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ id: 1 }]));
    const result = await fetchApiSourceViaRelay('https://api.example.com/items', 'sess-1', {
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.pagesFetched).toBe(1);
    expect(await decodeBuffer(result.buffer)).toEqual([{ id: 1 }]);

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(ENDPOINT);
    expect(parsed.searchParams.get('sessionId')).toBe('sess-1');
    expect(targetParam(fetchImpl)).toBe('https://api.example.com/items');
  });

  it('still follows a Link header if the relay response carries one, same loop as Tier 1', async () => {
    const page1 = 'https://api.example.com/items?page=1';
    const page2 = 'https://api.example.com/items?page=2';
    const fetchImpl = vi.fn(async (relayUrl: string) => {
      const target = new URL(relayUrl).searchParams.get('url');
      if (target === page1) return jsonResponse([1, 2], { link: `<${page2}>; rel="next"` });
      if (target === page2) return jsonResponse([3]);
      throw new Error(`unexpected target ${target}`);
    });
    const result = await fetchApiSourceViaRelay(page1, 'sess-1', {
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.pagesFetched).toBe(2);
    expect(await decodeBuffer(result.buffer)).toEqual([1, 2, 3]);
  });

  it('stops at maxPages, same 20-relay-call cap the leaf doc requires', async () => {
    const fetchImpl = vi.fn(async (relayUrl: string) => {
      const target = new URL(relayUrl).searchParams.get('url') ?? '';
      return jsonResponse([target], { link: `<${target}-next>; rel="next"` });
    });
    const result = await fetchApiSourceViaRelay('https://api.example.com/items', 'sess-1', {
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxPages: 3,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.pagesFetched).toBe(3);
  });

  it('lets a relay rate-limit/pause failure propagate as RelayFetchError, not wrapped as ApiFetchError', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: 'rate-limited' }), { status: 429, headers: { 'retry-after': '60' } }),
    );
    const call = fetchApiSourceViaRelay('https://api.example.com/items', 'sess-1', {
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(call).rejects.toBeInstanceOf(RelayFetchError);
    await expect(call).rejects.toMatchObject({ code: 'rate-limited' });
  });

  it('still surfaces too-large via the shared size-tier gate', async () => {
    mockedDecideSizeTier.mockReturnValueOnce('refuse');
    const fetchImpl = vi.fn(async () => jsonResponse([{ id: 1 }]));
    const call = fetchApiSourceViaRelay('https://api.example.com/items', 'sess-1', {
      endpoint: ENDPOINT,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(call).rejects.toMatchObject({ code: 'too-large' });
  });
});

describe('tableNameFromUrl', () => {
  it("takes the URL's last path segment", () => {
    expect(tableNameFromUrl('https://api.github.com/repos/duckdb/duckdb/issues')).toBe('issues');
  });

  it('falls back to the hostname for a root URL', () => {
    expect(tableNameFromUrl('https://api.example.com/')).toBe('api.example.com');
  });

  it('ignores the query string', () => {
    expect(tableNameFromUrl('https://api.example.com/data?x=1&y=2')).toBe('data');
  });
});
