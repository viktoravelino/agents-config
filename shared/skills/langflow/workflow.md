# Langflow: branches, reviews, Jira, standup

## Base branches

Langflow (`langflow-ai/langflow`) cuts `release-<major>.<minor>.<patch>` branches, and several are open at once (a patch line and the next release). Work targets one of them, not `main`, in almost every case.

Pick from, in order: the ticket's release label (`patch-v1.12.2` → `release-1.12.2`, `release-v1.13.0` → `release-1.13.0`), the branch the worktree was cut from, then ask. List what exists with:

```sh
git ls-remote --heads origin 'release-*'
```

For `WatsonOrchestrate/IBM-Langflow` the base branch is `main`. Release labels on LE tickets do not map to `release-*` branches there, even though branches like `release-1.11.0` exist.

## Review channel

Used by `request-review`.

Also applies to the enterprise overlay `WatsonOrchestrate/IBM-Langflow` (github.ibm.com): same handles, same message; `frontend-overrides/` counts as `src/frontend/` (confirmed by the maintainer, 2026-10-09).

- **Teams**: `@langflow-fe` when the diff touches `src/frontend/`; `@langflow-be` when it touches `src/backend/` or `src/lfx/`; both, space-separated, when both. Ask when only tests, docs, or CI changed.
- **Message**:

  ```
  PR: <pr-link>
  Jira: <jira-link>
  <team handle(s)>
  ```

## Jira

- Site: `https://datastax.jira.com`, browse links `https://datastax.jira.com/browse/<KEY>`
- Project: `LE` (keys match `LE-\d+`)
- Board conventions: `acli-jira/boards.md`

## Standup scope

- GitHub org: `langflow-ai`. Standup covers the `langflow-ai` org on github.com only; IBM-Langflow activity on github.ibm.com is not collected.
- Jira project: `LE`
