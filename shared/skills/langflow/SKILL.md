---
name: langflow
description: Project profile for Langflow (langflow-ai/langflow and its worktrees) -- how to run it in isolation, what to check in reviews, branch and PR conventions, the review channel, and Jira scope. Read by the generic skills (dev-servers, adversarial-review, file-pr, request-review, standup) whenever the repository's origin is langflow-ai/langflow.
user-invocable: false
metadata:
  kind: project-profile
  repos: [langflow-ai/langflow]
---

# Langflow profile

Project-specific settings for the generic workflow skills. Each file below overrides the generic defaults for one concern; read only the one the current step needs.

| File | Read it from | Covers |
| --- | --- | --- |
| [servers.md](servers.md) | `dev-servers` | Ports, start commands, hazards, Playwright probe config |
| [review.md](review.md) | `adversarial-review` | Frontend stack, hot paths, read-only check commands |
| [workflow.md](workflow.md) | `file-pr`, `request-review`, `standup` | Base branches, review channel, Jira project, standup scope |

Jira field conventions for the `LE` board live in `acli-jira/boards.md` (local only).
