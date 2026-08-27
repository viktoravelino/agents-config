# publish-plan — setup

Human-facing notes for getting the `publish-plan` skill working on a machine.
`SKILL.md` is what the agents read; this file is for you.

## What it is

Agents produce self-contained HTML (plans, reports, reviews). This skill uploads
one file to `https://<hash>.viktoravelino.dev`, where `<hash>` is the first 12
hex chars of the file's sha256 — same content, same link, forever.

Two halves, two repos:

| Half | Where | Owns |
|---|---|---|
| Server | `~/projects/publish-plan` | Cloudflare Worker + R2 bucket, `api.viktoravelino.dev`, the `PUBLISH_TOKEN` secret |
| Client | this folder (`agents-config/shared/skills/publish-plan/`) | `publish.ts` CLI + `SKILL.md` |

The server is already deployed. Setting up a new machine only touches the client half.

## Setup on a new machine

1. **bun** — `curl -fsSL https://bun.sh/install | bash` (or `brew install oven-sh/bun/bun`).
2. **Link the skill** — from this repo: `./install.sh`. That symlinks the folder into
   `~/.claude/skills/publish-plan` and `~/.agents/skills/publish-plan`.
3. **Put the token in place** — the only secret the client needs:

   ```bash
   mkdir -p ~/.config/publish
   printf '%s' '<token>' > ~/.config/publish/token   # no trailing newline
   chmod 600 ~/.config/publish/token
   ```

   Get `<token>` from a machine that already has it (`cat ~/.config/publish/token`),
   or rotate it (below) if you don't trust the old one. The CLI also accepts it as
   the `PUBLISH_TOKEN` env var, which wins over the file.

4. **Verify**:

   ```bash
   bun ~/.claude/skills/publish-plan/publish.ts --list
   ```

   Prints every published page (URL, date, title). An empty list is fine; a `401` means
   the token doesn't match the Worker's.

## Rotating the token

The token lives in exactly two places: Cloudflare's secret store and
`~/.config/publish/token` on each machine. Rotation is one block, run from the
server repo (needs its `.env` with the Cloudflare API token):

```bash
cd ~/projects/publish-plan
TOKEN=$(openssl rand -hex 32)
printf '%s' "$TOKEN" > ~/.config/publish/token && chmod 600 ~/.config/publish/token
printf '%s' "$TOKEN" | bunx wrangler secret put PUBLISH_TOKEN
unset TOKEN
```

Takes effect within seconds, no redeploy. Every *other* machine now needs the new
value copied over (step 3 above) — the old token is dead everywhere.

## Day-to-day

```bash
publish.ts <file.html>          # prints https://<hash>.viktoravelino.dev
publish.ts --list               # URL  date  title, newest first
publish.ts --delete <url|hash>  # unpublish; idempotent
```

Things worth knowing:

- Anyone with a link can read the page; there is no reader login. Pages are `noindex`.
- Unpublish stops *new* readers. A browser that already loaded the page was told to
  cache it for a year (content-addressed → immutable), so it may keep showing it.
- Give pages a real `<title>` — that's what `--list` shows.
- One HTML file per page. No assets, no markdown.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `No PUBLISH_TOKEN in env and no ~/.config/publish/token file` | Step 3 |
| `401` on publish/list/delete | Token on this machine ≠ Worker's. Copy from another machine or rotate. |
| `400 hash_mismatch` | File changed between hashing and upload, or something rewrote it in transit. Retry. |
| `413` | File over 5 MB. It's meant for documents, not sites. |
| `curl: (6) Could not resolve host` on a fresh subdomain | Local resolver negative-cached it. Wait a minute or `sudo dscacheutil -flushcache`. |
| `5xx` from `api.viktoravelino.dev` | Worker problem. From `~/projects/publish-plan`: `bunx wrangler tail --format pretty` and look at the exception. |

## Server-side reference

The full build-out (DNS, routes, TLS, bucket, secret, contract) is the plan that
built it: `~/projects/publish-plan/plans/2026-08-27-publish-system.html`, also
published at the URL `--list` shows under "The publish system". Cloudflare
credentials for that repo live in its gitignored `.env`
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
