# Base image for running a Langflow worktree's dev servers in Docker.
# No source and no dependencies are baked in: the worktree is bind-mounted at
# /app and deps are synced into named volumes on `up`, so one image serves
# every worktree regardless of its uv.lock / package-lock.json.
FROM node:22-bookworm-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pin the interpreter into the image so `uv sync` never downloads one at runtime.
ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python \
    UV_PYTHON=3.13 \
    UV_LINK_MODE=copy \
    TZ=UTC
RUN uv python install 3.13

WORKDIR /app
