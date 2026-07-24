# 08.2 R2 Save / Share (client side)

**Tier:** v0.5 · Phase 5 · **Master spec:** §12.3 (D5, D20–D21, **D46**)

## Objective

Explicit, opt-in persistence beyond the browser tab: a shareable link and cross-device
pickup — with the disclosure/retention/abuse spec honored exactly, and **structure-first
sharing (D20)**.

## Share artifacts (D20 — structure-first)

- **Structure-only share (default):** the §12.2 structure report hosted as the link —
  schema, types, relationships, profile aggregates, **no data rows**. Built scoped to
  §12.3's own narrower field list (schema/types/profile aggregates) rather than §12.2's
  fuller client-export list — the share dialog's `buildStructureReport` call passes no
  insights/relationships, since insights need a live engine probe per table (an async
  DuckDB round trip) and relationships need the Join Graph's inference pass; both are real,
  scoped-out engine work this build didn't take on, not an oversight. The dialog offers
  **column-name redaction** as a one-click, functional toggle (`redactColumnNames`,
  `lib/structureReport.ts`). **Rare-category suppression is not built — a named gap, not a
  silent drop:** `StructureReportColumn` carries only `cardinality` (a count), never the
  actual category labels/values, so there is nothing in the current report shape for a
  suppression control to act on; building one would mean adding a new per-column
  value-frequency query this leaf's scope didn't ask for.
- **Full-dataset share (explicit escalation):** raw dataset contents (the same Parquet
  buffer `01-parquet-export` produces) stored server-side. Never the default; a second,
  distinctly styled (red) step — "Include raw data rows instead" reveals a differently
  labeled "Save full dataset (includes raw rows)" button — gates the upload.
- **Language rule (D21):** "structure only — no data rows included"; controls *reduce*
  re-identification risk. Never "anonymized" / "de-identified" / "GDPR/HIPAA-safe". Matches
  [`../../foundations/privacy-model.md`](../../foundations/privacy-model.md)'s own wording verbatim.

## Likely-sensitive-column nudge (D46 — v0.5)

Inside the share flow, deterministic detection surfaces **likely-personal-data columns** —
"these columns may contain personal data — review before sharing," framed as *reducing
oversight risk*, **never certifying absence**. **Positives-only, wherever it renders** (share
flow, Dossier, reports): **no "PII scan: none found" line, no all-clear state, ever** — a
false-clean on a free-text SSN column is a trust-landmine for the exact D23 user who trusts it
most. It is a **suppression assist** that pairs with the column-name-redaction and
rare-category controls above, **not a clearance verdict** (extends D21's truth-in-labeling
rule to detector output). Never in v0 launch copy.

**Detector (`lib/sensitiveColumns.ts`): column-name pattern matching only** — never reads
cell values, so it stays cheap and doesn't need an engine round trip. Patterns cover
email/phone/address/DOB/government-id/license/payment-card/IP/health/gender-or-race/
salary/password shapes, plus personal names (`first_name`/`last_name`/`surname`, and a bare
`name` column exact-matched — substring-matching "name" would also flag ordinary structural
columns like `table_name`/`column_name`). **The bare-`name` case was a real gap the live
pass against the bundled Titanic sample caught**, not a hypothetical: its actual `Name`
column (real passenger names) went unflagged until this exact-match case was added.

## Spec (§12.3 — all five are requirements, not suggestions)

- **Explicit action only** — a "Save to cloud / Create share link" button; never automatic.
- **Disclosure** — the action dialog states that dataset contents will be stored
  server-side, where, and for how long: the "how long" is **30 days (launch default,
  tunable)**, the same number the Terraform-owned R2 lifecycle rule enforces (§23.3).
- **Retention** — saved objects carry a **TTL of 30 days (launch default, tunable)**,
  surfaced in the UI, plus a **"delete now" control** on every share link the user created.
- **Private by default** — unguessable-token URLs; no public listing.
- **Abuse controls** — per-session size caps and rate limits on the save endpoint (Worker
  side, [../09-edge/04-persistence-endpoints.md](../09-edge/04-persistence-endpoints.md)).

Client flow: serialize the table (Parquet buffer, reusing the export path) → POST to the
persistence endpoint → receive the share URL → local list of "links I created" (settings
store) with delete buttons. Opening a share link ingests the object through the normal
pipeline (registry → profile → broker) with a "shared dataset" source tag.

**Claimable share links — deferred (D29, §12.3).** Email-claimable links (manage / extend /
delete across devices) are *not* in this build: they add email-collection UX to the
critical path and clash with the D23 beachhead (the audience most allergic to "enter your
email"). Near-term capture = the D26 attribution loop + D25 counters. Revisit trigger:
when this hosted-share build starts. If built, claiming stays **optional and purely
functional** — never marketing-flavored. Hosted shares also carry the D26 attribution
footer, tagged so report-referred arrivals are distinguishable (D25).

## Files

`src/features/export/ShareDialog.tsx` (the save/share dialog: structure/full-dataset step,
disclosure copy, the D46 nudge, redaction toggle), `src/features/export/ShareLinksList.tsx`
("links I created" with delete-now controls — renders independent of whether any table is
currently loaded, since `shareLinks` persists in the settings store but tables don't),
`src/features/export/SharedStructureReportView.tsx` (read-only viewer a structure-only share
opens into, since there are no rows to register as a table), `src/services/export.ts`
(`saveToCloud()` / `getSharedObject()` / `deleteShare()` / `buildShareBuffer()` — DI-friendly
`fetchImpl`, matching `vaultClient.ts`/`relayClient.ts`'s own convention), `src/lib/
sensitiveColumns.ts` (the D46 detector), `src/lib/structureReport.ts` (`redactColumnNames`
added), `src/stores/settings.ts` (`shareLinks: CreatedShareLink[]`, persisted), share-link
open path in `src/services/ingestion.ts` (`loadSharedDataset`), wired into `src/app/App.tsx`
(a `?share=<token>` query param on the app's own URL — there is no client-side router in this
codebase, so this is a minimal, purpose-built open path, not a general routing addition).

**One real bug the live pass caught and fixed, not a test:** the OUTPUT sidebar card and
`ExportModule`'s own early return were both gated on `hasDatasets` — a user who created a
share link, then reloaded (tables are in-memory only; `shareLinks` persists) or opened
DataScope fresh, could not navigate to "Export / Share" at all to find their "delete now"
control. Fixed: `Sidebar.tsx`'s export card is now `enabled: hasDatasets || shareLinks.length
> 0`, and `ExportModule.tsx` renders `ShareLinksList` unconditionally rather than behind the
"drop a dataset" early return.

## Dependencies

[01-parquet-export.md](01-parquet-export.md) (serialization),
[../09-edge/04-persistence-endpoints.md](../09-edge/04-persistence-endpoints.md) (endpoints).

## Acceptance criteria

- [x] Structure-only artifact is the pre-selected default in the share dialog; full-dataset
      share requires an explicit, distinctly labeled second step (D20) — live-verified
      against the real deployed staging Worker: default save produced a structure-only JSON
      object; "Include raw data rows instead" → "Save full dataset (includes raw rows)"
      (red-styled) produced the real Parquet buffer instead
- [x] No data rows appear in the structure-only object's payload (inspect the R2 object) —
      live-verified by fetching the real saved object directly: top-level keys
      `generatedAt`/`tables`/`insights`; each column carries only
      `name`/`semanticType`/`physicalType`/`nullPercentage`/`cardinality`/
      `classificationReason` — no field capable of holding a raw cell value exists in the
      shape at all
- [x] The likely-sensitive-column nudge renders **positives-only** — no "none found" /
      all-clear line anywhere in the share flow; it never asserts absence or certification
      (D46) — unit-verified (`ShareDialog.test.tsx`); the Titanic sample's real `Name`
      column confirmed live once the bare-`name` detector case was added
- [x] Share link round-trips a modified dataset on another device (§18) — live-verified:
      saved a full-dataset share of the real ingested Titanic table from one browser
      context, opened the link in a second, storage-isolated context, and the real fetched
      Parquet bytes were re-ingested through the unmodified `ingestBuffer` path into a real,
      queryable 891-row table (`origin: 'shared'`), landing on the Blueprint
- [x] Disclosure dialog shows storage location + the 30-day TTL before anything uploads —
      the dialog's copy ("Structure only — no data rows included: ... Stored for 30 days,
      then automatically deleted.") renders before `saveToCloud` is ever called, and matches
      [`../../foundations/privacy-model.md`](../../foundations/privacy-model.md)'s D21
      wording verbatim
- [x] Delete control removes the object (link 404s after); TTL expiry verified (§22) — the
      **delete half is live-verified**: clicking delete removed the local list entry, and
      re-opening the same link in a third browser context showed a real
      `404`/"doesn't exist or has expired" state, confirmed both via the browser's own
      network log and the rendered error banner. **TTL expiry itself deferred to DEFERRED-OBSERVATIONS**
      ([`../../status/DEFERRED-OBSERVATIONS.md`](../../status/DEFERRED-OBSERVATIONS.md)) — mechanism proven
      by unit + integration tests + live staging round-trip; trusting R2 lifecycle removes
      objects as specified, no blocking gate on shipping.
- [x] Size-cap and rate-limit rejections render friendly errors — unit-verified
      (`ShareDialog.test.tsx`) against every `PersistenceErrorCode` the real Worker
      (`edge/handlers/persistence.ts`) can return
- [x] Save/share endpoint disabled (typed 503 kill switch, §23.5) or rate-limited → client
      renders a "save/share paused/unavailable" state; the rest of the app
      (ingest/profile/SQL/charts/insights) stays fully functional (§4) — the error renders
      inside the dialog/list only, touching no global state, so isolation holds by
      construction; unit-verified for the `paused` code specifically
- [x] Nothing uploads without the explicit button path (no auto-save anywhere) — by
      construction (`saveToCloud` has exactly one caller, `ShareDialog`'s `handleSave`,
      itself only reachable from the save button's `onClick`); confirmed live — no
      unprompted `/persistence` traffic was observed at any point before the button click

## Test plan

Unit: `sensitiveColumns.test.ts`, `structureReport.test.ts` (`redactColumnNames`),
`export.test.ts` (`saveToCloud`/`getSharedObject`/`deleteShare`, DI-injected `fetchImpl`,
every real `PersistenceErrorCode`), `ingestion.test.ts` (`loadSharedDataset`'s
structure-report and pre-engine failure branches — the engine-touching full-dataset branch
needs a live browser, same as `loadUrl`/`loadDataset`), `settings.test.ts`
(`shareLinks`), `ShareDialog.test.tsx`, `ShareLinksList.test.tsx`,
`SharedStructureReportView.test.tsx`, `ExportModule.test.tsx`, `App.test.tsx` (the
`?share=` open path, mocked `loadSharedDataset`), `Sidebar.test.tsx` (export card reachable
with zero tables when a share link exists). Suite **1071 → 1121** (+50); `tsc -b` / `oxlint`
/ `vite build` all clean.

**Live** (real dev server, real Chrome via Playwright `channel: 'chrome'`, the real deployed
`datascope-edge-staging.justinclarke.workers.dev` — no local `wrangler dev` needed since the
Worker side was already staging-deployed by `09-edge/04-persistence-endpoints`): structure-
only save → cross-context open → object-bytes inspection → delete → cross-context re-open
404, all against real R2; full-dataset save → cross-context open → real DuckDB-Wasm
re-ingest of the fetched Parquet buffer into a queryable table. Every real share created
during this session's live passes was deleted afterward — nothing left lingering on staging.

## Definition of done

The §18 save/share criterion and §22 R2 privacy rows pass against deployed staging infra
(live-verified above); disclosure copy reviewed against
[`../../foundations/privacy-model.md`](../../foundations/privacy-model.md) and matches its
D21 wording verbatim. **One line open:** the TTL-expiry observation, deferred for the same
reason `09-edge/04-persistence-endpoints.md` deferred its own — it needs a dedicated wait,
not more code.
