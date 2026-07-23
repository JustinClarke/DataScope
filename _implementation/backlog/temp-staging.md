# Backlog: The Hosted Tier — Temporary Cloud Staging & Server-Side Execution

**Tier:** **chartered second platform rung (D61)** — the hosted tier, scheduled ahead of
desktop; design round anchored at the v0.5 close (D39, revives D16 per its clause); **GCS
dropped, R2-only** · **Master spec:** §7.3, §20.10, §5.2, §23.5 · **Decisions:** D39, D61, D16.

The previous >500MB design (upload to a temp bucket, httpfs remote read, TTL) moved to
backlog; the 300–500MB and >500MB ingestion tiers collapsed into refuse-with-guidance
([`../build/02-ingestion/05-large-files.md`](../build/02-ingestion/05-large-files.md)).
**D39 revives it** as an **opt-in** hosted-staging tier (motivations: datasets beyond the
§7.3 ceiling, and enabling D38 stage-B MCP), and adds a **dedicated server-side-execution
design round before build**: engine placement, cost ceilings + §23.5 counters, abuse
controls, disclosure copy, and the D28/§20.10 pricing seam (real server-side cost = the
legitimate paid seam; anchors still deferred, D36). Staging is only ever an **offered** §7.3
option (d), never a silent fallback.

**D61 charters this as the hosted tier — the second platform rung and the commercial arc.**
The surface-investment ladder is browser → **hosted tier** → desktop → rest on request; D61
promotes this tier from "deferred, v1+" to a **named product tier scheduled ahead of desktop**,
with its **design round anchored at the v0.5 close** (where D36 pricing revisits). It is opt-in
scale-up only — never the default and never part of v0/v0.5 launch identity (D23/D27/D28). Its
**privacy-and-deletion promise binds it (D61, §5.2):** opt-in always, disclosed lifecycle TTL,
**delete-on-demand within a stated window**, documented retention, and **no training on user
data** — stated as verifiable server behavior ("deleted on schedule / on demand"), **never** as
"anonymized," "compliant," or "your data is safe" (D21). The D39 design round fixes the exact
promise copy before build, within these bounds.

**Design when revived — R2-based, no second cloud provider, one disclosure story (D16):**
- Presigned PUT issued by the Worker
- Lifecycle-rule TTL on the staging bucket
- Manual "Clear temporary data" control
- DuckDB `httpfs` remote read against the staged object (shares machinery with
  [`httpfs-bucket-mode.md`](httpfs-bucket-mode.md))
- Same disclosure standards as save/share
  ([`../foundations/privacy-model.md`](../foundations/privacy-model.md)) — this is dataset
  contents leaving the browser, even if temporary

**Trigger:** demand signal from users hitting the >300MB refusal tier who can't self-serve
the object-storage workaround.
