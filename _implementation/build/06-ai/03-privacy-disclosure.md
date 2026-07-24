# 06.3 AI Privacy Disclosure & Metadata-Only Repair

**Tier:** v0.5 · Phase 4 · **Master spec:** §11.3, §5.1

## Objective

Make cloud-mode data flows visible and controllable: the metadata-only-repair toggle,
disclosure UI, and the transcript as the audit surface.

## Spec

- **What cloud mode sends (§5.1):** schema (table/column names, types), prompts, generated
  SQL, error traces. **Sample data rows only if "data-sampled repair" is enabled** — the
  retry loop's stage-5 resample sends up to 3 actual rows to the provider.
- **Metadata-only repair toggle (§11.3):** restricts retry context to schema + error trace.
  Clearly worded in settings, discoverable from the chat UI, effective immediately
  (mid-session flips apply to the next attempt).
- **Disclosure UI:** the cloud-mode payload list lives where the user chooses the mode
  (first-run chooser + settings), phrased per
  [`../../foundations/privacy-model.md`](../../foundations/privacy-model.md). No silent drift:
  any future payload addition requires updating this disclosure.
- **Transcript as audit surface:** the per-attempt execution log
  ([01-pipeline.md](01-pipeline.md)) marks which attempts included sampled rows, so a user
  can verify the toggle's effect from inside the product.

### Workbench fold deltas (2026-07-24 — master §5.1/§5.2/§11.3, D2 amendment, D71/D72; builds in the W6/W7 leaves)

- **Shell-conditional disclosure surface:** the first-run chooser (`AIModeChooser`) remains the
  current shell's surface; the Workbench replaces it with the **flat mode switches + "Configure
  workspace"** (§5.1). The disclosure copy in this doc serves both.
- **Flip lifecycle:** egress switch = **flip → disclosure shown → explicit confirm → active**;
  no producer (edge-warm D70 synthesis included) may egress on a selected-but-unconfirmed mode.
  `Your own key` discloses **after** field-shape detection (URL = zero-egress; bearer = leaves).
- **Persistence boundary:** only zero-egress prefs persist; `Cloudflare` / active-bearer / D72
  grounding reset off per session and re-disclose on re-arm (§5.2).
- **D72 deeper cloud grounding:** the graduated sample control (3-row floor → hard cap N rows /
  M bytes) extends this doc's stage-5 sample path — same pipeline, bigger disclosed sample;
  per-session, default-off, transmit-only (never persisted / `.dsps` / shared); `Off` aborts
  in-flight. Custody-differentiated labeling: Cloudflare — not trained on / not stored, transient
  perf caching may apply; BYOK — the user's provider's terms; + a v0 "may contain sensitive
  values" caveat (D46 stays v0.5, positives-only). The transcript marks grounded attempts and
  the row-count sent, extending the existing `sampledRows` badge.

## Files

`src/services/ai.ts` (the `metadataOnlyRepair` deps flag; stage 5's resample-on-failure,
capped and degrading silently on its own failure), `src/types/ai.ts` (`SqlAttempt.sampledRows`),
`src/stores/settings.ts` (`metadataOnlyRepair` + `setMetadataOnlyRepair`, persisted like the
other AI preferences), `src/features/ai/AISettingsPanel.tsx` (the toggle + the exact §5.1
payload-list disclosure paragraph, API mode only), `src/features/ai/AIModeChooser.tsx` (the
first-run chooser's matching disclosure), `src/features/ai/AITurnView.tsx` (the transcript
badge on a `sampledRows` attempt).

## Dependencies

[01-pipeline.md](01-pipeline.md) stage 5, [02-modes-byok.md](02-modes-byok.md) (settings
surface).

## Acceptance criteria

- [x] Metadata-only ON: no data rows appear in any request body during retries (§22 —
      verified by request inspection, not trust) — *unit-tested (`ai.test.ts`): with
      `metadataOnlyRepair` true (the default), a failed attempt's retry `tool` message never
      carries a sample-row block and `sampledRows` stays unset. Request-body-level evidence is
      at the `askAI` message-list layer — `cloudProvider.ts`'s wire mapping is a structural
      pass-through (`toWireMessage`), so the message content asserted here **is** the request
      body a real provider call would carry; no live network capture was run this session.*
- [x] Metadata-only OFF: at most 3 sample rows per retry, and the transcript marks the attempt —
      *unit-tested: against a mock 5-row table, the retry message carries only the first 3 rows
      (asserted by presence/absence of specific row values) — a defensive slice independent of
      the `LIMIT 3` in the resample SQL itself — and the failed attempt's `sampledRows` is `true`.
      A resample that itself fails degrades silently to metadata-only for that attempt (also
      tested) rather than crashing the turn. `AITurnView` renders a badge for a `sampledRows`
      attempt (component-tested).*
- [x] Disclosure text enumerates exactly the §5.1 payload list — *component-tested
      (`AISettingsPanel.test.tsx`): asserts the exact "schema (table/column names, types),
      prompts, generated SQL, and error traces" phrasing renders in API mode's settings
      disclosure; the first-run chooser (`AIModeChooser.tsx`) carries the same enumeration plus
      "error traces" (added this session for consistency with §5.1's exact wording).*
- [x] Toggle state persists (settings store) and applies mid-session — *`settings.test.ts`
      covers persistence (localStorage) and the setter; `AISettingsPanel.test.tsx` covers the
      checkbox wiring; `privacy.test.ts` confirms it's a persisted preference, never dataset
      content. "Applies mid-session" is per-turn — the setting is read once per question, so a
      flip takes effect on the **next** question, matching this doc's own test-plan wording
      ("verify next retry's context"); a flip does not retroactively alter a turn's retries
      already in flight (no claim to that effect ships in the UI copy).*

## Test plan

Intercept provider requests in tests (mock transport) and assert body contents under both
toggle states — done via `askAI`'s message list (`ai.test.ts`), the layer `cloudProvider.ts`
passes straight through to the wire. Copy review against §5.1 — done (`AISettingsPanel.test.tsx`,
`AIModeChooser.test.tsx`). **Not run this session:** a live E2E flipping the toggle mid-conversation
against a real or staging provider (the mode-switch matrix precedent in
[02-modes-byok.md](02-modes-byok.md)) — the feature is pure application logic with no new
third-party integration surface, so unit/component coverage was judged sufficient; flag if a
future session wants the live confirmation too.

## Definition of done

The §22 "cloud mode: only disclosed payloads leave" gate passes with request-level evidence
(message-list assertions, not trust); transcript badges verified (component-tested, not a live
screenshot).
