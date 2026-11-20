"""Experiment (not part of the service): flow-routing HAND (pysheds) vs plain elevation.

Result on 2026-11-14: HAND was NOT better (Ayutthaya AUC 0.68-0.69 vs 0.72). See DESIGN.md section 11.
Needs: pip install pysheds. pysheds still calls np.in1d, removed in NumPy 2, hence the shim below.
Expects raw/ayutthaya_v2/layers.npz and raw/hatyai/layers.npz (DEM) and data/<aoi>/ built.
"""

import numpy as _np

_np.in1d = _np.isin  # pysheds still calls the removed np.in1d
import json

import numpy as np
from affine import Affine
from pysheds.grid import Grid as PG
from pysheds.sview import Raster, ViewFinder
from scipy.stats import rankdata

from siting.core import score as sc


def auc_low(score, y):
    r = rankdata(score)
    n1 = y.sum()
    n0 = len(y) - n1
    return 1 - (r[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)


for n in ("ayutthaya", "hatyai"):
    L = np.load(f"data/{n}/layers.npz")
    m = json.load(open(f"data/{n}/meta.json"))["grid"]
    dem = np.load(f"raw/{'ayutthaya_v2' if n == 'ayutthaya' else 'hatyai'}/layers.npz")["dem"].astype(
        "float32"
    )
    vf = ViewFinder(affine=Affine(*m["affine"]), shape=dem.shape, crs=m["crs"], nodata=np.float32(-9999))
    d = Raster(dem, viewfinder=vf)
    g = PG.from_raster(d)
    pit = g.fill_pits(d)
    dep = g.fill_depressions(pit)
    inf = g.resolve_flats(dep)
    fd = g.flowdir(inf)
    acc = g.accumulation(fd)
    ev = ~L["perm_water"] & np.isin(L["landcover"], sc.ELIGIBLE_LC)
    y = (L["water_freq_wet"] > 0.1)[ev]
    res = {}
    for thr in (50, 200, 1000):
        h = np.array(g.compute_hand(fd, inf, acc > thr))
        h = np.where(np.isfinite(h), h, np.nanmax(h))
        res[thr] = round(auc_low(h[ev], y), 3)
    print(
        n,
        "HAND AUC by stream threshold (cells):",
        res,
        "| plain elevation AUC %.3f" % auc_low(L["elev"][ev], y),
        flush=True,
    )
