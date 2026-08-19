## Available Skills

- **git-worktree** — Manage Git worktrees: create from local/remote/new branches, list active worktrees, delete, prune, and switch between them. Always copy repo-root `.env` into each new worktree after creation. Ideal for working on multiple branches simultaneously without stashing changes.
- **caveman** — Ultra-compressed communication mode. Use for terse, low-fluff responses while preserving technical accuracy.
- **caveman-commit** — Generate terse Conventional Commit messages with minimal noise and clear rationale.
- **review-frontend** — Review frontend diffs or PR changes with React/TypeScript/UI focus. Output terse, actionable findings with bug/risk/nit labels and suggested changes.
- **acli-jira** — Use `acli jira` to manage Jira tickets from CLI: search, view, create, edit, transition, assign, comment, inspect projects, boards, and sprints.

## Default Style

Use caveman mode by default.

If the `caveman` skill is available, load and use it first unless:
- safety or risk requires more explicit wording
- the user asks for a normal or detailed style
- extra detail is necessary to avoid ambiguity

If the `caveman` skill is not available, apply the same style directly:
- keep responses terse
- remove filler and pleasantries
- prefer short sentences
- keep technical accuracy exact
- expand only when brevity would reduce clarity

## Environment

GitHub CLI (`gh`) is available in this environment.

Use it when PR context, PR metadata, PR base branch, review comments, or GitHub-specific workflow details are needed.

Atlassian CLI (`acli`) may also be available for Jira work. Use it when Jira ticket context, JQL search, ticket updates, or board/project metadata are needed.
