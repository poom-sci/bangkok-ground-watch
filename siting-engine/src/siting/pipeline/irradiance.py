"""Climatological solar irradiance from NASA POWER (about 0.5 degree grid)."""

from __future__ import annotations

import json
import urllib.request

URL = (
    "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN"
    "&community=RE&longitude={lon:.4f}&latitude={lat:.4f}&format=JSON"
)


def fetch(lon: float, lat: float, timeout: int = 40) -> dict:
    with urllib.request.urlopen(URL.format(lon=lon, lat=lat), timeout=timeout) as r:
        d = json.load(r)
    p = d["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    return {
        "ghi_kwh_m2_day": {k: v for k, v in p.items() if k != "ANN"},
        "ghi_annual_mean": p["ANN"],
        "source": "NASA POWER climatology (ALLSKY_SFC_SW_DWN)",
        "note": "about 50 km resolution, so it is the same across a small AOI and is not part of the score",
    }
