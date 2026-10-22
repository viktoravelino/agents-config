# Langflow: running an isolated stack

This file applies the generic rules in `dev-servers` to Langflow. There are two modes. Use **Docker mode** whenever `docker info` succeeds. Use **host mode** as the fallback. The credential check and the Playwright probe config are the same in both modes. The ports are different (see below).

## Ports

Host mode: backend `7861` (then `7862`, …), frontend `3001` (then `3002`, …). The user's own stack runs on `7860` and `3000`.

Docker mode derives both ports from the worktree directory name (see "Start"), so concurrent worktrees rarely collide (500 hash buckets). If `up` fails with "port already allocated", another worktree hashed to the same block. These are the *host-side* mappings. Inside the containers, the ports are always the defaults.

## Credential check

Most Langflow claims run a flow, and a flow runs through a model provider. Before you install anything, check the key for the provider that the flow's components use. Read the key from the `.env` that the backend will load. Run this on the host in both modes:

```sh
KEY="$(grep -E '^OPENAI_API_KEY=' .env | cut -d= -f2- | tr -d "\"'")"
curl -s -o /dev/null -w '%{http_code}\n' https://api.openai.com/v1/models -H "Authorization: Bearer $KEY"
```

`200` means go. For other providers, call their list-models endpoint in the same way. If the key is not in `.env`, it can be stored as a Langflow global variable in the user's database. The isolated database does not have it, so say this and do not guess.

## Docker mode (preferred)

Files: `docker/agent.Dockerfile` and `docker/compose.yml` next to this file.

- One base image (uv + node, no source, no deps) serves every worktree.
- The worktree is bind-mounted at `/app`.
- `up` syncs the dependencies into per-project named volumes (`<project>_venv`, `<project>_node_modules`, `<project>_data`).
- Two shared external volumes cache the uv and npm downloads across projects.

Isolation is structural. The container cannot reach the user's ports, processes, or `~/.cache/langflow`. So the host-mode hazards below do not apply inside it.

Measured on this machine (OrbStack, arm64): base image build 22 s. First start of a new worktree ~45 s with warm caches (a few minutes the very first time, while the caches fill). Restart with volumes kept 17 s. Backend `--reload` and Vite HMR both fire within ~1.5 s of a host-side edit, with no polling. Each stack idles at roughly 1 GB (backend) + 1–3 GB (Vite). Keep it to three or four concurrent stacks.

### Start

Run this from the worktree root. The port base is `p = 20000 + cksum(basename) % 500 * 20`. It is a 20-port block for each worktree directory name (not the branch, because someone can rename the branch while the stack runs).

The T3 "Stack up (Docker)" script owns project `langflow-<slug>-<p>` on `p`/`p+1`. The agent never touches it. The agent's stack lives in its own namespace inside the same block: project `langflow-agent-<slug>-<p>`, backend `p+2`, frontend `p+3`. It gets its own volumes, containers and ports. The slug is the lower-cased basename. The port base is appended because different directory names can sanitize to the same slug.

```sh
COMPOSE="docker compose -f $HOME/.claude/skills/langflow/docker/compose.yml"
p=$((20000 + $(basename "$PWD" | cksum | cut -d' ' -f1) % 500 * 20)); slug=$(basename "$PWD" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-\n' '-')
export WORKTREE="$PWD" COMPOSE_PROJECT_NAME="langflow-agent-$slug-$p" BACKEND_PORT=$((p+2)) FRONTEND_PORT=$((p+3))

docker volume create langflow-agent-uv-cache >/dev/null
docker volume create langflow-agent-npm-cache >/dev/null
docker image inspect langflow-agent-base >/dev/null 2>&1 || $COMPOSE build
$COMPOSE up -d --wait --wait-timeout 900
```

`--wait` returns when both health checks pass (backend `/health`, frontend `/`). If it fails, `$COMPOSE logs backend` or `$COMPOSE logs frontend` shows the reason. The usual reasons are an `npm ci` network reset (it retries five times) or a missing `.env`.

- `env_file` loads `.env` from the worktree, so the user's API keys reach the backend. The compose `environment:` block wins over it, so nothing can override the isolation variables.
- `LANGFLOW_AUTO_LOGIN` defaults to `true`. When the claim needs login, export it as `false` before `up`. The stack then uses `LANGFLOW_SUPERUSER`/`LANGFLOW_SUPERUSER_PASSWORD` (default `langflow`/`langflow`).
- The database is SQLite in the project's `data` volume. The stack does not provide Postgres. If a claim needs Postgres, say so and fall back to host mode with a throwaway Postgres.
- To test a missing key, export it empty before `up` (`export OPENAI_API_KEY=`). The `environment:` block does not set API keys, so without that export the `.env` value applies.

### Running things inside the stack

Run tests, lint, and repo tooling in the backend and frontend containers. They use the same bind-mounted worktree. Inside, the ports are the defaults, so `make backend`, `npm run type-check`, and the repo's Playwright `webServer` are all harmless there:

```sh
$COMPOSE exec backend uv run pytest src/backend/tests/unit/path/test_x.py
$COMPOSE exec frontend npx jest src/some/file.test.tsx
```

The container is `linux/arm64`. If a claim depends on macOS-specific behavior, use host mode.

### Teardown

```sh
$COMPOSE down -v      # containers + this project's venv/node_modules/data volumes
$COMPOSE down         # containers only; next `up` is ~17 s
```

The shared cache volumes (`langflow-agent-uv-cache`, `langflow-agent-npm-cache`) and the `langflow-agent-base` image are external and survive `down -v`. Keep them.

Run `down -v` for a worktree's project **before** you remove the worktree. If you do not, its ~2.5 GB of `<project>_venv`, `<project>_node_modules`, and `<project>_data` volumes stay behind with nothing left to own them.

Tear down only `langflow-agent-*` projects. The T3 "Stack down (Docker)" script tears down the user's T3 stack (`langflow-<slug>-<p>`). It runs on thread settle.

Older stacks had the names `langflow-<checkout dir>` or `langflow`, so their leftovers are `langflow_venv` and similar volumes. To find and remove leftovers from any project:

```sh
docker volume ls -q --filter dangling=true | grep -v -- '-agent-'   # review the list
docker volume rm <those volumes>
```

The shared caches show up as dangling whenever no stack is running, and they carry compose labels like any other volume. Only the name filter keeps them out of that list.

## Host mode (fallback)

Use host mode when Docker is not running, or when a claim depends on macOS-specific behavior or on a Postgres database.

### Hazards

- **Never run `make backend`** or `make run_cli` while the user runs a backend. The `backend` target runs `kill -9 $(lsof -t -i:7860)` before it starts, whatever `port=` you pass.
- **Never run `langflow run --env-file`** for an isolated stack. It loads the file with `override=True`, so `.env` beats the data and port variables that you set. Start uvicorn directly (its `--env-file` does not override).
- **Never run `npm run type-check`**. It chains into `vite` and starts a dev server on the default port.
- **Never use the repo's Playwright config** (`npx playwright test` from `src/frontend`). Its `webServer` block starts a backend on 7860 and a stub on 8787.
- Without overrides, the backend uses the default config dir and SQLite database. These hold the user's data, and the backend runs migrations against them.

### Dependencies

A fresh worktree has no dependencies. The first `uv run` creates `.venv` (slow). If `src/frontend/node_modules` is missing, first run `npm ci` in `src/frontend` (several minutes).

### Backend

From the worktree root:

```sh
DATA="/tmp/$(basename "$PWD")-langflow"; mkdir -p "$DATA"
LANGFLOW_CONFIG_DIR="$DATA" \
LANGFLOW_DATABASE_URL="sqlite:///$DATA/langflow.db" \
LANGFLOW_AUTO_LOGIN=true \
  uv run uvicorn --factory langflow.main:create_app \
    --host 127.0.0.1 --port 7861 --env-file .env --loop asyncio \
    > "/tmp/$(basename "$PWD")-backend.log" 2>&1 &

for i in $(seq 1 90); do curl -fsS http://127.0.0.1:7861/health >/dev/null && break; sleep 2; done
```

- Command-line variables win over `.env`, so the user's API keys still load and the data stays isolated.
- Set `LANGFLOW_AUTO_LOGIN` to the value that the claim needs. With `false`, also set `LANGFLOW_SUPERUSER` and `LANGFLOW_SUPERUSER_PASSWORD` to throwaway credentials.
- Drop the two data variables only when the claim depends on existing data. If you do, say so.
- To test a missing key, unset it for this process (`env -u KEY`). Do not unset it in `.env`.

### Frontend

From `src/frontend`:

```sh
VITE_PORT=3001 VITE_PROXY_TARGET=http://localhost:7861 \
  npx vite --port 3001 --strictPort \
  > "/tmp/$(basename "$(git rev-parse --show-toplevel)")-frontend.log" 2>&1 &

for i in $(seq 1 60); do curl -fsS http://localhost:3001/ >/dev/null && break; sleep 2; done
```

`--strictPort` makes Vite fail. Without it, Vite silently moves to a port that the probes do not know.

### Teardown

Stop the listeners on `7861` and `3001` (or the ports that you took). Remove `/tmp/<worktree>-langflow`, unless it is evidence.

## Playwright

This applies to both modes. Use the probe config from `dev-servers` with `baseURL: "http://localhost:<FRONTEND_PORT>/"`. `<FRONTEND_PORT>` is the host-side frontend port: `p+3` for the Docker agent stack, `3001` in host mode. Run it on the host from `src/frontend`, so that `@playwright/test` and the repo's test utils (`tests/utils/...`) resolve. Browsers stay on the host. The Docker image has none, on purpose.

```sh
npx playwright test --config ../../.evidence/probes/ui-probe.config.ts
```

In Docker mode, the host needs `src/frontend/node_modules` only for `@playwright/test` itself. If the worktree has none, run `npm ci` there once, or point `NODE_PATH` at the `node_modules` of another checkout.

## IBM-Langflow overlay

`WatsonOrchestrate/IBM-Langflow` has no `src/frontend`, `src/backend` or `src/lfx`, and `docker/compose.yml` assumes the OSS tree. So there is no Docker mode for it. The agent's isolated stack uses host mode, in the same `p+2`/`p+3` namespace (the user's T3 "Dev" script owns `p`/`p+1`):

```sh
p=$((20000 + $(basename "$PWD" | cksum | cut -d' ' -f1) % 500 * 20))
set -m   # job control: the background job becomes its own process group, pgid = $!
make dev BACKEND_PORT=$((p+2)) VITE_PORT=$((p+3)) LANGFLOW_PUBLIC_URL=http://localhost:$((p+2)) \
  > "/tmp/$(basename "$PWD")-dev.log" 2>&1 &
echo $! > "/tmp/$(basename "$PWD")-dev.pid"
```

- Pass port overrides as `make` command-line arguments. The Makefile does `-include .env` and then `export`, so `.env` would beat environment variables.
- The frontend mirror must exist first (`./scripts/dev-frontend.sh`). Note that `make dev` also runs `scripts/dev-frontend.sh --serve`.
- `.env` comes from the main checkout through the T3 setup script, or from `make init`.
- Teardown: kill the supervisor process group that you started (`kill -- -$(cat /tmp/<worktree>-dev.pid)`, valid because of `set -m`). Do not kill listeners by port.
- Playwright: `baseURL` is `http://localhost:$((p+3))/`. Run it from `frontend-overrides` or from the mirror at `.frontend-dev/langflow/src/frontend`, wherever `@playwright/test` resolves.
