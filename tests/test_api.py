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
    assert cov[0]["id"] == "synth" and cov[0]["run_id"].startswith("run_synth_0.1.0_")


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
