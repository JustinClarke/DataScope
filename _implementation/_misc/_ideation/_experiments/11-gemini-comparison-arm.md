# 11 — The Gemini instrument arm

**Status:** planned, not built. This is a build plan, not a finding — nothing here has run yet.

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
line). Verified alongside that: `eval/10-grounding-ladder/` contains **no test files at all** —
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
  fill a slot from the assembled context, the slot's fact partition is starved and the 14B's
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
  key-custody involvement. Everything lives under `eval/10-grounding-ladder/` and reads
  `GEMINI_API_KEY` from the **shell environment**, the way every other eval var already works
  (`OLLAMA_BASE_URL`, `EVAL_DATASET`, …). **There is no `dotenv` in this repo and none is to be
  added** — `.env.local` is Vite's, loaded by the app, not by `tsx`. Export the key in the shell
  or inline it on the command, and fail loudly at startup if it's unset.
- **Model: Gemini 2.5 Flash.** Cheapest capable tier, closest in general class to the already-tested
  local 14B, overridable so the Pro-vs-Flash question stays open without new code.
- **Row-cap handling: both.** Run the existing rungs (0/10/100/max-that-fits, same token budget as
  the Ollama run) for a direct comparison — *and* add a clearly separate uncapped condition, since
  that's a genuinely new cell the local rig can't produce.

---

## The transfer ledger

**Every finding from this arm gets one of three tags, assigned before the run, not after.** This is
the guard against the mistake the arm is most likely to cause: reading a frontier result as though
it predicts a 14B or a 1.5B.

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
5.  Ollama 14B, surviving cells         the comparable arm, on hardware that crashes
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

These are `*.test.ts` files in `eval/10-grounding-ladder/`, run by **vitest under `npm test`** —
not by `npm run eval`, which is `tsx eval/harness/run.ts` and runs no tests at all. Vitest's
`include` in [vitest.config.ts](../../../../vitest.config.ts) is an explicit allowlist that today
names only `eval/03-clause-citation-binding/*.test.ts` and `eval/08-computed-facts/*.test.ts`, so
**`eval/10-grounding-ladder/*.test.ts` must be added to that list or these files are silently never
collected** — which would no-op the gate that everything else in this plan is sequenced behind.
Adding the glob is the one permitted config edit outside `eval/10-grounding-ladder/`.

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
`callOllama` and `OllamaCallResult` are **private to [run.ts:64-70](../../../../eval/10-grounding-ladder/run.ts#L64)**.
So the refactor is: *move* `callOllama` out of `run.ts` into `ollamaRig.ts` behind the `PanelRig`
interface, rename `OllamaCallResult` → `ModelCallResult`, and leave `runCell`'s scoring logic
untouched. The temperature pin (below) lands at **both** call sites — `ollamaRig.ts`'s new `call`
*and* `runChat.ts`'s provider construction — or the two arms still sample differently.

```ts
// eval/10-grounding-ladder/providers/index.ts
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
  versus a non-thinking 14B is not an apples-to-apples arm at all, and thinking tokens bill as
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
"eval:grounding-ladder:gemini":      "EVAL_PROVIDER=gemini tsx eval/10-grounding-ladder/run.ts",
"eval:grounding-ladder:chat:gemini": "EVAL_PROVIDER=gemini tsx eval/10-grounding-ladder/runChat.ts",
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

| | Gemini 2.5 Flash | Ollama 14B | Workers AI | WebLLM 1.5B |
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
made everywhere. If it doesn't move at the ceiling, it certainly won't move a 14B, and 10's
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

**Ollama 14B.** The comparable arm, unchanged except for the pinned temperature, the shared
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

- [ ] Add `eval/10-grounding-ladder/*.test.ts` to `include` in [vitest.config.ts](../../../../vitest.config.ts)
- [ ] `scorePanel.test.ts` — a hand-built compliant `PanelAnswer` per in-scope fixture, from
      `PANEL-KEY.json` truth values, scores **zero** C1 disagreements / C2 rejects / C3 occurrences
- [ ] Same file — F1 (misattribution), F2 (invented value), F3 (world-knowledge) each injected and
      each caught **in its own class**, not merely caught
- [ ] `opaque.test.ts` — `deanonymizePanelAnswer(anonymize(x)) === x` round-trips
- [ ] `corrupt.test.ts` — `applyFactIntegrity` alters exactly one value, leaves the id untouched
- [ ] `panelSchema.test.ts` — parser fixtures: well-formed, cap-violating, fence-wrapped,
      prose-prefixed (three runs died at this boundary and it has no tests)
- [ ] **Gate:** `npm test` green with the new files actually collected — confirm the count rose,
      since a bad glob fails silently. `npx tsc -b --noEmit` and `npx oxlint eval/10-grounding-ladder/` clean.
- [ ] **Report:** did a correct panel score clean on the first try? If yes, Job 1 shrinks and the
      arm's value drops to Jobs 2–3 — say so, per "what would make this arm not worth running."

### Phase 2 — the `PanelRig` seam and the temperature pin (no spend)

- [ ] Move `callOllama` from [run.ts:64-70](../../../../eval/10-grounding-ladder/run.ts#L64) into
      `ollamaRig.ts` behind `PanelRig`; rename `OllamaCallResult` → `ModelCallResult`
- [ ] `runCell`'s scoring logic unchanged — diff it to prove that
- [ ] Author `PanelResponseSchema` in `panelSchema.ts` + its structural test against `PanelAnswer`
- [ ] Pin `temperature` explicitly on the Ollama rig **and** on `runChat.ts`'s provider
      construction; record it in the run record
- [ ] `provider`, `model`, `temperature`, `thinkingBudget`, `contextWindow` join the record shape
      (currently hardcodes `ollamaModel`)
- [ ] `EVAL_PROVIDER` registry resolving `PanelRig` for `run.ts`; ollama the only entry so far
- [ ] **Gate:** Ollama smoke re-runs and behaves identically to before the refactor — this touches
      the shared path, and a silent change here confounds the comparison the whole arm exists to make
- [ ] **Gate:** `totalPanelCalls()` still returns 250

### Phase 3 — `geminiRig.ts` and first blood (< $0.05)

- [ ] **Do the "verify at build" lookups first** — `thinkingConfig` param name and whether budget 0
      is permitted on 2.5 Flash; `thoughtsTokenCount` / cached-token fields in `usageMetadata`;
      `responseSchema`'s string-`enum` support; current rate limits; the $0.30/$2.50 figures.
      Fix the numbers **in this document** rather than working around a difference silently.
- [ ] `geminiRig.ts` — plain `fetch`, no new dependency; `GEMINI_API_KEY` from shell env, hard fail
      if unset; `GEMINI_MODEL` default `gemini-2.5-flash`
- [ ] Retry with backoff on 429/503 — an unretried 429 is a silently lost data point
- [ ] Bounded concurrency via `GEMINI_CONCURRENCY`, conservative default
- [ ] `thinkingConfig` budget **0** for comparable rungs; `thoughtsTokenCount` recorded separately
- [ ] Prompt capture to `PROMPTS-gemini.jsonl`, keyed `dataset/cellId/repeat`
- [ ] `estimateTokens` vs `usageMetadata.promptTokenCount` delta recorded per call
- [ ] `package.json`: the two `:gemini` scripts; existing scripts unchanged
- [ ] **Gate:** `EVAL_PROVIDER=gemini EVAL_DATASET=titanic EVAL_CELL=row-ladder-0 EVAL_REPEAT_CAP=1
      npm run eval:grounding-ladder:gemini` produces **the first scored panel this harness has ever
      seen**. Report the panel itself, not just that it ran.
- [ ] **Gate:** confirm `cites` is actually enum-constrained — 06 found Ollama's `format` holds;
      Gemini's dialect is an OpenAPI subset and the enum may not survive. If it doesn't, say so
      before the full run, not after.
- [ ] **Report:** the `estimateTokens` delta on this one call. If it's large, that's a RIG finding
      about the Ollama arm's row-packing and it lands before anything else runs.

### Phase 4 — the core arm (~$2)

- [ ] Chat arm: `providers/geminiProvider.ts` (eval-scoped, **not** `src/services/`) against the
      existing `AIProvider` contract; **verify** it returns a structured function call rather than
      inheriting `ollamaProvider.ts`'s regex extraction by assumption
- [ ] `uncapped-max` as a **separate exported cell list** in `variants.ts`, gated to
      `EVAL_PROVIDER=gemini`, so `totalPanelCalls()` still returns 250
- [ ] Chat smoke via `EVAL_RUNG`/`EVAL_DATASET`
- [ ] Full comparable cross (250) → `RESULTS-gemini.json`; chat (408) → `CHAT-RESULTS-gemini.json`
- [ ] Uncapped cell (~15) — and read it for the CEILING conclusion that matters: **if uncapped ≈
      max-that-fits, the row cap was never the binding constraint and A1 is the wrong lever for
      every tier**
- [ ] Results-file header carries the public-fixtures-only confinement and the
      no-rows-to-cloud-product-path restriction, per the Invariant 1 constraint
- [ ] Every finding tagged CEILING / RIG / DIRECTION / CAPABILITY **before** reading the numbers
- [ ] **Gate:** `npm run eval` (D40) still green; `npm test` still green
- [ ] **Report:** real spend against the ~$2 estimate; the `estimateTokens` delta distribution per
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

## Verification

1. `npx tsc -p eval/tsconfig.json --noEmit` and `npx oxlint eval/10-grounding-ladder/` stay clean.
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
