# Langflow: branches, reviews, Jira, standup

## Base branches

Langflow (`langflow-ai/langflow`) cuts `release-<major>.<minor>.<patch>` branches. Several are open at once (a patch line and the next release). In almost every case, work targets one of them, not `main`.

Pick the base branch from these, in this order: the ticket's release label (`patch-v1.12.2` → `release-1.12.2`, `release-v1.13.0` → `release-1.13.0`), then the branch the worktree was cut from. If neither gives an answer, ask. List the existing branches with:

```sh
git ls-remote --heads origin 'release-*'
```

For `WatsonOrchestrate/IBM-Langflow` the base branch is `main`. Release labels on LE tickets do not map to `release-*` branches there, even though branches such as `release-1.11.0` exist.

## Review channel

`request-review` uses this section.

This section also applies to the enterprise overlay `WatsonOrchestrate/IBM-Langflow` (github.ibm.com). It uses the same handles and the same message. `frontend-overrides/` counts as `src/frontend/` (confirmed by the maintainer, 2026-10-09).

- **Teams**: use `@langflow-fe` when the diff touches `src/frontend/`. Use `@langflow-be` when it touches `src/backend/` or `src/lfx/`. When it touches both, use both handles, separated by a space. Ask when only tests, docs, or CI changed.
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

- GitHub org: `langflow-ai`. Standup covers the `langflow-ai` org on github.com only. It does not collect IBM-Langflow activity on github.ibm.com.
- Jira project: `LE`
