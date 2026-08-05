# DataScope Agent Question Index

This file is the answer-index for the product. If an AI agent, newcomer, peer reviewer, or casual browser asks a question about the app, this document tells them where to look first in the repo for the authoritative answer.

Lives in `_implementation/meta/` alongside [`technical-overview.md`](technical-overview.md) — both are reader-facing navigation aids that sit above the `product/` / `architecture/` / `foundations/` / `build/` / `backlog/` split, rather than belonging to any one of those concerns.

## Source of truth by topic

### Product identity and positioning
- Vision (primary): `../product/vision.md` — identity, target users, positioning in one place
- Master spec: `../../DATASCOPE.md`
  - §1 Executive Summary
  - §2 Target Users
  - §3 Positioning & Landscape
  - §24 Launch Strategy & Evidence Plan
- Product implementation notes: `../product/strategy.md`
- Competitive landscape: `../product/competitive-landscape.md`
- Roadmap: `../product/roadmap.md`
- Rejected ideas: `../product/rejected-ideas.md`

### Architecture and system design
- Master spec: `../../DATASCOPE.md`
  - §6 Architecture
  - §16 Planned File Structure
  - §19 Development Phases
- Implementation reference: `../architecture/system-design.md`
- Data flow: `../architecture/data-flow.md`
- Decisions: `../architecture/decisions.md` (D1–D74 — settled; D73 amends D71's §13.3 shell; D74 amends D38's MCP gate and D41's transcript rule)
- ADRs (library/tool rationale — **mostly pending, not settled**): `../architecture/adr/*` (see §10a below)
- App flow: `../architecture/app-flow.md`

### Privacy and trust model
- Master spec: `../../DATASCOPE.md`
  - §5 Privacy Model (Tiered)
  - §11 AI Chat Layer (NL→SQL)
  - §12 Modify, Export & Persistence
- Implementation: `../foundations/privacy-model.md`
- Security: `../foundations/security-model.md`
- Infrastructure / delivery: `../foundations/infrastructure.md`

### Cross-cutting engineering constraints
Every phase in `build/` answers to these — not phase-specific, so easy to miss if you only skim the numbered folders.
- Performance budgets: `../foundations/performance-budgets.md` (`../../DATASCOPE.md` §15, §18)
- Testing strategy & acceptance gates: `../foundations/testing-strategy.md` (§18, §21.9, §22)
- Bundled sample datasets: `../foundations/sample-datasets.md` (§14)

### Build and implementation sequencing
- Implementation index: `../README.md`
- Build folder order: `../build/*/README.md`
- Foundation constraints: `../foundations/*`

### Deferred and rejected work
- Rejected ideas (considered, explicitly not pursued): `../product/rejected-ideas.md`
- Fully-designed-but-deferred backlog (`../../DATASCOPE.md` §20): `../backlog/*`
  - `tier3-vault-ingestion.md` (§20.2, D4), `live-db-bridge.md` (§20.3, D6), `httpfs-bucket-mode.md` (§20.3 rung 1), `xlsx-sqlite.md` (§20.4), `context-bundle.md` (§20.5), `temp-staging.md` (§7.3, D16, D39, D61 — the hosted tier), `shape-share-extensions.md` (§20.11, D20–D21), `platform-pwa-ios.md` (§20.9, D51, D49, D61), `monetization.md` (§20.10, D28, D36, D61), `adjacent-tool-concepts.md` (§20.12), `semi-structured-ingestion.md` (§20.14, D66)
- Deferred ML modules: `../build/11-ml/README.md` (§20.1)

## How to use this file

When answering a question, the agent should:
1. Check the question cluster below.
2. Open the cited document section first.
3. Use `_implementation/` only when the question is about build sequencing, architecture, or edge behavior.
4. If a question is about launch positioning, product identity, or audience, prefer `../../DATASCOPE.md`.
5. If a question is about browser privacy, AI routing, or the security boundary, prefer `../foundations/privacy-model.md` and `../foundations/security-model.md`.
6. If a question is about *why a specific library or tool was picked* (DuckDB worker setup, state library, Monaco, Recharts/D3 split, edge stack, AI routing, SQL parser, Terraform backend), check `../architecture/adr/*` — but check its `Status:` line first. As of this writing **all nine ADRs are pending, not decided** (D18 spike-first process: code first, ADR after). Don't present a pending ADR's draft framing as a settled decision.

---

## Question bank by audience and topic

### 1) Plain-English product questions

- What is DataScope, really?
  - Look first at `../../DATASCOPE.md` §1 and §6.
  - Supporting narrative in `technical-overview.md`.

- Is it a BI tool, a SQL editor, a profiler, or an AI product?
  - `../../DATASCOPE.md` §1, §2, §3, §10, §11.

- Why is the product framed around “understanding data structure” instead of “chatting with a CSV”?
  - `../../DATASCOPE.md` §1, §3.3, §12.2, D12, D37.

- What is the core promise in one sentence?
  - `../../DATASCOPE.md` §1 and `technical-overview.md`.

- What is the “inherited data” moment the launch story is built around?
  - `../../DATASCOPE.md` §2, §3.5, §24, D52.

### 2) Audience questions

- Who is the lead audience?
  - `../../DATASCOPE.md` §2, D22, D23.

- Why is the privacy-constrained data worker the lead audience?
  - `../../DATASCOPE.md` §2, §3.5, D23, D52.

- Who is the secondary audience?
  - `../../DATASCOPE.md` §2, §3.5.

- Is this for business analysts who do not want to write SQL?
  - `../../DATASCOPE.md` §2, D53.

- Is this for people who inherit data and need help understanding it?
  - `../../DATASCOPE.md` §3.0, §3.5, D52.

- What daily analyst pain points does the product map to?
  - `../../DATASCOPE.md` §3.0 (the orientation tax; six time-sink table), D57.

- Was repositioning around "analysts + prosumers" as the headline considered?
  - `../../DATASCOPE.md` D57 (triaged 2026-07-15 — no pivot); `../product/rejected-ideas.md`.

### 3) What the app does, step by step

- What happens when I drop a file?
  - `technical-overview.md` §1.
  - `../../DATASCOPE.md` §7, §13.

- What is the Dataset Dossier?
  - `../../DATASCOPE.md` §13.1, D48.
  - `technical-overview.md` §1.

- What does the Join Graph do?
  - `../../DATASCOPE.md` §10, D24.
  - `technical-overview.md` §1.

- How does the app infer relationships between tables?
  - `../../DATASCOPE.md` §20.6, D24, D17.

- What is the structure report / DSPS export?
  - `../../DATASCOPE.md` §12.2, D20, D31, D37.
  - `technical-overview.md` §1, §3.

- Can I open a `.dsps` someone sent me, without installing or logging in?
  - `../../DATASCOPE.md` §13.1, D62 (the universal `.dsps` receiver — read-only Dossier, no data/login/install); `../build/08-persistence/03-dsps-spec.md`.

- Why is DSPS treated as "the platform" and the app just its client?
  - `../../DATASCOPE.md` §6, §12.2, D64 (format-first inversion — published JSON Schema + npm validator/parser library); `../build/08-persistence/03-dsps-spec.md`.

- How does the app explain its findings in plain language without an LLM?
  - `../../DATASCOPE.md` §12.2, §13.1, D65 (deterministic narration — template-filled findings over D10/D45 facts; re-frames D54(b) as deterministic-first).

- What does “share the shape, not the data” mean?
  - `../../DATASCOPE.md` §12.3, D20, D21.
  - Extension tiers considered but deferred: `../backlog/shape-share-extensions.md`.

- How is the UI laid out / what is the Workbench?
  - `../../DATASCOPE.md` §13 — two shells: §13.0 (current shell, the flag-off spec of record) and §13.3 (the Workbench behind `WORKBENCH_ENABLED`, D71); build leaves `../build/12-workbench/README.md`.

- What is the app's visual design system / where do colours, fonts and spacing come from?
  - `.hallmark/design.md` — the locked system (genre, macrostructure families, the seven-surface depth ladder, both accent registers, the derived light register, the Act 0 variant question). Portable copy: `tokens.css`; live copy with the Tailwind mapping and legacy aliases: `src/app/theme.css`.
  - Why it looks like this / how it was sequenced: `../../DATASCOPE.md` §19's v0.69 subsection + `Revised (15)`, build leaves `../build/13-hallmark-replication/README.md`. Visual source of record: the five signed-off mocks, formerly `_misc/ideation/hallmark/` (D71), deleted once v0.69/§19 V6e closed on them; iteration record `.hallmark/log.json`.

- Where did the sidebar go in the Workbench?
  - `../../DATASCOPE.md` §13.3, D68(d)-superseded-by-D71 — the intent-group sidebar becomes explorer + dataset map + options strip + command palette; §13.2 stays the flag-off nav until W8. **The options strip itself is retired by D73** (2026-07-26); its prompts relocate into the map's Suggested Explorations, and its one-ranker contract is inherited whole by whatever renders the ranked list next.

- Where do I write SQL / what happened to the SQL tab?
  - `../../DATASCOPE.md` §13.3 (the drawer paragraphs), §10 Module 2, D73 — the standalone SQL tab is **deleted**; SQL is written in exactly one place, the **console** in the bottom drawer. Every surface that displays SQL gains a run action into it; keepers promote into **query tabs**. Build: `../build/14-workspace-streamline/README.md`, `../build/04-sql/README.md`.

- What is in the bottom region — inspector or console?
  - `../../DATASCOPE.md` §13.3, D73 — **both**, as two user-controlled views of one drawer: `Info` (the W7 inspector, unchanged, still "scent, not dashboard") and the SQL console. Exactly one console instance; results never auto-expand the drawer. Viewer mode gets Info only. **As of v0.70 S6.5** (`../build/14-workspace-streamline/06.9-drawer-split-view.md`), the two views are a permanent split rather than a tab switch — console left, Info a clamped-width right sidebar, both visible whenever the drawer is open, collapsing back to the S3 tab switcher below a 900px drawer width.

- What is a query tab / what finally uses the artifact tab kind?
  - `../../DATASCOPE.md` §13.3 (the tab-registry paragraph), D73 — the query tab is the artifact kind's first live member, with two producers (pin-from-console, or a chosen suggestion born pre-run), per-instance and never deduped. Registry: seven singletons → six + one artifact type. Build: `../build/12-workbench/04-tab-model-maturation.md`'s amendment note.

- Why does the transform guard live in a shared run path?
  - `../../DATASCOPE.md` §10 Module 2, §13.3, D73 — it is an **interception**, not an affordance, and with N independent query-tab runners a per-surface mount would leave a data-loss path the single SQL page never had. `../build/04-sql/05-transformation-layer.md`.

- Is the "AI Dataset Synthesis" block on the map decided?
  - **No — blocked on the S0 probe** (D73, §19's v0.70). Note the gate is narrower than it first reads: a producer already exists and already ships — v0.25's `edge/handlers/synthesis.ts` and `src/services/webllmSynthesis.ts` both emit synthesis through the ADR-010 seam, structure-only (never rows), opt-in, stateless, kill-switched, passing `eval/synthesis`. What that seam cannot do is invent a claim absent from the deterministic slice, and §4's "well-suited for CLV / churn" is that category. Measured in `../build/14-workspace-streamline/00-synthesis-and-limits-probe.md` (Probe A).

- I click a table — where do I see its details? (rail vs. drawer vs. tab)
  - `../../DATASCOPE.md` §13.3's **detail ladder** table, D73 — one escalation, three levels: **rail** = lightest signpost (structure only, always links out), **drawer Info** = ambient scent that fills from the selection and links to the tab, **tab** = full depth. No rung duplicates the one below; the rail deliberately has no stats panels and Info deliberately has no charts.

- Where does a suggestion / ranked action open now that the strip and SQL tab are gone?
  - `../../DATASCOPE.md` §13.3's routing table, D73, D58 — by scope into four existing homes: map **Suggested Explorations** → a pre-run query tab; **Data Quality & Health findings** carrying a query → a run action into the console (this is where D68e's `duplicates` lands); **selection-scoped** findings → the drawer's Info; **legal-but-unranked** → the palette with disabled-with-reason copy. Four render sites, still one ranker. `../build/03-profiling/03-capability-engine.md`.

- How many SQL/query tabs can I open?
  - **Undecided — measured, not guessed** (D73). Horizontal tab-strip scrolling is decided and ships regardless; the ceiling number, refuse-vs-evict at the ceiling, and whether the ceiling scales with the device are the S0 probe's Probe B (`../build/14-workspace-streamline/00-synthesis-and-limits-probe.md`), measured on an M1 Air base and an M4 Air. **No leaf doc may write a ceiling number until that reports.**

- Can I choose which local model to download / see its accuracy?
  - **Not built, and it needs a decision first** — recorded as item C in `../build/14-workspace-streamline/00-synthesis-and-limits-probe.md` with a pending-amendment note on `../architecture/adr/007-ai-routing.md`. ADR-007 pins exactly one model (the one measured to coexist with DuckDB-Wasm) and D40 gates any local accuracy number shown to a user. Blocks nothing in v0.70.

- Is Settings a tab or an overlay?
  - **An overlay modal** (D73, §13.3) — this rejects the earlier "Settings tab" line in favour of what the code ships (`AISettingsPanel`). Export is the opposite call: still a **tab**, with only its entry point moving to the title-bar cluster.

- How do tabs remember state when I switch away?
  - `../../DATASCOPE.md` §13.3, D71 — keep-mounted is the v0 norm; restore-from-spec is per-type opt-in.
  - **Amended 2026-07-29:** tab-list serialization is no longer deferred to the D61 hosted-tier round — v0.70 S6.9 persists `tabs`/`activeTabId` locally so the strip survives a refresh. Cross-device sync is still D39/D61's. `../build/14-workspace-streamline/07-workspace-persistence.md` scope call 6.

- Does my workspace survive a refresh / where is my data stored on my machine?
  - `../../DATASCOPE.md` §5.2 (the client-side-persistence bullet, amended 2026-07-29 at Revised(18)), §18 and §22's re-split criteria; `../build/14-workspace-streamline/07-workspace-persistence.md`.
  - Short answer: yes, always on, no opt-in. Dataset **bytes** → OPFS; registry **metadata** (catalog, profiles, classifications, tabs, selection, relationship overrides) → `localStorage`; **rows never** reach `localStorage`/cookies. "Clear workspace data" empties both. **No egress claim changed** — OPFS is inside the browser; D2, D21, D23, D52 and D39/D61 are all untouched.
  - Not everything is stored: sampled-tier files, API tables (`sourceUrl` re-fetch instead), derived tables (`generatingSql` replay) and D62 viewer sessions are not durable as bytes. On reload the engine is the source of truth and the registry is a claim — an unrecoverable table is shown as needing a re-drop, never as a queryable row.

- Where is AI consent in the Workbench / where did the first-run chooser go?
  - `../../DATASCOPE.md` §5.1 (shell-conditional: the current shell keeps the chooser; the Workbench renders flat mode switches + "Configure workspace"), §5.2 (egress modes never persist across sessions), D2/D71; `../build/06-ai/02-modes-byok.md`.
  - Note: an earlier ideation proposal — a per-upload data-handling gate (formerly `UI-REDESIGN-LIFECYCLES.md` §4/§7, deleted post-v0.69) — was considered and **superseded** by the shipped flat-switch model (AI-V2 review, Change A). History only, not live design.

- Can I send actual data rows to the AI for a better answer (D72)?
  - `../../DATASCOPE.md` §5.2, §11.3, D72 (deeper cloud grounding — graduated, hard-capped, per-session, transmit-only; never the whole dataset); `../build/06-ai/03-privacy-disclosure.md`.

- What is viewer mode?
  - `../../DATASCOPE.md` §13.3, D62/D63 — the read-only Workbench shell over a `?share=` URL or dropped `.dsps`; `../build/08-persistence/03-dsps-spec.md`.

- How does the Workbench behave on small viewports / tablets?
  - **Open, explicitly deferred (2026-07-24, owner call — not prioritized).** No decision in master or the build tree yet; the SqlErd "optimized for desktop" precedent vs. a Phase 6 tablet commitment is unresolved. Formerly tracked at `UI-REDESIGN-SPEC.md` §9 item 7 / `UI-REDESIGN-PLAN.md` §5 item 7, both deleted post-v0.69 — this bullet is now the only record of the open question; resolve it here or in master (§13.3) when picked up.

### 4) Ingestion / file input questions

- What file types are supported?
  - `../../DATASCOPE.md` §7.1, §7.3, §7.5.

- Is XLSX supported?
  - `../../DATASCOPE.md` D8 (not in MVP).
  - `../backlog/xlsx-sqlite.md`.

- Does it support folders / multi-table ingestion?
  - `../../DATASCOPE.md` §7.5, D13.

- Can it connect to APIs or live databases?
  - `../../DATASCOPE.md` §7.4, D6, D34.

- Why is live DB connectivity deferred?
  - `../../DATASCOPE.md` D6.
  - `../backlog/live-db-bridge.md`.

- What is the CORS relay?
  - `../../DATASCOPE.md` §7.4, §23.1.
  - `../build/07-connectivity/02-api-tier2-relay.md`

- Why is the vault for secrets deferred or limited?
  - `../../DATASCOPE.md` D4, D9.
  - `../build/09-edge/03-vault.md`
  - `../backlog/tier3-vault-ingestion.md`

- What happens if a file is too large for the browser path?
  - `../../DATASCOPE.md` §7.3, D16, D39.
  - `../backlog/temp-staging.md` (>500MB R2 staging, deferred).

- What is `httpfs` bucket-first mode?
  - `../backlog/httpfs-bucket-mode.md` (§20.3 rung 1, §3.3, §7.1).

- Can DataScope analyze unstructured data (documents, images) or semi-structured data (logs)?
  - Unstructured (prose/images/audio): not supported, and deliberately not attempted without AI — deterministic methods yield metadata only, not understanding (D32).
  - Semi-structured (logs, key-value blobs, messy JSON): designed but deferred — deterministic log-template clustering + regex field extraction, no AI, registers as an ordinary table. `../../DATASCOPE.md` §7.1, §20.14, D66; `../backlog/semi-structured-ingestion.md`.

### 5) SQL and query questions

- Is SQL the main interface?
  - `../../DATASCOPE.md` §10, §11, D53.

- What SQL dialect does the app use?
  - `../../DATASCOPE.md` §10, `system-design.md`.

- How does the SQL playground behave?
  - `technical-overview.md` §1.

- Can the app suggest queries or task-shaped answers?
  - `../../DATASCOPE.md` D53, §10 Module 2.

- Why does the app have a pivot/cross-tab no-SQL path?
  - `../../DATASCOPE.md` D53.

### 6) AI questions

- What is the analyst layer / the operation catalog?
  - `../../DATASCOPE.md` §11.5, §19 v0.71, D74.
  - `../build/15-analyst-layer/README.md` (phases A0–A6).

- Is MCP allowed? Over what data?
  - **D74 amends D38.** The gate binds *transport reach*, not the protocol: in-process MCP
    (`InMemoryTransport.createLinkedPair()`, both ends in the page) over browser-local data is
    unrestricted; **any** process boundary — stdio, listener, relay, Streamable HTTP, companion —
    re-arms D38's staging gate. `../architecture/decisions.md` D38 + D74.
  - Stage A's shipped `/mcp` Worker route (shared DSPS artifacts) is separate and is **not**
    extended into the analyst catalog: `../build/09-edge/`, `edge/handlers/mcp.ts`.

- Can Claude Desktop / an external agent reach my dataset?
  - Not today — **deferred, not blocked** (D74e). A tab cannot accept an inbound connection, so it
    needs an outbound relay or a companion process owning its own engine. Both are D74b, both need
    their own ADR. `../build/15-analyst-layer/05-mcp-server.md`.

- Does the AI transcript persist?
  - **Yes, locally, since D74g (amends D41).** Local-at-rest, **not egress** — the "nothing leaves
    your browser" claim is unchanged. Ships with a clear-history control, no persistence in D62
    viewer mode, and the D46 sensitivity caveat. `../foundations/privacy-model.md`, §5.2.

- Why can the AI chat only run one query / show 20 rows today?
  - Four shipped defects, verified 2026-08-02 — `../build/15-analyst-layer/04-tool-loop.md` (A4).

- What are the three AI modes?
  - `../../DATASCOPE.md` §5.1, D2.
  - `../foundations/privacy-model.md`

- What leaves the browser in local-only mode?
  - `../foundations/privacy-model.md`.

- What leaves the browser in cloud mode?
  - `../foundations/privacy-model.md`.

- Why is the first-run AI chooser important?
  - `../../DATASCOPE.md` D2.

- How does the NL→SQL pipeline work?
  - `../../DATASCOPE.md` §11, `technical-overview.md`.

- Why is the AI surface intentionally narrow?
  - `../../DATASCOPE.md` D32, D47.

- Why is there no generic RAG or vector storage plan?
  - `../../DATASCOPE.md` D32, D47, D66 (D66 extends the boundary to log/semi-structured template extraction — still not RAG).

- What is the eval harness and why is it needed?
  - `../../DATASCOPE.md` D40.

- What is the content-free observability story for AI?
  - `../../DATASCOPE.md` D25, D41.

- How do we see how people actually use the app (without collecting content)?
  - `../../DATASCOPE.md` §20.13, D60 (usage-shape view — a reading layer over the D25/D41/§18
    counters; deferred, trigger-gated on v0.5 + green steering bars); `../backlog/operational-insight.md`.

### 7) Privacy and security boundary questions

- Does the app upload raw rows?
  - `../../DATASCOPE.md` §5, §7, D23.
  - `../foundations/privacy-model.md`

- Is the app truly local-first?
  - `../../DATASCOPE.md` §1, §5.

- What is the privacy boundary for AI mode?
  - `../foundations/privacy-model.md`.

- Why does the app avoid saying “anonymized” or “GDPR-safe” for share artifacts?
  - `../../DATASCOPE.md` D21.

- What is the PII detector’s role?
  - `../../DATASCOPE.md` D46.

- Can we store users’ DSPS/structure to the cloud to speed things up or learn usage?
  - `../../DATASCOPE.md` §4 non-goal, D59 (silent/default harvesting rejected — local cache, content-free counters, or D39 opt-in staging instead); `../product/rejected-ideas.md`.
  - The sanctioned usage-insight alternative: §20.13, D60; `../backlog/operational-insight.md`.

- What does the security model protect against?
  - `../foundations/security-model.md`.

- Why is the `/security` page important?
  - `../../DATASCOPE.md` D50.
  - `../foundations/security-model.md`

- How does an organisation verify and file trust (the "approval kit")?
  - `../../DATASCOPE.md` §23.2, §24.4, D63 (published build provenance + signed `.dsps` + third-party audit, bundled with the D50 self-host zip); `../foundations/security-model.md`, `../foundations/infrastructure.md`.

- Why do headers like CSP and COOP/COEP matter?
  - `../foundations/security-model.md`.

### 8) Architecture questions

- What is the browser-native architecture?
  - `../../DATASCOPE.md` §6.
  - `technical-overview.md`.

- What is DuckDB-Wasm doing here?
  - `../../DATASCOPE.md` §6.
  - `technical-overview.md` §3.

- What is the `QueryEngine` boundary?
  - `../../DATASCOPE.md` D49.
  - `../architecture/system-design.md`

- What is the `ViewSpec` seam?
  - `../../DATASCOPE.md` D55, D56.
  - `../architecture/system-design.md`

- What are the core architectural interfaces, and the rule that keeps them small?
  - `../../DATASCOPE.md` §6, D58 (QueryEngine / ViewSpec / DSPS + the no-parallel-pipelines principle).
  - `../architecture/system-design.md` ("Three stable interfaces and the coherence principle").

- Is the table registry a first-class component?
  - `../../DATASCOPE.md` §6, §16, D58 (`lib/registry.ts`; catalog over the QueryEngine).

- How does the AI pipeline relate to DSPS?
  - `../../DATASCOPE.md` §11.1 stage 2, D58 (schema-pruner consumes a pruned DSPS fragment — one substrate, two views).

- How is cancellation handled (abort, superseded request, worker restart)?
  - `../../DATASCOPE.md` §21.6, D58; `../architecture/data-flow.md` (cancellation/lifecycle class).

- Why does the renderer never execute model output?
  - `../../DATASCOPE.md` D55.

- What is the role of the Capabilities Broker?
  - `../../DATASCOPE.md` §9.

- What are the major modules?
  - `../../DATASCOPE.md` §10, §13, §16.

### 8a) Technical stack rationale (pending ADRs — not settled)

These document *what the decision must cover*, not a resolved answer — each ADR's `Status:` line says "Pending" until the relevant build phase produces spike evidence (D18). Cite them as open questions, not conclusions.

- Why does DuckDB-Wasm run in a dedicated Web Worker?
  - `../architecture/adr/001-duckdb-wasm-worker-setup.md` (pending).
- What state-management library does the app use?
  - `../architecture/adr/002-state-library.md` (pending).
- Does the app use React Query for worker/async communication?
  - `../architecture/adr/003-react-query.md` (pending).
- How is Monaco integrated?
  - `../architecture/adr/004-monaco-integration.md` (pending).
- Why Recharts and D3 both — what's the split?
  - `../architecture/adr/005-recharts-d3-split.md` (pending).
- What is the edge stack built on?
  - `../architecture/adr/006-edge-stack.md` (pending).
- How does AI request routing work under the hood?
  - `../architecture/adr/007-ai-routing.md` (pending).
- What SQL parser powers linting/autocomplete?
  - `../architecture/adr/008-sql-lint-parser.md` (pending; re-verify Appendix A's library survey first).
- What is the Terraform layout and state backend?
  - `../architecture/adr/009-terraform-state-backend.md` (pending).
- How does a workspace survive a refresh — where do dataset bytes actually live?
  - `../architecture/adr/011-workspace-persistence-storage.md` (accepted 2026-07-29): staged
    source bytes in OPFS written through a **worker** sync access handle, re-registered into a
    still-in-memory engine on load. DuckDB is **not** opened against OPFS — it reopens read-only
    whenever its WAL is empty at close. Phase detail:
    `../build/14-workspace-streamline/07-workspace-persistence.md`; master §5.2 Revised(18).

### 9) Release, roadmap, and future direction

- What ships in v0 vs v0.5 vs v1?
  - `../README.md`
  - `../../DATASCOPE.md` D15, §19.

- What is the Studio arc, and what's actually scheduled?
  - `../../DATASCOPE.md` D12, §19, §20.6, §20.8. **Phases 7–8 cut to backlog 2026-08-02**
    (D11/D14 amendments, Revised (19)) — only Phase 9 remains, itself already unscheduled.
    Relationship-graph's preserved remainder: `../backlog/relationship-graph-erd-ideas.md`.

- What is the Drift Report?
  - `../../DATASCOPE.md` D44.

- What is the platform ladder / which surfaces get built, in what order?
  - `../../DATASCOPE.md` §19, §20.10, D61 (browser → opt-in hosted tier → desktop → rest on request; React reaffirmed; CLI pull-forward rejected); `../product/roadmap.md`.

- What is the hosted tier, and what is its privacy-and-deletion promise?
  - `../../DATASCOPE.md` §5.2, §20.10, D39, D61 (the chartered second platform rung + commercial arc; opt-in, TTL, delete-on-demand, no training on user data); `../backlog/temp-staging.md`, `../backlog/monetization.md`.

- What is the desktop charter and why is it deferred?
  - `../../DATASCOPE.md` D51, D61 (rung 3, after the hosted tier ships; air-gap early-pull exception).
  - `../backlog/platform-pwa-ios.md`

- Why are AI view composition and dynamic UI not the product identity?
  - `../../DATASCOPE.md` D55, D56.

- What ML modules are designed but deferred?
  - `../../DATASCOPE.md` §20.1.
  - `../build/11-ml/README.md`

- How will the product be monetized, if the core is free?
  - `../../DATASCOPE.md` D28, D36, D61, §20.10 (the hosted tier is the chartered commercial arc).
  - `../backlog/monetization.md`

### 10) Questions a peer reviewer would ask

- What is the real product moat?
  - `../../DATASCOPE.md` §3.3, §3.4, §3.5.

- Why does the app avoid being a generic AI assistant?
  - `../../DATASCOPE.md` D12, D32, D42.

- Is there any server-side execution in the current product surface?
  - `../../DATASCOPE.md` §1, §6, D39, D61 (only the opt-in hosted tier — the chartered second platform rung, design-round-gated, never the default).

- Is the architecture constrained by the privacy story or just aligned with it?
  - `../../DATASCOPE.md` §5, §23, `privacy-model.md`.

- What assumptions are still unverified before build?
  - `../../DATASCOPE.md` D18, §21, `../README.md`.

- What ideas were considered and explicitly rejected, and why?
  - `../product/rejected-ideas.md`
  - Adjacent/alternative concepts still in the ideation pile: `../backlog/adjacent-tool-concepts.md` (§20.12).

---

## Quick answer map

### For product identity
- `../../DATASCOPE.md` §1, §2, §3
- `../../DATASCOPE.md` D12, D22, D23, D52
- `../product/vision.md`

### For privacy and no-upload claims
- `../foundations/privacy-model.md`
- `../../DATASCOPE.md` §5
- `../foundations/security-model.md`

### For architecture and modules
- `../../DATASCOPE.md` §6, §9, §10, §13, §16
- `../architecture/system-design.md`
- `../architecture/data-flow.md`

### For build sequencing and implementation details
- `../README.md`
- `../build/**/README.md`
- `../architecture/decisions.md`

### For engineering constraints (perf, testing, samples)
- `../foundations/performance-budgets.md`
- `../foundations/testing-strategy.md`
- `../foundations/sample-datasets.md`

### For the roadmap and strategy
- `../product/strategy.md`
- `../product/competitive-landscape.md`
- `../product/roadmap.md`

### For deferred, rejected, or backlog work
- `../product/rejected-ideas.md`
- `../backlog/*`
- `../build/11-ml/README.md`

---

## Rule of thumb for any future agent

If the question is about the product story, the target audience, the trust model, or the reason the app exists, answer from `../../DATASCOPE.md` first.

If the question is about the actual implementation shape, browser behavior, edge services, or build order, answer from `_implementation/` first.

If the question is about a decision or design constraint that has already been settled, answer from the decision record in `../architecture/decisions.md` and the cited master spec sections.

If the question is about *why a specific library was chosen*, check `../architecture/adr/*` first, but flag that most ADRs are still pending — don't state a draft rationale as if it were decided.

If the question is about something designed but not scheduled, check `../backlog/*` and `../product/rejected-ideas.md` before assuming it isn't planned at all — deferred is not the same as rejected.
