---
name: dokku
description: Deploy and operate apps on the maintainer's self-hosted Dokku host (home-LAN VM) -- pick the deploy model for a repo, create the app, push, configure, add persistent storage, publish a public hostname through the Cloudflare tunnel, wire GitHub Actions deploys, verify, and remove. Use when the user says deploy to Dokku or the homelab, "put this app on dokku", add a domain or public hostname to a Dokku app, set up CI deploy for it, or reports a failing `git push dokku`, "Unable to select a buildpack", or a 502 after redeploying a Dokku app.
---

# Dokku

The maintainer's app host: Dokku v0.38.31 on a VM at `192.168.2.13`, reachable on the home LAN (and over Tailscale), not from the internet. It builds from a git push, one Dokku app per image.

**Read `~/projects/homelab/config/dokku/README.md` first** (current apps, networks, domains, SSH keys, gaps) and **update it after changing the host**, together with the Cloudflare snapshots under `config/cloudflare/` if a hostname changed, so the repo stays an accurate record. Do not duplicate its contents here.

## House rules

- Never print secret values, and never print or `cat` `~/projects/homelab/config/media-stack/.env` (it holds unrelated secrets). A new secret created for the lab is also appended there as a `KEY=value` line with a `#` comment line above it.
- Never merge PRs. Workflow changes go through a PR the maintainer merges.
- Confirm with the maintainer before anything outward-facing (a new public hostname) or destructive (`apps:destroy`, removing a hostname or DNS record).
- Config values (`config:show`, `config:export`) are secrets; `config:keys <app>` is safe.

## Access

```bash
ssh dokku <command>          # Dokku commands; alias `dokku` -> user dokku, lab key
ssh dokku help               # list commands; `ssh dokku <plugin>:help` for one plugin
ssh dokku apps:list
ssh dokku ps:report <app>
```

Commands that need root, such as `ssh-keys:add`, are refused through the `dokku` user. Run them as:

```bash
ssh -i ~/.ssh/homelab ubuntu@192.168.2.13 'sudo dokku ssh-keys:add <name> /path/to/key.pub'
```

URLs: LAN `http://<app>.192.168.2.13.sslip.io`; public `https://<name>.vkav.dev` via a Cloudflare Tunnel (TLS ends at Cloudflare, Dokku serves plain HTTP, there is no certificate plugin).

## Which deploy model fits the repo

Dokku builds one image per app and does **not** deploy compose files. Pick by what the repo has:

| Repo shape | Model |
| --- | --- |
| `Dockerfile` at the root | 1. Single image |
| `Dockerfile` in a subfolder | 2. Subfolder (model 1 plus `build-dir`) |
| `docker-compose.yml` with several services | 3. One Dokku app per service |
| No Dockerfile at all | Add one. Without it Dokku falls back to buildpacks and a repo with no buildpack-detectable root fails with `Unable to select a buildpack`. |

Persistent data or a database: see "Config and storage", and tell the maintainer the backup must be extended.

## Recipes

### 1. Single image

```bash
ssh dokku apps:create <app>
git remote add dokku dokku@dokku:<app>
git push dokku main
```

Dokku maps the port the Dockerfile `EXPOSE`s to `http:80:<port>`. If there is no `EXPOSE`, or it is wrong: `ssh dokku ports:set <app> http:80:<port>`.

### 2. Dockerfile in a subfolder

```bash
ssh dokku builder:set <app> build-dir <dir>   # before the first push
```

### 3. Multi-service repo (one app per service)

Same repo, several remotes; one app and one remote per service, each with its own `build-dir`. Services that talk to each other share a Docker network, and the internal one gets the name its consumer expects.

```bash
ssh dokku apps:create <api> && ssh dokku apps:create <web>
ssh dokku builder:set <api> build-dir <api-dir>
ssh dokku builder:set <web> build-dir <web-dir>

ssh dokku network:create <net>
ssh dokku network:set <api> initial-network <net>
ssh dokku network:set <web> initial-network <net>

ssh dokku docker-options:add <api> deploy "--network-alias <name>"   # the compose service name the consumer uses
ssh dokku proxy:disable <api>                                         # internal only, not served by nginx

git remote add dokku-api dokku@dokku:<api>
git remote add dokku-web dokku@dokku:<web>
git push dokku-api main && git push dokku-web main
```

Set the options before the first push, or redeploy afterwards (`docker-options` apply on the next deploy).

### 4. Config and storage

```bash
ssh dokku config:set --no-restart <app> KEY=value   # --no-restart to batch several changes; drop it to apply now
ssh dokku config:keys <app>                          # key names only

ssh dokku storage:ensure-directory <name>            # prints a deprecation notice on this version; works
ssh dokku storage:mount <app> /var/lib/dokku/data/storage/<name>:/path/in/container
```

`storage:create` is the replacement `ensure-directory` points to; it exists in `ssh dokku storage:help` but its use here is unverified.

Backup scope and restore steps are in the homelab repo (`docs/restore-dokku-backup.md`). An app with persistent data or a database needs the backup extended, and a database plugin needs its own dump step. Say so to the maintainer; do not assume it is covered.

### 5. Procfile, app.json, healthchecks

- `Procfile` defines several process types from the **same** image; it does not make one app run two images.
- `app.json` holds healthchecks and pre/post-deploy scripts. Add a healthcheck so a deploy only switches traffic once the new container answers; without one Dokku only checks that the container stayed up for about 10 seconds. Schema from Dokku's zero-downtime docs (v0.31+; the file location for a `build-dir` app is unverified):

```json
{
  "healthchecks": {
    "web": [
      {
        "type": "startup",
        "name": "web check",
        "description": "Responds on /health",
        "path": "/health",
        "attempts": 3
      }
    ]
  }
}
```

Other properties: `initialDelay`, `timeout`, `wait`, `port`, `content`, `command`, `uptime`. `ssh dokku checks:run <app>` runs the checks by hand.

## Gotchas

- **502 about a minute after redeploying an upstream app.** An nginx that proxies to another app resolves the upstream name once at startup; Dokku retires the old container after 60 s (`wait-to-retire`) and the cached IP dies. Re-resolve per request, using Docker's DNS:

  ```nginx
  location /api/ {
      resolver 127.0.0.11 valid=10s ipv6=off;
      set $upstream http://<alias>:<port>;
      proxy_pass $upstream;
  }
  ```

  Working file: `~/projects/insta-down/frontend/nginx.conf`. The same pattern also lets the consumer's first deploy succeed when the upstream name does not resolve yet; without it the first deploy fails.
- Builds run on the VM (about 40 s for a trivial image) and compete with running apps for 2 cores and 4 GB. Pushing a remote always rebuilds that app, even with no change.
- `ssh-keys:add` needs root (see Access).
- `Unable to select a buildpack` means Dokku did not find a Dockerfile at the build dir: check the root, `builder:report <app>` and `build-dir`.

## Publish on a public hostname

Two parts, and it is outward-facing: **confirm with the maintainer before publishing a new hostname**. First tighten the app: hide internal apps (`proxy:disable`), and set CORS or allowed-origins style settings to the public origin (`https://<name>.vkav.dev`), so the app does not stay open to `*`.

```bash
ssh dokku domains:add <app> <name>.vkav.dev
```

Then add the tunnel hostname and DNS record: [publish-cloudflare.md](publish-cloudflare.md) has the exact curl+jq sequence (GET the `homelab` tunnel config, insert the hostname before the `http_status:404` catch-all, PUT, create the proxied CNAME) and the snapshots to refresh.

## CI deploys (GitHub Actions)

Template: [deploy.yml](deploy.yml), one workflow per Dokku app with its own `paths` filter and `concurrency` group. Working examples: `~/projects/insta-down/.github/workflows/deploy-api.yml` and `deploy-web.yml`. The runner joins the tailnet (`tag:ci`, which may reach only `192.168.2.13:22`) and pushes with `dokku/github-action`. Points that break it:

- `tailscale/github-action@v4` already accepts routes: do not pass `args: --accept-routes` (`tailscale up` fails with "flag provided multiple times").
- `dokku/github-action` needs `branch: main` (default `master`) and `actions/checkout` needs `fetch-depth: 0`.
- Three repository secrets, the same in every repo: `DOKKU_DEPLOY_KEY`, `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`. One shared CI key is registered in Dokku as `ci-github`. Wire a new repo by piping from the maintainer's local secrets file into `gh secret set`, nothing printed:

```bash
E=~/projects/homelab/config/media-stack/.env
grep '^DOKKU_CI_DEPLOY_KEY_B64=' $E | cut -d= -f2- | base64 -d | gh secret set DOKKU_DEPLOY_KEY --repo <owner>/<repo>
grep '^TS_OAUTH_CLIENT_ID=' $E | cut -d= -f2- | tr -d '\n' | gh secret set TS_OAUTH_CLIENT_ID --repo <owner>/<repo>
grep '^TS_OAUTH_SECRET=' $E | cut -d= -f2- | tr -d '\n' | gh secret set TS_OAUTH_SECRET --repo <owner>/<repo>
```

- A run stuck on "queued" is usually GitHub runner availability, not the workflow: check githubstatus.com before debugging.

## Verify a deploy

1. `ssh dokku ps:report <app>`: `Deployed: true`, processes running.
2. `curl -s -o /dev/null -w '%{http_code}\n' http://<app>.192.168.2.13.sslip.io/` returns the expected page (a `proxy:disable` app has no LAN URL; test it through its consumer).
3. Multi-service: an internal route through the consumer works **after redeploying the upstream** (push the upstream again, wait over a minute, call it again). This is the check that catches the 502 gotcha.
4. Published: `curl -sI https://<name>.vkav.dev/` gives 200 and `server: cloudflare`.
5. CI: the workflow run is green.

## Remove an app

Confirm with the maintainer first.

```bash
ssh dokku apps:destroy --force <app>
ssh dokku network:destroy <net>        # only if no app uses it any more
git remote remove dokku                # and dokku-api, dokku-web, ...
```

Also remove the tunnel hostname and DNS record (end of [publish-cloudflare.md](publish-cloudflare.md)), the repo's deploy workflow, and update the homelab docs and snapshots.
