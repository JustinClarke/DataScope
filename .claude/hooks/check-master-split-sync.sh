#!/usr/bin/env bash
# Master -> split mirror check (CLAUDE.md Part II: "master-first, then mirror").
#
# Warns ONCE at Stop if _implementation/DATASCOPE.md (the master spec) has uncommitted
# changes but no _implementation/ leaf does — the "edited master, forgot to mirror" case.
# The master lives inside _implementation/, so it must be excluded from the leaf test —
# otherwise master counts as its own mirror and the check can never fire.
# Intentionally one-directional: leaf-only edits (build-status updates, leaf-local
# fixes) are legitimate and must not nag, so the reverse case is not flagged.
# Advisory only: it surfaces the reminder once, then lets the stop through — never loops.
set -euo pipefail

# Non-looping guard: if this Stop is already the result of our own block, allow it.
input="$(cat 2>/dev/null || true)"
case "$input" in
  *'"stop_hook_active":true'* | *'"stop_hook_active": true'*) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Working-tree + index changes vs HEAD; strip status prefix and rename arrows.
changed="$(git status --porcelain 2>/dev/null | sed 's/^...//; s/.* -> //')"
[ -z "$changed" ] && exit 0

master=0
leaf=0
while IFS= read -r f; do
  [ "$f" = "_implementation/DATASCOPE.md" ] && master=1
  case "$f" in
    _implementation/DATASCOPE.md) ;;
    _implementation/*) leaf=1 ;;
  esac
done <<EOF
$changed
EOF

if [ "$master" -eq 1 ] && [ "$leaf" -eq 0 ]; then
  echo "master-split sync: _implementation/DATASCOPE.md has uncommitted changes but no _implementation/ leaf does. If this master edit changes a section that leaf docs cite, mirror it before finishing (CLAUDE.md: master-first, then mirror). If it is master-only by design, this is fine — re-finish to proceed." >&2
  exit 2
fi
exit 0
