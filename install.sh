#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEX_SOURCE="$SCRIPT_DIR/shared/instructions.md"
CLAUDE_SOURCE="$SCRIPT_DIR/shared/instructions.md"
CODEX_TARGET="$HOME/.codex/AGENTS.md"
CLAUDE_TARGET="$HOME/.claude/CLAUDE.md"
BACKUP_SUFFIX=".pre-agents-config-bak"

backup_target() {
  local target="$1"

  if [ ! -e "$target" ] && [ ! -L "$target" ]; then
    return
  fi

  local backup_path="${target}${BACKUP_SUFFIX}"
  local counter=2

  while [ -e "$backup_path" ] || [ -L "$backup_path" ]; do
    backup_path="${target}${BACKUP_SUFFIX}${counter}"
    counter=$((counter + 1))
  done

  mv "$target" "$backup_path"
  echo "Backed up $target -> $backup_path"
}

ensure_link() {
  local source="$1"
  local target="$2"

  if [ ! -e "$source" ]; then
    echo "Missing source file: $source" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$target")"

  if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
    echo "Already linked: $target"
    return
  fi

  backup_target "$target"
  ln -s "$source" "$target"
  echo "Linked $target -> $source"
}

ensure_link "$CODEX_SOURCE" "$CODEX_TARGET"
ensure_link "$CLAUDE_SOURCE" "$CLAUDE_TARGET"

echo
echo "Done."
echo "Codex global instructions:  $CODEX_TARGET"
echo "Claude global instructions: $CLAUDE_TARGET"
