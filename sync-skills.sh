#!/usr/bin/env bash

# Keeps skills vendored from other repositories in sync with their source.
#
# shared/skill-sources.json records, per external skill, the repo, the path
# inside it, the ref to follow, and the upstream commit the current copy was
# taken from. Skills without an entry are treated as authored here.
#
#   sync-skills.sh check  [name...]              report drift, touch nothing
#   sync-skills.sh update [name...] [--force]    pull upstream in, bump the pin
#   sync-skills.sh add <repo> <path> [--as name] [--ref ref]
#
# Upstreams are fetched into blob-less bare clones under
# ~/.cache/agents-config/skills; the cache is disposable.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/shared/skill-sources.json"
SKILLS_DIR="$SCRIPT_DIR/shared/skills"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/agents-config/skills"

COMMAND=""
DRY_RUN=0
FORCE=0
ADD_NAME=""
ADD_REF="main"
NAMES=()
POSITIONAL=()

usage() {
  echo "Usage: ${BASH_SOURCE[0]##*/} <command> [options]"
  echo
  echo "Keeps skills copied from other repositories in sync with their source."
  echo "Sources are recorded in shared/skill-sources.json."
  echo
  echo "Commands:"
  echo "  check  [name...]           report skills behind upstream or edited locally"
  echo "  update [name...]           copy upstream in and bump the pinned commit"
  echo "  add <repo> <path>          vendor a new skill and record where it came from"
  echo
  echo "Options:"
  echo "  -n, --dry-run              show what would change, touch nothing"
  echo "      --force                update even when the local copy has edits"
  echo "      --as <name>            (add) directory name, defaults to basename of <path>"
  echo "      --ref <ref>            (add) branch or tag to follow, defaults to main"
  echo "  -h, --help                 show this help"
  echo
  echo "check exits non-zero when anything is behind, modified, or broken."
  echo "Set NO_COLOR=1 to disable colored output."
}

while [ $# -gt 0 ]; do
  case "$1" in
    check|update|add)
      if [ -n "$COMMAND" ]; then
        echo "Only one command allowed, got '$COMMAND' and '$1'" >&2
        exit 1
      fi
      COMMAND="$1"
      ;;
    -n|--dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    --as)
      [ $# -ge 2 ] || { echo "--as needs a value" >&2; exit 1; }
      ADD_NAME="$2"; shift
      ;;
    --ref)
      [ $# -ge 2 ] || { echo "--ref needs a value" >&2; exit 1; }
      ADD_REF="$2"; shift
      ;;
    -h|--help) usage; exit 0 ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *) POSITIONAL+=("$1") ;;
  esac
  shift
done

if [ -z "$COMMAND" ]; then
  usage >&2
  exit 1
fi

for tool in git jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing required tool: $tool" >&2
    exit 1
  fi
done

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
  GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'
else
  BOLD=""; DIM=""; RESET=""
  GREEN=""; RED=""; YELLOW=""; BLUE=""
fi

name_width=12

# Renders ~/.cache/... instead of /Users/you/.cache/...
pretty_path() {
  local path="$1"

  case "$path" in
    "$SCRIPT_DIR"/*) printf '%s' "${path#"$SCRIPT_DIR"/}" ;;
    "$HOME"/*) printf '~%s' "${path#"$HOME"}" ;;
    *) printf '%s' "$path" ;;
  esac
}

# git@github.com:owner/repo.git -> owner/repo
pretty_repo() {
  printf '%s' "$1" | sed -E 's#^(git@[^:]+:|[a-z]+://[^/]+/)##; s#\.git$##'
}

status_line() {
  local color="$1" glyph="$2" name="$3" note="$4"

  printf '  %s%s%s %-*s %s%s%s\n' \
    "$color" "$glyph" "$RESET" \
    "$name_width" "$name" \
    "$DIM" "$note" "$RESET"
}

# Continuation lines under a status_line, aligned with the note column.
detail_line() {
  printf '  %*s %s%s%s\n' "$((name_width + 1))" "" "$DIM" "$1" "$RESET"
}

track_name_width() {
  if [ "${#1}" -gt "$name_width" ]; then
    name_width="${#1}"
  fi
}

manifest_names() {
  jq -r 'keys[]' "$MANIFEST"
}

manifest_field() {
  local name="$1" field="$2"

  jq -re --arg n "$name" --arg f "$field" '.[$n][$f]' "$MANIFEST" 2>/dev/null
}

require_manifest() {
  if [ ! -f "$MANIFEST" ]; then
    printf '%sMissing manifest: %s%s\n' "$RED" "$(pretty_path "$MANIFEST")" "$RESET" >&2
    exit 1
  fi

  if ! jq -e 'type == "object"' "$MANIFEST" >/dev/null 2>&1; then
    printf '%sManifest is not a JSON object: %s%s\n' "$RED" "$(pretty_path "$MANIFEST")" "$RESET" >&2
    exit 1
  fi
}

# Bare, blob-less clone per repo; blobs are fetched lazily when archived.
cache_for() {
  local repo="$1" slug

  slug="$(printf '%s' "$repo" | sed -E 's#^(git@[^:]+:|[a-z]+://[^/]+/)##; s#\.git$##; s#[^A-Za-z0-9._-]+#-#g')"
  printf '%s/%s' "$CACHE_DIR" "$slug"
}

# Ensures the cache exists and FETCH_HEAD points at origin/<ref>.
# Prints the fetched commit.
fetch_upstream() {
  local repo="$1" ref="$2" cache

  cache="$(cache_for "$repo")"

  if [ ! -d "$cache" ]; then
    mkdir -p "$CACHE_DIR"
    git clone --quiet --bare --filter=blob:none "$repo" "$cache" >&2
  fi

  git -C "$cache" fetch --quiet origin "$ref" >&2
  git -C "$cache" rev-parse FETCH_HEAD
}

# Tree id of <path> at <commit> in the cache, or nothing if absent.
upstream_tree() {
  local cache="$1" commit="$2" path="$3"

  git -C "$cache" rev-parse --verify --quiet "$commit:$path" 2>/dev/null || true
}

# Tree id of the vendored copy as git would store it, honoring .gitignore
# so stray .DS_Store files do not count as local edits.
local_tree() {
  local name="$1" index

  # git rejects an empty index file, so the path must not exist yet.
  index="$(mktemp -u)"
  GIT_INDEX_FILE="$index" git -C "$SCRIPT_DIR" add -A -- "shared/skills/$name" >/dev/null
  GIT_INDEX_FILE="$index" git -C "$SCRIPT_DIR" write-tree --prefix="shared/skills/$name/"
  rm -f "$index"
}

# Replaces shared/skills/<name> with <path> at <commit> from the cache.
extract_skill() {
  local cache="$1" commit="$2" path="$3" name="$4" staging

  staging="$(mktemp -d)"
  git -C "$cache" archive --format=tar "$commit:$path" | tar -x -C "$staging"
  chmod 755 "$staging"

  rm -rf "$SKILLS_DIR/$name"
  mv "$staging" "$SKILLS_DIR/$name"
}

write_manifest_entry() {
  local name="$1" repo="$2" path="$3" ref="$4" commit="$5" tmp

  tmp="$(mktemp)"
  jq --arg n "$name" --arg repo "$repo" --arg path "$path" --arg ref "$ref" --arg commit "$commit" \
    '.[$n] = {repo: $repo, path: $path, ref: $ref, commit: $commit}' "$MANIFEST" > "$tmp"
  mv "$tmp" "$MANIFEST"
}

# Resolves the names to operate on: every manifest entry, or the ones given.
select_names() {
  local name

  if [ "${#POSITIONAL[@]}" -eq 0 ]; then
    while IFS= read -r name; do
      NAMES+=("$name")
    done < <(manifest_names)
  else
    for name in "${POSITIONAL[@]}"; do
      if ! jq -e --arg n "$name" 'has($n)' "$MANIFEST" >/dev/null; then
        printf '%sNot an external skill: %s%s (no entry in %s)\n' \
          "$RED" "$name" "$RESET" "$(pretty_path "$MANIFEST")" >&2
        exit 1
      fi
      NAMES+=("$name")
    done
  fi

  if [ "${#NAMES[@]}" -eq 0 ]; then
    echo "No external skills recorded in $(pretty_path "$MANIFEST")" >&2
    exit 1
  fi

  for name in "${NAMES[@]}"; do
    track_name_width "$name"
  done
}

# Per-skill inspection shared by check and update. Sets:
#   S_REPO S_PATH S_REF S_COMMIT S_CACHE S_HEAD S_BEHIND S_MODIFIED S_ERROR
# A copy that matches neither the pinned tree nor upstream HEAD counts as
# modified; one that already matches HEAD just has a stale pin.
inspect_skill() {
  local name="$1" pinned_tree head_tree current_tree

  S_ERROR=""; S_BEHIND=0; S_MODIFIED=0; S_HEAD=""

  S_REPO="$(manifest_field "$name" repo)" || { S_ERROR="manifest entry has no repo"; return; }
  S_PATH="$(manifest_field "$name" path)" || { S_ERROR="manifest entry has no path"; return; }
  S_REF="$(manifest_field "$name" ref)" || { S_ERROR="manifest entry has no ref"; return; }
  S_COMMIT="$(manifest_field "$name" commit)" || { S_ERROR="manifest entry has no commit"; return; }
  S_CACHE="$(cache_for "$S_REPO")"

  if ! S_HEAD="$(fetch_upstream "$S_REPO" "$S_REF" 2>/dev/null)"; then
    S_ERROR="cannot fetch $S_REF from $S_REPO"
    return
  fi

  if ! git -C "$S_CACHE" cat-file -e "$S_COMMIT^{commit}" 2>/dev/null; then
    S_ERROR="pinned commit ${S_COMMIT:0:7} is unreachable; re-pin with: update $name --force"
    return
  fi

  if [ -z "$(upstream_tree "$S_CACHE" "$S_HEAD" "$S_PATH")" ]; then
    S_ERROR="$S_PATH does not exist at $S_REF (${S_HEAD:0:7}); fix path in the manifest"
    return
  fi

  S_BEHIND="$(git -C "$S_CACHE" rev-list --count "$S_COMMIT..$S_HEAD" -- "$S_PATH")"

  if [ ! -d "$SKILLS_DIR/$name" ]; then
    S_ERROR="shared/skills/$name is missing; restore with: update $name --force"
    return
  fi

  pinned_tree="$(upstream_tree "$S_CACHE" "$S_COMMIT" "$S_PATH")"
  head_tree="$(upstream_tree "$S_CACHE" "$S_HEAD" "$S_PATH")"
  current_tree="$(local_tree "$name")"
  if [ "$current_tree" != "$pinned_tree" ] && [ "$current_tree" != "$head_tree" ]; then
    S_MODIFIED=1
  fi
}

print_behind_commits() {
  local line

  while IFS= read -r line; do
    detail_line "$line"
  done < <(git -C "$S_CACHE" log --oneline --no-decorate "$S_COMMIT..$S_HEAD" -- "$S_PATH")
}

cmd_check() {
  local name up_to_date=0 behind=0 modified=0 errors=0

  require_manifest
  select_names

  printf '%sChecking external skills%s %s%s%s\n\n' \
    "$BOLD" "$RESET" "$DIM" "$(pretty_path "$MANIFEST")" "$RESET"

  for name in "${NAMES[@]}"; do
    inspect_skill "$name"

    if [ -n "$S_ERROR" ]; then
      errors=$((errors + 1))
      status_line "$RED" "x" "$name" "$S_ERROR"
      continue
    fi

    if [ "$S_BEHIND" -gt 0 ]; then
      behind=$((behind + 1))
      status_line "$YELLOW" "^" "$name" \
        "$S_BEHIND commit$([ "$S_BEHIND" -eq 1 ] || echo s) behind (${S_COMMIT:0:7} -> ${S_HEAD:0:7})"
      print_behind_commits
      detail_line "-> ./sync-skills.sh update $name"
    fi

    if [ "$S_MODIFIED" -eq 1 ]; then
      modified=$((modified + 1))
      status_line "$YELLOW" "!" "$name" \
        "modified locally; differs from $(pretty_repo "$S_REPO")@${S_COMMIT:0:7}"
      detail_line "-> git diff, then move the change upstream or: update $name --force"
    fi

    if [ "$S_BEHIND" -eq 0 ] && [ "$S_MODIFIED" -eq 0 ]; then
      up_to_date=$((up_to_date + 1))
      status_line "$DIM" "=" "$name" \
        "up to date · $(pretty_repo "$S_REPO")@${S_COMMIT:0:7} · $S_PATH"
    fi
  done

  printf '\n%sDone%s %s%d up to date · %d behind · %d modified locally' \
    "$BOLD" "$RESET" "$DIM" "$up_to_date" "$behind" "$modified"
  if [ "$errors" -gt 0 ]; then
    printf ' · %d broken' "$errors"
  fi
  printf '%s\n' "$RESET"

  [ "$((behind + modified + errors))" -eq 0 ]
}

cmd_update() {
  local name updated=0 skipped=0 errors=0 verb

  require_manifest
  select_names

  verb="updated"; [ "$DRY_RUN" -eq 1 ] && verb="would update"

  printf '%sUpdating external skills%s %s%s%s' \
    "$BOLD" "$RESET" "$DIM" "$(pretty_path "$MANIFEST")" "$RESET"
  if [ "$DRY_RUN" -eq 1 ]; then
    printf ' %s(dry run)%s' "$BLUE" "$RESET"
  fi
  printf '\n\n'

  for name in "${NAMES[@]}"; do
    inspect_skill "$name"

    # A missing directory or unreachable pin is only fatal without --force:
    # --force means "take whatever upstream has now".
    if [ -n "$S_ERROR" ] && { [ "$FORCE" -eq 0 ] || [ -z "$S_HEAD" ]; }; then
      errors=$((errors + 1))
      status_line "$RED" "x" "$name" "$S_ERROR"
      continue
    fi

    if [ "$S_MODIFIED" -eq 1 ] && [ "$FORCE" -eq 0 ]; then
      errors=$((errors + 1))
      status_line "$RED" "!" "$name" "modified locally; review git diff, then rerun with --force"
      continue
    fi

    if [ -z "$S_ERROR" ] && [ "$S_BEHIND" -eq 0 ] && [ "$S_MODIFIED" -eq 0 ]; then
      skipped=$((skipped + 1))
      status_line "$DIM" "=" "$name" "up to date · $(pretty_repo "$S_REPO")@${S_COMMIT:0:7}"
      continue
    fi

    if [ "$DRY_RUN" -eq 0 ]; then
      extract_skill "$S_CACHE" "$S_HEAD" "$S_PATH" "$name"
      write_manifest_entry "$name" "$S_REPO" "$S_PATH" "$S_REF" "$S_HEAD"
    fi

    updated=$((updated + 1))
    if [ "$S_COMMIT" = "$S_HEAD" ]; then
      status_line "$GREEN" "+" "$name" "${verb/update/restore} from $(pretty_repo "$S_REPO")@${S_HEAD:0:7}"
    else
      status_line "$GREEN" "+" "$name" "$verb ${S_COMMIT:0:7} -> ${S_HEAD:0:7} · $(pretty_repo "$S_REPO")"
    fi
    if [ "$S_BEHIND" -gt 0 ]; then
      print_behind_commits
    fi
  done

  printf '\n%s%s%s %s%d %s · %d up to date' \
    "$BOLD" "$([ "$DRY_RUN" -eq 1 ] && echo "Dry run" || echo "Done")" "$RESET" \
    "$DIM" "$updated" "$verb" "$skipped"
  if [ "$errors" -gt 0 ]; then
    printf ' · %d skipped' "$errors"
  fi
  printf '%s\n' "$RESET"

  if [ "$updated" -gt 0 ] && [ "$DRY_RUN" -eq 0 ]; then
    printf '%sReview with git diff, then commit the skill and the manifest together.%s\n' "$DIM" "$RESET"
  fi

  [ "$errors" -eq 0 ]
}

cmd_add() {
  local repo path name head

  if [ "${#POSITIONAL[@]}" -ne 2 ]; then
    echo "Usage: ${BASH_SOURCE[0]##*/} add <repo> <path> [--as name] [--ref ref]" >&2
    exit 1
  fi

  repo="${POSITIONAL[0]}"
  path="${POSITIONAL[1]%/}"
  name="${ADD_NAME:-$(basename "$path")}"

  if [ ! -f "$MANIFEST" ]; then
    [ "$DRY_RUN" -eq 1 ] || printf '{}\n' > "$MANIFEST"
  else
    require_manifest
  fi

  if [ -e "$SKILLS_DIR/$name" ]; then
    printf '%sshared/skills/%s already exists%s; pick another name with --as\n' "$RED" "$name" "$RESET" >&2
    exit 1
  fi

  if [ -f "$MANIFEST" ] && jq -e --arg n "$name" 'has($n)' "$MANIFEST" >/dev/null; then
    printf '%s%s is already recorded in %s%s\n' "$RED" "$name" "$(pretty_path "$MANIFEST")" "$RESET" >&2
    exit 1
  fi

  track_name_width "$name"

  printf '%sAdding external skill%s %s%s%s' "$BOLD" "$RESET" "$DIM" "$(pretty_repo "$repo")" "$RESET"
  if [ "$DRY_RUN" -eq 1 ]; then
    printf ' %s(dry run)%s' "$BLUE" "$RESET"
  fi
  printf '\n\n'

  if ! head="$(fetch_upstream "$repo" "$ADD_REF" 2>/dev/null)"; then
    status_line "$RED" "x" "$name" "cannot fetch $ADD_REF from $repo"
    exit 1
  fi

  if [ -z "$(upstream_tree "$(cache_for "$repo")" "$head" "$path")" ]; then
    status_line "$RED" "x" "$name" "$path does not exist at $ADD_REF (${head:0:7})"
    exit 1
  fi

  if ! git -C "$(cache_for "$repo")" cat-file -e "$head:$path/SKILL.md" 2>/dev/null; then
    status_line "$RED" "x" "$name" "$path has no SKILL.md at $ADD_REF"
    exit 1
  fi

  if [ "$DRY_RUN" -eq 0 ]; then
    extract_skill "$(cache_for "$repo")" "$head" "$path" "$name"
    write_manifest_entry "$name" "$repo" "$path" "$ADD_REF" "$head"
  fi

  status_line "$GREEN" "+" "$name" \
    "$([ "$DRY_RUN" -eq 1 ] && echo "would vendor" || echo "vendored") $path @ ${head:0:7} -> shared/skills/$name"

  if [ "$DRY_RUN" -eq 1 ]; then
    printf '\n%sDry run%s %snothing written%s\n' "$BOLD" "$RESET" "$DIM" "$RESET"
  else
    printf '\n%sDone%s %sRun ./install.sh to link it, then commit the skill and the manifest together.%s\n' \
      "$BOLD" "$RESET" "$DIM" "$RESET"
  fi
}

case "$COMMAND" in
  check) cmd_check ;;
  update) cmd_update ;;
  add) cmd_add ;;
esac
