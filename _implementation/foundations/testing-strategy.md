# Testing Strategy & Acceptance Gates

**Tier: cross-cutting — every phase answers to this.**
**Master spec:** §18 (acceptance criteria + usage metrics), §21.9 (strategy), §22 (per-phase
developer checklist).

## Strategy layers (§21.9)

1. **Unit tests** — classifier rules, broker evaluation, chart mapper, query suggester,
   input normalizer, SQL lint (pure `src/lib/` functions are the easy 80%).
2. **Worker integration tests** — DuckDB worker round-trips: register buffer → create table
   → SUMMARIZE → query → cancel.
3. **E2E** — the §18 functional criteria below, driven through the real UI.
4. **Performance benchmarks** — against the bundled samples + a 50MB reference CSV
   (targets in [`performance-budgets.md`](performance-budgets.md)).
5. **Regression suite** — every bug fixed gets a pinned test.
6. **NL→SQL eval harness (D40, §11.4)** — a **dev/CI-only** harness (separate `eval/` dir or
   repo, **not** product runtime) over a curated ground-truth NL→SQL question set on the §14
   samples — the labeled set is the expensive artifact — measuring exec-rate,
   result-correctness, cost/turn, and repair-rate per provider/mode. **TypeScript by default**
   (matches §6/§16); Python only if a D18-style spike documents a concrete TS gap (record the
   finding, not a job-market rationale). It **gates the v0.5 Phase-4 ship** at thresholds
   declared when built; it does not touch the v0 gate or the Oct 6 date (D27). It may report a
   "local" number only for a local-model path that passed the D43 spike.

Process (§21.10, A.5): build and verify one pipeline stage at a time; per-issue prompts stay
small ("Implement Issue #17 only. Don't modify unrelated files. Follow ADR-001. Pass all
tests. Update docs.").

## Functional acceptance criteria (§18)

**Tier gating (D15): AI-chat, API-ingestion, and save/share criteria gate the v0.5 release;
everything else gates the v0 ship.**

v0 gate:
- [ ] CSV with mixed types → all columns correctly classified, appropriate modules enabled
- [ ] Folder of mixed supported/unsupported files → every supported file registered as its
      own profiled table, rest skipped with a single summary toast; cross-table JOINs run (D13)
- [ ] CSV with only numeric columns → Time Series + Categorical disabled with clear tooltips
- [ ] File > 100MB → sampled preview mode with visible banner (not a crash)
- [ ] Non-supported file (.xlsx, .pdf, .zip) → clear, non-technical error message
- [ ] SQL auto-suggestions contextually correct for the dataset's columns/types
- [ ] Insight feed: each bundled sample surfaces ≥ 3 correct, non-trivial insights, each with
      generating SQL + open-as-chart (D10); renders identically in local-only mode, zero network
- [ ] Structure-report export (D20, §12.2): each bundled sample exports a self-contained HTML
      report that opens from the filesystem with no network access + a JSON export that
      round-trips schema/profile metadata; neither contains data rows; works in local-only
      mode, zero network
- [ ] Personal-data template (D30/D57, while templates survive the D27 cut order): a *real*
      Spotify or Google Takeout export ZIP → first rendered template chart in ≤ 2 minutes on
      a mid-range laptop, incl. client-side ZIP extraction + template matching; schema drift
      → generic profiling with a banner, never an error dead-end
- [ ] Closing the tab releases all memory; no dataset contents in `localStorage`/`IndexedDB`
- [ ] All bundled samples load and profile on a fresh page load
- [ ] Edge-independent core: with the edge origin blackholed (blocked/unreachable),
      ingest/profile/SQL/charts/insights remain fully functional — never a hang or crash (§4)

v0.5 gate:
- [ ] AI chat: a typo'd question is normalized, generates valid DuckDB SQL; a
      deliberately-broken query visibly self-corrects within 3 retries
- [ ] AI mode switch: local-only = **zero network requests after page load** (Network tab);
      cloud = only disclosed payloads (§5.1)
- [ ] Save/Share: structure-only artifact is the pre-selected default and its stored object
      contains no data rows (D20); a full-dataset link round-trips a modified dataset on
      another device; delete control and TTL expiry both work
- [ ] Each typed edge response renders its friendly paused/unavailable state — 503 (kill
      switch, §23.5), 429 (rate limit), AI-quota-exhausted — never a hang (§4)
- [ ] NL→SQL eval harness (D40, §11.4) clears its declared exec-rate/result-correctness/cost/
      repair-rate thresholds — a v0.5 Phase-4 ship gate that never touches the v0 date (D27)

## Developer checklist (per-phase gate, §22)

### Performance
- [ ] Ingestion with the 50MB reference CSV on Chrome, Firefox, Edge
- [ ] Peak memory < 512MB for datasets < 50MB
- [ ] DuckDB-Wasm init < 3 s on throttled "Fast 3G"
- [ ] Monaco lazy-loads only on first SQL-tab click

### Correctness
- [ ] All 5 bundled samples: ingest → profile → classify → capabilities → correct module set
- [ ] Folder of 3 related CSVs → 3 registered tables, independently profiled; broker
      evaluates over the union (D13)
- [ ] Empty CSV (headers only) → graceful empty state
- [ ] Single-column CSV → multi-column modules disabled
- [ ] 100%-null column → null percentage displays correctly
- [ ] AI: typo normalization works; retry cap actually stops at 3

### Edge cases
- [ ] 150MB CSV → sampled preview + banner
- [ ] 400MB CSV → refusal modal with guidance (D16)
- [ ] .xlsx → unsupported-format modal
- [ ] Malformed CSV (mismatched column counts) → DuckDB error caught, shown user-friendly
- [ ] Rapid sidebar module switching → no races or stale state
- [ ] API URL failing CORS → Tier-2 relay fallback engages transparently
- [ ] Edge origin blackholed → core (ingest/profile/SQL/charts/insights) stays fully
      functional; each typed 503/429/AI-quota response renders its paused-state UI, never a
      hang (§4, §23.5) *(v0.5)*

### Privacy
See the hard invariants in [`privacy-model.md`](privacy-model.md) — all five are release gates.

### Security
See the hard invariants in [`security-model.md`](security-model.md) — headers verified on
the live URL, adversarial-CSV fixture inert everywhere, SSRF probes rejected (v0.5),
audit/secret-scan gates green. Enforced mechanically by the CI pipeline
([`infrastructure.md`](infrastructure.md)).

### Bundle size
See the bundle gate in [`performance-budgets.md`](performance-budgets.md).

## Usage metrics & iteration loop (§18 — opt-in, anonymous, hard-off in local-only)

| Metric | What it tells us |
| :--- | :--- |
| Time to first chart (ingest → first rendered chart) | The core "fast to value" number |
| Insight acceptance rate (opened-as-chart ÷ shown) | Whether the D10 feed surfaces things people care about |
| Export / share success rate | Catches silent failures where users extract value |
| NL→SQL self-correction rate (fixed within retry cap) | Health of the §11.1 loop — measured in-product here, and against a ground-truth set by the dev/CI D40 eval harness (§11.4) |

Process: 5–10 rapid user tests per release cycle; iterate on the top 3 observed pain points
before adding new surface area.

**Reading these as a shape (D60, §20.13 — deferred).** Assembling these counters into a
legible usage-shape view — funnel drops, ingest-path mix, whether users reach the ② moat — is
trigger-gated backlog work ([`../backlog/operational-insight.md`](../backlog/operational-insight.md)):
parked until v0.5 ships with the §18/D27 steering bars green, or an operator question arrives
that the raw counters can't answer by hand. It is a *reading* layer over the already-decided
signals and collects nothing new — the constraint that keeps it inside the privacy identity
(D41/D59).
