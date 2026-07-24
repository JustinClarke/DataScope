# 06.2 AI Modes & BYOK Routing

**Tier:** v0.5 · Phase 4 · **Master spec:** §11.2 (D2, D3, D9), §5.1, §23.5

## Objective

Three user-selectable AI modes with a first-run chooser, plus BYOK routing and key custody.

## Modes (§5.1, D2 — all three ship)

**Renamed 2026-07-22 (human directive), folded in with this build's follow-up pass:** "Cloud
AI" → **"API"**; localhost Ollama moves out of "Local model" and into "API", reached through
the same key/endpoint field a cloud key uses — the field **auto-detects its own shape** (a URL
→ local Ollama endpoint, no bearer auth; anything else → an OpenAI-style bearer key). "Local
model" narrows to the in-browser WebLLM/WebGPU path only. Rationale: Ollama and a cloud key are
both "the user pointed inference at an endpoint they configured" — the same axis, not two.
Ollama reaches the browser **directly**, never through the edge Worker (the same shape BYOK
pass-through already has); `edge/byok.ts`'s server-side pass-through is unaffected.

| Mode | Inference | Network |
| :--- | :--- | :--- |
| Local-only (AI off) | none — global AI kill-switch | zero after page load |
| Local model | in-browser WebLLM/WebGPU only | zero external |
| API | Workers AI default; BYOK key or a local Ollama endpoint, auto-detected from one field | disclosed payloads only; an Ollama-shaped field defaults to zero external (prefer-endpoint) until routing is explicitly set, stays zero external under explicit "Prefer my key", and is zero external only after the client overflows to it under explicit "Use free tier first" (Workers AI serves first) |

- **First-run chooser (D2):** one-screen explanation of the three modes on first launch —
  no silent default. Mode switchable anytime in settings; the sidebar AI card reflects it
  ("AI is off — enable in settings"). The chooser describes **API** mode as a **shared,
  exhaustible free budget** (§11.2), not a personal allowance.
- **Local model mode — honesty guardrail (D43):** the honestly-specced path is now
  **in-browser WebLLM/WebGPU only** — the **D43 spike passed (GO, 2026-07-21; ADR-007)**, so
  in-browser weights are scoped (the v0.25 handoff), not a stretch goal. It ships **within the
  four ADR-007 constraints**: pin the **Qwen2.5-Coder-1.5B q4f16** coder (3B unverified on 8 GB),
  Worker engine, resumable download, and — since the 92 % quality number is a simple-schema floor
  with no measured cloud head-to-head — the **D40 eval still gates any "local" claim** (CV,
  marketing, or a "local" column in the harness), watching the aggregate-then-rank failure mode.
  Expect weaker SQL generation than cloud either way; the pipeline (lint + retry) is the
  equalizer. **Localhost Ollama** (user-deployed; SQL Workbench precedent) is still honestly
  specced and still ships — it now lives under **API** mode's key/endpoint field, not here.

## BYOK routing (D3)

User-facing toggle: **"Prefer my key"** (all inference via the user's provider) vs.
**"Use free tier first"** (Workers AI until its rate/neuron ceiling, then overflow to the
key). Ceiling detection and overflow live in the edge router
([../09-edge/01-ai-router.md](../09-edge/01-ai-router.md)). Confirmed unchanged in shape
(2026-07-22): the toggle now serves **API** mode rather than "Cloud AI" — same two choices.

**Routing governs an Ollama-shaped field too, defaulting to zero-egress (2026-07-23).** "Prefer
my key" → every turn straight to the local Ollama endpoint (unchanged). "Use free tier first",
**when explicitly chosen** → Workers AI serves first, and the browser falls back to the local
Ollama endpoint only on the router's typed shared-budget-spent / paused response. **Default
(routing never touched):** an Ollama-shaped field behaves as prefer-endpoint — the stored D3
default of `free-tier-first` does not silently send an Ollama user's payloads to the cloud;
explicitly picking "Use free tier first" is the opt-in. The overflow itself is
**client-orchestrated** (the edge Worker can't reach `localhost`); the router needs no Ollama
awareness — a URL-shaped field sends no `byok`, so its existing keyless quota/pool-exhausted/
paused response *is* the trigger. Non-quota-family failures (timeout/transport/upstream) never
fall back. The answer is marked as served by the local overflow, so the swap is disclosed.

**Shared-pool reality (§11.2).** Workers AI's free allocation is a **single account-wide
daily budget shared by every visitor**, not a per-user allowance — so this toggle's copy (and
the first-run chooser above) describe **API** mode's cloud share as a **shared** free budget.
When the router returns its typed quota- or pool-exhausted code, the client renders a specific
state — *"free AI budget used for today: bring your own key, switch to the local model, or
retry tomorrow"* — never a silent failure.

## Key custody (D9 — user-choice)

- **Default:** a bearer key lives in **browser memory only**; sent per-request through the
  Worker as a **stateless pass-through** (attached and forwarded, never persisted server-side —
  works regardless of provider CORS support). A local Ollama endpoint is reached **directly by
  the browser**, never through the Worker — it is a base URL, not a secret.
- **Opt-in "Remember my key":** a bearer key is stored in the server-side credential vault
  ([../09-edge/03-vault.md](../09-edge/03-vault.md)) with explicit disclosure and a delete
  control; the browser then holds only a reference, never the raw key in plaintext. An Ollama
  endpoint is never vaulted — it isn't a secret, and it's meaningless off the user's own machine.
  **Built 2026-07-23:** the browser persists the reference plus the durable vault session it is
  scoped to (`src/stores/vault.ts`) — both halves are needed to resolve, and the durable id
  exists only for users who opted in. An in-memory key wins over a remembered one when both are
  present (it is what the user just typed), and a remembered key opts out of the warm-WebLLM
  rung exactly as a typed key does — it is the same standing choice of provider.
- **Field-shape detection (2026-07-22):** the one field branches on its own contents — a value
  that parses as a URL is a local Ollama endpoint; anything else is a bearer key. Neither branch
  is ever logged or persisted in plaintext.

## Files

`src/features/ai/AIModeChooser.tsx` (first-run chooser), `src/features/ai/AISettingsPanel.tsx`
(mode radio, BYOK routing toggle, the auto-detecting key/endpoint field + custody disclosure),
surfaced from the header in `src/app/App.tsx`. Mode/preference persist through the settings
store (`src/stores/settings.ts`, `setAIMode`/`setByokPreference` — the chat and synthesis
surfaces read the D3 toggle from here, not the `aiSession` stub's field); the **raw field value
lives in a non-persisted memory store** (`src/stores/byokKey.ts`) — D9 default custody, never
localStorage, whichever shape it turns out to be.

**Field-shape detection (2026-07-22 fold-in) lives in `src/services/ollamaProvider.ts`**
(`isOllamaEndpoint` — a value that parses as a URL is a local Ollama base endpoint; anything
else is a bearer key), used by `resolveProvider` below. `ollamaProvider.ts` (localhost Ollama,
real, no backend of ours — driving the pinned small coder with the same deterministic
SQL-mode/answer-mode control flow + plain-text SQL extraction as the WebLLM provider, since the
coder never emits Ollama's structured tool_calls; a tool-tuned model's structured call is still
honored) is now **API** mode's local-endpoint provider, not "Local model"'s.

Resolved in `src/services/aiProvider.ts` (`resolveProvider`, now returning
`{ provider, overflowProvider? }` — the amended ladder: **local model** is warm WebLLM or
nothing, no Ollama fallback; **API** mode resolves warm WebLLM first when the field is empty,
then — if the field is set — branches on `isOllamaEndpoint`. A URL routes directly to
`createOllamaProvider({ baseUrl })` (no `overflowProvider`) whenever routing is "Prefer my key"
**or has never been explicitly set** (the zero-egress default); a URL under an **explicitly
chosen** "Use free tier first" makes the edge router the **primary** and returns the Ollama
provider as `overflowProvider`; anything else routes through the edge router via
`src/services/cloudProvider.ts` as the per-request `byok` pass-through). The overflow is
executed in `src/services/ai.ts`: on the typed `ProviderQuotaExhaustedError` family (shared
budget spent / pool-exhausted / paused), the loop swaps the active provider to
`overflowProvider` for the remainder of the turn and marks the answer `servedByOllamaOverflow`;
a non-quota-family failure never swaps. `src/features/ai/AIChatModule.tsx`'s status line mirrors
this ladder exactly (Ollama under prefer-key or the untouched default reported as zero-egress
`local`; Ollama under an explicit free-tier-first reported as `cloud` — "shared free tier, your
local Ollama on overflow" — never as silent zero-egress), and `AITurnView.tsx` renders the
overflow marker inline.

Synthesis is unaffected by this fold-in — it has no Ollama rung and keeps routing on
`aiMode === 'cloud'` exactly as before: `src/services/synthesis.ts` sends `routing` + `byok` in
cloud mode (a key also opts out of the warm local rung, mirroring the chat ladder), served
edge-side by the router-shared `createRoutingSynthesisProvider`. The shared-budget-exhausted
client state is a typed `ProviderQuotaExhaustedError` (in `aiProvider.ts`) the pipeline
recognizes (`src/services/ai.ts`).

> The "Remember my key" vault is the vault's (build/09-edge/03), **built 2026-07-23**: the
> checkbox is live, backed by `src/stores/vault.ts` (the persisted reference + durable vault
> session) and `src/services/vaultClient.ts`. The panel keeps its honest copy when the vault is
> unreachable or unconfigured — it says the key stays in this tab rather than implying a
> remembered one. The settings note above supersedes the old `services/ai.ts` `setAIMode()` line
> (mode moved to the settings store per the pipeline build).

## Dependencies

[01-pipeline.md](01-pipeline.md) stage 3, edge router + vault
([../09-edge/](../09-edge/)), settings store.

## Acceptance criteria

- [x] First launch shows the chooser; no inference occurs before a mode is chosen — *chooser
      driven live in the 2026-07-22 browser E2E (Cloud AI, since renamed **API**, picked at the
      first-run screen); no-selection gating (aiMode null → no provider, deterministic
      Blueprint) unit-tested*
- [x] Local-only: zero network requests after page load (Network tab, §18) — *live browser E2E
      2026-07-22: local-only session, zero requests to any `workers.dev` host at the network layer*
- [x] **Re-pointed 2026-07-22 (mode-taxonomy fold-in), closed 2026-07-24 with a fresh live run:**
      localhost Ollama now reaches the browser through **API** mode's key/endpoint field
      (auto-detected as a URL), not through "Local model." *Live browser pass (real Chrome via
      Playwright, real dev server, real Ollama 0.32.1 daemon, pinned `qwen2.5-coder:1.5b`,
      bundled Titanic sample): the first-run chooser's "API" option selected, `AISettingsPanel`'s
      routing set to "Prefer my key," `http://localhost:11434` typed into the key/endpoint field
      — the panel's own copy confirmed detection ("Detected as a local Ollama endpoint —
      requests go directly from your browser to that address, never through our servers. Zero
      egress, same as the in-browser model."). Asking "How many passengers survived?" on AI
      Chat fired exactly two requests, both `POST http://localhost:11434/api/chat` (SQL-mode
      then answer-mode, the documented two-call shape) and zero requests to any other host.
      The suggested SQL (`SELECT COUNT(PassengerId) FROM titanic WHERE Survived = 1`) executed
      for real (✓ 1 rows · 10 ms) and returned the correct count (355, matching the 2026-07-22
      run) — confirming the routing/execution path is sound.* **One real, separate finding from
      this run, worth naming but not a plumbing defect:** the model's own prose answer read "192
      passengers survived," disagreeing with the correct row directly beneath it
      (`count(PassengerId): 355`) — the 1.5B pinned coder hallucinating in answer-mode text
      despite being handed the correct tool result. SQL generation, execution, and row delivery
      to the model were all correct; only the model's own final-answer composition was wrong.
      Not a regression this leaf doc's criteria cover (they test the routing/egress contract, not
      small-model answer fidelity) — flagged here as a known sharp edge of the pinned local
      model, consistent with "Local model"'s own disclosed "SQL generation is weaker than cloud"
      caveat. `isOllamaEndpoint` shape-detection and the amended `resolveProvider` ladder remain
      unit-tested alongside this live evidence. "Local model" itself narrows to in-browser WebLLM
      only — that path's own criteria are unaffected and stay under `v0.25/03-webllm-handoff.md`.
- [x] Prefer-my-key routes 100% to the user's provider; free-tier-first overflows at ceiling —
      *live against staging 2026-07-22 with a canary key: prefer-key demonstrably reached
      api.openai.com (upstream 401 → typed `upstream-error` 502, never Workers AI); at a
      temporary quota=0, free-tier-first + key overflowed to the key (same typed 502 via the
      user's provider) and keyless returned typed `quota-exhausted` 429. The 200-served-by-byok
      payload path is unit-tested, not live-run (no real key supplied — canary-only by decision)*
- [x] Default custody: key absent from `localStorage`/`IndexedDB`/cookies; survives only in
      memory — *non-persisted store by construction; §22 storage-scan test asserts a set key
      appears in no localStorage entry; server side, the live custody audit (2026-07-22) found
      the key in no logs/counters/responses*
- [x] "Remember my key": vault round-trip works; delete control wipes it; browser stores
      reference only — *built 2026-07-23 ([../09-edge/03-vault.md](../09-edge/03-vault.md)). The
      checkbox stores the key and keeps only the returned reference plus its durable vault
      session; unchecking deletes it, and a failed delete deliberately leaves the box checked
      rather than stranding a real stored key with no way left to address it. §22 storage row
      asserted: after remembering, no localStorage entry contains the key, while the reference
      does. Verified against unit tests and a live local `wrangler dev` (real KV); the staging
      deploy that closes the vault leaf's own DoD is still outstanding*
- [x] Shared budget exhausted (typed quota/pool-exhausted code) or the router's kill-switch
      flag flipped (typed 503, §23.5) → the client renders the shared-budget-exhausted /
      "cloud features paused" state, never a hang; local-only and local-model modes stay fully
      functional (§4) — *typed codes live-verified server-side (429 quota-exhausted today; 503
      paused previously, with the paused chip live in the browser E2E); the chat's
      `ProviderQuotaExhaustedError` mapping is unit-tested — the one inference here is the chat
      UI's live render of that specific state, not the mechanism*

## Test plan

Mode-switch matrix E2E with Network-tab assertions per mode. Custody tests per the §22
privacy checklist (storage scan for plaintext key). Routing tests with a mocked ceiling.

> The matrix ran live 2026-07-22 (one scripted browser session, per-phase network
> classification): local-model served by a real Ollama daemon with zero external requests,
> local-only rendered the refusal with zero requests, cloud answered via the live staging
> router with requests to no other host. The network assertions also caught a real leak —
> the synthesis ladder's edge rung fired in local-model mode (whose §5.1 contract is zero
> external); `services/synthesis.ts` now gates the edge rung to cloud mode.

## Definition of done

All three modes demonstrably functional; §22 privacy rows for BYOK pass; disclosure copy
matches [`../../foundations/privacy-model.md`](../../foundations/privacy-model.md).
