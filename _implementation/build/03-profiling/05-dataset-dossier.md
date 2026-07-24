# 03.5 Dataset Dossier — the post-ingest landing view

**Tier:** v0 · Phase 3 (UI assembly) · **Master spec:** §13.1 (D48) · **Decisions:** D48, D24, D46, D45, D10, D20, D52, D55/D56, D68, D69, D71 (Workbench re-home)

## Objective

The folder-level "what have I been handed?" overview that opens immediately after ingest —
**packaging of existing v0 modules (§8–§10, §12), ~3–5 days of UI assembly, not a new engine.**
It is simultaneously the launch centerpiece (D52), the demo-script-as-UI (§24 Play 1), and the
structural hedge if the Join Graph (beta) is cut by its D24 kill criteria.

## Layout — one scrollable screen, decreasing priority top-to-bottom

Only the identity band and one hero region sit above the fold (that first screen is what gets
screenshotted, so it must land with or without the graph):

```
identity band   folder · N tables · rows · size · [Export structure report]
                D45 snapshot line: "Profiled {date} · from your machine, nothing uploaded"
HERO            how the tables relate  →  join-graph thumbnail (graph live)
                                          OR table grid promoted (graph cut)
                table strip (always present)
quality headline  "Worth knowing" — top D10 findings (duplicates, null clusters, leakage)
── fold ──
Time coverage · Suggested next steps · Top insights ·
Sensitive columns (v0.5+, positives-only) · full per-table detail
```

## The four load-bearing design decisions

- **Above-the-fold hedge (D24).** The hero has one job — "how do these tables relate?" — with
  two renderings in the *same* slot. **Graph live:** the thumbnail in the §20.6 two-tier grammar
  (solid = FK name echoes parent, dashed = structure-only candidate; never silently dropped,
  never confidently wrong) → click to the full graph
  ([../05-charting/05-join-graph-beta.md](../05-charting/05-join-graph-beta.md)). **Graph cut:**
  the **table grid rises into the hero** — each table's shape, key/ID columns, and name-shared
  columns as plain lines (*"shares `customer_id` with orders"*). No empty frame, no "coming soon."
  The grid is always built (registered tables, §7.5), so the hedge is a **reflow, not a rebuild**.
  **FK candidacy has a single owner (D24/§20.6 containment + name-agreement); the v0.5 heuristics
  layer emits no independent FK finding (D69)** — a structure-only name+type matcher is the D17
  trust-landmine, so any FK signal renders only through this two-tier grammar, never a second,
  lower-rigor detector on the launch screen. **Connector-source guardrail (§13.1, D24/D17/§20.6):**
  any column-level or ERD-style hero rendering sources its connector lines from the D24
  `relationshipInference.ts` engine output (solid/dashed tier, confidence + evidence, override
  state) — never a name/presence matcher, never a cardinality (e.g. "1:M") the engine did not
  compute; the *"shares `customer_id` with orders"* plain line is scoped to the **graph-cut
  degrade only** and is never promoted into a live/confident rendering. A richer
  interactive/expandable column-level rendering, if built, is the full-graph click-through
  and/or below-fold target — **never** a replacement for the compact, screenshottable hero
  thumbnail, which stays the two-tier relationship answer (D48/D68c tier-1 discipline).

- **Suggested next steps — opinionated, never over-claiming (extends D10).** 3–5 ranked actions
  from the same insight rules ([04-profile-ui.md](04-profile-ui.md)), phrased as *routing, not a
  verdict*: imperative action → module link + a because-clause naming the computed fact (*"Chart
  `revenue` over `order_date` — there's a 38% drop in March"*). Honesty guard is structural: may
  state a statistic, never a conclusion/causal/superlative built on it, never "we found." Thin
  profile → generic-but-honest routing, never manufactured intrigue. Caps at five. This band is
  the render of the §9 Action Broker's `rankNextActions` (D68a) — broker legality × D10
  interestingness, a `FactRef` attached to each action ([03-capability-engine.md](03-capability-engine.md));
  the tier-1 Verdict consumes its top three.

- **Sensitive-column findings — positives-only, the copy is the point (D46).** **v0: no band at
  all** (detector is v0.5; positives-only means *silence*, not "none found"). v0.5: band appears
  **only when ≥ 1 column is flagged** — *"Columns that may contain personal data"* + per-column
  reason + *"treat a missing flag as 'not checked,' never 'clean.'"* **No all-clear state
  anywhere** (share flow, Dossier, report) — no "0 sensitive columns," no green check. A
  false-clean is the D23 trust-landmine. Full copy in master §13.1 + [../08-persistence/02-r2-save-share.md](../08-persistence/02-r2-save-share.md).

- **Graduated internal cut line (D27).** UI assembly over modules that already exist, so the cut
  lives *inside* the feature as a four-rung ladder, each rung cheaper and still shippable:
  (1) full Dossier → (2) drop *suggested next steps* → (3) keep only identity band + table grid +
  quality headline → (4) full cut = open on the per-table profile ([04-profile-ui.md](04-profile-ui.md))
  for the largest table with a table switcher. User loses *synthesis*, never a *capability*; rung 4
  is a Phase-1 always-on module, so no rung can move Oct 6.

- **The Verdict — tier-1 progressive disclosure (D68c).** Each ViewSpec panel carries a
  `tier: 1|2|3`. **Tier 1 (the Verdict)** = identity band + one headline `FactRef` + the top-3
  `RankedAction`s (§9); it paints first, one screen, no scroll — the briefing that answers "what
  is this + what do I do next?" **Tier 2** = quality headline + time coverage + the hero reflow.
  **Tier 3** = top-10 insights + per-table column cards, behind "see the full profile." The
  **confidence floor:** the headline is the top fact by §9 interest score *only when a fact clears
  the floor* — below it (single-column file, nothing correlated, no rule above threshold) tier 1
  states *"N tables · rows · no single dominant finding — here's the structure,"* actions degrading
  to generic routing, **never a manufactured headline** (a banal headline is worse than none for
  the D23 user who trusts the tool most). Quality-risk facts (duplicates/nulls/leakage) win ties —
  the trust gate. **`tier:` is the disclosure axis only (D68c/D69).** Feature-maturity layers — the
  D69 **profiling / heuristics / AI-synthesis layers** — are a separate concept, never written into
  `tier:`; the enum is exactly `1|2|3`, no fractional `1.5`. The layers map *onto* disclosure tiers:
  data-sniffer / heuristics findings render at **tier 2**, per-table profiling cards at **tier 3**,
  the AI-synthesis layer (if it ever ships) at tier 2 or 3, **never tier 1** — and it is a **D65
  deterministic-narration** panel by default, LLM-authored freeform content excluded (the rejected
  D56 option-C) pending a separate eval-gated decision. **If an expandable column-level rendering
  is ever built, its inline per-column stats *are* this D69 tier-3 profiling-card content — one
  pipeline with D10, each stat carrying its D45 `FactRef` — never a second, separately-computed
  stat path (D58).**

**Provenance + drift hook.** Identity band carries the D45 snapshot line (facts as-of-snapshot,
no "verified"); it is also the v0.5 anchor for the Drift Report re-drop (D44, §20.8) — noted so
the v0 layout leaves room, not built now.

**The Dossier is the deterministic ViewSpec producer (§13.1, D55/D56).** The assembly above is
emitted as a **ViewSpec** — the versioned, capability-gated declarative layout artifact (fixed
component registry + typed §11.1-stage-6 chart configs; `viewspec_version` + validation in
`src/lib/viewspec.ts`) consumed by a deterministic renderer that never executes model output.
Same screen, same D48 UI-assembly budget — it paints first, always. From v0.5+ the optional AI
view-composer (D56) may propose a tailored variant scoped to the Dossier + D30 templates —
cached per dataset fingerprint (the identity band's D45 hash), resolving async after the
deterministic paint as an explicit "tailored this view" upgrade badge, never load-bearing, never
breaking wifi-off. The four-rung cut ladder is unchanged and lives entirely in the
deterministic producer.

**Workbench re-home (2026-07-24, D71 — master §13.3; flag-on shell only).** In the Workbench
the Dossier's home moves, its content and cut ladder survive verbatim: single-table, it is the
map tab's **Blueprint face**; multi-table, selecting a table on the ERD opens the Blueprint as
the **selection side panel**, and the **map tab header carries a persistent Verdict band** —
identity + the one headline `FactRef` under the D68c tier-1 discipline above (confidence floor
and quality-risk tie-break intact) — so a fresh multi-table open still answers "what have I
been handed / can I trust it?"; the ERD is the hero region, never the whole tier-1 surface.
The ViewSpec seam generalizes to the Workbench **tab-spec contract with the envelope
invariant** (D55/§13.3): the tab envelope — type from a fixed registry, identity, active-tab,
initializer — is app-authored only; model output enters solely as validated inner
ChartSpec/ViewSpec via `producerValidators` before any tab opens. §13.0's current-shell
placement stays the flag-off spec of record until W8
([../12-workbench/](../12-workbench/README.md)).

## Acceptance criteria

- [ ] E-commerce sample opens on the Dossier; above-the-fold answers "what is this?" at a glance
- [ ] Graph-cut build reflows the table grid into the hero — no empty frame, no apology copy
- [ ] Suggested next steps each link to a real module and cite a computed fact; none state a
      conclusion/causal claim; thin-profile sample degrades to generic routing
- [ ] No all-clear / "none found" state renders anywhere, in any build (grep the copy)
- [ ] Each cut rung still produces a coherent screen; rung 4 = per-table profile with switcher
- [ ] Tier-1 Verdict paints one screen (identity + one headline fact + top-3 actions); tiers 2–3 gated behind disclosure (D68c)
- [ ] Below the interest floor, the Verdict states "no single dominant finding — here's the structure," never a manufactured headline (D68c)
- [ ] The Dossier layout is a validated ViewSpec (`viewspec_version` present); the renderer
      consumes only the ViewSpec and never executes model output (D55)
- [ ] **(v0.5, D69)** Every data-sniffer / heuristics finding shows its generating SQL and an
      as-of-snapshot line — no finding renders without `sql` (grep: no finding lacking `sql`)

## Files

`src/features/profiling/dossier/` (assembly view; consumes profile output, join-graph slice,
insight feed, and the structure-report exporter — no new engine).

**Semantic color intent (styling note).** Intelligence cards use color to signal what kind of
finding they carry, matching the existing dossier palette: blue for connections and structural
links, emerald for health checks and passing metrics, amber for warnings, null concentrations,
and outliers, purple for correlations and secondary insights, and red for errors and critical
issues. Color communicates signal type; it is never the only carrier of meaning.
