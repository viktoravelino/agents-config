# Two reviewers: host mechanics

`SKILL.md` says what the two reviewers do. This file says how to launch them on each host.
The reviewers return findings in the `ponytail-review` output format as their final message, not JSON.

## Pick the two models

The two reviewers are always the same pair, whatever the model of the current thread:

- **Sonnet reviewer**: the newest Claude Sonnet model that the host lists.
- **Other-family reviewer**: a non-Claude model through Copilot. The Copilot default can be a Claude model, so always name the model explicitly. Pick a mid-tier model of that family, not its flagship. A flagship at high effort can use most of a monthly Copilot quota.

1. Find the providers and models that the host offers now. Never use a model name from memory or from this file.
   - In T3 Code: call the orchestrator capabilities tool (`orchestrator_capabilities`). It lists each provider, its models and its options.
   - Elsewhere: check which CLIs exist with `command -v claude copilot bob`. Use the model list that the host shows. If the host cannot list its models, ask the user once which model to use.
2. If no non-Claude model is available, use the fallback in **When a reviewer fails**.

## Write the brief once

Write the brief to a file, so both reviewers get the same text. When `.evidence/` exists, use the evidence store. Otherwise, use a `mktemp` file.

```sh
TS="$(date -u +%Y%m%dT%H%M%SZ)"
if [ -d .evidence ]; then BRIEF=".evidence/reviews/$TS.brief.md"; else BRIEF="$(mktemp)"; fi
```

Use the same `TS` for the review file later. End the brief with these two lines:

- "Return your findings in the output format of `ponytail-review` as your final message. Write no files."
- "STRICTLY READ-ONLY: do not create or modify files, and run no state-changing git commands."

## Launch in T3 Code

In T3 Code, the host does not matter. A Claude, Copilot or Bob thread uses the same path.

1. Discover the models with `orchestrator_capabilities`, as **Pick the two models** describes.
2. Launch both reviewers with `delegate_task` in the same turn. Set `mode: "async"`, `interactionMode: "plan"` and `role: "review"`. Give each reviewer a unique `clientRequestId` for each review round.
3. **Sonnet reviewer**: set `target.model` to the Sonnet model of the thread's provider. If that provider lists no Sonnet model, also set `target.providerInstanceId` to the Claude provider.
4. **Other-family reviewer**: set `target.providerInstanceId` and `target.model` from the capabilities result, by the rules in **Pick the two models**. Use the default reasoning effort of the model. Do not set `allow_all`.
5. Pass the brief text as the prompt. After its two closing lines, add: "Do not propose a plan and do not ask for approval. Return the findings directly as your final message."

Each reviewer is a child thread that the user can open. Mention its link in the reply. Do not poll a reviewer. The host wakes the session when each reviewer finishes.

## Launch outside T3 Code

Start both reviewers in the same turn. Do not poll a reviewer. Wait for the host to report that it finished.

The other-family reviewer runs the Copilot CLI in the background on every host:

```sh
copilot -p "$(cat "$BRIEF")" -s --model <non-Claude model> --allow-all-tools --deny-tool=write
```

The Sonnet reviewer depends on the host:

- **Claude Code**: a read-only `Explore` agent (thoroughness: very thorough). Pass the brief as its prompt. Set the `model` override to `sonnet`. `Explore` has no `Write` or `Edit` tool, so it cannot save the review. It returns the findings as its final message.
- **Copilot CLI**: the same `copilot -p` command with the Sonnet model.
- **Bob**: the Claude CLI:

  ```sh
  claude -p "$(cat "$BRIEF")" --model sonnet \
    --allowedTools "Read Grep Glob Bash(git diff *) Bash(git log *) Bash(git show *)" \
    --disallowedTools "Edit Write NotebookEdit"
  ```

## Read-only guard

`Explore` is read-only by its tool set. The other reviewers are not, because a shell can write. In T3 Code, plan mode blocks edits, and the guard stays as a safety net. Before you launch any reviewer, record `git status --short` in the reviewed checkout. When each reviewer returns, run it again. If a file changed that was clean before, report it to the user as a finding of its own before you use the review. Do not revert it yourself.

## When a reviewer fails

- A reviewer fails, times out, or returns no findings in the `ponytail-review` format: say it in the `Reviewers:` line, with the reason. Continue with the other reviewer's findings.
- No other family is available: say it in the `Reviewers:` line, with the reason.
- Either way, write this line in the reply to the user: "Second opinion: not run (<reason>)."
- Never block the review on the second opinion. Never skip it silently.
