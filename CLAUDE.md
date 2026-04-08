# Claude Code — Global Instructions

## Obsidian Vault

The vault is at `/Users/viktoravelino/Documents/Obsidian Vault`. Full rules are in `CLAUDE.md` inside the vault.

**Always use the vault for:**
- **Session logs** — after any significant coding session, write a log to `projects/<project>/sessions/YYYY-MM-DD-slug.md` using the `session.md` template
- **Specs** — planning docs go in `projects/<project>/specs/YYYY-MM-DD-slug.md` using the `spec.md` template
- **ADRs** — architecture decisions go in `projects/<project>/decisions/YYYY-MM-DD-slug.md` using the `adr.md` template
- **Daily notes** — append work summaries to `projects/<project>/daily/YYYY-MM-DD.md`; never create duplicates

**Key rules:**
- All notes require YAML frontmatter (at minimum: `date`, `type`, `tags`)
- Use `[[wiki-links]]` for cross-references between notes
- File names: `YYYY-MM-DD-brief-slug.md`
