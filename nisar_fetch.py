#!/usr/bin/env python3
"""Fetch a small Bangkok-area window from NISAR L-band GUNW / GCOV products
without downloading the whole multi-GB HDF5 files (reads only the needed chunks).

Layout (checked on real files, 2026-11-14):
  GCOV: /science/LSAR/GCOV/grids/frequencyA/{HHHH,HVHV,...}, gamma-0 power, with xCoordinates,
        yCoordinates and `projection` (EPSG code) in the same group.
  GUNW: /science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/HH/{unwrappedPhase,
        coherenceMagnitude,connectedComponents} on an 80 m grid (a 20 m coherence also exists
        under wrappedInterferogram and is skipped).
The script goes straight to these paths (KNOWN) and only walks the file if none of them exist.
The link to the archive is the bottleneck (about 1 MB/s from Bangkok, 2 s per request), so
metadata is read through a small block cache and the pixel chunks of the window are fetched in
parallel as exact byte ranges and decoded here.
Granules whose .npz already exists are skipped; --workers N reads N granules at once.

Setup:   pip install asf_search earthaccess h5py numpy pyproj matplotlib
Auth:    create an Earthdata Login account, then either
           export EARTHDATA_TOKEN=<token from urs.earthdata.nasa.gov -> Generate Token>
         or just run the script and log in when earthaccess prompts.
Usage:   python nisar_fetch.py --list-only
         python nisar_fetch.py --levels GUNW --paths 112 4               # all GUNW, both tracks
         python nisar_fetch.py --levels GCOV --paths 112 4 --limit 4 --stride 4
         (GCOV frequencyA is a 10 m grid: the Bangkok window is 7244 x 8158 px and about 140 MiB
          per layer, so only HVHV is read by default; --stride 4 stores it as 40 m, 1811 x 2039 px.)
         (--limit N = the N most recent granules per level and path; 0 = all.
          --stride N averages NxN blocks of GCOV power (multilook) and subsamples everything else.)
         python nisar_fetch.py --levels GUNW --paths 112 --limit 1 --full-download   # whole file (~2 GB)
"""
import argparse
import json
import os
import sys
import time

import numpy as np

try:
    import asf_search as asf
except ImportError:
    sys.exit("pip install asf_search earthaccess h5py numpy pyproj matplotlib")

# lon_min, lat_min, lon_max, lat_max: Bangkok + Samut Prakan + Samut Sakhon
DEFAULT_AOI = (100.20, 13.40, 100.95, 14.05)


def search(levels, paths, start):
    res = asf.search(
        dataset="NISAR",
        processingLevel=levels,
        intersectsWith="POINT(100.5 13.75)",
        start=start,
        maxResults=500,
    )
    # One granule per (date, level, path): ASF lists reprocessed versions (_001/_002) and
    # urgent-response (UR) copies next to the provisional (PR) ones. Last one wins: PR over UR,
    # then the highest version.
    best = {}
    for r in sorted(res, key=lambda r: ("_PR_" in r.properties["fileName"], r.properties["fileName"])):
        p = r.properties
        if p.get("pathNumber") in paths:
            best[(p["startTime"][:10], p["processingLevel"], p["pathNumber"])] = r
    return sorted(best.values(), key=lambda r: r.properties["startTime"])


WANTED = {"unwrappedPhase", "coherenceMagnitude", "connectedComponents",
          "HHHH", "HVHV", "VVVV", "VHVH"}
POWER = {"HHHH", "HVHV", "VVVV", "VHVH"}
KNOWN = {
    "GUNW": [f"science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/{pol}/{v}"
             for pol in ("HH", "VV") for v in ("unwrappedPhase", "coherenceMagnitude", "connectedComponents")],
    "GCOV": [f"science/LSAR/GCOV/grids/frequencyA/{v}" for v in ("HHHH", "HVHV", "VVVV", "VHVH")],
}


def _walk_datasets(h5):
    """Slow fallback: visit every object in the file (many remote round trips)."""
    found = []

    def cb(name, obj):
        if hasattr(obj, "shape") and len(obj.shape) == 2:
            found.append(name)

    h5.visititems(cb)
    return found


def _dataset_names(h5, level, pols=None):
    names = [n for n in KNOWN.get(level, []) if n in h5]
    if level == "GCOV" and pols:
        # each GCOV layer of the Bangkok window is about 140 MiB on the wire, so take only what
        # the water mask uses; if none of the requested layers exist, take the first one there is
        names = [n for n in names if n.rsplit("/", 1)[-1] in pols] or names[:1]
    if names:
        return names
    print("  known dataset paths not found, walking the file (slow)")
    out = []
    for name in _walk_datasets(h5):
        leaf = name.split("/")[-1]
        if leaf not in WANTED:
            continue
        # GUNW has coherence at 20 m (wrappedInterferogram) and 80 m (unwrappedInterferogram,
        # same grid as unwrappedPhase). Keep only the unwrapped group so the shapes match.
        if leaf in ("coherenceMagnitude", "connectedComponents") and "unwrappedInterferogram/" not in name:
            continue
        out.append(name)
    return out


def _lookup_up(h5, ds_name, key):
    """Find `key` in the dataset's parent groups, nearest first."""
    parts = ds_name.split("/")[:-1]
    while parts:
        grp = h5["/".join(parts)]
        if key in grp:
            return grp[key]
        parts.pop()
    return h5[key] if key in h5 else None


def _block_mean(a, s):
    """Average s x s blocks (multilook), ignoring NaN. Trailing rows/cols that do not fill a block are dropped."""
    import warnings

    h, w = (a.shape[0] // s) * s, (a.shape[1] // s) * s
    blocks = a[:h, :w].reshape(h // s, s, w // s, s)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN blocks stay NaN
        return np.nanmean(blocks, axis=(1, 3)).astype(a.dtype)


def _read_chunks(ds, sy, sx, fs, url):
    """ds[sy, sx], but the raw chunks are fetched in parallel as exact byte ranges and decoded here
    (gzip + shuffle only). The link to the archive is slow, so this avoids both the one-by-one chunk
    reads of h5py and the over-read of block caching. Returns None if the layout is something else."""
    import zlib

    import h5py

    if ds.chunks is None or ds.ndim != 2:
        return None
    plist = ds.id.get_create_plist()
    filters = [plist.get_filter(i)[0] for i in range(plist.get_nfilters())]
    if any(f not in (h5py.h5z.FILTER_DEFLATE, h5py.h5z.FILTER_SHUFFLE) for f in filters):
        return None
    ch, cw = ds.chunks
    todo = []
    for r in range(sy.start // ch, (sy.stop - 1) // ch + 1):
        for c in range(sx.start // cw, (sx.stop - 1) // cw + 1):
            try:
                info = ds.id.get_chunk_info_by_coord((r * ch, c * cw))
            except Exception:
                continue  # chunk never written: stays at the fill value
            if info.byte_offset is not None and info.size:
                todo.append((r, c, info))
    out = np.full((sy.stop - sy.start, sx.stop - sx.start), ds.fillvalue, ds.dtype)
    t0 = time.time()
    for b in range(0, len(todo), 32):  # batches keep memory flat and show progress on big windows
        part = todo[b: b + 32]
        starts = [i.byte_offset for _, _, i in part]
        ends = [i.byte_offset + i.size for _, _, i in part]
        blobs = fs.cat_ranges([url] * len(part), starts, ends, batch_size=8, on_error="return")
        for (r, c, info), raw, b0, b1 in zip(part, blobs, starts, ends):
            if isinstance(raw, Exception):
                raw = fs.cat_file(url, start=b0, end=b1)  # one retry; a second failure fails the granule
            for i in reversed(range(len(filters))):  # undo the write pipeline, last filter first
                if info.filter_mask >> i & 1:
                    continue  # this filter was skipped for this chunk
                if filters[i] == h5py.h5z.FILTER_DEFLATE:
                    raw = zlib.decompress(raw)
                else:  # shuffle: bytes are stored grouped by byte position
                    raw = np.frombuffer(raw, np.uint8).reshape(ds.dtype.itemsize, -1).T.tobytes()
            chunk = np.frombuffer(raw, ds.dtype).reshape(ch, cw)
            y0, x0 = r * ch, c * cw
            ya, yb = max(sy.start, y0), min(sy.stop, y0 + ch)
            xa, xb = max(sx.start, x0), min(sx.stop, x0 + cw)
            out[ya - sy.start: yb - sy.start, xa - sx.start: xb - sx.start] = chunk[ya - y0: yb - y0, xa - x0: xb - x0]
        if len(todo) > 64:
            print(f"    {ds.name.rsplit('/', 1)[-1]} {min(b + 32, len(todo))}/{len(todo)} chunks, "
                  f"{sum(i.size for _, _, i in todo[: b + 32]) / 2 ** 20:.0f} MiB, {time.time() - t0:.0f} s", flush=True)
    return out


def read_window(h5, aoi, level, stride, fs=None, url=None, pols=None):
    from pyproj import Transformer

    lon0, lat0, lon1, lat1 = aoi
    arrays = {}
    grids = {}  # parent group -> (x, y, epsg, x slice, y slice); coordinates are read once per group
    for name in _dataset_names(h5, level, pols):
        ds = h5[name]
        parent = name.rsplit("/", 1)[0]
        if parent not in grids:
            xs = _lookup_up(h5, name, "xCoordinates")
            ys = _lookup_up(h5, name, "yCoordinates")
            proj = _lookup_up(h5, name, "projection")
            if xs is None or ys is None or proj is None:
                print(f"  skip {name}: no coordinates/projection found")
                grids[parent] = None
                continue
            epsg = int(proj.attrs.get("epsg_code", proj[()]))
            tr = Transformer.from_crs(4326, epsg, always_xy=True)
            cx, cy = zip(*[tr.transform(lo, la) for lo in (lon0, lon1) for la in (lat0, lat1)])
            x, y = xs[:], ys[:]
            xi = np.where((x >= min(cx)) & (x <= max(cx)))[0]
            yi = np.where((y >= min(cy)) & (y <= max(cy)))[0]
            if xi.size == 0 or yi.size == 0:
                print(f"  skip {name}: AOI is outside this frame")
                grids[parent] = None
                continue
            grids[parent] = (x, y, epsg, slice(xi.min(), xi.max() + 1), slice(yi.min(), yi.max() + 1))
        if grids[parent] is None:
            continue
        x, y, epsg, sx, sy = grids[parent]
        win = _read_chunks(ds, sy, sx, fs, url) if fs else None
        if win is None:
            win = ds[sy, sx]  # plain h5py read (local file, or a filter we do not decode)
        wx, wy = x[sx], y[sy]
        if stride > 1 and name.split("/")[-1] in POWER:
            # SAR power: average the block instead of dropping pixels (less speckle, better water mask)
            win = _block_mean(win, stride)
            wx = wx[: win.shape[1] * stride].reshape(-1, stride).mean(axis=1)
            wy = wy[: win.shape[0] * stride].reshape(-1, stride).mean(axis=1)
        elif stride > 1:
            win, wx, wy = win[::stride, ::stride], wx[::stride], wy[::stride]
        key = name.replace("/", "_")  # full path, so keys stay unique and unambiguous
        arrays[key] = win
        arrays[key + "__x"] = wx
        arrays[key + "__y"] = wy
        arrays[key + "__epsg"] = np.array(epsg)
        print(f"  {name}: window {win.shape}", flush=True)
    return arrays


_FS = None


def _fs():
    """One authenticated HTTPS filesystem per process (workers each log in from ~/.netrc or the env token)."""
    global _FS
    if _FS is None:
        import earthaccess

        for attempt in range(4):  # urs.earthdata.nasa.gov times out now and then
            try:
                earthaccess.login()
                _FS = earthaccess.get_fsspec_https_session()
                break
            except Exception as e:
                if attempt == 3:
                    raise
                print(f"  login attempt {attempt + 1} failed ({type(e).__name__}), retrying", flush=True)
                time.sleep(3)
    return _FS


def fetch_one(job):
    """Read one granule's AOI window and write <out>/<tag>.npz. Returns (tag, seconds, error or None)."""
    url, tag, level, aoi, stride, out, block_mb, pols = job
    import h5py

    t0 = time.time()
    err = None
    for attempt in (1, 2):
        try:
            # earthaccess.open defaults to 16 MB background blocks, so every small metadata read
            # cost 16 MB on a link that does about 1 MB/s. Metadata goes through a small block
            # cache instead and the pixel chunks are fetched as exact byte ranges (_read_chunks).
            fs = _fs()
            with fs.open(url, cache_type="blockcache", block_size=int(block_mb * 2 ** 20)) as f, \
                    h5py.File(f, "r") as h5:
                arrays = read_window(h5, aoi, level, stride, fs, url, pols)
            if not arrays:
                return tag, time.time() - t0, "no usable datasets in the AOI"
            tmp = os.path.join(out, "tmp_" + tag + ".npz")  # never picked up by process_to_web.py
            np.savez_compressed(tmp, **arrays)
            os.replace(tmp, os.path.join(out, tag + ".npz"))
            preview(arrays, os.path.join(out, tag + ".png"))
            print(f"{tag} done in {time.time() - t0:.0f} s", flush=True)
            return tag, time.time() - t0, None
        except Exception as e:  # network hiccups are common; one retry, then report
            err = f"{type(e).__name__}: {e}"
            print(f"{tag} attempt {attempt} failed: {err}", flush=True)
    return tag, time.time() - t0, err


def preview(arrays, png):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    keys = [k for k in arrays if not k.endswith(("__x", "__y", "__epsg"))]
    if not keys:
        return
    fig, axes = plt.subplots(1, len(keys), figsize=(5 * len(keys), 4), squeeze=False)
    for ax, k in zip(axes[0], keys):
        a = np.array(arrays[k], dtype="float32")
        if "HHHH" in k or "HVHV" in k or "VVVV" in k or "VHVH" in k:
            a = 10 * np.log10(np.where(a > 0, a, np.nan))  # power -> dB
        ax.imshow(a, cmap="viridis")
        ax.set_title(k[-30:], fontsize=8)
        ax.axis("off")
    fig.savefig(png, dpi=120, bbox_inches="tight")
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--levels", nargs="+", default=["GUNW", "GCOV"])
    ap.add_argument("--paths", nargs="+", type=int, default=[112, 4])
    ap.add_argument("--start", default="2026-06-01T00:00:00Z")
    ap.add_argument("--aoi", nargs=4, type=float, default=DEFAULT_AOI)
    ap.add_argument("--limit", type=int, default=0,
                    help="most recent N granules per level and path (0 = all)")
    ap.add_argument("--stride", type=int, default=1,
                    help="decimate the window: GCOV power is block-averaged, other layers subsampled")
    ap.add_argument("--gcov-pols", nargs="+", default=["HVHV"],
                    help="GCOV layers to read (process_to_web.py uses HVHV for water, else HHHH)")
    ap.add_argument("--workers", type=int, default=4, help="granules read at the same time")
    ap.add_argument("--block-mb", type=float, default=0.25, help="block size in MiB for remote metadata reads")
    ap.add_argument("--force", action="store_true", help="refetch even if the .npz exists")
    ap.add_argument("--out", default="nisar_out")
    ap.add_argument("--list-only", action="store_true")
    ap.add_argument("--full-download", action="store_true")
    a = ap.parse_args()

    results = search(a.levels, a.paths, a.start)
    print(f"{len(results)} granules")
    tag_of = lambda p: f'{p["startTime"][:10]}_{p["processingLevel"]}_p{p["pathNumber"]}'  # noqa: E731
    for r in results:
        p = r.properties
        print(p["startTime"][:10], p["processingLevel"], "path", p["pathNumber"], p["fileName"][:70])
    if a.list_only or not results:
        return

    os.makedirs(a.out, exist_ok=True)
    # tag -> source file name, so later steps can tell which granule (and which GUNW date pair) a tag is
    idx_path = os.path.join(a.out, "granules.json")
    idx = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
    idx.update({tag_of(r.properties): r.properties["fileName"] for r in results})
    with open(idx_path, "w") as fh:
        json.dump(idx, fh, indent=1, sort_keys=True)

    if a.limit:  # most recent N per (level, path); results are sorted by start time
        groups = {}
        for r in results:
            groups.setdefault((r.properties["processingLevel"], r.properties["pathNumber"]), []).append(r)
        keep = {id(r) for g in groups.values() for r in g[-a.limit:]}
        results = [r for r in results if id(r) in keep]

    if a.full_download:
        token = os.environ.get("EARTHDATA_TOKEN") or input("Earthdata token: ").strip()
        session = asf.ASFSession().auth_with_token(token)
        for r in results:
            r.download(path=a.out, session=session)
        return

    jobs = []
    for r in reversed(results):  # newest first
        p = r.properties
        tag = tag_of(p)
        if not a.force and os.path.exists(os.path.join(a.out, tag + ".npz")):
            print(tag, "exists, skipping")
            continue
        jobs.append((p["url"], tag, p["processingLevel"], tuple(a.aoi), a.stride, a.out, a.block_mb,
                     tuple(a.gcov_pols)))
    if not jobs:
        return

    t0 = time.time()
    if a.workers > 1 and len(jobs) > 1:
        from concurrent.futures import ProcessPoolExecutor

        with ProcessPoolExecutor(max_workers=min(a.workers, len(jobs))) as ex:
            done = list(ex.map(fetch_one, jobs))
    else:
        done = [fetch_one(j) for j in jobs]
    failed = [(tag, err) for tag, _, err in done if err]
    print(f"{len(done) - len(failed)} of {len(done)} granules written in {time.time() - t0:.0f} s "
          f"(per granule: {', '.join(f'{tag} {sec:.0f}s' for tag, sec, _ in done)})")
    for tag, err in failed:
        print("FAILED", tag, err)


if __name__ == "__main__":
    main()
