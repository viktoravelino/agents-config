# Langflow: running an isolated stack

Applies the generic rules in `dev-servers` to Langflow.

## Ports

Backend `7861` (then `7862`, …), frontend `3001` (then `3002`, …). The user's own stack runs on `7860` and `3000`.

## Hazards

- **Never `make backend`** or `make run_cli` while the user runs a backend: the `backend` target runs `kill -9 $(lsof -t -i:7860)` before starting, whatever `port=` you pass.
- **Never `langflow run --env-file`** for an isolated stack: it loads the file with `override=True`, so `.env` beats the data and port variables you set. Start uvicorn directly (its `--env-file` does not override).
- **Never `npm run type-check`**: it chains into `vite` and starts a dev server on the default port.
- **Never the repo's Playwright config** (`npx playwright test` from `src/frontend`): its `webServer` block starts a backend on 7860 and a stub on 8787.
- Without overrides, the backend uses the default config dir and SQLite database — the user's data, with migrations run against it.

## Credential check

Most Langflow claims run a flow, and a flow runs through a model provider. Before installing anything, check the key for the provider the flow's components use, reading it from the `.env` the backend will load:

```sh
KEY="$(grep -E '^OPENAI_API_KEY=' .env | cut -d= -f2- | tr -d "\"'")"
curl -s -o /dev/null -w '%{http_code}\n' https://api.openai.com/v1/models -H "Authorization: Bearer $KEY"
```

`200` means go. For other providers, call their list-models endpoint the same way. If the key is not in `.env`, it may be stored as a Langflow global variable in the user's database instead — say so rather than guessing, since the isolated database will not have it.

## Dependencies

A fresh worktree has none. The first `uv run` creates `.venv` (slow). If `src/frontend/node_modules` is missing, run `npm ci` in `src/frontend` first (several minutes).

## Backend

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

## Frontend

From `src/frontend`:

```sh
VITE_PORT=3001 VITE_PROXY_TARGET=http://localhost:7861 \
  npx vite --port 3001 --strictPort \
  > "/tmp/$(basename "$(git rev-parse --show-toplevel)")-frontend.log" 2>&1 &

for i in $(seq 1 60); do curl -fsS http://localhost:3001/ >/dev/null && break; sleep 2; done
```

`--strictPort` makes Vite fail instead of silently moving to a port the probes do not know.

## Playwright

The probe config from `dev-servers` with `baseURL: "http://localhost:3001/"`, run from `src/frontend` so `@playwright/test` and the repo's test utils (`tests/utils/...`) resolve:

```sh
npx playwright test --config ../../.evidence/probes/ui-probe.config.ts
```

## Teardown ports

`7861` and `3001` (or whichever you took). Remove `/tmp/<worktree>-langflow` unless it is evidence.
