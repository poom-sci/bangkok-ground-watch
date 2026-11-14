# solsat-siting

Site suitability API for SOLSAT: flood history from Sentinel-1 SAR, elevation from Copernicus DEM and land-cover exclusions, with an evidence endpoint that shows which satellite scenes produced each score.

- **Handoff (start here): [HANDOFF.md](HANDOFF.md)**
- API spec: [docs/API.md](docs/API.md) (+ [docs/openapi.json](docs/openapi.json))
- Design: [DESIGN.md](DESIGN.md) (draft)
- Status: read-only API over Ayutthaya and Hat Yai (Sentinel-1 2017–2025), runs locally and in Docker
- `prototype/` — the original exploration scripts (reference only; superseded by `src/siting/`)

## Run locally

```bash
uv sync                      # installs from uv.lock (Python 3.13 is fetched automatically)
make check                   # ruff + ty + openapi check + tests (no data or network needed)
make run                     # http://localhost:8780/docs, reads ./data
```

Build the data the API serves (needs network, see [HANDOFF.md](HANDOFF.md) section 6):

```bash
uv sync --extra pipeline
uv run siting-run --aoi hatyai          # AOIs are configured in aois.json
```

Settings are read from the environment: `SITING_DATA`, `SITING_CORS_ORIGINS`, `SITING_LOG_LEVEL`.

Endpoints: `/healthz`, `/readyz`, `/v1/coverage`, `/v1/runs/{run_id}`, `/v1/suitability`, `/v1/suitability/area`, `/v1/evidence`, `/v1/evidence/chip`.

Data attribution: contains modified Copernicus Sentinel data 2017–2025; Copernicus DEM GLO-30; ESA WorldCover 2021 (CC BY 4.0).
