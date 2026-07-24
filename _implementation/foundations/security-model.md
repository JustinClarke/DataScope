# Security Model

**Tier: cross-cutting — every phase answers to this.**
**Master spec:** §23.1 + §23.5 (D19), §23 / §24.4 (D50 — self-host zip + `/security` page),
with §5 (privacy), §17 (risks), §22 (checklist). Delivery-side controls (CI gates, Terraform,
secrets plumbing) live in [`infrastructure.md`](infrastructure.md).

Scope split: [`privacy-model.md`](privacy-model.md) governs what *data* leaves the browser;
this doc governs what an *attacker* can do — to the app, to the enumerated edge surface, and
to the pipeline that ships both. The threat model is small because the architecture is (§1,
§4): no accounts, no server-side query execution, three enumerated edge paths.

## Threat model (§23.1)

| Surface | Threat | Control |
| :--- | :--- | :--- |
| **Rendered dataset content** (cell values, column names, API responses) | Stored/reflected XSS — a crafted CSV cell (`<img onerror=…>`) executing in the profile grid, results grid, chart tooltips, or insight cards; a poisoned share link (§12.3) attacks whoever opens it | Every dataset-derived string is untrusted input: text nodes only (React default — `dangerouslySetInnerHTML` banned on dataset-derived strings); escape in SVG/Canvas chart labels. Adversarial CSV fixture in the regression suite. |
| **Static app delivery** | Script injection, clickjacking, MIME sniffing | Security headers from the v0 public ship (below). Headers are reviewable config in the repo, never dashboard toggles. |
| **Anonymous session identity** — the primitive every edge control hangs off | Self-minted/forged session tokens turn every per-session limit into a no-op (fresh-session farming); or IP-only keying rate-limits a whole NAT/CGNAT pool of real users | Tokens are **server-minted and integrity-protected** (signed opaque value the Worker issues on first edge call — clients can't self-mint); issuance is itself **per-IP rate-limited**; all edge limits are **dual-keyed** — a per-session limit plus a coarser **per-IP floor** (≈3–5× the per-session limit, launch default, tunable); no PII, no account linkage, rotatable on demand (§23.1). |
| **Tier-2 CORS relay** | SSRF against internal / cloud-metadata addresses; open-proxy / cost abuse | Private-IP/localhost/link-local rejection + dual-keyed per-session + per-IP rate limits (§23.1); **GET-only**, **no client-supplied headers forwarded** to the target, response **streamed with a byte-count cutoff** (never buffered Worker-side), ≤20 pages/invocation — specced in [`../build/09-edge/02-cors-relay.md`](../build/09-edge/02-cors-relay.md); relay stays storage-free; §23.5 spend ceiling + kill switch. |
| **AI router** (cloud inference) | Account-wide shared Workers-AI pool drained by a few users or an unmetered script; uncapped spend on a paid plan | Per-session daily Workers-AI quota (**20 turns/session/day**), **10 req/min/session**, **64 KB body cap** (§11.2), dual-keyed with the §23.1 per-IP floor; §23.5 budget ceiling, billing alerts, and per-endpoint kill switch — all launch defaults, tunable. |
| **R2 save/share** | Share-link enumeration; abusive content; cost / storage abuse | Unguessable IDs (≥128-bit random), private by default, TTL + delete control, per-session size caps + rate limits (§12.3, [`../build/09-edge/04-persistence-endpoints.md`](../build/09-edge/04-persistence-endpoints.md)); §23.5 8 GB bucket-size alert + save kill switch as the overflow response. |
| **BYOK vault** | Key theft or leakage; unbounded accumulation of orphaned third-party keys | D9 custody model ([`../build/09-edge/03-vault.md`](../build/09-edge/03-vault.md)); vault ops rate-limited (**10/session/hour**); vaulted keys carry a **90-day idle TTL** (launch default, tunable, refreshed on resolve) and a cap of **3 credentials/session** (§11.2); key material scrubbed from Worker logs and error traces. |
| **MCP surface / staged data** (D38, D39) | Stage-A MCP reads shared artifacts an attacker could enumerate; stage-B tools + server-side execution over staged datasets are a new, larger attack surface (query/cost abuse, data exposure) | Stage A serves **only** explicitly shared structure-only artifacts read-only — same unguessable-ID, kill-switch, and dual-keyed limiter controls as R2 share (§23.5), adding no data beyond the share. Stage-B tools and server-side execution run **only** over explicitly staged datasets (D39) and are gated behind the **dedicated D39 design round** — abuse controls, cost ceilings, and disclosure specced there before build (v1+). |
| **Supply chain** | Compromised npm package or GitHub Action | Committed lockfile; `npm audit` CI gate (fail on high/critical); automated dependency-update PRs; Actions pinned to commit SHAs; lifecycle scripts disabled in CI installs where feasible. |
| **Secrets** | Leaked Cloudflare / AI-provider tokens | No secrets in repo, bundle, or (where avoidable) Terraform state; `wrangler secret` + GitHub encrypted secrets; least-privilege scoped API tokens; secret scanning in CI. |

**Detection arm (§23.5).** The rate limits and kill switches above are the *response* to abuse; the §23.5 content-free observability counters — per-endpoint outcome classes (ok / 429 / 5xx / killed), plus alerts on Workers-AI usage ≥ 80% of the daily allocation, R2 storage, edge error-rate spikes, and daily request volume — are how abuse is *seen*. Limits without the counters are unfalsifiable, so the two ship together.

## Required headers (v0 ship gate)

- **CSP** — see specifics below
- **COOP/COEP** — already required for SharedArrayBuffer (DuckDB-Wasm, §17 / ADR-001)
- `X-Content-Type-Options: nosniff`
- `frame-ancestors 'none'` (CSP directive; no framing use case exists)
- `Referrer-Policy: strict-origin-when-cross-origin`

**CSP specifics:** DuckDB-Wasm needs `wasm-unsafe-eval`; the DuckDB worker needs a
`worker-src` allowance; `connect-src` enumerates `'self'`, the edge Worker origin, and
`http://localhost:11434` (local-model Ollama, §5.1). CSP is static per deploy, so it cannot
tighten per AI mode — the local-only zero-network guarantee stays enforced by the privacy
tests ([`privacy-model.md`](privacy-model.md) hard invariants); CSP is the backstop, not the
mechanism. Exact directives (Monaco style requirements, `blob:` workers) are **validated
during the Phase-1 ingestion spike** alongside COOP/COEP (D18) — not guessed up front.

## Self-host artifact & the `/security` page (D50)

The §4 edge-independent core means the built app is already a **folder of static files that
runs with zero network**, so two low-cost transparency artifacts ship:

- **Versioned self-host zip.** Every release publishes the static build as a versioned zip
  (GitHub Releases) with header/config docs — the COOP/COEP requirements above, and the
  **degraded no-SharedArrayBuffer mode** documented for hosts that can't set them.
  "Unzip onto your intranet" is the cheapest possible answer to GCC/gov data-residency and
  **rung 2 of the sovereignty ladder** (web → self-host zip → desktop, D51). Delivery
  mechanics live in [`infrastructure.md`](infrastructure.md).
- **`/security` page.** A single page enumerating the app's **complete possible network
  surface** — every endpoint it can ever call (the three §1 edge paths + the local-model
  Ollama origin), the exact CSP `connect-src`, and a **DevTools proof** the reviewer can
  reproduce. It turns the infosec reviewer from blocker into channel (the N2 max move), and is
  directly checkable against the `connect-src` allow-list above.

**~1–2 days; v0 if free days exist, else v0.5; never a date risk (D27).** Both are pure
transparency over the existing surface — they add no new endpoint.

## The approval kit — filable trust for organisations (D63)

Trust for organisations must be **filable, not just demonstrable** — "check DevTools" convinces
the individual, not the CISO. The **approval kit** bundles the self-host zip (D50) + `/security`
page with two verifiable-trust pieces, ascending in cost — the one link a champion forwards to
security to get DataScope blessed org-wide (the §24.4 leave-behind gains it):

1. **Published build provenance (v0.5-era).** The reproducible build ([`infrastructure.md`](infrastructure.md),
   §23.2) is promoted from CI hygiene to a public claim: CI publishes **bundle hashes +
   SLSA-style provenance attestation** on the `/security` page, so anyone can verify the hosted
   bundle is byte-identical to the audited source. Mostly CI discipline + publishing — near-zero
   app code.
2. **Signed `.dsps` (its own design round before build; v0.5+).** D45's provenance *labels* gain
   a verifiable *signature* — a receiver can confirm an artifact was genuinely computed by
   DataScope from a file with hash X, not hand-edited. Claim discipline (D21/D45): "genuine,
   unmodified DataScope profile of file-hash X" — **never** "this data is safe." Design
   constraint: **client-side signing against a published public key only** — any per-request
   signing service is new server surface (§4) and out of scope without its own round.
3. **Third-party security audit.** A **GTM expense decision, not spec work** — tied to the first
   serious design-partner conversation (§24.4), founder-triggered, no date.

**Workbench homes (2026-07-24, D71/D72 — master §13.3/§5.2).** In the flag-on shell the
**D63 trust chrome renders in viewer mode**: a `?share=` URL or dropped `.dsps` opens the
read-only Workbench with a **full-width provenance band** — structure-only claim · signer ·
signature-verified state — plus the D45 provenance chrome in full (computed-as-of snapshot +
hash, provenance tags, banned-permanence wording); this band is where piece (2)'s signature
verdict surfaces to a receiver
([`../build/08-persistence/03-dsps-spec.md`](../build/08-persistence/03-dsps-spec.md)).
**D72 deeper cloud grounding** adds one control-plane rule and one labeling rule: the AI
pane's **`Off` switch is a hard kill — it aborts any in-flight grounded turn**, not just
future ones; and grounded-turn labeling is **custody-differentiated (D21)** — Cloudflare
route: *not used for training, not stored by Cloudflare; transient performance caching may
apply*; BYOK route: *rows go to your provider under your provider's terms, which DataScope
cannot control* — plus the v0 "may contain sensitive values" caveat (the D46 detector is
v0.5, positives-only).

## Hard invariants (test these, don't just assert them)

- Adversarial CSV fixture (script/HTML payloads in cell values *and* column names) renders
  inert in profile cards, results grid, chart labels/tooltips, and insight feed.
- Deployed app serves every required header (checked against the live URL, not just config).
- Relay rejects SSRF probes: `http://localhost`, `http://10.0.0.1`, `http://169.254.169.254`.
- A fabricated or self-minted session token is rejected and falls to the per-IP floor — the
  edge test suite exercises this, so the per-session limits in §7.4/§11.2/§12.3 are real
  rather than trivially bypassable (§23.1).
- `npm audit` clean of high/critical; secret scan green on every PR.
- Key material never appears in Worker logs or error traces (grep the staging logs in E2E).
- The `/security` page's enumerated network surface matches the deployed CSP `connect-src`
  allow-list exactly — any drift between the two is a release-blocking bug (D50).
- Flipping the AI pane's `Off` switch mid-turn aborts an in-flight D72 grounded request
  (observable as a cancelled network call, not merely a discarded response) — §5.2/§13.3.

## Process rules

- A security review runs before each tier's public ship (v0, v0.5, v1).
- New server surface requires revisiting the Decision Record (the
  [`../build/09-edge/`](../build/09-edge/) rule) — and therefore this threat model.
- The §22 Security checklist ([`testing-strategy.md`](testing-strategy.md)) is the per-phase
  gate; the CI pipeline ([`infrastructure.md`](infrastructure.md)) enforces it mechanically.
