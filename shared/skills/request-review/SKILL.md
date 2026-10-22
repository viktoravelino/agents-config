---
name: request-review
description: Produce the copy-pasteable message that asks a team to review a PR. Use the review channel that the repository's project profile defines. Use when the user asks to request a review, ping the review channel, or ask for eyes on a PR.
argument-hint: "[PR number or URL]"
---

# Request review

Output a ready-to-send message for the project's review channel. **You do not post it.** There is no channel integration here. Print the message and stop. The user sends it.

## Project profile

Resolve the repo's profile. `basename -s .git "$(git remote get-url origin)"` gives a name. If a skill with that name is next to this one (`../<name>/SKILL.md`), read its **workflow** file. If not, look for a sibling profile whose `metadata.repos` lists the origin's `owner/repo`, and read its **workflow** file. Its "Review channel" section defines the team handles, how to pick them, and the message shape. Its "Jira" section gives the browse URL and the key pattern.

If there is no profile, or it has no review channel, say that no review channel is set up for this repo and stop. Do not borrow the handles of another project.

## Gather the links

Work out both links from context before you print. Do not ask the user for something that you can look up.

**PR link**, in this order:

1. A PR number or URL in the user's message.
2. A PR filed earlier in this conversation.
3. `gh pr view --json url --jq .url` for the current branch.

If the branch has no PR, say so and offer to file one (see the `file-pr` skill). Do not print a message with a hole in it.

**Ticket link**, in this order:

1. A ticket key in the user's message.
2. A ticket created or referenced earlier in this conversation.
3. The trailing `Jira:` line in the PR body: `gh pr view <n> --json body --jq .body | grep -i '^Jira:'`.
4. A key that matches the profile's pattern in the branch name or commit messages.

Build the link from the profile's browse URL. If there is really no ticket, print the message without the ticket line. Do not invent a key and do not leave a placeholder. Mention that you dropped the line.

## Pick the team

Follow the profile's rule. Decide from `gh pr diff <n> --name-only`. If the split is unclear, ask the user which team to ping.

## The message

Print the profile's message shape exactly, in a single fenced code block, so that the user can copy it in one go.

- Use raw URLs, not markdown links. The channel renders its own previews.
- Put the team handle(s) on their own last line, verbatim.
- Put nothing else in the block. No title, no summary, no "please review" line. The links carry the context.

## After printing

Write one short line outside the block if, and only if, the reviewers need something that the PR itself does not say. Examples: a CI run that is still red, a stacked PR that must merge first, or a review that was already requested on an earlier revision. Otherwise say nothing.
