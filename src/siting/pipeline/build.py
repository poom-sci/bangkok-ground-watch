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

import numpy as np

from .. import METHOD_VERSION
from ..core import score as sc
from ..core.grid import Grid

ATTRIBUTION = [
    "Contains modified Copernicus Sentinel data (Sentinel-1 RTC via Microsoft Planetary Computer)",
    "Copernicus DEM GLO-30",
    "ESA WorldCover 2021 (CC BY 4.0)",
]


def _code_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"],
                                       stderr=subprocess.DEVNULL, text=True).strip()
    except Exception:
        return "unknown"


def build_aoi(*, aoi_id: str, name: str, grid: Grid, db: np.ndarray, months: np.ndarray,
              dates: np.ndarray, dem: np.ndarray, landcover: np.ndarray, out_dir: Path,
              source_note: str = "", created_at: str | None = None) -> dict:
    """db: (T,H,W) float, NaN = no data. dates: (T,) 'YYYY-MM-DD'."""
    db = db.astype("float32")
    fw, perm = sc.water_stats(db, months)
    elev = sc.smooth_elevation(dem)
    eligible = ~perm & np.isin(landcover, sc.ELIGIBLE_LC)
    edges, p = sc.learn_flood_prob(elev, fw, eligible)
    pf = sc.apply_flood_prob(elev, edges, p)
    f_flood, f_elev = sc.subscores(fw, pf)
    excluded = sc.exclusion_mask(landcover, perm)
    score = sc.combine(f_flood, f_elev, excluded)

    wet, dry = sc.season_masks(months)
    scene_hash = "sha256:" + hashlib.sha256("|".join(map(str, dates)).encode()).hexdigest()
    params = {"water_db": sc.WATER_DB, "wet_months": list(range(sc.WET_MONTHS[0], sc.WET_MONTHS[1] + 1)),
              "dry_max_month": sc.DRY_MAX_MONTH, "perm_water_share": sc.PERM_WATER_SHARE,
              "w_flood": sc.W_FLOOD, "w_elev": sc.W_ELEV, "freq_cap": sc.FREQ_CAP,
              "bin_m": sc.BIN_M, "pixel_m": grid.pixel_m}
    run_id = "run_%s_%s_%s" % (aoi_id, METHOD_VERSION, scene_hash[7:15])
    meta = {
        "aoi": {"id": aoi_id, "name": name, "bbox": grid.bbox_lonlat()},
        "run_id": run_id, "method_version": METHOD_VERSION, "params": params,
        "grid": grid.to_dict(), "scene_set_hash": scene_hash, "code_sha": _code_sha(),
        "created_at": created_at or dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "scenes_total": int(len(dates)), "scenes_wet": int(wet.sum()), "scenes_dry": int(dry.sum()),
        "date_range": [str(min(dates)), str(max(dates))],
        "scene_source": "sentinel-1-rtc, descending, relative orbit 62; wet-season scenes plus first scene of Feb and Mar each year (subset, not every scene)",
        "elev_flood_table": {"edges_m": edges.tolist(), "p_flood": p.tolist()},
        "attribution": ATTRIBUTION, "source_note": source_note,
    }
    out_dir = Path(out_dir) / aoi_id
    out_dir.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out_dir / "layers.npz", score=score, water_freq_wet=fw, perm_water=perm,
                        elev=elev, p_flood=pf, f_flood=f_flood, f_elev=f_elev,
                        landcover=landcover.astype("uint8"))
    np.savez_compressed(out_dir / "scenes.npz", db=db.astype("float16"),
                        months=months.astype("int8"), dates=dates.astype(str))
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
    return (grid, np.concatenate(dbs), np.concatenate(months), np.concatenate(dates),
            L["dem"].astype("float32"), L["wc"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--id", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", default="data", type=Path)
    a = ap.parse_args()
    grid, db, months, dates, dem, wc = load_prototype_raw(a.raw)
    meta = build_aoi(aoi_id=a.id, name=a.name, grid=grid, db=db, months=months, dates=dates,
                     dem=dem, landcover=wc, out_dir=a.out,
                     source_note="converted from prototype scratch files")
    print(meta["run_id"], "scenes", meta["scenes_total"], "->", a.out / a.id)


if __name__ == "__main__":
    main()
