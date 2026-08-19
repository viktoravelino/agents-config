#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTRUCTIONS_SOURCE="$SCRIPT_DIR/shared/instructions.md"
SHARED_SKILLS_DIR="$SCRIPT_DIR/shared/skills"
CODEX_INSTRUCTIONS_TARGET="$HOME/.codex/AGENTS.md"
CLAUDE_INSTRUCTIONS_TARGET="$HOME/.claude/CLAUDE.md"
CODEX_SKILLS_DIR="$HOME/.agents/skills"
CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
BACKUP_SUFFIX=".pre-agents-config-bak"

DRY_RUN=0
DO_INSTRUCTIONS=1
DO_SKILLS=1

for arg in "$@"; do
  case "$arg" in
    -n|--dry-run)
      DRY_RUN=1
      ;;
    --skills-only)
      DO_INSTRUCTIONS=0
      ;;
    --instructions-only)
      DO_SKILLS=0
      ;;
    -h|--help)
      echo "Usage: ${BASH_SOURCE[0]##*/} [options]"
      echo
      echo "Links this repo's shared config into Codex and Claude:"
      echo "  shared/instructions.md -> ~/.codex/AGENTS.md, ~/.claude/CLAUDE.md"
      echo "  shared/skills/*        -> ~/.agents/skills/, ~/.claude/skills/"
      echo
      echo "Skills are synced, not just added: links pointing at a skill that no"
      echo "longer exists are removed. Anything not managed by this script is"
      echo "left alone, and existing real files are backed up before linking."
      echo
      echo "  -n, --dry-run           show what would change, touch nothing"
      echo "      --skills-only       skip the instructions file"
      echo "      --instructions-only skip skills"
      echo "  -h, --help              show this help"
      echo
      echo "Set NO_COLOR=1 to disable colored output."
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
  GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'
else
  BOLD=""; DIM=""; RESET=""
  GREEN=""; RED=""; YELLOW=""; BLUE=""
fi

if [ "$DRY_RUN" -eq 1 ]; then
  ACT_LINK="would link"; ACT_REMOVE="would remove"; ACT_BACKUP="would back up"
else
  ACT_LINK="linked"; ACT_REMOVE="removed"; ACT_BACKUP="backed up"
fi

linked_count=0
removed_count=0
unchanged_count=0
backed_up_count=0
name_width=12

# Renders ~/.claude/skills instead of /Users/you/.claude/skills.
pretty_path() {
  local path="$1"

  case "$path" in
    "$HOME"/*) printf '~%s' "${path#"$HOME"}" ;;
    *) printf '%s' "$path" ;;
  esac
}

section() {
  local label="$1" detail="$2"

  printf '\n%s%-13s%s %s%s%s\n' \
    "$BOLD" "$label" "$RESET" \
    "$DIM" "$detail" "$RESET"
}

status_line() {
  local color="$1" glyph="$2" name="$3" note="$4"

  printf '  %s%s%s %-*s %s%s%s\n' \
    "$color" "$glyph" "$RESET" \
    "$name_width" "$name" \
    "$DIM" "$note" "$RESET"
}

track_name_width() {
  local name="$1"

  if [ "${#name}" -gt "$name_width" ]; then
    name_width="${#name}"
  fi
}

# Widest label we are about to print, so the note column lines up.
compute_name_width() {
  local dir entry

  if [ "$DO_INSTRUCTIONS" -eq 1 ]; then
    track_name_width "$(pretty_path "$CODEX_INSTRUCTIONS_TARGET")"
    track_name_width "$(pretty_path "$CLAUDE_INSTRUCTIONS_TARGET")"
  fi

  if [ "$DO_SKILLS" -eq 1 ]; then
    for dir in "$SHARED_SKILLS_DIR" "$CODEX_SKILLS_DIR" "$CLAUDE_SKILLS_DIR"; do
      [ -d "$dir" ] || continue

      for entry in "$dir"/*; do
        [ -e "$entry" ] || [ -L "$entry" ] || continue

        case "$entry" in
          *"$BACKUP_SUFFIX"*) continue ;;
        esac

        track_name_width "$(basename "$entry")"
      done
    done
  fi
}

backup_target() {
  local target="$1" label="$2"

  if [ ! -e "$target" ] && [ ! -L "$target" ]; then
    return 0
  fi

  local backup_path="${target}${BACKUP_SUFFIX}"
  local counter=2

  while [ -e "$backup_path" ] || [ -L "$backup_path" ]; do
    backup_path="${target}${BACKUP_SUFFIX}${counter}"
    counter=$((counter + 1))
  done

  [ "$DRY_RUN" -eq 1 ] || mv "$target" "$backup_path"
  backed_up_count=$((backed_up_count + 1))
  status_line "$YELLOW" "!" "$label" "$ACT_BACKUP -> $(basename "$backup_path")"
}

ensure_link() {
  local source="$1" target="$2" label="$3"

  if [ ! -e "$source" ]; then
    printf '%sMissing source: %s%s\n' "$RED" "$(pretty_path "$source")" "$RESET" >&2
    exit 1
  fi

  if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
    unchanged_count=$((unchanged_count + 1))
    status_line "$DIM" "=" "$label" "up to date"
    return 0
  fi

  backup_target "$target" "$label"

  if [ "$DRY_RUN" -eq 0 ]; then
    mkdir -p "$(dirname "$target")"
    ln -s "$source" "$target"
  fi

  linked_count=$((linked_count + 1))
  status_line "$GREEN" "+" "$label" "$ACT_LINK"
}

# Removes links this script owns (symlinks into SHARED_SKILLS_DIR) whose
# skill has been deleted or renamed. Anything else in the target directory
# is left alone.
prune_stale_links() {
  local target_dir="$1"
  local entry link_dest

  [ -d "$target_dir" ] || return 0

  for entry in "$target_dir"/*; do
    [ -L "$entry" ] || continue

    case "$entry" in
      *"$BACKUP_SUFFIX"*) continue ;;
    esac

    link_dest="$(readlink "$entry")"

    case "$link_dest" in
      "$SHARED_SKILLS_DIR"/*) ;;
      *) continue ;;
    esac

    if [ -f "$link_dest/SKILL.md" ]; then
      continue
    fi

    [ "$DRY_RUN" -eq 1 ] || rm "$entry"
    removed_count=$((removed_count + 1))
    status_line "$RED" "-" "$(basename "$entry")" "$ACT_REMOVE, source is gone"
  done
}

sync_skills_target() {
  local target_dir="$1" label="$2"
  local skill_dir skill_name

  section "$label" "$(pretty_path "$target_dir")"

  prune_stale_links "$target_dir"

  for skill_dir in "$SHARED_SKILLS_DIR"/*; do
    if [ -d "$skill_dir" ] && [ -f "$skill_dir/SKILL.md" ]; then
      skill_name="$(basename "$skill_dir")"
      ensure_link "$skill_dir" "$target_dir/$skill_name" "$skill_name"
    fi
  done
}

if [ "$DO_INSTRUCTIONS" -eq 1 ] && [ ! -f "$INSTRUCTIONS_SOURCE" ]; then
  printf '%sMissing instructions file: %s%s\n' \
    "$RED" "$(pretty_path "$INSTRUCTIONS_SOURCE")" "$RESET" >&2
  exit 1
fi

skill_total=0
if [ "$DO_SKILLS" -eq 1 ]; then
  if [ ! -d "$SHARED_SKILLS_DIR" ]; then
    printf '%sMissing shared skills directory: %s%s\n' \
      "$RED" "$(pretty_path "$SHARED_SKILLS_DIR")" "$RESET" >&2
    exit 1
  fi

  for skill_dir in "$SHARED_SKILLS_DIR"/*; do
    if [ -d "$skill_dir" ] && [ -f "$skill_dir/SKILL.md" ]; then
      skill_total=$((skill_total + 1))
    fi
  done

  if [ "$skill_total" -eq 0 ]; then
    printf '%sNo skills found in %s%s\n' \
      "$RED" "$(pretty_path "$SHARED_SKILLS_DIR")" "$RESET" >&2
    exit 1
  fi
fi

compute_name_width

printf '%sSyncing agents-config%s %sfrom %s%s' \
  "$BOLD" "$RESET" \
  "$DIM" "$(pretty_path "$SCRIPT_DIR")" "$RESET"
if [ "$DRY_RUN" -eq 1 ]; then
  printf ' %s(dry run)%s' "$BLUE" "$RESET"
fi
printf '\n'

if [ "$DO_INSTRUCTIONS" -eq 1 ]; then
  section "Instructions" "$(pretty_path "$INSTRUCTIONS_SOURCE")"
  ensure_link "$INSTRUCTIONS_SOURCE" "$CODEX_INSTRUCTIONS_TARGET" \
    "$(pretty_path "$CODEX_INSTRUCTIONS_TARGET")"
  ensure_link "$INSTRUCTIONS_SOURCE" "$CLAUDE_INSTRUCTIONS_TARGET" \
    "$(pretty_path "$CLAUDE_INSTRUCTIONS_TARGET")"
fi

if [ "$DO_SKILLS" -eq 1 ]; then
  sync_skills_target "$CODEX_SKILLS_DIR" "Codex skills"
  sync_skills_target "$CLAUDE_SKILLS_DIR" "Claude skills"
fi

printf '\n%s%s%s %s%d linked · %d removed · %d unchanged' \
  "$BOLD" "$([ "$DRY_RUN" -eq 1 ] && echo "Dry run" || echo "Done")" "$RESET" \
  "$DIM" "$linked_count" "$removed_count" "$unchanged_count"
if [ "$backed_up_count" -gt 0 ]; then
  printf ' · %d backed up' "$backed_up_count"
fi
printf '%s\n' "$RESET"
