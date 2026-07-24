# Workbench fold — design-review findings

**Reviewer:** design-reviewer (Opus). **Inputs:** SPEC, PLAN, LIFECYCLES, FOLD-SCOPE + the
in-scope master anchors and the full Decision Record. **Posture:** adversarial; clean bills
noted where an area checked out.

## Verdict (3–5 lines)

The design *intent* is sound and the re-homing is genuinely capability-complete — nothing is
made unreachable (the palette catches all). But the fold as scoped is **not safe to apply
verbatim**: two Critical items would make master internally contradictory or quietly widen a
security boundary, and four High items land privacy/consent inconsistencies into §5.1/D2 and
regress the launch centerpiece in the very "map-forward opening" the fold calls clean.
Must-fix before synthesis: **C1 (don't wholesale-replace §13 while the current shell still
ships), C2 (write the model-output invariant into the tab-spec generalization), H1+H2 (fix the
two-option↔three-mode partition and bind edge synthesis to allow-cloud), H4 (give the
multi-table map a home for the Verdict headline).** Platform-facts note: the fold introduces
no new edge/server surface, so no Cloudflare limit/pricing number is load-bearing here —
nothing to verify against docs.

---

## CRITICAL

### C1 — In-place §13 rewrite deletes the shipping UI's spec before §9.1 is decided
**Issue.** Part A recommends rewriting §13 in place → "The Workbench," *replacing* the
flat-sidebar mock and the Sidebar-module-states table. But §9.1 (which surface ships Oct 6)
is deferred "by construction" to the W8 flag flip, and Part F binds the fold to record *both*
surfaces as launch-capable. You cannot both keep the current shell launch-capable-and-
documented and replace its §13 documentation with the Workbench. Part A and Part F contradict.
**Failure scenario.** Synthesizer applies the in-place rewrite. §9.1 later lands as "Workbench
is a post-launch tier." Now master §13 describes a flag-*off* UI that isn't shipping, while the
UI actually served on Oct 6 (flat sidebar + Dossier landing) has been deleted from the master
spec. In a workspace where "master is settled law," the launched product has no spec of record,
and every leaf that cites §13 now cites a UI users don't see. This also *forecloses* the
human's biggest call — the opposite of "deferred by construction."
**Doc change.** Master §13: do **not** wholesale-replace. Restructure as §13.0 "Current shell
(flag-off; ships until the W8 cutover)" retaining the existing mock/table (may be by reference),
plus §13.1+ "The Workbench (behind `WORKBENCH_ENABLED`)" for the new grammar. The wholesale
deletion of §13.0 happens *at* W8 (mirrored master-first when the old shell is deleted in code),
not now. Update FOLD-SCOPE Part A's "shape question" resolution accordingly. Split-tree: this
governs `build/12-workbench/`, `architecture/system-design.md`, `architecture/app-flow.md`.

### C2 — Tab-spec generalization of D55 lacks the invariant carving model output from the tab envelope
**Issue.** SPEC §4 / Part A §13.x / Part B-D55 all say "a tab is a spec, generalizing the D55
ViewSpec discipline to the whole canvas." D55's security property is *not* "specs are
serializable" — it is "the renderer selects componentIds from a **fixed, closed registry**,
validates typed props, and **never executes model output**." Serializability is orthogonal: a
serializable tab-spec can still name an arbitrary tab type or carry an arbitrary initializer.
The generalization widens the artifact under discussion from "panels inside one Dossier tab" to
"the whole canvas tab list," and the master edit as scoped carries only a *pointer* ("must not
weaken… see viewspec-guard"), not the concrete invariant.
**Failure scenario.** An implementer builds `openTab(spec)` / the nav facade `openDestination`
to accept a spec, and the AI artifact-tab path ("the AI opens a tab and drops its output there")
routes model output into `openTab` without the validation gate — because the master text made
"a tab is a spec" sound like the whole envelope is one trusted contract. Model output now
influences tab *type*, *identity*, *initializer*, or *active-tab selection*, not just validated
ChartSpec/ViewSpec content. Result: arbitrary model-driven UI — the exact D55/D58 regression the
task singled out as highest-risk.
**Doc change.** Master §13.x (new tab-model prose) must state the invariant explicitly: **(a)**
the tab *envelope* (type from a fixed tab-type registry, identity, active-tab selection,
initializer) is authored only by the app, never by a model; **(b)** the only model-producible
content is the *inner* artifact spec (ChartSpec via the translator, ViewSpec via the D55
renderer), which passes `producerValidators` (`types/producers`) *before* any tab is opened;
**(c)** `stores/tabs.openTab` treats any model-originated payload as untrusted input requiring
validation, mirroring D55's closed-registry rule. Part B-D55 should elevate this from a pointer
to required master text. Split-tree: `architecture/system-design.md` (tab-spec seam + nav
facade), `build/03-profiling/05-dataset-dossier.md` (ViewSpec→tab-spec). This is the top must-fix.

---

## HIGH

### H1 — The two-option gate maps ambiguously onto D2's three modes; WebLLM is double-homed
**Issue.** LIFECYCLES §4: option **keep-on-device** = "AI is off, or later runs only as
in-browser WebLLM"; option **allow-cloud** unfolds "the existing three-mode consent inline
(local / cloud-BYOK / off)." WebLLM (a zero-egress local model) therefore appears in *both*
branches, and "off" appears in both. Nesting a zero-egress local model under a posture literally
labelled "allow cloud" is a category error, and D2's whole value is unambiguous mode clarity
("no silent default").
**Failure scenario.** A privacy-conscious user who wants zero-egress WebLLM must choose
"allow cloud" to reach it (the three-mode consent is nested there) — directly contradicting the
posture's meaning and the pitch. Meanwhile master §5.1 gets amended with WebLLM double-homed,
so the mode a user actually lands in is underdetermined by their posture choice. The reframed
gate becomes *less* clear than today's chooser — a D2-substance regression, not just a retiming.
**Doc change.** Re-partition, don't nest: keep-on-device = {AI off, in-browser WebLLM
(zero-egress)}; allow-cloud = {Workers-AI, BYOK/Ollama-endpoint} with the D2 disclosure. The
"three-mode consent unchanged, nested under allow-cloud" framing must be dropped from LIFECYCLES
§4 and from the §5.1/D2 amendment. Master §5.1 + D2 amendment (Part B-D2); split-tree
`build/06-ai/02-modes-byok.md`, `build/06-ai/03-privacy-disclosure.md`,
`foundations/privacy-model.md`.

### H2 — Edge-warm synthesis (D56/D70) is re-homed onto the map face but not bound to allow-cloud
**Issue.** SPEC §6.2 re-homes "Synthesis upgrade badge (D56, edge-warm → WebLLM)" onto the map
face. The map is the **default open tab shown to every post-ingest user, including
keep-on-device**. D70 requires edge synthesis to be opt-in, structure-only, and "local-only mode
never calls the edge" — but the Act 2 default is *keep-on-device*, which is **not** the same as
D2 "local-only": keep-on-device explicitly permits WebLLM and is the privacy default. The fold
never states that the map's async synthesis-upgrade must be gated by the allow-cloud posture.
**Failure scenario.** A keep-on-device session opens the map; the synthesis-upgrade path fires an
edge call and sends pruned DSPS structural facts (column names — re-identifiable per D45/D46) to
a Cloudflare Worker without an allow-cloud choice. That breaches D2/D59 and the beachhead-defining
"nothing leaves your browser without an explicit labeled action." Even at v0.25/post-launch
scope, this is the sacred property.
**Doc change.** In the §13.x map spec (and reconciling D56/D70), state: the map renders the
deterministic Verdict for all postures; the edge-warm/D56 synthesis upgrade is **only** attempted
under the allow-cloud posture, degrading to the deterministic paint otherwise. Add the explicit
mapping keep-on-device ⇒ no edge call. Master §13.1/§13.x + D56 consistency touch (see M8);
split-tree `build/v0.25/*`, `build/06-ai/03-privacy-disclosure.md`, `foundations/privacy-model.md`.

### H3 — The D2 amendment must be shell-conditional, or it forecloses §9.1 and mis-describes the launch consent flow
**Issue.** The D2 amendment (app-open chooser → Act 2 gate) lands master-first *before* W6/W8.
During the flag-parallel period the current shell (which must stay shippable) still uses the
app-open `AIModeChooser`. If §5.1/D2 is rewritten to describe only the Act 2 gate, master no
longer matches the consent flow of the surface that may actually ship Oct 6.
**Failure scenario.** §9.1 resolves as "current shell ships Oct 6." The launched product asks
for AI consent at app-open; master §5.1/D2 says consent happens at a post-upload gate that only
the unshipped Workbench has. Leaf docs and the privacy page now describe a consent placement the
product doesn't implement — a compliance-adjacent doc defect for the exact regulated audience.
**Doc change.** Write the D2 amendment as placement-is-shell-dependent for the parallel period:
app-open chooser (current shell) / Act 2 data-handling gate (Workbench), with the invariant
(no silent default; explicit consent before the first AI call) stated once as shell-independent.
Same targets as H1. (Companion to C1 — the D2-specific instance of the same foreclosure.)

### H4 — The multi-table map opening has no home for the D68c Verdict headline / folder-level synthesis
**Issue.** SPEC §2 Act 4: single-table → Blueprint face (keeps the Verdict/identity band);
multi-table → the ERD, with "the Verdict's ranked actions order the options strip" and the
Blueprint reappearing only as the *selected-table side panel*. So on a fresh multi-table open
(nothing selected), the D68c tier-1 Verdict decomposes to: ranked actions → strip, but the
**one headline `FactRef`** and the identity/"what the dataset is" briefing line have no assigned
home. The Verdict headline is the single most load-bearing element for the D48/D52 inherited-data
launch audience ("the executive briefing the D52 user opens on").
**Failure scenario.** A consultant drops a 4-table warehouse folder. The Workbench opens on an
ERD answering "how do tables relate?" but not "here's the one thing you should know / can I trust
this?" (the D68c confidence-floor headline, quality-risk-wins tie-break). The launch centerpiece
regresses in precisely the map-forward opening the fold's D70 reconciliation calls equivalent to
the Blueprint-forward opening. This also hits **viewer mode of a multi-table `.dsps`** (PQ4): the
folder-level synthesis/top-insights the modal Dossier showed loses its home.
**Doc change.** §13.x map spec must place a persistent Verdict band (identity + headline FactRef,
D68c tier-1 discipline, confidence floor intact) on the multi-table map tab header — not only in
the per-table side panel. State that the ERD is the *hero region*, not the whole tier-1 surface.
Master §13.1/§13.x; split-tree `build/03-profiling/05-dataset-dossier.md`.

---

## MEDIUM

### M1 — "Broker orders the strip, no engine change" understates the per-selection scoping
`rankNextActions(tables, insights)` ranks/prunes **dataset-wide** (D68a, kills the
profile-again dead loop). The strip "acts on the selection" (LIFECYCLES rule 1) and is
"capability-gated exactly as the sidebar cards" — i.e. membership = the *selected table's* legal
ops, order = broker interestingness. These are two inputs the current single call doesn't
separate, and "strip = all-legal for the selection" conflicts with "broker prunes to top-N."
**Failure scenario.** W5's DoD ("strip order matches broker output") is ill-defined: broker
output is dataset-wide and pruned; strip needs per-subject legality. Built naively, the strip
either shows dataset-wide actions irrelevant to the selection, or drops legal actions (Profile
on a "boring" table) the broker pruned — silently sending them to palette-only.
**Doc change.** §9 "Note" (Part A) must specify: strip membership = capability-gate resolved
against the current selection's subject; strip order = broker ranking applied to that legal set;
and whether a subject-scoped broker call or a client-side filter of `RankedAction[]` (via
`ThreadConfig` subject) is the mechanism. Not "no engine change" if a subject param is needed.
Master §9 + §13.x; split-tree `build/03-profiling/03-capability-engine.md`, `system-design.md`.

### M2 — Capability-gated strip actions: absent vs. disabled-with-reason is unspecified
Today a greyed sidebar card teaches ("Needs a date column," "Needs 2+ numeric columns") —
core scaffolding for the J1/D57 orientation-tax audience. LIFECYCLES rule 1 says an action with
no valid subject is "gated off the strip (still in palette)," and SPEC wants the strip "small,
ranked, curated." "Off the strip" could mean *absent*.
**Failure scenario.** The strip hides illegal actions to stay small; a first-timer never learns
why time-series isn't offered — the option simply isn't there, and the reason isn't in the
palette either. The redesign's headline goal (reduce overwhelm for non-experts) silently removes
the feature that currently orients them.
**Doc change.** §13.x options-strip prose must decide: gated actions render disabled-with-reason
(preserving today's copy) *or* the reason surfaces in the palette entry. Resolve the tension with
"small/curated" explicitly (e.g. legal-but-uninteresting are collapsed under a "more" affordance;
illegal-but-relevant show a reason). Master §13.x; split-tree `build/12-workbench/`.

### M3 — The ERD map invites cardinality notation D24 forbids
Master §13.1 carries a connector-source guardrail: any ERD/column-level rendering must source
lines from `relationshipInference.ts` (solid/dashed tier, evidence, override state), **never
from a name/presence matcher, and never asserting a cardinality (e.g. "1:M") the engine did not
compute.** The map is an ERD with "field-row edge anchors" and "edge labels" (SPEC §2/§10) —
exactly where the ERD idiom (crow's-foot 1:M) invites the forbidden claim.
**Failure scenario.** The hallmark map port adds conventional cardinality crow's-feet; the D24
engine computed containment/name-agreement but not confirmed cardinality. The map now shows a
confidently-wrong "1:M" — the D17/D24 trust-landmine, on the launch centerpiece.
**Doc change.** §13.x map spec must restate the master §13.1 connector-source guardrail verbatim
for the ERD (solid/dashed only, evidence-backed, no invented cardinality unless engine-computed).
Part B should note D24 is engine-untouched **but** its rendering guardrail transfers to the map.
Split-tree `build/05-charting/05-join-graph-beta.md`, `build/12-workbench/`.

### M4 — `.dsps` is JSON; the unified whole-window drop can mis-ingest it as a dataset
SPEC §6.1 makes the whole window a drop target routing to ingestion; the app ingests JSON/JSONL
as data (Phase 2). A `.dsps` is JSON. The D62 receiver (→ viewer mode) and the ingestion path
now share drop surfaces.
**Failure scenario.** A recipient drops `report.dsps`; the ingestion path claims it (or
format-policy rejects it as an unknown/odd JSON), and viewer mode never opens — the D62
reflex-loop payoff ("every .dsps in an inbox becomes a live landing page") silently breaks.
**Doc change.** §12.3/§13.x viewer-mode prose must state the drop router sniffs `dsps_version`
and branches `.dsps` → viewer mode **before** the ingestion/JSON path, at *every* drop surface
(Act 0 welcome, whole-window, explorer Add data). Split-tree `build/08-persistence/03-dsps-spec.md`,
`build/12-workbench/`.

### M5 — Viewer-mode re-home drops D62's internal cut line
D62's "degrade to rendering the §12.2 HTML report output" is what guaranteed the receiver could
"never move the launch date." Folding the receiver into "the same shell (map-forward)" makes it
heavier than a modal HTML render, and Part A/Part B-D62 don't restate the cut line.
**Failure scenario.** Viewer mode is scoped as full-shell-only; if it slips, there's no recorded
degrade target, and a date-protecting cut line silently disappears.
**Doc change.** Preserve D62's internal cut line in the viewer-mode re-home: viewer degrades to
the single-table Blueprint face / static §12.2 HTML report. Master §12.3 + D62 detail; split-tree
`build/08-persistence/03-dsps-spec.md`.

### M6 — "The shell is a pure function of session state" is overstated (PLAN §7)
True for the deterministic pane-assembly skeleton (which panes exist given datasets/posture). Not
true for: the async D56/D70 synthesis upgrade (imperative fire-await-update by construction), the
WebLLM warm-up (resumable shard download, 30-attempt ceiling per ADR-007), Monaco-bearing SQL tabs
(imperative editor state), and async `.dsps`/`?share=` loads before assembly.
**Failure scenario.** W1/W7 tests are written to assert pure-function assembly for panes that are
inherently async/imperative; either the tests are weakened quietly or the AI-upgrade/WebLLM paths
are shoehorned into a purity that doesn't fit, and the "testability is load-bearing" claim erodes.
**Doc change.** Scope the claim in PLAN §7 / the §13.x prose: "the deterministic shell *skeleton*
is a pure function of session state; async producers (D56/D70) and long-running engine state
(WebLLM) layer on as state updates." Don't fold the unscoped absolute into master. Split-tree
`architecture/app-flow.md`, `architecture/system-design.md`.

### M7 — Over-engineering: restore-from-spec-as-norm + full tab-list round-trip serves a post-v0.5 consumer
The only consumer of *full tab-list* serialization is the hosted tier (D61, post-v0.5, behind its
own D39/D61 design round). Viewer mode and share serialize the `.dsps` (structure), not tabs.
Making restore-from-spec the W3 norm with a mandatory "serialized tab list round-trips to an
identical canvas" gate builds serialization infra for a feature that doesn't exist yet — against
CLAUDE.md Part I §2 (no speculative flexibility) and D18 (spike-first). It also collides with
Monaco/large-grid reality (undo history, cursor, expensive re-query) that pushes the *common*
tabs to keep-mounted, quietly reintroducing the memory ceiling PLAN §5 claims to dissolve.
**Failure scenario.** W3 spends effort on round-trip specs for SQL/pivot/chart tabs whose fidelity
demands keep-mounted anyway; the "memory ceiling is a non-policy" claim is folded into master and
is false the moment the heavy tabs are keep-mounted.
**Doc change.** For the fold, make **keep-mounted the v0 norm** (simplest satisfaction of
"switching tabs must not reset"), restore-from-spec the opt-in where cheap, and **explicitly defer
full-tab-list serialization to the D61 hosted-tier round.** Don't fold "memory ceiling is a
non-policy" as settled. (Decision-level: this touches the ratified §9.4 stance — see below.)
Split-tree `architecture/system-design.md`, `build/12-workbench/`.

### M8 — Part B mis-scopes D56 as "untouched"
D56's render surface (the Dataset Dossier) is re-homed to the map face, its synthesis-upgrade
badge is re-homed (SPEC §6.2), and its output artifact (ViewSpec) is generalized into the
tab-spec contract. That is at least a Consistency touch, not "untouched." It is also where H2's
edge-leak risk lives.
**Doc change.** Add D56 to Part B as **Consistency** ("names the map face as the home of the
async synthesis upgrade; edge-warm gated by allow-cloud per H2"). Mirror into `build/v0.25/`.

### M9 — "Skip to data" retirement leaves two dangling master references
Retiring D68d's skip-to-data (LIFECYCLES §5) collides with **two** live master references the
fold inventory doesn't both list: master §13.2 "sticky skip to data," **and** the §13.1 D70
blockquote (line ~965) "the D68d 'skip to data' escape hatch stays for the §2 second audience."
D70 (v0.25) as a live post-launch tier still depends on D68d's nav + escape hatch.
**Failure scenario.** Synthesizer edits §13.2 but misses the §13.1 D70 blockquote; master now
says the escape hatch both is retired (§13.2) and stays (§13.1/D70). The v0.25 tier's design
references a superseded nav structure.
**Doc change.** Part A §13.1 row must add: reconcile the D70 blockquote's skip-to-data line with
the retirement (structural explorer click-through + optional settings preference). Part B-D70
Consistency must cover the escape-hatch reference, not only the "map = Blueprint opening" line.
Split-tree `build/v0.25/01-blueprint-opening.md`, `build/03-profiling/05-dataset-dossier.md`,
`build/03-profiling/03-capability-engine.md`.

### M10 — The palette is load-bearing for reachability but scoped as one iteration brief
Because the strip is map-only (decided), the palette is the *only* cross-tab way to launch
strip-homed analyses (SQL/Pivot/Correlation/Charts) when the user is not on the map tab. It is a
genuinely new surface with no code ancestor.
**Failure scenario.** The palette is treated as polish/iteration and under-built or its action
taxonomy is incomplete; off the map tab, primary actions become effectively unreachable and
"curation never imprisons" fails.
**Doc change.** §13.x must mark the command palette as Workbench-launch-blocking (not optional
polish), with PLAN W5's "palette reaches every §6 feature home" as a hard gate. Split-tree
`build/12-workbench/`.

---

## LOW

- **L1 — "Learn"/help has no Workbench home.** §13.2 sends Learn to a "header help icon," but the
  Workbench refuses a header/menu (SPEC §3). Re-home explicitly to palette + welcome copy.
  (`build/12-workbench/`.)
- **L2 — Viewer-mode inspector must be read-only on edges.** SPEC §3 inspector offers FK
  "overrides"; viewer mode is read-only over someone else's structure — the edge panel must show
  evidence only, no override write. (`build/08-persistence/03-dsps-spec.md`.)
- **L3 — Viewer mode must preserve D45 provenance chrome.** Not just the D63 trust slot — the
  identity band's "computed as of {snapshot + hash}," provenance tags, and banned-permanence
  wording must render in viewer mode. Part B-D45 "untouched" is correct only if this is stated.
  (`foundations/privacy-model.md`, `build/08-persistence/03-dsps-spec.md`.)
- **L4 — EducationalPanel-in-inspector vs. the "scent, not dashboard" line.** §9.5 puts
  explanations in the inspector, but SPEC §3 draws a hard "inspector is scent" line. Specify
  EducationalPanel renders scent-level, with click-through, not a pedagogical surface.
- **L5 — Status-bar density (W7).** It absorbs WebLLM dock+flyout, AI-mode, kill-switch states,
  theme toggle, gear→settings, ingestion progress, query stats — a lot for one bar in a redesign
  whose thesis is "too much on screen." Give it an explicit density budget; the WebLLM flyout is
  the pattern for other heavy items.
- **L6 — §16 additive-claim inaccuracies.** Master §16 (line ~1122) *already* lists `stores/…
  tabs`; reconcile so the synthesizer doesn't double-add `stores/tabs.ts`. And `features/map/`
  absorbs `JoinGraphModule` + `DossierModule` from `features/charts`/`profiling` — a move, not
  purely additive; Part A "Edit (additive)" is slightly off.
- **L7 — Re-ask-every-upload requires per-upload gate state.** Fine, but it is event-driven
  (ingest completion sets a "gate pending" flag), not derivable from "what datasets exist." Note
  it as explicit state so the pure-function claim (M6) survives.

---

## Decision-level concerns (flagged, not silently edited around)

These touch items FOLD-SCOPE Part D marks DECIDED; raising rather than contradicting.

- **§9.4 restore-from-spec ratification (see M7).** The decision imports speculative
  serialization work justified mainly by the post-v0.5 hosted tier, and its "memory ceiling is a
  non-policy" corollary is likely false once Monaco/large-grid tabs are keep-mounted for fidelity.
  Recommend the *master text* stay minimal: keep-mounted-first, serialization deferred to D61 —
  which honors the decision's spirit (state survives tab-switch) without over-committing master.
- **Strip is map-only (§7.4) + the D68c Verdict headline (H4).** The map-only decision is fine,
  but it is what leaves the multi-table Verdict headline homeless and makes the palette
  load-bearing (M10). Not asking to reopen the decision — flagging the two consequences that must
  be spec'd around it.

---

## Clean bills (checked, sound — spend no synthesis effort here)

- **Nav supersession reachability (PQ2).** No original destination is made strictly unreachable;
  every one has a named home and the palette is the universal fallback. The real gaps are H4
  (Verdict home), M1 (broker scoping) and M2 (gate messaging) — *quality* of homes, not *lost*
  homes.
- **Viewer-mode subtraction (PQ4).** Strictly additive/read-only relative to the modal, except
  the folder-level synthesis home (H4), the cut line (M5), drop routing (M4), and read-only edge
  (L2) — all fixable without capability loss.
- **Part B untouched-set:** D37, D45 (with L3), D49, D58 are correctly untouched. D58's
  no-parallel-pipelines principle is the correct governing constraint for the tab model and is
  satisfied *provided* C2's invariant is written in. Corrections: **D24** is engine-untouched but
  its rendering guardrail transfers (M3); **D56** is not untouched (M8).
- **Nav facade + flag-gated parallel shell (PLAN §1–2).** Minimal, confined to the composition
  root + facade, matches the strategy — not over-engineered. The over-engineering is in the tab
  serialization contract (M7), not the migration seam.
- **§9.1 non-foreclosure.** The flag strategy defers the *code* decision correctly; the only
  things that foreclose §9.1 are the *doc* moves C1 and H3 — fix those and optionality is intact.
- **No new platform surface.** Confirmed the fold adds no edge/server surface (SPEC §6.6, Part B);
  no Cloudflare limit/pricing number is load-bearing, nothing to verify.
