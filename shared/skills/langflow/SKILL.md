---
name: langflow
description: Project profile for Langflow (langflow-ai/langflow and its worktrees) -- how to run it in isolation, what to check in reviews, branch and PR conventions, the review channel, and Jira scope. The generic skills (dev-servers, adversarial-review, file-pr, request-review, standup) read it whenever the repository's origin is langflow-ai/langflow or WatsonOrchestrate/IBM-Langflow (the IBM overlay).
user-invocable: false
metadata:
  kind: project-profile
  repos: [langflow-ai/langflow, WatsonOrchestrate/IBM-Langflow]
---

# Langflow profile

These are the project-specific settings for the generic workflow skills. Each file below overrides the generic defaults for one concern. Read only the file that the current step needs.

| File | Read it from | Covers |
| --- | --- | --- |
| [servers.md](servers.md) | `dev-servers` | Ports, start commands, hazards, Playwright probe config |
| [review.md](review.md) | `adversarial-review` | Frontend stack, hot paths, read-only check commands |
| [workflow.md](workflow.md) | `file-pr`, `request-review`, `standup` | Base branches, review channel, Jira project, standup scope |
| [t3.json](t3.json) | T3 Code (not a skill) | Worktree-per-thread default, env-file copy on worktree create, Docker stack up/down scripts that print the URLs |
| [t3.ibm-langflow.json](t3.ibm-langflow.json) | T3 Code (not a skill) | Same for the IBM-Langflow overlay: `make init`, frontend mirror, `make dev` and `make qa-stack` on per-worktree ports |

Jira field conventions for the `LE` board live in `acli-jira/boards.md` (local only).
