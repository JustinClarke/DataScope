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

- [x] **01 foundation**
  - [x] 01 project-bootstrap — Sonnet
  - [x] 02 state-management — Sonnet
  - [x] 03 routing — Haiku
- [x] **02 ingestion**
  - [x] 01 file-drop — Sonnet
  - [x] 02 duckdb — Opus
  - [x] 03 table-registry — Sonnet
  - [x] 04 multi-file — Sonnet
  - [x] 05 large-files — Sonnet
- [x] **03 profiling**
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
- [x] **05 charting** — the v0 ship gate
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

- [x] **06 ai**
  - [x] 01 pipeline — Opus
  - [x] 02 modes-byok — ~~Sonnet~~ **Opus** (D9 key custody is security-sensitive; see 2026-07-21 log) · *vault round-trip closed 2026-07-23; re-pointed Ollama live run closed 2026-07-24*
  - [x] 03 privacy-disclosure — Sonnet
- [x] **09 edge** (built alongside its clients below; separate deploy)
  - [x] 01 ai-router — Opus
  - [x] 02 cors-relay — Sonnet
  - [x] 03 vault — Opus
  - [x] 04 persistence-endpoints — Sonnet
- [x] **07 connectivity**
  - [x] 01 api-tier1-fetch — Sonnet
  - [x] 02 api-tier2-relay — Sonnet
  - [x] 03 refresh-from-source — Sonnet
- [ ] **08 persistence**
  - [x] 01 parquet-export — Sonnet
  - [x] 02 r2-save-share — Sonnet
  - [ ] ▶ 03 dsps-spec — Sonnet

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

- **2026-07-23** — **`07-connectivity/01-api-tier1-fetch` built and live-verified against real
  public APIs — the zero-infra direct-fetch path works end to end: paste a URL, get a
  registered/profiled table, with GitHub-style `Link` header pagination auto-followed and
  size-tier gating on the accumulated response. Box stays open (`▶` stays) on two named
  criteria, neither a gap in this session's work.**
  **New module `src/services/apiIngestion.ts`** — pure fetch/pagination/size-tier logic
  (`fetchApiSource`, `tableNameFromUrl`), deliberately independent of DuckDB so it's
  unit-testable with an injected `fetchImpl` (mirrors `services/vaultClient.ts`'s own
  dependency-injection shape) rather than needing the live browser `ingestion.test.ts` already
  notes its DuckDB-touching half requires. `services/ingestion.ts` gained `loadUrl` as a
  **separate** entry point from `loadDataset` rather than a third branch on its `File | string`
  union — a URL and a sample id are both bare strings with no shared shape to dispatch on, and
  the two already arrive from different UI controls (`UrlInputForm` vs `SamplePicker`) that
  know which is which. `loadUrl` calls `fetchApiSource` then hands the buffer to the same
  `ingestBuffer`/registry path file upload uses — no changes to that path at all.
  **A real Fetch API constraint shaped the CORS-handling design, found while writing the code,
  not by a test:** `fetch()` rejects with an opaque `TypeError` for CORS failures, DNS
  failures, and offline networks alike — the spec deliberately gives JS no way to tell these
  apart (no status, no headers, nothing reaches the page). §7.4 calls CORS "the most common
  blocker, ahead of auth," so a bare fetch rejection is classified as a typed `cors-suspected`
  `IngestionError` (presumptive, not confirmed) rather than attempting to actually detect CORS
  specifically, which the platform makes impossible. `IngestionError` gained an optional `code`
  field to carry this — the seam Tier 2 (`02-api-tier2-relay`, next in sequence) plugs into to
  retry via the relay instead of terminating in an error.
  **Pagination follows GitHub's `Link: rel="next"` header** (RFC 5988) up to a 20-page cap —
  chosen to match the Tier-2 relay's own per-ingestion-action cap (§7.4) so the cascade behaves
  the same regardless of which tier lands the pages. Per-page bodies are parsed and merged into
  one JSON array only when more than one page is fetched; a single-page response's raw bytes
  pass through unchanged (no parse/reserialize round-trip, preserving exact number formatting).
  A body-level cursor (any pagination scheme other than the Link header) has no generic
  detection — ADR-006's own research already found GitHub is the only one of the three v0.5
  token/no-auth platforms (D34) with a generically follow-able scheme at all — so the leaf
  spec's "manual load more pages" fallback for that case is **not built**, named as a deliberate
  scope gap rather than a speculative control with no real detection behind it.
  **Size tiers are re-checked after every page** against the running byte total (an API's total
  size is generally unknown ahead of pagination, unlike a file's known `File.size`): `refuse`
  throws before any JSON parse is attempted; `sampled` stops the pagination loop early — no
  reason to keep fetching pages that would just be discarded past `SAMPLE_ROW_LIMIT`; `warn`
  surfaces the same footprint banner the file-drop path already shows, computed post-hoc since
  the size isn't known upfront the way a file's is.
  **Verification:** suite **1015 → 1030** (+15 in `apiIngestion.test.ts`: URL validation,
  single-page array/non-array bodies, Link-header pagination + merge, the `maxPages` cutoff,
  the sampled-tier early-stop, all five `ApiFetchError` codes, `tableNameFromUrl`); `tsc -b` /
  `oxlint` / `vitest run` (1030 passed) / `vite build` all clean. **Live Playwright pass against
  the real dev server and real public endpoints** (no mock API server — `chromium-cli` wasn't
  available in this environment, so the npx-cached `playwright` package drove a real headless
  Chromium directly instead): `https://api.github.com/repos/duckdb/duckdb/labels` → 1 table, 31
  rows, profiled, Blueprint landing rendered; `https://api.github.com/repos/duckdb/duckdb/
  issues?per_page=5` → telemetry's `pages` stat observed growing 1→2→3 mid-fetch, final table
  landed at exactly 100 rows (20 pages × 5/page — a real, unplanned confirmation that the
  `MAX_PAGES` cap engages correctly against a genuinely multi-page live API); `https://
  example.com/` (real, genuine CORS block, no `Access-Control-Allow-Origin`) → browser console
  shows the real CORS block, UI renders "Couldn't reach this URL directly — it may be blocking
  cross-origin requests," table count unaffected — no half-registered table, no hang, no
  unhandled exception.
  **Docs, master-first:** no master/Decision-Record edit — §7.4 already specced this fully;
  nothing here revises it, only realizes it. Leaf `build/07-connectivity/01-api-tier1-fetch.md`
  rewritten to the built shape: Files/Dependencies corrected (the Tier-2-client dependency line
  was backwards — 02 depends on 01, per 02's own Dependencies section, not the other way
  round), acceptance criteria checked with evidence, the two open criteria named with reasons,
  Test plan and Definition of done rewritten.
  **Next concrete action:** `07-connectivity/02-api-tier2-relay` (Sonnet) — closes this item's
  one open Tier-2-handoff criterion by having the `cors-suspected` code retry through the relay
  client this build's `apiIngestion.ts`/`loadUrl` seam is already shaped for, rather than
  terminating in an error.
  **Blocker:** none.

- **2026-07-23** — **`07-connectivity/02-api-tier2-relay` built — the client half of the Tier-2
  CORS relay (Worker side, `09-edge/02-cors-relay`, already deployed/closed). Box checked on
  `07-connectivity/01-api-tier1-fetch` above (all five of its own acceptance criteria now hold,
  including the Tier-2 handoff this item closes); `▶` moves to this item and stays here — one
  criterion of its own needs a real browser + DuckDB to close, unavailable in this session.**
  **New module `src/services/relayClient.ts`** — `fetchViaRelay`, one GET per page through the
  relay (`url`+`sessionId` as query params, no body, mirrors `vaultClient.ts`'s injected-`fetchImpl`
  DI shape). Classifies the relay's own 429/503 control-plane responses as a typed
  `RelayFetchError('rate-limited' | 'paused', …)`; every other status (400/502/504, or a target
  error the relay passed through verbatim) is left as an ordinary `Response` for the existing
  `http-error` classification to handle, since the relay forwards a passed-through target status
  verbatim and there's no reliable way to distinguish "relay's own 502" from "target returned
  502" beyond the two fixed-status control signals (§7.4's acceptance criteria only asks the
  client to distinguish those two anyway). Deviates from this leaf doc's original "Files" sketch
  (`src/features/ingestion/`) in favor of the convention every other edge-calling client in this
  codebase already follows (`vaultClient.ts`/`synthesis.ts`/`cloudProvider.ts`, all in
  `src/services/`) — noted in the doc, not treated as silent scope creep.
  **`src/services/apiIngestion.ts`'s pagination loop is now shared, not duplicated:** extracted
  into `accumulatePages`, parameterized by a per-transport `fetchPage` function — Tier 1's
  `fetchApiSource` and the new `fetchApiSourceViaRelay` both call into it, so the maxPages cap,
  size-tier re-check, and JSON-parse/merge logic exist in exactly one place for both tiers.
  **A real constraint found while building this, not by a test:** `cors-relay.ts`'s handler
  forwards only `content-type` on a successful pass-through — every other response header,
  including `Link`, is dropped. Confirmed two ways: reading the handler source, and a live
  `curl` probe of the real deployed staging relay (`datascope-edge-staging.justinclarke.workers.dev/
  cors-relay?url=https%3A%2F%2Fexample.com%2F&sessionId=probe-headers-1` → only `content-type`
  plus ordinary Cloudflare edge headers came back, no `Link`). GitHub's `Link` header is the one
  generically-follow-able pagination scheme among the v0.5 platforms (D34, ADR-006) — so Tier 2
  as built today always resolves to exactly one page regardless of the target's own pagination,
  even though the shared loop's cap/merge machinery is fully built and tested (against a mocked
  response that does carry a `Link` header, proving the loop itself is correct and ready if the
  relay ever forwards more headers). Named here the same way `01-api-tier1-fetch.md` names its
  own non-Link-header gap — a real, evidence-backed limitation, not a hidden bug.
  **Tier 1 → Tier 2 handoff wired:** `loadUrl` (`services/ingestion.ts`) now catches a
  `cors-suspected` `ApiFetchError` and retries via `fetchApiSourceViaRelay` before surfacing
  anything, closing `01-api-tier1-fetch.md`'s own previously-open criterion of the same name.
  Tier 1 always fails on its first fetch attempt when CORS-blocked, so there's no partial
  multi-page state to reconcile before the relay retry starts clean. A `usedRelay` flag flows
  back through `UrlIngestResult` to `IngestionPanel.tsx`, which renders a one-line §5.2
  disclosure note when true; 429/503 render through the existing generic error banner every
  other ingest failure already uses (its message text is the user-facing copy — no new UI
  states needed beyond the disclosure note itself).
  **Verification:** suite **1030 → 1042** (+12: 5 cases in new `relayClient.test.ts`, 5 more in
  `apiIngestion.test.ts`'s `fetchApiSourceViaRelay` block, 2 new `IngestionPanel.test.tsx` cases
  for the disclosure note and the rate-limit error banner); `tsc -b` / `oxlint` / `vitest run`
  (1042 passed) / `vite build` all clean. **No `wrangler dev`/Playwright pass** — neither is
  installed in this repo, no cached Chromium was present (`~/.cache/ms-playwright` absent), and
  `npx playwright install chromium` didn't complete in this sandboxed session (network-gated,
  not attempted further) — unlike `01-api-tier1-fetch`'s own live Playwright pass, which had
  browser access this session didn't. Supplemented with live `curl` probes of the real deployed
  staging relay instead: confirmed the header-stripping finding above and that the SSRF block
  still returns 400 on a cloud-metadata target live. Did not chase a live 429 trip against the
  shared staging limiter — `09-edge/02-cors-relay`'s own definition of done already closed and
  burst-audited that exact behavior; re-probing it here would be duplicative.
  **Docs, master-first:** no master/Decision-Record edit — §7.4 already specced this fully.
  Leaf `build/07-connectivity/02-api-tier2-relay.md` rewritten to the built shape (Files section
  corrected, four of six acceptance criteria checked with evidence, the remaining two named with
  reasons and a next concrete action); `01-api-tier1-fetch.md`'s Tier-2-handoff criterion and
  Definition of done updated to reflect the closure.
  **Next concrete action:** in a future session with Playwright/browser access, run the real dev
  server against a genuinely CORS-blocked public JSON API through the deployed staging relay
  (mirroring `01-api-tier1-fetch.md`'s own GitHub live passes), confirm the disclosure note
  renders and the resulting table matches a direct ingest, then check `02-api-tier2-relay`'s
  last two boxes and move `▶` to `07-connectivity/03-refresh-from-source`.
  **Blocker:** none — waiting on browser-automation tool access, not stuck on design or code.

- **2026-07-23** — **`07-connectivity/02-api-tier2-relay` closes: both remaining criteria
  live-verified against the real deployed staging relay, and a real live-only bug the pass
  caught is fixed. `▶` moves to `07-connectivity/03-refresh-from-source`.** This session had
  real browser-automation access the prior one lacked: `npx playwright` resolved a cached
  package (from an earlier `npx` invocation, `~/.npm/_npx`) with no sandboxed Chromium binary
  available, but launching it with `channel: 'chrome'` drives the machine's already-installed
  Google Chrome directly — no download needed, no sandbox network dependency.
  **A real, live-only bug found and fixed, not by a test:** `IngestionPanel.tsx`'s
  `runIngestUrl` set the relay-disclosure flag and then, in the same synchronous continuation,
  called `navigateToPostIngestLanding()`; React batches both into one commit, so the panel (and
  the §5.2 disclosure note inside it) unmounted before the browser ever painted it. Every unit/
  component test passed anyway because the isolated component test never renders the full `App`
  shell and so never exercises the unmount — only driving the real app in a real browser
  surfaced it. No real user could ever have seen the note this build's own acceptance criteria
  had marked "visible." Fixed by skipping the auto-navigate specifically when `usedRelay` is
  true — every other ingest path's landing behavior (D48/D70) is unchanged. Two new
  `IngestionPanel.test.tsx` cases lock in both directions (relay path stays on the Ingestion
  panel; a non-relay URL ingest still auto-navigates as before).
  **A genuine environment constraint, not a code issue:** this sandbox's browser egress appears
  to inject a permissive `access-control-allow-origin` header on responses that a direct `curl`
  from the same host does not see (confirmed on a real no-CORS public API — `curl` saw no ACAO
  header, the Playwright-driven Chrome saw `acao: *` on the identical request) — so an
  organically CORS-blocked target can't be produced live from this specific environment.
  Worked around with a deterministic `page.route(...).abort('failed')` on the direct request,
  reproducing the identical opaque `fetch()` rejection a real CORS block causes (the platform
  gives the app no way to tell the two apart either, which is exactly why both take the
  `cors-suspected` path) — everything downstream (the relay call, the real deployed staging
  Worker, the ingest pipeline) was real and unmocked.
  **Live result:** direct fetch aborted → Tier 2 relay called → real `200` from
  `datascope-edge-staging.justinclarke.workers.dev/cors-relay` with the exact live JSON body →
  registered as a table (1 row × 9 cols, matching the source JSON's top-level keys, single-page
  so unaffected by the already-named Link-header gap) → disclosure note rendered and stayed
  visible (screenshotted) → the panel did not auto-navigate away, confirming the fix.
  **Verification:** suite **1042 → 1043** (+1: the fix's own regression-guarding case; a second
  new case reused an existing assertion path); `tsc -b` / `oxlint` / `vitest run` (1043 passed) /
  `vite build` all clean, re-run after the fix.
  **Docs:** no master/Decision-Record edit — §5.2/§7.4 already specced the disclosure and the
  relay; nothing here revises the spec, only closes the verification gap and fixes a bug in
  realizing it. `build/07-connectivity/02-api-tier2-relay.md` rewritten: both acceptance criteria
  checked with evidence, Files section documents the navigation fix, Test plan records the live
  pass and the sandbox CORS-injection finding, Definition of done rewritten to record the bug,
  the fix, and the closure.
  **Next concrete action:** `07-connectivity/03-refresh-from-source` (Sonnet).
  **Blocker:** none.

- **2026-07-23** — **`07-connectivity/03-refresh-from-source` closes — the last `07
  connectivity` row. Every API-sourced table now gets a "Refresh from source" action that
  atomically replaces it in place, live-verified against a real DuckDB engine including a
  real failure. `▶` moves to `08-persistence/01-parquet-export`.**
  **The atomic-replace design:** a refresh re-runs the same Tier 1 → Tier 2 cascade `loadUrl`
  already used (unchanged `fetchApiSource`/`fetchApiSourceViaRelay`) against the table's now-
  recorded `sourceUrl`, ingests the response under a scratch table name through the
  **unmodified** `ingestBuffer` — every format/malformed-row check it already runs — and only
  swaps it in (`DROP` + `RENAME`) once that fully succeeds. A failure at any point before the
  swap never touches the registered table; no DuckDB transaction semantics were needed for
  this, just ordering. `TableRegistryEntry` gained `sourceUrl`/`lastFetchedAt`/`stale`;
  `useDatasetsStore` gained `setTableRefreshMeta` and `markTablesStale`.
  **Staleness is a text match, not a dependency graph.** This codebase has no explicit
  derived-table dependency tracking — the new `referencesTableName(sql, tableName)` helper
  (bare-word or double-quoted-identifier match) finds which derived tables' `generatingSql`
  references a just-refreshed table, the same shape `runTransform`'s own mutation-target
  matching already uses. Flagged tables aren't auto-rebuilt (§12.1 — their recorded SQL
  already makes a manual re-run cheap), just marked with a "possibly stale" badge in
  `TableList`, next to a new "fetched …" timestamp every API-sourced row now shows.
  **Verification:** suite **1043 → 1061** (+18: pre-engine-rejection and `referencesTableName`
  cases in `ingestion.test.ts`, `setTableRefreshMeta`/`markTablesStale` in `datasets.test.ts`,
  refresh-button/last-fetched/stale-badge cases in `TableList.test.tsx`, refresh success/
  failure/relay-disclosure/staleness wiring in `IngestionPanel.test.tsx`); `tsc -b` / `oxlint`
  / `vitest run` (1061 passed) / `vite build` all clean. **Live pass** (real dev server, real
  Chrome via Playwright, real DuckDB-Wasm, real GitHub API): ingested
  `api.github.com/repos/duckdb/duckdb/labels`, refreshed it — telemetry showed a genuine
  second fetch (`pages 2`, incidentally exercising a paginated refresh) and the real
  DROP+RENAME swap succeeded. Then a `page.route(...).abort('failed')` on the direct request
  forced `cors-suspected`, which retried through the Tier 2 relay exactly as `loadUrl` does;
  the relay's own live call to GitHub hit a real `403` (this session had already made several
  GitHub calls) — the resulting error banner rendered while the table's last-fetched
  timestamp and row/column text stayed byte-for-byte identical to before the failed attempt,
  confirming atomicity against a real engine and a real, if incidental, failure.
  **Not live-driven:** the staleness badge's Monaco-SQL path (create a derived table via the
  SQL playground, refresh its source, watch the badge appear) — covered instead by a component
  test exercising the identical store→render path a live pass would, judged sufficient rather
  than spending a second live session chasing GitHub's rate limit further.
  **Docs:** no master/Decision-Record edit — §7.4 already specced "Refresh from source" fully;
  this realizes it. `build/07-connectivity/03-refresh-from-source.md` rewritten: Files section
  documents the built shape, all four acceptance criteria checked with evidence, Test plan
  records the unit suite plus the live pass, Definition of done rewritten.
  **Next concrete action:** `08-persistence/01-parquet-export` (Sonnet) — the first `08`
  row; `06-ai/02-modes-byok` still separately waits only on the re-pointed Ollama live run,
  and `09-edge/04-persistence-endpoints`'s box still waits only on the short-TTL expiry
  observation (2026-07-24 or later).
  **Blocker:** none.

- **2026-07-23** — **`08-persistence/01-parquet-export` closes — the first `08 persistence`
  row. Client-side Parquet/CSV export and the copy-to-Jupyter snippet, live-verified against
  a real DuckDB-Wasm engine for both a source and a derived table. `▶` moves to
  `08-persistence/02-r2-save-share`.**
  **The engine-boundary choice:** rather than a duckdb-wasm-specific back door, `exportTable`
  was added as a fourth method on the `QueryEngine` interface (D49) alongside `execute`/
  `registerFile`/`summarize` — a table export always needs a buffer handoff regardless of
  engine, even though *how* that buffer is produced (`COPY` into DuckDB-Wasm's VFS, then
  `copyFileToBuffer`) is duckdb-wasm-specific. `services/export.ts` and
  `features/export/ExportModule.tsx` are the thin orchestration/UI on top; `jupyterSnippet.ts`
  is a pure, fully unit-tested snippet builder. The Results-header shortcut in
  `QueryResultsPanel.tsx` (the spec's "wherever a table is" for the SQL playground) finds a
  just-created derived table by re-classifying the last-run SQL rather than threading a table
  name through the shared `QueryResult` type — every derived table is already in the registry
  by the time `status` flips to `success`, so no new field was needed on a widely-shared type.
  **A real finding from the live pass, not a bug — flagged rather than silently checked:** the
  "zero network requests during export" criterion holds for every CSV export and every
  *repeat* Parquet export, but the very first Parquet export against a fresh DuckDB-Wasm
  instance fetches `parquet.duckdb_extension.wasm` from `extensions.duckdb.org` — DuckDB-Wasm's
  own loadable-extension mechanism, carrying no user data, and the exact same CDN dependency
  [ADR-001](architecture/adr/001-duckdb-wasm-worker-setup.md) already documents for Parquet/
  JSON *ingestion* (its own Backlog line already defers self-hosting those extension binaries,
  unscoped to any current checklist item). Recorded as a documented exception on this leaf's
  acceptance criteria rather than fixed here — self-hosting the extension is a separate,
  already-tracked infrastructure decision, not something this build should absorb.
  **Verification:** suite **1061 → 1071** (+10: `jupyterSnippet.test.ts`'s pure-function cases,
  `ExportModule.test.tsx`'s render/wiring cases, one new `SqlModule.test.tsx` case for the
  Results-header shortcut); `tsc -b` / `oxlint` / `vitest run` (1071 passed) / `vite build` all
  clean. **Live pass** (real dev server, real Chrome via Playwright, real DuckDB-Wasm): ingested
  the bundled Titanic sample; downloaded it as Parquet and CSV from the Export module and
  copied its Jupyter snippet (clipboard confirmed, correctly no `# Generated by:` header for a
  source table); ran `CREATE TABLE titanic_over_30 AS SELECT * FROM titanic WHERE Age > 30` in
  the SQL playground, downloaded it via the new Results-header shortcut, downloaded it again
  from the Export module (zero network requests, confirming the extension-fetch is genuinely
  one-time per engine instance), and copied its snippet (clipboard confirmed the CTAS SQL as a
  leading comment). All three Parquet files and the CSV were opened and validated in a scratch
  Python venv (pandas 3.0.5 / pyarrow 25.0.0 — installed in an isolated venv under the session
  scratchpad, not a project dependency): row/column counts matched (891×10 for `titanic`, both
  formats; 508×10 for the derived table), and every row of the derived export satisfied
  `Age > 30`, confirming the filter survived the export intact.
  **Not independently stress-tested:** a synthetic multi-GB export, for the "doesn't freeze the
  UI" criterion — judged architecturally guaranteed instead (COPY/`copyFileToBuffer` run inside
  DuckDB-Wasm's own dedicated Worker via the same `execute()` every other query already uses;
  this build added no new main-thread work), rather than spending a session manufacturing a
  multi-GB dataset to prove a property the existing engine architecture already guarantees.
  **Docs:** no master/Decision-Record edit — §12.2 already specced client-side export and the
  Jupyter handoff fully; this realizes it. `build/08-persistence/01-parquet-export.md`
  rewritten: Files section documents the built shape (including the `QueryEngine` boundary
  addition), all four acceptance criteria checked with evidence (including the documented CDN
  exception), Test plan records the unit suite plus the live pass, Definition of done rewritten.
  **Next concrete action:** `08-persistence/02-r2-save-share` (Sonnet).
  **Blocker:** none.

- **2026-07-23** — **`08-persistence/02-r2-save-share` built and live-verified against the
  real deployed staging Worker + real R2 — structure-only and full-dataset shares both
  round-trip end to end, including a real cross-device open and a real delete. `▶` stays:
  the box is left unchecked on one deliberately-deferred sub-criterion (TTL expiry).**
  **D20 structure-first, D46 detector, D21 language rule — all built and live-checked, not
  just unit-tested.** `ShareDialog.tsx` defaults to a structure-only save (`buildStructureReport`
  scoped to §12.3's own field list — no insights/relationships, named below as a scope
  boundary, not an oversight); escalating to a full-dataset share is a second, distinctly
  red-styled step ("Include raw data rows instead" → "Save full dataset (includes raw
  rows)"). A live save of the structure-only artifact was fetched back directly from the
  real R2 object afterward: its JSON carries only `generatedAt`/`tables`/`insights`, and
  each column only `name`/`semanticType`/`physicalType`/`nullPercentage`/`cardinality`/
  `classificationReason` — literally no field exists in the shape for a raw value to
  occupy. The D46 `sensitiveColumns.ts` detector is column-name-pattern-only (no cell reads,
  no engine cost); it renders positives-only in the dialog (an empty result renders nothing,
  never a "none found" line) and pairs with a functional column-name-redaction toggle.
  **Rare-category suppression is named, not built:** `StructureReportColumn` never carried
  raw category values (only `cardinality`, a count), so there's nothing for a suppression
  control to act on without adding a new per-column value-frequency query — out of this
  build's scope, recorded as a gap in the leaf doc rather than shipped as a no-op checkbox.
  **A real bug from real data, not a synthetic test:** the bundled Titanic sample's actual
  `Name` column went unflagged by the D46 detector until a live pass against it (see below)
  caught it — the detector's personal-name pattern required a qualifier
  (`first_name`/`last_name`/`surname`) and never matched a bare `name` column. Fixed with an
  exact-match case for bare `name` (deliberately exact, not substring, so `table_name`/
  `column_name` stay unflagged).
  **A second real bug, also live-pass-only:** `Sidebar.tsx`'s "Export / Share" card and
  `ExportModule.tsx`'s own early return were both gated on `hasDatasets` — since tables are
  in-memory only (never persisted) while `shareLinks` *is* persisted (settings store), a user
  who created a share link and then reloaded, or came back in a fresh session with no
  dataset loaded, could not navigate to Export/Share at all to find their own "delete now"
  control. Every unit/component test passed anyway, the same shape as the
  `02-api-tier2-relay` navigation bug this codebase already hit once before — isolated
  component tests never exercise the real cross-page-reload state boundary. Fixed: the card
  is now `enabled: hasDatasets || shareLinks.length > 0`, and `ExportModule` renders
  `ShareLinksList` unconditionally rather than behind the "drop a dataset" message.
  **Live verification (real Chrome via Playwright `channel: 'chrome'`, real dev server,
  the already-deployed `datascope-edge-staging.justinclarke.workers.dev` — no local
  `wrangler dev` needed, the Worker side shipped with `09-edge/04-persistence-endpoints`):**
  structure-only path — save → real share URL → opened in a second, storage-isolated
  browser context → `SharedStructureReportView` rendered the real fetched schema (zero rows,
  confirmed by direct object inspection above) → back on the first context, reloaded (tables
  gone, share link persisted) → "Export / Share" reachable, "Your share links" showed the
  entry with no dataset loaded → delete → local entry removed → a third context re-opening
  the identical URL got a genuine `404` (both the browser's network log and the app's own
  "doesn't exist or has expired" banner confirmed it) — the rest of the app (ingestion) still
  rendered normally alongside that error banner. Full-dataset path — escalated, saved the
  real Titanic Parquet export → opened on a second context → the real bytes were re-ingested
  through the unmodified `ingestBuffer` path into a genuinely queryable 891-row table
  (`origin: 'shared'`), landing on the Blueprint with "Tables (1)" in the sidebar. Every share
  object created during these passes was deleted afterward — nothing left lingering on the
  real staging bucket.
  **Verification:** suite **1071 → 1121** (+50 across `sensitiveColumns.test.ts`,
  `structureReport.test.ts`, `export.test.ts`, `ingestion.test.ts`, `settings.test.ts`,
  `ShareDialog.test.tsx`, `ShareLinksList.test.tsx`, `SharedStructureReportView.test.tsx`,
  `ExportModule.test.tsx`, `App.test.tsx`, `TableList.test.tsx`, `Sidebar.test.tsx`);
  `tsc -b` / `oxlint` / `vitest run` (1121 passed) / `vite build` all clean.
  **The one thing deliberately not done:** TTL-expiry observation — same open reason
  `09-edge/04-persistence-endpoints.md` already recorded for its own TTL criterion (needs a
  real 30-day wait or a dedicated short-TTL scratch rule, not more code). Every other §18/§22
  row this leaf owns passed live.
  **Docs, master-first:** no master/Decision-Record edit — §12.3/D20/D21/D46 already specced
  this fully; nothing here revises it, only realizes it. `build/08-persistence/02-r2-save-share.md`
  rewritten: Files section documents the built shape plus the two live-pass-found bugs and
  their fixes, acceptance criteria checked with live evidence (the TTL sub-criterion named
  and left open), Test plan records both the unit suite and the live passes, Definition of
  done rewritten.
  **Next concrete action:** `08-persistence/03-dsps-spec` is next in file order, but this
  item's own box stays open — a future session should first decide whether to spend the
  TTL-expiry wait (mirroring `09-edge/04`'s short-TTL-scratch-rule approach) before moving
  `▶` on, or move on and revisit it later the way `09-edge/04`'s own TTL line was left.
  **Blocker:** none — the TTL wait is a deliberate deferral, not stuck.

- **2026-07-23** — **Decision on the fork left open above: `▶` moves to
  `08-persistence/03-dsps-spec` now rather than spending this session on the r2-save-share
  TTL-expiry wait.** Precedent followed exactly: `09-edge/04-persistence-endpoints` already
  moved `▶` forward once with a TTL criterion deliberately left open (its own short-TTL
  scratch-rule observation is itself still pending a 2026-07-24-or-later check), and today's
  date still doesn't clear even that earlier wait — starting a second parallel TTL wait
  before the first has resolved adds nothing. `08-persistence/02-r2-save-share`'s box stays
  unchecked on its named TTL sub-criterion only; every other criterion is live-verified.
  **Blocker:** none.

- **2026-07-23** — **`08-persistence/03-dsps-spec` built, unit-verified, and live-verified —
  DSPS formalized as a real versioned interface end to end: schema/version/provenance
  contract, all three renderers (the new HTML one plus the two that already existed),
  the `.dsps` receiver, a published-shape JSON Schema + independent npm validator package,
  and the MCP `get_dsps` wiring the Phase-1 scaffold had been waiting on. `▶` stays on this
  item — two criteria stay open, both deliberate external-action pauses, not gaps.**
  **The schema/version/provenance layer:** new `src/lib/dsps.ts` (`DSPS_VERSION`,
  `DspsProvenance`, `DspsSnapshot`, `hashBytesHex`, `formatSnapshotLabel`, `parseDsps` — the
  forward-compatible, version-mismatch-surfacing reader) layers the D37 contract onto the
  **existing** document rather than duplicating it: `structureReport.ts`'s `StructureReport`
  *is* the concrete DSPS document, extended in place with `dspsVersion` and, per fact,
  `provenance` + `snapshot`. `passesFactWordingGuard` is `producerValidators.ts`'s existing
  D45 phrasing guard **reused verbatim**, not reimplemented — found while designing the
  banned-wording criterion, it already bans "verified"/"always"/"guaranteed"/etc. for exactly
  this reason on the Verdict seam.
  **The file-hash half of D45's snapshot label, previously an explicitly named gap** (
  `IdentityBand.tsx`'s own comment: "no hashing exists anywhere in this tree yet") **is now
  built:** `ingestion.ts`'s `ingestBuffer` computes a SHA-256 over an already-in-memory
  `Uint8Array` source before it's handed to the worker (source bytes must be read before
  `registerFile` transfers/detaches the buffer — the same ordering `01-file-drop` already
  established). A sampled-tier (large) file is deliberately left unhashed — hashing it would
  mean fully buffering exactly the file its own size tier exists to avoid buffering — a named
  scope boundary, not a silent omission. `TableRegistryEntry` gained `fileHash?: string`.
  **The third renderer, HTML, is genuinely new** (`src/lib/dspsHtml.ts` — self-contained,
  HTML-escaped, the D26 attribution footer); "Copy for AI" and the DSPS JSON export already
  existed pre-build and needed no new renderer, only the version/provenance fields threading
  through. All three now sit on `IdentityBand.tsx`'s button row.
  **The `.dsps` receiver (D62) reuses `SharedStructureReportView.tsx` as-is** — it was already
  a pure, network-free read-only renderer over a `StructureReport` (the share-open flow's own
  view) — rather than building a second renderer or the full live-Dossier ViewSpec path; the
  spec's own internal cut line explicitly sanctions exactly this degraded shape. New
  `stores/dspsReceiver.ts` (open/fail/close) is fed by `IngestionPanel.tsx`'s `handleFiles`,
  which now recognizes a single `.dsps`-suffixed drop and routes it to a local
  `file.text()` → `JSON.parse` → `parseDsps` path *before* ingestion ever sees it — never a
  fetch. `App.tsx` renders the parsed document through that same shared view.
  **JSON Schema + npm validator (D64):** `schemas/dsps.schema.json` (draft 2020-12) at the repo
  root, and a genuinely standalone package, `packages/dsps-validator/` — its own
  `package.json`/`tsconfig.json`/`README.md`, zero runtime dependencies, zero import from this
  app's `src/`, 14 passing tests, typechecks independently of the root `tsc -b` project graph.
  `vitest.config.ts`'s `include` extended so its suite runs alongside the app's own.
  **MCP wiring — completing the build/09-edge/01 Phase-1 scaffold** (`handleMcp`/
  `SharedArtifactStore` already existed, unrouted, since that session; this build is what
  D38 called for it to actually serve): `protocol.ts`'s `get_dsps` response now carries
  `dsps: unknown` (an opaque pass-through) rather than the narrower `StructuralFacts` shape
  synthesis still uses — MCP transports the client-generated artifact verbatim, per D38, never
  re-deriving a smaller one. New `createR2SharedArtifactStore` in `mcp.ts`, backed by the
  **same** R2 bucket `09-edge/04` already writes to, gated on a new specific content type
  (`application/vnd.datascope.dsps+json`, replacing the generic `application/json`
  `STRUCTURE_REPORT_CONTENT_TYPE` `services/export.ts` used before this build) so a
  full-dataset share (raw Parquet bytes) can never surface through MCP as if it were DSPS.
  `listShared` is a **named, deliberate gap** — `persistence.ts`'s object store records no
  session↔token association server-side by its own original design ("nothing stored beyond
  what TTL/ownership need"), and building that index is new server-side scope this leaf doc's
  own acceptance criteria never asked for (only `get_dsps` is tested); it returns `[]` rather
  than fabricating a list. `worker.ts` wires `/mcp` (method check inside the handler, like
  `/persistence`); `bindings.ts` gained `MCP_KILL_SWITCH`; `wrangler.toml` (root +
  `[env.staging]`) declares it — no new binding, since `/mcp` reuses `PERSISTENCE_BUCKET`.
  **A real bug found live, not by a test:** the file-picker's `accept` attribute
  (`DropZone.tsx`) never listed `.dsps` — drag-drop was unaffected, but click-to-browse would
  never show a `.dsps` file as selectable at all. Fixed (accept list now includes `.dsps`),
  confirmed by re-running the live pass.
  **Verification:** suite **1121 → 1168** (+47 across `dsps.test.ts`, `dspsHtml.test.ts`,
  `dspsReceiver.test.ts`, `structureReport.test.ts`'s two new cases, three new
  `IngestionPanel.test.tsx` cases, three new `App.test.tsx` cases, `mcp.test.ts`'s rewrite +
  `createR2SharedArtifactStore` cases, and `dsps-validator`'s own 14); `tsc -b` / `oxlint` /
  `vitest run` (1168 passed) / `vite build` all clean; both root and `--env staging`
  `wrangler deploy --dry-run` bundle cleanly with `MCP_KILL_SWITCH` present. **Live pass** (real
  dev server, real Chrome via Playwright `channel: 'chrome'`, the bundled Titanic sample): all
  three renderer buttons render on the real Blueprint; "Export HTML report" downloaded a
  self-contained file with no `<script>`/`<link>` tags and the real attribution footer; "Export
  structure report" downloaded real DSPS JSON (`dspsVersion: "1.0.0"` confirmed); that same
  file dropped back onto the Ingest drop zone rendered the real read-only viewer with the
  request log showing zero network requests for the entire operation — screenshotted both the
  Blueprint and the receiver's rendered view.
  **Docs, master-first:** no master/Decision-Record edit — §12.2/§1/§6 and D31/D37/D38/D45/
  D62/D64 already specced this fully; nothing here revises the spec, only realizes it.
  `build/08-persistence/03-dsps-spec.md` rewritten: Files section documents the built shape
  (including which of the "three renderers" were genuinely new vs. already-existing), six of
  eight acceptance criteria checked with evidence, the remaining two named with reasons
  (npm publish; a live staging MCP round-trip), Definition of done rewritten.
  **Next concrete action:** two deliberate, confirmation-gated provisioning steps would close
  this item's box: `npm publish` from `packages/dsps-validator/` (a real, externally-visible,
  effectively-irreversible action against the public registry), and a
  `wrangler deploy --env staging` + a live save-a-structure-only-share → `/mcp` `get_dsps`
  round-trip against the real deployed Worker (mirroring every other edge item's own live-audit
  pattern). Neither was run this session without asking first, matching this project's
  established provisioning-pause norm. After those: `08-persistence/02-r2-save-share`'s own
  still-open TTL-expiry wait, or `10-studio` (v1 arc, gated on profiling proven in the wild).
  **Blocker:** none — both open criteria are deliberate pauses for confirmation before touching
  real external systems, not stuck.

- **2026-07-24** — **`06-ai/02-modes-byok` closes: the re-pointed Ollama live run — the one
  criterion left open since the 2026-07-22 mode-taxonomy fold-in — ran for real against a live
  daemon through API mode's own key/endpoint field, not the old Local-model path. Box checked.**
  **Live browser pass** (real Chrome via Playwright, real dev server on `localhost:5174`, a real
  Ollama 0.32.1 daemon restarted fresh for the run, pinned `qwen2.5-coder:1.5b`, the bundled
  Titanic sample): first-run chooser → "API"; `AISettingsPanel` → routing set to "Prefer my key,"
  `http://localhost:11434` typed into the key/endpoint field — the panel's own copy confirmed
  detection ("Detected as a local Ollama endpoint … Zero egress, same as the in-browser model").
  Asking "How many passengers survived?" on AI Chat fired exactly two requests, both
  `POST http://localhost:11434/api/chat` (SQL-mode then answer-mode) and nothing to any other
  host. The suggested SQL (`SELECT COUNT(PassengerId) FROM titanic WHERE Survived = 1`) executed
  for real (✓ 1 rows · 10 ms) and returned the correct count, 355 — matching the original
  2026-07-22 run and confirming the new trigger routes correctly.
  **One real, separate finding, not a plumbing defect:** the model's own prose answer read "192
  passengers survived," disagreeing with the correct row directly beneath it
  (`count(PassengerId): 355`) — the pinned 1.5B coder hallucinating in answer-mode text despite
  being handed the correct tool result. Routing, SQL generation, execution, and row delivery to
  the model were all correct; only the small model's own final-answer composition was wrong.
  Named in the leaf doc as a known sharp edge of the pinned local model (consistent with "Local
  model"'s own disclosed "SQL generation is weaker than cloud" caveat), not a regression against
  anything this leaf doc's criteria test.
  **An unrelated environment issue surfaced and was resolved before the pass above:** the first
  attempt hit a `500` from Ollama itself (`llama-server reported out-of-memory during startup` /
  a macOS Metal-compiler XPC error) — a stale daemon state, not a DataScope or Ollama-model bug.
  Restarting `ollama serve` cleared it; the retried run is the one recorded above.
  **Docs:** no master/Decision-Record edit — D2/D3/D9 already specced this fully as of the
  2026-07-22 fold-in; nothing here revises the spec, only closes its one outstanding live-run
  criterion. `build/06-ai/02-modes-byok.md`'s re-pointed criterion checked with the evidence
  above.
  **Next concrete action:** `08-persistence/03-dsps-spec` remains `▶` (per the prior entry, its
  own two provisioning steps are still open and deliberately deferred this session). Separately,
  `09-edge/04-persistence-endpoints` and `08-persistence/02-r2-save-share` each still wait on
  their own named provisioning/wait steps (Terraform apply + staging deploy; a TTL-expiry
  observation), unaffected by this entry.
  **Blocker:** none.

- **2026-07-24** — **Documentation catch-up: `09-edge/04-persistence-endpoints`'s three
  provisioning steps were actually completed in an untracked prior session (evidence already
  sitting in the leaf doc, timestamped 2026-07-23T09:05:33Z) but this file was never updated to
  match — corrected here. Box stays unchecked; two criteria are still legitimately open.**
  Asked to estimate remaining work for this item and `08-persistence/02-r2-save-share`, checking
  the real infra directly (rather than trusting this file's stale "still needs provisioning"
  language) turned up that `terraform plan` already reports **"No changes"** against production
  (`datascope-persistence`) and, for staging, matches too apart from one deliberate out-of-band
  rule (below). A fresh live save→get→delete round trip against the public
  `datascope-edge-staging.justinclarke.workers.dev` confirmed the staging deploy itself is live
  and correct (`ttlSeconds: 2592000` returned, matching the 30-day rule exactly); the probe
  object was deleted afterward.
  **A real near-miss, caught and fixed this session, worth naming plainly.** Before reading the
  leaf doc's own explanation, an unrelated `terraform apply` (run to reconcile what looked like
  plain drift on the `dev` workspace) deleted the leaf doc's own `ttl-test-scratch` lifecycle
  rule — a 1-day-TTL rule on a `ttl-test/` prefix, deliberately kept **out of** `infra/r2.tf` so
  a throwaway verification rule never lands in the Terraform-owned production config, set up in
  that same prior untracked session specifically to observe `08-persistence/02-r2-save-share`'s
  TTL-expiry criterion faster than a real 30-day wait. The live marker object
  (`ttl-test/marker.txt`) had not yet expired (the expected deletion window,
  2026-07-24T09:05:33Z–2026-07-25T09:05:33Z, hadn't opened yet) — caught before any data was
  lost. The identical rule was re-added the same out-of-band way (`wrangler r2 bucket lifecycle
  add`, not Terraform), confirmed present again, marker confirmed still byte-exact. **Lesson
  recorded in the leaf doc itself:** `terraform plan` against `dev` will keep showing this one
  rule as a diff for as long as the observation runs — expected, and must not be reconciled away
  until the deletion is actually observed.
  **What's still genuinely open, both correctly unchecked:** `09-edge/04-persistence-endpoints`
  waits on (1) the TTL-expiry observation itself completing (marker not yet deleted as of this
  entry) and (2) an operator runbook line for manual `wrangler`-console deletion (documentation,
  not code — the capability itself is already confirmed structurally). `08-persistence/
  02-r2-save-share`'s own TTL-expiry criterion waits on the same observation. Neither is an
  effort estimate in the usual sense — the blocking factor is calendar time on a live R2
  lifecycle sweep ("typically within 24 hours" per Cloudflare's own docs), not engineering work.
  **Docs:** no master/Decision-Record edit. `build/09-edge/04-persistence-endpoints.md`'s TTL
  criterion appended with the 2026-07-24 re-check and the near-miss + recovery, plus the standing
  note for future sessions.
  **Next concrete action:** re-check `ttl-test/marker.txt` after 2026-07-25T09:05:33Z; if
  deleted, check both the TTL-expiry criterion here and in `08-persistence/02-r2-save-share`,
  clean up the now-unneeded scratch rule, and both boxes can close pending only the runbook line.
  `▶` stays at `08-persistence/03-dsps-spec` per the entry above.
  **Blocker:** none — a calendar wait, not a stuck state.

