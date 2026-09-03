---
name: validate-ticket
description: Validate a Jira ticket before any work starts -- read the ticket and its linked issues, classify what it actually asks for (bug, feature, chore, spike), set up an isolated worktree with an evidence folder, check the claim against the code and a live environment, and write a verdict the follow-up work skill consumes. Use when the user says "validate this ticket", "check this ticket", or pastes a Jira key or URL before asking for work to start.
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

- **Ticket**: a key (`LE-2454`) or a browse URL. Required.
- **Live environment** (ask once if the ticket concerns runtime behavior and the user has
  not said): are servers already running and on which ports, is auto-login on, which API
  keys are in `.env`. If nothing is running, start what is needed on **non-default ports**
  so an existing dev environment is never disturbed.

## 1. Read the ticket, then classify it

Use the `acli-jira` skill. Always `--json`, and always read the comments — the real
requirements and repro steps often live there rather than in the description.

```sh
acli jira workitem view <KEY> --json
acli jira workitem comment list <KEY> --json
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

Default to an isolated worktree so validation never dirties the main checkout, using the
`git-worktree` skill's conventions (sibling dir, `<project>-<TICKET>`, `.env` files copied
in, branched from a freshly fetched base). Use the branch prefix the ticket type implies —
`fix/`, `feat/`, `chore/`, `spike/`.

```sh
git fetch origin <base> && git worktree add -b <type>/<KEY>-<slug> ../<project>-<KEY> origin/<base>
```

Skip the worktree only when the user already has servers running against another checkout
and wants validation there. Say explicitly which tree you validated in — it is part of the
verdict.

### The evidence folder

Evidence is browsable at `.evidence/` next to the code, but the real bytes live under the
**common** git dir so they survive the worktree being pruned — a validation is often days
older than the fix, and the folder is the deliverable. `.evidence/` is a symlink into
`$(git rev-parse --git-common-dir)/evidence/<worktree>/`, keyed by the worktree name so
several worktrees of the same repo do not collide, and so the dashboard can line a ticket's
evidence up with its reviews and sessions under one key.

```
<git-common-dir>/evidence/<worktree>/   <- real bytes, durable
<worktree>/.evidence -> the above       <- symlink, browsable next to the code
  VALIDATION.md     the human-readable verdict
  validation.json   the machine-readable verdict (schema below)
  probes/           scripts that check the claim: bug repros, feasibility spikes
  before/           the captured starting state: logs, screenshots, API responses, DB rows
```

The symlink is disposable — deleting the worktree deletes it, but the real bytes under the
common git dir stay. Recreating a worktree of the same name (resuming the ticket) re-links to
the evidence that is still there, so the `mkdir -p`/`ln -sfn` below are safe to re-run.

The symlink must never reach a commit. Git only reads `info/exclude` from the **common** git
dir — the per-worktree one at `.git/worktrees/<name>/info/exclude` is ignored — so exclude it
there, idempotently, and never by editing the repo's `.gitignore`. The pattern is `.evidence`
with no trailing slash: a trailing-slash pattern matches only directories and would miss the
symlink. The real bytes need no exclude — nothing under `.git/` is ever tracked.

```sh
WT="$(basename "$(git rev-parse --show-toplevel)")"
EVID="$(git rev-parse --git-common-dir)/evidence/$WT"
mkdir -p "$EVID"/{probes,before}
ln -sfn "$EVID" .evidence
EX="$(git rev-parse --git-common-dir)/info/exclude"
mkdir -p "$(dirname "$EX")"
grep -qxF '.evidence' "$EX" || echo '.evidence' >> "$EX"
```

The later work skill adds `.evidence/after/` alongside it. `before/` is the half of the
pair that can only be captured while the current state still exists — the broken behavior
for a bug, the un-built screen for a feature — so capture it even when the ticket looks
obviously true.

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

Be precise about what evidence proves. "The mock server received only model-listing
requests, never an embeddings request" is proof of misrouting; a red toast is not.

Two standing hazards:

- **The environment can mask the claim.** A key present in `.env` can turn the ticket's
  exact error into a different downstream one. When that happens, say so and close the gap
  deliberately (re-run the persisted state through the same factory without the key).
- **Anything unbounded gets a watchdog before its first run** — a lap counter, an RSS limit
  with a hard exit. A repro must never be able to take the machine down.

Drive the UI with the repo's own Playwright install rather than adding a dependency.

## 5. Clean up

Everything created in a shared or live environment gets removed, and the removal gets
reported: test records, provider config, inserted rows, mock servers, background processes,
temp ports. Artifacts under `.evidence/` stay — they are the deliverable.

The worktree stays too. It is the workspace the work will use.

## 6. The verdict

Write `.evidence/VALIDATION.md` as prose the user could paste into a ticket comment
themselves, and `.evidence/validation.json` for the follow-up skill:

```json
{
  "schema": "ticket-validation/v1",
  "ticket": "LE-2454",
  "url": "https://<site>/browse/LE-2454",
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
