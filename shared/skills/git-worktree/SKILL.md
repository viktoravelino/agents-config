---
name: git-worktree
description: Create, list, and remove Git worktrees using the sibling-directory convention, with env files copied in -- including the ticket-worktree convention validate-ticket and work-ticket use. Use when the user wants a worktree for a branch or ticket, to list worktrees, or to clean them up.
argument-hint: "[list | create <branch or ticket> | remove <branch or ticket> | prune]"
---

# Git Worktree

Worktrees let you check out several branches at once, without stashing. Run every command from inside the repository.

## Conventions

- **Location**: a sibling directory of the main checkout, `../<project>-<name>`. `<project>` is `basename "$(git rev-parse --show-toplevel)"` of the main checkout.
- **Name**: for ticket work, use the ticket key (`myapp-PROJ-123`). Otherwise use the branch name with `/` replaced by `-`.
- **Ticket branches**: `<type>/<KEY>-<slug>`. The type comes from the work: `fix/`, `feat/`, `chore/`, or `spike/`. The slug is a few words of the summary (`fix/PROJ-123-temp-file-cleanup`).
- **One worktree for each ticket, and one for each branch.** If `git worktree list` already shows one for the key or the branch, reuse it. Do not create a second one. A worktree that a T3 Code thread created also counts: reuse it (see below).
- **Never rename a branch to get around a checkout conflict.** Git refuses to check out a branch that another worktree already has. Use that worktree instead. For a read-only look, use a detached checkout (below). Do not make a new branch with a suffix (`-review`, `-trim`, `-2`). The suffixed branch gets pushed while the original worktree goes stale. Then the PR has two local branches that nobody can tell apart.

## Inside a T3 Code thread

T3 Code can give a thread its own worktree before the agent starts. Before you create anything, check for one:

```sh
case "$(git rev-parse --show-toplevel)" in "$HOME/.t3/worktrees/"*) echo "T3 worktree" ;; esac
```

When it matches, the worktree already exists. Reuse it in place and skip the Create section completely. Do not make a sibling directory and do not copy env files, because the project's setup action copied them. Do these three things:

- **Rename the branch to the convention.** T3 names it `t3code/<slug>` from the first
  message, and the sidebar follows a rename. Run `git branch -m <type>/<KEY>-<slug>`. If the branch
  still looks temporary (`t3code/<8 hex>`), T3 has not renamed it yet. T3 may try to rename it
  right after you do. Its attempt fails and does no harm, so rename the branch anyway.
- **Check the base.** T3 cuts the worktree from whatever the main checkout has. In a
  release-branch project, this is often not the ticket's base. If the worktree has no commits
  and no changes, move it: `git fetch origin <base> && git reset --hard origin/<base>`.
  If there is work on it, rebase instead.
- **Say so.** Tell the user the branch name. Tell them that you reused the T3 worktree and did not create a new one.

Outside T3 (the top level is anywhere else), continue with Create.

## Create

Pick the form that matches the branch's source. Always fetch first. Then a new branch starts from the current base and not from a stale local copy.

```sh
MAIN="$(git worktree list --porcelain | awk 'NR==1{print $2}')"
PROJECT="$(basename "$MAIN")"

# New branch from a base (ticket work, new features)
git fetch origin <base>
git worktree add -b <branch> "$MAIN/../$PROJECT-<name>" origin/<base>

# Existing remote branch (someone else's PR)
git fetch origin <branch>
git worktree add --track -b <branch> "$MAIN/../$PROJECT-<name>" origin/<branch>

# Existing local branch
git worktree add "$MAIN/../$PROJECT-<name>" <branch>

# Read-only look at a branch that is already checked out elsewhere (reviews)
git fetch origin <branch>
git worktree add --detach "$MAIN/../$PROJECT-<name>-review" origin/<branch>
```

Use the detached form only for reviews. Do not commit there, and remove it when the review is done. If you must work on the branch, do the work in the worktree that already has it.

For ticket work, `<base>` is the branch that the work targets. See `file-pr` to decide it.

### Copy the env files

Git ignores env files, so a new worktree has none. Copy every env file of the main checkout and keep its path:

```sh
git -C "$MAIN" ls-files --others --ignored --exclude-standard -- '.env' '**/.env' \
  | grep -v node_modules \
  | while read -r f; do mkdir -p "$(dirname "$WT/$f")"; cp "$MAIN/$f" "$WT/$f"; done
```

(`$WT` is the new worktree's path.) If the main checkout has no env files, say so and continue. A missing env file is not a reason to fail.

Do not copy `.venv` or `node_modules`. Install dependencies in the worktree only when something must run there (`dev-servers` covers it).

### After creating

- For ticket or debugging work, set up the evidence store with the `evidence` skill.
- Tell the user the path and the branch. Do not `cd` their shell and do not open an editor for them.

## List

```sh
git worktree list
```

For each worktree, show the path, the branch, and the short HEAD. Mark the current one.

## Remove

```sh
git -C <worktree> status --short          # anything uncommitted?
# tear down the worktree's isolated stack first, volumes included (see below)
git worktree remove <worktree>
git branch -d <branch>                    # only if the user wants the branch gone too
```

- If the worktree has uncommitted or unpushed work, show it and ask before you remove it. Never use `--force` or `rm -rf` on a worktree on your own.
- If you started an isolated stack for the worktree (`dev-servers`), tear it down **before** you remove the directory. Remove its named volumes with it. A compose project keeps its venv, `node_modules`, and data volumes after the worktree is gone, and nothing else cleans them. The project profile's servers file has the exact derivation of the project name. For Langflow, the user's T3 stack is `langflow-<slug>-<port base>` and the agent stack is `langflow-agent-<slug>-<port base>`. Tear down only stacks that you started.
- The worktree's evidence stays after removal, because it lives under the common git dir. Say so if the user expects it to be gone.

## Prune

`git worktree prune` clears the metadata of worktree directories that someone deleted by hand. Run it when `git worktree list` shows entries with paths that no longer exist.
