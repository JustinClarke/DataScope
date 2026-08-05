# S6.9 — Workspace persistence across refresh

**Tier:** v0.70 (the workspace streamline, D73 execution) · **Master spec:** §5.2 (the
client-side-persistence disclosure bullet — amended by this phase), §7.5 (the registry), §18
(functional acceptance criteria) and §22's Privacy checklist · **Decision row:** none reversed —
D2's persistence boundary governs *egress modes*, not dataset bytes at rest, and is untouched
here; D39/D61's hosted staging stays the only path by which rows leave the machine ·
**Depends on:** S6.7 (shipped 2026-07-29) · **Gated by S0:** no.

Today a hard reload destroys the workspace completely, and by design in two independent places:
every registry and UI store is a plain in-memory `create()` (`stores/datasets.ts`,
`stores/tabs.ts`, `stores/selection.ts`, `stores/relationships.ts` — `stores/settings.ts` is the
lone `persist()` user), and `workers/duckdb.worker.ts` instantiates DuckDB against its in-memory
VFS with no durable path, so the refresh tears down the worker and the JS heap together. Neither
half is an oversight; both are the literal implementation of §5.2's standing sentence. This
phase changes that sentence, then builds against it.

## Objective

**A hard reload lands the user back in the workspace they left.** Tables are queryable again
without re-dropping files; the tab strip, the selection, the relationship overrides and the
drawer's geometry come back with them. Where something genuinely cannot be restored, the app
says so in place of that table rather than presenting a registry row whose backing table no
longer exists.

Four sub-steps, sequenced because each one's design depends on the previous one's answer: a
throwaway viability spike (**07a**), durable row storage (**07b**), registry/UI state persistence
(**07c**), and the reload-time reconciliation between the two (**07d**).

## The master amendment this phase requires

Persistence of dataset *bytes* is currently forbidden in three places in the master, and the
phase cannot start until they are amended (master-first, then mirrored — this doc is the mirror):

| Master location | Standing text | Amended to |
| :--- | :--- | :--- |
| §5.2, "Client-side persistence" | "datasets live in DuckDB's in-memory VFS only — closing the tab destroys them… dataset contents never do" | Dataset bytes persist **on this device, in this browser's origin-private storage**, so a refresh or a tab close does not destroy the workspace. Nothing about egress changes. |
| §18, functional acceptance criteria | "Closing the browser tab releases all memory; no dataset contents remain in `localStorage`/`IndexedDB` (settings only)" | Closing the tab releases all *memory*; dataset bytes remain in OPFS by design and are removable through the Clear-workspace-data control. `localStorage` still holds settings and registry metadata only — never rows. |
| §22, Privacy checklist | "Closing the tab leaves no dataset contents in `localStorage`, `IndexedDB`, or cookies (settings keys only)" | Same split: no rows in `localStorage`/cookies; rows live in OPFS, disclosed, and the Clear control empties it. |

**What is not amended, stated explicitly so no reviewer has to re-derive it.** The privacy claim
DataScope actually makes is an **egress** claim — D23's "no upload, by construction", D52's
standing permission line ("nothing leaves your browser — check DevTools"), D21's language rules,
and D2's rule that egress modes never persist across sessions. Origin-private storage is *inside*
the browser; a workspace surviving a refresh does not put a single new byte on a wire, and the
DevTools Network check every one of those lines invites still passes unchanged. What the
amendment does cost is a real thing, named rather than waved at: on a shared or kiosk machine,
data that previously evaporated with the tab now sits on disk until something clears it. Scope
call 2 is that "something".

## Scope calls

**1. Persistence is always on — no opt-in gate.** Human call, 2026-07-29, taken against the
alternative of an explicit "keep this workspace on this device" toggle. A refresh restoring the
workspace is the whole deliverable, and a persistence feature that defaults to off delivers it to
nobody; the gate would also have made every downstream sub-step branch on a flag (07d would need
a *both* path — reconcile a persisted registry against a DuckDB that may or may not have been
durable). The consequence is that scope call 2 is not optional and not a follow-up.

**2. A Clear workspace data control ships in the same phase, not after it.** It is the only user
answer to "get this off my machine", and it does two things, not one: `navigator.storage`'s OPFS
root is emptied *and* the persisted registry keys are removed, in that order, followed by a
reload — a half-clear that leaves registry metadata pointing at deleted bytes is exactly the
inconsistency 07d exists to prevent, and the control must not manufacture it. It lives with the
existing data-handling controls (the "Configure workspace" surface, §5.1/§13.3), shows the
current on-disk size from `navigator.storage.estimate()`, and its copy follows D21: it states
verifiable behavior ("removes the files this browser stored on this device") and never claims
"securely erased" — a browser cannot promise what the filesystem underneath it did.

**3. 07a is a D18-style throwaway, with kill criteria, and nothing after it may be built first.**
duckdb-wasm is pinned at `1.32.0` and does expose an OPFS-backed path, but three things decide
whether it is *usable* here and none of them can be settled from documentation:
- **Multi-tab contention.** OPFS sync access handles are exclusive per file. Two DataScope tabs
  open on the same origin is an ordinary thing a user does, and the second one must degrade
  visibly and safely — never corrupt the first one's database, never hang on an unresolved
  handle. **Kill criterion:** if a second tab can corrupt or deadlock the first, OPFS-backed
  DuckDB is dead and 07b takes the staging fallback below.
- **Quota and eviction.** `navigator.storage.estimate()` and `persist()` behavior on the target
  browsers, against the §7.3 size tiers. **Kill criterion:** none — the answer feeds 07d's
  reconciliation, and eviction is a state to handle, not a reason to stop.
- **Safari.** OPFS support and behavior on the current Safari, which already needs special
  handling elsewhere in this app. **Kill criterion:** none by itself — Safari falling back to a
  non-persistent session is acceptable and gets a stated in-app reason, since the alternative is
  denying the feature to every other browser.

Measured on the same two reference machines S0 uses (M1 Air base 8 GB, M4 Air). The probe is
thrown away; its verdict is recorded here and in the ADR, and 07b starts from it.

**4. 07b's approach is chosen by the spike, between exactly two candidates.** Named now so the
spike knows what it is deciding between, and so neither is invented at build time.
**Closed 2026-07-29: (B), with worker-side staging — see the verdict below and ADR-011.**
- **(A) DuckDB opened against OPFS.** `createInstance()` in `workers/duckdb.worker.ts` opens a
  database file in origin-private storage instead of the in-memory VFS. Everything downstream —
  `CREATE TABLE AS`, derived tables, the catalog — becomes durable for free. Highest payoff,
  highest risk, and the thing the spike's contention criterion is really about.
- **(B) Byte staging plus re-register.** The source bytes are written to OPFS at ingest and
  re-registered into a fresh in-memory worker on load, replaying ingestion. Lower risk, and it
  keeps `createInstance()` untouched, but it pays the full ingest cost on every reload and it
  cannot restore a derived table except by replay (scope call 5 makes that acceptable).

**5. What is durable is decided per `TableRegistryEntry.origin`, not uniformly.** The registry
already distinguishes five origins and three of them do not want their bytes stored at all:
- **`file` / `sample`, non-sampled** — durable. These are the case the phase exists for, and
  `fileHash` (already computed at ingest, D45's snapshot label) is the identity check on reload.
- **`file`, sampled tier** — **not durable**, and this is a deliberate hole with a visible
  consequence. A sampled-tier file is never fully read into JS memory by design
  (`services/ingestion.ts` streams it through `registerFileHandle` precisely to avoid that), so
  persisting its bytes would mean buffering exactly what the sampled tier refuses to buffer. On
  reload these tables reconcile as *needs re-drop* (07d), with the reason stated.
- **`api`** — **not durable as bytes.** `sourceUrl` and `lastFetchedAt` already exist and
  "Refresh from source" (§7.4) already works; a persisted API table is a re-fetch, not a restore,
  and re-fetching is also the honest behavior for data that may have changed on the far end.
- **`derived`** — **not durable as bytes under approach (B); free under (A).** `generatingSql`
  already records the `CREATE TABLE AS` that produced it (§12.1). Under (B), reload replays it
  once its inputs are back, which is what the `stale` flag mechanism was already built to reason
  about; a replay that fails leaves the entry marked, never silently absent.
- **`shared`** — **not durable.** Scope call 8.

**6. 07c persists metadata only, and the exclusions are the design.** `persist()` middleware
(the same `zustand/middleware` + `createJSONStorage(() => localStorage)` pair `stores/settings.ts`
already uses) goes on five stores, each with a `partialize` that is a whitelist, never a
blacklist:
- **`datasets`** — `datasets` and `tables` persist, including `profile` and `columns`, which are
  aggregates and classifications, not rows. **`workerStatus`/`workerError` never persist**: they
  describe a worker that does not exist yet at rehydration time, and a restored `'ready'` would
  be a lie the whole app reads.
- **`tabs`** — `tabs` and `activeTabId`. A restored tab is an envelope with its subject and
  initializer, exactly as `openTab` built it; nothing here lets restoration synthesize a tab type
  or identity the user never opened (the D55 envelope invariant, untouched).
- **`selection`** — all four fields, reconciled in 07d against tables that actually came back.
- **`relationships`** — `removed`/`repointed`/`added`. These are *user overrides* of inferred
  edges; losing them on refresh silently discards deliberate human corrections, which is the
  worst of the four losses even though it is the cheapest to fix. Inferred edges themselves are
  not persisted — they are recomputed from a restored schema.
- **`drawer`** — `open`, `expanded`, `height`, `infoRatio` persist; the `infoSignal`/
  `consoleSignal` counters do not. They are transient nudges, and a persisted signal fires a
  pane-open on load for a run that happened yesterday.
- **`query` is not persisted at all.** `QuerySession.result` is a `QueryResult` — actual rows, in
  the store, potentially large. It stays in memory: rows are restored by re-running, which is one
  keystroke on an editor whose SQL text did come back. (`sql` and `lastRunSql` are text and could
  persist; they are held back to 07d's judgement rather than decided here, because a restored SQL
  string beside a `'idle'` status is an S6.7 Info-visibility question, not a storage one.)

**7. 07d is the phase's real work, and its rule is one line: the engine is the source of truth,
the registry is a claim.** On load, for every persisted `TableRegistryEntry`, the bootstrap asks
DuckDB what actually exists and reconciles into exactly three outcomes:
- **Restored** — the table is present and its `fileHash` matches. Normal, queryable, silent.
- **Recoverable** — the entry survived but its backing table did not, and something can rebuild
  it: an `api` table with a `sourceUrl`, a `derived` table with `generatingSql` whose inputs are
  all present. The rail shows it as recoverable with the action that recovers it. Never
  auto-fetched — a page load must not fire network requests off persisted state (a §5.2 posture
  question as much as a UX one).
- **Lost** — nothing can rebuild it (a sampled-tier file, an evicted OPFS entry, a derived table
  whose inputs are themselves lost). The entry is shown as needing a re-drop, with the reason,
  and it is **never** presented as a normal row in the rail. A registry entry the user can click
  and query, whose table does not exist, is the specific failure this sub-step is built to make
  impossible.

Partial recovery is therefore the normal case, not the error case, and the reload is not
transactional: it must not refuse to restore nine good tables because a tenth is gone.

**8. Viewer mode persists nothing.** A `?share=` / dropped-`.dsps` session is D62
consumption-only: the artifact is not the recipient's workspace and writing it to their disk
would be the app making a custody decision on their behalf over someone else's shared structure.
`stores/dspsReceiver.ts` gets no `persist()`, and the bootstrap does not run in viewer mode. The
escalation path is unchanged — `ShareDialog`'s full-dataset escalation lands the recipient in an
ordinary session, which persists because every ordinary session does.

**9. Out of scope, named so it is not discovered mid-build.** No cross-device or account-backed
sync (that is D39/D61's hosted tier, whose opt-in-only character this phase does not touch and
must not blur). No encryption at rest, and no copy implying any — origin-private storage is
origin-scoped, not encrypted, and D21's language rules forbid claiming otherwise. No workspace
export/import file. No versioning or undo of a persisted workspace. No change to the §7.3 size
tiers or the refusal behavior above them.

## 07a verdict — (B), decided 2026-07-29

**Approach (B), byte staging plus re-register, with every OPFS write done in a worker.**
Full evidence and the build rules it implies are in
[`ADR-011`](../../architecture/adr/011-workspace-persistence-storage.md); the short version,
because it moves scope call 4 from open to closed:

- **(A) was not killed by its own criterion.** Two-tab contention behaved: the second tab's
  open fails fast and visibly on both engines (~3.2 s; `Access Handles cannot be created…` on
  Chromium, `The object is in an invalid state.` on Safari), never hangs, and never corrupted
  or deadlocked the first — after every trial the first tab's data was complete on reload
  (500,000 rows), and on Safari the first tab kept read *and* write access throughout.
- **(A) is rejected on a different finding, a stronger one.** An OPFS-backed database closed
  with an **empty WAL reopens read-only** — reads complete and correct, every write refused
  with `Failed to commit: File is not opened in write mode`, and a further reload does not
  clear it (read-only 5/5 in the isolating trial; read-write 13/13 when the WAL was non-empty
  at close). That is the restored-workspace case itself, and a restored workspace that cannot
  run a `CREATE TABLE AS` is not a workspace.
- **(B) costs less than the doc assumed.** Its "pays the full ingest cost on every reload" is
  **sub-second at 43 MB** (stage 148 ms, re-register + `CREATE TABLE AS` 401 ms) — cheaper
  than the re-drop it replaces.
- **Safari is not on the fallback path.** OPFS works there and both candidates ran; the
  reserved non-persistent-session fallback is not needed. But **Safari 18.6 has no
  `createWritable`** on an OPFS handle, so (B) exists there only through a worker's
  `createSyncAccessHandle` — which also works on Chromium, so 07b writes one path, not two.
- **Quota is not a constraint** at the §7.3 tiers: 10.74 GB (Chromium) / 82.46 GB (Safari)
  against a 300 MB ceiling. `persist()` is supported and **denied** on both, so OPFS content
  is evictable and 07d's *Lost* outcome is an ordinary path.

**Three build rules 07b inherits, each from a measurement, not a preference:** staging writes
go through a worker sync access handle; capability detection happens *in the worker* (the
main-thread `createSyncAccessHandle` check reports false on both engines while the worker call
succeeds — detecting on the main thread would disable persistence everywhere); and **Clear
workspace data terminates the DuckDB worker before emptying OPFS**, because `removeEntry` on a
file the engine still holds fails with `NoModificationAllowedError` — the naive order produces
exactly the half-clear scope call 2 forbids.

Measured on the M1 Air (8 GB) only — **the M4 Air arm was not run**, and the findings above
are behavioral (a write refused, a handle denied, an API absent) rather than timing
thresholds, which is why the verdict does not wait on it.

## Definition of done

**07a — persistence spike (Opus, throwaway).**
- [x] Two-tab contention answered — the second tab degrades visibly and fast on both engines,
      and in no run did it corrupt or deadlock the first. *(One reference machine, not two —
      see the verdict's closing note.)*
- [x] Quota headroom measured against the §7.3 tiers (10.74 GB / 82.46 GB against a 300 MB
      ceiling) and `persist()` recorded per browser (supported, denied on both). *Eviction was
      never reached, so eviction behavior is inferred from that denial, not observed.*
- [x] Safari's OPFS behavior recorded — on real Safari 18.6, not a WebKit stand-in. The
      fallback turned out not to be needed; the missing `createWritable` is the constraint that
      replaced it.
- [x] Verdict written here and into
      [`ADR-011`](../../architecture/adr/011-workspace-persistence-storage.md): **(B)**, with
      the evidence.
- [x] The spike code is deleted, not merged.

**07b — durable row storage (Opus).** *Complete 2026-07-29 — the storage layer, the restore
path, and the Clear control, all under test. Live checks ran 2026-07-29 on Chromium 151 against
the production build (throwaway Playwright harness, deleted): reload, cold start, cost and Clear
all behave. The M4 Air arm was retired by human call rather than run; the contended-handle branch
stays proven by unit test alone because the live path could not reproduce it.*

- [x] A dropped CSV, then a hard reload, then `SELECT * FROM <table>` — succeeds with no
      re-drop, on Chrome. *(Passes on the **M1 Air** — a 27 MB / 500,000-row CSV is queryable
      after a hard reload (2.2 s) and after the browser is fully closed and relaunched (2.3 s),
      both without re-dropping. **The "both reference machines" clause is retired by human call
      2026-07-29**: the claim is behavioral — the bytes survive and re-register — not a timing
      threshold, and the M4 Air runs the same engine on the same OPFS implementation, so a second
      arm would restate the result rather than test it. The same retirement applies to 07a's
      matching gap.)*
- [x] Per-origin durability behaves per scope call 5 — a non-sampled `file`/`sample` source is
      staged, a sampled-tier file is not, and `api`/`derived`/`shared` never reach the staging
      path at all (`ingestionStaging.test.ts`). *The reconcile-as-lost half is 07d's, as
      scope call 7 has it — 07b's restore reports outcomes, it does not render them.*
- [x] Cold-start cost of a restored workspace measured and recorded — restoring must not be
      slower than re-dropping the same files. *(Measured end to end — page load to the same
      `count(*)` answering in the console — over a 27 MB / 500,000-row CSV: **2.3 s restored
      vs 2.9 s re-dropped**, and 2.2 s on an in-session reload. Restoring is the cheaper path,
      which is the direction the criterion asks for. M1 Air, Chromium 151, production build.)*
- [x] Second tab behaves as the spike prescribed; the degraded path is a real UI state, not a
      thrown error — a contended handle resolves to `usePersistenceStore`'s `'locked'` and the
      ingest still completes, undurable and said so. *(Live: two tabs open at once, each
      dropping its own 27 MB source, both ingests complete and both sources reach OPFS with no
      error surfaced. The **contended-handle path did not reproduce** — staging opens and
      closes a handle per operation, so two tabs working on different files never collide.
      The `'locked'` branch stays proven by `opfsStaging.test.ts` alone.)*
- [x] Clear workspace data empties OPFS *and* the registry keys, then reloads to a true cold
      app (scope call 2). *(Live: after Confirm, the staging directory lists empty, the only
      surviving `localStorage` key is `datascope-settings`, and the reloaded app shows no trace
      of the cleared tables.)*

**One thing the live run found that no unit test could.** Both tabs restore the same staged
bytes into their own engines, and restore is engine-only — so a user who reloads, sees the
cold rail, and does the natural thing (**re-drops the same file**) gets
`Catalog Error: Table with name "probe_rows" already exists!` from the ingest path. The table
is there, correct and queryable; only the rail is empty. This is a direct consequence of the
07b/07d split rather than a defect in either, and it is **07d's to resolve** — a reconciled
registry means the rail is no longer cold, so the re-drop never happens. Recorded here so 07d
tests the case explicitly rather than rediscovering it.

**What 07b deliberately does not do.** Restore is engine-only: it rebuilds the tables and
returns a `RestoreReport` (`tableName`, `fileHash`, restored/failed) into
`stores/persistence.ts`, and touches no registry. Populating the rail from that report would
be a second, provisional rehydration path that 07d's reconciliation then has to replace, so
between 07b and 07d a reload leaves the tables queryable but the workspace UI cold. Registry
keys are cleared by `datascope-` prefix rather than by a hard-coded list, so 07c's stores
cannot quietly escape the Clear control.

**07c — registry state persist (Sonnet).**
- [x] The five stores persist exactly the whitelisted fields; a unit test asserts that
      `workerStatus`, the drawer signal counters, and every `query` session field are absent
      from the serialized payload.
- [x] A test asserts no row data reaches `localStorage` under any of the five — the §22
      checklist item, kept as a test rather than as a promise.
- [x] A persisted payload from a previous schema version does not crash rehydration
      (`version` + `migrate`, per zustand's own contract).

**07d — rehydration bootstrap (Opus).** *Complete 2026-07-29. `services/rehydration.ts` holds the
reconciliation (`reconcile` is pure and takes the three inputs — persisted registry, what
`duckdb_tables()` reports, 07b's `RestoreReport` — so every outcome is testable without an
engine); `stores/rehydration.ts` holds the answers, deliberately **not** persisted, since a
`'restored'` read back from `localStorage` next load would be the dangling-entry lie the sub-step
exists to prevent.*

- [x] Every persisted table resolves to exactly one of restored / recoverable / lost, and the
      rail renders all three distinguishably. *(`reconcile` returns one `TableOutcome` per entry;
      `TableList` routes a non-restored entry to `UnavailableRow` **before** either ordinary
      composition — no name button, no chevron, no stats, reason stated, recovery offered only
      where one exists.)*
- [x] A `fileHash` mismatch is treated as lost, not restored. *(Identity is checked before
      presence: a table sitting under the right name built from the wrong bytes is the one case
      where "it's there" is the wrong answer.)*
- [x] Re-dropping a file the restore already rebuilt does not fail with a catalog collision —
      the case 07b's live run surfaced above. *(Fixed by reconciliation itself, exactly as 07b
      predicted: the registry is no longer empty on reload, so ingest's own `dedupeTableName`
      is handed the restored names and never re-uses one. Tested at the mechanism —
      reconcile leaves the registry populated, and dedupe against it yields a new name. **Live
      Chromium check passed 2026-07-31:** `titanic` returned in the rail after a hard reload and
      a re-drop registered as `titanic_2`, with no catalog, console, or page error.)*
- [x] Nine-good-one-lost restores nine (partial recovery is the normal path). *(Asserted
      directly; nothing in the path throws, so one bad entry can't take the other nine down.)*
- [x] A recoverable `api` table fires no network request until the user asks for it. *(The
      bootstrap only classifies; `recoverTable` is the sole caller of the re-fetch, and is only
      reachable from the row's own button. Asserted with a `fetch` spy over the whole
      bootstrap.)*
- [x] Selection, tabs, and relationship overrides referencing a lost table degrade rather than
      dangling: selection clears, a tab shows its subject as unavailable, an override whose
      table is gone is retained but inert. *(Per slot, not wholesale — a selected edge survives a
      lost table's cleared table/column slots, since the three slots are independent by design.
      A profile tab on a lost subject renders the reason in place and stays open. Overrides need
      no new code: "live table names" now means reconciled-usable rather than merely registered,
      so `applyOverrides` stops producing that edge while keeping the override itself.)*
- [x] Viewer mode neither persists nor rehydrates. *(`stores/dspsReceiver.ts` was never wrapped
      in `persist` — now pinned by a test that opening a document writes no `localStorage` key,
      so a later store sweep can't quietly add one.)*

**The one judgement 07c handed forward.** Scope call 6 held `query`'s `sql`/`lastRunSql` back to
07d rather than deciding it. **Decision: they stay unpersisted, with the rest of the store.** A
restored SQL string beside an `'idle'` status and no rows is a pane that reads as a result that
isn't there — the same class of lie as a restored `workerStatus`. Re-running is one keystroke;
the honest cold state is worth more than the saved keystroke, and nothing in the phase's journeys
asked for it.

## Journeys this phase has to carry

**J8 ("come back to a table later")** stops being untouched by this tier and becomes the phase's
whole point — it was the one journey the README could call untouched only because the app had no
"later" at all. **J1** is unaffected on a cold machine and strictly faster on a warm one.
**J2/J3/J4** all inherit the amendment quietly: quality findings, console results and query tabs
are all things a user now expects to still be there after a refresh, and 07c's tab persistence is
what makes J4's "keep that one" mean what it says. **J7** is protected by scope call 8.
