# Distribution & Audience Strategy

**Master spec:** §3.5 (strategy), §3.4 (competitive map), §24 (launch strategy & evidence
plan), §18 (steering bars), §0 D20–D36, §20.10 (monetization seams), §20.11 (deferred share
tiers).
**Companion:** [`competitive-landscape.md`](competitive-landscape.md) — the research this
strategy rests on, and the pre-written competitor-response scenario (§24.3).

## The one-sentence thesis

Nobody owns: **"drop a pile of files → understand their structure → shareable → no upload,
no login."** DataScope claims it by being first, fastest, and free in that lane — the
drawDB/excalidraw/regex101 playbook pointed at a higher-value output.

## Audiences (D22/D23) — one build, one lead voice

DataScope is a **product measured in users, not a portfolio demonstration** (D22); the
multi-audience plan is positioning, not code:

| Audience | Role | What they get |
| :--- | :--- | :--- |
| **Privacy-constrained data worker** (regulated finance / healthcare / government — cannot upload, cannot share raw data) | **Lead audience; owns the launch narrative (D23)** | "Analyze and share the shape of data you can't put anywhere" — the D20/D21 share tiers, proof-not-promises ("no upload, by construction — check DevTools") |
| **Parquet-first data engineer** | Explicit second audience — served, not co-headlined | Zero-install workbench/profiler for files that never touch a warehouse |
| **Data & business analysts**, students, everyone else | The free funnel — now with a **no-SQL floor** (D53) | Pivot / cross-tab, guided task-shaped answers, take-it-with-me exports (§10, §12.2): the business analyst gets answers without SQL, the data analyst a zero-setup workbench — served product-surface, never a co-headline |

Language discipline is D21's everywhere: never "compliant," never "anonymized" — always
*"no upload, by construction."*

## Launch-copy frame (D52) & the structure × time arc

The headline sells the **inherited-data moment** — *someone just sent you data you don't
understand* — because "people who inherit data" (consultants, auditors, journalists, data
engineers on legacy systems, analysts joining a company) *contains* both the launch channel
and the regulated beachhead, widening the channel without moving D23. **Privacy is the
standing permission line** ("nothing leaves your browser — check DevTools"), not the headline.
The product arc is **structure × time** — "know what your data is; know what changed" — v0
shipping *structure* and v0.5 adding *time* via the Drift Report (D44). Beachhead, GTM focus,
and the D21/D23 audience and language rules are unchanged: **D52 fixes the frame; actual draft
launch copy is deferred execution work, not written this round.**

The Drift Report is the product's **retention mechanic** — it converts the one-shot structure
report into a repeated ritual ("re-drop the new export, see what changed"). So at **v0.5
planning** the steering view adds one crude return signal — **CDN repeat-visitor rate** — as a
note reusing D25's content-free CDN counts (§18), because retention now needs a visible needle;
the §18 steering-bar values themselves are unchanged.

## Two rails, one engine (D28/D33)

**The local core loop is free forever (D28)** — ingest, profile, SQL, charts, insights,
quality report, structure-report export; paid only ever follows real server-side cost or
team value (§20.10). Growth extends the ladder without replacing the identity:

```
Enterprise rail: free structure tool → privacy-safe shape sharing → team semantic layer
Consumer rail:   personal templates (D30) → token-API connections (D34)
                 → cross-platform workbench (D35) → Pro conveniences (D36, deferred)
```

**Why the consumer rail is safe to run (D33).** Personal-analytics aggregators died for 15
years (Exist.io, Gyroscope, Zenobase, the Quantified-Self generation) of novelty churn,
cloud custody, and per-user infra cost. Local-first kills custody outright and makes a
consumer session cost ~nothing to serve — curiosity traffic that bankrupted venture-backed
aggregators is here **free funnel**. Novelty churn stays true and doesn't matter: the
consumer rail doesn't have to carry the company, and a one-session visitor who posts a
screenshot (D26 attribution) has already paid their way. Prosumer traffic needs
screenshots, not retention. Note: prosumer population figures are narrative-grade, unverified —
never launch copy.

**Waves (D23/D30/D35):** the **Oct 6 launch belongs to the D23 narrative** (Show HN, dev
rooms, sovereignty story); consumer templates ship in v0 but unmarketed; the **consumer
wave is a separate Wrapped-season moment** (late Nov–early Dec); cross-platform combos are
wave 3's headline, gated on D30 traction. The homepage stays product-led; `/spotify` and
`/google-takeout` are side doors.

## Where DataScope does NOT compete (per §3.4, D32)

- **Scale/warehouse** (MotherDuck) — funded, DuckDB core team.
- **Notebooks/collaboration** (Hex, Count, Deepnote) — team SaaS.
- **BI/metrics platforms** (Rill, Evidence, Cube) — different artifact and buyer.
- **Generic chat-with-CSV** (ChatGPT ADA, Julius, …) — commoditized; frontier labs give it
  away. Consistent with D12: chat is a supporting module, never the identity.
- **Chunking/RAG plumbing (D32)** — a named §4 non-goal, no revive trigger. The AI-facing
  surface is DSPS + "Copy for AI" client-side by default (§12.2, D31), plus the D38 MCP
  surface over shared or explicitly staged artifacts only: deterministic structural chunking
  via client-side DuckDB-Wasm, not text chunking — complementary to the LLM tools, not
  competitive with them. DSPS itself is promoted to a first-class, open, versioned interface
  (D37); the D32 no-RAG boundary is unchanged.

## The axes DataScope wins on

1. **Time-to-first-insight ≈ 0.** Every funded competitor gates behind login + cloud
   workspace. Useful-in-five-seconds with no account is a category of its own and the one
   axis a solo builder beats every funded player on. → The bundled-sample guided tour
   (§14, Phase 6 pull-forward) is a **launch gate**, not polish.
2. **Shareable output.** Incumbents bury artifacts behind auth. The structure report as a
   public link (D20) is the viral loop; per **D26** it is designed to be screenshotted and
   carries a tagged attribution footer, so every report in a ticket, PR, or inbox recruits
   the next user. v0: client-side HTML/DSPS export. v0.5: hosted structure-only share.
3. **Structure inference done deeply.** The genuinely hard, genuinely rare thing (§3.3).
   The D17 spike de-risks it early; a thin **Join Graph (beta)** slice ships in v0 (D24);
   Phases 7–9 are the destination.
4. **Private by default.** Weak revenue wedge for students; strong one for regulated
   users — which is exactly who the §20.11 tiers and the §20.10 seam serve later.

## Launch strategy (§24) — the four plays

1. **Kill-the-wifi demo** *(v0 gate — §24.1 Play 1).* Load page → drop Parquet folder →
   tables profile → Join Graph assembles → **visibly toggle wifi off** → keep querying →
   *"your data never left this laptop."* The launch video, homepage hero, HN post, and
   99-second pitch; a no-graph variant is maintained in parallel (D24 fallback).
2. **Make the score a noun** *(Phase 7 / v1 forward commitment — explicitly NOT v0).* The
   only v0 obligation: the structure report shares the score's visual design language.
3. **Own a searched question** *(v0 gate; re-aimed 2026-07-12).* `/parquet-viewer` is demoted
   — the viewer/profiler cottage lane (§3.4) commoditized that intent — so the launch set is
   **`/schema-diagram` (flagship) + `/csv-profiler` + `/ai-context`** (the N4/P4 front door for
   the already-v0 "Copy for AI" surface, D31), with `/parquet-viewer` kept only as a cheap
   extra (cut-order item 3). Each embeds the drop zone and doubles as the devlog surface so SEO
   compounds; `/schema-diagram` falls back to `/parquet-to-csv` only if the D24 slice is killed
   on its own kill criteria. Copy exploits the definitions-vs-data honesty gap (§3.4).
4. **The artifact travels** *(v0 gate; D26's execution).* Design pass + attribution loop;
   long game: "send me the DataScope report" becomes how data teams describe shape — the
   format play (DSPS as an open, versioned spec — D31/D37; the Swagger/OpenAPI arc).
   **The receiver closes the loop (D62):** "just send me the .dsps" is a two-sided verb —
   reflex only once the receiver is zero-friction, so the universal `.dsps` receiver (§13.1 —
   any artifact renders read-only, no data/login/install) turns every `.dsps` in an inbox or
   ticket into a live landing page. **Format-first (D64):** DSPS is the platform and the app its
   flagship client — a published JSON Schema + npm validator/parser library let third-party
   tools consume DSPS; formats are adopted by *encounter*, not decision.

**The three adoption reflexes (D48/D20/D62).** The artifact-travel loop's copy skeleton, the
companion to the workflow ladder below: **received data → datascope it** (D48) · **about to
send → send the shape** (D20/D31) · **received a `.dsps` → open it** (D62).

**Launch-copy skeleton (D57, §24.1).** When D52's deferred draft copy is written, it follows
the five-step workflow ladder — **drop → Dossier → ask (or one-click guided task) → answer →
take it with you** — each step naming the surface that kills a §3.0 time sink (D48, D53,
D20/D31). Sell the ladder, not a feature list; the D52 frame is unchanged.

**Launch-content note — "LLM-guessed vs. computed" (devlog/social).** A recurring content
angle, not a build item: the side-by-side of what an LLM *guesses* about a dataset (plausible,
unverifiable, sometimes wrong) against what DataScope *computes* deterministically (evidence +
confidence, D45) — the honest case for "run DataScope before ChatGPT" as complementarity, not
competition (D31/§3.4). Feeds the devlog list; no spec surface of its own.

**Date & referee (D27):** v0 launches **Tuesday, October 6, 2026 — date fixed, scope
flexes**; cut order (**re-ranked 2026-07-12**): consumer templates + pages → tour polish
beyond the D15 minimum → extra landing pages → **Join Graph slice (last-cut, cuttable only by
its own D24 kill criteria)** (§19) — the graph is the sole unclaimed capability (§3.4), so it
is protected from schedule-driven cuts. Month-1 steering bars live in §18 (reach / organic
floor / artifact travel / beachhead pull; ≥ 2 of 4 → v0.5; 0 of 4 → stop and re-examine
D22/D23).

## Evidence plan (§24.2)

| Gap | Manufactured by |
| :--- | :--- |
| No traction | Plays 3 + 4 = compounding baseline; Play 1 = the spike; D25 counters make the graph observable; §18 bars referee it |
| Solo founder | Build in public in named rooms; velocity signal replaces team-size signal |
| No willingness-to-pay evidence | The wifi demo magnetizes users who can't use anything else; collect inbound *"can we use this for [regulated thing]"* + ~10 discovery interviews — don't charge yet |
| Market-size story | The format play: free structure tool → privacy-safe shape sharing → team semantic layer — "the collaboration layer for data that can't leave the building" |
| Timing / MotherDuck | §24.3 counter-positions + D27's fixed date |

**Venues:** primary — the DuckDB community (Discord, duckdb-wasm GitHub Discussions);
secondary — Show HN + the strongest devlogs on the app domain, cross-posted to X. Cadence:
weekly, shipped-something-first — no shipped change, no devlog.

## GCC / Dubai motion (§24.4 — near-term, pre-raise)

Data sovereignty is a first-class obsession in the Gulf; in DIFC/ADGM-regulated finance,
government, and healthcare, "no upload, by construction" is a **market-access feature**.
Sequence: networking passes now → no pitch stage until the demo exists (the 99-second
formats fit the wifi-kill script) → bring live demo + one-pager + exported structure report
→ **the ask is three design partners** in banking/government/health, not money. Venue list
in master §24.4 (July 2026 snapshot — re-verify before booking).

**The approval kit (D63) — the leave-behind for organisational adoption.** Trust for orgs must
be *filable*, not just demonstrable: "check DevTools" convinces the individual, not the CISO.
The kit is the self-host zip (D50) + `/security` page + **published build provenance** (bundle
hashes + SLSA-style attestation, so anyone verifies the hosted bundle is byte-identical to the
audited source) + **signed-`.dsps`** docs (D45 provenance labels gain a verifiable signature —
"genuine, unmodified DataScope profile of file-hash X," never "this data is safe," D21) — the
one link a champion forwards to security to get DataScope blessed org-wide. The **third-party
security audit** is a GTM expense, founder-triggered off the first serious design-partner
conversation, no date.

**The zero-approval sovereignty ladder (D50/D51)** is the enterprise/GCC narrative:
**web (zero-approval)** → **self-host zip** (a versioned static build + an `/security` page
enumerating the complete network surface — "unzip onto your intranet," the cheapest answer to
data-residency; D50) → **desktop** (air-gap signed installer, Tauri + native-DuckDB sidecar,
D51). The §24.4 leave-behind gains the rung diagram and D50 is its proof artifact. Both the
zip and desktop are *surfaces*, not differentiators (Duckling/Duckle already occupy the
desktop lane) — ②, the Drift Report, and the travelling artifact differentiate whatever the
shell; the web app stays the funnel and the identity. **Two ladders, not one (D61):** this
sovereignty/trust ladder is distinct from the D61 *surface-investment* ladder (browser → hosted
tier → desktop → rest on request). The opt-in **hosted tier joins this trust ladder nowhere** —
it is the scale-up path, never the sovereignty story, never the default.

## Honest assessments (recorded so they aren't relitigated)

- **Moat:** combination + packaging, not technology. Every individual capability exists
  somewhere (§3.4). Defense is distribution, speed, brand. Head start, not fortress.
- **Venture posture (D22/D28, replacing the old "portfolio piece" framing):** DataScope is
  a product with a normal free-now/paid-seams-later posture. The beachhead with budgets is
  the privacy-constrained seam; evidence (traction, design partners, quotes) is
  manufactured by the §24 plays, not waited for. Pricing itself is deferred (D36) until
  the product is ready; §20.10 records the seams so pricing pressure never warps the
  architecture.
- **Dual-purpose governance (D42):** DataScope is a product first; that it also demonstrates
  hard engineering is a side effect, not a purpose (D22). Any feature justified partly by
  portfolio/hireability value must pass a falsifiable test — *"would we build this, at this
  cost and this point in the sequence, if the job market did not exist?"* — an honest **no**
  fails it. The judgment is made at **human triage**, never self-certified by the proposing
  document; a dual-purpose item must independently clear §4 minimal-surface and must not move
  D27's date or the D15/D27 cut order. Recorded: **AI-into-v0 re-sequencing was reviewed and
  rejected (2026-07-12)** — the launch AI signal is the already-v0 "Copy for AI" renderer
  (D31). Not re-litigated without founder instruction.
- **Anonymization claims:** never made (D21). "Structure only — no data rows included" is
  true by construction; suppression/redaction *reduces* re-identification risk. The words
  "anonymized / de-identified / GDPR/HIPAA-safe" do not appear in UI or marketing —
  re-identification is adversarial and well-studied, and one counterexample torches the
  brand ([sources](competitive-landscape.md#sources)).

## What the sharing round changed (July 11, 2026 — D20/D21)

| Change | Where |
| :--- | :--- |
| Structure-report export (client-side HTML/JSON) added to v0 | D20, §12.2, §19 Phase 3 |
| Hosted share defaults to structure-only artifact; raw-rows share = labeled escalation | D20, §12.3, §19 Phase 5 |
| Column-name redaction + rare-category suppression controls | §12.3 |
| Share-privacy language rule | D21, §5.2, §12.3 |
| Aggregate-stats + synthetic-replica tiers designed-and-deferred | §20.11, [`../backlog/shape-share-extensions.md`](../backlog/shape-share-extensions.md) |
| Privacy-constrained sharing recorded as a monetization seam | §20.10, [`../backlog/monetization.md`](../backlog/monetization.md) |

## What the launch revamp changed (July 11, 2026 — D22–D36)

| Change | Where |
| :--- | :--- |
| Product-not-portfolio identity; recruiters removed; lead audience named | D22, §2, §3.3, §3.5 |
| Beachhead owns the launch narrative | D23, §14, §24 |
| Join Graph (beta) joins v0, kill-criteria-governed | D24, §19 Phases 1/3, [`../build/05-charting/05-join-graph-beta.md`](../build/05-charting/05-join-graph-beta.md) |
| Content-free traction counters + CDN visitor counts | D25, §5.2, §23.5 |
| Report design bar + attribution footer | D26, §12.2 |
| Launch date Tue Oct 6, 2026; cut order; steering bars | D27, §18, §19, §21 |
| Free-forever local core | D28, §3.5, §20.10 |
| Claimable share links deferred | D29, §12.3 |
| Consumer template channel (Spotify, Takeout) + ZIP ingestion, two-wave launch | D30, §7.5, §14, §19 |
| DSPS + "Copy for AI" | D31, §12.2, §19 Phases 1/3 |
| No-RAG boundary | D32, §4 |
| Prosumer rail recorded | D33, §3.5 |
| API connections by auth reality | D34, §7.4, §19 Phase 5 / v1 |
| Cross-platform combos (v1, traction-gated) | D35, §19 v1 |
| Monetization sketch deferred until product-ready | D36, §20.10 |

Deliberately **not** changed: the §5 privacy model and every disclosure rule, the D21
language rule, the minimal enumerated server surface (§1) and edge-independent core (§4),
Studio-arc sequencing (D24 pulls a slice, not the arc), and free-for-now (D28 strengthens
free).

## What the AI-surface round changed (July 12, 2026 — D37–D43)

| Change | Where |
| :--- | :--- |
| DSPS promoted to a first-class, open, versioned interface (`dsps_version`, compat/degradation) | D37, §1, §6, §12.2, [`../build/08-persistence/03-dsps-spec.md`](../build/08-persistence/03-dsps-spec.md) |
| Two-stage MCP surface — stage A serves DSPS read-only over shared artifacts (v0.5); stage B tools over staged datasets only (v1+) | D38, §11.2, §12.2, [`../build/09-edge/`](../build/09-edge/) |
| Opt-in hosted data staging + deferred server-side-execution design round (revives D16 per its clause, R2-only) | D39, §7.3, §5.2, §20.10, §23.5 |
| Dev/CI NL→SQL eval harness gating the v0.5 Phase-4 ship (TypeScript by default) | D40, §11.4, §18, §19 Phase 4 |
| Content-free numeric LLM metrics extend the D25 counters; §11.1 transcript = the client-side trace | D41, §23.5, §11.1 |
| Dual-purpose governance (falsifiable test, human triage) + AI-into-v0 re-sequencing rejected | D42, §24.5, §19 |
| Local-model honesty guardrail (spike-gated in-browser claims) | D43, §5.1, §11.2, ADR-007 |

Deliberately **not** changed by this round: product identity and launch narrative (D12/D22/
D23 — DSPS promoted as an *interface*, not a re-centering on "the layer agents consume"), the
D32 no-RAG boundary, the D27 date and the D15/D27 cut order, and the local-first default
(staging is never a silent fallback). New decisions expand *capability*, not identity.

## What the ideation-consolidation / viability round changed (July 12, 2026 — D44–D52)

| Change | Where |
| :--- | :--- |
| Drift Report — aggregate dataset-version value-change report (inferred keys, folder-aware, PSI/KS, aggregate-only); the retention mechanic and pillar #2 of structure × time; v0.5 first post-launch ship | D44, §20.8, §19 v0.5 |
| DSPS fact provenance — snapshot labels + provenance tags, "verified" banned, structural/quality only, stateless-per-run | D45, §12.2, [`../build/08-persistence/03-dsps-spec.md`](../build/08-persistence/03-dsps-spec.md) |
| PII detection = share-flow suppression assist, positives-only, never a clearance verdict | D46, §12.3, §19 Phase 5, [`../build/08-persistence/02-r2-save-share.md`](../build/08-persistence/02-r2-save-share.md) |
| D32 clarification — deterministic SQL-derived fact list with evidence ≠ RAG; non-goal unchanged | D47, §4 |
| Dataset Dossier — v0 post-ingest overview surface; internal degrade-to-per-table cut line | D48, §13, §19 Phase 3 |
| `QueryEngine` interface — engine-agnostic core (profiling/classification/insight/DSPS written against it) | D49, §6, §19 Phase 1 |
| Self-host release zip + `/security` page — sovereignty-ladder rung 2 | D50, §23, §24.4 |
| Desktop client charter (Tauri + native-DuckDB sidecar behind D49); post-v0.5, trigger-gated, free forever | D51, §20.9, [`../backlog/platform-pwa-ios.md`](../backlog/platform-pwa-ios.md) |
| Launch-copy reframe — inherited-data headline, privacy = permission line, structure × time; **draft copy deferred, not written this round** | D52, §2, §3.5, §24 |
| Competitive map refresh (viewer/profiler + CSV-diff cottage lanes, SplitForge, Duckling; intersection now survives on ② alone) | §3.4, [`competitive-landscape.md`](competitive-landscape.md) |
| Play 3 re-aim (`/schema-diagram` flagship + `/ai-context`; `/parquet-viewer` demoted); D27 cut order re-ranked (graph last-cut, D24-criteria-only) | §24.1, §19, D27 |

Deliberately **not** changed by this round: the D23 beachhead, GTM focus, and the D21/D23
language rules; the D27 date and its date-safety (the graph is now last-cut but still
schedule-protected, not schedule-cuttable); the §18 steering-bar values. Draft launch copy
is deferred execution work.

The round's **rejected** proposals — Form 2 team/org memory catalog, the "knowledge
server / verified fact / Git for data understanding" branding, the MCP identity re-center,
a DSPS "metric" fact type, `/parquet-viewer` as flagship, cell-level diff, and "no upload"
as the headline — are recorded with their reasons and surviving slices in
[`rejected-ideas.md`](rejected-ideas.md). The §3.0 problem framing (the invisible
context-gathering step this whole arc addresses) landed in the master and mirrors into
[`vision.md`](vision.md).

## What the analyst-completion round changed (July 13, 2026 — D53–D54)

The lever was usefulness, not a new differentiator: the §3.0 problem *is* the analyst's day
([`vision.md`](vision.md)), so the product was already analyst-shaped at its core but stopped
at the point the analyst takes the work elsewhere. This round closes that "no-SQL / take-it-
with-me" cliff **without** re-pointing the beachhead.

| Change | Where |
| :--- | :--- |
| Data/business analyst named an explicitly served audience (not a co-headline) | D53, §2, §3.5, [`vision.md`](vision.md) |
| Pivot / cross-tab — the no-SQL on-ramp; internal cut line to a guided GROUP-BY builder, cuttable *above* the Join Graph | D53, §10 M7, §19 Phase 3, [`../build/04-sql/06-pivot-crosstab.md`](../build/04-sql/06-pivot-crosstab.md) |
| Take-it-with-me exports — grid → CSV/Excel, chart → PNG/SVG, copy-SQL | D53, §12.2, [`../build/04-sql/03-results-grid.md`](../build/04-sql/03-results-grid.md) |
| Reproducible transform recipe — exportable/re-runnable generating SQL (one-click re-run v0.5) | D53, §12.1, [`../build/04-sql/05-transformation-layer.md`](../build/04-sql/05-transformation-layer.md) |
| Guided task-shaped answers — suggestions extend to analyst tasks (trend / top-N / period-over-period / outliers / cohort) | D53, §10 M2, §19 Phase 2, [`../build/04-sql/02-query-suggestions.md`](../build/04-sql/02-query-suggestions.md) |
| Personal metric layer + business-readable findings narrative | D54, §3.5, §20.6, §11 (v0.5+) |

Deliberately **not** changed: the D22/D23 beachhead and launch voice, the D52 inherited-data
frame, the D21 language rules, the §4 minimal server surface (all four v0 surfaces are
client-side), and the D27 date + cut order (the pivot is cuttable *above* the graph; the graph
stays last-cut). Analysts remain the free funnel — now with a no-SQL floor under them.

## What the analyst pain-point round changed (July 15, 2026 — D57)

An external positioning review ("two explicit journeys, analyst as hero, prosumer as real
product, less AI-first, workflow ladder") was triaged as **convergent validation, not a
pivot** — its core restates D12/D30/D33/D42/D48/D52/D53/D56. What it actually changed:

| Change | Where |
| :--- | :--- |
| **Rejected:** analyst-as-headline — "understand unfamiliar data fast, in-browser, no upload" is the commoditized §3.4 cottage-lane sentence; the D52 frame already *contains* the analyst and sells ② | D57, [`rejected-ideas.md`](rejected-ideas.md) |
| **Rejected:** prosumer-as-second-product-identity — contradicts D33's channel-not-identity economics; pre-launch investment in the first-to-drop cut-order item | D57, [`rejected-ideas.md`](rejected-ideas.md) |
| §3.0 names the **orientation tax**; the pain table gains *packaging the answer* (→ D53 exports; D54 narrative) and folds *refresh re-runs* into re-exploration (→ D53 recipe; D44 Drift Report) | D57, §3.0, [`vision.md`](vision.md) |
| Personal-data template **time-to-first-result bar** — real export ZIP → first template chart ≤ 2 min (v0 acceptance criterion while templates survive the D27 cut order) | D57, §18, [`../foundations/testing-strategy.md`](../foundations/testing-strategy.md), [`../foundations/sample-datasets.md`](../foundations/sample-datasets.md) |
| Five-step **workflow ladder** recorded as the skeleton for D52's deferred draft copy | D57, §24.1 (above) |

Deliberately **not** changed: everything else — identity (D12/D22), beachhead + launch voice
(D23/D52), the prosumer rail as channel-not-identity (D30/D33), the AI posture (D42/D56),
and the D27 date + cut order.
