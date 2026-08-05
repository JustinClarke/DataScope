# A5 — The MCP server + the app's AI on the same surface

**Tier:** v0.71 · **Depends on:** A4, A1 · **Spec:** master §11.5, §19 v0.71, D74a/b/c/d/e ·
**Blocks:** A6

One MCP server over the analyst core. **What changes between surfaces is the transport, not the
server and not the engine.**

## The browser tab is a full MCP surface

`InMemoryTransport.createLinkedPair()` connects a `Client` and an `McpServer` inside one process
with **no network and no subprocess**, so the page runs both ends and the server's operations call
the analyst core against DuckDB-Wasm in the worker. This is **real MCP** — discovery, tool schemas,
`tools/call`, structured errors — not a shape that resembles it.

**There is no reason for the in-tab path to be a second, lesser API.** That is the entire argument
for this phase: a reduced in-house API drifts from the real one, and nothing notices because nothing
tests them against each other.

### The sentence that is easy to garble

**The model never speaks MCP in any configuration. The host does.** The host reads tool schemas off
the MCP connection, translates them into the provider's native tool format, executes the emitted
calls as `tools/call`, and appends the results. That host can be the page (WebLLM in-tab, Ollama over
loopback `fetch`, or a BYOK endpoint) or a Node harness. So *"the model gets DuckDB through MCP in
the same tab"* is exactly right.

## Transports

```text
app's own AI chat     -> linked in-memory pair -> DuckDB-Wasm in the worker   [D74a — this phase]
eval harness          -> stdio subprocess      -> DuckDB in Node              [D74d — harness only]
external local agent  -> stdio / HTTP          -> relay or companion          [D74b/e — deferred]
hosted agent          -> Streamable HTTP       -> staged dataset, server engine [D38/D39 — gated]
```

**Only row 1 is built here.** Row 2 is a harness convenience — a 95-cell batch running for hours
wants a filesystem, no tab lifecycle, and no browser memory ceiling — and A0's executor interface is
what makes it free. **Its transport choice authorizes nothing in the product** (D74d).

Row 3 is **deferred, not blocked** (D74e): a browser tab cannot accept an inbound connection, so an
external client such as Claude Desktop cannot dial in. Closing that means the tab dials *out* to a
local relay, or a companion process owns its own engine. The founder's call (2026-08-02) is that the
local model already reaches everything through row 1, so this buys no capability today. **It needs
an ADR, not a build row written in advance.**

## What this phase also fixes

The existing edge `/mcp` route is a **bespoke POST RPC** serving shared DSPS artifacts
([`edge/handlers/mcp.ts`](../../../edge/handlers/mcp.ts), `list_shared` / `get_dsps`). It is D38
stage A, it keeps its §23.5 ceilings, kill-switch and counters (**D74f — these stay on**), and it is
**not extended into this and does not become protocol-complete by accretion** (D74c). Two servers,
two purposes, no merge.

## The SDK pin is the least settled dependency

**This is the one place the tier's plan met reality and lost.** Recorded in full, because the
mitigation worked and the shape of the miss is worth keeping.

The plan pinned protocol revision `2026-07-28` and "TypeScript SDK v2". Checked at build time
(2026-08-02):

| Claim | Reality |
| :--- | :--- |
| Protocol revision `2026-07-28` exists and is current | **True.** It is the only revision listed in `modelcontextprotocol.io/llms.txt`. |
| TypeScript SDK v2 is current | **False.** Latest published `@modelcontextprotocol/sdk` is **1.30.0**; `dist-tags` carries only `latest`. There is no v2. |
| The SDK speaks `2026-07-28` | **False.** 1.30.0's `LATEST_PROTOCOL_VERSION` is `2025-11-25`, and its `DEFAULT_NEGOTIATED_PROTOCOL_VERSION` is `2025-03-26`. |
| `2026-07-28` removes the `initialize` handshake | Immaterial here — the shipped SDK still performs it, so the tab does too. |

1.30.0 was published **2026-07-27**, one day before the spec revision it does not implement.

**What shipped: SDK `1.30.0`, pinned exactly, at protocol revision `2025-11-25`.** The pin is
exact rather than caret-ranged, matching how this project pins its other volatile dependencies
(`duckdb-wasm`, `web-llm`, `monaco`) — an SDK that jumps a protocol revision underneath a
`^` is the failure this tier was already told to expect.

**Nothing in the phase's design depended on the newer revision.** `InMemoryTransport.createLinkedPair()`,
`Server`, `Client`, `tools/list`, `tools/call`, structured errors and `notifications/cancelled`
are all present and are the whole of what A5 uses. The mitigation named in the plan is exactly
what absorbed the miss: **the analyst core is the object of value, and the in-memory pair needs
no wire at all.** An SDK problem degrades this phase, never A0–A4, and never the experiment.

Revisit when an SDK release advertises `2026-07-28`; there is nothing to migrate until then,
and the thing to check on that day is whether `server/discover` replaces anything the app calls.

## What the SDK costs the bundle

`@modelcontextprotocol/sdk/server/index.js` statically imports `zod`, and pulls `ajv` plus
`ajv-formats` through its default elicitation validator — which this server never uses, and
cannot drop, because the import is unconditional. So the tab's MCP session is not free.

It is deferred rather than paid at start-up: `services/analystMcp.ts` connects lazily on first
use, the same pattern `services/analyst.ts` already uses to keep duckdb-wasm out of the initial
payload. A page that never opens the AI pane never loads any of it.

## Why the low-level `Server`, not `McpServer.registerTool`

`registerTool` validates arguments before the handler sees them, against a Zod shape or a JSON
Schema plus a configured validator. The core already validates every parameter and returns a
structured `OpError` carrying a mechanical hint — the nearest table name, the valid enum
values, DuckDB's own error position.

A second validator in front produces a **different error shape for the same mistake**, so a
model would learn one recovery grammar over MCP and another calling the core directly. That is
the drift this phase exists to prevent, arriving through the front door. Dispatch therefore
goes straight to `core.invoke`, and the catalog's error contract is the only one that ships.

## Engine divergence is a test, not a decision

DuckDB-Wasm and native DuckDB can diverge on extension availability, some functions, and memory
behaviour. A0's **operation-conformance suite runs against both engines** and divergence **fails the
suite** rather than surfacing later as a bug report. This phase extends it to cover the operations as
reached *through* MCP, not only as called directly.

## Definition of done

- [x] One server over the analyst core; **the same server object** serves the in-memory pair
      and the harness's transport. Not two servers that agree by inspection.
      → `lib/analyst/mcp/server.ts` exports a factory, not a wire-bound singleton;
      `server.test.ts` holds two clients on one server instance.
- [x] The page connects via `InMemoryTransport.createLinkedPair()` — verified **no listener, no
      socket, no subprocess** is created (asserted, since this is D74a's whole basis).
      → asserted twice: no `fetch` at runtime, and a static check that no wire transport is
      so much as *imported* into the tab's MCP modules (the runtime check alone would pass for
      code that simply did not dial out on that run).
- [x] The app's chat consumes the **same tool schemas** an external agent would; no reduced in-house
      tool list survives anywhere in `src/`.
      → A4's two-tool placeholder in `services/ai.ts` is **deleted**; the loop calls
      `session.tools()`. `toolSchemas.ts` is the only tool list in the product, and
      `toolSchemas.test.ts` fails if it drifts from `OPERATION_NAMES`.
- [x] The host translates schemas into each provider's native tool format — **never** JSON `format`
      mode, **never** regex-extracted pseudo-calls.
      → unchanged from A4, and now fed by MCP's `inputSchema`, which is already the JSON Schema
      `AITool` wanted. The translation is near-identity rather than a conversion.
- [x] Structured `OpError` survives the protocol boundary intact, `hint` included.
      → a tool result with `isError: true`, never a JSON-RPC error, so the loop can carry on;
      asserted in `server.test.ts` and across every error step of the conformance script.
- [x] Conformance suite passes against **both** engines, through MCP and direct.
      → `eval/analyst/conformance.test.ts` gained two arms; envelopes, SQL, error codes and
      hints must match the direct arm exactly.
- [x] The edge `/mcp` route is **untouched** and its ceilings verified still on (D74c/f).
      → zero diff from `HEAD`; kill-switch, limiter and counters still wired. A static check
      now also fails if either server imports the other.
- [x] Cancellation propagates across the MCP boundary (A4 defect iv is not re-introduced at the
      transport seam).
      → and it nearly was: the first cut flattened a caller abort into a `cancelled` OpError,
      which let a superseded turn keep going and answer a question nobody was waiting for. The
      existing A4 test caught it. Caller cancellation now unwinds as an `AbortError`; a
      *timeout* stays an OpError, because no caller has gone away.
- [x] The D74e external-client question is recorded as an **open ADR stub**, not silently dropped.
      → [`ADR-012`](../../architecture/adr/012-external-mcp-client-reach.md).

## Known gap, closed

The catalog shipped **seventeen** operations at A5, not the eighteen D74 froze: `data_quality`
— the third orient operation — was specified in the experiment record and had a service behind
it (`services/dataQuality.ts`), but no catalog handler, because adding one inside a transport
phase would have hidden it.

Closed as the A1-shaped follow-up this note called for: `operations.ts`'s `data_quality`
recomputes the same three rules (`nullPatternCandidates`, `zeroVarianceCandidates`,
`buildDuplicatesProbe`, all from `lib/insights.ts`) from live aggregates over the executor
rather than sharing `services/dataQuality.ts` directly, since that service takes the app's
precomputed `TableRegistryEntry[]` and reaches a browser-only engine singleton, neither of
which the core has. `ANALYST_TOOL_COUNT` now asserts twenty and `ANALYSIS_TOOL_COUNT` asserts
eighteen — D74's original number — so any doc still citing "seventeen" describes a catalog
that predates this fix.
