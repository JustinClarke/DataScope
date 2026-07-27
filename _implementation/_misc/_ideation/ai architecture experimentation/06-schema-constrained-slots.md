# 06 — Constrained decoding into typed slots

**Thesis:** don't validate the model's output — make invalid output **impossible to generate**. Constrain
decoding to a JSON schema whose content-bearing fields are closed enums referencing fact ids, then render
prose deterministically from the filled structure.

**Status:** untested, and **gated on a platform capability check** — do that first (see below) before
committing a session. **Cost class:** cheap at runtime if supported; wasted session if not.

Read [`README.md`](README.md) first.

---

## Why this is architecturally different from the others

Every other candidate here is **generate → check → maybe reject**. This one moves enforcement to
**decode time**: the sampler is only permitted to emit tokens that keep the output valid against a
grammar. "Manchester" is not rejected — it is never sampleable, because the `domain` field's type is an
enum of five strings and none of them is a city.

This matches ADR-010's own strongest language ("an invented claim is *unrepresentable in the output
format*, not merely rejected at runtime"), extended from the reassembly step to generation itself. If it
works, it is the tightest guarantee in the folder **and** it eliminates the reject/degrade path entirely
— there is nothing to reject, so R2 determinism and false-reject rate both stop being problems.

## Check this before anything else

**Does the serving path support grammar/schema-constrained decoding?**

- **Ollama:** supports structured outputs via a JSON-schema `format` parameter. **Verify the installed
  server version actually honours it** with a one-line curl against
  `http://100.126.157.97:11434/v1/chat/completions` (or `/api/chat`) before building anything.
- **Cloudflare Workers AI:** support varies by model, and `edge/ai/synthesisProvider.ts` currently uses
  the AI binding with a plain prompt. **Do not assume.** Load the `cloudflare` skill and check current
  docs for JSON-mode / structured-output support on the pinned `DEFAULT_AI_MODEL`
  (`edge/adapters.ts`) — and if Workers AI does not support it, **record that as the finding and stop**:
  a mechanism that only works on Ollama fails rubric **R6 (portability)** and cannot ship as the primary
  path.

There is a **soft fallback** if Cloudflare lacks grammar support: ask for the same JSON and *validate*
it strictly (structure, enum membership, arity) rather than constraining generation. That degrades this
approach into a strict-schema variant of [01](01-phrase-library.md) — still safe, just no longer
"unrepresentable by construction". Note which mode each provider ran in.

## Mechanism

```ts
// Every content-bearing field is an enum or an id reference. No free strings.
interface SynthesisSlots {
  domain: 'ecommerce' | 'timeseries' | 'survey' | 'transactional' | 'observational' | 'unknown'
  spanFrom: FactId | null        // must reference a Temporal minDate fact
  spanTo:   FactId | null
  entityCounts: FactId[]         // each must reference a rowCount fact
  suitedFor: Array<'clv' | 'churn' | 'seasonality' | 'cohort-retention'
                   | 'group-comparison' | 'correlation-study'>
  headlineFact: FactId           // which fact to lead with
}
```

The app then renders the paragraph from the slots — the model contributes **structured judgement**
(which domain, which analyses, which fact leads) and **zero prose**. `unknown` must be a first-class,
frequently-correct answer; a schema with no escape hatch forces a guess, which is how fabrication gets
re-invented under a different name.

## What to build

1. The platform capability check above. **Timebox it and stop if it fails on Cloudflare.**
2. `SynthesisSlots` + a JSON schema, with every `FactId` validated against the actual fact table (an
   in-schema-but-nonexistent id must still be rejected — the grammar constrains *shape*, not *existence*).
3. A deterministic renderer, slots → paragraph. Shares surface with
   [04](04-model-as-editor.md)'s `deterministicNarrative.ts`; reuse rather than fork.
4. Harness arm `constrained-slots`, recording which mode (constrained vs. validated) each provider used.

## Kill criteria (pre-commit, D18)

- **(a)** R6: works on **both** Ollama and Workers AI, in whichever mode. Cloudflare-unsupported and
  no acceptable fallback ⇒ approach fails.
- **(b)** Zero fabrications — expected by construction. Any failure means a free-text field leaked into
  the schema; find it rather than tuning it.
- **(c)** `domain` is right, or honestly `unknown`, on all five samples. **A confident wrong domain is
  this approach's fabrication equivalent** — e.g. titanic classified `ecommerce` is a hard fail, while
  titanic → `observational` or `unknown` is a pass.
- **(d)** `suitedFor` values are actually supported by the data present: `seasonality` on a dataset with
  no Temporal column is a fail regardless of how the enum was constrained (this is why `FactId`
  references must be checked for existence, not just shape).
- **(e)** R2, N=5: does the slot fill stay stable? Structured output should be **markedly** more stable
  than prose — if it isn't, that's an important negative result about the whole "structure it" family.

## Ollama run

Good arm for the 14B code-tuned model — schema-constrained JSON is its strong suit, which also makes it
a **generous** test: a good result here says less about Cloudflare than usual. Weight (a) heavily.

## Porting to Cloudflare

**The entire risk of this approach.** If the pinned model supports schema-constrained output, this ports
well and cheaply. If not, it becomes the validated-JSON fallback and its distinctive advantage
disappears. Settle this on day one.

## What it does not solve

- **R5/R7:** a closed enum can only describe dataset shapes someone anticipated — same coverage ceiling
  as [01](01-phrase-library.md), with the same `unknown`-heavy tail on unusual data.
- **F1 specifically:** `headlineFact` picks *which* fact leads, but if the renderer's template phrases it,
  misattribution is a **renderer bug**, not a model failure. Different problem, still a problem — and
  worth stating in the verdict, since it means the F1 class doesn't disappear, it relocates into code the
  team owns (which is a genuine improvement).
- Reads as templated as [01](01-phrase-library.md); combine with [04](04-model-as-editor.md) for fluency
  if it wins.

## Verdict

_Unrun. Append here: the platform-support answer per provider (and mode used), the seven rubric rows, the
`domain` correctness table, and R2 stability versus the prose arms._
