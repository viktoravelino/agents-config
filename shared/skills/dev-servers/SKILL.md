---
name: dev-servers
description: Run an app locally for verification without disturbing the user's own dev environment -- check what is already running, confirm credentials work before you build anything, start an isolated stack on alternate ports with its own data, drive it with Playwright, and tear down only what you started. The project profile gives the project specifics. Referenced by validate-ticket, work-ticket, and diagnose.
user-invocable: false
---

# Dev servers

The user usually has their own stack running while you work. These rules make sure that verifying a claim never kills, restarts, reconfigures, or writes into that stack.

## Hard rules (read first)

- **Never kill a process that you did not start**, and never run a command that does. Before you run a `make` target, npm script, or compose file, read it. A `kill`, a `docker compose down`, or a script that starts its own server is a hazard.
- **Never use the project's default ports.** For each one, take the first free port above it and use it everywhere, including probe configs.
- **Never write into the user's data.** Point the database, config dir, and uploads at a throwaway location. The exception is a claim that depends on existing data. In that case, say so before you touch it.
- **Never print secrets.** Read keys from env files into the process. Never echo them, log them, or write them into evidence.
- **Leave the user's stack exactly as you found it.** Report everything that you started and stopped.

## 0. Project profile

Find the repo's profile. `basename -s .git "$(git remote get-url origin)"` gives a name. If a skill with that name sits next to this one (`../<name>/SKILL.md`), read its **servers** file. If there is none, look for a sibling profile whose `metadata.repos` lists the origin's `owner/repo`, and read its **servers** file. The file gives the ports, start commands, credential checks, and hazards for this project. It overrides the defaults below. Without a profile, work them out in step 4.

## 1. Check what is running

If the user has not said, ask once: is a stack already running, from which checkout, and on which ports? Then check. Do not trust the answer alone:

```sh
lsof -nP -iTCP -sTCP:LISTEN
```

If the user's stack runs against the checkout you need **and** the user wants you to use it, keep writes to the minimum the check needs, and say so. Otherwise start an isolated stack.

## 2. Check credentials before building anything

If the claim depends on an external provider (an LLM, a third-party API, a cloud service), confirm that the app's key works **before** you install dependencies or start servers. The most expensive dead end is an auth, billing, or rate-limit error that you find after the whole stack is up.

- Make one tiny, read-only authenticated call, with the key from the env file that the app loads. Listing models or the account is usually enough. Print only the HTTP status. Never print the key or the response headers.
- `401`/`403` → the key is invalid or lacks access. `402`/`429` with a quota or billing message → out of credit or rate-limited. Stop and tell the user in one line. Do not build a stack that cannot reach its provider.
- Skip the check when the claim is about the missing or broken key itself. Also skip it when the probe routes the provider to a mock upstream (see `evidence`).

## 3. Starting an isolated stack

- **Dependencies are per worktree.** A fresh worktree has no virtualenv or `node_modules`. Install them there before you start.
- **Environment precedence.** Find out if the app's env-file loading overrides variables that you set on the command line. If it does, the app silently ignores your isolation variables.
- **Logs to a file, ports recorded.** Start in the background and send the output to `/tmp/<worktree>-<service>.log`. Note the ports you took, so that teardown is exact.
- **Health before use.** Wait for a health check or for the page to respond, with a timeout. Do not sleep and hope.

## 4. Without a profile

Read the README, `Makefile`, `package.json` scripts, `pyproject.toml`, or `docker-compose.yml`. Find out how the app starts, which ports and data locations it uses, and which provider keys it needs. Apply the rules above. If you work out a reliable recipe for a repo that you will return to, offer to save it as that project's profile.

## 5. Browser probes

Use the repo's own Playwright install. Use a standalone config in `.evidence/probes/` that has **no `webServer` block**. Then a probe can never start or take over a server:

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

Never run the repo's own Playwright config for verification. It usually starts servers on the default ports. Keep the viewport fixed, so that `before/` and `after/` captures match (see `evidence`).

## 6. Tear down

Stop only what you started, by the ports that you took:

```sh
for p in <ports you took>; do lsof -t -iTCP:$p -sTCP:LISTEN | xargs -r kill; done
```

Remove the throwaway data dir, unless it is evidence. Report what you stopped and removed.

If the profile runs the stack under Docker Compose, the throwaway data lives in the project's named volumes. Then teardown is `docker compose -p <project> down -v`, not `down` alone. A `down` without `-v` looks clean (no containers), but it leaves the venv, `node_modules`, and data volumes behind. They outlive the worktree. The profile marks some volumes as shared caches. These are external, and `down -v` does not touch them. Never prune volumes wholesale to remove the leftovers. To find stacks that were torn down without their volumes, list the dangling volumes and exclude the profile's shared caches by name. The shared caches also look dangling when no stack runs, and their labels do not show the difference:

```sh
docker volume ls -q --filter dangling=true | grep -v <shared cache name pattern>
```
