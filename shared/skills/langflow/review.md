# Langflow: review specifics

This file applies the generic angles in `adversarial-review` to Langflow.

## Layout

- `src/frontend/` — React + TypeScript (Vite)
- `src/backend/` — FastAPI app (`langflow`)
- `src/lfx/` — the component and execution library

## Frontend stack, and what to attack in it

- **TanStack Query** for server state: look for query keys that miss a variable they depend on, and for mutations that do not invalidate what they change.
- **zustand** stores: look for selectors that return new objects or arrays on each call, and for state that must reset between flows but does not.
- **@xyflow/react** canvas: look for work in render for nodes and edges, and for unstable props that re-render the whole graph.
- **Radix UI** primitives: these usually provide focus and keyboard behavior. Flag custom wrappers that break it.
- **i18next**: look for user-visible strings that are hard-coded where the surrounding code uses translations.

Hot paths: the flow canvas, chat and message history, long lists in the component sidebar.

## Read-only checks

From `src/frontend`, scoped to the changed files:

```sh
npx @biomejs/biome lint <files>
npx tsc --noEmit --project tsconfig.json
```

Do not run `npm run format` (it writes files) or `npm run type-check` (it starts `vite`).

Backend, from the repo root: `uv run ruff check <files>`.

## IBM-Langflow overlay

`WatsonOrchestrate/IBM-Langflow` has a different layout:

- `src/` — the EE Python package
- `frontend-overrides/src/customization/` — frontend sources
- `.frontend-dev/langflow` — generated mirror of the OSS frontend; never edit it
- `tests/`

Read-only checks, from the repo root. For anything else, read `Makefile`. Do not invent targets:

```sh
make lint            # uv run ruff check .
make test            # ./scripts/run-with-oss.sh pytest
make test-frontend   # jest, config in frontend-overrides/jest.config.js
```

There is no typecheck target. If the mirror is missing, `make test-frontend` sets it up.
