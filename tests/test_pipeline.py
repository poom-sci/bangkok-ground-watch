"""Offline tests for the pipeline pieces that do not need the network."""

import json
from typing import Any

import numpy as np
import pytest

from siting import calibrate
from siting.pipeline import build


def test_confusion_counts_precision_recall_f1():
    pred = np.array([1, 1, 0, 0, 1], bool)
    truth = np.array([1, 0, 0, 1, 1], bool)
    c = calibrate.confusion(pred, truth)
    assert c["precision"] == pytest.approx(2 / 3) and c["recall"] == pytest.approx(2 / 3)
    assert c["f1"] == pytest.approx(2 / 3) and c["iou"] == pytest.approx(0.5)


def test_calibrate_prefers_the_rule_that_matches_optical_water(tmp_path):
    n = 40
    water = np.zeros((n, n), bool)
    water[:, :10] = True
    vv = np.where(water, -12.0, -6.0).astype("float16")  # VV only dips to -12: misses at -15
    vh = np.where(water, -22.0, -14.0).astype("float16")  # VH separates cleanly at -18
    mndwi = np.where(water, 0.4, -0.3).astype("float16")
    raw, data = tmp_path / "raw", tmp_path / "data"
    (raw / "pairs").mkdir(parents=True)
    (raw / "s2").mkdir()
    data.mkdir()
    np.savez(raw / "pairs" / "2025-11-29.npz", vv=vv, vh=vh, date="2025-11-29", orbits="ascending/70")
    np.savez(raw / "s2" / "2025-12-03.npz", mndwi=mndwi)
    np.savez(data / "layers.npz", perm_water=np.zeros((n, n), bool))
    (row,) = calibrate.calibrate(raw, data)
    assert row["days"] == 4 and row["optical_water_share"] == pytest.approx(0.25)
    assert row["rules"]["VV<-15"]["recall"] == 0  # the old rule finds no water here
    assert row["rules"]["VH<-18"]["f1"] == pytest.approx(1.0)
    assert calibrate.calibrate(raw, data, max_days=1) == []  # too far apart to compare


def _write_year(raw, orbit_dir, year, dates, months, vh=True, grid=(80, 0, 100000, 0, -80, 1500000)):
    d = raw / orbit_dir / "sar"
    d.mkdir(parents=True, exist_ok=True)
    n = len(dates)
    arrays: dict[str, Any] = {
        "db": np.full((n, 6, 7), -8.0, "float16"),
        "months": np.array(months),
        "dates": np.array(dates),
        "transform": np.array(grid),
        "crs": "EPSG:32647",
    }
    if vh:
        arrays["vh"] = np.full((n, 6, 7), -15.0, "float16")
    np.savez(d / f"y{year}.npz", **arrays)
    np.savez(
        raw / orbit_dir / "layers.npz", dem=np.full((6, 7), 3.0, "float32"), wc=np.full((6, 7), 40, "uint8")
    )


def test_load_ingested_merges_orbits_sorted_by_date(tmp_path):
    _write_year(tmp_path, "a", 2024, ["2024-10-05", "2024-12-01"], [10, 12])
    _write_year(tmp_path, "b", 2024, ["2024-11-03"], [11])
    grid, db, _months, dates, orbits, dem, wc, vh = build.load_ingested(
        [(tmp_path / "a", "descending/164"), (tmp_path / "b", "ascending/70")]
    )
    assert list(dates) == ["2024-10-05", "2024-11-03", "2024-12-01"]
    assert list(orbits) == ["descending/164", "ascending/70", "descending/164"]
    assert db.shape == (3, 6, 7) and vh is not None and vh.shape == db.shape and dem.shape == wc.shape
    assert grid.pixel_m == 80


def test_load_ingested_without_vh_and_with_nothing(tmp_path):
    _write_year(tmp_path, "old", 2022, ["2022-10-05"], [10], vh=False)
    *_, vh = build.load_ingested([(tmp_path / "old", "descending/62")])
    assert vh is None  # AOI falls back to the VV rule (0.2.0)
    with pytest.raises(ValueError, match="no ingested SAR files"):
        build.load_ingested([(tmp_path / "missing", "descending/62")])


def test_load_geometries_accepts_feature_collection_feature_and_bare_geometry(tmp_path):
    poly = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}
    files = []
    for name, doc in {
        "fc": {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": poly}]},
        "f": {"type": "Feature", "geometry": poly},
        "g": poly,
    }.items():
        f = tmp_path / f"{name}.geojson"
        f.write_text(json.dumps(doc))
        files.append(f)
    assert build.load_geometries(files) == [poly, poly, poly]
