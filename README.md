# agents-config

This repository holds shared instructions, skills and agents for Claude Code,
Codex, GitHub Copilot and IBM Bob. The installer links them into each tool, so
edits here take effect immediately.

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

You need [Bun](https://bun.sh). The first run installs dependencies.

```bash
./install                    # interactive on first run; later runs reuse the saved selection
./install --edit             # change the selection
./install --dry-run          # print the plan, change nothing
./install --profile headless --yes    # no prompts (required form when not in a terminal)
```

Flags: `--edit`, `--yes` (skip the confirmation), `--profile <name>`,
`--dry-run`, `-h/--help`.

For each tool, the plan lists `+` create, `~` update, `-` remove and `!` conflict.
It only counts unchanged links. It lists links that several tools share (see
below) once, under "Shared (...)". The installer keeps links in sync: when you
remove a skill here, the installer unlinks it there. The installer leaves alone
anything that it does not own. When a real file is in the way, the installer
first backs it up as `<name>.pre-agents-config-bak`.

The installer generates the Codex agents from the Claude agent files. `name`,
`description` and the body carry over. `effort` becomes `model_reasoning_effort`
(`max` becomes `xhigh`). `tools` and `model` are dropped. The installer keeps a
generated file that you edited, unless you choose to overwrite it. An agent named
`default`, `worker` or `explorer` overrides the Codex built-in agent of that
name. The installer never touches `~/.codex/config.toml`.

A skill can declare dependencies with `metadata.requires: [other-skill]` in its
frontmatter. When you select a skill, the installer also selects what it requires.

### Copilot and Bob

Codex, Copilot (CLI and VS Code) and Bob (IDE and Shell) all read
`~/.agents/skills`. The installer links skills there once when you select any of
the three. It unlinks them only when you select none. The installer writes nothing
to `~/.copilot/skills` or `~/.bob/skills`. Bob also reads `~/.claude/skills`, and
the first skill of a name wins, so a second copy would only duplicate.

- Copilot: instructions and agents are links. Copilot CLI reads the Claude agent
  frontmatter as is. VS Code reads both `~/.claude/agents` and
  `~/.copilot/agents` without deduplicating. So when VS Code is installed and you
  select agents, the installer sets
  `"chat.agentFilesLocations": {"~/.copilot/agents": false}` in
  `~/Library/Application Support/Code/User/settings.json`. The installer edits
  the file in place, so comments and formatting survive. It merges into an
  existing `chat.agentFilesLocations` object. It removes the key again only while
  the key still holds that value. If you set a different value, the installer
  reports a conflict and keeps your value.
- Bob: instructions are one link, `~/.bob/rules/agents-config.md`. Bob reads
  every file in that directory, and the installer never touches the other files
  there. MCP servers go into `~/.bob/settings/mcp.json` (see below). Bob gets no
  agents or settings.

Detection: the installer finds Copilot as a CLI and/or as the Copilot extension
built into VS Code. It finds the CLI as `copilot` on PATH (ignoring `copilot-shim`
paths), in `/opt/homebrew/bin` or `~/.local/bin`, or as a T3 Code install. It
finds Bob as a Shell (`bob` on PATH or a T3 Code install) and/or as the IDE app.
The target prompt shows which.

`settings.json` is Claude-only, because Codex has no equivalent. Machine-local
approvals stay out of it. Claude Code writes them to `settings.local.json`, which
this repo does not manage.

### Missing tools

In the prompt, you can select only detected tools. The rest show "not found" and
are disabled. A saved selection or profile can still name a tool that is not
installed. In that case, the tool stays in the saved selection and the installer
plans nothing for it. The installer prints a "Skipped <tool>: not found" line and
leaves alone what it already owns for that tool. The installer plans shared links
such as `~/.agents/skills/<name>` while any detected tool wants them.
Non-interactive runs follow the same rules.

### State and profiles

The selection and the list of artifacts that the installer owns live in
`~/.config/agents-config/state.json`. The installer respects `$XDG_CONFIG_HOME`.
On the first run, the installer adopts existing links that point into this repo.
Later runs ask only about items that are new in the repo. Without a terminal, the
installer skips them and prints a notice.

A profile in `profiles/<name>.json` is a partial selection: tools plus item names
per kind, or `"all"`. `work-mac` is Claude, Codex, Copilot and Bob with
everything (MCP servers included). `headless` is Claude only.

## MCP servers

User-wide MCP servers live in `shared/plugins/mcp/.mcp.json`, not in
`~/.claude.json`, because Claude Code rewrites that file constantly. Each server
is an `mcp` item in the installer. The OAuth servers authenticate once per tool.

| Tool | How the servers arrive |
| --- | --- |
| Claude | Settings kind: the repo root is a local marketplace (`.claude-plugin/marketplace.json`) that `shared/settings.json` registers and enables as `mcp@agents-config`. Claude reads it straight from the checkout. The servers show up as `plugin:mcp:<name>`. This is not a separate step, so the installer does not offer `mcp` for Claude alone. |
| Codex | `codex plugin marketplace add <checkout>` then `codex plugin add mcp@agents-config`. Codex copies the plugin into `$CODEX_HOME/plugins/cache`, so the installer reinstalls it when the plugin content hash changes (`~` in the plan). `codex mcp list` shows the servers. |
| Copilot CLI | `copilot plugin marketplace add <checkout>` then `copilot plugin install mcp@agents-config`. Copilot reads the plugin live from the checkout, with no copy and no reinstall. `copilot mcp list` shows the servers under "Plugin servers". |
| Bob | The installer merges each server into `~/.bob/settings/mcp.json` under `mcpServers.<name>`. It owns each key separately and never touches your other servers there. `type: "http"` becomes `streamable-http`, `${VAR}` becomes `${env:VAR}`, and stdio entries pass through. |

Codex and Copilot write their own config. The installer never edits it. It
honors `CODEX_HOME` and `COPILOT_HOME` because it just runs the CLIs. For these
two tools, the plugin is all-or-nothing: when you select any server, the
installer installs the whole plugin. Bob follows the per-server selection. When
you deselect everything, the installer uninstalls the plugin and drops the
`agents-config` marketplace registration. If the CLI cannot run, the installer
skips the plugin step and prints a notice. Links and file merges still apply. If
the `agents-config` marketplace name already points elsewhere, the step fails
after the installer applies and saves the rest of the plan.

The Claude marketplace path is absolute, so the repo must live at
`~/projects/agents-config` on every machine. `claude plugin` commands rewrite
`settings.json`. Check `git diff` after you run one.

## How the skills fit together

Workflow skills stay generic. Anything that belongs to one project lives in that
project's profile.

| Kind | Skills |
| --- | --- |
| Workflows | `validate-ticket`, `work-ticket`, `diagnose`, `adversarial-review`, `file-pr`, `request-review`, `standup` |
| Shared helpers | `evidence` (where proof lives), `dev-servers` (running an app in isolation), `git-worktree`, `acli-jira` |
| Project profiles | `langflow` |
| Documents | `design-artifact`, `html-plan` |

Helpers and profiles set `user-invocable: false`. Other skills pull them in, so
they stay out of the `/` menu.

### Project profiles

A workflow skill resolves the repository's profile from its origin with
`basename -s .git "$(git remote get-url origin)"`. It reads the sibling skill of
that name if one exists, so `langflow-ai/langflow` and every worktree of it use
`shared/skills/langflow/`. If no skill has that name, the workflow skill falls
back to a profile whose `metadata.repos` lists the origin's `owner/repo`. This is
how `WatsonOrchestrate/IBM-Langflow` finds the langflow profile. To add a
project, create a folder named after the repository:

```
shared/skills/<repo>/
  SKILL.md      index; frontmatter sets user-invocable: false and metadata.kind: project-profile
  servers.md    ports, start commands, hazards      (read by dev-servers)
  review.md     stack, hot paths, read-only checks  (read by adversarial-review)
  workflow.md   base branches, review channel, ticket tracker, standup scope
```

Add only the files that the project needs. When a file is missing, the generic
defaults apply. Keep private details (internal board fields, customer names) in
gitignored files, as `acli-jira/boards.md` does.

## Skills from other repositories

`use-railway` comes from `railwayapp/railway-skills`. When you copy a skill from
another repository, add a line right after the frontmatter of its `SKILL.md`. The
line names the source repo, path and commit. There is no sync tooling. The former
`sync-skills.sh` tracked nothing, so it was removed.

## T3 Code project files

A profile can also carry a `t3.json` for [T3 Code](https://t3.codes). T3 reads
the file through its workspace file service. That service resolves symlinks and
refuses anything outside the checkout, so the file must be a real copy. You copy
it by hand into the main checkout and keep it out of the repo's index with
`.git/info/exclude`. The installer does not manage it:

```bash
cp ~/projects/agents-config/shared/skills/langflow/t3.json ~/projects/langflow/t3.json
echo t3.json >> ~/projects/langflow/.git/info/exclude
```

The langflow stack scripts derive the compose project name and host ports from the worktree directory name, so several worktrees can run at once. Ports are `p`/`p+1` for the T3 dev stack, `p+2`/`p+3` for the agent stack (`dev-servers`), and `p+10..p+13` for the IBM QA stack. The URL is dynamic and `previewUrl` is a static string, so "Stack up" prints the URLs instead of it auto-opening a preview.

Run the copy again after you edit the file here. T3 reads it from the main
checkout only, so worktrees need no copy.

The IBM-Langflow overlay uses `shared/skills/langflow/t3.ibm-langflow.json`. You
copy it to `~/projects/IBM-Langflow/t3.json` the same way, and exclude it with
`echo t3.json >> ~/projects/IBM-Langflow/.git/info/exclude`. Ports are
per-worktree: base = 20000 + (cksum of the worktree directory name % 500) * 20.
With 500 hash buckets, worktrees rarely collide. If `up` fails with "port already
allocated", another worktree hashed to the same block. Dev uses +0/+1 and the QA
stack uses +10..+13. The directory name stays stable even if you rename the
branch. Import the scripts once in the T3 project settings.

## Checks and CI

Run `bun run check` to validate the repo before you commit. It reads the skills, the agents and the MCP plugin. It applies the rules of Claude Code, Codex, GitHub Copilot and IBM Bob.

- Each skill folder has a `SKILL.md`. Its `name` equals the folder name and uses lowercase words with hyphens (64 characters or fewer).
- Each skill has a `description` of 1024 characters or fewer. `metadata` is a mapping. `metadata.requires` names existing skills.
- Each agent file has a `name` that equals the file name, and a `description`.
- `shared/plugins/mcp/.mcp.json` gives each server a `command` or a `url`.
- `.claude-plugin/marketplace.json` points to plugins that exist and have the same name.

Each problem prints as `FAIL <path>: <reason>`, and the command exits with 1. Problems in `use-railway` print as `WARN` because it comes from upstream.

The GitHub Actions workflow `.github/workflows/check.yml` runs `bun test`, `bunx tsc --noEmit` and `bun run check` on each push to `main` and on each pull request.

## Also here

- `claude-heartbeat/` — a timer that keeps Claude usage blocks chained (see its README).
