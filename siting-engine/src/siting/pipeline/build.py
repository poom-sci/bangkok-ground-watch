"""Build the files the API serves for one AOI.

Input: per-scene VV (dB) stack, DEM and land cover on the same grid.
Output (data/<aoi_id>/): meta.json, layers.npz, scenes.npz

    python -m siting.pipeline.build --raw <dir with out3/y*.npz and layers.npz> \
        --id ayutthaya --name Ayutthaya --out data
"""

from __future__ import annotations

import argparse
import datetime as dt
import glob
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

import numpy as np

from .. import METHOD_VERSION, METHOD_VERSION_VV_ONLY
from ..core import score as sc
from ..core.grid import Grid
from ..core.raster import polygon_mask

ATTRIBUTION = [
    "Contains modified Copernicus Sentinel data (Sentinel-1 RTC via Microsoft Planetary Computer)",
    "Copernicus DEM GLO-30",
    "ESA WorldCover 2021 (CC BY 4.0)",
]


def _code_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], stderr=subprocess.DEVNULL, text=True
        ).strip()
    except Exception:
        return "unknown"


def build_aoi(
    *,
    aoi_id: str,
    name: str,
    grid: Grid,
    db: np.ndarray,
    months: np.ndarray,
    dates: np.ndarray,
    dem: np.ndarray,
    landcover: np.ndarray,
    out_dir: Path,
    source_note: str = "",
    created_at: str | None = None,
    wet_months: tuple = sc.WET_MONTHS,
    scene_source: str = "",
    orbits: np.ndarray | None = None,
    optical: list | None = None,
    fetch_irradiance: bool = False,
    vh: np.ndarray | None = None,
    protected_geojson: list | None = None,
) -> dict:
    """db: (T,H,W) float, NaN = no data. dates: (T,) 'YYYY-MM-DD'."""
    db = db.astype("float32")
    band, thr = (vh.astype("float32"), sc.WATER_VH_DB) if vh is not None else (db, sc.WATER_DB)
    version = METHOD_VERSION if vh is not None else METHOD_VERSION_VV_ONLY
    fw, perm = sc.water_stats(band, months, wet_months, thr)
    elev = sc.smooth_elevation(dem)
    eligible = ~perm & np.isin(landcover, sc.ELIGIBLE_LC)
    edges, p = sc.learn_flood_prob(elev, fw, eligible)
    pf = sc.apply_flood_prob(elev, edges, p)
    years = np.array([int(str(d)[:4]) for d in dates])
    recur = sc.flood_year_share(band, months, years, wet_months, thr)
    f_flood, f_elev = sc.subscores(fw, pf, recur)
    protected = np.zeros(landcover.shape, bool)
    for g in protected_geojson or []:
        protected |= polygon_mask(grid, g)
    excluded = sc.exclusion_mask(landcover, perm, protected)
    score = sc.combine(f_flood, f_elev, excluded)

    wet, dry = sc.season_masks(months, wet_months)
    irradiance = None
    if fetch_irradiance:
        from . import irradiance as irr

        bb = grid.bbox_lonlat()
        try:
            irradiance = irr.fetch((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2)
        except Exception as e:  # network or API trouble must not break the build
            print("irradiance skipped:", e)
    scene_hash = "sha256:" + hashlib.sha256("|".join(map(str, dates)).encode()).hexdigest()
    params = {
        "water_band": "vh" if vh is not None else "vv",
        "water_db": thr,
        "wet_months": list(range(wet_months[0], wet_months[1] + 1)),
        "dry_max_month": sc.DRY_MAX_MONTH,
        "perm_water_share": sc.PERM_WATER_SHARE,
        "w_flood": sc.W_FLOOD,
        "w_elev": sc.W_ELEV,
        "freq_cap": sc.FREQ_CAP,
        "recur_min_scenes": sc.RECUR_MIN_SCENES,
        "recur_cap": sc.RECUR_CAP,
        "bin_m": sc.BIN_M,
        "pixel_m": grid.pixel_m,
    }
    run_id = f"run_{aoi_id}_{version}_{scene_hash[7:15]}"
    meta = {
        "aoi": {"id": aoi_id, "name": name, "bbox": grid.bbox_lonlat()},
        "run_id": run_id,
        "method_version": version,
        "params": params,
        "grid": grid.to_dict(),
        "scene_set_hash": scene_hash,
        "code_sha": _code_sha(),
        "created_at": created_at or dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "scenes_total": len(dates),
        "scenes_wet": int(wet.sum()),
        "scenes_dry": int(dry.sum()),
        "date_range": [str(min(dates)), str(max(dates))],
        "scene_source": scene_source
        or "sentinel-1-rtc, descending, relative orbit 62; wet-season scenes plus first scene of Feb and Mar each year (subset, not every scene)",
        "elev_flood_table": {"edges_m": edges.tolist(), "p_flood": p.tolist()},
        "attribution": ATTRIBUTION,
        "source_note": source_note,
        "irradiance": irradiance,
    }
    if orbits is None:
        orbits = np.array(["descending/62"] * len(dates))
    out_dir = Path(out_dir) / aoi_id
    out_dir.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        out_dir / "layers.npz",
        score=score,
        water_freq_wet=fw,
        perm_water=perm,
        protected=protected,
        elev=elev,
        p_flood=pf,
        flood_year_share=recur,
        f_flood=f_flood,
        f_elev=f_elev,
        landcover=landcover.astype("uint8"),
    )
    scene_arrays: dict[str, Any] = {
        "db": db.astype("float16"),
        "months": months.astype("int8"),
        "dates": dates.astype(str),
        "orbits": np.asarray(orbits).astype(str),
    }
    if vh is not None:
        scene_arrays["vh"] = vh.astype("float16")
    np.savez_compressed(out_dir / "scenes.npz", **scene_arrays)
    if optical:
        optical = sorted(optical, key=lambda o: str(o["date"]))
        np.savez_compressed(
            out_dir / "optical.npz",
            rgb=np.stack([o["rgb"] for o in optical]),
            mndwi=np.stack([o["mndwi"] for o in optical]),
            dates=np.array([str(o["date"]) for o in optical]),
            cloud=np.array([float(o["cloud_aoi"]) for o in optical], "float32"),
        )
        meta["optical"] = [
            {"date": str(o["date"]), "cloud_pct": round(100 * float(o["cloud_aoi"]), 1)} for o in optical
        ]
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


def load_prototype_raw(raw: Path):
    """Read the prototype scratch layout (out3/y*.npz + layers.npz)."""
    dbs, months, dates, grid = [], [], [], None
    for f in sorted(glob.glob(str(raw / "out3" / "y*.npz"))):
        z = np.load(f, allow_pickle=True)
        dbs.append(z["db"].astype("float32"))
        months.append(z["months"])
        dates.append(z["dates"])
        if grid is None:
            grid = Grid.from_affine(z["transform"], str(z["crs"]), *z["db"].shape[1:])
    L = np.load(raw / "layers.npz")
    return (
        grid,
        np.concatenate(dbs),
        np.concatenate(months),
        np.concatenate(dates),
        L["dem"].astype("float32"),
        L["wc"],
    )


def load_geometries(paths) -> list:
    out = []
    for p in paths:
        d = json.loads(Path(p).read_text())
        feats = d["features"] if d.get("type") == "FeatureCollection" else [d]
        out += [f["geometry"] if f.get("type") == "Feature" else f for f in feats]
    return out


def load_optical(raw_dir: Path) -> list:
    out = []
    for f in sorted(glob.glob(str(Path(raw_dir) / "s2" / "*.npz"))):
        z = np.load(f, allow_pickle=True)
        out.append(
            {k: (z[k].item() if z[k].ndim == 0 else z[k]) for k in ("rgb", "mndwi", "date", "cloud_aoi")}
        )
    return out


def load_ingested(specs, bbox_crs_hint=None):
    """specs: list of (raw_dir, 'state/orbit'). Merges several orbits on one grid, sorted by date."""
    parts, grid, layers_file, has_vh = [], None, None, True
    for raw, orbit in specs:
        raw = Path(raw)
        for f in sorted(glob.glob(str(raw / "sar" / "y*.npz"))):
            z = np.load(f, allow_pickle=True)
            g = Grid.from_affine(z["transform"], str(z["crs"]), *z["db"].shape[1:])
            if grid is None:
                grid = g
            elif g != grid:
                raise ValueError(f"grid mismatch in {f}")
            for i in range(z["db"].shape[0]):
                has_vh = has_vh and "vh" in z.files
                parts.append(
                    (
                        str(z["dates"][i]),
                        orbit,
                        int(z["months"][i]),
                        z["db"][i].astype("float32"),
                        z["vh"][i].astype("float32") if "vh" in z.files else None,
                    )
                )
        if layers_file is None:
            layers_file = raw / "layers.npz"
    if grid is None or layers_file is None:
        raise ValueError("no ingested SAR files found; run siting.pipeline.ingest first")
    L = np.load(layers_file)
    parts.sort(key=lambda t: (t[0], t[1]))
    return (
        grid,
        np.stack([p[3] for p in parts]),
        np.array([p[2] for p in parts]),
        np.array([p[0] for p in parts]),
        np.array([p[1] for p in parts]),
        L["dem"].astype("float32"),
        L["wc"],
        np.stack([p[4] for p in parts]) if has_vh else None,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", type=Path, help="prototype scratch layout (Ayutthaya)")
    ap.add_argument(
        "--ingested",
        action="append",
        default=[],
        metavar="DIR:STATE/ORBIT",
        help="output of siting.pipeline.ingest; repeat to merge orbits",
    )
    ap.add_argument("--optical", action="append", default=[], type=Path, help="raw dir holding s2/*.npz")
    ap.add_argument(
        "--protected",
        action="append",
        default=[],
        type=Path,
        help="GeoJSON (Polygon/MultiPolygon, FeatureCollection) of protected areas to exclude",
    )
    ap.add_argument("--irradiance", action="store_true", help="fetch NASA POWER climatology")
    ap.add_argument("--wet", nargs=2, type=int, default=list(sc.WET_MONTHS))
    ap.add_argument("--id", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", default="data", type=Path)
    a = ap.parse_args()
    optical = [o for d in a.optical for o in load_optical(d)]
    protected = load_geometries(a.protected)
    if a.ingested:
        specs = [tuple(x.rsplit(":", 1)) for x in a.ingested]
        grid, db, months, dates, orbits, dem, wc, vh = load_ingested(specs)
        meta = build_aoi(
            aoi_id=a.id,
            name=a.name,
            grid=grid,
            db=db,
            months=months,
            dates=dates,
            dem=dem,
            landcover=wc,
            out_dir=a.out,
            wet_months=tuple(a.wet),
            orbits=orbits,
            optical=optical,
            fetch_irradiance=a.irradiance,
            protected_geojson=protected,
            vh=vh,
            scene_source="sentinel-1-rtc, orbits "
            + ", ".join(sorted({o for _, o in specs}))
            + "; wet-season scenes plus first scene of Feb and Mar each year (subset)",
        )
    else:
        grid, db, months, dates, dem, wc = load_prototype_raw(a.raw)
        meta = build_aoi(
            aoi_id=a.id,
            name=a.name,
            grid=grid,
            db=db,
            months=months,
            dates=dates,
            dem=dem,
            landcover=wc,
            out_dir=a.out,
            wet_months=tuple(a.wet),
            optical=optical,
            fetch_irradiance=a.irradiance,
            protected_geojson=protected,
            source_note="converted from prototype scratch files",
        )
    print(meta["run_id"], "scenes", meta["scenes_total"], "->", a.out / a.id)


if __name__ == "__main__":
    main()
