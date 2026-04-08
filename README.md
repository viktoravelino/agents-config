# agents-config

Personal [Claude Code](https://docs.anthropic.com/en/docs/claude-code) configuration — agents, skills, commands, and global instructions managed as a Git repo and symlinked into `~/.claude`.

## Structure

```
├── CLAUDE.md        # Global instructions loaded by Claude Code
├── agents/          # Custom agent definitions
│   ├── react-engineer.md
│   └── react-reviewer.md
├── commands/        # Slash commands (skills invoked via /name)
│   ├── log.md
│   ├── plan.md
│   ├── review-code.md
│   ├── review-fe.md
│   └── ...
├── skills/          # Skill definitions with templates & references
│   └── git-worktree/
├── bk/              # Backup / archive of unused configs
└── install.sh       # Symlink installer
```

## Setup

```sh
git clone <repo-url> ~/projects/agents-config
cd ~/projects/agents-config
./install.sh
```

The install script symlinks `agents/`, `commands/`, `skills/`, and `CLAUDE.md` into `~/.claude`. Existing files are backed up to `*.bak` before linking.

## Adding new config

- **Agents** — add a Markdown file to `agents/` (e.g. `agents/my-agent.md`)
- **Commands** — add a Markdown file to `commands/` (e.g. `commands/my-command.md`)
- **Skills** — create a directory in `skills/` with a `SKILL.md` entry point
