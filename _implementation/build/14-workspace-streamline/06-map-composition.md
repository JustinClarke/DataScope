# S6 — Map composition

**Tier:** v0.70 (the workspace streamline, D73 execution) · **Master spec:** §19 (the v0.70
subsection, S6 row), §13.3 (map composition; the ranked-action-routing table) · **Decision
row:** D73 · **Depends on:** S5 (query tabs + the registry amendment) — **met 2026-07-28**, same
day as this doc's own binding-constraint deviation (below); the view-more gap it unblocked is
closed as of this revision.

## Objective

Replace the map's retired options-strip real estate with three things: Suggested Explorations
(the dataset-wide top-3 ranked actions), Structural ‖ Behavioral finding columns (the existing
`InsightCandidate`s split by rule, independent heights), and the AI Dataset Synthesis card. All
three reuse existing engines — `rankNextActions` (D68a), the insight rules already computed for
`InsightFeed`, and the D56/ADR-010 synthesis seam `VerdictBand` already renders — so this phase
is composition, not new inference.

## Binding-constraint deviation (recorded, not excused)

S6's **code landed 2026-07-28 ahead of this leaf doc**, breaching §19's constraint (no `src/`
code for a phase before that phase's leaf doc) — same category as V1's token layer and W4's map.
It also started **out of dependency order**: the Phases table names S6 as depending on S5, which
remains unbuilt (S3 and S4 under it are unchecked). The session was a deliberate human call, not
an oversight: the AI-architecture ideation round
(`_implementation/_misc/_ideation/_experiments/`, nine candidate composition mechanisms as of
writing) hit a stall with no verdict, and folding in any of them half-decided was explicitly ruled
out; building S6's map-composition UI now, on a seam the eventual architecture plugs into, was
judged better than blocking on either the ideation verdict or S5's sequencing. This doc is written
*against what shipped* — its acceptance criteria are real checks re-run on the current tree, not a
transcription of the build session's own claims (same convention as V1's leaf doc and
BUILD-ORDER.md's Handoff rule 3).

**The dependency violation is not cosmetic — it left two of S6's own three deliverables
unbuildable**, both traced to S5 not existing yet (below). That is the argument for the order rule
this phase broke, recorded here rather than silently worked around.

## Scope calls

**1. Options strip left in place — "strip removed" is not done.** `OptionsStrip` still mounts in
`DatasetMap.tsx`'s multi-table face, unchanged. Removing it is S6's own clause, not S5's, but doing
so before its ranked-action-routing consumers (the palette, the quality panel's run action) exist
would strand the "legal but unranked / gated" row of the routing table with no home. Left standing
rather than deleted early.

**2. "View-more → a pre-run query tab" — built once S5 landed.** Suggested Explorations still
renders the top 3 `rankNextActions` results through the existing `services/navigation.ts` facade
(`isDestinationReady` / `openDestination`) — the same readiness gating `OptionsStrip` (W5)
already used, not a new mechanism. A "View N more →" affordance now appears whenever the ranker
returns more than 3 actions; each expanded row opens on click via S5's `openQueryTab({ sql,
name, autoRun: true })`, using `evidence.sql` — the `FactRef` already attached to every
insight-derived `RankedAction` (D45). A beyond-top-3 action with no query behind it
(`evidence.sql === ''`, a schema fact rather than an insight finding) renders disabled with a
tooltip, the same disabled-with-reason posture the top 3 already use, rather than opening an
empty tab.

**3. No new insight rule invented.** The reference mocks' "Format Match" regex card and
hour/day-of-week "Seasonal Seasonality" card have no backing computation anywhere in this
codebase (checked `lib/insights.ts`'s `InsightRuleId` union and every registered probe). Rather
than fabricate a finding to match the mock, `FindingsColumn` only ever renders real
`InsightCandidate`s, split by rule into `STRUCTURAL_RULES` (`null-pattern`, `id-exclusion`,
`concentration`) and `BEHAVIORAL_RULES` (`change-point`, `outlier-group`, `leakage`,
`duplicates`); an empty column reads "No findings yet.", never a mocked example. Same posture V3
took toward fabricated table-role data.

**4. The AI Dataset Synthesis card is visual pull-forward, not S7 logic pull-forward.** The
reference mocks draw this card as S6/S7 content (`README.md`'s reference-images table, images 02
and 03). S7 itself — the widened prompt reaching §4's "well-suited for churn / CLV" narrative —
stays gated on S0's verdict and is untouched. What shipped renders only the already-existing
`useDatasetBaseline` triple (`headlineFact` / `baseline` / `paused`) that `VerdictBand` renders
elsewhere: with AI off, unreachable, or paused, the card shows the honest deterministic Verdict
headline (live-verified against the `ecommerce` sample: "4 tables · 5,437 rows · no single
dominant finding"), never an invented narrative. `paused` is always surfaced, never hidden
(invariant 5 of the ideation README). No new AI code path was added.

**5. `RULE_LABEL` relocated, not duplicated.** `InsightFeed.tsx` owned a private `RULE_LABEL`
map; `SynthesisPanel.tsx` needs the same labels for its finding cards. A component-only-file
fast-refresh lint rule forced the shared constant out of `InsightFeed.tsx` into `lib/insights.ts`
rather than allowing a second copy — both surfaces now import one label set.

## Spec

### `src/features/map/SynthesisPanel.tsx` (new)

- `AiSynthesisCard` — the headline card described in scope call 4.
- `SuggestedExplorations` — `rankNextActions(tables, tableInsights ?? [])`, top 3 rendered as
  buttons gated by `isDestinationReady`; a disabled action shows a tooltip naming the module it
  arrives with (`MODULE_LABELS`), matching `OptionsStrip`'s existing not-yet-wired treatment.
  Anything past the top 3 sits behind a "View N more →" toggle; each expanded `MoreExplorationRow`
  opens a pre-run query tab via `openQueryTab({ sql: action.evidence.sql, name: action.verb,
  autoRun: true })` (S5), disabled with a tooltip when `evidence.sql` is empty.
- `collectByRules` + `FindingsColumn` — filters `TableInsights[]` by rule set, sorts by
  `scoreOf`, caps at 5 (`FINDINGS_CAP`), renders two independent-height columns
  (`structural-patterns`, `behavioral-trends`).
- Exported `SynthesisPanel` composes all three under one `data-testid="synthesis-panel"` root.

### `src/features/map/DatasetMap.tsx`

`MultiTableMap`'s outer flex column moved from `overflow-hidden` to `overflow-y-auto` so content
below the ERD can scroll the page rather than being clipped; `Erd` is now wrapped in a
`min-h-[440px] flex-1` div so it keeps its existing size inside the now-scrolling column;
`SynthesisPanel` mounts immediately below that wrapper, after `VerdictBand` and before the
selected-table side panel.

### `src/lib/insights.ts` / `src/features/profiling/InsightFeed.tsx`

`RULE_LABEL` moved from the latter to the former (scope call 5); both files import it from
`lib/insights.ts` now.

## Files

Added: `src/features/map/SynthesisPanel.tsx`, `src/features/map/SynthesisPanel.test.tsx` (11
tests, 3 added this revision for view-more).
Modified: `src/features/map/DatasetMap.tsx`, `src/features/profiling/InsightFeed.tsx`,
`src/lib/insights.ts`.

## Dependencies

v0.69 (tokens/chrome) — met, this phase styles entirely on existing `--color-*` tokens, no new
ones. **S5 (query tabs + registry amendment) — met 2026-07-28**, closing scope call 2. Scope
call 1 (options strip removal) stays open — it needs the palette's "legal-but-unranked" home to
exist first (§13.3's routing table), which is separate, unstarted work.

## Acceptance criteria

Checked against README's S6 deliverable line (`Phases` table) and this session's re-run of the
suite:

- [ ] Options strip removed from the multi-table map — **not done**, see scope call 1
- [x] Suggested Explorations renders the dataset-wide top-3 `rankNextActions`, gated through the
      existing nav-facade readiness check
- [x] "View-more" → a pre-run query tab — beyond-top-3 actions open via S5's `openQueryTab`,
      disabled with a reason when the action carries no query
- [x] Structural ‖ Behavioral finding columns at independent heights, real `InsightCandidate`s
      only, no fabricated finding
- [x] AI Dataset Synthesis card present, degrades honestly to the deterministic Verdict headline
      with AI off/paused/unreached, `paused` always surfaced
- [x] `tsc -b` clean; suite green (1 unrelated pre-existing flake in
      `CategoricalModule.test.tsx`, passes in isolation, untouched by this revision); `oxlint`
      clean on the changed files
- [x] Live-verified in a real browser (Playwright) against the multi-table `ecommerce` sample,
      zero console errors — carried from the 2026-07-28 build session, not independently re-run
      by this doc

## Definition of done — not met

Three of the three deliverables in README's S6 row now have real substance, but one clause of
the first — **options strip removal** — stays undone: it needs the palette to grow a
"legal-but-unranked" ranked-actions section (§13.3's fourth routing home) before the strip's
remaining consumers have somewhere to land, and that palette work is unstarted (a deliberate
scope call, not a blocker discovered late). Per Update rule 1 (no partial checks), **S6's box in
BUILD-ORDER.md stays unchecked.** This doc formalizes what shipped; it does not change the
checklist state or move `▶`, which stays at S0.

**Next concrete action:** add a legal-but-unranked ranked-actions section to `CommandPalette.tsx`
(disabled-with-reason copy, same posture as its existing not-yet-wired entries), which closes
scope call 1 and lets the options strip be deleted. Separately, the ideation round under
`_implementation/_misc/_ideation/_experiments/` still owes a verdict before S7 can start
regardless of S0. Neither blocks S1–S4, which is where build work continues.
