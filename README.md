# solsat-siting

Site suitability API for SOLSAT: flood history from Sentinel-1 SAR, elevation from Copernicus DEM and land-cover exclusions, with an evidence endpoint that shows which satellite scenes produced each score.

- **Handoff (start here): [HANDOFF.md](HANDOFF.md)**
- API spec: [docs/API.md](docs/API.md) (+ [docs/openapi.json](docs/openapi.json))
- Design: [DESIGN.md](DESIGN.md) (draft)
- Status: M1 — read-only API over the Ayutthaya 2017–2025 data, runs locally
- `prototype/` — the original exploration scripts (reference only; superseded by `src/siting/`)

## Run locally

```bash
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/python -m pytest

# build the data the API serves (data/ is git-ignored)
PYTHONPATH=src .venv/bin/python -m siting.pipeline.build --raw <prototype scratch dir> --id ayutthaya --name Ayutthaya --out data

SITING_DATA=data PYTHONPATH=src .venv/bin/uvicorn siting.api.app:app --factory --port 8780
```

Endpoints: `/healthz`, `/v1/coverage`, `/v1/runs/{run_id}`, `/v1/suitability?lat&lng`,
`/v1/evidence?lat&lng`, `/v1/evidence/chip?lat&lng&(scene_id|layer)`.

Data attribution: contains modified Copernicus Sentinel data 2017–2025; Copernicus DEM GLO-30; ESA WorldCover 2021 (CC BY 4.0).
