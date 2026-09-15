---
name: diagnose
description: Structured debugging for a problem that has no ticket yet -- reproduce it, isolate it, find the root cause at file:line, fix it with a test that would have caught it, and prove the fix. Use when the user pastes an error or stack trace, says something broke or "works here but not there", or behavior diverges from what they expect and the cause is not obvious.
argument-hint: "<error, symptom, or failing command>"
---

# Diagnose

A fix without a reproduction is a guess. This skill finds the cause before touching the code, and proves the fix with the same thing that proved the bug.

If the problem already has a Jira ticket, use `validate-ticket` instead — it does this and leaves the evidence the ticket work needs.

Never commit. The work ends with an uncommitted diff the user reviews.

## 1. Pin down the symptom

State in one or two lines: expected behavior, actual behavior, and where it was seen (branch, environment, data). Use the exact error text — do not paraphrase it. Ask only for what cannot be looked up; for anything about running servers, follow `dev-servers`.

## 2. Reproduce

Get the failure to happen on demand, in the smallest form that still fails:

- A failing test or a small probe script when the bug is a pure code path.
- The running app when it is only visible end to end — drive it, and inspect what was actually persisted or returned, not just what the UI shows.

Write and bound probes per `evidence` (where they live, watchdogs, what counts as proof). Run the app per `dev-servers` — isolated ports and data, never the user's stack.

If it will not reproduce, say so and list what differs between your run and the report (data, config, version, env keys). An environment that masks the bug is a finding, not a dead end.

## 3. Isolate

Narrow to the smallest code path that explains the failure:

- **Is it a regression?** Find a known-good point. `git log -S '<symbol>'` or `git log -L` on the suspect function, and `git bisect run <probe>` when the probe is cheap and deterministic.
- **What changed around it?** Dependency bumps, config, migrations, feature flags.
- **Trace the data**: follow the bad value from where it is observed back to where it is produced.

## 4. Root cause

Name it at `file:line`: which line makes the wrong decision, and why. "The provider is wrong" is a symptom; "`resolve_provider` at `x.py:88` falls back to the first key when the stored name is lowercase" is a cause.

Then check the blast radius — sibling call sites, alternate entry points, copies of the pattern. A fix that misses one of them is not a fix.

Before fixing, state the cause and the planned fix to the user in a few lines. Stop there if the fix is large, risky, or crosses a design decision the user should make.

## 5. Fix and prove it

- Write the regression test first, and watch it fail for the right reason.
- Make the smallest change that fixes the cause (not the symptom), including the blast-radius sites.
- Re-run the reproduction unchanged — it must now pass. Run the affected tests, plus lint and type checks scoped to the changed files.
- If the probe is cheap and deterministic, promote it into the test suite rather than leaving it in `/tmp`.

For anything beyond a one-line change, offer an `adversarial-review` of the diff before the user reviews it.

## 6. Report

Tell the user, briefly:

- **Cause**: `file:line` and why.
- **Fix**: what changed, including the blast-radius sites.
- **Proof**: the test that failed before and passes now, and the reproduction result.
- **Left alone**: anything related but out of scope, and anything you could not verify.

Clean up per `dev-servers` and `evidence`. Leave probe files the user may want to rerun, and say where they are.
