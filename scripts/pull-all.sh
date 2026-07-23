#!/usr/bin/env bash
#
# Fast-forward every cloned component in ./repos to the latest of its
# manifest branch. Skips components that are not cloned yet (run
# clone-all.sh first) and warns on dirty / diverged checkouts.
#
# Usage: bash scripts/pull-all.sh

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
    echo "⚠ $name has uncommitted changes — skipping pull"
    continue
  fi

  echo "→ updating $name ($branch)"
  git -C "$target" fetch origin "$branch" --quiet
  git -C "$target" checkout "$branch" --quiet
  git -C "$target" merge --ff-only "origin/$branch"
done < "$MANIFEST"

echo "done."
