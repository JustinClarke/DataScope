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

`src/lib/dsps.ts` (schema definition, `dsps_version` + forward/backward-compat rules),
`src/features/export/` (the three renderers), the **read-only `.dsps` receiver** over the
Dossier renderer (D62, §13.1), plus the versioned **JSON Schema** and the **npm validator/parser
library** published alongside the spec (D64). Signed-`.dsps` (D63.2) is its own design round —
client-side signing against a published public key only.

## Dependencies

Profiling ([`../03-profiling/`](../03-profiling/)) and the Join Graph
([`../05-charting/05-join-graph-beta.md`](../05-charting/05-join-graph-beta.md)) supply the
content; the interfaces-first work (D18) designs the schema in Phase 1.

## Acceptance criteria

- [ ] Every DSPS document carries a `dsps_version`; a consumer on an older major version
      reports the version rather than failing opaquely
- [ ] With the D24 slice cut, DSPS validates as schema-only (relationship section absent, no
      error)
- [ ] DSPS JSON round-trips schema/profile metadata; no data rows appear in any renderer
- [ ] Every DSPS fact carries a snapshot label ({date + file hash}) and a provenance tag
      (`derived-this-run` / `user-asserted` / `carried-unverified`); no fact label uses
      "verified" or permanence/invariant wording (D45)
- [ ] DSPS carries no metric facts (metrics remain in the semantic model, §20.6); the fact
      set is structural/quality only, and stateless-per-run (no cross-run accumulation) (D45)
- [ ] The stage-A MCP endpoint returns the identical client-generated DSPS artifact for a
      shared share_id (read-only)
- [ ] A published JSON Schema validates every emitted DSPS document, and the npm
      validator/parser library round-trips it independently of the app source (D64)
- [ ] The `.dsps` receiver renders a handed artifact read-only in the Dossier with no network
      call for data/login/install; it degrades to the HTML report output (D62)

## Definition of done

Schema + `dsps_version` compat rules defined and versioned; round-trip and schema-only
degradation verified against all bundled samples; the JSON Schema is published.
