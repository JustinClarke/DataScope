# ADR-012: Reaching a tab-held dataset from an external MCP client

**Status:** Open — stub raised 2026-08-02 by A5, deliberately undecided. A5's definition of
done requires this question be *recorded* rather than silently dropped (D74e); it does not
require it be answered, and answering it in advance of a demand for it would be building a
transport nobody has asked for.

**Referenced by:** `build/15-analyst-layer/05-mcp-server.md` (the transport table's third
row); master §11.5, §19 v0.71; decision rows **D38** (MCP staging binds transport reach),
**D39** (hosted/staged datasets), **D74a/b/e**. Related: **ADR-006** (edge stack — the
Worker that would host any relay), **ADR-007** (AI routing).

## Context

A5 shipped the analyst catalog as a real MCP server and connected the browser tab to it
over `InMemoryTransport.createLinkedPair()`. Three of the four transport rows in that
phase's table are settled:

```text
app's own AI chat     -> linked in-memory pair -> DuckDB-Wasm in the worker   [built, D74a]
eval harness          -> in-memory / stdio     -> DuckDB in Node              [harness only, D74d]
external local agent  -> stdio / HTTP          -> relay or companion          [THIS ADR, D74e]
hosted agent          -> Streamable HTTP       -> staged dataset, server engine [gated, D38/D39]
```

Row 3 is blocked for one narrow, structural reason: **a browser tab cannot accept an inbound
connection.** An external client — Claude Desktop, a local coding agent, anything that dials
a server — has nothing to dial. The dataset lives in the tab's DuckDB-Wasm instance, and the
tab is a client of the network, never a listener on it.

This is not a protocol gap. The server is protocol-complete and engine-agnostic; A0's
executor interface already lets the identical server run over native DuckDB in Node. What is
missing is a path for an outside process to *reach* an engine instance that happens to be
inside a tab.

## The options, unevaluated

Recorded so the next person does not re-derive them. No preference is expressed here.

1. **The tab dials out to a local relay.** A loopback process accepts the external client's
   connection and forwards to the tab over a socket the tab opened. Keeps one engine and one
   copy of the data; adds a process the user must run, a pairing/authorization story, and a
   loopback surface that did not exist before.
2. **A companion process owns its own engine.** The external client talks to a native-DuckDB
   MCP server over stdio, against the same files. No relay and no browser involvement — but
   two engines and two copies of the state, and the tab's derived tables and result handles
   are not in the companion's catalog. The two surfaces would diverge in exactly the way A5
   was built to prevent.
3. **Neither — stage to the server instead.** Row 4's path, already gated by D38/D39. Changes
   the privacy posture, which is why it is gated rather than open.

## Why it is open and not decided

The founder's call (2026-08-02) is that **the local model already reaches everything through
row 1**, so closing row 3 buys no capability today. Both real options carry a cost that only
a concrete demand can justify — option 1 a background process and an authorization model,
option 2 a second engine and the surface drift A5 exists to prevent.

Deciding this now would also mean designing an authorization story for an inbound local
connection with no user, no threat model and no request behind it. That is the shape of
decision the Decision Record exists to keep out of build rows written in advance.

## What would reopen it

Any one of these is enough to make this ADR worth finishing:

- a user asking to drive their loaded dataset from Claude Desktop or another external agent;
- the D74 scored experiment wanting an external harness that cannot use the in-process pair
  (it does not today — the harness owns both ends);
- row 4 being ungated for other reasons, which would make the staged-server path the cheaper
  answer to row 3 as well.

## Consequences of leaving it open

- The transport table keeps a row marked deferred rather than built, and `05-mcp-server.md`
  points here instead of describing a design.
- No code, no dependency and no configuration surface exists for it — the deferral costs
  nothing to carry and nothing to unwind.
- **The analyst core and the MCP server are unaffected either way.** Whichever option is
  eventually taken changes the transport a server is connected to, not the server. That is
  the property A5 was built for, and it is what makes deferring this cheap.
