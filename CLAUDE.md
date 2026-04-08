# Claude Code — Global Instructions

## Obsidian Vault

The vault is at `~/Documents/Obsidian Vault`. Full rules are in `CLAUDE.md` inside the vault.

**Always use the vault for:**
- **Session logs** — after any significant coding session, write a log to `projects/<project>/sessions/YYYY-MM-DD-slug.md` using the `session.md` template
- **Specs** — planning docs go in `projects/<project>/specs/YYYY-MM-DD-slug.md` using the `spec.md` template
- **ADRs** — architecture decisions go in `projects/<project>/decisions/YYYY-MM-DD-slug.md` using the `adr.md` template
- **Daily notes** — append work summaries to `projects/<project>/daily/YYYY-MM-DD.md`; never create duplicates

**Key rules:**
- All notes require YAML frontmatter (at minimum: `date`, `type`, `tags`)
- Use `[[wiki-links]]` for cross-references between notes
- File names: `YYYY-MM-DD-brief-slug.md`

## Available Agents

Always use the appropriate agent when the task matches its description. Prefer delegating to agents over doing the work directly.

- **react-engineer** — Use for implementing, building, or writing React/TypeScript/JavaScript frontend code (components, hooks, utilities, pages, bug fixes, refactors).
- **react-reviewer** — Use for reviewing React/TypeScript/JavaScript frontend code for best practices, performance, accessibility, and maintainability. Also use proactively after a significant chunk of frontend code has been written.

## Available Skills

- **git-worktree** — Manage Git worktrees: create from local/remote/new branches, list active worktrees, delete, prune, and switch between them. Ideal for working on multiple branches simultaneously without stashing changes.
