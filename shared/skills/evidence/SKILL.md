---
name: evidence
description: Where and how to keep proof for ticket, debugging, and review work -- the durable .evidence store under the common git dir, probe scripts and their watchdogs, what counts as proof, matched before/after captures, and cleanup. Referenced by validate-ticket, work-ticket, diagnose, and adversarial-review.
user-invocable: false
---

# Evidence

A claim that something is broken or fixed is only as good as what backs it. This skill is the one place that says where that backing lives and what makes it trustworthy. The skills that reference it own *what* they capture; this owns *where* and *how*.

## The store

Evidence is browsable at `.evidence/` in the checkout, but the real bytes live under the **common** git dir, keyed by the checkout's directory name. That keeps them alive when a worktree is pruned (a validation is often days older than its fix), keeps several worktrees of one repo apart, and puts a ticket's validation, captures, and reviews under one key.

```
<git-common-dir>/evidence/<worktree>/   real bytes, durable
<worktree>/.evidence -> the above       symlink, disposable
  VALIDATION.md, validation.json        validate-ticket's verdict
  probes/                               scripts that check a claim (repros, spikes, capture scripts)
  before/                               the starting state: logs, screenshots, API responses, DB rows
  after/                                the matching end state, captured by work-ticket
  reviews/                              adversarial-review findings, <UTC timestamp>.json + latest.json
```

Set it up with this, from anywhere inside the checkout. It is idempotent: run it every time, whether or not an earlier skill already did, and recreating a worktree of the same name re-links to evidence that is still there.

```sh
cd "$(git rev-parse --show-toplevel)"
WT="$(basename "$PWD")"
COMMON="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
EVID="$COMMON/evidence/$WT"
mkdir -p "$EVID"/{probes,before,after,reviews}
ln -sfn "$EVID" .evidence
grep -qxF '.evidence' "$COMMON/info/exclude" 2>/dev/null || { mkdir -p "$COMMON/info"; echo '.evidence' >> "$COMMON/info/exclude"; }
```

Why it is written this way:

- `--git-common-dir`, not `--git-dir`: the per-worktree git dir dies with the worktree.
- The exclude goes in the **common** `info/exclude` — git ignores the per-worktree copy — and never in the repo's `.gitignore`. The pattern has no trailing slash, which would match only directories and miss the symlink. The real bytes need no exclude; nothing under `.git/` is tracked.

Outside a ticket worktree (a quick `diagnose` in the main checkout), use `/tmp/debug-<slug>/` instead so one-off probes do not pile up under the main checkout's key.

## Probes

- Probes live in `.evidence/probes/` (or the `/tmp` folder above), never in product code. Name them for what they check.
- **Anything that can loop, grow, or hang gets a watchdog before its first run** — a timeout, an iteration cap, an RSS limit with a hard exit. A probe must never be able to take the machine down.
- Anything that needs a running app follows `dev-servers`: isolated ports, never the user's running stack.
- Prefer the smallest harness that still shows the behavior: an in-process script for a pure code path, the live app only when the behavior is only visible end to end.
- When a third-party endpoint is involved, stand up a mock upstream; its request log proves where traffic did and did not go.
- Write probes so they can be rerun unchanged. The same script that showed the bug is what proves the fix.

## What counts as proof

Be precise about what an artifact shows. "The mock server received only model-listing requests, never an embeddings request" proves misrouting; a red toast does not. Inspect what was persisted or returned, not only what the UI displayed.

**The environment can mask the claim.** A key in `.env`, a warm cache, or existing data can turn the reported failure into a different one, or hide it. When that happens, say so and close the gap deliberately — rerun the same state without the masking key, against a fresh database, or with the cache cleared.

Label what you could not prove. Code-only reasoning is a hypothesis, and says so.

## Before and after

`before/` can only be captured while the old state still exists — the broken behavior, the un-built screen — so capture it even when the claim looks obviously true.

`after/` is the matching half of every `before/` artifact. **Matching is the whole point**: same script, same viewport, same route, same data, same command. Reuse the capture scripts in `probes/`. A pair shot from two different angles proves nothing.

If a `before/` artifact is missing once the change exists: `git stash`, restart what needs restarting, capture it, `git stash pop`. Never reconstruct it from memory, and never present an after-only capture as a comparison.

Number captures so the pair is obvious (`before/03-dialog-open.png` ↔ `after/03-dialog-open.png`).

## Sharing

`.evidence/` never leaves the machine — it is git-excluded and has no URL. Screenshots that belong in a PR are copied to the public assets repo as `file-pr` describes; prose findings are pasted, not linked.

## Cleanup

Everything a probe created in a shared or live environment is removed, and the removal is reported: test records, provider config, inserted rows, mock servers, background processes, temp ports. The evidence itself stays — it is the deliverable.
