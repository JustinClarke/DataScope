#!/usr/bin/env bash
# DataScope documentation consistency sweep.
#
# Docs-only repo (no git). Run from anywhere:
#     bash _implementation/maintenance/sweep.sh
#
# Checks, in order:
#   1. The highest decision (Dn) in the master Decision Record.
#   2. Every "D1–Dn" range header agrees with that number (the stale-range bug
#      this sweep exists to kill — see maintenance/README.md for the 6 spots).
#   3. Master and split-tree decision records agree on the highest Dn.
#   4. Coverage: which files mention the latest decision (eyeball mirror spread).
#   5. Dangling / forward D-refs: any D-number greater than the highest Dn
#      (a typo or a reference to a decision that was never written).
#
# Exit 0 = clean, 1 = issues found. Portable to macOS bash 3.2 / BSD grep.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MASTER="$ROOT/DATASCOPE.md"
TREE="$ROOT/_implementation"
DECISIONS="$TREE/architecture/decisions.md"

fail=0

# --- 1. Highest Dn in the master Decision Record table (rows start "| D57 |"). --
MAX=$(grep -oE '^\| D[0-9]+ ' "$MASTER" | grep -oE '[0-9]+' | sort -n | tail -1)
if [ -z "$MAX" ]; then
  echo "FATAL: could not find any decision rows in $MASTER"
  exit 1
fi
echo "Latest decision in master: D$MAX"
echo

# --- 2. Every full-range header "D1–Dn" (en-dash or hyphen) must equal D$MAX. ----
echo "== [2] Range headers (D1-Dn) =="
range_bad=0
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  tok="${hit##*:}"      # trailing match, e.g. D1–D57
  n="${tok##*D}"        # strip through the last D -> 57
  if [ "$n" != "$MAX" ]; then
    echo "  STALE (expected D1-D$MAX): ${hit%:*}"
    range_bad=1
    fail=1
  fi
done <<EOF
$(grep -rnoE 'D1[–-]D[0-9]+' "$MASTER" "$TREE" --include='*.md' 2>/dev/null)
EOF
[ "$range_bad" -eq 0 ] && echo "  OK - all D1-Dn headers = D1-D$MAX"
echo

# --- 3. Split-tree decision record agrees on the highest Dn. --------------------
echo "== [3] Master vs split-tree highest Dn =="
TREE_MAX=$(grep -oE '^\| D[0-9]+ ' "$DECISIONS" | grep -oE '[0-9]+' | sort -n | tail -1)
if [ "$TREE_MAX" = "$MAX" ]; then
  echo "  OK - decisions.md also tops out at D$TREE_MAX"
else
  echo "  MISMATCH: master=D$MAX, decisions.md=D$TREE_MAX (a D-row was not mirrored)"
  fail=1
fi
echo

# --- 4. Coverage: files mentioning the latest decision. -------------------------
echo "== [4] Coverage of D$MAX across the docs =="
grep -rlw "D$MAX" "$MASTER" "$TREE" --include='*.md' 2>/dev/null | sed "s|$ROOT/||" | sort | sed 's/^/  /'
echo

# --- 5. Dangling / forward D-refs above the highest Dn. -------------------------
echo "== [5] Dangling / forward D-refs (> D$MAX) =="
dangle=0
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  tok="${hit##*:}"      # trailing match, e.g. D63
  n="${tok#D}"          # strip leading D -> 63
  case "$n" in (*[!0-9]*|'') continue;; esac
  if [ "$n" -gt "$MAX" ]; then
    echo "  ${hit%:*}  ->  $tok"
    dangle=1
    fail=1
  fi
done <<EOF
$(grep -rnoE 'D[0-9]+' "$MASTER" "$TREE" --include='*.md' 2>/dev/null)
EOF
[ "$dangle" -eq 0 ] && echo "  OK - no D-refs above D$MAX"
echo

if [ "$fail" -eq 0 ]; then
  echo "SWEEP CLEAN (D1-D$MAX consistent across master + tree)"
else
  echo "SWEEP FOUND ISSUES - see above"
fi
exit $fail
