"""Pure functions for method 0.1.0 (see DESIGN.md section 5).

Used by both the build pipeline and the API so the numbers shown as evidence
are the same numbers that produced the score.
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import median_filter, uniform_filter

WATER_DB = -15.0           # VV below this counts as water
WET_MONTHS = (8, 11)       # Aug..Nov
DRY_MAX_MONTH = 3          # Feb..Mar scenes are used for permanent water
PERM_WATER_SHARE = 0.5
W_FLOOD, W_ELEV = 0.7, 0.3
FREQ_CAP = 0.3             # freq at/above this gives flood subscore 0
ELIGIBLE_LC = (30, 40, 50)  # grassland, cropland, built-up: used to learn P(flood | elevation)
EXCLUDED_LC = {10: "tree_cover", 80: "water_body", 90: "wetland"}
BIN_M = 0.5
MIN_BIN_N = 200
FLOODED_FREQ = 0.1         # a pixel counts as "flooded" when wet-season freq exceeds this


def season_masks(months: np.ndarray):
    wet = (months >= WET_MONTHS[0]) & (months <= WET_MONTHS[1])
    dry = months <= DRY_MAX_MONTH
    return wet, dry


def water_stats(db: np.ndarray, months: np.ndarray):
    """db: (T,H,W) VV in dB with NaN for no data. Returns (water_freq_wet, permanent_water)."""
    ok = np.isfinite(db)
    water = ok & (db < WATER_DB)
    wet, dry = season_masks(months)
    perm = (water[dry].sum(0) / np.maximum(ok[dry].sum(0), 1)) > PERM_WATER_SHARE
    fw = water[wet].sum(0) / np.maximum(ok[wet].sum(0), 1)
    return fw.astype("float32"), perm


def smooth_elevation(dem: np.ndarray) -> np.ndarray:
    return uniform_filter(median_filter(dem.astype("float32"), 9), 3)


def learn_flood_prob(elev, fw, eligible):
    """P(flooded | elevation bin), non-increasing with height. Returns (edges, p)."""
    y = fw > FLOODED_FREQ
    edges = np.arange(np.floor(elev[eligible].min()), np.ceil(elev[eligible].max()) + BIN_M, BIN_M)
    idx = np.digitize(elev, edges)
    p = np.full(len(edges), np.nan)
    for i in range(1, len(edges) + 1):
        m = (idx == i) & eligible
        if m.sum() > MIN_BIN_N:
            p[i - 1] = y[m].mean()
    for i in range(len(p)):
        if np.isnan(p[i]):
            p[i] = p[i - 1] if i > 0 else np.nanmax(p)
    return edges, np.minimum.accumulate(p)


def apply_flood_prob(elev, edges, p):
    idx = np.digitize(elev, edges)
    return p[np.clip(idx - 1, 0, len(p) - 1)].astype("float32")


def exclusion_mask(landcover: np.ndarray, perm: np.ndarray) -> np.ndarray:
    ex = perm.copy()
    for code in EXCLUDED_LC:
        ex |= landcover == code
    return ex


def subscores(fw, pf):
    f_flood = np.clip(1 - fw / FREQ_CAP, 0, 1)
    f_elev = 1 - pf / max(float(pf.max()), 1e-9)
    return f_flood.astype("float32"), f_elev.astype("float32")


def combine(f_flood, f_elev, excluded):
    score = 100 * (W_FLOOD * f_flood + W_ELEV * f_elev)
    return np.where(excluded, np.nan, score).astype("float32")


def grade(score: float) -> str:
    return "good" if score >= 70 else "fair" if score >= 50 else "poor"
