# 11 — The Gemini instrument arm

**Status (2026-07-29, after session 7):** Phases 1–4 built and run, and the Ollama comparable arm
with them. **Gemini panel arm complete — 265/265 compliant** (the earlier 249/265 billing block was
backfilled and merged in session 3), ≈$7.16 real spend against the ~$8 recomputed estimate. **Gemini
chat arm complete — 408/408.** **Ollama `qwen2.5-coder:7b` schema-constrained re-run complete — 250/250
processed, 250 compliant (100%), zero parse failures, zero crashes.** Cross-arm confound resolved:
both arms were evaluated under structured output constraints (`responseSchema` for Gemini, `format` for Ollama).
Real findings exist now, tagged CEILING/RIG/DIRECTION/CAPABILITY — see the handoff sections at the bottom.

**Update (2026-07-30, session 9):** the actual deliverable is done — both arms are folded into
[10's Verdict table](./10-grounding-ladder.md#verdict): the 7B as the shipping-tier evidence driving
each row's decision, Gemini as a separate labelled CAPABILITY/CEILING/RIG instrument block that
decides nothing. See that section for the table itself and its own caveats (per-slot C2 doesn't
exist yet, R-C/R-A/R-B unrun, the 7B-vs-14b tier substitution never formally re-ratified).

**Update (2026-07-30, session 10):** **R-A and R-B run.** R-A: zero C3 fabrication at rows=0 across
every runnable fixture (titanic/product_reviews/stock_prices/weather). R-B: **OPAQUE does not blind
the model on titanic** — 10/10 re-identified from schema statistics alone (row count + column
shape), at rows=0, all `high` confidence — the doc's own pre-registered kill line, tripped. See the
session-10 handoff at the bottom for the full result and what it means for the crossed cell.

**Update (2026-07-30, session 11 — retroactive record):** the per-slot C2 re-score (named as the
cheapest open item since session 8) is done and was already folded into 10's Verdict table — see
the session-11 handoff at the bottom for why this entry is retroactive and what this session
actually verified versus what an untracked prior pass had already done.

Still open: **R-C through R-H** (none authorized, none run); the **Cloudflare Workers AI** and
**WebLLM** arms.

## Context

[10-grounding-ladder.md](./10-grounding-ladder.md) measures whether an LLM genuinely reads the
data rows it's given versus recalling training-set knowledge, using a harness already built and
run against a local Ollama rig (`qwen2.5-coder:14b`). That rig is thermally unreliable (crashed
mid-run twice per 10's own log) and capped at a 32k context window, so `stock_prices` (~37k
tokens) can't run the full cross — it's scoped as a ceiling control instead.

The user has a Gemini API key. The obvious framing — "a cheaper, more reliable second arm" — is
the least valuable thing this key can buy. The three framings below are worth more, and the plan
is organised around them.

---

## What this arm is for

### Job 1 — exercise a scoring path that has never run

`RESULTS.json` is 1,267 bytes: three attempts, **zero scored panels** (10's own build-status
line). Verified alongside that: `eval/claude/10-grounding-ladder/` contains **no test files at all** —
`scorePanel.ts`, `panelSchema.ts`, `corrupt.ts`, `opaque.ts` and `assemble.ts` are all
unexercised on the happy path. No compliant panel has ever reached the scorer, from any model.

So the harness's central claim — "the diff *is* the result" — rests on code that has never
produced a diff. Debugging that on a rig that crashes twice per run, at ~30s/call, is the worst
available use of scarce local time. **Gemini's first job is to produce the first compliant panel
this harness has ever seen**, and to keep producing them fast enough that scorer bugs surface in
minutes rather than across a four-hour unattended pass.

Every bug found this way is a bug for every arm. This is the one job where transfer is total.

### Job 2 — falsify the folder's own load-bearing premise

The README states the claim that every doc here rests on:

> F1, F2 and F3 reproduced across three different models and three different serving paths…
> This is a **property of the contract, not of any provider** — which is precisely why a better
> prompt is not on the table here, and why a fix in the validation/composition architecture
> should port across providers unchanged.

Three models, all mid-tier, two of them served through the same edge path. That is thin evidence
for a universal claim, and **the claim is load-bearing for 01–10 inclusive**. Gemini is the
sharpest available test of it: a frontier-class model, a fourth serving path, native function
calling, and 1M tokens of context.

Note what this does to the transfer asymmetry. Normally a big model succeeding tells you nothing
about a small one. But the hypothesis under test here is *"this failure is provider-independent"* —
and for that hypothesis, **Gemini not reproducing F1/F2/F3 is the informative outcome**. It would
falsify the premise and re-scope every doc in the folder. Gemini reproducing them corroborates the
premise on a genuinely distant fourth point.

Either way it is a result, and it costs under $2.

### Job 3 — answer the ceiling questions, which are answerable nowhere else

Some questions in 10 are not about model capability at all. They are about whether the
*instrument* works. Those have the form "can this be done at all?", and a frontier model answers
them for every tier at once:

- **Does `OPAQUE` actually blind the model?** The crossed cell — the doc's "sharpest single
  measurement in this folder" — works only if anonymised schema genuinely removes the recall
  hatch. Nobody has checked. If a model can re-identify titanic from opaque column statistics,
  the hatch is open and the crossed cell measures something other than what it claims.
- **Is each fixture contaminated, and how badly?** titanic is in every training corpus. The
  rows=0 rung is *supposed* to measure recall — but nobody has measured how much recall is
  available to be had, per fixture, which is the denominator the whole ladder is read against.
- **Is the crossed cell interpretable at all?** Kill criterion (c) can fail as "model said
  something unrelated on all 5 repeats." Finding that out after a four-hour local pass is
  expensive; finding it out in ninety seconds is not.
- **Is the task solvable from what's actually in the prompt?** If the best available model can't
  fill a slot from the assembled context, the slot's fact partition is starved and the 7B's
  failure there measures the assembler, not the model.

On all four, a frontier model's failure is dispositive downward: **if Gemini can't, nobody can.**

### What this arm is not

The README's rejected list includes **"Bigger model / more context — tried to the model's actual
ceiling. F3 came from the *most* context, and a 14B produced the cleanest fabrication (F2)."**

That rejection stands and this doc does not reopen it. Gemini is not a candidate architecture, not
a proposed provider, and not a route to better panel prose. **It is an instrument** — used to
validate the harness, test the folder's premise, and price the ceiling questions. No result here
may be cited as "the fabrication problem is solved by a bigger model." If someone tries, the
rejected-ideas row is the answer.

---

## Decisions already made with the user (2026-07-28)

- **Eval-only scope.** No product code changes — no new `AIProvider` users can pick, no BYOK/D9
  key-custody involvement. Everything lives under `eval/claude/10-grounding-ladder/` and reads
  `GEMINI_API_KEY` from the **shell environment**, the way every other eval var already works
  (`OLLAMA_BASE_URL`, `EVAL_DATASET`, …). **There is no `dotenv` in this repo and none is to be
  added** — `.env.local` is Vite's, loaded by the app, not by `tsx`. Export the key in the shell
  or inline it on the command, and fail loudly at startup if it's unset.
- **Model: Gemini 2.5 Flash.** Cheapest capable tier, closest in general class to the already-tested
  local 14B, overridable so the Pro-vs-Flash question stays open without new code.
- **Row-cap handling: both.** Run the existing rungs (0/10/100/max-that-fits, same token budget as
  the Ollama run) for a direct comparison — *and* add a clearly separate uncapped condition, since
  that's a genuinely new cell the local rig can't produce.

**Amendment, 2026-07-29 (Phase 3, forced by the live key):** `gemini-2.5-flash` — and the whole 2.5
generation, `-lite` and `-image` included — returns 404 "no longer available to new users" on this
project's actual key (confirmed by direct curl to each, independent of any harness code). The
working model, per the user's real-time call when asked, is **`gemini-flash-latest`**, which
currently resolves to **`gemini-3.6-flash`** — a materially newer generation than "cheapest capable
tier, closest in class to the 14B" was reasoned about. Two downstream consequences, not just a
config swap:
- **Pricing is different, not just updated:** $1.50/M input, $7.50/M output (vs. 2.5 Flash's
  $0.30/$2.50) — 5× input, 3× output. The "Cost model" section below still shows the old figures;
  treat every number there as stale until recomputed against these before authorising Phase 4 or
  any rider.
- **Thinking cannot be fully disabled on this generation.** Gemini 3 Flash/Flash-Lite use
  `thinkingLevel` (`minimal`/`low`/`high`), not 2.5's numeric `thinkingBudget`, and per Google's own
  docs `minimal` is the floor — there is no off. This is the doc's own pre-registered condition
  under "What would make this arm not worth running": *"If thinking can't be disabled... only the
  CEILING and RIG jobs survive."* Empirically, the one real panel call run at `thinkingLevel:
  minimal` reported `thoughtsTokenCount: 0` (see Phase 3's report below) — encouraging, but N=1;
  F4/R2 says a single run certifies nothing. Treat the comparable cross as **provisional** on this
  point until Phase 4 sees thinking stay at 0 across more calls, and say so in 10's verdict table
  rather than reporting it as a clean zero-thinking arm by construction.
- **Also fixed at the same time, not a decision but a hard fact:** this key's format
  (`AQ.<...>`, 56 chars) 401s against the documented `?key=` query-param auth
  (`ACCESS_TOKEN_TYPE_UNSUPPORTED`) and only works via the `X-goog-api-key` header. `geminiRig.ts`
  uses the header.

**Amendment, 2026-07-29 (local-tier model change, hardware-driven):** the Ollama comparable arm
switches from `qwen2.5-coder:14b` to `qwen2.5-coder:7b`, to run within the M4's 16GB of unified
memory instead of fighting the 14B's thermal instability. **No code change is needed** — both
`OLLAMA_MODEL` and `NUM_CTX` are already read from the environment in
[ollamaRig.ts:19-20](../../../../eval/claude/10-grounding-ladder/ollamaRig.ts#L19) (defaults
`qwen2.5-coder:14b` / `32768`), and `platformCheck06.ts`'s probe reads the same two var names
independently. Set `OLLAMA_MODEL=qwen2.5-coder:7b` at invocation time; pull the tag first
(`ollama pull qwen2.5-coder:7b`).

Two things this is not:
- **Not a resolution of H6.** `NUM_CTX` still defaults to 32768 regardless of model size — the 7B
  leaves more memory headroom at that setting than the 14B did, but whether to raise it further is
  still the same open human call.
- **Not a transferable result, per the transfer ledger.** "Ollama 14B" below described the specific,
  already-reasoned-about tier that this folder's rejected-ideas finding and the 2026-07-28 decision
  record above were about. 7B is a new, untested model — its numbers don't inherit the 14B's, and
  every "14B" reference below that names *this arm's* tier going forward is updated to 7B to match.
  The two places left unchanged are direct quotes of prior text (the README's rejected-ideas quote,
  and the decision record above) — those describe reasoning and findings specific to the 14B that
  did not happen on 7B.

---

## The transfer ledger

**Every finding from this arm gets one of three tags, assigned before the run, not after.** This is
the guard against the mistake the arm is most likely to cause: reading a frontier result as though
it predicts a 7B or a 1.5B.

| Tag | Meaning | Transfers? | Examples |
| :--- | :--- | :--- | :--- |
| **CEILING** | An upper bound. Gemini failing is dispositive for every smaller tier; Gemini succeeding says nothing about them | **Downward only, on failure** | Fixture contamination level; whether OPAQUE blinds; whether a cell is interpretable; whether a slot is answerable from its fact partition; whether the answer key is right |
| **RIG** | A property of the harness, not of any model | **Totally** | Scorer bugs; parser bugs; `estimateTokens` calibration; prompt-assembly defects; answer-key errors; kill-criterion mechanics |
| **DIRECTION** | An effect size measured at the ceiling. The *sign* usually survives a tier change; the *magnitude* never does | **As a hypothesis, to be confirmed per tier** | Prompt encoding (TSV vs row-JSON); `{id,statement}` vs `{id,statement,entities,values}`; `cites` enum size; needle position; row-ordering policy |
| — | **CAPABILITY** — everything else | **Not at all** | Pass rates; fabrication counts; C2 grounding rate; structured-output adherence; function-calling reliability; R2 determinism at a given N |

Rule: **a CAPABILITY result from this arm may not appear in 10's verdict table.** It goes in a
separate, labelled Gemini column, and 10's per-slot decisions are made on the tier that will
actually ship. The verdict is a decision per surface for the *product's* providers; Gemini is not
one of them.

---

## Run order

The current plan reads as "add a second arm." The higher-value sequencing is **Gemini first, as a
calibration and pruning pass**, then the expensive and flaky tiers on a reduced cell set.

```
0.  Free work — no API spend            scorer/parser exercised against a hand-built panel
1.  Gemini, smoke                       ~10 calls        auth, schema path, one scored panel end-to-end
2.  Gemini, ceiling questions           ~80 calls        contamination, OPAQUE blinding, cell interpretability
3.  Gemini, full comparable cross       250 + 408 calls  the apples-to-apples arm + RIG calibration
4.  Gemini, uncapped cell               ~15 calls        the cell the local rig structurally cannot produce
    ── prune: cells shown dead at the ceiling are cut from every tier below ──
5.  Ollama 7B, surviving cells          the comparable arm, on hardware that crashes
6.  Cloudflare Workers AI               R6 portability, on the tier the product actually ships
7.  WebLLM 1.5B                         spot check only — see the four-way seam section
```

Steps 2 and 3 change what steps 5–7 have to run. That is the whole point of the ordering: the
local rig's scarce, unreliable hours get spent on cells already known to be live, with a scorer
already known to work, against an answer key already known to be right.

**One risk this ordering carries, stated plainly:** pruning on a ceiling result can cut a cell
that a *smaller* model would have failed informatively. Mitigation — only prune cells where Gemini
produces an *uninterpretable* result (kill criterion (c) territory), never cells where it merely
scores well. "Gemini passed, so skip it" is exactly the invalid inference the ledger forbids.

---

## Constraints that bind this arm

- **Invariant 1 and the local-tier override (D20/D45/D46/D59).** 10 runs "under a **local-tier-only**
  Invariant 1 override" — sending rows is survivable *because they never leave the machine*. Gemini
  is a third party. **This arm is therefore confined to the five §14 public sample fixtures**
  (`titanic`, `weather`, `stock_prices`, `product_reviews`, `ecommerce`), which are public CSVs
  already, and **no result from it may be cited as evidence for a rows-to-cloud product path.**
  The same restriction applies to the Cloudflare arm. Write this in the results file header, not
  just here.
- **No second validation path (D58).** Scoring goes through the product's own validators, as it
  does today. The one place this gets tested is the C4 triage rider below — read its boundary note.
- **F4 / R2.** "A single passing run certifies nothing." Every Gemini cell reports its N, and
  because the run is cheap, N is the one axis that should grow (see the variance-floor rider).
- **Kill criteria (a)–(m) apply unchanged**, except (b), which has no meaning where nothing
  truncates. Its replacement is stronger — see the token cross-check below.

---

## Step 0 — the free work, before any spend

None of this needs an API key and all of it is a prerequisite.

1. **Exercise the scorer against a known-good panel.** Hand-build one compliant `PanelAnswer` per
   in-scope fixture, from `PANEL-KEY.json` truth values, and assert `scorePanel` returns zero C1
   disagreements, zero C2 rejects, zero C3 occurrences. **If a correct panel does not score clean,
   every number this experiment ever produces is wrong**, and no model run can tell you that.
2. **Exercise it against a known-bad panel.** Inject each of F1 (misattribution), F2 (invented
   value), F3 (world-knowledge) and confirm each is caught, in the class it belongs to. A scorer
   that catches nothing is indistinguishable from a model that fabricates nothing.
3. **Round-trip `opaque.ts` and `corrupt.ts`.** `deanonymizePanelAnswer(anonymize(x)) === x`;
   `applyFactIntegrity` alters exactly one value and leaves the id untouched.
4. **Parser fixtures for `panelSchema.ts`.** Well-formed, cap-violating, fence-wrapped, prose-prefixed.
   Three runs died at the parse boundary; that boundary has no tests.

These are `*.test.ts` files in `eval/claude/10-grounding-ladder/`, run by **vitest under `npm test`** —
not by `npm run eval`, which is `tsx eval/harness/run.ts` and runs no tests at all. Vitest's
`include` in [vitest.config.ts](../../../../vitest.config.ts) is an explicit allowlist that today
names only `eval/claude/03-clause-citation-binding/*.test.ts` and `eval/claude/08-computed-facts/*.test.ts`, so
**`eval/claude/10-grounding-ladder/*.test.ts` must be added to that list or these files are silently never
collected** — which would no-op the gate that everything else in this plan is sequenced behind.
Adding the glob is the one permitted config edit outside `eval/claude/10-grounding-ladder/`.

Tagged **RIG**: they pay off on every arm, forever.

---

## What ships

### 1. A provider registry, not a boolean

`EVAL_PROVIDER=ollama|gemini|cloud|webllm`, resolved through one registry, rather than an
`if (gemini)` fork. The product already has three `AIProvider` implementations against one
contract — [cloudProvider.ts](../../../../src/services/cloudProvider.ts),
[ollamaProvider.ts](../../../../src/services/ollamaProvider.ts),
[webllmProvider.ts](../../../../src/services/webllmProvider.ts) — and `runChat.ts` already takes
one by injection. Baking a two-way switch into the panel arm now means unpicking it twice later.

**One env var, two seams — do not try to unify them.** The two arms call models through genuinely
different contracts and both are already load-bearing:

| Arm | Runner | Seam | Selected by |
| :--- | :--- | :--- | :--- |
| Panel | `run.ts` | `PanelRig` (new, below) — one-shot system+user, JSON out | `EVAL_PROVIDER` |
| Chat | `runChat.ts` | existing `AIProvider` via `askAI(provider, …)` — multi-turn, tools | `EVAL_PROVIDER` |

`runChat.ts` already imports `askAI` and `createOllamaProvider` from `src/services/`; its provider
swap is a one-line factory change, not a new abstraction. Collapsing `PanelRig` and `AIProvider`
into one interface is out of scope and would drag product code into an eval-only change.

**Where the code actually is (the plan's original wording was wrong about this).** `ollamaRig.ts`
today holds only the dispatcher, the warm-up and the shared consts — it has no call function.
`callOllama` and `OllamaCallResult` are **private to [run.ts:64-70](../../../../eval/claude/10-grounding-ladder/run.ts#L64)**.
So the refactor is: *move* `callOllama` out of `run.ts` into `ollamaRig.ts` behind the `PanelRig`
interface, rename `OllamaCallResult` → `ModelCallResult`, and leave `runCell`'s scoring logic
untouched. The temperature pin (below) lands at **both** call sites — `ollamaRig.ts`'s new `call`
*and* `runChat.ts`'s provider construction — or the two arms still sample differently.

```ts
// eval/claude/10-grounding-ladder/providers/index.ts
export interface ModelCallResult {
  content: string;
  promptTokens: number;
  responseTokens: number;
  thinkingTokens?: number;   // gemini; 0/undefined elsewhere
  cachedTokens?: number;     // gemini implicit cache hits — cost accounting only
}
export interface PanelRig {
  id: string;                        // 'ollama' | 'gemini' | 'cloud' | 'webllm'
  model: string;
  contextWindow: number;             // NUM_CTX for ollama; the real limit elsewhere
  temperature: number;               // pinned, never defaulted — see below
  warmUp(): Promise<void>;           // no-op for hosted providers
  call(system: string, user: string, schema?: PanelResponseSchema): Promise<ModelCallResult>;
}
```

**`PanelResponseSchema` does not exist yet and must be authored.** `panelSchema.ts` exports the TS
types (`PanelAnswer`, `PanelClaim`, `SLOT_CAPS`, `OFFERS_CAP`) and a hand-written
`parsePanelAnswer(raw)` — there is **no** JSON Schema object in the repo to hand to
`responseSchema`. Write it in `panelSchema.ts` next to the types it mirrors, as the OpenAPI subset
Gemini accepts, and keep it structurally checked against `PanelAnswer` (a compile-time
`satisfies`-style binding, or a test that a valid `PanelAnswer` validates and a cap-violating one
does not). Ollama's `format` takes the same object; `parsePanelAnswer` stays the runtime authority
for both arms, because a constrained decoder is not a guarantee.

`runCell`'s scoring logic is untouched. `OllamaCallResult` is renamed to `ModelCallResult` and
`ollamaRig.ts` becomes one `PanelRig` implementation among several.

### 2. `geminiRig.ts`

Plain `fetch` against the REST endpoint — **no new dependency**. `ollamaRig.ts` sets the precedent
(the harness has no SDKs) and an eval-only arm does not justify adding `@google/genai` to
`package.json`.

- `GEMINI_API_KEY` (required, `.env.local`), `GEMINI_MODEL` (default `gemini-2.5-flash`).
- **Retry with backoff on 429/503.** The harness has zero retry logic today; Ollama never needed
  it. Gemini's failure mode is rate limiting, and an unretried 429 silently becomes a lost data
  point exactly the way the cold-load timeout did on the first Ollama attempt.
- **Bounded concurrency** (`GEMINI_CONCURRENCY`, default conservative). Repeats are independent
  calls, so the ~4h serial local pass becomes minutes. This is not a nicety — it is what converts
  the iteration loop from once-a-day to once-a-coffee, and it is most of Job 1's value.
- **Structured output** via `generationConfig.responseMimeType: 'application/json'` +
  the `PanelResponseSchema` authored above. Verify it constrains `cites` the way 06 found Ollama's
  `format` did — Gemini's schema dialect is an OpenAPI subset, not arbitrary JSON Schema. Don't
  assume the enum survives.

### 3. Two confounds that must be pinned, and one is a defect in the existing arm

- **Temperature.** `callOllama` sets no `temperature`, so it inherits the model default. If the
  Gemini arm also defaults, the two arms are sampling at different temperatures and **every R2 /
  determinism comparison between them is confounded.** Pin it explicitly on *both* rigs, record it
  per run. This is a required change to `ollamaRig.ts`, not just a Gemini concern — and it means
  the existing Ollama numbers, when they exist, need their temperature recorded to be comparable
  to anything.
- **Thinking budget.** Gemini 2.5 Flash reasons before answering by default. A thinking model
  versus a non-thinking 7B is not an apples-to-apples arm at all, and thinking tokens bill as
  output. Set `thinkingConfig` explicitly — **budget 0 for the comparable rungs** — and record
  `thoughtsTokenCount` separately from `candidatesTokenCount`. If thinking is left on by accident,
  the comparable cross silently stops being comparable and the cost estimate is wrong too.

  Worth one deliberate cell: the same comparable rung *with* thinking enabled. Tagged CEILING, it
  answers "is grounding a reasoning problem or a reading problem?" — which is 09's question, asked
  in a way 09 couldn't ask it.

### 4. Prompt capture, and the token cross-check that replaces kill criterion (b)

- **Record the fully assembled prompt string per cell**, not just its token count. Without it you
  cannot attribute an Ollama-vs-Gemini difference to the model rather than to a differently-packed
  prompt, and the entire cross-arm comparison is unfalsifiable. Write to a sidecar
  (`PROMPTS-<provider>.jsonl`), keyed by `dataset/cellId/repeat`, so the smaller tiers can replay
  byte-identical inputs.
- **Cross-check `estimateTokens` against `usageMetadata.promptTokenCount`.** `assemble.ts` budgets
  with an *estimate*; Gemini reports the true count. The delta calibrates the estimator that the
  Ollama arm's row-packing depends on. If `estimateTokens` is off by 15%, the Ollama arm's
  "max-that-fits" rung has been fitting something other than what it thought — which would be a
  **RIG** finding worth more than the arm it came from. Report the distribution of the delta, per
  fixture, not just a mean.
- For the comparable rungs, assert the same 13k/11k budget as a soft cap and reuse
  `packRowsToBudget` unchanged. For the uncapped cell there is no budget by design; record actual
  prompt tokens instead of a truncation flag.

### 5. Panel arm and the uncapped cell

Add `uncapped-max` to `variants.ts` as a **separate exported cell list**, gated to
`EVAL_PROVIDER=gemini`, so `totalPanelCalls()` still returns 250 for the Ollama run and the
existing count isn't silently changed. Both in-scope fixtures plus the ceiling-control fixture,
N=5, ~15 calls.

**Reframe what this cell is for.** The current doc justifies it as "a cell the local rig can't
produce." It is more than that: if uncapped ≈ max-that-fits, **the row cap was never the binding
constraint**, and A1 — the ladder axis the whole experiment is named after — is the wrong lever
for every tier, not just this one. That conclusion is CEILING-tagged and transfers. It is arguably
the single most valuable cell in the arm.

Results go to `RESULTS-gemini.json`; `provider`, `model`, `temperature`, `thinkingBudget` and
`contextWindow` join the record shape, which currently hardcodes `ollamaModel`.

### 6. Chat arm — `providers/geminiProvider.ts`

Eval-scoped, **not** `src/services/`, per the scope decision. Implements the same
`{id, complete(messages, tools, options)}` contract from [types/ai.ts](../../../../src/types/ai.ts):
`ProviderMessage[]` → `contents`, `AITool[]` → `functionDeclarations`, returning `ProviderTurn`.

Gemini has real function calling, so this should be more direct than `ollamaProvider.ts`'s
text-extraction workaround — **verify that it returns a structured call rather than assuming it
and silently inheriting the same regex hack.** Whichever way it lands is a CAPABILITY finding and
belongs in the capability matrix, not in a cross-arm comparison. Output: `CHAT-RESULTS-gemini.json`.

Per 10's chat-arm scope note this still varies A1 only, regardless of provider.

### 7. Offers arm — no change

`runOffers.ts` executes SQL against DuckDB with no model call. Nothing to do at any provider.

### 8. `package.json`

```
"eval:grounding-ladder:gemini":      "EVAL_PROVIDER=gemini tsx eval/claude/10-grounding-ladder/run.ts",
"eval:grounding-ladder:chat:gemini": "EVAL_PROVIDER=gemini tsx eval/claude/10-grounding-ladder/runChat.ts",
```

Existing scripts stay the default and unchanged.

### 9. Feeding results back into 10

Gemini's numbers land as a **labelled separate column** in 10's per-cell tables, never merged into
existing rows. Each entry carries its ledger tag. 10's verdict table — the deliverable, "a decision
per surface that someone can build from" — is decided on the shipping tiers; the Gemini column is
evidence about the *instrument* and about the folder's premise, not about the product's providers.

---

## The provider capability matrix

The things that explicitly do **not** transfer get recorded per provider rather than concluded
across them. This table is a deliverable in its own right — it is R6 (Portability) made concrete,
and it is what tells you in advance which arm can even run which cell.

| | Gemini 2.5 Flash | Ollama 7B | Workers AI | WebLLM 1.5B |
| :--- | :--- | :--- | :--- | :--- |
| Context window | ~1M | 32k (`num_ctx`, H6 open) | model-dependent | small, device-dependent |
| Structured output | `responseSchema` (OpenAPI subset) | `format` (06: holds) | provider-dependent | grammar / none |
| Enum-constrained `cites` | verify | 06 says yes | verify | **the open question — 10's only route to this tier** |
| Function calling | native | unreliable; text extraction | verify | documented unreliable |
| Truncation behaviour | n/a | **silent** | verify | verify |
| Reasoning tokens | yes, configurable | no | no | no |
| Failure mode | 429 | thermal / cold-load | shared-pool exhaustion (README: exhausted once already) | tab crash / OOM |
| Rows may be sent | **public fixtures only** | yes (local-tier override) | **public fixtures only** | yes (in-browser) |

---

## The cheap riders

The base run is ~$2. **The binding constraint on riders is not money — it is harness work,
analysis time, and doc complexity.** Priced honestly below so that "it's cheap" never becomes the
justification. Ship the core arm first; each rider is independently skippable.

| # | Rider | Buys | Tag | ~Calls | ~Cost |
| :--- | :--- | :--- | :--- | ---: | ---: |
| **R-A** | **Contamination screen** | The denominator the whole ladder is read against | CEILING | 60 | $0.10 |
| **R-B** | **Does OPAQUE blind?** | Validity of the crossed cell — the folder's sharpest measurement | CEILING | 40 | $0.10 |
| **R-C** | **Variance floor / power** | The N every other arm actually needs | RIG | 800 | ~$5 |
| **R-D** | **`entities`+`values` ablation** | Prices 10's "highest-leverage single change" before it ships | DIRECTION | 160 | $1 |
| **R-E** | **`cites` enum-size curve** | What enum size the 1.5B tier would need to be viable | DIRECTION | 120 | $1 |
| **R-F** | **Encoding sweep** | TSV-vs-row-JSON, decided rather than assumed | DIRECTION | 160 | $1 |
| **R-G** | **Needle position** | The assembler's row-selection policy | DIRECTION | 200 | $3 |
| **R-H** | **C4 triage assist** | Cuts the one remaining human bottleneck | RIG | ~250 | $0.50 |

### R-A — contamination screen (do this one)

Run rows=0, CLEAR, N=10 on all five fixtures and score against `PANEL-KEY.json`. This measures
**how much of each fixture's truth is recallable without any data at all**, per fixture and per
claim class.

Why it matters: the rows=0 rung is the ladder's baseline, and the ladder's finding is a *lift* over
that baseline. If titanic's rows=0 recall is high and `product_reviews`' is near zero, the two
fixtures' ladders are not measuring the same thing and cannot be averaged. Nobody has checked, and
the frontier model is the right instrument — it establishes the *maximum* available recall, which
bounds every smaller model.

Secondary output: it identifies which fixture is cleanest for future grounding work. A dataset the
model has never seen is a better grounding test than titanic, and the folder currently has no idea
which of its five that is.

### R-B — does OPAQUE actually blind the model? (do this one)

Under `OPAQUE`, ask directly: *"What real-world dataset is this?"* N=10, both in-scope fixtures,
at rows=0 and rows=max.

**This does not go through the panel path.** It is not a `PanelAnswer`, `scorePanel` never sees it,
and it must not write to `RESULTS-*.json`. Its own contract, so the result is a number rather than
an impression:

- **Output schema:** `{ guess: string, confidence: 'high'|'medium'|'low', reasoning: string }`,
  requested via the same `responseMimeType`/schema path with a schema local to the rider.
- **Scoring — one keyword rule, written before the run, not after reading the answers.** Per
  fixture, a fixed identifying term list (titanic: `titanic`, `lusitania` as a near-miss;
  `product_reviews`: the source corpus name). `guess` is a **hit** if it contains a listed term,
  case-insensitive. No human judgment in the loop; borderline strings are recorded verbatim and
  counted as misses.
- **Reported as:** hit rate out of N per (fixture × rung), plus the confidence distribution on
  hits. Output file `OPAQUE-BLINDING-gemini.json`.
- **Kill line, stated in advance:** any hit rate above 0 at rows=0 means the anonymisation leaks
  through column statistics alone, and the crossed cell's "no recall to fall back on" claim needs
  `opaque.ts` extended to value distributions before 10 spends four hours on that cell. A hit rate
  that rises from rows=0 to rows=max localises the leak to the row values rather than the schema.

The crossed cell's entire claim is that OPAQUE + CORRUPTED leaves "no recall to fall back on."
That is an assumption, not a measurement. If a model can re-identify titanic from anonymised
column statistics — 891 rows, a binary column at ~38%, a fare distribution — the hatch is open
and the crossed cell measures something weaker than advertised.

**The transfer direction is exactly right here.** If the most capable model cannot re-identify,
smaller models certainly cannot, and the ablation is sound for every tier. If it *can*, that is a
finding that invalidates a cell in 10 before 10 spends four hours on it — and it would need
`opaque.ts` to anonymise value distributions too, not just names.

This is ~$0.10 to protect the doc's self-described sharpest measurement. It should not be optional.

### R-C — the variance floor, and what N everyone else needs

The ladder block runs N=20 because wall clock, not statistics, set the number. Nobody knows the
run-to-run variance at the pinned temperature, so nobody knows what effect size N=20 can actually
detect. F4 says one identical input produced F3 once and a correct refusal the next call — the
variance is known to be large and has never been quantified.

Run the four ladder rungs × two fixtures at **N=100** and compute the per-slot, per-class variance.
Output: *"to detect a 10-point C2 grounding difference at this variance, you need N=k."* If k > 20,
**the Ollama ladder as specified cannot support the conclusion it is designed to produce**, and
that must be known before the four-hour pass, not after.

This is a RIG finding about experimental design. The variance magnitude is Gemini's; the
*methodology* — and the discovery that N=20 may be underpowered — applies to every arm. Note the
one caveat: a smaller model is usually *more* variable, so k derived here is a floor, not an
estimate.

### R-D — the `entities`+`values` ablation

10 calls this "the highest-leverage single change in the folder": `buildComputedFactsPrompt` sends
`{id, statement}` but `checkCitation` scores against `entities` and `values` — the model is graded
on a set it never sees. 10 predicts that sending the full shape sharply reduces strict-check
rejects, and that "a real share of what 01–09 recorded as *fabrication* was the model guessing at
an unstated contract."

That is a prediction about **prompt contract legibility, not model capability**, which is why its
sign should survive a tier change. Measure the delta at the ceiling for $1 before the change is
made everywhere. If it doesn't move at the ceiling, it certainly won't move a 7B, and 10's
highest-leverage change is not.

### R-E — the `cites` enum-size curve

10's route to the WebLLM tier is explicit: scope 06's constrained decoding per slot so the enum is
~6 fact ids rather than 38, because "a six-value enum is a constraint a 14B can actually satisfy,
and plausibly one a 1.5B can too."

*Plausibly* is doing a lot of work. Sweep enum size (6 / 21 / 38) against citation validity and
slot misassignment. The absolute rates are CAPABILITY and don't transfer; the **shape of the
curve** — where constraint satisfaction starts degrading with candidate-set size — is DIRECTION
and tells you what partition granularity the small tiers need. It is the cheapest available
information about whether the zero-egress tier is reachable at all.

### R-F — encoding sweep

10 fixes TSV over row-JSON as a "fixed choice, not an axis," on a token-efficiency argument, and
budgets one side-probe cell to confirm comprehension didn't drop. Gemini can run the full sweep
(TSV / row-JSON / markdown table / column-digest) across rungs for ~$1 and turn a fixed choice
into a measured one. Encoding legibility is a prompt property; direction transfers.

### R-G — needle position, and what the assembler should keep

Only possible with a large window. Place the anchor fact's supporting rows at the head, middle and
tail of the row block, across sizes, and measure whether position affects whether the model uses
them.

This feeds the deliverable directly: `assemble.ts` is described as "THE deliverable," and its
large-table round will add "retrieval, sampling, stratified rather than complete rows." **What that
sampling should preserve is currently unknown.** A positional effect measured at the ceiling is a
policy input for every tier's packer, and the packer is shared code.

### R-H — C4 triage assist, and its D58 boundary

C4 is the only class needing a human, at "a handful of sentences per cell" across 250+ cells.
Gemini can pre-classify each free-text claim as C1/C2/C3/C4 and flag the C4 residue for reading.

**The D58 boundary, stated so it can be checked:** this must not become a second validation path.
The model does **not** score, does **not** decide pass/fail, and its output never enters a results
count. It only *orders a human's reading queue*, and the human's judgment is the recorded number.
The moment a Gemini classification appears in a scored field, this rider has violated D58 and must
be cut. Concretely: triage output lives in its own file, never in `RESULTS-*.json`.

A useful side effect: cells where the triage disagrees with the deterministic scorer are the
highest-yield place to look for scorer bugs — Job 1, continued.

---

## The other three arms

**Cloudflare Workers AI.** The nearest thing to a shipping tier, and R6 names it explicitly.
Two things to decide before it runs:

- **Do not drive it through the edge relay.** `cloudProvider.ts` goes through rate limiters, kill
  switches and counters; ~658 eval calls is abuse-shaped traffic against your own defences and
  will pollute the counters. Call Workers AI directly from the eval, consistent with the
  eval-only scope.
- **The free pool is account-wide and exhaustible** — the README records it being exhausted on
  2026-07-26 by probe runs, which is what made this folder urgent. Budget it, or run it last.
- Rows-to-third-party: same public-fixtures-only confinement as Gemini.

**Ollama 7B.** The comparable arm, unchanged except for the pinned temperature, the shared
`PanelRig` interface, and a cell set pruned by step 2. H6 (`num_ctx` 32768 vs 16384) is still an
open human call and still blocks the full pass.

**WebLLM 1.5B.** Structurally cannot run under `tsx` — it needs a real browser with WebGPU. The
repo's test setup is vitest + jsdom with **no browser-automation dependency at all**, and jsdom has
no WebGPU, so there is no existing path to run this arm headlessly. The choice is: add a
browser-driver dependency for an eval-only arm, or accept a manual, small-N spot check in Chrome.
**Say which, rather than implying it drops into the same runner.** 10 already writes this tier off
pending two checks — whether it obeys `{text, cites}` at all, and whether a 6-value enum is
satisfiable — and R-E is the cheapest way to learn whether that browser-harness work is worth
doing before doing it.

---

## Cost model

Assumptions stated so they can be checked: $0.30/M input, $2.50/M output (July 2026 Flash
pricing, per the earlier decision note); mean ~8k input / ~800 output on the panel arm, ~3k / ~300
on the chat arm; thinking budget 0 on comparable cells.

| Item | Calls | Est. |
| :--- | ---: | ---: |
| Panel arm, comparable cross | 250 | ~$1.10 |
| Chat arm | 408 | ~$0.67 |
| Uncapped cell (incl. ~37k stock_prices) | 15 | ~$0.20 |
| **Core arm total** | **673** | **~$2** |
| All eight riders | ~1,790 | ~$12 |

**Recomputed 2026-07-29 against `gemini-3.6-flash`'s real pricing** ($1.50/M input, $7.50/M
output — 5×/3× the table above), same call counts and token assumptions, thinking still assumed
~0 (Phase 3's N=1 sample, not yet confirmed at scale):

| Item | Calls | Old est. | **Recomputed** |
| :--- | ---: | ---: | ---: |
| Panel arm, comparable cross | 250 | ~$1.10 | **~$4.50** |
| Chat arm | 408 | ~$0.67 | **~$2.75** |
| Uncapped cell (incl. ~37k stock_prices) | 15 | ~$0.20 | **~$0.90** |
| **Core arm total** | **673** | **~$2** | **~$8** |

Still small in absolute terms, but ~4× the number this doc's own spend rule was written against.
**This recomputed figure is what Phase 4's go/no-go is asked against — not the stale ~$2 above.**

Two levers if a rider grows: **Batch API is 50% off** with a 24-hour turnaround, and **implicit
caching is on by default for 2.5-series models** at a large discount on cached prefix tokens — and
this workload is near-ideal for it, since N repeats of a cell send a byte-identical prefix. The
discounts do not stack; the cache discount takes precedence.

**Recommendation: don't use Batch for the core arm.** It's a different endpoint with a
job-polling flow, and it trades away the fast iteration loop that is most of Job 1's value, to
save ~$1. Consider it only for R-C, the one rider with a call count high enough to care.

---

## Build checklist

**Five phases, each a separate session, each ending in a stop-and-report.** The phases are ordered
so that everything free and reversible happens before anything that costs money, and so that a
wrong answer is caught by the phase that produced it rather than three phases later. A phase is not
"done" until its gate passes; a failing gate stops the program rather than being worked around.

**Spend rule, binding on every phase:** phases 1–2 spend nothing. Phase 3 spends under $0.05.
Phase 4 is the ~$2 core arm. **The riders in phase 5 are not authorised by this document** — each
one needs an explicit go-ahead at the time, because the binding constraint on them is analysis time
and doc complexity, not the ~$12. Never run a rider because it is cheap.

### Phase 1 — Step 0, the free work (no API key, no spend)

- [x] Add `eval/claude/10-grounding-ladder/*.test.ts` to `include` in [vitest.config.ts](../../../../vitest.config.ts)
- [x] `scorePanel.test.ts` — a hand-built compliant `PanelAnswer` per in-scope fixture, from
      `PANEL-KEY.json` truth values, scores **zero** C1 disagreements / C2 rejects / C3 occurrences
- [x] Same file — F1 (misattribution), F2 (invented value), F3 (world-knowledge) each injected and
      each caught **in its own class**, not merely caught
- [x] `opaque.test.ts` — `deanonymizePanelAnswer(anonymize(x)) === x` round-trips
- [x] `corrupt.test.ts` — `applyFactIntegrity` alters exactly one value, leaves the id untouched
- [x] `panelSchema.test.ts` — parser fixtures: well-formed, cap-violating, fence-wrapped,
      prose-prefixed (three runs died at this boundary and it has no tests)
- [x] **Gate:** `npm test` green with the new files actually collected — confirm the count rose,
      since a bad glob fails silently. `npx tsc -b --noEmit` and `npx oxlint eval/claude/10-grounding-ladder/` clean.
      **2026-07-28: confirmed** — 161 test files / 1615 tests green (up from 157 files pre-change),
      `tsc -b --noEmit` clean, `oxlint` clean.
- [x] **Report:** did a correct panel score clean on the first try? **Yes** — every hand-built
      compliant panel scored clean on the first run, and F1/F2/F3 were each caught in their proper
      class (offendingEntities for F1/F3, offendingValues for F2) with no scorer changes needed. Per
      "what would make this arm not worth running": **Job 1 does shrink** — the scorer was already
      sound, so the harness's main untested risk was never here. Jobs 2 (falsifying the
      provider-independence premise) and 3 (the ceiling questions) remain the arm's real value.

### Phase 2 — the `PanelRig` seam and the temperature pin (no spend)

- [x] Move `callOllama` from [run.ts:64-70](../../../../eval/claude/10-grounding-ladder/run.ts#L64) into
      `ollamaRig.ts` behind `PanelRig`; rename `OllamaCallResult` → `ModelCallResult`
- [x] `runCell`'s scoring logic unchanged — diff it to prove that
- [x] Author `PanelResponseSchema` in `panelSchema.ts` + its structural test against `PanelAnswer`
- [x] Pin `temperature` explicitly on the Ollama rig **and** on `runChat.ts`'s provider
      construction; record it in the run record
- [x] `provider`, `model`, `temperature`, `thinkingBudget`, `contextWindow` join the record shape
      (currently hardcodes `ollamaModel`)
- [x] `EVAL_PROVIDER` registry resolving `PanelRig` for `run.ts`; ollama the only entry so far
- [x] **Gate:** Ollama smoke re-runs and behaves identically to before the refactor — this touches
      the shared path, and a silent change here confounds the comparison the whole arm exists to make.
      **Passed 2026-07-29**, from a machine with Tailscale access: `OLLAMA_MODEL=qwen2.5-coder:7b
      EVAL_DATASET=titanic EVAL_CELL=row-ladder-0 EVAL_REPEAT_CAP=1 npm run eval:grounding-ladder` —
      1/1 compliant, warm-up 0.4s. Run on **7B**, not 14B, per the hardware-driven amendment above.
- [x] **Gate:** `totalPanelCalls()` still returns 250 — confirmed unchanged (250)

### Phase 3 — `geminiRig.ts` and first blood (< $0.05)

- [x] **Do the "verify at build" lookups first** — done, see "Verify at build" section above.
      Every figure held; one correction found (`cites` has no `enum` in the current schema — see
      that section's caveat).
- [x] `geminiRig.ts` — plain `fetch`, no new dependency; `GEMINI_API_KEY` from shell env, hard fail
      if unset; `GEMINI_MODEL` default **`gemini-flash-latest`** (amended — see "Decisions already
      made"'s 2026-07-29 note; `gemini-2.5-flash` 404s on this key)
- [x] Retry with backoff on 429/503 — an unretried 429 is a silently lost data point
- [x] Bounded concurrency via `GEMINI_CONCURRENCY`, conservative default (2)
- [x] Thinking suppressed for comparable rungs — **`thinkingLevel: 'minimal'`**, not
      `thinkingBudget: 0` (amended; this model generation has no true off). `thoughtsTokenCount`
      recorded separately as `thinkingTokens` on `ModelCallResult` / `RunRecord`
- [x] Prompt capture to `PROMPTS-<provider>.jsonl` (generic by `rig.id`, not gemini-only), keyed
      `dataset/cellId/repeat`
- [x] `estimateTokens` vs `usageMetadata.promptTokenCount` delta recorded per call (as
      `estimatedPromptTokens` alongside the existing `promptTokens` in every `RunRecord`)
- [x] `package.json`: the two `:gemini` scripts added; existing scripts unchanged
- [x] **Gate — PASSED, 2026-07-29:** `EVAL_PROVIDER=gemini EVAL_DATASET=titanic
      EVAL_CELL=row-ladder-0 EVAL_REPEAT_CAP=1 npm run eval:grounding-ladder:gemini` produced
      **the first scored panel this harness has ever seen, from any model.** First attempt 401'd
      (`ACCESS_TOKEN_TYPE_UNSUPPORTED`) — reproduced with a raw `curl` outside the harness, which
      ruled out a rig bug and pointed at the credential. Root cause, found by testing a working
      sample request the user provided: this key's format needs the `X-goog-api-key` **header**,
      not the documented `?key=` query param (401 either way until fixed) — and separately,
      `gemini-2.5-flash` is 404 on this key ("no longer available to new users"), forcing the model
      amendment above. **Real spend: effectively $0** — a handful of curl probes plus one ~4k-token
      panel call, all within the phase's <$0.05 budget.

      The panel itself (`titanic`, row-ladder-0, rows=0): fully compliant, C2 7/7 ok (2 closed by a
      closure rule), zero C1 disagreements, zero C3 fabrications, zero slot misassignments, zero
      sample leaks, offers compliant. `thoughtsTokenCount: 0` on this call — `thinkingLevel:
      minimal` did suppress thinking to zero here, though Google's docs say Gemini 3 Flash has no
      guaranteed off; N=1, don't read more into it than that per F4/R2.
- [x] **Gate:** confirm `cites` is actually enum-constrained — **superseded, see "Verify at
      build"**: the current schema has no enum on `cites` to confirm either way; that question
      belongs to R-E, not this base contract.
- [x] **Report:** `estimatedPromptTokens` vs actual `promptTokens` on the one real call: estimated
      2,573 (assembler) + ~393 (system prompt, not counted by the assembler at all) ≈ 2,966
      combined estimate, vs. **3,869 actual** (`usageMetadata.promptTokenCount`) — **≈30% under**,
      even after accounting for the system prompt gap. N=1, but large enough to flag as a
      preliminary **RIG** signal: `assemble.ts`'s ~4-chars-per-token heuristic may be a
      meaningfully optimistic estimate for this kind of structured/JSON-ish content, which matters
      for the Ollama arm's "max-that-fits" rung (it's sized against this same estimator). Worth
      confirming across more calls in Phase 4 before treating as settled — don't act on it yet.

### Phase 4 — the core arm (~$2, stale — see recomputed estimate below)

- [x] Chat arm: `providers/geminiProvider.ts` (eval-scoped, **not** `src/services/`) against the
      existing `AIProvider` contract. Built directly, mirroring `cloudProvider.ts`'s directness
      rather than `ollamaProvider.ts`'s regex extraction — tools are always passed and Gemini's own
      `functionCall` part (not a text-extraction heuristic) produces the `tool_call` turn. **Not yet
      verified against the live API** — that's this checklist's next unchecked item (chat smoke),
      which is the first real spend and needs the go/no-go below first.
- [x] `uncapped-max` as a **separate exported cell list** in `variants.ts`, gated to
      `EVAL_PROVIDER=gemini` (`rig.id === 'gemini'` in `run.ts`'s `main()`), so `totalPanelCalls()`
      still returns 250 — confirmed unchanged. `runCell` lifts both the row-packing budget and
      `assemble()`'s own section budget to `Infinity` for this block only, so "uncapped" doesn't
      quietly become a relabelled max-that-fits.
- [x] Chat smoke via `EVAL_RUNG`/`EVAL_DATASET` — passed, see handoff below
- [x] Full comparable cross (250) → `RESULTS-gemini.json`; chat (408) → `CHAT-RESULTS-gemini.json` —
      **partial**: chat arm fully clean (408/408); panel arm lost 16 calls to a hard billing block,
      not a model or harness failure — see handoff
- [x] Uncapped cell (~15) — **10/15 ran** (titanic, product_reviews); stock_prices' 5 lost to the
      same billing block. For the two that ran, uncapped ≡ row-ladder-max exactly (identical
      `rowsSent`/`promptTokens`) — but this is **tautological** given Gemini's ~1M window trivially
      exceeds either fixture's full-row cost, not the doc's hoped-for "was the cap ever binding"
      finding. That question's informative version (Gemini-uncapped vs. Ollama's 32k-bounded
      max-that-fits on stock_prices) still needs the Ollama arm.
- [x] Results-file header carries the public-fixtures-only confinement and the
      no-rows-to-cloud-product-path restriction, per the Invariant 1 constraint — added to both
      `run.ts` and `runChat.ts`'s output metadata (`scopeNote`, non-null for every provider but
      ollama). **Not retroactive**: the completed run's own `RESULTS-gemini.json`/
      `CHAT-RESULTS-gemini.json` predate this field and don't carry it — this doc is the record of
      the constraint for that data; the field is there for every run from here on.
- [x] Every finding tagged CEILING / RIG / DIRECTION / CAPABILITY — see handoff below
- [x] **Gate:** `npx tsc -b --noEmit` clean repo-wide; `npx oxlint eval/claude/10-grounding-ladder/` clean;
      full suite green (162 files / 1633 tests) — all before the scopeNote edit above, re-confirmed
      clean after it. `npm run eval` (D40, the Ollama-arm gate) not run this session — unrelated to
      this provider's arm and unaffected by these changes.
- [x] **Report:** real spend against the ~$2 estimate; the `estimateTokens` delta distribution per
      fixture (not a mean); and whether F1/F2/F3 reproduced — the folder's load-bearing premise
      turns on that one.

### Phase 5 — riders, one at a time, each explicitly authorised

Priority order if any run at all: **R-B** (protects the folder's sharpest measurement, $0.10),
**R-A** (the ladder's denominator, $0.10), then **R-C** (whether N=20 is underpowered — which, if
it isn't known, undermines the Ollama pass before it starts). R-D through R-H are DIRECTION work
and can wait indefinitely.

- [ ] Each rider writes to its **own** output file, never into `RESULTS-*.json`
- [ ] R-H specifically: triage output never enters a scored field, or it has violated D58 and is cut

### Not in any phase

The Ollama re-run, Workers AI and WebLLM arms are steps 5–7 of the run order and depend on the
pruning that phases 3–4 produce. The WebLLM browser-harness question (add a browser driver, or
accept a manual small-N spot check) is a human decision that this document deliberately leaves open.

---

## Verify at build — do not trust this document

Written from a May-2026 knowledge cutoff against a July-2026 API. Check each against current docs
before relying on it: exact `thinkingConfig` parameter name and whether budget 0 is permitted on
2.5 Flash; whether `usageMetadata` exposes `thoughtsTokenCount` and cached-token counts separately;
`responseSchema`'s supported subset, specifically string `enum` support; current rate limits per
key tier; and whether the $0.30/$2.50 figures still hold. If any differ, fix the number here rather
than working around it silently.

**Verified 2026-07-29, Phase 3 — every number in this doc holds, nothing to correct:**
- `thinkingConfig.thinkingBudget: 0` is the documented way to disable thinking on 2.5 Flash
  ([Gemini thinking docs](https://ai.google.dev/gemini-api/docs/thinking)); `-1` is dynamic
  thinking. Wired as-is in `geminiRig.ts`.
- `usageMetadata` exposes `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount` and
  `cachedContentTokenCount` as separate fields — confirmed against
  [Understand and count tokens](https://ai.google.dev/gemini-api/docs/generate-content/tokens)
  and [GenerateContentResponse](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/GenerateContentResponse).
  Cached tokens are included in `promptTokenCount` but excluded from `totalTokenCount`.
- `responseSchema`'s OpenAPI subset documents `enum: [string]` as a supported keyword
  ([Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)). **Caveat this
  doc's own Phase 3 checklist got wrong:** `PANEL_RESPONSE_SCHEMA` (authored in Phase 2,
  `panelSchema.ts`) does **not** put an `enum` on `cites` — it's typed as a non-empty string array
  only, matching what `parsePanelAnswer` already checks at runtime. There is no per-slot
  fact-id enum anywhere in the harness yet; that's R-E's "cites enum-size curve" rider, not
  something the base contract does. So "confirm cites is actually enum-constrained" has nothing to
  measure against the current schema — what's verified instead is that the *keyword* is supported
  by Gemini's dialect, for whenever R-E needs it.
- Pricing confirmed current for Gemini 2.5 Flash: $0.30/M input, $2.50/M output
  ([Gemini API Pricing, July 2026](https://benchlm.ai/google/api-pricing)). Model is slated for
  deprecation 2026-10-16 — irrelevant to this arm's timeline, noted for whoever reopens this later.
- Tier 1 (paid) rate limit is 150–300 RPM depending on model variant
  ([Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)) — comfortably above
  `GEMINI_CONCURRENCY`'s conservative default of 2.

**Superseded the same day, once the live key was actually tried (see "Decisions already made"'s
2026-07-29 amendment) — the four bullets above are accurate documentation of Gemini 2.5 Flash, but
that model is unreachable on this project's key, so none of the following carried over unchanged:**
- Auth: `?key=` query param 401s (`ACCESS_TOKEN_TYPE_UNSUPPORTED`) on this key; `X-goog-api-key`
  header works. Not a 2.5-vs-3.x thing as far as could be told — specific to this key's format.
- Thinking control: `thinkingLevel` (string: `minimal`/`low`/`high`), not `thinkingBudget`, on
  `gemini-flash-latest` → `gemini-3.6-flash`. No documented off-switch, per
  [Gemini thinking docs](https://ai.google.dev/gemini-api/docs/thinking) and multiple
  [pricing/migration write-ups](https://apidog.com/blog/gemini-3-6-flash-pricing/) covering Gemini
  3 Flash/Flash-Lite specifically.
- Pricing: $1.50/M input, $7.50/M output for `gemini-3.6-flash`
  ([pricing guide](https://www.cometapi.com/gemini-3-6-flash-api-pricing-migration/)) — 5×/3× the
  2.5 Flash figures the "Cost model" section below still shows.

## Verification

1. `npx tsc -p eval/tsconfig.json --noEmit` and `npx oxlint eval/claude/10-grounding-ladder/` stay clean.
2. **Step 0's tests pass** under `npm test` (vitest), with the new `include` glob confirmed to be
   collecting them — a correct panel scores clean, F1/F2/F3 are each caught in class.
   Nothing else runs until this does.
3. Smoke, panel: `EVAL_PROVIDER=gemini EVAL_DATASET=titanic EVAL_CELL=row-ladder-0
   EVAL_REPEAT_CAP=1 npm run eval:grounding-ladder:gemini` — auth, `responseSchema`, and **the
   first scored panel this harness has produced**.
4. Smoke, chat: same pattern via `EVAL_RUNG`/`EVAL_DATASET`.
5. `npm run eval` (D40 gate) stays green.
6. Ollama arm re-runs its own smoke after the `PanelRig` refactor and the temperature pin — the
   refactor touches the shared path, and a silent behaviour change there would confound the very
   comparison this arm exists to make.
7. Full run, then report **real spend against the estimate**, and the `estimateTokens` delta
   distribution.

## What would make this arm not worth running

Stated in advance, per D18:

- **Step 0 finds the scorer sound and well-tested.** Then Job 1 is worth much less, and the arm
  shrinks to Jobs 2 and 3 — still worth ~$0.50, but not the full program.
- **The comparable rungs can't be made comparable.** If thinking can't be disabled, or the schema
  path forces a materially different output contract, then Gemini is measuring a different task
  and only the CEILING and RIG jobs survive. Say so and cut the comparable cross rather than
  reporting a confounded column.
- **Gemini reproduces F1/F2/F3 exactly, and nothing else surprises.** That is a real result — the
  folder's premise corroborated on a distant fourth point — but it means the riders are the actual
  deliverable, not the cross.

---

## Handoff — where the next session picks up

**Status as of 2026-07-29: Phase 1 and Phase 2 done, green (one gate deferred — see below). No
spend yet, no API call made.**

**Done (Phase 1, no spend):**
- `eval/claude/10-grounding-ladder/*.test.ts` added to `include` in `vitest.config.ts`.
- Four new test files, 33 tests, all passing: `scorePanel.test.ts`, `opaque.test.ts`,
  `corrupt.test.ts`, `panelSchema.test.ts`. Full suite 161 files / 1615 tests green, `tsc -b
  --noEmit` clean, `oxlint` clean.
- **Phase 1's own report question is answered, in Phase 1's checklist above: a correct panel
  scored clean on the first try**, and F1/F2/F3 were each caught in the right class with no scorer
  changes needed. Per "what would make this arm not worth running," **Job 1 shrinks** — the scorer
  was already sound — so this arm's remaining value is Jobs 2 (falsifying provider-independence)
  and 3 (the ceiling questions), not exercising an untested scorer.
- `GEMINI_API_KEY` confirmed present in the repo-root `.env.local` (not `app/.env.local`). Per this
  doc's own decision, it is **not** read via `dotenv` — `.env.local` is Vite's, not `tsx`'s. When
  Phase 3 needs it, export it into the shell first:
  `export GEMINI_API_KEY=$(grep '^GEMINI_API_KEY=' .env.local | cut -d= -f2-)`.

**Done (Phase 2, no spend):**
- `eval/claude/10-grounding-ladder/providers/index.ts` (new) — `ModelCallResult`/`PanelRig` interfaces and
  `resolvePanelRig(providerId)`, a registry with `ollama` as its only entry.
- `callOllama` moved out of `run.ts` into `ollamaRig.ts` as `ollamaPanelRig: PanelRig` (renamed
  `OllamaCallResult` → `ModelCallResult`); `run.ts` calls `rig.call(...)` and reads
  `rig.contextWindow`/`rig.model`/`rig.temperature`/`rig.id` in place of the old direct
  `NUM_CTX`/`OLLAMA_MODEL` imports. `runCell`'s scoring logic (everything from `parsePanelAnswer`
  through the `records.push`) is byte-identical — confirmed via `git diff`.
- `OLLAMA_TEMPERATURE` (default 0.8, Ollama's own documented unset-Modelfile default) added to
  `ollamaRig.ts` and pinned at **both** call sites: `ollamaPanelRig.call` and `runChat.ts`'s
  `rigFetch` body rewrite. Behaviour-neutral by construction — the value matches what was silently
  inherited before, only now explicit and recorded.
- `PanelResponseSchema` (as `PanelJsonSchema`/`PANEL_RESPONSE_SCHEMA`) authored in `panelSchema.ts`,
  plus `validatesAgainstPanelSchema` — a minimal structural checker (not a general JSON Schema
  engine), covering exactly the OpenAPI subset (`type`/`properties`/`required`/`items`/`minItems`/
  `maxItems`) both Ollama's `format` and Gemini's `responseSchema` accept. **Not yet wired into
  either call site** — `parsePanelAnswer` stays the sole runtime authority this phase, per the
  doc's own line that a constrained decoder is not a guarantee. Structural tests added to
  `panelSchema.test.ts` (valid panel validates; cap-violating structural/offers and a missing
  required field each fail).
- Both `RESULTS.json` and `CHAT-RESULTS.json`'s top-level metadata now carry `provider`/`model`/
  `temperature`/`thinkingBudget` (`null` until a Gemini rig exists)/`contextWindow` in place of the
  hardcoded `ollamaModel`/`numCtx`. `keepAlive` stays — still ollama-specific and meaningful, and
  the doc says these fields *join* the shape, not replace all of it.
- **Verified:** `npx tsc -p eval/tsconfig.json --noEmit` clean; `npx oxlint eval/claude/10-grounding-ladder/`
  clean; `npx vitest run eval/claude/10-grounding-ladder` — 4 files / 37 tests green (33 + 4 new schema
  tests); `totalPanelCalls()` unchanged at 250.
- **Not verified this session:** the Ollama-smoke gate itself. The rig lives at a Tailscale address
  (`100.126.157.97:11434`) unreachable from this sandbox. Everything that doesn't require the live
  daemon is confirmed; the live re-run needs to happen from a machine with network access to it,
  and **should happen before Phase 3 spends anything** — it's the one gate that actually exercises
  the moved code path end-to-end.
  **Update, 2026-07-29 (later, from a machine with access):** verified — see the Phase 2 checklist
  above and the new "Ollama 7B full run" handoff entry at the end of this section.

**Status as of 2026-07-29, later same day: Phase 3 done — gate passed, first scored panel
produced. Two of the doc's own assumptions (model, thinking-control mechanism) were wrong on
contact with the live key and are now corrected; see the "Decisions already made" 2026-07-29
amendment and "Verify at build"'s superseded-bullets note for the full detail.**

**Done (Phase 3, ~$0 spend):**
- "Verify at build" lookups done — see that section above. Every figure held **for Gemini 2.5
  Flash**; that model turned out to be unreachable on the live key (404, "no longer available to
  new users" — confirmed by direct curl), forcing a same-day model swap to `gemini-flash-latest`
  (→ `gemini-3.6-flash`), which changed pricing (5×/3×) and the thinking-control mechanism
  (`thinkingLevel`, not `thinkingBudget` — and no true off on this generation). Also: `cites` has
  no `enum` in `PANEL_RESPONSE_SCHEMA` (that's R-E's job, not this base contract's).
- `providers/index.ts`: `ModelCallResult` gained `thinkingTokens?`/`cachedTokens?`; `PanelRig`
  gained `thinkingConfig?: string` (a string, not a number — see above) and `call`'s third
  `schema?: PanelResponseSchema` param; `WarmUpResult` moved here from `ollamaRig.ts` (now the
  shared contract type, imported back into it); `warmUp()` now returns `Promise<WarmUpResult>`
  instead of `Promise<void>`. `gemini` registered in `REGISTRY` alongside `ollama`.
- `ollamaRig.ts`: `ollamaPanelRig.warmUp` now returns the real `WarmUpResult` (previously
  discarded it) — the only behavioural change on this file, and it only affects what `main()` does
  with the value, not Ollama's own request/response handling.
- `eval/claude/10-grounding-ladder/geminiRig.ts` (new): plain `fetch` against
  `generativelanguage.googleapis.com`, no new dependency, auth via the **`X-goog-api-key` header**
  (the documented `?key=` query param 401s on this key's format —
  `ACCESS_TOKEN_TYPE_UNSUPPORTED`, reproduced outside the harness). `GEMINI_MODEL` (default
  `gemini-flash-latest`), `GEMINI_TEMPERATURE` (default 0.8, matching Ollama's pin),
  `GEMINI_THINKING_LEVEL` (default `'minimal'` — this model's floor, not a true off),
  `GEMINI_CONCURRENCY` (default 2, a hand-rolled counting semaphore — no queue dependency for one),
  retry-with-backoff on 429/503 (5 attempts, exponential). `warmUp()` does no generation — its only
  job is the doc's required fail-loud `GEMINI_API_KEY` precondition check, which now actually runs
  at the top of `main()` (see next bullet) rather than never running at all.
- **Fixed a real bug in `run.ts` while wiring this in:** `main()` called `ollamaRig.ts`'s
  `warmUpAndReport()` directly and unconditionally, regardless of `EVAL_PROVIDER` — so a Gemini run
  would have warmed up the (unreachable, from this sandbox) Ollama Tailscale daemon before ever
  reaching Gemini, and the fail-loud API-key check had no path that would actually run. `main()` now
  calls `rig.warmUp()` on the resolved provider generically, with the same console log shape as
  before. Ollama's own warm-up behavior is unchanged; `runChat.ts` still calls `warmUpAndReport()`
  directly, unaffected, since the chat arm has no Gemini provider yet (Phase 4).
- `run.ts` also: passes `PANEL_RESPONSE_SCHEMA` as `call`'s third argument (Ollama's `call` ignores
  the extra arg; Gemini's uses it as `responseSchema` + `responseMimeType: 'application/json'`);
  writes a `PROMPTS-<provider>.jsonl` sidecar per call (system + user prompt +
  `estimatedPromptTokens`), generic by `rig.id`; adds `estimatedPromptTokens`/`thinkingTokens`/
  `cachedTokens` to `RunRecord`; results now write to `RESULTS-gemini.json` for non-ollama
  providers so a Gemini smoke test can't clobber the Ollama arm's `RESULTS.json`; `thinkingConfig`
  in the output metadata now reflects `rig.thinkingConfig` instead of being hardcoded `null`.
- `package.json`: `eval:grounding-ladder:gemini` and `eval:grounding-ladder:chat:gemini` added
  (the latter inert until Phase 4 gives `runChat.ts` a Gemini provider — matches this doc's own
  Phase 3 checklist, which asked for both scripts now).
- **Verified:** `npx tsc -p eval/tsconfig.json --noEmit` clean; `npx oxlint eval/claude/10-grounding-ladder/`
  clean; `npx vitest run eval/claude/10-grounding-ladder` — 4 files / 37 tests still green, no regressions.

**Gate passed, 2026-07-29:** `EVAL_PROVIDER=gemini EVAL_DATASET=titanic EVAL_CELL=row-ladder-0
EVAL_REPEAT_CAP=1 npm run eval:grounding-ladder:gemini` produced the first scored panel this
harness has ever seen from any model — fully compliant, C2 7/7 ok, zero C1/C3/slot-misassignment/
sample-leak counts, offers compliant, `thoughtsTokenCount: 0`. Full record and panel text are in
Phase 3's checklist entry above. `estimatedPromptTokens` (2,573 + ~393 system-prompt, uncounted by
the assembler) came in **≈30% under** the real `promptTokenCount` (3,869) — N=1, flagged as a
preliminary RIG signal on `assemble.ts`'s token estimate, not yet acted on.

**Real spend across the whole phase: effectively $0** (a handful of free curl probes to find the
auth/model issues, plus one ~4k-token panel call).

**Status as of 2026-07-29, later same day: Phase 4's no-spend prep done. No smoke test run yet —
that's the next spend and needs the go/no-go below first.**

**Done (Phase 4 prep, $0 spend):**
- `geminiRig.ts`: `requireApiKey`, `GEMINI_THINKING_LEVEL`, and `GEMINI_CONTEXT_WINDOW` are now
  exported (previously module-private) — reused by the chat arm rather than re-derived, so the two
  arms can't drift on model/temperature/thinking-level/context-window the way the doc's own
  "confound" warnings are about.
- `eval/claude/10-grounding-ladder/providers/geminiProvider.ts` (new): the chat-arm `AIProvider`. Built
  direct, mirroring `cloudProvider.ts` rather than `ollamaProvider.ts`'s regex-extraction workaround
  — tools are always passed to Gemini as `functionDeclarations`, and a `functionCall` part in the
  response (not text-scraping) produces the `tool_call` turn. `ProviderMessage`'s `tool` role maps
  to Gemini's `functionResponse` by name, threaded from the preceding assistant tool call (Gemini
  matches by name, not id — same simplification `ollamaProvider.ts` already makes). Its own
  retry-with-backoff on 429/503, kept separate from `geminiRig.ts`'s copy rather than shared,
  per the doc's own "two seams — do not try to unify them" precedent. An `onUsage` callback reports
  real `promptTokenCount`/`candidatesTokenCount` back to the caller, since `AIProvider.complete()`'s
  return shape has no room for usage metadata — `runChat.ts` reads it the same way it already reads
  Ollama's via `rigFetch`'s response interception, just through a callback instead of a wire-level
  wrapper. **Not yet verified against the live API** (the doc's own "verify it returns a structured
  call" item) — that first call is the chat smoke test, gated on the go/no-go below.
- `runChat.ts`: `EVAL_PROVIDER` now actually selects a provider (previously ignored — always
  Ollama, regardless of the env var) via a one-line factory branch, per the doc's own framing. Fixed
  the same bug Phase 3 fixed in `run.ts`: `main()` called `warmUpAndReport()` unconditionally, which
  would have warmed the unreachable Ollama Tailscale daemon before ever reaching Gemini and never
  run the fail-loud `GEMINI_API_KEY` check. A local `CONTEXT_WINDOW` (Gemini's ~1M vs. Ollama's
  32k) now drives both the row-packing budget and the `truncated` check, so a Gemini chat run isn't
  silently capped at the Ollama arm's window. Non-ollama providers write to their own
  `CHAT-RESULTS-<provider>.json`, matching `run.ts`'s existing `RESULTS-gemini.json` split.
- `variants.ts`: `UNCAPPED_CELLS` (block `'uncapped'`, `a1: 'max'`, N=5) added as its own export,
  not folded into `PHASE1_CELLS`/`CEILING_CELLS` — confirmed `totalPanelCalls()` still returns 250.
- `run.ts`: `main()` appends `UNCAPPED_CELLS` to all three fixtures' cell lists only when
  `rig.id === 'gemini'`. `runCell` lifts both the row-packing budget and `assemble()`'s own
  section-level budget to `Infinity` for `cell.block === 'uncapped'` only — otherwise "uncapped"
  would just be a relabelled max-that-fits, defeating the point of the cell (doc: "if uncapped ≈
  max-that-fits, the row cap was never the binding constraint").
- **Verified:** `npx tsc -b --noEmit` clean across the whole repo; `npx oxlint
  eval/claude/10-grounding-ladder/` clean; full suite green (162 files / 1633 tests, up from 161/1615);
  `totalPanelCalls()` confirmed still 250.
- **Cost model recomputed** against `gemini-3.6-flash`'s real pricing — see "Cost model" section
  above. Core arm is now **~$8**, not the doc's stale ~$2 (panel ~$4.50, chat ~$2.75, uncapped
  ~$0.90). Still cheap in absolute terms, but ~4× the number the spend rule was written against.

**Human authorized the ~$8 recomputed estimate the same day.** Chat smoke ran first (see below),
then the full core arm. **The Phase 2 Ollama-smoke gate is still deferred** — re-checked again this
session, `100.126.157.97:11434` remains unreachable from this sandbox — and still blocks the
Ollama arm specifically; it did not block Gemini's own run.

**Status as of 2026-07-29, later same day: Phase 4's core arm has run. Chat arm fully clean.
Panel arm partially complete — 249/265 calls, the other 16 lost to the AI-Studio project's
monthly billing cap, not to any model or harness failure.**

**A credential bug found and fixed before any of this could run:** the chat smoke test first
failed every one of 12 calls with `askAI`'s generic "AI provider could not be reached" — tracing it
past that message (which folds all transport errors together by design) to a raw `fetch`, then to
the exact 401 `ACCESS_TOKEN_TYPE_UNSUPPORTED` `geminiRig.ts` hit in Phase 3, then to a **raw curl
independent of all harness code**, which still 401'd. That ruled out every line of code written
this session. The actual cause: repo-root `.env.local`'s `GEMINI_API_KEY` had **`AQ.` accidentally
duplicated** (`AQ.AQ.Ab8RN6...` instead of the correct `AQ.Ab8RN6...`) — a transcription error, not
an invalid or revoked key. Fixed by correcting that one line; confirmed by raw curl before touching
any harness code again. (A prior memory record theorized this key's *format* was fundamentally
wrong for the Generative Language API — that theory was itself wrong and has been corrected; the
real cause was always the duplicated prefix.)

**Chat smoke, then full chat arm — both clean:**
- Smoke (`EVAL_DATASET=titanic EVAL_RUNG=0 EVAL_REPEAT_CAP=1`): 12/12 exec. Since
  `geminiProvider.ts` contains **no text-extraction fallback at all** (unlike `ollamaProvider.ts`),
  a 100% exec rate is direct proof the native `functionCall` path works end-to-end — the doc's own
  "verify it returns a structured call" item, cleared.
- Full run (408 calls, all four rungs × three fixtures × N=3): **407/408 calls returned a usable
  prompt-token count; exec rate 100%/100%/100%/94.1% across rungs 0/10/100/max.**
  **Correctness fell as rows increased — 71.6% → 64.7% → 63.7% → 56.9%, monotonically, from rung 0
  to rung max.** More context made Gemini's NL→SQL answers *less* often correct, not more. Tagged
  **CAPABILITY** (Gemini-specific, doesn't transfer by the ledger's own rule) — reported in its own
  column, not folded into 10's verdict table — but the *sign* is worth watching for on every other
  tier once they run: if the direction holds up, it's a genuinely counter-intuitive result about
  this pipeline's row-evidence framing, not just this provider.

**Panel arm — the AI-Studio billing block.** Partway through `stock_prices` (processed last), every
call started failing with HTTP 429 `RESOURCE_EXHAUSTED`, `"Your project has exceeded its monthly
spending cap"` — a **hard billing limit on the Google Cloud project**, not a rate limit (the
retry-with-backoff exhausted all 5 attempts identically each time, as expected for a cap rather
than a transient condition). **titanic and product_reviews completed in full, including their own
`uncapped-max` cells** — the cap was hit only after those, partway into `stock_prices`. Lost: the
last repeat of `ceiling-control-10`, all of `ceiling-control-100`, all of `ceiling-control-max`,
and all of `uncapped-max` for `stock_prices` — 16 calls, all recorded as `compliant: false` with no
model behavior implicated. **Actionable: raise the cap at https://ai.studio/spend to backfill
`stock_prices`'s missing cells, or accept the partial ceiling-control data as-is** — this doc
doesn't decide that; it's a spend call like the ~$8 authorization was.

**Real spend, panel arm (exact, from recorded `promptTokens`/`responseTokens`):** 2,836,341 input +
121,291 output tokens across 249 compliant calls, **0 thinking tokens on every single one** —
`thinkingLevel: minimal` staying at zero is no longer a Phase 3 N=1 curiosity, it's confirmed across
249 real calls; **the doc's "provisional" flag on the comparable cross's zero-thinking claim is
lifted.** At `gemini-3.6-flash`'s real pricing: **≈$5.16**, against the ~$4.50 recomputed estimate —
close, the small gap explained by the 16 failed calls' retry attempts (5 requests each, billed even
on failure) not being in the estimate. **Chat arm: not precisely reconstructable** —
`ChatRecord` only persists `maxPromptTokens` (the largest single call in a multi-call turn), not a
per-call sum, and no output-token count at all; that gap predates this session (the same field
shape the Ollama arm already used) and wasn't worth changing mid-run. The average `maxPromptTokens`
actually observed was **≈15,200 tokens — about 5× the doc's ~3k assumption** (the pipeline's system
prompt + schema card + row evidence at higher rungs add up to more than the estimate assumed), so
real chat-arm spend is very likely meaningfully above the ~$2.75 recomputed figure. **Check
https://ai.studio/spend for the authoritative total** — that page is ground truth; nothing
reconstructed here should be treated as more than an estimate.

**F1/F2/F3 and the folder's premise (Job 2) — a real answer, not a clean yes/no:**
- **Zero C3 occurrences across all 249 compliant panels.** Gemini never produced an
  exhaustive-absence fabrication (F2/F3's shape), on any fixture, any cell. Tagged **CAPABILITY**
  (Gemini's own column).
- **Zero C1 disagreements on every `a3=TRUE` (uncorrupted) call — 199 of them**, across
  `row-ladder`, `recall-ablation`, `uncapped` and `ceiling-control`. On genuine data, Gemini's
  header claim never once drifted from ground truth. Tagged **CAPABILITY**.
- **All 129 C1 disagreements are confined to `anchor-probe`/`crossed-cell` — the corrupted-fact
  axis — by design, not spread across the run.** Read naively, "129 disagreements" reads as a
  fabrication rate; it is not one. Breaking it down by what `a3` actually did:
  - **`CORRUPTED` (35 + 10 in `crossed-cell`):** the model's header **faithfully echoed the
    corrupted computed-fact value** it was told to cite (e.g., titanic's header said "1247 rows,"
    matching the corrupted `fact:titanic.rowCount` statement fed in the COMPUTED FACTS section —
    confirmed against the captured prompt in `PROMPTS-gemini.jsonl`) rather than falling back to
    training-data recall of the real, extremely well-known value (891). That's a **grounding
    signal**, not a fabrication — the model used the fact it was given even though the true schema
    card sat two lines above it in the same prompt and even though 891 is about as memorized a
    number as exists in any public dataset. Tagged **CEILING**: if the most capable model available
    stays grounded on the fed (wrong) fact rather than overriding with recall, that's a strong prior
    that a smaller model would too — though it also means the model raised no flag at all on an
    internally contradictory prompt.
  - **`DELETED` (84 of the 129):** with the anchor fact removed outright, the model reasonably
    substituted a **different, legitimate claim** for the header (e.g., "Top Sex values: male
    (575), female (316)" — a real, correctly-cited statistic, just not about row count). `scoreC1`
    only knows the row-count truth, so it flagged every number in that substitute claim as a
    "disagreement," when the claim itself may have been perfectly grounded. **This is a genuine RIG
    finding**: the `DELETED` condition of the anchor-probe axis has no well-defined C1 pass
    criterion once the model reasonably pivots to a different fact — exactly the kind of scorer gap
    Job 1 hoped would surface fast on a cheap, fast arm rather than four hours into an Ollama pass.
    **`scorePanel.ts`/`scoreC1` needs a real fix before the `DELETED` condition's numbers mean
    anything** — not done here, since it's a scoring-logic change outside this arm's own scope, but
    it should block trusting any `DELETED`-cell C1 count, on any provider, until it lands.
- **Crossed cell (`OPAQUE` + `CORRUPTED`, the doc's own "sharpest measurement"): 10/10 compliant,
  every one coherent and scoreable** — no trial hit kill criterion (c)'s "model said something
  unrelated." That's a clean, dispositive answer to one of Job 3's open questions ("is the crossed
  cell interpretable at all?") — **yes, at the ceiling.** Tagged **CEILING**. C2 scored well too
  (7/7 and mostly 6/6 or 5/6 across the ten trials).
- **Sample leaks (31 total) are entirely confined to `titanic`** — zero in `product_reviews` or
  `stock_prices`. A per-fixture signal relevant to Job 3's contamination question and R-A's rider:
  titanic's row values appear more prone to leaking into claim text than the other two fixtures'.
  Tagged **CAPABILITY**, fixture-specific.

**The uncapped cell didn't answer the question it was built for.** For the two fixtures that ran
(titanic, product_reviews), `uncapped-max`'s `rowsSent` and `promptTokens` are **identical** to
`row-ladder-max` — but this is **tautological**, not the doc's hoped-for finding: Gemini's ~1M
context window trivially exceeds either fixture's full-row token cost (≈29k and ≈19k respectively),
so nothing was ever going to be capped regardless of the cell existing. The genuinely informative
version of "was the row cap ever binding" is cross-provider — Gemini's uncapped/max-that-fits
against **Ollama's 32k-bounded** max-that-fits on `stock_prices`, the one fixture where Ollama's
window is the actual constraint — and that still needs the deferred Ollama-smoke gate and the
Ollama arm itself to run.

**Next, once a human decides on the two open items above** (raise the AI-Studio spend cap or
accept partial `stock_prices` data; and get Ollama-arm network access): the Ollama comparable cross
(pruned per whatever the ceiling/RIG findings above rule out — none of them do, since every C1/C3
signal that matters was CAPABILITY or CEILING, not a dead cell), then Cloudflare Workers AI, then
feeding all of it back into 10's verdict table as a labelled Gemini column, never merged into the
shipping-tier rows.

---

## Handoff — 2026-07-29, session 2: scorer fix landed, spend cap unblocked, backfill is next

**The `DELETED`-condition scorer bug (flagged above, "genuine RIG finding") is fixed and verified,
$0 spend.** `scoreC1` in `scorePanel.ts` now checks what the header claim actually cites:
- Cites the anchor fact (the `CORRUPTED` case) → unchanged strict byte-equality against
  `PANEL-KEY.json`'s truth set. This is genuine grounding-vs-recall signal and must not soften.
- Cites a different, real fact (the `DELETED` pivot case) → now scored via
  `checkCitationWithClosure`, the same closure check `scoreC2` already uses, instead of comparing
  arbitrary numeric tokens against a truth set that no longer applies once the anchor is gone.
- Cites nothing resolvable → falls through to the old numeric-token behaviour, unchanged.

Verified via: 3 new cases in `scorePanel.test.ts` (legitimate pivot → zero C1; pivot that
misstates the new fact's value → still caught; header citing the anchor directly → still strict)
— all passing, plus the full `eval/claude/10-grounding-ladder` suite (40 tests), `tsc --noEmit`, and
`oxlint`, all clean, no regressions. **Not done:** an offline replay of the 84 historical
`DELETED`-condition records in `RESULTS-gemini.json` against the fixed scorer — possible since
`corrupt.ts`'s corruption is fully deterministic (no RNG), but judged not worth the extra harness
code since the unit tests exercise the identical closure-check code path against the doc's own
worked example. Revisit only if someone wants the exact historical counts recomputed rather than
the qualitative finding already written above.

**Spend cap:** the user has raised the AI-Studio monthly spend cap that blocked Phase 4 partway
through `stock_prices` (see "the AI-Studio billing block" above). **Not yet done:** actually
running the backfill. What's missing, exactly, per that section: the last repeat of
`ceiling-control-10`, all of `ceiling-control-100`, all of `ceiling-control-max`, and all of
`uncapped-max` — 16 calls total, `stock_prices` only, other two fixtures already complete
including their own `uncapped-max`. Estimated well under $1 at `gemini-3.6-flash`'s real pricing.

**Next session should:**
1. Re-export `GEMINI_API_KEY` from `.env.local` into the shell (not read via dotenv, per this
   doc's own scope decision) and confirm the cap is actually lifted with a cheap probe call before
   spending on the full backfill.
2. Run the missing `stock_prices` cells. `EVAL_DATASET=stock_prices` narrows to the one fixture;
   there is no existing narrower filter for "just the missing repeats/cells within a fixture," so
   re-running proceeds by dataset filter and may re-request some already-completed
   `stock_prices` cells too (`ceiling-control-10`'s first 9 repeats, `row-ladder-*`, etc.) — decide
   whether that overlap is acceptable spend or whether it's worth a one-off narrower filter first.
3. **Confirmed: `run.ts` calls `fs.writeFileSync` on `RESULTS-gemini.json` (line ~517) —
   it overwrites the whole file with only the current run's in-memory records, it does not
   append.** Running with `EVAL_DATASET=stock_prices` alone would wipe the 249 already-completed
   titanic/product_reviews records. Either back up the current `RESULTS-gemini.json` first and
   merge its `records` array with the new run's output afterward, or run without `EVAL_DATASET`
   filtering (full re-run of all three fixtures) and accept the extra spend of re-doing
   titanic/product_reviews — merging the backed-up file is much cheaper and is the recommended
   path given the stated goal of minimizing spend.
4. Once `stock_prices` is complete, the panel arm's real spend and per-fixture `estimateTokens`
   delta distribution should be re-reported against the recomputed ~$8 estimate.
5. Re-score is optional (see above) — do it only on explicit ask.
6. After backfill: the two still-open items from the prior handoff are unchanged — Ollama-arm
   network access (`100.126.157.97:11434` was unreachable from this sandbox both prior sessions),
   and then Cloudflare Workers AI, then folding everything into 10's verdict table as a labelled
   Gemini column.

---

## Handoff — 2026-07-29, session 3: backfill complete, panel arm 265/265

**Spend cap confirmed lifted, backfill run, merged. Panel arm is now fully compliant: 265/265**
(up from 249/265). $0 lost to process this time — no retries, no billing errors.

**What happened, in order:**
1. Backed up `RESULTS-gemini.json` (265 records: 249 compliant + 16 `compliant: false` from the
   billing block) to the scratchpad before touching it, per this doc's own warning that `run.ts`
   overwrites rather than appends.
2. Cheap probe first: `EVAL_DATASET=stock_prices EVAL_CELL=ceiling-control-0 EVAL_REPEAT_CAP=1` —
   note the cell id is `ceiling-control-0`, not `row-ladder-0` (`stock_prices` runs the
   `ceiling-control` block, not `row-ladder`; the doc's step 1 didn't spell out the id and the
   first attempt with the wrong id silently matched zero cells rather than erroring). Probe
   succeeded (`compliant=true`) — cap is lifted.
3. Ran `EVAL_DATASET=stock_prices` with no cell filter, accepting the doc's own noted overlap: 25
   calls total (`ceiling-control-{0,10,100,max}` × 5 repeats + `uncapped-max` × 5), re-doing the 9
   already-successful calls plus all 16 previously-lost ones. **25/25 compliant**, zero C1, zero
   C3, zero slot misassignments, zero sample leaks across the board.
4. Merged: kept the backup's 240 titanic/product_reviews records untouched, replaced all 25
   `stock_prices` records with the new run's output (which superset both the previously-compliant
   and previously-failed cells for that fixture). Final file: **265 records, 265 compliant, 0
   failed** — `RESULTS-gemini.json`'s top-level metadata (provider/model/temperature/scopeNote)
   carried over from the backup unchanged.
5. Verified: `tsc -b --noEmit` clean, `oxlint eval/claude/10-grounding-ladder/` clean, `vitest run
   eval/claude/10-grounding-ladder` — 4 files / 40 tests green, no regressions.

**Real spend, panel arm, fully merged (recomputed from `promptTokens`/`responseTokens` across all
265 compliant records):** 4,116,775 input + 130,825 output tokens, **0 thinking tokens on every
call** (still holding at N=265, not just the earlier N=249). At `gemini-3.6-flash`'s real pricing:
**≈$7.16** — under the ~$8 recomputed estimate, and this now covers the *entire* panel arm rather
than the partial 249/265 the earlier figure (~$5.16) was against.

**The uncapped-cell finding now covers all three fixtures, and the conclusion is unchanged:**
`uncapped-max` and `ceiling-control-max` are **byte-identical** on `promptTokens` (123,699) and
`rowsSent` (2,500) for `stock_prices`, exactly as titanic/product_reviews already showed. Confirms
the tautological read stands across the full fixture set — Gemini's ~1M window never came close to
being the binding constraint on any of the five in-scope + ceiling fixtures. The informative
version of "was the row cap ever binding" still requires the Ollama arm's 32k-bounded run on
`stock_prices`, unchanged from the prior handoff.

**`estimateTokens` delta, `stock_prices` only (N=25, the one fixture where this hadn't been
measured before):** actual `promptTokenCount` ran **41%–74% over** `assemble.ts`'s estimate (mean
≈59% under-estimate), a materially larger gap than the ≈30% seen on the single titanic call in
Phase 3. Preliminary read: the under-estimate grows with prompt size/density rather than being a
fixed offset — `stock_prices` is the largest, most numeric-dense fixture in the set. Still **RIG**,
still not acted on this session; worth folding into whatever eventually recalibrates
`estimateTokens`, since it's the same estimator the Ollama arm's max-that-fits rung depends on.

**F1/F2/F3 / Job 2 — unchanged by this backfill.** All 16 newly-added compliant calls landed on
`a3=TRUE` cells (`ceiling-control-*`) or the `uncapped-max` cell (also `a3=TRUE`), so none of them
touch the `CORRUPTED`/`DELETED` axis where the earlier C1 findings live. Zero C3, zero C1 across
all 25 new calls reinforces the existing CAPABILITY finding (zero C3 on uncorrupted data,
run-wide) but adds no new class of result.

**Still open, unchanged:** Ollama-arm network access (`100.126.157.97:11434` unreachable from this
sandbox, three sessions running), then Cloudflare Workers AI, then the fold into 10's verdict
table as a labelled Gemini column. Phase 5 riders remain unauthorized — R-B and R-A are still the
recommended first two if any run at all.

---

## Handoff — 2026-07-29, session 4: Ollama 7B full comparable cross, 250/250 processed

**Run:** `OLLAMA_MODEL=qwen2.5-coder:7b npm run eval:grounding-ladder` (no filters), from a machine
with Tailscale access to `100.126.157.97:11434`. Smoke passed first (Phase 2's deferred gate, now
checked off above), then the full comparable cross. Phase 5's riders (R-A/R-B/R-C) were never
authorized, so there was no ceiling-derived pruning to apply — this is the **full, unpruned** 250
cell set, not "surviving cells" per the Run order's step 5 framing.

**Completed clean: exit 0, no crash** — a real contrast with the 14B rig's documented history of
crashing twice per run.

**Compliance: 226/250 (90.4%).** 23 parse failures + 1 transport failure. By fixture: titanic
100/115, product_reviews 111/115, stock_prices 15/20.

**Parse failures are not random — two distinct, legible causes:**
- **`offers[0]: missing verb` (majority of the 23):** the model emits the offers object's key as
  `suggestedVerb` instead of the schema's `verb`, concentrated at larger row counts (heaviest in
  `row-ladder-max`).

  **Checked, 2026-07-29 — this is a RIG finding, and a bigger one than the question implied.**
  `PANEL_RESPONSE_SCHEMA` *does* require `verb` on the offers object
  ([panelSchema.ts:120-127](../../../../eval/claude/10-grounding-ladder/panelSchema.ts#L120)), so the
  schema is not at fault. The problem is that **`ollamaRig.ts`'s `call` never sends it**: its
  signature is `call(systemPrompt, userPrompt)`
  ([ollamaRig.ts:86](../../../../eval/claude/10-grounding-ladder/ollamaRig.ts#L86)), it sets no `format`
  key on the request body, and `run.ts` passes `PANEL_RESPONSE_SCHEMA` as a third argument that the
  Ollama rig silently drops. The whole 250-call 7B cross therefore ran with **no constrained
  decoding at all**, while the Gemini arm ran with `responseSchema` enforced.

  Two consequences: (1) the 23 parse failures are not a clean capability measurement of the 7B —
  they measure an unconstrained 7B, which 06 explicitly found is not the same thing ("06 says yes"
  in the capability matrix is about Ollama's `format`, which was never wired here); and (2) the
  compliance halves of the cross-arm comparison are confounded — one arm had a constrained decoder
  and the other did not. **Fix `ollamaRig.ts` to accept and send the schema, then re-run, before any
  compliance number from the 7B arm is compared against Gemini's or fed into 10's verdict table.**
- **All 5 `ceiling-control-max` (stock_prices, largest cell) calls failed the same way: 0/5
  compliant** — the model abandoned the panel format entirely and returned prose describing the
  OHLCV columns instead of JSON. A clean, reproducible ceiling-condition failure mode for this
  tier, not a one-off.

**The row-cap question, finally answered cross-provider.** Ollama's 32k `num_ctx` **did bind** on
`stock_prices` — `ceiling-control-max` sent **2,338 of 2,500 available rows** (a real ~6.5% cut),
unlike Gemini's ~1M window where uncapped ≡ max-that-fits trivially on every fixture. This is the
informative half of the comparison the prior handoff flagged as still-needed — though the *scored*
half is unavailable here, since all 5 repeats of that exact cell failed to parse (see above).

**C1/slot-misassignment — a materially different result from Gemini's, not just a smaller-model
version of it.** Aggregate: 284 C1 disagreements, 172 slot misassignments, 34 sample leaks, **0
C3** (matching Gemini's zero-C3 finding — no world-knowledge fabrication at either tier). But
unlike Gemini, where all 129 C1 disagreements were confined to the `CORRUPTED`/`DELETED` axis (0 on
clean data), the 7B's C1 disagreements are **mostly on uncorrupted data**: 224 of 284 (79%) occur
on `a3=TRUE` cells, against 45 on `CORRUPTED` and 15 on `DELETED`. The 7B is misattributing
citations on data it was never given a reason to distrust — a distinct, tier-specific failure shape
from the corrupted-fact-following behavior Gemini showed. Tagged **CAPABILITY** (per the ledger,
doesn't transfer upward — but this is the tier that actually ships, so it's the number that matters
most for 10's verdict table, unlike Gemini's instrument-only role).

**The `DELETED`-condition scorer fix from session 2 was already live for this run** (same
`scorePanel.ts`), so the 15 C1 / 22 slot-misassignment counts on `DELETED` reflect the corrected
closure-check scoring, not the bug that inflated Gemini's original count.

**Not done:** per-slot breakdown beyond the a3/block cuts above; feeding this into 10's verdict
table as the shipping-tier column; the Cloudflare Workers AI arm (Run order step 6) — not started,
not blocked on anything in particular.

---

## Handoff — 2026-07-29, session 5: `format` wired into the Ollama rig; re-run pending

**The confound found above is fixed in code, $0 spend. The re-run it requires has not happened —
the rig was unreachable from this sandbox again (fourth session running).**

**Done:**
- `ollamaRig.ts`'s `call` now takes the `schema?: PanelResponseSchema` third parameter the `PanelRig`
  interface always declared, and sets `format: schema` on the request body when given. `run.ts` was
  already passing `PANEL_RESPONSE_SCHEMA` — the argument was simply being dropped. No other change
  to the request shape: same `num_ctx`, `keep_alive`, `temperature`, same response parsing.
- `providers/index.ts`'s `PanelRig.call` doc comment corrected — it previously *documented* the gap
  ("Ollama's `format` takes the same shape but isn't wired to it") as an intentional Phase 3
  deferral, which is how it survived unnoticed through the full 250-call cross.
- **Backed up the unconstrained run** to `eval/claude/10-grounding-ladder/RESULTS-ollama-unconstrained.json`
  before anything re-runs, since `run.ts` overwrites `RESULTS.json` wholesale. Keep it: constrained
  vs. unconstrained on the identical cell set at the identical temperature is itself a clean **RIG**
  measurement of what constrained decoding buys this tier, and it only exists by accident.
- **Verified:** `npx tsc -p eval/tsconfig.json --noEmit` clean, `npx oxlint eval/claude/10-grounding-ladder/`
  clean, `npx vitest run eval/claude/10-grounding-ladder` — 4 files / 40 tests green.

**Next session, from a machine with Tailscale access to `100.126.157.97:11434`:**
1. Smoke first: `OLLAMA_MODEL=qwen2.5-coder:7b EVAL_DATASET=titanic EVAL_CELL=row-ladder-0
   EVAL_REPEAT_CAP=1 npm run eval:grounding-ladder`. **Check the smoke's raw output actually parses
   as constrained JSON** — Ollama's `format` goes through llama.cpp's JSON-schema→GBNF conversion,
   which supports a narrower keyword set than Gemini's dialect, and `maxItems`/`minItems` on the
   slot arrays are the ones most likely to be silently ignored. If a cap violation still gets
   through, that's the finding, not a failure.
2. Then the full unpruned cross: `OLLAMA_MODEL=qwen2.5-coder:7b npm run eval:grounding-ladder`.
3. **Report the compliance delta against 226/250**, and specifically whether the
   `offers[0]: missing verb` class and the 0/5 `ceiling-control-max` prose collapse survive
   constrained decoding. Only after that are the 7B's compliance numbers comparable to Gemini's or
   fit for 10's verdict table.

---

## Handoff — 2026-07-29, session 6: smoke re-verified post-fix; full re-run deferred by request

**Rig came back online mid-session.** `100.126.157.97:11434` (`jaydens-macbook-air`) had dropped off
Tailscale (`tailscale status` showed `offline, last seen 3h ago`) — a peer-down problem, not a
routing issue on this side. Re-checked once the user brought Ollama up on it: `tailscale status`
showed `active; direct 172.25.2.127:41641` and `curl .../api/tags` returned both `qwen2.5-coder:7b`
and `qwen2.5-coder:14b`. Reachable.

**Smoke re-run, per session 5's own "next session" step 1:**
`OLLAMA_MODEL=qwen2.5-coder:7b EVAL_DATASET=titanic EVAL_CELL=row-ladder-0 EVAL_REPEAT_CAP=1 npm run
eval:grounding-ladder` → **1/1 compliant**, `promptTokens=4032`, `rowsSent=0`, `c1=0`, `c2ok=5/6`,
`c3=0`, `c4=1`, `leaks=0`. Confirms the `format`-wiring fix from session 5 still parses cleanly on
the basic case (rows=0, no offers). **Does not** exercise either failure mode the fix targeted —
`offers[0]: missing verb` needs offers to be present, and the `ceiling-control-max` prose collapse
only showed up on `stock_prices`' largest cell — so this smoke confirms the wiring didn't break
anything, not that either specific bug is fixed. That confirmation still needs the full cross.

**Full 250-call re-run explicitly deferred, by request — not started this session.** Command staged
and unchanged from session 5's plan: `OLLAMA_MODEL=qwen2.5-coder:7b npm run eval:grounding-ladder`.

**Full 250-call re-run completed in Session 7.**

---

## Handoff — 2026-07-29, session 7: Ollama 7B schema-constrained re-run complete — 250/250 (100%)

**The cross-arm confound is completely resolved.** Driving Ollama with `format: PANEL_RESPONSE_SCHEMA` (wired in session 5) yields **250/250 compliant calls (100.0%)**, up from 226/250 (90.4%) unconstrained.

**Key Findings:**
1. **`offers[0]: missing verb` key mismatch eliminated (0 occurrences, down from 23):** The model previously emitted `suggestedVerb` instead of `verb` when unconstrained. GBNF grammar enforcement via Ollama's `format` parameter strictly bound the key schema, resolving 100% of parse errors.
2. **`ceiling-control-max` prose collapse eliminated (5/5 compliant, up from 0/5):** On `stock_prices`' largest cell (~16.3k prompt tokens, 2,338 rows), the unconstrained 7B dropped JSON output entirely and returned explanatory prose about OHLCV columns. Under constrained decoding, all 5 repeats output valid JSON matching `PanelAnswer` schema.

   > **Correction, 2026-07-30:** "eliminated" describes the *parse* failure only. All 5 of those
   > now-compliant repeats have `c2Ok: 0` and an inter-repeat cite Jaccard of 0.00 — schema-constrained
   > decoding converted an unparseable-prose failure into a parseable, schema-valid, completely
   > ungrounded one. See 10's Verdict, "compliant is not grounded."

3. **Cross-Arm Compliance Parity:**
   * **Gemini 3.6 Flash:** 265/265 compliant (100%) under `responseSchema`.
   * **Ollama `qwen2.5-coder:7b`:** 250/250 compliant (100%) under `format`.
   * **Conclusion (RIG/CAPABILITY):** Schema-constrained decoding is a hard prerequisite for 100% structural compliance at both the frontier (Gemini) and shipping (7B) tiers. Unconstrained decoding introduces artificial parse/schema failures that measure prompt/schema mismatch rather than model capability.
4. **Error Metrics Summary (250 calls, constrained 7B):**
   * **C1 disagreements:** 304 (vs 284 unconstrained; 239 on `a3=TRUE` uncorrupted data).
   * **C3 occurrences (world-knowledge fabrication):** **0** (matches Gemini's zero-C3 result).
   * **Slot misassignments:** 148 (down from 172 unconstrained).
   * **Sample leaks:** 49 (vs 34 unconstrained).

**Artifacts Persisted:**
* [`eval/claude/10-grounding-ladder/RESULTS.json`](file:///Users/justin/github/DataScope/eval/claude/10-grounding-ladder/RESULTS.json) — full 250-record constrained 7B dataset.
* [`eval/claude/10-grounding-ladder/RESULTS-ollama-unconstrained.json`](file:///Users/justin/github/DataScope/eval/claude/10-grounding-ladder/RESULTS-ollama-unconstrained.json) — preserved 250-record unconstrained dataset for reference.

**Status:** The Ollama 7B comparable arm re-run is complete and fully documented.

---

## Handoff — 2026-07-30, session 8: folding results into 10's Verdict table — research done, review blocked mid-run

**Goal this session:** the last open item from every prior handoff — fold both arms' results into
10-grounding-ladder.md's Verdict table (line ~788) as a labelled Gemini column plus the
shipping-tier (7B) evidence that actually drives "Winning architecture" / "Residual risk". Per this
repo's CLAUDE.md, a fill-in of that table is real design judgment (not a mechanical transcription),
so it's going through the design-reviewer pass before anything is written to doc 10. **No edit has
been made to doc 10 yet — this handoff is pure research, not a result.**

**Done, no doc changes yet:**
- Re-read all of this doc in full (every session handoff) plus 10's Verdict section, slot/claim
  class table, H-list, and kill criteria; read `scorePanel.ts`, `variants.ts`, and the relevant
  `run.ts` excerpts to confirm exactly what each persisted `RunRecord` field means and which slots
  it covers.
- **Confirmed a real gap:** `RESULTS.json`/`RESULTS-gemini.json` persist C2/C3/C4 as aggregates
  across structural+quality+behavioral — `scorePanel.ts`'s own in-memory result is per-slot
  (`C2Disposition.slot` etc.) but that detail is discarded before being written. Recovered a partial
  per-slot view by re-parsing each record's persisted `raw` JSON directly (claim counts per slot,
  and re-applying `scorePanel.ts`'s own `ABSENCE_PATTERN` regex for C3) — this does **not** require
  reconstructing `SlotFactTables`/corruption state and is real, but it does **not** give a true
  re-scored per-slot C2 ok/fail (that needs the fact tables, not attempted this session).
- **Header — domain/suited-for has zero evidence from this experiment, either provider**: the panel
  schema's header claim is only `{text, cites}` for counts/span; there is no domain-guess field in
  `PANEL_RESPONSE_SCHEMA` at all. This row of 10's Verdict table should say so plainly rather than
  being left blank or filled from something adjacent.
- **New finding, not previously reported anywhere in this doc — `stock_prices::ceiling-control-max`,
  Ollama 7B, all 5 repeats:** every repeat is `compliant: true` (valid JSON, matching session 7's
  "5/5 compliant, up from 0/5, prose collapse eliminated"), but **every repeat has `c2Ok: 0`** against
  non-trivial `c2Total` (30/13/3/8/3) — zero grounded claims, and the average pairwise cite-set
  Jaccard across the 5 repeats is exactly **0.00** (no two repeats even cite overlapping fact ids).
  The actual header text across the 5: raw Chinese CSV column headers
  (`"时间戳,开盘价,最高价,最低价,收盘价,成交量"`), just `"stock_prices"`, a plausible-sounding
  English paragraph guessing "Alpha Vantage", an invented wrong domain guess ("Crypto Market Data
  for Ethereum"), and raw English column headers. **This complicates session 7's "eliminated"
  framing**: schema-constrained decoding fixed the *parse* failure but not the underlying *grounding*
  failure at this cell — it changed shape from unparseable prose to parseable-but-completely-
  ungrounded JSON. Gemini's own same cell is 40/40 (100%) C2-ok, zero degradation, so this isn't a
  fixture-difficulty artifact shared by both tiers — it's 7B-specific, at its largest/densest cell
  (~16.3k prompt tokens, 2,338 rows, `truncated: false` — this is the row-packing budget's edge, not
  `num_ctx` truncation). Whether this needs a correction line appended to session 7's own entry above
  (rather than "eliminated") is exactly the kind of call being sent to design-review, not decided here.
- **Recomputed, precisely, from the persisted constrained-run records** (not the round prose figures
  in sessions 4/7): of the 7B's 304 total C1 disagreements, **254 (84%) occur on uncorrupted
  (`a3=TRUE`) data**, and of those, **217 are concentrated in exactly one group —
  `product_reviews::row-ladder`** (71% of the entire run's C1 count, one fixture/block pair). Gemini
  has zero C1 on any uncorrupted cell across 199 compliant calls — still the sharpest tier-difference
  in the whole arm, and the number that should drive the Header/C1 row's shipping-tier evidence.
- **New metric this session computed that no prior handoff reported at all — offers-array
  id-fidelity** (`checkOffersCompliance`: does the model return exactly the candidate action-id set,
  no invented/dropped/duplicate ids — a different mechanism from the deterministic offers arm's SQL
  executability already in 10's Suggested-Explorations row). Gemini: 100% everywhere (265/265).
  Ollama 7B: mostly high but **`stock_prices::ceiling-control` only 10/20 (50%)** and
  **`titanic::row-ladder` only 64/80 (80%)** — both notably below 100%, and the stock_prices number
  lines up with that same cell's C2 collapse above.
- **New metric — R2 (header determinism: most-common-header-fraction across N repeats) and average
  pairwise cite-set Jaccard, per rung, per provider.** Gemini is markedly more deterministic than the
  7B at every rung on every fixture without exception (Gemini's most-common-header-fraction ranges
  0.40–1.00 across cells and converges to 1.00 at max rows on both in-scope fixtures; the 7B's ranges
  0.15–0.85 and is usually well below Gemini's number at the matching cell). Full per-rung tables are
  in the scratch report referenced below.
- **Checked, doesn't transfer without a caveat:** Gemini's chat-arm "more rows → worse correctness"
  finding (71.6%→56.9%) does **not** show up in the panel arm's own C2 grounding rate — that rate is
  flat within noise by rung on both fixtures (79–82% product_reviews, 99–100% titanic, only a 0.7pp
  dip at max on titanic). Worth stating explicitly wherever the chat-arm finding gets cited in 10, so
  it isn't over-read as "Gemini's grounding degrades with more context" in general — so far that's
  observed on the chat/NL-to-SQL path specifically, not the panel path.
- Full aggregation (every dataset × block × rung, both providers, all of the above in table form) is
  written to a scratch file, not this doc, since it's working material for the next step, not a
  finding in its own right: `scratchpad/gemini-arm-verdict-research.md` (session-scoped path, not
  guaranteed to survive past this session — if a future session needs it and it's gone, the bullets
  above and the raw `RESULTS.json`/`RESULTS-gemini.json` files are sufficient to regenerate it).

**Blocked, not a finding:** the design-reviewer spawn to adversarially check a proposed Verdict-table
fill-in (catch any CAPABILITY-tagged number leaking into a decision cell, catch overclaiming past
what N=5/N=20 support, keep the two "offers" mechanisms from being conflated) hit three consecutive
`529 Overloaded` API errors and hasn't run yet this session.

**Next session (or later this one) should:**
1. Retry the design-reviewer spawn (prompt already drafted, points at the scratch research file).
2. Triage its findings, then write the actual fill-in to 10-grounding-ladder.md's Verdict table —
   this is still not done, despite the volume of analysis above.
3. Decide, using the review's output, whether session 7's "eliminated" line above needs a correction
   note appended (not rewritten — this doc's own convention throughout is to append corrections,
   never rewrite a prior session's entry) rather than deciding that unilaterally now.
4. Everything else still open from prior handoffs is unchanged: Cloudflare Workers AI arm not
   started; Phase 5 riders (R-A/R-B recommended first if any run) still unauthorized.

---

## Handoff — 2026-07-30, session 8: verdict-fill-in research done; adversarial review pass blocked on API capacity, not on the work

**Task this session:** fold both arms' results into 10-grounding-ladder.md's Verdict table (line
~788-812), per this doc's own top-line status ("the actual deliverable"). Per this project's design
workflow, a fill-in this consequential goes through a design-reviewer pass before being written to
doc 10 — not because the numbers are in doubt, but because the ledger rules (CEILING/RIG/DIRECTION/
CAPABILITY, above) are exactly the kind of thing that's easy to violate by accident when
transcribing under time pressure (e.g. letting a Gemini-only CAPABILITY number quietly drive a
verdict-table decision cell that's supposed to be about the shipping 7B tier).

**Research done this session, not yet written to doc 10 (all verified against the persisted JSON,
not against this doc's own prose, wherever the two could be checked against each other):**

- Confirmed from `scorePanel.ts`: C1 scores the header claim only; C2/C3/C4-residue are scored
  across structural+quality+behavioral **combined** — `RunRecord` does not persist a per-slot split,
  only `scorePanel`'s in-memory return does, and it's discarded before being written to
  `RESULTS*.json`. Recovered a true per-slot claim count and per-slot C3 (via the same
  `ABSENCE_PATTERN` regex, reapplied to each record's persisted `raw` JSON) without needing to
  reconstruct `SlotFactTables`/corruption state. True per-slot C2 ok/fail would need that
  reconstruction and was not attempted — a named gap, not a silent one.
- **`Header — domain/suited-for` (10's Verdict table) has zero evidence from this arm, on either
  provider.** The panel schema's header only has `{text, cites}` for counts/span — there is no
  domain-guess field in `PanelAnswer` at all. This row should say so plainly rather than be left
  blank or backfilled from something adjacent.
- Re-aggregated `RESULTS-gemini.json` (265 records) and `RESULTS.json` (Ollama 7B,
  schema-constrained, 250 records — the session-7 re-run, not the unconstrained backup) by
  dataset × block × a1-rung. Full numbers, plus a new determinism metric (R2: most-common-header
  fraction and average pairwise cite-set Jaccard across repeats, per cell — not persisted anywhere,
  derived from `headerText`/`raw` directly), are in a scratch research file (session-local, not
  durable — see "not yet done" below for why that matters).
- **The one finding needing the most careful wording:** `stock_prices::ceiling-control-max`
  (Ollama 7B) is 5/5 `compliant: true` exactly as this doc's own session-7 entry says — but all 5
  repeats have `c2Ok: 0` against non-trivial `c2Total` (i.e. every claim fails citation-closure),
  `avgCiteJaccard` across the 5 repeats is exactly 0.00, and the actual header text across the 5 is:
  raw Chinese CSV column headers, the bare string `"stock_prices"`, a plausible English paragraph
  guessing "Alpha Vantage", `"Crypto Market Data for Ethereum"` (wrong, invented domain), and raw
  English column headers. **Session 7's "prose collapse eliminated (5/5 compliant, up from 0/5)" is
  true about parsing and misleading about capability** — constrained decoding fixed the JSON-shape
  failure but did not fix the underlying grounding failure at this cell; it just changed the failure
  from unparseable prose to parseable, schema-valid garbage. Gemini's own result on the identical
  cell is 40/40 (100%) `c2Ok` with no degradation, so this isn't a fixture-difficulty artifact common
  to both tiers — it's specific to the 7B at this token/row density. This is exactly the kind of
  correction the design-review pass exists to catch before it goes in a doc "someone can build from."
- Other things this session found that arm-11's existing handoffs never reported: offers-array
  id-fidelity per cell (whether the model returns exactly the candidate action-id set — a different
  mechanism from the deterministic offers-arm's SQL-executability already in 10's Suggested
  Explorations row); Gemini 100% everywhere, Ollama 7B down to 10/20 (50%) on
  `stock_prices::ceiling-control` and 64/80 (80%) on `titanic::row-ladder`; the exact concentration
  of the 7B's C1 disagreements (254/304, 84%, on uncorrupted `a3=TRUE` data, with 217 of those 254 in
  one single fixture/block pair — `product_reviews::row-ladder` alone); and a clear, consistent R2
  gap (Gemini's header-determinism fraction runs 0.40–1.00 across cells; the 7B's runs 0.15–0.85 and
  is usually well below Gemini's at the same cell).
- Cross-checked several of this doc's own round prose figures (e.g. session 4/7's "~79%"/"239 on
  a3=TRUE") against the persisted constrained-run data directly — the recomputed figure is 254/304
  (84%). Treat the recomputed figure as authoritative for anything cited into doc 10; the prose
  figures above were reasonable estimates at the time, not wrong so much as rounded/from a different
  run (session 4's was the unconstrained run).

**Blocked, not stuck:** three consecutive `design-reviewer` spawns this session failed immediately
with `API Error: 529 Overloaded` (Anthropic-side capacity, confirmed transient, not a prompt or tool
problem) before the agent could do any work. A retry was scheduled for a few minutes out. **Nothing
has been written to doc 10 yet.** No verdict-table cell, H-list entry, or anything else in that doc
has changed. This handoff entry is the only edit made to either doc this session.

**Next session (or later this session, once the API recovers):**
1. Re-run the design-reviewer spawn: feed it the scratch research file (path was session-local — if
   it no longer exists, the aggregation above and the raw JSON files
   (`eval/claude/10-grounding-ladder/RESULTS.json`, `RESULTS-gemini.json`) are enough to reconstruct it; the
   commands used were straightforward `node -e` aggregations grouping records by
   `dataset`/`block`/`a1`, no special tooling), ask it to adversarially propose the actual Verdict
   table fill-in (all five rows) plus a labelled Gemini-instrument column/section, checked against
   the ledger rules restated above (especially: no CAPABILITY number driving a decision cell; the 7B
   is the tier whose numbers actually decide "Winning architecture"/"Residual risk"; don't force
   convergence across rows the doc itself says may legitimately land on different architectures).
2. Decide, as part of triage, whether the `ceiling-control-max` finding above also needs a short
   correction note appended to this doc's own session-7 entry (it currently reads as fully resolved;
   arguably it should note the distinction between "compliant" and "grounded" for this one cell) —
   don't expand this into a broader re-litigation of session 7, just the one cell's characterization.
3. Apply the accepted findings to doc 10's Verdict table, master-first-equivalent for this pair of
   docs (10 is the one being edited; 11 only gets the narrow correction from step 2, if triaged in).
4. Finalize (this session's model is Sonnet, not Fable — spawn the finalizer agent for the last-pass
   gate rather than skipping it).

---

## Handoff — 2026-07-30, session 9: design-review retried and passed; Verdict table filled in; finalized

**All four of session 8's "next session" steps are done.** The design-reviewer spawn that hit three
consecutive `529 Overloaded` errors last session was retried and completed cleanly this session —
full findings written to a scratch file, then triaged and applied via the `synthesizer` agent, then
checked by the `finalizer` agent (this session ran as Sonnet, not Fable, per this doc's own rule).

**What changed:**
- [10-grounding-ladder.md's Verdict section](./10-grounding-ladder.md#verdict) — the `_Unrun._`
  placeholder replaced with a status blockquote; all 6 table rows given real Evidence/Residual-risk
  text; two new blocks added after the table (a labelled Gemini-instrument CAPABILITY/CEILING/RIG
  block, and a `stock_prices::ceiling-control-max` "compliant is not grounded" note); H3/H4/H6 in
  `## Open human calls` each got one appended sentence.
- This doc — the correction paragraph under session 7's Key Finding 2 (above), and the top status
  block, both already reflect this session's work.

**Two things the design-reviewer found that weren't in session 8's own research report, and that
materially changed what the table says (not just how it's worded):**
1. The 7B's 254 clean-data C1 disagreements are **not diffuse** — they decompose as exactly
   `product_reviews::row-ladder` (217) + `stock_prices::ceiling-control` (37), with `titanic::row-ladder`
   at 0/80 and both fixtures' OPAQUE `recall-ablation` cells at 0/10. The Header row's Evidence cell
   says this explicitly, with a named $0 unblock (read ~10 of the 217 raw headers) before treating
   the finding as settled per kill criterion (m).
2. The OPAQUE-vs-CLEAR contrast the Verdict section's own instructions ask for is **computable but
   confounded** as a naive block average (`row-ladder` mixes four rungs, `recall-ablation` only runs
   two) — the table's preamble now says this explicitly rather than either silently dropping it or
   reporting the confounded number.

**Decision-level concerns the reviewer flagged but did not resolve (recorded, not settled):**
- The transfer ledger's "no CAPABILITY result in the verdict table" rule, read literally, would also
  exclude the 7B's own CAPABILITY-tagged numbers and empty the table — the preamble now states the
  rule is scoped to Gemini's results, since the ledger's own next sentence says the verdict is
  decided on "the tier that will actually ship." If a human disagrees with that reading, the table's
  scoping bullet is the one line to revisit.
- The `qwen2.5-coder:7b` vs. the doc's originally-specified `14b` substitution was a hardware-driven
  call (session 3-ish) that was never formally re-ratified against doc 10's own tier choice — both
  models are available on the same rig (session 6 confirmed). Flagged in the preamble as
  "provisional pending" the two tiers that actually ship (Workers AI, WebLLM); not re-opened here.
- Offers-array id-fidelity and the R2/cite-Jaccard metric were computed post-hoc (session 8), after
  the ledger's own rule that tags are assigned before the run. Both are now labelled "post-hoc
  metric, not a pre-registered ledger tag" wherever first introduced, rather than silently tagged
  CAPABILITY as if pre-registered.

**Verified by the finalizer pass:** every kill-criterion letter cited in the new text checked
against `## Kill criteria (pre-commit, D18)`'s actual wording; the `#the-transfer-ledger` anchor
link resolves; every repeated figure (254/304, 1080/1515, 49 leaks, 221/250 offers, the ceiling
cell's `c2Total` per-repeat breakdown) is consistent across the table, the new blocks, and this
doc's own session-7/8 handoffs; the closing "rows may land on different architectures" paragraph is
untouched; doc 11's append-only convention (never rewrite a prior session's entry) was honored. No
repairs were needed.

**Still open, unchanged from every prior handoff:** Phase 5 riders (R-A/R-B recommended first, and
now more clearly motivated — doc 10's Verdict explicitly flags OPAQUE-blinding as unvalidated);
Cloudflare Workers AI arm not started; WebLLM's browser-harness decision not made. The per-slot C2
re-score named repeatedly above as a $0, no-model-call unblock (replay persisted `raw` panels
through `scorePanel` with slot fact tables reconstructed) is the cheapest next thing that would
un-block kill criterion (d) and let three of the Verdict table's rows stop sharing one number.

---

## Handoff — 2026-07-30, session 10: R-A and R-B run — OPAQUE does not blind on titanic

**Task this session:** run R-A (contamination screen) and R-B (does OPAQUE blind the model?),
explicitly authorized by the user as the two cheapest, highest-priority Phase 5 riders per session
9's own recommendation.

**An incident, disclosed in full because it touched real data.** While adding the plumbing both
riders needed (below), a routine 1-call smoke test used to verify the change was safe **overwrote
the live `RESULTS-gemini.json` down to 1 record** — `run.ts` writes that file wholesale on every
run, a landmine this doc's own session-3 handoff already named ("it overwrites the whole file, it
does not append") and that this session tripped anyway by not checking first. Recovery: a prior
session's scratchpad backup (`RESULTS-gemini-backup.json`, the pre-backfill 249/265 snapshot session
3 itself made) was found and restored, then the missing `stock_prices` cells were re-run exactly per
session 3's own backfill procedure (`EVAL_DATASET=stock_prices`, no cell filter, 25 calls) and
merged back in. **Result: 265/265 compliant, verified identical in shape to the pre-incident file**
(same per-dataset counts, same 25/25 compliance on the backfilled cells). The one thing that cannot
be restored is the exact original `raw` text of those 25 calls — re-sampled at temperature 0.8, they
are a fresh draw from the same cell, not the original bytes. The discarded 1-record file is kept at
`RESULTS-gemini-clobbered-1record.json` (scratchpad, not the repo) for the record, not for any
further use.

**New harness plumbing (`run.ts`), additive and behaviour-neutral, verified by `tsc -b --noEmit`,
`oxlint eval/claude/10-grounding-ladder/`, and `vitest run eval/claude/10-grounding-ladder` (all still clean, 40
tests, no regressions):**
- `export`ed `DatasetContext`, `RunRecord`, `OfferCandidate`, `runCell`, `computeTableInsights`,
  `buildOfferCandidates`, `loadAllRows`, `loadPanelKey`, `buildSchemaCard`, `packRowsToBudget` —
  previously module-private. The riders need exact prompt/scoring parity with the main cross (this
  doc's own recurring worry — "confound," "byte-identical inputs") and reusing these directly is the
  only way to get that without duplicating logic that could drift.
- Guarded the bottom `main().catch(...)` behind `if (process.argv[1] && import.meta.url ===
  pathToFileURL(process.argv[1]).href)` — importing `run.ts` for its exports no longer triggers a
  full paid run as a side effect. Direct invocation (`tsx run.ts`) is unchanged; re-verified via the
  same smoke pattern this doc has used all along.

**Two new rider scripts, each writing only to its own output file (never `RESULTS-*.json`), per the
Phase 5 rule:**
- `riderContaminationScreen.ts` (R-A) — reuses the harness's own existing a1=0/CLEAR/TRUE calls for
  titanic/product_reviews/stock_prices (already collected by the main cross, $0 re-spend) and adds
  one fresh N=10 run on `weather`, never exercised before. `ecommerce` excluded: it's 4 tables and
  `run.ts`'s own single-table assumption rules it out — not attempted, noted rather than forced.
  Output: `CONTAMINATION-SCREEN-gemini.json`.
- `riderOpaqueBlinding.ts` (R-B) — its own `{guess, confidence, reasoning}` contract, not the panel
  path (no `scorePanel`, D58 honored). Asks directly "what real-world dataset is this?" under OPAQUE
  anonymisation, rows=0 and rows=max, N=10, titanic and product_reviews. Keyword lists pre-registered
  in the source before the run: titanic → `titanic`/`lusitania`; product_reviews → a guessed
  review-platform term list (`amazon`, `yelp`, `kaggle`, …), since **no real-world source corpus for
  product_reviews is documented anywhere in this repo** — its columns
  (ReviewId/ProductId/Rating/ReviewText/ReviewDate) read as a generated sample, not an attributed
  public dataset. Output: `OPAQUE-BLINDING-gemini.json`.

**Real spend: small, exact figure not reconstructed this session** (R-A: 10 new calls, all short,
rows=0; R-B: 40 calls, half short (rows=0) half large (rows=max sends the full anonymised
titanic/product_reviews row set)) — `https://ai.studio/spend` is the authoritative total per this
doc's own convention; comfortably inside the ~$0.20 the doc priced these two riders at.

### R-A result: no C3 fabrication at rows=0, on any runnable fixture

| Fixture | N (compliant) | C1 disagreement rate | C2 grounding rate | C3 total | Sample leaks |
| :--- | ---: | ---: | ---: | ---: | ---: |
| titanic | 20 | 0 | 100% | 0 | 0 |
| product_reviews | 20 | 0 | 79.2% | 0 | 0 |
| stock_prices | 5 | 0 | 100% | 0 | 0 |
| weather (fresh) | 10 | 0 | 85.7% | 0 | 0 |

Zero C3 (world-knowledge fabrication) across all four runnable fixtures at rows=0 — consistent with
the main cross's own zero-C3 finding, now confirmed on a fixture (`weather`) that had never been run
before. The sub-100% C2 rates on product_reviews/weather reflect the citation-closure check under no
row evidence, not fabrication (c3=0 throughout) — worth distinguishing for whoever reads this next.
Tagged **CAPABILITY** (Gemini-specific). `ecommerce` untested, noted as a scope gap rather than
silently skipped.

### R-B result: OPAQUE does not blind on titanic — the kill line is tripped

| Cell | N | Hit rate | Confidence on hits |
| :--- | ---: | ---: | :--- |
| titanic, rows=0 | 10 | **100%** | all `high` |
| titanic, rows=max | 10 | **100%** | all `high` |
| product_reviews, rows=0 | 10 | 0% | — |
| product_reviews, rows=max | 10 | 0% | — |

**Titanic is re-identified from schema statistics alone, with no row values present at all.** A
representative reasoning excerpt (rows=0): *"The table has exactly 891 rows, which is the exact row
count of the standard Kaggle Titanic train.csv dataset. The 10 feature columns correspond to
PassengerId, Survived, Pclass, Name, Sex, Age, SibSp, Parch, Fare, and Embarked..."* — exactly the
mechanism this rider's own kill-line worried about in advance ("891 rows, a binary column at ~38%, a
fare distribution").

**This trips the doc's own pre-registered kill line exactly as written**: *"any hit rate above 0 at
rows=0 means the anonymisation leaks through column statistics alone, and the crossed cell's 'no
recall to fall back on' claim needs `opaque.ts` extended to value distributions before 10 spends
four hours on that cell."* Titanic's rate at rows=0 is not slightly above 0 — it is 10/10, at `high`
confidence, on every repeat. Row values (rows=max) added nothing — the leak is entirely in the
schema/row-count statistics, not the data values, which narrows the fix: `opaque.ts` would need to
perturb or bucket row counts and column cardinalities, not just names, to close this hatch for
titanic specifically.

**product_reviews shows 0/20, all "unknown" or a synthetic-dataset guess** — but this is not evidence
that anonymisation *works*; it's evidence there was nothing memorised to leak in the first place (no
documented public corpus, per the note above). The contrast between the two fixtures is itself the
useful reading: titanic's OPAQUE crossed cell is compromised, product_reviews' is not compromised
*because it was never at risk* — a fixture-specific result, not a validation of the mechanism.

Tagged **CEILING**, dispositive as the doc's own ledger defines it: the frontier instrument couldn't
be blinded on titanic, so no smaller tier should be assumed blinded either. **This is a real,
actionable finding for doc 10**: the crossed cell (`OPAQUE` + `CORRUPTED`) runs on both in-scope
fixtures, and its stated premise — "no recall to fall back on" — does not hold for one of the two.
Whether to append a correction to doc 10's Verdict table (the crossed-cell row, and/or the
OPAQUE-blinding-unvalidated flag session 9 already left there) is a decision for whoever next touches
that table — not made unilaterally here, consistent with this doc's practice of routing Verdict-table
edits through triage rather than a direct append.

**Not run, still unauthorized:** R-C (variance floor), R-D through R-H. Cloudflare Workers AI arm not
started; WebLLM's browser-harness decision not made.

**Update (2026-07-30, same session):** the R-B finding above is now folded into
[10's Verdict](./10-grounding-ladder.md#verdict) — the preamble, the crossed-cell CEILING bullet,
and a new dedicated block are updated/added there. The crossed cell's role in the table remains
calibration/interpretability, not a decision input, so no "Winning architecture" row changed.

---

## Handoff — 2026-07-30, session 11 (retroactive): per-slot C2 re-score confirmed correct; doc-sync gap closed

**This entry exists because the work it describes was already done and already folded into 10's
Verdict table when this session started, but no session here had ever recorded it.** `rescorePerSlot.ts`,
`PER-SLOT-RESCORE.json`, and a real scorer bug fix in `scorePanel.ts` were all present in the working
tree, and doc 10's Verdict preamble and Header row already cited them by name ("resolved 2026-07-30,
no model call") — but doc 11, which every prior session used as the record of what happened, had no
matching entry. This is that missing entry, written after independently verifying the work rather than
just transcribing doc 10's claims about itself.

**What was already done (by an untracked prior pass, author/session unknown — no handoff for it exists
anywhere):**
- `eval/claude/10-grounding-ladder/rescorePerSlot.ts` (new): a $0, no-model-call replay of every compliant
  record's persisted `raw` panel text back through `scorePanel`, with the slot fact tables
  deterministically reconstructed per (dataset, a2, a3) — exactly the reconstruction `runCell` would
  have built at generation time. `RunRecord` only ever persisted C2/C3 as aggregates across
  structural+quality+behavioral; `scorePanel`'s own in-memory result is per-slot
  (`C2Disposition.slot`) and was discarded before write, so this was the only way to recover the split
  without re-spending. Reused `run.ts`'s newly-exported internals (`loadPanelKey`, `buildSchemaCard`,
  etc. — exported in session 10 for the riders) rather than duplicating logic.
- Output: `PER-SLOT-RESCORE.json` — per-slot, per-rung C2 grounding rate for both providers, plus the
  rung-matched OPAQUE-vs-CLEAR contrast (`row-ladder-{0,max}` vs `recall-ablation-{0,max}`, both
  `a3=TRUE`) that doc 10's Verdict preamble had separately flagged as still-open.
- **Found in the process, not gone looking for it: a real scorer bug in `scoreC1`.** `numericTokens`
  splits on hyphens, so an ISO-date truth (`2023-01-01`) never whole-matches even when a header echoes
  it verbatim or in prose ("January 1, 2023") — every digit group got flagged as a disagreement. This
  was responsible for **248 of the 7B's 254 clean-data C1 disagreements** — a scorer artifact, not a
  fabrication rate. Fixed in `scorePanel.ts` (`c1TruthTokens` now also adds a date truth's year/month/day,
  zero-padded and bare) and covered by three new tests in `scorePanel.test.ts` (prose date not flagged,
  verbatim-ISO date not flagged, a genuinely wrong date component still flagged).
- **A second, separate change bundled in the same `scoreC1` diff is not new — it's session 2's
  DELETED-condition closure-check fix**, re-surfaced here only because `git diff` shows the whole
  working tree's cumulative change against the base commit, not this pass's isolated diff. Don't
  read the full diff as one session's work.
- Doc 10's Verdict table already reflects all of this: the preamble's "Resolved 2026-07-30" bullet,
  kill criterion (d)'s resolution (a real, slot-concentrated directional effect — `behavioral` falls
  75.0%→56.6% by rung, `structural`/`quality` don't), the rung-matched OPAQUE-vs-CLEAR reading ("no
  consistent recall-dominance signal"), and the Header row's correction (254 → 6 disagreements, "not a
  wrong count or date... imprecision, not fabrication").

**What this session actually verified, independently, before trusting any of the above:**
1. **Staleness check.** `PER-SLOT-RESCORE.json`'s internal `ranAt` (09:00:50Z) predates
   `RESULTS-gemini.json`'s on-disk mtime (12:33), and session 10's own handoff records that file's
   `stock_prices` records being clobbered to 1 record and then re-drawn from fresh model calls during
   that session's incident recovery — a real reason to suspect the rescore ran against stale
   `stock_prices` data. **Re-ran `rescorePerSlot.ts` fresh against the current `RESULTS.json` /
   `RESULTS-gemini.json` on disk.** Output is **byte-identical** to the existing `PER-SLOT-RESCORE.json`
   in every aggregate (`perSlotOverall`, `perSlotByRung`, `opaqueVsClear`) and in row count (1545) — only
   the `ranAt` timestamp differs. The suspected staleness was unfounded; the mtime gap is an artifact of
   how this sandbox materializes files, not evidence of drift. **Doc 10's cited numbers stand as
   correct, confirmed against current data, not just against whatever data existed when they were first
   computed.**
2. Confirmed the three new date-fix tests exist and assert the right things (`scorePanel.test.ts`,
   `describe('scorePanel — ISO-date C1 truth vs prose-formatted header...')`).
3. Full verification: `npx tsc -b --noEmit` clean repo-wide; `npx oxlint eval/claude/10-grounding-ladder/`
   clean; `npx vitest run eval/claude/10-grounding-ladder` — **4 files / 43 tests green** (up from 40 at
   session 10, the 3 new date tests accounting for the difference).

**Net effect: no correction needed to doc 10.** This session's contribution is closing the doc-11
record gap and independently confirming (not just re-stating) that the numbers already in doc 10 are
current and correctly derived. Kill criterion (d) is genuinely resolved, and the three Verdict rows
that were sharing one combined C2 number (Structural / Data Quality / Behavioral) now have the real
per-slot split available in `PER-SLOT-RESCORE.json`, even though the table's own prose still reports
the combined figure by design (per doc 10's own note: "none of the three rows' verdicts turned on the
split").

**Still open, unchanged from session 10:** R-C (variance floor) through R-H, none authorized; Cloudflare
Workers AI arm not started; WebLLM's browser-harness decision not made.
