---
name: counsel-review
description: Reviews a change like the senior developer who gets paged when it breaks. Checks that the logic is right, safe, holds under load, is tested, is fast enough and is lean. Two fresh reviewers on two model families read the code, not only the diff. Findings come in plain English, numbered, so the author can say "fix 2 and 5". Use for "review this", "code review", "review my PR", "review the last commit", "is this over-engineered", /counsel-review.
argument-hint: "[quick] [PR number | commit range | branch | files]"
metadata:
  requires: [adversarial-review]
---

# Counsel Review

Review like the senior developer who gets paged when this code breaks, and who is in a bad mood.
Do not agree by default. Try to find the case where the change fails.
Order of importance: correct, safe, holds under load, tested, fast, lean.
An empty report is a valid result. A padded report is a failure.

## 1. Scope

- Review the target the user names: uncommitted changes, a branch, a PR number, a commit range or files.
- Nothing named: review the uncommitted changes. If there are none, review the last commit.
- Argument `quick`: use one reviewer, look for Bug and Risk only, and skip the second opinion.
- Collect the intent: the PR body, the commit messages or the ticket. Ask only if you cannot find it.
- Read the project profile review file if one exists. Follow the **Inputs / Profile** bullet of `adversarial-review`.

## 2. Understand first

- Read the diff. Then read the code it touches: the callers of each changed function, the functions it calls and the tests.
- Trace the data: where it comes in, what the code stores and what goes out.
- When a signature, return value or behavior changes, grep every caller.
- Find the expected load in the repo (README, deploy config). Say which load you assumed.
- Find what lint and CI already enforce: lint config, CI workflows, pre-commit hooks. Do not report what they catch.
- Report what they do not catch. Examples: a type checker that no CI job runs, or a hook-dependency lint rule that is off.

## 3. The counsel

Never review inline. The session that wrote the code shares its blind spots.
Run two fresh read-only reviewers in parallel with the same brief:

1. The model of the current thread.
2. A model of a different family.

Follow [second-opinion.md](../adversarial-review/second-opinion.md) for model choice, launch, the read-only guard and failure handling. These differences apply:

- The reviewers return findings in the format of section 6, not JSON. Change the closing lines of the brief to match.
- Put the brief in the evidence store if one exists. Otherwise write it to a temporary file.
- In Claude Code, use the review agent that the user defined for the same-model reviewer (for example `deep`). If there is none, use `Explore`.
- If the second reviewer fails or is not available, say so in the report and continue.

This session merges the two results. Same file, nearby lines and the same claim make one finding. Mark the findings that both reviewers found.
Then check the merged list as section 5 says.

## 4. Look for

1. **Bug**: a wrong result, a crash or a missed edge case (empty, zero, last item, rounding, time zones).
   A caller that the change breaks. A fix in one caller while the shared function stays broken.
   A loading or error state that the code treats as empty data. Existing data that now takes a new path.
2. **Risk**: security. Input that reaches a sink unchecked. Authorization that differs between two paths to the same resource.
   A denial that leaks that the resource exists. Secrets in logs or error text.
   Data loss: swallowed errors, writes in the wrong order, no transaction.
3. **Scale**: fine for one user, wrong for many. Check-then-write races. A stale async result that overwrites newer state.
   A query per item. Lists that only grow. Per-process state that must be shared.
4. **Missing test**: risky new logic with no test that fails when the logic breaks. Ask for one good test, not coverage.
   A bug fix needs a test that fails on the base branch. Check that the assertion depends on the changed lines.
   When it is cheap, run the new test against the base in a detached worktree (see `git-worktree`).
   Flag tests that mock the code under test, or the security check they claim to cover.
5. **Speed**: a big slowdown is a problem. A small win is Nice to have.
6. **Lean**: code that should not exist or should be smaller.
   - delete: dead code, unused options, speculative features.
   - reuse: the repo already has this helper. Name the path.
   - stdlib/native: the language or platform already does it.
   - yagni: an abstraction with one implementation, or config that nobody sets.
   - merge: near-copies that must change together. One rule kept in two places, such as a frontend constant copied from a backend source.
   - split: one function with several unrelated jobs. Split by job, never by line count.

When the diff touches these, also read: [react.md](react.md) for `.tsx` and `.jsx` files, hooks and stores;
[typescript.md](typescript.md) for `.ts` and `.tsx` files; [python.md](python.md) for `.py` files, migrations and `pyproject.toml`.
Pass the matching files to the reviewers.

## 5. Check before you report

- No case, no finding. State it as: "this input or situation leads to this wrong result".
- Re-read the lines. Confirm that the caller exists, that the value can really be empty and that the code really is unused.
- Prove each Must fix. Run a read-only command or a test when one can show it. Otherwise say that you traced it by reading only.
- Stay on the change. Report only what the diff added, changed or broke.
  List a problem that was there before under `Not in this change:`, three lines at most. It never affects the verdict.
- Propose the smallest fix that works. Prefer a fix that deletes code. A fix that adds a layer, a framework or config needs a reason.
- No style taste, no "consider", no vague worry, nothing that lint already reports.
- Nice to have: five findings at most. Drop the rest.

## 6. Output

Use very simple English. Explain a technical term at first use. The reader may not know this code.

Start with `What this change does:` in two or three sentences. Then write three groups. Skip an empty group.

- **Must fix**: a bug, a security hole, data loss, or a break at the expected load.
- **Should fix**: risky code with no test, real slowness, duplication, code that should not exist.
- **Nice to have**: small wins.

Number the findings across all groups, so the user can say "fix 2 and 5".
Each finding has a bold title with `path:Lx-y`, then four parts of one or two short sentences each:
**What this is**, **Problem**, **Fix**, **If we skip it**.
A Must fix has a fifth part, **Proof**: the command you ran and its result, or "read only".

Example:

1. **Old search result replaces the new one** (`src/search/useSearch.ts:L18-31`)
   - **What this is:** This hook fetches results each time the user types a letter and shows them in the list.
   - **Problem:** Responses can arrive out of order. The reply for "ca" can arrive after the reply for "cat", and it overwrites the list. The user sees results for the wrong text.
   - **Fix:** Keep an `AbortController` in the effect and call `abort()` in the cleanup. The old request stops and cannot set state.
   - **If we skip it:** On a slow network the list shows wrong results, and the user cannot tell why.
   - **Proof:** Read only. `setResults` runs with no check that the query is still current (L27).

End with these lines:

- `Verdict: Ship.` or `Verdict: fix 1 and 3 first.`
- `Lean: -<N> lines possible.` when lean findings exist.
- `Reviewers:` the two models, or the reason why the second did not run.
- `Not checked:` one line, if something mattered and you could not check it.

Nothing found: write `What this change does:`, then `Looks good. Ship.` and one line on what you checked.

## 7. Fix round

A fix is new code. It gets the same bar.
When the author has fixed findings, review only the fix diff. For each fixed finding, ask two questions:

- Does the fix cover the failure case?
- What did it change for other callers?

Report new findings in the same format. Keep the old number for a finding that stays open.
Run two rounds at most for one change. After round two, list what stays open and write `Hand to a human reviewer.`

## 8. Rules

- Stay read-only against the code. Do not edit, commit, run formatters or start dev servers.
- List findings. Change no code.
- Respect the constraints that the user states.
