#!/usr/bin/env python3
"""Per-district summary of the NISAR windows for the Bangkok app: water fraction (GCOV) and
line-of-sight displacement (GUNW) inside each of Bangkok's 50 districts.

Status: runs on the real NISAR windows (Bangkok, 2026-11-14).

Usage:  python district_stats.py --in nisar_out --out app/data
        (run after nisar_fetch.py; uses the same --min-coh / --water-db options as process_to_web.py)

Reads   app/data/bkk_districts.geojson   district boundaries, area, population
        app/data/buildings.json          optional, written by fetch_buildings.py
Writes  app/data/districts.json

What the numbers are, and are not
  water_pct     share of valid GCOV pixels in the district below the water threshold, per date.
                Low HV backscatter also covers runways, wide roads and other smooth ground.
                Dates where under --min-cover percent of the district is inside the valid swath are
                left out (path 112 does not reach the eastern districts).
  los_mean_mm   mean LOS displacement of coherent pixels in the district for ONE 12-day pair, after
                a plane was removed over the whole window. It is relative to the window average,
                not absolute, and still contains atmosphere.
  los_sum_mm    sum of the pair means per track. Only a cumulative value if the pairs are consecutive
                (they are for the 2026-06 to 2026-10 Bangkok pairs: each pair starts where the last ended).
  index         0-100 screening index = mean of the percentile ranks of (highest water share,
                |los_sum_mm|, population density). A way to sort districts, not a risk estimate
                for any building.
"""
import argparse
import datetime as dt
import glob
import json
import os
import re

import numpy as np
from matplotlib.path import Path
from pyproj import Transformer

from process_to_web import TRACK_DIR, WATER_DB, gcov_water, gunw_mm, load


def lonlat_grid(P):
    tr = Transformer.from_crs(P["epsg"], 4326, always_xy=True)
    xx, yy = np.meshgrid(P["x"], P["y"])
    lon, lat = tr.transform(xx.ravel(), yy.ravel())
    return np.asarray(lon), np.asarray(lat)


def district_masks(features, lon, lat):
    """Yield (dcode, flat index array of pixels inside the district outline). Holes are ignored."""
    for f in features:
        ring = np.asarray(f["geometry"]["coordinates"][0])
        x0, y0 = ring.min(axis=0)
        x1, y1 = ring.max(axis=0)
        cand = np.flatnonzero((lon >= x0) & (lon <= x1) & (lat >= y0) & (lat <= y1))
        if cand.size:
            inside = Path(ring).contains_points(np.c_[lon[cand], lat[cand]])
            cand = cand[inside]
        yield f["properties"]["dcode"], cand


def pct_rank(values):
    """Percentile rank 0-100 (ties share the mean rank); None stays None."""
    v = np.array([np.nan if x is None else x for x in values], dtype=float)
    ok = np.isfinite(v)
    out = [None] * len(v)
    if ok.sum() < 2:
        return out
    order = v[ok]
    for i in np.flatnonzero(ok):
        below = (order < v[i]).sum()
        equal = (order == v[i]).sum()
        out[i] = 100.0 * (below + 0.5 * (equal - 1)) / (ok.sum() - 1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="nisar_out")
    ap.add_argument("--out", default="app/data")
    ap.add_argument("--max-px", type=int, default=2048)
    ap.add_argument("--min-coh", type=float, default=0.4)
    ap.add_argument("--water-db", type=float, default=WATER_DB)
    ap.add_argument("--otsu", action="store_true", help="per-scene Otsu threshold instead of --water-db")
    ap.add_argument("--min-pixels", type=int, default=30, help="skip a district/date with fewer usable pixels")
    ap.add_argument("--min-cover", type=float, default=50.0,
                    help="skip a district/date for water if less than this %% of it has valid GCOV pixels")
    a = ap.parse_args()
    if a.otsu:
        a.water_db = None

    gj = json.load(open(os.path.join(a.out, "bkk_districts.geojson"), encoding="utf-8"))
    feats = gj["features"]
    bpath = os.path.join(a.out, "buildings.json")
    buildings = json.load(open(bpath, encoding="utf-8")) if os.path.exists(bpath) else {}
    D = {f["properties"]["dcode"]: {**f["properties"], "buildings": (buildings.get("counts") or {}).get(f["properties"]["dcode"]),
                                    "water": [], "los": []} for f in feats}

    for f in sorted(glob.glob(os.path.join(a.inp, "*.npz"))):
        m = re.match(r"(\d{4}-\d{2}-\d{2})_(GUNW|GCOV)_p(\d+)", os.path.basename(f))
        if not m:
            continue
        date, level, path = m.group(1), m.group(2), int(m.group(3))
        track = f"{TRACK_DIR.get(path, '?')}{path}"
        arrs = load(f, a.max_px)
        if level == "GCOV":
            r = gcov_water(arrs, a.water_db)
            if not r:
                continue
            _, valid, water, thr, pol, P = r
            lon, lat = lonlat_grid(P)
            valid, water = valid.ravel(), water.ravel()
            for dcode, ix in district_masks(feats, lon, lat):
                nv = int(valid[ix].sum())
                if nv < a.min_pixels or 100 * nv < a.min_cover * ix.size:
                    continue  # too little of the district is inside the valid swath for a fair share
                D[dcode]["water"].append({"date": date, "track": track, "pct": round(100 * float(water[ix].sum()) / nv, 2),
                                          "cover_pct": round(100 * nv / ix.size, 1)})
        else:
            r = gunw_mm(arrs, a.min_coh)
            if not r:
                continue
            d, P, _ = r
            lon, lat = lonlat_grid(P)
            d = d.ravel()
            for dcode, ix in district_masks(feats, lon, lat):
                v = d[ix]
                v = v[np.isfinite(v)]
                if v.size < a.min_pixels:
                    continue
                D[dcode]["los"].append({"date": date, "track": track, "mean_mm": round(float(v.mean()), 2),
                                        "p10_mm": round(float(np.percentile(v, 10)), 2),
                                        "p90_mm": round(float(np.percentile(v, 90)), 2),
                                        "coherent_pct": round(100 * v.size / ix.size, 1)})
        print(os.path.basename(f), "ok")

    rows = list(D.values())
    for r in rows:
        r["water_max_pct"] = max((w["pct"] for w in r["water"]), default=None)
        r["water_min_pct"] = min((w["pct"] for w in r["water"]), default=None)
        by_track = {}
        for x in r["los"]:
            by_track.setdefault(x["track"], []).append(x["mean_mm"])
        r["los_sum_mm"] = {t: round(sum(v), 2) for t, v in by_track.items()} or None
        r["los_abs_mm"] = max((abs(v) for v in (r["los_sum_mm"] or {}).values()), default=None)
        r["pop_density"] = round(r["pop"] / r["area_km2"]) if r.get("area_km2") else None
        r["bld_density"] = round(r["buildings"] / r["area_km2"]) if r.get("buildings") and r.get("area_km2") else None
    ranks = [pct_rank([r[k] for r in rows]) for k in ("water_max_pct", "los_abs_mm", "pop_density")]
    for i, r in enumerate(rows):
        parts = [rk[i] for rk in ranks if rk[i] is not None]
        has_sar = ranks[0][i] is not None or ranks[1][i] is not None
        r["index"] = round(sum(parts) / len(parts), 1) if parts and has_sar else None

    out = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": "nisar",
        "options": {"min_coh": a.min_coh, "water_db": a.water_db},
        "buildings_source": buildings.get("source"),
        "districts": sorted(rows, key=lambda r: r["dcode"]),
    }
    with open(os.path.join(a.out, "districts.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    n_w = sum(1 for r in rows if r["water"])
    n_l = sum(1 for r in rows if r["los"])
    print(f"{n_w} districts with water stats, {n_l} with LOS stats -> {os.path.join(a.out, 'districts.json')}")


if __name__ == "__main__":
    main()
