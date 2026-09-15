---
name: standup
description: Draft a daily standup update (yesterday / today / blockers) from recent GitHub and Jira activity. Use when the user asks for a standup, a daily update, or "what did I do yesterday".
argument-hint: "[since date | all repos]"
---

# Standup

Pull recent activity, turn it into a short update the user can paste, and stop. **You do not post it.**

## Window and scope

- **Since**: the previous working day — Friday when today is Monday — unless the user gives a date. Use it as `<since>` (`YYYY-MM-DD`) below.
- **Scope**: work, as defined by the project profiles. Find them next to this skill:

  ```sh
  grep -l 'kind: project-profile' ../*/SKILL.md
  ```

  Each profile's **workflow** file has a "Standup scope" section with a GitHub org and a Jira project. Run the queries below once per profile. With no profiles, ask the user which org and Jira project count as work.
- **Everything**: when the user asks for all repos, drop the `--owner` filter and skip Jira project filtering.

## Gather

Run these in parallel; they are independent. `<org>` and `<project>` come from the profile.

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

For each open authored PR, check whether it is blocked: `gh pr checks <n> --repo <repo>` for red CI, and `gh pr view <n> --repo <repo> --json reviewDecision` for `CHANGES_REQUESTED`.

Jira has no "commented by me" query here, so comment-only activity will be missing; the user can add it.

## Sort it

- **Yesterday**: PRs merged or opened, reviews given, tickets moved. Merge a PR and its ticket into one line when they are the same work.
- **Today**: tickets in progress, open PRs that need a follow-up (changes requested, red CI), and reviews waiting on the user. This is a best guess from the data — say so, and let the user reorder.
- **Blockers**: only real ones found in the data (red CI not caused by the PR, a PR waiting on review for days, a ticket blocked by another). Otherwise write `None`.

## Output

One fenced block, plain text so it pastes cleanly into chat:

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

- One line per item, ticket key first when there is one, then a plain-language summary — not the raw ticket title if it is long.
- PRs as `repo#number`; no URLs unless the user asks.
- No headers, emoji, or filler beyond the three sections.

After the block, one short line naming anything you could not see (for example, a query that failed) — otherwise say nothing.
