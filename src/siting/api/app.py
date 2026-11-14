"""FastAPI app. Read-only: it never fetches imagery, it serves built AOI files."""
from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlencode

import numpy as np
from fastapi import Body, FastAPI, HTTPException, Query, Response

from .. import METHOD_VERSION
from ..core.raster import polygon_area_m2, polygon_centroid, polygon_mask
from ..core import score as sc
from ..render import chip as chipr
from .store import Aoi, Store

LC_LABELS = {10: "tree cover", 20: "shrubland", 30: "grassland", 40: "cropland", 50: "built-up",
             60: "bare / sparse", 70: "snow / ice", 80: "permanent water", 90: "herbaceous wetland",
             95: "mangroves", 100: "moss / lichen"}
VEGETATED_LC = (30, 40)
BUILT_LC = 50
LAYER_ARRAYS = {"elev": "elev", "water_freq_wet": "water_freq_wet", "landcover": "landcover", "score": "score"}


def _f(x, nd=3):
    x = float(x)
    return None if not np.isfinite(x) else round(x, nd)


def create_app(data_dir: str | Path | None = None) -> FastAPI:
    data_dir = Path(data_dir or os.environ.get("SITING_DATA", "data"))
    store = Store(data_dir)
    app = FastAPI(title="solsat-siting", version=METHOD_VERSION)

    def locate(lat: float, lng: float, run_id: str | None = None):
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
            raise HTTPException(404, {"error": "outside_coverage",
                                      "available_aois": [a.meta["aoi"] for a in store.aois.values()]})
        return hit

    def flags(aoi: Aoi, r: int, c: int):
        L, out = aoi.layers, []
        if aoi.meta["scenes_wet"] < 60:
            out.append("few_wet_scenes")
        if int(L["landcover"][r, c]) in VEGETATED_LC:
            out.append("vegetated_flooding_not_detected")
        if int(L["landcover"][r, c]) == BUILT_LC:
            out.append("urban_flooding_not_detected")  # VV rises over flooded buildings (double bounce)
        out.append("elevation_is_dsm")
        win = L["perm_water"][max(r - 2, 0):r + 3, max(c - 2, 0):c + 3]
        if win.any():
            out.append("near_permanent_water")
        H, W = aoi.grid.height, aoi.grid.width
        if min(r, c, H - 1 - r, W - 1 - c) < 3:
            out.append("aoi_edge")
        return out

    def optical_refs(aoi: Aoi, r: int, c: int, q):
        o = aoi.optical
        if not o:
            return []
        out = []
        for k, d in enumerate(o["dates"]):
            near = [abs((np.datetime64(d) - np.datetime64(x)).astype(int)) for x in aoi.dates]
            m = o["mndwi"][k][r, c]
            out.append({"acquired_at": d, "source": "Sentinel-2 L2A", "cloud_pct_aoi": round(100 * float(o["cloud"][k]), 1),
                        "nearest_sar_days": int(min(near)),
                        "mndwi": _f(m, 2), "optical_water": None if not np.isfinite(m) else bool(m > 0),
                        "chip_url": f"/v1/evidence/chip?{q(layer='s2-' + d)}"})
        return out

    @app.get("/healthz")
    def healthz():
        return {"ok": True, "aois": list(store.aois)}

    @app.get("/v1/coverage")
    def coverage():
        return {"aois": [{**a.meta["aoi"], "run_id": a.run_id, "method_version": a.meta["method_version"],
                          "pixel_m": a.grid.pixel_m, "date_range": a.meta["date_range"]}
                         for a in store.aois.values()]}

    @app.get("/v1/runs/{run_id}")
    def run(run_id: str):
        aoi = store.get_run(run_id)
        if aoi is None:
            raise HTTPException(404, {"error": "unknown_run"})
        m = aoi.meta
        return {k: m[k] for k in ("run_id", "method_version", "params", "scene_set_hash", "code_sha",
                                  "created_at", "scenes_total", "scenes_wet", "scenes_dry",
                                  "date_range", "scene_source", "elev_flood_table", "attribution")}

    @app.get("/v1/suitability")
    def suitability(lat: float = Query(..., ge=-90, le=90), lng: float = Query(..., ge=-180, le=180)):
        aoi, (r, c) = locate(lat, lng)
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
        has_score = np.isfinite(score)
        ev = f"/v1/evidence?{urlencode({'lat': lat, 'lng': lng, 'run_id': aoi.run_id})}"
        fl = flags(aoi, r, c)
        return {
            "location": {"lat": lat, "lng": lng},
            "aoi": {"id": aoi.id, "name": m["aoi"]["name"]},
            "run_id": aoi.run_id, "method_version": m["method_version"],
            "score": round(score) if has_score else None,
            "grade": sc.grade(score) if has_score else None,
            "components": {
                "flood": {"value": _f(L["water_freq_wet"][r, c]), "unit": "share of wet-season scenes with water",
                          "years_flooded_share": _f(L["flood_year_share"][r, c]) if "flood_year_share" in L else None,
                          "subscore": _f(L["f_flood"][r, c]), "weight": sc.W_FLOOD},
                "elevation": {"value": _f(L["elev"][r, c], 1), "unit": "m (Copernicus DEM, a surface model)",
                              "p_flood": _f(L["p_flood"][r, c]), "subscore": _f(L["f_elev"][r, c]),
                              "weight": sc.W_ELEV},
            },
            "exclusions": exclusions,
            "landcover": {"class": lc, "label": LC_LABELS.get(lc, "unknown"), "source": "ESA WorldCover 2021"},
            "confidence": {"level": "low" if len(fl) > 2 else "medium", "flags": fl},
            "irradiance": m.get("irradiance"),
            "evidence_url": ev,
            "attribution": m["attribution"],
        }

    MAX_AREA_M2 = 25_000_000

    @app.post("/v1/suitability/area")
    def suitability_area(body: dict = Body(...)):
        """Score statistics inside a polygon. Roof polygons from the roof detector can be sent here:
        a roof is smaller than one 80 m pixel, so those get the pixel under their centre."""
        geom = body.get("geometry")
        if not isinstance(geom, dict):
            raise HTTPException(422, "body must be {\"geometry\": <GeoJSON Polygon or MultiPolygon>}")
        try:
            lon0, lat0 = polygon_centroid(geom)
        except (ValueError, KeyError, IndexError, TypeError):
            raise HTTPException(422, "geometry must be a GeoJSON Polygon or MultiPolygon")
        aoi, (r0, c0) = locate(lat0, lon0)
        area = polygon_area_m2(aoi.grid, geom)
        if area > MAX_AREA_M2:
            raise HTTPException(422, {"error": "area_too_large", "max_m2": MAX_AREA_M2, "area_m2": round(area)})
        mask = polygon_mask(aoi.grid, geom)
        smaller = area < aoi.grid.pixel_m ** 2
        if not mask.any():
            mask[r0, c0] = True
        L = aoi.layers
        sv = L["score"][mask]
        ok = np.isfinite(sv)
        comp = lambda k: _f(np.nanmean(L[k][mask]), 3) if ok.any() else None  # noqa: E731
        return {
            "aoi": {"id": aoi.id, "name": aoi.meta["aoi"]["name"]}, "run_id": aoi.run_id,
            "method_version": aoi.meta["method_version"],
            "area_m2": round(area), "pixels": int(mask.sum()), "pixel_m": aoi.grid.pixel_m,
            "score_mean": _f(np.mean(sv[ok]), 1) if ok.any() else None,
            "score_p10": _f(np.percentile(sv[ok], 10), 1) if ok.any() else None,
            "share_poor": _f(np.mean(sv[ok] < 50), 3) if ok.any() else None,
            "share_excluded": _f(1 - ok.mean(), 3),
            "components": {"flood_freq": comp("water_freq_wet"), "elevation_m": comp("elev"),
                           "p_flood": comp("p_flood")},
            "flags": (["smaller_than_pixel"] if smaller else []),
            "evidence_url": f"/v1/evidence?{urlencode({'lat': lat0, 'lng': lon0, 'run_id': aoi.run_id})}",
            "attribution": aoi.meta["attribution"],
        }

    @app.get("/v1/evidence")
    def evidence(lat: float = Query(..., ge=-90, le=90), lng: float = Query(..., ge=-180, le=180),
                 run_id: str | None = None):
        aoi, (r, c) = locate(lat, lng, run_id)
        m, L = aoi.meta, aoi.layers
        vv = aoi.db[:, r, c].astype("float32")
        vh = aoi.vh[:, r, c].astype("float32") if aoi.vh is not None else None
        rule = aoi.band()[:, r, c].astype("float32")
        ok = np.isfinite(rule)
        water = ok & (rule < aoi.water_db)
        wm = aoi.meta["params"]["wet_months"]
        wet, _ = sc.season_masks(aoi.months, (wm[0], wm[-1]))
        bbox = ",".join(f"{v:.5f}" for v in m["aoi"]["bbox"])
        q = lambda **kw: urlencode({"lat": lat, "lng": lng, "run_id": aoi.run_id, **kw})  # noqa: E731
        scenes = []
        for i in range(len(vv)):
            d = str(aoi.dates[i])
            sid = aoi.scene_ids[i]
            scenes.append({
                "scene_id": sid, "acquired_at": d, "platform": "sentinel-1",
                "orbit": str(aoi.orbits[i]), "season": "wet" if wet[i] else "dry",
                "vv_db": _f(vv[i], 2), "vh_db": _f(vh[i], 2) if vh is not None else None, "is_water": bool(water[i]),
                "chip_url": f"/v1/evidence/chip?{q(scene_id=sid)}",
                "stac_item_id": None,
                "source_url": ("https://planetarycomputer.microsoft.com/api/stac/v1/search?"
                               + urlencode({"collections": "sentinel-1-rtc", "bbox": bbox,
                                            "datetime": f"{d}T00:00:00Z/{d}T23:59:59Z"})),
            })
        return {
            "run_id": aoi.run_id,
            "method": {"version": m["method_version"], "water_rule": f"{aoi.water_band.upper()}_dB < {aoi.water_db:g}",
                       "wet_months": m["params"]["wet_months"], "pixel_m": m["params"]["pixel_m"],
                       "scene_set_hash": m["scene_set_hash"], "code_sha": m["code_sha"],
                       "scene_source": m["scene_source"]},
            "point": {"lat": lat, "lng": lng, "pixel": {"row": r, "col": c}},
            "summary": {"scenes_total": int(len(vv)), "scenes_wet": int(wet.sum()),
                        "wet_scenes_with_water": int((water & wet).sum()),
                        "wet_scenes_valid": int((ok & wet).sum())},
            "scenes": scenes,
            "layers": [
                {"kind": "elev", "value": _f(L["elev"][r, c], 1), "source": "Copernicus DEM GLO-30",
                 "chip_url": f"/v1/evidence/chip?{q(layer='elev')}"},
                {"kind": "water_freq_wet", "value": _f(L["water_freq_wet"][r, c]),
                 "chip_url": f"/v1/evidence/chip?{q(layer='water_freq_wet')}"},
                {"kind": "landcover", "value": int(L["landcover"][r, c]), "source": "ESA WorldCover 2021",
                 "chip_url": f"/v1/evidence/chip?{q(layer='landcover')}"},
                {"kind": "score", "value": _f(L["score"][r, c], 1),
                 "chip_url": f"/v1/evidence/chip?{q(layer='score')}"},
            ],
            "optical_reference": optical_refs(aoi, r, c, q),
            "attribution": m["attribution"],
        }

    @app.get("/v1/evidence/chip")
    def evidence_chip(lat: float = Query(..., ge=-90, le=90), lng: float = Query(..., ge=-180, le=180),
                      scene_id: str | None = None, layer: str | None = None, run_id: str | None = None,
                      size_m: int = Query(8000, ge=500, le=30000), overlay: str = "none",
                      band: str = Query("vv", pattern="^(vv|vh)$")):
        if (scene_id is None) == (layer is None):
            raise HTTPException(422, "give exactly one of scene_id or layer")
        aoi, (r, c) = locate(lat, lng, run_id)
        half = max(int(size_m / aoi.grid.pixel_m / 2), 2)
        if scene_id:
            if scene_id not in aoi.scene_ids:
                raise HTTPException(404, {"error": "unknown_scene"})
            k = aoi.scene_ids.index(scene_id)
            a = (aoi.vh if band == "vh" and aoi.vh is not None else aoi.db)[k].astype("float32")
            rule = aoi.band()[k].astype("float32")
            mask = (np.isfinite(rule) & (rule < aoi.water_db)) if overlay == "water_mask" else None
            png = chipr.render(a, "sar_vh" if (band == "vh" and aoi.vh is not None) else "sar", r, c, half, water_mask=mask)
        else:
            if layer.startswith("s2-"):
                o = aoi.optical
                if not o or layer[3:] not in o["dates"]:
                    raise HTTPException(404, {"error": "unknown_optical_scene"})
                png = chipr.render(o["rgb"][o["dates"].index(layer[3:])], "rgb", r, c, half)
                return Response(png, media_type="image/png",
                                headers={"Cache-Control": "public, max-age=31536000, immutable"})
            if layer not in LAYER_ARRAYS:
                raise HTTPException(422, f"layer must be one of {sorted(LAYER_ARRAYS)}")
            kind = "landcover" if layer == "landcover" else layer
            png = chipr.render(aoi.layers[LAYER_ARRAYS[layer]], kind, r, c, half)
        return Response(png, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})

    return app


def app():  # uvicorn --factory siting.api.app:app
    return create_app()
