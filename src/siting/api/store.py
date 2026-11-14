"""Read-only access to the built AOI files."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..core.grid import Grid


@dataclass
class Aoi:
    meta: dict
    grid: Grid
    layers: dict
    db: np.ndarray        # (T,H,W) float16
    months: np.ndarray
    dates: np.ndarray
    orbits: np.ndarray
    scene_ids: list
    optical: dict | None = None
    vh: np.ndarray | None = None

    @property
    def water_band(self) -> str:
        return self.meta["params"].get("water_band", "vv")

    @property
    def water_db(self) -> float:
        return self.meta["params"].get("water_db", -15.0)

    def band(self):
        """Array the water rule is applied to (VH when the AOI was built with it)."""
        return self.vh if self.water_band == "vh" and self.vh is not None else self.db

    @property
    def id(self) -> str:
        return self.meta["aoi"]["id"]

    @property
    def run_id(self) -> str:
        return self.meta["run_id"]


class Store:
    def __init__(self, data_dir: Path):
        self.aois: dict[str, Aoi] = {}
        for meta_path in sorted(Path(data_dir).glob("*/meta.json")):
            d = meta_path.parent
            meta = json.loads(meta_path.read_text())
            layers = dict(np.load(d / "layers.npz"))
            sc = np.load(d / "scenes.npz")
            dates = sc["dates"]
            orbits = sc["orbits"] if "orbits" in sc.files else np.array(["descending/62"] * len(dates))
            ids = [f"s1rtc-{o.replace('descending', 'desc').replace('ascending', 'asc').replace('/', '')}-{d}"
                   for o, d in zip(orbits, dates)]
            aoi = Aoi(meta, Grid.from_dict(meta["grid"]), layers, sc["db"], sc["months"], dates, orbits, ids)
            if "vh" in sc.files:
                aoi.vh = sc["vh"]
            if (d / "optical.npz").exists():
                o = np.load(d / "optical.npz")
                aoi.optical = {"rgb": o["rgb"], "mndwi": o["mndwi"], "dates": [str(x) for x in o["dates"]],
                               "cloud": o["cloud"]}
            self.aois[aoi.id] = aoi

    def find(self, lat: float, lng: float):
        """Return (aoi, (row, col)) for the AOI that contains the point, else None."""
        for aoi in self.aois.values():
            rc = aoi.grid.lonlat_to_rc(lng, lat)
            if rc is not None:
                return aoi, rc
        return None

    def get_run(self, run_id: str):
        return next((a for a in self.aois.values() if a.run_id == run_id), None)
