# AI Panel Warm Start (idea, not scoped — revisit later)

Brainstorm from 2026-07-27, parked here for later. Not part of any build list or kill criteria yet.

**Question:** what else can we do to prepare the LLM to answer questions about the dataset so its
context is warm by the time a user moves to the AI panel?

## What already covers part of this

* **D70** (`_implementation/DATASCOPE.md`) — a Cloudflare Worker fires an async dataset-synthesis
  narrative right after ingest, before the AI panel opens, caching per dataset fingerprint (D56) so
  it isn't recomputed per interaction.
* **`warmWebLLM()`** (`src/services/webllm.ts:92`) — background-downloads/warms the local WebLLM
  *model* itself (consent-gated per D70). This warms the model, not the dataset context.
* **`08-computed-facts-with-data.md`** (`_implementation/_misc/_ideation/ai architecture
  experimentation/`) — specifies computing a rich, citable `ComputedFact[]` table from the dataset
  (deciles, concentration, outliers, correlations, etc.) so the model narrates real statistics
  instead of inventing them. Currently **eval-only / prototype**, not wired into the app.

## The gap

08's fact computation has no scheduling story — it's specified as a compute step, not scheduled
against the app's lifecycle. Nothing currently runs it *before* the user reaches the AI panel the
way D70 and `warmWebLLM()` already do for synthesis and the model.

## Three levers, none built

1. **Precompute `ComputedFact[]` during the Blueprint/Verdict first-paint idle window (D55/D68c)**,
   not when the AI panel opens. The computation is local DuckDB and deterministic, so there's no
   correctness reason to defer it — only a scheduling one.
2. **Pre-render a small anticipated Q&A set** from the fact table (the questions it already answers —
   domain, scale, span, shape) and cache it per dataset fingerprint, the same pattern D56 uses for
   the synthesis narrative, so the panel's first paint is instant instead of a fresh model
   round-trip.
3. **If a prompt-caching-capable provider is in the mix** (BYOK/frontier), pre-warm its cache with
   the system prompt + fact table at the same moment synthesis fires, so the user's first real
   question hits a warm cache instead of a cold prefix.

## Tradeoff

Any dataset transform between ingest and panel-open invalidates the precomputed table, so this
needs the same fingerprint-based invalidation D56 already requires for the synthesis narrative —
not a new invalidation design, just another consumer of it.

## Status

Brainstorm only. Revisit if/when 08 itself is decided worth wiring into the app.
