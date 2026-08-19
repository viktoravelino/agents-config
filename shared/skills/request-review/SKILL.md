---
name: request-review
description: Produce the copy-pasteable message asking the frontend team to review a PR. Use when the user asks to request a review, ping the review channel, or ask for eyes on a PR.
---

# Request review

Output a ready-to-send message for the review channel. **You do not post it** — there is no channel integration here. Print the message and stop; the user sends it.

## Gather the links

Work out both links from context before printing. Do not ask the user for something you can look up.

**PR link** — in this order:

1. A PR number or URL in the user's message.
2. A PR filed earlier in this conversation.
3. `gh pr view --json url --jq .url` for the current branch.

If the branch has no PR, say so and offer to file one (see the `file-pr` skill) instead of printing a message with a hole in it.

**Jira link** — in this order:

1. A ticket key in the user's message.
2. A ticket created or referenced earlier in this conversation.
3. The trailing `Jira:` line in the PR body: `gh pr view <n> --json body --jq .body | grep -i '^Jira:'`.
4. A `LE-\d+` key in the branch name or commit messages.

Jira links use `https://datastax.jira.com/browse/<KEY>`.

If there is genuinely no ticket, print the message without the `Jira:` line rather than inventing a key or leaving a placeholder — and mention that you dropped it.

## The message

Print exactly this, in a single fenced code block so the user can copy it in one go:

```
PR: <pr-link>
Jira: <jira-link>
@langflow-fe
```

Rules:

- Raw URLs, not markdown links — the channel renders its own previews.
- `@langflow-fe` on its own last line, verbatim.
- Nothing else in the block. No title, no summary, no "please review" line. The links carry the context.

## After printing

One short line outside the block if — and only if — there is something the reviewers need that the PR itself does not say: a CI run still red, a stacked PR that has to merge first, a review already requested on an earlier revision. Otherwise say nothing.
