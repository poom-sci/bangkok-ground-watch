#!/usr/bin/env python3
"""Count OpenStreetMap buildings in each Bangkok district (one Overpass query), for district_stats.py.

Status: NOT yet run (Overpass was unreachable from the environment this was written in). The query
assumes Bangkok districts are admin_level=6 relations inside ISO3166-2=TH-10; check the printed
match count (should be 50) before trusting the numbers.

Usage:  python fetch_buildings.py --out app/data        # writes app/data/buildings.json
Data:   (c) OpenStreetMap contributors, ODbL. Counts are OSM "building" ways, so they depend on how
        completely each district has been mapped.
"""
import argparse
import json
import os
import urllib.parse
import urllib.request

QUERY = """[out:json][timeout:300];
area["ISO3166-2"="TH-10"]->.bkk;
rel(area.bkk)["boundary"="administrative"]["admin_level"="6"]->.ds;
foreach.ds->.d(
  .d out tags;
  .d map_to_area->.a;
  way(area.a)["building"];
  out count;
);"""


def norm(s):
    return (s or "").replace("เขต", "").replace(" ", "").strip().lower()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="app/data")
    ap.add_argument("--endpoint", default="https://overpass-api.de/api/interpreter")
    a = ap.parse_args()

    feats = json.load(open(os.path.join(a.out, "bkk_districts.geojson"), encoding="utf-8"))["features"]
    by_name = {}
    for f in feats:
        p = f["properties"]
        by_name[norm(p["name_th"])] = p["dcode"]
        by_name[norm(p["name_en"])] = p["dcode"]

    req = urllib.request.Request(a.endpoint, data=urllib.parse.urlencode({"data": QUERY}).encode(),
                                 headers={"User-Agent": "bangkok-ground-watch-hackathon/0.1 (Space Apps 2026)"})
    with urllib.request.urlopen(req, timeout=330) as r:
        j = json.load(r)

    counts, unmatched = {}, []
    el = j.get("elements", [])
    for i, e in enumerate(el):
        if e.get("type") != "relation":
            continue
        nxt = el[i + 1] if i + 1 < len(el) else {}
        n = int(nxt.get("tags", {}).get("ways", 0)) if nxt.get("type") == "count" else None
        t = e.get("tags", {})
        dcode = by_name.get(norm(t.get("name"))) or by_name.get(norm(t.get("name:en"))) or by_name.get(norm(t.get("name:th")))
        if dcode and n is not None:
            counts[dcode] = n
        else:
            unmatched.append(t.get("name"))

    out = {"source": f"OpenStreetMap via Overpass, data as of {j.get('osm3s', {}).get('timestamp_osm_base', '?')}",
           "counts": counts}
    with open(os.path.join(a.out, "buildings.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f"matched {len(counts)}/50 districts, total {sum(counts.values())} buildings")
    if unmatched:
        print("not matched (neighbouring provinces are expected here):", ", ".join(str(u) for u in unmatched))


if __name__ == "__main__":
    main()
