# Bangkok Ground Watch

NASA Space Apps Challenge 2026, challenge "Dancing with the SARs".

An interactive web app that turns NISAR L-band radar into a map anyone can read: how Bangkok's ground changed along the radar line of sight, where radar saw surface water, a screening view for all 50 districts, and a site check backed by nine years of Sentinel-1 flood history.

- Project page: https://bangkok-ground-watch.vercel.app
- App: https://bangkok-ground-watch.vercel.app/app/
- 7-slide deck: https://bangkok-ground-watch.vercel.app/slides/

## What is in this repository

| Path | What it is |
|---|---|
| `nisar_fetch.py` | Searches ASF and reads only the Bangkok window of each NISAR GUNW / GCOV HDF5 file over HTTP range requests (no multi-GB download). Writes `nisar_out/*.npz`. |
| `process_to_web.py` | Turns the windows into map overlays (PNG) and `manifest.json`: LOS change in mm from GUNW, backscatter and a water mask from GCOV. |
| `district_stats.py` | Per-district statistics and the screening index. Writes `districts.json`. |
| `fetch_buildings.py` | OpenStreetMap building counts per district through the Overpass API. |
| `web/` | The web app: Next.js (static export), MapLibre GL, plain CSS. Landing page, app (`/app/`), slide deck (`/slides/`). |
| `web/public/data/` | The processed data the app serves (overlays, manifest, district statistics, district outlines). |
| `app/` | The first single-file viewer. Kept for reference; the app in `web/` replaced it. |
| `DESIGN.md` | The interface specification the app was built from. |
| `SUBMISSION_DRAFT.md` | Project description, data list, limits and the demo outline. |

The site check mode calls a separate service, the site suitability engine written by a teammate (repository `Thanut-Junnim26/solsat-siting`, FastAPI, Sentinel-1 RTC 2017 to 2025, Copernicus DEM, ESA WorldCover, NASA POWER). The deployed engine serves three areas: Ayutthaya, Samut Sakhon, and a Bangkok area added for this demo with bbox `[100.32, 13.48, 100.95, 13.97]`, orbit `descending/62`, wet season August to November.

## Data in the app (as of 15 November 2026)

- 17 NISAR L2 GUNW interferograms over Bangkok: 9 on ascending track 112, 8 on descending track 4, pairs from 21 June to 31 October 2026.
- 19 NISAR L2 GCOV scenes (HV), July to November 2026, as a surface water mask.
- All 50 Bangkok districts. Ascending data covers 49 of 50 (Nong Chok has none), descending covers 50 of 50.
- Grid about 80 m.

## Run the web app

```bash
cd web
npm install
npm run dev          # http://localhost:3000 (landing), http://localhost:3000/app/ (app)
npm run build        # static export in web/out
```

`NEXT_PUBLIC_SITING_API` (see `web/.env.production`) is the base URL of the site suitability engine. When it is unset, the site check mode is hidden and the rest of the app works unchanged.

## Rebuild the NISAR data

You need a free NASA Earthdata Login. Keep credentials on your own machine: `earthaccess` reads `~/.netrc` or the `EARTHDATA_TOKEN` environment variable. Never commit either.

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install asf_search earthaccess h5py numpy pyproj matplotlib
python -c "import earthaccess; earthaccess.login(strategy='interactive', persist=True)"

python nisar_fetch.py --list-only                                   # what ASF has over Bangkok
python nisar_fetch.py --levels GUNW GCOV --paths 112 4 --limit 0    # Bangkok window only -> nisar_out/*.npz
python process_to_web.py --in nisar_out --out app/data              # overlays + manifest.json
python fetch_buildings.py --out app/data                            # OSM building counts
python district_stats.py --in nisar_out --out app/data              # districts.json
cd web && npm run sync-data                                         # copy app/data into web/public/data
```

## Method in short

1. LOS change: unwrapped phase to millimetres with the L-band wavelength (0.2384 m); pixels kept when coherence is at least 0.4 and they belong to the largest connected component; a plane is removed from each image.
2. Water: GCOV HV power in dB; pixels below a fixed -19 dB are drawn as surface water and waterlogged land. The histogram over Bangkok has its valley at -19 dB in every scene; Otsu's method chose about -16.6 dB and marked paddies and orchards as water, so it is not used.
3. District screening index: the average percentile rank of water share, absolute LOS change and population density, using the indicators that have data.
4. Site check (separate engine): share of wet-season Sentinel-1 passes in which the 80 m pixel was water (VH below -18 dB), combined with a flood likelihood learned from elevation.

## What it does not claim

- LOS values are relative to the mean of the image window and still contain atmospheric effects. Removing a plane can also remove real regional signal.
- Positive LOS is assumed to mean range increase (away from the satellite). This follows from the NISAR algorithm document and the ISCE3 source, but no explicit sentence was found in the GUNW product specification, so the app reports change, not direction.
- The NISAR record used is short (June to October 2026). No yearly figure is shown.
- Usable radar signal is about 98 percent in dense inner districts and 14 to 46 percent in the rural east.
- The water layer also marks flooded paddies and ponds, and smooth dry surfaces can be mistaken for water.
- Radar can miss flooding between buildings and under vegetation. In dense inner Bangkok most site check points score near 100 with that warning. Flood history covers 2017 to 2025 only. The Bangkok site check area is not calibrated against optical imagery.
- Everything is at about 80 m. It is a screening aid, not an assessment of any building or site.

## Data and credits

- NISAR L2 GUNW and GCOV, NASA/ISRO, through the Alaska Satellite Facility DAAC (NASA Earthdata).
- NASA POWER solar irradiance (shown in the site check, not part of the score).
- Copernicus Sentinel-1 and Sentinel-2 (contains modified Copernicus Sentinel data), Copernicus DEM GLO-30, ESA WorldCover 2021 (CC BY 4.0), used by the site suitability engine.
- OpenStreetMap contributors (base map tiles and building counts), ODbL.
- Bangkok district outlines and population: `Bangkok-districts.geojson` from https://github.com/pcrete/gsvloader-demo (MIT). The file does not state the origin or year of its population figures.
- MapLibre GL JS, Next.js, React, IBM Plex Sans Thai and IBM Plex Mono (SIL Open Font License).

Not affiliated with or endorsed by NASA.

## Use of AI

Most of the code in this repository (the Python pipeline, the web app) was written with Claude (Anthropic) through Claude Code, which also produced the interface specification in `DESIGN.md`, reviewed the code and drafted the project text. Team members chose the challenge, the data and the method, ran the pipeline on real NISAR data, and decided what the app claims. No AI-generated images, video or audio are used.

## Licence

Apache License 2.0, see `LICENSE`. Data keeps the licences of its sources listed above.
