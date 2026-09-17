# Langflow: running an isolated stack

Applies the generic rules in `dev-servers` to Langflow. Two modes: **Docker mode** is preferred whenever `docker info` succeeds; **host mode** is the fallback. Ports, the credential check, and the Playwright probe config are the same in both.

## Ports

Backend `7861` (then `7862`, …), frontend `3001` (then `3002`, …). The user's own stack runs on `7860` and `3000`. In Docker mode these are the *host-side* mappings; inside the containers the ports are always the defaults.

## Credential check

Most Langflow claims run a flow, and a flow runs through a model provider. Before installing anything, check the key for the provider the flow's components use, reading it from the `.env` the backend will load (run this on the host in both modes):

```sh
KEY="$(grep -E '^OPENAI_API_KEY=' .env | cut -d= -f2- | tr -d "\"'")"
curl -s -o /dev/null -w '%{http_code}\n' https://api.openai.com/v1/models -H "Authorization: Bearer $KEY"
```

`200` means go. For other providers, call their list-models endpoint the same way. If the key is not in `.env`, it may be stored as a Langflow global variable in the user's database instead — say so rather than guessing, since the isolated database will not have it.

## Docker mode (preferred)

Files: `docker/agent.Dockerfile` and `docker/compose.yml` next to this file. One base image (uv + node, no source, no deps) serves every worktree: the worktree is bind-mounted at `/app`, dependencies are synced on `up` into per-project named volumes (`<project>_venv`, `<project>_node_modules`, `<project>_data`), and two shared external volumes cache uv and npm downloads across projects. Isolation is structural — the container cannot reach the user's ports, processes, or `~/.cache/langflow` — so the host-mode hazards below do not apply inside it.

Measured on this machine (OrbStack, arm64): base image build 22 s; first start of a new worktree ~45 s with warm caches (a few minutes the very first time the caches fill); restart with volumes kept 17 s; backend `--reload` and Vite HMR both fire within ~1.5 s of a host-side edit with no polling. Each stack idles at roughly 1 GB (backend) + 1–3 GB (Vite); keep it to three or four concurrent stacks.

### Start

From the worktree root. The project name is the worktree's basename lower-cased, so every worktree gets its own volumes and containers.

```sh
COMPOSE="docker compose -f $HOME/.claude/skills/langflow/docker/compose.yml"
export WORKTREE="$PWD" COMPOSE_PROJECT_NAME="$(basename "$PWD" | tr 'A-Z' 'a-z')"
export BACKEND_PORT=7861 FRONTEND_PORT=3001

docker volume create langflow-agent-uv-cache >/dev/null
docker volume create langflow-agent-npm-cache >/dev/null
docker image inspect langflow-agent-base >/dev/null 2>&1 || $COMPOSE build
$COMPOSE up -d --wait --wait-timeout 900
```

`--wait` returns when both health checks pass (backend `/health`, frontend `/`). If it fails, `$COMPOSE logs backend` / `$COMPOSE logs frontend` has the reason — usually an `npm ci` network reset (it retries five times) or a missing `.env`.

- `.env` from the worktree is loaded via `env_file`, so the user's API keys reach the backend; the compose `environment:` block wins over it, so the isolation variables cannot be overridden.
- `LANGFLOW_AUTO_LOGIN` defaults to `true`; export it as `false` before `up` when the claim needs login, and the stack uses `LANGFLOW_SUPERUSER`/`LANGFLOW_SUPERUSER_PASSWORD` (default `langflow`/`langflow`).
- The database is SQLite in the project's `data` volume. Postgres is not provided; if a claim needs it, say so and fall back to host mode with a throwaway Postgres.
- To test a missing key, export it empty before `up` (`export OPENAI_API_KEY=`); the `environment:` block does not override keys, so the `.env` value applies otherwise.

### Running things inside the stack

Tests, lint, and repo tooling run in the backend/frontend containers against the same bind-mounted worktree. Inside, the ports are the defaults, so `make backend`, `npm run type-check`, and the repo's Playwright `webServer` are all harmless there:

```sh
$COMPOSE exec backend uv run pytest src/backend/tests/unit/path/test_x.py
$COMPOSE exec frontend npx jest src/some/file.test.tsx
```

The container is `linux/arm64`; anything genuinely macOS-specific in a claim needs host mode.

### Teardown

```sh
$COMPOSE down -v      # containers + this project's venv/node_modules/data volumes
$COMPOSE down         # containers only; next `up` is ~17 s
```

The shared cache volumes (`langflow-agent-uv-cache`, `langflow-agent-npm-cache`) and the `langflow-agent-base` image are external and survive `down -v`; keep them. Run `down -v` for a worktree's project **before** removing the worktree, or its ~2.5 GB of `<project>_venv`, `<project>_node_modules`, and `<project>_data` volumes stay behind with nothing left to own them. A stack started from the main checkout is project `langflow`, so its leftovers are `langflow_venv` and friends. To find and remove leftovers from any project:

```sh
docker volume ls -q --filter dangling=true | grep -v -- '-agent-'   # review the list
docker volume rm <those volumes>
```

The shared caches show up as dangling whenever no stack is running, and they carry compose labels like any other volume, so the name filter is the only thing keeping them out of that list.

## Host mode (fallback)

Use when Docker is not running, or when a claim depends on macOS-specific behavior or on a Postgres database.

### Hazards

- **Never `make backend`** or `make run_cli` while the user runs a backend: the `backend` target runs `kill -9 $(lsof -t -i:7860)` before starting, whatever `port=` you pass.
- **Never `langflow run --env-file`** for an isolated stack: it loads the file with `override=True`, so `.env` beats the data and port variables you set. Start uvicorn directly (its `--env-file` does not override).
- **Never `npm run type-check`**: it chains into `vite` and starts a dev server on the default port.
- **Never the repo's Playwright config** (`npx playwright test` from `src/frontend`): its `webServer` block starts a backend on 7860 and a stub on 8787.
- Without overrides, the backend uses the default config dir and SQLite database — the user's data, with migrations run against it.

### Dependencies

A fresh worktree has none. The first `uv run` creates `.venv` (slow). If `src/frontend/node_modules` is missing, run `npm ci` in `src/frontend` first (several minutes).

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

- Command-line variables win over `.env`, so the user's API keys still load while data stays isolated.
- Set `LANGFLOW_AUTO_LOGIN` to what the claim needs. With `false`, also set `LANGFLOW_SUPERUSER` and `LANGFLOW_SUPERUSER_PASSWORD` to throwaway credentials.
- Drop the two data variables only when the claim depends on existing data, and say so.
- To test a missing key, unset it for this process (`env -u KEY`), not in `.env`.

### Frontend

From `src/frontend`:

```sh
VITE_PORT=3001 VITE_PROXY_TARGET=http://localhost:7861 \
  npx vite --port 3001 --strictPort \
  > "/tmp/$(basename "$(git rev-parse --show-toplevel)")-frontend.log" 2>&1 &

for i in $(seq 1 60); do curl -fsS http://localhost:3001/ >/dev/null && break; sleep 2; done
```

`--strictPort` makes Vite fail instead of silently moving to a port the probes do not know.

### Teardown

Stop the listeners on `7861` and `3001` (or whichever you took). Remove `/tmp/<worktree>-langflow` unless it is evidence.

## Playwright

Both modes: the probe config from `dev-servers` with `baseURL: "http://localhost:3001/"` (the host-side frontend port), run on the host from `src/frontend` so `@playwright/test` and the repo's test utils (`tests/utils/...`) resolve. Browsers stay on the host; the Docker image deliberately has none.

```sh
npx playwright test --config ../../.evidence/probes/ui-probe.config.ts
```

In Docker mode, `src/frontend/node_modules` on the host is only needed for `@playwright/test` itself — if the worktree has none, `npm ci` there once, or point `NODE_PATH` at another checkout's `node_modules`.
