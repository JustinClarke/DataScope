# A4 — The tool loop

**Tier:** v0.71 · **Depends on:** A0 · **Spec:** master §11.1, §11.5, §19 v0.71, D74 ·
**Blocks:** A5 · **Status:** built 2026-08-02 (`src/services/ai.ts`, `src/services/toolLadder.ts`)

**Four defects in shipped code, verified 2026-08-02.** Each independently caps the app's AI at
*"one query, twenty rows, no follow-up."* Three of the four are **prerequisites to A5 and none of
them are MCP work** — which is why this is its own phase rather than half of the MCP item, as the
experiment record originally scoped it.

## The four

### (i) Twenty rows

[`src/services/ai.ts:285`](../../../src/services/ai.ts) — `const preview = result.rows.slice(0, 20)`.
The model sees 20 rows regardless of result size. `rowCount` rides alongside, so the truncation is at
least **honest** rather than silent — but any answer living past row 20 is unreachable, and there is
no paging operation for the model to ask with. **A1's result handles are the fix**; this defect is
that gap seen from the model's end.

### (ii) Tools withdrawn after the first row result

[`src/services/ollamaProvider.ts:99-111`](../../../src/services/ollamaProvider.ts) —
`answerMode = sqlTool === undefined || lastToolResultIsRows(messages)`, after which the request omits
`tools` entirely and appends `ANSWER_INSTRUCTION`. The turn can then only end as text. **One query
per question, hard.**

**Two things make this bigger than it reads, and both were missed in the experiment record:**

1. **It is deliberate.** The file header documents it as a workaround for the pinned
   `qwen2.5-coder:1.5b`, which never emits structured `tool_calls` — it writes the call as prose, a
   JSON blob, or fenced SQL. Control flow was made rigid **because the model could not be trusted to
   drive it.** So this needs a **replacement determinism strategy, not a deletion.** Removing
   `answerMode` without one regresses the 1.5b path to garbage.
2. **It is not one file.** `lastToolResultIsRows`, `ANSWER_INSTRUCTION`, `SQL_INSTRUCTION` and
   `extractSql` are all imported *from* `webllmProvider`. **The same cap therefore governs the
   WebLLM in-browser path** — the privacy-forward default v0.25 shipped. The record names only
   `ollamaProvider`.

**Replacement strategy, stated as the requirement rather than the design:** the loop must allow a
second call *without* assuming the model can request one. The likely shape is a **capability probe**
— models that demonstrably emit structured `tool_calls` drive themselves; models that don't keep a
deterministic ladder, but one with more than two rungs. Whatever lands, the small-model path must
still terminate deterministically, and **the 1.5b path must not regress** (measured, see DoD).

### (iii) A single tool call where providers emit arrays

[`src/types/ai.ts:92-94`](../../../src/types/ai.ts) — `ProviderTurn` carries `call:
ProviderToolCall`, singular, and `ProviderMessage`'s assistant variant carries `toolCall?`, singular.
Ollama's wire shape is `tool_calls?: OllamaToolCall[]`, and
[`ollamaProvider.ts:120`](../../../src/services/ollamaProvider.ts) does
`data.message?.tool_calls?.[0]` — **every call after the first is silently discarded.** No error, no
log, no attempt record. A model that correctly emits three parallel calls has two vanish, then sees
results that do not match what it asked for.

**This is the expensive one.** It is a type-level constraint, so the fix touches the provider
interface, every provider, the loop, the message builder, and the transcript renderer. The A5 loop
contract — *a response may contain any number of tool calls; the assistant message carrying them is
appended verbatim before execution; calls run in emitted order; each gets its own correlated tool
message* — is **unimplementable until this changes.**

### (iv) Cancellation dropped, guarded path bypassed

[`src/features/ai/AIChatModule.tsx:145`](../../../src/features/ai/AIChatModule.tsx) —
`runSql: (sql) => runChartQuery(sql)`. `askAI` calls `runSql(sql, signal)`; the lambda discards the
second argument.

**Worse than "a caller forgot to forward it":** `runChartQuery(sql: string)` **accepts no signal at
all**, so there is nowhere to forward it to. The fix is not a one-line lambda change — either
`runChartQuery` grows cancellation or the chat calls something else.

**The something else exists.** [`src/services/runPath.ts`](../../../src/services/runPath.ts) is the
v0.70 S4 guarded path every surface is supposed to call. The chat does not, so the AI path also skips
the mutation guard's materialize-onto-a-clone behaviour — masked today because the only tool is a
`SELECT`, and **unmasked the moment A3 ships.**

**Observable consequence today:** `AIChatModule`'s abort wiring cancels the *provider* call, not the
*query*. Ask a new question while a slow query runs and the old query runs to completion in the
worker while the UI reports it cancelled.

## (v) Not a defect — a ceiling to re-derive deliberately

[`ai.ts:45`](../../../src/services/ai.ts) `MAX_PROVIDER_CALLS = 8`;
[`ai.ts:42`](../../../src/services/ai.ts) `MAX_SQL_ATTEMPTS = 3`, counting **failures only**. The
analyst loop wants far more headroom. These numbers are correct for the current one-shot pipeline and
**wrong for A5**, so A4 re-derives them — but the 3-failure cap is a **THOR-style termination
guarantee** that an analyst loop still needs in some form. **Do not let it be deleted as an artifact
of the old design.**

## What shipped

**The turn shape is now `{ text, calls[] }`** — a flat record, not a `kind: 'text' | 'tool_call'`
union. The union is what invited the singular field; the record makes "prose alongside calls" the
ordinary case and `calls.length === 0` the *only* terminal condition, so no provider can end a turn
by withholding tools.

**The `[0]` drop had four sites, not one.** The record named `ollamaProvider.ts:120`. Also guilty:
`edge/ai/byok.ts` (OpenAI pass-through), `edge/adapters.ts`'s Workers-AI mapping, and — the one no
type error would have found — `edge/adapters.ts`'s **streamed reassembler**, which explicitly did
`if ((tc.index ?? 0) !== 0) continue`, discarding every parallel call after the first as it arrived.
The eval Gemini provider's `parts.find(p => p.functionCall)` was a fifth.

**The determinism replacement is `src/services/toolLadder.ts`** — one module, since the finding that
made this bigger than it read was that the helpers are *shared* by both local paths. A
`CapabilityProbe` latches the first structured `tool_calls` a model emits and then leaves it alone;
until then a three-rung ladder (`sql` → `continue-or-answer` → `answer`) runs, where the middle rung
is the one the old two-rung version had no room for. Rung state is derived from the conversation,
not a per-instance counter, so it is correct however the provider is reused.

**Cancellation and the guard came free with the core.** Defects (i) and (iv) collapse into one fix:
`askAI` takes an `AnalystCore` rather than a `runSql` callback, because result handles, engine-level
cancellation and the guarded derive path all live behind that door and a callback can express none
of them. `runChartQuery` is untouched — the chat simply no longer calls it.

## Ceilings, re-derived — and the termination guarantee, named

| | Before | After | Why |
| :--- | ---: | ---: | :--- |
| Provider round-trips | 8 | **24** | An analyst turn orients, looks, computes and pages before answering. |
| Total operations/turn | — | **48** | New: bounds cost when a model emits many calls per round-trip. |
| Failure cap | 3 cumulative | **3 consecutive** | A long turn legitimately accumulates failures it *recovers from*; the cumulative form killed it on the third across twenty good calls. Three in a row is what "not recovering" means. |

**The guarantee, stated so it cannot be deleted as an artifact:** every round-trip either ends the
turn (no tool calls) or increments the round-trip count, which is bounded by `MAX_PROVIDER_CALLS`
and never decreases. **The turn therefore terminates regardless of what the model does.** The other
two ceilings bound *cost*, not termination — that distinction is the whole point of naming it.

## Measured

`npm run eval`, the §11.4 labeled 58-question set, before → after:

| Arm | exec-rate | correctness | est. tokens/turn |
| :--- | :--- | :--- | :--- |
| `local-template` | 67.2% → **67.2%** | 19.0% → **19.0%** | 351 → 439 |
| `mock-cloud` | 100% → **100%** | 100% → **100%** | 413 → 541 |
| `cloud-edge` | 98.3% → **96.6%** | 82.8% → **53.4%** | — |
| `webllm` | 93.1% (not re-run) | 72.4% (not re-run) | — |

**The `cloud-edge` zero was deploy skew, not a defect — the guard working as designed.** The
staging Worker was still serving the pre-A4 `{ kind: 'text' }` shape (probed live). Rather than
read a missing `calls` as "a turn with no tool calls" — a silent no-op answer, exactly the failure
class this phase exists to remove — `cloudProvider` named it: *"cloud router returned a pre-A4 turn
shape — redeploy the edge Worker."* **Redeployed 2026-08-03** (`npm run edge:deploy:staging`) and
the arm re-run: exec-rate recovered to 96.6% (vs. 98.3% pre-A4), confirming cloud mode is live
again. Correctness dropped to 53.4% from 82.8% pre-A4 — real, not deploy skew (the arm now executes
and scores against actually-returned rows) — not diagnosed further in this pass.

**The ~25% token increase is the envelope, not the preview.** Setting the loop's preview default to
50 rows moved it by 1 token, so the cost is the richer `OpResult` (`resultId`, declared schema,
`complete`, `nextOffset`, the echoed `sql`) — bought deliberately, since keeping the core's envelope
intact across the seam is what makes A5's "structured `OpError` survives the protocol boundary" true
rather than aspirational. The preview default is still deliberately below the catalog's own 100: a
tool result is *prompt* text under the router's 64 KB body cap, and paging means preview size is no
longer a correctness cliff.

**Still not measured: the `qwen2.5-coder:1.5b` arm itself.** The harness carries it —
`OLLAMA_BASE_URL=<daemon> npm run eval` runs the product's own `createOllamaProvider`, so it
measures what ships rather than a harness approximation — and a daemon is now reachable over
Tailscale (2026-08-03), but that box has `qwen3:8b` pulled, not the pinned `qwen2.5-coder:1.5b`.
Substituting `qwen3:8b` as a stand-in scored 46.6% exec-rate / 43.1% correctness — under both
§11.4 thresholds and below the D43-verified WebLLM `1.5b` baseline (93.1%/72.4%, table above) —
informational only, since it is a different model than the one this gate exists to measure. A real
`1.5b` result still needs either that tag pulled on a reachable daemon or a WebLLM headed-Chrome
run with WebGPU. **The ladder's before/after gate is therefore still open**; see the DoD below.

## Definition of done

- [x] `ProviderTurn` and `ProviderMessage` carry **arrays** of tool calls; every provider updated;
      no provider silently drops a call. A discarded call is impossible by type, not by discipline.
      (Five sites fixed, four of them beyond the one the record named.)
- [x] Calls execute **in emitted order**, each producing its own correlated tool message; the
      assistant message carrying them is appended **verbatim before** execution.
- [x] **Tools stay available after every call**, successful or not. A row result never switches the
      model into forced-answer mode.
- [x] The small-model determinism replacement lands (`toolLadder.ts` — probe plus three-rung ladder).
- [ ] **The `qwen2.5-coder:1.5b` path is measured before and after** against the eval harness
      (§11.4 thresholds) — no regression in exec-rate or correctness. **Still open (2026-08-03):** a
      Tailscale daemon is now reachable, closing the original "no daemon" blocker, but it has
      `qwen3:8b` pulled, not the pinned `1.5b` — a substituted run scored 46.6%/43.1%, informational
      only. WebLLM still needs a headed-Chrome run. This is the gate on (ii) and is not claimed as met.
- [ ] The WebLLM path is verified alongside Ollama, since the helpers are shared. **Unit-verified
      only** (`webllmProvider.test.ts` covers the shared ladder, including the second query the old
      cap made impossible); the *measured* run is blocked with the row above.
- [x] Full results reach the model through **A1 paging**, not a 20-row slice.
- [x] Cancellation reaches the engine: the chat moved onto the core, whose one cancellation path
      reaches `cancelSent()`/`interrupt()`. Asserted at the call site (`AIChatModule.test.tsx`) and
      in the loop (`ai.test.ts`).
- [x] The AI path calls the **shared guarded run path** — asserted by test
      (`analyst.test.ts`: a mutation in the model's SQL is refused with `not_read_only` and reaches
      the engine as nothing at all).
- [x] Turn and call ceilings re-derived for an analyst loop, with a **termination guarantee retained
      and named** in this doc (above).
- [x] Errors return **structured** and the model recovers on an ordinary turn — no repair prompt, no
      host-authored suggestion. Prose alongside tool calls is preserved and execution continues; only
      a non-empty response with **no** tool calls is terminal.

## Carried into A5

- **Redeploy the edge Worker** — the wire contract changed and staging is stale (above).
- §11.3's data-sampled repair rides *beside* the `OpError` as a `sampleRows` field rather than
  inside it, so the catalog's contract stays the catalog's. If A5 serves errors over MCP verbatim,
  that field is the chat's, not the protocol's — decide deliberately rather than letting it leak.
