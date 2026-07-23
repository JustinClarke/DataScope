# Backlog: Operational Insight — Content-Free Usage-Shape View

**Tier:** backlog — deferred, trigger-gated (D60) · **Master spec:** §20.13, §18 (usage
metrics + steering bars), §23.5 (operator counters), §0 D25 / D41 / D59.

A legible **"usage shape" view** over the content-free signals DataScope already emits — so
the founder can see how people actually use the app — **without ever collecting dataset
content, query text, or per-user structure**.

**Do not build anything yet.** No new telemetry, no dashboard, no schema changes.

**Revive trigger:** real, sustained usage exists — concretely, **v0.5 has shipped and the §18
launch steering bars (D27) are green**, *or* there is a specific operator question that the
existing raw counters can't answer by hand. Until then, parked.

## Why it is cheap and safe — the core framing

The collection machinery is **already decided and already content-free**. This is a
*reading/analysis layer* over signals the app emits anyway, **not new data collection**. That
is what keeps it low-cost and what keeps it inside the privacy identity. If a proposed metric
requires collecting something new, stop — that is the D59 line (see Guardrails), or at best
the gated sub-task below.

The cheapness is also the reason for the trigger: a reading layer over counters that do not
yet emit is not cheap, it is speculative. The signals below are **specced, not live** until
the app ships.

## What already exists to read (grounding decisions — read these first)

| Signal source | What it gives you | Where |
| :--- | :--- | :--- |
| **Edge event counters (D25)** | shares created, relay fetches, edge-routed structure-report exports, AI-mode requests routed; CDN-level visitor counts | §23.5, D25 |
| **Numeric LLM metrics (D41)** | tokens/turn, retry count, repair-rate, latency buckets — as Analytics Engine doubles + outcome-class blobs; **never** prompt/SQL/error text | §23.5, D41 |
| **Opt-in usage metrics (§18)** | time-to-first-chart, insight-acceptance rate, export/share success rate, NL→SQL self-correction rate; plus the v0.5 CDN repeat-visitor return signal | §18 "Usage metrics & iteration loop"; [`../foundations/testing-strategy.md`](../foundations/testing-strategy.md) |
| **Launch steering bars (§18/D27)** | reach, organic floor, artifact travel, beachhead pull | §18 "v0 success criteria"; [`../product/strategy.md`](../product/strategy.md) |
| Infra/telemetry plumbing | how the counters are wired (Analytics Engine, §23.5 ceilings) | [`../foundations/infrastructure.md`](../foundations/infrastructure.md), [`../foundations/security-model.md`](../foundations/security-model.md) |

## Questions a usage-shape view should answer

The "so what" — the operator decisions the view exists to inform:

- **Which ingest paths get used** (single file vs. folder vs. API vs. bundled sample) → where
  to invest ingestion effort.
- **Do people reach the ② moat** (multi-table structure / Join Graph, D24), or bounce before it?
- **Does the artifact travel** (shares + structure-report exports created, D26 attribution
  arrivals) → the §18 "artifact travel" bar, made continuous.
- **AI-mode split** (local-only vs. cloud) → feeds the shared-pool economics (D2, §11.2).
- **Where the funnel drops** (ingest → first insight → export) → the time-to-first-insight
  axis (§3.5), the one winnable axis.

## The one extension that needs a design gate first

Everything above is *already-decided* content-free signal. Numeric **"dataset shape" buckets**
— row-count bucket, column-count bucket, boolean type-mix flags ("has a temporal column",
"≥2 numeric") — are a **new** signal and edge toward content. Possibly fine, but only as
**aggregate counts with no column names and no values**, opt-in per §5.2, and only after
passing a **D42/D46 review before collection**. A separate, gated sub-task — never part of the
cheap dashboard-over-existing-signals work.

## Guardrails (do not cross — these are the product's identity)

- **No DSPS / structure harvesting (D59).** Never auto-store users' DSPS or accumulate their
  structure server-side. This whole item is the *sanctioned* alternative to that rejected idea.
- **Content-free only (D41).** No prompts, SQL, error text, column names, or values off the
  device — numeric doubles and outcome classes only.
- **Local-only mode stays invisible (D25).** Zero-network mode is uncounted by design; that
  blind spot is accepted. The visible graph is the edge-touching funnel — the part an
  operator/investor conversation needs anyway.
- **Opt-in, disclosed (§5.2).** Any user-side analytics are opt-in with a visible consent
  banner — never default-on, never third-party tracking. See
  [`../foundations/privacy-model.md`](../foundations/privacy-model.md).
- **No per-user profiles.** Aggregate/operator view, not a per-visitor dossier.

## First moves when the trigger fires

1. Read the grounding decisions (D25, D41, D59, D60, §18, §23.5, §5.2).
2. Confirm the trigger has actually fired (traction exists) — if not, stop and report that.
3. Inventory which content-free counters are **live in the shipped build** vs. still specced.
4. Draft the view over the *live* signals only; list any desired metric that would need new
   collection separately, flagged for the §5.2 / D42 / D46 gate.
5. If it grows beyond this doc, land it master-first per
   [`../maintenance/README.md`](../maintenance/README.md) (append-only D-row, then mirror; run
   `sweep.sh`).
