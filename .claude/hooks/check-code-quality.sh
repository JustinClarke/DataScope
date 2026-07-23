#!/usr/bin/env bash
# Code-side quality gate — the implementation counterpart to check-master-split-sync.sh.
#
# At Stop, if any TypeScript under src/ | edge/ | eval/ changed, run the project's own
# lint + typecheck (Makefile `check` minus tests — tests are too slow for a stop gate).
# Sessions that only touch design docs pay nothing: the git check short-circuits first.
#
# Blocks on errors only. oxlint exits 0 on warnings, so the existing warning backlog
# (unicorn/no-new-array etc.) never nags — only genuine errors and type failures do.
# Advisory and non-looping: surfaces once, then lets the stop through.
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
[ -d node_modules ] || exit 0

# Working-tree + index + untracked changes vs HEAD; strip status prefix and rename arrows.
changed="$(git status --porcelain 2>/dev/null | sed 's/^...//; s/.* -> //')"
[ -z "$changed" ] && exit 0

touched_ts=0
while IFS= read -r f; do
  case "$f" in
    src/*.ts | src/*.tsx | edge/*.ts | edge/*.tsx | eval/*.ts | eval/*.tsx) touched_ts=1 ;;
  esac
done <<EOF
$changed
EOF

[ "$touched_ts" -eq 0 ] && exit 0

failures=""

if ! lint_out="$(npx --no-install oxlint src edge eval 2>&1)"; then
  failures="${failures}--- oxlint ---
${lint_out}
"
fi

if ! tsc_out="$(npx --no-install tsc -b --noEmit 2>&1)"; then
  failures="${failures}--- tsc -b --noEmit ---
${tsc_out}
"
fi

if [ -n "$failures" ]; then
  printf 'code quality: changed TypeScript does not pass the project checks. Fix these before finishing (`make check` runs the same thing plus tests).\n\n%s' "$failures" >&2
  exit 2
fi
exit 0
