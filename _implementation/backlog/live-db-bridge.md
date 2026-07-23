# Backlog: Live Database Connectivity (Hybrid Bridge)

**Tier:** backlog — deferred indefinitely (D6) · **Master spec:** §20.3

**Finding: direct connection is impossible.** Browsers have no raw TCP socket API (only
HTTP(S)/WebSocket/WebRTC); Postgres/MySQL wire protocols are raw TCP; DuckDB's
`postgres_scanner`/`mysql_scanner` need a real socket. This is a browser sandboxing wall,
not a DuckDB limitation that will be patched. Do not re-investigate; re-read §20.3.

**If ever revisited, the viable path is a hybrid-execution ladder:**
1. **Static snapshot** — batch export → Parquet on object storage → `httpfs` reads directly.
   Zero backend at query time. (Rung 1 is separately tracked as
   [`httpfs-bucket-mode.md`](httpfs-bucket-mode.md).)
2. **Faster refresh** — same shape, shorter export cadence.
3. **On-demand live bridge** — thin serverless endpoint runs the query against the live DB,
   serializes as Arrow IPC; browser calls `insertArrowFromIPCStream()` into a local table
   and joins client-side against already-loaded static data.
4. **True streaming/CDC** — WebSocket relay appending row deltas. Architecturally close to
   MotherDuck's `ATTACH 'md:...'`, but that's DuckDB-to-DuckDB-cloud, not
   Wasm-to-arbitrary-Postgres.

**Revisit trigger:** a concrete need for current-transaction-state data that periodic
Parquet export can't satisfy. Until then, "Refresh from source"
([`../build/07-connectivity/03-refresh-from-source.md`](../build/07-connectivity/03-refresh-from-source.md))
covers the realistic demand.
