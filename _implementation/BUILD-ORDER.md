# Build order

Working checklist for building DataScope from this tree. This file is the **only** place
build status, phase language, and process history live — the code repo never references
it, the phases, or this doc tree. One `▶` marks the next item to build; the log at the
bottom records what shipped.

Each item is one leaf doc in `build/`; build to its definition of done. Model names are
who *builds* the item; the orchestrating session (Fable) triages, reviews the diff, and
maintains this file.

**Model rule:** Sonnet is the default builder. Opus takes the spikes, anything doing
inference or judgment (classifier, capability engine, chart translator, NL→SQL, Studio),
and security-sensitive edge code. Haiku takes mechanical scaffolding. Never substitute up
without a reason logged below.

## Update rules

1. Check a box **only** when the leaf doc's definition of done is met — tests included.
   No partial checks; if an item lands incomplete, leave it unchecked and log what exists.
2. Update this file **in the same session** the work lands. Never batch updates.
3. Exactly one `▶` exists at all times. Move it when you check its item.
4. Boxes only go from unchecked to checked. If shipped work regresses or must reopen,
   uncheck it and log why — that log entry is mandatory.
5. Model column is a commitment: if a different model ends up doing the work, correct the
   column and log the reason.
6. Order is dependency order. Don't start an item whose section dependency (each
   `build/*/README.md` header) has unchecked blockers, and don't reorder rows to suit a
   session.

## Handoff rules

Every working session ends by making this file sufficient for a cold start:

1. Append one log entry: date, **what now works and why it matters**, the next concrete
   action, and any open blocker. A fresh session must be able to resume from this file
   plus the leaf docs alone — no memory of the previous session assumed.
2. Log comments describe the work, not the process: write "CSV/ZIP drop registers tables
   with typed columns", never "finished phase 2 items 1–4" or "mostly done". No
   percentages, no "almost", no phase numbers in the prose.
3. If a session deviates from a leaf doc, the deviation is logged here *and* the leaf doc
   is corrected (master-first per the workspace rule) — the checklist never silently
   diverges from the spec.
4. Blockers name the blocking fact, not a feeling: "OPFS quota API returns 0 in Safari
   18", not "large files are being difficult".

## Writing rules for the code repo

The built repository follows the same discipline as its comments and READMEs — adapted
from `off-the-pace/.github/CONVENTIONS.md`:

- **Describe what the code does and why, in place.** Never how it came to be.
- **Banned in code, comments, commits, and READMEs:** "Phase n", "Sprint", "Wave",
  "Step n of", "newly", "now supports", "complete" — process narration tells a reader
  where the work sat in a schedule, not what the code does.
- **Spec citations are allowed and encouraged.** The design tree ships in this
  repository, so `§n` citations, `D-`numbers, and links to `_implementation/` all resolve
  in a fresh clone; they are the shortest path from a line of code to the reasoning
  behind it. They *supplement* the reason, never replace it — the comment or test name
  must still stand on its own, with the citation trailing as a pointer:
  `renders four intent groups (§13.2, D68d)`, never a bare `see §13.2`.
- Every reference must resolve inside a fresh clone of the code repo.
- Ordered *instructions* for a genuine procedure are fine; ordered *history* is not.

## Checklist

### Spikes — run first; ADRs and interfaces freeze from their evidence (D18)

- [x] Ingestion spike — DuckDB-Wasm worker + file drop viability — **Opus**
- [x] Relationship-inference spike (D17) — evidence only, build lands in 10 — **Opus**

### v0 — local, deterministic · ships Tuesday, October 6, 2026 (D27)

- [ ] **01 foundation**
  - [x] 01 project-bootstrap — Sonnet
  - [x] 02 state-management — Sonnet
  - [x] 03 routing — Haiku
- [x] **02 ingestion**
  - [x] 01 file-drop — Sonnet
  - [x] 02 duckdb — Opus
  - [x] 03 table-registry — Sonnet
  - [x] 04 multi-file — Sonnet
  - [x] 05 large-files — Sonnet
- [ ] **03 profiling**
  - [x] 01 summary-statistics — Sonnet
  - [x] 02 column-classifier — Opus
  - [x] 03 capability-engine — Opus
  - [x] 04 profile-ui — Sonnet
  - [x] 05 dataset-dossier — Sonnet
- [x] **04 sql**
  - [x] 01 monaco-editor — Sonnet
  - [x] 02 query-suggestions — Sonnet
  - [x] 03 results-grid — Sonnet
  - [x] 04 chart-translator — Opus
  - [x] 05 transformation-layer — Sonnet
  - [x] 06 pivot-crosstab — Sonnet
- [ ] **05 charting** — the v0 ship gate
  - [x] 01 time-series — Sonnet
  - [x] 02 correlation — Sonnet
  - [x] 03 distribution — Sonnet
  - [x] 04 categorical — Sonnet
  - [x] 05 join-graph-beta — Opus

### composition-layer recompose (D68) — within v0; recomposes Phases 1–5, no scope/date change

Each step extends already-built modules with the D68 contracts — build to the **amended**
leaf-doc definitions of done (the new acceptance-criteria rows). Phases A–E, itemized below.
Sequenced **before `06-ai`**: the AI producer (D56) plugs into these contracts, so the
deterministic seam freezes first (D68e/f). Order A → B → C → D → E; A is the highest-ROI item
(a genuine bug fix, no new UI).

- [x] **A — Action Broker** — `rankNextActions` in the broker; delete the every-step-"profile
  again" dead loop; wire each ranked action to a real module (not pre-filled yet) — **Opus**
  → [`03-capability-engine.md`](build/03-profiling/03-capability-engine.md), [`05-dataset-dossier.md`](build/03-profiling/05-dataset-dossier.md)
- [x] **B — Tier the Dossier** — `tier: 1|2|3` on ViewSpec panels; the Verdict (identity + one
  headline `FactRef` + top-3 actions) + confidence floor; disclosure for tiers 2–3 — **Sonnet**
  → [`05-dataset-dossier.md`](build/03-profiling/05-dataset-dossier.md)
- [x] **C — Nav restructure** — 12→4 capability-gated intent groups (DATA/EXPLORE/ANALYZE/OUTPUT);
  chart sub-types collapsed into one Charts destination; sticky "skip to data"; Studio/ML/Learn
  out of v0 nav — **Sonnet** → [`03-routing.md`](build/01-foundation/03-routing.md)
- [x] **D — Thread pre-config** — analysis modules accept a `ThreadConfig` prefill; ranked actions
  open modules **on the answer** — **Sonnet** → [`build/04-sql/`](build/04-sql/), [`build/05-charting/`](build/05-charting/)
- [x] **E — AI seam freeze** (design only, no AI code) — freeze the two §6 producer interfaces
  (action ranking, narration) so Phase 6 is a drop-in — **Opus** → an ADR + `types/*`

### v0.25 — Blueprint-forward opening + edge synthesis → WebLLM + BYOK (D70) · post-v0-launch tier

Curates a slice of v0.5's AI work forward around the Blueprint-forward opening (master §19 v0.25 block).
**Leaf docs authored** in [`build/v0.25/`](build/v0.25/) (the three genuinely-new buildable items; the
WebLLM spike's brief/verdict lives in ADR-007 like the v0 spikes, and BYOK reuses `06-ai/02-modes-byok`) —
this section records the milestone and its items; several **re-sequence existing v0.5 rows** rather than
add new scope (BYOK = `06-ai/02-modes-byok`; edge AI routing = `09-edge/01-ai-router`); v0.25 reuses 06-ai's
provider routing and the D55/D68 ViewSpec. **Sequencing call made (2026-07-21, human "lets go v0.25 · go in
the order that seems logical"):** v0.25 runs **before** `06-ai`, in the order **Blueprint-opening → WebLLM
spike → (06-ai provider routing) → edge synthesis / WebLLM handoff / BYOK**. The three AI-dependent rows
reuse 06-ai's routing, so they follow it; the Blueprint opening and the spike depend on neither, so they
lead. The `▶` led with the Blueprint opening then the WebLLM spike, then moved through `06-ai/01-pipeline`
(06-ai provider routing, now done), the edge-synthesis row, the WebLLM-handoff row, and the
BYOK-forward row — **the v0.25 section is complete (2026-07-22)**; the `▶` moved on to `06-ai/02`. Model column is a proposal.

- [x] WebLLM spike (D43) — in-browser WebLLM/WebGPU kill criteria: DuckDB-Wasm memory coexistence, an
  SQL-quality floor vs. cloud, acceptable download UX; **verdict = GO (2026-07-21), recorded in ADR-007** — **Opus**
  → no build doc (spike, like the v0 spikes); brief/verdict in [`architecture/adr/007-ai-routing.md`](architecture/adr/007-ai-routing.md); gate on the handoff row below is now cleared
- [x] Blueprint-forward opening — promote the Dataset Dossier / D68 Verdict to the primary post-ingest
  surface with the D69 intelligence-layers; reuses D48/D68/D69 + the D55/D68 ViewSpec, no new engine — **Sonnet**
  → [`build/v0.25/01-blueprint-opening.md`](build/v0.25/01-blueprint-opening.md)
- [x] Edge synthesis worker — Cloudflare warm-start synthesis over **DSPS structural facts only**, opt-in,
  stateless pass-through, never stored (D9/D59), local-only never calls it (D2); the D56 async upgrade — **Opus**
  → [`build/v0.25/02-edge-synthesis.md`](build/v0.25/02-edge-synthesis.md)
- [x] WebLLM client handoff — background download/warm (consent-gated, 2026-07-22 human decision), then
  client-side takeover of conversation + synthesis, degrading to edge/deterministic when off/down/uncached — **Opus**
  → [`build/v0.25/03-webllm-handoff.md`](build/v0.25/03-webllm-handoff.md)
- [x] BYOK forward (re-sequences `06-ai/02-modes-byok`) — D2c / D3 / D9 stateless pass-through custody — ~~Sonnet~~ **Opus** (matches the `06-ai/02` model-column correction below); **the row's
  pass-through scope is built + live-verified (2026-07-22)** — the `06-ai/02` leaf box itself
  stays open on its vault` criterion + an Ollama live run, per the no-partial-checks rule
  → [`build/06-ai/02-modes-byok.md`](build/06-ai/02-modes-byok.md) (existing — re-sequenced, not duplicated)

### v0.5 — AI, connectivity, persistence, edge · gated on §18 acceptance criteria

- [ ] **06 ai**
  - [x] 01 pipeline — Opus
  - [ ] 02 modes-byok — ~~Sonnet~~ **Opus** (D9 key custody is security-sensitive; see 2026-07-21 log) · *vault round-trip closed 2026-07-23; open on the re-pointed Ollama live run*
  - [x] 03 privacy-disclosure — Sonnet
- [ ] **09 edge** (built alongside its clients below; separate deploy)
  - [x] 01 ai-router — Opus
  - [x] 02 cors-relay — Sonnet
  - [x] 03 vault — Opus
  - [ ] 04 persistence-endpoints — Sonnet
- [ ] **07 connectivity**
  - [ ] ▶ 01 api-tier1-fetch — Sonnet
  - [ ] 02 api-tier2-relay — Sonnet
  - [ ] 03 refresh-from-source — Sonnet
- [ ] **08 persistence**
  - [ ] 01 parquet-export — Sonnet
  - [ ] 02 r2-save-share — Sonnet
  - [ ] 03 dsps-spec — Sonnet

### v1 — the Studio arc · gated on profiling proven in the wild

- [ ] **10 studio** — three phase-sized efforts, never one drop
  - [ ] 01 quality-report — Opus
  - [ ] 02 relationship-graph — Opus
  - [ ] 03 semantic-dbt-export — Opus

### Backlog

- [ ] **11 ml** — unscheduled; assign a model when pulled forward


## Log

*The historical execution log has been archived to [BUILD-ORDER-HISTORY.md](BUILD-ORDER-HISTORY.md).*

- **2026-07-22** — **DESIGN DECISION, not yet implemented — recorded here to fold into the next
  build session (whichever item is ticked off next; human instruction: "document it in the logs,
  we will implement it along with the next item we tick off the list").** Human directive:
  re-shape the AI mode taxonomy — rename **"Cloud AI" → "API"**, and move **local Ollama access
  out of "Local model" mode and into "API" mode**, reached the same way a cloud key is: through
  the key/endpoint field, not a separate mode. Four sub-decisions made (via clarifying questions
  this session, each confirmed by the human):
  **(1) Ollama reaches the browser directly, not through the edge Worker.** Same shape as today's
  client-side BYOK pass-through (`services/ollamaProvider.ts` already does a direct `fetch` to
  `localhost:11434` — that provider is reused, just re-triggered from "API" mode's key/endpoint
  field instead of being gated behind "local-model" mode). `edge/byok.ts`'s server-side pass-through
  is unaffected — this does not add Ollama proxying to the Worker.
  **(2) "API" mode keeps both routing choices.** It is "Cloud AI" renamed, not re-scoped — still
  offers "free shared budget first" vs "prefer my key/endpoint"; supplying a key or Ollama URL does
  not become mandatory.
  **(3) The key/endpoint field auto-detects its own shape.** One field, not two: if the entered
  value looks like a URL, treat it as an Ollama base endpoint (no bearer auth); otherwise treat it
  as an OpenAI-style bearer key. Rejected alternative: an explicit provider-type selector — the
  human chose the simpler single-field UI over the cleaner data model.
  **(4) "Local model" mode narrows to in-browser (WebLLM) only.** Drop "or localhost Ollama" from
  its label/description and from the mode's provider resolution — Ollama moves entirely to "API"
  mode's key/endpoint path. `services/webllmProvider.ts` and the download/warm state machine are
  unaffected; only the mode's Ollama fallback branch goes away.
  **What this touches when built (docs first, then code, per this session's human instruction):**
  master `DATASCOPE.md` §5.1 (mode table) and §11.2 (routing), the settled **Decision Record**
  entries **D2** (mode chooser — now two modes' worth of behavior change, not three-way), **D3**
  (routing toggle — confirmed unchanged in shape, now serves "API" instead of "Cloud AI"), and
  **D9** (key custody — the field's contents branch on shape now, still never persisted/logged);
  human instruction is the required authorization to edit the settled D-record (per this repo's
  own rule). Leaf doc `build/06-ai/02-modes-byok.md` mirrors the master change. **Already-built app
  code that will need a follow-up edit pass** (not touched this session — docs-only workspace):
  `AIModeChooser.tsx` / `AISettingsPanel.tsx` (mode copy, the single auto-detecting field, dropping
  the separate Ollama path), `services/ollamaProvider.ts` (triggered from API mode's resolver, not
  `local-model`'s), `src/services/aiProvider.ts` `resolveProvider` (ladder changes: `local-model` →
  WebLLM only; `cloud`/`API` → Workers AI / user key / Ollama-by-URL-detection). `edge/byok.ts`,
  `edge/ai-router.ts`, and the vault seam (`09-edge/03-vault`) are unaffected by this change.
  **Why not implemented now:** human instruction was to log the decision only; implementation is
  deferred to land together with the next build-order item pulled (currently `▶ 06-ai/03-privacy-
  disclosure`, Sonnet) rather than as its own out-of-sequence session.
  **Next concrete action:** build `06-ai/03-privacy-disclosure` (Sonnet), folding in this mode-
  taxonomy change (master-first edits to §5.1/§11.2/D2/D3/D9, mirrored to `06-ai/02-modes-byok`,
  then the app-code follow-up listed above) rather than treating them as separate sessions.
  **Blocker:** none — deliberately deferred, not stuck.

- **2026-07-22** — **Local-model mode is now demonstrably functional against a real localhost
  Ollama daemon, and the leaf's mode-switch matrix E2E ran end-to-end and PASSED — closing every
  `06-ai/02-modes-byok` criterion except the vault round-trip. The box stays unchecked on that one
  criterion (`09-edge/03-vault` unbuilt); `▶` stays.** Ollama 0.32.1 was installed on this machine
  (Homebrew; daemon run ad hoc, not a login service) with the pinned `qwen2.5-coder:1.5b` (~986 MB),
  and a scripted browser session drove the real chat: "How many passengers survived?" → two POSTs to
  `localhost:11434/api/chat` → `SELECT COUNT("PassengerId") FROM titanic WHERE "Survived" = 1` →
  ✓ 1 rows · 8 ms → "There were 355 passengers who survived the Titanic." — zero external requests
  across the whole phase.
  **Two real bugs found by the run, both fixed.** (1) The pinned coder **never emits Ollama's
  structured tool_calls** (probed live against the daemon: 0/4, replying instead with prose, a raw
  JSON blob, or fenced SQL) — so the pipeline's loop took the text as a final answer and **no SQL
  ever ran in local-model mode**. `services/ollamaProvider.ts` now drives the model with the same
  deterministic SQL-mode/answer-mode control flow + plain-text `extractSql` the D43 spike proved and
  the WebLLM provider already uses (instructions + helpers now exported from `webllmProvider.ts`);
  answer mode omits `tools` entirely so the turn can only end as text, and a tool-tuned model's
  structured call is still honored. (2) The matrix's network assertions caught the dataset-open
  **synthesis request reaching the workers.dev host in local-model mode** — the ladder's cold local
  rung fell through to the edge rung, violating §5.1's zero-external contract for the mode.
  `services/synthesis.ts` now gates the edge rung to cloud mode: local-model's only AI synthesis
  rung is the warm in-browser engine, degrading to the deterministic baseline (`ai-uncached`) when
  cold or failed.
  **Matrix result (one scripted headless-Chromium session, 2000×1250, per-phase network
  classification):** chooser — 0 non-devserver requests before a mode is chosen; local-model —
  Ollama only, 0 edge/external; local-only — refusal rendered, 0 requests of any kind; cloud —
  exactly two `200 POST /ai-router` against the live staging Worker and "The average fare was
  approximately $36.93." (One earlier cloud attempt died at the client's 30 s §21.6 abort — a direct
  probe showed Workers AI at ~9 s that minute; retried clean.) ~4 real cloud inference calls total,
  all deliberate; Ollama inference is free.
  **Verification:** suite **886 → 891** (+5: three ollamaProvider control-flow tests built from the
  probed reply shapes, two synthesis egress-gate tests; one synthesis test rewritten to the stronger
  no-request-at-all guarantee), `tsc -b` / `oxlint` / `vite build` clean.
  **Docs, master-first:** no master edit — §5.1's mode table already states local model sends
  nothing; this change set realizes it. Leaves updated: `06-ai/02` (Ollama criterion ticked with
  evidence, Files rewritten to the built provider shape, test-plan note recording the matrix run and
  the leak it caught), `v0.25/02-edge-synthesis` (local-model never calls the edge), and
  `v0.25/03-webllm-handoff` (the ladder's cloud-only edge rung).
  **Model note:** built on **Opus** per the row's corrected model column.
  **Next concrete action:** `06-ai/03-privacy-disclosure` (Sonnet). `06-ai/02`'s box checks when
  `09-edge/03-vault` lands and its round-trip criterion closes.
  **Blocker:** none.

- **2026-07-22** — **`06-ai/03-privacy-disclosure` ships, folding in the mode-taxonomy rename
  logged above in the same session, per that entry's own instruction not to split them.**
  **Mode-taxonomy rename (docs master-first, then app code):** "Cloud AI" → **"API"** everywhere
  user-facing; localhost Ollama moved out of "Local model" (now in-browser WebLLM only) and into
  API mode, reached through the same key/endpoint field a cloud key uses. That field auto-detects
  its own shape (`services/ollamaProvider.ts`'s new `isOllamaEndpoint` — a URL is a local Ollama
  base endpoint, anything else a bearer key). Master edits: §5.1's mode table, §11.2, and D2/D3/D9
  (human-authorized per this repo's own rule for touching the settled Decision Record) — mirrored
  into `foundations/privacy-model.md` and `build/06-ai/02-modes-byok.md` (whose one re-pointed
  acceptance criterion — Ollama's live 2026-07-22 daemon run — is reopened with a note: the
  underlying capability evidence stands, only the trigger moved, and that specific move is
  unit-tested, not re-run live). App code: `aiProvider.ts`'s `resolveProvider` ladder (local-model
  is warm-WebLLM-or-nothing now, no Ollama fallback; API mode branches on field shape before
  falling to the edge router), `AIChatModule.tsx`'s status line (now reports a URL-shaped API-mode
  field honestly as zero-egress local, never as "API"), and the `AIModeChooser`/`AISettingsPanel`
  copy.
  **`06-ai/03-privacy-disclosure` itself:** a `metadataOnlyRepair` setting (default on, persisted
  like the other AI preferences) gates stage 5's retry behavior in `services/ai.ts` — off, a failed
  attempt resamples up to 3 real rows from the question's relevant table (a defensive slice, not
  just the SQL `LIMIT 3`) alongside the error trace, and a resample that itself fails degrades
  silently to metadata-only rather than crashing the turn; the terminal (turn-ending) failed attempt
  never resamples, since there's no further retry to enrich. Every sampled attempt carries
  `sampledRows: true`, which `AITurnView` renders as a transcript badge. `AISettingsPanel` gained
  the toggle plus a disclosure paragraph enumerating the exact §5.1 API-mode payload list
  (schema/prompts/SQL/error-traces, sample rows only if the toggle is off); `AIModeChooser`'s
  first-run blurb was extended to match ("error traces" was missing there before).
  **Verification:** suite **891 → 904** (+13: mode-taxonomy ladder/status/copy tests plus the new
  `isOllamaEndpoint` cases, and the metadata-only-repair/data-sampled-repair cases in `ai.test.ts`
  including the sampling-failure and terminal-attempt-never-samples cases); `tsc -b` / `oxlint` /
  full `vitest run` (904 passed) / `vite build` all clean.
  **Not run this session:** a live E2E flipping the toggle mid-conversation or re-confirming Ollama
  reachability specifically through the new API-mode trigger against a real daemon — both are
  unit/component-tested; the mode-taxonomy fold-in's underlying Ollama-reachability evidence is the
  unchanged 2026-07-22 live run logged above, just re-pointed. Flag if a future session wants the
  live re-confirmation.
  **Docs, master-first:** DATASCOPE.md §5.1/§11.2/D2/D3/D9 amended (dated inline); mirrored to
  `foundations/privacy-model.md` and `build/06-ai/02-modes-byok.md` (Modes/BYOK-routing/Key-custody
  sections and the Files section rewritten to the amended ladder; one acceptance criterion reopened
  per above). `build/06-ai/03-privacy-disclosure.md`'s acceptance criteria checked with evidence
  annotations; its Files/Test-plan/Definition-of-done sections rewritten to the built shape.
  **Next concrete action:** `09-edge/02-cors-relay` (Sonnet) — `06-ai/02`'s box still checks only
  when `09-edge/03-vault` lands and closes the vault round-trip criterion.
  **Blocker:** none.

- **2026-07-23** — Ollama-shaped API-mode fields now honor the D3 routing toggle instead of
  always bypassing it, closing a gap the master spec was silent on (no Decision-Record edit —
  §5.1/§11.2 already define the toggle; this realizes it for Ollama and adds the previously
  undocumented default rule). "Prefer my key" is unchanged: straight to Ollama. "Use free tier
  first", when explicitly chosen, tries the shared Workers-AI budget first and falls back to the
  local Ollama endpoint only on the router's existing keyless quota-exhausted/pool-exhausted/
  paused response — the overflow is client-orchestrated (`src/services/ai.ts`) since the edge
  Worker cannot reach the user's `localhost`; no edge/router code changed. New default rule: an
  Ollama-shaped field defaults to prefer-endpoint (zero-egress) until routing is explicitly
  touched, so the stored D3 default of `free-tier-first` never silently sends a local-Ollama
  user's payloads to the cloud. Master edits: §5.1's API mode table row, §11.2's BYOK bullet.
  Mirrored into `foundations/privacy-model.md` and `build/06-ai/02-modes-byok.md` (mode table,
  BYOK routing section, Files paragraph) and `build/09-edge/01-ai-router.md` (a note that the
  router needs no Ollama awareness — the overflow trigger is its existing keyless typed-error
  response). App code: `aiProvider.ts`'s `resolveProvider` (new `{ provider, overflowProvider? }`
  return shape; a new settings flag tracks whether routing was ever explicitly chosen), `ai.ts`'s
  tool-use loop (persists the provider swap for the rest of the turn on a quota-family error,
  marks `servedByOllamaOverflow`), `AIChatModule.tsx`'s status line and `AITurnView.tsx`'s inline
  disclosure, and `AISettingsPanel.tsx`'s copy (the "never at all"/"Zero egress" strings are now
  conditioned on whether routing was explicitly set to free-tier-first).

- **2026-07-23** — **`09-edge/02-cors-relay` built and unit/local-verified; the box stays open
  on one outstanding criterion (a live staging deploy), `▶` stays.** Before writing code, a
  genuinely open design question surfaced: the leaf doc's own spec text ("target URL in,
  response out; nothing rewritten beyond CORS headers") conflicted with master §7.4's summary
  line ("Worker-side [pagination] for Tier 2/3"), and ADR-006 — the doc both leaves cite as the
  authority — had never actually recorded a pagination decision. Resolved by human decision
  (2026-07-23, asked via clarifying question with a use-case comparison across the three named
  v0.5 platforms): **pagination is client-driven, not Worker-side** — the client loops, calling
  the relay once per page; the relay stays a strict single-fetch pass-through. Reasoning: only
  GitHub (of GitHub/Lichess/Chess.com) has generic follow-able pagination at all; Worker-side
  following would need bespoke response-framing (violates "nothing rewritten"), re-implements
  the SSRF check internally instead of reusing the per-call path, and holds one Worker
  invocation open across many upstream fetches (worse for the §23.5 cost ceiling than many
  short, independently-killable ones); the launch defaults' "pagination-friendly burst" rate
  sizing only makes sense if a multi-page ingest is already many relay calls. **Docs,
  master-first:** DATASCOPE.md §7.4 (the pagination bullet and the abuse/rate-limit sentence)
  and §23.5 (a stale "50-subrequest cap" clause that assumed Worker-side page-following).
  Mirrored into ADR-006 (new "Pagination — Tier 2 relay" decision section, status line updated)
  and both leaf docs (`09-edge/02-cors-relay.md`'s spec + acceptance criteria + test plan;
  `07-connectivity/02-api-tier2-relay.md`'s pagination bullet + a new acceptance criterion for
  the 20-call client-side cap it now owns).
  **`edge/cors-relay.ts` built to the amended spec:** `GET /cors-relay?url=&sessionId=` (no
  body — there's nothing to carry one), kill-switch → validate → SSRF-check → dual-keyed
  rate-limit (two independent windows, per-minute *and* per-hour, both session+IP — a first for
  this codebase's limiter usage; `checkRateLimit` called twice with distinct namespaces so the
  windows don't collide) → a manual `redirect:'manual'` follow loop capped at 5 hops, each hop
  re-entering the same SSRF check (closes a redirect-based SSRF bypass a naive `redirect:
  'follow'` would open) → a streamed `ReadableStream` relay with a byte-count cutoff (100MB
  default): a declared `content-length` over the cap rejects cleanly before any byte streams;
  an undeclared/chunked response that exceeds the cap mid-stream errors the stream (the
  cleanest signal achievable without buffering Worker-side to inspect it first — noted as an
  inherent property of "streamed, never buffered", not a gap). No client-supplied headers ever
  reach the target (the outbound fetch carries only `{method:'GET', signal}`, nothing from the
  inbound request). Content-free metrics via the existing `shared/counters.ts` sink, extended
  with a new `CorsRelayMetric` shape (outcome/size/latency only, same discipline as the other
  three endpoints' metrics — never a URL). New `CorsRelayErrorCode` wire type in `protocol.ts`.
  Wired into `worker.ts` (`buildCorsRelayEnv`, `/cors-relay` dispatch — this endpoint's own
  405-on-non-GET check lives inside the handler itself, not worker.ts's pre-check like the
  other two routes, specifically so it's exercised by this file's own test suite rather than
  only reachable through untested `worker.ts`), `bindings.ts` (`CORS_RELAY_KILL_SWITCH`), and
  `wrangler.toml` (root + `[env.staging]`, matching the non-inheritable-keys pattern the other
  kill switches already established).
  **Verification:** `cors-relay.test.ts`, 26 cases (pass-through + status forwarding, header
  non-forwarding, method rejection, malformed input, 8 SSRF cases including
  `169.254.169.254`/IPv6 `::1`, redirect-following allowed/blocked/too-many, both response-cap
  paths, both rate-limit windows including the forged-session-token/per-IP-floor case, the kill
  switch, content-free counters). Two real test-harness bugs caught and fixed while writing
  these (not production bugs): the mock `fetchTarget` initially reused one `Response` object
  across multiple calls (a body stream can only be read once — surfaced as a spurious 502 on
  the second of three calls in the per-IP-floor test) and a counters test checked the sink
  before consuming the streamed body (the metric only lands once the stream actually drains,
  same as a real client). Full suite **904 → 940** (+36 incl. the 26 new), `tsc -b` / `oxlint` /
  `vite build` all clean. Supplemented by a live local `wrangler dev` smoke pass (real
  Miniflare + real DO binding): `GET /health` → 200; `GET /cors-relay?url=http://10.0.0.1&…` →
  `400 {"error":"blocked"}`; `GET /cors-relay?url=https://example.com&…` → the real page body,
  streamed through; `POST /cors-relay?...` → `405 {"error":"bad-request"}`.
  **Not run this session — the one open Definition-of-done criterion:** the public-ship gate
  ("rate limits active satisfied on staging") needs a live `wrangler deploy --env staging` +
  audit, the same shape as the `ai-router` burst audit that produced ADR-006's rate-limiter
  correction. Held deliberately: a real deploy to shared Cloudflare infrastructure, not done
  autonomously without confirmation.
  **Next concrete action:** confirm and run the staging deploy + live rate-limit audit to close
  `09-edge/02-cors-relay`'s box; then `09-edge/03-vault` (Opus) — which also closes
  `06-ai/02-modes-byok`'s one remaining open criterion (the vault round-trip).
  **Blocker:** none — the staging step is a deliberate pause for confirmation, not stuck.

- **2026-07-23** — **`09-edge/02-cors-relay` closes: staging deploy done and the live rate-limit
  audit confirms the DO-backed limiter enforces correctly — box now checked, `▶` moves to
  `09-edge/03-vault`.** Human confirmed the deploy this session (deliberate pause from the entry
  above, resolved). `CLOUDFLARE_API_TOKEN` (`app/.env.local`) + `npm run edge:deploy:staging` →
  `datascope-edge-staging.justinclarke.workers.dev`, `RATE_LIMITER` DO binding recognized, bundle
  40.76 KiB. Live smoke: `/health` → 200; SSRF block on `http://10.0.0.1` → `400 {"error":"blocked"}`;
  non-GET → `405 {"error":"bad-request"}`; pass-through of `https://example.com` → real body, 200.
  **The burst audit itself hit a false alarm first, worth recording since it shaped the
  methodology:** two early bursts (22 requests spaced ~1.5–2s apart via `sleep 1` plus curl
  overhead, and 30 requests back-to-back) both returned 200 for every request — looked exactly
  like the KV under-count bug ADR-006 found on `ai-router`. Ran `wrangler tail --env staging` live
  against a repeat to see what the DO was actually doing, and the tail log resolved it
  immediately: both suspect bursts spanned **two** 60s fixed-window buckets (an `Alarm` fired
  mid-burst marking the rollover), splitting ~22–30 requests across two windows so neither bucket
  alone crossed 20 — a **test-methodology artifact** (burst too slow / badly timed against the
  window boundary), not a limiter bug. A clean, fast, boundary-safe burst (23 requests, all
  landing inside one window, tail-confirmed via `RateLimiterDo.increment` firing on every request)
  gave the real signal: requests 1–20 → 200, 21–23 → genuine `429 {"error":"rate-limited"}` with
  `retry-after: 60`, exactly at the declared 20/min/session ceiling. A fresh session id from the
  same IP immediately after (well under the 60/min per-IP floor at that point) still passed —
  confirms the dual-keyed shape is live, not just the session ceiling. Matches the `ai-router`
  precedent shape (DO fixes the KV staleness class of bug) — this is the first time that DO path
  was exercised by a *second* endpoint's own namespace (`cors-relay-min`/`cors-relay-hour`
  vs. `ai-router`), confirming the shared-limiter design doesn't collide across endpoints.
  **Not separately live-burst-tested:** the per-hour window (200/session, 3600s — a live burst
  would take too long to be worth it; unit-tested, and the per-minute window's live pass exercises
  the identical code path with a different constant) and the kill switch (flipping it live would
  require a second deploy disrupting the audit in progress; unit-tested, no live-only risk like
  the rate limiter's KV-vs-DO consistency class had).
  **Docs:** no master/ADR change — ADR-006's existing DO-limiter decision already covers this;
  this is the second endpoint proving it, not a new decision. Leaf `09-edge/02-cors-relay.md`'s
  Definition of done — the one outstanding line — closed with this evidence (no acceptance
  criteria reworded; all were already `[x]` from local verification).
  **Next concrete action:** `09-edge/03-vault` (Opus) — also closes `06-ai/02-modes-byok`'s
  remaining open criterion (the vault round-trip).
  **Blocker:** none.

- **2026-07-23** — **`09-edge/03-vault` built and unit/local-verified — the opt-in half of D9
  custody works end to end from the settings checkbox: "Remember my key" now stores a bearer key
  server-side (encrypted, idle-expiring, deletable) and the browser keeps only a reference. The
  box stays open on one criterion (a live staging deploy, which needs two account resources),
  `▶` stays.**
  **Three properties are structural rather than conventions**, which is the substance of this
  build: (1) the endpoint has **two** client operations, store and delete — resolution is an
  in-process function the router calls, so no response shape on `/vault` can carry key material
  back; (2) records are AES-GCM ciphertext under a Worker-held secret, and a deploy missing that
  secret (or the KV binding) answers typed `unavailable` rather than storing a key in the clear
  — the vault fails closed, never quietly weaker; (3) session scoping *is* the storage key
  (`vault:{session}:{ref}`), so a reference presented under another session addresses nothing
  and there is no comparison to forget to write. Entropy lives in the 256-bit reference; the
  session id is client-minted (§23.1's server-minted tokens remain ADR-006's, unbuilt) and the
  code treats it as a scoping key, never a second secret.
  **A durable, vault-specific session id was the one genuinely open design question.** The id
  every other edge call carries is per-page-load, so it cannot address a key across tab closes —
  which is the entire feature. Resolved by minting a durable id **only on the first store**: a
  user who never opts into the vault gains no durable identifier at all, and opting in is
  already opting into a server-side association. Both halves (`vaultRef` + `vaultSession`) are
  required to resolve. Recorded master-first in §5.2.
  **A test caught a real coupling bug before it shipped.** Refresh-on-resolve was written with a
  fixed 24h threshold; with any TTL tuned below a day that silently stops refreshing, turning
  "expires after 90 days *without use*" into a hard expiry. It is now a *fraction* of the TTL
  (1% ≈ 21.6h on the 90-day default — still ~4 writes/year per credential instead of one per
  question).
  **Also decided and documented:** a router-internal resolve is not a vault "operation" and does
  not spend the 10/session/hour budget — it rides an already-rate-limited ai-router call, and
  counting it would cap a remembered-key user at ten questions an hour (master §11.2). The
  3-credential cap is a hygiene bound, not the anti-stuffing control — KV's listing is eventually
  consistent, so the strongly consistent DO-backed op limiter is what actually holds. A vaulted
  record's own provider is authoritative, so a stored key can't be redirected at another provider
  by someone holding only the reference. A failed *delete* deliberately leaves the checkbox
  checked: dropping the reference locally would strand a real stored key with nothing left to
  address it.
  **KV returns to the edge, in the role it is good at.** ADR-006's counter correction ended with
  "the edge Worker no longer uses KV at all"; that line is now corrected there, not contradicted
  — a stale *count* is a wrong number, while a stale *value* read is a brief typed "not found
  yet" the client retries, and KV's native `expirationTtl` is exactly the idle-TTL primitive.
  The edge now runs both backends split by need: DO for counts, KV for values with a TTL.
  **Verification:** suite **940 → 995** (+55: 29 in `edge/vault.test.ts`, 5 vault cases in
  `byok.test.ts`, 6 client-service, 8 settings-panel including the §22 storage row — after
  remembering a key no localStorage entry contains it while the reference does — 3 ladder, 5
  status-line, plus one existing test re-pointed); `tsc -b` / `oxlint` / `vite build` clean.
  Supplemented by a live local `wrangler dev` pass through `worker.ts`'s own wiring (real
  Miniflare KV + DO limiter): store → ref; cross-session delete → 404; the cap → `200 200 409`;
  non-POST → 400; delete → `{"deleted":true}` then 404; the op limiter → 429 from the 11th, with
  a fresh session unaffected. **Custody audit, the piece this build owed alongside the
  ai-router's:** after a live store, the key appears in zero Worker log lines and zero bytes of
  the on-disk KV store (`grep -ri` over `.wrangler/` — the record is ciphertext), and a record
  written under a rotated secret does not resolve.
  **Docs, master-first:** DATASCOPE.md §5.2 (the durable vault session id), §11.2 (resolves not
  counted against vault ops; the lazy-refresh and cap-vs-limiter notes) — no Decision-Record
  edit, D9's custody choice is unchanged and this realizes it. Mirrored into ADR-006 (a new
  "KV's remaining role" section correcting the stale line, and the routing-layout interim fact:
  four of five paths now share one Worker), `foundations/privacy-model.md`,
  `build/09-edge/README.md`, `build/09-edge/03-vault.md` (criteria checked with evidence, Files
  and Test-plan rewritten to the built shape, design notes, the outstanding staging line), and
  `build/06-ai/02-modes-byok.md` (its vault criterion now checked, custody + seam notes updated).
  **Model note:** built on **Opus** per the row's model column.
  **Next concrete action:** confirm and run the staging deploy to close `09-edge/03-vault`'s box
  — it needs `wrangler kv namespace create VAULT_KV` (then uncomment the two binding blocks in
  `wrangler.toml`, root + `[env.staging]`) and `wrangler secret put VAULT_SECRET --env staging`,
  followed by a live round-trip + custody audit against staging. Then
  `09-edge/04-persistence-endpoints` (Sonnet). **Correction to the previous entry's
  expectation:** `06-ai/02-modes-byok` does *not* check on this build — its vault criterion is
  now closed, but the re-pointed Ollama criterion (a live run through API mode's key/endpoint
  field) is still open, and is now that row's only remaining blocker.
  **Blocker:** none — the staging step is a deliberate pause for confirmation, not stuck.

- **2026-07-23** — **`09-edge/03-vault` closes: staging deploy done, live round-trip and custody
  audit both pass — box checked, `▶` moves to `09-edge/04-persistence-endpoints`.** Human
  confirmed the deploy this session ("close it up" — the deliberate pause above, resolved).
  **Two namespaces, not one.** `wrangler kv namespace create VAULT_KV` plus a separate
  `--env staging` one (`staging-VAULT_KV`), against the config's own comment, which assumed the
  staging block would repeat the root id: a shared namespace would let the staging Worker
  resolve production vault records, and the isolation costs nothing. `wrangler.toml`'s two
  binding blocks are now uncommented with their distinct ids and the comment corrected.
  `VAULT_SECRET` was set with `wrangler secret put --env staging` from `openssl rand -base64 32`
  piped straight in — never written to a file, never echoed. Redeploy: 48.90 KiB, `VAULT_KV` +
  `RATE_LIMITER` both bound.
  **Live audit (HTTP-level against the deployed Worker, not through the browser UI — the
  settings-UI path was verified locally last session):** store → ref; cross-session delete →
  `404 not-found`; non-POST → `400 bad-request`; delete → `{"deleted":true}` and the repeat →
  `404`, so the delete is verifiable against production KV and not just Miniflare; the op
  limiter → clean `200`s through op 10 and `429 rate-limited` from op 11, with a fresh session
  id from the same IP unaffected; every record's TTL lands ~90 days out.
  **Custody audit — the piece this build owed.** Every record in the namespace (13) dumped via
  `wrangler kv key get`: all AES-GCM ciphertext, zero occurrences of the stored key, of the
  string `sk-`, or of the provider name across the entire dump. A `wrangler tail` capture
  spanning a store, a delete, and a malformed request: zero occurrences of the key across
  request lines, DO events, logs, and exceptions.
  **The one real finding: the credential cap is *eventual* against real KV, by a much wider
  margin than the design note assumed.** A back-to-back burst seated **5** credentials under a
  cap of 3; spacing stores 3s apart still let all four through; the 4th was rejected
  `409 cap-reached` only after a **~120s** settle. KV's prefix *listing* lags materially longer
  than the ≤60s value propagation ADR-006 reasoned about. This does not change the design — the
  cap was already documented as hygiene with the strongly consistent op limiter (10/session/hour)
  as the actual anti-stuffing ceiling, and that limiter held exactly — but "momentarily one over
  the cap" understated the window, so master §11.2 and ADR-006 now carry the measured numbers.
  **A methodology note, since it wasted a pass:** the first audit run returned route-level
  `404 not-found` for `/vault` on some requests and skewed the limiter count — the new version
  was still propagating across colos and older ones had no `/vault` route. Re-running after it
  settled gave the results above. Same shape as the cors-relay window-boundary false alarm:
  suspect a just-deployed edge before suspecting the code.
  **Docs, master-first:** DATASCOPE.md §11.2 (the measured cap slop), mirrored into ADR-006's
  KV-role section and `build/09-edge/03-vault.md` (the cap criterion's evidence, and the
  Definition of done's outstanding staging line now closed with this audit).
  **Next concrete action:** `09-edge/04-persistence-endpoints` (Sonnet) — the last `09-edge`
  row. `06-ai/02-modes-byok` still waits only on the re-pointed Ollama live run.
  **Blocker:** none.

- **2026-07-23** — **`09-edge/04-persistence-endpoints` built and verified against a real (local)
  R2 binding — the Worker side of R2 save/share works end to end: save a dataset buffer, get it
  back by token, delete only with the ownership proof returned at save time. The box stays open
  (`▶` stays) on three things that need real Cloudflare account resources this session
  deliberately did not create: the R2 bucket itself, the Terraform-owned lifecycle TTL rule, and
  a staging deploy for a real cross-device share URL.**
  **Two design decisions, both forced by a real R2 API constraint found live, not in unit
  tests.** `R2Bucket.put()` requires its value stream to have a *known length* — the runtime's
  own error, hit against a real local Miniflare R2 binding: `"Provided readable stream must have
  a known length (request/response body or readable half of FixedLengthStream)"`. The first
  implementation wrapped `request.body` in an app-level byte-counting passthrough stream (the
  same shape cors-relay uses on its response side) specifically to catch a lying
  `Content-Length`; that wrapper is exactly what R2 rejects, since authoring a new `ReadableStream`
  strips the known-length property even when everything it reads comes from a request body. Fixed
  by passing `request.body` to `store.put` **unwrapped** — which turns out to be the more correct
  defense, not a weaker one: the HTTP layer already frames the body to its declared
  `Content-Length` before the handler runs, so a body shorter or longer than declared fails as a
  transport-level error before R2 even sees it. The declared-size pre-check (`> 100MB` →
  `too-large` before any streaming starts) is still app logic; the actual-vs-declared match is
  the runtime's, not re-implemented here — and the in-memory test store can't simulate an
  R2-specific contract, so that defense is verified by the live run, not by the unit suite.
  **Second, a shared-infra extension:** the 300MB/session/day aggregate save cap sums *bytes*,
  which the existing dual-keyed limiter (request-counting only) couldn't express.
  `RateLimiterDo.increment`/`rateWindow.ts`'s `stepWindow` gained an optional `amount` parameter
  (default 1 — every existing caller, ai-router's quota and cors-relay's dual window, is
  unaffected) and `shared/limiter.ts`'s `incrementSessionQuota` passes it through. Fixed a latent
  bug the extension exposed rather than caused: the DO's "did a fresh window just open" check was
  `count === 1`, which only ever held because every prior caller's amount was 1 — corrected to a
  direct bucket-number comparison, since a byte-summing key could otherwise never schedule its
  cleanup alarm.
  **Delete's ownership-proof shape follows vault.ts's established precedent exactly:** the token
  (the link — anyone holding it can `get`) is separate from the `deleteToken` (returned once at
  save time, stored only as a SHA-256 hash in R2 custom metadata); a wrong or missing proof
  answers the same typed `not-found` as an unknown token, so a dead/foreign object never reports
  *why*. Save/get carry the object as a raw body, not JSON (a dataset buffer can run to the
  100MB cap; base64-in-JSON would inflate that by a third for nothing); control fields
  (`sessionId`, `token`, the proof) travel as query params, and delete stays a POST + `op=delete`
  query param rather than the DELETE method, so the Worker's fixed GET/POST CORS allow-list
  needed no change.
  **Verification:** suite **995 → 1015** (+20 in `persistence.test.ts`, +2 in `rateWindow.test.ts`
  for the `amount` parameter); `tsc -b` / `oxlint` / `vite build` clean; both
  `wrangler deploy --dry-run` (root and `--env staging`) bundle cleanly with the new R2 binding
  listed. **Live local `wrangler dev` pass (real Miniflare R2 + the real DO rate limiter, not the
  test store):** save → get round-trips exact bytes and content-type; unknown-token get → `404`;
  forged-proof delete → `404` with the object surviving; correct-proof delete →
  `{"deleted":true}` then `404`; the kill switch → `503` on all three operations. **Custody
  audit** against the local Miniflare R2 metadata database: every record holds only a
  `deleteTokenHash` (SHA-256 hex) — the raw delete token appears in zero metadata rows and zero
  object blobs.
  **Not live-burst-tested at the real launch numbers** (10 saves/session/day, 100MB/object,
  300MB/session/day) — would mean transferring hundreds of MB just to trip a counter; the
  underlying DO window primitive this reuses unchanged is already live-audited twice (ai-router's
  daily quota, cors-relay's per-minute/per-hour pair), and this build's own addition (the
  `amount` parameter) is covered by `rateWindow.test.ts`'s byte-summing cases plus the live round
  trip exercising the real code path end to end.
  **Docs, master-first:** no master/Decision-Record edit — §12.3's spec (endpoints, retention,
  abuse-control numbers) already covers this build; nothing here revises it, only realizes it (R2
  lifecycle enforcement and the Terraform tree remain as master already described them, D19/
  §23.3). Leaf `build/09-edge/04-persistence-endpoints.md` rewritten to the built shape: Files
  section documents the shared-infra `amount` extension; acceptance criteria checked with
  evidence where the local live run supports it, left open with a named reason otherwise (TTL/
  lifecycle — infra doesn't exist yet; cross-device round-trip and the abuse-report `mailto:` —
  need staging and are partly client-scope); Test plan records the run; Definition of done names
  the three provisioning steps still open.
  **Next concrete action:** provisioning, not more code — confirm and run: `wrangler r2 bucket
  create datascope-persistence` (+ `datascope-persistence-staging`), the Terraform-owned
  lifecycle TTL rule (this repo's first load-bearing use of an `infra/` tree — D19/§23.3's
  sequencing point that Terraform becomes load-bearing at v0.5 is now), and a
  `wrangler deploy --env staging` to close the cross-device criterion. That closes
  `09-edge/04-persistence-endpoints` (the last `09-edge` row) and `09-edge/README.md`'s own exit
  criteria (all four endpoints on staging). After that: `07-connectivity/01-api-tier1-fetch`
  (Sonnet) — `06-ai/02-modes-byok` still separately waits only on the re-pointed Ollama live run.
  **Blocker:** none — the provisioning steps are a deliberate pause for confirmation (real
  Cloudflare account resources), not stuck.

- **2026-07-23** — **R2 buckets provisioned for `09-edge/04-persistence-endpoints`: `datascope-
  persistence` and `datascope-persistence-staging` both created (`wrangler r2 bucket create`),
  matching the isolation `wrangler.toml` already assumed.** One real gap found and fixed along
  the way, not a code issue: the `CLOUDFLARE_API_TOKEN` in `app/.env.local` initially lacked the
  Workers R2 Storage:Edit scope (`10000` auth error on the first create attempt) and the account
  itself hadn't enabled R2 yet (`10042` after the scope was added) — both fixed by the human via
  the dashboard, confirmed live after each fix. Box stays open (`▶` stays) — the bindings now
  resolve, but the Terraform lifecycle TTL rule and the staging deploy are still outstanding.
  **Next concrete action:** author the `infra/` tree's R2 lifecycle rule (Terraform not yet
  installed on this machine), then `wrangler deploy --env staging`.
  **Blocker:** none — Terraform install/authoring is next, paused for confirmation per this
  item's established provisioning pattern.

- **2026-07-23** — **`infra/` Terraform tree authored — R2 lifecycle rule now exists as code,
  closing the design half of `09-edge/04-persistence-endpoints`'s last open criterion. `▶` stays:
  three provisioning steps remain and each needs real Cloudflare account resources or a local
  tool install this session deliberately didn't do without asking first.**
  **ADR-009 decided, from evidence, not left pending any longer.** The stub asked one question:
  R2 S3-compatible backend (native lockfile locking) vs. Terraform Cloud free tier. Checked
  Cloudflare's own R2 API docs and Terraform's S3-backend docs directly rather than assuming:
  Terraform's native `use_lockfile` (GA 1.10, Nov 2024) needs only a conditional `PutObject`
  (`If-None-Match`) to write a `.tflock` object — no DynamoDB-equivalent table — and R2's S3 API
  documents exactly that conditional-write support. (A real but irrelevant caveat surfaced
  alongside it: R2 has no S3 Object Lock/WORM support — a different, compliance-retention
  feature unrelated to what `use_lockfile` actually uses; worth naming so a future reader doesn't
  reopen this as a blocker.) Decided **R2-backed state** — one Cloudflare account to reason
  about, zero external dependency, matching this project's existing KV/R2 isolation-by-environment
  pattern — over Terraform Cloud. Human confirmed the recommendation via a clarifying question
  before it was recorded, same as the cors-relay pagination and vault session-id decisions above.
  **`infra/` bootstrapped** (`app/infra/`, sibling to `app/edge/`): `providers.tf` (Cloudflare
  provider + the R2-backed `backend "s3"`, `use_lockfile = true`, `required_version >= 1.10.0`),
  `variables.tf`, `r2.tf` (one parameterized `cloudflare_r2_bucket` + `cloudflare_r2_bucket_lifecycle`
  pair, 30-day `Age`-type delete transition — the same number §12.3 discloses), and
  `envs/{dev,prod}.tfvars` (bucket name is the one axis that differs; account id and R2
  backend credentials are supplied via `TF_VAR_…`/`-backend-config` at apply time, never
  committed, §23.1). Both existing buckets (`datascope-persistence`,
  `datascope-persistence-staging`, provisioned in the prior session) are adopted via Terraform
  `import` blocks rather than recreated. `.gitignore` extended for `infra/.terraform`,
  `*.tfstate`, and the backend-config file — `.terraform.lock.hcl` deliberately left committed
  (provider hashes, same reasoning as `package-lock.json`).
  **One real bug caught before it shipped, not by a test — by re-reading Terraform's own docs
  while writing `providers.tf`:** the first draft interpolated `var.cloudflare_account_id` into
  the backend's `endpoints` block; backend blocks are parsed before the rest of the configuration
  and cannot reference variables at all, so that block would have failed at `terraform init`
  outright. Fixed by moving the account-specific endpoint (and the R2 credentials) to partial
  configuration (`-backend-config=backend.hcl`, gitignored) supplied at init time instead of the
  checked-in file — which is also the more correct shape per §23.1 (nothing account- or
  credential-specific belongs in a committed `.tf` file).
  **Docs, master-first:** no `DATASCOPE.md`/Decision-Record edit — §23.3 already specced this
  fully; ADR-009 is a separate mechanism explicitly meant to be filled in from evidence once
  v0.5 infra work starts (D18), not a D-record entry, so no human re-authorization was needed to
  write it. `architecture/adr/009-terraform-state-backend.md` rewritten from stub to decided
  (Decision/Alternatives/Consequences/Spike-evidence sections, with links). Mirrored into
  `foundations/infrastructure.md` (State-backend bullet) and `build/09-edge/04-persistence-endpoints.md`
  (Files section, the TTL acceptance criterion, a stale "bucket doesn't exist yet" line fixed
  in the same pass since the buckets were in fact provisioned last session, and Definition of
  done rewritten to name exactly what's left).
  **Next concrete action — three provisioning steps, none blocked on a design question:**
  (1) install Terraform locally (not present on this machine); (2) `wrangler r2 bucket create
  datascope-terraform-state` + a bucket-scoped R2 API token, then `terraform init
  -backend-config=backend.hcl` and `terraform apply -var-file=envs/dev.tfvars` (repeat for
  `prod` in its own workspace) to actually land the lifecycle rule; (3) `wrangler deploy --env
  staging` to close the cross-device share-URL criterion. Confirm before running any of these —
  real Cloudflare account resources and the first `apply` against them, same pause pattern as
  every other provisioning step in this section.
  **Blocker:** none — paused for confirmation before touching real infrastructure, not stuck.

- **2026-07-23** — **The three provisioning steps left open on `09-edge/04-persistence-endpoints`
  are done: Terraform installed, both environments' R2 lifecycle rules applied for real, and a
  staging deploy serving a live cross-device save/get/delete round trip. `▶` moves to
  `07-connectivity/01-api-tier1-fetch`; the persistence-endpoints box stays open on one
  deliberately-deferred criterion (below).**
  **Terraform (1.15.8, via the `hashicorp/tap` — plain `brew install terraform` no longer works,
  HashiCorp pulled it from Homebrew core over licensing) installed; `datascope-terraform-state`
  bucket created (`wrangler r2 bucket create`).** `terraform init -backend-config=backend.hcl`
  against the R2 S3 backend succeeded; a `dev` and `prod` `terraform workspace` were created so
  the two environments' state never collide (matching `r2.tf`'s own comment). `terraform apply`
  ran clean in both — `dev` imported `datascope-persistence-staging`, `prod` imported
  `datascope-persistence`, each creating its `expire-after-30-days` lifecycle rule with 0 drift.
  Confirmed live with a direct R2 API read on both buckets afterward (not just trusting
  Terraform's own state): `enabled: true`, `Age` transition, `maxAge: 2592000`.
  **A credential design question came up mid-session, resolved and worth recording since it
  isn't obvious: does Terraform's R2 state backend need its own separate API token, or can it
  share the account's general-purpose one?** Answer: technically one token can do both — any
  Cloudflare Account API Token that includes an R2 permission group gets a derived S3-style
  Access Key ID/Secret Access Key alongside its bearer value, so the same token `wrangler` and
  the Cloudflare provider already use *could* supply `backend.hcl` too. This project uses **two**
  anyway, deliberately, per `providers.tf`'s own least-privilege comment (§23.1): the
  `backend.hcl` credential is scoped to R2 read/write on `datascope-terraform-state` only, kept
  separate from the account's general token (Entire Account: Workers R2 Storage/KV Storage/
  Scripts/AI) everything else uses — so a leak via a state file, CI log, or plan output caps at
  one bucket rather than the whole account. Human confirmed this tradeoff explicitly before
  proceeding ("as long as it's documented, move on").
  **One real incident while setting this up, logged so the next session doesn't repeat it:**
  attempting to reuse/narrow the account's *existing* general-purpose token in place (editing
  its policy down to test an R2-only scope, then deleting what looked like a stale duplicate)
  came within one step of leaving the project with no working `CLOUDFLARE_API_TOKEN` at all —
  every `wrangler`/Terraform call started failing with an invalid-token error, and enough retries
  while diagnosing it tripped Cloudflare's own auth-failure lockout (`code 10502`, temporary).
  Recovered by creating a fresh token with the original full permission set and updating
  `.env.local`, then a **third**, separately-named token (`datascope-tfstate`-shaped, R2-only on
  the one bucket) for `backend.hcl`. **Rule for future sessions: always create a new,
  separately-named token for a new credential need — never edit an existing token's policy in
  place**, even to "just test" a narrower scope.
  **`wrangler deploy --env staging` redeployed clean** (54.78 KiB, all bindings present
  including `PERSISTENCE_BUCKET` → `datascope-persistence-staging`); `/health` → 200. A live save
  → get → delete round trip against the public staging URL (not `wrangler dev`): save → token +
  deleteToken; get → the exact bytes back; a forged delete proof → `404` with the object intact;
  the correct proof → `{"deleted":true}`; the repeat get → `404` — the same shape a second
  device opening the share link would see, closing the cross-device acceptance criterion.
  **Docs:** no master/Decision-Record edit — this realizes what §12.3/§23.3/ADR-009 already
  specced, doesn't change it. `build/09-edge/04-persistence-endpoints.md` rewritten: the
  cross-device acceptance criterion checked with the staging-round-trip evidence above; the
  30-day-TTL criterion **stays unchecked on purpose** — the infrastructure is confirmed live via
  direct API read, but actually observing an object expire needs either waiting out the real
  30 days or standing up a separate short-TTL rule/bucket to watch a deletion fire, neither done
  this session; Definition of done rewritten to record all this plus the credential-design note.
  **Next concrete action:** `07-connectivity/01-api-tier1-fetch` (Sonnet). `06-ai/02-modes-byok`
  still separately waits only on the re-pointed Ollama live run; `09-edge/04-persistence-
  endpoints`'s box waits only on the short-TTL expiry observation, whenever a session wants to
  spend the time on it.
  **Blocker:** none.

- **2026-07-23** — **Short-TTL live-expiry observation for `09-edge/04-persistence-endpoints`
  started (not yet closed — this needs a wait, not more code).** Rather than waiting out the real
  30-day production rule, added a scratch lifecycle rule directly to the real
  `datascope-persistence-staging` bucket via `wrangler r2 bucket lifecycle add
  datascope-persistence-staging ttl-test-scratch ttl-test/ --expire-days 1` — deliberately done
  through `wrangler`, not `infra/r2.tf`, so this throwaway verification rule never enters the
  Terraform-owned config or risks being applied against the production `datascope-persistence`
  bucket. Uploaded a real remote test object at `ttl-test/marker.txt` (`wrangler r2 object put
  --remote`; confirmed downloadable byte-exact after upload). Cloudflare's lifecycle docs state
  objects are typically swept within ~24h of crossing their configured age, not instantly, so with
  a 1-day `max_age` the object is expected gone sometime in **2026-07-24T09:05:33Z –
  2026-07-25T09:05:33Z**, not immediately and not in 30 days.
  **Next concrete action:** in a future session (dated 2026-07-24 or later), run `wrangler r2
  object get datascope-persistence-staging/ttl-test/marker.txt --remote` — a 404/not-found
  confirms the sweep fired and closes this criterion; update
  `build/09-edge/04-persistence-endpoints.md`'s TTL acceptance criterion with that evidence and
  check `09-edge/04`'s box. Either way, clean up the scratch rule afterward with `wrangler r2
  bucket lifecycle remove datascope-persistence-staging ttl-test-scratch` (and delete the marker
  object if the sweep hasn't already removed it) so it doesn't linger on the staging bucket.
  Meanwhile the `▶` stays at `07-connectivity/01-api-tier1-fetch` (Sonnet) — this observation
  doesn't block it.
  **Blocker:** none — waiting on Cloudflare's own sweep, not stuck.

