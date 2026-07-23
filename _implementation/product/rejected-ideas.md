# Rejected ideas — decisions *not* taken

**Master spec:** §3 (positioning), §4 (non-goals), Decision Record (D12/D22/D23/D32/D37/D44–D59).

A register of ideas that were **proposed and deliberately rejected** during the design
cycles — kept so future rounds don't re-propose them cold, and so each rejection's *reason*
and its surviving narrow slice travel together. These are settled unless a founder
instruction re-opens them (per `CLAUDE.md`: the Decision Record is not edited without an
explicit human instruction). Where a rejection has a live sibling that *was* accepted, the
last column points to it.

## From the knowledge-layer round (July 12, 2026)

The brainstorm's "DataScope as persistent analysis-memory / knowledge server" was ~80% a
re-derivation of the settled spec (D12/D14/D20/D31/D37/D38); adversarial review rejected the
ambitious form on merit and kept a narrow slice. **Take the mechanics, refuse the banner.**

| Rejected | Why | Governs / what survived |
| :--- | :--- | :--- |
| **Form 2 — team/org "memory catalog"** (a shared, data-derived fact store) and the "Form-1-now-Form-2-later" ladder | Category suicide: enters Atlan/Collibra's ground with none of the table stakes (warehouse connectors, lineage, governance, SSO/audit); a *shared* data-derived fact store means data leaving → collapses the no-upload wedge, DataScope's only un-copyable asset | Stays rejected; if ever revisited it is v1 §20.10, gated on re-deciding the privacy/catalog tension. Sibling accepted: the **single-player** Drift Report (D44) |
| **"Verified fact / knowledge server / Git for data understanding"** branding | Over-promises accumulation a stateless-per-run artifact can't deliver; invites the Atlan comparison DataScope can't win. "Verified" is a false-permanence claim | **D45** — facts labeled "computed as of {snapshot date + file hash}" with provenance tags; "verified"/permanence wording **banned** |
| **A "metric" fact type** in DSPS | Double-builds against the D11/§20.6 semantic model + dbt export, and collides on the word "fact" (dimensional "fact table") | **D45** — DSPS facts are structural/quality only (PK/FK/null/type/range/distribution); metrics stay in the §20.6 semantic model |
| **MCP re-centered as a "knowledge server"** (`get_known_facts()`, `get_common_joins()`, `get_previous_findings()` as the product identity) | The D37-rejected identity move — re-centering on "the layer agents consume" | Identity unchanged (**D12/D37**). The *capability* survives as a plain feature: the **D38** MCP surface serving DSPS (stage A over shared artifacts; stage B over explicitly staged datasets) |
| **"Knowledge graph / semantic cache"** branding for the fact list | Needlessly walks toward the **D32** no-RAG line and invites the RAG-platform comparison | Name it plainly — "dataset facts" / "profile assertions." **D47** clarifies: a deterministic SQL-derived fact list with evidence is in-bounds structural metadata, **not** RAG |
| **PII "scan: none found" clearance verdict** | A false-clean verdict on adversarial, well-studied re-identification torches trust on one counterexample | **D46** — PII detection is a share-flow suppression *assist*, **positives-only**, never a standalone all-clear line |

## From the positioning & viability rounds (July 12, 2026)

| Rejected | Why | Governs / what survived |
| :--- | :--- | :--- |
| **"Analysis memory / knowledge server" as positioning** | Same failure as Form 2 above, in copy form | Stays dead (**D37** + knowledge-layer round). Product arc is **structure × time** (**D52**) |
| **`/parquet-viewer` as the flagship Play-3 page** | The viewer/profiler lane is fully commoditized as of July 2026 (SplitForge, viewparquet/parquet-viewer/parquetexplorer, MotherDuck's `duckdb -ui` Local UI) — "no upload" is table stakes there | Play 3 re-aimed: **`/schema-diagram` flagship** + `/csv-profiler` + `/ai-context`; `/parquet-viewer` demoted (§24.1) |
| **Cell-level version diff** as the "what changed" feature | Cottage commodity (csvdiff.app, Datablist, DataFlowMapper, csvkit, Apify's diff actor) — and a cell viewer is a privacy surface | **D44** — the **Drift Report**: aggregate, inferred-key, folder-aware *statistical* drift (PSI/KS), **never a cell viewer**. Named "Drift Report," not "diff" |
| **"No upload" as the launch headline** | The cottage wave made it table stakes; leading with it competes on the commoditized axis | **D52** — privacy is the standing **permission line** ("nothing leaves your browser — check DevTools"), not the headline; lead with ② (structure) + drift |
| **The ambitious "knowledge layer" pivot** (the brainstorm's "$100M" framing) | Enters the most crowded, best-funded corner (data catalogs) with none of the table stakes, and trades away the no-upload wedge | Rejected on merit. Take the mechanics (Drift Report, provenance labeling), refuse the banner |

## From the DSPS-harvesting proposal (July 15, 2026 — D59)

A founder proposal to **auto-store every generated DSPS to product-account cloud** — to make
the next dataset faster to profile and to learn how users use the app — triaged and **rejected
as stated**. The full reasoning and sanctioned alternatives are in the D59 row
([`../architecture/decisions.md`](../architecture/decisions.md)); the short version:

| Rejected | Why | Governs / what survived |
| :--- | :--- | :--- |
| **Silent / default DSPS upload + server-side accumulation** | Collides with the identity decisions at once: DSPS is stateless-per-run (**D45**); no server-side schema processing or always-on state (**§4/§1**); structure leaves the browser only by explicit labeled action (**D20/D23/D52** — the "check DevTools" permission line); telemetry is content-free/numeric, DSPS is content (**D25/D41**); column names are re-identifiable (**D46/D21**). Strategically it trades the regulated/GCC moat (**D23/§24.4** — "we cannot see your data, by construction") for analytics | Named a **§4 non-goal (D59)**, parallel to D32; **no revive trigger** for the silent/default form. **Sanctioned instead:** local zero-egress DSPS cache (**D44**) + learning from dev corpora or *explicitly-shared* DSPS (**D38** stage A) for speed; **D25/D41** content-free counters (richer only via **D39** opt-in staging) for usage. A future **opt-in "contribute my structure"** must be labeled, per-artifact, off by default (**D42**) |

## From the analyst pain-point round (July 15, 2026 — D57)

An external positioning review proposing an "analyst + prosumer two-journey" repositioning
was triaged as **no pivot** — its core restates settled decisions (D12/D30/D33/D42/D48/D52/
D53/D56) and its additive slices landed via D57 (orientation-tax framing in §3.0, the D30
template time-to-first-result bar in §18, the launch-copy ladder in §24.1).

| Rejected | Why | Governs / what survived |
| :--- | :--- | :--- |
| **Analyst-as-headline positioning** ("DataScope helps analysts and knowledge workers understand unfamiliar data fast, in the browser, without uploading it") | That sentence is the commoditized §3.4 viewer/profiler-lane claim — every cottage tool sells it; it drops ②, the one unclaimed capability. The **D52 inherited-data frame already contains the analyst** ("analysts joining a company" is in its audience list) while staying differentiated; D53 already adjudicated "served audience, never a co-headline" | **D22/D23/D52/D53 reaffirmed.** Analyst pains land as product surface and §3.0 framing (D57), never as the headline |
| **Prosumer path as a second product identity** ("make it feel like a real product, not a demo") | Contradicts D33's channel-not-identity economics (the 15-year personal-analytics graveyard: novelty churn is survivable only because prosumers are funnel, not identity); would invest pre-launch UX in the **first-to-drop** D27 cut-order item — the D42 falsifiable test fails | **D30/D33 reaffirmed.** The prosumer slice that survives is the D57 time-to-first-result bar (§18) — a quality floor on the existing templates, not new identity or scope |

## From the dynamic-UI round (July 13, 2026)

Founder question — "involve AI more to tailor the UI in real time / dynamic frontend as the
evolution of the product" — adjudicated against `competitive-landscape.md` and §3.3–§3.5.
Bounded version accepted (D55/D56); maximal version rejected.

| Rejected | Why | Governs / what survived |
| :--- | :--- | :--- |
| **"AI tailors the UI in real time" as the product's evolution/identity** (general dynamic frontend, AI redraws every module) | Not the moat — §3.4 survives on ② (structure inference) alone; AI-generated UI is presentation *on* the moat. Races MotherDuck's funded AI-data-app generator on their turf. Risks the three moat-assets: offline-by-construction (§24.3 asset #1), free-forever local core (D28), and the determinism/trust posture (D45/D46). An AI call in the load path also *adds* latency on the one winnable axis (TTFI, §3.5). Fails the D42 test | **D55** — the deterministic ViewSpec seam (v0, ~zero cost; renderer never executes model output) + **D56** — the bounded AI view-composer (v0.5+, Dossier + D30 templates only, broker-gated, fingerprint-cached, async, deterministic fallback mandatory, D40-style eval on the feature). Identity unchanged (D12/D22/D37) |

## From the Dossier ERD-blueprint proposal (July 21, 2026 — D69-adjacent, no new decision)

An ideation-chat proposal to redesign the Dossier's Join Graph hero as an interactive,
expandable **"Dataset Blueprint"** (a `SqlErd.tsx`-style grid with per-column expand/collapse
and animated SVG connector lines) was reviewed and **not adopted as a standalone hero feature**.
~90% of it is implementation-level UI polish over content two settled decisions already own —
the solid/dashed FK edge grammar (**D24**/§20.6) and the tier-3 per-table profiling cards
(**D69**) — so it earns **no new decision row**. Only a narrow guardrail survived, now recorded
in master §13.1 (connector-source + hero-slot rules).

| Rejected | Why | Governs / what survived |
| :--- | :--- | :--- |
| **Name-match connector lines** — draw a 1:M line whenever two tables share a column name | Name+presence match with **no containment/coverage check**, asserting a **cardinality it never computed** — the exact **D17** trust-landmine (`status_id`/`id`/`region_code` fabricate a solid, confident-looking FK). One fabricated FK in the launch screenshot is a trust event for the D23 audience | Rejected. FK edges have a **single owner** — the D24/§20.6 containment + name-agreement engine (`relationshipInference.ts`). §13.1's **connector-source guardrail** records it: any hero rendering sources solid/dashed tier + confidence + evidence + override from that engine, never a matcher, never an uncomputed cardinality |
| **Expandable per-column ERD in the hero slot** (replaces `HeroJoinGraph`) | Dumps **tier-3** per-column profiling into the **tier-1** above-the-fold hero, degrading the screenshottable launch centerpiece (§13.1, §24 Play 1) from a clean "how do these tables relate?" answer into a profiling dump — violates **D68c** tier discipline | Rejected as a hero replacement. §13.1's **hero-slot rule**: a richer column-level rendering, if ever built, is the full-graph click-through / below-fold target, **never** a replacement for the compact hero thumbnail |
| **Animated SVG connector recalculation** (ResizeObserver-driven re-projection following every expand/collapse) | Over-engineering against **§4 / D18**: pure animation delight, no user-outcome justification, **no spike run**, and a real **§18** performance risk (layout-thrash on many-edge folders over the 50MB D24 target) | **Not adopted as spec; no spike commissioned.** Any live-connector rendering is **D18 spike-gated** against the §18 target before build; the compact static thumbnail already satisfies the hero's job |

*What survives:* if a richer rendering is ever built, it must obey the connector-source
guardrail and the hero-slot rule now recorded in master §13.1, and would ride **D69**'s v0.5
maturation slot **as a rendering choice** — it does not reopen the shipped v0 **D24** item.

## From the original brainstorm (`evolution`)

| Rejected | Why | Governs / what survived |
| :--- | :--- | :--- |
| **"Lighthouse for datasets" as a rename / identity** | DataScope's identity is the browser-native analytics IDE whose headline is structure understanding (**D12**); a diagnostics-report rename narrows it | Absorbed as an *adjacent* identity only — **"Lighthouse for data"** as the Phase-7 diagnostics report (§3.3, §20.8), never the product's name |

---

*Everything above was proposed inside a design loop where decisions were still flexible, then
settled by adversarial review + founder triage. The accepted counterparts (D44–D52) live in
[`../architecture/decisions.md`](../architecture/decisions.md) and [`strategy.md`](strategy.md).*
