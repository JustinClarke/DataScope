# Focused review — AI-gate v2 (switch model) + full-data-to-cloud opt-in

**Reviewer:** design-reviewer (Opus). **Scope:** ONLY Change A (flat mode switches; forced
gate demoted to on-demand "Configure workspace"; AI off-by-default with auto-WebLLM on capable
devices) and Change B (full-data-to-cloud upload opt-in amending D59) + their consistency
ripple. The prior full review (`UI-REDESIGN-REVIEW-FINDINGS.md`) stands; not re-reviewed.

**Master text verified** (not paraphrases): D2 (`:64`), D37 (`:99`), D45 (`:107`), D46 (`:108`),
D56 (`:118`), D58 (`:120`), D59 (`:121`), D70 (`:132`), §4 non-goals (`:292–305`), §5.0/5.1/5.2
privacy prose (`:309–333`), §11.3 (`:854–856`). Platform fact verified below (Cloudflare Workers
AI custody).

**Verdict (4 lines).** The switch model is a net improvement on consent clarity and genuinely
retires H1 — but as written it opens **two Critical leak paths** that the old "re-ask every
upload" forced gate used to close, and **Change B is not safe to fold as a v0 switch**: "send all
data to cloud AI" is architecturally under-defined and, taken literally, either collapses into
§11.3 (a bigger sample) or into D39/D61 (server-side execution — already design-round-gated).
Recommend: fold Change A with the pins below; **carve Change B into its own privacy design round**
(record the D-number + constraints, defer the build), exactly as D39 was gated.

---

## CRITICAL

### C1 — Change B: full-data-to-cloud as a v0 switch breaks the beachhead and is under-defined
**Issue.** Change B adds a switch (beside `Cloudflare`, in Configure-workspace) that sends **all
rows** to cloud AI, amending the single most sacred property. Two independent problems:

1. **It is architecturally under-defined.** LLM inference does not ingest arbitrary full datasets
   — a Workers AI call has a bounded context window; "all rows" of even a 10k-row table exceeds
   it, and the in-browser ceiling is 300 MB (§7.3). So "send all their data to cloud AI" has only
   two coherent meanings: **(a)** a *larger sample* than §11.3's current 3-row data-sampled repair
   — in which case it is an extension of §11.3 with a size cap, not a new capability; or **(b)**
   *server-side execution over the full dataset* — which **is D39 hosted staging / the D61 second
   platform rung**, and D39 already says server-side execution "is new surface and requires a
   dedicated design round before build (v1+, explicitly not v0/v0.5)." Either way, a novel
   unbounded v0 switch is the wrong shape.
2. **It trivializes the property D59 protects.** D59's strategic stake, verbatim: "the
   regulated/GCC beachhead (D23, §24.4) is a market only while 'we cannot see your data' is true
   by construction." §5.2 already treats even *sharing rows* to R2 as "a separate, explicitly
   labeled escalation," and D39's full-data staging is opt-in + design-round-gated + high-ceremony.
   Change B puts the same boundary-crossing behind a **casual toggle next to a "use free tier"
   switch** — an order of magnitude less ceremony than every comparable path in the spec.

**Failure scenario.** A GCC compliance analyst (the D23/§24.4 beachhead persona) drops a customer
export, flips `Cloudflare`, sees a "send all data?" toggle beside the free-tier toggle, and flips
it to get better answers. Full rows — including a free-text column holding national-ID numbers
(no D46 detector exists in v0; it is v0.5, positives-only, share-flow-only) — stream to Workers
AI. Nothing was *stored* by DataScope (D9 pass-through) so D59's letter isn't broken, but the
product's core claim "we cannot see your data is true by construction" is now false for this
session, at the moment of maximum exposure, with zero PII warning. The beachhead is sold on a
promise the switch quietly voids.

**Proposed doc change.** Do **not** fold Change B as a v0 fold-mechanical. Give it a **new
D-number (D72 — D71 is reserved for the Workbench adoption per FOLD-SCOPE Part B) that records the
intent and constraints but gates the BUILD behind its own privacy design round**, mirroring D39.
The D72 row (master Decision Record) and a §5.2 disclosure bullet MUST pin, as hard preconditions
of ever building it:
- **Decompose the two meanings.** State explicitly that "full data to cloud" is *either* a
  size-capped sample escalation of §11.3 (bounded, e.g. N rows / M bytes, refuse-with-guidance
  above) *or* the D39/D61 server-side-execution path — and route each to its existing owner rather
  than inventing a third pipeline (D58 no-parallel-pipelines).
- **Default-off, per-session, non-sticky** — inherit D59's closing rule ("labeled, per-artifact,
  off by default") and D39's opt-in-only/never-a-silent-fallback rule.
- **Transmit-only carve:** full rows go to the provider for the live turn ONLY — **never persisted
  to R2, never written into a `.dsps`, never part of a share** (protects D20 structure-only share
  default, D45 DSPS structural/quality-only).
- **Kill-switch coverage:** the `Off` switch (D2 mode (a), the global AI kill-switch) must abort
  any in-flight full-data turn and disable the toggle.
- **Custody-differentiated labeling (D21):** the label must distinguish route — Cloudflare Workers
  AI (verified: does not train on / does not store inputs absent an attached storage service — see
  platform note) vs. **BYOK, where rows go to the user's own provider under that provider's terms,
  which DataScope cannot control**. The absolute marketing claim "we cannot see your data" (§24.4)
  must soften to "…unless you explicitly send it," or Change B contradicts it.
- **PII exposure:** because rows carry re-identifiable values (D45/D46), a v0 full-data path with
  no sensitive-column warning ships the exact "false-clean on a free-text SSN column" trust-mine
  D46 was written to prevent — so the D46 detector is a prerequisite, which is itself v0.5. Another
  reason this is not a v0 item.
**Leaves:** `build/06-ai/03-privacy-disclosure.md`, `foundations/privacy-model.md`,
`foundations/security-model.md`, `product/roadmap.md`; §24 marketing copy. **See also the
decision-level note** — authorizing this D-number is outside FOLD-SCOPE Part B's greenlit set.

### C2 — Persisted AI mode + dropped "re-ask every upload" + demoted forced gate = silent re-arm across uploads
**Issue.** Change A drops "re-ask every upload" and demotes the forced post-upload gate to an
on-demand button. But §5.2 (`:330`) says "Settings (AI mode, BYOK reference, theme) **may persist
locally**." If an *egress* mode (`Cloudflare`, or Change B's full-data) persists, and neither a
forced gate nor a per-upload re-ask exists, a new dataset is analyzed under a **silently restored**
egress posture with no fresh consent. The old model's per-upload re-ask was the exact mitigation
for this; Change A removes it without a replacement. This is the concrete mechanism by which D2's
"consent before the first AI call" and D59's beachhead both break — not for the dataset the user
consented on, but for the *next* one.

**Failure scenario.** Session 1: analyst enables `Cloudflare` for a public dataset; disclosure
shown; fine. Two days later, Session 2: `Cloudflare` is restored from local persistence, silently
on. The analyst drops a regulated dataset and either (a) the map's async edge-warm synthesis fires
(H2 path) or (b) types one AI question — and structural facts (re-identifiable column names,
D45/D46), or full rows under C1, leave for Workers AI **with no disclosure and no consent for this
dataset**. The user believes DataScope "can't see" the new data because they never re-affirmed
anything this session.

**Proposed doc change.** In the §5.1/D2 amendment, pin the persistence boundary explicitly: **only
zero-egress preferences persist across sessions/uploads** (`Off`, `WebLLM`-enabled, theme, BYOK
*reference*). **Egress-enabling modes (`Cloudflare`, BYOK-that-leaves, full-data) reset to off on
each new session, and re-arming one for a newly-uploaded dataset re-shows its disclosure** before
the first egress. Equivalent to porting the old "re-ask every upload" guarantee into the switch
model as "no egress on a dataset the user hasn't disclosed-for this session." **Leaves:**
`build/06-ai/03-privacy-disclosure.md`, `foundations/privacy-model.md`, `build/12-workbench/`.

---

## HIGH

### H-a — "AI off by default + auto-WebLLM on capable device" needs its D2-rationale recorded, and auto-enable must be pre-select, not auto-download
**Issue.** D2 (`:64`) says the initial default "is a **first-run chooser**… no silent default."
Change A replaces that with off-by-default + auto-WebLLM-on-capable-device. Two things must be
nailed or this reads as a straight D2 violation:
1. **Record why it's still D2-compliant.** Defaulting to zero-egress `Off`, and auto-*selecting* a
   zero-egress local model, is not the thing D2 banned — D2 banned a silent *network/egress*
   default and inference-before-choice. That reasoning must be written into the amendment, or the
   fold looks like it deletes "no silent default."
2. **"Auto-enables" must mean pre-select + highlight, never auto-download/auto-warm.** D70 (`:132`,
   and §6 `:393`) already establishes the WebLLM consent gate: "The model download is
   consent-gated (human decision, 2026-07-22): the ~830 MB pull is never silent — an eligible
   session… is asked once." Change A's download-confirm pane IS that D70 gate. If "auto-enable" is
   under-specified and an implementer starts shards or warm-up on probe-positive, it violates D70's
   consent gate AND wastes ~830 MB + compute on a device that may not sustain it (D43 OOM
   criterion).

**Failure scenario.** Probe returns "capable" on a laptop with WebGPU but modest RAM. "Auto-enable"
is read as "begin warming." 830 MB downloads on a metered tether; WebLLM + DuckDB-Wasm contend and
OOM mid-ingest (the exact D43 kill criterion), and the deterministic first paint — the "one
winnable axis," §3.5/D56 — is delayed by background warm-up. No egress occurred, but D70's consent
gate and the perf posture are both breached.

**Proposed doc change.** §5.1/D2 amendment: state (a) the zero-egress-default rationale above; (b)
"auto-enable" = **pre-select the WebLLM switch and highlight the pane; the D70 download-confirm
remains the gate before any shard downloads or warm-up**; (c) WebLLM warm-up stays **off the
ingest/first-paint critical path** (§3.5/D56/D70). Reconcile with D70 so the two docs describe
**one** consent trigger, not two. **Leaves:** `build/06-ai/02-modes-byok.md`,
`build/06-ai/03-privacy-disclosure.md`, `build/v0.25/03-webllm-handoff.md` (ADR-007 model pin),
`foundations/privacy-model.md`.

### H-b — "Each flip discloses what leaves" must be a precondition of egress, or the first edge/provider call races the disclosure
**Issue.** Change A's D2-preservation claim is "each flip discloses what leaves." But a switch flip
that immediately activates a mode can fire an egress call *before or concurrent with* the
disclosure — most acutely the map's async edge-warm synthesis (prior-review **H2**, now reinterp-
reted as "gated by Cloudflare mode enabled"). Disclosure-as-notice is not disclosure-as-consent.

**Failure scenario.** User flips `Cloudflare`; the switch handler enables the mode; the map tab's
D56/D70 async synthesis-upgrade observes "Cloudflare on" and fires an edge call carrying pruned
DSPS structural facts (re-identifiable per D45/D46) in the same tick the disclosure modal is still
rendering. Data left before the user read what leaves.

**Proposed doc change.** Pin the flip lifecycle: **flip → disclosure shown → user confirms →
egress mode becomes active**. No producer (edge-warm D56/D70, AI turn) may egress until the mode is
*confirmed-active*, not merely *selected*. Fold H2's fix into the switch model explicitly: map
edge-warm attempts only under a **confirmed** `Cloudflare` mode, degrading to the deterministic
Verdict paint otherwise (H2 already targets §13.x map spec + D56/D70). **Leaves:**
`build/06-ai/03-privacy-disclosure.md`, `build/v0.25/*`, `build/12-workbench/`,
`foundations/privacy-model.md`.

### H-c — The D2 amendment must stay shell-conditional (prior-review H3 is NOT mooted by the switch model)
**Issue.** The fold-decisions block lists H3 as "reinterpreted," but H3's substance is still live.
The switch model is a **Workbench-only** surface; during the flag-parallel period the current shell
still ships the app-open `AIModeChooser` (first-run chooser). If §5.1/D2 is rewritten to describe
only the switch model, master no longer matches the consent flow of the surface that may ship Oct 6
(§9.1 is still open). Change A also **removes** the first-run chooser wording that the current shell
implements — that wording cannot be deleted while the current shell is launch-capable.

**Failure scenario.** §9.1 resolves as "current shell ships Oct 6." Master §5.1/D2 now describes
flat switches + auto-WebLLM + on-demand Configure-workspace; the launched product asks at app-open
with a three-mode chooser. The privacy page and `06-ai` leaves describe a consent placement the
shipped product doesn't implement — a compliance-adjacent doc defect for the regulated audience.

**Proposed doc change.** Write the D2 amendment as **placement-is-shell-dependent**: app-open
first-run chooser (current shell) / flat switches + Configure-workspace (Workbench), with the
shell-independent invariant ("no silent egress default; consent before the first egress call")
stated once. Same targets as H-a. **Process note (see decision-level):** the FOLD-SCOPE Part B
authorized D-edit set (D2, D48, D55, D62, D63, D68d, D69, D70, + new D71) **does not include a
full-data D-number** — Change B postdates that inventory. Synthesizing C1's D72 requires a fresh
explicit human authorization (CLAUDE.md: never edit the Record without explicit instruction).

---

## MEDIUM

### M-a — "Your own key (local or hosted)" re-surfaces the H1 category error at the disclosure layer
**Issue.** The switch genuinely fixes H1 for WebLLM (now its own flat switch — clean, see below).
But `Your own key (local or hosted)` folds two opposite egress postures under one control: a
**localhost Ollama URL is zero-egress** (browser→localhost, never touches the Worker — §5.1 API
row, D9), while a **bearer key leaves** (schema/prompts/SQL to the provider). Which one applies is
auto-detected from the not-yet-entered field contents (§11.2). So Change A's "each flip discloses
what leaves" is **unsatisfiable at flip time** for this switch — egress is field-shape-dependent.
The switch label at least names both (better than H1's hidden WebLLM), but the disclosure promise
over-reaches here.

**Failure scenario.** User flips `Your own key`; a generic "this sends data to your provider"
disclosure fires; the user then pastes a localhost Ollama URL (zero-egress) — the disclosure was
wrong in the safe direction (annoying), or, worse, a terse label lets a user paste a bearer key
believing "your own key" implies local/private, and rows-adjacent structure leaves unexpectedly.

**Proposed doc change.** Bind the disclosure to the **auto-detected field shape**, per §5.1's
existing per-shape rule, not to the switch: flipping `Your own key` opens the field; the disclosure
resolves after detection (URL = zero-egress localhost; bearer = leaves to provider); no call until
the shape is resolved and its disclosure shown. State that this switch is the one exception to
"flip discloses" — it's "flip → field → shape-disclosure." **Leaves:**
`build/06-ai/02-modes-byok.md`, `build/06-ai/03-privacy-disclosure.md`.

### M-b — The v0 device-capability probe is undefined and can wrong-positive
**Issue.** Change A introduces a NEW v0 surface — a binary capability probe driving auto-WebLLM —
but "capable" is undefined. WebGPU-present is necessary but not sufficient (integrated GPUs / low
RAM pass a WebGPU check yet can't sustain the ADR-007 model + DuckDB-Wasm). The target is fixed and
known — ADR-007 pins Qwen2.5-Coder-1.5B q4f16 (~830 MB, per §5.1 `:320` / D70) — so the probe only
needs "can this device run *that* model alongside DuckDB," not open-ended sizing (the finer
hardware→sizing work is correctly kept future in `dynamic-webllm-scaling.md`).

**Failure scenario.** Probe = "WebGPU present" only → wrong-positive on a thin laptop → pane
highlighted and WebLLM pre-selected on a device that will OOM if the user accepts the download
(D43 criterion (a)). If H-a's "pre-select not auto-download" pin is missing, this becomes an
outright wasted-830 MB / OOM event — the "waste compute" concern Justin raised.

**Proposed doc change.** Define "capable" concretely against the ADR-007 pinned model (WebGPU +
a memory floor derived from the D43 coexistence criterion); state the probe is coarse/binary and
recommendation-only (never a forced action); cross-reference D43/ADR-007. **Leaves:**
`build/12-workbench/`, `build/06-ai/02-modes-byok.md`, `build/v0.25/03-webllm-handoff.md`.

### M-c — Consistency ripple: the changeset that must move as one, or master self-contradicts
**Issue.** These two changes touch several settled items; applied piecemeal, master ends up
inconsistent. The coupled set:
- **D2 amendment** (master `:64`, §5.1 `:313–321`): now *flat switches + off-by-default +
  auto-WebLLM (pre-select) + on-demand Configure-workspace + shell-conditional placement* —
  **supersedes both** the app-open first-run-chooser wording *and* the LIFECYCLES two-posture
  reframe. This **moots prior-review H1** (WebLLM double-homing — genuinely fixed) but **keeps
  H3** (shell-conditional, H-c) and **keeps H2** (edge-warm now gated by "Cloudflare confirmed,"
  H-b).
- **New D72 (full-data)** — C1; cross-references D59 (`:121`, the sanctioned-opt-in clause it
  realizes), D39/D61 (sibling boundary path, design-round-gated), D45/D46 (re-identification),
  D21/§24 (labeling + marketing softening). **Outside FOLD-SCOPE Part B's authorized set** (H-c
  process note).
- **§5.0 principle line** (`:311`, "raw rows never leave except through explicit labeled actions")
  and **§5.2** (`:326–333`) must gain the full-data escalation bullet and the persistence-boundary
  rule (C2).
- **D70 consistency** (`:132`): its WebLLM consent-gate must reconcile with auto-WebLLM (H-a) so
  the two don't describe competing triggers. **M8/D56** (map = home of async synthesis, edge-warm
  gated) rides along under the switch-condition wording.
- **New D71 (Workbench adoption)** should name the switch model + Configure-workspace surface.

**Failure scenario.** Synthesizer amends §5.1/D2 for the switches but leaves §5.2's "sample rows
only" as the row-egress ceiling and leaves §5.0's principle unqualified; master now both permits
full-data (D72) and describes the row-egress boundary as 3-sample-rows (§11.3/§5.2). Or it folds
auto-WebLLM without touching D70, and master carries two different WebLLM consent triggers.

**Proposed doc change.** Treat the above as **one atomic changeset**; the synthesizer applies all
or none. Add an explicit "moves-together" note to the fold plan (FOLD-SCOPE Part B / the synthesis
brief). **Leaves:** all `build/06-ai/*`, `foundations/privacy-model.md`, `build/v0.25/*`,
`build/12-workbench/`, `product/roadmap.md`, `meta/question-index.md`.

---

## LOW

- **L-a — Loss of the "affirm a posture" trust moment.** Demoting the forced gate is correct for
  *consent* (egress is switch-gated), but the old gate also created a deliberate "I choose keep-on-
  device the moment I hand over data" trust beat for the regulated persona. On-demand means most
  users never affirm anything — fine mechanically, a small trust-story loss. Consider a one-line
  passive reassurance on the default (off) surface ("Nothing leaves your machine — configure AI
  when you want it"). Design-quality, not a consent defect. Leaf: `build/12-workbench/`.
- **L-b — Workers-AI custody nuance for the C1 label.** Verified below: Cloudflare Workers AI does
  not train on inputs and does not store them absent an attached storage service — but it *does*
  cache computed input tensors for prompt-caching (performance). The C1 disclosure copy should not
  over-claim "nothing is retained anywhere"; say "not used for training; not stored by Cloudflare;
  transient performance caching may apply" for the Cloudflare route, and "subject to your
  provider's terms" for BYOK. Leaf: `build/06-ai/03-privacy-disclosure.md`.

---

## Decision-level concerns (flagged, not edited around)

- **Change B in v0 at all (C1).** By the project's own governance, a full-data-to-cloud path is a
  boundary-widening capability that D39 (server-side execution → dedicated design round, not
  v0/v0.5), D42 (falsifiable dual-purpose test at human triage), and D59 (opt-in must be labeled /
  per-artifact / off-by-default) all say to gate behind a round, not a fold. **Recommendation:**
  record the D72 intent + constraints now, **defer the build to its own privacy round** exactly as
  D39 was. Including it as a v0 Workbench switch is the one place in these two changes where the
  design contradicts its own settled pattern. This is Justin's call — raising it rather than
  silently deferring.
- **Authorization scope.** FOLD-SCOPE Part B explicitly bounds the greenlit Record edits to a named
  D-list that does **not** include a full-data D-number (Change B postdates it). D72 needs a fresh
  explicit go before any synthesizer touches `architecture/decisions.md` for it.

---

## Clean bills (checked, sound — no synthesis effort needed)

- **Switch model retires H1.** Giving WebLLM its own flat, zero-egress switch genuinely fixes the
  double-homing/category error the prior review flagged. The problem now lives only at
  `Your own key (local or hosted)` (M-a), which is a narrower, disclosure-timing issue.
- **Off-by-default is the correct default direction.** Defaulting to zero-egress `Off` strengthens
  D2's spirit; the only work is *recording the rationale* (H-a), not changing the default.
- **Cloudflare route custody is favorable.** For Change B's Cloudflare (non-BYOK) route, custody is
  the *less* risky side — the exposure is BYOK to the user's own provider. Labeling must
  differentiate (C1); the Cloudflare route itself is defensible on custody grounds.

---

## Platform fact checked (per brief)

**Cloudflare Workers AI data custody** — verified against the official data-usage page
(`developers.cloudflare.com/workers-ai/platform/data-usage/`) and Trust Hub:
- "Cloudflare does not use your Customer Content to (1) train any AI models made available on
  Workers AI or (2) improve any Cloudflare or third-party services… unless we received your
  explicit consent."
- Inputs are Customer Content owned by the customer and not made available to other customers;
  **not stored by Cloudflare unless you attach a storage service** (R2/KV/DO/Vectorize).
- Models "constitute Third-Party Services and may be subject to… license terms between you and the
  model provider" — i.e. per-model terms can differ; relevant only if a partner-hosted model is
  used.
- Prompt caching stores computed input tensors for performance (not training).
This supports C1's custody-differentiated labeling: Cloudflare route = no-train / no-store (transient
perf cache only); **BYOK route = the user's provider's terms, outside DataScope's control**.

Sources:
- https://developers.cloudflare.com/workers-ai/platform/data-usage/
- https://www.cloudflare.com/trust-hub/responsible-ai/
