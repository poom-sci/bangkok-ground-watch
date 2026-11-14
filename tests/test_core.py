import numpy as np

from siting.core import score as sc


def test_water_stats_frequency_and_permanent_water():
    months = np.array([8, 9, 10, 11, 2, 3])
    db = np.full((6, 2, 2), -8.0, "float32")
    db[:4, 0, 0] = -20          # water in all wet scenes, dry scenes land
    db[:, 1, 1] = -20           # water all year => permanent
    db[0, 0, 1] = np.nan        # no data is not water
    fw, perm = sc.water_stats(db, months)
    assert fw[0, 0] == 1.0 and fw[1, 0] == 0.0
    assert fw[0, 1] == 0.0      # 3 valid wet scenes, none water
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
