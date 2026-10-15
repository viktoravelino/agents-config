# Langflow: review specifics

Applies the generic angles in `adversarial-review` to Langflow.

## Layout

- `src/frontend/` — React + TypeScript (Vite)
- `src/backend/` — FastAPI app (`langflow`)
- `src/lfx/` — the component and execution library

## Frontend stack, and what to attack in it

- **TanStack Query** for server state: query keys missing a variable they depend on, mutations that do not invalidate what they change.
- **zustand** stores: selectors returning new objects or arrays each call, state that should reset between flows but does not.
- **@xyflow/react** canvas: work in render for nodes and edges, unstable props that re-render the whole graph.
- **Radix UI** primitives: focus and keyboard behavior are usually provided — flag custom wrappers that break them.
- **i18next**: user-visible strings hard-coded where the surrounding code uses translations.

Hot paths: the flow canvas, chat and message history, long lists in the component sidebar.

## Read-only checks

From `src/frontend`, scoped to the changed files:

```sh
npx @biomejs/biome lint <files>
npx tsc --noEmit --project tsconfig.json
```

Not `npm run format` (writes) and not `npm run type-check` (starts `vite`).

Backend, from the repo root: `uv run ruff check <files>`.

## IBM-Langflow overlay

`WatsonOrchestrate/IBM-Langflow` has a different layout:

- `src/` — the EE Python package
- `frontend-overrides/src/customization/` — frontend sources
- `.frontend-dev/langflow` — generated mirror of the OSS frontend; never edit
- `tests/`

Read-only checks, from the repo root (read `Makefile` for anything else; do not invent targets):

```sh
make lint            # uv run ruff check .
make test            # ./scripts/run-with-oss.sh pytest
make test-frontend   # jest, config in frontend-overrides/jest.config.js
```

There is no typecheck target. `make test-frontend` sets up the mirror if it is missing.
