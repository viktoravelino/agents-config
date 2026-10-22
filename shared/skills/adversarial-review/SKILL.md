---
name: adversarial-review
description: Run an adversarial code review of a diff (working tree, commit range, branch, or PR). The review attacks the change from security, correctness, completeness, frontend-behavior, and code-quality angles, verifies every suspicion against surrounding code, and emits structured JSON findings that an author agent can use and act on. Use when the user asks for an adversarial review, a hostile review, to "attack this diff", or to review changes before merge.
argument-hint: "[PR number | commit range | branch]"
metadata:
  requires: [evidence]
---

# Adversarial Review

## Overview

A normal review shares the author's mental model and rubber-stamps the diff. This skill takes the opposite stance: assume the diff is broken and try to prove it. Read the surrounding code, not only the diff, to verify every suspicion before it becomes a finding. The output is a JSON findings file with a stable schema. The author (or an author agent) can pick it up, fix the items and report the outcome for each finding.

Padding is failure. An empty blocker list is a valid result. An invented blocker is not.

## Inputs

Resolve the review scope in this order:

1. Use an explicit target from the user: a PR number (`gh pr diff <n>`), a commit range, a branch (`git diff <base>...HEAD`) or a file list.
2. Otherwise, use the uncommitted working-tree diff (`git diff` plus `git diff --cached`). Mention untracked files, but review them only if they are clearly part of the change.

To review a branch or PR, you do not need a checkout. Run `git fetch` and diff against `origin/<branch>` from wherever you are. Sometimes the reviewer must run code from that branch, and another worktree already has the branch checked out. In that case, use a detached review worktree as `git-worktree` describes. Never use a copy of the branch under a new name.

Also collect the items below. Ask only if you cannot get them any other way.

- **Intent**: what the diff claims to do. Get it from the user, the PR description, the commit messages or the linked ticket. The review attacks the gap between the claim and the code.
- **Constraints**: paths, services or ports that the reviewer must not touch. The review is always read-only: no edits, no commits, no formatters, no dev servers. You may run read-only checks (`ruff check`, `tsc --noEmit`, linters).
- **Project profile**: `basename -s .git "$(git remote get-url origin)"` gives a name. If a skill with that name sits next to this one (`../<name>/SKILL.md`), use it. If not, use a sibling profile whose `metadata.repos` lists the origin's `owner/repo`. Read its **review** file and pass it to the reviewer agent together with the angles. The profile adds project-specific targets and check commands. It does not replace the angles.

## Fresh eyes rule

If the current session wrote the diff or discussed it in depth, do not review it inline. The purpose is to avoid the author's blind spots. Delegate to a read-only `Explore` agent (thoroughness: very thorough). Give the agent the repo path and branch, the scope command, the intent summary, the constraints, the attack angles below and the output schema below. If the session is cold (you were invoked only to review someone else's diff), review inline.

**The reviewer agent does not write the file.** `Explore` has no `Write` or `Edit` tool at all. If you tell it to save the review, it fails or improvises a shell heredoc. Tell it to return the JSON as its final message and nothing else. This session saves the file as **Output** below describes. Fresh eyes is about who *analyzes* the diff. The parent only writes back a payload that it did not reason about, so the author's mental model does not leak into the review. The global instructions route adversarial review here, so this choice is the documented one.

**Model selection.** Pick the agent's model by review complexity, and tell the user your choice:

- `opus`: the default for anything non-trivial. This includes security and trust-boundary changes, auth or credential paths, concurrency, data migrations, cross-layer diffs (backend + frontend) and diffs that touch more than a handful of files.
- `sonnet`: trivial reviews only. These are small, mechanical, single-concern diffs (rename, config tweak, isolated test change, copy edits) where the correctness question is shallow.

When in doubt, use `opus`. A missed blocker costs more than the model difference.

### Second opinion inside a T3 Code thread

Whenever you delegate to `Explore`, and the session runs inside T3 Code (the `delegate_task` tool is present), also run a second reviewer on a different model family. A model that reviews the output of its own family shares its blind spots. A different family breaks them. Skip the second reviewer when the brief says "single-model" or when the diff is trivial (the same threshold that selects `sonnet`).

Launch the Copilot child in the same turn as the `Explore` agent. Use the identical brief and the identical "return only the JSON array" instruction, and add this line: "STRICTLY READ-ONLY: do not create or modify files, and run no state-changing git commands." Call `delegate_task` with `mode: "async"`, a `clientRequestId` that is unique for each review round, and this target:

```json
{
  "providerInstanceId": "acpRegistry_github_copilot",
  "model": "gpt-6-luna",
  "options": {
    "reasoning_effort": "high",
    "allow_all": "on",
    "mode": "https://agentclientprotocol.com/protocol/session-modes#agent"
  }
}
```

Keep `allow_all` on. If it is off, the unattended child blocks on approval prompts. Unlike `Explore`, the child has no tool-level read-only guarantee. So, before you launch it, record `git status --short` in the reviewed checkout. Record the returned `taskId`. The completion notification arrives on its own, so do not poll.

- **Safety check.** When the child returns, run `git status --short` in the reviewed checkout. If anything changed that was clean before, report it to the user as a finding of its own before you use the review. Do not revert it yourself.
- **Merge.** Take the union of the two arrays. Two findings are the same when they name the same file, their lines are within 3 of each other, and they make the same claim. Keep one entry for them and set `"sources": ["claude", "copilot"]`. Otherwise keep both findings, each with a single-element `sources`. Then verify the merged list once, as the **Verification standard** section describes. Verify a finding with two sources like any other, but report it first in the written review.
- **Failure.** If the child fails, times out or returns anything that is not a JSON array, say so in the review header. Then continue with the Claude findings alone. Never block the review on the second pass.

## Attack angles

For each angle, derive concrete suspicions from the diff. Then verify each suspicion in code. Skip the angles that the diff cannot touch (for example, skip the frontend angle when there are no frontend changes). Mention a skipped angle in `non_issues` only if the user asked about it.

1. **Security / trust boundary.** For every value that is newly caller-controlled, persisted or forwarded, ask these questions. Where does it end up? Can it select a credential, bypass a policy or authorization check, or reach a sink unvalidated? Can the system store it unbounded or uncanonicalized (case variants, aliases, whitespace, length)? Do privileged or cross-user paths behave differently from the ordinary path?
2. **Correctness.** Check these points:
   - Legacy and migration behavior: does existing data (missing rows, null fields, old defaults) take a different path than before?
   - Ordering: did the change move a read, write or check across an authorization or transaction boundary?
   - Serialization boundaries (`exclude`, DTO mapping, spread/pick): do they still carry exactly the intended fields?
   - Off-by-one errors, None/undefined flow and error paths.
3. **Completeness.** Grep for every sibling call site, every alternate entry point (CLI, other routes, background tasks, MCP/tools) and every copy of the pattern that the diff fixes. Do any of them still have the bug? Does any schema snapshot, OpenAPI spec, doc or generated file need to change with the diff?
4. **Tests.** Do the new or changed tests assert the actual behavior (persisted values, responses)? Or do they over-mock and assert nothing? Does a test cover the bug that the diff fixes, and would that test have caught the bug?
5. **Frontend behavior.** Use this angle only when the diff touches UI code. Attack what the user experiences, not style:
   - *Effects and async*: missing or stale dependencies, no cleanup (listeners, timers, subscriptions, aborted requests), an effect that does the job of an event handler, a response from a stale request that overwrites a newer one, state set after unmount.
   - *Server state* (query caches such as TanStack Query or SWR): cache keys that miss a variable they depend on, mutations that do not invalidate or update what they change, optimistic updates with no rollback.
   - *Client stores*: selectors that return a new object or array on each call and re-render every subscriber, state that should reset between screens or sessions but does not.
   - *Async UI states*: loading, error and empty paths that are missing or leave the UI ambiguous, double submits, controls that stay enabled during a request.
   - *Rendering cost*: unstable `key`s, work in render on hot paths, new object or function props that defeat an existing `memo`.
   - *Accessibility*: clickable non-buttons without keyboard support, inputs without labels, focus that does not move into or return from dialogs and menus, icon-only buttons without an accessible name.
   - *i18n*: user-visible strings that are hard-coded where the surrounding code uses translations.

   The project profile's **review** file (see Inputs) names the actual stack, hot paths and check commands. Verify with read-only checks scoped to the changed files. Read a script before you run it, because `format`-style scripts write and some check scripts start servers.
6. **Language/idiom quality** (should-fix or nit at most. Never a blocker, unless it hides a bug): typing correctness (`any` leaks, required-vs-optional mismatches that the compiler silently accepts), dead code, stale docstrings and comments, naming, lint cleanliness on changed files.

## Verification standard

- **confirmed**: you traced the failure end to end in code, or reproduced it with a read-only command.
- **plausible**: a concrete concern that you could not trace fully. State exactly what is missing to confirm it.

Every finding needs a concrete failure scenario ("caller sends X → Y happens"). "This could be a problem" without a scenario is not a finding. Put suspicions that you investigated and cleared in `non_issues`, with the reason. This proves that you covered the angle, without padding the findings.

## Output

Reviews go in the checkout's evidence store, under `.evidence/reviews/`. First, set up the store with the `evidence` skill. The setup is idempotent, so run it whether or not a ticket flow already did. This way a ticket's validation, captures and reviews sit under one key, and the review survives when the worktree is pruned.

Write the JSON to a UTC-timestamped file. Then point `latest.json` at it, so that a later author session finds the current review without globbing and sorting:

```sh
TS="$(date -u +%Y%m%dT%H%M%SZ)"   # seconds, not minutes — two reviews of one diff collide otherwise
# write the JSON to .evidence/reviews/$TS.json, then:
ln -sfn "$TS.json" .evidence/reviews/latest.json
```

Then tell the user the verdict, the path and a short prose summary of the top findings (severity, file:line, one-line claim). Do not restate the full JSON in prose.

Rank findings with the most severe first. Severity levels:

- `blocker`: wrong behavior, a security issue or data corruption that is reachable in practice.
- `should-fix`: a real defect or trap that does not block the merge.
- `nit`: style or clarity.

Derive the verdict. Never choose it. The verdict is `block` if any finding is a blocker, `concerns` if any finding is a should-fix, and `clean` otherwise.

```json
{
  "schema": "adversarial-review/v1",
  "reviewed_at": "2026-09-02T14:30:00Z",
  "scope": { "repo": "<path>", "target": "<diff command or PR ref>", "files": ["<changed files>"] },
  "intent": "<one-paragraph summary of what the diff claims to do>",
  "verdict": "block | concerns | clean",
  "findings": [
    {
      "id": "F1",
      "severity": "blocker | should-fix | nit",
      "confidence": "confirmed | plausible",
      "category": "security | correctness | completeness | tests | quality",
      "file": "<repo-relative path>",
      "line": 123,
      "claim": "<one sentence: what is wrong>",
      "failure_scenario": "<concrete input/state → wrong outcome>",
      "evidence": ["<file:line references traced to support the claim>"],
      "suggested_fix": "<minimal fix, one or two sentences>",
      "sources": ["claude" | "copilot", ...]
    }
  ],
  "non_issues": [
    { "suspicion": "<what was checked>", "reason": "<why it is fine, with file:line>" }
  ]
}
```

`sources` is optional. It is present only when the second-opinion pass ran.

## Author handoff

When someone asks an author agent (or this session, later) to act on a review, the agent loads `.evidence/reviews/latest.json`, or the specific timestamped file the user names. It then works through `findings` in order. It records outcomes by editing the review file itself. It adds two fields to each finding as it deals with that finding:

```json
{
  "outcome": "fixed | disputed | acknowledged",
  "outcome_note": "<what was done, or the counter-evidence>",
  "deviation_from_suggested_fix": "<only when the applied fix differs from suggested_fix: how, and why>"
}
```

- `fixed`: the agent corrected the defect. The note names the edit or commit.
- `disputed`: the finding is wrong. The note carries the counter-evidence as code references (`file:line`), not opinion.
- `acknowledged`: the agent deferred the finding on purpose. The note says why. Blockers must not end up `acknowledged` silently.
- `deviation_from_suggested_fix`: omit it when the agent followed the suggestion. A follow-up review treats it as a claim to verify like any other. The deviation must actually cover the failure scenario.

Leave everything else in the file untouched. The review stays the reviewer's record, with the outcomes layered on top. A finding with no `outcome` is still open. A follow-up adversarial review of the fix diff can reference the prior file to check that the fixes did not introduce new findings.

## Rules

- Stay read-only against the code, always. Never edit, commit, stage, or run anything that changes the repository or a running service. The review file and its evidence folder are the only writes, and only this session makes them. The reviewer agent writes nothing.
- Do not soften confirmed findings. Do not manufacture findings to look rigorous.
- Stay in scope: review the diff and what it touches, not the pre-existing debt of the whole codebase. Pre-existing issues that the diff makes worse are in scope. Issues that the diff only sits near are not.
- Respect the user's stated constraints verbatim (forbidden paths, running services).
