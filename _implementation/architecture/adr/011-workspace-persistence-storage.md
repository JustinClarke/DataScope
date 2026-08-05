# ADR-011: Workspace persistence storage (how dataset bytes survive a refresh)

**Status:** Accepted — 2026-07-29, from the 07a persistence-spike evidence below. Decides
**which of the two candidates named in the S6.9 leaf doc** carries durable dataset bytes:
**(B) byte staging plus re-register**, with staging writes performed **in a worker**. It
decides storage mechanism only — registry/UI-state persistence (07c) and reload
reconciliation (07d) are unchanged by it, and no master text beyond Revised(18) is affected.

**Referenced by:** `build/14-workspace-streamline/07-workspace-persistence.md` (07b builds
against this); master §5.2 (the amended client-side-persistence bullet), §7.3 (size tiers),
§18 / §22 (the re-split criteria). Related: **ADR-001** (DuckDB-Wasm worker setup — the
`createInstance()` this decision deliberately leaves untouched).

## Context

S6.9 makes the workspace survive a hard reload. Scope call 4 of the leaf doc named exactly
two candidates and refused to pick between them from documentation:

- **(A) DuckDB opened against OPFS** — `createInstance()` opens `opfs://…` instead of the
  in-memory VFS. Every downstream write (`CREATE TABLE AS`, derived tables, the catalog)
  becomes durable for free. Highest payoff, highest risk.
- **(B) Byte staging plus re-register** — source bytes are written to OPFS at ingest and
  re-registered into a fresh in-memory worker on load. Lower risk, keeps `createInstance()`
  untouched, pays the ingest cost again on every reload.

07a was chartered as a D18-style throwaway to decide it, with a pre-committed kill criterion
for (A): *if a second tab can corrupt or deadlock the first, OPFS-backed DuckDB is dead.*

## Decision

**Build 07b on (B), with all OPFS writes going through a worker's sync access handle.**

Three findings drive it, in order of weight:

**1 — (A) reopens read-only, deterministically, and a reload does not clear it.** An
OPFS-backed database closed with an **empty WAL** comes back **read-only**: reads are
complete and correct, and every write fails with `TransactionContext Error: Failed to
commit: File is not opened in write mode`. Reproduced 5/5 in the isolating trial and 2/2 at
500k rows in the run before it; the same sequence with a non-empty WAL at close is
read-write 13/13 across 10k / 200k / 500k rows. A further reload does **not** recover it
(0/6). This is the restored-workspace case exactly — a large workspace checkpointed at
close is the *most* likely to hit it — and a restored workspace that cannot accept a
`CREATE TABLE AS` is not a workspace: query tabs, derived tables and materialized results
all write. Chromium; `@duckdb/duckdb-wasm` 1.32.0.

**2 — (A)'s stated kill criterion did not fire; it is rejected on the finding above, not
on contention.** For the record, since the criterion was pre-committed: a second tab's open
**fails fast and visibly** on both engines — Chromium `Access Handles cannot be created if
there is another open Access Handle…`, Safari `The object is in an invalid state.` (~3.2 s,
including instantiate). No hang, no unresolved handle, no timeout, and no corruption in any
run: after every contention trial the first tab's data was intact and complete on reload
(500,000 rows). On Safari the first tab kept **both** read and write access throughout.

**3 — (B) is cheap, and it exists on both engines only through a worker.** Staging a
17.2 MB CSV: 79 ms (Chromium, either path), 101 ms (Safari, worker path); re-register plus
`CREATE TABLE AS` 132 ms / 439 ms; 200,000 rows restored on both. At 43 MB: stage 148 ms,
re-register 401 ms. So (B)'s "pays the full ingest cost on every reload" is **sub-second at
43 MB**, cheaper than the re-drop it replaces. But **Safari 18.6 has no `createWritable`**
on an OPFS file handle (`TypeError: handle.createWritable is not a function`) — main-thread
staging is impossible there, and only the worker + `createSyncAccessHandle` path works. It
works on Chromium too, so there is one code path, not two.

**Consequent build rules for 07b, each traceable to a measurement:**

1. **Staging writes happen in a worker**, via `createSyncAccessHandle` — never
   `createWritable`. This is the Safari-compatibility rule, and it is not optional.
2. **Feature-detect in the worker, never on the main thread.**
   `'createSyncAccessHandle' in FileSystemFileHandle.prototype` is **false** on the main
   thread in both Chromium and Safari while the worker-side call succeeds in both — a
   main-thread capability check would disable persistence on every browser that supports it.
3. **"Clear workspace data" terminates the DuckDB worker first, then empties OPFS, then the
   registry keys.** `removeEntry` on a file with a live access handle fails with
   `NoModificationAllowedError` while everything else in the directory removes normally —
   i.e. the naive order produces exactly the half-clear scope call 2 forbids. With the
   worker terminated first, removal is clean and the next load is a true cold app.
4. **Treat storage as evictable.** `navigator.storage.persist()` is supported and
   **denied** on both engines as measured, so OPFS content is best-effort. 07d's *Lost*
   outcome is a normal path, not an exceptional one.
5. **Second-tab behavior is a UI state, not an error.** The failure is fast and legible on
   both engines; 07b renders it, and under (B) it applies only to the staging file being
   written, not to a whole database.

## Alternatives considered

- **(A) DuckDB on OPFS** — rejected per finding 1. Worth revisiting only if a later
  duckdb-wasm release fixes the read-only-on-reopen behavior; it remains the only candidate
  that makes *derived* tables durable without replay, which is why the leaf doc's scope call
  5 already routes `derived` through `generatingSql` replay instead.
- **(A) with a defensive uncheckpointed write before close** — i.e. deliberately leaving the
  WAL non-empty so the reopen stays writable. Rejected: it makes correctness depend on an
  undocumented side effect of an engine internal, and finding 4 below on durability means the
  same code would also be deliberately leaving a write unflushed.
- **IndexedDB instead of OPFS for staged bytes** — not measured, not needed. OPFS is already
  required by both candidates, and the master amendment (Revised(18)) is written against it.

## Consequences

- `createInstance()` in `workers/duckdb.worker.ts` **does not change** — the engine stays
  in-memory, and ADR-001's setup (same-origin assets, `eh` bundle, lazy singleton) is
  untouched. This is the main reason the risk is contained.
- **Every write to the engine is still ephemeral.** Durability comes from the staged source
  bytes plus replay, so derived tables reconcile through `generatingSql` (07d), as scope call
  5 already specified.
- **A related durability rule was measured and is recorded here even though (B) does not
  depend on it:** under (A), writes are durable **only after an explicit `CHECKPOINT`** —
  8/8 trials with one kept all committed rows, 8/8 without lost them, even after a graceful
  `terminate()`, and Safari lost an uncheckpointed row across a reload the same way. Anyone
  revisiting (A) starts from that.
- **Quota headroom is not a constraint at the §7.3 tiers:** 10.74 GB (Chromium) / 82.46 GB
  (Safari) against a 300 MB refuse-with-guidance ceiling — 30× and 275×. Eviction was never
  reached, so eviction *behavior* remains inferred from `persist()` denial rather than
  observed.
- **Safari is not on a fallback path.** It was the browser the spike expected to lose; it
  ended up the one where both candidates behaved best. The non-persistent-session fallback
  the leaf doc reserved for Safari is not needed, though the reason-stating UI it implied is
  still the right home for an eviction or a quota refusal.

## Spike evidence

Throwaway harness in `spike-07a/` (deleted, per D18 and the leaf doc's definition of done):
a Vite-served probe page exposing OPFS/DuckDB operations to Playwright drivers, plus a
self-driving mode that reported back over `/collect` so **real Safari** could run the same
scenarios (Playwright cannot drive Safari, and WebKit-via-Playwright is not the browser the
claim is about).

**Machine:** Apple M1, 8 GB — the S0 reference machine. **Not run on the M4 Air**; every
finding here is single-machine, and each is a behavioral outcome (write refused / handle
denied / API absent) rather than a timing threshold, so the machine gap is a real but
narrow one. **Engines:** Chromium 151 headless (Playwright) and **Safari 18.6 / macOS
15.7.4**. `@duckdb/duckdb-wasm` 1.32.0, `crossOriginIsolated: false` (the `eh` bundle, per
ADR-001).

| Question | Measurement |
| :--- | :--- |
| (A) survives reload / restart | Yes — 500k rows intact across reload *and* a full browser restart (Chromium); 200k across reload (Safari) |
| (A) reopen writable | **No when the WAL is empty at close** — read-only 5/5, unrecovered by a further reload 0/6; writable 13/13 when the WAL is non-empty |
| (A) write durability | Explicit `CHECKPOINT` required — 8/8 durable with, 8/8 lost without |
| (A) second tab | Fails fast on both engines (~3.2 s); first tab intact every run; Safari's first tab keeps read **and** write |
| (A) cold open | Chromium ~370–420 ms instantiate + ~85–95 ms open; Safari ~3.4–5.2 s + ~0.1–0.7 s |
| (B) staging | Chromium 79 ms / 17.2 MB; Safari 101 ms (worker only — `createWritable` absent); re-register + CTAS 132 ms / 439 ms |
| (B) at 43 MB | stage 148 ms, re-register + CTAS 401 ms, 500k rows restored |
| Clear-workspace ordering | `removeEntry` → `NoModificationAllowedError` while the engine holds the file; clean after terminate |
| Quota / `persist()` | 10.74 GB (Chromium) / 82.46 GB (Safari); `persist()` supported, **granted: false** on both |

**Unverified, stated so nobody reads more into this than it holds:** the M4 Air; headful
Chrome (the `persist()` denial was measured in an automation profile, where grant heuristics
differ from an installed, engaged origin); Firefox; actual eviction under quota pressure; and
whether a read-only-reopened (A) database can be recovered by deleting and rebuilding the
file — untested, because (B) removes the class.
