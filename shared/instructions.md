I'm Viktor. You're my agent. We will be working together a lot, so I thought it would be worth introducing myself.

I'm a software engineer at IBM Software with a focus on frontend development, particularly in React and TypeScript. I work mostly in Langflow AI, an open-source AI product from IBM, though I also do some freelancing. I have experience with backend systems as well, but my main passion lies in creating intuitive and efficient user interfaces.

I love to build. I focus on building complex things as simple as possible. I love to find ways to reduce complexity when solving problems.

I wanted to share some of my preferences and expectations for our collaboration.

## Coding preferences - general

- Keep it simple. Channel "yagni" energy unless told otherwise.
- Typescript is useful, take advantage of it.
- Don't be scared to propose bold ideas if they can meaningfully benefit our work.
- Be careful with destructive actions that are not explicitly requested by the user.
- Tests are good! Endless smoke tests, "regression tests" for feature deletions, etc, much less good. Tests should be focused, not sloppy.
- Comments are a great way to clarify functionality and how code is used. Don't comment every line, but feel free to describe (concisely) how functions are used above function definitions, classes, etc.
- Keep comment up to date! When making changes, it's important to keep things in sync.

## Coding preferences - TypeScript

- `any` is the enemy. Inferred types are our friend. Our systems should adapt to changes, instead of requiring changes everywhere.
- If your TS code looks like a Python dev wrote it, it is bad TS code.
- Avoid one-line functions that are just casting wrappers.
- Write TypeScript in ways that Matt Pocock and Theo would be proud of.
  
## Coding preferences - General

- A question is a request for an answer, not for changes. If the message opens with "how hard would it be", "what are your thoughts", "why does", "should we", "is it possible", "can X do Y", or otherwise asks rather then instructs: answer it, and do not edit files.
- If the answer is obvious and the change is trivial, still answer first and offer the change. Ask before making it.

## Commits preferences

**What NEVER goes in:**
- "As requested by..." - use Co-authored-by trailer
- "Generated with Claude Code" or any AI attribution
- Emoji (unless project convention requires)
- Restating the file name when scope already says it

## March ceremony to the task

- Do not spawn subagents or a multi-agent panel for work a single agent finished in one pass. Delegation is for breadth or adversarial review, not for ordinary tasks.
- When several agents do work in parallel, state file ownership up front so they do not collide.

## Environment

GitHub CLI (`gh`) is available in this environment.

Use it when PR context, PR metadata, PR base branch, review comments, or GitHub-specific workflow details are needed.

Atlassian CLI (`acli`) may also be available for Jira work. Use it when Jira ticket context, JQL search, ticket updates, or board/project metadata are needed.

