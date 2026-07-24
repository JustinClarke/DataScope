# DataScope — Consolidated Product & Architecture Document

**Compiled:** July 10, 2026
**Revised:** July 10, 2026 — **Studio pivot integrated (D12–D14).** Product identity is now *DataScope Studio*, a browser-native analytics IDE whose headline is structure understanding, not chat. The semantic modeling engine is promoted from backlog to the scheduled Studio arc (§19 Phases 7–9); multi-table/folder ingestion moves into v1 (§7.5); a data-quality report joins the arc (§20.8).
**Revised (2):** July 10, 2026 — **Decision round 2 (D15–D18; D2/D9 closed).** Appendix C's release tiers (v0 / v0.5 / v1) are now canonical (D15); the >500MB temp-staging tier is deferred to backlog and respecced on R2, dropping GCS entirely (D16); BYOK custody resolved as user-choice (D9); an early relationship-inference spike is scheduled in Phase 1 (D17); the pre-implementation package is re-sequenced spike-first (D18); the initial AI-mode default is a first-run chooser (D2).
**Revised (3):** July 11, 2026 — **Security & delivery infrastructure added (D19, §23).** A consolidated security model (threat model, headers/CSP, supply chain, secrets) distinct from the §5 privacy model; Docker scoped to dev/CI parity only; Terraform ownership of Cloudflare account resources; CI/CD pipeline. New split-tree docs `foundations/security-model.md` and `foundations/infrastructure.md`.
**Revised (4):** July 11, 2026 — **Competitive research & sharing strategy folded in (D20–D21, §3.4–§3.5, §20.11).** A researched competitive map (six-property lane analysis; MotherDuck and Duckle flagged as the threats to watch) and an explicit distribution/audience strategy land as §3.4–§3.5. Sharing is reframed as **"share the shape, not the data"**: a client-side structure-report export joins v0 (D20), the hosted v0.5 share defaults to a structure-only artifact, and the aggregate-stats and synthetic-replica share tiers are designed-and-deferred (§20.11). A hard language rule bans "anonymized/compliant" claims (D21). New split-tree docs `product/competitive-landscape.md`, `product/strategy.md`, `backlog/shape-share-extensions.md`.
**Revised (5):** July 11, 2026 — **Launch-strategy & venture-readiness revamp folded in (D22–D36).** Product-not-portfolio identity (the privacy-constrained data worker is the lead audience; recruiters removed), the privacy-constrained beachhead as the launch narrative, a confidence-labeled **Join Graph (beta)** pulled into the v0 ship, content-free traction counters, a recruiting structure report with attribution, the v0 launch bound to **Tuesday, October 6, 2026**, a **free-forever** local core, a consumer personal-data template channel + client-side ZIP ingestion, **DSPS + "Copy for AI"** as the AI-context surface, a no-RAG boundary, the prosumer rail, API connections re-ranked by auth reality, cross-platform combination templates (v1), and the monetization sketch deferred (D36). New §24 (launch strategy & evidence plan); planned split-tree leaf `build/05-charting/05-join-graph-beta.md` (mirror pass).
**Revised (6):** July 12, 2026 — **AI-surface round folded in (D37–D43).** DSPS promoted from "a third renderer" to a first-class, open, versioned interface (D37); a two-stage **MCP** surface added — stage A serves DSPS read-only over explicitly shared artifacts (v0.5), stage B exposes tools over explicitly staged datasets only (v1+, D38); an opt-in **hosted data staging & server-side execution tier** revives D16's staging per its own clause and adds a deferred server-side execution design round (D39); a dev/CI **NL→SQL eval harness** gates the v0.5 Phase-4 ship (D40); **content-free numeric LLM metrics** extend the D25 counters, the §11.1 transcript is named the content-full client-side trace (D41); **dual-purpose governance** operationalizes the D22 tension rule and records the AI-into-v0 re-sequencing rejection (D42); a **local-model honesty guardrail** confines claims to spike-passed paths (D43). Product identity and launch narrative are unchanged (D12/D22/D23); new decisions expand capability, not identity. New split-tree leaf `build/08-persistence/03-dsps-spec.md`.
**Revised (7):** July 12, 2026 — **Ideation-consolidation round folded in (D44–D52; D27 cut order re-ranked).** Three same-day ideation loops (viability & niche, knowledge layer, positioning & surface) land as decisions: the **Drift Report** — aggregate dataset-version drift, v0.5's first post-launch ship (D44); DSPS fact snapshot-provenance labeling, never permanence claims (D45); PII detection as a share-flow suppression assist, positives-only, never a clearance verdict (D46); a D32 clarification (D47); the **Dataset Dossier** as the v0 post-ingest landing view (D48, §13.1); an engine-agnostic **`QueryEngine`** core (D49); a self-hostable release zip + `/security` page (D50); the **Tauri desktop charter** (D51, §20.9); and the launch-copy reframe to the inherited-data moment with privacy as the permission line (D52 — frame only; draft copy deferred). The July 2026 landscape refresh narrows the six-property intersection to **② alone** (§3.4: viewer/profiler + CSV-diff cottage lanes, SplitForge, MotherDuck free tier + Local UI, Duckling); the **D27 cut order re-ranks the Join Graph to last-cut**; Play 3 re-aims to `/schema-diagram` + `/csv-profiler` + `/ai-context`. Identity unchanged (D12/D22/D23); Form 2 "team memory" and the knowledge-server re-centering stay rejected.
**Revised (8):** July 13, 2026 — **Dynamic-UI round folded in (D55–D56).** A declarative, capability-gated **ViewSpec** seam — the renderer consumes a versioned, validated layout artifact and never executes model output — lands in v0 at ~zero cost, generalizing the Dossier/broker into the deterministic producer (D55); an **optional AI view-composer**, bounded to the Dataset Dossier (D48) + consumer templates (D30), cached per dataset fingerprint, async off the first-paint path, deterministic fallback mandatory, lands v0.5+ behind a D40-style eval gate (D56). The maximal "AI tailors the UI in real time" identity version was reviewed and **rejected** (§3.4/§24.3; D12/D22/D37 unchanged). Mirrored into §9, §11.1, §13.1, §16.
**Revised (9):** July 13, 2026 — **Navigation index added (no spec change).** A [Contents](#contents) map of this master — every numbered section and appendix with a one-line descriptor, plus the cross-reference key (`§` / `A.` / `D`) — sits below this header to make the ~1,800-line spec navigable. No decisions, sections, or spec content changed.
**Revised (10):** July 18, 2026 — **Adoption round folded in (D61–D65).** A strategy round on how the product spreads between people and organisations lands as five append-only decisions. The **platform ladder is chartered** — browser (v0/v0.5) → an opt-in **hosted tier** carrying an explicit privacy-and-deletion promise → desktop (D51) → further surfaces on request only — with React and the §6 stack reaffirmed and the "pull the CLI forward" proposal **reviewed and rejected** (D61). A **universal `.dsps` receiver** — any artifact renders read-only, instantly, no data/login/install — closes the send/receive/re-run reflex loop (D62). A **verifiable-trust "approval kit"** — published build provenance, signed `.dsps`, and audit-as-GTM bundled with the D50 self-host zip and `/security` page — makes trust *filable* for the CISO, not just demonstrable (D63). A **format-first inversion** names DSPS the platform and the app its flagship client — a published JSON Schema + validator/parser library, spec-first discipline (D64). And **deterministic narration** — template-filled plain-language findings over D10/D45 facts, no LLM in the loop — re-frames D54(b) as deterministic-first with optional AI polish layered later (D65). Identity is unchanged: the hosted tier is opt-in scale-up, never default or launch-adjacent; kill-the-wifi, the edge-independent core, and the free-forever local core all stand (D23/D27/D28/§4). The July 18 adoption round is retained for history as `IMPLEMENTATION-PLAN-ADOPTION-ROUND.md` and not updated further.
**Revised (11):** July 18, 2026 — **Semi-structured & log ingestion recorded, designed and deferred (D66).** A deterministic (no-AI) ingestion path for logs, key-value blobs, and messy/schema-drifting JSON — log-template clustering + regex field extraction, registering through the existing `QueryEngine`/table registry, no new pipeline — is designed and recorded in §7.1/§20.14, extending the D32 non-goal per D47's precedent (structural parsing, not RAG). Not scheduled into v0/v0.5/v1; no date or cutline change (D27/D15).
**Revised (12):** July 24, 2026 — **Workbench adoption round folded in (D71–D72; D2, D24, D48, D55, D56, D59, D62, D63, D68d, D69, D70 amended/reconciled).** The UI-redesign ideation (SPEC/PLAN/LIFECYCLES/FOLD-SCOPE + five signed-off hallmark mocks) lands after two design-review passes: the **Workbench** — a VS-Code-shaped shell (explorer / tabbed canvas / optional AI pane / bottom inspector / command palette / status bar) behind `WORKBENCH_ENABLED`, in parallel with the current shell until the W8 flag flip (D71, §13.3, §19 W0–W8) — and **deeper cloud grounding**, a graduated, bounded, per-session sample escalation for cloud AI answers (D72, §5.2/§11.3). §13 is restructured, not replaced: §13.0 keeps the current shell's spec while it remains launch-capable (§9.1 stays open); the AI consent surface becomes shell-conditional flat mode switches in the Workbench (D2 amendment, §5.1) with an egress-persistence boundary (§5.2). The tab model generalizes the D55 discipline **with the model-output envelope invariant stated**, keep-mounted is the v0 tab norm (full serialization deferred to the D61 hosted-tier round), and the multi-table map carries a persistent Verdict band (D68c). Review artifacts: `_implementation/_misc/ideation/UI-REDESIGN-REVIEW-FINDINGS.md` + `…-AI-V2.md`.
**Status:** Concept — pre-build. This is the living document.


---

## Contents

**Cross-reference key:** `§n` / `§n.m` → a numbered section below · `A.n` → [Appendix A](#appendix-a--nlsql-blueprint-research-notes) · `Dn` → decision *n* in the [Decision Record](#0-decision-record) · the [`_implementation/`](_implementation/) split tree mirrors these sections (map in [Appendix C](#appendix-c--documentation--implementation-repo-structure)).

| # | Section | Covers |
| :--- | :--- | :--- |
| 0 | [Decision Record](#0-decision-record) | D1–D72 — the settled decisions every section cites |
| 1 | [Executive Summary](#1-executive-summary) | One-paragraph what and why |
| 2 | [Target Users](#2-target-users) | Who it's for; the privacy-constrained data worker as lead |
| 3 | [Positioning & Landscape](#3-positioning--landscape) | Problem, competitive map, differentiation, distribution (§3.0–3.5) |
| 4 | [Constraints & Non-Goals](#4-constraints--non-goals) | Hard boundaries |
| 5 | [Privacy Model (Tiered)](#5-privacy-model-tiered) | Three AI modes, disclosure rules |
| 6 | [Architecture](#6-architecture) | React app + DuckDB-Wasm worker + edge surface |
| 7 | [Data Ingestion](#7-data-ingestion) | Formats, flow, large files, API tiers, multi-table (§7.1–7.5) |
| 8 | [Schema Classification Engine](#8-schema-classification-engine) | Semantic column typing rules |
| 9 | [Capabilities Broker](#9-capabilities-broker) | Adaptive module gating from schema |
| 10 | [Foundation Analysis Modules (v0)](#10-foundation-analysis-modules-v0) | Profile, SQL, charts, pivot — M1–M7 |
| 11 | [AI Chat Layer (NL→SQL)](#11-ai-chat-layer-nlsql) | Pipeline, inference routing, eval harness (§11.1–11.4) |
| 12 | [Modify, Export & Persistence](#12-modify-export--persistence) | Native edit, export, R2 save/share |
| 13 | [UI Layout & Navigation](#13-ui-layout--navigation) | Current shell (§13.0), Dataset Dossier (§13.1), the Workbench (§13.3, D71) |
| 14 | [Sample Datasets (Bundled)](#14-sample-datasets-bundled) | Bundled samples + capabilities they exercise |
| 15 | [Performance Considerations](#15-performance-considerations) | Bundle / memory / latency budgets |
| 16 | [Planned File Structure](#16-planned-file-structure) | Frozen `src/` layout |
| 17 | [Risks & Mitigations](#17-risks--mitigations) | Risk register |
| 18 | [Success Metrics](#18-success-metrics) | Perf targets, usage loop, v0 acceptance criteria |
| 19 | [Development Phases (v0 / v0.5 / v1)](#19-development-phases-v0--v05--v1--d15) | Phases 1–9 mapped to release tiers (D15) |
| 20 | [Deferred & Future Work](#20-deferred--future-work) | Designed-but-deferred work (§20.1–20.12) |
| 21 | [Pre-Implementation Planning Package](#21-pre-implementation-planning-package) | Spike-first prep sequence (D18) |
| 22 | [Developer Checklist](#22-developer-checklist-per-phase-gate) | Per-phase gate |
| 23 | [Security & Delivery Infrastructure](#23-security--delivery-infrastructure-d19) | Threat model, Docker, Terraform, CI/CD (D19) |
| 24 | [Launch Strategy & Evidence Plan](#24-launch-strategy--evidence-plan-d22d29) | Four plays, evidence plan, GCC motion (D22–D29) |
| A | [Appendix A — NL→SQL Blueprint Research Notes](#appendix-a--nlsql-blueprint-research-notes) | Library survey + debunks (July 2026 snapshot) |
| B | [Appendix B — Review Recommendations](#appendix-b--review-recommendations-2026-07-10) | 2026-07-10 review actions |
| C | [Appendix C — Documentation & Implementation Repo Structure](#appendix-c--documentation--implementation-repo-structure) | The `_implementation/` split-tree map |

---

## 0. Decision Record

Conflicts between the three source documents, and the open decisions from the addendum's §6, resolved as follows:

| # | Decision | Resolution | Date |
|---|---|---|---|
| D1 | v1 scope | **Ingest / SQL / charts / AI-chat.** ML modules deferred (fully designed — see §20.1). | 2026-07-10 |
| D2 | AI privacy stance (PRD's "zero network after load" vs. addendum's Workers-AI-by-default) | **All three modes ship** as a user-selectable setting: (a) local-only / AI off, (b) local model (in-browser WebLLM only), (c) **API** — renamed from "cloud AI" (2026-07-22, human directive): Workers AI and/or the user's key or a local Ollama endpoint, reached through one auto-detecting key/endpoint field (§11.2). Localhost Ollama moved out of mode (b) and into mode (c) on this same directive — the mode chooser is still exactly three options, not four. The initial default is a **first-run chooser** — a one-screen explanation of the three modes on first launch; no silent default (resolved 2026-07-10, round 2). **Workbench amendment (2026-07-24, D71 — consent placement is shell-conditional during the flag-parallel period):** the **current shell keeps the app-open first-run chooser exactly as above while it remains launch-capable** (§9.1/W8 open); in the **Workbench**, the chooser is superseded by **flat mode switches above the AI pane — `Off` / `Cloudflare` / `WebLLM` / `Your own key (local or hosted)`** — a presentation re-partition of the same three modes plus the D3 routing choice (Off = mode (a); WebLLM = mode (b); Cloudflare and Your-own-key = the two faces of mode (c)), with a **"Configure workspace"** surface near the composer for the fuller data-handling controls (§5.1, §13.3). **AI is off by default; a capable device (§5.1 probe) pre-selects the WebLLM switch and highlights the pane — pre-select only, never an auto-download (the D70 download-confirm stays the sole consent gate for the ~830 MB pull).** Rationale recorded: D2 banned a silent *egress* default and inference-before-choice; defaulting to zero-egress `Off` and auto-*selecting* a zero-egress local model strengthens that, it does not breach it. The shell-independent invariant, stated once: **no silent egress default; an egress mode activates only through flip → disclosure → explicit confirm, before the first egress call; egress modes never persist across sessions (§5.2).** | 2026-07-10; mode (b)/(c) shape amended 2026-07-22; Workbench switch model 2026-07-24 |
| D3 | BYOK routing (always-if-configured vs. overflow-only) | **User-facing toggle:** "Prefer my key" vs. "Use free tier first". **Confirmed unchanged in shape (2026-07-22):** the toggle now serves mode "API" (D2's renamed mode (c)) rather than "Cloud AI" — same two choices, same behavior. | 2026-07-10 |
| D4 | Tier-3 API ingestion (credential vault for secret-key data sources) | **Deferred past v1.** v1 ships Tier 1 (direct fetch) + Tier 2 (CORS relay) only. The vault *mechanism* still ships in v1 for BYOK AI keys, so Tier-3 ingestion is cheap to add later. | 2026-07-10 |
| D5 | Worker persistence layer (R2) for saving modified datasets beyond the tab | **In v1.** Explicit save/share links, with disclosure, retention policy, and abuse controls specced in §12. | 2026-07-10 |
| D6 | Live database connectivity | **Deferred indefinitely.** Browser sandboxing makes it impossible directly (no raw TCP); revisit trigger = a concrete need that periodic Parquet export can't satisfy. Design notes preserved in §20.3. | 2026-07-10 |
| D7 | Off-the-pace / F1 integration | Deferred until the core tool works. DataScope is a separate app with its own repo. | 2026-07-10 |
| D8 | XLSX support | Not in MVP; clear error modal with CSV-export guidance (carried from base PRD). | — |
| D9 | BYOK key custody | **Resolved — user-choice custody.** Default: the key lives in browser memory only and is sent per-request through the Worker as a **stateless pass-through** (attached and forwarded, never persisted server-side — works regardless of provider CORS support). Opt-in: **"Remember my key"** stores it in the server-side credential vault (Cloudflare secret/KV keyed to session) with explicit disclosure and a delete control. Both ship in v0.5 (§11.2). **Field-shape amendment (2026-07-22, human directive):** the one key/endpoint field now branches on its own contents — a URL is treated as a local Ollama base endpoint (reached directly by the browser, never touching the Worker, never persisted or vault-eligible — it isn't a secret); anything else is treated as an OpenAI-style bearer key and follows the custody rules above unchanged. Neither branch is ever persisted or logged in plaintext. | 2026-07-10 |
| D10 | Proactive insight feed ("data detective") | **In v1**, as a rule-based extension of the Auto-Profile module (§10 Module 1) — SQL-derived and deterministic, no LLM required, so it works in all three AI modes including local-only. Built in Phase 3, once the chart modules it links into exist. It is the v1 seed of §20.5's deterministic insight layer. | 2026-07-10 |
| D11 | Semantic modeling engine (entity inference, star-schema proposal, dbt export) | **Promoted from backlog to the scheduled Studio arc (§19 Phases 8–9)** per D12. Still sequenced after v1 — it needs the transformation layer exercised and profiling trustworthy first — but it is now the destination the v1 phases build toward, not an optional extension. D13 moves its other prerequisite (multi-table ingestion) into v1. Design detail in §20.6. | 2026-07-10 |
| D12 | Product identity — **DataScope Studio** | **DataScope's identity is a browser-native analytics IDE — "the VS Code of local analytics" — whose headline capability is understanding data structures, not chat.** Drop a folder of Parquet files and get profiling, relationship inference, a schema graph, a quality report, a generated dbt project, and an exportable semantic model — entirely client-side. AI chat remains a v1 pillar but is a supporting module, not the identity. v1 (D1 scope) is reframed as the foundation release of the Studio arc; the arc itself is Phases 7–9 (§19). | 2026-07-10 |
| D13 | Multi-table / folder ingestion | **Promoted into v1** (§7.5). The Studio arc's structural inference is meaningless on a single table, so folder-drop (multiple files → multiple named tables, cross-table SQL) moves from implicit to explicit v1 scope. Single-file remains the simple path. | 2026-07-10 |
| D14 | Data-quality diagnostics ("Lighthouse for data") | **In the Studio arc as Phase 7** (§19, design in §20.8). Extends the v1 auto-profile + insight feed (D10) into an engineer-facing diagnostics report: composite quality score, null heatmap, duplicate/skew/outlier detection, FK-candidate findings, schema-drift comparison, exportable report. Deterministic and SQL-derived — works identically in local-only mode. | 2026-07-10 |
| D15 | Release cutline | **Appendix C's tiers are canonical: v0 (Phases 1–3 — local, deterministic, zero server surface) → v0.5 (Phases 4–6 — AI + connectivity/persistence) → v1 (Studio arc, Phases 7–9).** First public ship is v0, after Phase 3; the locally-relevant Phase-6 polish items (error boundaries, empty states, bundled samples, guided tour) pull forward into the v0 ship. Terminology: text predating this decision that said "v1" in the D1 sense denoted the foundation scope, now v0 + v0.5; "v1" alone now means the Studio release. | 2026-07-10 |
| D16 | >500MB temp cloud staging | **Deferred to backlog; GCS dropped.** The 300–500MB and >500MB ingestion tiers collapse into refuse-with-guidance (§7.3). When revived, the design is R2-based (presigned PUT via the Worker, lifecycle-rule TTL) — no second cloud provider, one disclosure story. | 2026-07-10 |
| D17 | Relationship-inference de-risking | **Early throwaway spike.** Once the Phase-1 table registry exists, spend 1–2 days on a disposable FK-containment/cardinality prototype against the e-commerce sample folder. Sequencing of Phases 7–9 is unchanged; findings are recorded in §20.6. The code is disposable, the learning is not. | 2026-07-10 |
| D18 | Pre-implementation process | **Spike-first.** §21 re-sequenced: define TypeScript interfaces and the state tree up front, run the Phase-1 ingestion spike + D17 inference spike, then write the ADRs, epics, and sequence diagrams from what the spikes teach. No full planning package against unverified library assumptions. | 2026-07-10 |
| D19 | Security hardening & delivery infrastructure (Docker, Terraform, CI/CD) | **Added as §23.** Security gets its own cross-cutting model (§23.1), distinct from §5: §5 governs what *data* leaves the browser; §23.1 governs what an *attacker* can do. **Docker is dev/CI parity only** — production is static hosting + Workers (workerd); no container is ever the production runtime (§23.2). **Terraform** (Cloudflare provider) owns long-lived account resources (DNS, hosting, R2 + lifecycle TTL, KV); **wrangler keeps owning Worker code, bindings, and secrets** — Terraform never deploys Worker code (§23.3). CI/CD via GitHub Actions (§23.4). Layout/state-backend detail deferred to ADR-009, written when v0.5 infra work starts (per D18). | 2026-07-11 |
| D20 | Structure report & "share the shape" | **The share artifact defaults to structure, not rows.** (a) **v0** ships a **client-side structure-report export** — schema, inferred types, relationships (post-Studio: graph), profile aggregates — as a self-contained HTML/JSON download; zero server surface, so D15's v0 cutline is untouched. (b) The **v0.5 hosted share (D5/§12.3) defaults to the structure-only artifact**; sharing raw rows remains available but becomes the explicit, labeled escalation. (c) Share controls: optional column-name redaction and rare-category suppression (§12.3). Rationale: the researched landscape (§3.4) shows the shareable-structure lane unclaimed, and the structure report is DataScope's differentiated output anyway — sharing it costs nothing extra and removes the #1 reason not to share (§3.5). | 2026-07-11 |
| D21 | Sharing-privacy language & deferred share tiers | **Never market or label sharing as "anonymized," "de-identified," or "GDPR/HIPAA-safe."** The claim is **"structure only — no data rows included"**, true by construction; suppression/redaction controls are described as *reducing* re-identification risk, never eliminating it (re-identification is adversarial and well-studied; §20.11 sources). The **aggregate-stats share** and **synthetic-replica share** tiers are designed-and-deferred to backlog (§20.11) — the replica, done well (correlations + FK integrity, generated client-side), is a headline post-Studio feature, not a v0/v0.5 blocker. | 2026-07-11 |
| D22 | Product identity — product, not portfolio (P1) | **§2 reworded: lead audience is the privacy-constrained data worker; Parquet-first engineers are the explicit second audience.** Recruiters removed as target users; portfolio value is a side effect, not a purpose. §3.5's venture-out-of-scope sentence replaced by D28's free-forever line + the expansion ladder (free structure tool → privacy-safe shape sharing → team semantic layer). | 2026-07-11 |
| D23 | Beachhead & launch narrative (P2) | **Privacy-constrained users are the primary v0 audience.** Launch copy, bundled samples (§14), and guided tour built around "analyze and share the shape of data you can't put anywhere." Subject to D21 language rules — "no upload, by construction," never "compliant/anonymized." | 2026-07-11 |
| D24 | Join Graph (beta) in v0 (P3; amends D15/D17/D20) | **A thin confidence-labeled FK-inference slice joins the v0 cutline**, timeboxed at 2 weeks post-spike, governed by pre-written kill criteria (quality, ambiguity, timebox, performance — §19 Phase 1). D17's spike gains the "productizable slice?" question; D20's report includes the graph from v0. Fallback demo variant maintained in parallel; cutting the slice never moves the date. **Consistency (2026-07-24):** the engine is untouched by the Workbench adoption (D71), but the §13.1 connector-source rendering guardrail **transfers to the Workbench dataset map** — solid/dashed tier from `relationshipInference.ts` only, evidence-backed, never a name/presence matcher, never a cardinality the engine did not compute (§13.3). | 2026-07-11; rendering-guardrail transfer noted 2026-07-24 |
| D25 | Traction observability (P4) | **§23.5 operator counters extended to product edge events** (shares created, relay fetches, edge-routed exports, AI requests) + CDN-level visitor counts. Content-free per §5.2; local-only mode stays zero-network and uncounted by design. | 2026-07-11 |
| D26 | Structure report recruits (P6) | **Design-quality bar (screenshotable) + tagged attribution footer** ("Profiled with DataScope — drop your own files") on every exported report and hosted share. | 2026-07-11 |
| D27 | v0 launch date (P7) | **Tuesday, October 6, 2026. Date fixed; scope flexes.** Cut order (**re-ranked 2026-07-12, viability round**): (1) consumer templates + pages → (2) guided-tour polish beyond the D15 minimum → (3) extra landing pages → (4) Join Graph slice — **last-cut**. The graph may be cut **only** by its own D24 kill criteria (quality, ambiguity, timebox, performance), never merely to save schedule while lower-differentiation items survive: the July 2026 landscape check found the viewer/profiler lane fully commoditized, so with multi-table structure inference (②) the only unclaimed capability, cutting the graph early would leave "another parquet viewer with nicer profiling." Spec work below launch-blocker severity is post-launch by default. Success measured against the §18 steering bars (month 1: reach / organic floor / artifact travel / beachhead pull; ≥2 of 4 → v0.5). | 2026-07-11 |
| D28 | Free forever — local core loop (P8) | **The local core loop (ingest, profile, SQL, charts, insights, quality report, structure-report export) is free forever.** Paid only ever follows real server-side cost or team value (§20.10 seams). | 2026-07-11 |
| D29 | Claimable share links (P5) | **Deferred to v0.5 planning.** Tension with D23's audience (email-averse) noted; near-term capture via D25 + D26. Revisit trigger: §12.3 hosted-share build. If built: optional, functional wording (manage/extend/delete), never marketing. | 2026-07-11 |
| D30 | Personal-data templates & consumer channel (P9) | **2–3 platform templates (Spotify, Google Takeout) ship in v0 as a "Personal Data" sample category** + `/spotify`, `/google-takeout` landing pages + client-side ZIP ingestion. Consumers are a distribution channel, not a second identity: D23's narrative owns the Oct 6 launch; the consumer wave is a separate Wrapped-season moment. Templates are versioned and degrade gracefully to generic profiling on schema drift; social-data charts default to aggregates. First to drop in the cut order. Template format opens to community in v0.5. | 2026-07-11 |
| D31 | DSPS + "Copy for AI" (P10) | **The D20 JSON export is formalized as the versioned DataScope Profile Spec (Phase 1)**; the structure report gains a third renderer — an LLM-optimized context block ("Copy for AI," Phase 3) with zero raw rows, degrading to schema-only if D24's slice is cut. The AI-facing surface of the product is exactly this. | 2026-07-11 |
| D32 | No general chunking/RAG platform (P11) | **Named §4 non-goal, no revive trigger.** No generic chunking, embeddings, vector storage, or RAG plumbing — DataScope's AI surface is DSPS + Copy-for-AI, derived from client-side structural understanding. | 2026-07-11 |
| D33 | Prosumer rail (P12) | **"Personal data workbench" recorded as the consumer rail of the arc** — templates → token APIs → cross-platform → Pro conveniences — sharing one engine and one privacy story with the enterprise rail. D23 owns v0 launch; graveyard analysis + funnel economics recorded as the rationale. NL→SQL consumer flow confirmed as existing §11.1 architecture. | 2026-07-11 |
| D34 | API connections by auth reality (P13) | **v0.5 = token/no-auth platforms only (GitHub, Lichess/Chess.com) on unchanged §7.4 machinery. OAuth platforms (Strava, Spotify, Fitbit) are a separate v1 decision** — per-platform app registration, secret custody in vault, redirect handling, ToS review. Banks: CSV-drop only, never a connection. Takeout templates instruct component selection (§7.3 size tiers). | 2026-07-11 |
| D35 | Cross-platform combination templates (P14) | **v1, beside the Studio arc, gated on P9 traction.** Requires unified-timeline utilities (timestamp/timezone normalization, windowed time-joins) — the join graph's consumer twin. Wave 3 headline: questions no single platform can answer. | 2026-07-11 |
| D36 | Monetization sketch v2 (P15) | **Deferred until the product is ready** (revisit at v0.5 planning or later, alongside D29). No price anchors land in §20.10 now; free-for-now posture unchanged. When revived, the P15 corrections are binding: no limits on local capabilities, no content gating, and auto-refresh requires a dedicated custody design round before it may exist as a paid feature. | 2026-07-11 |
| D37 | DSPS as a first-class interface (AI-surface round) | **DSPS is promoted from "a third renderer of the structure report" to a named architectural interface** — one-line placement in §1, a node in the §6 architecture, its own split-tree schema leaf, and file-structure presence (§16). It gains real versioning + degradation semantics: an explicit **`dsps_version`** field, documented forward/backward-compat and version-mismatch behavior, and the existing schema-only graceful degradation (when the D24 slice is cut) restated. Published as an **open, versioned spec** — strengthens the §12.2 / §24 Play 4 format arc. Product identity and launch narrative are unchanged: the "layer agents consume" re-centering was **rejected** at review; D12/D22/D23 stand. | 2026-07-12 |
| D38 | MCP surface, two-stage (AI-surface round; revises D31/D32 phrasing) | **A Model Context Protocol surface is added, gated by staging.** *Stage A (v0.5, with the hosted-share build):* a read-only, DSPS-serving remote MCP endpoint on the Worker (Streamable HTTP) — e.g. `get_dsps(share_id)`, `list_shared(…)` — over **only** the structure-only artifacts a user already explicitly shared to R2 (D5/§12.3), inheriting the §23.5 ceilings/kill-switch/counters. *Stage B (v1+, gated on the D39 design round):* full-tool MCP — `run_sql`, `profile_dataset`, `infer_relationships`, `generate_dsps`, `export_schema` — executing **only against datasets the user has explicitly staged to product cloud storage** (D39), never against browser-local data (a tab is not an MCP endpoint; the Worker holds no un-staged data). `run_sql`-style tools over *non-staged* data remain **rejected**; a local-stdio companion was considered and folded into the staged-data path, not a separate deliverable. D31/D32's "the AI-facing surface is exactly DSPS + Copy for AI" is revised to **"DSPS + Copy for AI client-side by default, plus the D38 MCP surface (stage A over shared artifacts; stage B over explicitly staged datasets)"**; the **D32 no-RAG boundary is unchanged**. | 2026-07-12 |
| D39 | Hosted data staging & server-side execution tier (AI-surface round; revives D16 staging per its own clause) | **Opt-in only.** A user may explicitly stage a dataset to product-account R2 — presigned PUT via the Worker, lifecycle-rule TTL, manual "Clear temporary data" control (exactly D16's prescribed revival design, **R2-only**, no second cloud provider). Motivations: (a) datasets beyond the §7.3 in-browser ceiling (today >300 MB is refuse-with-guidance; staging turns that refusal into an offered path), (b) enabling D38 stage-B MCP. **Server-side execution is new surface and requires a dedicated design round before build** (v1+, explicitly not v0/v0.5): engine placement (e.g. DuckDB in a container vs. Workers-adjacent options), cost ceilings + §23.5 counters, abuse controls, disclosure copy, and the D28/§20.10 pricing seam (hosted execution is real server-side cost — the legitimate paid seam; price anchors still deferred per D36). Privacy: §5's principle already permits this (raw rows leave only through explicit, labeled user actions); a §5.2 disclosure bullet is added. **Never a silent fallback** — staging is an offered §7.3 guidance option; D23's local-first launch narrative and default are unchanged. | 2026-07-12 |
| D40 | NL→SQL eval harness (AI-surface round) | **A dev/CI-only eval harness** (separate `eval/` dir or repo, **not** product runtime) runs a curated ground-truth NL→SQL question set over the §14 sample datasets — the labeled set is the expensive artifact — measuring **exec-rate, result-correctness, cost per turn, and repair-rate** per provider/mode. **It gates the v0.5 Phase-4 ship** at thresholds declared when the harness is built (the gate itself is the commitment; it does not touch v0 or the Oct 6 date, D27). **Language: TypeScript by default** (matches §6/§16 — no second toolchain); Python only if a D18-style spike documents a concrete capability TS cannot meet — record the spike finding, not a job-market rationale. Feeds §11.4 and the §18 self-correction-rate metric. | 2026-07-12 |
| D41 | LLM observability, content-free (AI-surface round; extends D25) | **D25's §23.5 counters gain numeric-only LLM metrics** — tokens/turn, retry count, repair-rate, latency buckets — as Analytics Engine doubles + outcome-class blobs, **never prompt/SQL/error text**; cloud/edge path only, local-only stays uncounted. The **§11.1 transcript is named the content-full, client-side LLM trace** — the auditability/demo surface, in-browser by design. "OTel-style tracing on the Worker path" is **rejected** as a distinct commitment (it is either this numeric extension or a §5.2 violation); whether content-bearing traces may exist **for explicitly staged datasets only** is one question handed to the D39 design round, not decided now. | 2026-07-12 |
| D42 | Dual-purpose governance (AI-surface round; operationalizes D22) | **The D22 tension rule lands with teeth:** (1) a falsifiable test — *"would we build this, at this cost and sequence, if the job market did not exist?"* — an honest **no** fails it, regardless of incidental résumé value; (2) the merit judgment is made at **human triage**, never self-certified by the proposing document; (3) a dual-purpose item must independently pass the §4 minimal-surface constraint and must not alter D27's date or the D15/D27 cut order; (4) D22 governs all identity/marketing unchanged. Recorded in the same row: **AI-into-v0 re-sequencing was reviewed and rejected (2026-07-12)** — it would edit settled D15 and load the fixed date; the launch-moment AI signal is the already-v0 "Copy for AI" renderer (D31). Not to be re-litigated without founder instruction. | 2026-07-12 |
| D43 | Local-model path honesty guardrail (AI-surface round) | **The honestly-specced local-model path today is localhost Ollama (user-deployed); in-browser WebLLM/WebGPU is unbuilt and unscoped.** Before any capability claim (CV, marketing, or a "local" column in the D40 harness), a **D18-style throwaway spike** must pass explicit kill criteria: (a) memory coexistence with DuckDB-Wasm on a representative large dataset without OOM, (b) a documented SQL-generation quality floor vs. cloud, (c) acceptable model-download UX. The spike verdict is recorded in the AI-routing ADR (ADR-007); the D40 harness may report a "local" number only for a path that passed. | 2026-07-12 |
| D44 | Drift Report (dataset-version value-change report; extends D14/§20.8) | **Re-drop a newer version of an already-profiled dataset → an aggregate Drift Report:** rows added/removed, per-column % of values changed, null-rate + cardinality drift, distribution shift (PSI/KS), plus D14's schema diff — matching keys **inferred** (the D24 engine), **folder-aware** across a multi-table drop, deterministic, both versions in-browser (zero server, zero egress). **Aggregate summary only, never a cell-level diff viewer** — cell-level CSV diff is a commodity cottage lane (csvdiff.app, Datablist, DataFlowMapper, csvkit, Apify's diff actor), so aggregate inferred-key *statistical* drift is a **competitive boundary as well as a privacy one**. Named **Drift Report**, not "diff" ("diff" invites the commodity comparison). This is the product's **retention mechanic** — it converts the one-shot structure report into a repeated ritual ("re-drop the new export, see what changed") — and strategic pillar #2 of the structure × time arc (D52). **v0.5, first post-launch ship; v0 stretch only if trivially cheap.** Reaffirms D37/D12/D22/D23 — no identity change. | 2026-07-12 |
| D45 | DSPS facts carry snapshot provenance, never permanence claims (extends D21; generalizes D24's evidence pattern) | **Every DSPS fact is labeled "computed as of {snapshot date + file hash}" and carries a provenance tag** — `derived-this-run` / `user-asserted` / `carried-unverified`. "Verified" and any permanence/invariant wording are **banned** in fact labels: D21's truth-in-labeling rule extends from share/export copy to fact and detector output (an old artifact asserting "customer_id unique" long after a bad merge broke it is a false-permanence claim). The D24 evidence+confidence pattern generalizes to **all** structural/quality facts. Metrics are excluded — they stay in the D11/§20.6 semantic model; DSPS facts are structural/quality only (PK/FK/null/type/range/distribution), which also avoids the dimensional-modeling "fact table" naming collision. DSPS remains **stateless-per-run** — no cross-run merge or accumulation; **v0 ships facts exactly as they already are** (profile aggregates + D24 edges), the unified fact object + provenance tag being v0.5 DSPS-spec work, never a mid-flight v0 re-architecture. | 2026-07-12 |
| D46 | PII detection is a share-flow suppression assist, never a clearance verdict (extends D21 to detector output) | **Deterministic likely-sensitive-column detection surfaces inside the share flow** (v0.5, with the D5/§12.3 hosted share): "these columns may contain personal data — review before sharing," framed as *reducing oversight risk*, never certifying absence. **Positives-only, everywhere it renders** (share flow, Dossier, reports): no "PII scan: none found" line, no all-clear state, ever — a false-clean on a free-text SSN column is a trust-landmine for the exact D23 user who trusts it most. Never in v0 launch copy. | 2026-07-12 |
| D47 | D32 clarification | **A deterministic, SQL-derived fact list with evidence and confidence — no vectors, no embeddings, no similarity search — is in-bounds structural metadata, not RAG;** the D32 non-goal is unchanged. | 2026-07-12 |
| D48 | Dataset Dossier (v0 overview surface) | **Post-ingest, the folder-level landing view is a Dataset Dossier:** tables × rows, join-graph thumbnail (when the D24 slice lives), quality flags, time coverage (span + gaps per temporal column), top insights (D10), sensitive-column findings **positives-only once the D46 detector exists (v0.5)** — in v0 the Dossier simply has no sensitive-columns row, because positives-only means silence, never an all-clear — suggested next steps (an opinionated D10 extension linking into existing modules, not a new engine), and one-click report export (D20). **Packaging of existing v0 modules plus ~3–5 days of UI assembly, not new engine work;** it absorbs most of the guided tour's job (the tour becomes "walk the Dossier"). **Internal cut line: degrade to the per-table profile view** — the cut lives *inside* the feature, so it can never move the date (D27). Simultaneously the launch centerpiece (the inherited-data "what have I been handed" moment as a screen, D52), the demo script as UI (§24 Play 1), and the structural hedge if the Join Graph is cut by its D24 kill criteria. Information-design spec landed in §13.1 (one-screen layout; the D24 above-the-fold hedge as a graph→table-grid reflow; opinionated-but-never-over-claiming next steps; positives-only PII copy; graduated four-rung internal cut line). **Workbench re-home (2026-07-24, D71 — home moves, content survives verbatim):** in the flag-on shell the Dossier is the **single-table Blueprint face of the dataset map** and the **selected-table side panel** of the multi-table ERD (§13.3); on a fresh multi-table open the map tab header carries a **persistent Verdict band** (identity + headline `FactRef`, D68c tier-1 discipline, confidence floor intact) so the executive briefing survives the map-forward opening. Cut ladder, receiver mode, and every band unchanged. | 2026-07-12; Workbench re-home 2026-07-24 |
| D49 | Engine-agnostic core: the `QueryEngine` interface (extends D18) | **The D18 interfaces-first package defines a `QueryEngine` boundary** (execute / register / summarize); profiling, classification, insight generation, and DSPS emission are written against it — **never against duckdb-wasm directly**. ~Zero marginal cost now, expensive to retrofit later; it is the entire pre-work for the D51 desktop sidecar and a possible DSPS CLI/CI surface (recorded, gated on Play-4 evidence — the §18 artifact-travel bar met or real inbound demand), and good architecture regardless. **No new product surface today.** | 2026-07-12 |
| D50 | Self-hostable release artifact + security-reviewer page | **Every release publishes the static build as a versioned zip (GitHub Releases)** with header/config docs (COOP/COEP for threaded DuckDB; the degraded no-SharedArrayBuffer mode documented); an **`/security` page enumerates the app's complete possible network surface** — every endpoint it can ever call, the CSP, and the DevTools proof. Rationale: the §4 edge-independent core means the built app is already a folder of static files that runs with zero network — "unzip onto your intranet" is the cheapest possible answer to GCC/gov data-residency. Rung 2 of the sovereignty ladder — web (zero-approval) → self-host zip (your intranet) → desktop (air-gap, D51) — and the N2 max move: turn the infosec reviewer from blocker into channel. ~1–2 days; **v0 if free days exist, else v0.5**; never a date risk (D27). | 2026-07-12 |
| D51 | Desktop client charter (Tauri; replaces the §20.9 desktop one-liner) | **React UI in Tauri v2 with a native-DuckDB sidecar (duckdb-rs) behind the D49 `QueryEngine` interface, results over Arrow IPC** — explicitly *not* DuckDB-Wasm inside the webview. Unlocks, in value order: (1) **the >300MB refusal tier disappears on desktop** — native DuckDB uses machine RAM and spills to disk, so multi-GB Takeout archives and real Parquet lakehouse folders become first-class (the single biggest capability delta; fixes the D34 consumer size trap as a side effect); (2) air-gap distribution — a signed installer for machines with no internet, the literal endpoint of the Play-1 story and the predictable §24.4 design-partner ask; (3) folder-watch → automatic Drift Report (D44 matured from ritual to ambient habit); (4) native niceties (real file dialogs, `.dsps` association, no tab-death, faster cold start). Real costs: Rust toolchain, 3-OS build/sign/notarize pipeline, auto-updater, per-OS QA matrix, and a second engine held to D40-style verification discipline (any per-engine capability claim needs its own verification). Therefore: **post-v0.5, trigger-gated** — a design partner asking for air-gap, or v0.5 shipped with the §18 steering bars green; never before Oct 6 (D27). **Free forever** per D28's no-server-cost logic — a trust asset, not a revenue line. Desktop is a *surface*, not a differentiator (Duckling and Duckle already occupy the Tauri-desktop lane); ② + drift + artifact differentiate, whatever the shell. The web app remains the funnel and the identity. | 2026-07-12 |
| D52 | Launch-copy reframe (refines D23's copy, not its beachhead) | **The headline sells the inherited-data moment** — *someone just sent you data you don't understand* — because "people who inherit data" (consultants, auditors, journalists, data engineers on legacy systems, analysts joining a company) *contains* both the HN launch channel and the regulated beachhead: this widens the channel without moving D23. **Privacy becomes the standing permission line** ("nothing leaves your browser — check DevTools"), not the headline. The product-arc frame is **structure × time** — "know what your data is; know what changed" (v0 ships structure, v0.5 ships time/D44) — the anti-commodity sentence every cottage tool fails both halves of. The **zero-approval ladder** (web → self-host zip → desktop) is the enterprise/GCC narrative (§24.4 leave-behind gains the rung diagram; D50 is its proof artifact). Beachhead, GTM focus, and the D21/D23 language rules: **unchanged**. D52 fixes the frame only; actual draft launch copy is deferred execution work, not written this round. | 2026-07-12 |
| D53 | Analyst-completion surface (v0; extends D22/D23 — served audience, not a re-pointed beachhead) | **The data/business analyst is named an explicitly served audience, and four additive v0 surfaces close the "no-SQL / take-it-with-me" cliff** — without moving the D23 beachhead or the D52 launch frame (the regulated worker *is* usually an analyst, so this serves the beachhead too; analysts are served product-surface, never a co-headline). The gap it fixes: the product is SQL-first, so the *data* analyst is already well-served but the *business* analyst bounces at the Monaco editor. Four surfaces, each independently passing the D42 falsifiable test and all governed by the D27 cut order (never moving Oct 6): **(1) Pivot / cross-tab** — a drag-dimensions/measures surface over DuckDB `GROUP BY` (§10 Module 7), the no-SQL on-ramp; internal cut line degrades to a guided GROUP-BY builder reusing Module 2's suggestion engine, and it sits **above** the Join Graph in the cut order (cuttable to protect the date; the graph stays last-cut, D27). **(2) Take-it-with-me export** (§12.2) — result-grid → CSV/Excel, chart → PNG/SVG for decks, copy-SQL; a near-free extension of the existing client-side export surface. **(3) Reproducible transform recipe** (§12.1) — the already-recorded generating SQL of derived tables becomes an exportable, re-runnable recipe ("do it once, re-run on next month's export"); full one-click re-run automation is v0.5. **(4) Guided, task-shaped answers** (§10 Module 2 / §19 Phase 2) — the auto-suggested queries extend from column-shaped templates to analyst *tasks* (trend-over-time, top-N by segment, period-over-period, outliers, simple cohort), one click → answer + chart. Identity, launch narrative, and the §4 minimal server surface are unchanged (all four are client-side). | 2026-07-13 |
| D54 | Personal metric layer + findings narrative (v0.5+; extends §3.5's enterprise rail and §20.6) | **Two larger analyst bets, deferred past v0.** (a) A **personal named-metric layer** — define a metric once (`revenue = SUM(amount) WHERE status = 'paid'`) and reuse it across queries and charts — the single-player precursor to the enterprise rail's "team semantic layer" (§3.5) and the §20.6 semantic model, not a new identity. (b) A **business-readable findings summary** — an exportable one-pager narrating what's notable in a dataset, extending the D10 insight feed and the D31 "Copy for AI" renderer toward a human deliverable (the business analyst's actual output is a story, not a table). Both are **v0.5+**, gated like the AI/persistence tier and governed by D42 + D27 (never touch the Oct 6 date). Recorded now so the D53 v0 surfaces are built with these as the known next rung, not retrofitted. | 2026-07-13 |
| D55 | Declarative ViewSpec layer (v0 seam; dynamic-UI round) | **The view layer gains a declarative seam: the renderer consumes a versioned, capability-gated ViewSpec — validated JSON of `panels[]` (componentId from a fixed registry + typed props + a §11.1-stage-6 chart config) — and never executes model output.** v0 ships only the **deterministic producer**: the Capabilities Broker (§9) + Dataset Dossier assembly (§13.1, D48) generalized into a ViewSpec — a D49-style interface seam (~zero marginal cost inside the D48 UI-assembly budget, no new product surface, no AI, no date risk — D27; good architecture regardless). The deterministic ViewSpec **paints first, always** — it is the pre-work that makes an AI producer a drop-in later, and the whole of the view when AI is off. Boundary: **ViewSpec is presentation; DSPS stays structural-facts-only (D37/D45)** — classifier/DSPS output is the producer's *input*; layout never enters DSPS. Versioning mirrors the DSPS pattern (D37): explicit **`viewspec_version`**, forward/backward-compat rules, and version-mismatch surfaces + re-renders via the deterministic producer rather than failing opaquely. **Workbench generalization (2026-07-24, D71):** the ViewSpec discipline extends to the whole-canvas **tab-spec contract** (§13.3) — with the security invariant stated there explicitly, because serializability is orthogonal to safety: **the tab *envelope* (type from a fixed tab-type registry, identity, active-tab selection, initializer) is authored only by the app, never by a model; the only model-producible content is the inner artifact spec (ChartSpec/ViewSpec), validated by `producerValidators` *before* any tab opens.** The "never executes model output" boundary is load-bearing and does not weaken. | 2026-07-13; tab-spec generalization 2026-07-24 |
| D56 | Optional AI view-composer (v0.5+, bounded; dynamic-UI round) | **An optional AI producer emits a ViewSpec, scoped to the Dataset Dossier (D48) and the consumer templates (D30)** — scope option (B) at triage, not a general "AI redraws every module" (option (C) **rejected**: §3.4/§24.3 — AI-generated UI is not the ② moat, races MotherDuck's funded AI-data-app lane on their turf, and risks offline-by-construction, free-forever-local (D28), and the determinism/trust posture (D45/D46)). Hard constraints: the composer works **only within the broker's grammar** (§9 — panel types the broker declared legal, chart configs that typecheck; it cannot invent a map for a dataset with no geo columns); **cached per dataset fingerprint** (the D45 snapshot + hash — same data, same UI; kills non-determinism and per-interaction cost in one move); **async, never on the first-paint path** (§3.5 — time-to-first-insight is the one winnable axis; an AI call in the load path attacks it), surfaced as a "tailored this view" upgrade badge resolving after the deterministic paint; **degrades to the deterministic ViewSpec** when AI is off (D2 local-only), down, or uncached — so offline-by-construction (§24.3 asset #1), D28, and D45/D46 are preserved by construction. **Eval-gated like D40 — the gate is on the feature, never the release:** before the AI producer ships, a labeled-set eval must show the composed view beats the deterministic one; failing it leaves the deterministic ViewSpec as the product at zero cost. Identity unchanged (D12/D22/D37): structure understanding stays the headline and this is its *expression* — the maximal "AI tailors the UI in real time as the product's evolution" version was **reviewed and rejected this round** (fails the D42 test; §24.3's counter-position — *"ours composes the view in your browser, and it still works with the AI switched off"* — only exists if the deterministic view is the whole product). **Consistency (2026-07-24):** in the Workbench the **map face is the home of the async synthesis upgrade** (badge on the Blueprint face / map tab); the deterministic Verdict paints for every mode, and the **edge-warm upgrade (D70) is attempted only under a *confirmed-active* egress mode (`Cloudflare` flipped, disclosed, confirmed — §5.1/§13.3), degrading to the deterministic paint otherwise** — an `Off`/`WebLLM` session never fires the edge call. | 2026-07-13; map-face home + egress gate 2026-07-24 |
| D57 | Analyst pain-point sharpening (external positioning review — triaged, **no pivot**) | **An external positioning review proposing an "analyst + prosumer two-journey" repositioning was triaged: its core restates settled decisions** — two journeys = D53 + D30/D33; "less AI-first" = D12/D42/D56; the workflow ladder = D48; local-first structure-first = D12/D20/D22 — **and is adopted as convergent validation, not change.** Two proposals **rejected**: (a) **analyst-as-headline** — "understand unfamiliar data fast, in-browser, no upload" is the sentence the commoditized §3.4 viewer/profiler lane already claims; D52's inherited-data frame *contains* the analyst and sells ②, the one unclaimed capability (D22/D23/D52/D53 reaffirmed); (b) **prosumer-as-second-product-identity** — contradicts D33's channel-not-identity economics and would invest pre-launch in the first-to-drop cut-order item (D27/D30/D42). Three additive sharpenings land: **(1)** §3.0 names the **orientation tax** and the pain table gains the analyst's last mile — *packaging the answer* (→ D53 take-it-with-me exports; D54 findings narrative) — and folds the *refresh re-run* into re-exploration (→ D53 transform recipe; D44 Drift Report); **(2)** a **personal-data-template time-to-first-result bar** joins §18's v0 acceptance criteria — real export ZIP → first rendered template chart ≤ 2 minutes (D30's concrete §3.5 time-to-first-insight bar; applies only while templates survive the D27 cut order); **(3)** the **five-step workflow ladder** — *drop → Dossier → ask or one-click task → answer → take it with you* — is recorded in §24.1 as the skeleton for D52's deferred draft copy. Identity, beachhead, launch voice, cut order, and date unchanged. | 2026-07-15 |
| D58 | Architecture coherence round (system-design reviews — triaged) | **Two external architecture reviews were triaged into additive clarifications; no identity, scope, or decision reversal.** (1) **DSPS is the structural-facts *substrate*, not merely an export.** The profiler + classifier + D24 edges produce one structural-facts model; DSPS (D31/D37) is its versioned *external serialization*, and the NL→SQL stage-2 schema-pruner (§11.1) consumes a *pruned fragment of that same model* — DSPS and the AI prompt are two views of one substrate, not two derivations. Boundary held: the AI path consumes the structural *facts*, never the DSPS export module's version/provenance machinery on the per-turn path; DSPS stays structural/quality-only (D45/D55). (2) **The table registry is elevated to an explicit first-class component.** It was already specced — the `stores/datasets.ts` session catalog with the `loadDataset/removeDataset/profileDataset` contract and independent per-table profile/classify (§7.5/D13) — but showed up only as a parenthetical in the architecture doc; D58 gives it a named `TableRegistryEntry` type and states its role as the catalog over the D49 `QueryEngine` (engine executes; registry owns loaded/derived tables, metadata, memory accounting, origin, replacement, removal). No new module — the existing store *is* the registry. (3) **Cancellation/lifecycle is a distinct §21.6 failure category** — user abort (ingestion/query), superseded request (a new AI turn preempts an in-flight tool-loop; a new query preempts a running one), Worker termination/restart — first-class control flow, distinct from errors; `cancelQuery()`/`removeDataset()` already exist. (4) **The no-parallel-pipelines principle is written down (§6):** *every new capability must produce or consume an existing artifact (`Table`/`DSPS`/`ViewSpec`) through an existing interface (`QueryEngine`/registry/broker), never introduce a parallel end-to-end path* — the design-coherence litmus test (the architectural analog of D42's falsifiable test), generalizing the data-flow single-canonical-path invariant. **Noted, not adopted:** a **quality-gated capabilities broker** (broker consulting profile stats — e.g. suppress time-series on a 98%-null temporal column) is unspecced future work; the v0 broker is type-count-only (reads `ClassifiedColumn`, never raw profile), so the linear classify→broker flow is accurate and is *not* redrawn as a DAG. Also deferred (reviewers' own "not today"): `lib/` → `core/`+`contracts/` split, hook-vs-service placement of deterministic domain logic, `lib/` rename — post-~40k-LOC refactors, recorded not built. | 2026-07-15 |
| D59 | No silent DSPS harvesting — server-side structure accumulation is a named non-goal (founder proposal, triaged) | **A proposal to auto-store every generated DSPS to product-account cloud — to speed up future profiling and to learn how users use the app — was triaged and rejected *as stated*, because it collides with the decisions that constitute the product's identity: D45 (DSPS is stateless-per-run, no cross-run merge/accumulation), §4/§1 (no server-side schema processing, no always-on state), D20/D23/D52 (structure leaves the browser only by explicit, labeled action — the "nothing leaves your browser, check DevTools" permission line), D25/D41 (telemetry is content-free/numeric; DSPS is content — names, types, distributions), and D46/D21 (column names are themselves re-identifiable/sensitive).** The strategic stake: the regulated/GCC beachhead (D23, §24.4) is a market only while "we cannot see your data" is true by construction; silent DSPS upload trades that moat for analytics. **Both underlying goals keep sanctioned paths, and only these:** (a) *faster/smarter next dataset* — **local, zero-egress** device-side DSPS cache extending the D44 Drift Report ritual (subject to the tab-close purge stance — a deliberate privacy call, never silent), and classifier/template improvement from **dev-curated corpora or the DSPS a user *explicitly shared* to R2** (D38 stage A), never a background harvest; (b) *usage insight* — the **D25/D41 content-free counters** (sizes, type-mix buckets, share/export rates), with anything richer confined to the **D39 opt-in staging** path (explicit, per-dataset, behind its own design round), never a default. A future **explicit opt-in "contribute my structure"** feature is not foreclosed, but it must be labeled, per-artifact, and off by default (D42 governance; the D39 opt-in-only principle). Named a §4 non-goal (like D32); **no revive trigger for the silent/default form.** **Amendment (2026-07-24, D72):** the sanctioned-opt-in clause is now *realized* by **D72 deeper cloud grounding** — a graduated, capped, per-session, transmit-only row-sample escalation for cloud AI turns (§5.2/§11.3). The boundary itself is unchanged: still no accumulation, no harvest, no silent form; D72 inherits this row's labeled / per-session / off-by-default discipline, and the §24 absolute claim softens to "…unless you explicitly send it." | 2026-07-15; D72 realization 2026-07-24 |
| D60 | Operational insight — content-free usage-shape view (deferred, trigger-gated; the sanctioned half of D59) | **A legible "usage shape" view over the content-free signals the app already emits is named backlog scope, not v0 or default-v0.5 work (§20.13, `backlog/operational-insight.md`).** It is the *reading/analysis* layer over already-decided collection — D25's edge event counters + CDN visitor counts, D41's numeric LLM metrics, §18's opt-in usage metrics and D27 steering bars — and therefore **collects nothing new**; that is precisely what keeps it cheap and inside the privacy identity. It is the operator-facing half of D59's sanctioned path (b): the answer to "learn how the app is used" that does *not* trade the D23 beachhead for analytics. **Trigger to start (both parked until then): v0.5 has shipped with the §18/D27 steering bars green, *or* a specific operator question exists that the raw counters cannot answer by hand.** Until the trigger fires, no telemetry, dashboard, or schema work — pre-building a reading layer over counters that do not yet emit forfeits the cheapness that justifies it. Scope when revived: which ingest paths get used; whether users reach the ② multi-table moat (D24) or bounce first; artifact travel (D26 attribution arrivals) made continuous; the local/cloud AI-mode split feeding D2/§11.2 pool economics; and where the ingest → first insight → export funnel drops (the §3.5 time-to-first-insight axis). **Guardrails, inherited not re-decided:** content-free only (D41 — numeric doubles and outcome classes, never prompt/SQL/error text, column names, or values); no DSPS harvesting (D59); local-only mode stays uncounted and that blind spot is accepted (D25 — the visible graph is the edge-touching funnel, which is the part an operator/investor conversation needs); opt-in and disclosed (§5.2); aggregate operator view, **never per-user profiles**. **One gated sub-extension:** numeric *dataset-shape* buckets (row-count/column-count buckets, boolean type-mix flags such as "has a temporal column") are **new** signal edging toward content — permitted only as aggregate counts with no column names and no values, opt-in per §5.2, and only after passing a D42/D46 review; a separate sub-task, never folded into the dashboard-over-existing-signals work. | 2026-07-15 |
| D61 | Platform ladder charter — surface investment sequence (founder decision, adoption round) | **The surface investment sequence is chartered: (1) browser (v0 + v0.5, unchanged) → (2) an opt-in *hosted tier* — cloud SaaS with an explicit privacy-and-deletion promise → (3) desktop (D51) → (4) further surfaces on request only.** React and the §6 stack are reaffirmed — no change. **The hosted tier is D39 grown up, not a new thing:** D39's opt-in staging + server-side execution is promoted from "deferred, v1+, behind a design round" to the chartered second platform rung — a *named product tier*, scheduled ahead of desktop and named the product's commercial arc (the D28/§20.10 legitimate paid seam). The D39 design round still happens and still gates build; what changes is sequence and status. Price anchors stay deferred (D36 — the D39 round is where its revisit naturally lands). **The privacy-and-deletion promise** is a new binding commitment on the hosted tier, in D21-compliant language: opt-in always (never a silent fallback — D39's clause stands); disclosed lifecycle TTL by default; **delete-on-demand honored within a stated window**; documented retention; **no training on user data**; stated as verifiable server behavior ("deleted on schedule / on demand"), **never** as "anonymized / compliant / your data is safe" (D21 extended from share copy to hosted-tier copy). Lands in §5.2 and binds the D39 round's disclosure-copy scope. **Desktop re-sequenced:** D51's "post-v0.5, trigger-gated" becomes **rung 3, after the hosted tier ships** — with one retained exception: a design partner asking for air-gap may still pull desktop early (the §24.4 predictable ask). Never before Oct 6 (D27). **"The rest on request":** the D49 CLI/CI surface **keeps its demand gate** — the "pull the CLI forward as the organisational-adoption engine" proposal was reviewed and **not adopted** (recorded so it isn't re-derived); Excel add-in, Slack/Teams, VS Code, Python-library surfaces are on-request-only. D50's self-host zip is *not* demoted — it stays cheap, scheduled, and part of the trust story. **Two ladders, not one:** the D52 zero-approval ladder (web → self-host zip → desktop) remains the *sovereignty/trust narrative*; D61's ladder is the *surface investment sequence*. The hosted tier joins the first ladder nowhere — it is the opt-in scale-up path, never the trust story, never the default, and never in v0/v0.5 launch identity (kill-the-wifi, edge-independent core, free-forever local core all unchanged — D23/D27/D28/§4). Passes the D42 test (compatible only while opt-in and never default/launch-adjacent; that is exactly what this row encodes). | 2026-07-18 |
| D62 | Universal `.dsps` receiver — the read-only viewer that closes the reflex loop | **Any `.dsps` dropped on (or linked into) the app renders the full Dataset Dossier read-only, instantly — no data, no login, no install.** The D48 Dossier renderer with the live-data path stripped: a read path over the existing artifact, **zero new server surface** (§4 clean). Rationale: §24 Play 4 ships the *sender* (beautiful report, attribution footer, D26) but "just send me the .dsps" is a two-sided verb — it becomes reflex only when the *receiver* has a zero-friction way to open one; every `.dsps` in an inbox or ticket becomes a live landing page. Completes the three reflexes: received data → datascope it (D48, shipped); about to send → send the shape (D20, shipped); **received a `.dsps` → open it** (this row). **v0 stretch if trivially cheap, else early v0.5;** internal cut line (like D48's): degrade to rendering the §12.2 HTML report renderer's output. Never moves Oct 6 (D27). Passes the D42 test independently on product/adoption merit. Named the reference consumer of the D64 format inversion. **Workbench amendment (2026-07-24, D71):** the receiver renders in the **Workbench viewer mode** — the same shell read-only, map-forward — instead of a modal overlay (§12.3/§13.3): options strip fully absent, explorer/inspector read-only (edge evidence shown, overrides disabled), D63 trust-chrome slot reserved, exits = export report + start-my-own-session. **The internal cut line is restated, not lost: viewer mode degrades to the single-table Blueprint face / the §12.2 HTML report render**, so the receiver still can never move a date. Drop routing: every drop surface sniffs `dsps_version` and branches `.dsps` → viewer mode **before** the JSON-ingestion path. | 2026-07-18; viewer-mode re-home 2026-07-24 |
| D63 | Verifiable-trust kit — the "approval kit" for organisational adoption | **Trust for organisations must be *filable*, not just demonstrable** — "check DevTools" convinces the individual, not the CISO. Three pieces, ascending cost, bundled with the D50 self-host zip + `/security` page: **(1) Build provenance published (v0.5-era):** §23.2's reproducible build is promoted from CI hygiene to a public trust claim — published bundle hashes + SLSA-style provenance on `/security` (D50), so anyone can verify the hosted bundle is byte-identical to the audited source. Mostly CI discipline + publishing, near-zero app code. **(2) Signed `.dsps` (design round before build; v0.5+):** D45's provenance *labels* gain a verifiable *signature* — the receiver can confirm an artifact was genuinely computed by DataScope from a file with hash X, not hand-edited. Claim discipline (D21/D45): "genuine, unmodified DataScope profile of file-hash X" — **never** "this data is safe." Design constraint: client-side signing against a published public key; any per-request signing service is new server surface (§4) and out of scope without its own round. **(3) Third-party security audit** — recorded as a **GTM expense decision, not spec work**: tied to the first serious design-partner conversation (§24.4), founder-triggered, no date. The bundle — self-host zip (D50) + `/security` + provenance + signature docs — is named the **approval kit**: the one link a champion forwards to security to get DataScope blessed org-wide. §24.4's leave-behind list gains it. **Consistency (2026-07-24):** the Workbench **viewer mode is the named home of the signed-`.dsps` trust-chrome slot** — a full-width provenance band (structure-only claim, signer handle, signature-verified state) in the read-only shell (§13.3); the D45 provenance chrome (computed-as-of snapshot + hash, provenance tags, banned-permanence wording) renders in viewer mode too. No scope change. | 2026-07-18; viewer-chrome home 2026-07-24 |
| D64 | Format-first inversion — DSPS is the platform, the web app its flagship client | **DSPS is the platform; the web app is its flagship client.** The adoption re-derivation concluded the thing that spreads between people and organisations is the *artifact*, not the app — formats are adopted by *encounter*, not by decision. D37 already makes DSPS an open versioned spec; D64 adds the practical consequences: **(a)** a published **JSON Schema + a small validator/parser library on npm**, so third-party tools can consume DSPS without reading our source; **(b) spec-first design discipline** — the DSPS document, not the app's internal types, is the contract (aligned with the already-scheduled v0.5 DSPS-spec work, D45); **(c)** the **D62 viewer is the named reference consumer.** A format only one app reads is an export; this row is the difference. **No new server surface** (§4); v0.5-era, riding the scheduled DSPS work. Reinforces §24 Play 4's format play and the §3.5 market-size ladder. | 2026-07-18 |
| D65 | Deterministic narration — plain-language findings without AI (re-frames D54(b)) | **The deterministic engine narrates its own findings:** template-filled plain-language sentences over D10/D45 facts — *"`order_id` is 99.8% unique with 4 nulls; it looks like this table's primary key"* — surfaced in the Dataset Dossier (§13.1) and the exported report (§12.2). Works identically in local-only mode (D2); **no LLM in the loop.** **Re-frames D54(b):** the business-readable findings narrative becomes *deterministic-first*, with optional AI polish layered on later (that layer inherits D56-style gating: eval-gated, cached, async, deterministic fallback mandatory). Rationale: "explain this to me" is the last reason the D53 business analyst still opens ChatGPT; a large fraction of the narrative is template-fillable from computed facts, and the deterministic sentence never hallucinates. **v0.5** (the Dossier's existing v0 copy already covers the seed); narration templates obey D45 (evidence + confidence phrasing, no permanence claims — "verified"/invariant wording banned). | 2026-07-18 |
| D66 | Semi-structured & log ingestion — deterministic template extraction (designed, deferred to backlog) | A designed-but-deferred ingestion path for **semi-structured text** — application/server logs, key-value blobs (env files, syslog KV pairs), and JSON with inconsistent/drifting shape — using **deterministic pattern and log-template extraction** (regex-based field extraction; log-template clustering in the Drain family) to infer a schema and register the result as an ordinary table through the existing `QueryEngine`/registry (D49/D58) — **no new downstream pipeline, no new engine.** **Explicitly not** prose documents, images, audio, or video (out of scope — deterministic methods there yield metadata/statistics only, not understanding) and **explicitly not AI/ML** — extraction rules are regex/heuristic, transparent, and reproducible, matching the evidence+confidence discipline DSPS facts already carry (D45). **Extends the D32 non-goal, doesn't violate it:** structural parsing of recurring patterns into fields is in-bounds (the same precedent D47 already set for deterministic fact lists) — still no text chunking for retrieval, no embeddings, no vector search. **Deferred, no v0/v0.5/v1 scope change:** the Oct 6 date and D15 cutline cover v0's ingestion path (CSV/Parquet/JSON, structured/tabular data only, D1); this is new format-support scope, recorded so it isn't re-derived, not scheduled (§20.14). **Trigger:** a concrete source of semi-structured data (e.g., a design partner's log export) that the existing formats can't ingest, or its own dedicated design round once v0/v0.5 ship — the log-template clustering approach needs its own spike (D18-style) before any capability claim, per the D43 local-model-honesty precedent. | 2026-07-18 |
| D67 | Demo-spine build sequencing — vertical slice, differentiators before commodity breadth (build-order emphasis, not a scope change) | **Within the settled v0 phases, build the launch-demo spine end-to-end first, then fill breadth around it** — a walking-skeleton sequencing rule, **not** a change to D15's cutline, D27's fixed date / cut order, or any phase's contents. The spine is the single critical path shared by all four §24 plays: **drop → profile → Join Graph → one offline query → Dataset Dossier → "Copy for AI" / structure-report export** (Play 1 kill-the-wifi, Play 3 `/schema-diagram` + `/csv-profiler` + `/ai-context`, and Play 4 the artifact travels all ride it). Two consequences: **(a)** treat that spine working end-to-end — rough is fine — as the **first integration milestone**, ahead of completing Phase 2's chart auto-mapper breadth, so an impressive demo exists weeks before Oct 6 rather than assembling in the final sprint; **(b) inside Phase 3, build the differentiators first** (Join Graph D24 → Dataset Dossier D48 → DSPS / "Copy for AI" D31 → structure-report export D20) **before the commodity chart suite** (correlation / distribution / categorical) **and the pivot / cross-tab UI** (D53) — this already matches the D27 cut order (Join Graph last-cut; the pivot cuttable above it); the phase *prose* merely happens to list the chart modules first, which invites building them first. **Rationale:** the differentiated surfaces are the least fungible and, listed last, are the ones that race the clock; the commodity layers (SQL playground, standard charts — every tool has them) are the safe fill, not the crown jewels. **No new scope, no re-sequenced release tier, no date movement** — clears §24.5 / D42 because it builds *only* already-committed v0 surfaces, just in demo-first order. The D24 Join Graph spike stays in Phase 1 (unchanged), and the no-graph demo variant (D24 / §24.1) still tracks the spine from day one. | 2026-07-19 |
| D68 | Composition layer — the encapsulated decision ladder (recompose, not rewrite; expresses D45/D48/D53/D55/D56/D57/D65) | **The v0 composition layer is modeled as a four-rung decision ladder — drop → Verdict → Thread → Takeaway — where every transition is a typed, minimal, rows-free contract, so each screen emits only the slice the next rung needs and AI (D56) is a drop-in producer at a seam, never a dependency.** This is an information-architecture **recompose of the already-built Phases 1–5, not a rewrite and not a scope change**: no phase contents, no D15 cutline, no D27 date / cut-order move (a build-order recompose like D67). Six parts. **(a) Action Broker (fixes the routing gap at root):** the §9 broker gains a pure deterministic ranker `rankNextActions(tables, insights) → RankedAction[]`, joining broker legality (*what's possible*) with the D10 insight interestingness score (*what's worth doing*); §13.1's "suggested next steps" becomes this ranker's consumer. It is the missing translator from *capability* to *consequence* — the shipped code's every-step-is-"profile again" dead loop is a symptom of its absence, not of the spec (§13.1 already specs the honest-routing behaviour). **(b) Four encapsulation contracts:** `FactRef` (the D45 fact object, promoted to the **universal claim-carrier** — every number the app states, anywhere, carries its SQL + snapshot + confidence/provenance), `RankedAction`, `DatasetVerdict`, `ThreadConfig`; each surface's props are **exactly one** slice — nothing receives the whole registry or DSPS. The slice **is** the D56 AI interface: the AI producer emits or re-ranks the *same* struct the deterministic producer emits, so swapping AI in touches one producer, never the UI or the contracts (the D58 no-parallel-pipelines rule, applied to the view layer). **(c) Tiered Verdict (extends D48/§13.1):** Dossier ViewSpec panels carry `tier: 1|2|3` — tier 1 (the *Verdict*) = identity band + one headline `FactRef` + top-3 `RankedAction`s; tiers 2–3 (evidence, then full profile) behind progressive disclosure. A named **interest/confidence floor** hardens §13.1's thin-profile degrade into a rule: below it the Verdict states *"no single dominant finding — here's the structure,"* never a manufactured headline (a confidently-banal headline is worse than none for the D23 audience that trusts the tool most). D55 contract intact — same fixed registry, never executes model output, still plain JSON. **(d) Navigation restructure (genuinely new intent):** the flat equal-weight sidebar collapses to **four capability-gated intent groups — DATA / EXPLORE / ANALYZE / OUTPUT**; the sidebar is *secondary* navigation (the primary path is Verdict → ranked action → thread), progressively revealed after data loads, with a **sticky "skip to data"** escape hatch so the expert / returning user (the §2 Parquet-first second audience, D22) is never trapped in the guided ladder; chart sub-types collapse into one capability-gated **Charts** destination (only broker-eligible sub-types appear, auto-selecting the first); Studio / ML / Learn leave v0 nav (Learn → header help). **(e) Thread pre-configuration (matures D53 surface-4):** analysis modules accept an optional `ThreadConfig` prefill so a `RankedAction` opens the module **on the answer** — pre-selected columns, pre-run query — not an empty form. **(f) AI seam reaffirmed (D55/D56 — no new AI scope):** the whole ladder is deterministic and is the *complete* product with AI off (D2/D28); AI is an optional alternate producer at exactly the two already-chartered seams — action ranking and D65 narration — bound to the broker grammar, cached per D45 fingerprint, async after the deterministic paint, degrading to deterministic when off / down / uncached. The genuinely-new commitments are (a)'s named ranker, (b)'s three new contracts, (c)'s tier + floor rule, (d)'s nav restructure, and (e)'s prefill; everything else expresses settled decisions. **The phased A–E rollout is complete** — Action Broker, Tiered Verdict, Nav restructure, Thread pre-config, AI-seam freeze — logged in `_implementation/status/BUILD-ORDER.md`'s composition-layer-recompose entries (2026-07-19–20); `REVAMP-PLAN.md` has since been overwritten with unrelated content for a later design round (D69, §13.1), so this row states the ladder standalone rather than pointing at the file. **(d) superseded in the Workbench (2026-07-24, D71):** the four-intent-group *sidebar* is replaced by **explorer + map + options strip + command palette** (§13.3); the capability-gate logic survives and now gates strip buttons; **D68a (broker ranker), D68c (tiered Verdict + floor), D68e (thread prefill → tab initializer), D68f (AI seam) all survive** and power the strip, the map faces, and tab initializers. The "skip to data" *toggle* retires — the intent is served structurally (explorer click-through to a table's Profile tab) plus an optional settings default-tab preference. §13.2 remains the flag-off shell's nav until the W8 cutover. | 2026-07-20; (d) nav superseded in Workbench 2026-07-24 |
| D69 | Dossier intelligence-layer maturation (v0.5; folds the "Intelligence-Layered Dossier" plan) | **Folds `REVAMP-PLAN.md`'s deterministic profiling + heuristics formalization into the *existing* D10/§20.5 insight pipeline as a post-launch v0.5 maturation of the already-shipped v0 Dossier (D48) — not a new pipeline, not a reopening of the closed §13.1/`03-profiling` v0 items, and no move to the D27 date or cut order (the D42 clause is satisfied: it independently passes the §4 minimal-surface constraint and does not touch Oct 6).** Renames the plan's "tiers" to **profiling / heuristics / AI-synthesis layers** so feature-maturity is never written into the D68c ViewSpec disclosure `tier:` field — that enum stays exactly `1|2|3`, no fractional `1.5`. Each layer binds to its correct *disclosure* tier: **heuristics / data-sniffer findings → tier 2**, **per-table profiling cards → tier 3**, and the AI-synthesis layer **never tier 1** (tier 1 is the deterministic Verdict only). Formalizes **`HeuristicFinding`** as the shape of §20.5's "richer rule library" maturation — **one pipeline with D10, never a parallel path (D58)**, sharing D10's rule table + interestingness ranking (effect size × coverage) and feeding the existing `rankNextActions` (D68a) — with a **mandatory `sql` field + a D45 `FactRef` snapshot on every finding** (no bare confidence enum; confidence maps onto the D10 interest score). **If an expandable column-level Dossier rendering is ever built, its inline per-column stats *are* this tier-3 profiling-card content — one pipeline with D10, each stat carrying its D45 `FactRef` — never a second, separately-computed stat path (D58).** **Excludes** FK-candidate detection — its single owner is the D24/§20.6 containment + name-agreement grammar (a structure-only name+type matcher is the exact D17 trust-landmine) — and **seasonality** (still §20.5-deferred, not carried by D69). The AI-synthesis layer ships as **D65 deterministic narration only** (rule-based domain guess + templated narrative over D10/D45 facts, no LLM); **LLM-authored freeform panel content stays the rejected D56 option-C** unless a separate eval-gated decision (its own D40-analogue) is taken. The plan's Tailwind "Design Language Guide" does **not** enter master (implementation-level; the semantic color intent lands leaf-only, stripped of classes). **Consistency (2026-07-24):** in the Workbench the **map faces carry the intelligence layers** (Blueprint face / selection panel / Verdict band, §13.3); the `tier: 1|2|3` disclosure discipline and layer→tier mapping are unchanged. | 2026-07-21; map-face home noted 2026-07-24 |
| D70 | v0.25 milestone — Blueprint-forward opening + edge-warm synthesis → WebLLM handoff + BYOK (post-launch curation of the AI slice; expresses D48/D68/D69, advances D2/D43/D56) | **A new named release tier, v0.25, is inserted between v0 and v0.5 — shipped *after* v0's Oct 6 launch, so D15's v0 cutline and D27's fixed date are untouched (v0.25 is post-launch curation, never a v0 re-scope; passes the D42 test — the founder wants it as a *user*, it is opt-in, never default, never in v0 launch identity).** v0.25 is a *re-sequencing* of already-decided v0.5 AI work into an earlier tier around one UX thesis: **the app opens on an informative Dossier-forward "Blueprint," not the mechanical sidebar flow.** Four contents. **(1) Blueprint-forward opening (realizes D48/D68/D69 visually, no new engine):** the Dataset Dossier / D68 Verdict becomes the primary post-ingest surface — schema + inferred relationships + the D69 intelligence-layers (profiling / heuristics / AI-synthesis) as the opening view — presentation over shipped v0 modules through the D55/D68 ViewSpec, the D68d "skip to data" escape hatch preserved for the §2 second audience. **(2) Cloudflare-edge AI synthesis (warm start):** a Worker emits the initial dataset-synthesis narrative + suggested explorations fast, covering WebLLM's model-download cold-start; it is the **D56 async "tailored this view" upgrade, never on the first-paint critical path** — the deterministic Verdict paints first, always (D55/D68c), and is the complete product with AI off (D2 local-only / D28). **(3) WebLLM client handoff (the one genuinely-new architectural commitment):** while the edge paints the warm synthesis, in-browser WebLLM/WebGPU downloads and warms in the background, then **takes over the NL/conversational surface fully client-side (zero egress)** — the privacy "take it further." This advances the D43 WebLLM path, which **still must pass its D43 kill criteria** (DuckDB-Wasm memory coexistence, an SQL-quality floor vs. cloud, acceptable download UX) recorded in ADR-007 before any local-capability claim; until it passes, the edge/BYOK path is the conversational engine and WebLLM is progressive enhancement. **(4) BYOK:** bring-your-own-key pulled forward from v0.5 — exactly D2 mode (c) / D3 "prefer my key" / D9 stateless-pass-through custody, no new custody design. **Privacy reconciliation (load-bearing, consistent with the sacred decisions):** edge synthesis is **opt-in, structure-only (DSPS facts, never rows), stateless pass-through (D9), never stored/harvested (D59)**, and **local-only mode never calls the edge (D2)**; structure crossing the edge obeys D45/D46 (provenance-labeled; column names are themselves sensitive, so edge synthesis is an explicit opt-in mode under D2's first-run chooser); the whole ladder degrades to the deterministic ViewSpec when AI is off / down / uncached (D56). Everything except content (3) expresses/curates settled decisions; recorded as a curation row like D67/D68, not new AI scope. **Consistency (2026-07-24, D71):** in the flag-on shell **the Workbench dataset map *is* the Blueprint-forward opening** — same Dossier/Verdict content, same modules, same ViewSpec; the two descriptions are one opening, not competitors. The "skip to data" escape-hatch reference here reconciles with the D68d supersession: in the Workbench the escape hatch is the structural explorer click-through + optional settings preference, not a toggle. **One WebLLM consent trigger, restated:** this row's consent-gated download is *the* gate — the Workbench's capable-device auto-enable only pre-selects the switch and highlights the pane; shards download and warm-up begin solely through this confirm, off the ingest/first-paint critical path. Edge-warm synthesis fires only under a confirmed-active egress mode (§5.1/D56). | 2026-07-21; Workbench reconciliation 2026-07-24 |
| D71 | Workbench adoption (UI-redesign fold; supersedes D68d's nav structure; expresses D48/D55/D68a·c·e·f) | **The Workbench is adopted as the app's second shell behind `WORKBENCH_ENABLED` — a VS-Code-shaped instrument: left explorer (tables, per-table actions, Add-data, share-links), middle tabbed canvas opening on the dataset map (multi-table ERD / single-table Blueprint face — the re-homed D48 Dossier), a broker-ordered **options strip above the map only**, a **command palette (⌘K) that reaches every feature home — Workbench-launch-blocking, not polish**, an optional right AI pane with flat mode switches (D2 amendment) + a "Configure workspace" surface, a bottom scent-only inspector (edge evidence/overrides), and a status bar with an explicit density budget.** Contracts: a tab is a spec **with the D55 envelope invariant (app-authored envelope; model output only as validated inner artifact specs)**; **keep-mounted is the v0 tab-preservation norm** — restore-from-spec opt-in where cheap, **full tab-list serialization deferred to the D61 hosted-tier design round** (the hosted tier is its only real consumer; "memory ceiling is a non-policy" is *not* adopted as settled); strip membership = capability-gate against the current selection's subject, strip order = broker ranking filtered to that subject (client-side filter of the dataset-wide `RankedAction[]`, never a second ranker — D58); gated strip actions render **disabled-with-reason** (today's teaching copy survives; legal-but-unranked actions collapse under "more"). Viewer mode = the same shell read-only (D62 amendment). Ships **in parallel** with the current shell — §13.0 stays the spec of record for the flag-off surface, **§9.1 ship-timing stays open until the W8 flag flip (the human's call)**; W0–W8 build phases in §19. Five hallmark mocks signed off 2026-07-24 are the visual reference (`_implementation/_misc/ideation/hallmark/`). | 2026-07-24 |
| D72 | Deeper cloud grounding — graduated, bounded row-sample escalation (realizes D59's sanctioned-opt-in clause; extends §11.3) | **A cloud AI turn may be grounded in a *larger, user-controlled, capped* sample of real rows — never the whole dataset.** The user chooses the amount (the default 3-row repair sample → larger samples → a **hard cap, N rows / M bytes, launch defaults set at build; refuse-with-guidance above it**); that graduated choice *is* the "give users the choice" decision (founder, 2026-07-24). **Homes:** a control in the Workbench **"Configure workspace"** surface + a **contextual prompt on a weak AI turn** ("Not accurate enough? Send more of your data to improve the answer"). **Consent:** default-off, **per-session, non-sticky**; disclosure of exactly what leaves is a **precondition** of egress (flip → disclose → confirm → send) — inherits the D2 Workbench invariant and never re-arms silently across sessions (§5.2). **Bounds:** transmit-only — sampled rows go to the provider for that turn only, **never persisted to R2, never written into a `.dsps`, never part of a share** (D20/D45 intact); the `Off` switch (D2 mode (a), the global kill-switch) aborts any in-flight grounded turn and disables the control. **Labeling (D21/D46):** custody-differentiated — Cloudflare route: *not used for training, not stored by Cloudflare; transient performance caching may apply*; BYOK route: *rows go to your provider under your provider's terms, which DataScope cannot control*; plus a "may contain sensitive values" caveat in v0 (rows are re-identifiable, D45/D46; the full detector stays v0.5, positives-only). §24's absolute claim softens to *"…unless you explicitly send it."* **The literal entire-dataset / server-side-execution tier stays deferred to the D39/D61 design round** — labeled "requires hosted mode," never built as a v0 switch. | 2026-07-24 |

---

## 1. Executive Summary

DataScope is a browser-native analytics IDE — end state: **DataScope Studio** (D12). The identity is not "chat with your CSV"; it is **a browser application that understands data structures**. Drop a folder of Parquet files and the app profiles every table, infers the relationships between them, identifies fact and dimension candidates, renders the schema graph, scores data quality, and emits the result as a generated dbt project and an exportable semantic model — entirely client-side, deterministic, no upload. The full arc:

```
Drop folder of Parquet/CSV → automatic profiling → relationship inference
→ schema graph → quality report → generated dbt project → SQL playground
→ interactive documentation → export semantic model
```

**The foundation releases (v0 + v0.5, D15) build toward that arc.** Users drop one or many CSV/Parquet/JSON files into the browser (or point it at an API), and the app auto-profiles each table, classifies columns by semantic type, and dynamically enables the SQL, charting, and AI-chat modules that the data supports. The core analysis engine — a full OLAP database (DuckDB-Wasm), schema profiling, SQL execution, chart rendering — runs entirely in the browser tab.

**Foundation pillars: ingest (multi-table, D13) → profile → SQL → charts + a confidence-labeled Join Graph (beta) slice and the structure-report export (v0; D20/D24/D31), then AI chat + connectivity/persistence (v0.5).** The post-ingest landing surface is the **Dataset Dossier** — the folder-level "what have I been handed?" overview (v0; D48), packaged from these modules; the product arc is **structure × time**, with v0 shipping *structure* and v0.5 adding *time* via the Drift Report (D44/D52). The Studio arc — quality report, full relationship inference, schema graph, dbt/semantic export — is the v1 release (Phases 7–9, §19; designs in §20.6/§20.8); Phase 8 inherits the v0 Join Graph (beta) rather than starting from zero (D24). ML modules (clustering, regression, classification, NLP) are designed but deferred behind it (§20.1).

The server-side surface is deliberately minimal and enumerated, not a general backend:
- a **stateless CORS relay** (Cloudflare Worker) for API ingestion that fails direct fetch,
- **AI inference routing** (Workers AI by default in cloud mode, BYOK via a credential vault),
- an **opt-in R2 persistence layer** for explicitly saved/shared datasets.

No server-side query execution, no server-side schema processing, no always-on state. (The one chartered future exception — the opt-in D39 hosted staging & server-side execution tier — is now the **chartered second platform rung** on the D61 surface-investment ladder: **browser → hosted tier → desktop → the rest on request.** It stays behind its own design round, remains opt-in, and is never the default or part of the v0/v0.5 launch identity — the platform ladder is a scale-up path, not the trust story, D61.)

The machine-readable profile the product emits — **DSPS, the DataScope Profile Spec (D31/D37)** — is a first-class, open, versioned interface, not an export afterthought: a spec other tools and agents consume (§6, §12.2), and the substrate the D38 MCP surface serves.

---

## 2. Target Users

**Lead audience — the privacy-constrained data worker (D22/D23).** Someone in a regulated or sovereignty-bound environment (finance, healthcare, government) who *cannot upload* and *cannot share raw data* but must show what their data looks like — and needs proof, not promises, that nothing leaves the browser ("no upload, by construction — check DevTools"). The launch narrative is built for them (D23, §24); its **headline frame is the inherited-data moment** — *someone just sent you data you don't understand* — with privacy as the standing **permission line** ("nothing leaves your browser — check DevTools"), not the headline (D52). That frame widens the launch channel without moving this audience definition (D22/D23 unchanged).

**Explicit second audience — the Parquet-first data engineer** (DuckDB, MotherDuck, Iceberg/Delta exports, local lakehouses) who wants a zero-install workbench and profiler for files that never need to touch a warehouse. Different motivation from the lead audience, served by the same engine — not a co-headline; only one audience can own the launch message.

Also served by the same free tool:
- **Data analysts** (SQL-comfortable) — a fast, zero-setup SQL workbench + profiler for datasets they'd otherwise wrangle in Python/Jupyter; already well-served by the core modules. The regulated beachhead user is usually one of these, which is why serving analysts better also serves D23.
- **Business analysts** (SQL-averse) — served *without writing SQL* via the pivot / cross-tab surface and guided task-shaped answers (§10 Modules 2/7, D53), plus take-it-with-me exports into the tools they live in (§12.2). This no-SQL on-ramp is what makes the product usable for the analyst who will never open the Monaco editor — an **explicitly served audience, not a co-headline** (D53 extends D22/D23; the launch voice and beachhead are unchanged).
- Analytics engineering students learning SQL patterns, statistical profiling, dimensional modeling (Studio arc), and (later) ML fundamentals
- Anyone who wants to quickly profile a dataset without uploading it to a third-party service

DataScope is a product measured in users, not a portfolio demonstration — the public, shareable, hard-engineering artifact is a side effect, not the stated purpose (D22). It is still not a production ETL platform: the Studio arc's dbt export produces a scaffold for a human to review and own, not a deployed pipeline.

---

## 3. Positioning & Landscape

### 3.0 The problem — the invisible step before analysis

Most people who work with data don't spend the day writing SQL. The day is a
**context-gathering chain**: a Slack request ("why is revenue down?") → find the relevant
tables → work out what each column means → discover the schema changed → join several
tables → find duplicates → clean weird values → *then* write the query, build the chart,
and explain the result — and repeat tomorrow. An estimated **20–30% of that is analysis**;
the rest is the **orientation tax** (D57) — orientation on data someone else produced, paid
again on every new export.

Six recurring time sinks define that stage — and each maps to a DataScope surface:

| # | Pain | Where DataScope answers it |
|---|---|---|
| 1 | "What *is* this dataset?" — orienting on unfamiliar files | Profiling + quality, surfaced as the **Dataset Dossier** (D48, §13.1) |
| 2 | Finding join keys across inconsistently named tables | The **Join Graph** (D24) — multi-table structure inference, the one still-unclaimed capability (§3.4) |
| 3 | Data-quality surprises (wrong totals, nulls, duplicates, silent pipeline failures) | Proactive quality flags, not raw-row spelunking |
| 4 | Re-exploration — the same orientation redone months later; the same query redone on next month's export | The portable structure artifact (DSPS, D31/D37), the **Drift Report** (D44), and the re-runnable transform recipe (D53, §12.1) |
| 5 | Explaining findings — assumptions, confidence, caveats | Evidence + confidence on every fact (D45); the structure report (D20) |
| 6 | Packaging the answer — the result leaves as a deck, spreadsheet, or summary for a stakeholder | Take-it-with-me exports (D53, §12.2); the business-readable findings narrative (D54, v0.5+) |

Every data lifecycle hides an unnamed stage between *receiving* data and *analyzing* it:

```
Receive dataset   →   ??????????   →   Analysis
```

That question-mark stage — **understand what you've been handed** — is what DataScope is
built for, and it is precisely what BI tools, data catalogs, and chat-with-CSV tools skip
past. It also defines the audience: **people who inherit data** — consultants, auditors,
journalists, data engineers on legacy systems, analysts joining a new company — the frame
the launch copy sells (D52, §3.5, §24). The differentiated *how* follows in §3.3; the
market and channel in §3.5.

### 3.1 DBMAN.AI comparison — verdict

DBMAN.AI is not a direct competitor; it's a different category of tool:

| | DBMAN.AI | DataScope (this doc) |
|---|---|---|
| Architecture | FastAPI + LangChain/LangGraph backend, Groq-hosted LLM | Browser-first, DuckDB-Wasm; minimal enumerated edge services (§1) |
| Target | Live MySQL/Postgres/SQLite, full CRUD + schema mutation | Uploaded files + API pulls (read/transform only) |
| Data exposure | Schema + query results sent to Groq's cloud API | Tiered: local-only mode = nothing leaves the browser; cloud-AI mode = schema + prompts (sample rows only with opt-in, §11.3) |
| Blast radius | Agents can DROP/ALTER production tables | No live DB connection, so no mutation surface at all |
| NL→SQL rigor | README claims "leverages Groq API + LangChain/LangGraph," no self-correction described | Execute→fail→resample→retry loop is the core recommended pattern (mirrors LangChain's own reference SQL agent) |
| Maturity | Built and shipped (Tauri desktop app) | Planning docs, nothing built |

**Conclusion:** if the yardstick is "safer, cheaper, more defensible NL→SQL for ad hoc file analysis," DataScope wins on design. If the yardstick is "a working tool that administers a live production database today," DBMAN.AI wins by default — it does things (live connections, CRUD, schema mutation) DataScope doesn't attempt. Not an apples-to-apples comparison; don't treat DBMAN.AI as a benchmark to beat feature-for-feature.

### 3.2 Prior art

- **Vanna.ai** — open-source schema-RAG text-to-SQL: trains a retrieval layer over your schema (DDL, docs, example pairs) so the model only sees relevant context, then executes the SQL and returns a dataframe or auto-generated Plotly chart. Covers schema-pruned prompting and auto-charting as shipped functionality. Vanna 2.0 rebuilt around an agent architecture (lifecycle hooks, LLM middlewares, per-user conversation storage, observability).
- **LangChain's official SQL agent** — documents the full loop DataScope's AI layer adopts: discover tables → inspect schema (with sample rows) → generate → validate → execute → automatically rewrite and retry on error → format the result. Same retry pattern demonstrated specifically on DuckDB (MotherDuck tutorial).
- **Academic lineage** — execution-feedback self-correction for text-to-SQL is well studied: DIN-SQL (internal self-correction only buys 1–3 benchmark points — evidence that *execution-based* feedback matters more than self-review), MAC-SQL (dedicated "Refiner" agent that runs the candidate query and rewrites on errors/empty results — closest analog to DataScope's repair loop), RetrySQL (trains on retry trajectories), THOR (retry cap to prevent infinite loops), QUITE (distinguishes *syntax* errors from *equivalence* errors — query runs but means the wrong thing — with different correction strategies; relevant future extension).
- **SQL Workbench ("Chat with a Duck")** — LLM wired directly into duckdb-wasm client-side, no server, defaulting to locally-run models via Ollama including DuckDB-NSQL (a DuckDB-specific fine-tune trained on ~200K synthetic DuckDB SQL pairs). Direct precedent for DataScope's *local model* AI mode.

Full source list in Appendix A.6.

### 3.3 What's actually differentiated

None of the individual foundation-release pieces is a new architecture. The comparatively rare combination: browser-native OLAP over the user's *own* files, an adaptive capabilities broker that only offers analysis the data supports, a self-correcting NL→SQL loop with a tiered, user-controlled privacy model — packaged as a single static-hosted product rather than a server-side warehouse tool (Vanna, LangChain agents) or a general-purpose workbench (SQL Workbench).

The durable differentiation is the Studio arc (D12): **structure understanding**. Chat-with-CSV tools answer questions about rows; nothing in the landscape takes a folder of Parquet files and hands back the join graph, the fact/dimension split, an ER diagram, a quality report, and a generated dbt project — client-side, deterministic, no upload. For the beachhead user (§3.5), the daily competitor isn't a named tool in §3.4's lane table at all — it's the informal CSV → Excel → Google Sheets → ChatGPT → PowerPoint → Slack workflow every analyst already runs; DataScope's job is to collapse that chain, not out-feature a BI product. Two adjacent identities the arc absorbs rather than competes with:

- **"Lighthouse for data"** — a diagnostics report engineers run against an unfamiliar dataset the way Lighthouse is run against a page (Phase 7, §20.8). Less BI, more diagnostics; a clear identity on its own.
- **A browser-native DuckDB workbench** — the Parquet/lakehouse ecosystem (DuckDB, MotherDuck, Iceberg/Delta, S3-resident data) is growing faster than its tooling, and most analytics UIs still assume a SQL warehouse. The `httpfs` bucket-first mode (§20.3 rung 1, backlog) is the natural extension.

Adjacent-project note (portfolio value is a side effect, not a purpose — D22): off-the-pace demonstrates a *vertical* analytics product — one hard domain problem solved deeply. DataScope Studio is the *horizontal* engine — developer tooling. That the pair signals product design, data engineering, frontend architecture, and systems thinking is a byproduct of building a product measured in users, not the goal.

### 3.4 Competitive map — researched July 2026

Web-verified landscape survey (full detail + sources in `_implementation/product/competitive-landscape.md`). Six properties define DataScope's lane: **① ingests raw files · ② infers structure/relationships · ③ browser-native · ④ no login · ⑤ no upload (client-side) · ⑥ free.** Every surveyed competitor drops at least one:

| Lane | Players | What they drop |
|---|---|---|
| Draw-your-own ER | drawDB, ChartDB | ② — no ingestion or inference; hand-drawn or pasted DB metadata. Validate the ③④⑥ distribution model. |
| Infer-from-files modeling | DbSchema, SmartDraw, Hackolade, Lucidchart | ③④⑥ — the *capability* (CSV → inferred PK/FK model) exists, but heavyweight, paid, install-required, enterprise-packaged. |
| In-browser DuckDB-Wasm AI workspace | QueryPad (github.com/vericontext/querypad) | **Closest architectural neighbor.** Scans folders, infers FK relationships with confidence scores via DuckDB-Wasm, but relies on LLMs for core semantics, lacks deterministic profiling/DSPS export, lacks granular AI privacy/BYOK options (Local-only, Ollama, Cloud routing), and uses a basic unpolished SQL-editor UI vs. DataScope's studio-grade IDE design. |
| Single-file client-side profiler *(new — SplitForge, Feb 2026)* | SplitForge (splitforge.app/data-profiler) | ② — the closest *new* profiler neighbor: client-side, free, no-login CSV profiler with quality checks and "candidate FK" hints, but **single file only**; holds ①③④⑤⑥. |
| Viewer/profiler cottage lane *(updated Jul 2026)* | viewparquet.com, parquet-viewer.com, parquetexplorer.com, exploremydata.com, Kanaries, parquetreader.com, TRIRIGA Data Workbench, ParquetKit, parquetly, parquet.online, Bedevere, Huey, DataStory, Quak | ② — free, no-login, DuckDB-WASM, "your data never leaves your browser," but no multi-table structure/relationship inference or DSPS exports. **"No upload" is now table stakes in this micro-lane, not a differentiator — the six-property intersection has narrowed to ② alone.** |
| CSV-diff cottage lane *(new — Jul 2026)* | csvdiff.app, Datablist CSV Diff, DataFlowMapper, csvkit, Apify diff actor | free, in-browser, cell-level, user-picked keys — **none infers the key, handles a folder, or reports distribution shift** (the D44 Drift Report competitive boundary). |
| Cloud DuckDB + AI | MotherDuck | ④⑤ — login-gated cloud warehouse; a free tier now exists (3 users / 10 GB / 10 compute-hrs, Dec 2025–Feb 2026 restructure) and the free local **DuckDB Local UI** (`duckdb -ui`, Column Explorer) largely closes the *viewer* need for the Parquet-first engineer — but it does no relationship inference, quality scoring, or shareable artifacts, and login+cloud still gates sharing (§24.3 counter-positioning stands). |
| BI-as-code / notebooks | Rill, Evidence, Hex, Count, Deepnote | ④ (and mostly ③/⑥) — login or local install + config; dashboards/notebooks, not structure understanding. |
| Chat-with-CSV AI | ChatGPT ADA, Claude, Julius, Powerdrill, camelAI | ②⑤ — upload-based, row-level Q&A; a commoditized lane frontier labs give away. Not the fight to pick (consistent with D12). |
| Local-first DuckDB studio | Duckle (open-source ETL/ELT) | ②③ — headline is pipeline/ETL, not instant structure understanding; a Tauri **desktop** app (beta v0.0.12), not a browser threat. |
| Desktop-native viewer *(new — Duckling; distinct product from Duckle, do not merge)* | Duckling (github.com/l1xnan/duckling) | ②③ — Tauri-based fast viewer for CSV/Parquet/DuckDB/SQLite, native engine, open-source; occupies the desktop-viewer lane and **validates the D51 architecture**, but drops the browser surface and inference. |

**ER-diagram intent (note).** SmartDraw, Lucidchart, and DbSchema contest the schema-diagram SEO, but they import *definitions/metadata* — none infers relationships from raw data *values*, in-browser, free, no-login. Launch copy exploits that honesty gap: *"they diagram your definitions; we infer from your data"* (§24.1 Play 3).

**Finding:** the six-property intersection — *drop raw files → infer structure → in-browser → no login → no upload → free → shareable* — now survives **on ② alone**: as of July 2026 the viewer/profiler micro-lane has commoditized ③④⑤⑥ ("no upload" is table stakes), so multi-table structure/relationship inference is the last unclaimed capability. **Honest moat assessment:** every individual capability exists somewhere; the novelty is entirely in the combination and packaging, so the defense is distribution + execution speed + brand, not technology. **Threats to watch:** MotherDuck (funded, DuckDB-native, free tier + Local UI now closing the *viewer* need), QueryPad (closest architectural neighbor for FK inference), and SplitForge (closest client-side profiler, single-file-only today). Re-verify this survey before the v0 launch narrative is written — it is a snapshot, like Appendix A's library survey.

### 3.5 Distribution & audience strategy

One build serves two audiences; the difference is positioning, not code. The **privacy-constrained data worker is the primary v0 audience (D22/D23)** — people who *cannot upload* and *cannot share raw data* but must share what their data looks like (regulated finance, healthcare, government). The "share the shape, not the data" tiers (D20/D21, §12.3, §20.11) serve them with the same engine, and the launch narrative is built around them (D23, §24). The **free single-player tool** — instant, no-login, client-side, the drawDB/excalidraw/regex101 playbook (time-to-first-insight ≈ 0) pointed at the structure report — is the funnel and the public hard-engineering artifact; portfolio value is a side effect (D22), not the purpose.

**Launch-copy frame (D52).** The headline sells the **inherited-data moment** — *someone just sent you data you don't understand* — because "people who inherit data" (consultants, auditors, journalists, data engineers on legacy systems, analysts joining a company) *contains* both the launch channel and the regulated beachhead; privacy is the standing **permission line** ("nothing leaves your browser — check DevTools"), not the headline, and the product arc is **structure × time** (v0 ships structure, v0.5 ships time via the Drift Report, D44). Beachhead, GTM focus, and the D21/D23 audience and language rules are unchanged — D52 refines the copy frame only; actual draft copy is deferred execution work.

Two product consequences, both cheap because the spec already contains the machinery: **(1) the shareable structure report is a first-class artifact** — client-side export in v0, default hosted share artifact in v0.5 (D20); **(2) the cold-start demo is a launch gate** — the bundled-sample guided tour (§14, §19 Phase 6 pull-forward) must deliver a genuinely impressive result in seconds, because time-to-first-insight is the one axis on which a solo builder beats every funded player.

**Serving analysts without moving the beachhead (D53/D54).** The data/business analyst is an explicitly *served* audience, not a co-headline — the analyst-completion surface (pivot / cross-tab, guided task-shaped answers, take-it-with-me exports; §10, §12.2) is v0 product surface that makes the tool usable for the SQL-averse business analyst *and* strengthens the beachhead (the regulated worker is usually an analyst too). The personal metric layer + findings narrative (D54) extend this on the enterprise rail at v0.5+. None of it touches D22/D23's launch voice or the Oct-6 date (D27); analysts remain the free funnel, now with a no-SQL floor under them.

**The local core loop is free forever (D28)** — ingest, profile, SQL, charts, insights, quality report, structure-report export; paid only ever follows real server-side cost or team value (§20.10), so pricing pressure never warps the architecture. Growth is two rails off one engine, extending the ladder rather than replacing the identity:

```
Enterprise rail: free structure tool → privacy-safe shape sharing → team semantic layer
Consumer rail:   personal templates (D30) → token-API connections (D34)
                 → cross-platform workbench (D35) → Pro conveniences (D36, deferred)
```

**Why the consumer rail is safe to run (D33).** Personal-analytics aggregators have died for 15 years (Exist.io, Gyroscope, Zenobase, the Quantified-Self generation) of three things: novelty churn, cloud custody ("upload your whole life"), and per-user infra cost against weak retention. DataScope's physics invert two of them — local-first means *no custody*, and a consumer session costs ~nothing to serve, so curiosity traffic that would bankrupt a venture-backed aggregator is here **free funnel**. Novelty churn stays true and doesn't matter: the consumer rail need not carry the company, and a one-session visitor who posts a screenshot (D26 attribution) has already paid their way — prosumer traffic needs screenshots, not retention. The NL→SQL consumer flow is the existing §11.1 architecture, not new scope (D33). The v0.5-era consumer launch line, recorded for then: *"Drop your files. Paste your API token. Understand your data. Share the shape, never the data."* Full launch strategy in §24.

---

## 4. Constraints & Non-Goals

| Constraint | Detail |
| :--- | :--- |
| **Not a production ML platform** | Any models trained here (post-v1) are educational demonstrations. No model export, no serving, no hyperparameter grids. |
| **Desktop-first** | Optimized for desktop Chrome/Firefox/Edge. Tablet is a nice-to-have. Mobile is out of scope — the SQL editor and chart layouts require screen width. |
| **Browser memory ceiling** | ~2GB tab limit. Files over ~100MB trigger the sampling/preview fallback (§7.3). |
| **Minimal, enumerated server surface** | No general backend and no server-side query execution. The only server-touching paths are the three listed in §1, each opt-in or clearly disclosed (§5). The one chartered exception is the opt-in D39 hosted staging/execution tier — the **chartered second platform rung** on the D61 ladder (browser → hosted tier → desktop → rest on request), still design-round-gated, still opt-in, never the default. |
| **Edge-independent core** | With every edge endpoint disabled or unreachable, the core loop — ingest, profile, SQL, charts, insights — remains fully functional; cloud features (AI cloud mode, Tier-2 relay, save/share) render a clear "paused/unavailable" state, never a hang or crash. This is the property that makes every §23.5 ceiling and kill switch safe to pull (verified by §18 / §22). |
| **No real-time collaboration** | Single-user, single-tab experience. Share links (§12) are static snapshots, not multiplayer. |
| **No XLSX native support** | Excel files must be converted to CSV before upload (§7.1). |
| **No live database connections** | Technically impossible from the browser (no raw TCP); deferred design in §20.3. |
| **No silent DSPS harvesting / server-side structure accumulation (D59)** | DataScope never auto-stores generated DSPS to product-account cloud, and keeps no cross-run accumulation of user structure server-side (D45 stateless-per-run; §1 no always-on state). Learning "how users use the app" runs on the D25/D41 content-free counters; making "the next dataset faster" runs on a local zero-egress cache (D44) or explicitly-shared/staged artifacts (D38/D39) — never a background harvest. A future opt-in "contribute my structure" feature must be labeled, per-artifact, and off by default. A boundary, not a deferral — no revive trigger for the silent/default form. |
| **No generic chunking / RAG platform (D32)** | DataScope does not build document chunking, embeddings, vector storage, retrieval pipelines, or RAG plumbing — a different product, and a well-funded field (LangChain, LlamaIndex) already fighting that war. The AI-facing surface is DSPS + "Copy for AI" client-side by default (§12.2, D31), plus the D38 MCP surface over shared or explicitly staged artifacts only — still **deterministic structural chunking** (metadata extraction via client-side DuckDB-Wasm, *not* traditional text chunking), never generic RAG plumbing. A boundary, not a deferral — no revive trigger. **Clarification (D47):** a deterministic, SQL-derived fact list with evidence and confidence — no vectors, no embeddings, no similarity search — is in-bounds structural metadata, not RAG; the D32 non-goal is unchanged. **Extension (D66, designed/deferred):** deterministic log/semi-structured template extraction — regex/pattern-based field extraction turning logs, key-value blobs, and messy JSON into ordinary tables — is likewise in-bounds structural parsing, not RAG; still no embeddings, no vector search, no text chunking for retrieval, no ML/AI in the extraction path. Designed, not scheduled — see §20.14. |

---

## 5. Privacy Model (Tiered)

The original PRD promised "no network requests after page load." That absolute promise survives as **one selectable mode**, not as the only architecture. The reworked principle: **raw dataset rows never leave the browser except through explicit, labeled user actions** — the labeled row-leaving actions being exactly: the §12.3 full-dataset share escalation, the D39 hosted staging opt-in, the §11.3 data-sampled repair, and the **D72 deeper-cloud-grounding sample escalation** (graduated, capped, per-session — §5.2).

### 5.1 AI modes (D2 — all three ship; consent placement is shell-conditional: first-run chooser / Workbench switches)

**Renamed 2026-07-22 (human directive, folded into the `06-ai/03-privacy-disclosure` build):** "Cloud AI" → **"API"**, and localhost Ollama access moves out of "Local model" and into "API" — reached through the same key/endpoint field a cloud key uses, which auto-detects its own shape (§11.2). "Local model" narrows to the in-browser WebLLM/WebGPU path only. The three-mode shape and D2's substance are otherwise unchanged.

**Workbench consent surface (2026-07-24, D2 amendment / D71 — shell-conditional during the flag-parallel period).** The **current shell keeps the app-open first-run chooser** exactly as specced while it remains launch-capable (§9.1 open until W8). The **Workbench** renders the same modes as **flat switches above the AI pane — `Off` · `Cloudflare` · `WebLLM` · `Your own key (local or hosted)`** — a presentation re-partition, not a fourth mode: Off = mode (a); WebLLM = mode (b); Cloudflare and Your-own-key are the two faces of mode (c) with the D3 routing choice made visible. Rules, all load-bearing:

- **Off by default; capable-device pre-select.** AI is off on first assembly. A **capable device** — defined against the ADR-007 pinned model: WebGPU present *plus* a memory floor derived from the D43 coexistence criterion (can this device run the pinned 1.5B q4f16 coder alongside DuckDB-Wasm); coarse, binary, recommendation-only — **pre-selects the `WebLLM` switch and highlights the pane. Pre-select is never auto-download:** shards pull and warm-up begin only through the D70 download-confirm (the single WebLLM consent gate), and warm-up stays off the ingest/first-paint critical path (§3.5/D56). Non-capable devices can enable WebLLM manually behind the same confirm.
- **Flip lifecycle — disclosure is a precondition of egress.** An egress-capable switch (`Cloudflare`; `Your own key` with a bearer key; the D72 grounding control) activates only through **flip → disclosure shown → explicit confirm → mode becomes active**. No producer — the D70 edge-warm synthesis upgrade included — may egress while a mode is merely *selected*; only *confirmed-active* counts. `Off` and `WebLLM` are zero-egress and need no egress disclosure (WebLLM's *download* is separately confirmed per D70).
- **`Your own key` is the one exception to flip-time disclosure** — its egress posture depends on the field's auto-detected shape (§11.2): the flip opens the field, and the disclosure resolves *after* detection — URL → zero-egress localhost Ollama; bearer → leaves to the user's provider — with no call until the shape is resolved and its disclosure confirmed ("flip → field → shape-disclosure").
- **"Configure workspace."** The fuller data-handling controls — the D3 routing toggle, metadata-only-repair (§11.3), the **D72 grounding amount**, BYOK custody — live in an on-demand **Configure workspace** surface opened from a button near the AI composer; there is **no forced post-upload gate**. The default (off) surface carries one passive reassurance line: *"Nothing leaves your machine — configure AI when you want it."*
- **Egress modes never persist across sessions** — the §5.2 persistence boundary: only zero-egress preferences (`Off`, WebLLM-enabled, theme, BYOK *reference*) persist; `Cloudflare`, a leaving bearer key's active state, and D72 grounding reset off each session and re-disclose on re-arm.

| Mode | What leaves the browser | Notes |
| :--- | :--- | :--- |
| **Local-only (AI off)** | Nothing after initial page load | The original PRD promise, intact. Acts as the global AI kill-switch. |
| **Local model** | Nothing (inference via the in-browser WebLLM/WebGPU model only) | DuckDB-NSQL / Chat-with-a-Duck precedent. One-time download; weaker SQL generation than cloud. The **D43 spike passed (GO, 2026-07-21; ADR-007)**, pinned to a small coder (Qwen2.5-Coder-1.5B q4f16), Worker engine + resumable download; a "local" number in the D40 harness stays **D40-gated** before any comparative claim (D43, §11.2). Localhost Ollama is no longer reached through this mode — see **API**, below. |
| **API** | **Ollama-shaped field, routing never explicitly set (the default): nothing** — treated as prefer-endpoint until the user explicitly picks a Routing option; same zero-egress shape "Local model" always had for Ollama. **Ollama-shaped field + "Prefer my key" (explicit): nothing** — inference goes browser→localhost directly, never through the edge Worker. **Ollama-shaped field + "Use free tier first" (explicit):** the payloads below leave for Workers AI while the shared budget serves; **nothing** leaves once the client overflows to the local Ollama endpoint (the Worker cannot reach `localhost`, so the overflow is client-orchestrated — §11.2). **Any other (bearer or empty) field:** schema (table/column names, types), prompts, generated SQL, error traces to the routed provider (Workers AI or the user's key). Sample data rows **only** if "data-sampled repair" is enabled (§11.3). | Workers AI by default; BYOK per D3 toggle — except an Ollama-shaped field defaults to prefer-endpoint regardless of the stored D3 default, until routing is explicitly chosen. One field serves both a bearer key and a local endpoint — see §11.2 for the auto-detection rule. |

### 5.2 Other disclosures

- **API ingestion via Tier 2 relay:** the target URL and response pass through the Cloudflare Worker (stateless pass-through, no secrets, nothing stored).
- **Saved/shared datasets (R2):** dataset contents are stored server-side *only* on an explicit Save/Share action, with the retention and abuse controls in §12.3. The hosted share **defaults to the structure-only artifact** (D20) — schema, types, relationships, profile aggregates, no data rows; sharing raw rows is a separate, explicitly labeled escalation. Share-privacy language rule per D21: "structure only — no data rows included," never "anonymized" or "compliant."
- **Staged datasets (opt-in, D39; the D61 hosted tier):** a user may explicitly stage a full dataset to product-account R2 for server-side handling — datasets beyond the §7.3 in-browser ceiling, or the D38 stage-B MCP tools. This is the **hosted tier**, the chartered second platform rung (D61); its **privacy-and-deletion promise** binds it, in D21-compliant language: opt-in always (never a silent fallback — the §7.3 tier only *offers* staging); a **disclosed lifecycle TTL by default**; **delete-on-demand honored within a stated window** (a manual "Clear temporary data" control, plus the TTL); **documented retention**; and **no training on user data**. The promise is stated as verifiable server behavior — "deleted on schedule / on demand" — **never** as "anonymized," "compliant," or "your data is safe" (D21 extended from share copy to hosted-tier copy). **While staged, D38 MCP tools can read it.** The server-side execution design round (D39) fixes the exact disclosure copy before build, within these bounds.
- **Deeper cloud grounding (D72 — graduated row-sample escalation, per-session):** a cloud AI turn may be grounded in a **larger, user-controlled, hard-capped sample of real rows** (default = the §11.3 3-row repair; the user raises it up to a cap of N rows / M bytes, refuse-with-guidance above). **Default-off, per-session, non-sticky; disclosure precedes egress** (flip → disclose → confirm → send, §5.1). **Transmit-only:** sampled rows reach the provider for that turn only — never persisted to R2, never written into a `.dsps`, never part of a share. The `Off` switch aborts any in-flight grounded turn. Labeling is custody-differentiated (D21): Cloudflare route — *not used for training, not stored by Cloudflare; transient performance caching may apply*; BYOK route — *rows go to your provider under your provider's terms, which DataScope cannot control* — plus a v0 "may contain sensitive values" caveat (the D46 detector is v0.5, positives-only). The literal entire-dataset tier is **not** this control — it stays behind the D39/D61 hosted-mode design round.
- **BYOK keys (D9):** by default the key lives in browser memory only and transits the Worker per-request as a stateless pass-through — never persisted server-side. With the opt-in "Remember my key" setting, it is stored in the server-side credential vault (Cloudflare secret/KV keyed to session) with a delete control; the browser then holds only a reference, never the raw key in plaintext. Vaulted keys also carry a disclosed idle TTL (expire after 90 days without use — launch default, tunable; §11.2).
- **Edge anti-abuse counters:** the edge's rate-limiting and abuse controls use transient per-IP counters held only for the duration of the rate window — never stored with, or joined to, any dataset, key material, or saved object (Cloudflare sees client IPs regardless; nothing here adds to that).
- **Client-side persistence:** datasets live in DuckDB's in-memory VFS only — closing the tab destroys them. Settings may persist locally; dataset contents never do. **Persistence boundary (2026-07-24, D2 amendment): only zero-egress preferences persist across sessions** — `Off`, WebLLM-enabled, theme, and the BYOK *reference* (never the key). **Egress-enabling modes (`Cloudflare`, a bearer key's active state, D72 grounding) reset to off on each new session, and re-arming one re-shows its disclosure before the first egress** — so no dataset is ever analyzed under a silently restored egress posture the user consented to for *different* data in an earlier session. This ports the consent-per-dataset guarantee into the Workbench switch model. The BYOK reference persists alongside a **durable vault session id, minted only when a user opts into "Remember my key"** (clarified 2026-07-23 at the vault build): a reference is scoped to that session, so remembering a key across tab closes requires an identifier that outlives the tab. A user who never opts in gains no durable identifier — the id every other edge call carries is per-page-load and content-free.
- **No third-party tracking by default.** If usage analytics are ever added, they are opt-in with a visible consent banner and never transmit dataset contents or query text. Operator-side infrastructure counters (§23.5) are a separate, content-free thing: request counts and outcome classes with no URLs, payloads, session tokens, or IPs, never joined to user data. Per **D25** these extend to product-relevant **edge events** — hosted shares created, relay fetches, edge-routed structure-report exports, AI-mode requests routed — plus CDN-level visitor counts; **local-only mode stays zero-network and is deliberately uncounted** (an accepted blind spot — the visible graph is the edge-touching funnel, which is the part an application needs anyway).

Every escalation is opt-in and clearly labeled in the UI — no silent architectural drift.

---

## 6. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          React Application                          │
│                                                                     │
│  ┌───────────┐   ┌──────────────┐   ┌───────────────────────────┐   │
│  │ File Drop │──▶│ DuckDB-Wasm  │──▶│ Schema Classifier         │   │
│  │ / API URL │   │ (Web Worker) │   │ & Capabilities Broker     │   │
│  └───────────┘   └──────┬───────┘   └────────────┬──────────────┘   │
│                         │                        │                  │
│            ┌────────────┼────────────────────────┼───────────┐      │
│            ▼            ▼                        ▼           ▼      │
│  ┌──────────────┐ ┌─────────────┐  ┌──────────────┐ ┌────────────┐  │
│  │ SQL Playgrnd │ │ AI Chat     │  │ Chart Modules│ │ Export /   │  │
│  │ (Monaco)     │ │ (NL→SQL     │  │ (Recharts /  │ │ Save/Share │  │
│  │              │ │  pipeline)  │  │  D3 / Canvas)│ │            │  │
│  └──────────────┘ └──────┬──────┘  └──────────────┘ └─────┬──────┘  │
└──────────────────────────┼────────────────────────────────┼─────────┘
                           │ (cloud mode only)              │ (explicit
                           ▼                                ▼  action)
              ┌────────────────────────┐        ┌────────────────────┐
              │ Cloudflare Worker edge │        │ R2 persistence     │
              │ · AI routing (Workers  │        │ · Saved datasets   │
              │   AI / BYOK pass-thru  │        │ · Share links      │
              │   or opt-in vault)     │        │   (opt-in, TTL)    │
              │ · Tier-2 CORS relay    │        └────────────────────┘
              │ · DSPS MCP endpoint    │
              │   (read-only, v0.5)    │
              └────────────────────────┘
```

### Core technology stack

| Layer | Technology |
| :--- | :--- |
| Framework | React 18+ with TypeScript |
| Database engine | DuckDB-Wasm (OLAP SQL in a Web Worker) |
| Code editor | Monaco Editor (VS Code's editor component) |
| Charting | Recharts (declarative) + D3.js (custom visuals) |
| AI inference | Workers AI (cloud default) / BYOK provider / local model (mode-dependent, §11.2) |
| SQL dialect lint | Postgres-dialect JS parser (`node-sql-parser` or `pgsql-ast-parser`) — scoped lint pass, not a hand-rolled AST (§11.1, Appendix A.3) |
| Edge services | Cloudflare Worker (AI routing, CORS relay, vault, read-only DSPS-serving MCP endpoint — D38 stage A, v0.5) + R2 (opt-in persistence, incl. opt-in dataset staging — D39) |
| Styling | Tailwind CSS + CSS custom properties |
| File parsing | DuckDB native readers (CSV, Parquet, JSON) |
| Threading | Web Workers (DuckDB off the main thread) |
| ML engine (deferred) | ml.js (classical) + Transformers.js (NLP) — §20.1 |

Note: DuckDB-Wasm's standard setup already instantiates the database inside a Web Worker so analytical queries don't block the page — this is the library's documented default, not a custom routing layer to design (see Appendix A.2 on the debunked "In-Memory Execution Routing" phase).

**DSPS as an architectural interface (D37); the format is the platform (D64).** The Export/Save/Share box emits **DSPS** — the open, versioned DataScope Profile Spec (§12.2) — as a first-class machine-readable interface, not a bare download. **D64 makes the inversion explicit: DSPS is the platform and the web app is its flagship client.** The practical consequences: a **published JSON Schema + a small validator/parser library on npm** so third-party tools consume DSPS without reading our source; **spec-first discipline** — the DSPS document, not the app's internal types, is the contract (riding the scheduled v0.5 DSPS-spec work, D45); and the **D62 universal `.dsps` receiver as the named reference consumer.** No new server surface — this is publishing and discipline over the artifact that already ships. On the edge, the D38 read-only MCP endpoint serves that same DSPS artifact (stage A, over explicitly shared artifacts only); stage-B tools and any server-side execution run only over explicitly staged datasets (the **D39 hosted tier — the chartered second platform rung, D61**) and stay behind that decision's design round.

**Three stable interfaces and the coherence principle (D58).** The architecture converges on a small set of orthogonal interfaces rather than on features: **`QueryEngine`** (execution — D49), **`ViewSpec`** (presentation — D55), and **DSPS** (the exported structural artifact — D31/D37). Beneath them the **table registry** is the `QueryEngine`-managed catalog that every downstream reads — profiling, classification, capabilities, export, AI, and drift all consult it (named as a first-class module, §16). The structural facts the classifier produces (§8) *are* what DSPS serializes; the two are one substrate, which is why the NL→SQL schema-pruner (§11.1 stage 2) consumes a pruned *fragment* of DSPS rather than a separate structure representation. One rule keeps the set small: **every new capability must produce or consume an existing artifact (a registered `Table`, `DSPS`, or `ViewSpec`) through an existing interface (`QueryEngine`, the registry, the broker) rather than introduce a parallel end-to-end path.** It is the design-coherence analog of D42's falsifiable test — a proposal that needs a bypass or a second pipeline is a smell to scrutinize, not a feature to wave through. It already explains the whole system: APIs and derived SQL become tables (§7.4/§10), AI consumes a pruned DSPS fragment rather than raw schema, the desktop client swaps only the `QueryEngine` implementation (D51), Studio consumes the registry + classification + DSPS (§20.6), and MCP serves DSPS, not the runtime (D38).

**The composition-layer contracts (D68).** Above those three interfaces the *view* layer composes through four typed, rows-free slices — `FactRef` (a D45 fact, the universal claim-carrier), `RankedAction` (the §9 Action Broker's output), `DatasetVerdict` (the tier-1 Dossier payload, §13.1), and `ThreadConfig` (a module prefill, §10). These are **not new pipelines**: each is a minimal projection of the *same* substrate (`Table` / DSPS structural facts / `ViewSpec`) the interfaces above already carry, so they satisfy the no-parallel-pipelines rule — every composition rung produces or consumes one of these slices, nothing receives the whole registry or DSPS, and the optional D56 AI producer swaps in at a seam by emitting the identical slice. There are exactly two such seams — action ranking (§9) and D65 narration (§12.2/§13.1) — and their producer contract is **frozen in ADR-010** (the view-layer seam: AI is a replace-in-place producer over the deterministic baseline, cached per D45 fingerprint, async after paint, degrading to deterministic; routing/provider/model/cost stay in ADR-007). The ladder they form — **drop → Verdict → Thread → Takeaway** — is the app's information architecture, deterministic and complete with AI off (D2/D28).

**The v0.25 edge-warm → WebLLM handoff (D70).** The post-launch v0.25 tier (§19) fills the two AI seams above with a two-source producer that reuses the existing boundaries, not a new path: the Blueprint's synthesis + `rankNextActions` upgrade is served **first from the Cloudflare-edge Worker** (the box already in the diagram — warm start covering WebLLM's model-download cold-start) and **then from in-browser WebLLM/WebGPU** once it warms, taking over conversation fully client-side. Both emit the *same* ADR-010 slice a deterministic producer emits, so nothing downstream of the seam changes. Edge synthesis carries **DSPS structural facts only, never rows** (D45/D59), is opt-in and skipped entirely in local-only mode (D2); WebLLM is zero-egress; its D43 spike passed (GO, 2026-07-21; ADR-007), so it ships within four recorded constraints, the D40 eval still gating any comparative local claim. **The model download is consent-gated (human decision, 2026-07-22):** the ~830 MB pull is never silent — an eligible session (an AI mode chosen, no BYOK key, WebGPU present) is asked once, with a background progress affordance on accept; declining keeps the quota'd cloud free tier as the conversational engine, and a user-supplied BYOK key suppresses the handoff entirely (they brought their own provider). The deterministic Verdict still paints first — the handoff is progressive enhancement over it, never a dependency.

---

## 7. Data Ingestion

### 7.1 File formats & support policy

DuckDB-Wasm has native, optimized readers — no third-party parsers (PapaParse etc.) needed.

| Format | Support | Implementation |
| :--- | :--- | :--- |
| **CSV / TSV** | Full — primary | `read_csv_auto()`. Auto-detects headers, delimiters, encoding, types. |
| **Parquet** | Full — primary | `read_parquet()`. Columnar, metadata-first, extremely fast. |
| **JSON / JSONL** | Full | `read_json_auto()`. Handles nested objects with auto-flattening. |
| **Excel XLSX** | Not supported (D8) | Error modal: *"Excel files are not supported directly. Please export your spreadsheet as CSV (File → Save As → CSV) and re-upload."* SheetJS integration possible post-MVP (+300KB gzipped — not worth it in v1). |
| **SQLite** | Future | DuckDB can attach SQLite databases. Post-MVP. |
| **Semi-structured (logs, key-value blobs, messy JSON)** | Designed, deferred (D66) | Deterministic pattern/log-template extraction into an ordinary table — no AI, no new engine (§20.14). |

Very large files can alternatively be uploaded to object storage first (R2, or any httpfs-readable bucket) and read remotely via DuckDB `httpfs`, rather than passed through browser memory.

### 7.2 File ingestion flow

```typescript
// 1. User drops a file into the React drop zone
const buffer = await file.arrayBuffer();

// 2. Register the file buffer in DuckDB's virtual filesystem (VFS)
await db.registerFileBuffer(file.name, new Uint8Array(buffer));

// 3. Create a queryable table from the file
const conn = await db.connect();
const ext = file.name.split('.').pop()?.toLowerCase();

if (ext === 'parquet') {
  await conn.query(`CREATE TABLE dataset AS SELECT * FROM read_parquet('${file.name}')`);
} else if (ext === 'json' || ext === 'jsonl') {
  await conn.query(`CREATE TABLE dataset AS SELECT * FROM read_json_auto('${file.name}')`);
} else {
  await conn.query(`CREATE TABLE dataset AS SELECT * FROM read_csv_auto('${file.name}')`);
}

// 4. The table "dataset" is now fully queryable with SQL
const result = await conn.query(`SELECT COUNT(*) as row_count FROM dataset`);
```

**Ingestion telemetry panel** (shown live during load): file size and format detected, rows/columns parsed, elapsed time (DuckDB is typically < 500ms for a 50MB CSV), memory footprint in the tab. The same telemetry UI is reused for API pagination ("fetched page 4…").

### 7.3 Large-file fallback strategy

Browser tabs are constrained to ~2GB. Loading a 500MB CSV will crash the tab; detect and degrade gracefully.

| File size | Behavior |
| :--- | :--- |
| **< 50 MB** | Full ingest, no warnings. |
| **50–100 MB** | Full ingest + warning banner: *"Large file detected. Performance may vary on devices with limited memory."* Show estimated memory footprint. |
| **100–300 MB** | **Sampled preview mode.** First 100,000 rows via `read_csv_auto('file.csv', max_rows=100000)`. Persistent banner: *"Showing a 100K-row sample. Full dataset exceeds browser memory limits."* All modules operate on the sample. |
| **> 300 MB** | **Refuse with guidance (D16).** *"This file is too large for in-browser analysis (~X MB). Consider: (a) DuckDB CLI locally, (b) sampling the first 100K rows here, or (c) hosting the file on httpfs-readable object storage and pointing DataScope at it."* Once the hosted-staging tier exists, guidance gains **(d) staging it to DataScope cloud (opt-in; scheduled v1+, D39).** |

**Temporary cloud staging (scheduled v1+, D39 — revives D16 per its own clause):** the previous >500MB design (upload to a temp bucket, httpfs remote read, TTL) is revived by D39 as an **opt-in** hosted-staging tier. It uses **R2** — presigned PUT issued by the Worker, lifecycle-rule TTL, manual "Clear temporary data" control — not a second cloud provider. Server-side *execution* over staged data is new surface behind a dedicated design round before build (D39; §20 backlog, §23.5). Until it ships the >300MB tier stays refuse-with-guidance, with staging offered as option (d) once the tier exists.

**Consumer-export size trap (D34):** full personal-data archives — Google Takeout especially — run to multiple GB, straight into the refuse-with-guidance tier above. The D30 templates and the `/google-takeout` landing page instruct **component selection at export time** (My Activity, not full-resolution Location History); a whole-archive drop degrades gracefully through the tiers rather than failing hard.

**Memory monitoring:** use `performance.memory` (Chrome) / `navigator.deviceMemory` to estimate headroom before ingestion. If estimated post-load memory exceeds 70% of available, automatically downgrade to sampled preview mode.

### 7.4 API ingestion — tiered design

For users pulling data from an external API instead of uploading a file:

**Tier 1 — direct browser fetch (default, zero infra). In v0.5.**
Try first for every pasted API URL. Works when the target sends permissive CORS headers and needs no secret (or uses a public/anon key meant for client use). Response registered as a buffer and run through `read_json_auto` — same path as file upload.

**Tier 2 — Worker as dumb CORS relay. In v0.5.**
Most real APIs fail Tier 1 on CORS alone (the most common blocker, ahead of auth). The Cloudflare Worker fetches server-side (no CORS applies Worker→origin) and returns the response with permissive `Access-Control-Allow-Origin`. No secrets touch the Worker — pure pass-through.

**Tier 3 — Worker as credential vault. Deferred (D4).**
For APIs requiring a secret key: key lives in a Cloudflare secret/KV binding keyed to the user's session; browser sends a reference; Worker attaches the real header/token server-side. The vault mechanism ships in v0.5 for opt-in BYOK key storage (§11.2, D9), so exposing it for data sources later is incremental — but it stays out of foundation ingestion scope.

**Shared mechanics (all tiers):**
- **Pagination** — client-side loop, every tier: the client follows the target API's own next-page cursor and repeats the fetch — directly for Tier 1, once per page through the relay for Tier 2 (**decided 2026-07-23, ADR-006**: the relay stays a strict single-fetch pass-through rather than following pages itself — each page independently re-enters the relay's SSRF/rate-limit checks, and a generic Worker has no reliable way to know an arbitrary API's pagination scheme without inspecting response bodies, which the no-rewriting rule below forbids). A client-side cap of 20 relay calls bounds one ingestion action; the relay has no concept of "page" at all. Tier 3's pagination approach is undecided (deferred, D4). Reuse the ingestion-telemetry UI to show page progress.
- **"Refresh from source" button** — manual re-run that replaces the table on demand. Gets most of the "live-ish" feel without touching wire protocols or persistent connections.
- **Abuse/rate-limit** — "paste any API URL, we'll proxy it" turns the Worker into a free CORS-bypass proxy for anyone. Before public ship the relay enforces a **per-session + per-IP rate limit** (session as defined in §23.1 — server-minted and integrity-protected; the per-IP floor stops fresh-session farming), is **GET-only**, **forwards no client-supplied headers** to the target, and **streams** the response with a byte-count cutoff (never buffers Worker-side — rules out the 128 MB Worker-memory ceiling). The relay makes exactly one upstream fetch per call — nothing rewritten beyond CORS headers. Launch defaults (all tunable; ADR-006 adjusts from evidence):

| Control | Launch default |
| :--- | :--- |
| Relay rate | 20 req/min, 200 req/hour per session (pagination-friendly burst); per-IP floor 3× |
| Relay response cap | 100 MB (streamed with byte-count cutoff; aligns with the §7.3 ingestion tiers) |
| Relay timeout / redirects | 30 s; max 5 redirects |

**Consumer API scope by auth reality (D34 — v0.5).** The Tier 1/2 machinery above is unchanged; what it can reach depends on the platform's auth:
- **v0.5 = token / no-auth platforms only.** GitHub (a personal access token pastes; excellent API, generous limits) is the flagship for the token flow; Lichess / Chess.com expose open/no-auth public APIs (Lichess exports full game history instantly). Both ride Tier 1/2 as-is.
- **OAuth platforms (Strava, Spotify, Fitbit) are a separate v1 decision** — each needs per-platform app registration, redirect handling, client-secret custody in the Tier-3 vault (D4, §20.2), and a ToS review; not a Tier-1/2 freebie. Note: Strava's 2024 API terms restrict AI use and third-party display of member data — re-verify before any Strava-facing copy. (Spotify's API returns only recent plays, not history — the export template (D30) stays the real data source.)
- **Banks: CSV-drop template only, never a connection** — aggregators (Plaid et al.) mean fees + custody, an identity violation.

### 7.5 Multi-table & folder ingestion (D13 — in v0)

The Studio arc's structural inference (§20.6) is meaningless on a single table, so multi-table ingestion is explicit v0 scope rather than an afterthought:

- **Folder drop / multi-file select.** Dropping a folder (or multi-selecting files) ingests every supported file as its own table, named from the file name (sanitized, de-duplicated). Folder traversal via `DataTransferItem.webkitGetAsEntry()` / directory-picker input; unsupported files inside the folder are skipped with a single summary toast, not per-file modals.
- **Table registry.** The sidebar gains a table list (name, rows × cols, source, memory footprint). Each table is profiled and classified independently (§8); the capabilities broker (§9) evaluates over the union of all registered tables.
- **Memory budgeting across files.** The §7.3 tiers apply to the *aggregate*: pre-scan file sizes before ingesting, warn at the 50MB combined threshold, offer per-file sampled mode when the folder exceeds it.
- **Cross-table SQL from day one.** The playground and the AI layer see all registered tables — schema-pruned prompting (§11.1 stage 2) already assumes a multi-table catalog to prune.
- **ZIP-archive ingestion (D30).** Consumer platform exports (Spotify, Google Takeout) arrive as ZIPs, and consumers will not unzip-then-multi-select. A small client-side unzip library (e.g. fflate) expands the archive and feeds its supported files into the multi-file path above — the one honest *engine* addition behind the D30 consumer template channel (+1–2 days), named here so it is scoped rather than discovered mid-build. Everything stays client-side; the ZIP is never uploaded.

This is the substrate Phases 7–9 stand on: the foundation tiers profile tables individually; the Studio arc infers what connects them.

---

## 8. Schema Classification Engine

The brain of the application. After ingestion, run DuckDB's built-in `SUMMARIZE` to extract column-level metadata, then classify each column into a **semantic type** that determines which modules are available.

### Step 1: Extract column metadata

```sql
SELECT
  column_name,
  column_type,
  min,
  max,
  approx_unique,
  avg,
  std,
  null_percentage,
  count
FROM (SUMMARIZE dataset);
```

### Step 2: Semantic type classification

```typescript
type SemanticType = 'Temporal' | 'Quantitative' | 'Categorical' | 'Textual' | 'Identifier';

interface ClassifiedColumn {
  name: string;
  physicalType: string;       // DuckDB type: VARCHAR, BIGINT, DOUBLE, DATE, etc.
  semanticType: SemanticType;
  cardinality: number;        // approx_unique from SUMMARIZE
  nullPercentage: number | null; // null on a 0-row table — SUMMARIZE has no 0/0 percentage to report
  min: string | number | null;
  max: string | number | null;
  mean: number | null;
  stdDev: number | null;
  classificationReason?: string; // why this semanticType was assigned — powers the §17 reasoning tooltip; "Set manually" after a user override
}
```

### Classification rules

| DuckDB physical type | Cardinality (approx_unique) | Semantic type | Rationale |
| :--- | :--- | :--- | :--- |
| `DATE`, `TIMESTAMP`, `TIME` | Any | **Temporal** | Time-series, trends, seasonality |
| `BIGINT`, `DOUBLE`, `INTEGER` | High (> 15) | **Quantitative** | Continuous numeric — regression, statistics |
| `BIGINT`, `INTEGER` | Very low (2–5) | **Categorical** | Likely encoded labels (0/1, 1/2/3) |
| `VARCHAR`, `BOOLEAN` | Low (< 15 unique) | **Categorical** | Discrete groups — grouping, classification |
| `VARCHAR` | High (> 100 unique) | **Textual** | Free text — NLP, keyword search |
| `VARCHAR`, `BIGINT` | ≈ row count (near-unique) | **Identifier** | Primary keys, URLs, UUIDs — skip for analysis |

```typescript
function classifyColumn(col: DuckDBSummaryRow, totalRows: number): SemanticType {
  const { column_type, approx_unique } = col;
  const uniqueRatio = approx_unique / totalRows;

  // Temporal types are always time-series
  if (['DATE', 'TIMESTAMP', 'TIMESTAMPTZ', 'TIME'].includes(column_type)) {
    return 'Temporal';
  }

  // Near-unique values relative to row count → likely an ID column
  if (uniqueRatio > 0.95) {
    return 'Identifier';
  }

  // Numeric types
  if (['BIGINT', 'INTEGER', 'DOUBLE', 'FLOAT', 'HUGEINT', 'SMALLINT', 'TINYINT', 'DECIMAL'].includes(column_type)) {
    // Low-cardinality integers are likely encoded categories (e.g., 0/1 for survived)
    if (approx_unique <= 15) {
      return 'Categorical';
    }
    return 'Quantitative';
  }

  // String types
  if (column_type === 'VARCHAR' || column_type === 'BOOLEAN') {
    if (approx_unique <= 15) {
      return 'Categorical';
    }
    if (approx_unique > 100) {
      return 'Textual';
    }
    return 'Categorical'; // Default for moderate-cardinality strings
  }

  return 'Identifier'; // Fallback: treat unknown types as non-analytical
}
```

**Cardinality source for the identifier rule.** The pseudocode reads `approx_unique` for brevity, but `SUMMARIZE`'s `approx_unique` is a HyperLogLog estimate whose error was measured overshooting the true row count on real samples (a fare column at ~105% "unique", a passenger-id column at ~118%) — enough to push a genuinely continuous column past the 0.95 near-unique threshold and mislabel it Identifier. The near-unique test is therefore decided on an **exact `COUNT(DISTINCT)`** per column (one extra single-pass query at v0 local sizes); `ColumnProfile.cardinality` keeps the raw `approx_unique` for display, and `ClassifiedColumn.cardinality` carries the exact count that drove classification.

The classifier's output does double duty in the foundation tiers: it drives the capabilities broker (§9) **and** feeds the AI layer's schema-pruned prompts (§11.1) — column names, types, and semantic roles are exactly the context the NL→SQL model needs.

---

## 9. Capabilities Broker

Consumes the classified columns and determines which analysis modules to enable. This is the mechanism that makes the app **adaptive** — it never shows options that are impossible with the current dataset.

```typescript
interface DataCapabilities {
  // Analysis modules (v0)
  canDoDescriptiveStats: boolean;     // Always true if any Quantitative columns exist
  canDoTimeSeries: boolean;           // Requires >= 1 Temporal + >= 1 Quantitative
  canDoCorrelation: boolean;          // Requires >= 2 Quantitative columns
  canDoDistribution: boolean;         // Requires >= 1 Quantitative column
  canDoCategoricalBreakdown: boolean; // Requires >= 1 Categorical column

  // ML modules (deferred — flags retained for post-v1, §20.1)
  canDoKMeans: boolean;               // Requires >= 2 Quantitative columns
  canDoRegression: boolean;           // Requires >= 2 Quantitative columns
  canDoClassification: boolean;       // Requires >= 1 Categorical + >= 1 Quantitative or Categorical
  canDoNLP: boolean;                  // Requires >= 1 Textual column

  // Column references for pre-populating UI dropdowns
  numericColumns: string[];
  categoricalColumns: string[];
  dateColumns: string[];
  textColumns: string[];
  identifierColumns: string[];
}

function evaluateCapabilities(columns: ClassifiedColumn[]): DataCapabilities {
  const numeric     = columns.filter(c => c.semanticType === 'Quantitative');
  const categorical = columns.filter(c => c.semanticType === 'Categorical');
  const temporal    = columns.filter(c => c.semanticType === 'Temporal');
  const textual     = columns.filter(c => c.semanticType === 'Textual');
  const identifiers = columns.filter(c => c.semanticType === 'Identifier');

  return {
    canDoDescriptiveStats: numeric.length >= 1,
    canDoTimeSeries: temporal.length >= 1 && numeric.length >= 1,
    canDoCorrelation: numeric.length >= 2,
    canDoDistribution: numeric.length >= 1,
    canDoCategoricalBreakdown: categorical.length >= 1,

    canDoKMeans: numeric.length >= 2,
    canDoRegression: numeric.length >= 2,
    canDoClassification: categorical.length >= 1 && (numeric.length >= 1 || categorical.length >= 2),
    canDoNLP: textual.length >= 1,

    numericColumns: numeric.map(c => c.name),
    categoricalColumns: categorical.map(c => c.name),
    dateColumns: temporal.map(c => c.name),
    textColumns: textual.map(c => c.name),
    identifierColumns: identifiers.map(c => c.name),
  };
}
```

**How the UI responds:** each module in the sidebar is a card. Disabled capabilities are greyed out with a tooltip explaining *why* ("Requires at least 2 numeric columns — your dataset has 1"). Available capabilities are interactive with dropdowns pre-populated from the classified columns.

**Broker output is the ViewSpec's grammar (D55/D56).** Beyond gating sidebar modules, the broker's legal-capability output is the **rails of the declarative ViewSpec layer**: a ViewSpec is a versioned, validated JSON layout artifact — `panels[]` of componentId (from a fixed registry) + typed props + a §11.1-stage-6 chart config — consumed by a deterministic renderer that **never executes model output**. v0's only producer is deterministic: the broker + Dossier assembly generalized (§13.1, D55). The optional v0.5+ AI producer (D56) composes *within these rails* — it may reference only panel types the broker declared legal and chart configs that typecheck (it cannot invent a map for a dataset with no geo columns) — and it degrades to the deterministic ViewSpec whenever AI is off, down, or uncached.

**The Action Broker — from *affords* to *do next* (D68).** `evaluateCapabilities` answers "what is *possible*"; it does not answer "what is *worth doing next*." D68 adds a second pure, deterministic function in the same module — the translator from *capability* to *consequence*:

```typescript
interface RankedAction {
  verb: string;            // imperative destination label, e.g. "Chart revenue over order_date"
  module: SidebarModule;   // the real module it routes to (never "profile again")
  prefill: ThreadConfig;   // opens that module on the answer — §10, D68(e)
  evidence: FactRef;       // the computed fact that motivates it — D45, one per action
  score: number;           // D10 interestingness (effect size × coverage) gated by broker legality
}

function rankNextActions(tables: TableRegistryEntry[], insights: TableInsights[]): RankedAction[];
// insights are the per-table candidate sets (§10 Module 1). Each RankedAction's
// evidence FactRef takes its snapshot from the source table's ingest time, so
// the ranker needs no extra clock. Only the *analytical* rules produce an action
// (change-point→time-series, leakage→correlation, concentration/outlier-group→
// categorical, duplicates→sql); the classification/quality notes (id-exclusion,
// null-pattern) are surfaced in the quality headline and insight feed, never
// re-routed here as "review this in the profile" — that would rebuild the very
// profile-again loop this function removes.
```

It **joins what the broker declares legal with the D10 insight interestingness score** (§10 Module 1) and emits a small ranked list of *pre-configured destinations with evidence attached* — the deterministic producer of the routing layer, no LLM. §13.1's "suggested next steps" band **is** `rankNextActions`'s render, and the Dossier Verdict (D68c) consumes its top three. Below the **interest floor** (no rule fires above threshold) it returns honest generic routing ("profile each table," "try the correlation matrix on the four numeric columns"), never a manufactured action — the thin-profile degrade §13.1 already specs, now named and shared. The optional v0.5+ AI producer (D56) may *re-rank or re-phrase* within the broker grammar, emitting the same `RankedAction[]`, cached per D45 fingerprint, async after the deterministic paint, and degrading to this deterministic output when AI is off/down/uncached. This seam and D65 narration are the only two AI producer seams; both are frozen as a drop-in contract in **ADR-010** — the AI re-ranker receives the deterministic `RankedAction[]` baseline (never the raw registry), so it can reorder and re-phrase but can never invent a destination outside the broker grammar; a seam validator enforces set-identity and any violation degrades to deterministic.

**The Workbench options strip is a second consumer (D71, §13.3).** The same ranker output orders the strip above the dataset map — but the strip is **selection-scoped**: membership = the capability gate resolved against the selected subject's legal operations; order = this ranking applied to that legal set, via a **client-side, subject-scoped filter of the dataset-wide `RankedAction[]`** (each action's `ThreadConfig` names its subject) — one ranker, one grammar, never a parallel per-table ranking path (D58). Gated actions render disabled-with-reason, preserving the teaching copy this section already mandates for sidebar cards.

---

## 10. Foundation Analysis Modules (v0)

### Module 1: Auto-Profile Dashboard — always enabled

Runs immediately after ingestion. Row/column counts plus per-column cards:
- Data type badge (Temporal / Quantitative / Categorical / Textual / ID)
- Null percentage bar
- Quantitative: min, max, mean, median, std dev, histogram sparkline
- Categorical: value frequency bar chart (top 10)
- Temporal: date range (earliest → latest), gap detection
- Textual: avg word count, sample preview

Auto-generated SQL shown to the user:
```sql
-- Descriptive statistics
SELECT column_name, column_type, min, max, avg, std, approx_unique, null_percentage
FROM (SUMMARIZE dataset);

-- Value frequencies for categorical column
SELECT category_col, COUNT(*) as freq
FROM dataset
GROUP BY 1
ORDER BY 2 DESC
LIMIT 10;
```

**Insight feed (D10) — rule-based, ships in Phase 3.** Below the column cards, a ranked list of proactively surfaced observations computed with plain SQL over the profiled dataset. No LLM in the loop — every rule is deterministic, so the feed works identically in local-only mode. v0 rule set:

| Rule | Requires | Example output |
| :--- | :--- | :--- |
| Concentration | Categorical + Quantitative | "Top 10% of customers generate 72% of revenue" |
| Change-point | Temporal + Quantitative | "Revenue dropped 38% in March — largest period-over-period move" |
| Outlier group | Categorical + Quantitative | "Region A's mean is 2.7σ above the rest" |
| Null pattern | Any | "Missing values concentrated in `discount_code` (61% null, all pre-2023)" |
| Duplicates | Any | "412 fully duplicated rows detected" |
| Leakage flag | ≥ 2 Quantitative | "`total_paid` and `target` correlate at 0.998 — possible target leakage" |
| ID exclusion | Identifier | "`row_uuid` is near-unique — excluded from analysis (override in Profile)" |

Each insight card shows the SQL that produced it (same educational-panel pattern as everything else) and an "open as chart" action that reuses the SQL → Chart translator (Module 2). Insights are ranked by a simple interestingness score (effect size × coverage); the feed caps at ~10 cards to stay a briefing, not a dump. This is the v0 seed of the deterministic insight layer in §20.5 — richer rules, cross-table insights, and ranking maturity live there. **§20.5 is the single owner of insight generation:** its matured rule library (the D69 `HeuristicFinding` formalization) is *one pipeline with this feed*, never a parallel generator (D58) — the same rules, the same interestingness ranking, feeding the same `rankNextActions` (D68a).

Module 1 is also the seed of the Phase-7 data-quality report (D14, §20.8): the column cards and insight rules mature into an engineer-facing diagnostics surface with a composite quality score.

### Module 2: SQL Playground — always enabled

Monaco Editor with SQL syntax highlighting, auto-completion for table and column names, results grid below.

**Auto-suggested queries** (generated from classified columns):

| Capability detected | Suggested query template |
| :--- | :--- |
| Categorical + Numeric | `SELECT [cat_col], AVG([num_col]), COUNT(*) FROM dataset GROUP BY 1 ORDER BY 2 DESC` |
| Temporal + Numeric | `SELECT DATE_TRUNC('month', [date_col]) as period, SUM([num_col]) FROM dataset GROUP BY 1 ORDER BY 1` |
| >= 2 Numeric | `SELECT CORR([num_col_1], [num_col_2]) as correlation FROM dataset` |
| Temporal | `SELECT [date_col], [num_col], AVG([num_col]) OVER(ORDER BY [date_col] ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as moving_avg FROM dataset` |
| Categorical | `SELECT [cat_col], COUNT(*) as freq FROM dataset GROUP BY 1 ORDER BY 2 DESC LIMIT 20` |
| Textual | `SELECT [text_col] FROM dataset WHERE [text_col] ILIKE '%keyword%' LIMIT 50` |
| Any dataset | `SELECT * FROM dataset LIMIT 100` |

Each suggestion carries a short educational tooltip ("GROUP BY splits your data into buckets, COUNT(*) counts rows in each bucket").

**Guided, task-shaped answers (D53).** Alongside the column-shaped templates above, the suggestion rail also offers analyst *tasks* phrased in plain language — "trend over time," "top N by segment," "this period vs last," "outliers," "simple cohort" — each of which one-clicks to a generated query + auto-chart. This is the business analyst's on-ramp: an answer without typing SQL, with the generating SQL still shown for the analyst who wants to learn or adapt it. The templates stay deterministic and column-aware (no LLM), so they work identically in local-only mode.

**SQL → Chart translator** — when a query returns, auto-detect the best chart:

| Query pattern | Auto-selected chart | Mapping |
| :--- | :--- | :--- |
| `GROUP BY` + `COUNT/SUM/AVG` | Bar chart | Group → X, Aggregate → Y |
| `ORDER BY date_column` | Line chart | Date → X, Value → Y |
| Two numeric columns returned | Scatter plot | Col 1 → X, Col 2 → Y |
| Single aggregate value | KPI card | Large number display |
| `LIMIT` on raw rows | Data grid | Tabular view |

This translator is shared with the AI chat layer (§11.1 stage 6).

**Transformation layer:** the playground is not read-only exploration — users can run DDL against their session (joins across ingested tables, CTE pipelines, derived/feature tables):

```sql
CREATE TABLE customer_features AS
SELECT
  customer_id,
  COUNT(orders) AS order_count,
  AVG(order_value) AS avg_order,
  MAX(order_date) AS last_order
FROM orders
GROUP BY customer_id;
```

Derived tables are re-profiled and re-classified like any ingested table, are exportable (§12), and carry one-click undo (§12.1).

### Module 3: Time-Series Analysis — enabled when `canDoTimeSeries`

- Trend line chart with selectable granularity (day / week / month / quarter / year)
- Moving average overlay with configurable window (7 / 30 / 90-day)
- Period-over-period comparison (this month vs last month)
- Seasonality detection (day-of-week × hour-of-day heatmap)

All charts are generated by DuckDB SQL behind the scenes; the SQL is shown alongside the chart so users learn the query patterns.

### Module 4: Correlation Matrix — enabled when `canDoCorrelation`

- Heatmap grid of pairwise Pearson coefficients between all numeric columns
- Click any cell to drill into a scatter plot of those two variables
- Color scale: dark blue (strong positive) → white (none) → dark red (strong negative)
- SQL shown: `SELECT CORR(col_a, col_b) FROM dataset;`

### Module 5: Distribution Analysis — enabled when `canDoDistribution`

- Histogram with configurable bin count
- Box plot (quartiles, median, outliers)
- Descriptive stats panel: mean, median, mode, std dev, skewness, kurtosis
- Column toggle via dropdown

### Module 6: Categorical Breakdown — enabled when `canDoCategoricalBreakdown`

- Frequency bar chart (horizontal, sorted descending)
- Pie / donut chart for small-cardinality categories
- Grouped bar chart when combining Categorical + Quantitative (e.g., average salary by department)

### Module 7: Pivot / Cross-tab — always enabled (D53)

The no-SQL on-ramp for the business analyst (§2). Drag fields into **rows**, **columns**, and **values** (with an aggregation picker — sum / avg / count / min / max), and the surface compiles the layout to a single DuckDB `GROUP BY` behind the scenes, showing the generated SQL alongside (same educational pattern as every module). Subtotals, sort, and a top-N cap keep large cross-tabs legible; the result is a first-class table — exportable (§12.2) and one-click chartable via the SQL → Chart translator (Module 2). Because it is just `GROUP BY`, it inherits multi-table joins from the transformation layer for free once related tables are registered.

**Internal cut line (D53/D27).** If the drag-and-drop builder threatens the date, it degrades to a **guided GROUP-BY builder** — dropdowns for group-by / measure / aggregate that reuse Module 2's suggestion engine — which is near-free; the full pivot UI then slips to v0.5. The pivot sits **above** the Join Graph in the D27 cut order (cuttable to protect the schedule; the graph stays last-cut).

### Thread pre-configuration — modules open on the answer (D68e)

Every analysis module above (Time-Series, Correlation, Distribution, Categorical, Pivot, and the SQL playground) accepts an optional `ThreadConfig` prefill:

```typescript
interface ThreadConfig { module: SidebarModule; prefilledConfig: Record<string, unknown>; }
// e.g. { module: 'time-series', prefilledConfig: { value: 'revenue', date: 'order_date', granularity: 'month' } }
```

A `RankedAction` (§9) carries a `ThreadConfig` in its `prefill`, so clicking a Verdict action (§13.1, D68c) opens the module **on the answer** — columns pre-selected, query pre-run — rather than an empty form. This is D53 surface-4 matured from "one-click suggested query" into "every ranked action is a one-click thread." The prefill is optional: a module reached from the sidebar (D68d) starts empty as today. It is rows-free by construction (it names columns and config, never data), so it crosses the same encapsulation boundary as the other D68 contracts, and it is the seam a v0.5+ AI producer (D56) fills without touching module code. *(Workbench, D71: the prefill becomes the tab-instance **initializer** — same semantics, owned by the tab instance rather than a one-shot global slot, so there is no self-clearing dance; §13.3.)*

---

## 11. AI Chat Layer (NL→SQL)

A core foundation pillar (D1; ships in v0.5). The design is the fact-checked, de-branded version of the original "master prompt blueprint" — see Appendix A for what was kept, renamed, and rejected. The overall shape mirrors LangChain's reference SQL agent (§3.2): fuzzy pre-match → schema-pruned prompt → generate → lint → execute → retry-on-error → auto-chart.

**v0.25 pulls the first slice forward (D70, §19).** The post-launch v0.25 tier ships an earlier, Blueprint-oriented cut of this layer: **BYOK** (D2 mode c / D3 / D9 — unchanged custody) plus a dataset-**synthesis** producer served from the Cloudflare edge as a warm start and then from in-browser **WebLLM** once it warms (the D70 handoff). It reuses this pipeline's provider routing (§11.2) and the schema-pruned-DSPS-fragment input (stage 2) — no new NL→SQL architecture; the full stage 1–6 pipeline, transcript auditability, and the D40 eval gate remain the v0.5 Phase-4 deliverable. WebLLM's local path cleared the D43 spike (GO, 2026-07-21; ADR-007), shipping within four recorded constraints; the D40 eval still gates any comparative local claim.

### 11.1 Pipeline stages

1. **Input normalization (fuzzy pre-match).** Levenshtein/Jaccard string-distance matching of user-input tokens against known table/column names, correcting typos before the LLM sees them. Cheap, symbolic, no embeddings. (Originally branded "Speculative Vector Tokenizer" — misleading name, rejected; Appendix A.1.)
2. **Schema-pruned prompting.** Send only the relevant DDL, column names/types/descriptions, and semantic roles from the classifier (§8) — not the whole schema. Standard practice across every serious text-to-SQL tool (Vanna's core mechanism). This pruned bundle is a *fragment of the same structural-facts substrate DSPS serializes* (D37/D58): the classifier output and DSPS are two views of one model, so schema-pruning slices DSPS by relevant table/column rather than maintaining a parallel structure representation — consuming the facts only, never the DSPS export module's `dsps_version`/provenance machinery on this per-turn path (D45).
3. **Generation.** Route to the active provider per §11.2.
4. **Dialect lint (scoped).** Parse the generated SQL with a real Postgres-dialect JS parser (`node-sql-parser` or `pgsql-ast-parser`) and lint for the small, known list of things LLMs actually get wrong in DuckDB SQL: backticks, `CONCAT` vs `||`, `TOP` vs `LIMIT`, date/time function names. DuckDB's dialect is deliberately close to Postgres, so this catches the large majority of real mistakes. **Do not hand-roll an AST parser** — that path fails silently on the first CTE or window function (Appendix A.3).
5. **Execute-fail-retry loop.** The best-ROI feature in the pipeline. On execution failure: capture the error trace, resample real context (`PRAGMA table_info()`, `LIMIT 3` sample rows), feed both back to the model, retry — hard cap of 3 attempts (THOR-style, prevents infinite loops). A wrong query visibly self-correcting on screen is also the strongest demo moment.
6. **Auto-chart config.** Infer chart type/axis mapping from the returned columns' types, emitting a strictly-typed Recharts-ready config — implemented once as the SQL → Chart translator (§10 Module 2) and shared.

**Implementation shape:** realize stages 3–5 as an LLM **tool-use loop** rather than a bespoke generate→validate→execute pipeline — the model is given an `execute_local_sql` tool bound to DuckDB-Wasm and calls it directly; execution results and error traces flow back as tool results, so stage 5's retry behavior falls out of the loop for free. Stages 1–2 preprocess the prompt, stage 4 lints each tool call before execution, stage 6 post-processes the final result set. The `execute_local_sql` **tool-input schema is the structured contract** for generated SQL — validated natively by the provider's tool-calling — and stage 6's typed Recharts config is the other structured output; there is **no separate `SQLPlan` object** (considered and rejected as a redundant intermediate competing with the tool-use loop).

**Stage 6's typed config is the ViewSpec atom (D55/D56).** The strictly-typed Recharts-ready config is also the atomic unit of the declarative ViewSpec layer (§9, §13.1): the deterministic producer composes stage-6 configs into the Dossier's default view (v0, D55), and the optional AI view-composer (v0.5+, D56) emits the same artifact — broker-legal panels + typechecked stage-6 configs, cached per dataset fingerprint, async off the first-paint path. Same output, different producer; the renderer contract (validated ViewSpec in, never code) is identical for both.

**Transcript auditability.** The chat never executes hidden SQL. Every generated query surfaces as *suggested SQL* in the transcript, and each execution shows an inline log entry: the exact query, timing, row count, and — on failure — the error trace and retry number. The user can always reconstruct what ran and why it was retried; combined with the metadata-only-repair toggle (§11.3), this is the layer's trust model. This transcript is the product's **content-full, client-side LLM trace** — the auditability and demo surface, in-browser by design; the content-free, operator-side numeric LLM metrics live separately at §23.5 (D41), never carrying prompt, SQL, or error text off the device. *(Workbench home, D71: the per-turn audit trail renders as the right AI pane's hero, styled as a feature — §13.3; substance unchanged, non-negotiable.)*

Future extension (post-foundation): QUITE-style distinction between *syntax* errors (query won't run — the loop above handles these) and *equivalence* errors (query runs but means something different than the user intended), which need different correction strategies.

### 11.2 Inference routing (D2 + D3)

- **Three user-selectable AI modes** (§5.1): local-only (AI off), local model (in-browser WebLLM only), **API** (renamed from "Cloud AI", 2026-07-22 — Workers AI and/or the user's key or a local Ollama endpoint). All three ship; the initial default is a UI-design decision (first-run chooser is the leading option). **Local-model honesty (D43):** the honestly-specced local paths are **localhost Ollama** (user-deployed, reached through **API** mode's key/endpoint field, not "Local model" — see the mode-shape note below) and **in-browser WebLLM/WebGPU** (served by "Local model") — no longer unbuilt/unscoped: the **D43 kill-criteria spike passed (GO, 2026-07-21; verdict + evidence in ADR-007)**, with the ~1.6 GB **Qwen2.5-Coder-1.5B-q4f16** model coexisting in-memory with DuckDB-Wasm on a 1.24 M-row dataset without OOM (on 8 GB RAM), exec-correct on 11/12 labeled NL→SQL, warm model-load ~2.6 s. A local-capability claim is permitted **within four recorded constraints (ADR-007):** (1) pin the 1.5B q4f16 coder, not the 3B (larger unverified on 8 GB); (2) run the model in a **Worker** engine (main-thread load jank); (3) **resumable/retrying** shard download; (4) treat the quality number as a **simple-schema floor with no measured cloud head-to-head** — the **D40 eval still gates any "local" number** in the harness, watching the aggregate-then-rank failure mode. WebLLM stays progressive enhancement over the edge/BYOK engine; being zero-egress it consumes no Workers-AI pool (the neurons-per-turn cost that sizes the pool is the separate cloud-model choice, **recorded in ADR-007**: default `@cf/mistralai/mistral-small-3.1-24b-instruct` — the Qwen coder was displaced because it does not emit structured tool calls on Workers AI, breaking the tool-use loop — at ~63 neurons/turn → ~160 free turns/day account-wide at the 10,000-neuron/day free allocation).
- **Mode-shape note (human directive, 2026-07-22).** "Local model" and "API" (its new name) each own exactly one local path: "Local model" is in-browser WebLLM/WebGPU only; localhost Ollama moved to **API** mode, reached the same way a cloud key is — through the key/endpoint field — never a separate mode or a third routing choice. Rationale: Ollama and a cloud key are both "the user pointed inference at a specific endpoint they configured"; splitting that across two modes was the wrong axis. Ollama reaches the browser **directly**, not through the edge Worker — the same client-side shape BYOK pass-through already has (`services/ollamaProvider.ts`, re-triggered from API mode instead of gated behind local-model). The edge's `edge/byok.ts` server-side pass-through is unaffected; this does not add Ollama proxying to the Worker.
- **The key/endpoint field auto-detects its own shape (human directive, 2026-07-22).** One field, not two: if the entered value parses as a URL, it is treated as a local Ollama base endpoint (no bearer auth); otherwise it is treated as an OpenAI-style bearer key. Rejected alternative: an explicit provider-type selector — simpler single-field UI over a cleaner data model. Supplying a key or endpoint is never mandatory in API mode — see below.
- **Cloud mode default provider:** Cloudflare Workers AI — the zero-config experience, bounded by Workers AI's rate/neuron ceiling.
- **BYOK:** users can bring their own LLM API key (OpenAI/Anthropic/etc.) **or a local Ollama endpoint** through the same field. Routing is governed by a **user-facing toggle**: *"Prefer my key"* (all inference via the user's provider) vs. *"Use free tier first"* (Workers AI until its ceiling, then overflow to the key) — API mode keeps both routing choices; it is "Cloud AI" renamed, not re-scoped. Key custody is resolved as **user choice (D9)**: default is browser-memory-only with per-request stateless pass-through via the Worker (never persisted server-side, works regardless of provider CORS support) for a bearer key, or a direct browser→localhost call for an Ollama endpoint (never touching the Worker); the opt-in *"Remember my key"* setting stores a bearer key in the credential vault with disclosure and a delete control (an Ollama endpoint, being local and non-secret, is not a vault candidate). **Routing governs an Ollama-shaped field too, with a privacy-preserving default (amended 2026-07-23).** *"Prefer my key"* sends every turn straight to the local Ollama endpoint, unchanged (the direct browser→localhost path above). *"Use free tier first"* runs the shared Workers-AI budget first and falls back to the local Ollama endpoint only when the router returns its typed shared-budget-spent / paused state; because the edge Worker cannot reach `localhost`, that overflow is **orchestrated client-side** — the browser retries the same turn against Ollama — not by the router. The router needs no Ollama awareness: a URL-shaped field sends no `byok`, so the existing keyless `quota-exhausted` / `pool-exhausted` / `paused` responses are exactly the fallback trigger. A non-quota-family cloud failure (timeout, transport, upstream) does **not** fall back — it surfaces as itself, same as for a bearer key. **Default rule:** an Ollama-shaped field defaults to *prefer-endpoint* (zero-egress) until the user explicitly chooses a Routing option — the D3 toggle's own stored default (`free-tier-first`) does not silently turn on cloud egress for a field the user set up specifically to keep local. Choosing "Use free tier first" explicitly is what opts in. The transcript marks a turn served by the local overflow so the swap is never silent.
- **Shared-pool reality — D3's "free tier" is a shared budget, not a per-user allowance.** Workers AI's free allocation is a **single account-wide daily neuron budget shared by every DataScope visitor**, not a per-user grant — at realistic NL→SQL prompt sizes it is a capped, demo-scale pool by construction. Therefore: (1) the AI router enforces a **per-session daily Workers-AI quota** (launch default: **20 Workers-AI-served turns/session/day**, tunable) so no single user can drain the pool; (2) on quota- or pool-exhaustion the client shows a specific state — *"free AI budget used for today: bring your own key, switch to the local model, or retry tomorrow"* — never a silent failure; (3) the NL→SQL **model choice is recorded in ADR-007 with its neurons-per-turn cost**, since that sets the effective size of the free pool; (4) the growth path is to raise the paid neuron budget behind the §23.5 monthly ceiling — never a per-user redesign; routing (D3) already supports it. The first-run chooser (§5.1) and the D3 toggle copy must describe **API** mode's cloud share as a **shared** free budget, not a personal allowance.
- **The shared edge rate limiter covers all four endpoints, including this router** (§23.5; `build/09-edge/README.md`) — not just the relay and save endpoint. AI-router launch defaults (tunable): **10 requests/min/session**, **64 KB request-body cap** (a schema-pruned prompt + ≤3 sample rows fit comfortably), plus the §23.1 per-IP floor. Vault operations: **10/session/hour** — the client-facing store/delete calls (clarified 2026-07-23 at the vault build). A router-internal *resolve* is not a vault operation and is not counted: it is a side effect of an AI turn the router has already rate-limited, and charging it here would cap a remembered-key user at ten questions an hour.
- The vault is the same mechanism deferred for Tier-3 data-source ingestion (D4) — one pattern, two consumers, only one shipped in v0.5.
- **Vaulted-key lifecycle (D9 disclosure, not relitigation).** Vaulted keys carry an **idle TTL — expire after 90 days without use** (launch default, tunable; refreshed on each resolve), with the expiry stated in the "Remember my key" disclosure, and a cap of **3 vaulted credentials/session** (prevents vault-stuffing; generous for one key per provider). This adds disclosed retention to the opt-in custody path, exactly parallel to §12.3's R2 retention; the custody choice itself (D9) is unchanged. **Built 2026-07-23 with two implementation notes** worth stating because they are behavioral, not incidental: the TTL refresh is *lazy* — a resolve re-writes the record only once the credential has burned 1% of its window (≈21.6 hours of the 90-day default), since a per-turn refresh would mean a store write per question and day-granularity is indistinguishable from exact at a 90-day horizon; and the credential cap is a hygiene bound rather than the anti-stuffing control — the strongly consistent operation limiter above is what actually stops a session filling the namespace, because the vault's KV listing is eventually consistent and a burst can momentarily seat several over the cap. **The staging deploy (2026-07-23) measured that slop rather than leaving it theoretical: back-to-back stores seated 5 credentials under a cap of 3, and stores spaced 3s apart still all passed; the cap only rejected once the prefix listing had caught up (a 120s wait returned the expected `cap-reached`).** So the cap's real guarantee is *eventual* — a session settles at 3 — and the ceiling during a burst is the operation limiter's 10/session/hour, which is the number to reason about for abuse. This does not change the design (the limiter was already named as the control); it fixes the size of the window.
- **AI-facing surface beyond the chat (D38).** The client-side AI surface is DSPS + "Copy for AI" (§12.2); a remote **MCP** surface is added on the Worker. **Stage A (v0.5)** serves DSPS read-only over the artifacts a user explicitly shared to R2 (`get_dsps(share_id)`, `list_shared(…)`; D5/§12.3). **Stage B (v1+, gated on the D39 design round)** exposes tools (`run_sql`, `profile_dataset`, `infer_relationships`, `generate_dsps`, `export_schema`) over **explicitly staged datasets only** (D39) — never browser-local data. The endpoint inherits the §23.5 ceilings/kill-switch/counters; `run_sql`-style tools over non-staged data remain out (a browser tab is not an MCP endpoint).

### 11.3 AI privacy specifics

In cloud mode, stage 5's data-sampled repair sends up to 3 actual data rows to the provider. This is **disclosed and separately toggleable**: a "metadata-only repair" setting restricts retry context to schema + error trace. All cloud-mode disclosures live in the privacy model (§5.1).

**Deeper cloud grounding (D72) extends this path, bounded.** The 3-row repair sample is the floor of a **graduated, user-controlled, hard-capped** row-sample escalation (§5.2): the user may raise the grounding sample for better cloud answers, up to a cap (N rows / M bytes; refuse-with-guidance above), per-session, default-off, disclosure-before-egress, transmit-only. It is a *bigger sample on the same pipeline*, never a new path (D58) — and never the whole dataset: full-dataset AI work is server-side execution, which stays behind the D39/D61 hosted-tier design round.

### 11.4 Evaluation harness (D40)

A dev/CI-only eval harness — a separate `eval/` directory or repo, **never product runtime** — measures the pipeline's real quality rather than trusting it. It runs a **curated ground-truth NL→SQL question set over the §14 sample datasets** (the labeled question/expected-answer set is the expensive artifact and the thing worth maintaining), reporting **exec-rate, result-correctness, cost per turn, and repair-rate** per provider and per AI mode (§11.2). Thresholds are declared when the harness is built; the harness **gates the v0.5 Phase-4 ship** at those thresholds (§19) — the gate itself is the commitment. It does not touch v0 or the Oct 6 date (D27). Language is **TypeScript by default** (matches §6/§16 — no second toolchain); Python is permitted only if a D18-style spike documents a concrete capability TypeScript cannot meet, and the spike finding — not a job-market rationale — is what is recorded. The harness feeds the §18 NL→SQL self-correction-rate metric, and may report a "local" number only for a local-model path that has passed the D43 spike.

**Thresholds (declared 2026-07-22, harness built in `app/eval/`).** A provider/mode must clear all three to count toward the Phase-4 ship gate: **exec-rate ≥ 90%**, **result-correctness ≥ 75%** (execution-match against the reference SQL, order-insensitive and numerically rounded — not string comparison), **repair-rate ≥ 50%** among turns that needed at least one retry (turns needing no repair are excluded from that denominator, not counted as failures). No fixed cost-per-turn ceiling is set yet — no provider here is a metered API (Workers-AI billing is owned by `09-edge/01-ai-router`, unbuilt), so cost is tracked as an estimated-tokens-per-turn proxy (prompt+completion chars ÷ 4) until a real backend gives it a dollar shape; a $/turn ceiling is added when that lands. Set from the harness's first real run over the labeled 58-question set (`app/eval/dataset/questions.ts`, §14 datasets): the **D43-verified WebLLM path scored 93.1% exec-rate / 72.4% correctness** (real Qwen2.5-Coder-1.5B-q4f16 inference, Apple WebGPU) — the thresholds sit just above that floor so the intended v0.5 cloud provider (a 32B model, ADR-007) is expected to clear them with room, while a future local-model regression would be caught. A **local-only deterministic-template baseline** (no LLM, the honest `local-only`-mode floor) scored 67.2%/19.0% — informational only, not gated (D2's local-only mode never runs the loop in product; the harness measures it anyway so the report shows the real gap an LLM closes). A **scripted mock-cloud** entry (100%/100% by construction — it answers from the harness's own reference SQL) is a plumbing check, never a capability claim (D40/D43's own honesty rule): it exists only to prove the harness's per-provider metric plumbing is complete ahead of a real `09-edge/01-ai-router` deploy.

---

## 12. Modify, Export & Persistence

### 12.1 Modify (client-side, native)

SQL transforms against the in-browser DuckDB instance (§10 Module 2's transformation layer). No bridge, no server involvement.

**One-click undo for derived tables.** Transforms derive new tables rather than mutating sources, so reversibility is cheap by construction: every `CREATE TABLE AS` from the transformation layer is recorded with its generating SQL, and each derived table carries an undo action that drops it (and clears its profile/registry entries). The recorded SQL doubles as redo/replay. Statements that would mutate an ingested source table in place get a confirm prompt offering "materialize as a new table instead" as the default.

**Reproducible transform recipe (D53).** Because every derived table already records its generating SQL, the sequence of transforms in a session *is* a recipe. Analysts run the same cleaning every month against a fresh export, so that recipe is exportable as a re-runnable artifact — the ordered SQL (and, later, a dbt-model stub via the Studio arc, §20.6) — with a "re-run on a newly dropped file" affordance. v0 ships the export of the recipe (the SQL is free — it is already recorded); one-click re-run automation against a re-dropped file is v0.5. This is the analyst's retention hook, the transform-side twin of the D44 Drift Report's "re-drop the new export" ritual.

### 12.2 Export (client-side, native)

`COPY dataset TO 'out.parquet' (FORMAT PARQUET)` runs entirely client-side; DuckDB-Wasm hands back the buffer for download. No Worker involvement — a server component only enters when persistence beyond the tab is wanted.

**Copy-to-Jupyter snippet.** Next to every download, a copy button emits a ready-to-paste notebook cell that loads the exported file (`duckdb.read_parquet(...)` / `pd.read_parquet(...)`), with the SQL that produced the table included as a comment — a zero-infrastructure handoff to the tool data people already trust.

**Take-it-with-me exports (D53).** Analysts don't stay in DataScope — they carry results into Excel, a deck, or a ticket. The handoff surface therefore covers the analyst's real destinations, all client-side: the **result grid → CSV/Excel** (`.csv` always; `.xlsx` via a lazy-loaded writer so it never enters the entry bundle), any rendered **chart → PNG/SVG** for slides, and **copy-SQL** for the query behind any table, pivot, or chart. Parquet remains the engineer/agent export; these are the business-analyst export. Zero server surface — the §4 constraint and D28 free-forever core are unchanged.

**Structure-report export (D20 — in v0).** A one-click, client-side export of the structure report: schema, inferred semantic types, profile aggregates (null %, cardinality, distributions), the insight feed, and — from the v0 Join Graph (beta) onward (D24) — the confidence-labeled relationship graph, plus the quality score once the Studio arc lands. Entirely client-side — zero server surface, so it ships inside D15's v0 cutline. This is the shareable artifact *before* hosted share links exist: the v0 answer to "show someone what my data looks like without sending the data." **Deterministic narration (D65, v0.5):** the report (and the §13.1 Dossier) carry template-filled plain-language findings over the D10/D45 facts — *"`order_id` is 99.8% unique with 4 nulls; it looks like this table's primary key"* — generated with **no LLM in the loop** (works identically in local-only mode, D2), templates obeying D45 (evidence + confidence phrasing, no permanence claims). This re-frames the D54(b) findings narrative as *deterministic-first*, with optional AI polish layered later under D56-style gating.

**DSPS — the DataScope Profile Spec (D31; promoted to a first-class interface, D37).** The machine-readable export is formalized as **DSPS, an open, versioned JSON spec** — a named architectural interface (§1, §6), not an export afterthought — designed in Phase 1 alongside D18's interfaces-first work (it *is* the interface design for the report, not new scope on top of it). It carries an explicit **`dsps_version`** field with documented compatibility semantics: a consumer on an older spec reads the fields it knows and ignores the rest (forward-compatible), a producer never silently drops documented fields within a major version (backward-compatible), a **version mismatch surfaces the spec version rather than failing opaquely**, and a breaking change bumps the major version. It degrades gracefully to **schema-only** when the D24 slice is cut (the relationship section drops, the artifact still validates). **Fact provenance (D45):** every DSPS fact is labeled **"computed as of {snapshot date + file hash}"** and carries a provenance tag — `derived-this-run` / `user-asserted` / `carried-unverified`; "verified" and any permanence/invariant wording are **banned** (D21's truth-in-labeling rule, extended from share copy to fact and detector output). DSPS facts are structural/quality only (PK/FK/null/type/range/distribution) — metrics stay in the §20.6 semantic model, which also sidesteps the "fact table" naming collision — and DSPS stays **stateless-per-run** (no cross-run merge or accumulation). **v0 ships facts exactly as they already are** (profile aggregates + D24 edges); the unified fact object plus provenance tag is v0.5 DSPS-spec work, never a mid-flight v0 re-architecture. Full field-level detail lives in the split-tree schema leaf (`build/08-persistence/03-dsps-spec.md`). One artifact, three renderers:
- **HTML** — for humans: a self-contained file, openable/attachable/hostable anywhere, no DataScope dependency.
- **DSPS JSON** — for tools: the versioned spec that lets "send me the DataScope report" become a portable format (the Swagger/OpenAPI arc; §24 Play 4). **DSPS is the platform, the app its flagship client (D64):** a published JSON Schema + a small npm validator/parser library let third-party tools consume DSPS without reading our source, and the **D62 universal `.dsps` receiver** is the named reference consumer — any `.dsps` renders read-only, instantly, with no data/login/install (§13.1). A format only one app reads is an export; the schema, the library, and the receiver are the difference.
- **"Copy for AI"** — for LLMs: a Phase-3 button (~1 day) that renders DSPS as an LLM-optimized markdown block — tables + row counts, relationships with confidence (degrading gracefully to schema-only when the D24 slice is cut), key statistics (median/p95/null %), quality flags. A 50MB CSV becomes ~200 tokens of *faithful* context with **zero raw rows** — the §5 privacy model extends to AI workflows for free. This is DataScope's AI-facing surface, client-side by default (D31/D32) — **deterministic structural chunking**, metadata extraction via client-side DuckDB-Wasm, *not* traditional text chunking — extended by the **D38 MCP surface** (stage A serves DSPS read-only over explicitly shared artifacts; stage B exposes tools over explicitly staged datasets only, v1+). The D32 no-RAG boundary is unchanged; this makes DataScope *complementary* to the LLM tools commoditizing the chat lane (§3.4), not competitive with them. DSPS ships as an open, versioned spec — the Swagger/OpenAPI arc (§24 Play 4).

**The report recruits (D26).** The exported HTML report gets a real visual-design pass — beautiful enough to screenshot (the Spotify-Wrapped principle applied to schemas) — and carries a tagged **attribution footer**, *"Profiled with DataScope — drop your own files,"* with a link, on every exported HTML report and every hosted share. The link is tagged so the D25 edge counters can distinguish report-referred arrivals. Every report attached to a Jira ticket, dbt PR, or "here's what the vendor sent" email is a billboard placed in front of the exact target user by someone they trust (§24 Play 4).

### 12.3 Save / Share via R2 (D5 — in v0.5; structure-only default per D20)

Explicit, opt-in persistence beyond the browser tab (shareable link, cross-device pickup). **Two share artifacts, structure-first (D20):**

- **Structure-only share (default):** the §12.2 structure report hosted as an unguessable link — schema, types, relationships, profile aggregates; **no data rows**. Safe by construction against row disclosure; residual leaks are column *names* and rare categorical *values* surfaced in profiles, so the share dialog offers **column-name redaction** and **rare-category suppression** (categories under a disclosed count threshold collapse into "other") as one-click controls.
- **Full-dataset share (explicit escalation):** the original D5 artifact — dataset contents stored server-side. Never the default; its dialog is visually distinct and states plainly that raw rows will be uploaded.

**Language rule (D21):** UI and marketing say "structure only — no data rows included" (true by construction) and describe redaction/suppression as *reducing* re-identification risk. The words "anonymized," "de-identified," "GDPR/HIPAA-safe" never appear. Aggregate-stats and synthetic-replica share tiers are deferred designs (§20.11).

Spec requirements (both artifacts):

- **Explicit action only** — a "Save to cloud / Create share link" button; never automatic.
- **Disclosure** — the action dialog states that dataset contents will be stored server-side, where, and for how long.
- **Retention policy** — saved objects carry a **TTL of 30 days (launch default, tunable)**, surfaced in the UI, plus a "delete now" control on every share link the user created. The Terraform-owned R2 lifecycle rule (§23.3) is the enforcement mechanism, so the disclosed number and the infrastructure rule are the same number.
- **Private by default** — links are unguessable-token URLs; no public listing.
- **Likely-sensitive-column nudge (D46 — v0.5).** Deterministic detection surfaces likely-personal-data columns *inside the share flow* — "these columns may contain personal data — review before sharing," framed as *reducing oversight risk*, never certifying absence. **Positives-only**: no "none found" line and no all-clear state, ever (a false-clean on a free-text SSN column is a trust-landmine for the exact D23 user who trusts it most). A suppression assist that pairs with the redaction/rare-category controls above, never a clearance verdict.
- **Abuse controls** — per-session size caps and rate limits on the save endpoint (the same shared Worker rate limiter as the Tier-2 relay, §7.4). Launch defaults (tunable): **10 saves/session/day**; **100 MB/object**; **300 MB/session/day aggregate** — the daily *byte* cap, not the object count, is what bounds standing storage. Aggregate bucket size is observed with an alert at 8 GB, and the save endpoint's kill switch is the overflow response (both §23.5).

**Workbench homes (D71, 2026-07-24).** In the flag-on shell: the **share-links list lives in the explorer** (create/extend/delete reachable with zero datasets, preserving today's guarantee); the **`?share=` open and the D62 `.dsps` receiver render as viewer mode** — the read-only Workbench shell (§13.3), replacing the modal `SharedStructureReportView` overlay — with the D62 cut line intact (degrade to the Blueprint face / static §12.2 HTML render) and **`.dsps` drop routing sniffed by `dsps_version` before the JSON-ingestion path at every drop surface**.

**Takedown & abuse reporting.** The operator can delete any stored object directly via the R2 console or `wrangler` (a written runbook line — no bespoke moderation tooling); an abuse-report contact (a `mailto:`) appears on the share-open page; the retention TTL bounds the standing exposure of any single object. No content scanning and no moderation queue — disproportionate at this scale.

**Claimable share links — deferred to v0.5 planning (D29).** Email-claimable links (manage / extend / delete your shares) are *not* in scope now: they add email-collection UX to the critical path and sit in tension with the D23 beachhead, which is exactly the audience most allergic to "enter your email." Near-term capture is the D26 attribution loop plus the D25 counters. Revisit trigger: when this hosted-share build starts. If built, claiming stays **optional and purely functional** (manage/extend/delete) — never marketing-flavored.

**Future export shape (backlog):** a *Context Bundle* — raw tables + transformed tables + SQL history + insights + schema metadata + chart specs in one exportable artifact (§20.5).

---

## 13. UI Layout & Navigation

**Two shells during the flag-parallel period (2026-07-24, D71).** The app has two composition roots: the **current shell** (§13.0 — the flat sidebar + main workspace below, plus the §13.2 intent-group nav) and the **Workbench** (§13.3), built behind `WORKBENCH_ENABLED` as a parallel shell, branched in exactly one place (`App.tsx`). Both are launch-capable by construction; **which surface ships Oct 6 is the open §9.1 call, decided at the W8 flag flip (§19), and nothing in this section forecloses it.** §13.0's spec is deleted only *at* the W8 cutover — mirrored master-first when the old shell is deleted in code — never before. The Dossier (§13.1) is content shared by both shells; only its *home* differs.

### 13.0 Current shell (flag-off — the spec of record while it remains launch-capable)

```
┌───────────────────────────────────────────────────────────────┐
│  DataScope                                  [Dark Mode] [Menu] │
├────────────┬──────────────────────────────────────────────────┤
│            │                                                  │
│  SIDEBAR   │              MAIN WORKSPACE                      │
│            │                                                  │
│  Ingest    │  ┌──────────────────────────────────────────┐    │
│  Profile   │  │                                          │    │
│  SQL       │  │     Active Module Content                │    │
│  Charts    │  │     (Charts, Editor, AI Chat)            │    │
│  AI Chat   │  │                                          │    │
│  Export    │  └──────────────────────────────────────────┘    │
│            │                                                  │
│  Studio    │  ┌──────────────────────────────────────────┐    │
│  ML        │  │  Educational Panel / SQL Preview         │    │
│  (post-v1) │  │                                          │    │
│            │  │  (Shows the query or explanation         │    │
│  Learn     │  │   alongside every visualization)         │    │
│            │  └──────────────────────────────────────────┘    │
├────────────┴──────────────────────────────────────────────────┤
│  CONSOLE: DuckDB v0.10 | 14,232 rows × 12 cols | 2.3 MB       │
│  Query: 4.2ms | Web Worker: Active | Memory: 18 MB            │
└───────────────────────────────────────────────────────────────┘
```

### Sidebar module states

| Module | State when capability is TRUE | State when capability is FALSE |
| :--- | :--- | :--- |
| Profile | Active (always enabled) | — |
| SQL Playground | Active (always enabled) | — |
| AI Chat | Active per AI mode (§5.1) | "AI is off — enable in settings" |
| Time Series | Clickable, date + value config | Greyed out: "Needs a date column" |
| Correlation | Clickable, matrix | Greyed out: "Needs 2+ numeric columns" |
| Distribution | Clickable, histogram | Greyed out: "Needs a numeric column" |
| Export / Share | Active when any table exists | — |
| Studio (Quality / Schema Graph / Model) | *(Studio arc, §19 Phases 7–9; a thin Join Graph (beta) ships in v0 — D24)* | Greyed out: "Coming in Studio" — graph/model entries additionally need ≥ 2 tables |
| ML modules | *(backlog, §20.1)* | Greyed out: "Coming soon" |

### 13.1 Dataset Dossier — the post-ingest landing view (D48)

Immediately after a folder or file is ingested, the main workspace opens on the **Dataset Dossier** — the folder-level overview, not a raw table dump. It is packaged from the existing v0 modules (§8–§10, §12), not a new engine, and answers the inherited-data "what have I been handed?" question on one screen (D48, D52). Contents:

> **v0.25 promotes this to the Blueprint-forward opening (D70, §19).** Post-launch, the Dossier / D68 Verdict becomes the app's *primary* opening surface (the "Blueprint"), with the D69 intelligence-layers (profiling / heuristics / AI-synthesis) as the opening view and the D70 edge-warm → WebLLM synthesis resolving as an async upgrade over the deterministic Verdict. Same assembly, same modules, same ViewSpec (D55/D68) — a presentation promotion, no engine change; the escape hatch for the §2 second audience stays in both shells — as the D68d "skip to data" control in the current shell, and as the structural explorer click-through + optional settings default-tab preference in the Workbench (§13.3, where the toggle itself is superseded). In the flag-on shell, the Workbench dataset map **is** this Blueprint-forward opening (D70/D71 reconciliation — one opening, not two competitors).

- **Tables × rows** — every registered table (§7.5) with its shape and source.
- **Join-graph thumbnail** — a compact view of the Join Graph (beta) when the D24 slice lives; absent otherwise.
- **Quality flags** — the headline findings from the auto-profile and insight feed (§10 Module 1, D10).
- **Time coverage** — span and per-temporal-column gap summary.
- **Top insights** — the ranked deterministic insight cards (D10).
- **Sensitive-column findings** — **positives-only, and only once the D46 detector ships (v0.5)**; in v0 the Dossier has no sensitive-columns row at all (positives-only means silence, never an all-clear).
- **Suggested next steps** — an opinionated D10 extension that links into the existing modules (profile a table, run a suggested query, open a chart), not a new engine.
- **Deterministic narration** — template-filled plain-language findings over the D10/D45 facts (**D65, v0.5**), no LLM in the loop, D45-compliant phrasing; the v0 Dossier's existing insight copy is the seed.
- **One-click report export** — the §12.2 structure report (D20).

**Read-only `.dsps` receiver mode (D62).** The same Dossier renders **read-only** when handed a `.dsps` artifact rather than a live dataset — any `.dsps` dropped on (or linked into) the app opens the full Dossier instantly, with **no data, no login, no install**: the live-data path stripped, a read path over the existing artifact, **zero new server surface** (§4). It closes the send/receive/re-run reflex loop (§24 Play 4 ships the sender; this is the receiver) and is the D64 format inversion's reference consumer. **v0 stretch if trivially cheap, else early v0.5;** internal cut line, like the Dossier's own: **degrade to rendering the §12.2 HTML report output**, so it can never move the launch date (D27). *(Workbench re-home, 2026-07-24: in the flag-on shell this receiver renders as **viewer mode** — the read-only Workbench shell, §13.3 — instead of a modal overlay; same content, same cut line.)*

The **per-table profile view (§10 Module 1) stays one click away and is the degrade target**: the Dossier's internal cut line is "degrade to the per-table profile view," so the cut lives inside the feature and can never move the launch date (D27, D48). The Dossier absorbs most of the guided tour's job — the tour becomes "walk the Dossier."

**Information-design spec (the detailed pass on the D48 content contract above).** The Dossier is one scrollable screen, assembled top-to-bottom in decreasing "what have I been handed?" priority. Only the identity band and a single hero region sit above the fold — that first screen is the launch centerpiece and the thing that gets screenshotted (D52, §24 Play 1), so it must land whether or not the Join Graph slice lives.

```
┌──────────────────────────────────────────────────────────────────┐
│  acme-warehouse/          4 tables · 14,232 rows · 2.3 MB          │  identity band
│  Profiled 12 Jul 2026 · from your machine, nothing uploaded        │  (D45 snapshot line)
│                                        [ Export structure report ] │  (D20, persistent)
├──────────────────────────────────────────────────────────────────┤
│  HERO — how the tables relate                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  join-graph thumbnail: solid = name-agreeing FK,           │   │  WITH graph (D24 live)
│  │  dashed = structural candidate            → open full graph │   │
│  └────────────────────────────────────────────────────────────┘   │
│  customers 1.2K · orders 8.4K · order_items 4.1K · products 480    │  table strip (always)
├──────────────────────────────────────────────────────────────────┤
│  Worth knowing     412 duplicate rows · discount_code 61% null …   │  quality headline (D10)
└──────────────────────────────────────────────────────────────────┘
   ↓ below the fold ↓  Time coverage · Suggested next steps ·
   Top insights · Sensitive columns (v0.5+, positives-only) · full table detail
```

**Above the fold, with and without the Join Graph (the D24 hedge).** The hero region has one job — answer "how do these tables relate?" — and two renderings that occupy the *same* slot. **Graph present:** the join-graph thumbnail is the hero, rendered in the §20.6 two-tier grammar (solid edges where an FK name echoes the parent, dashed candidates where only structure matches — never a silently-dropped edge, never a confidently-wrong one), with the table strip beneath and a click through to the full Join Graph (beta). **Graph cut** (its D24 kill criteria fire): the **table grid is promoted into the hero slot** — each table a card with its shape, its key/ID columns, and any name-shared column rendered as a plain line (*"shares `customer_id` with orders"*). No empty frame, no "graph coming soon" apology — the same structural question is answered at lower fidelity by data that always exists (§7.5 registered tables). Because the table grid is *always* built, the hedge is a **reflow, not a second build**: with the graph it sits under the thumbnail; without it, it rises into the hero. This is precisely why the Dossier *is* the structural hedge named in D48 — it degrades within one layout. **Connector-source guardrail (D24/D17/§20.6).** Any column-level or ERD-style hero rendering must source its connector lines from the D24 `relationshipInference.ts` engine output — solid/dashed tier, confidence + evidence, and override state carried through — **never from a name/presence matcher, and never asserting a cardinality (e.g. "1:M") the engine did not compute.** The name-shared plain line above is scoped *only* to the graph-cut degrade case (no arrowhead, no confidence claim) and may **never** be promoted into a live/confident-looking rendering — that is the exact confidently-wrong edge D24 and this section forbid. A richer interactive/expandable column-level rendering, if ever built, is the target of the *"click through to the full Join Graph (beta)"* destination and/or the below-fold full-table-detail region — **never a replacement for the compact, screenshottable hero thumbnail**, which stays the two-tier relationship answer (D48/D68c tier-1 discipline).

**Suggested next steps — opinionated, never over-claiming (extends D10).** Three to five ranked actions, each generated by the same deterministic insight rules (§10 Module 1) and phrased as *routing, not a verdict*: an imperative action that links into an existing module, plus a because-clause naming the computed fact that motivated it — e.g. *"Chart `revenue` over `order_date` — there's a 38% drop in March"* (→ Time Series), *"Start with `orders` — the largest table, joins to three others"* (→ Join Graph / Profile), *"Look at `discount_code` — 61% null, all before 2023"* (→ Profile). The honesty guard is structural: a step may state a statistic (the change-point rule's "−38% in March") but never a conclusion built on it ("revenue is declining"), never a causal or superlative claim the number does not carry, and never "we found." When the profile is thin — one table, no temporal column, no rule fires above threshold — the band degrades to generic-but-honest routing ("profile each table," "try the correlation matrix on the four numeric columns"), never manufactured intrigue. Ranked by the insight feed's interestingness score (effect size × coverage); it is a briefing, so it caps at five.

**Sensitive-column findings — positives-only, and the copy is the point (D46).** In **v0 there is no such band at all** — the D46 detector is v0.5, and positives-only means *silence*, so the Dossier renders nothing here rather than a reassuring "none found." When the detector ships (v0.5) the band appears **only when ≥ 1 column is flagged**:

> **Columns that may contain personal data**
> `email` — values look like email addresses
> `ssn` — values match an SSN / national-ID pattern
> `notes` — free text may contain names or addresses
> *Review these before sharing. DataScope flags likely matches; it cannot confirm a column is free of personal data, so treat a missing flag as "not checked," never "clean."*

There is **no all-clear state anywhere it renders** (share flow, Dossier, report) — no "0 sensitive columns," no green check, no "scan complete." The absence of the band means the detector surfaced no positives, which is *not* the same as the data being safe, and the copy never lets the two be confused: a false-clean on a free-text SSN column is the trust-landmine for the exact D23 user who trusts the tool most.

**The internal cut line — graduated, and never the launch date (D27).** The Dossier is UI assembly over modules that all already exist, so its cut lives *inside* the feature as a four-rung ladder, each rung cheaper and still shippable: **(1)** full Dossier — every band; **(2)** drop *suggested next steps* (pure assembly, the most cuttable band) — still a complete overview; **(3)** drop the assembled hero reflow, keep identity band + table grid + quality headline — a static one-screen summary; **(4)** full cut — open directly on the **per-table profile view (§10 Module 1)** for the largest table with a table switcher, the join graph, export, and every insight all one module-click away. The user loses *synthesis*, never a *capability* — everything the Dossier surfaces is a view onto a module that ships regardless. Because rung 4 is a Phase-1 always-on module, no rung can move Oct 6.

**Provenance and the drift hook.** The identity band carries the D45 snapshot line — *"Profiled {date} · from your machine, nothing uploaded,"* file hashes on hover — and every card states its facts as-of-snapshot, the banned-permanence rule (no "verified") applying throughout. The identity band is also the anchor for the v0.5 **Drift Report** re-drop ritual (D44, §20.8): "compare with a previous version" lands here, turning the one-shot Dossier into the repeated structure × time loop. v0.5 scope — noted so the v0 layout leaves room for it, not built now.

**The Dossier is the deterministic ViewSpec producer (D55/D56).** Architecturally, the assembly above is emitted as a **ViewSpec** — the versioned, capability-gated declarative layout artifact of D55 (fixed component registry + typed §11.1-stage-6 chart configs), consumed by a deterministic renderer that never executes model output. Same screen, now a declarative artifact, inside the same D48 UI-assembly budget; it paints first, always, and is the whole of the view when AI is off. From v0.5+ the optional AI view-composer (D56) may propose a tailored variant — scoped to this Dossier and the D30 consumer templates, cached per dataset fingerprint (the identity band's D45 hash), resolving asynchronously after the deterministic paint as an explicit "tailored this view" upgrade badge — never load-bearing, never on the first-paint path, never breaking wifi-off. The four-rung cut ladder above is unchanged and lives entirely in the deterministic producer. The D69 **AI-synthesis layer**, if present, is a **D65 deterministic-narration** panel by default — template-filled sentences over the D10/D45 facts, no LLM in the loop — and **LLM-authored freeform panel content (a novel domain-summary paragraph, freeform suggested-query text) is explicitly excluded**, remaining the rejected D56 option-C pending a separate eval-gated decision (its own D40-analogue scoped to dataset-level synthesis).

**The Verdict — tier-1 progressive disclosure over the Dossier (D68c).** The bands above map onto a three-tier `ViewSpec` contract, so the first screen carries *only* the payload needed to choose a move:

- **Tier 1 — the Verdict:** the identity band + **one headline `FactRef`** + the **top-3 `RankedAction`s** (§9 `rankNextActions`). One screen, no scroll: what the dataset *is*, the single most important fact, and three real destinations — the executive briefing the D52 inherited-data user opens on.
- **Tier 2 — the evidence:** quality headline, time coverage, and the hero graph/grid reflow (the D24 hedge, unchanged).
- **Tier 3 — the full profile:** top-10 insights and per-table column cards, behind "see the full profile."

The renderer paints Tier 1 and gates 2–3 behind disclosure; the four-rung internal cut ladder and the `.dsps` receiver mode are unchanged and live in the deterministic producer. **D55 contract intact** — same fixed registry, still never executes model output.

**`tier:` is the disclosure axis only (D68c, D69).** `tier:` on a ViewSpec panel is the progressive-disclosure axis and only that; the enum is exactly `1|2|3`, with **no fractional tiers**. Any feature-maturity grouping — the D69 **profiling / heuristics / AI-synthesis layers** — is a **separate concept and is never written into `tier:`**. The layers map *onto* disclosure tiers, they do not become them: heuristics / data-sniffer findings render at **tier 2** (evidence), per-table profiling cards at **tier 3** (full profile), and the AI-synthesis layer — if it ever ships — at tier 2 or 3, **never tier 1** (tier 1 is the deterministic Verdict alone). A maturity label landing in the disclosure slot would promote the wrong panel above the fold and, for `1.5`, fail `viewspec_version` validation outright.

**The confidence floor — no manufactured headline (D68c).** The headline `FactRef` is the top fact by the §9 interest score, but *only when a fact clears the interest floor.* Below it — a single-column file, no temporal column, nothing correlated, no rule firing above threshold — tier 1 states the honest structural fact instead: *"4 tables · 14,232 rows · no single dominant finding — here's the structure,"* the top-3 actions degrading to generic-but-honest routing (§9). This hardens §13.1's existing thin-profile degrade ("never manufactured intrigue") into a **named rule on the Verdict itself**, because for the D23 audience a confidently-banal headline (*"`price` and `cost` correlate at 0.98"* — a tautology to a domain expert) is worse than no headline. Tie-break when several facts clear the floor: **quality-risk facts win** (duplicates / nulls / leakage), since the inherited-data user's first question is "can I trust this?" — the trust gate (D23).

### 13.2 Navigation — four intent groups, capability-gated (D68d)

The flat, equal-weight sidebar sketched at the top of §13 (Ingest / Profile / SQL / Charts / AI Chat / Export / Studio / ML / Learn) is **superseded**: it exposed *implementation* (four chart sub-types as peers of "Ingest," two permanently-disabled items) and forced the user to know they wanted "Correlation" before the data had said correlation was interesting — navigation preceding insight. D68 regroups it into **four collapsible intent groups**, each capability-gated:

| Group | Destinations | Gate |
| :--- | :--- | :--- |
| **DATA** | Ingest, Dossier, per-table Profile | always; the only group expanded pre-drop |
| **EXPLORE** | SQL playground, Charts *(one destination; broker-eligible sub-types are internal tabs, auto-selecting the first)* | Charts appears only when ≥ 1 chart capability is legal (§9) |
| **ANALYZE** | Pivot / cross-tab, Correlation, (v0.5) AI Chat | per-capability (§9); AI Chat per §5.1 mode |
| **OUTPUT** | Export / structure report, Save/Share *(v0.5)* | Export active when any table exists |

Two sharpenings over grouping alone:

- **The sidebar is *secondary*.** The primary path is **Verdict → ranked action → thread** (D68a/c/e); the sidebar is the "I already know what I want" escape hatch, progressively revealed after data loads — only **DATA** is expanded pre-drop. This is why the Action Broker (§9), not the nav, is the routing layer.
- **A sticky "skip to data" for the expert.** The §2 Parquet-first engineer and the returning user must not be trapped in the guided ladder: a persistent "skip to data" control (and a remembered preference) opens directly on the per-table profile / SQL, bypassing the Verdict. Expertise flexes the default — the Verdict is the on-ramp, never a toll booth. *(Workbench note, 2026-07-24: in the flag-on shell this toggle is superseded — the intent is structural (explorer table-click → Profile tab, one click, no modal) plus an optional settings "open on last table's Profile" preference, §13.3. This control remains the flag-off shell's mechanism until W8.)*

Dead items leave v0 nav: **Studio** and **ML** return when real (§19 Phases 7–11); **Learn** moves to a header help icon (the Dossier absorbed the guided tour's job, D48). Chart sub-types are no longer sidebar modules — selection is local state inside the Charts destination. The per-capability enable/disable logic in the *Sidebar module states* table above is unchanged; D68d only changes how those destinations are **grouped and revealed**.

### 13.3 The Workbench (behind `WORKBENCH_ENABLED` — D71)

The second shell: a VS-Code-shaped instrument built as a parallel composition root (`App.tsx` renders `WorkbenchShell` or the §13.0 shell; the flag lives at the composition root and in the nav facade **only** — a feature module needing to know which shell is live is a facade design error). Visual reference: the five signed-off hallmark mocks (`_implementation/_misc/ideation/hallmark/`). Macrostructure — **left explorer · middle tabbed canvas · optional right AI pane · bottom inspector · command palette (⌘K) · status bar** — assembled across five acts: Act 0 welcome (editorial page, all ingestion entry points, privacy as headline copy; D30 consumer pages render as Act 0 variants), Act 1 upload (unchanged machinery, honest phase labels), Act 2 AI defaults (**no forced gate** — the §5.1 switch model applies: off by default, capable-device WebLLM pre-select, "Configure workspace" on demand), Acts 3/4 the assembled shell opening on the map.

**The explorer (left).** The session's tables — derived-table badges, expandable columns with semantic-type icons, per-table actions (Profile, refresh-from-source, remove), **Add data** (drop / URL / samples), and the share-links list (reachable with zero datasets). Managing lives here; clicking a table opens its Profile tab directly — the structural "skip to data" (D68d supersession), with an optional settings preference "open on the last table's Profile instead of the map" for the habit.

**The canvas and the tab model.** Everything opens as a tab. Workspace tabs are **singletons per `(type, subject)`** (one Profile per table, one SQL playground); artifact tabs (a pinned chart, a produced result) are **per-artifact**. A `RankedAction`'s prefill becomes the tab-instance **initializer** — same D68e semantics, no self-clearing global slot. Two load-bearing contracts:

- **The envelope invariant (D55 generalization — the security seam).** A tab is described by a spec, but serializability is orthogonal to safety: **the tab *envelope* — type (from a fixed, closed tab-type registry), identity, active-tab selection, initializer — is authored only by the app, never by a model.** The only model-producible content is the *inner* artifact spec (ChartSpec via the §11.1 stage-6 translator, ViewSpec via the D55 renderer), which passes `producerValidators` (`types/producers`) **before** any tab opens; `stores/tabs.openTab` treats any model-originated payload as untrusted input requiring validation. "The AI opens a tab" always means: model output → validated inner spec → app-authored envelope — never a model-chosen tab type, identity, or initializer (D55/D58).
- **Preservation: keep-mounted is the v0 norm (2026-07-24 decision; supersedes the earlier restore-from-spec stance).** Switching away and back never resets a tab. The v0 mechanism is keep-mounted; restore-from-spec is an opt-in optimization where a tab's spec is already cheap and complete (per-type calls made by manual testing during W3). Heavy tabs (Monaco SQL with undo/cursor, large result grids) stay keep-mounted for fidelity. **Full tab-list serialization is deferred to the D61 hosted-tier design round** — its only real consumer; viewer mode and share serialize the *structure artifact* (`.dsps`), never the tab list. The "memory ceiling becomes a non-policy" claim is *not* adopted — the ceiling is managed, not dissolved.

**The dataset map — the opening tab.** Multi-table: an ERD fed by the existing D24 inference pipeline (`lib/relationshipInference` → a re-skin of the Join Graph, not new analysis), automatic layout, field-row edge anchors. Single-table: the **Blueprint face** — the re-homed §13.1 Dossier. Selecting a table on the multi-table map opens the Blueprint as the side panel. Three rules: **(1) the multi-table map tab header carries a persistent Verdict band** — identity + the one headline `FactRef` under D68c tier-1 discipline, confidence floor and quality-risk tie-break intact — so a fresh multi-table open still answers "what have I been handed / can I trust it?"; the ERD is the *hero region*, never the whole tier-1 surface (this also holds for a multi-table `.dsps` in viewer mode). **(2) The §13.1 connector-source guardrail applies verbatim**: lines from the D24 engine only — solid/dashed tier, evidence, override state — never a name/presence matcher, **never a cardinality (e.g. crow's-foot "1:M") the engine did not compute**. **(3) The D56/D70 synthesis upgrade badge renders on the map face but fires only under a confirmed-active egress mode** (§5.1), degrading to the deterministic paint otherwise.

**The options strip — above the map, map-tab-only (decided).** The strip acts on the current selection (map card *or* explorer row): **membership = the capability gate resolved against the selected subject's legal operations; order = the D68a broker ranking applied to that legal set** — implemented as a client-side, subject-scoped filter of the dataset-wide `RankedAction[]` (via each action's `ThreadConfig` subject), never a second ranker (D58). Not "no engine change": the subject-scoped filter is a named, tested seam. **Gated actions render disabled-with-reason** — today's teaching copy ("Needs a date column") survives the redesign; legal-but-unranked actions collapse under a "more" affordance so the strip stays small and curated without silently exiling capabilities to the palette. An action with no valid subject is absent, with its reason discoverable in the palette entry.

**The command palette (⌘K) — Workbench-launch-blocking, not polish.** Because the strip is map-only, the palette is the *only* cross-tab launcher for strip-homed analyses (SQL / Pivot / Correlation / Charts) when the user is off the map tab, and the universal escape hatch everywhere ("curation never imprisons"). Its action registry must reach **every** §13.0/§6-inventory feature home — a hard W5 gate. **Learn / help re-homes to the palette + welcome-page copy** (the Workbench has no header menu; §13.2's "header help icon" line remains the flag-off shell's answer).

**The right AI pane.** The §5.1 mode switches sit above it; the composer beneath; the **"Configure workspace"** button near the composer opens the data-handling surface (routing toggle, metadata-only repair, D72 grounding amount, custody). The per-turn **audit trail is the pane's hero** (§11.1 transcript discipline unchanged): planned → SQL → ran → sampled → validated → rendered, with the D55 seam shown literally — model output becomes a spec, is validated, then rendered deterministically into an artifact tab. The pane is additive (collapsible; absent contributes nothing) — the non-AI path sees no AI chrome beyond the quiet switch row.

**The bottom inspector — scent, not dashboard.** Fills from the selection: table → name/rows/memory/quick stats; column → profile scent; map edge → the FK evidence + confidence + override controls (D24). The EducationalPanel's explanations render **scent-level with click-through** here — never a pedagogical surface (the "no charts in the inspector" line holds). Click-through opens the full tab.

**The status bar — explicit density budget.** One ambient-state home: posture dot (what leaves / nothing leaves), engine state, ingestion progress, query stats, kill-switch "paused" states, theme quick-toggle, gear → Settings tab. **Budget rule: one glyph + one short label per item; anything heavier docks as a status-bar item + flyout** (the WebLLM dock/flyout is the pattern) — the bar may never become the new "too much on screen."

**Viewer mode (D62/D63 — the same shell, read-only).** A `?share=` URL or dropped `.dsps` renders the Workbench read-only: **options strip fully absent** (consumption-only — decided), no right pane, read-only explorer (no Add-data, no per-table management), **read-only inspector — edge evidence renders, override controls do not** (the structure belongs to the sender's session). The **D63 trust-chrome slot** is a full-width provenance band (structure-only claim · signer · signature-verified state), and the **D45 provenance chrome renders in full** (computed-as-of snapshot + hash, provenance tags, banned-permanence wording). Exactly two exits: **Export report** (where the payload allows) and **Start my own session** (→ Act 0). **Drop routing:** every drop surface — Act 0, whole-window, explorer Add-data — **sniffs `dsps_version` first** and branches `.dsps` → viewer mode *before* the JSON-ingestion path, so a dropped report never mis-ingests as a dataset. **Cut line (D62, restated):** viewer mode degrades to the single-table Blueprint face / the static §12.2 HTML report render.

**Settings tab (candidate scope, contents not decided).** The gear opens a Settings **tab** in the canvas (VS Code Settings-editor idiom) consolidating theme (light/dark/system — user-facing control, today OS-only), AI mode + BYOK, privacy/disclosure preferences, engine state, and the default-open-tab preference. Flagged as v0.5-era candidate scope — the consolidation is decided, the inventory is not.

**Anticipated feature homes (candidate scope, not decided).** Forward-looking roadmap items get a provisional home in this shell now — a feature that cannot name its home (tab type, pane, palette entry, or explorer node) is not ready to build. Tiers per D15/§19; the home assignments below are candidates, not firm:

- **DSPS spec publication** (now) — no new chrome; the export surface already carries the formats.
- **Theme control, light/dark/system** (v0.5) — full control in the Settings tab; quick toggle in the status bar / palette.
- **Responsive pass + empty/error states, Phase 6** (v0.5) — per-pane empty states; the small-viewport stance is an open, explicitly deferred question (§9.7 open, 2026-07-24 owner deferral).
- **Manual column re-classification, Phase 6** (v0.5) — an inspector action on a column.
- **Guided tour, D15** (v0) — largely absorbed by Acts 0–4; residue = welcome copy + first-map coach marks.
- **Deterministic narration, D65** (v0.5) — narration blocks on the map face + report tabs.
- **Signed `.dsps` / provenance, D63** (v0.5) — the viewer-mode trust chrome is already decided (Viewer mode, above); the candidate addition here is extending it into the share dialog.
- **Drift Report, D44** (v0.5+) — an explorer re-drop affordance on a table → a Drift Report **tab**; drifted tables badge on the map.
- **Data-Quality Report, Studio 7** (v1) — a report tab type (screenshotable, score-as-noun); quality badges on map entities.
- **Relationship inference & schema graph, Studio 8** (v1) — the map, v2: same surface, deeper engine.
- **Semantic model & dbt export, Studio 9** (v1) — proposals as artifact tabs; export via the share surface; a GitHub handoff action.
- **ML modules** (backlog) — analysis tab types; the worker invisible to the shell.
- **Consumer templates & landing pages, D30/D35** (v0/v1) — D30 pages rendering as Act 0 variants is already decided (Act 0, above); the candidate scope here is the D35 cross-platform combination-template surface.
- **XLSX/SQLite ingestion, semi-structured (D66), httpfs bucket mode** (backlog) — new sources into the explorer's Add-data; bucket mode = an explorer root.
- **Hosted tier, D61/D39** (post-v0.5) — the shell's state-purity is the enabler: a workspace becomes a persistable session.
- **Desktop, D51** (post-hosted) — the same shell; the D49 engine swap is invisible.
- **MCP stage B / share-tier extensions, D21** (backlog) — server-side / share-dialog escalations; no new panes.

**State model — scoped honestly.** The deterministic shell *skeleton* — which panes exist given session state (datasets, AI switches, viewer flag) — **is a pure function of session state**, and that is what the W1/W7 assembly tests assert. The claim is deliberately not extended further: async producers (the D56/D70 synthesis upgrade), long-running engine state (WebLLM download/warm-up), Monaco-bearing tabs, and async `.dsps`/`?share=` loads **layer on as imperative state updates over that skeleton** — testable at their own seams, never shoehorned into a purity that doesn't fit.

Build phases W0–W8 and their gates live in §19; the file-structure additions in §16.

---

## 14. Sample Datasets (Bundled)

So the tool is immediately usable without the user bringing data, bundle small samples that each unlock different capability combinations. Ship as small CSVs in `/public/samples/`, selectable from the ingestion screen.

| Dataset | Rows | Column mix | Foundation capabilities exercised |
| :--- | :--- | :--- | :--- |
| **E-commerce mini-warehouse** *(folder: customers, orders, order_items, products)* | ~5K total | IDs/FKs across 4 tables + Date, Quant, Cat | Multi-table ingestion (D13), cross-table SQL/joins *(Studio arc: the canonical demo for relationship inference, schema graph, and dbt export)* |
| **Titanic Passengers** | ~900 | Age, Fare (Quant), Survived, Class (Cat) | Distribution, Categorical breakdown, Correlation *(later: classification, clustering)* |
| **Daily Stock Prices** | ~2,500 | Date (Temporal), Open/Close/Volume (Quant) | Time series, Correlation, Distribution |
| **Product Reviews** | ~500 | ReviewText (Text), Rating (Quant/Cat) | Categorical breakdown, Distribution, text search *(later: NLP)* |
| **City Weather Data** | ~3,650 | Date (Temporal), Temp/Humidity/Wind (Quant) | Time series, Correlation, all stats |
| **Spotify streaming history** *(Personal Data template, D30; bundled synthetic export)* | synthetic | Timestamp (Temporal), artist/track (Cat/Text), ms_played (Quant) | Time series (listening by time-of-day / day-of-week), Categorical breakdown *(consumer channel; ZIP ingestion §7.5)* |
| **Google Takeout activity** *(Personal Data template, D30; bundled synthetic export)* | synthetic | Timestamp (Temporal), activity/search (Cat/Text) | Time series, Categorical breakdown, text search *(component-selection guidance §7.3)* |

**Personal Data category (D30 — consumer distribution channel).** Spotify and Google Takeout ship as a "Personal Data" sample category alongside the datasets above, each bundling a *synthetic* sample export so the `/spotify` and `/google-takeout` pages demo instantly without waiting days for a real export to arrive. A **template** is a schema mapping + pre-written SQL + chart configs over the existing modules (~200–500 lines per platform; the engine beneath is unchanged). Templates are **versioned** and **degrade gracefully to generic profiling** on schema drift (a banner — *"this export's format is newer than the template — showing standard profile"* — never a hard error; the generic engine always works). Social/messaging exports contain other people's data, so template charts **default to aggregates** (counts, times, patterns — not named-contact leaderboards) and launch copy never encourages posting friends' names. Consumers are a channel, not a second identity: the Oct 6 launch keeps the D23 narrative and these pages stay unmarketed until the Wrapped-season consumer wave (§24). The template format is documented and opened to community contribution in v0.5.

---

## 15. Performance Considerations

| Concern | Solution |
| :--- | :--- |
| DuckDB blocking main thread | Dedicated Web Worker via `@duckdb/duckdb-wasm` (library default) |
| DuckDB-Wasm initialization size (~8MB) | Lazy-load only after a file is dropped or a sample selected; progress bar during WASM compile; rely on immutable HTTP caching of content-hashed assets, not a hand-rolled Cache API (ingestion-spike finding, §21 — the measured warm-start gain was V8's compiled-module code cache, not the fetch) |
| Monaco Editor bundle size (~2MB) | Lazy-load via `React.lazy()` + `Suspense` when the SQL tab is first opened |
| Chart rendering with 10k+ points | Canvas-based rendering (D3 canvas mode) instead of SVG for scatter |
| Large file ingestion (100MB+) | Stream via `FileReader` chunks + progress; tiered fallback (§7.3) |
| AI latency (cloud mode) | Streaming responses in the chat UI; retry loop caps at 3 attempts |
| ML training freezing UI *(post-v1)* | Separate ML Web Worker; Transformers.js quantized INT8 models with download progress |

---

## 16. Planned File Structure

Feature-based layout (avoids refactoring imports at 20,000 lines):

```
src/
├── app/                        # Shell, routing, providers — incl. WorkbenchShell.tsx (D71 second composition root; App.tsx branches on WORKBENCH_ENABLED)
├── features/
│   ├── ingestion/              # Drop zone, sample picker, API URL ingest, telemetry
│   ├── profiling/              # Auto-profile dashboard, column cards, schema table
│   ├── sql/                    # Monaco wrapper, suggestions, results grid, auto-chart
│   ├── charts/                 # Time series, correlation, distribution, categorical
│   ├── explorer/               # (Workbench, D71) left explorer — grown from TableList; per-table actions, Add data, share-links entry
│   ├── map/                    # (Workbench, D71) dataset map — ERD + Blueprint face; ABSORBS JoinGraphModule (from charts/) and DossierModule (from profiling/) — a move, not an addition (§13.3)
│   ├── ai/                     # Chat UI, NL→SQL pipeline, mode/BYOK settings — Workbench: mode switches + Configure-workspace (§5.1)
│   ├── export/                 # Parquet download, R2 save/share, DSPS renderers (HTML/JSON/Copy-for-AI, D31/D37)
│   ├── studio/                 # (Studio arc) quality report, relationship inference, schema graph, dbt/semantic export
│   └── ml/                     # (post-v1) K-Means, regression, tree, NLP modules
├── components/                 # Shared presentational components
├── hooks/
│   ├── useDuckDB.ts            # DuckDB-Wasm init + query runner (genuine lifecycle/state)
│   ├── useSchemaClassifier.ts  # thin React adapter over lib/classifier.ts — pure logic stays in lib/ (D58)
│   └── useCapabilities.ts      # thin React adapter over lib/capabilities.ts
├── workers/
│   ├── duckdb.worker.ts        # DuckDB Web Worker
│   └── ml.worker.ts            # (post-v1) ML training worker
├── services/                   # Module API contracts (ingestion.ts, sql.ts, ai.ts, charts.ts, export.ts) + navigation.ts — the D71 nav facade (openDestination; flag-off drives ui store, flag-on drives tabs store)
├── lib/
│   ├── classifier.ts           # Semantic type rules
│   ├── capabilities.ts         # Broker evaluation + rankNextActions (Action Broker, §9/D68)
│   ├── qualityScore.ts         # (Studio arc) composite score + per-dimension rules
│   ├── relationshipInference.ts# (Studio arc) key detection, containment/cardinality analysis
│   ├── querySuggester.ts       # Auto-query generation
│   ├── chartMapper.ts          # Result → chart type mapping (shared with AI stage 6)
│   ├── viewspec.ts             # ViewSpec schema, viewspec_version + validation; deterministic producer over broker + Dossier (D55; optional AI producer v0.5+, D56)
│   ├── inputNormalizer.ts      # Fuzzy pre-match (AI stage 1)
│   ├── sqlLint.ts              # Dialect lint via pgsql-ast-parser (AI stage 4)
│   ├── dsps.ts                 # DSPS schema, dsps_version + forward/backward-compat rules (D31/D37; spec leaf build/08-persistence/03-dsps-spec.md)
│   └── featureFlags.ts         # WORKBENCH_ENABLED (D71; precedent JOIN_GRAPH_ENABLED)
├── stores/                     # App state — incl. the table registry (datasets.ts; the session catalog, §7.5/D13), schema, query, AI session, settings;
                                 #   tabs.ts (Workbench tab instances — openTab validates model-origin payloads, §13.3/D55) + selection.ts (shell-wide selection: table/column/map edge) — the pre-existing "tabs" state here is this store made explicit, not a second one (D71)
└── types/                      # ClassifiedColumn, DataCapabilities, ChartSpec, ViewSpec, TableRegistryEntry, WorkerMessage,
                                 #   FactRef, RankedAction, DatasetVerdict, ThreadConfig (composition-layer contracts, D68),
                                 #   tabs.ts — TabSpec envelope: fixed tab-type registry, app-authored only (D71/§13.3), ...

public/samples/                 # ecommerce/ (4-table folder), titanic.csv, stock_prices.csv, product_reviews.csv, weather.csv
                                 # Static assets (§14), fetched at runtime by the sample picker — never bundled (§18 budget)

edge/                           # Cloudflare Worker (separate deploy, wrangler-managed)
├── ai-router.ts                # Workers AI / BYOK routing
├── cors-relay.ts               # Tier-2 relay + rate limiting
├── vault.ts                    # BYOK credential vault (KV/secrets)
└── persistence.ts              # R2 save/share endpoints + TTL/abuse controls

infra/                          # Terraform — Cloudflare account resources (D19, §23.3)
├── providers.tf / main.tf      # provider pin, remote state backend
├── dns.tf / hosting.tf         # zone records, static-hosting project / custom domain
├── r2.tf / kv.tf               # buckets + lifecycle TTL rules (§12.3), vault namespace
└── envs/                       # dev / prod variable files

.github/workflows/              # CI/CD pipelines (§23.4)
Dockerfile                      # dev/CI parity image (§23.2 — never the production runtime)
compose.yaml                    # app + edge + e2e (+ optional ollama) local stack
```

---

## 17. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
| :--- | :--- | :--- | :--- |
| **Browser memory exhaustion on large files** | Tab crash, data loss | High | Tiered ingestion with hard limits (§7.3); memory monitoring before load; sampled preview mode. |
| **DuckDB-Wasm init size (~8MB)** | Slow first load | Medium | Lazy-load after first file drop; progress bar; Cache API for repeat loads. |
| **Incorrect schema classification** | Wrong modules enabled, confusing UX | Medium | Manual override: users can re-classify any column; show classification reasoning in a tooltip. |
| **LLM generates wrong-but-runnable SQL** (equivalence errors) | Silent wrong answers | Medium | Always show the generated SQL alongside results; encourage inspection; QUITE-style semantic checks as future work (§11.1). |
| **Hand-rolled SQL parsing fails silently** | Broken dialect guard, quiet corruption of trust | High if attempted | Don't attempt — use a real Postgres-dialect parser as a scoped lint (§11.1 stage 4, Appendix A.3). |
| **Tier-2 relay abused as a free CORS-bypass proxy** | Cost, abuse liability | Medium | Per-session rate limits on the Worker before public ship (§7.4). |
| **Workers AI shared free-pool exhausted under a traffic spike** | AI dead for *all* free-tier users for the rest of the UTC day, or uncapped spend on a paid plan | High under any traffic spike | Per-session daily Workers-AI quota + shared-pool-exhaustion UX + BYOK/local overflow (§11.2); §23.5 budget ceiling & kill switch. |
| **Unbounded Cloudflare spend / free-tier exhaustion under a traffic spike** | Whole edge dark at the Workers Free 100k-req/day cliff, or a silent overage bill on Workers Paid — first signal is a GitHub issue or a card charge | High under any traffic spike | §23.5: Workers Paid posture, declared monthly ceiling with billing alerts, per-endpoint kill switches, written response ladder; core product stays usable regardless (§4 edge-independent core). |
| **R2 persistence stores sensitive data** | Privacy/PII liability | Medium | Explicit action only, disclosure dialog, TTL + delete control, private-by-default links, size caps (§12.3). |
| **Personal-data template format rot** *(D30)* | Platform export schema changes silently break a template | High over time | Versioned templates that degrade gracefully to generic profiling on schema drift (banner, never a hard error); the generic engine always works (§14, §7.5). |
| **Structural inference wrong but confident** *(Studio arc)* | Wrong join graph → wrong dbt models, eroded trust | Medium | Confidence + evidence label on every inference, manual override everywhere (§20.6); dbt/semantic export generated only from the *user-accepted* graph, never from raw inference. |
| **Cross-browser DuckDB-Wasm compatibility** | Broken on Safari / older browsers | Low–Medium | Requires SharedArrayBuffer → COOP/COEP headers; document; test Chrome/Firefox/Edge; Safari best-effort. |
| **Device performance variance** | Slow on low-end laptops | Medium | Elapsed-time indicators on heavy ops; suggest reducing dataset if a query exceeds 5s; disable animation-heavy features if `navigator.hardwareConcurrency < 4`. |
| **ML training blocking UI** *(post-v1)* | Frozen interface | Medium | Dedicated ML Web Worker, cancel button, 30s hard timeout. |
| **Malicious dataset content executes in the UI (XSS)** | Session compromise; poisoned share links attack their recipients | Medium | All dataset-derived strings (cell values, column names, API responses) rendered as text, never HTML (§23.1); adversarial CSV fixture in the regression suite (§22). |
| **Tier-2 relay coerced into SSRF** (internal / cloud-metadata targets) | Worker becomes an attack proxy | Medium | Private-IP/localhost/link-local target rejection + rate limits before the v0.5 public ship (§7.4, §23.1); SSRF probes in the edge test suite. |
| **Supply-chain compromise (npm package or GitHub Action)** | Malicious code shipped to every user | Low–Medium | Committed lockfile, audit gate in CI, Actions pinned to commit SHAs, automated dependency PRs (§23.1). |
| **Manual dashboard changes drift from code** | Unreproducible prod; silent config loss | Medium | Terraform owns account resources with plan-on-PR (§23.3); dashboard edits to Terraform-owned resources are treated as incidents to reconcile. |

---

## 18. Success Metrics

### Performance targets (v0 + v0.5)

| Metric | Target | Measured on |
| :--- | :--- | :--- |
| DuckDB-Wasm cold initialization | < 3 seconds | Desktop Chrome, cable connection |
| CSV ingestion (50MB, ~500K rows) | < 2 seconds | Desktop Chrome, M1 MacBook Air |
| Parquet ingestion (50MB) | < 1 second | Desktop Chrome, M1 MacBook Air |
| Auto-profile generation | < 500ms after ingestion | Any supported dataset size |
| SQL query (simple aggregation) | < 100ms | Dataset < 1M rows |
| SQL query (complex join/window) | < 500ms | Dataset < 1M rows |
| NL→SQL round trip (cloud mode, incl. one retry) | Baseline at build time; streaming UI so perceived latency stays low | — |
| Total JS bundle (initial load, gzipped) | < 500 KB | Excluding lazy-loaded Monaco and DuckDB |
| Peak browser memory | < 512 MB | Datasets under 50MB |

(ML training targets moved to §20.1 with the deferred modules.)

**Local-model memory (D43).** An in-browser local model must coexist with DuckDB-Wasm inside the ~2GB tab ceiling (§4); whether that holds on a representative large dataset without OOM is one of the D43 spike's explicit kill criteria — no in-browser-local capability claim (or "local" harness number, §11.4) ships before it passes (§5.1, §11.2).

### Usage metrics & iteration loop (v0 + v0.5)

Lightweight product instrumentation — a handful of counters, not an analytics suite. Opt-in, anonymous, and hard-off in local-only mode: the zero-network-requests guarantee (§5.1, acceptance criteria below) always wins over measurement.

| Metric | What it tells us |
| :--- | :--- |
| Time to first chart (ingest → first rendered chart) | The core "fast to value" number |
| Insight acceptance rate (cards opened-as-chart ÷ cards shown) | Whether the deterministic feed (D10) surfaces things people actually care about |
| Export / share success rate | Catches silent failures at the exact point users extract value |
| NL→SQL self-correction rate (failed queries fixed within the retry cap) | Health of the §11.1 loop — measured in-product here, and against a ground-truth set (exec-rate/correctness/cost/repair-rate) by the dev/CI D40 eval harness (§11.4) |

Process: 5–10 rapid user tests per release cycle, then iterate on the top 3 observed pain points before adding new surface area.

**Return-signal note (v0.5 planning).** At v0.5 planning, add one crude return signal — **CDN repeat-visitor rate** — to the steering view: a note here, not new machinery (it reuses D25's content-free CDN counts), because D44's Drift Report makes retention a product goal and retention needs a visible needle. The steering-bar values below are unchanged.

**Reading these metrics as a shape (D60, §20.13 — deferred).** Assembling the counters above into a legible usage-shape view — funnel drops, ingest-path mix, whether users reach the ② moat — is deferred backlog work, trigger-gated on v0.5 shipping with the steering bars green (or an operator question the raw counters can't answer by hand). It is a *reading* layer over these already-decided signals and collects nothing new; that constraint is what keeps it inside the privacy identity (D41/D59).

### v0 success criteria — steering bars (D27)

Distinct from the usage metrics above (which are opt-in and local-mode-blind): these are **launch-outcome bars**, measured over the launch month **Oct 6 – Nov 6, 2026** using only D25's content-free signals (CDN visitor counts, tagged attribution arrivals, edge events, inbound conversations). Local-mode usage stays invisible by design; these are funnel proxies, chosen because they are the part an application or investor conversation needs.

| Signal | Month-1 bar |
| :--- | :--- |
| Launch reach | ≥ 10,000 unique visitors in launch week (CDN-level), or HN front page |
| Organic floor | ≥ 1,000 unique visitors/week by week 6, with landing pages indexing |
| Artifact travel | ≥ 50 arrivals via structure-report attribution links (D26) |
| Beachhead pull | ≥ 3 qualified inbound conversations from privacy-constrained teams ("can we use this for [regulated thing]") |

**Steering rule:** ≥ 2 of 4 → proceed to v0.5 as planned. Exactly 1 → fix the top observed pain (per the iteration loop above) before adding v0.5 surface. 0 of 4 → stop building and re-examine positioning (D22/D23) before any further phase work. The numbers are deliberately rough — they exist so the ship/pivot conversation has a referee.

### Functional acceptance criteria (v0 + v0.5)

Tier gating (D15): criteria touching AI chat, API ingestion, and save/share gate the v0.5 release; everything else gates the v0 ship.

- [ ] Dropping a CSV with mixed types (numeric, categorical, date, text) correctly classifies all columns and enables the appropriate modules
- [ ] Dropping a folder of mixed supported/unsupported files registers every supported file as its own profiled table, skips the rest with a single summary toast, and cross-table JOINs run in the playground (D13)
- [ ] Dropping a CSV with only numeric columns correctly disables Time Series and Categorical modules with clear tooltips
- [ ] Dropping a file > 100MB triggers sampled preview mode with a visible banner (not a crash)
- [ ] Dropping a non-supported file (.xlsx, .pdf, .zip) shows a clear, non-technical error message
- [ ] SQL auto-suggestions are contextually correct for the uploaded dataset's column names and types
- [ ] Insight feed: each bundled sample surfaces ≥ 3 correct, non-trivial insights, each showing its generating SQL and opening as a chart (D10); the feed renders identically in local-only mode with zero network requests
- [ ] Structure-report export (D20, §12.2): each bundled sample exports a self-contained HTML report that opens correctly from the filesystem with no network access, and a JSON export that round-trips the schema/profile metadata; neither contains data rows; the export works in local-only mode with zero network requests
- [ ] Personal-data template (D30/D57, while templates survive the D27 cut order): a *real* Spotify or Google Takeout export ZIP reaches its first rendered template chart in ≤ 2 minutes on a mid-range laptop, client-side ZIP extraction and template matching included; on schema drift it degrades to generic profiling with a banner, never an error dead-end
- [ ] AI chat: a deliberately typo'd question is normalized, generates valid DuckDB SQL, and a deliberately-broken query visibly self-corrects within 3 retries
- [ ] AI mode switch works: in local-only mode, **zero network requests occur after initial page load** (DevTools Network tab); in cloud mode, only the disclosed payloads leave (§5.1)
- [ ] Save/Share: the structure-only artifact is the pre-selected default and its stored object contains no data rows (D20); a full-dataset link round-trips a modified dataset on another device; delete control and TTL expiry both work
- [ ] Edge-independent core: with the edge origin blackholed (blocked/unreachable), ingest/profile/SQL/charts/insights remain fully functional, and each typed 503 (kill switch), 429 (rate limit), and AI-quota-exhausted response renders its friendly "paused/unavailable" state — never a hang or crash (§4, §23.5)
- [ ] Closing the browser tab releases all memory; no dataset contents remain in `localStorage`/`IndexedDB` (settings only)
- [ ] All bundled sample datasets load and profile successfully on a fresh page load

---

## 19. Development Phases (v0 / v0.5 / v1 — D15)

**Release cutline (D15, D70):** v0 = Phases 1–3 (local, deterministic, zero server surface — the first public ship, pulling forward the locally-relevant Phase-6 polish items: error boundaries, empty states, bundled samples, guided tour). **v0.25 = the Blueprint-forward opening + edge-warm synthesis → WebLLM handoff + BYOK (D70)** — a post-launch tier after Oct 6, curating a slice of the v0.5 AI work forward; does not touch the v0 cutline or the fixed date. v0.5 = Phases 4–6 (AI chat, connectivity, persistence, edge services). v1 = the Studio arc (Phases 7–9).

### Phase 1: Foundation *(v0)*
- React + TypeScript + Tailwind project (Vite)
- DuckDB-Wasm in a Web Worker, lazy-loaded, Cache API persistence
- File drop zone with format validation and tiered size detection
- **Folder drop / multi-file ingestion + table registry (D13, §7.5)** — aggregate memory budgeting across files
- **ZIP-archive ingestion (D30, §7.5):** client-side unzip (e.g. fflate) feeding the multi-file path — engine work for the consumer template channel (+1–2 days)
- CSV + Parquet ingestion (JSON in Phase 2)
- Schema classifier and capabilities broker (evaluated over all registered tables)
- Auto-profile dashboard (column cards, stats, null bars) per table
- **DSPS schema design (D31, §12.2):** the versioned DataScope Profile Spec is designed here alongside the interfaces-first work (D18) — it is the report's interface, not new scope on top of it
- **`QueryEngine` boundary (D49):** the D18 interfaces-first work defines a `QueryEngine` interface (execute / register / summarize); profiling, classification, insight generation, and DSPS emission are written against it — never against duckdb-wasm directly — at ~zero cost now and as the pre-work for the D51 desktop sidecar
- **Studio de-risk spike (D17, amended D24):** once the table registry exists, a 1–2 day disposable FK-containment/cardinality prototype against the e-commerce sample folder; findings recorded in §20.6, code thrown away. The spike now also answers *"is a thin productizable slice viable for v0?"* against D24's pre-written kill criteria: on the e-commerce sample it must recover all first-order FK joins (orders→customers, order_items→orders, order_items→products) with **≤ 1 spurious edge per 3 true edges** at default thresholds (precision beats recall); **ambiguity that wants a second spike is itself the kill signal** (no second spike in the v0 window); the slice must be demo-ready within a **2-week timebox** post-spike; and the inference pass must hold §18 performance on a 50MB multi-table folder (no full-table rescans breaching the <500ms-class interactions). Miss any one → the slice is cut and v0 ships without it (D24)
- **Deliverable:** drop a folder of CSVs → every table registered and statistically profiled → correct modules lit up

### Phase 2: SQL Playground + JSON *(v0)*
- Monaco Editor (lazy-loaded) with DuckDB column auto-completion
- Auto-query suggestion engine (contextual to classified columns) + guided task-shaped answers — trend / top-N by segment / period-over-period / outliers / cohort, one-click → query + chart (D53)
- Results grid with sortable columns and pagination + take-it-with-me export (grid → CSV/Excel, copy-SQL) (D53, §12.2)
- SQL → Chart auto-mapper (bar, line, scatter, KPI card)
- JSON/JSONL ingestion
- **Deliverable:** write and execute SQL; results as tables and auto-selected charts; a business analyst can get an answer and export it without typing SQL

### Phase 3: Chart Modules *(v0 — ship gate)*
- Time-series chart (granularity + moving average overlay)
- Correlation heatmap with drill-through scatter
- Distribution histogram + box plot with configurable bins
- Categorical frequency bar + donut
- Insight feed (D10): rule-based observations over the profiled dataset, ranked, each with generating SQL and open-as-chart
- **Structure-report export (D20, §12.2):** one-click client-side export of the structure report (self-contained HTML + JSON) — the v0 shareable artifact, zero server surface
- **Join Graph (beta) (D24):** confidence-labeled FK-candidate detection via containment + cardinality across registered tables, evidence on every edge, manual override everywhere (the §20.6 trust rules), rendered as a simple interactive graph. Explicitly **beta**; no fact/dimension classification and no dbt export (those stay Phases 8–9). Built to the D24 kill criteria; a no-graph fallback demo variant is maintained in parallel from day one, so cutting the slice changes one demo scene, not the date
- **DSPS + "Copy for AI" (D31, §12.2):** the report's third renderer — an LLM-optimized context block with zero raw rows, degrading to schema-only if the Join Graph slice is cut
- **Consumer templates + pages (D30):** the two Personal-Data templates (Spotify, Google Takeout) + `/spotify` and `/google-takeout` landing pages, shipped but unmarketed (§14, §24); ZIP ingestion (§7.5) is the enabling engine work
- **Dataset Dossier assembly (D48, §13):** the post-ingest folder-level landing view — tables × rows, join-graph thumbnail (when the D24 slice lives), quality flags, time coverage, top insights (D10), suggested next steps, one-click report export (D20) — packaged from the existing v0 modules (~3–5 days of UI assembly, not new engine work); it absorbs most of the guided tour. **Internal cut line: degrade to the per-table profile view** (the cut lives inside the feature, never the date, D27). In v0 there is no sensitive-columns row — the D46 detector is v0.5, and positives-only means silence, not an all-clear
- **Universal `.dsps` receiver — v0 stretch (D62, §13.1):** the Dossier's read-only mode over a handed `.dsps` — zero new server surface, a read path over the existing artifact. Ships in v0 **only if trivially cheap**; otherwise it is an early-v0.5 item. Internal cut line: degrade to rendering the §12.2 HTML report output — never the date (D27)
- **Report design pass + attribution footer (D26)** and **edge/CDN counters flowing (D25)**
- **Analyst-completion surface (D53, §10 Module 7 / §12):** the Pivot / cross-tab surface (no-SQL drag-to-`GROUP BY`, generated SQL shown; internal cut line to a guided GROUP-BY builder), chart → PNG/SVG export for decks, and the reproducible transform-recipe export. The pivot's full UI sits **above** the Join Graph in the cut order (cuttable to protect the date; the graph stays last-cut, D27); the exports and guided answers (Phase 2) are near-free
- **Deliverable:** all chart modules light up correctly per the capabilities broker; each bundled sample surfaces ≥ 3 correct insights and exports a self-contained structure report; the Dataset Dossier lands the folder as the post-ingest overview; the Join Graph (beta) assembles on the e-commerce sample and the "Copy for AI" block copies with zero raw rows; a business analyst can pivot the e-commerce folder and export the result to Excel without writing SQL

**v0 ship gate — additions to D15's cutline** (date fixed Oct 6, scope flexes; cut order below):

| New gate item | Source |
| :--- | :--- |
| Join Graph (beta) — confidence-labeled, override-everywhere, D24 kill criteria | D24 |
| Dataset Dossier — post-ingest folder overview; internal degrade-to-per-table-profile cut line (never the date) | D48 |
| DSPS schema (Phase 1) + "Copy for AI" block (zero raw rows) | D31 |
| Two Personal-Data templates + `/spotify` + `/google-takeout` pages + ZIP ingestion | D30 |
| Structure-report visual design pass + tagged attribution footer | D26 / §24 Play 4 |
| Analyst-completion surface — pivot / cross-tab (no-SQL), chart→image + transform-recipe export, guided task-shaped answers; pivot has an internal cut line to a guided GROUP-BY builder | D53 |
| Kill-the-wifi demo: rehearsed live script (+ no-graph variant) + recorded 40s video | §24 Play 1 |
| Three intent landing pages live — `/schema-diagram`† + `/csv-profiler` + `/ai-context` (`/parquet-viewer` kept only as a cheap extra, cut-order item 3) | §24 Play 3 |
| Edge counters for product events + CDN visitor counts flowing | D25 |
| Launch narrative + samples targeting privacy-constrained users | D23 |
| **Launch date: Tuesday, October 6, 2026 — fixed; scope flexes** | D27 |

† `/schema-diagram` falls back to `/parquet-to-csv` only if the Join Graph (beta) slice is killed on its own D24 kill criteria (the graph is last-cut, D27) — never a schedule-driven swap.

**Cut order (date fixed, scope flexes, D27 — re-ranked 2026-07-12):** (1) consumer templates + pages, (2) guided-tour polish beyond the D15 minimum, (3) extra landing pages, (4) Join Graph slice — **last-cut, and only by its own D24 kill criteria** (quality, ambiguity, timebox, performance), never merely to save schedule while lower-differentiation items survive. The no-graph demo variant is maintained in parallel from day one.

**Analyst-completion cut placement (D53).** The pivot's full drag-and-drop UI is cuttable *above* the Join Graph — it degrades to the near-free guided GROUP-BY builder (reusing Module 2's engine), so the graph stays last-cut and the date stays protected. The take-with-me exports and guided task-shaped answers are near-free extensions of surfaces already in Phases 2–3 and are not expected to be cut. This adds the analyst surface to the cut order without altering D27's row or its date-safety.

**Sequencing note (D42):** re-sequencing a thin AI/MCP slice into v0 was reviewed and **rejected** (2026-07-12) — it would edit settled D15 and load the fixed date. The launch-moment AI signal is the already-v0 "Copy for AI" renderer (D31); the AI chat pipeline and the D38 MCP surface stay v0.5+ (Phase 4, §11). Not re-litigated without founder instruction.

**Build sequencing (D67): demo-spine first, not phase-complete layers.** Within these settled phases, build the launch-demo **spine** end-to-end before filling breadth around it — **drop → profile → Join Graph → one offline query → Dataset Dossier → "Copy for AI" / structure-report export** — the single critical path shared by all four §24 plays (Play 1 kill-the-wifi, Play 3's three landing pages, Play 4's travelling artifact all ride it). Two consequences: **(a)** the spine working end-to-end (rough is fine) is the **first integration milestone**, ahead of completing Phase 2's chart auto-mapper breadth, so an impressive demo exists weeks before Oct 6 rather than assembling in the final sprint; **(b) inside Phase 3, build the differentiators first** (Join Graph D24 → Dataset Dossier D48 → DSPS / "Copy for AI" D31 → structure-report export D20) **before** the commodity chart suite (correlation / distribution / categorical) **and** the pivot / cross-tab UI (D53) — this already matches the cut order above (Join Graph last-cut; the pivot cuttable above it); the phase prose merely happens to list the chart modules first. This is a build-order emphasis only — no scope, release-tier, date, or cut-order change (clears §24.5 / D42).

---

### The Workbench adoption: W0–W8 *(parallel shell work, flag-gated — D71, §13.3; ship-timing = the open §9.1 call at W8)*

Built as a parallel composition root behind `WORKBENCH_ENABLED` — main stays shippable every day; the current shell (§13.0) is untouched until cutover. Each phase is one build-order leaf (`build/12-workbench/`), one committed increment. Modules, stores, services, workers, and the whole edge tier are shared between shells; the migration seam is the single nav facade (`openDestination` — §16). **No `src/` code for this redesign starts until the fold → tree → build-leaf sequence has landed.**

| Phase | Deliverable | Depends on |
| :--- | :--- | :--- |
| W0 | Tab contract + tabs store + nav facade (flag-off, invisible) — envelope invariant tested (§13.3/D55) | committed baseline |
| W1 | Workbench scaffold: grid shell, act assembly (pure-skeleton tests, §13.3), crude tab host | W0 |
| W2 | Left explorer (grown from `TableList`) + shell-wide selection store | W1 |
| W3 | Tab model maturation: singletons/artifacts, **keep-mounted-first preservation (per-type calls by manual test)**, pinning | W1 |
| W4 | The dataset map (ERD + Blueprint face + **Verdict band**) — auto-layout spike first, timeboxed | W2, hallmark brief ✓ |
| W5 | Options strip (subject-scoped filter, disabled-with-reason) + command palette — **hard gate: palette reaches every feature home** | W3, W4 |
| W6 | Acts 0–2: welcome page + **AI defaults per the §5.1 switch model** (off-by-default, capable-device WebLLM pre-select, Configure-workspace; no forced gate) | W1, hallmark brief ✓ |
| W7 | Right AI pane (switches + audit trail), bottom inspector, status bar consolidation (density budget) | W2, W3 |
| W8 | Viewer mode; **cutover: §9.1 decided, flag default flip, soak, old shell + §13.0 deleted (master-first)** | all |

Per-phase DoDs live in the `build/12-workbench/` leaves. W3's preservation contract is **switch-away/switch-back preserves state for every tab type**; a serialization round-trip gate exists only for the tab types that *opt into* restore-from-spec — full tab-list serialization is deferred to the D61 hosted-tier round (§13.3). W8's gate is the §13.0/§6-inventory row-walk: every capability reachable in the Workbench, no orphaned exports, suite green.

### v0.25: Blueprint-forward opening + edge-warm synthesis → WebLLM handoff + BYOK *(post-launch tier, D70)*

A named tier shipped **after** the v0 Oct 6 launch and **before** v0.5 — a curation of already-decided AI work (D2/D43/D56) around one UX thesis: the app **opens on the informative Dossier-forward "Blueprint," not the mechanical sidebar flow.** Never touches the v0 cutline or the D27 date.

- **Blueprint-forward opening (D48/D68/D69, no new engine):** the Dataset Dossier / D68 Verdict is promoted to the primary post-ingest surface — schema + inferred relationships + the D69 intelligence-layers (profiling / heuristics / AI-synthesis) as the opening view — assembled through the D55/D68 ViewSpec over shipped v0 modules; the D68d "skip to data" escape hatch stays for the §2 second audience
- **Cloudflare-edge AI synthesis (warm start):** a Worker emits the initial dataset-synthesis narrative + suggested explorations quickly, covering WebLLM's model-download cold-start — the **D56 async "tailored this view" upgrade, never on the first-paint path**; the deterministic Verdict paints first and is the whole surface with AI off (D2/D28). **Opt-in, structure-only (DSPS facts, never rows), stateless pass-through (D9), never stored (D59); local-only mode never calls the edge (D2)**
- **WebLLM client handoff (the new architectural commitment):** in-browser WebLLM/WebGPU downloads and warms in the background, then takes over the NL/conversational surface **fully client-side, zero egress**. The **D43 spike passed (GO, 2026-07-21; ADR-007)** — kill criteria (DuckDB-Wasm memory coexistence, SQL-quality floor vs. cloud, download UX) cleared within four recorded constraints, the D40 eval still gating any comparative local claim; the edge/BYOK path remains the conversational engine and WebLLM is progressive enhancement over it. **Consent-gated download (human decision, 2026-07-22):** the ~830 MB model is never pulled silently — eligible sessions (AI mode chosen, no BYOK key, WebGPU present) are asked once; accept runs the resumable background download with a progress bar, decline keeps the quota'd free tier serving, and a BYOK key suppresses the handoff (the user's own provider serves). Serving honors the same gate: turning the local model off in settings stops it serving even while warm; local-only mode never serves it (D2)
- **BYOK:** bring-your-own-key pulled forward from v0.5 — D2 mode (c) / D3 "prefer my key" / D9 stateless-pass-through custody, no new custody design
- **Deliverable:** drop a dataset → the Blueprint opens with a deterministic Verdict, an edge-warm synthesis resolves as an upgrade badge, WebLLM then serves conversation client-side, and a BYOK key routes per the D3 toggle — every AI surface degrading cleanly to deterministic when AI is off, down, or uncached
- **Eval note (D40/D56):** the edge/WebLLM synthesis is eval-gated like any AI producer — a labeled-set check that the composed view beats the deterministic one gates the *feature*, never the tier; failing it leaves the deterministic Blueprint as the product at zero cost — **gate run and passed for the edge synthesis (2026-07-22, staging):** thresholds declared at harness build (headline-win ≥ 80% and actions-upgraded ≥ 80% over a labeled item per §14 sample dataset, built by the product's own profile → insight → Verdict pipeline and scored through the product client's seam validators), measured **100% / 100% (5/5 · 5/5)**; live cost **~14 neurons per synthesis call** (Workers AI `usage.neurons`, Mistral Small 3.1)

### Phase 4: AI Chat (NL→SQL) *(v0.5)*
- Pipeline stages 1–6 (§11.1): input normalization, schema-pruned prompts, generation, dialect lint (real parser), execute-fail-retry loop (cap 3), auto-chart reuse
- Transcript auditability: suggested SQL always visible, per-attempt execution log inline (§11.1)
- Edge AI router: Workers AI default, BYOK vault + "prefer my key / free tier first" toggle
- Three AI modes wired into settings (local-only / local model / cloud); disclosure UI incl. metadata-only-repair toggle
- **Deliverable:** plain-English question → SQL → chart, with a visibly self-correcting failure case; mode switching verified against the Network tab
- **Eval gate (D40, §11.4):** the dev/CI NL→SQL eval harness (curated ground-truth set over the §14 samples) must clear its declared exec-rate / result-correctness / cost / repair-rate thresholds before this phase ships — a v0.5-only gate that never touches the Oct 6 v0 date (D27)
- **Process note:** build and verify one pipeline stage at a time — do not paste a mega-prompt and trust the output (Appendix A.5)
- **Prosumer-flow note (D33):** the consumer NL→SQL flow needs no new architecture — it is §11.1/D2/D9 exactly (LLM sees schema + question, never rows; SQL runs locally; BYOK stays in-browser). Templates (D30) make the LLM *unnecessary* for common questions (D10's deterministic feed, extended per-platform); DSPS (D31) makes it *surgical* for the tail. The LLM is a scalpel, not a chainsaw — consumer-facing polish of this phase, nothing more

### Phase 5: Connectivity & Persistence *(v0.5)*
- API ingestion Tier 1 (direct fetch) + Tier 2 (CORS relay) with pagination + telemetry
- "Refresh from source" button; per-session relay rate limits
- Client-side Parquet export/download
- R2 save/share links with disclosure, TTL + delete, private-by-default, size caps; **structure-only artifact as the default share, full-dataset as labeled escalation (D20, §12.3)**
- **Likely-sensitive-column nudge in the share flow (D46, §12.3):** deterministic detection surfaces likely-personal-data columns inside the share flow, **positives-only**, framed as *reducing oversight risk* — never a "none found" all-clear
- **Token / no-auth API connections (D34):** GitHub (PAT) and Lichess/Chess.com (public APIs) on the unchanged Tier 1/2 machinery (§7.4); OAuth platforms stay a separate v1 decision
- **Consumer template format documented + opened to community contribution (D30)** — 1 day
- **Claimable share links re-evaluated at v0.5 planning (D29)**, alongside the hosted-share build
- **Deliverable:** pull an API into a table, transform it, download it, and share a structure-only link that works on another device

### Phase 6: Polish & Hardening *(v0.5 — locally-relevant items pull forward to the v0 ship, D15)*
- Dark/light theme toggle; responsive tablet/desktop layout
- Loading states, error boundaries, empty states for every module
- Performance optimization (virtualized grids for 10K+ row results)
- Large-file fallback enforcement; manual column re-classification override
- Cross-browser testing (Chrome, Firefox, Edge; Safari best-effort)
- Bundled sample datasets in `/public/samples/`
- In-app guided tour: one-click reproduce demo over a bundled sample (ingest → profile → insight → chart), dismissible, re-runnable from Learn (§13)
- **Deterministic narration (D65, §12.2/§13.1):** template-filled plain-language findings over the D10/D45 facts, no LLM in the loop, D45-compliant phrasing — surfaced in the Dossier and the exported report; re-frames the D54(b) findings narrative as deterministic-first, optional AI polish layered later under D56-style gating
- **Universal `.dsps` receiver (D62, §13.1)** — lands here if it did not make the v0 stretch cut; the Dossier's read-only mode over a handed `.dsps`, zero new server surface
- **Format-first inversion — published DSPS artifacts (D64, §6/§12.2):** a published JSON Schema + a small npm validator/parser library over the already-shipping DSPS spec (riding the D45 v0.5 DSPS-spec work), so third-party tools consume DSPS without our source; spec-first discipline, no new server surface
- **Approval-kit provenance (D63, §23.2/§24.4):** published build provenance (bundle hashes + SLSA-style attestation on `/security`, D50) and the design round for signed `.dsps` — mostly CI discipline and publishing, near-zero app code

**v0.5 first post-launch ship — Drift Report (D44, §20.8).** The aggregate Drift Report (re-drop a newer version of an already-profiled dataset → rows added/removed, per-column %-changed, null/cardinality drift, PSI/KS distribution shift, matching keys inferred, folder-aware, aggregate-only) ships as the **first post-launch feature**, ahead of the rest of Phase 7 — the retention mechanic and pillar #2 of the structure × time arc (D52). Phase 7 later absorbs it as one section of the quality report.

**Post-v0.5 platform ladder (D61).** The surface-investment sequence after v0.5 is chartered: **browser (v0/v0.5, shipped) → hosted tier → desktop (D51) → the rest on request.** The **hosted tier** is the D39 opt-in staging/server-side-execution tier promoted to the chartered second platform rung and named the commercial arc (§20.10); its **design round is anchored at the v0.5 close** — it gates build, fixes custody/disclosure/cost ceilings and the D61 privacy-and-deletion promise (§5.2), and is where D36's pricing revisit lands. **Desktop (D51) re-sequences to rung 3, after the hosted tier ships**, with the single retained exception that an air-gap design-partner ask may pull it early (§20.9/§24.4). **"The rest on request"** — the D49 CLI/CI surface keeps its demand gate (the "pull the CLI forward" proposal was reviewed and rejected, D61), and Excel add-in, Slack/Teams, VS Code, and Python-library surfaces are on-request-only. None of this touches v0 scope or the Oct 6 date (D27), and the hosted tier is never the default or part of launch identity.

---

### The Studio arc (v1 — Phases 7–9, D12)

v0 + v0.5 ship a complete product; these phases turn it into DataScope Studio. Each is a full phase-sized effort, sequenced after Phase 6 and gated on the §18 acceptance criteria holding. Everything below is deterministic and SQL-derived unless explicitly marked AI-assisted — the whole arc works in local-only mode.

### Phase 7: Data-Quality Report — "Lighthouse for data" (D14, design §20.8)
- Engineer-facing diagnostics built over the §8/§10 profiling substrate: null heatmap (column × row-block), duplicate detection (full-row + candidate-key), skew/outlier flags, cardinality profile
- Composite data-quality score with per-dimension sub-scores (completeness, uniqueness, consistency, validity) — every component backed by visible SQL
- Schema-drift comparison: re-ingest a newer file of the same dataset → column diff + distribution-shift detection
- Self-contained HTML/Markdown report export
- **Score-as-noun commitment (§24 Play 2):** the composite quality score is designed to be *screenshotted* — color rings, a repeatable name, a later content series ("NYC Taxi scores 61. Here's why"). A Phase-7 (v1) forward commitment, not v0 scope; the only v0 obligation is that the structure report adopts the same visual-design language so the brand is continuous when the score arrives
- **Deliverable:** drop an unfamiliar dataset → a quality report an engineer would paste into a PR

### Phase 8: Relationship Inference & Schema Graph (D11, design §20.6)
- **Starting point (D24):** inherits the v0 Join Graph (beta) rather than starting from zero — it hardens confidence-labeled FK detection into full key detection, entity inference, fact/dimension classification, and dbt export
- Key detection (PK candidates from near-unique Identifier columns); FK discovery via cross-table containment + cardinality analysis
- Entity inference: cluster columns/tables into candidate business entities (customer, order, product…)
- Interactive ER-style schema graph — every edge carries confidence + evidence, every inference manually correctable
- Fact/dimension classification (row count, FK-richness, additive-measure detection)
- Cryptic-column decoding (optional, AI-assisted via the §11.2 modes; skipped in local-only)
- **Deliverable:** drop a folder of related Parquet files → correct join graph with fact/dim labels, zero configuration

### Phase 9: Semantic Model & dbt Export (D11, design §20.6)
- Star-schema proposal with one-click materialization (`CREATE TABLE AS` via the §10 transformation layer)
- dbt project export: staging models (renames/casts), dimensional models, `schema.yml` with descriptions + `not_null`/`unique`/`relationships` tests inferred from profiling stats
- Semantic-model export: entities, relationships, measures, dimensions as a portable artifact (the schema half of §20.5's Context Bundle)
- KPI suggestion from the measures × dimensions grid, pre-wired into the chart modules
- Interactive schema documentation view, linked to the graph
- Optional GitHub handoff: commit the exported dbt project to a user repo (user-supplied token, explicit action; zip download stays the default path)
- Companion "how-to" notebook showing the dbt export → `dbt run` flow against the exported project
- **Deliverable:** folder of Parquet in → reviewed semantic model + runnable dbt project out

### v1 — consumer-rail additions (beside the Studio arc)

The consumer twin of the Studio arc, sequenced in v1 but gated on consumer-channel traction, not automatic:

- **Cross-platform combination templates (D35), gated on D30 traction.** The genuinely unanswerable-elsewhere questions (sleep × training, music × location, GitHub × calendar) are "just SQL" over already-registered tables — *except* that personal data joins on **time**, not foreign keys. Required utilities: a unified-timeline representation, timestamp normalization, timezone repair (exports disagree wildly), and windowed time-joins — the Join Graph's consumer twin, built only once single-platform templates demonstrate pull (§24, wave 3).
- **OAuth-platform connection decision (D34).** Strava / Spotify / Fitbit connections — per-platform app registration, redirect handling, client-secret custody in the vault, ToS review (note: Strava's 2024 terms restrict this) — decided here, not a §7.4 freebie.

### Post-Studio backlog (in rough priority order)
1. ML modules (§20.1) — designed, waiting on core tool
2. Tier-3 credential-vault ingestion for secret-key APIs (§20.2)
3. XLSX (SheetJS) and SQLite attach (§7.1)
4. Context Bundle export / Structured Knowledge Engine remainder (§20.5) — the insight/history half; the schema half ships in Phase 9
5. `httpfs` bucket-first workbench mode (§20.3 rung 1) — read Parquet directly from R2/S3-compatible storage without passing through browser memory; the DuckDB-ecosystem play from §3.3
6. Platform expansion — iPad/iOS and PWA (§20.9) — responsive web for tablet; PWA install-to-home-screen; future native iOS if demand warrants
7. Live-DB hybrid bridge (§20.3) — only on a concrete trigger
8. Off-the-pace / F1 integration (D7, §20.7)
9. Temporary cloud staging for >500MB files (D16, §7.3) — R2 presigned PUT + lifecycle-rule TTL; **revived by D39** (opt-in staging + a deferred server-side-execution design round, v1+), so this item is now scheduled rather than purely demand-gated

*Backlog note (D26, §24):* the synthetic-replica share (§20.11) keeps its post-Studio sequence but is now tagged the **venture headline demo** for design-partner conversations — the runnable-fake-data share a partner remembers; its de-risking spike may pull earlier if those conversations warrant.

---

## 20. Deferred & Future Work

### 20.1 ML modules (designed, deferred per D1)

All ML runs in-browser (ml.js + Transformers.js), trained on DuckDB query results, in a dedicated Web Worker. Capability flags already exist in the broker (§9). Original performance targets: K-Means (10K rows, 5 features) < 2s; regression fit (10K rows) < 500ms; tree training (10K rows, 5 features) < 3s; K-Means animation > 30fps under 5K points.

**K-Means Clustering** (`ml-kmeans`) — requires 2+ Quantitative. X/Y feature dropdowns, k slider (2–8). Animated scatter with step-by-step centroid movement to convergence; elbow chart (inertia for k=2..8). Educational panel explains the assign/recompute loop.

**Linear & Polynomial Regression** (`ml-regression`) — requires 2+ Quantitative. X/Y selection, linear vs polynomial (degree 2–3). Scatter with fitted line/curve, equation display, R² gauge, residual plot. Educational panel explains R² and least squares.

**Decision Tree Classifier** (`ml-cart`) — requires Categorical target + features. Target/feature pickers, max-depth (2–10) and min-samples-per-leaf sliders. Interactive D3/SVG tree (split condition, sample count, class distribution, Gini per node), hover-to-highlight data flow, confusion matrix, accuracy badge. Educational panel explains Gini impurity and overfitting (train vs test).

**Zero-Shot Text Classification** (`@xenova/transformers`, quantized BART/MobileBERT in a Web Worker) — requires 1+ Textual. Custom labels, sample size (10/50/100 rows). Prediction table with confidence, label distribution bar, per-label word cloud, latency metrics. On-demand model download (~30–80MB) with explicit consent, progress bar, aggressive caching, "Skip NLP" option. Educational panel explains zero-shot classification.

### 20.2 Tier-3 credential vault for data sources (D4)

Design in §7.4. When revived: opt-in, clearly labeled ("this source requires storing your API key server-side") — this is a *second consumer* of the BYOK vault, so the build cost is small; the decision is a product/disclosure one, not architectural.

### 20.3 Live database connectivity (D6 — researched and deferred)

**Finding: direct connection is impossible.** Browsers have no raw TCP socket API (only HTTP(S)/WebSocket/WebRTC); Postgres/MySQL wire protocols are raw TCP; DuckDB's `postgres_scanner`/`mysql_scanner` need a real socket. This is a browser sandboxing wall, not a DuckDB limitation that will be patched.

If ever revisited, the viable path is a hybrid-execution ladder:
1. **Static snapshot** — batch export → Parquet on object storage → `httpfs` reads directly. Zero backend at query time.
2. **Faster refresh** — same shape, shorter export cadence.
3. **On-demand live bridge** — thin serverless endpoint runs the query against the live DB, serializes as Arrow IPC; browser calls `insertArrowFromIPCStream()` into a local table and joins client-side against already-loaded static data.
4. **True streaming/CDC** — WebSocket relay appending row deltas. Architecturally close to MotherDuck's `ATTACH 'md:...'`, but that's DuckDB-to-DuckDB-cloud, not Wasm-to-arbitrary-Postgres.

**Revisit trigger:** a concrete need for current-transaction-state data that periodic Parquet export can't satisfy. Until then, the "Refresh from source" button (§7.4) covers the realistic demand.

### 20.4 XLSX / SQLite

XLSX via SheetJS (+300KB gzipped, hence deferred); SQLite via DuckDB attach. Both post-MVP (§7.1).

### 20.5 Structured Knowledge Engine evolution

The longer-term thesis: DataScope evolves from "upload → explore → SQL → charts" into a deterministic system that converts raw data into structured knowledge.

- **Enhanced profiling:** beyond column types — semantic roles (ID, label, timestamp, metric), missingness patterns, distribution shape, anomaly flags. Two maturations named in the 2026-07 ideation round and deferred here (no decision carried): **units/currency detection** (a micro-feature — recognize `$`/`€`/`%`/unit suffixes and tag columns accordingly) and **time-series seasonality detection** (a §10 Module 3 maturation — weekly/monthly/annual periodicity surfaced as a profiling finding; **still deferred, not carried by D69** — a two-point "January bump" on sparse data is a confident-wrong statistical finding, and the deferral implies periodicity rigor the folded heuristics layer does not have).
- **Transformation compiler:** the §10 transformation layer matured into named, repeatable CTE pipelines and feature-engineering layers — DuckDB-Wasm as an in-browser transform engine.
- **Deterministic insight layer:** rule-based, not LLM-first — statistical summaries and SQL-derived observations ("Top 10% customers generate 72% of revenue", "Category X is 3.4× more volatile", "Missing values concentrated in column Y"). *The v0 seed ships as Module 1's insight feed (D10); this is its maturation: a richer rule library, cross-table insights, and better interestingness ranking.* **The matured rule library is formalized as `HeuristicFinding` (D69, v0.5):** a `detectHeuristics()` pass over the profiled tables that is **one pipeline with D10, never a parallel path (D58)** — it shares D10's rule table and its interestingness ranking (effect size × coverage) and feeds the existing `rankNextActions` (D68a), never a second generator with its own confidence scale. Every `HeuristicFinding` carries a **mandatory `sql` field** (the query that produced it, per D10) and a **D45 `FactRef` snapshot** (facts stated as-of-snapshot); confidence is the computed D10 interest score, not a bare high/medium/low enum. **FK candidacy is not re-derived here** — its single owner is the D24/§20.6 containment + name-agreement grammar (structure-only matches render dashed, never confident, per the §20.6 spike finding), so the heuristics layer emits no independent FK finding; seasonality likewise stays deferred above, not carried by D69.
- **Context Bundle export:** instead of a bare CSV, export a bundle containing raw tables, transformed tables, SQL history, insights, schema metadata, chart specs, and derived features — the bridge to a downstream context-consuming tool ("ContextLab"). *The schema half of this (entities, relationships, measures, dimensions) ships earlier as Phase 9's semantic-model export; what remains here is the insight/history half.*

### 20.6 Semantic modeling engine (D11 — design detail; **scheduled as Phases 8–9, §19**)

The "understand an unfamiliar dataset in minutes" pillar: instead of answering questions about raw tables, reverse-engineer the business model behind them. This is the piece that extends DataScope from ad hoc analysis into analytics engineering, and the least crowded part of the landscape — per D12 it is now the product's headline, not an extension (§3.3). Phase sequencing lives in §19; this section holds the design.

- **Entity inference.** Cluster columns into candidate business entities (customer, order, product, region…) using the classifier's output (§8), column-name heuristics, key detection (near-unique Identifier columns), and cross-table value-overlap analysis.
- **Relationship discovery.** Candidate PK/FK pairs found by containment and cardinality analysis across ingested tables; rendered as an ER-style graph the user can correct.
- **Star-schema proposal.** Identify fact-table candidates (high row count, FK-rich, additive measures) versus dimensions; one-click "materialize" generates the `CREATE TABLE AS` statements against the session via the §10 transformation layer.
- **dbt export.** Emit the accepted proposal as dbt-style models: staging models (renames/casts), dimensional models, and a `schema.yml` carrying column descriptions plus `not_null`/`unique`/`relationships` tests inferred from the profiling stats.
- **KPI suggestion.** Propose metrics from the measures × dimensions grid ("revenue by month by region"), each backed by generated SQL and pre-wired into the chart modules.
- **Confidence everywhere.** Every inference carries a confidence label and its evidence ("87% of `order.customer_id` values appear in `customer.id`"), and is manually overridable — the same override philosophy as the column classifier (§17).
- **Cryptic-column decoding (optional, AI-assisted).** Guessing what `rev_final2` or `tmp_4` mean is the one step that genuinely benefits from an LLM; it routes through the standard AI modes (§11.2) and is simply skipped in local-only mode. All the structural inference above is deterministic and works fully offline.

**Sequencing (updated per D12/D13):** promoted from backlog to scheduled — Phases 8–9 in §19. It still comes after the foundation tiers because it needs the transformation layer exercised and profiling trustworthy first; its other prerequisite, multi-table ingestion, is now v0 scope (D13, §7.5).

**De-risk (D17):** the containment/cardinality mechanism is validated by a 1–2 day throwaway spike in Phase 1 (§19) against the e-commerce sample folder — early evidence on whether zero-config join graphs hold up on real key patterns. Spike findings are recorded in this section as they accumulate. **Why at all:** it shifts the value proposition from "ask questions about your CSV" to "hand me a dataset I've never seen and get a semantic model back," which no chat-with-CSV clone offers — this is the identity claim of D12.

**Spike verdict (2026-07-12) — GO, with confidence gated on name agreement.** The D17 throwaway spike (Python + native DuckDB; pairwise unary FK candidates, KMV-sketch containment pre-filter → exact **row-weighted** verification, explainable feature scoring; one frozen config across every corpus) returns a **GO** against pre-written pass/fail bars, run on the synthetic e-commerce folder (the D24 sample, 4 true edges), TPC-H sf 0.1 (9 edges), programmatic mess degradations, and TPC-DS sf 0.1 (24 tables / 425 cols, scale observation). Results: **clean recall 4/4 and 9/9, all confident; zero confident false edges across all 15 cases; precision within the ≤ ⅓-spurious budget everywhere; performance 0.7 s / 0.35 GB on TPC-H and 3.0 s / 0.65 GB on 24-table TPC-DS** (native single-thread; the browser-WASM target keeps ~2–4× headroom under the 1.5 GB / sub-minute budget). Mess variants — 30 % nulls, 5 % orphans, both-sides string coercion — hold full recall; the 20 %-orphan and column-rename variants degrade to **dashed candidates** (found, not confident) exactly as pre-named; zero-padded-string-vs-int keys fail as the pre-committed expected loss, mitigated by a type-normalization pass.

**The load-bearing finding is not a number — it is the confidence boundary.** Containment + coverage *cannot* separate a real renamed FK from a coincidental dense key: a synthetic `session_id` drawn uniform over the customer-id range fully contains *and* covers `customers.id` — with *higher* coverage than the genuinely-renamed real FK. So the **confident tier requires a column-name link to the target; structure-only edges are surfaced as dashed candidates with their evidence shown, never as confident edges.** Consequence for D24/§13.1: the Join Graph is a **solid graph where FK names echo the parent** (the common real-world case — `customer_id → customers`, `l_partkey → part`; TPC-H is 9/9 confident) and **honest dashed candidates otherwise** — never silently dropped, never confidently wrong. This is precisely the "evidence + confidence on every edge, override everywhere" rule above and in D24, now with a demonstrated basis for what earns *confident*. It sets the copy for the Dossier's join section (D48/§13.1) and confirms the 2-week D24 slice is buildable; it does **not** revise D24 or D27 (the graph stays last-cut, cuttable only on its own kill criteria — the spike clears the quality / ambiguity / performance ones). Build-spec carry-overs: ship the two-tier UI (solid = name-agreeing, dashed = structural) as tested; add the pre-matching type-normalization pass (BAR-5); surface the ambiguity runner-up + score gap as evidence; expose row-weighted containment as the §20.8 orphan-rate quality signal. *(Disposable harness + full bar-by-bar verdict archived in the spike scratchpad. The corpus is synthetic with total known truth, so the verdict rests on perfect clean recall + zero confident-false + comfortable performance + a named, honest confidence boundary — not on having erased every trap; real dirty exports may surface unmodeled cases.)*

**The D24 slice boundary is capability-based, not fidelity-based.** What the v0/v0.5 Join Graph slice defers to Phases 8–9 is §20.6 *capability* — entity / fact-dimension classification, star-schema proposal, dbt export — not visual richness. A richer rendering of the *same* solid/dashed D24 edges (column-level, expandable) introduces no new §20.6 semantic capability and so does not by itself cross the Phase-8 line; scope creep is a new capability crossing (against the D15 cutline / D27 date), never a denser rendering of already-decided edges.

### 20.7 Off-the-pace / F1 integration (D7)

Deferred until the core tool works. DataScope is a separate app in its own repo; the F1 warehouse would eventually be just another ingestible source (its Parquet marts are already httpfs-readable).

### 20.8 Data-quality report — "Lighthouse for data" (D14; **scheduled as Phase 7, §19**)

The engineer-facing maturation of the auto-profile dashboard (§10 Module 1) and insight feed (D10): less BI, more diagnostics. Deterministic and SQL-derived throughout, so — like the insight feed — it works identically in local-only mode with zero network requests.

- **Quality score.** Composite 0–100 with per-dimension sub-scores: *completeness* (null rates weighted by column role — a null metric hurts more than a null free-text field), *uniqueness* (duplicate rows, candidate-key violations), *consistency* (mixed formats within a column, casing variants, stray whitespace), *validity* (values outside plausible type/range bounds). The formula is visible and every component clicks through to its generating SQL — a number an engineer can defend, not a black box.
- **Null heatmap.** Column × row-block missingness grid. Reveals structural patterns a per-column percentage hides (nulls concentrated in a date range or one source file) — the insight feed's null-pattern rule, matured.
- **Duplicate detection.** Full-row duplicates plus near-duplicates on candidate keys ("412 rows share `order_id` but differ in `amount`").
- **Skew & outliers.** Distribution-shape flags per quantitative column (skewness/kurtosis thresholds, IQR outliers) — §10 Module 5's stats recast as report findings.
- **FK-candidate findings.** Cross-table containment analysis surfaced as quality findings ("`orders.customer_id` has 3% orphan values") — shares its engine with Phase 8's relationship discovery, so building either advances both.
- **Schema drift → the Drift Report (D44 — v0.5).** Re-drop a newer version of an already-profiled dataset and get an aggregate **Drift Report**: rows added/removed, per-column % of values changed, null-rate and cardinality drift, and distribution shift (PSI or KS distance, thresholds shown, never silent), on top of the column-level schema diff (added/removed/retyped). Matching keys are **inferred** (the D24 engine) and it is **folder-aware** across a multi-table drop; both versions stay in-browser (zero server, zero egress). **Aggregate summary only — never a cell-level diff viewer** (cell-level CSV diff is the commodity cottage lane, §3.4; the unclaimed piece is inferred-key, folder-aware *statistical* drift). This is the product's retention mechanic and pillar #2 of the structure × time arc (D52), so it **ships v0.5 as the first post-launch feature**, ahead of the rest of Phase 7; Phase 7 later absorbs it as one section of the quality report.
- **Report export.** Self-contained HTML/Markdown artifact suitable for pasting into a PR or a data-quality ticket.

### 20.9 Platform expansion — iPad/iOS and PWA

The web version targets desktop-first; tablet (iPad) is a nice-to-have per §4 constraints. A lightweight path to tablet support without native development:

**Responsive web (immediate, Phase 6 polish).** One Tailwind breakpoint: collapsible sidebar on iPad portrait, full sidebar on landscape. Monaco Editor and chart modules already responsive. The SQL playground and chart switching stay usable at iPad width with a hamburger menu. Test on Safari iPad before public ship.

**Progressive Web App (PWA, low-cost addition).** v1 ships a `manifest.json` + service worker (workbox or similar): installable from Safari home screen, works fully offline (all logic is client-side, DuckDB-Wasm is cached). Minimal ceremony — the app already has no server-side dependencies. Surfaces as "DataScope Studio" icon on the home screen, behaves like a native app.

**Native iOS (future, demand-driven).** If iPad users ask for deeper integration (Files app access for drag-and-drop, photo library import, etc.), the path is React Native or Flutter. This is a separate codebase, low priority until traction signals it matters. Not a Tauri concern.

**Desktop client — the D51 charter (Tauri; replaces the prior "desktop clients — primary" one-liner).** React UI in **Tauri v2** with a **native-DuckDB sidecar** (duckdb-rs) behind the D49 `QueryEngine` interface, results over Arrow IPC — explicitly *not* DuckDB-Wasm inside the webview. What it unlocks, in value order:

1. **The >300MB refusal tier (§7.3) disappears on desktop** — native DuckDB uses machine RAM and spills to disk, so multi-GB Takeout archives and real Parquet lakehouse folders become first-class (the single biggest capability delta in the backlog; fixes the D34 consumer size trap as a side effect).
2. **Air-gap distribution** — a signed installer for machines with no internet: the literal endpoint of the §24 Play-1 story and the predictable §24.4 design-partner ask.
3. **Folder-watch → automatic Drift Report (D44)** — the retention ritual matured from manual re-drop to ambient habit.
4. **Native niceties** — real file dialogs, `.dsps` file association, no tab-death, faster cold start.

Real costs, held honestly: the Rust toolchain, a 3-OS build/sign/notarize pipeline, an auto-updater, a per-OS QA matrix, and a **second engine held to D40-style verification discipline** (any per-engine capability claim needs its own verification). Therefore **rung 3 on the D61 platform ladder — after the hosted tier ships** (browser → hosted tier → desktop → rest on request), with one retained early-pull exception: a design partner asking for air-gap may still pull desktop forward (the predictable §24.4 ask). Trigger otherwise: v0.5 shipped with the §18 steering bars green. Never before the Oct 6 date (D27). **Free forever** per D28's own no-server-cost logic — a trust asset, not a revenue line. Desktop is a *surface*, not a differentiator (Duckling and Duckle already occupy the Tauri-desktop lane, §3.4); structure inference (②), the Drift Report, and the travelling artifact differentiate whatever the shell — the web app stays the funnel and the identity.

### 20.10 Monetization & packaging (free-forever local core, D28)

**The local core loop is free forever (D28).** Ingest, profile, SQL, charts, insights, quality report, and structure-report export stay local and free — permanently; nothing that runs locally ever moves behind a paywall. This is a trust asset for a privacy product and an architecture guard against future pricing pressure. **Paid only ever follows real server-side cost or team value**, charging only where the infrastructure line does:

- **Cloud persistence** — R2 save/share beyond the free default (longer TTL, larger objects, more concurrent links).
- **AI routing & BYOK vault** — hosted key custody and Workers-AI overflow beyond the free ceiling (§11.2); local models and direct-BYOK modes stay free. The free cloud-AI pool is deliberately a capped, shared demo budget (§11.2); scaling it is a paid-tier/budget decision (§23.5), not an architecture change.
- **Team features** — shared workspaces, org-scoped share links with longer TTL, and (post-Studio) shared semantic models.
- **Hosted tier — data staging & server-side execution (D39; chartered as the commercial arc, D61)** — staging a dataset to DataScope cloud and executing SQL/profiling server-side is real per-request compute cost, the legitimate paid seam (D28), now **named the product's chartered commercial arc** — the second platform rung on the D61 ladder, scheduled ahead of desktop. Its **privacy-and-deletion promise binds it (D61, §5.2):** opt-in always, disclosed TTL, delete-on-demand within a stated window, documented retention, no training on user data — stated as verifiable server behavior, never as "compliant" or "your data is safe" (D21). Price anchors stay deferred (D36); custody, disclosure, cost ceilings, and the promise copy are fixed by the D39 design round (anchored at the v0.5 close, §19) before it ships. Opt-in scale-up only — never the default and never part of v0/v0.5 launch identity (D23/D27/D28).
- **Privacy-constrained sharing (the §3.5 seam)** — if the §20.11 tiers ship, the synthetic-replica export and advanced suppression controls are the natural paid line for users in regulated environments who cannot upload or share raw data but must share its shape. Subject to the D21 language rule — sold as "share the shape," never as a compliance guarantee.

**Pricing is deferred (D36).** No price anchors are recorded here — monetization is revisited when the product is ready (D36, alongside the D29 v0.5-planning cadence). When revived, the D28 corrections are binding: **no limits on local capabilities** (token/BYOK connections are client-side and stay unlimited and free), **no content gating** (templates are content, not server cost), and **server-side auto-refresh requires a dedicated custody design round** — disclosure model, token custody, kill switch — before it may exist as a paid feature (client-side refresh-on-open stays the free default).

The privacy model (§5) is unaffected: nothing that runs locally ever moves behind a paywall, and paid tiers only add server-side conveniences that are already opt-in by design.

### 20.11 Share-tier extensions — aggregate stats & synthetic replica (D21 — designed, deferred)

Two extensions of the D20 "share the shape" model, deferred to backlog (split-tree detail: `backlog/shape-share-extensions.md`). Both are governed by the D21 language rule.

**Tier 2 — aggregate-stats share.** The structure-only artifact plus bucketed distributions (histograms, top-N categories, quantiles). Requires textbook statistical disclosure control before it is safe to ship: **small-bucket suppression** (buckets under a disclosed count threshold are dropped or merged) and **extreme-value clamping** (a raw min/max *is* a real row's value — report clamped percentiles, e.g. p1/p99, instead). Well-studied territory (k-anonymity, quasi-identifier analysis); implementable deterministically client-side.

**Tier 3 — synthetic-replica share.** Generate a fake dataset matching the real one's schema, per-column distributions, cross-column correlations, and FK integrity — **client-side in DuckDB-Wasm** — so the shared artifact is *runnable* (recipient can execute SQL and charts against it) while containing zero real rows. As of mid-2026, browser-native synthetic tabular generation is an essentially unclaimed intersection; done well it is a genuine headline feature and hard-engineering showcase. Done badly it is a privacy incident: 2026 research demonstrates membership-inference attacks against synthetic tabular data, so the replica must never be presented as anonymization — it is a *structural stand-in*. Sequenced post-Studio: it depends on trustworthy profiling (Phases 1–3) and relationship inference (Phase 8) to know *what* to preserve.

**Why deferred:** v0's client-side report and v0.5's structure-only share capture most of the sharing value at near-zero cost and risk; both extensions add real disclosure-control engineering that must not block the foundation releases. Revive trigger: user requests to share *distributions* (Tier 2) or *runnable data* (Tier 3) that the structure-only artifact can't satisfy.

### 20.12 Adjacent & alternative tool concepts (unadopted ideation)

Origin of the Studio pivot was a wider brainstorm of analytics-tooling ideas. The adopted ones became DataScope's identity and arc — the **Studio platform** (D12), the **semantic modeling engine** / dbt export (D11, §20.6), and the **data-quality report** (D14, §20.8). The rest are recorded here so the discarded options aren't re-derived from scratch; **none are committed scope** and none carry a decision. Split-tree detail: `backlog/adjacent-tool-concepts.md`.

**Bucket A — DataScope-adjacent features** (could bolt onto the Studio arc without a new app):
- **Query optimizer** — paste SQL → `EXPLAIN` plan, bottleneck/join analysis, a rewritten query, estimated savings. Natural extension of the SQL playground (Phase 4).
- **SQL/CTE debugger** — step through a query showing each CTE's intermediate output. Also a SQL-playground extension.
- **Data-contract validator** — check a `schema.yaml` against uploaded rows (nullability, enums, breaking changes). Overlaps the quality report (§20.8) but adds an explicit contract-diff/CI angle.
- **Interactive dbt / lineage explorer** — a drag-around graph UI over the generated dbt project (SQL, docs, tests, freshness, column-level lineage). The *export* already ships (§20.6); this is the browsing UI on top of it.

**Bucket B — separate-product concepts** (own apps, not DataScope features; captured only so the idea survives):
- **Delta Lake / lakehouse visualizer** — commits, checkpoints, versions, schema evolution, compaction; and a Bronze→Silver→Gold simulator that animates record movement, merges, and replayed failures.
- **BI dashboard reverse-engineer** — ingest PBIX/Tableau/Looker metadata → lineage, metrics catalogue, extracted SQL, dependencies.
- **Data-warehouse "time machine"** — git-for-warehouses: diff schema/rows/columns/constraints across snapshots.

**Why deferred:** these are candidate *future directions*, not DataScope v0–v1 scope. Bucket A items are the plausible post-Studio feature backlog; Bucket B items are separate portfolio projects. Revive trigger: an explicit decision to extend the SQL/Studio surface (Bucket A) or to start a new project (Bucket B).

### 20.13 Operational insight — content-free usage-shape view (D60 — deferred, trigger-gated)

A legible **"usage shape" view** over the content-free signals DataScope already emits, so the founder can see how people actually use the app **without ever collecting dataset content, query text, or per-user structure**. Split-tree detail: `backlog/operational-insight.md`.

**Why it is cheap, and why that is conditional.** The collection machinery is already decided and already content-free — this is a *reading/analysis* layer over signals the app emits anyway, **not new data collection**. That is the whole basis of its low cost and its fit inside the privacy identity. If a proposed metric requires collecting something new, that is the D59 line, and the answer is no (or the §5.2/D42 gate below). The cheapness is also why it must not be built early: a reading layer over counters that do not yet emit is not cheap, it is speculative.

**What it reads (all already-decided signal).** D25's edge event counters — shares created, relay fetches, edge-routed structure-report exports, AI-mode requests routed — plus CDN-level visitor counts (§23.5); D41's numeric LLM metrics — tokens/turn, retry count, repair-rate, latency buckets as Analytics Engine doubles and outcome-class blobs; §18's opt-in usage metrics (time-to-first-chart, insight-acceptance rate, export/share success rate, NL→SQL self-correction rate) and the v0.5 CDN repeat-visitor return signal; the D27 launch steering bars (reach, organic floor, artifact travel, beachhead pull).

**The operator questions it exists to answer.** Which ingest paths get used (single file vs. folder vs. API vs. bundled sample) → where to invest ingestion effort. Whether people reach the ② multi-table moat (D24 Join Graph) or bounce before it. Whether the artifact travels (shares + structure-report exports created, D26 attribution arrivals) → §18's artifact-travel bar, made continuous. The AI-mode split (local-only vs. cloud) → the D2/§11.2 shared-pool economics. Where the funnel drops (ingest → first insight → export) → the §3.5 time-to-first-insight axis, the one winnable axis.

**Guardrails — inherited, not re-decided.** Content-free only (D41): numeric doubles and outcome classes, never prompts, SQL, error text, column names, or values. No DSPS harvesting (D59) — this view is the *sanctioned* alternative to that rejected idea. Local-only mode stays uncounted by design (D25); the blind spot is accepted, because the visible graph is the edge-touching funnel, which is the part an operator or investor conversation needs anyway. Opt-in and disclosed (§5.2) — never default-on, never third-party tracking. Aggregate operator view, never per-user profiles.

**The one extension that needs a design gate first.** Numeric **dataset-shape buckets** — row-count bucket, column-count bucket, boolean type-mix flags ("has a temporal column", "≥2 numeric") — are **new** signal and edge toward content. Possibly fine, but only as aggregate counts with no column names and no values, opt-in per §5.2, and only after a D42/D46 review. A separate, gated sub-task — never bundled into the dashboard-over-existing-signals work.

**Why deferred:** useful if and only if the app takes off; until real usage exists there is nothing to read and no decision the view would change. **Revive trigger:** v0.5 has shipped and the §18/D27 steering bars are green, *or* a specific operator question exists that the raw counters cannot answer by hand. First moves on revival: confirm the trigger actually fired; inventory which content-free counters are **live in the shipped build** vs. still specced; draft the view over the *live* signals only, listing any desired metric that needs new collection separately for the §5.2 / D42 / D46 gate.

### 20.14 Semi-structured & log ingestion — deterministic template extraction (D66 — designed, deferred)

A designed-but-deferred ingestion path that extends DataScope's tabular-data core to **semi-structured text** — application/server logs, key-value blobs (env files, syslog KV pairs), and JSON with inconsistent/drifting shape — without adding AI to the ingestion path. Split-tree detail: `backlog/semi-structured-ingestion.md`.

**Why deterministic, and what "good" looks like without AI (the triage that produced this row).** Unstructured prose, images, and audio have no recoverable schema without an ML/LLM layer, and deterministic methods there yield metadata and statistics only — not understanding (the boundary D32 already draws, and the reason this row explicitly excludes them). Semi-structured text is different: logs and key-value blobs *already have* a recurring, if inconsistent, structure — the job is pattern recognition, not comprehension, and that is squarely deterministic territory.

**Design sketch:**
- **Log-template extraction** — clustering recurring line shapes (the Drain family of algorithms: tokenize, build a prefix tree keyed on token count and position, cluster near-identical lines into templates) to recover a per-template schema (timestamp, level, source, free-form fields) without hand-written per-format parsers.
- **Regex/pattern field extraction** — a small library of common field patterns (timestamps, IPs, emails, UUIDs, key=value pairs) applied per detected template, each extraction carrying a confidence score and the matched pattern as evidence — the same evidence+confidence discipline DSPS facts already use (D45), never a silent guess.
- **Output is an ordinary table** — extracted fields register through the existing `QueryEngine`/table registry (D49/D58), so profiling, classification, the broker, SQL, charts, and DSPS all work unchanged. No new downstream pipeline, no new engine — the D58 no-parallel-pipelines principle holds by construction.
- **Explicitly out of scope:** prose documents, images, audio, video — deterministic methods can't recover meaning from these, only metadata (file size, EXIF, language detection via character n-grams), which isn't worth shipping as a headline capability.
- **Explicitly not RAG (extends D32/D47):** this is structural parsing of recurring patterns into fields — no text chunking for retrieval, no embeddings, no vector search. The D32 non-goal is unchanged.

**Why deferred:** v0's Oct 6 date and D15 cutline are scoped to structured/tabular ingestion (CSV/Parquet/JSON, D1); this is genuinely new format-support surface, not a v0/v0.5/v1 Studio-arc extension, and doesn't compete with anything already on the critical path. Recorded here so it isn't re-derived from scratch.

**Trigger:** a concrete source of semi-structured data (e.g., a design partner's log export, or a user request the existing formats can't satisfy) — or its own dedicated design round once v0/v0.5 ship, since the log-template clustering approach deserves its own spike (D18-style) before a capability claim is made (the D43 local-model-honesty precedent — any new extraction technique needs its own verification before the UI claims it works).

---

## 21. Pre-Implementation Planning Package

**Re-sequenced spike-first (D18).** Up front: only items 4 (interfaces) and 7 (state tree), plus the Phase-1 ingestion spike and the D17 inference spike — these validate the riskiest empirical assumptions (COOP/COEP hosting requirements, DuckDB-Wasm cold-start and memory behavior on target hardware, classifier behavior on messy real-world CSVs) before anything is frozen. The remaining items (epics, ADRs, sequence diagrams, per-issue prompts) are written *after* the spikes, from evidence — the doc's own Appendix A warns its library survey is a snapshot to re-verify.

**Ingestion-spike verdict (2026-07-19) — GO, single-threaded fallback confirmed sufficient.** The Phase-1 ingestion spike (disposable Vite + DuckDB-Wasm harness, headless Chromium; all timings measured, not estimated) returns a **GO** on the empirical assumptions D18 flagged and feeds ADR-001. **COOP/COEP confirmed but not load-bearing:** with `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`, `crossOriginIsolated` is true, `SharedArrayBuffer` is available, and DuckDB-Wasm auto-selects its threaded `coi` bundle; **without the headers it does not fail and does not drop to the baseline `mvp` bundle — it selects `eh` (single-threaded, WASM exception handling), fully functional for both ingest and query.** So the single-threaded fallback *suffices* where headers can't be set — just slower on heavy operations — and the app need not hard-gate on the headers. **Cold-start (production build, content-hashed assets, headers on): 799 ms cold / 631 ms warm for the threaded `coi` bundle** — comfortably under the <3 s target; dev-mode threaded was 1314 ms and dev-mode single-threaded (`eh`, no headers) 517 ms, so single-threaded init is *faster* than threaded (spawning pthread workers costs startup) — threading is a query-time win, not a startup win. Timings were compile-bound (WASM instantiate over localhost), not network-bound; a real deployment adds the ~7.8 MB-gzip threaded-bundle download on top of this ~0.6–0.8 s compile floor. **Threading payoff is real but scoped to heavy operations on large files:** on a 50.7 MB / 1.24 M-row CSV, threaded ingest ran 1.8× faster (240 ms vs 426 ms) and SUMMARIZE 3.1× faster (262 ms vs 800 ms); the full register+ingest+count+summarize flow was ~520 ms threaded vs ~1240 ms single-threaded (both interactive), while a sub-1 MB file's difference sat within noise. **Memory is bounded and its instrumentation is a trap:** the 50.7 MB CSV materialized to **~87 MB of DuckDB engine memory** (~1.7× on-disk, measured via DuckDB's own `duckdb_memory()`); the browser's main-thread `performance.memory.usedJSHeapSize` is **useless** as a probe here — it read a flat, quantized 11.9 MB before and after the load, because DuckDB's data lives in the worker's WASM heap (invisible to main-thread `performance.memory`) and Chrome quantizes that API against fingerprinting — so any §15 memory-budget instrumentation must use `duckdb_memory()` or `performance.measureUserAgentSpecificMemory()` (available under `crossOriginIsolated`), never bare `performance.memory`, for worker-side data memory. Build carry-overs: bundle all DuckDB assets **same-origin** (Vite `?url`) and load the worker as an ordinary same-origin `Worker`, not a `blob:` worker (so `COEP: require-corp` never blocks a CDN-fetched `.wasm` and `worker-src` needs only `'self'`, §23.1); lazy-init on ingestion *intent* behind a module-level singleton promise (which also guards React StrictMode's dev double-invoke, observed spawning two workers); rely on immutable HTTP caching of the content-hashed assets over a hand-rolled Cache API (the ~21% warm-start gain was V8's compiled-module code cache, not the HTTP fetch); treat threading as an enhancement — detect `crossOriginIsolated` at runtime and degrade to `eh`, considering a lower size cap in that state rather than blocking; and **pin an explicit stable `@duckdb/duckdb-wasm` version** (newest stable 1.32.0), since bare `latest` resolves to a dev prerelease. *(Caveats — only headless Chromium was exercised; Safari's known COOP/COEP/SharedArrayBuffer quirks want a follow-up check before launch, no Firefox run; all timing was localhost, no real-network/throttled/CDN measurement; the Parquet path was implemented but not measured; no OOM or >50 MB behavior was probed. Disposable harness; full numbers in the spike scratchpad.)*

**The package's end is bound to a date (D27): v0 launches Tuesday, October 6, 2026 — date fixed, scope flexes.** This binds the *end* of the spike-first process, not its shape (D18 is unchanged): the spikes still run first and the ADRs/epics/diagrams still follow from evidence, but spec and planning work below launch-blocker severity is post-launch by default, and the D27 cut order (§19) governs anything that slips. The full package:

1. **Epics & issues** — expand every phase into 2–6-hour GitHub-sized issues, each with objective, files to create/modify, dependencies, acceptance criteria, test plan, and definition of done.
2. **Architecture Decision Records** — one ADR per major choice (DuckDB Worker, state library, React Query or not, Monaco, Recharts, edge stack, AI routing, Terraform layout & state backend per D19), so decisions aren't relitigated halfway through.
3. **Folder structure** — frozen up front (§16).
4. **Interfaces first** — define the TypeScript types before implementation: `Dataset`, `ClassifiedColumn` (§8), `DataCapabilities` (§9), `ChartSpec`, `ViewSpec` (D55), `QueryEngine` (D49), `TableRegistryEntry` (D58), `QueryResult`, `WorkerMessage`, `WorkerResponse`, `AIMode`, `AISession` (plus `MLModel`/`MLJob` when §20.1 revives).
5. **Sequence diagrams** — at minimum: drop CSV → parse → DuckDB → classifier → broker → dashboard; and user question → normalize → prompt → generate → lint → execute → (retry) → chart.
6. **Failure cases per feature** — malformed CSV, huge Parquet, duplicate columns, 100M rows, empty dataset, mixed column types, UTF-16 files, null-heavy columns, worker crashes, out-of-memory, AI provider timeout, relay rate-limit hit, R2 write failure; and a distinct **cancellation/lifecycle** class (D58) — user abort of an in-flight ingestion or query, a superseded request (a new AI turn preempts an in-flight tool-loop; a new query preempts a running one), and Worker termination/restart — handled as first-class control flow, not errors.
7. **State tree** — decide what lives in React state vs. store vs. inside the worker: dataset, schema, worker status, tabs, query, results, charts, AI session, settings, theme, history.
8. **API contracts per module** — stable service interfaces (`services/` in §16): `loadDataset()/removeDataset()/profileDataset()`, `runQuery()/cancelQuery()/getHistory()`, `buildChart()/recommendChart()`, `askAI()/setAIMode()`, `saveToCloud()/deleteShare()`.
9. **Testing strategy** — unit tests, worker integration tests, E2E, performance benchmarks against the sample datasets, regression suite.
10. **Per-issue implementation prompts** — small, deterministic prompts ("Implement Issue #17 only. Don't modify unrelated files. Follow ADR-001. Pass all tests. Update docs."), never one enormous "build DataScope" prompt.

**Non-functional requirements document** covering: performance targets (§18), browser compatibility, memory budgets, accessibility (WCAG goals), error recovery and user messaging, offline behavior (local-only mode should work fully offline after load), security and privacy guarantees (§5, §23.1), and telemetry policy.

---

## 22. Developer Checklist (per-phase gate)

### Performance
- [ ] Test ingestion with the 50MB reference CSV on Chrome, Firefox, and Edge
- [ ] Peak memory under 512MB for datasets < 50MB (DevTools → Memory)
- [ ] DuckDB-Wasm initializes in < 3s on a throttled "Fast 3G" profile
- [ ] Monaco lazy-loads only when the SQL tab is first clicked

### Correctness
- [ ] Run all 5 bundled samples through ingest → profile → classify → capabilities; verify each enables the correct module set
- [ ] Folder with 3 related CSVs → 3 registered tables, each independently profiled; broker evaluates over the union (D13)
- [ ] Empty CSV (headers only, 0 rows) → graceful empty state, not a crash
- [ ] Single-column CSV → multi-column modules disabled
- [ ] Column with 100% nulls → null percentage displays correctly
- [ ] AI: typo'd question normalized; broken query self-corrects within 3 retries; retry cap actually stops at 3

### Edge cases
- [ ] 150MB CSV → sampled preview mode with banner
- [ ] 400MB CSV → refusal modal with guidance (D16)
- [ ] .xlsx file → unsupported-format modal
- [ ] Malformed CSV (mismatched column counts) → DuckDB error caught and shown user-friendly
- [ ] Rapid sidebar module switching → no race conditions or stale state
- [ ] API URL that fails CORS → Tier-2 relay fallback engages transparently
- [ ] Edge origin blackholed → core (ingest/profile/SQL/charts/insights) stays fully functional; each typed 503 (kill switch) / 429 (rate limit) / AI-quota-exhausted response renders its paused-state UI, never a hang (§4, §23.5) *(v0.5)*

### Privacy
- [ ] **Local-only mode:** zero network requests after initial page load (DevTools → Network, XHR/Fetch filter)
- [ ] **Cloud mode:** only disclosed payloads leave; with metadata-only repair enabled, no data rows appear in any request body
- [ ] Closing the tab leaves no dataset contents in `localStorage`, `IndexedDB`, or cookies (settings keys only)
- [ ] R2 share-link delete control removes the object; TTL expiry verified
- [ ] BYOK key never appears in browser storage or request bodies in plaintext (reference token only)

### Security
- [ ] Deployed app serves the §23.1 headers: CSP, COOP/COEP, `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`, referrer policy
- [ ] Adversarial CSV fixture (script/HTML payloads in cell values and column names) renders inert in profile cards, results grid, chart labels/tooltips, and insight feed
- [ ] `npm audit` shows no high/critical findings; lockfile diff reviewed on dependency updates
- [ ] Relay rejects SSRF probes: `http://localhost`, `http://10.0.0.1`, `http://169.254.169.254` *(v0.5)*
- [ ] Secret scan green — no tokens in repo, bundle output, or Terraform state
- [ ] `terraform plan` against prod shows no drift *(v0.5+)*

### Bundle size
- [ ] Initial JS bundle (gzipped) under 500KB excluding lazy chunks
- [ ] DuckDB-Wasm chunk lazy-loaded and cached via Cache API
- [ ] Monaco chunk lazy-loaded on first SQL tab interaction

---

## 23. Security & Delivery Infrastructure (D19)

Added 2026-07-11. **§5 governs what *data* leaves the browser; this section governs what an *attacker* can do** — to the app, to the enumerated edge surface, and to the pipeline that ships both — plus the infrastructure that delivers and operates the product: Docker for dev/CI parity (§23.2), Terraform for Cloudflare account resources (§23.3), GitHub Actions for CI/CD (§23.4). Split-tree docs: `foundations/security-model.md` and `foundations/infrastructure.md`.

### 23.1 Security model

The threat model is small because the architecture is (§1, §4): no accounts, no server-side query execution, three enumerated edge paths. What remains:

| Surface | Threat | Control |
| :--- | :--- | :--- |
| **Rendered dataset content** (cell values, column names, API responses) | Stored/reflected XSS — a crafted CSV cell (`<img onerror=…>`) executing in the profile grid, results grid, chart tooltips, or insight cards; a poisoned share link (§12.3) attacks whoever opens it | Every dataset-derived string is untrusted input: rendered as text nodes only (React's default — `dangerouslySetInnerHTML` is banned on dataset-derived strings), escaped in SVG/Canvas chart labels. Adversarial CSV fixture in the regression suite (§22). |
| **Static app delivery** | Script injection, clickjacking, MIME sniffing | Security headers shipped from the v0 public ship: CSP (below), COOP/COEP (already required for SharedArrayBuffer, §17), `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`. Headers are reviewable config in the repo, never dashboard toggles. |
| **Tier-2 CORS relay** | SSRF — relay coerced into fetching internal / cloud-metadata addresses; open-proxy abuse | Private-IP/localhost/link-local target rejection + per-session rate limits (§7.4, already specced in `build/09-edge/02-cors-relay.md`); relay stays storage-free. |
| **R2 save/share** | Share-link enumeration; hosting abusive content; cost abuse | Unguessable IDs (≥128-bit random), private by default, TTL + delete control, size caps and rate limits (§12.3). |
| **BYOK vault** | Key theft or leakage | D9 custody model; opt-in keys only in Cloudflare secret/KV keyed to session with a delete control; key material scrubbed from Worker logs and error traces. |
| **Supply chain** | Compromised npm package or GitHub Action shipping code to every user | Committed lockfile; `npm audit` gate in CI (fail on high/critical); automated dependency-update PRs; GitHub Actions pinned to commit SHAs; lifecycle scripts disabled in CI installs where feasible. |
| **Secrets** | Leaked Cloudflare / AI-provider tokens | No secrets in repo, bundle, or (where avoidable) Terraform state; `wrangler secret` + GitHub encrypted secrets; least-privilege scoped Cloudflare API tokens; secret scanning in CI. |

**Anonymous session identity — the primitive every edge control hangs off.** With no accounts, the "session" is the only identity anchor the design has, so its *requirements* are specced here even though the mechanism (cookie vs header, HMAC scheme) is ADR-006:

- Session tokens are **server-minted and integrity-protected** — a signed opaque value the Worker issues on the first edge call; clients cannot self-mint a valid token.
- Token issuance is itself **per-IP rate-limited**, so fresh-session farming can't outrun the controls.
- **All edge rate limits are dual-keyed**: a per-session limit for fairness plus a coarser **per-IP floor** (launch default ≈ 3–5× the per-session limit, tunable) so minting fresh sessions still hits a wall.
- Tokens carry **no PII, no account linkage, and are rotatable on demand** — consistent with §5's no-accounts posture.

A fabricated or self-minted token is rejected and falls to the IP floor — an invariant the edge test suite exercises. This is what makes the per-session limits in §7.4, §11.2, and §12.3 real rather than trivially bypassable.

**CSP specifics.** DuckDB-Wasm needs `wasm-unsafe-eval`; the DuckDB worker needs a `worker-src` allowance; `connect-src` enumerates `'self'`, the edge Worker origin, and `http://localhost:11434` (local-model Ollama, §5.1). CSP is static per deploy, so it cannot tighten per AI mode — the local-only zero-network guarantee stays enforced by the §22 privacy tests; CSP is the backstop, not the mechanism. The Phase-1 ingestion spike (2026-07-19, D18) confirmed the DuckDB **worker-loading mechanism** — assets bundled same-origin (Vite `?url`) and the worker loaded as an ordinary same-origin `Worker`, not a `blob:` worker — which narrows `worker-src` to `'self'` (no `blob:` allowance) and sidesteps the `COEP: require-corp` trap where a CDN-fetched `.wasm` (DuckDB's default `getJsDelivrBundles()`) is blocked as a cross-origin subresource lacking CORP. That is the loading *mechanism*, **not** a validated CSP: the spike set no actual CSP header, so the remaining directives (Monaco's style requirements especially) must still be confirmed against a live header before launch — not guessed up front.

**Process.** A security review runs before each tier's public ship (v0, v0.5, v1). New server surface requires revisiting the Decision Record (the `09-edge` rule) — and therefore this threat model.

### 23.2 Docker — dev & CI parity only

**Non-goal: production runtime.** Production is static hosting + Cloudflare Workers (workerd); there is no container to ship, and inventing one would contradict §4's minimal-surface constraint. Docker's actual jobs:

- **`Dockerfile`** — multi-stage, pinned Node LTS base; produces the static bundle reproducibly. The same image builds locally and in CI.
- **`compose.yaml`** — the local stack: `app` (Vite dev server), `edge` (`wrangler dev`), `e2e` (Playwright), and an optional `ollama` profile so the local-model AI mode (§5.1) is testable without polluting the host machine.
- **`.devcontainer/`** — points at the compose service; onboarding = clone + open.

Rule: **CI runs in the same image developers use.** "Works on my machine" is a pipeline failure, not an excuse.

**Published build provenance — the approval kit's first piece (D63).** The reproducible build above is promoted from CI hygiene to a **public trust claim**: CI publishes the **bundle hashes + SLSA-style provenance attestation** on the D50 `/security` page, so anyone can verify the hosted bundle is byte-identical to the audited source. Mostly CI discipline + publishing — near-zero app code, v0.5-era. It is piece (1) of the D63 **approval kit** (self-host zip D50 + `/security` + provenance + signed-`.dsps` docs) — the filable trust bundle a champion forwards to security (§24.4). Piece (2), **signed `.dsps`** (D45 provenance labels gain a verifiable signature — "genuine, unmodified DataScope profile of file-hash X," never "this data is safe," D21), takes its own design round before build: client-side signing against a published public key only, since any per-request signing service is new server surface (§4). Piece (3), a **third-party security audit**, is a GTM expense decision (§24.4), not spec work.

### 23.3 Terraform — Cloudflare resources as code

Ownership boundary, drawn to avoid the classic wrangler-vs-Terraform drift fight:

| Owner | Resources |
| :--- | :--- |
| **Terraform** (`infra/`, §16) | Long-lived account resources: DNS records, custom domain, static-hosting project, R2 buckets **and their lifecycle TTL rules** (the §12.3 retention policy becomes reviewable code), KV namespaces (vault), zone security settings, Turnstile widget if the §12.3 abuse controls ever need it. |
| **wrangler** (`edge/`, §16) | Everything that ships with code: Worker script, bindings and routes (`wrangler.jsonc`), secrets (`wrangler secret`). **Terraform never deploys Worker code.** |

- **Environments:** `dev` and `prod` (staging = dev at this scale), via workspaces or per-env tfvars in `infra/envs/`; resource names carry the env suffix.
- **State:** remote backend, never committed local state. Preferred: R2's S3-compatible API (verify native S3 lockfile locking at setup); fallback: Terraform Cloud free tier. Decision recorded as **ADR-009** when v0.5 infra work starts (D18: post-spike, from evidence).
- **Workflow:** `terraform plan` on every PR touching `infra/`; `apply` from main behind manual approval (§23.4).
- **Sequencing:** Terraform becomes load-bearing at v0.5 (R2, KV, vault exist). At v0 it manages only DNS + hosting — bootstrapped at the v0 public ship so prod is reproducible from an empty Cloudflare account from the first public URL onward.

### 23.4 CI/CD (GitHub Actions)

| Trigger | Pipeline |
| :--- | :--- |
| **Pull request** | Lint, typecheck, unit + worker tests, E2E against the compose stack, bundle-size budget check (§18), `npm audit` gate, secret scan; `terraform plan` when `infra/` changes. |
| **Merge to main** | Build in the pinned Docker image → deploy static app + `wrangler deploy` edge to the dev environment → smoke E2E against it. |
| **Release tag** | Promote to prod (static + edge); `terraform apply` behind manual approval. |

Workflows live in `.github/workflows/` (§16); Actions pinned to commit SHAs per §23.1. The §22 Security checklist is the per-phase gate; this pipeline is what enforces it mechanically.

### 23.5 Operational ceilings & kill switches

The architecture makes the core loop cost the owner nothing per user (§1, §4), but the enumerated edge surface (§6) *does* spend real resources per request — Workers-AI neurons, subrequests, KV/R2 ops. This section is the quantified operational contract around that surface: a spend ceiling, a designed way to *stop* any endpoint, and enough content-free visibility to know when to. Everything here gates the **v0.5** edge ship; **v0 is static-only, so the free plan costs nothing and none of this is load-bearing until the Worker exists.** All numbers are launch defaults, tunable from the observability evidence below (D18). The v0.5 D38 read-only DSPS-serving MCP endpoint inherits this same ceiling/kill-switch/counter machinery; the D39 hosted-staging endpoint does too, but its server-side *execution* tier is real per-request compute cost and gets its own cost ceilings and abuse controls in its dedicated design round (v1+, D39). Split-tree: `foundations/infrastructure.md`, `foundations/security-model.md`, `build/09-edge/README.md`.

**Plan posture.** v0 (static only) runs on the Cloudflare free plan. **At the v0.5 edge ship the account moves to Workers Paid (~$5/mo, launch default)** — removing the 100k-req/day Free cliff that would otherwise take the *entire* edge (AI, relay, save, vault) dark under a spike — client-driven relay pagination (ADR-006) means more, smaller invocations rather than fewer large ones, so it is this request-count cliff pagination volume presses on, not a per-invocation subrequest cap — and turning spend into a controllable variable instead of a hard outage.

**Budget ceiling.** A declared **monthly edge-spend ceiling (launch default: $25/mo, tunable)**, with Cloudflare billing notifications configured at ~50% and ~80% of it — Terraform-managed where the provider supports it, else a documented dashboard step (an allowed, recorded exception to the no-dashboard rule, §23.3).

**Kill switches.** Every edge endpoint (ai-router, the v0.25 synthesis endpoint, relay, save, vault, and — from v0.5 — the D38 read-only DSPS-serving MCP endpoint) checks a **per-endpoint enable flag** — a Worker env var in `wrangler.jsonc`; flipping one is a seconds-long `wrangler deploy`, with the exact command in the runbook. A disabled endpoint returns a **typed 503** the client renders as "cloud features paused" (§4 edge-independent core; client handling in Phases 6–8). This is deliberately the env-var-flag version, **not** a KV-read-per-request dynamic flag service — upgrade only if redeploy latency ever proves inadequate.

**Response ladder (written down, not improvised mid-incident).** Alert fires → identify the endpoint → tighten its limits or flip its kill-switch flag → the core product stays fully usable throughout (§4). Turnstile is the next escalation: **adopt it on the affected endpoint when sustained 429/abuse rates (per the counters below) show session + IP limiting is insufficient** — a data-triggered escalation, not a launch feature (§23.3 provisions the widget).

**Observability (content-free, privacy-model-compatible — deliberately small).** Operator-side visibility is distinct from the opt-in *product* analytics (§18) and from user data (§5):

- Cloudflare's built-in Workers/R2 dashboards are the free, automatic baseline.
- One **Workers Analytics Engine dataset** records content-free counters per request: endpoint, outcome class (ok / 429 / 5xx / killed), and a coarse size bucket — **no URLs, no payloads, no session tokens, no IPs**. These are infrastructure counters, never joined to any dataset or key material (§5.2). Per **D25** the same content-free machinery is the product traction graph: it counts **edge events** — hosted shares created, relay fetches, edge-routed structure-report exports, AI-mode requests routed — while **CDN-level request counts** give visitor volume with zero page-side tracking. Local-only mode is zero-network by construction and therefore uncounted — an accepted blind spot.
- **LLM metrics (numeric-only, D41).** On the cloud/edge path the same Analytics Engine dataset also records content-free per-turn LLM numbers — **tokens per turn, retry count, repair-rate, latency bucket** as doubles plus an outcome-class blob — and **never prompt text, generated SQL, or error text** (that content lives only in the client-side §11.1 transcript). Local-only mode stays uncounted. **OTel-style content-bearing tracing on the Worker path is explicitly out** — it is either this numeric extension or a §5.2 violation; whether content-bearing traces may exist **for explicitly staged datasets only** (D39) is a question for the D39 design round, not decided here.
- **Alerts** (launch defaults, tunable): Workers-AI usage ≥ 80% of the daily allocation; R2 storage ≥ 8 GB; edge error-rate spike; daily request count ≥ 50k; plus the billing alerts above.
- **Cadence:** alert-driven, with a weekly glance before growth.

The Analytics Engine dataset and notification resources are Terraform-owned where supported (§23.3). The shared rate limiter these ceilings depend on **must not use plain KV** (eventual consistency + free-tier write cost); acceptable shapes are Cloudflare's native Workers Rate Limiting binding or a Durable Object counter where per-session quota semantics exceed the binding. **Decided (ADR-006, from live staging audits):** both the per-minute dual-keyed limiter and the daily AI quota use a **Durable Object counter** — plain KV under-counted each under burst (the 60s limiter window first; then the daily quota, whose "wide window tolerates the slop" assumption failed a live burst test — 21 requests read back as 8). Recorded in ADR-006 (`foundations/infrastructure.md`).

---

## 24. Launch Strategy & Evidence Plan (D22–D29)

The venture-readiness layer over the build: how v0 reaches its beachhead (D22/D23), how the "unignorable" gaps get manufactured rather than waited for, and how a funded competitor's response is pre-answered. The v0 gate and steering bars are not restated here — they live in §19 (ship gate + cut order) and §18 (steering bars, D27); this section is the go-to-market around them. Split-tree: `product/strategy.md`, `product/competitive-landscape.md`.

### 24.1 The four launch plays

**Play 1 — Kill-the-wifi demo *(v0 gate).*** The architecture has a party trick no funded competitor can copy: turn off the network mid-demo and keep working. MotherDuck can't (login-gated cloud); ChatGPT can't (upload-based). The 40-second script: load page → drop Parquet folder → tables profile → Join Graph assembles → **visibly toggle wifi off** → keep querying → *"your data never left this laptop."* That is the launch video, the homepage hero, the HN post, and the 99-second pitch. §4's edge-independent-core constraint — written for resilience — is the product's best marketing asset. Script it, rehearse it, record a backup; a **no-graph variant** is maintained in parallel so cutting the D24 slice changes one scene, not the date.

**Play 2 — Make the score a noun *(Phase 7 / v1 forward commitment — explicitly NOT a v0 gate item).*** Activates at Phase 7; recorded now only so the Phase-7 build commits to the consequence — a composite 0–100 score with color rings, designed to be screenshotted, with a name people repeat. Then: seed a content series ("NYC Taxi scores 61. Here's why") — engineers argue with the scores and post their own, and arguing is distribution; later, README badges. **The only v0 obligation** is that the structure report adopts the same visual-design language so the brand is continuous when the score arrives (§19 Phase 7). Nothing else from this play may pull v0 focus.

**Play 3 — Own a searched question *(v0 gate).*** Three standalone landing pages live at launch, pre-rendered static routes on the app domain (indexable, near-zero JS until interaction), each embedding the same drop zone — the page *is* the app entry with intent-matched copy; the app bundle lazy-loads on drop (§18 bundle target). **Re-aimed 2026-07-12:** `/parquet-viewer` is demoted — the viewer/profiler cottage lane (§3.4) has commoditized that intent — so the launch set is **`/schema-diagram` (flagship) + `/csv-profiler` + `/ai-context`**, with `/parquet-viewer` kept only as a cheap extra if days remain (cut-order item 3):

| Route | Headline | Target queries |
| :--- | :--- | :--- |
| `/schema-diagram`† *(flagship)* | Turn a folder of CSVs into a schema diagram — inferred from your data, not drawn by hand ("they diagram your definitions; we infer from your data," §3.4) | "csv to er diagram", "generate schema from csv", "er diagram from data" |
| `/csv-profiler` | Profile a CSV without uploading it | "csv profiler online", "profile csv online", "analyze csv without upload" |
| `/ai-context` *(new)* | Share your data with ChatGPT without uploading it — give an LLM your schema, not your rows | "share data with chatgpt without uploading", "give an llm your schema", "csv context for ai" |

`/ai-context` is the N4/P4 packaging of the already-v0 "Copy for AI" surface (D31, §12.2) — no new engine, just an intent-matched front door for the DSPS-as-LLM-context renderer. `/parquet-viewer` (open Parquet files online — free, no upload, no login) is retained only as the cheap fourth page if schedule allows.

† `/schema-diagram` is the flagship only while the D24 Join Graph (beta) slice survives; if the slice is **killed on its own D24 kill criteria** (the graph is last-cut, D27) the page falls back to `/parquet-to-csv` (converter intent — the §12.2 export path already covers it). These pages double as the devlog surface (§24.2) so SEO effort compounds in one place; they convert *recurring intent*, not one news cycle — the reliable half of the usage graph.

**Play 4 — The artifact travels *(v0 gate; D26's execution).*** The structure report's design pass + attribution loop (D26, §12.2). Long game: make "send me the DataScope report" the way data teams describe shape — the format play (DSPS as an open, versioned spec — D31/D37; §3.5 ladder). A format spreads user-to-user and lives in tickets, PRs, and inboxes; a competitor feature does not neutralize artifacts already in circulation. **The receiver closes the loop (D62):** "just send me the .dsps" is a two-sided verb — it becomes reflex only once the receiver has a zero-friction way to open one, so the universal `.dsps` receiver (§13.1 — any artifact renders read-only, no data/login/install) turns every `.dsps` in an inbox or ticket into a live landing page. **Format-first (D64):** DSPS is the platform and the app its flagship client — a published JSON Schema + npm validator/parser library let third-party tools consume DSPS, and formats are adopted by *encounter*, not decision. Together these complete the three adoption reflexes: **received data → datascope it** (D48) · **about to send → send the shape** (D20/D31) · **received a `.dsps` → open it** (D62).

**Launch-copy skeleton (D57).** When D52's deferred draft copy is written, it follows the five-step workflow ladder — **drop → Dossier → ask (or one-click guided task) → answer → take it with you** — the operational restatement of §3.0's pain table: each step names the surface that kills a time sink (D48, D53, D20/D31). The copy sells the ladder, not a feature list; the frame is unchanged (inherited-data headline, privacy as the permission line, structure × time — D52). Its **adoption companion — the three reflexes** (received data → datascope it, D48 · about to send → send the shape, D20/D31 · received a `.dsps` → open it, D62) — is the copy skeleton for the artifact-travel loop (Play 4), recorded here beside the workflow ladder.

**Launch-content note — "LLM-guessed vs. computed" (devlog/social).** A recurring content angle, not a build item: the side-by-side of what an LLM *guesses* about a dataset (plausible, unverifiable, sometimes wrong) against what DataScope *computes* deterministically (evidence + confidence, D45) — the honest demonstration of why "run DataScope before ChatGPT" is complementarity, not competition (D31/§3.4). Feeds the §24.2 devlog list; no spec surface of its own.

### 24.2 Evidence plan — how the "unfixables" get fixed

Every hard-to-fix gap (traction, solo founder, willingness-to-pay evidence, market-size story, timing) is downstream of shipping something with a repeatable wow; evidence is manufactured, not waited for.

| Gap | Manufactured by |
| :--- | :--- |
| **No traction** | Plays 3 + 4 = compounding baseline traffic; Play 1 = the spike; D25 = the graph is *observable*; §18 steering bars = the graph has a referee. |
| **Solo founder** | Build in public, in named rooms (below). Velocity signal replaces team-size signal. |
| **No willingness-to-pay evidence** | The wifi demo magnetizes exactly the users who can't use anything else; inbound *"can we use this for [regulated thing]"* is the design-partner list and the application quotes. Don't charge them yet — collect them. Supplement: ~10 discovery interviews with privacy-constrained data people (finance / health / gov). |
| **Market-size story** | The format play (§3.5 ladder): free structure tool → privacy-safe shape sharing → team semantic layer. "The collaboration layer for data that can't leave the building." |
| **Timing / MotherDuck** | §24.3's named counter-positions + D27's fixed date. |

**Build-in-public venues (named).** Primary room: the **DuckDB community** — Discord and duckdb-wasm GitHub Discussions — active, technical, and exactly where Parquet-first engineers already are; browser-native DuckDB work is reliably welcomed there. Secondary: **Show HN** at launch plus 2–3 of the strongest devlog posts (the FK-inference-in-a-tab engineering is front-page material on its own). Devlogs live on the app domain (same surface as Play 3's pages, so SEO compounds), cross-posted to X. Cadence: **weekly, shipped-something-first** — a devlog with no shipped change that week is skipped, not padded.

### 24.3 Competitor-response scenario

§3.4 names MotherDuck and SplitForge as the threats to watch (July 2026 refresh; Duckle demoted — a Tauri desktop ETL app, not a browser threat); "speed" (D27) is necessary but not sufficient, so the response is pre-written.

**If MotherDuck ships a "structure view" or "local mode":** their version still requires signup and (for anything shared) upload — the business model guarantees it. The two **MotherDuck-proof assets**:

1. **Offline-by-construction (Play 1).** A login-gated cloud warehouse cannot run the wifi-kill demo without abandoning its revenue model — a structural moat, not a feature race. Counter-positioning line, ready in advance: *"Theirs needs your data. Ours never sees it."* **Claim discipline (D72, 2026-07-24):** wherever the longer-form claim appears, it is stated as *"we cannot see your data — unless you explicitly send it"*: every row-leaving path is an explicit, labeled, per-session opt-in (§5.2 — the D20 escalation, D39 staging, §11.3 repair, D72 grounding), and the absolute form is reserved for local-only mode, where it stays literally true.
2. **The structure report as a portable format (Play 4).** It spreads user-to-user and lives in tickets, PRs, and inboxes; a rival feature does not neutralize artifacts already circulating. The faster the report becomes "how you send shape," the less a rival structure-view matters.

**If SplitForge (or another cottage/OSS neighbor) grows multi-table inference:** SplitForge already ships single-file candidate-FK hints (§3.4), so this is the likeliest fast-follow. Differentiation is folder-scale ② as a *system* — inference + confidence + quality + DSPS + share, not a hint column — plus the two assets above; against desktop-lane neighbors (Duckle's ETL identity, Duckling's viewer) time-to-first-insight stands (no install, no config, no pipeline). A neighbor validating the lane likely helps v0 distribution more than it hurts.

**Standing order:** re-verify the §3.4 survey before the launch narrative is finalized (already a spec requirement); if a rival announcement lands mid-build, **hold the date and sharpen the counter-positioning copy — never add scope.**

### 24.4 GCC / Dubai motion (near-term, pre-raise)

Data sovereignty is a first-class obsession in the Gulf: government entities, DIFC/ADGM-regulated financials, and healthcare operate under data-residency regimes where "upload your data to a US cloud tool" is *prohibited*, not just disliked. There, "no upload, by construction" is a **market-access feature**, and the D23 beachhead is disproportionately concentrated in exactly those rooms (stated with the D72 qualifier — "…unless you explicitly send it" — since the graduated grounding opt-in exists; the leave-behind names the opt-ins rather than over-claiming, per D21). Caveat: the local investor scene skews fintech/e-commerce/consumer, so the sovereignty story is the bridge from "free dev tool" to "business."

Sequencing:
1. **Networking passes now** (Startup Grind Dubai, founder meetups) — feedback + finding design partners who can't upload data; nothing framed as a raise.
2. **No pitch stage until the demo exists.** The 99-second formats (e.g. Founders Live Dubai) are tailor-made for the kill-the-wifi script; a roadmap slide is not.
3. **Bring three artifacts:** live demo (+ video backup), a one-pager, and an exported structure report as the leave-behind. **Add the approval kit (D63)** — the self-host zip (D50) + `/security` page + published build provenance + signed-`.dsps` docs, the one link a champion forwards to security to get DataScope blessed org-wide. Trust for organisations must be *filable*, not just demonstrable: "check DevTools" convinces the individual, not the CISO. The **third-party security audit** (D63 piece 3) is founder-triggered off the first serious design-partner conversation here — a GTM expense, no fixed date.
4. **The ask is not money** — it is three design partners in banking / government / health who will say *"we'd use this because we can't use anything else."* That quote is the willingness-to-pay evidence no spec can manufacture.

Venue references (July 2026 snapshot — re-verify before booking): [Founders Live Dubai](https://www.founderslive.com/events-list/dubai-2026-01) (99-second pitches), [Founders Pitch & Networking Nights](https://www.eventbrite.com/e/founders-pitch-networking-night-in-dubai-tickets-1989003437825) (5-minute pitches), [Startup Grind Dubai](https://www.startupgrind.com/dubai/), [Step Conference](https://planxconf.com/dubai-networking-events/) (Dubai Internet City, ~8k attendees), and periodic investor-backed pitch nights ([overview](https://beststartup.asia/dubais-biggest-business-event-2026-startup/)).

### 24.5 Dual-purpose governance (D42)

DataScope is a product first; that it also demonstrates hard engineering is a side effect, not a purpose (D22). D42 makes that tension rule falsifiable: any feature justified partly by portfolio or hireability value must pass — *"would we build this, at this cost and this point in the sequence, if the job market did not exist?"* An honest **no** fails it, whatever the incidental résumé value. The judgment is made at **human triage**, never self-certified by the proposing document; a dual-purpose item must independently clear the §4 minimal-surface constraint and must not move D27's date or the D15/D27 cut order. Recorded consequence (2026-07-12): **re-sequencing an AI/MCP slice into v0 was reviewed and rejected** — it would edit settled D15 and load the fixed date; the launch-moment AI signal is the already-v0 "Copy for AI" renderer (D31). Not re-litigated without founder instruction.

---

## Appendix A — NL→SQL Blueprint Research Notes

Fact-check of the original "master prompt blueprint" (five branded phases) that seeded §11, preserved so the reasoning isn't lost. Library capabilities below are a snapshot as of July 2026 — re-verify before building; this space moves fast.

### A.0 Phase-by-phase verdict

| # | Branded as | What it actually is | Verdict |
|---|---|---|---|
| 1 | "Speculative Vector Tokenizer" | Levenshtein/Jaccard fuzzy string matching against known column/table names | Build — cheap, real, useful. **Renamed** to input normalization (§11.1 stage 1). |
| 2 | "Schema-Constrained Prompt Engineering" | Context pruning — send only relevant DDL to the LLM | Build — standard practice everywhere (§11.1 stage 2). |
| 3 | "AST Parser (SQL-Glot style)" | Hand-rolled SQL parser + dialect converter, from scratch in one prompt | Don't hand-roll — real parser as a scoped lint instead (A.3, §11.1 stage 4). |
| 4 | "Data-Sampled Self-Healing Loop" | Execute → catch error → resample real data → feed back → retry | Build for real — best ROI in the pipeline (§11.1 stage 5). |
| 5 | "Adaptive Layout Configuration" | Chart-type/axis inference from column dtypes | Build — well-scoped, good demo payoff (§11.1 stage 6). |
| — | "In-Memory Execution Routing" | Named once, never explained | Not a real phase (A.2). Nothing to build. |

### A.1 Naming: "speculative" means something else

The blueprint's own justification for Phase 1 is to *avoid* loading a neural embedding model and use plain string distance — explicitly not vector-based. And "speculative" already means a specific inference-acceleration technique (speculative sampling/decoding, Leviathan et al. 2023: a draft model predicts tokens ahead, the target model verifies in one pass). Say "speculative" to anyone who works on LLM inference and they'll assume draft-and-verify decoding, not typo correction. Searches for "Speculative Vector Sampling" and "Self-Healing Semantic Compilation" as established terms returned nothing — invented branding. Call things what they are: *"I built an execution-feedback loop — failed queries get resampled against the actual data and error trace, fed back to the model, and retried up to three times"* survives technical questioning; *"I built a Self-Healing Semantic Compilation Engine"* invites a follow-up it can't.

### A.2 "In-Memory Execution Routing" debunked

Appears in the blueprint's opening paragraph, never resurfaces. The closest referent — "runs inside the isolated Web Worker thread" — is just duckdb-wasm's documented default setup (the official quick-start instantiates a `Worker` in the first few lines). Not a layer to design.

### A.3 Why Phase 3 must not be hand-rolled

Asking an LLM to produce "an AST parser, SQL-Glot style" in one generated module is asking it to reinvent, in one shot, a tool that took a dedicated team years. **sqlglot** (Python) is the real thing: dependency-free parser/transpiler/optimizer across 31 dialects including DuckDB, e.g.:

```python
import sqlglot
sqlglot.transpile("SELECT EPOCH_MS(1618088028295)", read="duckdb", write="hive")
# → 'SELECT FROM_UNIXTIME(1618088028295 / POW(10, 3))'
```

A one-shot "write an AST parser" prompt instead produces code with AST-shaped variable names doing regex matching on a handful of patterns — it passes demo queries, then silently mishandles the first CTE or window function a real user types. Failing quietly is worse than not having the feature.

No JS/TS library has a native DuckDB dialect yet, but real browser-capable parsers exist:

| Library | Notes |
|---|---|
| `node-sql-parser` | Genuine AST, runs in-browser, MySQL/MariaDB/PostgreSQL/SQLite/etc. |
| `pgsql-ast-parser` | TypeScript-native Postgres AST parser + mapper, built for programmatic rewriting |
| `sql-parser-cst` | Concrete syntax tree (preserves whitespace/comments); Postgres experimental |
| `dt-sql-parser` | ANTLR4-based, BigData dialects (Spark/Hive/Trino/Flink); validation + autocomplete, pairs with Monaco |
| `js-sql-parser` | Simpler AST parser/stringifier, smaller scope |

DuckDB's dialect is deliberately close to Postgres, so a Postgres-dialect parser catches most real LLM dialect mistakes (backticks, `CONCAT` vs `||`, date/time functions, `TOP` vs `LIMIT`). An afternoon of integration versus a from-scratch parser that can never be fully trusted.

### A.4 Academic notes worth keeping

- DIN-SQL's *internal* self-correction (re-reading its own SQL without executing) contributes only 1–3 benchmark points — evidence that execution-based feedback matters more than self-review.
- MAC-SQL's "Refiner" agent (runs the candidate, watches for errors/empty results, rewrites) is the closest formal analog to §11.1 stage 5.
- THOR: hard retry caps prevent infinite loops (adopted: cap 3).
- QUITE: syntax vs. equivalence errors need different correction strategies (adopted as the flagged future extension).

### A.5 Process note

Don't paste a master prompt wholesale and trust the output. Build and verify one pipeline stage at a time — the failure mode most likely to bite is a dialect guard that looks correct in a demo and breaks silently on the first real query.

### A.6 Full source list

1. Vanna.ai — https://github.com/vanna-ai/vanna
2. Vanna text-to-SQL worked example (DataFrame/Plotly output) — https://github.com/RominaElenaMendezEscobar/text-to-sql
3. LangChain reference text-to-SQL agent — https://github.com/langchain-ai/text-to-sql-agent
4. LangChain SQL agent docs — https://docs.langchain.com/oss/python/langgraph/sql-agent
5. LangChain SQL agent w/ DuckDB + MotherDuck — https://motherduck.com/blog/langchain-sql-agent-duckdb-motherduck/
6. sqlglot (GitHub) — https://github.com/tobymao/sqlglot
7. sqlglot (PyPI) — https://pypi.org/project/sqlglot/
8. node-sql-parser (npm) — https://www.npmjs.com/package/node-sql-parser
9. pgsql-ast-parser (npm) — https://www.npmjs.com/package/pgsql-ast-parser
10. sql-parser-cst (npm) — https://www.npmjs.com/package/sql-parser-cst
11. dt-sql-parser (npm) — https://www.npmjs.com/package/dt-sql-parser
12. js-sql-parser (npm) — https://www.npmjs.com/package/js-sql-parser
13. Agentic Jackal — DIN-SQL / MAC-SQL lineage (arXiv) — https://arxiv.org/pdf/2604.09470
14. RetrySQL (arXiv) — https://arxiv.org/html/2507.02529
15. THOR (arXiv) — https://arxiv.org/pdf/2507.09592
16. QUITE (arXiv) — https://arxiv.org/pdf/2506.07675
17. Speculative sampling background (arXiv) — https://arxiv.org/pdf/2506.17296
18. DuckDB-Wasm in the browser (MotherDuck) — https://motherduck.com/blog/duckdb-wasm-in-browser/
19. @duckdb/duckdb-wasm (npm) — https://www.npmjs.com/package/@duckdb/duckdb-wasm
20. Chat with a Duck / SQL Workbench — https://tobilg.com/chat-with-a-duck
21. DBMAN.AI — https://github.com/Manumanu1234/DBMAN.AI

---

## Appendix B — Review Recommendations (2026-07-10)

External review notes, folded into the spec on the same date. Disposition per item:

| Recommendation | Disposition |
| :--- | :--- |
| Auditable & reversible results | SQL visibility was already pervasive (educational panel, insight feed, quality score); **added** one-click undo for derived tables (§12.1) and transcript execution logs (§11.1); inference confidence + evidence already in Phase 8 / §20.6 |
| Deterministic insights before LLM magic | Already the plan — insight feed ships Phase 3 (D10), Lighthouse is Phase 7 (D14), both fully offline |
| Robust large-file UX | Already covered — §7.3 tiers: sampled preview, streamed ingest (§15), `httpfs` remote read, opt-in temp staging with TTL + disclosure |
| NL→SQL trust model | Retry cap 3, metadata-only repair toggle, and JS Postgres lint were already in §11; **added** always-visible suggested SQL + per-attempt execution log (§11.1, Phase 4) |
| Integrations that multiply value | dbt export already Phase 9; Context Bundle already §20.5 / backlog; **added** copy-to-Jupyter snippets (§12.2) and optional GitHub commit of the dbt project (Phase 9) |
| Onboarding & examples | Curated sample folders already §14; **added** in-app guided tour (Phase 6) and dbt export → run how-to notebook (Phase 9) |
| Measure & iterate | **Added** usage metrics + user-test iteration loop (§18), opt-in and hard-off in local-only mode |
| Monetization / packaging | **Added** §20.10 — core local & free; paid = cloud persistence, AI routing/BYOK vault, team features |

---

## Appendix C — Documentation & Implementation Repo Structure

Planned `_implementation/` layout for the DataScope repo. Three top-level concerns: **product** (why), **architecture** (how it holds together), **build** (how it's built, phase by phase). `foundations/` holds cross-cutting constraints every phase answers to, `backlog/` holds designed-but-deferred work, and `meta/` holds reader-facing navigation aids — a technical walkthrough and a question-to-source index — that sit above all four and are not scoped to any single concern. Phase folders are numbered in build order; each carries a one-line `Tier:` tag so the release cutline (v0 / v0.5 / v1) is enforced structurally, not just remembered.

**Release tiers** (canonical per D15; see §0, §19):
- **v0 — local, deterministic.** No server, no AI, no persistence. Reaches the Stage-2 "aha" with near-zero liability surface. First public ship.
- **v0.5 — AI + persistence.** NL→SQL chat (trust surface), edge services, R2.
- **v1 — Studio arc.** Quality report, relationship inference, semantic/dbt export — gated on foundation profiling proven in the wild first.

```
_implementation/

  meta/                          # reader-facing navigation aids, not tied to one concern
    technical-overview.md        # narrative walkthrough companion to DATASCOPE.md
    question-index.md            # answer-index: where to look for any question about the product

  product/
    vision.md                    # §1–3 — identity, target users, positioning
    roadmap.md                   # §19 phases + release tiers (v0 / v0.5 / v1)
    strategy.md                  # §3.5, §24 — distribution/audience, launch strategy & evidence plan
    competitive-landscape.md     # §3.4 — researched competitive map, threats to watch

  architecture/
    system-design.md             # §6 — React app, DuckDB worker, edge surface
    data-flow.md                 # ingest → classify → broker → modules sequence
    decisions.md                 # §0 Decision Record (D1–D69) + ADRs (§21.2)
    adr/                         # 9 ADR stubs (001–009), pending spike evidence per D18

  foundations/                   # Tier: cross-cutting — constraints every phase answers to
    privacy-model.md             # §5 — three AI modes, disclosure rules
    security-model.md            # §23.1 D19 — threat model, headers/CSP, supply chain, secrets
    performance-budgets.md       # §15, §18 — bundle, memory, latency targets
    testing-strategy.md          # §21.9, §22 — unit/worker/E2E/perf gates
    sample-datasets.md           # §14 — bundled samples + capabilities exercised
    infrastructure.md            # §23.2–23.4 D19 — Docker (dev/CI parity), Terraform, CI/CD

  build/

    01-foundation/               # Tier: v0 — Phase 1
      README.md
      01-project-bootstrap.md    # Vite + React + TS + Tailwind
      02-state-management.md     # stores: dataset, schema, tabs, settings
      03-routing.md

    02-ingestion/                # Tier: v0 — Phase 1
      README.md
      01-file-drop.md            # §7.1/7.2 — CSV/Parquet/JSON, format policy
      02-duckdb.md               # §6 — DuckDB-Wasm worker, lazy-load, Cache API
      03-table-registry.md       # §7.5 — sidebar table list
      04-multi-file.md           # §7.5 D13 — folder drop, cross-table catalog
      05-large-files.md          # §7.3 — size tiers, sampled preview

    03-profiling/                # Tier: v0 — Phase 1
      README.md
      01-summary-statistics.md   # §8 step 1 — SUMMARIZE extraction
      02-column-classifier.md    # §8 step 2 — semantic types + override
      03-capability-engine.md    # §9 — broker, adaptive module gating
      04-profile-ui.md           # §10 M1 — column cards, insight feed (D10)

    04-sql/                      # Tier: v0 — Phase 2
      README.md
      01-monaco-editor.md        # lazy-load, DuckDB autocomplete
      02-query-suggestions.md    # §10 M2 — templates from classified columns
      03-results-grid.md         # sortable, virtualized, pagination
      04-chart-translator.md     # §10 M2 — SQL → chart auto-mapper (shared)
      05-transformation-layer.md # §12.1 — CREATE TABLE AS, undo, re-profile

    05-charting/                 # Tier: v0 — Phase 3
      README.md
      01-time-series.md          # §10 M3
      02-correlation.md          # §10 M4
      03-distribution.md         # §10 M5
      04-categorical.md          # §10 M6
      05-join-graph-beta.md      # §19 Phase 3 D24 — confidence-labeled FK slice, kill criteria

    06-ai/                       # Tier: v0.5 — Phase 4
      README.md
      01-pipeline.md             # §11.1 — stages 1–6 as tool-use loop
      02-modes-byok.md           # §11.2 — three modes, prefer-key toggle
      03-privacy-disclosure.md   # §11.3 — metadata-only repair, transcript log

    07-connectivity/             # Tier: v0.5 — Phase 5
      README.md
      01-api-tier1-fetch.md      # §7.4 — direct browser fetch
      02-api-tier2-relay.md      # §7.4 — CORS relay, pagination
      03-refresh-from-source.md  # §7.4 — manual re-run

    08-persistence/              # Tier: v0.5 — Phase 5
      README.md
      01-parquet-export.md       # §12.2 — client-side COPY, Jupyter snippet
      02-r2-save-share.md        # §12.3 D5 — links, TTL, delete, abuse controls
      03-dsps-spec.md            # §12.2 D31/D37 — DSPS spec; D62 receiver, D64 schema/validator libs, D63 signed-.dsps

    09-edge/                     # Tier: v0.5 — separate Cloudflare deploy (§16)
      README.md
      01-ai-router.md            # Workers AI / BYOK routing
      02-cors-relay.md           # Tier-2 relay + per-session rate limiting
      03-vault.md                # BYOK vault — opt-in "remember my key" (D9)
      04-persistence-endpoints.md# R2 save/share, TTL/abuse

    10-studio/                   # Tier: v1 — Studio arc (each a full phase, gated separately)
      README.md
      01-quality-report/         # Phase 7 D14 — Lighthouse for data (§20.8)
      02-relationship-graph/     # Phase 8 D11 — inference + ER graph (§20.6)
      03-semantic-dbt-export/    # Phase 9 D11 — star schema, dbt, KPIs (§20.6)

    11-ml/                       # Tier: backlog — designed, deferred (§20.1)
      README.md                  # K-Means, regression, decision tree, zero-shot NLP

  backlog/                       # Tier: backlog — §20 remainder
    tier3-vault-ingestion.md     # §20.2 D4
    live-db-bridge.md            # §20.3 D6
    xlsx-sqlite.md               # §20.4
    context-bundle.md            # §20.5
    httpfs-bucket-mode.md        # §20.3 rung 1
    temp-staging.md              # §7.3 D16 — >500MB R2 staging, deferred
    platform-pwa-ios.md          # §20.9
    monetization.md              # §20.10
    semi-structured-ingestion.md # §20.14 D66 — log/KV/messy-JSON deterministic template extraction
```

**Conventions**
- Every section `README.md` opens with its `Tier:` tag, the phase it maps to (§19), and its dependency on the section beneath it.
- Each leaf doc mirrors §21's issue shape: objective, files to create/modify, dependencies, acceptance criteria, test plan, definition of done.
- `10-studio/` is deliberately three sub-folders, not one file — the arc is three phase-sized efforts, each gated on the layer below being trustworthy first (§19). Do not build it as one drop.
