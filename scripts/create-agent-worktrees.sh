#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${1:-codex/integration}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT_DIR="$(dirname "$REPO_DIR")"

declare -a AGENTS=(
  "codex/intake-selection:still-with-intake"
  "codex/space-pipeline:still-with-space"
  "codex/pet-media-state:still-with-pet"
  "codex/experience-3d-chat:still-with-experience"
)

if ! git -C "$REPO_DIR" rev-parse --verify "$BASE_BRANCH" >/dev/null 2>&1; then
  echo "Base branch '$BASE_BRANCH' does not exist."
  echo "Create and merge the foundation branch first, then rerun this script."
  exit 1
fi

for entry in "${AGENTS[@]}"; do
  branch="${entry%%:*}"
  dirname="${entry##*:}"
  path="$PARENT_DIR/$dirname"

  if [ -e "$path" ]; then
    echo "Skipping existing path: $path"
    continue
  fi

  if git -C "$REPO_DIR" rev-parse --verify "$branch" >/dev/null 2>&1; then
    git -C "$REPO_DIR" worktree add "$path" "$branch"
  else
    git -C "$REPO_DIR" worktree add -b "$branch" "$path" "$BASE_BRANCH"
  fi

  if [ -f "$REPO_DIR/.env" ] && [ ! -e "$path/.env" ]; then
    ln -s "$REPO_DIR/.env" "$path/.env"
  fi

  echo "Created $branch at $path"
done

echo "Done. Launch each agent in its own worktree and assign the matching section from AGENT_WORKTREE_PLAN.md."
