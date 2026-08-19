# Claude Code heartbeat — keeping the 5-hour blocks chained

Set up 2026-08-19. Runs as a `systemd --user` timer; `./install.sh` links the
files in this directory into place, so edits here take effect immediately.

## The mechanic being exploited

Claude's 5-hour usage block is a **fixed window, not a sliding one**. It starts on
your first message after the previous block expired, and dies exactly 5h later.

So a heartbeat does *not* extend anything. What it buys you is that the moment a
block expires, a new one is born within ≤5 minutes — blocks stay chained
end-to-end, and resets never drift into the middle of a work session. You are
always *ahead* of the cycle instead of discovering it mid-task.

Two consequences that shape the design:

- You don't need 288 pings/day. You need **one ping per block boundary**, ~5/day.
- A ping must go through the **Claude Code CLI on subscription credentials**.
  An API-key call to `api.anthropic.com` is separate billing and does nothing.

## How it works

A timer fires every 5 minutes, but the script is a **~25ms no-op** unless the
block has actually expired:

1. Collect every `"timestamp"` from `~/.claude/projects/**/*.jsonl` modified in
   the last 48h — that is the record of real session activity.
2. Merge in our own ping log (see below).
3. Replay blocks forward over the sorted timeline: *a new block begins at the
   first message at or after `current_start + 5h`*. That single rule handles both
   idle gaps and continuous back-to-back work.
4. If `now < block_start + 5h`, exit silently. Otherwise fire one minimal ping.

**Why a separate ping log:** the heartbeat runs with `--no-session-persistence`,
so its own pings never land in `~/.claude/projects`. Without recording them
separately, step 3 would never see them and the script would re-ping every
5 minutes forever.

### Why the ping is so cheap

A naive `claude -p "hi"` loads the global `CLAUDE.md`, project `CLAUDE.md`,
skills, and every MCP tool schema. With `claude-flow` connected that is a
**~50,000 token** prompt for a two-token message. Measured on this machine:

| | normal session | heartbeat |
|---|---|---|
| input tokens | ~50,000 | **236** |
| output tokens | — | ~400 |

The flags that get you there:

- `--safe-mode` — disables CLAUDE.md, hooks, MCP, skills, plugins, custom agents,
  **while keeping OAuth auth working**. Do *not* use `--bare`: it looks like the
  right flag but forces `ANTHROPIC_API_KEY`/`apiKeyHelper` auth, which bills
  separately and does nothing for the subscription block.
- `--tools ""` — no tool schemas in the prompt. The single biggest saving.
- `--system-prompt "..."` — replaces the multi-thousand-token default.
- `--setting-sources ""` — ignore user/project/local `settings.json`.
- `--strict-mcp-config --mcp-config '{"mcpServers":{}}'` — belt and braces.
  Note the empty config **must** contain the `mcpServers` key or the CLI errors.
- Runs from an empty scratch cwd, so no project `CLAUDE.md` and no git status.

## Auth — the part that actually breaks

**Headless runs need the long-lived token from `claude setup-token`, not the
interactive OAuth grant.**

The interactive grant in `~/.claude/.credentials.json` can expire and silently
stop refreshing, while `claude auth status` still cheerfully reports
`loggedIn: true`. That was exactly the state here on 2026-08-19: the access token
had expired on 2026-06-09 and every headless `claude -p` returned
`401 OAuth access token has expired`.

`claude setup-token` writes an `sk-ant-oat01…` token to
`~/.config/environment.d/claude-code.conf` as `CLAUDE_CODE_OAUTH_TOKEN`. The
systemd user manager picks that file up at login, so services inherit it — but
the script sources it explicitly anyway, so it also works under cron, a bare
shell, or a stale user-manager environment. Verified working under `env -i`.

> That conf file is created world-readable (`664`). `chmod 600` it.

## Install on a new machine

```bash
claude setup-token          # required first — see Auth below
./install.sh                # link, enable linger, start the timer
```

```
./install.sh --dry-run      # show what would change, touch nothing
./install.sh --uninstall    # stop the timer and remove the links
```

The installer refuses to proceed without a long-lived token, tightens the
permissions on the token file, and finishes by running the heartbeat once so you
see it working. Existing real files are backed up with `.pre-agents-config-bak`
before linking.

Dependencies: `jq`, `flock`, GNU `find`, `systemd` — all standard on Ubuntu.

## Operating it

```bash
systemctl --user list-timers claude-heartbeat.timer   # when is the next tick
journalctl --user -u claude-heartbeat -f              # watch it
claude-heartbeat                                      # dry run, no-ops if block is live
claude-heartbeat --force                              # force a real ping
```

State lives in `~/.local/state/claude-heartbeat/` (`pings`, `lock`, `cwd`).

For quiet hours, change the timer's `OnCalendar=*:0/5` to `OnCalendar=06..23:0/5`.

## Gotchas found the hard way

- **`find` is shadowed.** Claude Code injects a `find` shell function that shims
  to `bfs`, which rejects relative `-newermt '48 hours ago'` timestamps. Shell
  functions don't leak into scripts, but the script calls `/usr/bin/find`
  explicitly so an exported one can't break it.
- **`Persistent=true` matters on a laptop.** cron silently skips ticks missed
  while suspended; a systemd timer with `Persistent=true` fires on resume. This
  is the main reason to prefer a timer over `crontab`.
- **`flock`** stops a hung invocation stacking up behind the next tick.
- **Don't host this in CI.** GitHub Actions would mean shipping a live
  subscription token to a runner.

## Unverified assumption

That a **Haiku** heartbeat opens the same account-wide 5h block that Opus work
draws from. That's how the unified session window is documented to behave, but no
local file exposes a reset timestamp, so it can't be proven offline. Check
`/usage` in a session after a boundary; if the block start doesn't line up with a
heartbeat, change `--model haiku` to `sonnet` in the script.

## Policy note

At ~5 pings/day this is indistinguishable from normal use. A naive `*/5` cron
that really pings 288 times/day looks like what it is — farming window
boundaries — and sits in a grey area of Anthropic's usage policy. Another reason
the guard is the design, not an optimisation.

## Files

| in this repo | linked to |
|---|---|
| `claude-heartbeat` | `~/.local/bin/claude-heartbeat` |
| `claude-heartbeat.service` | `~/.config/systemd/user/` |
| `claude-heartbeat.timer` | `~/.config/systemd/user/` |
| `install.sh` | — |

State (ping log, lock, scratch cwd) lives in
`~/.local/state/claude-heartbeat/` and is left alone by `--uninstall`.
