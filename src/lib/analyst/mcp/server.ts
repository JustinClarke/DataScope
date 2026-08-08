// The MCP server over the analyst core (A5, master §11.5, D74a).
//
// **One server, many transports.** This module exports a factory, not a
// singleton bound to a wire: the object it returns is connected to an in-memory
// pair in the tab and to a stdio transport in the eval harness, and neither
// knows which. That is the phase's whole claim — what changes between surfaces
// is the transport, not the server and not the engine — and it is structural
// here rather than a thing two implementations promise each other.
//
// **Why the low-level `Server` and not `McpServer.registerTool`.** `registerTool`
// wants a Zod shape (or a JSON Schema plus a configured validator) and validates
// arguments before the handler sees them. The core already validates every
// parameter and returns a structured `OpError` carrying a mechanical hint — the
// nearest table name, the valid enum values, DuckDB's own error position. Adding
// a second validator in front produces a *different* error shape for the same
// mistake, so the model would learn one recovery grammar over MCP and another
// calling the core directly. The catalog's error contract is the one that ships;
// this file forwards arguments to it untouched.
//
// **Errors are results, not protocol failures.** An `OpError` comes back as a
// normal `tools/call` result with `isError: true`, never a JSON-RPC error. The
// distinction is load-bearing for D74's loop rule: tools stay available after a
// failure and the model recovers on an ordinary turn. A JSON-RPC error is a
// transport-level fault and some hosts tear the turn down on one.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { AnalystCore } from "../core";
import { ANALYST_TOOLS } from "../toolSchemas";
import { isOpError, type OpOutcome } from "../types";

export const ANALYST_SERVER_NAME = "datascope-analyst";
export const ANALYST_SERVER_VERSION = "0.71.0";

/**
 * Sent once at initialize. Mechanics and boundaries only — deliberately not a
 * hint about what to analyse. D74's catalog note draws that line for tool
 * descriptions and it applies with more force to a server-wide preamble: the
 * host owns the analytical prompt, and a second one arriving over the protocol
 * would be an instruction the app never wrote.
 */
export const ANALYST_INSTRUCTIONS =
  "DataScope computes over a dataset already loaded in the user's session. " +
  "Operations return the exact SQL that produced them, so anything computed here " +
  "can be shown to the user, re-run and edited. Results larger than the inline " +
  "preview carry a resultId and are paged with read_result. Failures come back as " +
  "a structured result with ok:false, a code and a mechanical hint; the tools stay " +
  "available and you can correct and retry.";

/**
 * Serialize an outcome for the `content` block.
 *
 * Both branches carry the *whole* envelope rather than a prose rendering. A host
 * that reads `structuredContent` and a host that only reads text get the same
 * fields, including `hint` — the A5 requirement that `OpError` survives the
 * protocol boundary intact, which a friendly "Error: ..." string would quietly
 * break.
 */
function textOf(outcome: OpOutcome): string {
  return JSON.stringify(outcome);
}

export function createAnalystMcpServer(core: AnalystCore): Server {
  const server = new Server(
    { name: ANALYST_SERVER_NAME, version: ANALYST_SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: ANALYST_INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ANALYST_TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema as { type: "object" },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    // `extra.signal` aborts when the client sends `notifications/cancelled`, so
    // handing it to the core is the entire cancellation path across the
    // boundary — the core already turns an abort into a `cancelled` OpError and
    // stops the query. A4 defect iv was a dropped signal one layer up; not
    // re-introducing it here is an A5 exit criterion.
    const outcome = await core.invoke(
      request.params.name,
      request.params.arguments ?? {},
      {
        signal: extra.signal,
      },
    );

    return {
      content: [{ type: "text" as const, text: textOf(outcome) }],
      structuredContent: outcome as unknown as Record<string, unknown>,
      ...(isOpError(outcome) ? { isError: true } : {}),
    };
  });

  return server;
}
