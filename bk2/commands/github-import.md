Import my GitHub contribution history for the CURRENT REPO into my Obsidian vault.

PROJECT RESOLUTION: Determine the current project name from the working directory's repo name (e.g., if cwd is inside `langflow` or `langflow-wxo-fe`, project = "langflow"; if `anima-virtus`, project = "anima-virtus"). Use this as <PROJECT> below. The vault base is "~/Documents/Obsidian Vault".

REPO RESOLUTION: Run `gh repo view --json nameWithOwner -q .nameWithOwner` from the current working directory to get the OWNER/REPO. Use `--repo OWNER/REPO` on all `gh` commands below to scope queries to this repo only.

Use the `gh` CLI to pull my activity FOR THIS REPO. Run these queries:

1. My merged PRs in this repo:
gh pr list --repo <OWNER/REPO> --state merged --author @me --limit 500 --json number,title,body,labels,createdAt,mergedAt,url,additions,deletions,changedFiles,headRefName

2. Issues I created in this repo:
gh issue list --repo <OWNER/REPO> --state all --author @me --limit 500 --json number,title,body,labels,createdAt,closedAt,state,url

3. Issues assigned to me in this repo:
gh issue list --repo <OWNER/REPO> --state all --assignee @me --limit 500 --json number,title,body,labels,createdAt,closedAt,state,url

4. My PR reviews in this repo:
gh pr list --repo <OWNER/REPO> --state all --limit 500 --json number,title,url,mergedAt,reviews --jq '.[] | select(.reviews[]?.author.login == "@me")'

If any command fails, try without --json and parse the table output instead.

THEN organize everything into my Obsidian vault:

STEP 1: Create a master index at:
"<vault>/projects/<PROJECT>/github-history.md"

Use this format:
---
date: [today's date]
type: github-history
tags: [github, <PROJECT>, shipped]
last-updated: [today's date]
---

# GitHub Contribution History — <PROJECT>

## Summary
- Total PRs merged: [count]
- Total issues created: [count]
- Total issues resolved: [count]
- Total PR reviews: [count]
- Date range: [earliest] to [latest]

## Merged PRs

| Date | PR | Title | Type | Lines Changed |
|------|-----|-------|------|---------------|
| YYYY-MM-DD | #123 | Title | feature/bug/refactor/docs | +100/-50 |

Classify each PR by reading its title and labels:
- feature or feat → #shipped
- fix or bug → #bugfix
- refactor → #refactor
- docs or documentation → #documented
- chore, ci, build → #infra
- test → #testing

## Issues Created

| Date | Issue | Title | Status | Labels |
|------|-------|-------|--------|--------|
| YYYY-MM-DD | #45 | Title | open/closed | bug, enhancement |

## Issues Resolved

| Date Closed | Issue | Title | Labels |
|-------------|-------|-------|--------|
| YYYY-MM-DD | #45 | Title | bug, enhancement |

## PR Reviews Given

| Date | PR | Title | Author |
|------|-----|-------|--------|
| YYYY-MM-DD | #78 | Title | colleague-name |

STEP 2: Create individual notes for significant PRs.

For every PR that is a feature or significant bug fix (not chores/tiny fixes),
create a note at:
"<vault>/projects/<PROJECT>/shipped/YYYY-MM-DD-pr-NNN-brief-title.md"

Use this format:
---
date: YYYY-MM-DD
type: shipped
pr: NNN
tags: [shipped, <PROJECT>, <feature|bugfix|refactor>]
quarter: Q[1-4]
lines-changed: +N/-N
---

# PR #NNN: [Title]

## What
[One-paragraph summary from PR description]

## Impact
[Infer from the PR: what did this enable, fix, or improve?]

## Files changed
[List key files, not every single one]

## Labels
[From GitHub labels]

## Link
[PR URL]

STEP 3: Create a quarterly breakdown at:
"<vault>/projects/<PROJECT>/performance-review/github-by-quarter.md"

---
date: [today]
type: review-data
tags: [review, github]
---

# GitHub Activity by Quarter

## Q1 (Jan-Mar)
- PRs merged: [count]
- Features shipped: [list titles]
- Bugs fixed: [count]
- PR reviews given: [count]
- Lines changed: +N/-N

## Q2 (Apr-Jun)
[same structure]

## Q3 (Jul-Sep)
[same structure]

## Q4 (Oct-Dec)
[same structure]

STEP 4: Update my daily notes retroactively.

For each merged PR, check if a daily note exists for that date at:
"<vault>/projects/<PROJECT>/daily/YYYY-MM-DD.md"

- If it exists: append the PR to the "Work log" section with the right tag
- If it doesn't exist: skip it (don't create past daily notes)

After all steps, tell me:
- Total items imported
- How many individual shipped notes were created
- Any PRs that failed to classify
- Suggested next steps