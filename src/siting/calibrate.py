"""Compare SAR water rules with Sentinel-2 optical water on near-coincident dates.

    python -m siting.calibrate raw/hatyai data/hatyai
Optical water = MNDWI > 0 on cloud-free pixels. Permanent water is skipped, as in the score.
Pairs come from raw/<aoi>/pairs/<sar date>.npz (VV and VH) and raw/<aoi>/s2/<date>.npz.
"""
from __future__ import annotations

import glob
import sys
from pathlib import Path

import numpy as np

VV_T = list(range(-22, -9))
VH_T = list(range(-30, -15))


def confusion(pred, truth):
    tp = int((pred & truth).sum()); fp = int((pred & ~truth).sum()); fn = int((~pred & truth).sum())
    p = tp / max(tp + fp, 1); r = tp / max(tp + fn, 1)
    return dict(precision=p, recall=r, f1=2 * p * r / max(p + r, 1e-9), iou=tp / max(tp + fp + fn, 1))


def rules(vv, vh):
    """name -> boolean water prediction. Includes the production rule (VV < -15)."""
    out = {f"VV<{t}": vv < t for t in VV_T}
    out.update({f"VH<{t}": vh < t for t in VH_T})
    for tv in (-15, -13):
        for th in (-24, -22, -20):
            out[f"VV<{tv} or VH<{th}"] = (vv < tv) | (vh < th)
    return out


def calibrate(raw: Path, data: Path, max_days: int = 4):
    perm = np.load(data / "layers.npz")["perm_water"]
    s2 = {Path(f).stem: np.load(f) for f in glob.glob(str(raw / "s2" / "*.npz"))}
    rows = []
    for pf in sorted(glob.glob(str(raw / "pairs" / "*.npz"))):
        p = np.load(pf, allow_pickle=True); sd = str(p["date"])
        for od, o in s2.items():
            days = abs(int((np.datetime64(od) - np.datetime64(sd)).astype(int)))
            if days > max_days:
                continue
            vv, vh, m = p["vv"].astype("float32"), p["vh"].astype("float32"), o["mndwi"].astype("float32")
            ok = np.isfinite(vv) & np.isfinite(vh) & np.isfinite(m) & ~perm
            truth = m[ok] > 0
            res = {k: confusion(v[ok] if False else v[ok], truth) for k, v in rules(vv, vh).items()}
            rows.append(dict(sar=sd, optical=od, days=days, orbits=str(p["orbits"]), valid=int(ok.sum()),
                             optical_water_share=float(truth.mean()), rules=res))
    return rows


def main():
    for r in calibrate(Path(sys.argv[1]), Path(sys.argv[2])):
        print(f"S1 {r['sar']} ({r['orbits']}) vs S2 {r['optical']} ({r['days']} d): {r['valid']} px, optical water {100*r['optical_water_share']:.1f}%")
        best = sorted(r["rules"].items(), key=lambda kv: -kv[1]["f1"])[:4]
        for name in ["VV<-15"] + [n for n, _ in best]:
            c = r["rules"][name]
            print(f"   {name:22s} precision {c['precision']:.2f} recall {c['recall']:.2f} F1 {c['f1']:.2f} IoU {c['iou']:.2f}")


if __name__ == "__main__":
    main()
