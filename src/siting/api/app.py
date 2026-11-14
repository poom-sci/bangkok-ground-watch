"""FastAPI app. Read-only: it never fetches imagery, it serves built AOI files."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import urlencode

import numpy as np
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from ..config import Settings
from ..core import score as sc
from ..core.raster import polygon_area_m2, polygon_centroid, polygon_mask
from ..render import chip as chipr
from . import schemas as s
from .store import Aoi, Store

log = logging.getLogger("siting")

LC_LABELS = {
    10: "tree cover",
    20: "shrubland",
    30: "grassland",
    40: "cropland",
    50: "built-up",
    60: "bare / sparse",
    70: "snow / ice",
    80: "permanent water",
    90: "herbaceous wetland",
    95: "mangroves",
    100: "moss / lichen",
}
VEGETATED_LC = (30, 40)
BUILT_LC = 50
LAYER_ARRAYS = {
    "elev": "elev",
    "water_freq_wet": "water_freq_wet",
    "landcover": "landcover",
    "score": "score",
}
MAX_AREA_M2 = 25_000_000
CACHE_FOREVER = {"Cache-Control": "public, max-age=31536000, immutable"}  # a run never changes

Lat = Annotated[float, Query(ge=-90, le=90, description="Latitude, WGS84", examples=[7.04])]
Lng = Annotated[float, Query(ge=-180, le=180, description="Longitude, WGS84", examples=[100.47])]
RunId = Annotated[str | None, Query(description="Pin a processing run (default: the AOI covering the point)")]

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"model": s.ErrorResponse, "description": "Outside coverage or unknown run/scene"}
}
INVALID: dict[int | str, dict[str, Any]] = {
    422: {"model": s.ErrorResponse, "description": "Invalid parameters"}
}


def get_store(request: Request) -> Store:
    return request.app.state.store


StoreDep = Annotated[Store, Depends(get_store)]


def _f(x: Any, nd: int = 3) -> float | None:
    x = float(x)
    return round(x, nd) if np.isfinite(x) else None


def locate(store: Store, lat: float, lng: float, run_id: str | None = None) -> tuple[Aoi, tuple[int, int]]:
    if run_id:
        aoi = store.get_run(run_id)
        if aoi is None:
            raise HTTPException(404, {"error": "unknown_run", "run_id": run_id})
        rc = aoi.grid.lonlat_to_rc(lng, lat)
        if rc is None:
            raise HTTPException(404, {"error": "outside_coverage", "run_id": run_id})
        return aoi, rc
    hit = store.find(lat, lng)
    if hit is None:
        raise HTTPException(
            404,
            {"error": "outside_coverage", "available_aois": [a.meta["aoi"] for a in store.aois.values()]},
        )
    return hit


def flags(aoi: Aoi, r: int, c: int) -> list[str]:
    L, out = aoi.layers, []
    if aoi.meta["scenes_wet"] < 60:
        out.append("few_wet_scenes")
    lc = int(L["landcover"][r, c])
    if lc in VEGETATED_LC:
        out.append("vegetated_flooding_not_detected")
    if lc == BUILT_LC:
        out.append("urban_flooding_not_detected")  # SAR brightens over flooded buildings (double bounce)
    out.append("elevation_is_dsm")
    if L["perm_water"][max(r - 2, 0) : r + 3, max(c - 2, 0) : c + 3].any():
        out.append("near_permanent_water")
    if min(r, c, aoi.grid.height - 1 - r, aoi.grid.width - 1 - c) < 3:
        out.append("aoi_edge")
    return out


def optical_refs(aoi: Aoi, r: int, c: int, q) -> list[dict]:
    o = aoi.optical
    if not o:
        return []
    out = []
    for k, d in enumerate(o["dates"]):
        near = [abs((np.datetime64(d) - np.datetime64(x)).astype(int)) for x in aoi.dates]
        m = o["mndwi"][k][r, c]
        out.append(
            {
                "acquired_at": d,
                "source": "Sentinel-2 L2A",
                "cloud_pct_aoi": round(100 * float(o["cloud"][k]), 1),
                "nearest_sar_days": int(min(near)),
                "mndwi": _f(m, 2),
                "optical_water": bool(m > 0) if np.isfinite(m) else None,
                "chip_url": f"/v1/evidence/chip?{q(layer='s2-' + d)}",
            }
        )
    return out


router = APIRouter()


@router.get("/healthz", tags=["ops"], summary="Liveness", response_model=s.Health)
def healthz(store: StoreDep):
    return {"ok": True, "aois": list(store.aois)}


@router.get(
    "/readyz",
    tags=["ops"],
    summary="Readiness (503 until at least one AOI is loaded)",
    response_model=s.Health,
    responses={503: {"model": s.Health}},
)
def readyz(store: StoreDep, response: Response):
    ready = bool(store.aois)
    if not ready:
        response.status_code = 503
    return {"ok": ready, "aois": list(store.aois)}


@router.get(
    "/v1/coverage", tags=["metadata"], summary="Areas this service can answer for", response_model=s.Coverage
)
def coverage(store: StoreDep):
    return {
        "aois": [
            {
                **a.meta["aoi"],
                "run_id": a.run_id,
                "method_version": a.meta["method_version"],
                "pixel_m": a.grid.pixel_m,
                "date_range": a.meta["date_range"],
            }
            for a in store.aois.values()
        ]
    }


@router.get(
    "/v1/runs/{run_id}",
    tags=["metadata"],
    summary="All parameters of one processing run",
    response_model=s.Run,
    responses=NOT_FOUND,
)
def run(run_id: str, store: StoreDep):
    aoi = store.get_run(run_id)
    if aoi is None:
        raise HTTPException(404, {"error": "unknown_run", "run_id": run_id})
    keys = s.Run.model_fields
    return {k: aoi.meta[k] for k in keys}


@router.get(
    "/v1/suitability",
    tags=["suitability"],
    summary="Suitability score for one point",
    response_model=s.Suitability,
    responses={**NOT_FOUND, **INVALID},
)
def suitability(lat: Lat, lng: Lng, store: StoreDep):
    aoi, (r, c) = locate(store, lat, lng)
    L, m = aoi.layers, aoi.meta
    lc = int(L["landcover"][r, c])
    exclusions = []
    if bool(L["perm_water"][r, c]):
        exclusions.append("permanent_water")
    if lc in sc.EXCLUDED_LC:
        exclusions.append(sc.EXCLUDED_LC[lc])
    if "protected" in L and bool(L["protected"][r, c]):
        exclusions.append("protected_area")
    score = float(L["score"][r, c])
    has_score = bool(np.isfinite(score))
    fl = flags(aoi, r, c)
    return {
        "location": {"lat": lat, "lng": lng},
        "aoi": {"id": aoi.id, "name": m["aoi"]["name"]},
        "run_id": aoi.run_id,
        "method_version": m["method_version"],
        "score": round(score) if has_score else None,
        "grade": sc.grade(score) if has_score else None,
        "components": {
            "flood": {
                "value": _f(L["water_freq_wet"][r, c]),
                "unit": "share of wet-season scenes with water",
                "years_flooded_share": _f(L["flood_year_share"][r, c]) if "flood_year_share" in L else None,
                "subscore": _f(L["f_flood"][r, c]),
                "weight": sc.W_FLOOD,
            },
            "elevation": {
                "value": _f(L["elev"][r, c], 1),
                "unit": "m (Copernicus DEM, a surface model)",
                "p_flood": _f(L["p_flood"][r, c]),
                "subscore": _f(L["f_elev"][r, c]),
                "weight": sc.W_ELEV,
            },
        },
        "exclusions": exclusions,
        "landcover": {"class": lc, "label": LC_LABELS.get(lc, "unknown"), "source": "ESA WorldCover 2021"},
        "confidence": {"level": "low" if len(fl) > 2 else "medium", "flags": fl},
        "irradiance": m.get("irradiance"),
        "evidence_url": f"/v1/evidence?{urlencode({'lat': lat, 'lng': lng, 'run_id': aoi.run_id})}",
        "attribution": m["attribution"],
    }


@router.post(
    "/v1/suitability/area",
    tags=["suitability"],
    summary="Score statistics inside a polygon (parcel or roof)",
    description=(
        "Roof polygons from the roof detector can be sent here. A roof is smaller than one 80 m pixel, "
        "so those get the pixel under their centre and the flag `smaller_than_pixel`. Max area 25 km²."
    ),
    response_model=s.AreaSuitability,
    responses={**NOT_FOUND, **INVALID},
)
def suitability_area(body: s.AreaRequest, store: StoreDep):
    geom = body.geometry.model_dump()
    try:
        lon0, lat0 = polygon_centroid(geom)
        aoi, (r0, c0) = locate(store, lat0, lon0)
        area = polygon_area_m2(aoi.grid, geom)
        if area > MAX_AREA_M2:
            raise HTTPException(
                422, {"error": "area_too_large", "max_m2": MAX_AREA_M2, "area_m2": round(area)}
            )
        mask = polygon_mask(aoi.grid, geom)
    except (ValueError, KeyError, IndexError, TypeError) as e:
        raise HTTPException(422, "geometry must be a valid GeoJSON Polygon or MultiPolygon") from e
    smaller = area < aoi.grid.pixel_m**2
    if not mask.any():
        mask[r0, c0] = True
    L = aoi.layers
    sv = L["score"][mask]
    ok = np.isfinite(sv)
    any_ok = bool(ok.any())

    def comp(key: str):
        return _f(np.nanmean(L[key][mask]), 3) if any_ok else None

    return {
        "aoi": {"id": aoi.id, "name": aoi.meta["aoi"]["name"]},
        "run_id": aoi.run_id,
        "method_version": aoi.meta["method_version"],
        "area_m2": round(area),
        "pixels": int(mask.sum()),
        "pixel_m": aoi.grid.pixel_m,
        "score_mean": _f(np.mean(sv[ok]), 1) if any_ok else None,
        "score_p10": _f(np.percentile(sv[ok], 10), 1) if any_ok else None,
        "share_poor": _f(np.mean(sv[ok] < 50), 3) if any_ok else None,
        "share_excluded": _f(1 - ok.mean(), 3),
        "components": {
            "flood_freq": comp("water_freq_wet"),
            "elevation_m": comp("elev"),
            "p_flood": comp("p_flood"),
        },
        "flags": ["smaller_than_pixel"] if smaller else [],
        "evidence_url": f"/v1/evidence?{urlencode({'lat': lat0, 'lng': lon0, 'run_id': aoi.run_id})}",
        "attribution": aoi.meta["attribution"],
    }


@router.get(
    "/v1/evidence",
    tags=["evidence"],
    summary="Which satellite scenes produced the score at a point",
    description=(
        "Every Sentinel-1 scene used, with the value read at the point and whether the water rule fired. "
        "These are the same numbers the score was computed from, not recomputed."
    ),
    response_model=s.Evidence,
    responses={**NOT_FOUND, **INVALID},
)
def evidence(lat: Lat, lng: Lng, store: StoreDep, run_id: RunId = None):
    aoi, (r, c) = locate(store, lat, lng, run_id)
    m, L = aoi.meta, aoi.layers
    vv = aoi.db[:, r, c].astype("float32")
    vh = aoi.vh[:, r, c].astype("float32") if aoi.vh is not None else None
    rule = aoi.band()[:, r, c].astype("float32")
    ok = np.isfinite(rule)
    water = ok & (rule < aoi.water_db)
    wm = m["params"]["wet_months"]
    wet, _ = sc.season_masks(aoi.months, (wm[0], wm[-1]))
    bbox = ",".join(f"{v:.5f}" for v in m["aoi"]["bbox"])

    def q(**kw):
        return urlencode({"lat": lat, "lng": lng, "run_id": aoi.run_id, **kw})

    scenes = []
    for i in range(len(vv)):
        d = str(aoi.dates[i])
        sid = aoi.scene_ids[i]
        stac = urlencode(
            {"collections": "sentinel-1-rtc", "bbox": bbox, "datetime": f"{d}T00:00:00Z/{d}T23:59:59Z"}
        )
        scenes.append(
            {
                "scene_id": sid,
                "acquired_at": d,
                "platform": "sentinel-1",
                "orbit": str(aoi.orbits[i]),
                "season": "wet" if wet[i] else "dry",
                "vv_db": _f(vv[i], 2),
                "vh_db": _f(vh[i], 2) if vh is not None else None,
                "is_water": bool(water[i]),
                "chip_url": f"/v1/evidence/chip?{q(scene_id=sid)}",
                "stac_item_id": None,
                "source_url": f"https://planetarycomputer.microsoft.com/api/stac/v1/search?{stac}",
            }
        )
    return {
        "run_id": aoi.run_id,
        "method": {
            "version": m["method_version"],
            "water_rule": f"{aoi.water_band.upper()}_dB < {aoi.water_db:g}",
            "wet_months": m["params"]["wet_months"],
            "pixel_m": m["params"]["pixel_m"],
            "scene_set_hash": m["scene_set_hash"],
            "code_sha": m["code_sha"],
            "scene_source": m["scene_source"],
        },
        "point": {"lat": lat, "lng": lng, "pixel": {"row": r, "col": c}},
        "summary": {
            "scenes_total": len(vv),
            "scenes_wet": int(wet.sum()),
            "wet_scenes_with_water": int((water & wet).sum()),
            "wet_scenes_valid": int((ok & wet).sum()),
        },
        "scenes": scenes,
        "layers": [
            {
                "kind": "elev",
                "value": _f(L["elev"][r, c], 1),
                "source": "Copernicus DEM GLO-30",
                "chip_url": f"/v1/evidence/chip?{q(layer='elev')}",
            },
            {
                "kind": "water_freq_wet",
                "value": _f(L["water_freq_wet"][r, c]),
                "chip_url": f"/v1/evidence/chip?{q(layer='water_freq_wet')}",
            },
            {
                "kind": "landcover",
                "value": int(L["landcover"][r, c]),
                "source": "ESA WorldCover 2021",
                "chip_url": f"/v1/evidence/chip?{q(layer='landcover')}",
            },
            {
                "kind": "score",
                "value": _f(L["score"][r, c], 1),
                "chip_url": f"/v1/evidence/chip?{q(layer='score')}",
            },
        ],
        "optical_reference": optical_refs(aoi, r, c, q),
        "attribution": m["attribution"],
    }


@router.get(
    "/v1/evidence/chip",
    tags=["evidence"],
    summary="PNG of a SAR scene, optical scene or data layer around a point",
    description=(
        "Give exactly one of `scene_id` (a Sentinel-1 scene from /v1/evidence) or `layer` "
        "(`elev`, `water_freq_wet`, `landcover`, `score`, or `s2-<YYYY-MM-DD>` for Sentinel-2 true colour). "
        "A red cross marks the point. Colour stretches are fixed so images compare across dates."
    ),
    response_class=Response,
    responses={
        200: {"content": {"image/png": {"schema": {"type": "string", "format": "binary"}}}},
        **NOT_FOUND,
        **INVALID,
    },
)
def evidence_chip(
    lat: Lat,
    lng: Lng,
    store: StoreDep,
    scene_id: str | None = None,
    layer: str | None = None,
    run_id: RunId = None,
    size_m: Annotated[int, Query(ge=500, le=30000, description="Width of the window in metres")] = 8000,
    overlay: Literal["none", "water_mask"] = "none",
    band: Literal["vv", "vh"] = "vv",
):
    if (scene_id is None) == (layer is None):
        raise HTTPException(422, "give exactly one of scene_id or layer")
    aoi, (r, c) = locate(store, lat, lng, run_id)
    half = max(int(size_m / aoi.grid.pixel_m / 2), 2)
    if scene_id:
        if scene_id not in aoi.scene_ids:
            raise HTTPException(404, {"error": "unknown_scene"})
        k = aoi.scene_ids.index(scene_id)
        use_vh = band == "vh" and aoi.vh is not None
        a = (aoi.vh if use_vh else aoi.db)[k].astype("float32")
        rule = aoi.band()[k].astype("float32")
        mask = (np.isfinite(rule) & (rule < aoi.water_db)) if overlay == "water_mask" else None
        png = chipr.render(a, "sar_vh" if use_vh else "sar", r, c, half, water_mask=mask)
    elif layer is not None and layer.startswith("s2-"):
        o = aoi.optical
        if o is None or layer[3:] not in o["dates"]:
            raise HTTPException(404, {"error": "unknown_optical_scene"})
        png = chipr.render(o["rgb"][o["dates"].index(layer[3:])], "rgb", r, c, half)
    elif layer in LAYER_ARRAYS:
        png = chipr.render(aoi.layers[LAYER_ARRAYS[layer]], layer, r, c, half)
    else:
        raise HTTPException(422, f"layer must be one of {sorted(LAYER_ARRAYS)} or s2-<date>")
    return Response(png, media_type="image/png", headers=CACHE_FOREVER)


TAGS = [
    {"name": "suitability", "description": "The score, for a point or a polygon."},
    {
        "name": "evidence",
        "description": "Proof: the satellite scenes and values behind a score, and images of them.",
    },
    {"name": "metadata", "description": "What areas and runs exist."},
    {"name": "ops", "description": "Health checks."},
]


def _version() -> str:
    try:
        return version("solsat-siting")
    except PackageNotFoundError:
        return "0.0.0"


def create_app(data_dir: str | Path | None = None, settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    if data_dir is not None:
        settings = settings.model_copy(update={"data_dir": Path(data_dir)})

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        logging.basicConfig(level=settings.log_level.upper())
        app.state.store = Store(settings.data_dir)
        log.info(
            "loaded %d AOI(s) from %s: %s",
            len(app.state.store.aois),
            settings.data_dir,
            list(app.state.store.aois),
        )
        yield

    app = FastAPI(
        title="solsat-siting",
        version=_version(),
        summary="Site suitability for rooftop-solar factories, with satellite evidence",
        description=(
            "Flood history from Sentinel-1 SAR, elevation from Copernicus DEM and land-cover exclusions. "
            "Read-only; answers only for the areas listed in /v1/coverage. Resolution 80 m. "
            "Contains modified Copernicus Sentinel data; Copernicus DEM GLO-30; ESA WorldCover 2021 (CC BY 4.0). "
            "See docs/API.md for limits and caveats."
        ),
        openapi_tags=TAGS,
        lifespan=lifespan,
    )
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST"],
            allow_headers=["*"],
        )
    app.include_router(router)
    return app


def app() -> FastAPI:  # uvicorn --factory siting.api.app:app
    return create_app()
