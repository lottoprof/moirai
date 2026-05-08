#!/bin/bash
# Install moirai git hooks into .git/hooks/.
# Run from repo root: bash scripts/git-hooks/install.sh

set -e

cd "$(git rev-parse --show-toplevel)"

if [ ! -d .git/hooks ]; then
  echo "[install] .git/hooks not found — are you inside a git work tree?" >&2
  exit 1
fi

for hook in pre-commit pre-push; do
  src="scripts/git-hooks/$hook"
  dst=".git/hooks/$hook"
  install -m 0755 "$src" "$dst"
  echo "[install] $dst"
done

echo "[install] done"
