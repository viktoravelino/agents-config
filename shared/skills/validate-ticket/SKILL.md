---
name: validate-ticket
description: Validate a Jira ticket before any work starts. Read the ticket and its linked issues, classify what it asks for (bug, feature, chore, spike), set up an isolated worktree with an evidence store, check the claim against the code and a live environment, and write a verdict for the follow-up work skill. Use when the user says "validate this ticket", "check this ticket", or pastes a Jira key or URL before asking for work to start.
argument-hint: "<ticket key or URL>"
metadata:
  requires: [acli-jira, evidence, dev-servers, git-worktree]
---

# Validate Ticket

## Overview

A ticket is a claim: something is broken, something is missing, or something must change.
This skill checks that claim before any code changes. It also leaves behind the workspace and
the evidence that the work will use. The output is a verdict, not an implementation.

Validation can end with "this is not a bug", "this already exists", "this is three tickets",
or "this cannot be built as described". The failure that this skill prevents is to start the
work only because the ticket exists.

## Hard rules (read first)

- **Never mutate the ticket.** Do not transition it, comment on it, edit its fields or assign
  it. Report what must change and let the user apply it, unless the user explicitly asks
  otherwise.
- **Read-only against the product code.** The only writes are the worktree, `.evidence/`,
  and the `.evidence` line in git's `info/exclude` (see `evidence`).
- **Never disturb the user's environment.** Do not use default ports, do not kill their
  processes, and do not write into their data (see `dev-servers`).
- **Give an unbounded probe a watchdog** before its first run. Always.
- **Stop at the verdict.** Do not start the work, commit, or open a PR.
- **State plainly what you did not verify.** A validation with an honest gap is worth more
  than one that implies coverage it does not have.

## Inputs

- **Ticket**: a key (`PROJ-123`) or a browse URL. Required.
- **Live environment** (only if the ticket concerns runtime behavior): follow `dev-servers`.
  It explains how to ask what is already running. It also explains how to start an isolated
  stack that does not disturb it.

## 1. Read the ticket, then classify it

Use the `acli-jira` skill. Always use `--json`, and always read the comments. The real
requirements and repro steps are often in the comments, not in the description.

```sh
acli jira workitem view <KEY> --fields "*navigable" --json   # includes parent and issuelinks
acli jira workitem comment list --key <KEY> --json
acli jira workitem link list --key <KEY> --json
```

Follow what the ticket points at, and what it should have pointed at:

- Linked GitHub issue, PR, design doc, or Figma. This includes one that the ticket *failed* to
  link. Search by title. A matching upstream issue is common and you must name it.
- Duplicates and prior art: search Jira and the repo history for the same error string,
  the same feature name, or the same file.
- Prerequisites: a blocking ticket, an unreleased dependency, or an API that does not exist yet.

Then classify the ticket, because the class decides every step after this. Trust the
described work more than the Jira issue type. Many "Task" tickets are bugs, and many "Bug"
tickets are feature requests. Say which track you picked and why.

| Type | The claim to check | Validated when you can state |
| --- | --- | --- |
| **Bug** | The described behavior is real, and still present on the base branch | Root cause at `file:line`, plus a reproduction |
| **Feature / story** | It is specified well enough to build, and does not already exist | Where it plugs in, what already exists, testable acceptance criteria |
| **Chore / refactor** | The described state is still true and the change is safe | Blast radius, and what proves behavior did not change |
| **Spike / investigation** | The question is answerable and worth the time | The question, and what would answer it |

Note ticket hygiene problems as you go: missing links, no priority, no acceptance criteria,
wrong component, or a stale description. Put them in the verdict as suggestions. Do not apply
them.

## 2. Set up the workspace

Use an isolated ticket worktree by default, so that validation does not dirty the main
checkout. First detect the workspace with the `git-worktree` skill:

- Inside a T3 Code thread, the worktree already exists. Reuse it in place (rename the branch
  and check the base).
- Otherwise, create the worktree, or reuse the existing one for this key. Use the ticket
  convention and branch from a freshly fetched base.

Skip the worktree only when the user already has servers running against another checkout
and wants validation there. Say explicitly which tree you validated in. It is part of the
verdict.

Then set up the evidence store with the `evidence` skill. This skill writes
`VALIDATION.md`, `validation.json`, `probes/`, and `before/` into it. `work-ticket` and
`adversarial-review` add the rest later.

## 3. Check the claim in code

Before you run anything, find out if the code supports the story in the ticket. Grep the
exact error string, the feature name, or the module that the ticket names. Then follow every
caller outward until you reach the entry point that a user actually touches.

**For a bug**, the code must answer these questions:

- **Root cause** in `file:line` terms. "The provider is wrong" is not enough. Name the line
  that makes the wrong choice and say why.
- **Still present?** Check the current base branch, not only the reported version.
- **Blast radius**: sibling call sites, alternate entry points (other routes, CLI,
  background jobs), and copies of the same pattern. A one-line fix that misses three call
  sites is not a fix.

**For a feature**, the code must answer these questions:

- **Does it already exist**, wholly or partly? Examples: a flag that is off, a near-identical
  component, or an endpoint that already returns the field.
- **Where does it plug in?** Find the real insertion point in each layer. Find out if the
  current architecture supports it or if a preceding change is necessary.
- **What does it collide with?** Check existing behavior, another in-flight ticket, and any
  shared component whose other consumers the change would affect.
- **Is it one ticket?** If it is three deliverables wearing a trench coat, say so. Propose
  the split. Do not validate a scope that nobody can review.

**For a chore or refactor**: confirm that the described state is still true (code moves),
map the blast radius, and identify what proves that behavior is unchanged. If no test
protects the refactor, adding that test is part of the scope, not an extra.

**For a spike**: identify what would actually answer the question and roughly what it
costs. The deliverable is a written answer, not code.

If the investigation contradicts the ticket, stop and say so. For example, the bug is not
real, the feature is already shipped, or the refactor was done last month. That is a
complete, successful run.

## 4. Get the evidence

A code read is a hypothesis. Back it with something executable, unless that is truly
impossible. When you cannot, label the verdict honestly (`confidence: code-only`).

- **Bug: reproduce it.** Use an in-process harness in `.evidence/probes/` when the bug is a
  pure code path. Use the live app when the bug is visible only end to end (drive the public
  API, inspect what was actually persisted, read the logs). Start a mock upstream when a
  third-party endpoint is involved. Its request log proves where traffic did and did not go.
- **Feature: capture the baseline and probe the risky part.** Take a screenshot of the screen
  that the feature lands on, and capture the current API response shape. Then probe what the
  design assumes but nobody has shown: that the library supports it, that the endpoint can
  return it, that the component accepts the prop. One small spike is better than an estimate.
- **Chore: record the before state** that the refactor must keep. Record the current test
  run, the current output, and the current timings if the claim is about performance.

Follow `evidence` for how to write and bound probes, what counts as proof, and which
environments mask the claim. Follow `dev-servers` for anything that needs the running app or
a browser.

## 5. Clean up

Tear down what you started, as `dev-servers` describes. Remove anything that probes created,
as `evidence` describes. Keep the evidence and the worktree. The work will build on them.

## 6. The verdict

Write `.evidence/VALIDATION.md` as prose that the user could paste into a ticket comment.
Write `.evidence/validation.json` for the follow-up skill:

```json
{
  "schema": "ticket-validation/v1",
  "ticket": "PROJ-123",
  "url": "https://<site>/browse/PROJ-123",
  "validated_at": "2026-09-02T14:30:00Z",
  "type": "bug | feature | chore | spike",
  "verdict": "ready | needs-info | needs-split | already-done | duplicate | rejected | blocked",
  "confidence": "live | code-only",
  "workspace": { "worktree": "<abs path>", "branch": "<branch>", "base": "origin/main@<sha>" },
  "summary": "<what the ticket asks for, in your own words>",
  "findings": "<bug: root cause at file:line. feature: what exists, where it plugs in. chore: current state>",
  "scope": [
    { "area": "backend | frontend | tests | docs", "file": "<path>", "change": "<one line>" }
  ],
  "acceptance_criteria": ["<testable statement the work must satisfy when done>"],
  "tests_affected": [{ "file": "<path:line>", "why": "<encodes an assumption that must change>" }],
  "evidence": [{ "path": ".evidence/before/<file>", "shows": "<what it proves>" }],
  "risks": ["<conflict, migration, dependency, or unknown that could derail the work>"],
  "gaps": ["<what could not be verified, and why>"],
  "ticket_hygiene": ["<suggested ticket change the user should apply>"],
  "linked": { "github_issue": "<owner/repo#n or null>", "duplicates": [], "blocked_by": [] },
  "versions": { "reported": "<bug only>", "confirmed_on": "<branch or tag>" }
}
```

`acceptance_criteria` is where a feature earns its verdict. If the ticket does not state
testable criteria, write them yourself and ask the user to confirm them. Unconfirmed
criteria mean `needs-info`, not `ready`. This check is the feature version of reproducing
a bug. If you skip it, the team builds the wrong thing well.

Then report to the user: the verdict in one line, the findings, the scope, the evidence
paths, any gap or risk, and the ticket hygiene suggestions. **Stop there.** Do not start
the work, do not commit, and do not open a PR. The follow-up work skill continues from
`validation.json` when the user says to go.
