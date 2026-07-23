# Bundled Sample Datasets

**Tier: cross-cutting — used by every phase's tests and demos.**
**Master spec:** §14.

So the tool is immediately usable without the user bringing data, bundle small samples that
each unlock different capability combinations. Ship as small CSVs (location: `/public/samples/`
per §14 — but see the `/public` vs `src/data/samples/` wrinkle flagged in
[`../architecture/system-design.md`](../architecture/system-design.md)), selectable from the
ingestion screen.

| Dataset | Rows | Column mix | Foundation capabilities exercised |
| :--- | :--- | :--- | :--- |
| **E-commerce mini-warehouse** *(folder: customers, orders, order_items, products)* | ~5K total | IDs/FKs across 4 tables + Date, Quant, Cat | Multi-table ingestion (D13), cross-table SQL/joins. *(Studio arc: the canonical demo for relationship inference, schema graph, dbt export — and the D17 spike target.)* |
| **Titanic Passengers** | ~900 | Age, Fare (Quant); Survived, Class (Cat) | Distribution, categorical breakdown, correlation *(later: classification, clustering)* |
| **Daily Stock Prices** | ~2,500 | Date (Temporal); Open/Close/Volume (Quant) | Time series, correlation, distribution |
| **Product Reviews** | ~500 | ReviewText (Text); Rating (Quant/Cat) | Categorical breakdown, distribution, text search *(later: NLP)* |
| **City Weather Data** | ~3,650 | Date (Temporal); Temp/Humidity/Wind (Quant) | Time series, correlation, all stats |
| **Spotify streaming history** *(Personal Data, D30; synthetic sample export)* | synthetic | Timestamp (Temporal); artist/track (Cat/Text); ms_played (Quant) | Time series (listening by time-of-day / day-of-week), categorical breakdown *(consumer channel; ZIP ingestion §7.5)* |
| **Google Takeout activity** *(Personal Data, D30; synthetic sample export)* | synthetic | Timestamp (Temporal); activity/search (Cat/Text) | Time series, categorical breakdown, text search *(component-selection guidance §7.3)* |

## Personal Data category (D30 — consumer channel)

Spotify and Google Takeout ship as a **"Personal Data" sample category**: each bundles a
*synthetic* sample export so `/spotify` and `/google-takeout` demo instantly (real exports
take days to arrive — the return visit is a feature). A **template** = schema mapping +
pre-written SQL + chart configs over the existing modules (~200–500 lines/platform; engine
unchanged). Templates are **versioned** and **degrade gracefully to generic profiling** on
schema drift (banner, never a hard error). **Time-to-first-result bar (D57, §18):** a *real*
export ZIP reaches its first rendered template chart in ≤ 2 minutes on a mid-range laptop,
client-side ZIP extraction and template matching included. Social/messaging exports contain other people's
data → template charts **default to aggregates**, never named-contact leaderboards.
Unmarketed at the Oct 6 launch (D23 owns the narrative); consumer wave is Wrapped-season
(§24). Template format documented + opened to community in v0.5.

## Roles beyond demos

- **Test fixtures:** the §22 correctness gate runs all 5 through
  ingest → profile → classify → capabilities and checks the enabled module set.
- **Insight-feed gate (D10):** each sample must surface ≥ 3 correct, non-trivial insights.
- **D17 spike input:** the e-commerce folder is the target for the FK-containment/
  cardinality prototype in Phase 1.
- **Guided tour (Phase 6, pulled forward to v0):** one-click reproduce demo over a bundled
  sample — ingest → profile → insight → chart, dismissible, re-runnable from Learn.
- **Performance benchmarks** run against these plus a 50MB reference CSV (not bundled).
