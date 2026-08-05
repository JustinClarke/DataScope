# Privacy Model (Tiered)

**Tier: cross-cutting — every phase answers to this.**
**Master spec:** §5, §11.3. Enforcement checklist in [`testing-strategy.md`](testing-strategy.md).

Governing principle: **raw dataset rows never leave the browser except through explicit,
labeled user actions.** The original "no network requests after page load" promise survives
as one selectable mode, not the only architecture. Every escalation is opt-in and clearly
labeled in the UI — no silent architectural drift.

## AI modes (§5.1 — D2: all three ship; consent placement is shell-conditional)

**Renamed 2026-07-22 (human directive):** "Cloud AI" → **"API"**, and localhost Ollama moved
out of "Local model" and into "API" — reached through the same key/endpoint field a cloud key
uses, which auto-detects its own shape (a URL → local Ollama endpoint; anything else → bearer
key). "Local model" narrows to the in-browser WebLLM/WebGPU path only. Ollama reaches the
browser directly, never through the edge Worker — the same zero-egress shape it always had,
just triggered from API mode's field now.

| Mode | What leaves the browser | Notes |
| :--- | :--- | :--- |
| **Local-only (AI off)** | Nothing after initial page load | The original promise, intact. Acts as the global AI kill-switch. |
| **Local model** | Nothing (in-browser WebLLM/WebGPU only) | DuckDB-NSQL / Chat-with-a-Duck precedent. One-time download; weaker SQL generation than cloud. The **D43 spike passed (GO, 2026-07-21; ADR-007)**: pinned to a small coder (Qwen2.5-Coder-1.5B q4f16), Worker engine, resumable download; a "local" number in the D40 harness stays **D40-gated** before any comparative claim. Zero egress: WebLLM inference stays in the browser. Localhost Ollama no longer routes through this mode — see **API**. |
| **API** | **Ollama-shaped field, routing untouched (default): nothing** — treated as prefer-endpoint until routing is explicitly chosen. **Ollama-shaped + "Prefer my key": nothing** — direct browser→localhost, never through the Worker. **Ollama-shaped + "Use free tier first" (explicit):** cloud payloads leave for Workers AI while the shared budget serves, nothing once the client overflows to the local endpoint (client-orchestrated — the Worker can't reach localhost; §11.2). **Otherwise:** schema (table/column names, types), prompts, generated SQL, error traces. Sample data rows **only** if "data-sampled repair" is enabled (§11.3). | Workers AI by default; BYOK per D3 toggle, except Ollama-shaped fields default to prefer-endpoint until routing is explicitly set. One field serves both a bearer key and a local endpoint. |

The first-run chooser (D2) is a one-screen explanation of the three modes on first launch —
no silent default. **Workbench amendment (2026-07-24, D2/D71 — master §5.1):** the chooser is
the **current shell's** consent surface while it remains launch-capable; the **Workbench**
renders the same modes as **flat switches above the AI pane** — `Off` · `Cloudflare` ·
`WebLLM` · `Your own key (local or hosted)` — plus an on-demand **"Configure workspace"**
surface (no forced gate). Rules: **off by default**; a **capable device** (WebGPU + a D43-derived
memory floor vs. the ADR-007 pinned model; coarse, binary, recommendation-only) **pre-selects
WebLLM and highlights the pane — never auto-downloads** (the D70 confirm is the single WebLLM
gate); egress switches activate only through **flip → disclosure → explicit confirm** (no
producer, edge-warm synthesis included, egresses on a merely *selected* mode); `Your own key`
resolves its disclosure **after** field-shape detection (URL = zero-egress localhost; bearer =
leaves to the provider); and **egress modes never persist across sessions** (below).

## Cloud-mode repair specifics (§11.3)

In cloud mode, the retry loop's data-sampled repair sends up to 3 actual data rows to the
provider. This is **disclosed and separately toggleable**: the "metadata-only repair"
setting restricts retry context to schema + error trace.

## Other disclosures (§5.2)

- **Tier-2 relay ingestion:** target URL and response pass through the Cloudflare Worker —
  stateless pass-through, no secrets, nothing stored.
- **Saved/shared datasets (R2):** contents stored server-side *only* on explicit Save/Share,
  with retention + abuse controls (§12.3). The hosted share **defaults to the structure-only
  artifact** (D20) — schema, types, relationships, profile aggregates, **no data rows**; raw-rows
  share is a separate, explicitly labeled escalation. Language rule (D21): "structure only —
  no data rows included," never "anonymized"/"compliant"; redaction/suppression controls
  *reduce* re-identification risk, never eliminate it. The stage-A MCP endpoint (D38) serves
  these shared structure-only artifacts **read-only** — no new data leaves that the share
  itself didn't already expose.
- **Staged datasets (opt-in, D39; the D61 hosted tier):** a user may explicitly stage a full
  dataset to product-account R2 for server-side handling — datasets beyond the §7.3 in-browser
  ceiling, or the D38 stage-B MCP tools. This is the **hosted tier**, the chartered second
  platform rung (D61); its **privacy-and-deletion promise** binds it, in D21-compliant language:
  opt-in always (**never a silent fallback** — §7.3 only *offers* staging); a **disclosed
  lifecycle TTL by default**; **delete-on-demand honored within a stated window** (a manual
  "Clear temporary data" control plus the TTL); **documented retention**; and **no training on
  user data**. The promise is stated as verifiable server behavior — "deleted on schedule / on
  demand" — **never** as "anonymized," "compliant," or "your data is safe" (D21 extended from
  share copy to hosted-tier copy). **While staged, D38 MCP tools can read it.** The server-side
  execution design round (D39, anchored at the v0.5 close) fixes the exact disclosure copy before
  build, within these bounds.
- **v0.25 edge-warm dataset synthesis (D70):** the Blueprint's opening synthesis is served first
  from the Cloudflare edge (warm start) and then from in-browser WebLLM (client-side takeover —
  itself consent-gated: the ~830 MB model download is ask-first, never silent, per the 2026-07-22
  decision in §13.1/§19). The
  edge call carries **DSPS structural facts only — schema, types, profile aggregates, never data
  rows** (the same structure-only boundary as the D20 share, D45/D59); it is **opt-in**, a **stateless
  pass-through** (D9 — attached, forwarded, nothing stored server-side, no DSPS accumulation, D59),
  and **local-only mode never calls it** (D2 — the edge synthesis is a cloud/edge-mode feature). It is
  the D56 async upgrade over the deterministic Verdict, never the first-paint path. Column names are
  themselves re-identifiable (D46), so this is an explicit opt-in mode under the D2 first-run chooser,
  not a default.
- **Deeper cloud grounding (D72 — graduated row-sample escalation, per-session; master §5.2/§11.3):**
  a cloud AI turn may be grounded in a **larger, user-controlled, hard-capped sample of real rows**
  (default = the 3-row repair; user-raised up to a cap of N rows / M bytes, refuse-with-guidance
  above — never the whole dataset, which stays behind the D39/D61 hosted-mode round). **Default-off,
  per-session, non-sticky; disclosure precedes egress. Transmit-only:** never persisted to R2, never
  in a `.dsps`, never shared; `Off` aborts in-flight grounded turns. Labeling is custody-differentiated
  (D21): Cloudflare — *not used for training, not stored; transient performance caching may apply*;
  BYOK — *your provider's terms, outside DataScope's control*; plus a v0 "may contain sensitive
  values" caveat (the D46 detector is v0.5, positives-only). Homes: Configure-workspace + the
  contextual weak-answer prompt (§13.3).
- **BYOK keys (D9):** default = browser memory only, per-request stateless pass-through via
  the Worker, never persisted server-side. Opt-in "Remember my key" = server-side vault
  (Cloudflare secret/KV keyed to session) with delete control; the browser then holds only a
  reference, never the raw key in plaintext. Vaulted keys also carry a disclosed idle TTL —
  expire after 90 days without use (launch default, tunable; §11.2). **Field-shape amendment
  (2026-07-22):** the one key/endpoint field branches on its own contents — a URL is a local
  Ollama endpoint (reached directly by the browser, never the Worker, never persisted or
  vault-eligible — it isn't a secret); anything else is a bearer key under the custody rules
  above, unchanged. **Built 2026-07-23:** the vaulted key is encrypted at rest under a
  Worker-held secret, so the store is opaque to a dump; the vault fails closed (typed
  `unavailable`) rather than storing a key unprotected if that secret is missing; and no
  operation on the endpoint returns key material — resolution happens in-process inside the
  router, so there is no shape a key could come back in.
- **Edge anti-abuse counters:** the edge's rate-limiting and abuse controls use transient
  per-IP counters held only for the duration of the rate window — never stored with, or
  joined to, any dataset, key material, or saved object (Cloudflare sees client IPs
  regardless; nothing here adds to that; §23.1, §23.5).
- **Client-side persistence:** **amended 2026-07-29 (master §5.2 Revised(18); v0.70 S6.9,
  human call) — datasets now persist on the user's own device.** Dataset **bytes** go to the
  browser's origin-private file system (OPFS) and registry **metadata** (catalog, profiles,
  classifications, tabs, selection, relationship overrides — never rows) to `localStorage`, so
  a refresh restores the workspace instead of destroying it; **always on, no opt-in gate**, with
  a **"Clear workspace data"** control that empties both. Previously datasets lived in DuckDB's
  in-memory VFS only and closing the tab destroyed them. **No egress claim changes** — OPFS is
  inside the browser, no byte crosses a wire, D52's "check DevTools" line still passes, and rows
  leave the machine only through D39/D61 staging or an explicit Save/Share. Not everything is
  durable: sampled-tier files, API tables (`sourceUrl` re-fetch), derived tables (`generatingSql`
  replay) and D62 viewer sessions are not stored as bytes, and an unrecoverable table is shown on
  reload as needing a re-drop rather than as a queryable registry row
  (`../build/14-workspace-streamline/07-workspace-persistence.md`). **Persistence
  boundary (2026-07-24, D2 amendment — master §5.2): only zero-egress preferences persist
  across sessions** (`Off`, WebLLM-enabled, theme, the BYOK *reference*); **egress-enabling
  modes (`Cloudflare`, a bearer key's active state, D72 grounding) reset to off each session
  and re-disclose on re-arm** — no dataset is analyzed under a silently restored egress
  posture consented to for different data. The BYOK reference persists alongside a **durable vault session id minted
  only on opting into "Remember my key"** (2026-07-23) — remembering a key across tab closes
  requires an identifier that outlives the tab, and a user who never opts in gains none; every
  other edge call's session id stays per-page-load and content-free.
- **AI transcript persistence (D74g — amends D41; human call 2026-08-02):** the AI transcript,
  previously in-memory-only because it is content-bearing, now **persists locally across
  sessions**. The reason is capability, not convenience: an analyst loop that cannot see what it
  already established re-derives it, and re-derivation is what exhausts a turn budget (master
  §11.5's evidence-retention requirement, D74h). **This changes nothing about egress** — the same
  browser-local mechanism as the persistence bullet above, no byte crosses a wire, and the
  DevTools check D52's permission line invites still passes. What changes is the **at-rest
  posture**, stated plainly rather than waved at: question text, generated SQL, returned values,
  and model prose now survive tab close on a possibly-shared machine — a stronger claim on the
  user's disk than registry metadata was, since that bullet stores *never rows* and this one
  stores values that came **from** rows. Three conditions ride with it, none optional: a
  **visible clear-history control** (folded into "Clear workspace data", so one action means one
  thing), **no persistence in D62 viewer mode** (a consumption-only session stores nothing, as it
  already stores no dataset), and the **D46 "may contain sensitive values" caveat applied to
  stored transcript content** exactly as D72 applies it to transmitted rows. Same D21 language
  rule as its neighbours — "removes the history this browser stored on this device," never
  "securely erased." **D41's content-free-telemetry half is untouched:** operator counters still
  never carry prompt, SQL, or error text.
- **No third-party tracking by default.** Any future usage analytics are opt-in with a
  visible consent banner, never transmit dataset contents or query text, and are **hard-off
  in local-only mode** (§18) — the zero-network guarantee always wins over measurement.
  Operator-side infrastructure counters (§23.5) are a separate, content-free thing: request
  counts and outcome classes with no URLs, payloads, session tokens, or IPs, never joined to
  user data. Per **D25** the same content-free machinery also counts product **edge events**
  (hosted shares created, relay fetches, edge-routed structure-report exports, AI-mode
  requests routed) plus CDN-level visitor counts — **local-only mode stays zero-network and
  is deliberately uncounted** (an accepted blind spot; the visible graph is the
  edge-touching funnel). Per **D41** these counters also carry **numeric-only LLM metrics** on
  the cloud/edge path — tokens/turn, retry count, repair-rate, latency bucket — and **never
  prompt text, generated SQL, or error text** (that content lives only in the client-side
  §11.1 transcript). OTel-style content-bearing Worker-path tracing is out (a §5.2 violation);
  content-bearing traces for **explicitly staged datasets only** (D39) are a question for the
  D39 design round, not decided now.

## Hard invariants (test these, don't just assert them)

- Local-only mode: **zero network requests after initial page load** (DevTools Network tab).
- Workbench (D2 amendment): a fresh session starts with every egress mode off, regardless of
  the previous session's switches; flipping an egress switch produces **no** network call until
  its disclosure is confirmed (the edge-warm synthesis path included); D72-grounded rows appear
  in no stored artifact (R2 object, `.dsps`, share) — request-transcript evidence only.
- Cloud mode: only the disclosed payloads leave; with metadata-only repair on, no data rows
  appear in any request body.
- Tab close leaves no dataset **rows** in `localStorage`/`IndexedDB`/cookies (settings +
  registry metadata only); dataset **bytes** are in OPFS by design (amended 2026-07-29, §5.2),
  disclosed, and removed in full by "Clear workspace data".
- BYOK key never appears in browser storage or request bodies in plaintext (reference token only).
- Share-link delete control removes the R2 object; TTL expiry actually expires.
- Paid tiers (if ever, §20.10) only add server-side conveniences already opt-in by design —
  nothing local ever moves behind a paywall.
