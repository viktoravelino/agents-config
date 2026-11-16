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
done < <({ git diff --name-only --diff-filter=ACMR HEAD; git ls-files --others --exclude-standard; } | sort -u)
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

sup=""

# Appends file $1 to $sup when its changes add more lines that match regex $2 than they remove.
check_suppressions() {
  local f=$1 re=$2 d added n_add n_rem
  if git cat-file -e "HEAD:$f" 2>/dev/null; then
    d=$(git diff -U0 HEAD -- "$f" | grep -vE '^(\+\+\+|---)')
  else
    d=$(sed 's/^/+/' "$f")
  fi
  added=$(printf '%s\n' "$d" | grep -E "^\+.*($re)")
  n_add=$(printf '%s\n' "$added" | grep -c .)
  n_rem=$(printf '%s\n' "$d" | grep -cE "^-.*($re)")
  [ "$n_add" -gt "$n_rem" ] || return 0
  sup+="$f"$'\n'"$(printf '%s\n' "$added" | head -n 5 | sed 's/^+[[:space:]]*/  /')"$'\n'
}

for f in "${files[@]}"; do
  case "$f" in
    *.py) check_suppressions "$f" '#[[:space:]]*noqa|#[[:space:]]*type:[[:space:]]*ignore' ;;
    src/frontend/tests/*.ts | src/frontend/tests/*.tsx | src/frontend/tests/*.js | src/frontend/tests/*.jsx)
      check_suppressions "$f" 'biome-ignore|@ts-ignore|@ts-nocheck|eslint-disable|waitForTimeout\(' ;;
    src/frontend/*.ts | src/frontend/*.tsx | src/frontend/*.js | src/frontend/*.jsx)
      check_suppressions "$f" 'biome-ignore|@ts-ignore|@ts-nocheck|eslint-disable' ;;
  esac
done

if [ -n "$out" ] || [ -n "$sup" ]; then
  msg=""
  [ -n "$out" ] && msg+="langflow-lint: fix these lint errors before you stop"$'\n'"$out"
  [ -n "$sup" ] && msg+="langflow-lint: new suppressions. Fix the root cause. If one is truly needed, keep it and say why in your final message."$'\n'"$sup"
  printf '%s' "$msg" | head -n 60 >&2
  exit 2
fi
exit 0
