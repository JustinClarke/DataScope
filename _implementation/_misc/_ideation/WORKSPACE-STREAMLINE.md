# Workspace streamline — ideation

> **FOLDED 2026-07-26 — this file is history, not live design.** Everything below landed in
> master as **D73** (§0), the §13.3 restructure, §10 Module 2's re-homing, §15's moved Monaco
> boundary, and §19's new **v0.70** tier (S0–S7) — see `DATASCOPE.md`'s `Revised (17)`. The
> live spec of record is master plus
> [`build/14-workspace-streamline/`](../../build/14-workspace-streamline/README.md); the tier's
> execution state is `status/BUILD-ORDER.md`. **The open questions folded as open** — nothing
> here was silently resolved on the way in. Two were then **resolved by human call the same day**
> and are recorded in master, not here: §7's "scope of any item" became the **detail ladder**
> (rail = lightest and links out → drawer Info = ambient and links out → tab = full depth), which
> also means **§2b's second disclosure level — per-column stats and the distribution preview — is
> deliberately not built in the rail**; and §3/§7e's ranked-action question resolved **by scope**
> into four homes that already exist. Two were converted into a **measured probe (S0)** rather
> than a guess: §4's synthesis producer, and the query-tab ceiling. This file is kept for the
> screenshots it references and as the record of what was asked for; **do not edit it to change
> the design.**

**Status:** ideation, with two exceptions — **§7's shape (human, 2026-07-25)** and **§11's eight
gap resolutions (human, 2026-07-26)**. Everything else here remains ideation; no Decision Record
(D1–D70) impact claimed. Those two sections *do* contradict standing master positions — the
bottom inspector's charter, the singleton tab example, and §13.3's "Settings tab" — and owe
master one combined amendment before build: see **§7f** and **§11's closing note**.
**Date:** 2026-07-25, gap resolutions 2026-07-26
**Scope:** the workspace shell after a dataset is loaded — explorer pane + the `map · workspace`
tab. Welcome / Act 0 is explicitly **out of scope** and stays as-is for now.

**Note on naming:** the request said "right pane" for the table list and "left pane" for the
split; both refer to the **same** pane — the `EXPLORER` rail on the left of the screenshot
(`src/features/explorer/ExplorerPanel.tsx`). This doc uses **explorer rail** throughout. The
AI pane on the actual right is untouched by this ideation — that's about *content*; §6 below
adds a resize-mechanics exception that applies to it too.

---

## 1. Explorer rail — table rows reflow

**Problem.** Table names truncate (`cust…`, `prod…`, `orde…`) because the row is a single
horizontal line competing with row/col counts and sample size.

**Change.** Stack the row instead of packing it:

```
● customers
  400 rows × 5 cols · sample 400 B
```

- Line 1: full table name, no truncation, primary weight.
- Line 2: the metadata that currently crowds it — `N rows × N cols`, `sample <size>` —
  demoted (smaller, muted, single line).
- Truncation only kicks in on genuinely long names, and then on line 1 only.

**Open:** whether `sample` keeps its own label chip or collapses into the metadata line as
plain text. Leaning plain text — the chip is what forces the horizontal squeeze.
![alt text](<Screenshot 2026-07-25 at 19.57.26.png>)
![alt text](<Screenshot 2026-07-25 at 20.26.50.png>)
---

## 2. Explorer rail — split into two stacked regions

The rail becomes two regions, top and bottom:

### 2a. Top — table list
The reflowed rows from §1. This is the navigation surface.

### 2b. Top — per-table expansion (dropdown-triggered)
Each table row gets an **explicit disclosure control** (chevron), not click-anywhere-on-row.
Expanding reveals that table's column detail inline — the card treatment already sketched in
the reference screenshot:

- Column name, key marker, type chip (`VARCHAR`, `TIMESTAMP`, …).
- Per-column stats when expanded further: `Unique Values` (count + %), `Missing (Nulls)`
  (count + %), and a `Distribution Preview` (bar rows for low-cardinality categoricals;
  "uniform or complex distribution" fallback otherwise).
- Warning affordance on the collapsed column row where relevant (e.g. `⚠ 12 nulls`).

**Requirement called out explicitly:** this must work for **all** tables, not just the first /
selected one. Two levels of disclosure exist here (table → columns, column → stats) — both are
dropdown-triggered and independently collapsible.

**Open:** does expanding one table collapse the others (accordion), or can several be open at
once? Accordion keeps the rail short; multi-open helps comparison. Leaning multi-open with all
tables collapsed by default.

### 2c. Bottom — Data Quality & Health
A persistent panel below the table list, dataset-scoped (not selection-scoped). Two blocks:

**Quality Warnings** (amber)
- "Found 12 nulls in non-nullable column candidate `customers.email`."
- "High value outliers in `orders.total_amount` (Max $2,450 vs Median $45)."

**Health Checks Passed** (green)
- "No duplicate rows detected (100% uniqueness profile)."
- "No zero-variance (constant value) columns."

Both are *findings lists*, so the panel is empty-state-capable: if nothing failed, the warnings
block is absent and only passed checks show.

**Open:** the rail is now carrying a lot vertically. Does the bottom region get its own scroll
container, or does the whole rail scroll as one? Leaning: independent scroll for the top list,
bottom panel pinned with its own overflow.

---

## 3. `map · workspace` tab — remove the options strip

**Delete** the suggestion chip strip currently at the top of the tab
(`src/features/map/OptionsStrip.tsx`):

```
▲ top  Explore the correlation matrix on the 4 numeric columns
Chart orders.customer_id over customers.signup_date
Break down the data by customers.name
Inspect the distribution of orders.customer_id
Profile order_items
```

These prompts are not lost — they **relocate** into the AI synthesis block (§4) as
*Suggested Explorations*, where they read as offers rather than as chrome.
![alt text](<Screenshot 2026-07-25 at 19.57.57.png>)
---

## 4. `map · workspace` tab — AI Dataset Synthesis block

Sits directly **under the existing tab heading text** (currently the verdict band:
`E-commerce mini-warehouse · 4 tables · 5,437 rows` + "no single dominant finding — here's the
structure", `src/features/map/VerdictBand.tsx`).

Two-column block, matching the reference screenshot's design exactly:

**Left — AI Dataset Synthesis.** Prose paragraph, key figures emphasised inline:
> "This appears to be an E-Commerce dataset with two tables containing **10,420 customers**
> and **45,092 orders**. The data spans from January 2021 to January 2024. This dataset is
> well-suited for calculating Customer Lifetime Value (CLV), analyzing churn, and forecasting
> seasonal demand."

**Right — SUGGESTED EXPLORATIONS.** Stacked rows, mono prompt text, `>_` leading glyph,
`→` trailing affordance:
- `Top 10 Customers by Total Spend`
- `Order volume trends by month`
- `Delivery success rate by customer segment`

These rows are the new home for the §3 chips. **Deferred for a later pass** (user's explicit
note: "we will talk about that when we get there"):
- what a row actually *does* on click — run a template, seed the AI input, open a tab;
- where the suggestions come from with AI off (deterministic templates) vs AI on;
- how the synthesis prose is produced when AI is off, given the "nothing leaves your browser"
  status-bar guarantee. **This is the load-bearing open question** — a block labelled "AI
  Dataset Synthesis" cannot silently imply a model ran when none did.

**Near-term plan for the load-bearing question (exploratory, not a decision).** First test
whether Cloudflare can produce the structural/behavioral findings (§5a/§5b) and the synthesis
prose end-to-end. If local computation can't get there on its own, the fallback under
consideration is uploading *shape-of-data only* — schema and aggregate stats, never row-level
data — to Cloudflare. That fallback would need its own privacy review and testing before it
touches the "nothing leaves your browser" status-bar guarantee; the guarantee can't quietly
loosen. Longer-term aim, once Cloudflare's output is validated as the quality bar to hit, is to
replace it with a local algorithm. Explicitly deferred by the user pending that testing —
"we will cross that bridge when we get there."
![alt text](<Screenshot 2026-07-25 at 20.25.36.png>)
---

## 5. `map · workspace` tab — vertical order

Final top-to-bottom composition of the tab:

1. Verdict band / heading text (unchanged)
2. **AI Dataset Synthesis + Suggested Explorations** (§4)
3. **ERD** (`src/features/map/Erd.tsx`, unchanged in content)
4. **Structural Patterns** ‖ **Behavioral Trends** — side by side, left and right, directly
   under the ERD

### 5a. Structural Patterns (left)
Finding cards, icon + title + body:
- **Time-Series Detected** — "`order_date` contains continuous dates. Suitable for timeline
  grouping."
- **Category Skew** — "`orders.status` is highly skewed. 84% of rows are `DELIVERED`."
- **Format Match** — "`customers.email` matched regular expression pattern for Email Address
  (99.8% match rate)."
![alt text](<Screenshot 2026-07-25 at 20.26.29.png>)
### 5b. Behavioral Trends (right)
Same card treatment:
- **Seasonal Seasonality** — "Orders consistently peak on Tuesdays at 19:00 UTC, while Sundays
  experience a 40% drop in transaction volume."
- **Correlation Signals** — "`signup_date` ↔ `total_amount`: `+0.42` (Older cohorts exhibit
  steadily increasing order values)."
![alt text](<Screenshot 2026-07-25 at 20.26.37.png>)
**Open:** these two columns will have unequal card counts in practice. Independent column
heights, or forced equal height with the shorter one padded? Leaning independent — forced
equal-height creates dead space, which is what the current layout already suffers from.

**Open:** responsive behaviour below the two-column breakpoint — Structural stacks above
Behavioral, presumably, but worth confirming the priority order.

---

## 6. Layout — resizable panes, VSCode alignment

**Direction confirmed.** All panes are drag-resizable, VSCode split-view style: explorer rail,
`map · workspace` tab content, AI pane, and the new item-inspector drawer (§7). This is the
resize-mechanics exception flagged in the header note — the AI pane's *content* stays out of
scope, but it resizes like everything else.

**Design language.** Lean into VSCode's chrome (activity bar, split panes, drawer-style bottom
panel) as the interaction vocabulary, while keeping the result illustrative and approachable
rather than reading as a literal code-editor clone — glyphs, spacing, and copy stay in
DataScope's own voice, not VSCode's.

**Explorer rail customization.** Question raised: can the rail be customizable the way VSCode's
Explorer is? VSCode's own source isn't proposed as a dependency here and wasn't pulled for this
— the relevant parts are well-documented interaction patterns, not implementation to copy
line-for-line:
- resizable width (drag the rail edge) — same mechanism as the rest of this section;
- per-section collapse/expand — already planned for tables/columns in §2b;
- drag-to-reorder sections, or pinning specific tables to the top — a further step beyond
  what's scoped so far, closer to VSCode's view-container customization.

**Open:** how far "customizable" goes for v1 — resize + collapse (cheap, already consistent
with §2b) vs. reorder/pin (new surface, new persisted layout state per user). Leaning resize +
collapse for v1, reorder/pin as a later pass.

---

## 7. Item inspector — bottom drawer (Info / SQL Editor)

**Four calls taken by the human, 2026-07-25** (the rest of this section is still working
detail):

1. The drawer's SQL Editor **replaces the standalone full-page SQL tab** — it is not an
   addition alongside it. SQL is written in exactly one place from now on.
2. Info and SQL Editor **coexist under user control**, VSCode split-terminal style — tab
   between them or split to see both; the user chooses, it isn't fixed either way.
3. **Exactly one console instance.** No second/split *console* pane — one query buffer, to
   keep the state model simple. (The split in (2) is Info-vs-console, not console-vs-console.)
4. Pinned queries (§7c) are **editable and re-runnable in their own tab**, not frozen
   snapshots.

### 7a. The drawer

Docked bottom, VSCode terminal-panel style, resizable per §6 — and **fully expandable**, up to
taking the whole viewport height, because a query result is the one thing in this app with no
natural size. Two views:

- **Info** — today's `src/features/inspector/Inspector.tsx` content unchanged: the table /
  column / ERD-edge scent that fills from the current selection.
- **SQL Editor** ("the console") — a real query editor + Run + results. New.

Clicking a clickable "dive deeper" item — an ERD table node, an explorer row, any other
inspectable item — opens the drawer (if collapsed) and selects **Info**. If the item is a
table, Info carries an **"Open table"** action that opens it as a main-strip tab *and*
switches the drawer to SQL Editor — the assumption being the user's next move is to query
what they just opened.

**Results never auto-expand the drawer.** A result taller than the current drawer height
**prompts** the user to expand ("N rows — click to expand") rather than growing on its own.
Auto-growing a bottom dock over the thing the user was reading is the failure mode this
avoids; the trade accepted is that a big result is two gestures away, not zero.

### 7b. Run from anywhere — the console is the only writing surface

Every place the app already *displays* SQL gains a **run action** that sends that query to the
console, opens the drawer, and executes it — **without navigating away from what the user was
looking at**. The chart stays on screen; the AI answer stays on screen; the result appears
below.

Known sources today, each needing its own affordance wired individually:

- the four per-chart-type `GeneratedSql.tsx` blocks (`features/charts/{time-series,
  distribution,categorical,correlation}/`) — today these offer **Copy SQL only**, no way to
  send the query anywhere;
- the AI pane's per-turn SQL (`features/ai/`, the §11.1 audit trail's `SQL` step);
- `QueryResultsPanel.tsx`'s History list — today inert display text, becomes clickable;
- `ColumnCard` / `InsightFeed`'s "Show SQL" (the EducationalPanel path);
- any `RankedAction` carrying SQL (see §7e).

The console is the **only** surface where a query is typed from scratch. Adding a second
free-typing SQL surface anywhere would just recreate the full-page tab this section deletes,
and reintroduce the "which one is the real one?" ambiguity.

### 7c. Pin to tab — the keepers

One shared console buffer means the next query overwrites the last one's results. So the
console gets a **Pin to tab** action (also available on History rows): it promotes the current
query + results into its own tab in the main strip.

A pinned tab is **independent and live** (call 4): its own editor, its own Run, its own
results, its own name. Editing and re-running inside it touches neither the console nor any
other pinned tab. The model is **console = scratchpad, pinned tabs = keepers** — the promotion
path is one-way and explicit.

Consequence accepted: "one console to keep it simple" is true of the *scratchpad*, but every
pinned tab is its own small query-runner, so the app does carry N live query surfaces once the
user pins things. That's the cost of (4), taken knowingly over the frozen-snapshot alternative.

**This is the first live consumer of the artifact tab kind.** `TAB_KIND`'s `'artifact'` branch
(`src/types/tabs.ts`) has existed since W0 with **zero callers** — every tab type built to date
is a singleton. W3 deferred pinning explicitly ("to whichever phase first wires a real
result-producing tab type"); this is that phase. Pinned SQL tabs are per-instance, never
deduped.

### 7d. What the full-page SQL tab's removal takes with it

Deleting the standalone SQL destination (call 1) is not just dropping a route:

- **`TabType`'s `'sql'` member, `TAB_TYPE_BY_MODULE.sql`, and the palette's SQL entry** all
  go or re-point (`types/tabs.ts`, `services/navigation.ts`, `lib/paletteRegistry.ts`) — all
  three wired at W7.5.
- **Pivot gets its own ordinary tab** (confirmed by the human). Today `PivotModule` shares
  `QueryResultsPanel` with the SQL page — that shared "what a query produced" rendering is
  deliberate (D49: one execution path, not two), so Pivot needs its own results home rather
  than inheriting the deleted page's leftovers. Small side-decision, not a blocker.
- **Monaco's lazy-load boundary moves.** `SqlModule` lazy-loads the ~2MB Monaco chunk on first
  render (§15's budget line). A drawer that's present in every session must not pull Monaco at
  startup — the lazy boundary has to move to the console's first *open*, not the shell's mount.

### 7e. Ranked actions that carry SQL

`rankNextActions` (`lib/capabilities.ts`) emits actions with `module: 'sql'` — today the
`duplicates` insight, which opens the SQL page pre-run on the exact query that found the
duplicate rows (D68e "opens on the answer"). With the page gone, those actions route to the
console instead.

This compounds with **§3**, which deletes the options strip and relocates its prompts into §4's
*Suggested Explorations*. Both sections change where a `RankedAction` lands; they need to be
settled together, not independently, or the SQL-bearing actions fall through the gap between
them.

### 7f. What this owes master before any build

§7 as written **contradicts two standing positions**, and neither can be quietly overridden
from an ideation doc:

1. **§13.3's bottom-inspector charter** — "scent, not dashboard," explicitly "never a
   pedagogical surface," with the "no charts in the inspector" line held through W7. A running
   SQL console with a results grid in that same region is a reversal of that call, not an
   extension of it.
2. **§13.3's tab model** — "one SQL playground" is used *as the definition* of what a singleton
   tab is. Removing it changes the paragraph's own worked example, and D71 cites that model.

Both are master §13.3 / D71 territory, so the sequence is master-first, then mirror into
`build/12-workbench/`, then a build leaf — the same path W7.5 took. Not a drive-by code change.

**Open — scope of "any item."** Unresolved, and §7's rewrite doesn't settle it: the explorer
rail has its own inline disclosure planned (§2b: chevron, detail expands in-rail), while the
drawer's Info view claims the same "click a table to see detail" job. Does the drawer replace
the rail's inline cards, sit alongside them, or is the drawer for ERD nodes and other non-rail
surfaces only? Still needs a decision before build.

**~~Open~~ — console cold state. Resolved 2026-07-26, see R3:** with nothing running, the drawer
presents a composed **info pane** carrying an explicit "open SQL editor" control (the VS Code
idiom), rather than an empty editor or a query list. Still open, and much smaller: whether the
"Open table" hand-off in §7a pre-seeds a `SELECT *` against the table it came from.

---

## Cross-cutting notes

- **Emoji.** The reference screenshots use colour pictographic-looking icons. Per the standing
  no-emoji rule these must land as the existing monochrome/HUD glyph set (`◈ ✦ ◆ ⚙ ✓ ⚠`) or as
  proper SVG icons — not as emoji characters.
- **Provenance.** Every finding in §2c, §5a, §5b is a *claim about the user's data*. Each needs
  a defined producer (deterministic profiling vs AI) and must not present a template guess as a
  measured fact. The nulls count, uniqueness, zero-variance, skew, and correlation figures are
  all computable locally; the prose synthesis and the "suitable for / well-suited for"
  recommendations are not.
- **Sequencing suggestion.** §1 is self-contained and cheap. §2b (nested disclosure) and §4
  (synthesis semantics with AI off) carry the real design weight and should be settled before
  either is built. **§3 is no longer independent** — it moves `RankedAction`s, and so does §7e;
  settle them together. **§7 is the largest item here and the only one with decided shape** —
  it deletes a shipped tab type, adds a shell region, changes every generated-SQL affordance in
  the app, and reverses two master positions (§7f), so it is a master amendment + its own build
  leaf, not a fold into someone else's.
- **Three "click a thing, see detail" mechanisms now exist across this doc** — §2b's in-rail
  inline cards, §7a's drawer Info view, and the pre-existing per-table Profile tab. That's one
  more than the app can coherently teach. Resolving §7's "scope of any item" open question
  should account for all three, not just the two it names.

---

## 8. Screen map — every built surface, and what this doc does to it

Inventoried from the tree on 2026-07-25, not from memory. **This doc touches roughly a third of
the app; the rest is untouched-but-affected, which is the point of writing it down.**

### 8a. The shell, after a dataset is loaded

```
┌──────────────────────────────────────────────────────────────────────┐
│ TITLE BAR   ◈ DataScope   ecommerce · 4 tables        ⌘K      ⚙      │
├────────────┬─────────────────────────────────────────┬───────────────┤
│ EXPLORER   │ CANVAS — tab strip + one active tab     │ AI PANE       │
│ (§1, §2)   │ ◈ map · workspace                       │ (untouched)   │
│            │ ├─ Verdict band                         │ mode switches │
│ ● customers│ ├─ AI Synthesis ‖ Suggested (§4 NEW)    │ composer      │
│   400 rows │ ├─ ERD                                  │ audit trail   │
│ ● orders   │ └─ Structural ‖ Behavioral (§5 NEW)     │ ✦ Copilot     │
│   ▸ cols   │                                          │              │
│ (§2b NEW)  │  other tab types: profile · pivot ·      │ [Configure]   │
│            │  charts · correlation · export           │               │
│ ─────────  │  (sql tab DELETED — §7d)                 │               │
│ QUALITY &  │                                          │               │
│ HEALTH     │                                          │               │
│ (§2c NEW)  │                                          │               │
├────────────┴─────────────────────────────────────────┴───────────────┤
│ DRAWER (§7 — was the Inspector)   [Info] [SQL Editor]      ⌃ expand  │
│  > SELECT * FROM orders WHERE …                        [Run] [Pin]   │
│  ── results ────────────────────────────────────────────────────────  │
├──────────────────────────────────────────────────────────────────────┤
│ STATUS BAR  ● local · duckdb ready · 4 tables · 12 MB · 84 ms        │
└──────────────────────────────────────────────────────────────────────┘
```

### 8b. Surface-by-surface

| Surface | What lives there today | This doc |
| :--- | :--- | :--- |
| **Act 0 / Act 1** (welcome, ingest) | `Welcome` + `IngestionPanel`: drop / URL / samples / telemetry / rejection modal | **Explicitly out of scope** (header note) |
| **Title bar** | wordmark, dataset identity, ⌘K, settings gear | untouched |
| **Explorer rail** | `TableList` rows → Profile tab; refresh-from-source; remove | **§1** reflow · **§2b** inline column disclosure · **§2c** quality panel |
| **Canvas — `map`** | `VerdictBand`, `Erd`, `OptionsStrip`, single-table `DatasetDossier` (Blueprint face: identity, quality headline, hero join graph, table strip, time coverage, top insights, ViewSpec render) | **§3** strip deleted · **§4** synthesis block added · **§5** findings columns added |
| **Canvas — `profile`** | `ProfileDashboard`: `ColumnCard` (type, stats, Show SQL), `InsightFeed` (+ auto-chart) | untouched — **but §2b duplicates it in the rail** |
| **Canvas — `sql`** | `SqlModule`: suggestions, Monaco, results grid, auto-chart, history, transform guard, export-recipe | **DELETED** (§7d) |
| **Canvas — `pivot`** | `PivotModule` → `PivotBuilder` + shared `QueryResultsPanel` | **gets its own results home** (§7d) |
| **Canvas — `charts`** | time-series (trend / compare / seasonality), distribution (histogram / box / stats), categorical (donut / frequency / grouped) — each with a `GeneratedSql` block | **each `GeneratedSql` gains a run action** (§7b) |
| **Canvas — `correlation`** | heatmap, canvas scatter, drill-through, `GeneratedSql` | same as above |
| **Canvas — `export`** | Parquet/CSV per table, Jupyter snippet, `ShareDialog`, `ShareLinksList` | **unaddressed** — see §10 |
| **AI pane** | mode switches, composer, per-turn audit trail, Configure workspace | content untouched; **its SQL gains a run action** (§7b) |
| **Inspector (bottom)** | table / column / map-edge scent | **becomes the drawer's Info view** (§7a) |
| **Status bar** | posture dot, engine, counts, memory, query timing | untouched |
| **WebLLM dock** | floating download/warm progress | **unaddressed** — competes with the drawer for bottom space |
| **Command palette** | map, per-table profiles, 5 modules; `ai`/`ingestion` disabled-with-reason | **entry list changes** with the `sql` tab's deletion (§7d) |
| **Viewer mode** | whole-shell read-only over `?share=` / dropped `.dsps` + trust chrome | **unaddressed** — see §10 |
| **Settings** | `AISettingsPanel` as a modal overlay | unaddressed (and already diverges from master — §10) |

---

## 9. Use cases — the journeys this shell has to carry

Rough walkthroughs, written to test the §1–§7 composition rather than to specify it.

**J1 — Inherited a folder of CSVs, no idea what's in it.** (the D52/D23 launch story)
Act 0 → drop → map tab opens → Verdict band answers *"what have I been handed?"* → §4 synthesis
prose answers *"what's it for?"* → §5a/§5b findings answer *"what's odd about it?"* → ERD answers
*"how do these connect?"*. **No SQL, no AI, no clicks required.** This is the journey the whole
product is positioned on, and §4/§5 are the parts of it this doc adds.

**J2 — "Is this data trustworthy?"** Explorer's §2c quality panel (dataset-scoped, always
visible) → click a warning → drawer Info shows the offending column → *Open table* → Profile tab
for the full column card. Today this journey has **no persistent home at all** — findings only
surface inside the map tab and the profile tab. §2c is the fix.

**J3 — "Let me just check something."** Reading a chart → its Generated SQL is right there →
**Run** → drawer opens, query runs, result underneath, *chart still on screen*. This is the
journey §7 exists for, and the one the app currently cannot do at all (Copy SQL, then navigate
away, then paste).

**J4 — "Keep that one."** Console query is good → **Pin to tab** → it becomes an independent,
re-runnable tab → run three more variants, pin the good ones → flip between them to compare.
Requires the artifact tab kind (§7c), unused since W0.

**J5 — AI answers, user verifies.** Ask in the right pane → audit trail shows planned → SQL →
ran → validated → rendered → **Run the model's SQL yourself** in the console to check it. The D55
"never execute model output" seam is unaffected: the user runs it, deliberately, as text they
read first. Worth stating explicitly, because "run the AI's SQL" sounds adjacent to that seam.

**J6 — Pivot without SQL.** (D53's no-SQL path) Explorer → Pivot tab → drag fields → results.
Must survive §7d's deletion of the shared SQL page intact — this journey is a decision-record
commitment, not a nice-to-have.

**J7 — Share the shape, not the data.** Export tab → `.dsps` / HTML report / share link →
recipient opens in viewer mode, read-only. **The console's role here is undefined** (§10).

**J8 — Come back to a table later.** Explorer row → Profile tab (singleton per table, already
built) → still there, still scrolled where it was (keep-mounted). Untouched by this doc.

---

## 10. Gaps — features this doc has not accounted for

Found by walking the built tree against §1–§9. **Three are load-bearing.**
**All eight were answered by the human on 2026-07-26 — resolutions in §11.** The gap statements
below are kept as written, as the record of what was actually missing.

**G1 — Viewer mode is undefined under §7. (load-bearing.)** D62 makes viewer mode
*consumption-only* — the options strip is "fully absent," the inspector renders evidence but no
override controls. A **SQL console in a read-only viewer** is either (a) absent, making the drawer
Info-only there, or (b) present, which hands a recipient query access over a structure report
that carries no data to query. (a) is almost certainly right, but it must be said, and §7 says
nothing.

**G2 — `SqlModule`'s deletion drops four features nobody has re-homed. (load-bearing.)** §7d
lists the *routing* consequences but not the *feature* ones. The page currently owns:
`TransformGuardModal` (the guard that stops a user silently mutating a source table — a **data-safety**
control, not chrome), the **export-recipe** action (derived-table SQL as a re-runnable recipe,
§12.2), `AutoChartPanel` (auto-charting a result — also used by `InsightFeed`), and the
**Download-Parquet-on-CTAS** shortcut. Each needs an explicit home in the console or an explicit
"dropped" decision.

**G3 — `QuerySuggestions` collides with §4's Suggested Explorations. (load-bearing.)** The SQL
page ships a suggested-query strip today. §4 introduces a *second* suggestion surface on the map.
With the SQL page deleted, either the console inherits its strip (two suggestion surfaces) or
suggestions consolidate into §4 (one home, but the console starts cold — which is exactly §7's
open "console cold state" question). These are the same question asked twice; answer them together.

**G4 — Add-data has no home in the restructured rail.** Still W2's open deferral, still
`NOT_YET_WIRED` in the palette. §2 rebuilds the rail into two regions (list + quality) without
leaving a slot for it, so the restructure would harden the gap.

**G5 — The share-links list is in the wrong place, and §2 doesn't move it.** `ShareLinksList`
lives inside the Export tab today; master §13.3 puts it in the explorer, reachable with **zero
datasets**. §2's rail restructure is the natural moment to move it and doesn't.

**G6 — The Export tab is never mentioned.** It survives §7d by omission rather than by decision.
Worth one line confirming it stays a tab (it should — it's dataset-wide, not a scratchpad).

**G7 — The WebLLM dock and the drawer compete for the bottom edge.** The dock floats at the
bottom today; an expandable drawer that can take the full viewport will collide with it. Needs a
stacking/relocation call.

**G8 — Settings is unmentioned, and already diverges from master.** Master §13.3 names a
**Settings tab** (gear → tab, VS Code idiom); the code ships `AISettingsPanel` as a **modal
overlay**. Independent of this doc, but §7 adds a second tab-type change to the same area, so it
is cheapest to reconcile in the same amendment.

**Also noted, not gaps:** `features/ml/` and `features/studio/` are empty directories (backlog and
v1 respectively) — correctly absent here. "Learn / help" has no palette entry despite §13.3
re-homing it there; pre-existing, unrelated to this doc.

---

## 11. Gap resolutions — human calls, 2026-07-26

Answers to G1–G8. Two of them turn out to need **no new mechanism at all**; two add scope beyond
what §7 assumed.

### R1 (G1) — Viewer mode: Info only. Sharing data is a separate, existing path.

**Resolved: the read-only recipient gets the drawer's Info view and no console.** Separately, the
sharer may choose to send the dataset itself along with the report, and *that* recipient gets a
working SQL editor.

**This needs nothing built.** Both halves already exist and already behave this way:
`ShareDialog` (`features/export/ShareDialog.tsx`) ships structure-only as the pre-selected
default with a **full-dataset escalation as a second, distinctly-styled step, never the default**
(D20/D21 discipline intact), and `loadSharedDataset` (`services/ingestion.ts`) already branches on
what comes back — a JSON structure report opens **viewer mode**, while a Parquet payload is
`registerDataset`-ed and the recipient lands in an **ordinary session**.

So the design collapses to two states that both already exist, and the console needs no
viewer-mode variant whatsoever:

| Recipient received | Lands in | Console |
| :--- | :--- | :--- |
| structure report (`.dsps` / JSON) | viewer mode, read-only | **absent** — Info view only |
| full dataset (escalated share) | an ordinary session | **present**, because every ordinary session has one |

The only work is making sure the drawer **inherits the same "absent in viewer mode" treatment the
options strip already has** (D62 consumption-only), rather than mounting by default because it is
a shell region. No new consent flow, no new privacy surface, no loosening of the share story.

### R2 (G2) — The four orphans land on tabs *and* in the drawer. One of them is not optional.

**Resolved:** implement the four on the pinned tabs, give the drawer an **"open in a tab"**
action, and surface the same options in the drawer itself, arranged as deliberate chrome rather
than a button pile.

**One correction, and it is the important part of this gap: `TransformGuardModal` is not an
option.** The other three (export recipe, auto-chart, Parquet-on-CTAS) are *affordances* — buttons
that can live wherever there's room. The transform guard is an **interception**: it fires
*between* pressing Run and the statement executing, when the statement would mutate a source
table, and it is what stops a stray query silently clobbering original data.

That means it cannot be "available in the toolbar" — **it must fire at every place SQL executes**:
the console, and every pinned tab, each of which is its own independent runner (§7c). A pinned tab
that runs SQL without the guard is a data-loss path that the current single SQL page does not
have. Cheapest way to honour this is to put the guard in the shared run path both surfaces call,
not to re-mount the modal per surface.

### R3 (G3) — Map shows the top 3; "view more" opens the full runnable list.

**Resolved:** §4's Suggested Explorations shows **three** entries with a **view-more arrow**
leading to the complete set of runnable queries. Keeps the map composed and gives the long list a
real home instead of two competing half-lists.

**Resolved further (2026-07-26), and *not* via the console:** picking a query — from the map's
top 3 or from the full view-more list — **opens it in its own new tab**, already running. It does
not seed the console. This gives the artifact tab kind (§7c) a **second producer**: tabs are born
either by pinning out of the console, or by choosing a suggestion. Both arrive the same way — a
live, editable, re-runnable query tab.

**And the console's cold state is settled separately:** with nothing running, the drawer shows a
**composed info pane with an explicit "open SQL editor" control** — the VS Code idiom, where the
panel presents something legible rather than an empty prompt, and switching views is one obvious
click. This closes §7's long-open cold-state question without loading it up with a query list.

**The resulting division of labour is worth stating plainly, because it's the thing most likely
to drift during build:**

| Intent | Route | Lands in |
| :--- | :--- | :--- |
| "quick check, don't disturb me" — run SQL you're *looking at* (§7b) | run action | **the console** |
| "let's actually explore this" — a chosen suggestion | suggestion click | **a new tab**, pre-run |
| "keep this one" — promote a console query | Pin | **a new tab** |

Ephemeral goes to the one shared console; deliberate goes to its own tab.

### R4 (G4) — A plus button on the explorer.

**Resolved:** Add-data becomes a **`+` control on or beside the explorer header**; the rail
scrolls, so the two stacked regions (§2a/§2c) don't crowd it out. This also closes W2's long-open
Add-data deferral and lets the palette's `ingestion` entry move out of `NOT_YET_WIRED`.

### R5 (G5) — Deferred to accounts, deliberately.

**Resolved: not now.** The reasoning given: you can't reach the workbench without dropping data
in, so a "your previous share links" list has no session to live in — that problem properly
belongs to user accounts, which arrive once the app is functional.

**One note for whoever picks this up:** Act 0 *is* a real zero-dataset surface that exists today,
so the list could live there without accounts if it ever becomes urgent — master §13.3's
"reachable with zero datasets" phrasing points at exactly that. Recording it as the
no-accounts option, not reopening the deferral.

### R6 (G6) — Export moves to the title bar.

**Resolved:** Export becomes a **button in the top-right cluster**, beside search and settings —
not a canvas tab.

**Resolved (2026-07-26): the button opens the Export *tab*, not an overlay.** `'export'` stays in
the tab registry; only its entry point moves. The top-right cluster is therefore deliberately
mixed — **Export opens a tab, Settings opens an overlay (R8)** — split on what the surface *is*:
export is dataset-wide work you return to and leave open, settings is a modal errand you finish
and dismiss.

### R7 (G7) — The dock sits below the drawer.

**Resolved:** the bottom strip stays, **underneath** the drawer. Stacking order from the bottom
edge upward: status bar → WebLLM dock strip → drawer → canvas. The drawer expanding (§7a) pushes
against the canvas above it, never over the strip below. No relocation needed.

### R8 (G8) — Settings is an overlay modal, not a tab.

**Resolved:** settings stays a **centred overlay modal** (Claude-style), which is what the code
already ships (`AISettingsPanel`). This **rejects master §13.3's "Settings tab"** rather than
implementing it — a small, deliberate reversal, and one that resolves the divergence in favour of
what's already built.

### What §11 changes about the tab registry

Two calls touch the closed `TabType` union (`types/tabs.ts`), and they should land as **one**
amendment:

- `'sql'` is **removed** (§7d) — the console replaces it;
- `'export'` **stays** (R6) — only its entry point moves to the title bar;
- an **artifact** kind gains its first live member — the **query tab**, reached two ways
  (pin-from-console §7c, or a chosen suggestion R3) — after eight phases with no artifact member
  at all.

Net: **seven singletons → six singletons + one artifact type.** Master §13.3 and D71 both describe
the current shape, so this is the same master-first amendment §7f already owes, with a slightly
larger diff than §7 alone implied.

