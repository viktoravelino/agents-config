---
name: git-worktree
description: Create, list, and remove Git worktrees using the sibling-directory convention, with env files copied in -- including the ticket-worktree convention validate-ticket and work-ticket use. Use when the user wants a worktree for a branch or ticket, to list worktrees, or to clean them up.
argument-hint: "[list | create <branch or ticket> | remove <branch or ticket> | prune]"
---

# Git Worktree

Worktrees let several branches be checked out at once without stashing. Run everything from inside the repository.

## Conventions

- **Location**: a sibling of the main checkout, `../<project>-<name>`, where `<project>` is `basename "$(git rev-parse --show-toplevel)"` of the main checkout.
- **Name**: the ticket key for ticket work (`myapp-PROJ-123`), otherwise the branch name with `/` replaced by `-`.
- **Ticket branches**: `<type>/<KEY>-<slug>`, where the type comes from the work — `fix/`, `feat/`, `chore/`, `spike/` — and the slug is a few words of the summary (`fix/PROJ-123-temp-file-cleanup`).
- **One worktree per ticket, and one per branch.** If `git worktree list` already shows one for the key or for the branch, reuse it instead of creating a second.
- **Never rename a branch to get around a checkout conflict.** Git refuses to check out a branch that another worktree already has. The fix is to use that worktree, or a detached checkout for a read-only look (below) — not a new branch with a suffix (`-review`, `-trim`, `-2`). A suffixed branch becomes the one that gets pushed while the original worktree goes stale, and the PR ends up with two local branches nobody can tell apart.

## Create

Pick the form that matches where the branch comes from. Always fetch first so a new branch starts from the current base, not a stale local copy.

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

The detached form is for reviewing only: nothing is committed there, and it is removed when the review is done. If work has to happen on the branch, it happens in the worktree that already has it.

For ticket work, `<base>` is the branch the work targets — see `file-pr` for how to settle it.

### Copy the env files

Env files are git-ignored, so a new worktree has none. Copy every one the main checkout has, keeping its path:

```sh
git -C "$MAIN" ls-files --others --ignored --exclude-standard -- '.env' '**/.env' \
  | grep -v node_modules \
  | while read -r f; do mkdir -p "$(dirname "$WT/$f")"; cp "$MAIN/$f" "$WT/$f"; done
```

(`$WT` is the new worktree's path.) If the main checkout has none, say so and continue — a missing env file is not a reason to fail.

Do not copy `.venv` or `node_modules`. Dependencies are installed in the worktree only when something needs to run there (`dev-servers` covers it).

### After creating

- Ticket or debugging work: set up the evidence store with the `evidence` skill.
- Tell the user the path and branch. Do not `cd` their shell or open an editor for them.

## List

```sh
git worktree list
```

Show path, branch, and short HEAD per worktree, and mark the current one.

## Remove

```sh
git -C <worktree> status --short          # anything uncommitted?
# tear down the worktree's isolated stack first, volumes included (see below)
git worktree remove <worktree>
git branch -d <branch>                    # only if the user wants the branch gone too
```

- If the worktree has uncommitted or unpushed work, show it and ask before removing. Never `--force` or `rm -rf` a worktree on your own.
- If an isolated stack was started for the worktree (`dev-servers`), tear it down **before** removing the directory, and remove its named volumes with it — a compose project keeps its venv, `node_modules`, and data volumes after the worktree is gone, and nothing else will ever clean them. The project profile's servers file has the exact command; for Langflow it is `docker compose -p <worktree basename, lower-cased> down -v`.
- The worktree's evidence survives removal (it lives under the common git dir). Say so if the user expects it to be gone.

## Prune

`git worktree prune` clears metadata for worktree directories that were deleted by hand. Run it when `git worktree list` shows entries whose paths no longer exist.
