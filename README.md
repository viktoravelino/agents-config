# agents-config

Shared instructions and skills for Codex and Claude Code, linked into place
from this repository so edits here take effect immediately.

```
shared/instructions.md     -> ~/.codex/AGENTS.md, ~/.claude/CLAUDE.md
shared/skills/<name>/      -> ~/.agents/skills/<name>, ~/.claude/skills/<name>
shared/settings.json       -> ~/.claude/settings.json  (Claude only)
shared/skill-sources.json     where the skills copied from other repos came from
```

## Install

```bash
./install.sh          # link everything; -n to preview
                      # --skills-only / --instructions-only / --settings-only
```

`settings.json` is Claude-only — Codex has no equivalent. Machine-local
approvals stay out of it: Claude Code writes those to `settings.local.json`,
which this repo does not manage.

Links are synced: a skill removed here is unlinked there. Anything the script
does not own is left alone, and real files in the way are backed up first.

## How the skills fit together

Workflow skills stay generic; anything that belongs to one project lives in
that project's profile.

| Kind | Skills |
| --- | --- |
| Workflows | `validate-ticket`, `work-ticket`, `diagnose`, `adversarial-review`, `file-pr`, `request-review`, `standup` |
| Shared helpers | `evidence` (where proof lives), `dev-servers` (running an app in isolation), `git-worktree`, `acli-jira` |
| Project profiles | `langflow` |
| Documents | `design-artifact`, `html-plan`, `handbill` |

Helpers and profiles set `user-invocable: false`: other skills pull them in,
so they stay out of the `/` menu.

### Project profiles

A workflow skill resolves the repository's profile from its origin —
`basename -s .git "$(git remote get-url origin)"` — and reads the sibling skill
of that name if it exists, so `langflow-ai/langflow` and every worktree of it
use `shared/skills/langflow/`. To add a project, create a folder named after
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

Some skills are copies of a directory in another repository (for example
`handbill` comes from `viktoravelino/handbill`). `shared/skill-sources.json`
records the repo, path, ref, and the upstream commit each copy was taken from.

```bash
./sync-skills.sh check                 # anything behind upstream or edited locally?
./sync-skills.sh update handbill       # pull upstream in and bump the pin
./sync-skills.sh add <repo> <path>     # copy a skill in; asks whether to track its source
./sync-skills.sh remove <name>         # stop tracking; asks whether to keep or delete the files
```

`check` lists the upstream commits that touched the skill since the pin and
exits non-zero when something is behind, edited locally, or broken. `update`
leaves the change unstaged; review it with `git diff` and commit the skill and
the manifest together. A local edit blocks `update` until you either move it
upstream or pass `--force`. Upstreams are cached as small bare clones under
`~/.cache/agents-config/skills`; the cache is disposable.

`add` asks whether to record the source (`--track` / `--no-track` skip the
prompt); a copy that is not tracked is just a skill authored here. `remove`
drops the manifest entry and asks whether the directory stays (it
becomes a skill authored here) or goes; `--keep` / `--delete` answer that
non-interactively. Skills without a manifest entry are authored here.

## Also here

- `claude-heartbeat/` — timer that keeps Claude usage blocks chained (see its README).
- `legacy/` — retired skills and the old instructions, kept for reference.
