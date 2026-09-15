---
name: dev-servers
description: Run an app locally for verification without disturbing the user's own dev environment -- check what is already running, confirm credentials work before building anything, start an isolated stack on alternate ports with its own data, drive it with Playwright, and tear down only what you started. Project specifics come from the project profile. Referenced by validate-ticket, work-ticket, and diagnose.
user-invocable: false
---

# Dev servers

The user usually has their own stack running while you work. Everything here exists so that verifying a claim never kills, restarts, reconfigures, or writes into it.

## Hard rules (read first)

- **Never kill a process you did not start**, and never run a command that does. Read a `make` target, npm script, or compose file before running it — a `kill`, `docker compose down`, or a script that starts its own server is a hazard.
- **Never use the project's default ports.** Take the first free port above them and use it everywhere, including probe configs.
- **Never write into the user's data.** Point the database, config dir, and uploads at a throwaway location unless the claim depends on existing data — and if it does, say so before touching it.
- **Never print secrets.** Keys are read from env files into the process, never echoed, logged, or written into evidence.
- **Leave the user's stack exactly as you found it**, and report everything you started and stopped.

## 0. Project profile

Resolve the repo's profile: `basename -s .git "$(git remote get-url origin)"` gives a name; if a skill with that name sits next to this one (`../<name>/SKILL.md`), read its **servers** file. It supplies the ports, start commands, credential checks, and hazards for this project and overrides the defaults below. Without a profile, work them out in step 4.

## 1. Check what is running

Ask once, only if the user has not said: is a stack already running, from which checkout, and on which ports? Then check rather than trust:

```sh
lsof -nP -iTCP -sTCP:LISTEN
```

If the user's stack is running against the checkout you need **and** they want you to use it, use it read-mostly and say so. Otherwise start an isolated one.

## 2. Check credentials before building anything

If the claim depends on an external provider — an LLM, a third-party API, a cloud service — confirm the key the app will use actually works **before** installing dependencies or starting servers. The most expensive dead end is an auth, billing, or rate-limit error discovered after the whole stack is up.

- Make one tiny, read-only authenticated call (listing models or the account is usually enough) with the key from the env file the app will load. Print only the HTTP status, never the key or the response headers.
- `401`/`403` → the key is invalid or lacks access. `402`/`429` with a quota or billing message → out of credit or rate-limited. Stop and tell the user in one line; do not build a stack that cannot reach its provider.
- Skip the check when the claim is about the missing or broken key itself, or when the probe routes the provider to a mock upstream (see `evidence`).

## 3. Starting an isolated stack

- **Dependencies are per worktree.** A fresh worktree has no virtualenv or `node_modules`; install them there before starting.
- **Environment precedence.** Know whether the app's env-file loading overrides variables you set on the command line; if it does, your isolation variables are silently ignored.
- **Logs to a file, ports recorded.** Start in the background, send output to `/tmp/<worktree>-<service>.log`, and note the ports you took so teardown is exact.
- **Health before use.** Wait on a health check or the page responding, with a timeout; do not sleep and hope.

## 4. Without a profile

Read the README, `Makefile`, `package.json` scripts, `pyproject.toml`, or `docker-compose.yml` to find how the app starts, which ports and data locations it uses, and which provider keys it needs. Apply the rules above. When you have worked out a reliable recipe for a repo you will return to, offer to save it as that project's profile.

## 5. Browser probes

Use the repo's own Playwright install, with a standalone config in `.evidence/probes/` that has **no `webServer` block**, so running probes can never start or take over a server:

```ts
// .evidence/probes/ui-probe.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: __dirname,
  testMatch: /ui-.*\.probe\.spec\.ts/,
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "/tmp/<worktree>-pw-output",
  use: {
    baseURL: "http://localhost:<isolated frontend port>/",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
});
```

Never run the repo's own Playwright config for verification; it usually starts servers on the default ports. Keep the viewport fixed so `before/` and `after/` captures match (see `evidence`).

## 6. Tear down

Stop only what you started, by the ports you took:

```sh
for p in <ports you took>; do lsof -t -iTCP:$p -sTCP:LISTEN | xargs -r kill; done
```

Remove the throwaway data dir unless it is evidence, and report what you stopped and removed.
