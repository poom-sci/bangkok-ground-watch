# API only (the data pipeline runs on a laptop, see HANDOFF.md).
# The built AOI files are baked into the image so the service needs no storage:
#   data/<aoi>/{meta.json,layers.npz,scenes.npz,optical.npz}
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .
COPY data /data
ENV SITING_DATA=/data PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "uvicorn siting.api.app:app --factory --host 0.0.0.0 --port ${PORT}"]
