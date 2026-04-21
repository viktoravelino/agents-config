#!/bin/bash
# Symlinks agents-config repo dirs into ~/.claude

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

ITEMS=(agents commands skills CLAUDE.md)

for item in "${ITEMS[@]}"; do
  target="$CLAUDE_DIR/$item"
  source="$REPO_DIR/$item"

  # Skip if source doesn't exist in repo
  [ ! -e "$source" ] && continue

  # Already correctly symlinked — skip
  if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
    echo "✓ $item already linked"
    continue
  fi

  # Back up existing file/dir (not symlinks)
  if [ -e "$target" ] || [ -L "$target" ]; then
    echo "  Backing up $target → $target.bak"
    mv "$target" "$target.bak"
  fi

  ln -s "$source" "$target"
  echo "✓ Linked $item"
done
