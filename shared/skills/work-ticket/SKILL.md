---
name: work-ticket
description: Does the work that a validated ticket asks for. Resumes the worktree and verdict that validate-ticket left, implements against the recorded scope and acceptance criteria, captures the matching after-evidence, and puts the diff through an adversarial review before it hands the change back for approval. Use when the user says "let's fix it", "implement this", or "start the work" on a ticket that has already been validated.
argument-hint: "[ticket key]"
metadata:
  requires: [validate-ticket, evidence, dev-servers, file-pr, adversarial-review]
---

# Work Ticket

## Overview

`validate-ticket` established what is true and what must change. This skill makes that
change and proves that it works. It is the second half of a pair. It does not repeat the
first half, and that is deliberate.

The normal case is the **same session** that ran the validation. The ticket, the code trace,
the repro and the fix scope are already in context. Use them. Do not re-read the ticket,
re-trace the code, or re-run the repro from scratch. That wastes the handoff.

A cost of the same session is that you inherit your own blind spots. For this reason the
adversarial review at step 5 is not optional.

## Hard rules (read first)

- **Never commit, push, or open a PR** before the user has reviewed the diff and said to.
- **Never mutate the Jira ticket.** Offer the transition and the comment. Do not apply them.
- **Stay inside the validated scope.** Report what you find outside it. Do not fix it.
- **Follow the hard rules of `dev-servers` and `evidence`** for the running app and for captures.
- **Say which acceptance criteria are *not* met.** A partial result that you state plainly is
  better than a complete-sounding result that is not true.

## 1. Resume the worktree

**Warm session** (this session ran the validation): confirm that the worktree is still as
you left it. You are in the worktree, you are on the validation branch, and the base
has not moved. Then go.

```sh
git rev-parse --show-toplevel && git branch --show-current && git status --short
```

**Cold session** (a new session, or the validation has scrolled out of context): find the
worktree by branch, not by directory name. A T3 Code worktree is under `~/.t3/worktrees/`
and has an opaque name. Match the ticket key in the branch column of `git worktree list`.
Then read `.evidence/validation.json` there and treat it as the brief:

- `workspace` says where to work.
- `findings` is the diagnosis.
- `scope` is the plan.
- `acceptance_criteria` is the definition of done.
- `tests_affected` is work that you owe.

Skim `VALIDATION.md` for the reasoning behind them.

If there is no `validation.json` and no validation in context, stop and run
`validate-ticket` first. The pair exists to prevent work from the ticket text alone.

### Check the verdict before starting

Only `ready` means go. For any other verdict, the user must resolve the problem first.
Saying so is the correct output:

- `needs-info` / `needs-split`: settle the open questions or the proposed split before you
  build, because there is no scope yet.
- `already-done` / `duplicate` / `rejected`: there is no work here. Do not invent some.
- `blocked`: the blocker must clear first.

If the user overrides ("I know, do it anyway"), that is their decision. Proceed on the full
request and note in the PR what you assumed.

## 2. Plan from the verdict, not from scratch

Before you touch anything, state the plan in a few lines: the files from `scope`, the order,
and anything you intend to do that the validation did not expect. Keep it short. This is a
checkpoint, not a design doc.

`tests_affected` is part of the work. Update the tests that encode the old assumption. Add a
test that would have caught the problem that the ticket describes. Write focused tests only,
with no smoke-test padding.

## 3. Implement

**Default: do it inline.** The session holds the trace. A single pass is the fastest correct
path, and delegation costs more context than it saves.

**Delegate only for real breadth**, such as a backend and a frontend change that meet only
at a payload shape. Settle the contract between the agents first (schema, payload, type).
Give each agent its own files, the diagnosis and the acceptance criteria.

For a **spike** ticket the deliverable is a written answer in `.evidence/`, not a diff.
Answer the question, show what you ran, and stop.

## 4. Verify, then capture the after-evidence

Verify first, then capture evidence. Evidence of a broken change has no value.

- Walk through the `acceptance_criteria` one by one and say which are met.
- Run the affected tests, and run lint and type checks scoped to the changed files.
- **Re-run the probe from `.evidence/probes/`.** For a bug this is the strongest signal you
  have. The script that reproduced the failure must now pass, unchanged. If it is cheap and
  deterministic, promote it into the real test suite.

Then capture `.evidence/after/` as the matching half of every artifact in `.evidence/before/`,
with the matching rules in `evidence`.

## 5. Adversarial review

- Run the `adversarial-review` skill on the diff. Never run it inline.
- Give it the intent (what the ticket asks and what the diff claims) and the constraints (services and ports to leave alone).
- Act on the findings as its **Author handoff** section says, and record an outcome for each one.
- Never leave a blocker `acknowledged`. Fix it, or dispute it with `file:line` evidence.
- After fixes, run the affected tests again and refresh any after-evidence that a fix changed.

## 6. Hand back

Stop with the change uncommitted in the worktree. Tell the user:

- what changed and why
- which acceptance criteria are met
- the review verdict and the outcome of each finding
- the evidence paths
- anything out of scope that you found and left alone

Then wait. The user reviews the code first. That is a standing preference, not a formality.

When the user says to file it, use the `file-pr` skill. Two things carry over from here:

- **Do not link `.evidence/` from the PR** (see Sharing in `evidence`). Put the screenshots
  that belong in the PR in the public assets repo, as `file-pr` describes.
- **Put before/after in the two-column table**, with real alt text that describes what each
  image shows. This is the reason for the paired capture in step 4.

Offer the Jira status transition and the comment to the user. Do not apply them.
