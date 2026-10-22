---
name: standup
description: Draft a daily standup update (yesterday / today / blockers) from recent GitHub and Jira activity. Use when the user asks for a standup, a daily update, or "what did I do yesterday".
argument-hint: "[since date | all repos]"
---

# Standup

Pull recent activity and turn it into a short update that the user can paste. Then stop. **Do not post it.**

## Window and scope

- **Since**: the previous working day (Friday when today is Monday), unless the user gives a date. Use it as `<since>` (`YYYY-MM-DD`) below.
- **Scope**: work, as the project profiles define it. Find the profiles next to this skill:

  ```sh
  grep -l 'kind: project-profile' ../*/SKILL.md
  ```

  The **workflow** file of each profile has a "Standup scope" section with a GitHub org and a Jira project. Run the queries below once for each profile. If there are no profiles, ask the user which org and Jira project count as work.
- **Everything**: when the user asks for all repos, drop the `--owner` filter and do not filter by Jira project.

## Gather

Run these queries in parallel. They are independent. `<org>` and `<project>` come from the profile.

```sh
# PRs opened, updated, or merged
gh search prs --author=@me --owner=<org> --updated=">=<since>" \
  --json repository,number,title,state,isDraft,url --limit 30

# PRs reviewed for others
gh search prs --reviewed-by=@me --owner=<org> --updated=">=<since>" \
  --json repository,number,title,url --limit 30

# Reviews still waiting on the user
gh search prs --review-requested=@me --owner=<org> --state=open \
  --json repository,number,title,url --limit 20

# Tickets the user moved
acli jira workitem search --jql "project = <project> AND status CHANGED BY currentUser() AFTER <since>" \
  --fields "key,status,summary" --json

# Tickets on the user's plate
acli jira workitem search --jql "project = <project> AND assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC" \
  --fields "key,status,summary" --json
```

For each open PR that the user authored, check if it is blocked. Use `gh pr checks <n> --repo <repo>` for red CI. Use `gh pr view <n> --repo <repo> --json reviewDecision` for `CHANGES_REQUESTED`.

Jira has no "commented by me" query here, so comment-only activity is missing. The user can add it.

## Sort it

- **Yesterday**: PRs merged or opened, reviews given, and tickets moved. If a PR and a ticket are the same work, write them as one line.
- **Today**: tickets in progress, open PRs that need a follow-up (changes requested, red CI), and reviews that wait on the user. This is a best guess from the data. Say so, and let the user reorder it.
- **Blockers**: only real blockers that you find in the data (red CI that the PR did not cause, a PR that waits for review for days, a ticket that another ticket blocks). If there are none, write `None`.

## Output

Write one fenced block of plain text, so that it pastes cleanly into chat:

```
Yesterday
- PROJ-1234 Flow import error on large files: fix merged (repo#12345), moved to Ready for QA
- Reviewed repo#12350

Today
- PROJ-1240 Settings page loading states (In Progress)

Blockers
- None
```

Rules:

- Write one line for each item. Put the ticket key first when there is one. Then write a plain-language summary. If the ticket title is long, do not use it as it is.
- Write PRs as `repo#number`. Do not add URLs unless the user asks.
- Do not add headers, emoji, or filler beyond the three sections.

After the block, write one short line that names anything you could not see (for example, a query that failed). If there is nothing, say nothing.
