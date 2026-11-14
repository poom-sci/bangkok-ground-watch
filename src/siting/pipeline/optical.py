"""Sentinel-2 L2A reference scenes on the SAR grid: true-colour for people to look at,
and an MNDWI water mask used to calibrate the SAR water threshold.

    python -m siting.pipeline.optical --raw raw/hatyai --bbox 100.35 6.90 100.60 7.12 \
        --target 2025-11-23 --window 10
Writes raw/<aoi>/s2/<date>.npz
"""
from __future__ import annotations

import argparse
import datetime as dt
import warnings
from pathlib import Path

import numpy as np

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
CLOUDY_SCL = (3, 8, 9, 10)   # cloud shadow, cloud medium/high probability, thin cirrus
NODATA_SCL = (0, 1)          # no data, saturated/defective


def _refl(dn: np.ndarray, baseline: float) -> np.ndarray:
    off = -0.1 if baseline >= 4.0 else 0.0   # processing baseline 04.00+ adds an offset of 1000
    return dn.astype("float32") * 1e-4 + off


def load_date(cat, bbox, date: str, crs: str, res: int):
    """Mosaic of all S2 items on one calendar date, resampled to the SAR grid."""
    import odc.stac
    import planetary_computer
    d0 = dt.date.fromisoformat(date)
    items = list(cat.search(collections=["sentinel-2-l2a"], bbox=bbox,
                            datetime=f"{d0}/{d0 + dt.timedelta(days=1)}").items())
    items = [i for i in items if i.datetime.strftime("%Y-%m-%d") == date]
    if not items:
        return None
    base = min(float(i.properties.get("s2:processing_baseline", "5.0")) for i in items)
    items = [planetary_computer.sign(i) for i in items]
    ds = odc.stac.load(items, bands=["B02", "B03", "B04", "B11", "SCL"], bbox=bbox, crs=crs,
                       resolution=res, groupby="solar_day", dtype="float32",
                       resampling={"SCL": "nearest", "*": "average"}).isel(time=0).compute()
    r, g, b, sw = (_refl(ds[k].values, base) for k in ("B04", "B03", "B02", "B11"))
    scl = np.nan_to_num(ds["SCL"].values, nan=0).astype("uint8")
    with np.errstate(divide="ignore", invalid="ignore"):
        mndwi = (g - sw) / (g + sw)
    rgb = np.clip((np.stack([r, g, b], -1) / 0.3), 0, 1) ** (1 / 2.2)
    bad = np.isin(scl, CLOUDY_SCL + NODATA_SCL)
    return dict(rgb=(rgb * 255).astype("uint8"), mndwi=np.where(bad, np.nan, mndwi).astype("float16"),
                scl=scl, date=date, cloud_aoi=float(np.isin(scl, CLOUDY_SCL).mean()),
                nodata_aoi=float(np.isin(scl, NODATA_SCL).mean()))


def pick_best(cat, bbox, target: str, window: int, crs: str, res: int, tries: int = 4):
    t = dt.date.fromisoformat(target)
    items = list(cat.search(collections=["sentinel-2-l2a"], bbox=bbox,
                            datetime=f"{t - dt.timedelta(days=window)}/{t + dt.timedelta(days=window + 1)}").items())
    by_day: dict[str, float] = {}
    for i in items:
        d = i.datetime.strftime("%Y-%m-%d")
        by_day[d] = min(by_day.get(d, 100.0), i.properties["eo:cloud_cover"])
    cands = sorted(by_day, key=lambda d: (by_day[d], abs((dt.date.fromisoformat(d) - t).days)))[:tries]
    best = None
    for d in cands:
        r = load_date(cat, bbox, d, crs, res)
        if r is None:
            continue
        bad = r["cloud_aoi"] + r["nodata_aoi"]
        if best is None or bad < best[0]:
            best = (bad, r)
    return best[1] if best else None


def main():
    import pystac_client
    warnings.filterwarnings("ignore")
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--bbox", required=True, nargs=4, type=float)
    ap.add_argument("--target", required=True, action="append", help="YYYY-MM-DD; repeat for several")
    ap.add_argument("--window", type=int, default=7)
    ap.add_argument("--crs", default="EPSG:32647")
    ap.add_argument("--res", type=int, default=80)
    a = ap.parse_args()
    cat = pystac_client.Client.open(STAC)
    out = a.raw / "s2"
    out.mkdir(parents=True, exist_ok=True)
    for t in a.target:
        r = pick_best(cat, a.bbox, t, a.window, a.crs, a.res)
        if r is None:
            print(t, "no scene")
            continue
        r["target"] = t
        np.savez_compressed(out / f"{r['date']}.npz", **r)
        print(t, "->", r["date"], "cloud %.0f%% nodata %.0f%%" % (100 * r["cloud_aoi"], 100 * r["nodata_aoi"]), flush=True)


if __name__ == "__main__":
    main()
