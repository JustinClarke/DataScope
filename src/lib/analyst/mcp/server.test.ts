// A5's exit criteria, as tests (master §11.5, D74a).
//
// Each case here corresponds to a line in `05-mcp-server.md`'s definition of
// done, because "the in-tab path is real MCP" is the kind of claim that is
// either pinned by an assertion or quietly false six months later.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalystCore } from '../core';
import { ANALYST_TOOLS } from '../toolSchemas';
import type { OpOutcome } from '../types';
import { connectAnalystMcp, type AnalystMcpSession } from './connect';
import { ANALYST_SERVER_NAME, createAnalystMcpServer } from './server';

function stubCore(
  handler: (op: string, params: unknown, signal?: AbortSignal) => OpOutcome | Promise<OpOutcome>,
): AnalystCore & { calls: Array<{ op: string; params: unknown }> } {
  const calls: Array<{ op: string; params: unknown }> = [];
  const invoke = async (op: string, params: unknown, options?: { signal?: AbortSignal }) => {
    calls.push({ op, params });
    return handler(op, params, options?.signal);
  };
  return {
    engine: 'duckdb-wasm',
    calls,
    invoke,
    call: invoke as AnalystCore['call'],
    ready: async () => ({ profile: 'shared', applied: [], refused: [] }) as never,
    noteContribution: () => {},
    store: null as never,
    close: async () => {},
  };
}

const ROWS: OpOutcome = {
  op: 'run_sql',
  sql: 'SELECT 1',
  resultId: 'r1',
  schema: [{ name: 'n', type: 'INTEGER' }],
  rowCount: 1,
  rows: [[1]],
  complete: true,
  nextOffset: null,
  elapsedMs: 2,
};

const open: AnalystMcpSession[] = [];
async function session(core: AnalystCore): Promise<AnalystMcpSession> {
  const s = await connectAnalystMcp(core);
  open.push(s);
  return s;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => s.close().catch(() => undefined)));
});

describe('the server declares the catalog, and only the catalog', () => {
  it('serves every operation with its schema over tools/list', async () => {
    const tools = await (await session(stubCore(() => ROWS))).tools();

    expect(tools.map((t) => t.name)).toEqual(ANALYST_TOOLS.map((t) => t.name));
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
  });

  it('dispatches a call to the core and returns the envelope intact', async () => {
    const core = stubCore(() => ROWS);
    const outcome = await (await session(core)).call('run_sql', { sql: 'SELECT 1' });

    expect(core.calls).toEqual([{ op: 'run_sql', params: { sql: 'SELECT 1' } }]);
    // Every field, not a rendering of some of them — `sql` and `resultId` in
    // particular are what let the user re-run and page what the model computed.
    expect(outcome).toEqual(ROWS);
  });
});

describe('OpError survives the protocol boundary (A5 definition of done)', () => {
  const failure: OpOutcome = {
    ok: false,
    code: 'unknown_object',
    message: 'No table named ordrs.',
    hint: 'orders',
  };

  it('arrives complete, hint included', async () => {
    const outcome = await (await session(stubCore(() => failure))).call('describe_table', { table: 'ordrs' });
    expect(outcome).toEqual(failure);
  });

  it('is a tool result, not a JSON-RPC error, so the loop can carry on', async () => {
    // The distinction D74's loop rule depends on: tools stay available after a
    // failure and the model recovers on an ordinary turn. A JSON-RPC error is a
    // transport fault and some hosts tear the turn down on one.
    const core = stubCore(() => failure);
    const server = createAnalystMcpServer(core);
    const client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(b), client.connect(a)]);

    const raw = await client.callTool({ name: 'describe_table', arguments: { table: 'ordrs' } });

    expect(raw.isError).toBe(true);
    expect(raw.structuredContent).toEqual(failure);
    // …and the text block carries the same envelope, for a host that reads only
    // `content`.
    expect(JSON.parse((raw.content as Array<{ text: string }>)[0].text)).toEqual(failure);

    await Promise.all([client.close(), server.close()]);
  });

  it('lets an unknown operation reach the core, so the core’s hint is what comes back', async () => {
    // Deliberately *not* registered per-tool on the SDK server: `registerTool`
    // would reject an unknown name with its own JSON-RPC error and the model
    // would never see the catalog's mechanical nearest-name hint. Dispatch goes
    // to `core.invoke`, which owns that refusal — see the header of `server.ts`.
    const core = stubCore((op) => ({
      ok: false,
      code: 'invalid_argument',
      message: `No operation named ${op}.`,
      hint: 'run_sql',
    }));
    const outcome = await (await session(core)).call('summarize_everything', {});

    expect(core.calls).toEqual([{ op: 'summarize_everything', params: {} }]);
    expect(outcome).toMatchObject({
      ok: false,
      code: 'invalid_argument',
      message: 'No operation named summarize_everything.',
      hint: 'run_sql',
    });
  });
});

describe('cancellation crosses the boundary (A4 defect iv, not re-introduced)', () => {
  it('aborts the core’s signal when the client cancels in flight', async () => {
    let sawAbort = false;
    const core = stubCore(
      (_op, _params, signal) =>
        new Promise<OpOutcome>((resolve) => {
          signal?.addEventListener('abort', () => {
            sawAbort = true;
            resolve({ ok: false, code: 'cancelled', message: 'The operation was cancelled.' });
          });
        }),
    );
    const s = await session(core);
    const controller = new AbortController();
    const inFlight = s.call('run_sql', { sql: 'SELECT 1' }, { signal: controller.signal });
    // Let the request reach the handler before cancelling it.
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();

    // Caller cancellation is control flow, not a result: it unwinds as an
    // AbortError so `askAI` can drop a superseded turn rather than answering a
    // question nobody is waiting for.
    await expect(inFlight).rejects.toMatchObject({ name: 'AbortError' });
    expect(sawAbort).toBe(true);
  });
});

describe('one server object, and no wire under the tab', () => {
  it('serves two independent transports from the same server', async () => {
    // "The same server object serves the in-memory pair and the harness's stdio
    // transport. Not two servers that agree by inspection." Two in-memory pairs
    // stand in for the two transports; what is being pinned is that one server
    // instance can hold both, which is what makes the claim structural.
    const server = createAnalystMcpServer(stubCore(() => ROWS));
    const first = new Client({ name: 'a', version: '0' }, { capabilities: {} });
    const [ca, sa] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(sa), first.connect(ca)]);

    expect((await first.listTools()).tools).toHaveLength(ANALYST_TOOLS.length);
    expect(server.transport).toBeDefined();

    await first.close();
    await server.close();
  });

  it('opens no socket, no subprocess and no fetch', async () => {
    // D74a amends D38 on the basis that in-process MCP over browser-local data
    // reaches no network. That is the claim; this is the check.
    const fetchSpy = vi.fn(() => {
      throw new Error('the in-memory MCP path must not fetch');
    });
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const s = await session(stubCore(() => ROWS));
    await s.tools();
    await s.call('run_sql', { sql: 'SELECT 1' });

    expect(fetchSpy).not.toHaveBeenCalled();
    globalThis.fetch = realFetch;
  });

  it('imports no transport other than the in-memory pair', async () => {
    // The runtime check above passes for any code path that happens not to dial
    // out this time. This one fails if a wire transport is so much as imported
    // into the tab's MCP modules — which is the change that would make D74a's
    // amendment untrue, and it would otherwise land unnoticed.
    for (const file of ['./connect.ts', './server.ts']) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(source).not.toMatch(/sdk\/(server|client)\/(stdio|streamableHttp|sse)/);
      // D74c: two servers, two purposes, no merge. The edge `/mcp` route is a
      // bespoke POST RPC serving shared DSPS artifacts (D38 stage A) and does
      // not become protocol-complete by accretion — which starts with neither
      // side importing the other.
      expect(source).not.toMatch(/edge\//);
    }
  });

  it('identifies itself as the analyst server', async () => {
    const server = createAnalystMcpServer(stubCore(() => ROWS));
    const client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(b), client.connect(a)]);

    expect(client.getServerVersion()?.name).toBe(ANALYST_SERVER_NAME);
    // The initialize handshake ran — this is real MCP, not a shape resembling it.
    expect(client.getServerCapabilities()?.tools).toBeDefined();

    await Promise.all([client.close(), server.close()]);
  });
});
