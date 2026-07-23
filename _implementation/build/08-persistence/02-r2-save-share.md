# 08.2 R2 Save / Share (client side)

**Tier:** v0.5 · Phase 5 · **Master spec:** §12.3 (D5, D20–D21, **D46**)

## Objective

Explicit, opt-in persistence beyond the browser tab: a shareable link and cross-device
pickup — with the disclosure/retention/abuse spec honored exactly, and **structure-first
sharing (D20)**.

## Share artifacts (D20 — structure-first)

- **Structure-only share (default):** the §12.2 structure report hosted as the link —
  schema, types, relationships, profile aggregates, **no data rows**. Dialog offers
  column-name redaction and rare-category suppression as one-click controls.
- **Full-dataset share (explicit escalation):** raw dataset contents stored server-side.
  Never the default; visually distinct dialog stating plainly that raw rows will upload.
- **Language rule (D21):** "structure only — no data rows included"; controls *reduce*
  re-identification risk. Never "anonymized" / "de-identified" / "GDPR/HIPAA-safe".

## Likely-sensitive-column nudge (D46 — v0.5)

Inside the share flow, deterministic detection surfaces **likely-personal-data columns** —
"these columns may contain personal data — review before sharing," framed as *reducing
oversight risk*, **never certifying absence**. **Positives-only, wherever it renders** (share
flow, Dossier, reports): **no "PII scan: none found" line, no all-clear state, ever** — a
false-clean on a free-text SSN column is a trust-landmine for the exact D23 user who trusts it
most. It is a **suppression assist** that pairs with the column-name-redaction and
rare-category controls above, **not a clearance verdict** (extends D21's truth-in-labeling
rule to detector output). Never in v0 launch copy.

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

`src/features/export/` (save/share dialog + disclosure copy, my-links list),
`src/services/export.ts` (`saveToCloud()` / `deleteShare()`), share-link open path in
ingestion.

## Dependencies

[01-parquet-export.md](01-parquet-export.md) (serialization),
[../09-edge/04-persistence-endpoints.md](../09-edge/04-persistence-endpoints.md) (endpoints).

## Acceptance criteria

- [ ] Structure-only artifact is the pre-selected default in the share dialog; full-dataset
      share requires an explicit, distinctly labeled second step (D20)
- [ ] No data rows appear in the structure-only object's payload (inspect the R2 object)
- [ ] The likely-sensitive-column nudge renders **positives-only** — no "none found" /
      all-clear line anywhere in the share flow; it never asserts absence or certification (D46)
- [ ] Share link round-trips a modified dataset on another device (§18)
- [ ] Disclosure dialog shows storage location + the 30-day TTL before anything uploads
- [ ] Delete control removes the object (link 404s after); TTL expiry verified (§22)
- [ ] Size-cap and rate-limit rejections render friendly errors
- [ ] Save/share endpoint disabled (typed 503 kill switch, §23.5) or rate-limited → client
      renders a "save/share paused/unavailable" state; the rest of the app
      (ingest/profile/SQL/charts/insights) stays fully functional (§4)
- [ ] Nothing uploads without the explicit button path (no auto-save anywhere)

## Test plan

E2E against a staging Worker + R2 bucket: save → open in a second browser profile → delete
→ assert 404. TTL via a short-TTL test object. Privacy gate: no save traffic in any
non-share flow.

## Definition of done

The §18 save/share criterion and §22 R2 privacy rows pass against deployed staging infra;
disclosure copy reviewed against [`../../foundations/privacy-model.md`](../../foundations/privacy-model.md).
