# 03.3 Capabilities Broker

**Tier:** v0 · Phase 1 · **Master spec:** §9

## Objective

Consume classified columns and decide which analysis modules are enabled — the mechanism
that makes the app adaptive. It never shows options the current data can't support.

## Spec (§9 — implement as-is; ML flags stay dormant until §20.1 revives)

```typescript
interface DataCapabilities {
  // Analysis modules (v0)
  canDoDescriptiveStats: boolean;     // any Quantitative column
  canDoTimeSeries: boolean;           // >= 1 Temporal + >= 1 Quantitative
  canDoCorrelation: boolean;          // >= 2 Quantitative
  canDoDistribution: boolean;         // >= 1 Quantitative
  canDoCategoricalBreakdown: boolean; // >= 1 Categorical

  // ML modules (deferred — flags retained for post-v1, §20.1)
  canDoKMeans: boolean;               // >= 2 Quantitative
  canDoRegression: boolean;           // >= 2 Quantitative
  canDoClassification: boolean;       // >= 1 Categorical + (>= 1 Quantitative or >= 2 Categorical)
  canDoNLP: boolean;                  // >= 1 Textual

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

**Multi-table (D13):** the broker evaluates over the **union of all registered tables** —
per-table classification in, one merged `DataCapabilities` out. (Column-reference arrays
need table qualification once ≥ 2 tables exist; define the qualified-name shape here when
implementing.)

**UI contract (§9, §13):** disabled modules grey out with a *why* tooltip ("Requires at
least 2 numeric columns — your dataset has 1"); enabled ones pre-populate dropdowns from
the column-reference arrays. Re-evaluates on ingest, table drop, derived-table creation,
and manual re-classification.

**ViewSpec rails (§9, D55/D56):** the broker's legal-capability output is also the grammar
of the declarative ViewSpec layer — the versioned layout artifact (`panels[]`: componentId
from a fixed registry + typed props + a §11.1-stage-6 chart config) that a deterministic
renderer consumes, never executing model output. v0's only producer is deterministic (the
broker + Dossier assembly, [05-dataset-dossier.md](05-dataset-dossier.md)); the optional
v0.5+ AI producer (D56) may reference only panel types the broker declared legal and chart
configs that typecheck, and degrades to the deterministic ViewSpec when AI is
off/down/uncached. **Layer identity is never encoded in `tier:` (D69):** the D69 profiling /
heuristics / AI-synthesis feature-maturity layers are a separate axis from the D68c disclosure
`tier:` (enum exactly `1|2|3`, no fractional `1.5`) — layers map *onto* disclosure tiers
(heuristics → 2, profiling cards → 3, AI-synthesis never 1), they are not stored in the field.

**Action Broker — `rankNextActions` (§9, D68):** beyond gating (*what's possible*), the same
module answers *what's worth doing next*. A second pure function ranks pre-configured
destinations with evidence attached:

```typescript
interface RankedAction {
  verb: string;            // imperative destination label, e.g. "Chart revenue over order_date"
  module: SidebarModule;   // real module it routes to (never "profile again")
  prefill: ThreadConfig;   // opens the module on the answer — §10, D68(e)
  evidence: FactRef;       // the D45 fact motivating it (one per action)
  score: number;           // D10 interestingness (effect size × coverage) gated by broker legality
}
function rankNextActions(tables: TableRegistryEntry[], insights: TableInsights[]): RankedAction[];
// insights = the per-table candidate sets (the §13.1 Dossier already assembles
// these). Each action's evidence FactRef takes its snapshot from the source
// table's ingest time. Only the analytical rules yield an action; the
// classification/quality notes (id-exclusion, null-pattern) stay in the quality
// headline / insight feed rather than routing every near-unique or null-heavy
// column back to "review this in the profile."
```

Joins broker legality with the D10 insight interestingness score (Module 1); the Dossier's
"suggested next steps" band and the tier-1 Verdict's top-3 consume it
([05-dataset-dossier.md](05-dataset-dossier.md)). Below the **interest floor** (no rule fires
above threshold) it returns honest generic routing ("profile each table," "try the correlation
matrix on the 4 numeric columns"), never a manufactured action. The optional v0.5+ AI producer
(D56) re-ranks/re-phrases within the broker grammar, emitting the same `RankedAction[]`, cached
per D45 fingerprint, and degrading to this deterministic output when AI is off/down/uncached.
It consumes the **single** insight feed (Module 1 / §20.5's matured `HeuristicFinding` library —
one pipeline, no parallel generator, D58/D69); the tier-1 Verdict and the v0.5 tier-2 data-sniffer
grid render that *same* feed at different disclosure tiers, never two competing authorities.

**The strip is retired by D73 (2026-07-26, master §9/§13.3, v0.70 / S6) — but the contract
below is not.** `OptionsStrip.tsx` goes; the ranked list relocates onto the restreamlined map,
and whatever renders it inherits every rule in this paragraph verbatim, one ranker included.
One routing change rides with it: **`RankedAction`s carrying SQL — today the `duplicates`
insight, which opens on the exact query that found the rows (D68e) — route to the drawer
console**, since the standalone SQL tab is deleted.

**Where each action renders — resolved 2026-07-26 by scope, into four homes that already exist**
(master §13.3's routing table). Dataset-wide *"go explore this"* → the map's **Suggested
Explorations** (opening a pre-run query tab); dataset-wide **quality findings that carry a query**
→ a **run action on the finding** in the explorer's Data Quality & Health panel (opening the
console) — **this is where `duplicates` lands**, and without it that action would have had no
destination at all once the SQL page went; **selection-scoped** findings → the drawer's Info view;
**legal-but-unranked or gated** → the command palette, disabled-with-reason copy intact. Four
render sites, **still one ranker** — the subject-scoped filter below is unchanged, and none of
these is a second ranking path (D58).

**Workbench options strip — a second consumer, not a second ranker (2026-07-24, D71 —
master §9/§13.3; retired 2026-07-26, contract inherited per above).** In the flag-on shell the map tab's options strip renders this same
`RankedAction[]`: **membership = the capability gate resolved against the selected subject's
legal operations; order = the D68a ranking applied to that legal set** — implemented as a
**client-side, subject-scoped filter of the dataset-wide `RankedAction[]`** (via each
action's `ThreadConfig` subject), never a second ranking path (D58). Not "no engine change":
the subject-scoped filter is a named, tested seam. Gated actions render
**disabled-with-reason** — the *why* tooltip contract above ("Needs a date column") survives
the redesign; legal-but-unranked actions collapse under a "more" affordance. The D68d
"skip to data" toggle is superseded structurally there: clicking a table in the explorer
opens its Profile tab directly, with an optional settings preference for open-on-Profile
([../12-workbench/](../12-workbench/README.md)).

## Files

`src/lib/capabilities.ts`, `src/hooks/useCapabilities.ts`; sidebar consumes via the shell
([../01-foundation/03-routing.md](../01-foundation/03-routing.md)).

## Dependencies

[02-column-classifier.md](02-column-classifier.md).

## Acceptance criteria

- [ ] Numeric-only CSV → Time Series + Categorical disabled with clear tooltips (§18)
- [ ] Single-column CSV → multi-column modules disabled (§22)
- [ ] Broker over 3-table folder = union semantics (§22)
- [ ] Any classification change (override, new table, drop) re-evaluates immediately
- [ ] All 5 samples produce the documented expected module set (§22)
- [ ] `rankNextActions` returns real module destinations (never "profile again") when modules are legal (D68a)
- [ ] Thin profile (single-column / no rule above threshold) → generic-but-honest routing, no manufactured action (D68c interest floor)

## Test plan

Unit: capability matrix across synthetic column mixes (none/one/many of each type). E2E:
the §22 "all 5 bundled samples → correct module set" run.

## Definition of done

Pure function, exhaustively unit-tested; sidebar states verified against every sample.
