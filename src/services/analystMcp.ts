// The tab's MCP session (A5, D74a) — one per page, over the tab's analyst core.
//
// Lazily connected for the same reason `services/analyst.ts` lazily loads the
// engine: the SDK's server entry statically pulls `zod`, `ajv` and
// `ajv-formats`, and a page that never opens the AI pane should not pay for a
// protocol it never speaks. First call connects; every later call reuses.
//
// The connection is in-process (see `lib/analyst/mcp/connect.ts`), so
// "connecting" is object wiring and a handshake, not I/O.
import { connectAnalystMcp, type AnalystMcpSession } from '../lib/analyst/mcp/connect';
import { analystCore } from './analyst';

let session: Promise<AnalystMcpSession> | null = null;

export function analystMcpSession(): Promise<AnalystMcpSession> {
  if (!session) {
    session = connectAnalystMcp(analystCore()).catch((error) => {
      // A failed connect must not latch: the next caller should get a fresh
      // attempt rather than a permanently rejected promise cached for the life
      // of the page.
      session = null;
      throw error;
    });
  }
  return session;
}

/**
 * Closes both ends. The counterpart to `resetAnalystCore`, and it has the same
 * status: neither is called from the UI yet — "Clear workspace data" does not
 * reach the analyst core today. Provided so that when it does, the session is
 * torn down with the core rather than left holding a closed core's store.
 */
export async function resetAnalystMcpSession(): Promise<void> {
  const current = session;
  session = null;
  if (current) await (await current).close().catch(() => undefined);
}
