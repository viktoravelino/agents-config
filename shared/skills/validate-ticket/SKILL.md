---
name: validate-ticket
description: Validate a Jira ticket before any work starts -- read the ticket and its linked issues, classify what it actually asks for (bug, feature, chore, spike), set up an isolated worktree with an evidence folder, check the claim against the code and a live environment, and write a verdict the follow-up work skill consumes. Use when the user says "validate this ticket", "check this ticket", or pastes a Jira key or URL before asking for work to start.
argument-hint: "<ticket key or URL>"
---

# Validate Ticket

## Overview

A ticket is a claim: something is broken, something is missing, something should change.
This skill's job is to check that claim before a line of code changes, and to leave behind
the workspace and the evidence the work will be built on top of. The output is a verdict,
not an implementation.

Validation can legitimately end in "this is not a bug", "this already exists", "this is
three tickets", or "this cannot be built as described". Reaching for the work because the
ticket exists is the failure mode this skill prevents.

Never mutate the ticket. No transitions, no comments, no field edits, no assignment —
report what should change and let the user apply it, unless they explicitly ask otherwise.

## Inputs

- **Ticket**: a key (`PROJ-123`) or a browse URL. Required.
- **Live environment** (only if the ticket concerns runtime behavior): follow `dev-servers`.
  It covers asking what is already running and standing up an isolated stack that never
  disturbs it.

## 1. Read the ticket, then classify it

Use the `acli-jira` skill. Always `--json`, and always read the comments — the real
requirements and repro steps often live there rather than in the description.

```sh
acli jira workitem view <KEY> --fields "*navigable" --json   # includes parent and issuelinks
acli jira workitem comment list --key <KEY> --json
acli jira workitem link list --key <KEY> --json
```

Chase what the ticket points at, and what it should have pointed at:

- Linked GitHub issue, PR, design doc, or Figma — including one the ticket *failed* to
  link. Search by title; a matching upstream issue is common and worth naming.
- Duplicates and prior art: search Jira and the repo history for the same error string,
  the same feature name, or the same file.
- Prerequisites: a blocking ticket, an unreleased dependency, an API that does not exist yet.

Then classify, because it routes everything after this. Trust the described work over the
Jira issue type — plenty of "Task" tickets are bugs and plenty of "Bug" tickets are feature
requests. Say which track you picked and why.

| Type | The claim to check | Validated when you can state |
| --- | --- | --- |
| **Bug** | The described behavior is real, and still present on the base branch | Root cause at `file:line`, plus a reproduction |
| **Feature / story** | It is specified well enough to build, and does not already exist | Where it plugs in, what already exists, testable acceptance criteria |
| **Chore / refactor** | The described state is still true and the change is safe | Blast radius, and what proves behavior did not change |
| **Spike / investigation** | The question is answerable and worth the time | The question, and what would answer it |

Note ticket hygiene as you go — missing links, no priority, no acceptance criteria, wrong
component, stale description. It goes in the verdict as suggestions; you do not apply it.

## 2. Set up the workspace

Default to an isolated ticket worktree so validation never dirties the main checkout —
create it (or reuse the existing one for this key) with the `git-worktree` ticket
convention, branched from a freshly fetched base.

Skip the worktree only when the user already has servers running against another checkout
and wants validation there. Say explicitly which tree you validated in — it is part of the
verdict.

Then set up the evidence store with the `evidence` skill. This skill writes
`VALIDATION.md`, `validation.json`, `probes/`, and `before/` into it; `work-ticket` and
`adversarial-review` add the rest later.

## 3. Check the claim in code

Before running anything, work out whether the code supports the ticket's story. Grep the
exact error string, the feature name, or the module the ticket names, then walk outward to
every caller until you reach the entry point a user actually touches.

**For a bug**, the code has to answer:

- **Root cause** in `file:line` terms — not "the provider is wrong" but which line makes the
  wrong choice and why.
- **Still present?** on the current base branch, not just the reported version.
- **Blast radius**: sibling call sites, alternate entry points (other routes, CLI,
  background jobs), copies of the same pattern. A one-line fix that misses three call sites
  is not a fix.

**For a feature**, the code has to answer:

- **Does it already exist**, wholly or partly — a flag that is off, a near-identical
  component, an endpoint that already returns the field.
- **Where it plugs in**: the real insertion point in each layer, and whether the current
  architecture supports it or a preceding change is required.
- **What it collides with**: existing behavior, another in-flight ticket, a shared
  component whose other consumers would be affected.
- **Is it one ticket?** If it is three deliverables wearing a trench coat, say so and
  propose the split rather than validating a scope nobody can review.

**For a chore or refactor**: confirm the described state is still true (code moves), map
the blast radius, and identify what proves behavior is unchanged. If the code has no test
coverage protecting the refactor, adding that coverage is part of the scope, not an extra.

**For a spike**: identify what would actually answer the question and roughly what it
costs. The deliverable is a written answer, not code.

If the investigation contradicts the ticket — the bug is not real, the feature is already
shipped, the refactor was done last month — stop and say so. That is a complete,
successful run.

## 4. Get the evidence

A code read is a hypothesis. Back it with something executable unless that is genuinely
impossible, and label the verdict honestly when you cannot (`confidence: code-only`).

- **Bug — reproduce it.** In-process harness in `.evidence/probes/` when the bug is a pure
  code path; the live app when it is only visible end to end (drive the public API, inspect
  what actually got persisted, read the logs). Stand up a mock upstream when a third-party
  endpoint is involved — its request log proves where traffic did and did not go.
- **Feature — capture the baseline and probe the risky part.** Screenshot the screen the
  feature lands on, capture the current API response shape. Then probe whatever the design
  assumes but has not been shown: that the library supports it, that the endpoint can
  return it, that the component accepts the prop. One small spike beats an estimate.
- **Chore — record the before state** the refactor must preserve: current test run, current
  output, current timings if it is a perf claim.

Follow `evidence` for how probes are written and bounded, what counts as proof, and
environments that mask the claim. Anything that needs the running app or a browser follows
`dev-servers`.

## 5. Clean up

Tear down what you started per `dev-servers`, and remove anything probes created per
`evidence`. Evidence and the worktree stay — they are what the work will build on.

## 6. The verdict

Write `.evidence/VALIDATION.md` as prose the user could paste into a ticket comment
themselves, and `.evidence/validation.json` for the follow-up skill:

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

`acceptance_criteria` is where a feature earns its verdict: if the ticket does not state
testable criteria, write them yourself and get the user to confirm them. Unconfirmed
criteria mean `needs-info`, not `ready` — that check is the feature analogue of reproducing
a bug, and skipping it is how the wrong thing gets built well.

Then report to the user: the verdict in one line, the findings, the scope, the evidence
paths, any gap or risk, and the ticket hygiene suggestions. **Stop there.** Do not start
the work, do not commit, do not open a PR — the follow-up work skill picks up from
`validation.json`, once the user says to go.

## Rules

- Read-only against the product code. The only writes are the worktree, `.evidence/`, and
  the git exclude entry.
- Never edit the Jira ticket.
- Never use default dev ports when the user has an environment running.
- An unbounded probe always gets a watchdog before its first run.
- State plainly what you did not verify. A validation with an honest gap is worth more than
  one that implies coverage it does not have.
