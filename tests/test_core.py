import numpy as np

from siting.core import score as sc


def test_water_stats_frequency_and_permanent_water():
    months = np.array([8, 9, 10, 11, 2, 3])
    db = np.full((6, 2, 2), -8.0, "float32")
    db[:4, 0, 0] = -20  # water in all wet scenes, dry scenes land
    db[:, 1, 1] = -20  # water all year => permanent
    db[0, 0, 1] = np.nan  # no data is not water
    fw, perm = sc.water_stats(db, months)
    assert fw[0, 0] == 1.0 and fw[1, 0] == 0.0
    assert fw[0, 1] == 0.0  # 3 valid wet scenes, none water
    assert perm[1, 1] and not perm[0, 0]


def test_flood_prob_is_non_increasing_with_height():
    rng = np.random.default_rng(1)
    elev = rng.uniform(1, 8, (200, 200)).astype("float32")
    fw = np.where(elev < 3, 0.5, 0.0).astype("float32")
    edges, p = sc.learn_flood_prob(elev, fw, np.ones_like(elev, bool))
    assert np.all(np.diff(p) <= 1e-9)
    pf = sc.apply_flood_prob(elev, edges, p)
    assert pf[elev < 2.5].mean() > 0.9 and pf[elev > 5].mean() < 0.05


def test_combine_weights_and_exclusion():
    f_flood = np.array([1.0, 0.0, 1.0], "float32")
    f_elev = np.array([1.0, 0.0, 1.0], "float32")
    s = sc.combine(f_flood, f_elev, np.array([False, False, True]))
    assert s[0] == 100 and s[1] == 0 and np.isnan(s[2])
    assert np.isclose(sc.combine(np.array([1.0]), np.array([0.0]), np.array([False]))[0], 70)


def test_grade_thresholds():
    assert sc.grade(70) == "good" and sc.grade(69.9) == "fair" and sc.grade(49.9) == "poor"


def test_one_severe_flood_year_is_not_diluted():
    # 3 years x 10 wet scenes; the pixel is water in 3 scenes of 2025 only
    months = np.tile(np.array([8, 9, 10, 11] * 3)[:10], 3)
    years = np.repeat([2023, 2024, 2025], 10)
    db = np.full((30, 1, 2), -8.0, "float32")
    db[20:23, 0, 0] = -20  # 3 flooded scenes in 2025
    db[5, 0, 1] = -20  # a single stray dark scene in 2024 (speckle)
    fw, _ = sc.water_stats(db, months)
    share = sc.flood_year_share(db, months, years)
    assert np.isclose(share[0, 0], 1 / 3) and share[0, 1] == 0  # one flood year; stray scene ignored
    assert fw[0, 0] < 0.15  # frequency alone barely sees it
    f_flood, _ = sc.subscores(fw, np.zeros_like(fw), share)
    assert f_flood[0, 0] == 0 and f_flood[0, 1] > 0.85  # recurrence cap bites; stray scene does not


def test_subscores_without_recurrence_unchanged():
    fw = np.array([0.0, 0.15, 0.3], "float32")
    f, _ = sc.subscores(fw, np.zeros(3, "float32"))
    assert np.allclose(f, [1, 0.5, 0])


def test_run_script_builds_expected_commands():
    import json
    from pathlib import Path

    from siting.pipeline import run

    cfg = json.loads((Path(__file__).parent.parent / "aois.json").read_text())
    assert {"ayutthaya", "hatyai", "samutsakhon"} <= set(cfg)
    cmds = run.commands("hatyai", cfg["hatyai"])
    flat = [" ".join(c) for c in cmds]
    assert sum("siting.pipeline.ingest " in f for f in flat) == 2  # two orbits
    assert any("--orbit ascending/70" in f for f in flat) and any("--orbit descending/164" in f for f in flat)
    assert any("siting.pipeline.optical" in f and "--target 2025-11-23" in f for f in flat)
    assert any("siting.pipeline.ingest_pairs" in f and "--date 2025-12-05" in f for f in flat)
    build = flat[-1]
    assert "siting.pipeline.build" in build and "--wet 10 12" in build and "--irradiance" in build
    assert build.count("--ingested") == 2 and "rawfoo" not in build
    # an AOI without optical targets skips the optical and pairs steps
    flat2 = [" ".join(c) for c in run.commands("samutsakhon", cfg["samutsakhon"])]
    assert not any("optical" in f or "ingest_pairs" in f for f in flat2)
