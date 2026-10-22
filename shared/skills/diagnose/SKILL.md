---
name: diagnose
description: Structured debugging for a problem that has no ticket yet -- reproduce it, isolate it, find the root cause at file:line, fix it with a test that would have caught it, and prove the fix. Use when the user pastes an error or stack trace, says something broke or "works here but not there", or behavior diverges from what they expect and the cause is not obvious.
argument-hint: "<error, symptom, or failing command>"
metadata:
  requires: [evidence, dev-servers]
---

# Diagnose

A fix without a reproduction is a guess. This skill finds the cause before you change the code. It then proves the fix with the same thing that proved the bug.

If the problem already has a Jira ticket, use `validate-ticket` instead. It does the same work and leaves the evidence the ticket work needs.

Never commit. The work ends with an uncommitted diff that the user reviews.

## 1. Pin down the symptom

State these three things in one or two lines: the expected behavior, the actual behavior, and where it was seen (branch, environment, data). Use the exact error text. Do not paraphrase it. Ask only for what you cannot look up. For anything about running servers, follow `dev-servers`.

## 2. Reproduce

Make the failure happen on demand, in the smallest form that still fails:

- Use a failing test or a small probe script when the bug is in a pure code path.
- Use the running app when the bug is visible only end to end. Drive the app. Inspect what the app actually persisted or returned, not only what the UI shows.

Write and bound probes as `evidence` says (where they live, watchdogs, what counts as proof). Run the app as `dev-servers` says: use isolated ports and data, and never the user's stack.

If the failure does not reproduce, say so. List what differs between your run and the report (data, config, version, env keys). An environment that masks the bug is a finding, not a dead end.

## 3. Isolate

Narrow the failure to the smallest code path that explains it:

- **Is it a regression?** Find a known-good point. Use `git log -S '<symbol>'` or `git log -L` on the suspect function. Use `git bisect run <probe>` when the probe is cheap and deterministic.
- **What changed around it?** Check dependency bumps, config, migrations and feature flags.
- **Trace the data**: follow the bad value from where you observe it back to where the code produces it.

## 4. Root cause

Name the cause at `file:line`. Say which line makes the wrong decision, and why. "The provider is wrong" is a symptom. "`resolve_provider` at `x.py:88` falls back to the first key when the stored name is lowercase" is a cause.

Then check the blast radius: sibling call sites, alternate entry points and copies of the pattern. A fix that misses one of them is not a fix.

Before you fix, tell the user the cause and the planned fix in a few lines. Stop there if the fix is large or risky, or if it crosses a design decision that the user should make.

## 5. Fix and prove it

- Write the regression test first. Watch it fail for the right reason.
- Make the smallest change that fixes the cause (not the symptom). Include the blast-radius sites.
- Run the reproduction again, unchanged. It must now pass. Run the affected tests, and run lint and type checks scoped to the changed files.
- If the probe is cheap and deterministic, move it into the test suite. Do not leave it in `/tmp`.

For anything larger than a one-line change, offer an `adversarial-review` of the diff before the user reviews it.

## 6. Report

Tell the user, briefly:

- **Cause**: `file:line` and why.
- **Fix**: what changed, including the blast-radius sites.
- **Proof**: the test that failed before and passes now, and the reproduction result.
- **Left alone**: anything related but out of scope, and anything you could not verify.

Clean up as `dev-servers` and `evidence` say. Leave the probe files that the user may want to run again, and say where they are.
