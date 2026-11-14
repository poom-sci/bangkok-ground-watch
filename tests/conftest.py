import numpy as np
import pytest
from pyproj import Transformer

from siting.core.grid import Grid
from siting.pipeline.build import build_aoi

LON0, LAT0 = 100.60, 14.275


@pytest.fixture(scope="session")
def synth_grid():
    x, y = Transformer.from_crs("EPSG:4326", "EPSG:32647", always_xy=True).transform(LON0, LAT0)
    n = 60
    # centre of the grid is the point (LON0, LAT0)
    return Grid.from_affine((80, 0, x - 80 * n / 2, 0, -80, y + 80 * n / 2), "EPSG:32647", n, n)


@pytest.fixture(scope="session")
def data_dir(tmp_path_factory, synth_grid):
    rng = np.random.default_rng(0)
    n = synth_grid.height
    cols = np.arange(n)[None, :].repeat(n, 0)
    dem = (1 + 7 * cols / n + rng.normal(0, 0.05, (n, n))).astype("float32")  # low on the left
    lc = np.full((n, n), 40, "uint8")
    lc[:, 50:] = 10        # tree cover on the right
    lc[:, 5:8] = 80        # a river
    months = np.array([8, 9, 10, 11] * 5 + [2, 3, 2, 3], dtype="int8")
    dates = np.array([f"2022-{m:02d}-{(i % 27) + 1:02d}" for i, m in enumerate(months)])
    db = np.full((len(months), n, n), -8.0, "float32")
    wet = (months >= 8) & (months <= 11)
    db[np.ix_(wet, np.ones(n, bool), cols[0] < 15)] = -20.0   # low ground floods every wet scene
    db[:, :, 5:8] = -22.0                                    # river is water all year
    out = tmp_path_factory.mktemp("data")
    build_aoi(aoi_id="synth", name="Synthetic", grid=synth_grid, db=db, months=months, dates=dates,
              dem=dem, landcover=lc, out_dir=out, created_at="2026-01-01T00:00:00+00:00")
    return out
