# Backlog: Monetization & Packaging (free-forever local core, D28)

**Tier:** backlog — explicitly not a v1 concern · **Master spec:** §20.10, D28, D36

**The local core loop is free forever (D28)** — ingest, profile, SQL, charts, insights,
quality report, structure-report export — permanently; nothing that runs locally ever moves
behind a paywall. A trust asset for a privacy product and an architecture guard. **Paid
only ever follows real server-side cost or team value**, charging only where the
infrastructure line does:

- **Cloud persistence** — R2 save/share beyond the free default (longer TTL, larger
  objects, more concurrent links).
- **AI routing & BYOK vault** — hosted key custody and Workers-AI overflow beyond the free
  ceiling; local models and direct-BYOK modes stay free. The free cloud-AI pool is
  deliberately a capped, shared demo budget (§11.2); scaling it is a paid-tier/budget decision
  (§23.5), not an architecture change.
- **Team features** — shared workspaces, org-scoped share links with longer TTL, and
  (post-Studio) shared semantic models.
- **Hosted tier — data staging & server-side execution (D39; chartered as the commercial arc,
  D61)** — staging a dataset to DataScope cloud and executing SQL/profiling server-side is real
  per-request compute cost, the legitimate paid seam (D28), now **named the product's chartered
  commercial arc** — the second platform rung on the D61 ladder (browser → hosted tier → desktop
  → rest on request), scheduled ahead of desktop ([`temp-staging.md`](temp-staging.md)). Its
  **privacy-and-deletion promise binds it (D61, §5.2):** opt-in always, disclosed TTL,
  delete-on-demand within a stated window, documented retention, no training on user data —
  stated as verifiable server behavior, never as "compliant" or "your data is safe" (D21). Price
  anchors stay deferred (D36); custody, disclosure, cost ceilings, and the promise copy are fixed
  by the D39 design round (anchored at the v0.5 close) before it ships. Opt-in scale-up only —
  never the default and never part of v0/v0.5 launch identity.
- **Privacy-constrained sharing (§3.5 seam)** — if the §20.11 share tiers ship, the
  synthetic-replica export and advanced suppression controls are the natural paid line for
  users in regulated environments who can't upload or share raw data but must share its
  shape ([`shape-share-extensions.md`](shape-share-extensions.md)). Subject to the D21
  language rule — sold as "share the shape," never as a compliance guarantee.

**Pricing is deferred (D36).** No price anchors are recorded — monetization is revisited
when the product is ready (alongside the D29 v0.5-planning cadence). When revived, the D28
corrections are binding: **no limits on local capabilities** (token/BYOK connections are
client-side and stay unlimited and free), **no content gating** (templates are content, not
server cost), and **server-side auto-refresh requires a dedicated custody design round**
(disclosure model, token custody, kill switch) before it may exist as a paid feature —
client-side refresh-on-open stays the free default.

**Invariant:** the privacy model
([`../foundations/privacy-model.md`](../foundations/privacy-model.md)) is unaffected —
nothing that runs locally ever moves behind a paywall; paid tiers only add server-side
conveniences that are already opt-in by design.
