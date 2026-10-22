# agents-config

Shared instructions, skills and agents for Claude Code and Codex, installed
from this repository so edits here take effect immediately.

```
shared/instructions.md     -> ~/.claude/CLAUDE.md, ~/.codex/AGENTS.md
shared/skills/<name>/      -> ~/.claude/skills/<name>, ~/.agents/skills/<name>
shared/agents/<name>.md    -> ~/.claude/agents/<name>.md, and a generated ~/.codex/agents/<name>.toml
shared/settings.json       -> ~/.claude/settings.json  (Claude only)
shared/plugins/mcp/        Claude plugin holding user-wide MCP servers (see below)
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
unchanged links are only counted. Links are synced: a skill removed here is
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
names per kind, or `"all"`). `work-mac` is Claude and Codex with everything;
`headless` is Claude only.

## MCP servers

User-wide MCP servers live in `shared/plugins/mcp/.mcp.json`, not in
`~/.claude.json` (Claude Code rewrites that file constantly). The repo root is a
local plugin marketplace (`.claude-plugin/marketplace.json`), and
`shared/settings.json` registers it under `extraKnownMarketplaces` and enables
`mcp@agents-config`. Claude reads the plugin straight from this checkout, so an
edit applies on the next session or after `/reload-plugins`. Servers show up as
`plugin:mcp:<name>`; OAuth ones authenticate once through `/mcp`.

The marketplace path is absolute, so the repo must live at
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
