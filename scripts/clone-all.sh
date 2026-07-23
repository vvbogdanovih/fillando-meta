#!/usr/bin/env bash
# ============================================================
# clone-all.sh — Clone Fillando component repositories into ./repos
# Reads repos.manifest. Idempotent: skips repos that already exist.
# Run pull-all.sh to update existing checkouts.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/repos.manifest"
REPOS_DIR="$ROOT/repos"

if [[ ! -f "$MANIFEST" ]]; then
  echo "error: manifest not found at $MANIFEST" >&2
  exit 1
fi

mkdir -p "$REPOS_DIR"

while read -r name url branch _rest; do
  # Skip comments and blank lines
  [[ -z "${name:-}" || "$name" == \#* ]] && continue

  target="$REPOS_DIR/$name"
  if [[ -d "$target/.git" ]]; then
    echo "✓ $name already cloned — skipping"
    continue
  fi

  echo "→ cloning $name ($branch)"
  git clone --branch "$branch" "$url" "$target"
done < "$MANIFEST"

echo ""
echo "Done. Run 'bash scripts/sync-env.sh' to distribute environment variables."
