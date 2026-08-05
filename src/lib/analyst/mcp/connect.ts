// The in-memory MCP surface (A5, D74a).
//
// `InMemoryTransport.createLinkedPair()` joins a `Client` and a `Server` inside
// one process: two objects holding references to each other, passing already-
// parsed JSON-RPC messages. **No listener, no socket, no subprocess** — which is
// what makes D74a's amendment to D38 true rather than merely asserted, and what
// `connect.test.ts` pins down by asserting the tab opens nothing.
//
// It is still real MCP. The initialize handshake runs, capabilities are
// negotiated, `tools/list` returns schemas the client has never seen hard-coded,
// `tools/call` is dispatched by name, and `notifications/cancelled` aborts the
// handler. The in-tab path is the same protocol an external agent would speak,
// minus the wire — the point being that a reduced in-house API drifts from the
// real one and nothing notices, because nothing tests them against each other.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AITool } from '../../../types/ai';
import type { AnalystCore } from '../core';
import { opError } from '../errors';
import type { OpOutcome } from '../types';
import { createAnalystMcpServer } from './server';

export const ANALYST_CLIENT_NAME = 'datascope-app';

export interface AnalystMcpSession {
  /** Tool schemas as the server declares them — the app's chat holds no list of its own. */
  tools(): Promise<AITool[]>;
  /** Dispatch one call. Returns the catalog's own envelope; never throws for an operation failure. */
  call(name: string, args: unknown, options?: { signal?: AbortSignal }): Promise<OpOutcome>;
  close(): Promise<void>;
}

/**
 * Read the outcome back off a `tools/call` result.
 *
 * `structuredContent` is the fast path and the text block is the fallback,
 * because the two carry the same envelope by construction (`server.ts` writes
 * both from one object). Parsing the text is not defensive padding — it is what
 * keeps this client honest against a *different* MCP server later, and it is the
 * path an external host that ignores `structuredContent` would take.
 */
function outcomeFrom(result: Record<string, unknown>): OpOutcome {
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent as OpOutcome;
  }
  const first = Array.isArray(result.content) ? result.content[0] : undefined;
  const text = (first as { type?: string; text?: string } | undefined);
  if (text?.type === 'text' && typeof text.text === 'string') {
    try {
      return JSON.parse(text.text) as OpOutcome;
    } catch {
      return opError('sql_error', text.text);
    }
  }
  return opError('sql_error', 'The server returned a result with no readable content.');
}

/** Connect a client and a server over a linked in-memory pair. The caller owns both ends and closes them together. */
export async function connectAnalystMcp(core: AnalystCore): Promise<AnalystMcpSession> {
  const server = createAnalystMcpServer(core);
  const client = new Client({ name: ANALYST_CLIENT_NAME, version: '0.71.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    async tools() {
      const { tools } = await client.listTools();
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema as Record<string, unknown>,
      }));
    },

    async call(name, args, options) {
      // A transport-level failure is the one thing that is not an `OpOutcome`.
      // It is converted rather than thrown so the loop's contract holds — every
      // call produces a tool message the model can read and recover from, and a
      // broken connection does not look different from a broken query at the
      // call site.
      //
      // **Caller cancellation is the exception, and the distinction is A4
      // defect iv.** A superseded question is control flow, not a result: it has
      // to reach `askAI` as an `AbortError` so the turn unwinds and nothing is
      // appended to a transcript the user has already moved on from. Flattening
      // it into a `cancelled` OpError here would let the loop carry on and
      // answer a question nobody is waiting for — re-introducing the defect at
      // the transport seam, which is precisely what A5 promised not to do. A
      // *timeout* is the other case and stays an OpError: the core raises it,
      // the model can read it, and no caller has gone away.
      try {
        const result = await client.callTool(
          { name, arguments: (args ?? {}) as Record<string, unknown> },
          undefined,
          options?.signal ? { signal: options.signal } : undefined,
        );
        return outcomeFrom(result);
      } catch (error) {
        if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        return opError('sql_error', error instanceof Error ? error.message : String(error));
      }
    },

    async close() {
      await Promise.all([client.close(), server.close()]);
    },
  };
}
