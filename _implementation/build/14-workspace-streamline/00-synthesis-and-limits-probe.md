# S0 — Synthesis reach + query-tab ceiling (probe)

**Tier:** v0.70 · **Phase:** S0 (§19) · **Master spec:** §13.3, §19's v0.70 subsection ·
**Decisions:** D73 (the two questions it declined to guess at), D70/D56 (the v0.25 synthesis it
reuses), D43/ADR-007 (the local model it measures against), D40 (the eval gate), D18 (probe
discipline) · **Builder:** Opus

> **This is a probe, not a feature.** It exists because two D73 items are **measurements wearing
> the costume of design questions**, and the tier refuses to guess at either. Nothing here ships
> to users. The deliverable is a **verdict** — numbers plus a recommendation — that unblocks S7
> entirely and S5's ceiling number only. Same discipline as the D43 WebLLM spike
> (`_misc/spike-webllm/`): throwaway harness, explicit kill criteria written *before* running,
> verdict recorded whether it passes or fails.

## Why these two are together

They share nothing conceptually. They are one doc because they share a **method** (measure on
real hardware, against real datasets, before committing) and a **blocking relationship to the
same tier**. Read them as two independent probes, A and B. A third item, C, is **new scope that
fell out of B** and is recorded here rather than smuggled into either.

---

## Probe A — can the synthesis prose reach §4's narrative inside the honesty seam?

### What is already answered (do not re-run this)

v0.25 shipped a working structure-only synthesis pipeline, and its privacy posture is **built and
reviewed, not hypothetical** — this probe inherits all of it and changes none of it:

- `edge/handlers/synthesis.ts` + `edge/ai/synthesisProvider.ts` — Workers AI, deployed to
  staging, on the ADR-006 shared limiter + kill switch.
- `src/services/webllmSynthesis.ts` — the local WebLLM rung, reusing the edge's exact prompt and
  parse contract, zero egress.
- `src/lib/structuralFacts.ts` / `edge/protocol.ts` — the wire contract carries **schema, types
  and profile aggregates only, never rows** (live-audited 2026-07-22 against the real outbound
  POST; cell-value canaries absent). It is already multi-table shaped (`tables: Array<…>`).
- `eval/synthesis/run.ts` — the D40 gate, one labeled item per §14 sample, scored through the
  product's own seam validators. Last run: **100% / 100% (5/5, 5/5)**, ~14 neurons/call.

So "can Cloudflare or WebLLM produce usable synthesis text" is **already yes**. That is not this
probe's question.

### The actual question

The ADR-010 seam is deliberately narrow: the model may **re-phrase a headline** and
**re-order / re-phrase existing actions**, and the adapter reassembles the slice from the
deterministic baseline — so an invented claim is *unrepresentable in the output format*, not
merely rejected at runtime. That is the honesty guarantee, and it is load-bearing.

§4 of the ideation round asks for something categorically different:

> "This appears to be an E-Commerce dataset with two tables containing **10,420 customers** and
> **45,092 orders**. The data spans from January 2021 to January 2024. This dataset is well-suited
> for calculating Customer Lifetime Value (CLV), analyzing churn, and forecasting seasonal demand."

Against the same dataset, the shipped seam produced:

> "4 tables, 5,437 rows, 0% null values — see what's inside."

Both are true. Only one answers *"what is this for?"* — and that phrasing ("appears to be an
e-commerce dataset", "well-suited for CLV") is an **interpretive claim about purpose**, which is
exactly the category the seam is built to refuse. **The question is therefore not "is the model
good enough" but "is the guarantee and the ask compatible at all, and at what contract."**

### Three candidate answers, to be distinguished by measurement

1. **The seam stretches.** A widened system prompt, still emitting only re-phrased-headline +
   reordered-actions, gets meaningfully closer to §4 by *composing facts it was given* (table
   count, row counts, detected semantic types, date range) rather than by inventing. If so: the
   change is a prompt and a slightly richer `StructuralFacts` payload — cheapest outcome.
2. **A new bounded contract is needed.** Purpose narrative requires a **capability-keyed phrase
   library** — deterministic mappings from what the broker already detects (temporal + quantitative
   + an entity-ish key ⇒ "cohort analysis, retention, seasonal forecasting") with the model only
   *selecting and phrasing* among pre-authored options. Still unrepresentable-to-invent, but a new
   validator and a new authored asset. Middle outcome.
3. **Out of reach honestly.** Any phrasing that reads as purpose inference is a claim the app
   cannot stand behind on arbitrary user data. Fall back to **D65 deterministic narration** and
   retitle the block so it never implies more than it knows. Cheapest to ship, and an acceptable
   answer — S7 is allowed to conclude "don't build this."

### Method

- **Harness:** extend `eval/synthesis/run.ts` with a prompt-variant axis (baseline prompt vs. N
  widened prompts) rather than writing a new harness. Score through the **existing seam
  validators** — a variant that only wins by escaping the validator has failed, not won.
- **Datasets:** the five §14 samples already in the harness, ecommerce as the primary case since
  it is the multi-table worked example §4 is written against.
- **Providers, measured head-to-head:** the staging Workers-AI endpoint (Mistral Small 3.1, per
  ADR-007) and the local WebLLM rung (Qwen2.5-Coder-1.5B q4f16). ADR-007 constraint 4 stands —
  the local number is a floor with no cloud head-to-head until this probe provides one.
- **Explicitly out of scope: uploading rows.** Not "deferred" — *unnecessary*. §4's narrative is
  built from schema, counts, types and ranges, all of which the structure-only payload already
  carries. Sending rows would test a feature nobody has proposed and would reopen a settled
  privacy boundary (D20/D45/D46/D59) for no measured gain. If a variant genuinely cannot be
  written without row values, **that is a finding** — record it and stop; it does not authorize
  an upload.

### Kill criteria (written before running, per D18)

- **(a)** A widened prompt beats the current baseline on the harness's existing headline-win and
  actions-upgraded scores, **without** any variant tripping a seam validator on any sample.
- **(b)** No variant produces a claim not derivable from the payload it was given — audited by
  hand across all five samples, not just scored. **One fabricated claim fails the whole probe**,
  regardless of the score.
- **(c)** The local rung's output is usable enough that the block is not silently cloud-only —
  or, if it is not, the degradation to edge/deterministic is honest on screen.

Failing (a) points at answer 2 or 3; failing (b) points at 3 and is the outcome the invariant
exists to catch.

### Deliverable

A verdict section appended to this doc: the scores, the hand-audit result, a recommendation among
the three answers, and — if it is 1 or 2 — the concrete contract change S7 would build to. Master
§19's S7 row and D73's gate clause update from that verdict, master-first.

### Verdict — row-upload sub-question (2026-07-26)

**This is not the formal Probe A verdict.** It answers one narrower question the brief above
calls out of scope by default — whether raw rows help — on **explicit human authorization**
(2026-07-26: "give the data to cloudflare as well to see if there is better ai synthesis"),
confirmed against **synthetic/public §14 fixture data only**, unbounded/full-table for research
purposes. It does not run the method specified above (seam-validator scoring, both providers,
hand-audited kill criteria) and does not close S0. Master §19's v0.70 subsection carries the
same summary; this is the full method and evidence.

**Why this couldn't run through `requestSynthesis`/`synthesisProvider.ts`:** that seam's
`ModelAnswer` contract is `{headline, actions}`, reassembled from the client's baseline
(ADR-010) — structurally incapable of free prose regardless of input. So this ran against the
`ai-router` endpoint instead (`edge/handlers/ai-router.ts`), which already carries open prompt
content for the NL→SQL path — same Worker, sibling route, no new deploy, no product code
touched. Script: `eval/synthesis/probe-narrative.ts` (throwaway, D18 discipline, outside
`eval:synthesis`'s pass/fail gate). Run with `npm run eval:synthesis:narrative-probe`.

**Method.** For each of the five §14 samples: (a) send `buildStructuralFacts` structure-only,
with a widened system prompt asking for the exact §4-style paragraph (domain guess, entity
counts, date coverage, 2-3 specific well-suited-for recommendations); (b) send the same
structure plus every table's rows, JSON-encoded, truncated to fit the `ai-router` endpoint's
~64KB body cap (recorded per dataset — no dataset's full table fit uncapped).

**Result: structure alone already gets close.** All five structure-only answers produced
specific, non-generic "well-suited for" recommendations from column names/types/cardinality
alone — no rows needed for that part.

**Result: rows made the one remaining gap (date range) worse, not better.** `StructuralFacts`
deliberately excludes min/max, so date coverage was the one thing structure-only could not
state. Checked against the source CSVs:

| Dataset | True date range | Structure-only said | Rows-variant said |
| :--- | :--- | :--- | :--- |
| weather | 2015-01-01 → 2024-12-28 (10 yrs) | "spanning ten years" (correctly inferred from row count) | "January 1 – December 31, 2015" (1 yr — wrong by 9) |
| stock_prices | 2016-01-04 → 2025-08-01 (9.5 yrs) | no date claim made | "January 2016 – June 2018" (2.5 yrs — wrong by 7) |

Two compounding causes, both real findings, not artifacts of a broken script: **(1)** fitting
the body cap meant sending a byte-capped *prefix* of each table, not a representative sample;
both tables are stored in chronological order, so a prefix systematically skews toward early
dates. **(2)** even within the sample it did see, the model does not reliably extract an exact
min/max by reading a JSON row dump — the ecommerce run stated a dataset-wide date range that
matched neither `orders.order_date` (2021–2024) nor `customers.signup_date` (2019–2024). Both
sit downstream of the same mechanism: an LLM asked to eyeball an aggregate from raw rows is not
a substitute for computing the aggregate. Structure-only, lacking the data to overreach with,
stayed accurate by staying appropriately vague.

**Conclusion: no case for row upload.** The date-range gap is not a rows problem — it is a
missing field. It closes by adding a **deterministic temporal min/max aggregate** (still
structural/quality-only, D45's own category, no new re-identification exposure beyond what
`nullPercentage`/`cardinality` already carry) to `StructuralFacts`, computed by the app and
handed to the model as a fact to phrase, never inferred from a raw sample. This keeps whatever
S7 eventually builds inside the D20/D45/D46/D59 boundary Probe A's brief protects — the row
question is answered, not merely re-deferred.

**What Probe A still needs** before S0 can close: the formal method above, run without rows —
seam-validator-style scoring of the widened prompt against the baseline, the WebLLM local rung
(untested here; this ran cloud-only), and a hand audit for fabrication across all five samples
per kill criterion (b). Full outputs: `eval/synthesis/NARRATIVE-PROBE-RESULTS.json`.

### Verdict — row-upload, max-context follow-up (2026-07-26)

**Also not the formal Probe A verdict.** A direct follow-up to the row-upload sub-question above,
on further explicit human authorization the same day ("push further on rows/freedom, let it have
as much info/context/power over the data as you do and run again"): does the 64KB body cap the
row-upload run backed off against actually explain the ceiling found there, or was the model's own
context window the real limit all along? Same script, same open `ai-router` path, same synthetic
§14 fixtures, same scope (not the ADR-010 seam).

**Method.** `wrangler.toml`'s `env.staging.vars.AI_ROUTER_MAX_BODY_BYTES` was temporarily raised
65536 → 1000000 and the staging Worker redeployed; `probe-narrative.ts`'s own payload target raised
50,000 → 950,000 bytes to match, so its row budget stopped being the binding constraint. Both
reverted to their original values and staging redeployed back once data collection finished — this
was a research-only widening, not a standing config change. Script unchanged otherwise; output
written to `eval/synthesis/NARRATIVE-PROBE-RESULTS-FULL.json` (the original capped-run evidence at
`NARRATIVE-PROBE-RESULTS.json` is untouched).

**Result: the 64KB cap was not the real ceiling — the model's own context window is.** With the
artificial cap out of the way, full tables fit and were sent for titanic (891/891 rows, 124KB) and
product_reviews (520/520 rows, 69KB). The other three — stock_prices (2,500 rows, 236KB), weather
(3,650 rows, 382KB), and ecommerce (5,437 rows across 4 tables, 481KB) — all failed outright
(`upstream-error`, a 502) at full size, a failure mode the original script's backoff didn't even
catch (it only retried on a 4xx). Extending the backoff to retry-smaller on `upstream-error` too
found each one's actual usable size: stock_prices settled at 1,250/2,500 rows (117KB), weather at
1,825/3,650 (191KB), ecommerce at 2,719/5,437 (240KB) — all comfortably past the old 64KB/50KB
ceiling, confirming Mistral Small 3.1's 128K context (`edge/adapters.ts`'s own comment on
`DEFAULT_AI_MODEL`) is the real limit, not anything this app's own config imposed. Sending "as much
as we do" doesn't remove a ceiling here, it just relocates which one you hit.

**Result — kill criterion (b), hand audit: FAILS again, and worse.** Cross-checking every
narrative against the actual fixture (`public/samples/titanic.csv`): its schema is `PassengerId,
Survived, Pclass, Name, Sex, Age, SibSp, Parch, Fare, Embarked` — **no date or timestamp column of
any kind.** One full-data run (891/891 rows) still produced: *"The data covers the single voyage
of the Titanic, which sank in April 1912."* Nothing in the structure or the 891 rows given states
this — it is the model's own outside/world knowledge about the real historical Titanic, injected
into a claim about *this dataset* as if the data supported it. A second call with the identical
891/891-row input, same session, correctly answered *"The covered date range is not explicitly
stated in the data."* Same input, two different live outcomes — the failure isn't even
deterministic, so a single passing run (or a single fixed eval set, run once) cannot certify this
is safe. (One softer, non-fabricated finding from the same audit: product_reviews's with-rows
narrative quotes review phrasing like *"broke after a week"* — checked against
`public/samples/product_reviews.csv`, real rows do contain near-identical text ("Broke after a
week of light use, disappointed."), so that specific claim is genuinely row-grounded, not
invented.)

This is a distinct and arguably more dangerous failure mode than the formal Probe A verdict below
(which found the model mis-describing which column an evidence-backed statistic belonged to). That
one required *some* structural signal to garble; this one required *none* — titanic offered no date
signal at all, and the model filled the gap from training-data familiarity with a well-known public
dataset rather than declining to claim one. On arbitrary user-uploaded data the app has never seen,
there is no way to tell in advance whether a dataset merely *resembles* something the model
recognizes, and no way to catch this class of claim with the seam's existing checks (`sql`,
`snapshot`, `confidence`, `provenance` byte-identity + the forbidden-word list) — none of them
address content the model invented from outside the payload entirely.

**Conclusion: reinforces answer 3, on a sharper basis than the formal verdict alone.** More
context and more freedom, pushed as far as the model's actual limits allow, doesn't converge toward
a trustworthy §4-style narrative — it converges toward the model reaching for outside knowledge to
fill gaps the given data doesn't cover, which is strictly worse than misdescribing a given fact and
strictly out of reach of "never a claim the structure doesn't support" at any prompt or payload
size tried so far. Full outputs: `eval/synthesis/NARRATIVE-PROBE-RESULTS-FULL.json`.

### Verdict — Probe A, formal method, cloud leg (2026-07-26)

**This is the method the brief above specifies, cloud leg only — Probe A is not fully closed**
(the WebLLM local rung, kill criterion (c), has not run). Distinct from the row-upload
sub-question above: this run stays inside the ADR-010 seam's actual `{headline, actions}`
contract end to end, never the open `ai-router` free-prose path.

**Harness.** `eval/synthesis/run.ts` extended with a prompt-variant axis: the unmodified
production `SYNTHESIS_SYSTEM_PROMPT` (still the D40 gate, unaffected — same threshold, same
exit code) plus two widened variants — `widened-v1-domain-and-dates` (permits composing a
domain guess from column names/types and a date range from `minDate`/`maxDate`, only when
both are present) and `widened-v2-suited-for` (additionally permits naming 1-2 suited-for
analyses from the semantic-type combination present). Widened variants route through the
deployed `ai-router` endpoint (open messages, no new deploy) carrying the substitute system
prompt, but are parsed with the exact production `parseModelAnswer` and reassembled with the
exact production `sliceFromAnswer`, so `requestSynthesis`'s own seam validators
(`narrationValidator`, `rankedActionValidator`) run on every candidate unmodified — a variant
that wins only by escaping the validator has failed, not won (D58: no second, harness-only
validation path).

**Prerequisite landed first:** `StructuralFacts` gained `minDate`/`maxDate` for Temporal
columns only (`src/lib/structuralFacts.ts`), sourced from the profiling pass's existing
`SUMMARIZE` extraction — a deterministic aggregate, never inferred from a row sample. This is
the fix the row-upload sub-question's verdict above called for.

**Result — kill criterion (a), numeric: not met, but not for the reason it exists to catch.**
`validator-rejections: 0` for both widened variants across all 5 datasets — the seam held,
nothing escaped format. But `headline-win` dropped (production 100% → widened-v1 60% →
widened-v2 40%) because the harness's numeric-carryover check requires every number from the
*given* headline to survive verbatim, and the model, given room to compose new content,
tended to **replace** the original claim's number rather than keep both. This is a real
tension between two prompt instructions, not by itself evidence of fabrication.

**Result — the deterministic date-range fix works, unambiguously.** Every single-table
widened response stated the exact given range: stock_prices "2016 to 2025" (true:
2016-01-04 → 2025-08-01), weather "2015 to 2024" (true: 2015-01-01 → 2024-12-28),
product_reviews "2023 to 2024" / exact ISO dates in v2 (true: 2023-01-01 → 2024-11-29).
Compare the row-upload verdict's table above — this is that fix landing as predicted.

**Result — kill criterion (b), hand audit: FAILS.** One fabrication, found by cross-checking
every composed headline against the exact `facts` payload the model received
(`SYNTHESIS-VARIANT-RESULTS.json`):

> titanic / widened-v1: **"Fares for survivors average 1.6σ higher than non-survivors."**
> The measured fact (baseline: `"1"'s mean Fare is 1.6σ above the rest.`) is about **Pclass**,
> not `Survived` — confirmed by the *production* variant's own correctly-scoped rephrase of
> the identical fact in the same run: `"Fare for "1"s is 1.6σ higher than other Pclass
> groups."` The widened variant swapped which column the statistic describes.

Per this doc's own kill criteria, written before running: **"One fabricated claim fails the
whole probe, regardless of the score."** This is why it matters structurally, not just as a
prompt-tuning miss: `narrationValidator` checks that `sql`, `snapshot`, `confidence` and
`provenance` stay byte-identical to the baseline and that the phrasing guard holds — it has
no check that the free-text `statement` still describes the *same* evidence it's attached to.
The seam stops the model from inventing a new fact (the evidence itself can't change);
nothing stops it from mis-describing the existing one in prose.

Two softer findings from the same audit, neither independently disqualifying (the fabrication
above already fails the probe) but worth recording: titanic/widened-v2 added *"survival
rates... vary by passenger class"* — plausible general knowledge about the Titanic dataset,
not something the structural facts given actually establish. And ecommerce/widened-v1, given
two Temporal columns with different ranges (`customers.signup_date` 2019–2024,
`orders.order_date` 2021–2024), picked the narrower orders range and phrased it as if it
covered "4 tables" — not fabricated (both dates given are real) but overstated in scope; the
widened prompt has no instruction for multiple candidate ranges on a multi-table dataset.

**Recommendation.** The cloud leg's evidence points at **answer 3** — purpose narrative is out
of reach honestly at this contract, fall back to D65 deterministic narration — because kill
criterion (b) fails exactly the way the probe's own pre-committed logic said it would
("Failing (b) points at 3"). One alternative not in the original three answers, and worth a
follow-up probe of its own: **strengthen `narrationValidator`** with a same-evidence check on
the composed statement (e.g. require the column/category names it mentions to be a subset of
the ones the evidence names), rather than accepting any phrasing that clears the forbidden-word
list. Untested here — a genuine fourth option, not a recommendation.

**What's still open before S0 fully closes:** the WebLLM local rung (kill criterion (c)) has
not run — Node has no WebGPU, so this needs a browser-driven harness (Playwright) or a manual
run on the M1/M4 reference machines, same posture as Probe B. Given (b) already fails
independent of which provider serves the prompt (the validator gap is provider-agnostic), the
WebLLM leg is unlikely to change the recommendation above, but the probe's own definition of
done requires it to run before Probe A is called closed. Full outputs:
`eval/synthesis/SYNTHESIS-VARIANT-RESULTS.json`.

### Verdict — Probe A, BYOK leg (Ollama, qwen2.5-coder:14b) (2026-07-26)

**Not kill criterion (c) and does not close it.** A dev Ollama server became available
(Makefile's `ollama-start`, `100.126.157.97:11434`, `qwen2.5-coder:14b`) — the same address
`edge/ai/byok.ts` already hardcodes as its OpenAI-compatible BYOK pass-through target. This is
a **third, independent leg**: a remote 14B model over the D9 BYOK seam, not the ADR-007 pinned
1.5B WebLLM running in-browser with zero egress. The two differ in model size, serving
mechanism, and hardware, so a result here says nothing about the local rung specifically —
it's an additional cloud-shaped-but-different-model data point on the same formal-method
harness, run because the model happened to become available, not a substitute for (c).

**Method.** `eval/synthesis/run.ts` extended with a fourth path per dataset per prompt variant
(`production`/`widened-v1-domain-and-dates`/`widened-v2-suited-for`): the same
`SynthesisRequest`, routed through a `fetchImpl` that calls Ollama's `/v1/chat/completions`
directly (confirmed OpenAI-compatible: `choices[0].message.content`) instead of Cloudflare's
`ai-router`, bypassing the deployed Worker entirely since Ollama's Tailscale address isn't
reachable from Cloudflare's edge (only from this dev machine). Parsed and reassembled with the
exact same `parseModelAnswer`/`sliceFromAnswer` as every other leg (D58). Recorded as
`<variant>__ollama` alongside the existing legs in `SYNTHESIS-VARIANT-RESULTS.json`, never
folded into the D40 gate's `scores`.

**Aside — this run's cloud-leg (Workers AI) numbers are void.** Re-running the harness's
existing cloud path this same session hit `{"error":"pool-exhausted"}` from `ai-router`
directly (confirmed by hand, outside the harness) — the account-wide free-tier ceiling from
today's earlier row-upload probes. Every widened cloud variant degraded to `ai-down` and
`production` silently echoed the baseline. This is quota exhaustion, not a regression in the
formal cloud-leg verdict above, which stands unchanged; this run only supplies new signal on
the Ollama leg, which doesn't touch Workers AI at all.

**Result — kill criterion (a), numeric:** `validator-rejections: 0` across all three Ollama
variants and all five datasets — the seam held. `headline-win`: production 80%, widened-v1 40%,
widened-v2 20% — the same directional pattern as the cloud leg (more freedom → lower verbatim
number carryover), and for the same reason: the model tends to replace the given number/topic
rather than keep it. One scoring artifact found in the process: `product_reviews`/widened-v1
scored `headlineWin: true` only because the harness's numeric-carryover check
(`composed.includes(t)`) is a plain substring match — the baseline's "20" (rows) matched as a
prefix of the composed headline's unrelated "2023" (a year), not because the 20-duplicate-rows
fact actually survived. The real content did not carry over; the score did not catch it. Minor,
pre-existing, provider-agnostic — worth a token-boundary fix (`\bt\b`-style) whenever this
harness is touched again, not urgent enough to block this verdict.

**Result — kill criterion (b), hand audit: FAILS, with a new and starker failure mode.**
Cross-checked every composed headline against its recorded `facts` and, where relevant, the
source CSV:

- **Fabrication:** `weather`/widened-v2 — *"5 years of daily weather data in Manchester shows
  strong temp correlations."* `StructuralFacts` for this table carries `Date` (min/max only),
  `City` (`Categorical`, `cardinality: 1` — no value, ever), and three `Quantitative` columns —
  no city name anywhere in the payload, structurally impossible to derive. Checked against
  `public/samples/weather.csv`: the actual city is **Springfield**, so "Manchester" isn't even a
  lucky guess, it's wrong on top of ungrounded. The duration is also wrong: true span is
  2015-01-01 → 2024-12-28 (~10 years, confirmed by `minDate`/`maxDate` in the same payload the
  model had), stated as "5 years." This is a cleaner fabrication than the formal cloud verdict's
  Pclass/Survived mixup — that one misattributed a real stat to the wrong column; this one
  invents a value class (a place name) the payload structurally cannot supply, the same failure
  mode the max-context follow-up's Titanic/1912 finding surfaced on the cloud leg, now showing up
  on a completely different model and serving path. It reinforces that this is a property of the
  contract (validator checks format, not topical grounding), not of any one provider.
- **Topic substitution (not counted as fabrication, but a related gap):** `titanic`/widened-v1
  ("Analyze survival outcomes grouped by passenger class"), `titanic`/widened-v2 ("Titanic
  dataset: Analyze passenger demographics and survival outcomes"), and `stock_prices`/widened-v2
  ("Explore stock price trends from 2016 to 2025") all replaced the assigned headline fact
  (Fare-vs-Pclass, the leakage correlation) with a generic, action-shaped sentence about the
  dataset overall — every named fact in each is real and derivable, but none of them describes
  the evidence the headline was actually attached to. `narrationValidator` has no check for this
  (confirmed again, same gap the formal cloud verdict named): it holds `sql`/`snapshot`/
  `confidence`/`provenance` byte-identical and screens forbidden words, nothing else.
- On-topic and accurate (for contrast): `production__ollama` stayed correctly scoped on all
  five datasets (e.g. stock_prices: *"High correlation between 'High' and 'Close': 1.000."*);
  `widened-v1`'s date-range claims were correct everywhere they appeared (stock_prices "2016 to
  2025", weather "2015 to 2024", ecommerce "2019 to 2024") — the deterministic `minDate`/`maxDate`
  fix from the formal verdict holds on this model too.

**Conclusion: reinforces answer 3 on a third, independent basis.** A different model (14B vs.
the cloud leg's Mistral Small 3.1), a different serving path (BYOK pass-through vs. Workers AI),
and a different machine all reproduce the same structural gap — and this run's fabrication is
arguably harder to defend than either prior one, since "Manchester" has no candidate source in
the payload at all, not even a misattributed real value. Nothing about a bigger local-ish model
closes the gap the formal verdict already identified; if anything it demonstrates the gap
generalizes across models rather than being one model's quirk. Does not close kill criterion
(c) — the actual WebLLM local rung is still unrun. Full outputs:
`eval/synthesis/SYNTHESIS-VARIANT-RESULTS.json` (same file, `__ollama`-suffixed variant ids).

### Operational follow-ups from today's probes (2026-07-26) — not part of Probe A/B, don't lose them

A same-day incident review (today's Workers-AI free-tier exhaustion, see the BYOK-leg aside above)
surfaced four items that are **real and actionable but orthogonal to Probe A's narrative-quality
question** — recorded here so they don't evaporate once the pool resets and the incident stops
being visible. None of these block S0's own verdict above.

1. **`edge/ai/byok.ts` is currently uncommitted probe residue and must be reverted before any
   deploy.** `git diff` confirms both `OPENAI_CHAT_URL` and `DEFAULT_OPENAI_MODEL` are pointed at
   today's dev Ollama box (`http://100.126.157.97:11434/…`, `qwen2.5-coder:14b`) instead of the
   real `https://api.openai.com/v1/chat/completions` / `gpt-4o-mini` — leftover from the BYOK leg
   above, which used this same address. Two consequences while it stands: **(a)** every BYOK
   OpenAI-path call (pass-through or vaulted) fails outright, since that Tailscale address is only
   reachable from this dev machine, not Cloudflare's edge — which dead-ends the D3 overflow ladder
   ("free pool spent → fall back to the user's own key") on exactly the kind of day it exists for;
   **(b)** were that address ever reachable, it would violate the custody comment at this same
   file's top (a real user-supplied OpenAI key must never be sent anywhere but OpenAI). **Not
   verified here:** whether staging was redeployed with this change live — worth checking deploy
   history before assuming it's dev-only.
2. **Quota/pool exhaustion is indistinguishable from "the AI ran and agreed with the baseline" —
   and the cause is server-side, not client-side.** (Corrected 2026-07-26: an earlier draft of this
   item blamed the client for swallowing a typed error code. Verified wrong; the truth is worse.)
   Three findings, each checked in code:
   - `SynthesisErrorCode` carries only `'bad-request' | 'rate-limited' | 'paused'`
     (`edge/protocol.ts`) — **there is no exhaustion code in the synthesis contract at all.**
     `pool-exhausted` belongs to the sibling `ai-router` endpoint, which is why the hand-probe saw
     it there and the synthesis path never reports it.
   - On *any* provider failure, including the Workers-AI ceiling, `edge/handlers/synthesis.ts:110`'s
     `catch` returns **HTTP 200 with `body.baseline` echoed back** (counter: `degraded`), by
     deliberate design — the comment says the client "sees an unchanged slice and stays on the
     deterministic answer it already painted."
   - So `src/services/synthesis.ts:173`'s `!res.ok` branch is **never reached** on exhaustion.
     `res.ok` is true, `validateSlice` compares the echoed baseline against itself, passes, and the
     client concludes the model ran successfully with nothing better to say.

   This is why every `composedHeadline` in `SYNTHESIS-EVAL-RESULTS.json` is byte-identical to its
   `baselineHeadline` — not a client bug and not a scoring bug, but a server choice that makes "AI
   unavailable" **unobservable** to the client *and to the D40 gate*, which scored 0% without being
   able to say why. Compare the chat path, which does surface it (`src/services/ai.ts:219`: *"The
   free AI budget is used up for today. Bring your own key, switch to the local model, or retry
   tomorrow."*). Fixing this needs a **new typed code (or a flag on `SynthesisResponse`) emitted by
   the Worker**, not a client-only change — the information does not currently reach the client in
   any form. Worth doing regardless of S0's verdict: an eval gate that cannot distinguish "quota
   exhausted" from "model added no value" will mis-report on every future exhaustion day too.
3. **The "fourth option" already recorded above (strengthen `narrationValidator` with a
   same-evidence/grounding check) is the standing highest-leverage follow-up** — restated here only
   as a pointer so it isn't missed among the operational items: see the formal cloud-leg verdict's
   *Recommendation* paragraph above. Untested; would need its own probe pass before S0 can lean on
   it.
4. **Kill criterion (c) remains the one rung immune to cloud quota days, and it's still unmeasured.**
   Today's outage is precisely the scenario the WebLLM local rung exists for, and per §5.1 it is a
   silent no-op for any session that hasn't already consented to and finished the ~830 MB download —
   i.e. most sessions, most of the time. Closing (c) (browser-driven harness or a manual run on the
   M1/M4 reference machines, per the open item above) is worth prioritizing independent of Probe A's
   narrative-quality verdict, since it's the only answer to "the shared pool is empty" that doesn't
   depend on Cloudflare at all.
5. **Chat has a zero-edge stopgap that synthesis doesn't.** `src/services/ollamaProvider.ts`'s
   `isOllamaEndpoint()` lets a user point the chat path at their own local/network Ollama server —
   pasted into the key field — fully bypassing the exhausted edge pool. Synthesis's non-cloud rungs
   today are WebLLM (item 4, effectively absent for most users) and BYOK (item 1, currently broken).
   Worth a deliberate decision on whether synthesis should grow an equivalent Ollama-shaped escape
   hatch, independent of whatever S0 concludes about narrative quality.

---

## Probe B — the query-tab ceiling

### Decided already, not part of the probe

**The tab strip gains horizontal scrolling, unconditionally** (§13.3). Some number of tabs is
always reachable, and a strip that compresses or drops tabs silently is worse than one that
scrolls. This ships with S5 regardless of what B finds.

### The question

Query tabs are the first tab type a user can open **arbitrarily many** of — every prior type is a
singleton. Each is keep-mounted (§13.3's v0 norm) with its own editor and result set, alongside
DuckDB-Wasm's own footprint in the same tab. So the ceiling is a **memory** question:

1. What does one query tab actually cost, warm, with a realistic result set?
2. Where does the session degrade — and does it degrade gracefully or crash?
3. Should the ceiling be **one fixed number for everyone**, or **scaled to the device**?
4. At the ceiling: **refuse the pin with a reason**, or **evict the least-recently-touched tab**?

### On scaling the ceiling to the device

The proposal is to reuse the capability probe that already sizes the WebLLM download (§13.3 /
`03-webllm-handoff.md` — WebGPU presence + a memory floor derived from the D43 coexistence
criterion). **It is a reasonable instinct and it is not yet supportable**, for one specific
reason: that probe answers *"can this device hold a 1.6 GB model alongside DuckDB"*, which is a
single large static allocation. A query tab is a small dynamic one whose cost is dominated by
result-set size, not by the editor. **There is no established relationship between the two
numbers**, and inventing a formula that maps one to the other would be exactly the kind of
plausible-looking guess this probe exists to avoid.

So: **measure first, then decide whether scaling is justified.** If per-tab cost turns out to be
small and flat, a fixed number is correct and simpler. If it turns out to be large or highly
variable, a device-scaled ceiling earns its complexity — and this probe will have produced the
coefficient it needs.

**Interim recommendation if the probe is deferred:** a fixed soft cap of **20** with
refuse-with-reason at the ceiling. Twenty is past the point of useful tab navigation anyway, and
refusing is reversible where evicting a tab the user was mid-edit in is not. This is a default to
ship behind, not a measured number — it is labeled as such wherever it lands.

### Reference hardware (confirmed available)

| Machine | Role |
| :--- | :--- |
| **M1 MacBook Air, base model (8 GB)** | The floor. If it is bad here, the ceiling is set here. Also the D43 spike's machine, so the WebLLM numbers are directly comparable |
| **M4 MacBook Air** | The higher-performance reference — establishes whether the ceiling should move with the device at all |

Two points is enough to answer "flat or scaling?"; it is not enough to fit a curve, and the
verdict should not pretend otherwise.

### Method

- Open query tabs in a loop against a realistic dataset (the §14 ecommerce sample and a large CSV
  — the D43 spike used a 1.24M-row file that is already known to coexist with a warm model).
- Per tab, record: JS heap delta, whether the result grid is virtualized in practice, and
  interaction latency on tab switch.
- Record the same series with WebLLM **warm** and **absent**, since the two features compete for
  the same ceiling and the honest number is the coexisting one.
- Note the failure mode at the top end: graceful slowdown, tab crash, or DuckDB OOM — the shape of
  the failure matters more than the exact number, because it decides refuse-vs-evict.

### Deliverable

A verdict appended here: per-tab cost on both machines, the failure mode, a recommended ceiling +
at-the-ceiling behaviour, and a yes/no on device scaling with the reason. S5's leaf doc writes the
number in from this; until then **no ceiling number appears in any leaf doc** (§13.3 says so
explicitly, so a build cannot quietly invent one).

---

## C — Settings model-rating pane (**new scope, needs its own decision**)

Raised 2026-07-26 and wanted: a **Settings pane offering several WebLLM models to download, each
with an estimated accuracy**, so the user picks the trade-off rather than accepting one pinned
choice.

**Recorded here, not folded into D73**, because it is neither a workspace-streamline item nor a
free extension of Probe B — it changes a recorded ADR constraint:

- **ADR-007 constraint 1 pins exactly one model** (`Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC`),
  because that is the one measured to coexist with DuckDB-Wasm. The 3B options are explicitly
  **unverified on 8 GB** and "out of budget pending their own probe"; 0.5B exists as a
  lower-footprint fallback. A chooser means **probing each offered model** against the D43
  coexistence criterion — Probe B's harness is the natural place, which is the only real link
  between C and B.
- **ADR-007 constraint 4 forbids an unearned accuracy claim.** The existing 92% is a
  simple-schema floor on a seeded single-table set with **no measured cloud head-to-head**, and
  D40 gates any "local" number that reaches a user. **A per-model accuracy figure shown in
  Settings is exactly such a number** — so each offered model needs its own eval run, and the pane
  must present the figure with its scope ("on simple single-table schemas"), never as a bare
  percentage.
- The pane also interacts with the D70 download-confirm, which is currently **the single WebLLM
  consent gate** for one ~830 MB pull. Several models means several sizes and a repeatable
  download decision — the consent contract needs re-reading, not just re-rendering.

**What it needs to proceed:** an ADR-007 amendment (one pinned model → a probed, ranked set) and
a decision row if the consent shape moves. **Not blocking v0.70** — S1–S7 are unaffected (S0 aside, which is this doc), and
this can be picked up whenever, independently. Flagged rather than started.

---

## Definition of done (the probe, not the features)

Probes A and B have run on the stated hardware and datasets, their kill criteria are answered with
numbers, and each has a verdict recorded in this file — **including a "no, don't build it"
verdict, which is a valid and cheap outcome for either.** Master §19 (S0/S5/S7 rows) and D73's
gate clause are updated from those verdicts, master-first. No user-facing code ships from this
doc; C remains unstarted and clearly labeled as needing its own decision.
