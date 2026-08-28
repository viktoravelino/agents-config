# agents-config

Shared instructions and skills for Codex and Claude Code, linked into place
from this repository so edits here take effect immediately.

```
shared/instructions.md     -> ~/.codex/AGENTS.md, ~/.claude/CLAUDE.md
shared/skills/<name>/      -> ~/.agents/skills/<name>, ~/.claude/skills/<name>
shared/skill-sources.json     where the skills copied from other repos came from
```

## Install

```bash
./install.sh          # link everything; -n to preview, --skills-only / --instructions-only
```

Links are synced: a skill removed here is unlinked there. Anything the script
does not own is left alone, and real files in the way are backed up first.

## Skills from other repositories

Some skills are copies of a directory in another repository (for example
`handbill` comes from `viktoravelino/handbill`). `shared/skill-sources.json`
records the repo, path, ref, and the upstream commit each copy was taken from.

```bash
./sync-skills.sh check                 # anything behind upstream or edited locally?
./sync-skills.sh update handbill       # pull upstream in and bump the pin
./sync-skills.sh add <repo> <path>     # vendor a new skill and record its source
./sync-skills.sh remove <name>         # stop tracking; asks whether to keep or delete the files
```

`check` lists the upstream commits that touched the skill since the pin and
exits non-zero when something is behind, edited locally, or broken. `update`
leaves the change unstaged; review it with `git diff` and commit the skill and
the manifest together. A local edit blocks `update` until you either move it
upstream or pass `--force`. Upstreams are cached as small bare clones under
`~/.cache/agents-config/skills`; the cache is disposable.

`remove` drops the manifest entry and asks whether the directory stays (it
becomes a skill authored here) or goes; `--keep` / `--delete` answer that
non-interactively. Skills without a manifest entry are authored here.

## Also here

- `claude-heartbeat/` — timer that keeps Claude usage blocks chained (see its README).
- `legacy/` — retired skills, kept for reference.
