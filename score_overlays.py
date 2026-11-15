#!/usr/bin/env python3
"""Overlays that make "excluded" and "no signal" visible on the web map.

Usage:  python score_overlays.py            writes app/data/overlays/score_<area>.png,
                                            app/data/overlays/los_nosignal_<track>.png and app/data/score_maps.json
        python score_overlays.py --check    re-reads them and asserts the invariants

Score maps: one pixel per 80 m cell of the siting engine grid. Scored cells use a 5-step ramp,
excluded cells (score is NaN) a flat colour by the first matching reason in EXCLUSIONS.
LOS no-signal: per track, GUNW cells that pass the masking of process_to_web.gunw_mm (the masking
the app shows) in fewer than half of the track's pairs.
"""
import datetime as dt
import glob
import json
import os
import re
import sys

import numpy as np
from PIL import Image

from district_stats import district_masks, lonlat_grid
from process_to_web import TRACK_DIR, corners_lonlat, gunw_mm, load, orient

ENGINE = "solsat-siting/data"
AREAS = ("bangkok", "ayutthaya", "samutsakhon")
OUT = "app/data"
MAX_PX, MIN_COH = 2048, 0.4  # defaults of process_to_web.py, which wrote the manifest
SCORE_ALPHA, EXCLUDED_ALPHA = 0.75, 0.6
# low to high: dark red to pale yellow, lightness rises at every step (reads without hue)
RAMP = [(0, 30, "#6a0d33"), (30, 50, "#b0243f"), (50, 70, "#e2582c"), (70, 85, "#f6a13a"), (85, 100, "#fdeca0")]
BANDS = [("below_50", 0, 50), ("50_to_69", 50, 70), ("70_and_above", 70, 101)]
# (class, colour, label, reason); the first matching class wins
EXCLUSIONS = [
    ("perm_water", "#1c4f9c", "Permanent water", "Water in at least half of all Sentinel-1 scenes, so nothing can be built here."),
    ("water_body", "#56b4e9", "Other water body", "Mapped as water by ESA WorldCover (rivers, canals, ponds, sea)."),
    ("wetland", "#009e8e", "Wetland or mangrove", "Mapped as herbaceous wetland or mangrove by ESA WorldCover and left unscored."),
    ("tree_cover", "#1f6b3b", "Tree cover", "Mapped as tree cover by ESA WorldCover; clearing trees for solar is ruled out."),
    ("protected", "#9a6fd0", "Protected area", "Inside a protected area."),
    ("other", "#8c8c8c", "Not scored", "No score for another reason, for example missing input data."),
]
NOSIGNAL = "#808080"
NOSIGNAL_ALPHA = 0.35


def rgb(h):
    return [int(h[j:j + 2], 16) for j in (1, 3, 5)]


def pct(n, d):
    return round(100 * float(n) / float(d), 2) if d else None


def exclusion_classes(L, nan):
    lc = L["landcover"]
    tests = {"perm_water": L["perm_water"], "water_body": lc == 80, "wetland": (lc == 90) | (lc == 95),
             "tree_cover": lc == 10, "protected": L["protected"], "other": np.ones(nan.shape, bool)}
    left, out = nan.copy(), {}
    for name, *_ in EXCLUSIONS:
        out[name] = left & tests[name]
        left &= ~out[name]
    return out


def score_map(area):
    L = np.load(f"{ENGINE}/{area}/layers.npz")
    g = json.load(open(f"{ENGINE}/{area}/meta.json"))["grid"]
    a, _, c, _, e, f = g["affine"]
    H, W = g["height"], g["width"]
    score = L["score"]
    assert score.shape == (H, W) and a == 80 and e == -80
    nan = np.isnan(score)
    img = np.zeros((H, W, 4), np.uint8)
    for lo, hi, colour in RAMP:
        top = score <= hi if hi == 100 else score < hi
        img[~nan & (score >= lo) & top] = rgb(colour) + [round(255 * SCORE_ALPHA)]
    cls = exclusion_classes(L, nan)
    for name, colour, *_ in EXCLUSIONS:
        img[cls[name]] = rgb(colour) + [round(255 * EXCLUDED_ALPHA)]
    assert (img[..., 3] > 0).all()
    rel = f"overlays/score_{area}.png"
    Image.fromarray(img, "RGBA").save(f"{OUT}/{rel}", optimize=True)
    n, ns = score.size, int((~nan).sum())
    s = score[~nan]
    return {
        "image": rel, "shape": [H, W],
        "bounds": corners_lonlat(np.array([c, c + a * W]), np.array([f, f + e * H]), 32647),  # outer edges
        "shares": {
            "scored_pct": pct(ns, n),
            "excluded_pct": {name: pct(cls[name].sum(), n) for name, *_ in EXCLUSIONS},
            "scored_bands_pct": {k: pct(((s >= lo) & (s < hi)).sum(), ns) for k, lo, hi in BANDS},
            "ramp_pct_of_scored": [pct(((s >= lo) & ((s <= hi) if hi == 100 else (s < hi))).sum(), ns) for lo, hi, _ in RAMP],
        },
    }


def los_nosignal():
    feats = json.load(open(f"{OUT}/bkk_districts.geojson", encoding="utf-8"))["features"]
    valid, grid = {}, {}
    for p in sorted(glob.glob("nisar_out/*_GUNW_p*.npz")):
        path = int(re.search(r"_GUNW_p(\d+)", p).group(1))
        t = f"{TRACK_DIR.get(path, '?')}{path}"
        arrs = load(p, MAX_PX)
        r = gunw_mm(arrs, MIN_COH)
        if not r:
            continue  # not in the manifest either
        d, P, _ = r
        if t in grid:
            assert np.array_equal(P["x"], grid[t]["x"]) and np.array_equal(P["y"], grid[t]["y"]), p
        grid[t] = P
        valid.setdefault(t, []).append(np.isfinite(d))
    out = {}
    for t, V in sorted(valid.items()):
        P, V = grid[t], np.array(V)
        nosig = 2 * V.sum(axis=0) < len(V)  # valid in fewer than half of the pairs
        img = np.zeros(nosig.shape + (4,), np.uint8)
        img[nosig] = rgb(NOSIGNAL) + [round(255 * NOSIGNAL_ALPHA)]
        rel = f"overlays/los_nosignal_{t}.png"
        Image.fromarray(orient(img, P["y"]), "RGBA").save(f"{OUT}/{rel}", optimize=True)
        lon, lat = lonlat_grid(P)
        inside = np.zeros(nosig.size, bool)
        for _, ix in district_masks(feats, lon, lat):
            inside[ix] = True
        out[t] = {"image": rel, "shape": list(nosig.shape), "pairs": len(V),
                  "bounds": corners_lonlat(P["x"], P["y"], P["epsg"]),
                  "nosignal_pct_window": pct(nosig.sum(), nosig.size),
                  "nosignal_pct_bangkok_districts": pct(nosig.ravel()[inside].sum(), inside.sum()),
                  "bangkok_district_cells": int(inside.sum())}
    return out


def build():
    os.makedirs(f"{OUT}/overlays", exist_ok=True)
    out = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "legend": {
            "ramp": [{"min": lo, "max": hi, "range": f"{lo} to {hi if hi == 100 else hi - 1}", "colour": col,
                      "alpha": SCORE_ALPHA} for lo, hi, col in RAMP],
            "ramp_note": "Site suitability score, 0 (poor) to 100 (good). Each step covers min <= score < max; the last step includes 100.",
            "excluded": [{"class": k, "colour": col, "alpha": EXCLUDED_ALPHA, "label": label, "reason": why}
                         for k, col, label, why in EXCLUSIONS],
            "excluded_note": "Excluded cells have no score. A cell is counted under the first reason that applies, in the order listed.",
        },
        "areas": {area: score_map(area) for area in AREAS},
        "los_nosignal": {
            "definition": (f"GUNW cells with a usable line-of-sight value in fewer than half of the track's pairs. Usable means "
                           f"the masking of process_to_web.gunw_mm: coherence at least {MIN_COH}, phase not exactly 0, "
                           "inside the largest connected component of the unwrapping."),
            "colour": NOSIGNAL, "alpha": NOSIGNAL_ALPHA,
            "label": "No usable NISAR signal",
            "reason": "The radar pairs lose coherence here (water, vegetation, fields that change) or the track does not cover the ground.",
            "tracks": los_nosignal(),
        },
    }
    with open(f"{OUT}/score_maps.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(json.dumps({"bangkok": out["areas"]["bangkok"]["shares"],
                      "los": {t: (v["pairs"], v["nosignal_pct_bangkok_districts"], v["nosignal_pct_window"])
                              for t, v in out["los_nosignal"]["tracks"].items()}}, indent=1))


def check_bounds(b):
    assert len(b) == 4
    for lon, lat in b:
        assert 99 < lon < 102 and 6 < lat < 15, (lon, lat)
    (tl, tr, br, bl) = b
    assert tl[0] < tr[0] and bl[0] < br[0] and tl[1] > bl[1] and tr[1] > br[1]


def check():
    raw = open(f"{OUT}/score_maps.json", encoding="utf-8").read()
    assert "NaN" not in raw and chr(8212) not in raw
    S = json.loads(raw)
    assert len(S["legend"]["ramp"]) == 5 and set(S["areas"]) == set(AREAS)
    for area, A in S["areas"].items():
        g = json.load(open(f"{ENGINE}/{area}/meta.json"))["grid"]
        img = np.asarray(Image.open(f"{OUT}/{A['image']}"))
        assert img.shape == (g["height"], g["width"], 4) and A["shape"] == [g["height"], g["width"]], area
        sh = A["shares"]
        assert abs(sh["scored_pct"] + sum(sh["excluded_pct"].values()) - 100) < 0.1, area
        assert abs(sum(sh["scored_bands_pct"].values()) - 100) < 0.1 and abs(sum(sh["ramp_pct_of_scored"]) - 100) < 0.1, area
        # the picture itself must hold the same shares
        assert abs(100 * (img[..., 3] == round(255 * SCORE_ALPHA)).mean() - sh["scored_pct"]) < 0.01, area
        check_bounds(A["bounds"])
    tracks = S["los_nosignal"]["tracks"]
    assert {"A112", "D4"} <= set(tracks)
    for t, T in tracks.items():
        img = np.asarray(Image.open(f"{OUT}/{T['image']}"))
        P = next(iter(load(sorted(glob.glob(f"nisar_out/*_GUNW_p{t[1:]}.npz"))[0], MAX_PX).values()))
        assert img.shape == P["a"].shape + (4,) and T["shape"] == list(P["a"].shape), t
        assert set(np.unique(img[..., 3])) <= {0, round(255 * NOSIGNAL_ALPHA)}
        assert abs(100 * (img[..., 3] > 0).mean() - T["nosignal_pct_window"]) < 0.01, t
        assert 0 <= T["nosignal_pct_bangkok_districts"] <= 100
        check_bounds(T["bounds"])
    print(f"score_maps.json ok: {len(S['areas'])} score maps, {len(tracks)} no-signal masks")


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    check() if "--check" in sys.argv else build()
