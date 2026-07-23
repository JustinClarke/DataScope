# 06 — AI Chat (NL→SQL)

**Tier:** v0.5 · **Phase:** 4 (§19) · **Depends on:** the full v0 stack — especially the
classifier ([`../03-profiling/`](../03-profiling/), schema-pruned prompts) and the chart
translator ([`../04-sql/04-chart-translator.md`](../04-sql/04-chart-translator.md), stage 6).
Cloud routing depends on [`../09-edge/01-ai-router.md`](../09-edge/01-ai-router.md).

The fact-checked, de-branded version of the original "master prompt blueprint" — what was
kept/renamed/rejected is in DATASCOPE.md Appendix A. The shape mirrors LangChain's reference
SQL agent: fuzzy pre-match → schema-pruned prompt → generate → lint → execute →
retry-on-error → auto-chart.

| Doc | Covers |
| :--- | :--- |
| [01-pipeline.md](01-pipeline.md) | §11.1 — stages 1–6 as a tool-use loop, transcript auditability; the D40 eval harness (§11.4) |
| [02-modes-byok.md](02-modes-byok.md) | §11.2 — three AI modes, BYOK routing + custody (D2/D3/D9), local-model guardrail (D43) |
| [03-privacy-disclosure.md](03-privacy-disclosure.md) | §11.3 — metadata-only repair, disclosure UI |

**AI-facing surface beyond the chat (D38).** The client-side AI surface is DSPS + "Copy for
AI" ([`../08-persistence/03-dsps-spec.md`](../08-persistence/03-dsps-spec.md)); a remote
**MCP** surface is added on the Worker. Stage A (v0.5) serves DSPS read-only over explicitly
shared artifacts (`get_dsps`, `list_shared`; D5/§12.3); stage B (v1+, gated on the D39 design
round) exposes tools (`run_sql`, `profile_dataset`, `infer_relationships`, `generate_dsps`,
`export_schema`) over **explicitly staged datasets only** (D39), never browser-local data.
The endpoint inherits the §23.5 ceilings/kill-switch/counters
([`../09-edge/01-ai-router.md`](../09-edge/01-ai-router.md)); the D32 no-RAG boundary is
unchanged.

**AI view-composer (D56, v0.5+ — bounded, optional).** A second AI surface beside the chat:
an optional producer that emits a **ViewSpec** (§9/§13.1, D55) — scoped to the Dataset
Dossier (D48) + consumer templates (D30), composing **only within the broker's grammar**
(legal panel types, typechecked §11.1-stage-6 chart configs), **cached per dataset
fingerprint** (D45 hash), **async and never on the first-paint path**, degrading to the
deterministic ViewSpec when AI is off/down/uncached. **Eval-gated like D40, on the feature,
never the release** — the composed view must beat the deterministic one on a labeled set
before it ships. The renderer never executes model output. Not a general "AI redraws every
module" (rejected — [`../../product/rejected-ideas.md`](../../product/rejected-ideas.md)).

**The two D68 producer seams (frozen — [`../../architecture/adr/010-ai-producer-seams.md`](../../architecture/adr/010-ai-producer-seams.md)).** Beside the ViewSpec composer, D68f charters exactly two seams where an AI producer may substitute for the deterministic one: **action ranking** (§9 — re-rank/re-phrase the `RankedAction[]` baseline) and **findings narration** (§12.2/§13.1, D65 — re-phrase a `FactRef`'s `statement` prose only). ADR-010 freezes their shape ([`app/src/types/producers.ts`](../../../app/src/types/producers.ts)): the AI is a **replace-in-place producer over the deterministic baseline** (it receives the computed slice, never the raw registry, so it cannot invent a route or a claim), cached per D45 fingerprint, async after paint, with a seam validator that degrades to deterministic on any invariant violation. Phase 6 adds one producer + validator per seam and touches no UI or contract. Routing/provider/model/cost stay in ADR-007.

**Process rule (§19 Phase 4, A.5): build and verify one pipeline stage at a time.** Do not
paste a mega-prompt and trust the output — the likely failure is a dialect guard that looks
right in a demo and breaks silently on the first real query.

**Prosumer-flow note (D33, §19 Phase 4):** the consumer NL→SQL flow is this architecture
exactly (§11.1/D2/D9 — schema + question to the LLM, never rows; SQL runs locally; BYOK
stays in-browser). Templates (D30) make the LLM *unnecessary* for common questions (D10's
deterministic feed, extended per-platform); DSPS (D31) makes it *surgical* for the tail.
The LLM is a scalpel, not a chainsaw — consumer-facing polish of this phase, nothing more.

**Exit criteria (= Phase-4 deliverable):** plain-English question → SQL → chart, with a
visibly self-correcting failure case; mode switching verified against the DevTools Network tab.
