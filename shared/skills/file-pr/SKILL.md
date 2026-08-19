---
name: file-pr
description: File a concise pull request. Use when the user asks to file, open, or create a PR.
---

# File PR

Before filing, check whether a PR for this branch already exists. Review the diff locally against the latest `origin/release-*` branch to make sure its contents match the goal.

Do not mention jira tickets on the PR title or description unless the user explicitly asks for it. If the user wants to link a Jira ticket, add it to the PR description only as a trailing `Jira: [<ticket>](<link>)` line at the end of the description.

PR titles usually become commit messages, so follow the repository's title conventions. Look at recently merged PRs and Git history for examples. Prefer a concise, human-readable title that explains why the changes matter:

BAD
> ❌ perf(server): negotiate permessage-deflate on the websocket

GOOD
> ✅ perf(server): cut websocket frame size by 70%+ with gzipping

Open the description with a simple explanation of the problem based on the user's original prompt, then briefly explain the solution. Do not lead with an implementation inventory:

BAD
> ❌ Removed implicit workspace carry-over from every "new thread" entry point (cmd+n / cmd+shift+o, sidebar v1/v2 buttons, command palette). New threads inherit only the project from context; branch, worktree, and env mode always come from the configured defaults. Deleted buildContextualThreadOptions, startNewThreadInProjectFromContext, and the v1 sidebar's seed-context machinery.

GOOD
> ✅ My "new worktree" default was ignored when starting new threads on existing worktrees. Super unintuitive. Now your preferences always apply.

## Always write the body to a file

Never pass the description with `--body "..."`. Inline HTML, backticks and `$` get mangled by shell escaping, which silently corrupts the description. Write it to a temp file and use `--body-file`:

```bash
gh pr create --title "…" --body-file /tmp/pr-body.md
```

## Images and screenshots

The `https://github.com/user-attachments/assets/<uuid>` URLs used across this repo's merged PRs are minted by a cookie-authenticated browser upload. `gh` and its token cannot produce them — do not attempt it, and do not invent such URLs.

These never render in a PR body, even though they look correct locally:

- relative paths (`./docs/shot.png`) — GitHub does not resolve them in issue/PR bodies
- local absolute paths (`/Users/…/shot.png`, `/tmp/shot.png`)
- `data:` base64 URIs — stripped by GitHub's markdown sanitizer
- raw URLs pointing at a private repo — render for the author, 404 for reviewers

These do render:

- any public HTTPS URL (GitHub proxies it through camo)
- `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>` on a public repo

### Preferred: host on the assets repo

For screenshots, commit the image to the user's public assets repo and embed the raw URL. This is fully scriptable, permanent, and keeps binaries out of the Langflow diff.

```bash
mkdir -p ~/projects/pr-assets/<repo>/<branch-slug>
cp shot.png ~/projects/pr-assets/<repo>/<branch-slug>/before.png
git -C ~/projects/pr-assets add -A
git -C ~/projects/pr-assets commit -m "<repo>/<branch-slug> screenshots"
git -C ~/projects/pr-assets push
# → https://raw.githubusercontent.com/viktoravelino/pr-assets/main/<repo>/<branch-slug>/before.png
```

If `~/projects/pr-assets` or `viktoravelino/pr-assets` does not exist, **ask before creating it** — it is a public repo and creating one is an outward-facing action. Do not push screenshots to a branch of the product repo itself.

Verify each URL returns 200 before filing:

```bash
curl -sIL -o /dev/null -w '%{http_code}\n' "<raw-url>"
```

### When browser upload is required

Video (`.mp4`, `.mov`) only renders as an inline player when uploaded through the web UI; a raw URL renders as a bare link. Same if the user prefers matching the repo's `user-attachments` convention. In that case file the PR with a clearly marked placeholder line, then hand off:

```bash
gh pr create --title "…" --body-file /tmp/pr-body.md
gh pr view --web    # user drags the file onto the placeholder; GitHub rewrites it
```

Tell the user explicitly which placeholder to replace. Do not claim the PR has images until they have been attached.

### Formatting

Use `<img>` rather than `![]()` — markdown images always render full-bleed, `width` gives control. Before/after belongs in a two-column table:

```html
<table>
<tr><td width="50%"><b>Before</b></td><td width="50%"><b>After</b></td></tr>
<tr>
  <td><img src="https://…/before.png" alt="Field with no accessible label" width="100%"></td>
  <td><img src="https://…/after.png"  alt="Field labelled by adjacent text"  width="100%"></td>
</tr>
</table>
```

Wrap sets of more than three screenshots in `<details><summary>Screenshots</summary>…</details>`. Write real `alt` text describing what the image shows — not "before"/"screenshot".
