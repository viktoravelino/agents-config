#!/usr/bin/env bash
# Claude Code PreToolUse hook for the Bash tool. Blocks commands that break standing rules.
# Exit 2 sends the one-line reason back to the agent. Exit 0 with no output allows the command.

input=$(cat)

# Reads one field from the hook JSON on stdin.
field() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null; }

cmd=$(field .tool_input.command)
cwd=$(field .cwd)
[ -n "$cmd" ] || exit 0

# Prints the reason on stderr and blocks the command.
block() { echo "guard-bash: $1" >&2; exit 2; }

# Regex prefix: the next word must be a command word (start of the command, or after && ; | or a newline).
cw='(^|&&|;|\|)[[:space:]]*'

# Rule a: merging is the user's review step.
if printf '%s' "$cmd" | grep -qE "${cw}gh[[:space:]]+(pr[[:space:]]+merge|api[[:space:]].*/merge([[:space:]\"']|\$))"; then
  block "blocked a PR merge. Merging is the user's review step. Give the PR URL and stop."
fi

# Rule b: no AI attribution in commits or PRs.
# shortcut: matches the text anywhere in the command, so a grep for these strings is also blocked; narrow it if that gets in the way
if printf '%s' "$cmd" | grep -qE 'git[[:space:]]+commit|gh[[:space:]]+pr[[:space:]]+(create|edit)'; then
  attribution='Co-Authored-By: Claude|noreply@anthropic\.com|Generated with \[Claude Code\]'
  msg="blocked AI attribution in a commit or PR text. Remove the attribution lines and run the command again."
  printf '%s' "$cmd" | grep -qiE "$attribution" && block "$msg"
  # Files given with -F, --file or --body-file (also with "="). A relative path resolves against cwd.
  while IFS= read -r arg; do
    path=${arg#*[ =]}
    path=${path//[\"\']/}
    [ "${path#/}" = "$path" ] && path="$cwd/$path"
    [ -f "$path" ] && grep -qiE "$attribution" "$path" && block "$msg"
  done < <(printf '%s' "$cmd" | grep -oE '(^|[[:space:]])(-F|--file|--body-file)[ =][^[:space:]]+' | sed -E 's/^[[:space:]]+//')
fi

# Rule c (Langflow only, delete this block to drop it): `make backend` runs `kill -9` on port 7860.
remote=$(git -C "$cwd" remote get-url origin 2>/dev/null)
if printf '%s' "$remote" | grep -qiE '(github\.com[:/])(langflow-ai/langflow|WatsonOrchestrate/IBM-Langflow)(\.git)?/?$' \
  && printf '%s' "$cmd" | grep -qE "${cw}make[[:space:]]+(backend|run_cli)([[:space:]]|\$|;|&|\\|)"; then
  block "blocked make backend and make run_cli. They kill whatever listens on port 7860, your own dev server. Use the isolated stack from the dev-servers skill."
fi

# Rule d: no inline PR body. Shell escaping corrupts it. --body-file does not match.
if printf '%s' "$cmd" | grep -qE "${cw}gh[[:space:]]+pr[[:space:]]+(create|edit)[[:space:]]" \
  && printf '%s' "$cmd" | grep -qE '[[:space:]](--body[ =]|-b[[:space:]])'; then
  block "blocked an inline PR body. Shell escaping corrupts it. Use the pr-create script, or --body-file with a mktemp file."
fi

exit 0
