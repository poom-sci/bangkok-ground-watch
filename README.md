# Bangkok Ground Watch

NASA Space Apps Challenge 2026, challenge "Dancing with the SARs".

An interactive web app that turns NISAR L-band radar into a map anyone can read: how Bangkok's ground changed along the radar line of sight, where radar saw surface water, a screening view for all 50 districts, and a Site Scout backed by nine years of Sentinel-1 flood history.

- Project page: https://bangkok-ground-watch.vercel.app
- App (dashboard with five tabs: Overview, Site Scout, Ground Pulse, Districts, Shortlist): https://bangkok-ground-watch.vercel.app/app/
- Demo video (29 s, synthetic voiceover): https://bangkok-ground-watch.vercel.app/demo/bangkok-ground-watch-demo.mp4

## What is in this repository

| Path | What it is |
|---|---|
| `nisar_fetch.py` | Searches ASF and reads only the Bangkok window of each NISAR GUNW / GCOV HDF5 file over HTTP range requests (no multi-GB download). Writes `nisar_out/*.npz`. |
| `process_to_web.py` | Turns the windows into map overlays (PNG) and `manifest.json`: LOS change in mm from GUNW, backscatter and a water mask from GCOV. |
| `district_stats.py` | Per-district statistics and the screening index. Writes `districts.json`. |
| `fetch_buildings.py` | OpenStreetMap building counts per district through the Overpass API. |
| `web/` | The web app: Next.js (static export), MapLibre GL, plain CSS. Landing page, app (`/app/`), and the page the slide deck PDF is printed from. Dark SOLSAT theme. |
| `web/public/data/` | The processed data the app serves (overlays, manifest, district statistics, district outlines). |
| `app/` | The first single-file viewer. Kept for reference; the app in `web/` replaced it. |
| `DESIGN.md` | The interface specification the app was built from. |
| `SUBMISSION_DRAFT.md` | Project description, data list, limits and the demo outline. |

The Site Scout mode calls a separate service, the site suitability engine written by a teammate, Thanut Junnim. Its source is included in this repository under [`siting-engine/`](siting-engine/) with its original commit history (FastAPI, Sentinel-1 RTC 2017 to 2025, Copernicus DEM, ESA WorldCover, NASA POWER). The deployed engine serves three areas: Ayutthaya, Samut Sakhon, and a Bangkok area added for this demo with bbox `[100.32, 13.48, 100.95, 13.97]`, orbit `descending/62`, wet season August to November.

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

`NEXT_PUBLIC_SITING_API` (see `web/.env.production`) is the base URL of the site suitability engine. When it is unset, the Site Scout mode is hidden and the rest of the app works unchanged.

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

## What we found

**What the two radars agree on.** Across 485,189 non-permanent-water pixels of Bangkok, NISAR L-band HV water recurrence (19 scenes, July to November 2026) ranks land the same way as Sentinel-1 C-band wet-season flood frequency (132 wet-season scenes, 2017 to 2025): Spearman 0.72 per pixel and 0.90 across the 50 districts. NISAR saw water at least once on 94 percent of the land Sentinel-1 saw wet in 10 percent or more of wet-season passes, against 8.7 percent of land it never saw wet. Both methods threshold dark backscatter, so they share blind spots, and one NISAR season is not a flood record.

**What drives the change.** In the area both NISAR tracks cover (150 km2 of cropland), cropland water fell from 32 percent on 8 July to 14 percent on 13 August and returned to 31 percent on 24 October, while built-up land stayed under 2 percent. About 62 percent (30 km2) of the cropland that was water in July read dry in August, and 70 percent of that returned by October. The surface water change inside Bangkok follows the rice season, not flooding of the city. A dry reading on cropland can mean crop canopy raising the HV backscatter, not drainage.

**Two-radar confidence.** Every 80 m cell of the Bangkok grid is classed by whether NISAR (2026) and Sentinel-1 (2017 to 2025) both saw water, only one did, or neither: 5.7 percent is confirmed wet by both, 7.4 percent was wet this year only, 0.6 percent only in the record, 65.1 percent is confirmed dry, 12.2 percent is permanent water. The rule holds up against elevation: 71 percent of confirmed-wet land lies below 2 m, against 22.5 percent of all observed land. Both radars are blind to water under buildings and trees (55 percent of the grid), so confidence there is capped at medium.

**How low is too low.** On land the radar can see (cropland, grassland, bare ground), NISAR saw water in 44 percent of scenes below 1 m, 40 percent at 1 to 2 m, 27 percent at 2 to 3 m and 9 percent above 3 m. The elevation is a surface model with metre-level error.

**Why ground change is shown but not ranked.** Per-pair LOS means are dominated by atmosphere: sums of alternating pairs cancel (correlation -0.82 on track 112 and -0.91 on track 4) and the two tracks disagree in sign in 14 of 49 districts. NISAR's ionosphere and troposphere correction layers are not applied. Roughly 10 to 12 months of NISAR acquisitions would be needed before a rate of a few millimetres per year could be separated from this noise.

Reproduce with `python fusion_analysis.py` (needs the Sentinel-1 engine's Bangkok grid) and `python fusion_analysis.py --check`.

## Method in short

1. LOS change: unwrapped phase to millimetres with the L-band wavelength (0.2384 m); pixels kept when coherence is at least 0.4 and they belong to the largest connected component; a plane is removed from each image.
2. Water: GCOV HV power in dB; pixels below a fixed -19 dB are drawn as surface water and waterlogged land. The histogram over Bangkok has its valley near -19 dB in the 8 scenes we checked; Otsu's method chose about -16.6 dB and marked paddies and orchards as water, so it is not used.
3. District screening index: the average percentile rank of water share and population density. Ground change is shown but not ranked (see the limits).
4. Site Scout (separate engine): share of wet-season Sentinel-1 passes in which the 80 m pixel was water (VH below -18 dB), combined with a flood likelihood learned from elevation.

## What it does not claim

- LOS values are relative to the mean of the image window and still contain atmospheric effects. Removing a plane can also remove real regional signal.
- Positive LOS is assumed to mean range increase (away from the satellite). This follows from the NISAR algorithm document and the ISCE3 source, but no explicit sentence was found in the GUNW product specification, so the app reports change, not direction.
- The NISAR record used is short (June to October 2026). No yearly figure is shown.
- Usable radar signal is about 98 percent in dense inner districts and 14 to 46 percent in the rural east.
- The water layer also marks flooded paddies and ponds, and smooth dry surfaces can be mistaken for water.
- Radar can miss flooding between buildings and under vegetation. In dense inner Bangkok most Site Scout points score near 100 with that warning. Flood history covers 2017 to 2025 only. The Bangkok Site Scout area is not calibrated against optical imagery.
- Everything is at about 80 m. It is a screening aid, not an assessment of any building or site.

## Data and credits

- NISAR L2 GUNW and GCOV, NASA/ISRO, through the Alaska Satellite Facility DAAC (NASA Earthdata).
- NASA POWER solar irradiance (shown in the Site Scout, not part of the score).
- Copernicus Sentinel-1 and Sentinel-2 (contains modified Copernicus Sentinel data), Copernicus DEM GLO-30, ESA WorldCover 2021 (CC BY 4.0), used by the site suitability engine.
- OpenStreetMap contributors (map base and building counts), ODbL. Satellite base: Sentinel-2 cloudless by EOX IT Services GmbH (CC BY 4.0, contains modified Copernicus Sentinel data 2016).
- Bangkok district outlines and population: `Bangkok-districts.geojson` from https://github.com/pcrete/gsvloader-demo (MIT). The file does not state the origin or year of its population figures.
- MapLibre GL JS, Next.js, React, Poppins, Prompt, Chakra Petch, Zen Dots and Kanit (SIL Open Font License, via Google Fonts).

Not affiliated with or endorsed by NASA.

## Use of AI

Most of the code in this repository (the Python pipeline, the web app) was written with Claude (Anthropic) through Claude Code, which also produced the interface specification in `DESIGN.md`, reviewed the code and drafted the project text. Team members chose the challenge, the data and the method, ran the pipeline on real NISAR data, and decided what the app claims. The 29-second demo video was assembled with AI assistance from real screenshots of the app, and its voiceover is a synthetic text-to-speech voice, labelled in the video. No AI-generated images are used.

## Licence

Apache License 2.0, see `LICENSE`. Data keeps the licences of its sources listed above.

The SOLSAT logo in `web/public/solsat-logo.svg` is the team's brand mark and is not covered by the Apache licence.
