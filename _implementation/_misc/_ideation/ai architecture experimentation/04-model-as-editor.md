# 04 — Model as editor (deterministic first, polish within a diff budget)

**Thesis:** invert who writes. The **app** composes the full §4-style paragraph deterministically —
possibly clunky, definitely true. The model may only make it *read* better, and is forbidden from
introducing any content-bearing word that wasn't already there.

**Status:** untested. **Cost class:** cheapest to verify of anything in this folder — the check is a
set-inclusion test, so the session either works or fails inside an hour.

Read [`README.md`](README.md) first.

---

## What it attacks

**All three, by construction.** F1, F2 and F3 are each a *new content word* appearing in output:
"survivors" (not in the app's sentence about Pclass), "Manchester", "1912". If the model's output must
satisfy `contentWords(output) ⊆ contentWords(input)`, none of them can appear. This is the same
"unrepresentable, not rejected" logic ADR-010 uses for numbers, generalized from a headline to a
paragraph.

## Mechanism

**1. The app writes the paragraph (this is D65, done well).**

```
"This dataset has 4 tables. customers has 10420 rows. orders has 45092 rows.
 orders.order_date ranges 2021-01-04 to 2024-01-18. 0% of values are null."
```

True, complete, and stilted — which is precisely the D65 complaint, and the thing being fixed.

**2. The model is an editor, not an author.** Prompt: *rewrite for fluency; you may reorder, merge
sentences, add connectives and articles; you may not add any noun, verb, number, name or adjective
not already present.*

**3. Mechanical verification — the whole point.**

```
contentWords(out) ⊆ contentWords(in) ∪ FUNCTION_WORDS
```

where `FUNCTION_WORDS` is a **closed, small, hand-authored** list (articles, prepositions,
conjunctions, copulas, a few connectives: "and", "with", "of", "the", "is", "are", "spanning",
"across", "containing"). Anything else in the output that isn't in the input fails, and the app keeps
its own deterministic paragraph.

**Why this is stronger than [02](02-generate-then-verify.md):** the allowed set is *the app's own
sentence*, not the whole dataset. `Survived` being a real column is irrelevant if the app's sentence
about Pclass never mentioned it. F1 dies for free.

## What to build

1. `src/lib/deterministicNarrative.ts` — the honest, unpolished paragraph from
   `StructuralFacts` + baseline. **This is D65 and it is worth building regardless of which candidate
   wins**, since D65 is the control every other arm is measured against. Build this first, even if the
   editor half is later discarded.
2. `contentWordSet(text): Set<string>` — lowercase, strip punctuation, drop `FUNCTION_WORDS`, keep a
   light stemmer or none at all (**prefer none**: stemming is a widening, and "survivors"/"Survived"
   collapsing under a stemmer would let F1 back in).
3. `editorValidator(input, output): boolean`.
4. Harness arm `model-as-editor`.

## Kill criteria (pre-commit, D18)

- **(a)** F1, F2, F3 rejected as fixtures. Structurally expected; a failure means the word set leaks
  (most likely via stemming or an over-long `FUNCTION_WORDS`).
- **(b)** `FUNCTION_WORDS` ≤ 40 entries and **contains no domain nouns whatsoever**. Report the final
  list verbatim in the verdict — it is the only place this approach can be silently compromised.
- **(c)** The polish is *worth it*: blind side-by-side of app paragraph vs. edited paragraph across 5
  samples. **If a reader can't reliably prefer the edited one, ship D65 alone and delete the model
  call.** This is the criterion most likely to fail, and failing it is a genuinely good outcome —
  it retires the question cheaply.
- **(d)** Accept rate ≥ 60% (how often the model stays within budget). Below that, the user mostly
  sees the unpolished version anyway, so the feature is latency for nothing.
- **(e)** R2: N=5 per sample. Note whether *rejected* runs differ from accepted ones in any way a
  user would notice.

## Ollama run

Ideal arm for the local box: short input, short output, no tools, and the check needs no model. Iterate
`FUNCTION_WORDS` and the accept rate quickly. **Watch for the characteristic failure** — models asked
to "improve fluency" tend to add an interpretive flourish ("suggesting strong customer engagement");
that's a content word and must reject. Count how often it happens; that rate is (d).

## Porting to Cloudflare

Clean and cheap — likely **cheaper than today's arm**, since input and output are both short and no
structured parsing is involved. The verification is client-side, so safety is provider-independent;
only the accept rate (d) needs re-measuring per provider.

## What it does not solve

- **R3 reach is exactly D65's reach.** The model adds *fluency*, never *insight* — so "well-suited for
  CLV" only appears if the app's own paragraph already said it. **That means this approach's ceiling is
  set entirely by `deterministicNarrative.ts`**, and pairing it with
  [01](01-phrase-library.md)'s `detectCapabilities` is what would raise that ceiling. Cheap to combine:
  01 supplies the content, 04 makes it read well.
- Doesn't help the actions half of the seam (`rankedActionValidator` already covers re-verbing).
- If (c) fails, this approach's honest conclusion is "the AI wasn't the missing piece — the deterministic
  writing was." Which is a real answer, and the cheapest one on the board.

## Verdict

_Unrun. Append here: the seven rubric rows, fixture dispositions, accept rate, the verbatim
`FUNCTION_WORDS` list, and the blind-comparison result for (c)._
