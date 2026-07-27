# V4 — Bottom inspector + AI pane

**Tier:** v0.69 (the hallmark visual replication, D71 execution) · **Master spec:** §19 (the
v0.69 subsection, V4 row), §13.3 (the bottom inspector / right AI pane paragraphs) · **Decision
row:** D71 (names the five signed-off mocks as the visual reference — this leaf charters nothing
new) · **Locked system:** `.hallmark/design.md` · **Depends on:** V1 (token layer, shipped
2026-07-25). Not V2 — V2's region-surface table already put `--color-panel` on
`data-region="inspector"` and `data-region="ai-pane"` in `WorkbenchShell.tsx`; V4 only needs V1's
token set, same reasoning V3 used to skip V2.

This leaf lands **before** any `src/` code for this phase, per §19's binding constraint. No code
changes in this session; this doc is the spec the next session builds against.

## Objective

Reskin the two regions V2/V3 explicitly left untouched: the bottom `Inspector`'s edge-evidence
scent (`EdgeEvidencePanel`) and the right `AIPane`'s internals (`ModeSwitches`, `AIChatModule`,
`AITurnView`). The master row names three concrete things — **confidence pill, evidence row,
purple copilot register** — and the research below found the third is not cosmetic: `--color-
accent` (the legacy alias every one of these files currently reaches for) resolves to
`--color-active`, the amber HUD accent, so today's AI pane renders amber throughout — exactly the
"amber on an AI surface... is a semantics bug, not a style choice" case `design.md` names. V1
already shipped the fix's tokens (`--color-ai`/`--color-ai-2`/`--color-ai-ink`/`--color-ai-soft`)
in 2026-07-25; nothing in `src/` has consumed them yet. V4 is chrome-and-register fidelity only:
no new AI behavior, no new inference logic.

## Scope calls

**1. The confidence pill reuses real D24 data — no fabrication, unlike V3's role-classifier
gap.** `EdgeEvidencePanel`'s `ConfidenceBadge` already renders `edge.confidence`
(`'confident' | 'candidate'`), a real value the relationship-inference engine computes
(`lib/relationshipInference.ts`). The mock's `.conf`/`.conf.is-high` pill (always-bordered,
mono, a short solid/dashed line glyph, amber only in the high state) is a direct restyle of what's
already there — not a second badge. **The pill stays amber-for-confident, not purple.** This
looks like it could contradict "purple = copilot," but it doesn't: confidence here is a
structural-inference property (D24), not an AI-generated one — the mock itself colors
`.conf.is-high` with `--c-active` (amber), and `design.md`'s registers are about *what produced
the content*, not adjacency to the word "AI." Nothing about the confidence pill moves to purple.

**2. The evidence row decomposes real per-fact fields the engine already scores — not the mock's
exact fact set, since two of its four (`type match`, static `card: '1:M'`) aren't computed here.**
`FkEdge` (`relationshipInference.ts`) carries `nameAgreement: boolean`, `containment: number`,
`coverage: number`, and `parentKeyUniqueness: number` — all real, all already present on every
edge the Inspector renders (see `Inspector.test.tsx`'s own `EDGE` fixture, which sets all four).
The mock's `.evidence`/`.ev` checklist pattern (mono row, ✓/⚠ icon per fact) ports onto **these**
four facts instead of the mock's illustrative name/type/overlap/cardinality set — same "port the
treatment onto the data that's actually real" reasoning V3 used for the `.trow__role` badge.
`✓`/`⚠` per item reuses the engine's own frozen thresholds, already exported —
`CONTAINMENT_SOLID` (0.95), `MIN_STRUCTURE_COVERAGE` (0.1), `KEY_UNIQUENESS_MIN` (0.98) — not new
UI-invented cutoffs. `nameAgreement` is a direct boolean (✓ agrees / ⚠ differs).

**3. The evidence row replaces the current prose sentence rather than sitting alongside it — not
an information loss.** `edge.evidence` today is one formatted sentence
(`"${pct}% of \`child\` values appear in \`parent\`"`) — that number *is* `containment`, one of
the four items the new row already shows individually, just decomposed instead of narrated. This
differs from V3's status-bar call (which kept every ambient item because each carried distinct
information); here the replacement is strictly more granular, not less informative, so dropping
the sentence isn't a regression. `edge.ambiguity`'s runner-up disclosure paragraph is untouched
content-wise — restyled onto `--color-active` (token, not the current hardcoded
`text-amber-600 dark:text-amber-400`) since this line is being touched anyway and V6's own
conformance count (82 hardcoded colours) is exactly what that hardcoding contributes to.

**4. The AI pane's actual defect: `--color-accent` is amber everywhere it's used inside AI
surfaces, and needs to move to the `--color-ai` family V1 shipped but nothing consumes yet.**
Confirmed sites, all currently amber via the `--color-accent` → `--color-active` legacy alias
(`theme.css`): `ModeSwitches`' active-switch border/fill/text and its "Configure workspace" link;
`AIChatModule`'s status-line icons (`Cloud`/`ShieldCheck`) and send button; `AITurnView`'s
successful-attempt status text, the chart-recommendation label, and `QuotaExhaustedOffer`'s `Cpu`
icon + Download button. All move to `--color-ai`/`--color-ai-2`/`--color-ai-ink`. **Exception:**
`AttemptView`'s failure-state text stays `text-red-500` — a failed SQL attempt is an error, not an
AI-identity marker, and neither accent register is the right one for "this broke" (the turn's
top-level `.error` block already uses red and isn't touched).

**5. The mock's `.aimode` header chip is explicitly not ported.** It's a collapsed summary
("Cloud · BYOK") of exactly the state `ModeSwitches` already renders as a full, always-visible
control directly below the header. Adding a second, redundant mode readout would be new UI
surface, not a reskin — the same reasoning V3 used to skip the mock's single `.trow__more`
overflow trigger in favor of the two buttons that already exist. `AIPane`'s header keeps its
existing "AI" label and collapse/expand affordance; it only gains the mark glyph and the purple
tint (scope call 6), not a second control.

**6. `AIPane`'s header identity moves to the purple register — this is the one place "the
register" needs an actual visual anchor, not just incidental color reuse on internal content.**
Mock: `✦ Copilot` in `--c-ai-2` on a `--c-chrome`-backed strip, distinct from the panel body
behind it. Port: the header container becomes `--color-chrome` (a nested toolbar surface, same
pattern V2 already established for the tab strip sitting on chrome inside a canvas region), the
existing "AI" text gains a leading `✦` glyph, and both glyph + collapse/expand chevrons move to
`--color-ai-2`. The label stays "AI" (existing, real, shipped copy) — not renamed to "Copilot,"
since renaming is a copy change this leaf isn't chartered to make.

**7. Each assistant turn gains a `✦ Copilot` who-label — the concrete element "the purple copilot
register" actually names, not assumed.** Today `AITurnView` gives user turns a right-aligned
bubble and assistant turns nothing — no per-turn identity marker at all. The mock's
`.turn--ai .turn__who` is exactly this: a small mono `--c-ai-2` label per AI turn. This is a small
real addition (one span, no new data), justified because without it "the copilot register" has
nowhere on the turn itself to actually appear — every other change in this leaf is recoloring
elements that already exist; this is the one place the mock's structure has no existing analog.

**8. The user-turn bubble drops the amber wash entirely — a "no register belongs here," not a
"wrong register," correction.** Current: `bg-(--color-accent)/15`. Mock: `.turn--user .bubble`
uses `--c-elev` (neutral). A user's own question isn't AI-authored content, so neither the amber
HUD accent nor the purple copilot accent is the right read — it becomes a plain elevated surface,
matching every other neutral bubble/card in the system.

**9. `AttemptView`'s SQL-execution card gets the audit-trail container treatment (purple-tinted
border + `--color-ai-soft` background), but no new caption text is added.** The mock wraps its
whole per-turn attempt list in a bordered `.audit` block with a `✦ Audit trail` caption. Since
every attempt card here already sits directly under the new `✦ Copilot` who-label (scope call 7),
a second "this is the AI's audit trail" caption one line below would be redundant chrome the mock
needs (its turn has no who-label of its own) and this one doesn't. The container tint ports; the
caption doesn't. The embedded `<pre>` SQL block stays on neutral tokens — the mock's own
`.sqlbox pre` is neutral against the purple-tinted card around it, not purple itself.

**10. Out of scope, same file-boundary V3 already drew:** `AISettingsPanel` (a modal reached via
"Configure workspace," not part of the inspector or the AI pane's own chrome — untouched here,
V4/V5's sibling territory stays as V3 left it), the dataset map's SVG wire rendering (a different
tab face, never assigned a V-phase and not this leaf's job), and `TableScent`/`ColumnScent`
(the Inspector's non-edge scents — already rendering on `--color-ink`/`--color-ink-3`/
`--color-accent`-for-navigation, which is correct as-is: "Open profile →" is a HUD navigation
action, not AI content, so amber there is right and untouched).

## Spec

### `src/features/charts/relationships/EdgeEvidencePanel.tsx`

- Import `CONTAINMENT_SOLID`, `MIN_STRUCTURE_COVERAGE`, `KEY_UNIQUENESS_MIN` from
  `../../../lib/relationshipInference` (already exported — no new export surface). Add a local
  `pct(fraction: number): string` (`` `${Math.round(fraction * 100)}%` ``) — `formatPct` in that
  module is unexported and this is a one-line duplicate, not worth widening that module's API for.
- `ConfidenceBadge`: pill shape (`rounded-full`), always-visible border, mono
  `text-[length:var(--text-2xs)] uppercase tracking-[0.04em]`, plus a leading line-glyph span
  (`inline-block h-0 w-5 border-t-[1.5px]`, `border-solid` when confident / `border-dashed` when
  candidate). Confident: `border-(--color-active)/40 text-(--color-active)`. Candidate:
  `border-(--color-rule-hi) text-(--color-ink-2)`. Label text unchanged ("Confident"/"Candidate").
- New `EvidenceRow({ edge }: { edge: FkEdge })`: `flex flex-wrap gap-x-6 gap-y-1.5` container
  (mock's `.evidence`), four `.ev`-equivalent items (`flex items-center gap-1.5 font-mono
  text-[length:var(--text-xs)] text-(--color-ink-2)`), each an icon span (`✓` `text-(--color-ok)`
  or `⚠` `text-(--color-active)`) + label:
  - `edge.nameAgreement ? '✓' : '⚠'` — `` `Name ${edge.nameAgreement ? 'agrees' : 'differs'}` ``
  - `edge.containment >= CONTAINMENT_SOLID ? '✓' : '⚠'` — `` `Containment ${pct(edge.containment)}` ``
  - `edge.coverage >= MIN_STRUCTURE_COVERAGE ? '✓' : '⚠'` — `` `Coverage ${pct(edge.coverage)}` ``
  - `edge.parentKeyUniqueness >= KEY_UNIQUENESS_MIN ? '✓' : '⚠'` — `` `Parent key ${pct(edge.parentKeyUniqueness)} unique` ``
- Replaces the current `<p className="text-sm text-(--color-fg-muted)">{edge.evidence}</p>` line
  with `<EvidenceRow edge={edge} />`.
- `edge.ambiguity` paragraph: same content/logic, `text-amber-600 dark:text-amber-400` →
  `text-(--color-active)` (token, not the hardcoded Tailwind color — touched anyway, so fixed
  rather than left as one more V6 conformance count).
- Container/override-row/`AddRelationshipForm`: unchanged.

### `src/features/inspector/Inspector.tsx`

No changes — `EdgeScent` already renders `EdgeEvidencePanel` and needs no structural update;
`TableScent`/`ColumnScent` are unchanged per scope call 10.

### `src/features/ai/AIPane.tsx`

- Header container: add `bg-(--color-chrome)` (nested toolbar surface, was inheriting the panel
  background).
- Header label: `<span aria-hidden="true" className="text-(--color-ai-2)">✦</span>` before the
  existing `<span>AI</span>` text — text unchanged (scope call 6).
- Collapse chevron (`ChevronsRight`) and the collapsed strip's expand chevron
  (`ChevronsLeft`): `text-(--color-fg-muted) hover:text-(--color-fg)` →
  `text-(--color-ai-2) hover:text-(--color-ai)`.
- No change to collapsed/expanded behavior, width, or aria-labels.

### `src/features/ai/ModeSwitches.tsx`

- Active-switch classes: `border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)` →
  `border-(--color-ai) bg-(--color-ai)/10 text-(--color-ai-2)`. Inactive-switch classes unchanged.
- "Configure workspace" button: `text-(--color-accent)` → `text-(--color-ai-2)`.
- No change to switch labels, `aria-pressed` logic, or the disclosure paragraph's copy/condition.

### `src/features/ai/AIChatModule.tsx`

- Status-line icons (`Cloud`, `ShieldCheck`): `text-(--color-accent)` → `text-(--color-ai-2)`.
- Send button: `bg-(--color-accent) ... text-(--color-bg)` → `bg-(--color-ai) text-(--color-ai-ink)`.
- Composer input: add `focus:border-(--color-ai)/50` to the existing border (mock's
  `.composer__box:focus-within` tint) — the resting border stays neutral
  (`border-(--color-border)`), matching the mock's own neutral-at-rest treatment.
- No change to `askAI`/`resolveProvider` calls, status derivation, or copy.

### `src/features/ai/AITurnView.tsx`

- User-turn bubble: `bg-(--color-accent)/15` → `bg-(--color-elev)` (scope call 8) — border/radius
  unchanged.
- Assistant turns: new leading label
  `<div className="font-mono text-[length:var(--text-2xs)] uppercase tracking-[0.1em] text-(--color-ai-2)">✦ Copilot</div>`
  above the existing content stack (scope call 7).
- `AttemptView` card: `border-(--color-border)` → `border-(--color-ai)/20`, add
  `bg-(--color-ai-soft)`. Success status text: `text-(--color-accent)` → `text-(--color-ai-2)`.
  Failure status text stays `text-red-500` (scope call 4 exception). The `<pre>` SQL block's own
  `bg-(--color-border)/40` stays as-is (neutral against the now-tinted card around it).
- Chart-recommendation label: `text-(--color-accent)` → `text-(--color-ai-2)`.
- `QuotaExhaustedOffer`: `Cpu` icon `text-(--color-accent)` → `text-(--color-ai-2)`; Download
  button `bg-(--color-accent) ... text-(--color-bg)` → `bg-(--color-ai) text-(--color-ai-ink)`.
- `CorrectionNote`/`OllamaOverflowNote`: unchanged (informational, not identity-bearing).
- Top-level turn error block (`turn.error`): unchanged (red, an error state — same reasoning as
  `AttemptView`'s failure text).

## Files

Modified: `src/features/charts/relationships/EdgeEvidencePanel.tsx` (confidence pill, new
`EvidenceRow`, ambiguity token fix), `src/features/ai/AIPane.tsx` + `AIPane.test.tsx`, `src/
features/ai/ModeSwitches.tsx` + `ModeSwitches.test.tsx`, `src/features/ai/AIChatModule.tsx`
(no dedicated test file exists today — its rendered output is covered indirectly via
`AIPane.test.tsx`'s "Ask a question in plain English" assertion), `src/features/ai/
AITurnView.tsx` + `AITurnView.test.tsx`, `src/features/inspector/Inspector.test.tsx` (extended,
not the component itself).
Unchanged: `src/features/inspector/Inspector.tsx`, `src/features/ai/AISettingsPanel.tsx` (+
test), `src/features/ai/WebLLMDock.tsx` (+ test), `src/features/ai/aiStatusUtils.ts` (+ test),
`src/features/map/DatasetMap.tsx`, `src/stores/*`, `src/lib/relationshipInference.ts` (read-only
import of its existing exported constants), every options-strip/palette-body file — V5's
territory, same boundary V3 already drew for V4/V5.

## Dependencies

V1 (token layer + locked system) — shipped 2026-07-25, leaf doc landed the same day.

## Acceptance criteria

- [ ] `ConfidenceBadge` renders as a bordered pill with a solid (confident) or dashed (candidate)
      line glyph; only the confident state carries `--color-active` — no candidate-state amber,
      no confident-state purple (scope call 1)
- [ ] The edge inspector shows four evidence items — name agreement, containment, coverage,
      parent-key uniqueness — each with a percentage (where applicable) and a ✓/⚠ icon driven by
      the engine's real `CONTAINMENT_SOLID`/`MIN_STRUCTURE_COVERAGE`/`KEY_UNIQUENESS_MIN`
      thresholds; the old single prose `edge.evidence` sentence no longer renders on its own
      (scope calls 2–3)
- [ ] No hardcoded Tailwind color utility (`amber-*`, `red-*` excepted per scope call 4) remains
      in `EdgeEvidencePanel.tsx`
- [ ] Every `--color-accent` reference inside `ModeSwitches.tsx`, `AIChatModule.tsx`, and
      `AITurnView.tsx` is gone, replaced by the `--color-ai`/`--color-ai-2`/`--color-ai-ink`
      family — grep confirms zero remaining matches in those three files (scope call 4)
- [ ] `AttemptView`'s failure-state text is still `text-red-500` — not moved to either accent
      register (scope call 4 exception)
- [ ] `AIPane`'s header renders a `✦` mark in `--color-ai-2` before the existing "AI" text, on a
      `--color-chrome` strip; collapse/expand chevrons render in the `--color-ai` family (scope
      call 6)
- [ ] No `.aimode`-style mode-summary chip exists in `AIPane`'s header — `ModeSwitches` remains
      the sole mode readout (scope call 5)
- [ ] Every assistant turn in `AITurnView` renders a `✦ Copilot` label in `--color-ai-2` above its
      content; user-turn bubbles render on `--color-elev` with no amber wash (scope calls 7–8)
- [ ] `AttemptView`'s card renders on `--color-ai-soft` with a purple-tinted border; its embedded
      `<pre>` SQL block stays on neutral tokens; no new "Audit trail" caption text exists anywhere
      in the diff (scope call 9)
- [ ] No file under `features/explorer`, `features/status`, the options strip, the palette body,
      `features/ai/AISettingsPanel.tsx`, `features/ai/WebLLMDock.tsx`, or
      `features/map/DatasetMap.tsx` changed
- [ ] Every existing `ModeSwitches.test.tsx`, `AIPane.test.tsx`, and `AITurnView.test.tsx`
      assertion (all select by text/role/`aria-label`/`aria-pressed`, never by class) still
      passes unmodified
- [ ] `tsc -b` clean; full suite green (re-measure against the tree at implementation time — this
      leaf's baseline is 133 files / 1304 tests); `oxlint` clean apart from the pre-existing
      unrelated `_misc/spike-webllm/smoke.mjs` warning
- [ ] This folder's `README.md` per-phase-leaves list links this doc

**Not a criterion here, by design:** contrast measurement and live-browser verification remain
V6's, same as V1–V3.

## Test plan

- `Inspector.test.tsx`: extend the existing `'shows edge evidence + confidence + override
  controls (D24) for a selected edge'` case to assert the four new evidence items render for the
  fixture's `EDGE` (`nameAgreement: true`, `containment: 1`, `coverage: 1`,
  `parentKeyUniqueness: 1` → all four should assert their ✓ state / percentage text); the existing
  `getByText('Confident')` assertion is unaffected (label copy unchanged). Add one case with a
  candidate-tier, partial-evidence edge (e.g. `nameAgreement: false`, `containment: 0.6`) asserting
  at least one ⚠ item renders.
- `ModeSwitches.test.tsx`: existing cases select by text/`aria-pressed`, unaffected. Optionally add
  one case asserting the active switch's class list contains an `ai`-family token rather than
  `accent`, if feasible without over-coupling to implementation class strings — otherwise this is
  a visual-only check left to manual/V6 verification, same caveat V3's `StatusBar` posture-dot
  case used.
- `AIPane.test.tsx`: existing cases unaffected (all select by text/`aria-label`).
- `AITurnView.test.tsx`: add a case asserting an assistant turn renders "✦ Copilot"; add/update a
  case asserting the user-turn bubble no longer carries an accent-wash class (assert the expected
  `--color-elev` class token is present, or that the old `--color-accent` one is absent).

## Definition of done

The bottom inspector's edge scent renders the mock's confidence-pill and evidence-row voice using
the engine's own real D24 fields and thresholds — no fabricated data, no dropped information
relative to what the four decomposed facts already convey. The right AI pane's header, mode
switches, chat status/send affordances, and per-turn transcript (including the SQL audit card) all
render in the `--color-ai` family V1 shipped, correcting the amber-on-an-AI-surface defect the
`--color-accent` legacy alias was quietly producing everywhere in `features/ai`. No new AI
behavior, no new mode-summary control, no renamed copy, no caption text invented beyond what the
data already supports. `tsc -b`/suite/`oxlint` clean. Contrast and live-browser verification
remain V6's, by design.
