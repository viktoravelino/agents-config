---
name: evidence
description: Where and how to keep proof for ticket, debugging, and review work -- the durable .evidence store under the common git dir, probe scripts and their watchdogs, what counts as proof, matched before/after captures, and cleanup. Referenced by validate-ticket, work-ticket, diagnose, and adversarial-review.
user-invocable: false
---

# Evidence

A claim that something is broken or fixed is only as good as the proof behind it. This skill is the one place that says where the proof lives and what makes it trustworthy. The skills that reference it own *what* they capture. This skill owns *where* and *how*.

## The store

You can browse evidence at `.evidence/` in the checkout. The real bytes live under the **common** git dir, keyed by the checkout's directory name. This has three effects:

- The evidence stays when a worktree is pruned (a validation is often days older than its fix).
- Several worktrees of one repo stay apart.
- A ticket's validation, captures and reviews sit under one key.

```
<git-common-dir>/evidence/<worktree>/   real bytes, durable
<worktree>/.evidence -> the above       symlink, disposable
  VALIDATION.md, validation.json        validate-ticket's verdict
  probes/                               scripts that check a claim (repros, spikes, capture scripts)
  before/                               the starting state: logs, screenshots, API responses, DB rows
  after/                                the matching end state, captured by work-ticket
  reviews/                              adversarial-review findings, <UTC timestamp>.json + latest.json
```

Set it up with the commands below, from anywhere inside the checkout. The setup is idempotent. Run it every time, even if an earlier skill already did. If you recreate a worktree of the same name, the setup links it again to the evidence that is still there.

```sh
cd "$(git rev-parse --show-toplevel)"
WT="$(basename "$PWD")"
COMMON="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
EVID="$COMMON/evidence/$WT"
mkdir -p "$EVID"/{probes,before,after,reviews}
ln -sfn "$EVID" .evidence
grep -qxF '.evidence' "$COMMON/info/exclude" 2>/dev/null || { mkdir -p "$COMMON/info"; echo '.evidence' >> "$COMMON/info/exclude"; }
```

Why the setup is written this way:

- It uses `--git-common-dir`, not `--git-dir`, because the per-worktree git dir dies with the worktree.
- The exclude goes in the **common** `info/exclude`, because git ignores the per-worktree copy. It never goes in the repo's `.gitignore`. The pattern has no trailing slash. A trailing slash would match only directories and would miss the symlink. The real bytes need no exclude, because git does not track anything under `.git/`.

Outside a ticket worktree (for example a quick `diagnose` in the main checkout), use `/tmp/debug-<slug>/` instead. This way one-off probes do not pile up under the main checkout's key.

## Probes

- Keep probes in `.evidence/probes/` (or in the `/tmp` folder above). Never put them in product code. Name each probe for what it checks.
- **Give a watchdog to anything that can loop, grow or hang, before its first run.** Use a timeout, an iteration cap, or an RSS limit with a hard exit. A probe must never be able to take the machine down.
- For anything that needs a running app, follow `dev-servers`: use isolated ports, and never the user's running stack.
- Use the smallest harness that still shows the behavior. Use an in-process script for a pure code path. Use the live app only when the behavior is visible only end to end.
- When a third-party endpoint is involved, start a mock upstream. Its request log proves where traffic did and did not go.
- Write probes so you can run them again unchanged. The same script that showed the bug proves the fix.

## What counts as proof

Be precise about what an artifact shows. "The mock server received only model-listing requests, never an embeddings request" proves misrouting. A red toast does not. Inspect what the system persisted or returned, not only what the UI displayed.

**The environment can mask the claim.** A key in `.env`, a warm cache or existing data can turn the reported failure into a different one, or hide it. When this happens, say so and close the gap on purpose. Run the same state again without the masking key, against a fresh database, or with the cache cleared.

Label what you could not prove. Code-only reasoning is a hypothesis, and you must say so.

## Before and after

You can capture `before/` only while the old state still exists (the broken behavior, the screen that is not built yet). Capture it even when the claim looks obviously true.

`after/` is the matching half of every `before/` artifact. **Matching is the whole point**: use the same script, viewport, route, data and command. Reuse the capture scripts in `probes/`. A pair shot from two different angles proves nothing.

If a `before/` artifact is missing after the change exists, do these steps in order: run `git stash`, restart what needs a restart, capture the artifact, then run `git stash pop`. Never rebuild it from memory. Never present an after-only capture as a comparison.

Number the captures so the pair is obvious (`before/03-dialog-open.png` ↔ `after/03-dialog-open.png`).

## Sharing

`.evidence/` never leaves the machine. Git excludes it and it has no URL. Copy the screenshots that belong in a PR to the public assets repo, as `file-pr` describes. Paste prose findings. Do not link them.

## Cleanup

Remove everything that a probe created in a shared or live environment, and report the removal. This includes test records, provider config, inserted rows, mock servers, background processes and temp ports. Keep the evidence itself. It is the deliverable.
