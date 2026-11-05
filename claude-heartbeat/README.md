# Claude Code heartbeat

The heartbeat keeps the 5-hour Claude usage blocks chained end to end. It runs
as a `systemd --user` timer. `./install.sh` links the files in this directory
into place, so edits here take effect immediately. The owner set it up on
2026-08-19.

## How the usage block works

The 5-hour usage block is a fixed window, not a sliding one. It starts with
your first message after the previous block expired. It ends exactly 5 hours
later.

A heartbeat does not make a block longer. It starts a new block within 5
minutes after the old block expires. So the blocks stay chained, and a reset
does not move into the middle of a work session. You know the cycle before a
task starts, not halfway through it.

This has two results for the design:

- You need one ping for each block boundary, about 5 each day. You do not
  need 288 pings each day.
- The ping must go through the Claude Code CLI with subscription credentials.
  An API-key call to `api.anthropic.com` has separate billing and does not
  start a block.

## How it works

A timer starts the script every 5 minutes. The script does nothing (in about
25 ms) unless the block has expired:

1. Collect each `"timestamp"` from the `~/.claude/projects/**/*.jsonl` files
   that changed in the last 48 hours. These files record the real session
   activity.
2. Add the timestamps from the ping log (see below).
3. Replay the blocks forward over the sorted timeline. A new block starts at
   the first message at or after `current_start + 5h`. This one rule covers
   idle gaps and continuous work.
4. If `now < block_start + 5h`, exit without output. Otherwise, send one
   small ping.

The script keeps its own ping log because it runs with
`--no-session-persistence`. Its pings never go into `~/.claude/projects`.
Without the log, step 3 would not see them, and the script would ping again
every 5 minutes.

### Why the ping is small

A plain `claude -p "hi"` loads the global `CLAUDE.md`, the project
`CLAUDE.md`, the skills and every MCP tool schema. With `claude-flow`
connected, that is a prompt of about 50,000 tokens for a two-token message.
These are the measurements from this machine:

| | Normal session | Heartbeat |
|---|---|---|
| Input tokens | about 50,000 | 236 |
| Output tokens | n/a | about 400 |

These flags make the ping small:

- `--safe-mode` turns off CLAUDE.md, hooks, MCP, skills, plugins and custom
  agents. OAuth authentication still works.
- `--tools ""` removes the tool schemas from the prompt. This flag saves the
  most tokens.
- `--system-prompt "..."` replaces the long default system prompt.
- `--setting-sources ""` ignores the user, project and local `settings.json`.
- `--strict-mcp-config --mcp-config '{"mcpServers":{}}'` is a second guard
  against MCP servers. The empty config must contain the `mcpServers` key.
  Without it, the CLI fails.
- The script runs from an empty scratch directory. So no project `CLAUDE.md`
  and no git status load.

Do not use `--bare`. It forces `ANTHROPIC_API_KEY` or `apiKeyHelper`
authentication. That has separate billing and does not start a subscription
block.

## Authentication

Headless runs need the long-lived token from `claude setup-token`. The
interactive OAuth grant does not work for them.

The interactive grant in `~/.claude/.credentials.json` can expire and stop
refreshing without an error. `claude auth status` still reports
`loggedIn: true`. This happened here: on 2026-08-19, the access token had
been expired since 2026-06-09. Each headless `claude -p` returned
`401 OAuth access token has expired`.

`claude setup-token` writes an `sk-ant-oat01…` token as
`CLAUDE_CODE_OAUTH_TOKEN` to `~/.config/environment.d/claude-code.conf`. The
systemd user manager reads that file at login, so services get the token. The
script also reads the file itself. So it also works under cron, in a bare
shell, or with an old user-manager environment. A test under `env -i`
confirmed this.

> `claude setup-token` creates that file with mode `664`, so all users can
> read it. Run `chmod 600` on it.

## Install on a new machine

1. Create the long-lived token (see Authentication above):

   ```bash
   claude setup-token
   ```

2. Link the files, turn on linger and start the timer:

   ```bash
   ./install.sh
   ```

Other options:

```bash
./install.sh --dry-run      # show what would change, change nothing
./install.sh --uninstall    # stop the timer and remove the links
```

The installer stops when there is no long-lived token. It sets the
permissions of the token file to 600. At the end, it runs the heartbeat once,
so you can see that it works. Before it makes a link, it backs up a real file
at that path with the suffix `.pre-agents-config-bak`.

Dependencies: `jq`, `flock`, GNU `find` and `systemd`. Ubuntu has all of
them.

## Operation

```bash
systemctl --user list-timers claude-heartbeat.timer   # time of the next run
journalctl --user -u claude-heartbeat -f              # follow the log
claude-heartbeat                                      # does nothing while the block is live
claude-heartbeat --force                              # send a real ping now
```

The state is in `~/.local/state/claude-heartbeat/` (`pings`, `lock`, `cwd`).

For quiet hours, change `OnCalendar=*:0/5` in the timer to
`OnCalendar=06..23:0/5`.

## Known problems and their fixes

- Claude Code adds a `find` shell function that calls `bfs`. `bfs` rejects
  relative timestamps such as `-newermt '48 hours ago'`. Shell functions do
  not go into scripts, but an exported function can. So the script calls
  `/usr/bin/find` directly.
- On a laptop, `Persistent=true` is important. cron skips the runs that it
  missed during suspend, and it does not tell you. A systemd timer with
  `Persistent=true` runs when the laptop resumes. This is the main reason to
  use a timer and not `crontab`.
- `flock` stops a run that hangs from blocking the next runs.
- Do not run the heartbeat in CI. GitHub Actions would need a live
  subscription token on a runner.

## Assumption not tested

The heartbeat uses Haiku. The assumption is that a Haiku ping starts the same
account-wide 5-hour block that Opus work uses. The documentation says that the
unified session window works this way. But no local file shows a reset time,
so you cannot prove it offline. To check it, run `/usage` in a session after a
block boundary. If the block start does not match a heartbeat, change
`--model haiku` to `sonnet` in the script.

## Usage policy

At about 5 pings each day, the heartbeat looks like normal use. A plain
`*/5` cron job that sends 288 pings each day looks like abuse of the window
boundaries. The Anthropic usage policy does not clearly allow that use. This is one more reason why the expiry check is part of the design.

## Files

| In this repo | Linked to |
|---|---|
| `claude-heartbeat` | `~/.local/bin/claude-heartbeat` |
| `claude-heartbeat.service` | `~/.config/systemd/user/` |
| `claude-heartbeat.timer` | `~/.config/systemd/user/` |
| `install.sh` | not linked |

`--uninstall` does not remove the state (ping log, lock and scratch
directory) in `~/.local/state/claude-heartbeat/`.
