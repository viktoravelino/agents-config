# agents-config

Shared instructions, skills and agents for Claude Code, Codex, GitHub Copilot
and IBM Bob, installed from this repository so edits here take effect
immediately.

```
shared/instructions.md     -> ~/.claude/CLAUDE.md, ~/.codex/AGENTS.md,
                              ~/.copilot/copilot-instructions.md, ~/.bob/rules/agents-config.md
shared/skills/<name>/      -> ~/.claude/skills/<name>, ~/.agents/skills/<name>
shared/agents/<name>.md    -> ~/.claude/agents/<name>.md, ~/.copilot/agents/<name>.md,
                              and a generated ~/.codex/agents/<name>.toml
shared/settings.json       -> ~/.claude/settings.json  (Claude only)
shared/plugins/mcp/        Claude plugin holding user-wide MCP servers; also installed as a
                              plugin in Codex and Copilot, and merged into ~/.bob/settings/mcp.json
```

## Install

Needs [Bun](https://bun.sh). The first run installs dependencies.

```bash
./install                    # interactive on first run; later runs reuse the saved selection
./install --edit             # change the selection
./install --dry-run          # print the plan, change nothing
./install --profile headless --yes    # no prompts (required form when not in a terminal)
```

Flags: `--edit`, `--yes` (skip the confirmation), `--profile <name>`,
`--dry-run`, `-h/--help`.

The plan lists `+` create, `~` update, `-` remove and `!` conflict per tool;
unchanged links are only counted. Links several tools share (see below) are
listed once under "Shared (...)". Links are synced: a skill removed here is
unlinked there. Anything the installer does not own is left alone, and real
files in the way are backed up as `<name>.pre-agents-config-bak` first.

Codex agents are generated from the Claude agent files: `name`, `description`
and the body carry over, `effort` becomes `model_reasoning_effort` (`max` is
`xhigh`), and `tools` and `model` are dropped. A generated file you edited is
kept unless you choose to overwrite it. An agent named `default`, `worker` or
`explorer` overrides the Codex built-in of that name. `~/.codex/config.toml`
is never touched.

Skills can declare dependencies with `metadata.requires: [other-skill]` in
their frontmatter; selecting a skill selects what it requires.

### Copilot and Bob

`~/.agents/skills` is read by Codex, Copilot (CLI and VS Code) and Bob (IDE and
Shell), so skills are linked there once when any of the three is selected and
unlinked only when none is. Nothing is written to `~/.copilot/skills` or
`~/.bob/skills`; Bob also reads `~/.claude/skills`, and the first skill of a
name wins, so a second copy would only duplicate.

- Copilot: instructions and agents are links (Copilot CLI reads the Claude
  agent frontmatter as is). VS Code reads both `~/.claude/agents` and
  `~/.copilot/agents` without deduplicating, so when VS Code is installed and
  agents are selected the installer sets
  `"chat.agentFilesLocations": {"~/.copilot/agents": false}` in
  `~/Library/Application Support/Code/User/settings.json`. The file is edited in
  place (comments and formatting survive), an existing
  `chat.agentFilesLocations` object is merged into, and the key is removed
  again only while it still holds that value. A different value you set is
  reported as a conflict and kept.
- Bob: instructions are one link, `~/.bob/rules/agents-config.md` (Bob reads
  every file in that directory; other files there are never touched). MCP
  servers go into `~/.bob/settings/mcp.json` (see below). Bob gets no agents or
  settings.

Detection: Copilot is found as a CLI (`copilot` on PATH, ignoring `copilot-shim`
paths; `/opt/homebrew/bin`, `~/.local/bin`, or a T3 Code install) and/or the
Copilot extension built into VS Code. Bob is found as a Shell (`bob` on PATH or
a T3 Code install) and/or the IDE app. The target prompt shows which.

`settings.json` is Claude-only, as Codex has no equivalent. Machine-local
approvals stay out of it: Claude Code writes those to `settings.local.json`,
which this repo does not manage.

### State and profiles

The selection and the list of artifacts the installer owns live in
`~/.config/agents-config/state.json` (`$XDG_CONFIG_HOME` is respected). On the
first run, existing links that point into this repo are adopted. Later runs
only ask about items that are new in the repo; without a terminal they are
skipped with a notice.

A profile in `profiles/<name>.json` is a partial selection (tools plus item
names per kind, or `"all"`). `work-mac` is Claude, Codex, Copilot and Bob with everything (MCP servers included);
`headless` is Claude only.

## MCP servers

User-wide MCP servers live in `shared/plugins/mcp/.mcp.json`, not in
`~/.claude.json` (Claude Code rewrites that file constantly). Each server is an
`mcp` item in the installer; the OAuth ones authenticate once per tool.

| Tool | How the servers arrive |
| --- | --- |
| Claude | Settings kind: the repo root is a local marketplace (`.claude-plugin/marketplace.json`) that `shared/settings.json` registers and enables as `mcp@agents-config`. Read straight from the checkout; servers show up as `plugin:mcp:<name>`. Not a separate step, so `mcp` is not offered for Claude alone. |
| Codex | `codex plugin marketplace add <checkout>` then `codex plugin add mcp@agents-config`. Codex copies the plugin into `$CODEX_HOME/plugins/cache`, so the installer reinstalls it when the plugin content hash changes (`~` in the plan). `codex mcp list` shows the servers. |
| Copilot CLI | `copilot plugin marketplace add <checkout>` then `copilot plugin install mcp@agents-config`. Copilot reads the plugin live from the checkout (no copy, no reinstall). `copilot mcp list` shows them under "Plugin servers". |
| Bob | Each server is merged into `~/.bob/settings/mcp.json` under `mcpServers.<name>` (owned per key; your other servers there are never touched). `type: "http"` becomes `streamable-http`, `${VAR}` becomes `${env:VAR}`, stdio entries pass through. |

Codex and Copilot write their own config; the installer never edits it and
honors `CODEX_HOME` / `COPILOT_HOME` because it just runs the CLIs. The plugin
is all-or-nothing there: selecting any server installs the whole plugin, while
Bob follows the per-server selection. Deselecting everything uninstalls the
plugin and drops the `agents-config` marketplace registration. If a CLI is
missing, or that marketplace name already points elsewhere, the step fails
loudly after the rest of the plan is applied and saved.

The Claude marketplace path is absolute, so the repo must live at
`~/projects/agents-config` on every machine. `claude plugin` commands rewrite
`settings.json`; check `git diff` after running one.

## How the skills fit together

Workflow skills stay generic; anything that belongs to one project lives in
that project's profile.

| Kind | Skills |
| --- | --- |
| Workflows | `validate-ticket`, `work-ticket`, `diagnose`, `adversarial-review`, `file-pr`, `request-review`, `standup` |
| Shared helpers | `evidence` (where proof lives), `dev-servers` (running an app in isolation), `git-worktree`, `acli-jira` |
| Project profiles | `langflow` |
| Documents | `design-artifact`, `html-plan` |

Helpers and profiles set `user-invocable: false`: other skills pull them in,
so they stay out of the `/` menu.

### Project profiles

A workflow skill resolves the repository's profile from its origin —
`basename -s .git "$(git remote get-url origin)"` — and reads the sibling skill
of that name if it exists, so `langflow-ai/langflow` and every worktree of it
use `shared/skills/langflow/`. If no skill has that name, it falls back to a
profile whose `metadata.repos` lists the origin's `owner/repo` (this is how
`WatsonOrchestrate/IBM-Langflow` finds the langflow profile). To add a project, create a folder named after
the repository:

```
shared/skills/<repo>/
  SKILL.md      index; frontmatter sets user-invocable: false and metadata.kind: project-profile
  servers.md    ports, start commands, hazards      (read by dev-servers)
  review.md     stack, hot paths, read-only checks  (read by adversarial-review)
  workflow.md   base branches, review channel, ticket tracker, standup scope
```

Only add the files the project needs; a missing file means the generic
defaults apply. Keep private details (internal board fields, customer names)
in gitignored files, as `acli-jira/boards.md` does.

## Skills from other repositories

`use-railway` comes from `railwayapp/railway-skills`. A skill copied from another
repository gets a line right after the frontmatter of its `SKILL.md` naming the
source repo, path and commit; there is no sync tooling (the former
`sync-skills.sh` tracked nothing and was removed).

## T3 Code project files

A profile can also carry a `t3.json` for [T3 Code](https://t3.codes). T3 reads
the file through its workspace file service, which resolves symlinks and
refuses anything outside the checkout, so it has to be a real copy. It is
copied by hand into the main checkout and kept out of the repo's index via
`.git/info/exclude` (the installer does not manage it):

```bash
cp ~/projects/agents-config/shared/skills/langflow/t3.json ~/projects/langflow/t3.json
echo t3.json >> ~/projects/langflow/.git/info/exclude
```

The langflow stack scripts derive the compose project name and host ports from the worktree directory name so several worktrees can run at once. Ports are `p`/`p+1` for the T3 dev stack, `p+2`/`p+3` for the agent stack (`dev-servers`), and `p+10..p+13` for the IBM QA stack; because the URL is dynamic and `previewUrl` is a static string, "Stack up" prints the URLs instead of auto-opening a preview.

Re-run the copy after editing the file here. T3 reads it from the main
checkout only, so worktrees need no copy.

The IBM-Langflow overlay uses `shared/skills/langflow/t3.ibm-langflow.json`,
copied to `~/projects/IBM-Langflow/t3.json` the same way (and excluded with
`echo t3.json >> ~/projects/IBM-Langflow/.git/info/exclude`). Ports are
per-worktree: base = 20000 + (cksum of the worktree directory name % 500) * 20,
so worktrees rarely collide (500 hash buckets); if `up` fails with port already
allocated, another worktree hashed to the same block. Dev uses +0/+1 and the QA
stack +10..+13. The directory name is stable even if the branch is renamed.
Import the scripts once in the T3 project settings.

## Also here

- `claude-heartbeat/` — timer that keeps Claude usage blocks chained (see its README).
