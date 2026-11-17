#!/usr/bin/env bash
# Claude Code Stop hook. Lints the files an agent changed, once per turn.
# Acts only in Langflow checkouts (any worktree). Exit 2 sends lint errors back to the agent.
# It also flags new lint and type suppressions (noqa, biome-ignore, ...) that the changes add.

input=$(cat)

# Reads one field from the hook JSON on stdin.
field() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null; }

# shortcut: one lint pass per stop, so a second failure is not caught; remove this guard if agents leave errors after the first fix
[ "$(field .stop_hook_active)" = "true" ] && exit 0

cwd=$(field .cwd)
[ -n "$cwd" ] || exit 0
root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0

remote=$(git -C "$root" remote get-url origin 2>/dev/null) || exit 0
printf '%s' "$remote" | grep -qiE '(github\.com[:/])(langflow-ai/langflow|WatsonOrchestrate/IBM-Langflow)(\.git)?/?$' || exit 0

cd "$root" || exit 0

# Changed files: tracked edits plus untracked files, only those that still exist.
files=()
while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$f" ] && files+=("$f")
done < <({ git diff --name-only --no-renames --diff-filter=ACMR HEAD; git ls-files --others --exclude-standard; } | sort -u)
[ ${#files[@]} -gt 0 ] || exit 0

py=()
fe=()
for f in "${files[@]}"; do
  case "$f" in
    *.py) py+=("$f") ;;
    src/frontend/*.ts | src/frontend/*.tsx | src/frontend/*.js | src/frontend/*.jsx) fe+=("${f#src/frontend/}") ;;
  esac
done

out=""

# Runs ruff on the changed Python files and appends its errors to $out.
lint_python() {
  local ruff
  if [ -x .venv/bin/ruff ]; then ruff=.venv/bin/ruff
  elif command -v ruff >/dev/null 2>&1; then ruff=ruff
  else
    echo "langflow-lint: ruff not found, Python files not checked" >&2
    return
  fi
  local res
  res=$("$ruff" check --no-fix "${py[@]}" 2>&1) || out+="$res"$'\n'
}

# Runs biome on the changed frontend files and appends its errors to $out.
lint_frontend() {
  local biome=src/frontend/node_modules/.bin/biome
  if [ ! -x "$biome" ]; then
    echo "langflow-lint: biome not found, frontend files not checked" >&2
    return
  fi
  local res
  res=$(cd src/frontend && node_modules/.bin/biome check --files-ignore-unknown=true --diagnostic-level=error "${fe[@]}" 2>&1) || out+="$res"$'\n'
}

[ ${#py[@]} -gt 0 ] && lint_python
[ ${#fe[@]} -gt 0 ] && lint_frontend

sup_mod=""
sup_new=""
total_add=0
total_rem=0

# Prints the suppression regex for file $1, or nothing when the file type is not checked.
pattern_for() {
  case "$1" in
    *.py) echo '#[[:space:]]*((ruff|flake8):[[:space:]]*)?noqa|#[[:space:]]*(type|pyright):[[:space:]]*ignore|#[[:space:]]*mypy:[[:space:]]*ignore-errors' ;;
    src/frontend/tests/*.ts | src/frontend/tests/*.tsx | src/frontend/tests/*.js | src/frontend/tests/*.jsx)
      echo 'biome-ignore|@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable|waitForTimeout\(' ;;
    src/frontend/*.ts | src/frontend/*.tsx | src/frontend/*.js | src/frontend/*.jsx)
      echo 'biome-ignore|@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable' ;;
  esac
}

# Adds the suppression lines that file $1 adds and removes (regex $2) to the totals, and lists the file in $sup_mod (in HEAD) or $sup_new (new path) when it adds any.
check_suppressions() {
  local f=$1 re=$2 d added n_add n_rem in_head=0 entry
  if git cat-file -e "HEAD:$f" 2>/dev/null; then
    in_head=1
    # Drop everything before the first hunk; hunk headers start with @, so ^+ and ^- skip them.
    d=$(git diff -U0 --no-ext-diff --no-color HEAD -- "$f" | sed -n '/^@@/,$p')
  else
    d=$(sed 's/^/+/' "$f")
  fi
  added=$(printf '%s\n' "$d" | grep -E "^\+.*($re)")
  n_add=$(printf '%s\n' "$added" | grep -c .)
  n_rem=$(printf '%s\n' "$d" | grep -cE "^-.*($re)")
  total_add=$((total_add + n_add))
  total_rem=$((total_rem + n_rem))
  if [ "$n_add" -gt 0 ]; then
    entry="$f"$'\n'"$(printf '%s\n' "$added" | head -n 5 | sed 's/^+[[:space:]]*/  /')"$'\n'
    if [ "$in_head" = 1 ]; then sup_mod+="$entry"; else sup_new+="$entry"; fi
  fi
}

for f in "${files[@]}"; do
  re=$(pattern_for "$f")
  [ -n "$re" ] && check_suppressions "$f" "$re"
done

# Deleted files count as removed suppressions, so a moved file does not look new.
while IFS= read -r f; do
  re=$(pattern_for "$f")
  [ -n "$re" ] || continue
  n=$(git show "HEAD:$f" 2>/dev/null | grep -cE "$re")
  total_rem=$((total_rem + n))
done < <(git diff --name-only --no-renames --diff-filter=D HEAD)

# shortcut: one total for all file types. A removal in one file offsets an addition in another.
# Report only when the changes add more suppressions in total than they remove. Modified files come first.
sup=""
[ "$total_add" -gt "$total_rem" ] && sup="$sup_mod$sup_new"

if [ -n "$out" ] || [ -n "$sup" ]; then
  # Cut the lint output, never the suppression report.
  [ -n "$out" ] && { printf 'langflow-lint: fix these lint errors before you stop\n%s' "$out" | head -n 60; } >&2
  [ -n "$sup" ] && { printf 'langflow-lint: %s more suppression lines than before. Fix the root cause. If one is truly needed, keep it and say why in your final message. Files that add suppression lines (moved lines included):\n%s' "$((total_add - total_rem))" "$sup" | head -n 40; } >&2
  exit 2
fi
exit 0
