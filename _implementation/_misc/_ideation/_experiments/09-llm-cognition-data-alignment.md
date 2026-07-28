# 09 — LLM Cognition & Data Structure Alignment

**Thesis:** The previous experiments (01–08) assume the model is a fixed, opaque function — feed it the right data shape and it narrates. That's false. The model has *distinct cognitive modes* (factual recall, pattern completion, reasoning, abstraction), and each responds differently to different data structures. Experiment 08's post-verdict critique ("the mechanism is validated; the composition mechanism is not") is itself data: we now know citation binding works, but determinism (R2) and fact-selection (i) both failed because **the model was doing selection, not narration**. That's not a mechanism failure — that's a mode mismatch.

This experiment measures *what mode the model is in* when it reads your data, and designs the data feed for that mode, not hoping the model stays in narration mode while you hand it a shopping list.

**Status:** unbuilt, design phase. **Cost class:** moderate build (live probes + mode detection), cheap at runtime (one model call, same as 08). **Scope:** understand LLM behavior empirically, then **propose** a redesigned 08-based mechanism, not necessarily build it this pass.

---

## The observation 08 didn't measure

When 08 hands the model a rich fact table (17–64 facts per dataset) with citation binding, what is the model actually doing?

**Three possibilites:**

1. **Narrating:** model reads facts, picks the most important few, states them in prose.
2. **Reasoning:** model cross-references facts, derives new insights, composes a narrative.
3. **Abstracting:** model treats facts as a language model's natural input — a seed for pattern completion — and generates prose that is *statistically consistent with the fact set* but not logically derived from it.

08's citation check verified that all claims cite valid facts (mode 1 or 2). But **it didn't distinguish between them**. The model could be in any of these modes and still pass citation binding, because:

- Mode 1 (narrating): "Pclass explains 70% of fare variation" cites the variance-explained fact cleanly.
- Mode 2 (reasoning): "Since Pclass explains 70% of variation and Embarked explains only 2%, Pclass dominates survival sorting" — still cites valid facts, but adds reasoning.
- Mode 3 (abstracting): "Pclass exhibits strong predictive power relative to embarking port, explaining a 35-fold variation gap..." — pattern-completes with plausible-sounding numbers that happen to cite existing facts *by luck*, because the model pattern-completed in a way that overlapped the fact set.

Mode 1 + mode 2 are safe (different outcomes, both within scope). Mode 3 is the original failure case — the model is not using facts as ground truth, it's using them as a statistical prior for generation.

**Experiment 08 achieved cite-binding (stops mode 3 from *lying uncaught*), but didn't diagnose which mode the model is in, and didn't design the input to keep it in a specific mode.**

---

## How to measure mode

**Core probe:** give the model a fact table with intentional variants and measure if it sticks to the *literal facts* or drifts into *plausible abstractions*.

```
Condition A (ground truth): fact = {id: "stat:fare.Pclass.variance", value: 0.704}
Condition B (corrupted):    fact = {id: "stat:fare.Pclass.variance", value: 0.312}
Condition C (deleted):      fact MISSING from table entirely
Condition D (negated):      fact = {id: "stat:fare.Pclass.variance", value: 0.003}
```

Run the same prompt on the same model, same rig, N=5 each, and measure:

- **When A is true**: does the model state "70%" or nearby, every time? (ground truth adherence)
- **When B is sent (lie to the model)**: does the model cite the false value (31%), or does it "correct" it back to something it "knows" is true? (detection of training-data override)
- **When C is deleted**: does the model say "no fact to cite" and skip the claim, or does it state a plausible value anyway? (gap-filling from training data)
- **When D is negated**: does it cite the negated value (0.3%), or reject it as absurd? (consistency checking vs. pattern-completion)

**What each outcome means:**

| Condition | Model states cited value | Model states different value | Skip/reject |
| :--- | :--- | :--- | :--- |
| **A (ground)** | Narrating (mode 1) | Pattern-completing (mode 3) | Strict safety (mode 2 with verification) |
| **B (lie)** | Accepts lie (mode 3 in play) | **Red flag:** model *knows* truth, overrides data input (training data is stronger signal) | Ideal (rejects bad data) |
| **C (missing)** | Should not happen | Model is gap-filling from training data (mode 3) | Ideal (refuses to claim) |
| **D (negated)** | Accepts negated (mode 3 or mode 2 not checking) | Model notices contradiction (mode 2) | Ideal (rejects absurd) |

**This is a four-cell truth table per dataset × model × fact-kind, not exhaustive, but fast to run.**

---

## Why mode matters for data feeding

Once you know the mode, the optimal input structure follows directly:

**Mode 1 (narrating):** The model is a passive render engine. Input optimization:
- Highly compressed facts (one sentence per fact).
- High signal:noise ratio (remove facts that won't appear in output).
- Explicit priority ranking (model ignores it in narration mode, but lower noise helps anyway).

**Mode 2 (reasoning):** The model is building a logical picture. Input optimization:
- Relational structure (fact A connects to fact B; here's why they matter together).
- Explicit negatives ("X does NOT correlate with Y").
- Causal language, not just correlations ("predicts" vs. "correlates").

**Mode 3 (abstracting):** The model is pattern-completing. Input optimization:
- This mode is incompatible with grounding; the data is only a statistical prior.
- Either force the model into mode 1 (cite-and-narrate-only constraint, which 08 tried), or redesign the input to *not invite* mode 3 (structural changes, see below).

---

## Proposed data-feeding redesign

Based on mode detection, redesign the prompt to nudge the model into mode 1 (narrating, the safest for a fact-bound system):

### Current 08 prompt (triggers mode 1 or 3, unclear which):

```
You are describing a dataset.
You receive COMPUTED FACTS (verified statistics).
For each sentence, output (text, cites) pairs.
```

### Proposed 09 prompt (explicit mode 1 constraint):

```
You are a DATA REPORTER, not an analyst.

Your role:
- Read each fact in the table below
- Report what it says, word-for-word or close paraphrase
- Do NOT infer relationships, explain causation, or reason across facts
- Do NOT fill gaps with outside knowledge
- Treat the fact table as exhaustive: if a claim requires a fact not listed, do not make the claim

For each sentence, cite which fact row it came from.
Never state a number that is not in some fact's value set.
Answer only with well-formed JSON.
```

**Behavioral difference:** "data reporter" is a role constraint that nudges toward narrating. "Word-for-word or close paraphrase" is a *parsing* task (mode 1), not a "generate fluent prose" task (mode 3). "Never state a number not in the value set" is explicit and checkable, not aspirational.

**Cost:** the prose may be more stilted (closer to fact-table language, less fluent). Benefit: determinism (R2) should improve if the model is narrating, not selecting.

---

## What to build

1. **`eval/09-cognition-mode/modeProbe.ts`** — the four-condition experiment above.
   - Take an existing dataset + fact table (reuse 08's output for titanic).
   - Variants A/B/C/D per fact-kind (start with aggregate, group-breakdown, variance-explained).
   - Run each variant N=5 on the 14B rig.
   - Extract: does the model state the literal value, a different value, or skip?
   - Tabulate outcomes by condition × fact-kind.

2. **`eval/09-cognition-mode/modeVsProseQuality.ts`** — cross-reference mode detection with 08's R2/R3 results.
   - Take the 50 runs from 08 (5 datasets × 2 arms × 5 repeats).
   - For each run, infer likely mode from the claims made (do they stick to literal fact values, or embellish?).
   - Correlate inferred mode with R2 (determinism) and R3 (reach).
   - If mode 1 (narrating) correlates with higher R2, that's evidence for the redesigned prompt.

3. **`eval/09-cognition-mode/roleConstraintPrompt.ts`** — build the "data reporter" prompt variant.
   - Side-by-side test against 08's prompt on the same titanic fixture, N=5.
   - Compare R1 (fabrication), R2 (determinism), prose quality.
   - Measure token count (tighter role constraint might compress or expand tokens).

4. **`eval/09-cognition-mode/RESULTS.json`** — output.
   - Mode-probe results (table per dataset/fact-kind, what the model said given each variant).
   - Correlation analysis (mode vs. R2/R3 from 08).
   - Role-constraint comparison (08 vs. 09 prompt, 5-sample side-by-side on titanic).

5. **`eval/09-cognition-mode/README.md`** — design doc.
   - Statement of modes (what they are, how to detect them).
   - Hypothesis (mode 1 is safest + most deterministic; role constraint nudges toward mode 1).
   - Findings (which modes actually occurred, which prompt nudged toward mode 1, effect on R2/R3).

---

## Why this matters

**08 is mechanically sound but behaviorally opaque.** Citation binding catches lies; it doesn't guarantee the model is doing what you think (narrating from facts, not embellishing). This experiment cracks open that black box.

If the mode-probe finds:
- **Mostly mode 1 (narrating):** 08 is working as designed. R2 failures are a composition problem (too many facts to choose from), not a mode problem. Role constraint is a nice-to-have, not necessary.
- **Mostly mode 3 (abstracting):** Citation binding is a speed bump, not a guard rail. The model is reading facts as a statistical prior, not as ground truth. Role constraint becomes essential; 08's current design doesn't fix the root problem.
- **Mixed modes (dataset-dependent):** The "eventfulness" detector in 08's adaptive-compute section becomes not an optimization, but a mode selector — send different input shapes for datasets where the model drifts toward mode 3.

**This is the mechanistic understanding that 08 left on the table.** Knowing the mode lets you design the input, not hope it works.

---

## Relationship to the 08 post-verdict critique

The post-verdict critique said: "The determinism (R2) and fact-dump (i) failures are the same root cause — the model is doing *selection*, not narration. The fix is fact-*selection*: move choice out of the model and into deterministic code."

**That's not wrong, but it's not the deepest answer.** Selection and narration are *modes of the same model*. The model is in selection mode because the prompt and fact-set structure invites it. The post-verdict's proposed fix (deterministic fact-selection + model-narration-only) is correct *if* the model will actually narrate when told to. This experiment verifies that assumption.

If the role-constraint probe shows the model narrates more consistently, the deeper fix is: **design the input (prompt + fact shape) to nudge the model into mode 1, not just hope it stays there.**

---

## Kill criteria (pre-commit, D18)

- **(a)** Mode-probe distinguishes between conditions A/B/C/D on at least one fact-kind × dataset, with directional differences (mode 1 = literal values, mode 3 = embellished/gap-filled).
- **(b)** Mode-vs-R2 correlation is either clear (mode 1 → higher R2, r > 0.5) or clear in the opposite direction (mode 3 → lower R2). Mixed/absent correlation is inconclusive, not a pass.
- **(c)** Role-constraint prompt produces either (i) higher R2 with no loss in reach, or (ii) comparable R2/reach with tighter prose quality (hand-read, less fact-dumping). If it worsens R2 without improving reach, it's a failed intervention, not a tuning parameter.
- **(d)** The RESULTS and README articulate which mode was dominant on which datasets, and whether the redesigned prompt moved the needle. Don't gloss over "mode unclear" cases — report them as open.

---

## How this ties back to product

**If mode 1 (narrating) is achievable via role constraint:**
- Redesign 08 with the reporter prompt.
- Expect tighter, more deterministic prose.
- R3 reach may stay the same or improve (the reporter is narrating the same facts, not fewer facts).
- Citation binding stays the mechanism; role constraint is the input design that makes it work reliably.

**If mode 3 (abstracting) is dominant and role constraint fails to shift it:**
- Citation binding is not enough. The model is using facts as a prior, overriding them with training-data knowledge.
- 08 can ship as-is (grounding is better than none), but the Invariant 1 override is not the slam-dunk it looked like.
- Possible paths: smaller model (1.5B local tier) may be more narration-prone; frontier model (Mistral-large/Claude) may be less; or the cite-only discipline needs more aggressive enforcement (e.g., constrained decoding from fact ids at the token level).

**If mode is dataset-dependent:**
- The adaptive-compute depth section of 08 was right, but for a different reason.
- Send different prompt variants (narrator vs. analytical) based on detected properties of the fact table or prior mode probes.
- Curated fact-set breadth (08's current setting) may be exactly right — not because it saves tokens, but because it nudges the model toward narration.

All three outcomes are results worth shipping to the product team, because they move from "hope it works" to "here's why it works."
