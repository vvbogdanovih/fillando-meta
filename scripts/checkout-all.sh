#!/usr/bin/env bash
#
# Switch every cloned component to the branch declared in repos.manifest,
# fetching first and creating a tracking branch if it does not exist locally.
# Refuses to switch a repo with uncommitted changes.
#
# Usage: bash scripts/checkout-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/repos.manifest"
REPOS_DIR="$ROOT/repos"

while read -r name url branch _rest; do
  [[ -z "${name:-}" || "$name" == \#* ]] && continue

  target="$REPOS_DIR/$name"
  if [[ ! -d "$target/.git" ]]; then
    echo "• $name not cloned — run clone-all.sh"
    continue
  fi

  if [[ -n "$(git -C "$target" status --porcelain)" ]]; then
    echo "⚠ $name has uncommitted changes — skipping"
    continue
  fi

  if [[ "$(git -C "$target" branch --show-current)" == "$branch" ]]; then
    echo "✓ $name already on $branch"
    continue
  fi

  echo "→ $name: switching to $branch"
  git -C "$target" fetch origin "$branch" --quiet
  if git -C "$target" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$target" checkout "$branch" --quiet
  else
    git -C "$target" checkout -b "$branch" --track "origin/$branch" --quiet
  fi
done < "$MANIFEST"

echo "done."
