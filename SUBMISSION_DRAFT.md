# Submission draft: Bangkok Ground Watch

Draft for the NASA Space Apps 2026 project page (challenge: Dancing with the SARs). Deadline: Sunday 15 Nov 2026, 23:59 Asia/Bangkok. Paste only the text under each heading from "Project name" down. Before submitting: confirm the engine repository link opens in a private window; if it does not, remove that line.

Project page: https://bangkok-ground-watch.vercel.app
App: https://bangkok-ground-watch.vercel.app/app/
Ground Pulse: https://bangkok-ground-watch.vercel.app/app/?tab=ground
Site Scout: https://bangkok-ground-watch.vercel.app/app/?tab=site
One district (Lat Krabang): https://bangkok-ground-watch.vercel.app/app/?tab=districts&d=1011
Slide deck (PDF, 7 pages): https://bangkok-ground-watch.vercel.app/slides/bangkok-ground-watch.pdf

---

## Project name

Bangkok Ground Watch

## High-level summary (about 100 words)

Bangkok sits on soft clay, floods every wet season, and keeps building. Bangkok Ground Watch turns NISAR L-band radar into a map anyone can read. "Ground Pulse" shows 17 NISAR interferograms as line-of-sight ground change and 19 NISAR backscatter scenes as surface water, with a date scrubber and a screening table for all 50 Bangkok districts. "Site Scout" adds nine years of Sentinel-1 flood history across Bangkok, Ayutthaya and Samut Sakhon: tap a point and get a 0 to 100 suitability screening score for a factory with rooftop solar, plus the evidence trail of every radar pass behind it. Every number links back to the satellite scenes that produced it.

## Link to project demo

https://bangkok-ground-watch.vercel.app/slides/bangkok-ground-watch.pdf (7 slides, PDF, public, no login). A 30 second video script is at the end of this file if the team prefers video.

## Link to final project

- App: https://bangkok-ground-watch.vercel.app (project page) and https://bangkok-ground-watch.vercel.app/app/ (the app)
- Code (web app + NISAR pipeline): https://github.com/poom-sci/bangkok-ground-watch
- Code (site suitability engine, by a teammate): https://github.com/Thanut-Junnim26/solsat-siting

## Detailed project description

### What it does

**Ground Pulse (NISAR).**
- Line-of-sight (LOS) change: 17 NISAR L2 GUNW interferograms over Bangkok, 9 on ascending track 112 and 8 on descending track 4, from 21 June to 31 October 2026. Each image is the change between two radar passes 12 to 36 days apart, shown in millimetres on a diverging scale, with a date scrubber and play button.
- Surface water: 19 NISAR L2 GCOV scenes (HV backscatter), July to November 2026. Pixels below -19 dB are drawn as surface water and waterlogged land.
- District screening: for each of Bangkok's 50 districts the app shows cumulative LOS change, the largest water share seen, population density and OpenStreetMap building density, and ranks districts by a simple screening index (the average percentile rank of water share and population density; ground change is shown but not ranked).

**Site Scout (Sentinel-1, a second radar frequency).**
- Tap a point inside a covered area (all of Bangkok, Ayutthaya or Samut Sakhon) and get a 0 to 100 suitability screening score for siting a factory with rooftop solar.
- The score combines flood history (70 percent: the share of wet-season radar passes from 2017 to 2025 in which the pixel was water) and ground height (30 percent: Copernicus DEM, turned into a flood likelihood learned inside each area). Water, wetland and tree cover are excluded using ESA WorldCover.
- "See the evidence" shows every radar pass used, year by year, with the radar image around the point, the water rule, and a link to find the scene. Examples: Rojana industrial park in Ayutthaya scores 26, with water in 10 of 130 wet-season passes; a paddy area in Lat Krabang, east Bangkok, scores 22 (36 of 130); Krathum Baen in Samut Sakhon scores 88 (0 of 130).
- NASA POWER gives the solar irradiance at the point for context. It is not part of the score.
- Each district has its own detail view (index and rank, LOS per radar pair with its spread, usable radar signal, water per scene, people and buildings) and a "Scout here" button that jumps into Site Scout.
- A display name (no password, kept in the browser only) lets a visitor save checked sites to "Shortlist". Guests can use everything else.

### What we found

**What the two radars agree on.** Across 485,189 non-permanent-water pixels of Bangkok, NISAR L-band HV water recurrence (19 scenes, July to November 2026) ranks land the same way as Sentinel-1 C-band wet-season flood frequency (132 wet-season scenes, 2017 to 2025): Spearman 0.72 per pixel and 0.90 across the 50 districts. NISAR saw water at least once on 94 percent of the land Sentinel-1 saw wet in 10 percent or more of wet-season passes, against 8.7 percent of land it never saw wet. Both methods threshold dark backscatter, so they share blind spots, and one NISAR season is not a flood record.

**What drives the change.** In the area both NISAR tracks cover (150 km2 of cropland), cropland water fell from 32 percent on 8 July to 14 percent on 13 August and returned to 31 percent on 24 October, while built-up land stayed under 2 percent. About 62 percent (30 km2) of the cropland that was water in July read dry in August, and 70 percent of that returned by October. The surface water change inside Bangkok follows the rice season, not flooding of the city. A dry reading on cropland can mean crop canopy raising the HV backscatter, not drainage.

**Why ground change is shown but not ranked.** Per-pair LOS means are dominated by atmosphere: sums of alternating pairs cancel (correlation -0.82 on track 112 and -0.91 on track 4) and the two tracks disagree in sign in 14 of 49 districts. NISAR's ionosphere and troposphere correction layers are not applied. Roughly 10 to 12 months of NISAR acquisitions would be needed before a rate of a few millimetres per year could be separated from this noise.

### How it works

1. **NISAR without the download.** GUNW files are about 2.3 GB and GCOV files about 6 GB each. Our fetch script searches ASF with `asf_search`, then opens each HDF5 file remotely with `earthaccess` and `h5py` and reads only the Bangkok window (about 906 x 1019 pixels at 80 m for GUNW) through HTTP range requests. One granule first took almost 9 minutes; after going straight to the dataset paths, tuning the remote block size and reading granules in parallel the whole set fits in a short run.
2. **LOS change.** Unwrapped phase is converted to millimetres with the L-band wavelength (0.2384 m). We keep pixels with coherence of at least 0.4 in the largest connected component, and remove a plane from each image.
3. **Water.** GCOV HV power is converted to dB. The histogram over Bangkok has two modes (open water near -24 dB, land near -12 dB) with the valley near -19 dB in the 8 scenes we checked (both tracks, September to November), so we use a fixed -19 dB threshold. Otsu's method picked about -16.6 dB and marked paddies and orchards as water, so we dropped it.
4. **District statistics.** Pixels are aggregated inside each district outline; building counts come from OpenStreetMap through the Overpass API.
5. **Site suitability engine.** A FastAPI service reads pre-built grids at 80 m from Sentinel-1 RTC (2017 to 2025), Copernicus DEM GLO-30 and ESA WorldCover 2021. The water rule (VH below -18 dB) was calibrated against Sentinel-2 water on known flood dates. It runs on Google Cloud Run.
6. **Front end.** Next.js static export with MapLibre GL, deployed on Vercel. English and Thai.

### What it does not claim (limits)

- LOS values are relative to the mean of the image window and still contain atmospheric effects. A plane was removed from each image, which can also remove real regional signal.
- We assume positive LOS means range increase (away from the satellite). This follows from the NISAR algorithm document and the ISCE3 source, but we found no explicit sentence in the GUNW product specification, so the app never labels values as subsidence or uplift.
- The NISAR record used is short (radar pairs from 21 June to 31 October 2026), so no yearly figure is shown.
- The water layer also marks flooded paddies and ponds, and very smooth dry surfaces such as runways can be mistaken for water.
- Radar can miss flooding between buildings and under vegetation. The Site Scout flags this on every affected point, and grades (good, fair, poor) are provisional. In dense inner Bangkok most points score near 100 with that flag, so the Site Scout is most useful on the city edge and open land.
- The flood history covers 2017 to 2025 only, so earlier floods such as 2011 are not in it. The Bangkok area has not been calibrated against optical imagery (the engine's water rule was calibrated on flood events in Ayutthaya and Hat Yai).
- Usable radar signal for ground change is about 98 percent in dense inner districts but only 14 to 46 percent in the rural east (Lat Krabang, Khlong Sam Wa, Nong Chok, Min Buri), and Nong Chok has no ascending-track data.
- Everything is at about 80 m. District values are averages. Nothing here assesses a single building or site; it is a screening aid.
- OpenStreetMap building counts depend on how completely each district is mapped. The district boundary file does not state the origin or year of its population figures.

### Benefits and what comes next

- City planners and residents get a readable first look at where the ground and the water are changing, with the caveats one tap away.
- Businesses choosing a factory site get a quick screening backed by evidence they can check themselves.
- Future NISAR applications: a multi-year LOS time series with atmospheric correction to measure subsidence rates in Bangkok and Samut Sakhon; combining ascending and descending tracks into vertical and east-west motion; using NISAR L-band, which sees through vegetation better than C-band, to improve flood mapping under crops; adding NISAR ground motion as a third component of the site score.

### Tools, languages, hardware

Python (asf_search, earthaccess, h5py, numpy, pyproj, matplotlib, FastAPI, scipy, pillow), TypeScript, Next.js, React, MapLibre GL JS, Vercel, Google Cloud Run, Microsoft Planetary Computer STAC (for Sentinel-1 RTC). One laptop.

## NASA data

- NISAR L2 GUNW (Geocoded Unwrapped Interferogram), L-band, via the Alaska Satellite Facility DAAC: https://search.asf.alaska.edu
- NISAR L2 GCOV (Geocoded Polarimetric Covariance), L-band, via ASF DAAC
- NASA Earthdata Login and Earthdata Cloud (data access): https://urs.earthdata.nasa.gov
- NISAR Data User Guide (ASF): https://nisar-docs.asf.alaska.edu
- NASA POWER (solar irradiance climatology, ALLSKY_SFC_SW_DWN): https://power.larc.nasa.gov

## Space agency partner data

- ISRO: NISAR is a joint NASA and ISRO mission

- Copernicus Sentinel-1 RTC, 2017 to 2025 (ESA; contains modified Copernicus Sentinel data), through Microsoft Planetary Computer
- Copernicus Sentinel-2 L2A (ESA), used to calibrate the water rule
- Copernicus DEM GLO-30 (ESA)
- ESA WorldCover 2021 (CC BY 4.0)

## References

- OpenStreetMap contributors (base map tiles and building counts), ODbL: https://www.openstreetmap.org/copyright
- Bangkok district boundaries and population: https://github.com/pcrete/gsvloader-demo (MIT; origin and year of the population figures not stated)
- MapLibre GL JS (BSD-3-Clause): https://maplibre.org
- Next.js (MIT), React (MIT)
- asf_search, earthaccess, h5py, numpy, pyproj, matplotlib, FastAPI, scipy, pillow, uvicorn (open-source Python libraries)
- Poppins, Prompt, Chakra Petch, Zen Dots and Kanit (SIL Open Font License, via Google Fonts)
- NISAR NASA SDS Algorithm Theoretical Basis Document, JPL D-95677 Rev A, and the L2 GUNW Product Specification, JPL D-102272 Rev E
- ISCE3 (NISAR science data system software): https://github.com/isce-framework/isce3
- MintPy documentation: https://github.com/insarlab/MintPy (consulted for the phase sign convention, not used by the pipeline)
- Overpass API: https://overpass-api.de
- TypeScript, Microsoft Planetary Computer STAC (Sentinel-1 RTC access), Sentinel-2 cloudless by EOX IT Services GmbH (base map imagery, CC BY 4.0, contains modified Copernicus Sentinel data 2016)

## Use of artificial intelligence

We used Claude (Anthropic), through Claude Code, as a coding and writing assistant. It wrote most of the code for the NISAR fetch and processing scripts and for the web app, produced the interface design specification, reviewed the code, and drafted this project text. Team members chose the challenge, the data and the method, ran and checked the results against real NISAR and Sentinel-1 data, and made the decisions about what the app claims. No AI-generated images, video or audio are used. The repository README states which parts were written with AI assistance.
The site suitability engine was written by a teammate in a separate repository; its AI use is described in that repository.

---

## Demo script, 30 seconds (screen recording with captions, no voice needed)

| Time | Screen | Caption |
|---|---|---|
| 0 to 4 s | Title on the map, LOS overlay visible | Bangkok Ground Watch. NISAR radar, made readable. |
| 4 to 11 s | Press play on the scrubber, overlay changes through the dates | 17 NISAR interferograms, June to October 2026. Ground change along the radar line of sight. |
| 11 to 16 s | Switch to Water, then open Districts and tap one | NISAR backscatter maps surface water. 50 districts screened. |
| 16 to 24 s | Switch to Site Scout, fly to Ayutthaya, tap Rojana, card shows 26 | Site Scout: nine years of Sentinel-1 flood history. Tap a point, get a screening score. |
| 24 to 28 s | See the evidence, year strip with water marks, radar image | Every score shows its evidence: 130 wet-season radar passes, water in 10. |
| 28 to 30 s | About the data dialog, then URL | Open data, open code. bangkok-ground-watch.vercel.app |

## Slide outline, 7 slides (alternative to the video)

1. Title: Bangkok Ground Watch, team, challenge, one-line tagline, app URL.
2. Problem: soft ground, yearly floods, fast building. Radar data exists but is hard to read.
3. Ground Pulse: screenshot of the LOS overlay with the scrubber. What NISAR GUNW shows.
4. Water and districts: screenshot of the water layer and the district panel. NISAR GCOV, fixed -19 dB threshold.
5. Site Scout: screenshot of the result card (Rojana, 26) and the evidence view. Sentinel-1 2017 to 2025.
6. How it works and what it does not claim: range-read NISAR windows, method in four steps, the limits list.
7. What comes next with NISAR, data and credits, AI use statement, links.

## Checklist before pressing "Submit for Judging"

- [ ] Demo link is public, 30 s or less (or 7 slides or fewer)
- [ ] Code repositories are public with an open-source licence (Apache 2.0 is the default if none is named)
- [ ] All fields in English; NASA data field filled
- [ ] AI use field filled; AI-assisted code acknowledged in the repositories
- [ ] References list every external resource
- [ ] Open the app in a private browser window on a phone and on a laptop
