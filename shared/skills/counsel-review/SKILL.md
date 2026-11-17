---
name: counsel-review
description: Two fresh reviewers on two model families review a change with the rules of ponytail-review, and this session merges their findings. Use for "/counsel-review", "counsel review", "second opinion", "two reviewers", "review with another model".
argument-hint: "[quick] [PR number | commit range | branch | files]"
metadata:
  requires: [ponytail-review]
---

# Counsel Review

This skill launches two reviewers. The rules of the review live in `ponytail-review`. Do not repeat them here.

## 1. Scope

- Review the target the user names: uncommitted changes, a branch, a PR number, a commit range or files.
- Nothing named: review the uncommitted changes. If there are none, review the last commit.
- Argument `quick`: use one reviewer, look for Bug and Risk only, and skip the second opinion.

## 2. Brief

Never review inline. The session that wrote the code shares its blind spots.

Write one brief for both reviewers. It has these parts:

- the repo path, the branch and the scope command
- the intent (PR body, commit messages or ticket) and the constraints the user stated
- the order to read and follow `ponytail-review/SKILL.md`, with the absolute path of the installed file next to this one
- the language files that match the diff (`react.md`, `typescript.md`, `python.md` in `ponytail-review`)
- the project profile review file, if one exists

Where the brief goes:

- When `.evidence/` exists, write it to `.evidence/reviews/<UTC timestamp>.brief.md`.
- Otherwise, write it to a `mktemp` file.

## 3. Launch

Run two fresh read-only reviewers in parallel with the same brief:

1. The model of the current thread.
2. A model of a different family.

Follow [second-opinion.md](second-opinion.md) for model choice, launch, the read-only guard and failures.

## 4. Merge

- Same file, nearby lines and the same claim make one finding. Mark the findings that both reviewers found.
- Check the merged list with section 3 of `ponytail-review`.
- Output the `ponytail-review` format, with one more line: `Reviewers:` the two models, or the reason why the second did not run.

When `.evidence/` exists, save the merged report to `.evidence/reviews/<UTC timestamp>.md`. Otherwise, save no report.

## 5. Fix round

A fix is new code. It gets the same bar.
When the author has fixed findings, review only the fix diff. For each fixed finding, ask two questions:

- Does the fix cover the failure case?
- What did it change for other callers?

Report new findings in the same format. Keep the old number for a finding that stays open.
Run two rounds at most for one change. After round two, list what stays open and write `Hand to a human reviewer.`

## 6. Rules

- Stay read-only against the code. Do not edit, commit, run formatters or start dev servers.
- List findings. Change no code.
- Respect the constraints that the user states.
