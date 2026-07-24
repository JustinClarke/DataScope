# 08.3 DSPS — the DataScope Profile Spec

**Tier:** schema designed in v0 (Phase 1, §19) · renderers land v0/v0.5 · **Master spec:**
§12.2, §1, §6 · **Decisions:** D31 (formalization), **D37** (promoted to a first-class,
open, versioned interface), D38 (MCP-served), **D45** (fact provenance & labeling),
D20/D24 (source artifact + degradation), D47 (a DSPS fact list is structural metadata, not RAG),
**D62** (the universal `.dsps` receiver — reference consumer), **D63.2** (signed `.dsps`),
**D64** (format-first inversion — DSPS is the platform, published JSON Schema + validator libs).

## Objective

DSPS is the **machine-readable interface** DataScope emits — not an export afterthought but
a named architectural contract (§1, §6). One artifact, three renderers (§12.2): HTML (for
humans), **DSPS JSON** (for tools), and "Copy for AI" (an LLM-optimized markdown block).
This doc is the field-level home for the JSON spec, its versioning, and its degradation
semantics; the renderers themselves are covered in
[`../05-charting/README.md`](../05-charting/README.md) (three-renderers framing) and
[`../05-charting/05-join-graph-beta.md`](../05-charting/05-join-graph-beta.md)
(relationship section).

## Spec

- **One artifact, generated entirely client-side** via DuckDB-Wasm — schema, inferred
  semantic types, profile aggregates (null %, cardinality, distributions, median/p95), the
  insight feed, quality flags, and — from the v0 Join Graph (beta) onward (D24) — the
  confidence-labeled relationship graph. **Zero raw rows** by construction (§5 privacy model
  extends to AI workflows for free).
- **Versioning (D37).** Every DSPS document carries an explicit **`dsps_version`** field
  (semantic version). Compatibility rules:
  - *Forward-compatible read:* a consumer on an older spec reads the fields it knows and
    ignores the rest.
  - *Backward-compatible produce:* a producer never silently drops documented fields within
    a major version.
  - *Version mismatch surfaces, never fails opaquely:* a consumer that cannot read the major
    version reports the DSPS version it saw rather than erroring blankly.
  - *Breaking changes bump the major version.*
- **Graceful degradation (D20/D24).** When the D24 Join Graph slice is cut, the relationship
  section drops and the artifact **still validates as schema-only** — the documented,
  intended degraded shape, not a failure. This is the same degradation "Copy for AI" already
  relies on (§12.2).
- **Fact provenance & labeling (D45).** Every DSPS fact is labeled **"computed as of
  {snapshot date + file hash}"** and carries a provenance tag — `derived-this-run` /
  `user-asserted` / `carried-unverified`. **"Verified" and any permanence/invariant wording
  are banned** in fact labels (D21's truth-in-labeling rule, extended from share/export copy
  to fact and detector output — an old artifact asserting "customer_id unique" long after a
  bad merge broke it is a false-permanence claim). DSPS facts are **structural/quality only**
  (PK/FK/null/type/range/distribution) — metrics stay in the §20.6 semantic model, which also
  avoids the dimensional-modeling "fact table" naming collision. DSPS stays
  **stateless-per-run**: no cross-run merge or accumulation. **v0 ships facts exactly as they
  already are** (profile aggregates + D24 edges); the unified fact object + provenance tag is
  **v0.5 DSPS-spec work**, never a mid-flight v0 re-architecture. A DSPS fact list —
  deterministic, SQL-derived, carrying evidence + confidence, with no vectors/embeddings/
  similarity search — is in-bounds structural metadata, **not RAG** (D47); the D32 non-goal is
  unchanged.
- **ViewSpec boundary (D55).** DSPS is **facts, never layout**: the declarative ViewSpec
  layer (§9/§13.1) is a separate presentation artifact whose producers take classifier/DSPS
  output as *input*. No layout, panel, or presentation field ever enters DSPS; ViewSpec has
  its own versioning (`viewspec_version`, mirroring the D37 pattern) and its own file
  (`src/lib/viewspec.ts`).
- **Open, versioned spec (D37); format-first — DSPS is the platform (D64).** DSPS is published
  as an open format — "send me the DataScope report" becomes a portable format (the
  Swagger/OpenAPI arc; §24 Play 4). D64 makes the inversion explicit: **DSPS is the platform and
  the web app is its flagship client.** The practical consequences (v0.5-era, riding the
  scheduled spec work): **(a)** a **published JSON Schema + a small validator/parser library on
  npm** so third-party tools consume DSPS without reading our source; **(b) spec-first
  discipline** — the DSPS document, not the app's internal TS types, is the contract; **(c)** the
  **D62 receiver is the named reference consumer.** A format only one app reads is an export;
  the schema, the library, and the receiver are the difference. No new server surface (§4).
- **Universal `.dsps` receiver (D62).** Any `.dsps` dropped on (or linked into) the app renders
  the full Dataset Dossier (§13.1) **read-only, instantly — no data, no login, no install**: the
  D48 Dossier renderer with the live-data path stripped, a read path over the existing artifact,
  **zero new server surface**. It closes the send/receive/re-run reflex loop (§24 Play 4 ships
  the sender) and is the D64 reference consumer. **v0 stretch if trivially cheap, else early
  v0.5;** internal cut line: degrade to rendering the §12.2 HTML report output — never the date
  (D27).
- **Workbench viewer mode (2026-07-24, D62 amendment / D71 — master §13.3; flag-on shell
  only).** In the Workbench the receiver renders as **viewer mode** — the same shell
  read-only, not a modal: options strip fully absent (consumption-only), no right AI pane,
  read-only explorer (no Add-data, no per-table management), **read-only inspector — edge
  evidence renders, override controls do not** (the structure belongs to the sender's
  session). The **D63 trust-chrome slot** is a full-width provenance band (structure-only
  claim · signer · signature-verified state), and the **D45 provenance chrome renders in
  full** (computed-as-of snapshot + hash, provenance tags, banned-permanence wording).
  Exactly two exits: **Export report** (where the payload allows) and **Start my own
  session**. **Drop routing:** every drop surface — welcome page, whole-window, explorer
  Add-data — **sniffs `dsps_version` first** and branches `.dsps` → viewer mode *before*
  the JSON-ingestion path, so a dropped report never mis-ingests as a dataset. **Cut line
  restated (D62):** viewer mode degrades to the single-table Blueprint face / the static
  §12.2 HTML report render — never the date (D27).
  ([`../12-workbench/`](../12-workbench/README.md))
- **Signed `.dsps` — verifiable provenance (D63.2; design round before build, v0.5+).** D45's
  provenance *labels* gain a verifiable *signature*: a receiver can confirm an artifact was
  genuinely computed by DataScope from a file with hash X, not hand-edited. Claim discipline
  (D21/D45): "genuine, unmodified DataScope profile of file-hash X" — **never** "this data is
  safe." **Design constraint: client-side signing against a published public key only** — any
  per-request signing service is new server surface (§4) and out of scope without its own round.
  Piece (2) of the D63 approval kit ([`../../foundations/security-model.md`](../../foundations/security-model.md)).
- **MCP-served (D38).** The stage-A MCP endpoint serves DSPS **read-only** over artifacts a
  user explicitly shared to R2 ([`../09-edge/`](../09-edge/), D5/§12.3); stage B's
  `generate_dsps` runs only over explicitly staged datasets (D39). DSPS itself is unchanged
  by MCP — the endpoint transports the same client-generated artifact.

## Files

`src/lib/dsps.ts` (`DSPS_VERSION`, `DspsProvenance`, `DspsSnapshot`, `hashBytesHex`,
`formatSnapshotLabel`, `passesFactWordingGuard` — reused verbatim from the Verdict seam's D45
guard, `parseDsps` — the forward-compatible, version-mismatch-surfacing reader). `dsps.ts`
layers the spec contract on top of the existing document builder rather than duplicating it:
`src/lib/structureReport.ts`'s `StructureReport` **is** the concrete DSPS document — extended
in place with `dspsVersion` and, on every fact (`StructureReportInsight`), `provenance` +
`snapshot`. `src/services/ingestion.ts`'s `ingestBuffer` computes the snapshot's file-hash half
(`hashBytesHex` over the already-in-memory `Uint8Array`) for a non-sampled file/sample ingest;
a sampled-tier (large) file and non-file origins carry `fileHash: null` — a named gap, not a
silent omission, since hashing a sampled-tier file would mean fully buffering exactly the file
its own size tier exists to avoid buffering. `src/types/dataset.ts`'s `TableRegistryEntry`
carries the resulting `fileHash`.

Three renderers, all in `src/features/export/` (a fourth pre-existing one, JSON, already lived
in `structureReport.ts`'s `downloadStructureReport`): `src/lib/dspsHtml.ts` (`buildDspsHtml` /
`downloadDspsHtml` — the new HTML renderer, self-contained, HTML-escaped, carrying the D26
attribution footer) is the one genuinely new renderer; "Copy for AI" (`lib/aiContext.ts`) and
the DSPS JSON export already existed pre-build. All three now hang off `IdentityBand.tsx`'s
button row ("Copy for AI" / "Export structure report" / "Export HTML report"), wired through
`ViewSpecRenderer.tsx`'s `DossierInteractions` and `DatasetDossier.tsx`'s handlers.

The **read-only `.dsps` receiver (D62):** `src/stores/dspsReceiver.ts` (a small store —
`open`/`fail`/`close`) fed by `IngestionPanel.tsx`'s `handleFiles`, which now branches a
single `.dsps`-suffixed drop to a local `file.text()` → `JSON.parse` → `parseDsps` path
**before** it ever reaches ingestion — never a fetch, never the engine. `App.tsx` renders the
parsed document through the **existing** `SharedStructureReportView.tsx` (already a pure,
network-free read-only renderer over a `StructureReport` — reused as-is rather than building a
second renderer), the same component the "open a share link" flow already uses. This is the
**degraded cut** the spec's own internal cut line names ("degrade to rendering the §12.2 HTML
report output") rather than a from-scratch static render of the full live Dossier ViewSpec —
deliberate, not a shortfall. `DropZone.tsx`'s file-picker `accept` list gained `.dsps` (a real,
live-pass-only finding: without it a `.dsps` file was invisible to click-to-browse, though
drag-drop was unaffected). The Workbench viewer mode (above) inherits this branch point and
tightens it: the sniff keys on `dsps_version` (not the filename suffix alone) and must run at
every drop surface before JSON ingestion.

**JSON Schema + npm validator library (D64):** `schemas/dsps.schema.json` at the repo root (the
published contract) and the standalone package `packages/dsps-validator/` (`package.json`,
`tsconfig.json`, `README.md`, `src/index.ts` + `src/index.test.ts`, its own copy of the schema
file) — zero runtime dependencies, zero import from this app's `src/`, typechecks and tests
standalone. `vitest.config.ts`'s `include` extended to run its suite alongside the app's own.

**MCP wiring (D38), completing the build/09-edge/01 scaffold:** `edge/protocol.ts`'s
`McpResponse`'s `get_dsps` variant now carries `dsps: unknown` (an opaque pass-through of the
stored artifact) rather than the narrower `StructuralFacts` shape synthesis still uses — MCP
transports the client-generated document verbatim, per D38, rather than re-deriving a smaller
one. `edge/handlers/mcp.ts` gained `createR2SharedArtifactStore(store: PersistenceStore)`: a
production `SharedArtifactStore` backed by the **same** R2 bucket
[`../09-edge/04-persistence-endpoints.md`](../09-edge/04-persistence-endpoints.md) already
writes to (`shareObjectKey`, now exported from `persistence.ts`), gated on the object's stored
content type (a new specific `application/vnd.datascope.dsps+json`, replacing the generic
`application/json` `STRUCTURE_REPORT_CONTENT_TYPE` previously used in `services/export.ts`) so
a full-dataset share (raw Parquet bytes) can never be surfaced through MCP as if it were a DSPS
document. `McpEnv.store` is now optional (unbound R2 ⇒ a typed `unavailable`, the same
fail-closed shape `persistence.ts`/`vault.ts` already use), and `handleMcp` now rejects
non-POST. `listShared` is a **named, deliberate gap**: `persistence.ts`'s object store records
no session↔token association server-side by design (its own header comment: "nothing stored
beyond what TTL/ownership need") — building that index is new server-side scope this leaf doc's
own acceptance criteria never asked for (only `get_dsps`'s pass-through is tested here), so it
returns `[]` rather than fabricating a list. `edge/worker.ts` wires `/mcp` (mirroring
`/persistence`'s method-check-inside-the-handler shape), `edge/bindings.ts` gained
`MCP_KILL_SWITCH`, and `wrangler.toml` (root + `[env.staging]`) declares it — no new binding or
resource, since `/mcp` reuses the persistence endpoint's existing `PERSISTENCE_BUCKET`.

Signed-`.dsps` (D63.2) is unbuilt, as scoped — its own design round.

## Dependencies

Profiling ([`../03-profiling/`](../03-profiling/)) and the Join Graph
([`../05-charting/05-join-graph-beta.md`](../05-charting/05-join-graph-beta.md)) supply the
content; the interfaces-first work (D18) designs the schema in Phase 1. The MCP wiring depends
on [`../09-edge/04-persistence-endpoints.md`](../09-edge/04-persistence-endpoints.md)'s R2
store (already shipped) and reuses [`../09-edge/01-ai-router.md`](../09-edge/01-ai-router.md)'s
Phase-1 `handleMcp`/`SharedArtifactStore` scaffold rather than replacing it.

## Acceptance criteria

- [x] Every DSPS document carries a `dsps_version`; a consumer on an older major version
      reports the version rather than failing opaquely — `dsps.ts`'s `parseDsps` and the
      independent `dsps-validator` package's own `parseDsps` both tested against a
      major-version mismatch (reports `seenVersion`), a missing version (`'unversioned'`), and
      a newer minor/patch within the current major (accepted)
- [x] With the D24 slice cut, DSPS validates as schema-only (relationship section absent, no
      error) — tested in `dsps.test.ts`, `dspsHtml.test.ts`, and the `dsps-validator` suite;
      live-verified (the Titanic sample carries no Join Graph edges, and every renderer/receiver
      pass below ran against exactly that schema-only document)
- [x] DSPS JSON round-trips schema/profile metadata; no data rows appear in any renderer —
      round-trip tests in `dsps.test.ts` and `dsps-validator`; the HTML renderer is
      HTML-escaping-tested and, live, produced a self-contained file with no `<script>`/`<link>`
      and no per-row cell values; every renderer type carries only schema/aggregate fields, no
      row-shaped field exists to leak through
- [x] Every DSPS fact carries a snapshot label ({date + file hash}) and a provenance tag
      (`derived-this-run` / `user-asserted` / `carried-unverified`); no fact label uses
      "verified" or permanence/invariant wording (D45) — `structureReport.ts` stamps both on
      every insight; `passesFactWordingGuard` (reused from `producerValidators.ts`'s existing
      D45 guard, not reimplemented) is unit-tested against "verified"/"always"-shaped text. The
      current fixed insight templates (`insights.ts`) were manually audited and carry no banned
      wording; a live-generated-insight regression test (querying a real engine) was judged out
      of this build's scope, named here rather than silently skipped
- [x] DSPS carries no metric facts (metrics remain in the semantic model, §20.6); the fact
      set is structural/quality only, and stateless-per-run (no cross-run accumulation) (D45) —
      true by construction: `DspsFact`/`StructureReportInsight` carry no numeric-metric field,
      and every `buildStructureReport` call is a fresh, non-accumulating build
- [ ] The stage-A MCP endpoint returns the identical client-generated DSPS artifact for a
      shared share_id (read-only) — **built and unit-verified** (`mcp.test.ts`'s
      `createR2SharedArtifactStore` cases: a structure-only share's DSPS JSON returned verbatim,
      a full-dataset share never surfaced, an unknown token returns `null`), wired into
      `worker.ts`, and both `wrangler deploy --dry-run` (root + `--env staging`) bundle cleanly
      with `MCP_KILL_SWITCH` present and the existing `PERSISTENCE_BUCKET` binding reused. **Box
      stays open** on the one thing not done this session: a live round-trip against the real
      deployed staging Worker (save a structure-only share, call `/mcp` for it) — a real
      `wrangler deploy --env staging`, the same deliberate confirmation-gated pause this
      project's edge items already establish as the norm
- [ ] A published JSON Schema validates every emitted DSPS document, and the npm
      validator/parser library round-trips it independently of the app source (D64) — the
      schema (`schemas/dsps.schema.json`) and the package (`packages/dsps-validator/`, 14
      passing tests, zero runtime deps, zero import from this app's `src/`, typechecks
      standalone) are both **built and verified locally**. **Box stays open** on the literal
      word "published" — `npm publish` is a real, externally-visible, effectively-irreversible
      action against the public registry, deliberately not run without explicit confirmation,
      matching this project's own provisioning-pause pattern for R2 buckets/Terraform/deploys
- [x] The `.dsps` receiver renders a handed artifact read-only in the Dossier with no network
      call for data/login/install; it degrades to the HTML report output (D62) — unit-tested
      (`dspsReceiver.test.ts`, `IngestionPanel.test.tsx`'s three `.dsps`-drop cases,
      `App.test.tsx`'s render/close/error-dismiss cases) and **live-verified** in a real Chrome
      browser via the dev server: downloaded the DSPS JSON export, dropped it back in through
      the file picker, and the read-only `SharedStructureReportView` rendered the real schema
      and insights with the request log showing **zero** network requests during the whole
      operation

## Definition of done

Schema + `dsps_version` compat rules built and versioned; round-trip and schema-only
degradation verified against the bundled Titanic sample (unit tests + a live browser pass); the
JSON Schema and its independent npm validator package are built, tested, and typecheck clean,
but not yet actually published to the npm registry. The `.dsps` receiver and the HTML renderer
are live-verified end to end, including a real bug the live pass caught and fixed (the
file-picker's `accept` list excluded `.dsps`). The MCP `get_dsps` wiring is complete and
unit-verified against a real R2-store shape but not yet exercised against a live staging
deploy. **Two criteria stay open, both deliberately** — an `npm publish` and a
`wrangler deploy --env staging` + live MCP round-trip — real external-facing actions withheld
pending explicit confirmation, not gaps in the work itself.
