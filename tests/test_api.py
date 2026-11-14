import pytest
from fastapi.testclient import TestClient

from siting.api.app import create_app
from siting.core.grid import Grid
from conftest import LAT0, LON0


@pytest.fixture(scope="module")
def client(data_dir):
    return TestClient(create_app(data_dir))


def point(grid: Grid, row, col):
    lon, lat = grid.rc_to_lonlat(row, col)
    return {"lat": lat, "lng": lon}


def test_grid_roundtrip(synth_grid):
    assert synth_grid.lonlat_to_rc(LON0, LAT0) is not None
    lon, lat = synth_grid.rc_to_lonlat(10, 20)
    assert synth_grid.lonlat_to_rc(lon, lat) == (10, 20)
    assert synth_grid.lonlat_to_rc(0, 0) is None


def test_healthz_and_coverage(client):
    assert client.get("/healthz").json()["ok"] is True
    cov = client.get("/v1/coverage").json()["aois"]
    assert cov[0]["id"] == "synth" and cov[0]["run_id"].startswith("run_synth_0.2.0_")


def test_high_dry_ground_scores_good(client, synth_grid):
    r = client.get("/v1/suitability", params=point(synth_grid, 30, 40)).json()
    assert r["grade"] == "good" and r["score"] >= 90
    assert r["components"]["flood"]["value"] == 0.0
    assert r["landcover"]["class"] == 40
    assert "vegetated_flooding_not_detected" in r["confidence"]["flags"]
    assert r["evidence_url"].startswith("/v1/evidence?")


def test_low_flooded_ground_scores_poor(client, synth_grid):
    r = client.get("/v1/suitability", params=point(synth_grid, 30, 12)).json()
    assert r["grade"] == "poor" and r["components"]["flood"]["value"] == 1.0


def test_excluded_areas_have_null_score(client, synth_grid):
    tree = client.get("/v1/suitability", params=point(synth_grid, 30, 55)).json()
    assert tree["score"] is None and "tree_cover" in tree["exclusions"]
    river = client.get("/v1/suitability", params=point(synth_grid, 30, 6)).json()
    assert river["score"] is None and "permanent_water" in river["exclusions"]


def test_outside_coverage_404(client):
    r = client.get("/v1/suitability", params={"lat": 18.8, "lng": 98.9})
    assert r.status_code == 404 and r.json()["detail"]["error"] == "outside_coverage"


def test_evidence_matches_score_inputs(client, synth_grid):
    p = point(synth_grid, 30, 12)
    s = client.get("/v1/suitability", params=p).json()
    e = client.get(s["evidence_url"].replace("/v1/evidence", "/v1/evidence")).json()
    wet = [x for x in e["scenes"] if x["season"] == "wet"]
    freq = sum(x["is_water"] for x in wet) / len(wet)
    assert freq == s["components"]["flood"]["value"]          # evidence is the same data as the score
    assert e["summary"]["scenes_total"] == len(e["scenes"]) == 24
    assert e["method"]["water_rule"] == "VV_dB < -15"


def test_chips_are_png(client, synth_grid):
    p = point(synth_grid, 30, 12)
    e = client.get("/v1/evidence", params=p).json()
    for url in [e["scenes"][0]["chip_url"], *[l["chip_url"] for l in e["layers"]]]:
        res = client.get(url)
        assert res.status_code == 200 and res.content[:8] == b"\x89PNG\r\n\x1a\n", url
    bad = client.get("/v1/evidence/chip", params={**p, "layer": "nope"})
    assert bad.status_code == 422
    both = client.get("/v1/evidence/chip", params={**p, "layer": "elev", "scene_id": "x"})
    assert both.status_code == 422


def test_scene_ids_follow_orbit_and_wet_months_are_per_aoi(tmp_path, synth_grid):
    import numpy as np
    from siting.pipeline.build import build_aoi
    n = synth_grid.height
    months = np.array([10, 11, 12, 2, 3])
    dates = np.array(["2024-10-05", "2024-11-06", "2024-12-07", "2024-02-02", "2024-03-03"])
    orbits = np.array(["ascending/70", "descending/164", "ascending/70", "ascending/70", "ascending/70"])
    db = np.full((5, n, n), -8.0, "float32")
    db[:3, :, :10] = -20.0                      # flooded in all Oct-Dec scenes
    build_aoi(aoi_id="south", name="South", grid=synth_grid, db=db, months=months, dates=dates,
              dem=np.full((n, n), 3.0, "float32"), landcover=np.full((n, n), 40, "uint8"),
              out_dir=tmp_path, wet_months=(10, 12), orbits=orbits)
    c = TestClient(create_app(tmp_path))
    e = c.get("/v1/evidence", params=point(synth_grid, 30, 5)).json()
    assert e["method"]["wet_months"] == [10, 11, 12]
    assert [s["scene_id"] for s in e["scenes"]][:2] == ["s1rtc-asc70-2024-10-05", "s1rtc-desc164-2024-11-06"]
    assert e["summary"] == {"scenes_total": 5, "scenes_wet": 3, "wet_scenes_with_water": 3, "wet_scenes_valid": 3}
    assert c.get(e["scenes"][3]["chip_url"]).status_code == 200


def test_vh_rule_is_used_when_aoi_has_vh(tmp_path, synth_grid):
    import numpy as np
    from siting.pipeline.build import build_aoi
    n = synth_grid.height
    months = np.array([8, 9, 10, 11, 2, 3])
    dates = np.array(["2024-08-05", "2024-09-06", "2024-10-07", "2024-11-08", "2024-02-02", "2024-03-03"])
    vv = np.full((6, n, n), -8.0, "float32")         # VV says dry everywhere (too bright to be water)
    vh = np.full((6, n, n), -14.0, "float32")
    vh[:4, :, :10] = -22.0                           # VH sees flooding on the left in every wet scene
    build_aoi(aoi_id="vh", name="VH", grid=synth_grid, db=vv, vh=vh, months=months, dates=dates,
              dem=np.full((n, n), 3.0, "float32"), landcover=np.full((n, n), 40, "uint8"), out_dir=tmp_path)
    c = TestClient(create_app(tmp_path))
    e = c.get("/v1/evidence", params=point(synth_grid, 30, 5)).json()
    assert e["method"]["version"] == "0.3.0" and e["method"]["water_rule"] == "VH_dB < -18"
    assert e["summary"]["wet_scenes_with_water"] == 4 and e["scenes"][0]["vh_db"] == -22.0
    assert c.get("/v1/suitability", params=point(synth_grid, 30, 5)).json()["components"]["flood"]["value"] == 1.0
    assert c.get("/v1/suitability", params=point(synth_grid, 30, 30)).json()["components"]["flood"]["value"] == 0.0
    chip = c.get(e["scenes"][0]["chip_url"] + "&band=vh&overlay=water_mask")
    assert chip.status_code == 200 and chip.content[:4] == b"\x89PNG"


def square(grid, r, c, half):
    ring = [grid.rc_to_lonlat(r + dr, c + dc) for dr, dc in ((-half, -half), (-half, half), (half, half), (half, -half), (-half, -half))]
    return {"type": "Polygon", "coordinates": [[list(p) for p in ring]]}


def test_area_endpoint_stats_and_limits(client, synth_grid):
    g = square(synth_grid, 30, 40, 4)                       # dry high ground, about 9x9 pixels
    r = client.post("/v1/suitability/area", json={"geometry": g}).json()
    assert r["pixels"] > 40 and r["score_mean"] >= 90 and r["share_excluded"] == 0 and r["flags"] == []
    low = client.post("/v1/suitability/area", json={"geometry": square(synth_grid, 30, 12, 2)}).json()
    assert low["share_poor"] == 1.0
    mixed = client.post("/v1/suitability/area", json={"geometry": square(synth_grid, 30, 52, 4)}).json()
    assert 0 < mixed["share_excluded"] < 1                  # straddles the tree-cover edge
    tiny = client.post("/v1/suitability/area", json={"geometry": square(synth_grid, 30, 40, 0.01)}).json()
    assert tiny["flags"] == ["smaller_than_pixel"] and tiny["pixels"] == 1 and tiny["score_mean"] >= 90
    assert client.post("/v1/suitability/area", json={"nope": 1}).status_code == 422
    assert client.post("/v1/suitability/area", json={"geometry": {"type": "Point", "coordinates": [0, 0]}}).status_code == 422
    big = {"type": "Polygon", "coordinates": [[[100.5, 14.2], [100.9, 14.2], [100.9, 14.5], [100.5, 14.5], [100.5, 14.2]]]}
    assert client.post("/v1/suitability/area", json={"geometry": big}).status_code in (404, 422)


def test_protected_area_excludes(tmp_path, synth_grid):
    import numpy as np
    from siting.pipeline.build import build_aoi
    n = synth_grid.height
    months = np.array([8, 9, 2, 3]); dates = np.array(["2024-08-05", "2024-09-06", "2024-02-02", "2024-03-03"])
    prot = square(synth_grid, 30, 30, 5)
    build_aoi(aoi_id="p", name="P", grid=synth_grid, db=np.full((4, n, n), -8.0, "float32"), months=months, dates=dates,
              dem=np.full((n, n), 3.0, "float32"), landcover=np.full((n, n), 40, "uint8"), out_dir=tmp_path,
              protected_geojson=[prot])
    c = TestClient(create_app(tmp_path))
    inside = c.get("/v1/suitability", params=point(synth_grid, 30, 30)).json()
    outside = c.get("/v1/suitability", params=point(synth_grid, 5, 5)).json()
    assert inside["score"] is None and "protected_area" in inside["exclusions"] and outside["score"] is not None
