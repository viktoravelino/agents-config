---
name: publish-plan
description: Publish a self-contained HTML document (plan, report, review) to a public unguessable URL at https://<hash>.viktoravelino.dev. Use when the user asks to publish, share, deploy, or "give me a link" for an HTML file. Also lists what is published and unpublishes.
---

# Publish plan

Uploads one self-contained HTML file to Viktor's publish system and prints its public URL. The URL is content-addressed (`<hash>` = first 12 hex chars of the file's sha256), so publishing the same content twice returns the same link and never creates duplicates.

```bash
bun "$(dirname "$(realpath "$0")")"/publish.ts <file.html>      # from a script
bun ~/.claude/skills/publish-plan/publish.ts <file.html>             # Claude Code
bun ~/.agents/skills/publish-plan/publish.ts <file.html>             # Codex
```

Prints the URL on stdout, nothing else. On success, reply to the user with the URL and stop.

## Before publishing

- **HTML only, one file.** The system stores a single document per hash. If the deliverable is markdown, render it to a self-contained HTML file first (use the `html-plan` skill for plans). Do not publish files that reference local assets — they will 404.
- **It becomes public.** The link is unguessable but anyone holding it can read it, and it is served with `noindex`. Do not publish anything containing secrets, tokens, customer data, or internal IBM/Langflow material the user did not explicitly ask to share. When in doubt, say what you are about to publish and let the user confirm.
- The token must exist: env `PUBLISH_TOKEN` or the file `~/.config/publish/token`. If neither is present, tell the user — do not go looking for it elsewhere.

## List what is published

```bash
bun ~/.claude/skills/publish-plan/publish.ts --list
```

One line per page, newest first: URL, publish date, and the page's `<title>` (so make sure the HTML has a meaningful one). Use it when the user asks what has been published or has lost a link.

## Unpublish

```bash
bun ~/.claude/skills/publish-plan/publish.ts --delete <hash-or-url>
```

Idempotent; succeeds even if the page is already gone. Use it immediately if something sensitive was published by mistake, then tell the user.

## How it works (for debugging, not for re-implementation)

- `PUT https://api.viktoravelino.dev/v1/pages/<hash>` with `Authorization: Bearer <token>`, body = HTML. Server re-hashes the body and rejects a mismatched hash (400). Returns `{ hash, url, created }`.
- `DELETE` on the same path → 204. `GET /v1/pages` (same bearer) → `{ pages: [{ hash, url, title, publishedAt, size }] }`.
- Pages are served from `https://<hash>.viktoravelino.dev/` with `Cache-Control: immutable` — a published hash never changes content; a new version is a new hash.
- Worker + R2 live in `~/projects/publish-plan`. If the API is down or returns 5xx, that repo is where to look; do not retry in a loop.
