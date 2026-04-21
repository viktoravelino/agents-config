#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_SKILLS_DIR="$SCRIPT_DIR/shared/skills"
CODEX_TARGET_DIR="$HOME/.agents/skills"
CLAUDE_TARGET_DIR="$HOME/.claude/skills"
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

ensure_skill_link() {
  local source_dir="$1"
  local target_dir="$2"
  local skill_name

  skill_name="$(basename "$source_dir")"

  if [ ! -f "$source_dir/SKILL.md" ]; then
    echo "Missing SKILL.md for $skill_name at $source_dir" >&2
    exit 1
  fi

  mkdir -p "$target_dir"

  local target="$target_dir/$skill_name"

  if [ -L "$target" ] && [ "$(readlink "$target")" = "$source_dir" ]; then
    echo "Already linked: $target"
    return
  fi

  backup_target "$target"
  ln -s "$source_dir" "$target"
  echo "Linked $target -> $source_dir"
}

if [ ! -d "$SHARED_SKILLS_DIR" ]; then
  echo "Missing shared skills directory: $SHARED_SKILLS_DIR" >&2
  exit 1
fi

found_skill=0
for skill_dir in "$SHARED_SKILLS_DIR"/*; do
  if [ -d "$skill_dir" ] && [ -f "$skill_dir/SKILL.md" ]; then
    found_skill=1
    ensure_skill_link "$skill_dir" "$CODEX_TARGET_DIR"
    ensure_skill_link "$skill_dir" "$CLAUDE_TARGET_DIR"
  fi
done

if [ "$found_skill" -eq 0 ]; then
  echo "No skills found in $SHARED_SKILLS_DIR" >&2
  exit 1
fi

echo
echo "Done."
echo "Codex skills directory:  $CODEX_TARGET_DIR"
echo "Claude skills directory: $CLAUDE_TARGET_DIR"
echo
echo "Verify with:"
echo "  ls -l $CODEX_TARGET_DIR"
echo "  ls -l $CLAUDE_TARGET_DIR"
