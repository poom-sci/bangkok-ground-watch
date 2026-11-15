#!/usr/bin/env python3
"""Turn the .npz windows written by nisar_fetch.py into web overlays (PNG + manifest.json)
for app/index.html.

Status: runs on real NISAR windows (17 GUNW pairs and GCOV HV, Bangkok, 2026-11-14). The LOS sign
convention is still NOT confirmed against the NISAR product docs.

Usage:  python process_to_web.py --in nisar_out --out app/data
        python process_to_web.py --in nisar_out --out app/data --water-db -20 --mm-range 30

What it does
  GUNW  unwrapped phase -> line-of-sight (LOS) displacement in mm (L-band, 0.2384 m),
        masks pixels with coherence < --min-coh, pixels where the phase is exactly 0 (the GUNW mask
        marks those as invalid samples: subswath gaps and swath edges) and pixels outside the largest
        connected component of the unwrapping, then removes a best-fit plane (orbit/atmosphere ramp)
        -> NOTE: the plane removal also removes any real long-wavelength signal across the window.
  GCOV  HV (else HH) backscatter -> dB image, plus a water mask: HV below --water-db (default
        -19 dB, see WATER_DB; --otsu switches to a per-scene Otsu threshold, which reads too high here).
"""
import argparse
import datetime as dt
import glob
import json
import math
import os
import re
import warnings

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from pyproj import Transformer  # noqa: E402

WAVELENGTH_M = 0.2384  # NISAR L-band (~1.257 GHz)
TRACK_DIR = {112: "A", 4: "D"}  # ascending / descending for the Bangkok frames found on ASF
META_SUFFIXES = ("__x", "__y", "__epsg")
FLOOR_DB = -32.0  # the HV noise floor over open sea is about -25 dB; nothing real sits 7 dB below it
# Water threshold on HV, checked on 8 real Bangkok scenes (2026-09-18 to 2026-11-12, both tracks):
# the histogram has a noise-floor mode at -23.5 dB (open sea: mean -24 to -25, sd 1 dB) and a land
# mode at -12 dB, with the valley at -19 +/- 0.25 dB in every scene. Otsu lands at -16.3 to -16.7,
# on the land side: the pixels it adds between -19 and -16.6 have HH near -10 dB (open sea: -15.5),
# so they are not open water. At -19 dense inner districts read 0.0 to 0.4 % and Bang Khun Thian
# matches the static water flag of the GUNW mask (33 %). Still flagged at any threshold: runways,
# and farm fields that are as dark as the sea in HV and HH (flooded or very smooth, cannot tell).
WATER_DB = -19.0
EDGE_GUARD_M = 6000.0  # width of the faded strip next to the no-signal band (measured against path 4)


def load(path, max_px):
    """Load an npz and decimate each raster so its longest side is <= max_px."""
    z = np.load(path)
    arrs = {}
    for k in z.files:
        if k.endswith(META_SUFFIXES):
            continue
        a = z[k]
        s = max(1, math.ceil(max(a.shape) / max_px))
        arrs[k] = {
            "a": a[::s, ::s],
            "x": z[k + "__x"][::s],
            "y": z[k + "__y"][::s],
            "epsg": int(z[k + "__epsg"]),
        }
    return arrs


def pick(arrs, suffix):
    for k in arrs:
        if k.endswith(suffix):
            return k
    return None


def corners_lonlat(x, y, epsg):
    """Image corners [TL, TR, BR, BL] as [lon, lat] for MapLibre's image source."""
    tr = Transformer.from_crs(epsg, 4326, always_xy=True)
    x0, x1, y0, y1 = float(x.min()), float(x.max()), float(y.min()), float(y.max())
    return [list(tr.transform(x0, y1)), list(tr.transform(x1, y1)),
            list(tr.transform(x1, y0)), list(tr.transform(x0, y0))]


def orient(a, y):
    """Web images need north at the top; flip if y increases with row index."""
    return a[::-1] if y[0] < y[-1] else a


def otsu(v, bins=256):
    h, e = np.histogram(v, bins=bins)
    c = (e[:-1] + e[1:]) / 2
    w0 = np.cumsum(h)
    w1 = w0[-1] - w0
    s = np.cumsum(h * c)
    m0 = s / np.maximum(w0, 1)
    m1 = (s[-1] - s) / np.maximum(w1, 1)
    return float(c[np.argmax(w0 * w1 * (m0 - m1) ** 2)])


def save_rgba(path, rgba):
    plt.imsave(path, np.clip(rgba, 0, 1))


def gunw_mm(arrs, min_coh):
    """LOS displacement (mm, plane removed, NaN where masked). Returns (d, grid, coherent_fraction) or None."""
    kp = pick(arrs, "unwrappedPhase")
    if not kp:
        return None
    P = arrs[kp]
    ph = P["a"].astype("float64")
    ph[~np.isfinite(ph) | (ph == 0)] = np.nan
    good = np.isfinite(ph)
    kc = kp.rsplit("_", 1)[0] + "_coherenceMagnitude"  # same group as the phase (80 m grid)
    kc = kc if kc in arrs else pick(arrs, "coherenceMagnitude")
    if kc and arrs[kc]["a"].shape == ph.shape:
        good &= arrs[kc]["a"] >= min_coh
    kk = kp.rsplit("_", 1)[0] + "_connectedComponents"
    if kk in arrs and arrs[kk]["a"].shape == ph.shape:
        # component 0 = not reliably unwrapped. Separate components can differ by whole phase
        # cycles (119 mm at L-band), so keep only the largest one.
        cc = arrs[kk]["a"]
        ids, n = np.unique(cc[good & (cc > 0)], return_counts=True)
        if ids.size:
            good &= cc == ids[np.argmax(n)]
    if good.sum() < 100:
        return None
    # LOS displacement, mm. Positive = range increase (away from satellite), the common
    # ISCE/HyP3 convention; NOT yet confirmed against the NISAR GUNW spec, so verify before
    # interpreting subsidence vs uplift.
    d = ph * WAVELENGTH_M / (4 * math.pi) * 1000.0
    yy, xx = np.mgrid[0:d.shape[0], 0:d.shape[1]]
    idx = np.flatnonzero(good)
    sel = np.random.default_rng(0).choice(idx, min(idx.size, 200000), replace=False)
    A = np.c_[xx.ravel()[sel], yy.ravel()[sel], np.ones(sel.size)]
    coef, *_ = np.linalg.lstsq(A, d.ravel()[sel], rcond=None)
    d = d - (coef[0] * xx + coef[1] * yy + coef[2])
    d[~good] = np.nan
    return d, P, float(good.mean())


def _box_count(mask, r):
    """Number of True pixels in the (2r+1) x (2r+1) window around each pixel."""
    n = mask.astype(np.int32)
    for ax in (0, 1):
        pad = [(r + 1, r) if i == ax else (0, 0) for i in (0, 1)]
        c = np.cumsum(np.pad(n, pad), axis=ax)
        size = n.shape[ax]
        n = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + size), axis=ax) - np.take(c, np.arange(size), axis=ax)
    return n


def gcov_water(arrs, water_db):
    """Backscatter in dB and a water mask. Returns (db, valid, water, threshold_db, pol, grid) or None."""
    k = pick(arrs, "HVHV") or pick(arrs, "HHHH")
    if not k:
        return None
    P = arrs[k]
    p = P["a"].astype("float64")
    valid = np.isfinite(p) & (p > 0)
    if valid.sum() < 100:
        return None
    db = np.full(p.shape, np.nan)
    db[valid] = 10 * np.log10(p[valid])
    # Seen on the real path 112 files: east of the valid swath the power is stored as about 1e-14
    # (-135 dB) instead of NaN, and for about 6 km before that band the backscatter fades towards
    # the noise floor (3 to 15 dB lower than the path 4 pass over the same ground). Both would
    # read as water, so drop everything below the floor and a guard strip next to that band.
    dead = valid & (db < FLOOR_DB)
    if dead.any():
        band = _box_count(dead, 5) > 60  # more than half of an 11 x 11 window: not a lone dark pixel
        guard = int(round(EDGE_GUARD_M / abs(float(P["x"][1] - P["x"][0]))))
        valid &= ~dead & (_box_count(band, guard) == 0)
        db[~valid] = np.nan
    if valid.sum() < 100:
        return None
    thr = water_db if water_db is not None else otsu(np.clip(db[valid], -35, 0))
    water = valid & (db < thr)
    return db, valid, water, float(thr), ("HV" if k.endswith("HVHV") else "HH"), P


def process_gunw(arrs, out_png, mm_range, min_coh):
    r = gunw_mm(arrs, min_coh)
    if not r:
        return None
    d, P, coh = r
    rgba = plt.cm.coolwarm((d + mm_range) / (2 * mm_range))
    rgba[..., 3] = np.where(np.isfinite(d), 0.85, 0.0)
    save_rgba(out_png, orient(rgba, P["y"]))
    p2, p98 = np.nanpercentile(d, [2, 98])
    return {
        "bounds": corners_lonlat(P["x"], P["y"], P["epsg"]),
        "stats": {"p2_mm": round(float(p2), 1), "p98_mm": round(float(p98), 1),
                  "coherent_pct": round(100 * coh, 1)},
    }


def process_gcov(arrs, out_db, out_water, water_db):
    r = gcov_water(arrs, water_db)
    if not r:
        return None
    db, valid, water, thr, pol, P = r
    lo, hi = np.nanpercentile(db, [2, 98])
    # The grey backscatter picture is only a backdrop, so shrink it to about 1000 px (block mean of
    # dB) to keep the PNG near 1 MB. The water mask below stays at the full resolution of the window.
    f = max(1, math.ceil(max(db.shape) / 1100))
    h, w = (db.shape[0] // f) * f, (db.shape[1] // f) * f
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # blocks with no valid pixel stay NaN
        pic = np.nanmean(db[:h, :w].reshape(h // f, f, w // f, f), axis=(1, 3))
    rgba = plt.cm.gray(np.clip((np.nan_to_num(pic, nan=lo) - lo) / (hi - lo), 0, 1))
    rgba[..., 3] = np.where(np.isfinite(pic), 1.0, 0.0)
    save_rgba(out_db, orient(rgba, P["y"]))
    w = np.zeros(db.shape + (4,))
    w[..., 2] = 1.0
    w[..., 1] = 0.55
    w[..., 3] = np.where(water, 0.65, 0.0)
    save_rgba(out_water, orient(w, P["y"]))
    return {
        "bounds": corners_lonlat(P["x"], P["y"], P["epsg"]),
        "pol": pol,
        "threshold_db": round(thr, 1),
        "stats": {"water_pct": round(100 * float(water.sum() / valid.sum()), 1)},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="nisar_out")
    ap.add_argument("--out", default="app/data")
    ap.add_argument("--max-px", type=int, default=2048, help="rasters longer than this are subsampled")
    ap.add_argument("--mm-range", type=float, default=20.0)
    ap.add_argument("--min-coh", type=float, default=0.4)
    ap.add_argument("--water-db", type=float, default=WATER_DB, help="fixed water threshold in dB")
    ap.add_argument("--otsu", action="store_true", help="use a per-scene Otsu threshold instead of --water-db")
    a = ap.parse_args()
    if a.otsu:
        a.water_db = None

    os.makedirs(os.path.join(a.out, "overlays"), exist_ok=True)
    gpath = os.path.join(a.inp, "granules.json")  # tag -> source file name, written by nisar_fetch.py
    granules = json.load(open(gpath)) if os.path.exists(gpath) else {}
    layers = []
    for f in sorted(glob.glob(os.path.join(a.inp, "*.npz"))):
        m = re.match(r"(\d{4}-\d{2}-\d{2})_(GUNW|GCOV)_p(\d+)", os.path.basename(f))
        if not m:
            continue
        date, level, path = m.group(1), m.group(2), int(m.group(3))
        track = f"{TRACK_DIR.get(path, '?')}{path}"
        base = f"{date}_{level}_p{path}"
        arrs = load(f, a.max_px)
        extra = {}
        if base in granules:
            extra["granule"] = granules[base]
            days = re.findall(r"_(\d{4})(\d{2})(\d{2})T\d{6}", granules[base])
            if level == "GUNW" and len(days) >= 4:
                # "date" is the reference (first) acquisition of the pair; the name holds both
                extra["ref_date"], extra["sec_date"] = "-".join(days[0]), "-".join(days[2])
        print(base, "->", end=" ")
        if level == "GUNW":
            rel = f"overlays/{base}_los.png"
            r = process_gunw(arrs, os.path.join(a.out, rel), a.mm_range, a.min_coh)
            if r:
                layers.append({"type": "gunw", "date": date, "track": track, "image": rel, **r, **extra})
        else:
            rd, rw = f"overlays/{base}_db.png", f"overlays/{base}_water.png"
            r = process_gcov(arrs, os.path.join(a.out, rd), os.path.join(a.out, rw), a.water_db)
            if r:
                layers.append({"type": "gcov", "date": date, "track": track, "image": rd, **r, **extra})
                layers.append({"type": "water", "date": date, "track": track, "image": rw, **r, **extra})
        print("ok" if r else "skipped (missing bands or too little valid data)")

    manifest = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "display_range_mm": a.mm_range,
        "wavelength_m": WAVELENGTH_M,
        "layers": sorted(layers, key=lambda L: (L["type"], L["track"], L["date"])),
    }
    with open(os.path.join(a.out, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=1)
    print(f"{len(layers)} layers -> {os.path.join(a.out, 'manifest.json')}")


if __name__ == "__main__":
    main()
