---
name: request-review
description: Produce the copy-pasteable message asking a team to review a PR, using the review channel defined in the repository's project profile. Use when the user asks to request a review, ping the review channel, or ask for eyes on a PR.
argument-hint: "[PR number or URL]"
---

# Request review

Output a ready-to-send message for the project's review channel. **You do not post it** — there is no channel integration here. Print the message and stop; the user sends it.

## Project profile

Resolve the repo's profile: `basename -s .git "$(git remote get-url origin)"` gives a name; if a skill with that name sits next to this one (`../<name>/SKILL.md`), read its **workflow** file. Its "Review channel" section defines the team handles, how to pick them, and the message shape; its "Jira" section gives the browse URL and key pattern.

If there is no profile, or it has no review channel, say that no review channel is set up for this repo and stop — do not borrow another project's handles.

## Gather the links

Work out both links from context before printing. Do not ask the user for something you can look up.

**PR link** — in this order:

1. A PR number or URL in the user's message.
2. A PR filed earlier in this conversation.
3. `gh pr view --json url --jq .url` for the current branch.

If the branch has no PR, say so and offer to file one (see the `file-pr` skill) instead of printing a message with a hole in it.

**Ticket link** — in this order:

1. A ticket key in the user's message.
2. A ticket created or referenced earlier in this conversation.
3. The trailing `Jira:` line in the PR body: `gh pr view <n> --json body --jq .body | grep -i '^Jira:'`.
4. A key matching the profile's pattern in the branch name or commit messages.

Build the link from the profile's browse URL. If there is genuinely no ticket, print the message without the ticket line rather than inventing a key or leaving a placeholder — and mention that you dropped it.

## Pick the team

Follow the profile's rule, deciding from `gh pr diff <n> --name-only`. If the split is unclear, ask the user which team to ping.

## The message

Print the profile's message shape exactly, in a single fenced code block so the user can copy it in one go.

- Raw URLs, not markdown links — the channel renders its own previews.
- Team handle(s) on their own last line, verbatim.
- Nothing else in the block. No title, no summary, no "please review" line. The links carry the context.

## After printing

One short line outside the block if — and only if — there is something the reviewers need that the PR itself does not say: a CI run still red, a stacked PR that has to merge first, a review already requested on an earlier revision. Otherwise say nothing.
