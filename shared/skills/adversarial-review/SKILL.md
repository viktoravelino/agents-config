---
name: adversarial-review
description: Run an adversarial code review of a diff (working tree, commit range, branch, or PR) that attacks the change from security, correctness, completeness, and code-quality angles, verifies every suspicion against surrounding code, and emits structured JSON findings that an author agent can consume and act on. Use when the user asks for an adversarial review, a hostile review, to "attack this diff", or to review changes before merge.
---

# Adversarial Review

## Overview

A normal review shares the author's mental model and rubber-stamps the diff. This skill takes the opposite stance: assume the diff is broken and try to prove it. Every suspicion must be verified by reading the surrounding code — not just the diff — before it becomes a finding. The output is a JSON findings file with a stable schema so the author (or an author agent) can pick it up, fix items, and report outcomes per finding.

Padding is failure. An empty blocker list is a valid result; an invented one is not.

## Inputs

Resolve the review scope in this order:

1. Explicit target from the user: PR number (`gh pr diff <n>`), commit range, branch (`git diff <base>...HEAD`), or file list.
2. Default: the uncommitted working-tree diff (`git diff` plus `git diff --cached`; mention untracked files but review them only if clearly part of the change).

Also collect (ask only if genuinely unavailable):

- **Intent**: what the diff claims to do — from the user, PR description, commit messages, or linked ticket. The review attacks the gap between claim and code.
- **Constraints**: paths, services, or ports the reviewer must not touch. The review is always read-only: no edits, no commits, no formatters, no dev servers. Running read-only checks (`ruff check`, `tsc --noEmit`, linters) is allowed.

## Fresh eyes rule

If the current session authored or substantially discussed the diff, do not review it inline — the whole point is not sharing the author's blind spots. Delegate to a read-only `Explore` agent (thoroughness: very thorough) with: the repo path and branch, the scope command, the intent summary, the constraints, the attack angles below, and the output schema below. Instruct it to return only the JSON. If the session is cold (invoked purely to review someone else's diff), review inline.

**Model selection.** Pick the agent's model by review complexity, and state the choice to the user:

- `opus` — the default for anything non-trivial: security/trust-boundary changes, auth or credential paths, concurrency, data migrations, cross-layer diffs (backend + frontend), or diffs touching more than a handful of files.
- `sonnet` — trivial reviews only: small, mechanical, single-concern diffs (rename, config tweak, isolated test change, copy edits) where the correctness question is shallow.

When in doubt, use `opus` — a missed blocker costs more than the model delta.

## Attack angles

Derive concrete suspicions from the diff for each angle, then verify each one in code. Skip angles the diff cannot touch (no frontend changes → skip the frontend angle), and say so in `non_issues` only if the user asked about it.

1. **Security / trust boundary.** For every value that is newly caller-controlled, persisted, or forwarded: where does it end up? Can it select a credential, bypass a policy/authorization check, reach a sink unvalidated, or be stored unbounded/uncanonicalized (case variants, aliases, whitespace, length)? Do privileged or cross-user paths behave differently from the ordinary path?
2. **Correctness.** Legacy/migration behavior: does existing data (missing rows, null fields, old defaults) take a different path than before? Ordering: did the change move a read, write, or check across an authorization or transaction boundary? Do serialization boundaries (`exclude`, DTO mapping, spread/pick) still carry exactly the intended fields? Off-by-one, None/undefined flow, error paths.
3. **Completeness.** Grep for every sibling call site, alternate entry point (CLI, other routes, background tasks, MCP/tools), and copy of the pattern the diff fixes. Do any still have the bug? Any schema snapshot, OpenAPI spec, docs, or generated file that must change with it?
4. **Tests.** Do the new/changed tests assert the actual behavior (persisted values, responses) or do they over-mock into asserting nothing? Is the bug being fixed actually covered by a test that would have caught it?
5. **Language/idiom quality** (should-fix or nit at most, never blocker unless it hides a bug): typing correctness (`any` leaks, required-vs-optional mismatches that the compiler silently accepts), dead code, stale docstrings/comments, naming, lint cleanliness on changed files.

## Verification standard

- **confirmed**: the failure was traced end-to-end in code (or reproduced by a read-only command).
- **plausible**: a concrete concern that could not be fully traced — state exactly what is missing to confirm it.

Every finding needs a concrete failure scenario ("caller sends X → Y happens"). "This could be a problem" without a scenario is not a finding. Suspicions that were investigated and cleared go in `non_issues` with the reason — this proves the angle was covered without padding the findings.

## Output

Write the JSON to `$(git rev-parse --git-common-dir)/adversarial-reviews/<worktree>/<UTC timestamp, e.g. 20260902T1430>.json`, where `<worktree>` is `$(basename "$(git rev-parse --show-toplevel)")` — inside `.git/` so it never dirties the working tree, `--git-common-dir` (not `--git-dir`) so reviews run from a linked worktree land in the main repository's `.git/` rather than a per-worktree dir that dies with it, and the `<worktree>` segment so reviews from different worktrees of the same repo stay grouped by the tree they attacked instead of interleaving in one flat directory — then tell the user the verdict, the path, and a short prose summary of the top findings (severity, file:line, one-line claim). Do not restate the full JSON in prose.

Findings are ranked most severe first. Severity: `blocker` (wrong behavior, security issue, or data corruption reachable in practice), `should-fix` (real defect or trap, not merge-blocking), `nit` (style/clarity). Verdict is derived, never chosen: `block` if any blocker, `concerns` if any should-fix, else `clean`.

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
      "suggested_fix": "<minimal fix, one or two sentences>"
    }
  ],
  "non_issues": [
    { "suspicion": "<what was checked>", "reason": "<why it is fine, with file:line>" }
  ]
}
```

## Author handoff

When an author agent (or this session, later) is asked to act on a review, it should load the JSON and work through `findings` in order. Outcomes are recorded by editing the review file itself: add two fields to each finding as it is dealt with —

```json
{
  "outcome": "fixed | disputed | acknowledged",
  "outcome_note": "<what was done, or the counter-evidence>",
  "deviation_from_suggested_fix": "<only when the applied fix differs from suggested_fix: how, and why>"
}
```

- `fixed`: the defect was corrected; the note names the edit or commit.
- `disputed`: the finding is wrong; the note carries the counter-evidence as code references (`file:line`), not vibes.
- `acknowledged`: deferred deliberately; the note says why. Blockers must not end up `acknowledged` silently.
- `deviation_from_suggested_fix` is omitted when the suggestion was followed. A follow-up review treats it as a claim to verify like any other: the deviation must actually cover the failure scenario.

Everything else in the file is left untouched — the review stays the reviewer's record, with the outcomes layered on. Findings with no `outcome` are still open. A follow-up adversarial review of the fix diff can reference the prior file to check that fixes did not introduce new findings.

## Rules

- Read-only, always. Never edit, commit, stage, or run anything that mutates state.
- Do not soften confirmed findings, and do not manufacture findings to look rigorous.
- Stay in scope: review the diff and what it touches, not the whole codebase's pre-existing debt. Pre-existing issues the diff makes worse are in scope; ones it merely sits near are not.
- Respect the user's stated constraints verbatim (forbidden paths, running services).
