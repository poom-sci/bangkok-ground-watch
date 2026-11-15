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
NEITHER, NEITHER_ALPHA = "#c8ccd0", 0.18  # faint neutral tint of the "neither" class
# Two-radar water confidence: class id (the B channel of the lookup raster), name, colour, alpha, confidence
DRY_N, DRY_S = 0.05, 0.02   # "confirmed dry" needs NISAR recurrence and Sentinel-1 frequency below these
BLIND = (50, 10)            # built-up and tree cover: both radars miss water under roofs and canopy
VISIBLE = (40, 30, 60)      # cropland, grassland, bare: land cover where radar can see standing water
CLASSES = [(0, "not observed", None, 0.0, None),
           (1, "confirmed wet", "#00c2a8", 0.8, "high"),
           (2, "wet this year only", "#ffd23f", 0.8, "medium"),
           (3, "wet in the record only", "#e83f9b", 0.8, "medium"),
           (4, "confirmed dry", "#c8ccd0", 0.18, "high"),
           (5, "uncertain", "#b39ddb", 0.7, "low"),
           (6, "permanent water", "#5b7fb5", 0.8, None)]
CONF_PNG, LOOKUP_PNG = "overlays/confidence_bangkok.png", "overlays/lookup_bangkok.png"
ELEV_EDGES = [0.5, 1, 1.5, 2, 3, 5]
MIN_BIN = 2000
REVIEWER_ELEV = {"below 1 m": 47, "1 to 2 m": 34, "2 to 3 m": 15, "3 to 5 m": 1.8}
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


def rgb(colour):
    return [int(colour[j:j + 2], 16) / 255 for j in (1, 3, 5)]


def elev_curve(elev, rec, freq, sel, edges):
    """Water against elevation over the cells in sel; bins with under MIN_BIN cells merge into a neighbour."""
    edges = list(edges)
    while True:
        b = np.digitize(elev[sel], edges)
        cnt = np.bincount(b, minlength=len(edges) + 1)
        small = np.flatnonzero(cnt < MIN_BIN)
        if not small.size or not edges:
            break
        edges.pop(min(small[0], len(edges) - 1))
    lim = [None] + edges + [None]
    rows = []
    for i in range(len(edges) + 1):
        r, s = rec[sel][b == i], freq[sel][b == i]
        rows.append({"from_m": lim[i], "to_m": lim[i + 1], "cells": int(r.size),
                     "nisar_recurrence_mean_pct": pct(r.sum(), r.size), "nisar_ever_wet_pct": pct((r > 0).sum(), r.size),
                     "s1_frequency_mean_pct": pct(s.sum(), s.size), "s1_high_pct": pct((s >= S1_HIGH).sum(), s.size)})
    return rows


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
    # "neither" gets a faint tint so analysed dry ground does not look like missing data; no_data stays clear
    rgba[cls["neither"]] = [int(NEITHER[j:j + 2], 16) / 255 for j in (1, 3, 5)] + [NEITHER_ALPHA]
    os.makedirs(f"{OUT}/overlays", exist_ok=True)
    plt.imsave(f"{OUT}/{PNG}", rgba)
    edges_x, edges_y = np.array([c, c + a * W]), np.array([f, f + e * H])  # outer edges of the grid
    overlay = {"image": PNG, "shape": [H, W], "bounds": corners_lonlat(edges_x, edges_y, 32647),
               "legend": [{"class": k, "colour": col, "alpha": 0.8, "definition": d} for k, col, d in LEGEND]
               + [{"class": "neither", "colour": NEITHER, "alpha": NEITHER_ALPHA,
                   "definition": f"analysed, no recurring water in either radar: NISAR recurrence < {NISAR_T} and Sentinel-1 frequency < {S1_T} (faint tint)"},
                  {"class": "no_data", "colour": None, "alpha": 0,
                   "definition": f"not analysed: fewer than {MIN_SCENES} valid NISAR scenes in the cell (transparent)"}]}

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

    # E. two-radar water confidence: one fixed rule per cell, no fitting
    elev = L["elev"]
    dry = (rec < DRY_N) & (freq < DRY_S)
    cid = np.full((H, W), 5, dtype=np.uint8)
    cid[dry] = 4
    cid[~nb & sb] = 3
    cid[nb & ~sb] = 2
    cid[nb & sb] = 1
    cid[~M] = 0
    cid[perm] = 6
    blind = np.isin(lc, BLIND)
    level = np.full((H, W), "none", dtype="U6")
    for i, _, _, _, conf_level in CLASSES:
        if conf_level:
            level[cid == i] = conf_level
    level[(cid == 4) & blind] = "medium"
    rgba = np.zeros((H, W, 4))
    for i, _, colour, alpha, _ in CLASSES:
        if colour:
            rgba[cid == i] = rgb(colour) + [alpha]
    plt.imsave(f"{OUT}/{CONF_PNG}", rgba)
    wet, cdry = cid == 1, cid == 4
    confidence = {
        "image": CONF_PNG, "shape": [H, W], "bounds": overlay["bounds"],
        "legend": [{"id": i, "class": name, "colour": colour, "alpha": alpha, "confidence": conf_level}
                   for i, name, colour, alpha, conf_level in CLASSES],
        "class_pct": {name: round(100 * float((cid == i).mean()), 2) for i, name, *_ in CLASSES},
        "confidence_pct": {k: round(100 * float((level == k).mean()), 2) for k in ("high", "medium", "low", "none")},
        "radar_blind_pct": round(100 * float((blind & M).mean()), 2),
        "class_by_landcover_pct": {name: {LABELS[int(k)]: pct(((cid == i) & (lc == k)).sum(), (cid == i).sum())
                                          for k in np.unique(lc)} for i, name, *_ in CLASSES},
        "sanity": {"confirmed_wet_below_2m_pct": pct((elev[wet] < 2).sum(), wet.sum()),
                   "observed_land_below_2m_pct": pct((elev[M] < 2).sum(), M.sum()),
                   "confirmed_dry_built_up_pct": pct((lc[cdry] == 50).sum(), cdry.sum()),
                   "observed_land_built_up_pct": pct((lc[M] == 50).sum(), M.sum()),
                   "note": "Elevation is not part of the rule. Land cover only sets the radar blind flag, so built-up ground reading dry is expected and is not proof that it stays dry."},
    }

    # F. lookup raster for a tapped point: R = NISAR recurrence, G = Sentinel-1 frequency, B = class id
    look = np.zeros((H, W, 4), dtype=np.uint8)
    look[..., 0] = np.where(M | (perm & (n >= MIN_SCENES)), np.round(rec * 250), 255)
    look[..., 1] = np.round(freq * 250)
    look[..., 2] = cid
    look[..., 3] = 255
    plt.imsave(f"{OUT}/{LOOKUP_PNG}", look)
    # lon/lat -> fractional col,row. Exact = UTM 47N forward, then the affine; fitted here so the browser needs no library.
    lon0, lat0 = float(np.mean(lon)), float(np.mean(lat))
    u, v = np.asarray(lon) - lon0, np.asarray(lat) - lat0
    target = np.c_[(xx.ravel() - c) / a, (yy.ravel() - f) / e]
    fits = {}
    for name, A in (("linear", np.c_[np.ones_like(u), u, v]), ("quadratic", np.c_[np.ones_like(u), u, v, u * u, u * v, v * v])):
        coef, *_ = np.linalg.lstsq(A, target, rcond=None)
        err = float(np.abs(A @ coef - target).max())
        fits[name] = {"col": [float(k) for k in coef[:, 0]], "row": [float(k) for k in coef[:, 1]], "max_error_cells": round(err, 4)}
    use = "linear" if fits["linear"]["max_error_cells"] <= 1 else "quadratic"
    lookup = {
        "image": LOOKUP_PNG, "shape": [H, W], "epsg": 32647, "affine": g["affine"], "bounds": overlay["bounds"],
        "grid": "north-up in UTM zone 47N (EPSG:32647): x = 80 * col + 642560, y = -80 * row + 1545280 at the cell's top-left corner; row 0 is north",
        "channels": {"R": "NISAR recurrence * 250, rounded (0 to 250); 255 = not observed",
                     "G": "Sentinel-1 wet-season water frequency * 250, rounded (0 to 250)",
                     "B": "class id", "A": "255 everywhere, so the PNG is not premultiplied; read it with nearest sampling"},
        "class_ids": {str(i): name for i, name, *_ in CLASSES},
        "confidence_rule": "high for confirmed wet and confirmed dry, medium for the two single-sensor classes, low for uncertain; confirmed dry on built-up or tree cover (radar blind) is capped at medium. The lookup has no land cover channel, so the cap needs the confidence map or a land cover layer.",
        "lonlat_to_cell": {
            "use": use, "lon0": lon0, "lat0": lat0,
            "formula": "u = lon - lon0, v = lat - lat0; linear: k0 + k1*u + k2*v; quadratic adds k3*u*u + k4*u*v + k5*v*v. col and row are fractional: take floor(), outside 0..width-1 / 0..height-1 is off the grid",
            **fits,
            "error_note": "maximum absolute error over all cell centres against pyproj, in cells of 80 m",
        },
    }

    # G. elevation against water (elevation is held out of the confidence rule)
    vis = M & np.isin(lc, VISIBLE)
    coarse = [1, 2, 3, 5]
    elevation_curve = {
        "all_land": elev_curve(elev, rec, freq, M, ELEV_EDGES),
        "radar_visible_land": elev_curve(elev, rec, freq, vis, ELEV_EDGES),
        "radar_visible_classes": [LABELS[k] for k in VISIBLE],
        "reviewer_bins": {"reviewer_pct": REVIEWER_ELEV,
                          "all_land": elev_curve(elev, rec, freq, M, coarse)[:4],
                          "radar_visible_land": elev_curve(elev, rec, freq, vis, coarse)[:4]},
        "cells": f"not permanent water and at least {MIN_SCENES} valid NISAR scenes; bins with fewer than {MIN_BIN} cells are merged into the next bin",
        "caveats": ["The Copernicus DEM is a surface model (roofs and tree tops, not ground) with metre-level error, so bins under 1 m wide blur into each other.",
                    "Built-up and tree cells are radar blind: low water there means the radar cannot see it, not that the ground stays dry.",
                    "NISAR is one season (July to November 2026); Sentinel-1 is 2017 to 2025.",
                    "Low ground here is mostly paddy and fish ponds, so the curve mixes land use with flooding."],
    }

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
        "confidence_rule": {
            "classes": {"confirmed wet": f"NISAR recurrence >= {NISAR_T} and Sentinel-1 frequency >= {S1_T}",
                        "wet this year only": f"NISAR recurrence >= {NISAR_T}, Sentinel-1 frequency < {S1_T}",
                        "wet in the record only": f"Sentinel-1 frequency >= {S1_T}, NISAR recurrence < {NISAR_T}",
                        "confirmed dry": f"NISAR recurrence < {DRY_N} and Sentinel-1 frequency < {DRY_S}",
                        "uncertain": "everything else",
                        "permanent water": "perm_water of the engine, whatever NISAR says",
                        "not observed": f"fewer than {MIN_SCENES} valid NISAR scenes"},
            "confidence": "high = confirmed wet or confirmed dry; medium = wet this year only or wet in the record only; low = uncertain; none = permanent water or not observed",
            "radar_blind": "land cover built-up (50) or tree cover (10): both radars miss water there, so confirmed dry is capped at medium",
            "fitting": "none: fixed thresholds, no model",
        },
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
           "districts": sorted(districts, key=lambda d: d["dcode"]), "overlay": overlay, "los_noise": los,
           "confidence": confidence, "lookup": lookup, "elevation_curve": elevation_curve}
    with open(f"{OUT}/fusion.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(json.dumps({k: out[k] for k in ("agreement", "cropland_cycle", "los_noise")}, indent=1))
    print(json.dumps({"class_pct": confidence["class_pct"], "confidence_pct": confidence["confidence_pct"],
                      "sanity": confidence["sanity"], "lonlat": {k: fits[k]["max_error_cells"] for k in fits},
                      "elevation_curve": elevation_curve}, indent=1))


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
    # confidence map, lookup raster, elevation curve
    C, K, E = F["confidence"], F["lookup"], F["elevation_curve"]
    assert abs(sum(C["class_pct"].values()) - 100) < 0.1 and abs(sum(C["confidence_pct"].values()) - 100) < 0.1
    for name, split in C["class_by_landcover_pct"].items():
        assert C["class_pct"][name] == 0 or abs(sum(split.values()) - 100) < 0.6, name
    assert all(0 <= C["sanity"][k] <= 100 for k in C["sanity"] if k.endswith("_pct"))
    assert plt.imread(f"{OUT}/{C['image']}").shape == img.shape and C["bounds"] == F["overlay"]["bounds"]
    look = np.round(plt.imread(f"{OUT}/{K['image']}") * 255).astype(int)
    assert look.shape == img.shape and (look[..., 3] == 255).all() and K["affine"] == g["affine"]
    ids = {int(k) for k in K["class_ids"]}
    assert set(np.unique(look[..., 2])) <= ids and look[..., 1].max() <= 250
    assert ((look[..., 0] <= 250) | (look[..., 0] == 255)).all() and (look[..., 0][look[..., 2] == 0] == 255).all()
    for i, name in K["class_ids"].items():  # the raster and the reported shares must tell the same story
        assert abs(100 * (look[..., 2] == int(i)).mean() - C["class_pct"][name]) < 0.01, name
    rec, frq, cid = look[..., 0] / 250, look[..., 1] / 250, look[..., 2]
    # R and G are rounded to 1/250, so allow half a step; the class itself must be read from B
    assert (rec[cid == 1] >= 0.248).all() and (frq[cid == 1] >= 0.098).all() and (rec[cid == 4] <= 0.052).all()
    # the published lon/lat formula must land on the right cell at the four corners and the centre
    fit = K["lonlat_to_cell"]
    assert fit[fit["use"]]["max_error_cells"] <= 1
    tr = Transformer.from_crs(32647, 4326, always_xy=True)
    a, _, c, _, e, f = K["affine"]
    for col, row in ((0.5, 0.5), (g["width"] - 0.5, 0.5), (0.5, g["height"] - 0.5), (g["width"] - 0.5, g["height"] - 0.5), (428.5, 342.5)):
        lon, lat = tr.transform(c + a * col, f + e * row)
        u, v = lon - fit["lon0"], lat - fit["lat0"]
        terms = [1, u, v, u * u, u * v, v * v][:len(fit[fit["use"]]["col"])]
        got = [sum(k * t for k, t in zip(fit[fit["use"]][ax], terms)) for ax in ("col", "row")]
        assert abs(got[0] - col) <= 1 and abs(got[1] - row) <= 1, (col, row, got)
    for key in ("all_land", "radar_visible_land"):
        assert all(b["cells"] >= 2000 for b in E[key]) and len(E[key]) >= 3
        assert all(0 <= b[k] <= 100 for b in E[key] for k in b if k.endswith("_pct"))
    assert sum(b["cells"] for b in E["all_land"]) == A["pixels"]
    print(f"fusion.json ok: {A['pixels']} pixels, {len(F['districts'])} districts, {len(F['landcover_water'])} class rows, PNG {img.shape}")


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    check() if "--check" in sys.argv else build()
