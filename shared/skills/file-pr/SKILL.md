---
name: file-pr
description: File a concise pull request. Use when the user asks to file, open, or create a PR.
argument-hint: "[base branch]"
---

# File PR

Before you file, check if a PR for this branch already exists (`gh pr view --json url,baseRefName`).

Then choose the base branch. Use the first rule that gives an answer:

1. The base branch the user named.
2. The base of the existing PR.
3. The project profile's base-branch rules. `basename -s .git "$(git remote get-url origin)"` gives a name. If a skill with that name sits next to this one (`../<name>/SKILL.md`), read its **workflow** file. If not, look for a sibling profile whose `metadata.repos` lists the origin's `owner/repo`, and read its **workflow** file.
4. Without a profile, if the repo cuts `release-*` or similar branches, the branch that the work targets. Several can be open at once. If the ticket, the labels, or the branch point do not make it clear, ask. Do not take the newest branch.
5. The repo's default branch: `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`.

Fetch the base branch. Review `git diff origin/<base>...HEAD` to make sure the contents match the goal. Pass `--base <base>` when you create the PR.

Do not mention Jira tickets in the PR title or description, unless the user explicitly asks for it. If the user wants to link a Jira ticket, add it only as a trailing `Jira: [<ticket>](<link>)` line at the end of the description.

PR titles usually become commit messages, so follow the repository's title conventions. Look at recently merged PRs and the Git history for examples. Write a concise, human-readable title that explains why the changes matter:

BAD
> ❌ perf(server): negotiate permessage-deflate on the websocket

GOOD
> ✅ perf(server): cut websocket frame size by 70%+ with gzipping

Open the description with a simple explanation of the problem, based on the user's original prompt. Then explain the solution briefly. Do not lead with an implementation inventory:

BAD
> ❌ Removed implicit workspace carry-over from every "new thread" entry point (cmd+n / cmd+shift+o, sidebar v1/v2 buttons, command palette). New threads inherit only the project from context; branch, worktree, and env mode always come from the configured defaults. Deleted buildContextualThreadOptions, startNewThreadInProjectFromContext, and the v1 sidebar's seed-context machinery.

GOOD
> ✅ My "new worktree" default was ignored when starting new threads on existing worktrees. Super unintuitive. Now your preferences always apply.

## Always write the body to a file

Never pass the description with `--body "..."`. Shell escaping mangles inline HTML, backticks and `$`, and this silently corrupts the description. Write the description to a temp file and use `--body-file`:

```bash
gh pr create --base <base> --title "…" --body-file /tmp/pr-body.md
```

## Images and screenshots

The `https://github.com/user-attachments/assets/<uuid>` URLs in this repo's merged PRs come from a cookie-authenticated browser upload. `gh` and its token cannot produce them. Do not try, and do not invent such URLs.

These never render in a PR body, even if they look correct locally:

- relative paths (`./docs/shot.png`) — GitHub does not resolve them in issue/PR bodies
- local absolute paths (`/Users/…/shot.png`, `/tmp/shot.png`)
- `data:` base64 URIs — the markdown sanitizer of GitHub strips them
- raw URLs that point at a private repo — they render for the author, but give 404 for reviewers

These do render:

- any public HTTPS URL (GitHub proxies it through camo)
- `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>` on a public repo

### Preferred: host on the assets repo

For screenshots, commit the image to the user's public assets repo and embed the raw URL. You can script all of this. It is permanent, and it keeps binaries out of the product repo's diff.

```bash
mkdir -p ~/projects/pr-assets/<repo>/<branch-slug>
cp shot.png ~/projects/pr-assets/<repo>/<branch-slug>/before.png
git -C ~/projects/pr-assets add -A
git -C ~/projects/pr-assets commit -m "<repo>/<branch-slug> screenshots"
git -C ~/projects/pr-assets push
# → https://raw.githubusercontent.com/viktoravelino/pr-assets/main/<repo>/<branch-slug>/before.png
```

If `~/projects/pr-assets` or `viktoravelino/pr-assets` does not exist, **ask before you create it**. It is a public repo, and creating one is an outward-facing action. Do not push screenshots to a branch of the product repo itself.

Before you file, verify that each URL returns 200:

```bash
curl -sIL -o /dev/null -w '%{http_code}\n' "<raw-url>"
```

### When browser upload is required

Video (`.mp4`, `.mov`) renders as an inline player only when you upload it through the web UI. A raw URL renders as a bare link. The same applies if the user prefers to match the repo's `user-attachments` convention. In that case, file the PR with a clearly marked placeholder line, then hand off:

```bash
gh pr create --title "…" --body-file /tmp/pr-body.md
gh pr view --web    # user drags the file onto the placeholder; GitHub rewrites it
```

Tell the user which placeholder to replace. Do not say that the PR has images until the user has attached them.

### Formatting

Use `<img>`, not `![]()`. Markdown images always render full-bleed, and `width` gives you control. Put before/after images in a two-column table:

```html
<table>
<tr><td width="50%"><b>Before</b></td><td width="50%"><b>After</b></td></tr>
<tr>
  <td><img src="https://…/before.png" alt="Field with no accessible label" width="100%"></td>
  <td><img src="https://…/after.png"  alt="Field labelled by adjacent text"  width="100%"></td>
</tr>
</table>
```

Wrap sets of more than three screenshots in `<details><summary>Screenshots</summary>…</details>`. Write real `alt` text that describes what the image shows, not "before" or "screenshot".
