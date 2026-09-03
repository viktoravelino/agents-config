---
name: work-ticket
description: Do the work a validated ticket asks for -- resume the worktree and verdict left by validate-ticket, implement against the recorded scope and acceptance criteria, capture the matching after-evidence, and put the diff through a fresh-eyes adversarial review before handing it back for approval. Use when the user says "let's fix it", "implement this", or "start the work" on a ticket that has already been validated.
---

# Work Ticket

## Overview

`validate-ticket` established what is true and what needs to change. This skill does that
change and proves it worked. It is the second half of a pair and deliberately does not
re-derive the first half.

The normal case is the **same session** that ran the validation: the ticket, the code trace,
the repro and the fix scope are already in context. Use them. Re-reading the ticket,
re-tracing the code, or re-running the repro from scratch wastes the whole point of the
handoff.

The cost of staying in the same session is that you inherit your own blind spots, so the
adversarial review at step 5 is not optional and never runs inline.

Two hard stops carry over: never mutate the Jira ticket, and never commit or open a PR
until the user has reviewed the diff and said to.

## 1. Resume the workspace

**Warm session** (this session ran the validation): confirm the workspace is still what you
left — you are in the worktree, on the validation's branch, and the base has not moved
underneath you. Then go.

```sh
git rev-parse --show-toplevel && git branch --show-current && git status --short
```

**Cold session** (a new session, or the validation has scrolled out of context): read
`.evidence/validation.json` in the worktree and treat it as the brief. `workspace` says
where to work, `findings` is the diagnosis, `scope` is the plan, `acceptance_criteria` is
the definition of done, `tests_affected` is work you owe. Skim `VALIDATION.md` for the
reasoning behind them.

If there is no `validation.json` and no validation in context, stop and run
`validate-ticket` first. Working from the ticket text alone is exactly what the pair exists
to prevent.

### Check the verdict before starting

Only `ready` means go. Anything else needs the user to resolve it first, and saying so is
the correct output:

- `needs-info` / `needs-split` — the open questions or the proposed split have to be settled
  before there is a scope to build.
- `already-done` / `duplicate` / `rejected` — there is no work here. Do not invent some.
- `blocked` — the blocker has to clear first.

If the user overrides ("I know, do it anyway"), that is their call: proceed on the full
request and note in the PR what was assumed.

## 2. Plan from the verdict, not from scratch

State the plan in a few lines before touching anything: the files from `scope`, the order,
and anything you intend to do that validation did not anticipate. Keep it short — this is a
checkpoint, not a design doc.

The diff stays inside the validated scope. Anything you discover mid-work that is real but
out of scope gets noted for the user, not silently fixed — an unrelated cleanup riding along
is the thing that makes a reviewable diff unreviewable.

`tests_affected` is part of the work. Tests that encode the old assumption get updated, and
the reason the ticket exists gets a test that would have caught it. Focused tests only —
no smoke-test padding.

## 3. Implement

**Default: do it inline.** The session holds the trace; a single pass is the fastest correct
path, and delegation costs more context than it saves.

**Delegate only for genuine breadth** — independent areas that can proceed in parallel, such
as a backend change and a frontend change that meet only at a payload shape. When you do:

- State file ownership up front, per agent, so they cannot collide.
- Give each agent the diagnosis and the acceptance criteria, not just "fix the bug".
- Fix the contract between them yourself first (the schema, the payload field, the type) so
  they are building against something settled rather than negotiating.

For a **spike** ticket the deliverable is a written answer in `.evidence/`, not a diff.
Answer the question, show what you ran, and stop.

## 4. Verify, then capture the after-evidence

Verification comes before evidence — evidence of a broken change is worth nothing.

- Walk the `acceptance_criteria` one by one and say which are met.
- Run the affected tests, plus lint and type checks scoped to the changed files.
- **Re-run the probe from `.evidence/probes/`.** For a bug this is the sharpest signal you
  have: the script that reproduced the failure must now come out clean, unchanged. If it is
  cheap and deterministic, promote it into the real test suite — a repro script that becomes
  a regression test is worth more than either alone.

Then capture `.evidence/after/` as the matching half of every artifact in `.evidence/before/`.

**Matching is the whole point**: same script, same viewport, same route, same data, same
command. A before/after pair shot from two different angles proves nothing and reviewers
will notice. Reuse the exact capture scripts validation left in `.evidence/probes/`.

If a `before/` artifact turns out to be missing, `git stash` the change, restart whatever
needs restarting, capture it, and unstash. Do not reconstruct it from memory and do not
present an after-only screenshot as a comparison.

## 5. Adversarial review — always, always fresh

Invoke the `adversarial-review` skill on the diff. This session authored the change, so its
fresh-eyes rule applies: the review is delegated to a read-only agent, not run inline.
Default to `opus`; `sonnet` only for a genuinely trivial, single-concern diff.

Give the reviewer the intent (what the ticket asked for and what the diff claims to do) and
the constraints (running services and ports it must not disturb). It writes findings JSON to
`.git/adversarial-reviews/<timestamp>.json` in the main repository's git dir, which is why
it survives this worktree.

Then work the findings in order and record an outcome on each one in that same file —
`fixed`, `disputed`, or `acknowledged`, per the skill's author-handoff contract. Every
blocker gets resolved or explicitly disputed with code references; a blocker must never end
up quietly `acknowledged`. Re-run the affected tests after applying fixes, and refresh any
after-evidence a fix invalidated.

Report the verdict and what you did about it. Do not paraphrase a `disputed` finding into
agreement to keep the report tidy.

## 6. Hand back

Stop with the change uncommitted in the worktree and tell the user: what changed and why,
which acceptance criteria are met, the review verdict and finding outcomes, the evidence
paths, and anything out of scope you found and left alone.

Then wait. The user reviews the code first — that is a standing preference, not a formality.

When they say to file it, use the `file-pr` skill. Two things carry over from here:

- **`.evidence/` cannot be linked from the PR.** It is git-excluded and never leaves this
  machine — it now survives the worktree under the common git dir, but it is still not a URL
  anyone else can reach. Screenshots that belong in the PR get copied to the public assets
  repo and embedded as raw URLs, exactly as `file-pr` describes.
- **Before/after belongs in the two-column table**, with real alt text describing what each
  image shows. This is what the paired capture in step 4 was for.

The Jira ticket is still untouched. Offer the status transition and the comment as something
the user can apply; do not apply them.

## Rules

- Never commit, push, or open a PR before the user has reviewed the diff and said to.
- Never edit the Jira ticket.
- Never review your own diff inline.
- Stay inside the validated scope; report what you find outside it.
- Before/after evidence is captured the same way or not presented as a pair.
- Say which acceptance criteria are *not* met. A partial result stated plainly beats a
  complete-sounding one that is not.
