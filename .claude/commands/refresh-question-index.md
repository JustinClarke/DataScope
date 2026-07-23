---
description: Audit _implementation/meta/question-index.md against the current DATASCOPE.md and _implementation/ tree, then patch any gaps found.
---

You are auditing `_implementation/meta/question-index.md` — the answer-index that tells an
agent/newcomer/reviewer where to look for any question about DataScope. The project evolves
(new sections, new D-rows, new leaf docs, renamed files) faster than a manually-maintained
index does. Your job is to find drift and fix it, in this single inline pass. Do not spawn
`scout`, `design-reviewer`, or `synthesizer` for this — it's mechanical inventory and diffing,
not design judgment, and the project's cost-tiering rule reserves those for real design work.

## 1. Inventory the current state

- `DATASCOPE.md`: list every `## N. Title` heading and the Appendices (A/B/C).
- `DATASCOPE.md` §0 Decision Record: find the highest `Dn` row currently in the table (grep
  `^\| D[0-9]+ \|`). This is the ceiling — anything citing a higher D-number is stale, and
  anything above the previous ceiling but at or below this one is new and may be uncited.
- `_implementation/**/*.md`: full file listing (all of `product/`, `architecture/` including
  `adr/`, `foundations/`, `build/**`, `backlog/`, `meta/`).

## 2. Diff against the index

For each item above, check whether `_implementation/meta/question-index.md` cites it
anywhere (path or `Dn`/`§n` token match, case-insensitive substring is fine — this doesn't
need to be exact). Build two lists:

- **Uncited**: master sections, D-rows, or leaf docs that exist but the index never
  mentions.
- **Stale**: citations in the index pointing at a `§n`/`Dn` that no longer exists, or a file
  path that's been moved/renamed/deleted (verify with a real file check, not assumption).

## 3. Patch the index

- Add uncited items into the right existing section (`Source of truth by topic`, the
  numbered `Question bank`, or `Quick answer map`) — follow the file's existing structure and
  tone, don't restructure it wholesale.
- All internal links in this file are relative from `_implementation/meta/`: `../../DATASCOPE.md`
  for the master spec, `../<folder>/...` for everything else in `_implementation/`, and a bare
  filename for its sibling `technical-overview.md`. Keep that convention.
- Fix stale citations rather than deleting the question — point them at wherever the content
  actually moved to now.
- If an ADR's `Status:` line has flipped from "Pending" to resolved, update the "mostly
  pending, not settled" framing in the index (`How to use this file` point 6, the `8a)`
  section header, and the closing `Rule of thumb`) so it stops calling a settled ADR pending.
- Never edit the text of any Decision Record row in `DATASCOPE.md` itself (settled, human-instruction-only per
  `CLAUDE.md`) — you are only ever adding a citation *to* a decision, never editing the
  decision.

## 4. Report, don't silently expand scope

If you find drift that's outside `question-index.md`'s own job — e.g. `DATASCOPE.md`
Appendix C's tree listing omitting real files, or a leaf doc's own citations of `§n` being
wrong — fix it if it's a one-line factual/mechanical correction (a stale number, a moved
path). If it looks like a real inconsistency needing judgment (content disagreement, not just
a stale pointer), stop and report it to the user instead of fixing it inline — that's
`design-reviewer` territory, not this command's.

End with a short summary: what was added, what was fixed, and anything flagged but left for
the user to decide.
