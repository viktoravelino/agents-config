# Two reviewers: host mechanics

`SKILL.md` says what the two reviewers do. This file says how to launch them on each host.

## Pick the two models

1. Find the model of the current thread. The host reports it in the system prompt or the session status. Record the model id as the host gives it.
2. Find the providers and models that the host offers now. Never use a model name from memory or from this file.
   - In T3 Code: call the orchestrator capabilities tool (`orchestrator_capabilities`). It lists each provider, its models and its options.
   - Elsewhere: check which CLIs exist with `command -v claude copilot bob`. Use the model list that the host shows. If the host cannot list its models, ask the user once which model to use.
3. Pick the other-family model by the family of the current model, not by the host:
   - Current model is Claude (also in a Copilot thread): a non-Claude model through Copilot. The Copilot default can be a Claude model, so always name the model explicitly.
   - Current model is not Claude: Claude. The Claude CLI default model is a correct choice.
   - Pick the strongest model of that family that the host lists.
4. If no other family is available, use the fallback in `SKILL.md`.

## Write the brief once

Set up the evidence store first, as the `evidence` skill describes. Then write the brief to a file in it, so both reviewers get the same text:

```sh
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BRIEF=".evidence/reviews/$TS.brief.md"
```

Use the same `TS` for the review file later. End the brief with these two lines:

- "Return only a JSON object with `findings` and `non_issues` as your final message. Write no files."
- "STRICTLY READ-ONLY: do not create or modify files, and run no state-changing git commands."

## Launch on each host

Start both reviewers in the same turn. Do not poll a reviewer. Wait for the host to report that it finished.

### Claude Code

- **Same model**: a read-only `Explore` agent (thoroughness: very thorough). Pass the brief as its prompt. Set the `model` override to the model of the current thread, because `Explore` can default to a smaller model. `Explore` has no `Write` or `Edit` tool, so it cannot save the review. That is why it returns the JSON.
- **Other family, in T3 Code**: call `delegate_task` with `mode: "async"` and a `clientRequestId` that is unique for each review round. Set `target.providerInstanceId` and `target.model` from the capabilities result. Set the options for an unattended run that the capabilities list (for Copilot: high reasoning effort, `allow_all` on, agent mode). If `allow_all` is off, the child blocks on approval prompts. Record the returned `taskId`.
- **Other family, outside T3 Code**: run the Copilot CLI in the background:

  ```sh
  copilot -p "$(cat "$BRIEF")" -s --model <non-Claude model> --allow-all-tools --deny-tool=write
  ```

### Copilot CLI

- **Same model**: a fresh subagent on the current model, if the host offers one. Otherwise run a fresh process:

  ```sh
  copilot -p "$(cat "$BRIEF")" -s --model <current model> --allow-all-tools --deny-tool=write
  ```

- **Other family**: if the current model is Claude, run the same `copilot -p` command with a non-Claude model. Otherwise, use Claude. In T3 Code, call `delegate_task` with the Claude provider from the capabilities result. Elsewhere, run the Claude CLI:

  ```sh
  claude -p "$(cat "$BRIEF")" \
    --allowedTools "Read Grep Glob Bash(git diff *) Bash(git log *) Bash(git show *)" \
    --disallowedTools "Edit Write NotebookEdit"
  ```

### Bob

- **Same model**: a fresh headless task. Use a read-only mode if Bob offers one (see `bob run --help` and the mode list):

  ```sh
  bob run --mode <read-only mode> "$(cat "$BRIEF")"
  ```

- **Other family**: Claude, with the same `claude -p` command as in the Copilot section.

## Read-only guard

`Explore` is read-only by its tool set. The other reviewers are not, because a shell can write. Before you launch them, record `git status --short` in the reviewed checkout. When each reviewer returns, run it again. If a file changed that was clean before, report it to the user as a finding of its own before you use the review. Do not revert it yourself.

## When a reviewer fails

- A reviewer fails, times out, or returns anything that is not the JSON object: set its `status` to `failed` in `reviewers`, with the reason in `note`. Continue with the other reviewer's findings.
- No other family is available: set the other-family `status` to `unavailable`, with the reason in `note`.
- Either way, say it in the reply to the user. Never block the review on the second opinion.
