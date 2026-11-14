# syntax=docker/dockerfile:1
# API only (the data pipeline runs on a laptop, see HANDOFF.md). The built AOI files in data/ are baked
# into the image so the service needs no storage:  data/<aoi>/{meta.json,layers.npz,scenes.npz,optical.npz}

FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.11.8 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
# dependencies first (cached unless pyproject.toml or uv.lock change)
COPY pyproject.toml uv.lock .python-version README.md ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-editable

FROM python:3.13-slim
RUN useradd --system --no-create-home --uid 10001 app
COPY --from=build /app/.venv /app/.venv
COPY data /data
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 SITING_DATA=/data PORT=8080
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD python -c "import os,urllib.request as u; u.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/healthz')"
CMD ["sh", "-c", "exec uvicorn siting.api.app:app --factory --host 0.0.0.0 --port ${PORT}"]
