"""Fetch Sentinel-1 RTC, Copernicus DEM and WorldCover for one AOI from Planetary Computer.

Resumable: each year is saved to <raw>/sar/y<year>.npz as soon as it is done, and
items are re-signed per year because SAS tokens expire after ~45 minutes.

    python -m siting.pipeline.ingest --raw raw/hatyai --bbox 100.35 6.90 100.60 7.12 \
        --orbit descending/164 --wet 10 12 --years 2017 2025
"""

from __future__ import annotations

import argparse
import time
import warnings
from pathlib import Path

import numpy as np

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"


def _catalog():
    import pystac_client

    return pystac_client.Client.open(STAC)


def fetch_sar_year(cat, bbox, year, orbit_state, rel_orbit, wet, crs, res):
    import odc.stac
    import planetary_computer

    items = [
        i
        for i in cat.search(
            collections=["sentinel-1-rtc"], bbox=bbox, datetime=f"{year}-01-01/{year}-12-31"
        ).items()
        if i.properties.get("sat:orbit_state") == orbit_state
        and i.properties.get("sat:relative_orbit") == rel_orbit
    ]
    items.sort(key=lambda i: i.datetime)
    sel = [i for i in items if wet[0] <= i.datetime.month <= wet[1]]
    for m in (2, 3):  # first scene of each dry month, used to find permanent water
        first = [i for i in items if i.datetime.month == m]
        if first:
            sel.append(first[0])
    if not sel:
        return None
    sel = [planetary_computer.sign(i) for i in sel]
    ds = odc.stac.load(
        sel,
        bands=["vv", "vh"],
        bbox=bbox,
        crs=crs,
        resolution=res,
        resampling="average",
        dtype="float32",
        chunks={"x": 512, "y": 512, "time": 1},
        groupby="solar_day",
    )
    ds = ds.compute(scheduler="threads", num_workers=8)

    def to_db(a):
        ok = np.isfinite(a) & (a > 0)
        return np.where(ok, 10 * np.log10(np.where(ok, a, 1)), np.nan).astype("float16")

    db, vh = to_db(ds.vv.values), to_db(ds.vh.values)
    gb = ds.odc.geobox
    return {
        "db": db,
        "vh": vh,
        "months": ds.time.dt.month.values,
        "dates": ds.time.dt.strftime("%Y-%m-%d").values,
        "transform": np.array(gb.transform)[:6],
        "crs": str(gb.crs),
    }


def fetch_layers(cat, bbox, crs, res):
    import odc.stac
    import planetary_computer

    out = {}
    for coll, band, name, dtype, resampling in [
        ("cop-dem-glo-30", "data", "dem", "float32", "average"),
        ("esa-worldcover", "map", "wc", "uint8", "mode"),
    ]:
        items = list(cat.search(collections=[coll], bbox=bbox).items())
        if coll == "esa-worldcover":  # prefer the 2021 (v2.0.0) product
            items = [
                i for i in items if i.properties.get("esa_worldcover:product_version") == "2.0.0"
            ] or items
        items = [planetary_computer.sign(i) for i in items]
        ds = odc.stac.load(
            items, bands=[band], bbox=bbox, crs=crs, resolution=res, resampling=resampling, dtype=dtype
        )
        a = ds[band]
        out[name] = (a.isel(time=0) if "time" in a.dims else a).values
    return out


def ingest(raw: Path, bbox, orbit: str, wet, years, crs="EPSG:32647", res=80):
    warnings.filterwarnings("ignore")
    state, rel = orbit.split("/")
    cat = _catalog()
    (raw / "sar").mkdir(parents=True, exist_ok=True)
    for yr in range(years[0], years[1] + 1):
        fn = raw / "sar" / f"y{yr}.npz"
        if fn.exists():
            continue
        t0 = time.time()
        r, err = None, None
        for attempt in range(3):  # transient blob read errors happen; re-sign and retry
            try:
                r = fetch_sar_year(cat, bbox, yr, state, int(rel), wet, crs, res)
                err = None
                break
            except Exception as e:
                err = e
                print(yr, "attempt", attempt + 1, "failed:", str(e)[:80], flush=True)
                time.sleep(10)
        if err is not None:
            raise err
        if r is None:
            print(yr, "no scenes", flush=True)
            continue
        np.savez(fn, **r)
        print(yr, r["db"].shape, round(time.time() - t0), "s", flush=True)
    if not (raw / "layers.npz").exists():
        np.savez(raw / "layers.npz", **fetch_layers(cat, bbox, crs, res))
        print("layers saved", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--bbox", required=True, nargs=4, type=float, metavar=("W", "S", "E", "N"))
    ap.add_argument("--orbit", required=True, help="e.g. descending/164")
    ap.add_argument("--wet", nargs=2, type=int, default=[8, 11], metavar=("FIRST", "LAST"))
    ap.add_argument("--years", nargs=2, type=int, default=[2017, 2025])
    ap.add_argument("--crs", default="EPSG:32647")
    ap.add_argument("--res", type=int, default=80)
    a = ap.parse_args()
    ingest(a.raw, a.bbox, a.orbit, a.wet, a.years, a.crs, a.res)


if __name__ == "__main__":
    main()


def fetch_pair_sar(cat, bbox, date: str, crs="EPSG:32647", res=80):
    """VV and VH (dB) for every Sentinel-1 RTC item on one calendar date (any orbit), mosaicked."""
    import datetime as dt

    import odc.stac
    import planetary_computer

    d0 = dt.date.fromisoformat(date)
    items = [
        i
        for i in cat.search(
            collections=["sentinel-1-rtc"], bbox=bbox, datetime=f"{d0}/{d0 + dt.timedelta(days=1)}"
        ).items()
        if i.datetime.strftime("%Y-%m-%d") == date
    ]
    if not items:
        return None
    items = [planetary_computer.sign(i) for i in items]
    ds = (
        odc.stac.load(
            items,
            bands=["vv", "vh"],
            bbox=bbox,
            crs=crs,
            resolution=res,
            resampling="average",
            dtype="float32",
            groupby="solar_day",
        )
        .isel(time=0)
        .compute()
    )
    out = {}
    for b in ("vv", "vh"):
        a = ds[b].values
        out[b] = np.where(np.isfinite(a) & (a > 0), 10 * np.log10(np.where(a > 0, a, 1)), np.nan).astype(
            "float16"
        )
    out["date"] = date
    out["orbits"] = ",".join(
        sorted(
            {f"{i.properties.get('sat:orbit_state')}/{i.properties.get('sat:relative_orbit')}" for i in items}
        )
    )
    return out


def main_pairs():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--bbox", required=True, nargs=4, type=float)
    ap.add_argument("--date", required=True, action="append")
    a = ap.parse_args()
    cat = _catalog()
    (a.raw / "pairs").mkdir(parents=True, exist_ok=True)
    for d in a.date:
        r = fetch_pair_sar(cat, a.bbox, d)
        print(d, "no scene" if r is None else r["orbits"], flush=True)
        if r is not None:
            np.savez_compressed(a.raw / "pairs" / f"{d}.npz", **r)
