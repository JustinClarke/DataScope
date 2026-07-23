# CLAUDE.md

Two halves: **general behavioral guidelines** (Part I — how to work) and the **DataScope
design workspace** rules (Part II — this project's specifics). Part II governs where the two
touch; otherwise both apply.

---

# Part I — Behavioral guidelines

Guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as
needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require
constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to
overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Part II — DataScope design workspace

Design-plus-implementation workspace. **Design** is docs: `_implementation/DATASCOPE.md` is the living
master spec and `_implementation/` is the split tree derived from it (leaf docs cite master
sections as `§n` / `A.n`); every doc change lands **master-first, then mirrored** into the
citing leaf docs, and `_implementation/meta/question-index.md` maps any question to where its
answer lives — consult it first. **Implementation** now exists as real code built from that
spec — `src/` (client app), `edge/` (Cloudflare Workers), `eval/`, `infra/` (Terraform) —
which is reviewed as code, not through the design pipeline below. The Decision Record
(D1–D70) is settled — never edit it without an explicit human instruction.

## Tiered agent workflow

Model tiers are deliberate — don't substitute:

| Stage | Agent | Model | Use for |
| :--- | :--- | :--- | :--- |
| Research | `scout` | Sonnet | Low-level fact-finding, doc inventories, cross-reference checks, external platform/library verification. Read-only. |
| Review | `design-reviewer` | Opus | Adversarial review of a design area or change set; severity-ranked findings with proposed doc changes. Read-only. |
| Synthesis | `synthesizer` | Opus | Applying an *accepted* finding set as doc edits, master-first. |
| Finalize | `finalizer` | Fable | Last-pass gate. **Skip the spawn when the main session is already Fable 5 — finalize inline.** |

Rules:

- **Strictly sequential, no fan-out.** One agent live at a time, run synchronously; each
  stage consumes the previous stage's output. Never parallelize scouts "to be thorough".
- One focused task per spawn: explicit file paths in, explicit scratchpad output path out.
  Pass large context between stages as scratchpad files, not giant prompts.
- The orchestrating session (not the synthesizer) triages review findings into
  accepted/rejected before synthesis, and reviews the final diff. Commit or stash the
  working tree before letting the synthesizer edit, so the finalization diff is checkable
  via `git diff`.
- Trivial single-file questions don't need the pipeline — just answer them; the pipeline
  is for design changes and reviews.
- **Orchestrate cost as deliberately as the pipeline stages do.** Reserve Opus/Fable for
  genuine design judgment (adversarial review, synthesis, final orchestration/triage);
  don't reflexively reach for the top-tier model for work that doesn't need it. Below
  that, the orchestrating session (Fable) picks whichever cheaper model — Haiku or Sonnet
  — fits the task's difficulty: trivial lookups/fact-checks can go to Haiku, multi-step
  research or inventories to Sonnet (`scout`). This applies even outside a formal
  pipeline run.

## Efficiency rules

Agent spawns and long contexts are the two real cost drivers on this project — measured,
not assumed (Justin's own usage breakdown showed >150k-context sessions and subagent-heavy
sessions as the two biggest contributors, `general-purpose` alone a chunk of that). Default
accordingly:

- **Default to inline, not a spawn.** For a single build-order item (a leaf doc under
  `_implementation/build/`), do the research, the edit, and the check yourself in the
  current session — don't spawn `scout`/`Explore`/`general-purpose` to go re-read files
  you can just read. Only reach for the formal pipeline (above) when the task is genuinely
  a cross-cutting design change or adversarial review, not a normal build step.
- **Never spawn `general-purpose`** on this project. It's the least targeted and most
  expensive fallback — if a task doesn't fit `scout`/`design-reviewer`/`synthesizer`/
  `finalizer`/`Explore`, that's a signal to do it inline, not to reach for the catch-all.
- **No agent "just to check" or "to be thorough."** An agent spawn re-derives context
  cold; that's the expense. If you already have the answer from files already read this
  session, don't spawn something to confirm it.
- **Keep sessions lean.** Don't let one session's context run long past the point where
  the task at hand has changed — suggest `/compact` or `/clear` at a natural boundary
  (e.g. between finishing one build-order item and starting an unrelated one) rather than
  carrying a growing transcript into unrelated work.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships. It covers the **TypeScript codebase** (`src/`, `edge/`, `eval/`) built by AST extraction — the design docs (`_implementation/`, master included) are not in it, so use the question-index for design questions and graphify for code questions. When the user types `/graphify`, use the installed graphify skill (`.claude/skills/graphify/SKILL.md`) before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
