#!/usr/bin/env bash
#
# Show a one-line status for every component in repos.manifest:
# current branch, ahead/behind vs its upstream, and dirty file count.
#
# Usage: bash scripts/status-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/repos.manifest"
REPOS_DIR="$ROOT/repos"

printf "%-16s %-12s %-12s %s\n" "REPO" "BRANCH" "SYNC" "DIRTY"
printf "%-16s %-12s %-12s %s\n" "----" "------" "----" "-----"

while read -r name url branch _rest; do
  [[ -z "${name:-}" || "$name" == \#* ]] && continue

  target="$REPOS_DIR/$name"
  if [[ ! -d "$target/.git" ]]; then
    printf "%-16s %s\n" "$name" "(not cloned)"
    continue
  fi

  cur="$(git -C "$target" branch --show-current)"
  dirty="$(git -C "$target" status --porcelain | wc -l | tr -d ' ')"

  sync="no upstream"
  if up="$(git -C "$target" rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null)"; then
    read -r behind ahead < <(git -C "$target" rev-list --left-right --count "$up...HEAD" 2>/dev/null || echo "0 0")
    sync="↑${ahead} ↓${behind}"
  fi

  printf "%-16s %-12s %-12s %s\n" "$name" "$cur" "$sync" "$dirty"
done < "$MANIFEST"
