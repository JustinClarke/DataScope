#!/usr/bin/env bash
# Status line: model tier · project dir · git branch. Keeps the active model
# (cost tier) and branch visible, per the project's cost-consciousness.
input="$(cat)"
model="$(printf '%s' "$input" | jq -r '.model.display_name // .model.id // "?"' 2>/dev/null)"
dir="$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // "."' 2>/dev/null)"
[ -z "$dir" ] && dir="."
base="$(basename "$dir")"
branch="$(git -C "$dir" branch --show-current 2>/dev/null || true)"
[ -n "$branch" ] && branch="  ⎇ $branch"
printf '%s · %s%s' "${model:-?}" "$base" "$branch"
