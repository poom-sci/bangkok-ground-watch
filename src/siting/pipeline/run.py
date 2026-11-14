"""Run the whole data pipeline for one AOI from aois.json.

    python -m siting.pipeline.run --aoi hatyai                 # ingest, optical, pairs, build
    python -m siting.pipeline.run --aoi hatyai --steps build   # only some steps
    python -m siting.pipeline.run --aoi hatyai --dry-run       # print the commands

Raw files go to raw/<aoi>/ and the served files to data/<aoi>/ (both git-ignored).
Every step resumes from what is already on disk. Steps need network except `build`.
"""
from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
from pathlib import Path

STEPS = ("ingest", "optical", "pairs", "build")


def orbit_dir(raw: Path, aoi: str, orbit: str) -> Path:
    return raw / aoi / orbit.replace("descending", "desc").replace("ascending", "asc").replace("/", "")


def commands(aoi_id: str, cfg: dict, raw: Path = Path("raw"), data: Path = Path("data"),
             steps=STEPS, irradiance: bool = True) -> list[list[str]]:
    py = [sys.executable, "-m"]
    bbox = [str(v) for v in cfg["bbox"]]
    top = raw / aoi_id
    out: list[list[str]] = []
    if "ingest" in steps:
        for orbit in cfg["orbits"]:
            out.append(py + ["siting.pipeline.ingest", "--raw", str(orbit_dir(raw, aoi_id, orbit)), "--bbox", *bbox,
                             "--orbit", orbit, "--wet", *map(str, cfg["wet"]), "--years", *map(str, cfg["years"])])
    if "optical" in steps and cfg.get("optical_targets"):
        c = py + ["siting.pipeline.optical", "--raw", str(top), "--bbox", *bbox,
                  "--window", str(cfg.get("optical_window", 7))]
        for t in cfg["optical_targets"]:
            c += ["--target", t]
        out.append(c)
    if "pairs" in steps and cfg.get("pair_dates"):
        c = py + ["siting.pipeline.ingest_pairs", "--raw", str(top), "--bbox", *bbox]
        for d in cfg["pair_dates"]:
            c += ["--date", d]
        out.append(c)
    if "build" in steps:
        c = py + ["siting.pipeline.build", "--id", aoi_id, "--name", cfg["name"], "--out", str(data),
                  "--wet", *map(str, cfg["wet"])]
        for orbit in cfg["orbits"]:
            c += ["--ingested", f"{orbit_dir(raw, aoi_id, orbit)}:{orbit}"]
        if cfg.get("optical_targets"):
            c += ["--optical", str(top)]
        if irradiance:
            c += ["--irradiance"]
        out.append(c)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--aoi", required=True)
    ap.add_argument("--config", default="aois.json", type=Path)
    ap.add_argument("--steps", default=",".join(STEPS))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-irradiance", action="store_true")
    a = ap.parse_args()
    cfg = json.loads(a.config.read_text())[a.aoi]
    steps = tuple(s for s in a.steps.split(",") if s)
    bad = set(steps) - set(STEPS)
    if bad:
        raise SystemExit(f"unknown steps: {sorted(bad)}")
    for c in commands(a.aoi, cfg, steps=steps, irradiance=not a.no_irradiance):
        print("$", shlex.join(c), flush=True)
        if not a.dry_run:
            subprocess.run(c, check=True, env={**__import__("os").environ, "PYTHONPATH": "src"})


if __name__ == "__main__":
    main()
