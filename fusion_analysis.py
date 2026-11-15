#!/usr/bin/env python3
"""Fusion of the NISAR water masks (L-band HV, 2026) with the Sentinel-1 wet-season water frequency
of the siting engine (C-band VH, 2017 to 2025) on the engine's 80 m Bangkok grid.

Usage:  python fusion_analysis.py            writes app/data/fusion.json and overlays/fusion_agreement.png
        python fusion_analysis.py --check    re-reads both and asserts the invariants
        (run after district_stats.py: the LOS noise block reads app/data/districts.json)

The water masks come from process_to_web.gcov_water, so they are the masks the app shows.
An 80 m cell is valid in a scene when all 4 of its 40 m samples are valid, and water when at
least 2 of the 4 are water. Recurrence = water scenes / valid scenes.
"""
import datetime as dt
import glob
import json
import os
import re
import sys

import numpy as np
import matplotlib.pyplot as plt

from district_stats import district_masks
from process_to_web import TRACK_DIR, WATER_DB, corners_lonlat, gcov_water, load
from pyproj import Transformer

ENGINE = "solsat-siting/data/bangkok"
OUT = "app/data"
PNG = "overlays/fusion_agreement.png"
MIN_SCENES = 8        # a cell needs this many valid NISAR scenes (path 4 alone gives 9)
NISAR_T, S1_T = 0.25, 0.10   # thresholds of the two binary maps
S1_HIGH = 0.10
LABELS = {10: "Tree cover", 20: "Shrubland", 30: "Grassland", 40: "Cropland", 50: "Built-up",
          60: "Bare / sparse vegetation", 80: "Permanent water bodies", 90: "Herbaceous wetland", 95: "Mangroves"}
LEGEND = [("both", "#00c2a8", f"NISAR recurrence >= {NISAR_T} and Sentinel-1 frequency >= {S1_T}"),
          ("nisar_only", "#ffd23f", f"NISAR recurrence >= {NISAR_T}, Sentinel-1 frequency < {S1_T}"),
          ("s1_only", "#e83f9b", f"Sentinel-1 frequency >= {S1_T}, NISAR recurrence < {NISAR_T}"),
          ("perm_water", "#5b7fb5", "permanent water in the Sentinel-1 engine (water in at least half of all scenes)")]
REVIEWER = {"pixels": 485000, "spearman": 0.72, "spearman_districts": 0.90, "kappa": 0.57,
            "cropland_water_pct": {"July": 32, "2026-08-13": 14, "2026-10-24": 31},
            "cropland_dry_pct": 62, "cropland_dry_km2": 30, "cropland_back_pct": 70}


def ranks(x):
    _, inv, cnt = np.unique(x, return_inverse=True, return_counts=True)
    return (np.cumsum(cnt) - (cnt - 1) / 2)[inv]


def spearman(a, b):
    return float(np.corrcoef(ranks(np.asarray(a)), ranks(np.asarray(b)))[0, 1])


def kappa(a, b):
    po = (a == b).mean()
    pe = a.mean() * b.mean() + (1 - a.mean()) * (1 - b.mean())
    return float((po - pe) / (1 - pe))


def pct(n, d):
    return round(100 * float(n) / float(d), 1) if d else None


def build():
    L = np.load(f"{ENGINE}/layers.npz")
    meta = json.load(open(f"{ENGINE}/meta.json"))
    g = meta["grid"]
    a, _, c, _, e, f = g["affine"]
    H, W = g["height"], g["width"]
    freq, perm, lc = L["water_freq_wet"], L["perm_water"], L["landcover"]
    assert freq.shape == (H, W) and a == 80 and e == -80
    cell_km2 = a * a / 1e6

    # NISAR scenes -> engine grid. The alignment is derived from the coordinates, not assumed.
    scenes, V, Wt, offset = [], [], [], None
    for p in sorted(glob.glob("nisar_out/*_GCOV_p*.npz")):
        m = re.match(r"(\d{4}-\d{2}-\d{2})_GCOV_p(\d+)", os.path.basename(p))
        _, valid, water, _, pol, P = gcov_water(load(p, 2048), WATER_DB)
        assert P["epsg"] == 32647 and pol == "HV"
        col, row = np.floor((P["x"] - c) / a).astype(int), np.floor((P["y"] - f) / e).astype(int)
        ci, ri = np.flatnonzero((col >= 0) & (col < W)), np.flatnonzero((row >= 0) & (row < H))
        # every engine cell must hold exactly 2 x 2 NISAR samples, in order
        assert (col[ci] == np.repeat(np.arange(W), 2)).all() and (row[ri] == np.repeat(np.arange(H), 2)).all()
        dx = P["x"][ci].reshape(W, 2).mean(axis=1) - (c + a * (np.arange(W) + 0.5))
        dy = P["y"][ri].reshape(H, 2).mean(axis=1) - (f + e * (np.arange(H) + 0.5))
        assert np.ptp(dx) == 0 and np.ptp(dy) == 0 and abs(dx[0]) <= a / 4 and abs(dy[0]) <= a / 4
        offset = [float(dx[0]), float(dy[0])]
        blk = lambda z: z[ri[0]:ri[-1] + 1, ci[0]:ci[-1] + 1].reshape(H, 2, W, 2).sum(axis=(1, 3))
        v = blk(valid) == 4
        V.append(v)
        Wt.append(v & (blk(water) >= 2))
        scenes.append({"date": m.group(1), "track": f"{TRACK_DIR[int(m.group(2))]}{m.group(2)}"})
    V, Wt = np.array(V), np.array(Wt)
    n = V.sum(axis=0)
    rec = Wt.sum(axis=0) / np.maximum(n, 1)
    common = V.all(axis=0)  # cells valid in every scene of both tracks

    # districts on the engine grid
    x, y = c + a * (np.arange(W) + 0.5), f + e * (np.arange(H) + 0.5)
    xx, yy = np.meshgrid(x, y)
    lon, lat = Transformer.from_crs(32647, 4326, always_xy=True).transform(xx.ravel(), yy.ravel())
    feats = json.load(open(f"{OUT}/bkk_districts.geojson", encoding="utf-8"))["features"]

    # (1) agreement
    M = ~perm & (n >= MIN_SCENES)
    r, s = rec[M], freq[M]
    nb, sb = rec >= NISAR_T, freq >= S1_T
    cls = {"both": M & nb & sb, "nisar_only": M & nb & ~sb, "s1_only": M & ~nb & sb, "neither": M & ~nb & ~sb,
           "perm_water": perm, "no_data": ~perm & ~M}
    districts = []
    for dcode, ix in district_masks(feats, np.asarray(lon), np.asarray(lat)):
        sel = ix[M.ravel()[ix]]
        districts.append({"dcode": dcode, "pixels": int(sel.size),
                          "nisar_recurrence_mean": round(float(rec.ravel()[sel].mean()), 4),
                          "s1_frequency_mean": round(float(freq.ravel()[sel].mean()), 4),
                          "class_pct": {k: round(100 * float(m.ravel()[ix].mean()), 2) for k, m in cls.items()}})
    agreement = {
        "pixels": int(M.sum()),
        "spearman": round(spearman(r, s), 3),
        "nisar_ever_water_pct_where_s1_high": pct((r[s >= S1_HIGH] > 0).sum(), (s >= S1_HIGH).sum()),
        "nisar_ever_water_pct_where_s1_zero": pct((r[s == 0] > 0).sum(), (s == 0).sum()),
        "kappa": round(kappa(r >= NISAR_T, s >= S1_T), 3),
        "kappa_thresholds": f"NISAR recurrence >= {NISAR_T}, Sentinel-1 frequency >= {S1_T}",
        "spearman_districts": round(spearman([d["nisar_recurrence_mean"] for d in districts],
                                             [d["s1_frequency_mean"] for d in districts]), 3),
        "class_pct": {k: pct(cls[k].sum(), M.sum()) for k in ("both", "nisar_only", "s1_only", "neither")},
        "reviewer": REVIEWER,
    }

    # (2) water share per WorldCover class per scene
    codes = [int(k) for k in np.unique(lc) if (lc == k).mean() >= 0.01]
    landcover = []
    for i, sc in enumerate(scenes):
        for k in codes:
            landcover.append({**sc, "class": k, "label": LABELS[k],
                              "water_pct": pct(Wt[i][common & (lc == k)].sum(), (common & (lc == k)).sum()),
                              "water_pct_scene_footprint": pct(Wt[i][V[i] & (lc == k)].sum(), (V[i] & (lc == k)).sum())})

    # (3) cropland: water at the first scene, dry at the minimum, water again at the last scene
    crop = common & (lc == 40)
    cycle = {}
    for t in sorted({sc["track"] for sc in scenes}):
        idx = [i for i, sc in enumerate(scenes) if sc["track"] == t]
        i0, i1 = idx[0], idx[-1]
        im = min(idx, key=lambda i: Wt[i][crop].sum())
        first = crop & Wt[i0]
        dry = first & ~Wt[im]
        back = dry & Wt[i1]
        cycle[t] = {"first_date": scenes[i0]["date"], "min_date": scenes[im]["date"], "last_date": scenes[i1]["date"],
                    "cropland_km2": round(float(crop.sum() * cell_km2), 1),
                    "water_pct": {scenes[i]["date"]: pct(Wt[i][crop].sum(), crop.sum()) for i in (i0, im, i1)},
                    "water_first_km2": round(float(first.sum() * cell_km2), 1),
                    "dry_at_min_km2": round(float(dry.sum() * cell_km2), 1),
                    "dry_at_min_pct": pct(dry.sum(), first.sum()),
                    "water_again_last_km2": round(float(back.sum() * cell_km2), 1),
                    "water_again_last_pct": pct(back.sum(), dry.sum())}

    # B. agreement map on the engine grid (row 0 is north)
    rgba = np.zeros((H, W, 4))
    for name, colour, _ in LEGEND:
        rgba[cls[name]] = [int(colour[j:j + 2], 16) / 255 for j in (1, 3, 5)] + [0.8]
    os.makedirs(f"{OUT}/overlays", exist_ok=True)
    plt.imsave(f"{OUT}/{PNG}", rgba)
    edges_x, edges_y = np.array([c, c + a * W]), np.array([f, f + e * H])  # outer edges of the grid
    overlay = {"image": PNG, "shape": [H, W], "bounds": corners_lonlat(edges_x, edges_y, 32647),
               "legend": [{"class": k, "colour": col, "definition": d} for k, col, d in LEGEND]
               + [{"class": "neither", "colour": None, "definition": "neither radar sees water, or too few NISAR scenes (transparent)"}]}

    # D. LOS noise, from the per-pair district means in districts.json
    D = json.load(open(f"{OUT}/districts.json", encoding="utf-8"))["districts"]
    los = {"odd_even_corr": {}, "pairs": {}}
    for t in sorted({p["track"] for d in D for p in d["los"]}):
        npairs = max(sum(p["track"] == t for p in d["los"]) for d in D)
        rows = [[p["mean_mm"] for p in sorted(d["los"], key=lambda p: p["date"]) if p["track"] == t] for d in D]
        rows = np.array([r for r in rows if len(r) == npairs])
        los["pairs"][t] = npairs
        los["odd_even_corr"][t] = round(float(np.corrcoef(rows[:, 0::2].sum(axis=1), rows[:, 1::2].sum(axis=1))[0, 1]), 3)
    both = np.array([list(d["los_sum_mm"].values()) for d in D if d["los_sum_mm"] and len(d["los_sum_mm"]) == 2])
    los["track_sum_corr"] = round(float(np.corrcoef(both[:, 0], both[:, 1])[0, 1]), 3)
    los["sign_disagree_districts"] = int((np.sign(both[:, 0]) != np.sign(both[:, 1])).sum())
    los["districts_with_both_tracks"] = int(len(both))
    los["note"] = ("Per district, the odd and even pair sums of one track do not agree and the two tracks often "
                   "disagree in sign, so the LOS means are mostly atmosphere and are left out of the district index.")

    dates = lambda t: [sc["date"] for sc in scenes if sc["track"] == t]
    method = {
        "grid": f"siting engine grid, EPSG:32647, {int(a)} m, {H} x {W} cells, {meta['run_id']}",
        "alignment": f"each engine cell holds exactly 2 x 2 NISAR 40 m samples; block centre is offset {offset[0]:+.0f} m east, {offset[1]:+.0f} m north of the cell centre (asserted)",
        "nisar_water": f"HV below {WATER_DB} dB with the noise-floor guard of process_to_web.gcov_water; an 80 m cell is valid when all 4 samples are valid and water when at least 2 are water",
        "nisar_recurrence": "water scenes / valid scenes per cell, all scenes of both tracks",
        "nisar_scenes": {t: {"count": len(dates(t)), "first": dates(t)[0], "last": dates(t)[-1]} for t in cycle},
        "s1_frequency": f"water_freq_wet of the engine: Sentinel-1 VH below {meta['params']['water_db']} dB, {meta['scenes_wet']} wet-season scenes, {meta['date_range'][0]} to {meta['date_range'][1]}",
        "agreement_pixels": f"not permanent water and at least {MIN_SCENES} valid NISAR scenes",
        "thresholds": {"nisar_recurrence": NISAR_T, "s1_frequency": S1_T, "s1_high": S1_HIGH, "min_scenes": MIN_SCENES},
        "landcover": "ESA WorldCover 2021 on the engine grid, classes with at least 1 % of the grid; water_pct is over the cells valid in all scenes of both tracks (the same ground for every date), water_pct_scene_footprint over all valid cells of that scene",
        "cropland": "cropland cells valid in all scenes of both tracks; minimum = the track's scene with the least cropland water",
        "caveats": [
            "Different years and bands: NISAR is one season (2026), Sentinel-1 is 2017 to 2025. Agreement shows where water recurs, not the same floods.",
            "Dark HV is not only water: runways, smooth bare fields and wet smooth soil read as water in both radars.",
            "Path 112 covers the western three quarters of the grid; east of it recurrence rests on the 9 path 4 scenes.",
            "Cropland water on the full path 4 footprint is higher than on the two-track overlap (see water_pct_scene_footprint), because the eastern paddies are outside path 112.",
            "Cropland reading dry in August can be rice canopy closing over standing water, not drainage.",
            "The NISAR block is offset 10 m from the engine cell, an eighth of a cell.",
        ],
    }
    out = {"generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "method": method,
           "agreement": agreement, "landcover_water": landcover, "cropland_cycle": cycle,
           "districts": sorted(districts, key=lambda d: d["dcode"]), "overlay": overlay, "los_noise": los}
    with open(f"{OUT}/fusion.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(json.dumps({k: out[k] for k in ("agreement", "cropland_cycle", "los_noise")}, indent=1))


def check():
    raw = open(f"{OUT}/fusion.json", encoding="utf-8").read()
    assert "NaN" not in raw and chr(8212) not in raw
    F = json.loads(raw)
    A = F["agreement"]
    assert -1 <= A["spearman"] <= 1 and -1 <= A["spearman_districts"] <= 1 and -1 <= A["kappa"] <= 1
    shares = [A["nisar_ever_water_pct_where_s1_high"], A["nisar_ever_water_pct_where_s1_zero"]]
    shares += [r[k] for r in F["landcover_water"] for k in ("water_pct", "water_pct_scene_footprint")]
    for t in F["cropland_cycle"].values():
        shares += [t["dry_at_min_pct"], t["water_again_last_pct"], *t["water_pct"].values()]
        assert t["water_first_km2"] >= t["dry_at_min_km2"] >= t["water_again_last_km2"] >= 0
    assert all(0 <= s <= 100 for s in shares), "share outside 0..100"
    assert abs(sum(A["class_pct"].values()) - 100) < 0.5
    assert len(F["districts"]) == 50 and len({d["dcode"] for d in F["districts"]}) == 50
    for d in F["districts"]:
        assert abs(sum(d["class_pct"].values()) - 100) < 0.5, d["dcode"]
        assert 0 <= d["nisar_recurrence_mean"] <= 1 and 0 <= d["s1_frequency_mean"] <= 1
    assert len(F["overlay"]["bounds"]) == 4
    for lon, lat in F["overlay"]["bounds"]:
        assert 100.2 < lon < 101.1 and 13.4 < lat < 14.1, (lon, lat)
    g = json.load(open(f"{ENGINE}/meta.json"))["grid"]
    img = plt.imread(f"{OUT}/{F['overlay']['image']}")
    assert img.shape == (g["height"], g["width"], 4) and F["overlay"]["shape"] == [g["height"], g["width"]]
    assert {"A112", "D4"} <= set(F["los_noise"]["odd_even_corr"])
    print(f"fusion.json ok: {A['pixels']} pixels, {len(F['districts'])} districts, {len(F['landcover_water'])} class rows, PNG {img.shape}")


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    check() if "--check" in sys.argv else build()
