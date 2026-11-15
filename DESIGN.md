# Bangkok Ground Watch: UI design spec

Next.js, plain CSS variables, MapLibre. One light theme. English default, Thai toggle. Buildable in a few hours.

## 1. Information hierarchy

First screen says, in 5 seconds: "NISAR radar shows how Bangkok's ground changed. Drag the date to see it move."

Visible by default (6 things only):
1. Full-bleed map with the LOS overlay on (latest date, ascending 112, opacity 85%).
2. Title chip, top-left: "Bangkok Ground Watch" + one line subtitle + data-status badge.
3. Layer switch (LOS / Water) and date scrubber with play.
4. Legend (compact bar).
5. District panel: top 10 by screening index.
6. Top-right: EN/TH toggle and "About the data".

Behind one tap:
- Track switch (A112 / D004) and opacity: in a "Display" popover (desktop: inline in the controls card, collapsed row; phone: popover above the dock).
- All 50 districts: "Show all 50" in the list.
- District detail: tap a row or a district on the map. It replaces the list in the same panel with a Back button.
- Caveats: "About the data" dialog. Never inline paragraphs.
- Index recipe, sources and licences: inside About.

Cut: 5-column table (list row has 3 items), always-on caveat paragraph, always-on opacity.

Map view decision (QA: the old 0.55 fill hid the radar): default "Radar" view = radar overlay is the hero and districts are outlines only (1px white at 70%, plus hover outline). A second view, "Districts", is a segmented control "Map view: Radar | Districts" inside the Display popover (desktop: collapsed Display row). In Districts view the radar overlay is hidden (never blended), and districts are filled by index with a sequential single-hue ramp at 0.8 opacity: #E3F0EF, #A9D3D0, #5FA8A4, #2F8885, #0B6E6E for index 0-20, 20-40, 40-60, 60-80, 80-100. Districts with no index get a diagonal hatch (grey #9AA3B2 on --surface, 1px lines, 6px pitch), never an empty hole. The date scrubber and layer switch are disabled in this view (disabled style) because they do not apply. Legend in this view: 5 swatches with numeric ranges in mono + a hatched swatch "No data". The choice is not persisted; every load starts in Radar.

Selected district: 3px accent outline on the map + map flyTo (600 ms, none under reduced motion).

## 2. Layout (map always fills the viewport; panels float on top)

Desktop 1440 (map 100vw x 100vh, 24px gutters):
```
+--------------------------------------------------------------+
| [Title chip + badge]                       [EN|TH] [About]   |
|                                                +------------+|
| [Layer: LOS|Water]                             | Districts  ||
| [Track  A112|D004]                             | 1 Phra N 88||
| [Opacity ---o--]        MAP + overlay          | 2 Dusit  70||
| [Legend]                                       | ... top 10 ||
|                                                | Show all 50||
|    [ play  |--o------ 19 Oct 2026 ]           +------------+|
+--------------------------------------------------------------+
```
Left card 296px wide, top 96px, holds layer, track, opacity, legend. Right panel 360px wide, top 24px under the toolbar row, max-height calc(100vh - 128px), list scrolls inside. Scrubber docked bottom center, 560px wide.

Desktop 1024: same, left card 264px, right panel 320px, and it starts closed. A "Districts" pill at right opens it as an overlay drawer (map is not resized). Scrubber 480px wide.

Phone 375 (design here first):
```
+-----------------------+
| Bangkok Ground Watch  |  top bar 56px: title, badge row below,
| [Badge]  [EN|TH] [i]  |  lang toggle, About (i)
|                       |
|        MAP            |
|                       |
| [legend bar]          |  legend sits above dock, left 16px, 160px wide
+-----------------------+
| [ LOS | Water ]       |  dock (fixed bottom, surface, radius 20 20 0 0)
| [>] ----o---- 19 Oct  |  row 1 layer, row 2 scrubber
| [Display] [Districts] |  row 3 two 44px buttons
+-----------------------+
```
"Districts" opens a bottom sheet at 70vh (grab handle, list, scroll). Tapping a row collapses it to 45vh showing the detail card and flies the map to the district. "Display" opens a popover with track and opacity. One sheet open at a time. 768px: dock becomes a 480px floating bottom-center card, sheet becomes the right drawer (320px).

Breakpoints: base (375), 768, 1024, 1440 using min-width.

## 3. Design tokens

```css
:root {
  --bg: #E8ECF1;            /* page and control face */
  --surface: #EEF1F6;       /* cards */
  --surface-glass: rgba(238,241,246,.94); /* floating panels over the map */
  --text: #1B2230;          /* 13:1 on bg */
  --muted: #475066;         /* 6.4:1 on bg, 7:1 on surface */
  --edge: #6F798B;          /* 3.5:1 on bg: control boundary */
  --accent: #0B6E6E;        /* 5.3:1 on bg, white on it 6.3:1 */
  --accent-ink: #FFFFFF;
  --focus: #0A4FBF;         /* 6:1 on bg */
  --ok-bg: #DDF1E4; --ok-ink: #14572F;     /* NISAR badge, 7:1 */
  --demo-bg: #FFF1D6; --demo-ink: #7A4300; /* DEMO badge, 7:1 */
  --sh-dark: #C3C9D4; --sh-light: #FFFFFF;
  --raised: 6px 6px 14px var(--sh-dark), -6px -6px 14px var(--sh-light);
  --raised-sm: 3px 3px 8px var(--sh-dark), -3px -3px 8px var(--sh-light);
  --inset: inset 4px 4px 8px var(--sh-dark), inset -4px -4px 8px var(--sh-light);
  --r-ctl: 12px; --r-card: 20px; --r-pill: 999px;
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px;
  --font: "IBM Plex Sans Thai", system-ui, sans-serif;   /* Latin + Thai in one family, Google Fonts, weights 400 500 600 */
  --mono: "IBM Plex Mono", ui-monospace, monospace;      /* all numbers */
  --t-cap: 12px; --t-sm: 14px; --t-body: 15px; --t-h3: 18px; --t-h2: 22px; --t-h1: 28px; /* h1 22px on phone */
  --lh: 1.6; --ease: cubic-bezier(.2,.8,.2,1); --dur: 160ms;
}
.raised { background: var(--surface); box-shadow: var(--raised); border-radius: var(--r-card); }
.pressed { background: var(--bg); box-shadow: var(--inset); }   /* selected segment track, slider track, active toggle */
```
Load fonts with next/font/google (subsets latin, thai).

Neumorphism contrast rules (the known problem):
- Shadows are decoration only. Every control also has a 1px `--edge` border (3:1), and state is never shadow-only: selected segment = `--accent` fill + `--accent-ink` text + check icon; unselected = raised with `--text`.
- Text is only `--text` or `--muted` on `--bg` or `--surface`. Never text on a map or on a shadow. Smallest text 12px, only legend ticks and badge; body 15px.
- Focus: `:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }` on every interactive element. Never remove it.
- Touch targets 44px minimum.
- Panels over the map use `--surface-glass` with `backdrop-filter: blur(12px)`, a 1px `rgba(27,34,48,.12)` border, and the raised shadow. They are 94% opaque, so text contrast is always computed against `--surface`, not the map. Base map: CARTO Positron raster (light, desaturated) so the overlay colours dominate. Attribution stays visible, bottom-right, above the dock.
- Slider thumb 24px, `--accent` fill, 2px white ring, 44px hit area. Track is `.pressed`, 8px high.

## 4. Components and states

Common states: default, hover (raised-sm to raised, translateY(-1px), 160ms ease), active (inset), focus (ring), disabled (text `--muted` at 100%, no shadow, dashed `--edge` border, `aria-disabled`). Disabled never relies on low opacity alone.

- **Layer switch** (segmented, 3 options, height 44): LOS | Backscatter | Water. LOS default. Backscatter and Water are data-driven: each renders disabled with a "Soon" tag while the manifest has no layer of that type, and enables itself when one exists. Use the manifest's layer `type` values; the engineer must confirm the grey backscatter layer has its own type (process_to_web.py writes the dB PNG but only the water layer is appended in the code I read). Switching swaps overlay with a 200ms opacity crossfade and resets the date to the latest for that layer.
- **Track switch** (segmented): "Ascending 112" / "Descending 4". Only tracks that have data for the layer are enabled. Changing track keeps the nearest date.
- **Date scrubber**: play/pause 44px round button, range input stepping over available dates for the layer+track (not calendar days), tick per date, current date in mono on the right ("19 Oct 2026"). Play advances 1 date per 900ms, stops at the last (no loop), button becomes pause. With one date only: scrubber hidden, date shown as plain text.
- **Opacity**: slider 20 to 100, step 5, default 85, mono value "85%". Label "Overlay opacity".
- **Legend (LOS)**: 12px-high bar, `linear-gradient(90deg,#3B4CC0 0%,#8DB0FE 25%,#DDDDDD 50%,#F49A7B 75%,#B40426 100%)` which matches `plt.cm.coolwarm` used in process_to_web.py. Ticks at -R, -R/2, 0, +R/2, +R in mm (mono 12px), R = `manifest.display_range_mm` (20 now; never hardcode). Caption under it: "LOS change, mm, relative to window mean". Second line: "Transparent = no coherent data". Values beyond range are clipped to the end colours; state that in About, not here.
- **Legend (Backscatter)**: 12px bar, grey ramp `linear-gradient(90deg,#000,#fff)` (matches `plt.cm.gray`). No fixed dB scale because each image is stretched on its own 2nd to 98th percentile. Ends labelled "Darker" and "Brighter" (mono dB underneath if the layer carries `db_lo` / `db_hi`; add those two numbers to process_to_web.py stats, they are already computed as `lo, hi`; if absent show words only, never invented numbers). Caption: "Radar backscatter, stretched per image. Compare shapes, not values across dates." Below: "Transparent = no data".
- **Legend (Water mask)**: single swatch, 20x20, `rgb(0,140,255)` at 65% opacity over `--surface`, 1px `--edge` border, then "Water" and, in mono, the layer's `threshold_db` ("below -23.0 dB"). No ramp, no ticks. Caption: "Water mask from radar backscatter. Threshold set per image." Below: "Transparent = not water or no data".
- **District row** (fixed min-height 56, grid: rank 24px | name 1fr | index 56px right-aligned). Name in English or Thai per language, second line `--muted` 14px "LOS -14.7 mm". Index is mono 18px 600 with a 4px bar under the name (width = index %, `--accent`). States: hover raised-sm, selected `.pressed` + 3px `--accent` left bar, no data (e.g. Nong Chok, no LOS): same height and grid as every row, name stays full strength, index column shows "No data" in `--muted` 14px (not mono, no zero, no dash), no bar, second line "No LOS on this track" in `--muted`; sorted to the bottom under a 1px `--edge` divider labelled "No data"; still tappable and opens a detail card (which shows "No data" for the missing stats, all other stats that exist stay visible). No red, no warning icon, no opacity fade. Default order: index descending; no other sort controls.
- **District detail card** (replaces list; Back button top-left 44px): name (h2) + other-language name (muted), big index "87.7" mono 28px with "/ 100" and label "Exposure screening index", then 4 stat rows (label muted, value mono right): "LOS change, mean" (mm, with "p10 to p90" line), "Water" (% or "No data"), "Population density" (per km2), "Building density" (OSM, per km2), plus "Coherent pixels" %. One sparkline only: district mean LOS per date, 240x48, `--accent` 2px line, last point dotted, hidden when fewer than 2 dates; carries `aria-label` text summary. Footer line, always: "Screening only. Not an assessment of any building."
- **Metric not available yet** (water stats until GCOV is processed): distinct from "No data". Row keeps its place (no layout shift, no hiding) and shows "Pending" as a dashed 1px `--edge` pill, 12px `--muted`, right-aligned, with `title`/aria "Waiting for GCOV processing". Rule: "Pending" = expected, will arrive; "No data" = not covered, will not arrive. While water is pending, the index footnote reads "Water not included yet" (index is shown anyway, computed on the available inputs). The Water stat's sparkline slot is simply absent. In the list, never show water.
- **Data-status badge** (pill, 28px high, 12px 600 text, icon + text): NISAR = `--ok-bg/--ok-ink` with check, "Processed NISAR values"; DEMO = `--demo-bg/--demo-ink` with warning triangle, "DEMO data, not NISAR". Source is `districts.json.source === "nisar"` AND layers non-empty. In DEMO mode the badge is also repeated on the legend caption.
- **Language toggle**: segmented EN|TH, 44px high, sets `<html lang>`, persists in localStorage, no reload. Thai uses the same font; line-height stays 1.6.
- **About dialog** (modal 560px max, full-height sheet on phone, close button + Esc, focus trapped): sections as short bullets (copy below), plus Sources and licences (NISAR GUNW/GCOV via ASF, OSM, MapLibre, CARTO, district boundary repo MIT). Nothing else in it.
- **Empty / missing data**: any null/NaN/undefined renders "No data" (muted). A district with no LOS in the selected track shows "No data" and "Not covered by this track". Map: if the overlay PNG 404s, toast chip "Overlay unavailable" at map top-center, 4s, no crash. Loading: skeleton shimmer on list rows only, no spinner overlays.

## 5. Copy (no em dashes anywhere, use "·", comma or hyphen)

| Key | EN | TH |
|---|---|---|
| title | Bangkok Ground Watch | Bangkok Ground Watch |
| subtitle | NISAR radar view of surface change | มุมมองการเปลี่ยนแปลงพื้นผิวจากเรดาร์ NISAR |
| layer.los | LOS change | การเปลี่ยนแปลง LOS |
| layer.water | Water | น้ำ |
| layer.soon | Soon | เร็วๆ นี้ |
| track.label | Orbit track | แนววงโคจร |
| track.A112 | Ascending 112 | ขาขึ้น 112 |
| track.D004 | Descending 4 | ขาลง 4 |
| date.label | Date | วันที่ |
| play / pause | Play / Pause | เล่น / หยุด |
| display | Display | การแสดงผล |
| opacity | Overlay opacity | ความทึบของชั้นข้อมูล |
| legend.los | LOS change, mm, relative to window mean | การเปลี่ยนแปลง LOS (มม.) เทียบค่าเฉลี่ยของพื้นที่ข้อมูล |
| legend.nodata | Transparent = no coherent data | โปร่งใส = ไม่มีข้อมูล coherent |
| layer.bs | Backscatter | ค่าการสะท้อน |
| legend.bs | Radar backscatter, stretched per image. Compare shapes, not values across dates. | ค่าการสะท้อนเรดาร์ ปรับช่วงสีรายภาพ เปรียบเทียบรูปร่าง ไม่ใช่ค่าข้ามวันที่ |
| legend.bs.lo / hi | Darker / Brighter | มืดกว่า / สว่างกว่า |
| legend.water | Water · backscatter below {x} dB | น้ำ · ค่าการสะท้อนต่ำกว่า {x} dB |
| legend.water.cap | Water mask from radar backscatter. Threshold set per image. | มาสก์น้ำจากค่าการสะท้อนเรดาร์ ตั้งเกณฑ์รายภาพ |
| legend.water.none | Transparent = not water or no data | โปร่งใส = ไม่ใช่น้ำหรือไม่มีข้อมูล |
| mapview | Map view | มุมมองแผนที่ |
| mapview.radar / districts | Radar / Districts | เรดาร์ / เขต |
| legend.districts | Exposure screening index | ดัชนีคัดกรองการสัมผัส |
| pending | Pending | รอดำเนินการ |
| pending.tip | Waiting for GCOV processing | รอการประมวลผล GCOV |
| index.noWater | Water not included yet | ยังไม่รวมข้อมูลน้ำ |
| row.noLos | No LOS on this track | ไม่มี LOS ในแนวนี้ |
| districts | Districts | เขต |
| districts.sub | Exposure screening, highest first | คัดกรองรายเขต เรียงจากสูงสุด |
| showAll | Show all 50 | ดูทั้ง 50 เขต |
| back | Back | กลับ |
| index | Exposure screening index | ดัชนีคัดกรอง |
| stat.los | LOS change, mean | การเปลี่ยนแปลง LOS ค่าเฉลี่ย |
| stat.range | p10 to p90 | p10 ถึง p90 |
| stat.water | Water | น้ำ |
| stat.pop | Population density | ความหนาแน่นประชากร |
| stat.bld | Building density (OSM) | ความหนาแน่นอาคาร (OSM) |
| stat.coh | Coherent pixels | พิกเซล coherent |
| unit.mm | mm | มม. |
| unit.km2 | per km2 | ต่อ ตร.กม. |
| screeningOnly | Screening only. Not an assessment of any building. | เป็นการคัดกรองเท่านั้น ไม่ใช่การประเมินอาคารใด |
| nodata | No data | ไม่มีข้อมูล |
| nodata.track | Not covered by this track | ไม่อยู่ในแนววงโคจรนี้ |
| overlay.fail | Overlay unavailable | ไม่สามารถโหลดชั้นข้อมูลได้ |
| badge.nisar | Processed NISAR values | ค่าที่ประมวลผลจาก NISAR |
| badge.demo | DEMO data, not NISAR | ข้อมูลตัวอย่าง ไม่ใช่ NISAR |
| about.open | About the data | เกี่ยวกับข้อมูล |
| about.close | Close | ปิด |
| about.1 | LOS is the change along the radar line of sight, relative to the mean of this data window. | LOS คือการเปลี่ยนแปลงตามแนวสายตาของเรดาร์ เทียบกับค่าเฉลี่ยของช่วงข้อมูลนี้ |
| about.2 | Values include atmospheric effects. | ค่าที่แสดงรวมผลของชั้นบรรยากาศ |
| about.3 | Positive is assumed to mean range increase (away from the satellite). This matches the derivation but is not yet confirmed against the NISAR specification. | สมมติว่าค่าบวกคือระยะเพิ่มขึ้น (ออกจากดาวเทียม) ตรงกับการไล่สูตร แต่ยังไม่ได้ยืนยันกับข้อกำหนดของ NISAR |
| about.4 | Only about 5 months of wet-season data, so no yearly rates are shown. | มีข้อมูลเพียงราว 5 เดือนในฤดูฝน จึงไม่แสดงอัตราต่อปี |
| about.5 | Grid is about 80 m. District values are averages and do not describe single buildings. | ความละเอียดราว 80 ม. ค่ารายเขตเป็นค่าเฉลี่ย ไม่ได้อธิบายอาคารรายหลัง |
| about.6 | The index is the average percentile rank (0 to 100) of water share, absolute LOS change and population density, using the indicators that have data. Building density (OpenStreetMap) is shown for context and depends on mapping completeness. | ดัชนีคือค่าเฉลี่ยของลำดับเปอร์เซ็นไทล์ (0 ถึง 100) ของสัดส่วนน้ำ ขนาดการเปลี่ยนแปลง LOS และความหนาแน่นประชากร โดยใช้เฉพาะตัวชี้วัดที่มีข้อมูล ความหนาแน่นอาคาร (OpenStreetMap) แสดงเพื่อประกอบเท่านั้น และขึ้นกับความครบถ้วนของแผนที่ |
| about.sources | Data sources and licences | แหล่งข้อมูลและสัญญาอนุญาต |

Dates: EN "19 Oct 2026", TH uses Buddhist year "19 ต.ค. 2569" via Intl `th-TH-u-ca-buddhist`. Numbers always western digits, mono.

## 6. Do not build

- Dark mode, theme switcher, or any second theme.
- Charts other than the one district sparkline. No bar charts, no time-series page.
- Onboarding tours, tooltips carousels, splash screens, intro animations.
- mm/yr, velocity, or trend rates anywhere. No words "subsidence", "uplift", "sinking", "risk", "safe", "danger".
- Choropleth fill over the radar overlay (fill exists only in the separate Districts view), building-level layers, search box, sort or filter controls, export, share, login.
- Coloured traffic-light severity for districts (index is a number and a bar only).
- Extra overlays beyond LOS, Backscatter and Water, drawing tools, 3D terrain, basemap switcher.
- A hardcoded colour range, date list, track list or district count: all come from manifest.json and districts.json.

## 7. Notes from the orchestrator (override anything above that conflicts)

- The index recipe in about.6 was checked against district_stats.py: mean of percentile ranks of water_max_pct, los_abs_mm and pop_density. Building density is not in the index.
- Backscatter is cut. The layer switch has 2 options only, LOS | Water. Ignore `gcov` layers in the manifest and skip the Backscatter legend and its copy rows. "Water" uses only layers of type `water`.
- The "Districts" map view from section 1 stays: Radar is the default on every load; Districts is the only place a choropleth fill appears, and it hides the radar overlay while active.
- A plane (ramp) was removed from each LOS image, which can also remove real regional signal. Add this as one more About bullet (EN: "A plane was removed from each image, which can also remove real regional signal." TH: "มีการลบระนาบ (ramp) ออกจากแต่ละภาพ ซึ่งอาจลบสัญญาณระดับภูมิภาคจริงออกไปด้วย").
- There is no demo mode in the Next.js app. Keep the badge component, but the DEMO state only appears if districts.json `source` is not "nisar" or carries `demo: true`.
- District row second line uses the district's summed LOS for the selected track (`los_sum_mm[track]`), with "No data" when null.

## 8. Mode: Site check (suitability screening for a factory with rooftop solar)

Same tokens, components, AA rules as sections 1 to 7. Sections 1 to 7 are unchanged and describe "Ground watch".

**Mode switch.** Segmented control "Ground watch | Site check", 44px, the first control in the app: desktop under the title chip (top-left), phone as row 2 of the top bar (full width, 343px). Mode lives in the URL (`?mode=site`), default Ground watch. Switching keeps the map camera, hides the other mode's panels, never reloads the page.

**Site check first screen.** Map is the hero (CARTO Positron). From `GET /v1/coverage`, each area is a rectangle from `bbox` [west, south, east, north]: 2px `--accent` outline, fill `--accent` at 10%, a name chip at its centre (14px 600, `--surface-glass`). Outside the rectangles the map is untouched, which is the message. Hidden in this mode: layer switch, scrubber, LOS legend, district panel and outlines. Status badge becomes "Provisional grades" (amber badge style).
- Desktop left card (296px, top 96px): h3 "Covered areas", one line instruction "Tap inside an outlined area to check a site.", then one 56px row per area (name, "2017 to 2025" mono muted, 44px "Go to area" icon button). Tap the row or button: `fitBounds(bbox, {padding: 48, duration: 600})`. Right: result panel (360px; 440px for evidence), empty until a tap.
- Phone: dock row 1 = the instruction (14px, muted), row 2 = horizontal scroll of one 44px chip per area (tap = fly), row 3 = "Display" button. Result opens the existing bottom sheet.
- Tap on the map inside any area drops the pin: 20px `--accent` dot, 3px white ring, raised shadow. Tap outside every area also drops a hollow pin (white fill, `--edge` ring). Keyboard: the map container is focusable, Enter on a focused area chip flies there; a "Use map centre" 44px button in the left card lets keyboard users check the centre point.

**Display popover in this mode.** Toggle "Show NISAR ground-motion overlay" (default off; when on: latest LOS layer, opacity 60%, LOS legend appears above the dock/left card). Beneath it, always: "NISAR ground motion is shown separately in Ground watch and is not part of the score."

**Result card (right panel / bottom sheet; sheet peeks at 45vh with score + grade visible).** Order is fixed:
1. Label "Suitability screening" (muted 14px). Score mono 56px/44px phone 600, "/ 100" muted. Grade pill beside it (text always present): Good = ok colours + check; Fair = demo colours + warning; Poor = `--bad-bg #FBE3E0`, `--bad-ink #8A1C12` (7:1) + minus-circle. Under: "Provisional grade" and "Confidence: medium" (14px).
2. **Urban flag banner** if `urban_flooding_not_detected`: full-width inside the card directly under the score, never collapsible, `--demo-bg`, 15px 600 `--demo-ink`, warning icon, 1px `--demo-ink` border. It outranks every other caveat.
3. Two component rows ("Flooding history" weight 70%, "Ground height" weight 30%), each: plain sentence (15px), muted second line, 4px bar = subscore. No other numbers.
4. "Things to know": the other flags, one row each, info icon, plain sentence (copy below). All shown, no accordion.
5. Secondary (14px, muted label, text value): Land cover, Sunshine. Then one line "Result is for the 80 m pixel around this point."
6. Primary button (the only accent-filled one): "See the evidence".
Flood sentence uses evidence counts when loaded ("Water seen in 0 of 130 wet-season radar passes"); until then it uses `flood.value` as a percentage. Evidence is fetched in parallel after the score and never blocks the card. A new tap aborts the previous requests.

**States** (same card shell, no layout jump):
- No point: instruction card (left card text; on phone the dock line).
- Loading: `aria-busy`, skeleton blocks for score, 2 rows; shimmer only.
- Result: above.
- Excluded (`score` null): "No score" 28px instead of the number, reason sentence per code in a neutral banner, land cover and evidence still shown, components and grade hidden.
- Outside coverage (404): title "Outside the covered areas", then the areas from the 404 list as rows with "Go to area". Hollow pin stays.
- API error: "Could not reach the site check service." + secondary "Try again" button; pin stays; no auto-retry.

**Evidence view** (replaces the card, Back at top-left; phone sheet to 90vh):
1. Claim sentence, 18px: "This score comes from {valid} wet-season radar passes. Water appeared in {n} of them at this point."
2. **Year strip**: 9 rows (2017 to 2025), year label mono 12px. Each scene is one mark in date order: wet-season scene = 10x16 rect, dry-season = 6x6 dot. No water = hollow with 1.5px `--edge` border; water = solid `--focus` fill. Legend line under the strip shows the three mark types with the same shapes. Row max 17 marks, so it fits 343px with 2px gaps. Tap or arrow keys select a mark (selected = 3px focus ring). Default selection: first water scene, else latest wet-season scene.
3. **Scene panel** (square 512px chip image, width 100%, `loading="lazy"`, alt text with date and result): segmented VV | VH, switch "Show water mask" (`overlay=water_mask`), crosshair is in the image. Lines (mono values): date, orbit, VV dB, VH dB, "Water: no (rule: VH below -18 dB)", link "Find this scene" (`source_url`, new tab). If `vh_db` is null show "No data" and hide VH.
4. **Layer chips**: row of 4 thumbnails 72px (Elevation, Water frequency, Land cover, Score). Tap shows it in the scene panel slot with value, source and a caption of the fixed colour scale. 
5. **Optical check** only if `optical_reference` is non-empty (otherwise the section is omitted entirely): Sentinel-2 true-colour thumbnails with date, "{n} days from the nearest radar pass", cloud %, and "Water seen" / "No water seen" / "Hidden by cloud".
6. "How this was made" disclosure: water rule, method version, run id, short scene-set hash, and the note that the scenes are a subset (wet season plus the first scene of Feb and Mar each year).

**Copy** (EN | TH)

| Key | EN | TH |
|---|---|---|
| mode.ground / mode.site | Ground watch / Site check | ติดตามพื้นดิน / ตรวจสถานที่ |
| badge.prov | Provisional grades | เกรดชั่วคราว |
| site.areas | Covered areas | พื้นที่ที่ครอบคลุม |
| site.hint | Tap inside an outlined area to check a site. | แตะในพื้นที่ที่มีเส้นขอบเพื่อตรวจสถานที่ |
| site.go | Go to area | ไปยังพื้นที่ |
| site.center | Use map centre | ใช้จุดกลางแผนที่ |
| site.overlay | Show NISAR ground-motion overlay | แสดงชั้นการเคลื่อนตัวของพื้นดินจาก NISAR |
| site.overlay.note | NISAR ground motion is shown separately in Ground watch and is not part of the score. | การเคลื่อนตัวของพื้นดินจาก NISAR แสดงแยกใน "ติดตามพื้นดิน" และไม่รวมในคะแนน |
| card.title | Suitability screening | การคัดกรองความเหมาะสมของที่ตั้ง |
| grade.good / fair / poor | Good / Fair / Poor | ดี / พอใช้ / ต่ำ |
| grade.prov | Provisional grade | เกรดชั่วคราว |
| conf | Confidence: {low / medium / high} | ความมั่นใจ: {ต่ำ / ปานกลาง / สูง} |
| comp.flood | Flooding history · 70% of score | ประวัติน้ำท่วม · 70% ของคะแนน |
| comp.flood.n | Water seen in {n} of {v} wet-season radar passes | พบน้ำใน {n} จาก {v} ครั้งที่เรดาร์ผ่านในฤดูฝน |
| comp.flood.pct | Water seen in {p}% of wet-season radar passes | พบน้ำใน {p}% ของครั้งที่เรดาร์ผ่านในฤดูฝน |
| comp.flood.years | Flooded in {p}% of years, 2017 to 2025 | ท่วมใน {p}% ของปี ช่วง 2017 ถึง 2025 |
| comp.elev | Ground height · 30% of score | ความสูงของพื้นที่ · 30% ของคะแนน |
| comp.elev.v | About {h} m above sea level | สูงจากระดับน้ำทะเลราว {h} ม. |
| comp.elev.p | Flood chance for this height: {p}% | โอกาสท่วมที่ความสูงนี้: {p}% |
| flag.urban | Built-up area. Radar can miss flooding between buildings, so this score may read too high. Do not rely on it alone. | พื้นที่ชุมชนหนาแน่น เรดาร์อาจมองไม่เห็นน้ำท่วมระหว่างอาคาร คะแนนนี้จึงอาจสูงเกินจริง ไม่ควรใช้เพียงอย่างเดียว |
| flag.veg | Radar can miss water under trees or crops, so flooding may be under-counted. | เรดาร์อาจมองไม่เห็นน้ำใต้ต้นไม้หรือพืชผล การท่วมอาจถูกนับต่ำกว่าจริง |
| flag.dsm | Height comes from a surface model, so it includes trees and buildings. | ความสูงมาจากแบบจำลองพื้นผิว จึงรวมต้นไม้และอาคาร |
| flag.water | Close to permanent water. Check this site on the ground. | อยู่ใกล้แหล่งน้ำถาวร ควรตรวจสอบหน้างาน |
| flag.edge | Near the edge of the covered area, so results are less reliable. | อยู่ใกล้ขอบพื้นที่ที่ครอบคลุม ผลจึงเชื่อถือได้น้อยลง |
| flag.few | Few wet-season radar passes here, so the evidence is thin. | มีภาพเรดาร์ฤดูฝนน้อย หลักฐานจึงบางกว่าปกติ |
| landcover / sun | Land cover / Sunshine | สิ่งปกคลุมดิน / แสงอาทิตย์ |
| sun.v | About {x} kWh/m2/day (NASA POWER). Not part of the score. | ราว {x} kWh/ตร.ม./วัน (NASA POWER) ไม่รวมในคะแนน |
| pixel | Result is for the 80 m pixel around this point. | ผลนี้เป็นของพิกเซลขนาด 80 ม. รอบจุดนี้ |
| evidence.open | See the evidence | ดูหลักฐาน |
| state.none | No score | ไม่มีคะแนน |
| excl.water_body | This point is on a water body. | จุดนี้อยู่บนแหล่งน้ำ |
| excl.other | This point is excluded by a screening rule ({code}). | จุดนี้ถูกคัดออกโดยกฎการคัดกรอง ({code}) |
| state.outside | Outside the covered areas | อยู่นอกพื้นที่ที่ครอบคลุม |
| state.outside.sub | Covered now: | ขณะนี้ครอบคลุม: |
| state.error | Could not reach the site check service. | เชื่อมต่อบริการตรวจสถานที่ไม่ได้ |
| retry | Try again | ลองอีกครั้ง |
| ev.claim | This score comes from {v} wet-season radar passes. Water appeared in {n} of them at this point. | คะแนนนี้มาจากภาพเรดาร์ฤดูฝน {v} ครั้ง พบน้ำที่จุดนี้ใน {n} ครั้ง |
| ev.key | Wet season, no water / Wet season, water / Dry season | ฤดูฝน ไม่พบน้ำ / ฤดูฝน พบน้ำ / ฤดูแล้ง |
| ev.water | Water: {yes / no} (rule: VH below -18 dB) | น้ำ: {ใช่ / ไม่ใช่} (เกณฑ์: VH ต่ำกว่า -18 dB) |
| ev.mask | Show water mask | แสดงมาสก์น้ำ |
| ev.find | Find this scene | ค้นหาภาพนี้ |
| ev.layers | Elevation / Water frequency / Land cover / Score | ความสูง / ความถี่น้ำ / สิ่งปกคลุมดิน / คะแนน |
| ev.optical | True-colour check (Sentinel-2) | ตรวจด้วยภาพสีจริง (Sentinel-2) |
| ev.optical.row | {n} days from the nearest radar pass · cloud {c}% | ห่างจากภาพเรดาร์ที่ใกล้สุด {n} วัน · เมฆ {c}% |
| ev.opt.yes / no / cloud | Water seen / No water seen / Hidden by cloud | พบน้ำ / ไม่พบน้ำ / ถูกเมฆบัง |
| ev.method | How this was made | วิธีที่ใช้ |
| ev.subset | Scenes are a subset: the wet season plus the first scene of February and March each year. | ภาพเป็นส่วนย่อย: ฤดูฝนทั้งหมดและภาพแรกของเดือน ก.พ. และ มี.ค. ของแต่ละปี |

Land cover labels: show the API label capitalised in EN; TH map: tree cover ต้นไม้ปกคลุม, shrubland ไม้พุ่ม, grassland ทุ่งหญ้า, cropland พื้นที่เพาะปลูก, built-up พื้นที่ก่อสร้าง, bare / sparse vegetation พื้นที่โล่งหรือพืชบาง, snow and ice หิมะและน้ำแข็ง, permanent water bodies แหล่งน้ำถาวร, herbaceous wetland พื้นที่ชุ่มน้ำ, mangroves ป่าชายเลน, moss and lichen มอสและไลเคน; unknown label shown as is.
Wording rules: never "safe", "risk-free", "guaranteed", "approved". Grades are always labelled provisional.

**Do not build (Site check).** Draw or upload polygons, address search, geocoding, the area endpoint (`POST /v1/suitability/area`), comparing or saving sites, PDF or CSV export, a score history or any chart besides the year strip, user-adjustable weights or thresholds, a ranking of sites, a solar yield or payback estimate (irradiance is context only), colouring the map by score, mixing the NISAR overlay into the score, new areas beyond `/v1/coverage`, any claim of building or structural safety.

## 9. Flow and sign-in

Sections 1 to 8 stay. This section overrides one item in section 8: saving sites is now allowed (My sites, below), and only that.

**Honesty rule.** "Sign-in" is a display name stored in this browser (localStorage). It is never called an account, never "secure". No email, no password, no verification. One line, shown on entry and in the user menu: "A display name, not an account. No password. It stays on this device."

### 1. Flow

```
bare URL, first visit        bare URL, later visit         ?mode=ground | ?mode=site
        |                            |                              |
   [A Entry]  --guest/name-->  [B Start]  <--title tap--  (skips A and B)
        |  (one name field)     greeting + 2 big cards                |
        +-----------------------> choose mode ----------------------+
                                       |
                              [C Mode: Ground watch | Site check]   main action: scrub date / tap a site
                                       |
                              [D Detail: district card | result card]  main action: See the evidence / Save
                                       |
                              [E Evidence view]   main action: pick a scene mark
Back at every step: E -> D (Back) -> C (Back/Close) -> B (tap title) -> A ("Not you? Use another name").
```
- A and B are one "gate" layer with two steps (one component, one engineer-hour saved). Esc or tapping outside the gate = "Continue as guest" and goes to B.
- **Deep links skip the gate.** Reason: judges open `?mode=site` cold and must see the product in one second; a gate in front of a deep link is a login wall in disguise. A visitor who skipped via a deep link still sees A once on their next bare-URL visit (the "seen" flag is set only when A is answered).
- **Returning visitor** (name or guest choice saved): skips A, lands on B. Heading "Welcome back, {name}" and the card for their last mode carries a "Last used" tag and gets initial focus. B never auto-skips: one tap always, so the user knows where they are.
- 5-second rule: each step has one accent-filled button or one obvious choice. A: "Continue" (guest is the equal-weight secondary). B: two cards. C: see section 1 to 8. D: "See the evidence". E: none, the year strip is the focus.

### 2. Entry (step A)

Map stays visible behind, dimmed: scrim `rgba(232,236,241,.72)` + `backdrop-filter: blur(6px)`. It costs nothing (the map is already loading) and shows what is behind the door. The gate card is opaque `--surface`, raised, so contrast is against `--surface` only.
- 1440: card 440px wide, centred, padding `--s6`. 375: card is a bottom sheet, full width, radius 20 20 0 0, padding `--s5` `--s4`, no autofocus (keeps the keyboard closed).
- Top-right of the card: language toggle EN|TH (same component). Content top to bottom: title "Bangkok Ground Watch" (h2), one line "NISAR radar and satellite flood history for Bangkok.", label "Your name" (15px 500, always visible), one text input (44px, `.pressed` inset, 1px `--edge`), helper line in `--muted` 14px, primary button "Continue" (full width, accent), secondary raised button "Continue as guest" (full width, same height, same size, no smaller text), then the honesty line (14px `--muted`, with a small info icon).
- Rules: trim leading/trailing spaces; collapse inner runs of spaces to one; 2 to 24 characters after trimming; allowed: letters in any script (Thai included, marks allowed), digits, space, `.` `_` `-`. Regex `/^[\p{L}\p{N}\p{M} ._-]{2,24}$/u`. Validate on submit, then on every keystroke once an error showed. Empty submit: error "Enter a name, or continue as guest." (never silently guest). Storage key is the name lower-cased and NFC-normalised, so "Nok" and "nok" are one person; display keeps what was typed.
- Error style: `--bad-ink` text with an icon under the field, 2px `--bad-ink` border, `aria-invalid`, `aria-describedby`, `role="alert"`. Enter submits.

### 3. What the name does

Storage: `bgw:user` (current key, absent = guest), `bgw:seen`, `bgw:u:{key}` = `{name, mode, lang, sites[]}`, `bgw:guest` = `{mode, lang}`. Wrap every access in try/catch; if storage fails the app works as guest and the entry says nothing extra.
- **User chip** (44px pill, `--raised-sm`): name truncated to 12 characters + chevron; guest shows "Guest". Opens a menu (popover, `--surface`, 220px, rows 44px): header with the full name or "Guest"; "My sites"; "Switch user"; "Sign out" (guest: "Add a name"); the honesty line. Phone: chip is icon-only (person icon, 44px) and its menu also holds "About the data".
- **Sign out**: confirm dialog "Sign out of {name}? Your saved sites stay on this device. Use the same name to see them again." Buttons "Sign out" (primary) and "Cancel". Removes `bgw:user` only; data stays. "Switch user" opens step A as a dialog.
- **Save button** on the Site check result card, secondary raised, bookmark icon, next to (below on phone) the primary "See the evidence". Hidden when `score` is null. Saved state: pressed, check icon, text "Saved", tap again removes. Saved record: `{id, lat, lng, areaId, areaName, score, grade, savedAt}`; same point (rounded to 4 decimals) updates in place; max 50, oldest dropped silently. Guest tap: opens step A as a dialog titled "Add a name to save sites"; after Continue the save completes; Guest/Esc closes with nothing saved.
- **My sites**, Site check only. Desktop: a section "My sites" in the left card under "Covered areas", first 3 rows, then "Show all {n}". Phone: dock row 3 becomes "Display | My sites"; the sheet lists all. Row (56px): area name (15px) + saved date (muted 14px); right: score mono 18px + small grade pill; 44px remove icon button. Tap row = fly to the point (zoom 13, 600ms), drop the pin, run a fresh check and open the result card (the row shows the saved snapshot, the card shows the current result). Remove is instant with a 5s "Removed. Undo" toast.
- **Empty state, signed in**: bookmark icon 32px muted, "No saved sites yet", "Check a site, then tap Save to keep it here." **Empty state, guest**: "Add a name to save sites. Guests can still check sites." + secondary button "Add a name".
- **Remembered per user**: last mode and language. Guests: same, under `bgw:guest`. Language still applies instantly everywhere.

### 4. Start (step B)

Same gate layer over the dimmed map. Heading (h2) greeting, then two large choice cards (min-height 200px desktop, side by side 280px each; phone stacked, 120px each, full width, 44px+ targets, whole card is one button). Card: 32px inline-SVG icon in `--accent` (radar waves; map pin with a water drop), title (h3), one line (15px), data line (mono 12px `--muted`).
- Ground watch: "See how the ground moved under Bangkok" / "NISAR radar · from Oct 2026 · 50 districts".
- Site check: "Check a site for flooding history" / "Sentinel-1 radar · 2017 to 2025 · pre-processed areas".
- Choosing a card: gate fades out in 160ms (`--ease`; none under reduced motion), map undims, mode is set, focus moves to the mode switch. Signed-in line under the cards: "Not you? Use another name"; guest line: "Playing as guest · Add a name".
- Return to B any time: tap or press the title chip (a real button, `aria-label` "Back to start").

### 5. Navigation placement (same at every step)

| Element | 1440 / 1024 | 768 | 375 |
|---|---|---|---|
| Title chip (tap = start) | top-left | top-left | top bar row 1, left |
| Mode switch | under title chip | under title chip | top bar row 2, full width |
| Language EN/TH | top-right | top-right | top bar row 1, right |
| About the data | top-right button | top-right button | inside user menu |
| User chip | top-right, last | top-right, last | top bar row 1, far right, icon only |
| Back | top-left of the panel | top-left of the panel | top-left of the sheet |
| Close (x) | top-right of dialogs and drawers | same | top-right of sheets, dialogs |
Esc closes the topmost layer (menu, dialog, evidence, panel) one at a time. Focus returns to the control that opened it.

### 6. Copy (EN | TH)

| Key | EN | TH |
|---|---|---|
| gate.lead | NISAR radar and satellite flood history for Bangkok. | ข้อมูลเรดาร์ NISAR และประวัติน้ำท่วมจากดาวเทียมสำหรับกรุงเทพฯ |
| name.label | Your name | ชื่อของคุณ |
| name.ph | For example: Nok | เช่น นก |
| name.help | 2 to 24 characters. Letters, numbers, space . _ - | 2 ถึง 24 ตัวอักษร ใช้ตัวอักษร ตัวเลข เว้นวรรค . _ - ได้ |
| name.empty | Enter a name, or continue as guest. | กรอกชื่อ หรือเลือกใช้งานแบบผู้เยี่ยมชม |
| name.short | Use at least 2 characters. | ใช้อย่างน้อย 2 ตัวอักษร |
| name.long | Use 24 characters or fewer. | ใช้ไม่เกิน 24 ตัวอักษร |
| name.chars | Use letters, numbers, space . _ - only. | ใช้ได้เฉพาะตัวอักษร ตัวเลข เว้นวรรค . _ - |
| continue | Continue | ดำเนินการต่อ |
| guest | Continue as guest | ใช้งานแบบผู้เยี่ยมชม |
| honest | A display name, not an account. No password. It stays on this device. | เป็นเพียงชื่อที่แสดง ไม่ใช่บัญชี ไม่มีรหัสผ่าน และเก็บไว้ในอุปกรณ์นี้เท่านั้น |
| hello | Hello, {name} | สวัสดี {name} |
| welcome | Welcome back, {name} | ยินดีต้อนรับกลับ {name} |
| start.guest | Choose what to explore | เลือกสิ่งที่ต้องการสำรวจ |
| start.ground | See how the ground moved under Bangkok | ดูว่าพื้นดินใต้กรุงเทพฯ เคลื่อนตัวอย่างไร |
| start.ground.data | NISAR radar · from Oct 2026 · 50 districts | เรดาร์ NISAR · ตั้งแต่ ต.ค. 2569 · 50 เขต |
| start.site | Check a site for flooding history | ตรวจประวัติน้ำท่วมของสถานที่ |
| start.site.data | Sentinel-1 radar · 2017 to 2025 · pre-processed areas | เรดาร์ Sentinel-1 · 2560 ถึง 2568 · พื้นที่ที่ประมวลผลแล้ว |
| lastUsed | Last used | ใช้ล่าสุด |
| notYou | Not you? Use another name | ไม่ใช่คุณ? ใช้ชื่ออื่น |
| playingGuest | Playing as guest · Add a name | กำลังใช้แบบผู้เยี่ยมชม · เพิ่มชื่อ |
| toStart | Back to start | กลับไปหน้าเริ่มต้น |
| user.guest | Guest | ผู้เยี่ยมชม |
| user.switch | Switch user | เปลี่ยนผู้ใช้ |
| user.signout | Sign out | ออกจากระบบ |
| user.add | Add a name | เพิ่มชื่อ |
| signout.q | Sign out of {name}? Your saved sites stay on this device. Use the same name to see them again. | ออกจากระบบของ {name}? สถานที่ที่บันทึกไว้ยังอยู่ในอุปกรณ์นี้ ใช้ชื่อเดิมเพื่อดูอีกครั้ง |
| cancel | Cancel | ยกเลิก |
| save | Save | บันทึก |
| saved | Saved | บันทึกแล้ว |
| save.gate | Add a name to save sites | เพิ่มชื่อเพื่อบันทึกสถานที่ |
| my.title | My sites | สถานที่ของฉัน |
| my.all | Show all {n} | ดูทั้งหมด {n} |
| my.empty | No saved sites yet | ยังไม่มีสถานที่ที่บันทึก |
| my.empty.sub | Check a site, then tap Save to keep it here. | ตรวจสถานที่ แล้วแตะ "บันทึก" เพื่อเก็บไว้ที่นี่ |
| my.guest | Add a name to save sites. Guests can still check sites. | เพิ่มชื่อเพื่อบันทึกสถานที่ ผู้เยี่ยมชมยังตรวจสถานที่ได้ |
| my.remove | Remove | ลบ |
| my.removed | Removed. Undo | ลบแล้ว เลิกทำ |
| my.saved | Saved on {date} | บันทึกเมื่อ {date} |

### 7. Do not build (flow and sign-in)

Passwords, email or phone fields, "forgot password", any server account or API call for sign-in, social or SSO sign-in, profile pages, avatars or photos, name uniqueness checks, a "delete my data" screen, sharing or exporting saved sites, sync across devices, onboarding tours inside the gate, a third gate step, remembering the gate answer across a deep link, analytics on names. Any word like "secure", "account", "log in", "register" in copy.

### 8. Notes from the orchestrator (override anything above in section 9 that conflicts)

- The Ground watch card data line must be derived from the manifest, not hardcoded: "NISAR radar · {first month} to {last month} {year} · 50 districts" (currently Jun to Nov 2026). The Site check data line takes its years from `/v1/coverage` `date_range`.
- When `NEXT_PUBLIC_SITING_API` is unset, the Start step shows only the Ground watch card (or skips straight to Ground watch), and My sites and Save do not exist.
- Thai copy uses "สถานที่" for "site" (already replaced in the table above).
- Per-row Remove in My sites is the only delete path. No separate delete screen.

## 10. Landing page and area detail

Routing (fixed): `/` = landing, `/app/` = the app (sections 1 to 9 unchanged). An inline script at the top of the landing page runs before paint: if `location.search` has `mode=`, `location.replace('/app/' + location.search + location.hash)`. New params: `?mode=ground&d=<dcode>` (district open), `?mode=site&area=<id>` (fly to a coverage area). Add token `--t-display: 44px` (32px under 768).

### A. Landing page (one scroll, no carousel, no stock images, no logos, no testimonials)

**Gate relation.** The landing page never asks for a name. "Open the app" goes to `/app/`, where the section 9 gate (name or guest, then Start) appears exactly as today. Deep links from the landing page (`/app/?mode=...`) skip the gate (section 9).

**Top bar** (sticky, `--surface-glass`, 56px): wordmark left (text only); right: EN|TH toggle, then, at 768 and up, a raised secondary "Open the app" button. The user chip (section 9 component and menu) appears only when a saved name exists; guests see no chip. On 375: wordmark + EN|TH (+ chip icon when signed in); no top-bar button (the hero has it).

**Hero visual: one real screenshot, not a live map.** Reason: no MapLibre or tile load on the first page, no failure mode, and it renders instantly. Capture `/app/?mode=ground` with headless Chrome at 1600x1000 (LOS overlay on, a district open is not needed, status badge "Processed NISAR values" visible, no DEMO). Save as `public/landing/hero.webp` (about 200 KB) plus `hero-800.webp`; `<img srcset>`, `width/height` set, `alt` = "Screenshot of the Bangkok Ground Watch app showing radar ground change over Bangkok". Framed in a `.raised` card, radius 20, no browser chrome mock. It is not a link.

**Layout.** Content max-width 1120, gutters 24 (16 on 375), section spacing 96px (56px on 375). Page background `--bg`; cards `--surface` raised.
- 1440 hero: two columns, text 5/12, screenshot 7/12, vertically centred. 375 hero: text, buttons, then screenshot, all stacked; both buttons full width, primary first.
- Section 2 cards: two columns at 768 and up, stacked on 375. Section 3: two columns at 768 and up. Section 4: 4 numbered steps in a row at 1440, 2x2 at 768, stacked at 375. Section 5: single column, max 720px.
- Heading h1 `--t-display` 600; section headings `--t-h2`; body `--t-body`; all numbers `--mono`.

**Sections**
1. Hero: h1 name, promise sentence, primary "Open the app" (to `/app/`), secondary "How it works" (anchor `#how`, smooth scroll, none under reduced motion), a muted line "NASA Space Apps Challenge 2026 · Dancing with the SARs".
2. What you can do: two cards, each a link to its deep link (whole card is one `<a>`, 44px+ target, hover raised-sm, focus ring): icon, title, one line, a real example in mono, "Open Ground watch" / "Open Site check" text with arrow. Ground: "50 districts · 17 radar pairs". Site check: two example rows, "Rojana industrial park, Ayutthaya: 26, Poor" and "Krathum Baen, Samut Sakhon: 88, Good", then the muted "Provisional grades".
3. What the data covers: two columns. Each column: "Covered" list (check icon) and "Not covered" list (minus icon, `--muted`). Under the Ground column a native `<select>` (44px) "Jump to a district" (50 options in the current language, from `districts.json`; change = navigate to `/app/?mode=ground&d=<dcode>`). Under the Site column, area chips from `GET /v1/coverage` (never hardcoded), each a link to `/app/?mode=site&area=<id>`; if the fetch fails or is slow (3s), show "Covered areas load inside the app." If a Bangkok area is present it appears as a chip and the line "Bangkok: in progress" is not rendered; if absent, that line is rendered in "Not covered".
4. How it works (`id="how"`): 4 steps, number in mono 28px `--accent`, one line each.
5. Honest limits: 4 bullets, then a text link "Full details: About the data" (opens `/app/` About dialog via `?about=1`; engineer: tiny param).
Footer (`--bg`, 1px top `--edge`): data credits, open source line with repo link, AI-use note, not-affiliated line. Links are underlined, 44px tall rows on 375.

### B. District detail (Ground watch)

**Opening.** Map tap on a district (add a transparent fill layer, `fill-opacity: 0`, for hit testing; the radar stays the hero), tap on a list row, URL `?d=<dcode>` at load, landing page district picker. Opening flies to the district (600ms) and draws the 3px accent outline. The URL updates with `history.replaceState` to `?mode=ground&d=<dcode>`; closing removes `d`. An unknown `d` is ignored. Esc and Back close it.

**Container.** Desktop 1440: right panel 400px (replaces the list in place, section 1 pattern). 1024: 360px drawer. Phone: bottom sheet, 45vh peek (header, index, one-line summary), drag or tap the handle to 90vh. Content scrolls inside; Back top-left, Close top-right.

**Order and what is hidden.** Always visible: header, Ground block. Behind a tap: Water and People and buildings are disclosure rows (44px+ high, chevron, `aria-expanded`), collapsed by default, each showing its key number in the closed row. "Check a site here" is last.
1. **Header**: name in current language (h2) and the other language (muted); "Exposure screening index" label; index mono 40px with "/ 100"; pill "Rank {r} of {n}" (n = districts that have an index). No index: "No data" and no rank.
2. **Ground block** (title "Ground"): two rows, one per track, "Total LOS change, {start} to {end}" with mono value in mm (`los_sum_mm`-style cumulative per track; a missing track shows "No data"; an unavailable-yet value shows "Pending"). The selected track (global track switch) is marked with the pressed style. Then **chart 1**: mean LOS per radar pair on the selected track. Inline SVG 360x120, `--accent` 2px line with 4px dots, p10 to p90 as a 15% `--accent` band, dashed zero line in `--edge`, y labels min and max mm, x labels first and last date (mono 12px). Tap or arrow-key a dot: a readout line under the chart shows "{date} · mean {m} mm · p10 to p90 {a} to {b} mm". The SVG has `role="img"` and an `aria-label` summary ("Mean LOS on {track}, {n} pairs, from {first} mm to {last} mm"), plus a visually hidden table of the same numbers. If the selected track has no data (Nong Chok on ascending 112): replace the chart with "No data on this track" and a raised button "Show descending 4". Then **usable pixels**: "Usable radar signal: {p}%" with a 4px bar. If p is under 50: the sentence "Only {p}% of this district gives a usable radar signal, often because of farmland or open water. Read these values with care." in an amber note (`--demo-bg`, icon + text).
3. **Water row** ("Water · highest {max}% of the district"; expanded): **chart 2**, 19 per-date bars (8px wide, 2px gap, height = water %, `--focus` fill, hollow `--edge` stub for 0), same readout and text-summary rules, then the caveat "Waterlogged land and wet fields can look like water to radar, so this is not only flooding." Pending state: the row shows "Pending", no chart.
4. **People and buildings row** ("People and buildings · {pop} people"; expanded): rows for Population, Population density (per km2), OSM buildings (count), Building density (per km2), Area (km2), then the caveat "OpenStreetMap building counts can be incomplete, especially outside the centre."
5. **Check a site here**: secondary raised button, shown only if the district centre lies inside a coverage bbox from `/v1/coverage`; otherwise not rendered (no disabled ghost). It switches to Site check (`mode=site`), flies to the district centre at zoom 12, drops the pin and runs the check.
Charts: inline SVG only, hand-written, two total, no library. Colours never carry meaning alone (line vs band vs dashed zero; filled vs hollow bars).

### C. Copy (EN | TH)

| Key | EN | TH |
|---|---|---|
| land.promise | Satellite radar shows how Bangkok's ground changes and where floodwater has been. | เรดาร์จากดาวเทียมแสดงว่าพื้นดินในกรุงเทพฯ เปลี่ยนไปอย่างไร และน้ำเคยท่วมที่ใดบ้าง |
| land.open | Open the app | เปิดแอป |
| land.how | How it works | วิธีการทำงาน |
| land.challenge | NASA Space Apps Challenge 2026 · Dancing with the SARs | NASA Space Apps Challenge 2026 · Dancing with the SARs |
| land.do | What you can do | คุณทำอะไรได้บ้าง |
| land.ground.t | Ground watch | ติดตามพื้นดิน |
| land.ground.l | See how the ground moved under each Bangkok district, and where radar saw surface water. | ดูว่าพื้นดินของแต่ละเขตในกรุงเทพฯ เคลื่อนตัวอย่างไร และเรดาร์พบน้ำผิวดินที่ใด |
| land.ground.ex | 50 districts · 17 radar pairs | 50 เขต · เรดาร์ 17 คู่ภาพ |
| land.ground.cta | Open Ground watch | เปิดติดตามพื้นดิน |
| land.site.t | Site check | ตรวจสถานที่ |
| land.site.l | Tap a point to see its flooding history from 9 years of radar, with the scenes behind the score. | แตะจุดหนึ่งเพื่อดูประวัติน้ำท่วมจากเรดาร์ 9 ปี พร้อมภาพที่อยู่เบื้องหลังคะแนน |
| land.site.ex1 | Rojana industrial park, Ayutthaya: 26, Poor | นิคมอุตสาหกรรมโรจนะ อยุธยา: 26 ต่ำ |
| land.site.ex2 | Krathum Baen, Samut Sakhon: 88, Good | กระทุ่มแบน สมุทรสาคร: 88 ดี |
| land.site.cta | Open Site check | เปิดตรวจสถานที่ |
| land.covers | What the data covers | ข้อมูลครอบคลุมอะไรบ้าง |
| cov.ground | Ground watch · NISAR | ติดตามพื้นดิน · NISAR |
| cov.g1 | All 50 Bangkok districts, 17 radar pairs, 21 Jun to 31 Oct 2026 | ทั้ง 50 เขต เรดาร์ 17 คู่ภาพ 21 มิ.ย. ถึง 31 ต.ค. 2569 |
| cov.g2 | Two tracks: ascending 112 (49 of 50 districts), descending 4 (50 of 50) | สองแนววงโคจร: ขาขึ้น 112 (49 จาก 50 เขต) ขาลง 4 (50 จาก 50 เขต) |
| cov.g3 | Surface water from 19 radar scenes, Jul to Nov 2026, all 50 districts | น้ำผิวดินจากภาพเรดาร์ 19 ภาพ ก.ค. ถึง พ.ย. 2569 ทั้ง 50 เขต |
| cov.g4 | Grid about 80 m | ความละเอียดราว 80 ม. |
| cov.gn1 | Nong Chok has no ascending data. The rural east (Lat Krabang, Khlong Sam Wa, Nong Chok, Min Buri) has only 14 to 46% usable pixels, against about 98% in dense inner districts. | หนองจอกไม่มีข้อมูลขาขึ้น ฝั่งตะวันออกที่เป็นชนบท (ลาดกระบัง คลองสามวา หนองจอก มีนบุรี) มีพิกเซลใช้ได้เพียง 14 ถึง 46% เทียบกับราว 98% ในเขตชั้นใน |
| cov.gn2 | No yearly rates, no single buildings | ไม่มีอัตราต่อปี และไม่ระบุอาคารรายหลัง |
| cov.jump | Jump to a district | ไปยังเขต |
| cov.site | Site check · Sentinel-1 | ตรวจสถานที่ · Sentinel-1 |
| cov.s1 | 9 years of Sentinel-1 radar, 2017 to 2025, about 150 scenes per area | เรดาร์ Sentinel-1 9 ปี 2560 ถึง 2568 ราว 150 ภาพต่อพื้นที่ |
| cov.s2 | Live areas: | พื้นที่ที่พร้อมใช้งาน: |
| cov.sn1 | Only the listed areas. Anywhere else returns "outside the covered areas". | เฉพาะพื้นที่ที่แสดง จุดนอกพื้นที่จะแจ้งว่า "อยู่นอกพื้นที่ที่ครอบคลุม" |
| cov.sn2 | Bangkok: in progress | กรุงเทพฯ: กำลังจัดทำ |
| cov.sn3 | No claim about any building's safety | ไม่รับรองความปลอดภัยของอาคารใด |
| cov.loading | Covered areas load inside the app. | พื้นที่ที่ครอบคลุมจะโหลดในแอป |
| cov.yes / cov.no | Covered / Not covered | ครอบคลุม / ไม่ครอบคลุม |
| how.1 | Radar satellites image the ground through cloud, day and night. | ดาวเทียมเรดาร์ถ่ายภาพพื้นดินได้ทะลุเมฆ ทั้งกลางวันและกลางคืน |
| how.2 | We compare passes to measure change along the radar's line of sight, and mark where water shows up. | เราเทียบภาพแต่ละรอบเพื่อวัดการเปลี่ยนแปลงตามแนวสายตาของเรดาร์ และทำเครื่องหมายที่พบน้ำ |
| how.3 | We average the results per district, or per 80 m point for a site. | เราหาค่าเฉลี่ยรายเขต หรือรายจุดขนาด 80 ม. สำหรับสถานที่ |
| how.4 | You can open the evidence: every score links to the scenes behind it. | คุณเปิดดูหลักฐานได้ ทุกคะแนนเชื่อมไปยังภาพที่ใช้คำนวณ |
| lim.t | Honest limits | ข้อจำกัดที่ควรรู้ |
| lim.1 | Ground change is along the radar line of sight, relative to the window mean, includes atmosphere, and its sign is not yet confirmed. | การเปลี่ยนแปลงของพื้นดินวัดตามแนวสายตาของเรดาร์ เทียบกับค่าเฉลี่ยของช่วงข้อมูล รวมผลชั้นบรรยากาศ และยังไม่ยืนยันเครื่องหมาย |
| lim.2 | The record is short (Jun to Oct 2026), so there are no yearly rates. | ข้อมูลสั้น (มิ.ย. ถึง ต.ค. 2569) จึงไม่มีอัตราต่อปี |
| lim.3 | Values describe an 80 m area, not a building. This is screening only. | ค่าที่แสดงเป็นของพื้นที่ 80 ม. ไม่ใช่อาคาร เป็นการคัดกรองเท่านั้น |
| lim.4 | Radar can miss floodwater between buildings and under trees. Site grades are provisional. | เรดาร์อาจมองไม่เห็นน้ำท่วมระหว่างอาคารและใต้ต้นไม้ เกรดของสถานที่เป็นเกรดชั่วคราว |
| lim.more | Full details: About the data | รายละเอียดทั้งหมด: เกี่ยวกับข้อมูล |
| foot.credits | Data: NISAR GUNW and GCOV via ASF · Sentinel-1 and Sentinel-2 (ESA, Copernicus) · Copernicus DEM · ESA WorldCover · NASA POWER · OpenStreetMap · base map CARTO · MapLibre | ข้อมูล: NISAR GUNW และ GCOV ผ่าน ASF · Sentinel-1 และ Sentinel-2 (ESA, Copernicus) · Copernicus DEM · ESA WorldCover · NASA POWER · OpenStreetMap · แผนที่ฐาน CARTO · MapLibre |
| foot.oss | Open source. Code and licences: {repo} | โอเพนซอร์ส โค้ดและสัญญาอนุญาต: {repo} |
| foot.ai | Built with AI assistance (Claude). AI-generated code is noted in the repository. | สร้างโดยใช้ AI ช่วย (Claude) โค้ดที่ AI สร้างมีระบุไว้ในที่เก็บโค้ด |
| foot.na | Not affiliated with or endorsed by NASA. | ไม่ได้เกี่ยวข้องหรือได้รับการรับรองจาก NASA |
| user.home | Project home | หน้าโครงการ |
| d.rank | Rank {r} of {n} | อันดับ {r} จาก {n} |
| d.ground | Ground | พื้นดิน |
| d.total | Total LOS change, {start} to {end} | ระยะ LOS เปลี่ยนรวม {start} ถึง {end} |
| d.usable | Usable radar signal: {p}% | สัญญาณเรดาร์ที่ใช้ได้: {p}% |
| d.lowUsable | Only {p}% of this district gives a usable radar signal, often because of farmland or open water. Read these values with care. | มีเพียง {p}% ของเขตนี้ที่ให้สัญญาณเรดาร์ใช้ได้ มักเพราะเป็นพื้นที่เกษตรหรือผิวน้ำ โปรดอ่านค่าอย่างระมัดระวัง |
| d.noTrack | No data on this track | ไม่มีข้อมูลในแนวนี้ |
| d.showDesc | Show descending 4 | แสดงขาลง 4 |
| d.chart1 | Mean LOS per radar pair, band = p10 to p90 | ค่าเฉลี่ย LOS ต่อคู่ภาพเรดาร์ แถบ = p10 ถึง p90 |
| d.readout | {date} · mean {m} mm · p10 to p90 {a} to {b} mm | {date} · เฉลี่ย {m} มม. · p10 ถึง p90 {a} ถึง {b} มม. |
| d.water | Water · highest {max}% of the district | น้ำ · สูงสุด {max}% ของเขต |
| d.waterCaveat | Waterlogged land and wet fields can look like water to radar, so this is not only flooding. | พื้นที่น้ำขังและทุ่งที่เปียกอาจดูเหมือนน้ำในภาพเรดาร์ จึงไม่ได้แสดงเฉพาะน้ำท่วม |
| d.people | People and buildings · {pop} people | ผู้คนและอาคาร · {pop} คน |
| d.pop | Population | ประชากร |
| d.area | Area (km2) | พื้นที่ (ตร.กม.) |
| d.osm | OSM buildings | อาคารใน OSM |
| d.osmCaveat | OpenStreetMap building counts can be incomplete, especially outside the centre. | จำนวนอาคารจาก OpenStreetMap อาจไม่ครบ โดยเฉพาะนอกใจกลางเมือง |
| d.checkSite | Check a site here | ตรวจสถานที่ที่นี่ |

### D. Do not build (landing and area detail)

Carousels, video or animated hero, a live map on the landing page, stock images, logos, testimonials, pricing or sign-up forms, a name prompt on the landing page, scroll-jacking or parallax, cookie banners (no cookies are set), a third chart, a chart library, comparing districts side by side, district ranking charts, per-district export, a rate per year anywhere, hiding "Not covered" items to look better, hardcoding coverage areas or district counts.

### E. Notes from the orchestrator (override anything above in section 10 that conflicts)

- Base map is desaturated OpenStreetMap raster, not CARTO. Remove "base map CARTO" from foot.credits in both languages.
- foot.oss: the repository URL comes from `NEXT_PUBLIC_REPO_URL`. When it is unset, show "Open source." without a link (the repository is published with the submission).
- Coverage block numbers that can be read from the data must be read from it: district counts per track, number of radar pairs and water scenes, first and last dates (manifest.json and districts.json). The usable-pixel sentence (cov.gn1) may stay as written text; it was measured on 15 Nov 2026.
- cov.sn2 ("Bangkok: in progress") is shown only while `/v1/coverage` has no area whose id is "bangkok".
- lim.2 takes its months from the manifest's first and last GUNW dates.
- Static export: set `trailingSlash: true` so the app is served from `/app/index.html`.

## 11. Demo deck (`/slides/`)

7 slides, English only, public, no login. Same tokens and fonts as the app. A judge may spend 60 seconds, so every slide has a title, one sentence to remember (in the largest body size), and one visual or number block. Nothing else.

**Stage.** Design size 1920x1080 (16:9). One `<section>` per slide inside a stage scaled with `transform: scale(min(100vw/1920, 100vh/1080))`, centred on `--bg`. Safe margins 96px left/right, 72px top/bottom. 12-column grid, 32px gutters.
- Type (design px): title 72/1.1 600 (slide 1: 120); remember sentence 40/1.3 500 `--text`; bullets 32/1.5 400; mono number blocks 96 600 with 28px `--muted` labels; smallest text 24 (credits). Numbers always `--mono`. Muted text only `--muted`.
- Template A (slides 2 to 6): text in columns 1 to 5 (title, remember sentence, body, in that order, 40px between), visual in columns 6 to 12 inside a `.raised` frame, radius 28, 1px `--edge`, image `object-fit: cover`, no browser chrome. Slide 1: same, text columns 1 to 5, hero image columns 6 to 12 full height. Slide 7: text-only, 3 columns.
- Fixed chrome on every slide: slide number "3 / 7" bottom-left (mono 24, `--muted`); app URL `bangkok-ground-watch.vercel.app` bottom-right (mono 24, `--muted`), sitting 40px above the bottom edge. A thin 4px `--accent` progress bar at the very top (width = n/7).
- Navigation: Left/Right arrows, Space, PageUp/PageDown, Home/End, swipe (50px threshold), round 44px prev/next buttons at the vertical middle of each edge (hidden on slide 1 prev and slide 7 next), URL hash `#1` to `#7`. Transition: 200ms opacity fade only (none under reduced motion). Top-right: secondary "Download PDF" button (`/slides/bangkok-ground-watch.pdf`, 44px high in screen px, outside the scaled stage so it never shrinks).
- PDF: 7 pages, 1920x1080, made by headless Chrome from the same page with `@page { size: 1920px 1080px; margin: 0 }`, print CSS shows all slides, hides buttons and the progress bar.
- Phone fallback (under 768px): no stage scaling, slides stack vertically and the page scrolls; each slide padding 24, title 28, remember sentence 20, body 16 (min 15), mono numbers 40, images full width above or below text (text first), slide number and URL inline at the foot of each slide. Prev/next buttons and swipe are off. "Download PDF" stays at the top.

**Screenshots** (real, from the live app, desktop 1440x900 at 2x, exported as WebP under 300 KB, named `slide-N-x.webp`; every one shows the "Processed NISAR values" badge where the Ground watch mode shows it, never DEMO; crop to the stated region only, with alt text):
- `slide-1.webp`: `/app/?mode=ground`, LOS layer, latest date, track A112, whole viewport.
- `slide-2.webp`: `/app/?mode=ground`, Map view = Districts, districts panel open.
- `slide-3a.webp`: `/app/?mode=ground`, LOS overlay with legend and scrubber, crop of the map area. `slide-3b.webp`: `/app/?mode=ground&d=1011`, crop of the 400px district panel, Ground block and chart visible.
- `slide-4.webp`: `/app/?mode=ground`, Water layer, a wet-season date, legend visible.
- `slide-5a.webp`: `/app/?mode=site`, pin at 14.30,100.63 (Rojana), result card showing 26 and Poor. `slide-5b.webp`: same point, evidence view with the year strip and a water scene selected.
- `slide-6.webp`: the "About the data" dialog open, EN.
Slide 3 and 5 place the two crops side by side in one frame, 58 / 42 split, 24px gap. If a Bangkok Site check area exists, do not use it; the examples below are the only site results shown.

**Slides (exact text)**

1. Title: **Bangkok Ground Watch**
   Remember: NISAR radar, made readable.
   Body: Satellite radar shows how Bangkok's ground changes and where floodwater has been. / NASA Space Apps Challenge 2026 · Dancing with the SARs / Team: {team name}
   Visual: `slide-1.webp`.
2. Title: **Why Bangkok needs this**
   Remember: Bangkok sits on soft clay and floods every wet season.
   Body (3 bullets): The city keeps building on soft ground. / Radar sees ground and water through cloud, day and night. / Every one of the 50 districts gets a screening view.
   Visual: `slide-2.webp`.
3. Title: **Ground Watch, from NISAR**
   Remember: 17 NISAR radar pairs show how Bangkok's ground changed.
   Body (one number block, three columns): **17** radar pairs, 21 Jun to 31 Oct 2026, two tracks · **19** water scenes, Jul to Nov 2026 · **50** districts, grid about 80 m
   Visual: `slide-3a.webp` + `slide-3b.webp`.
4. Title: **NISAR data, read without downloading**
   Remember: Each file is 2 to 6 GB. We read only Bangkok.
   Body (3 bullets): HTTP range requests fetch just the Bangkok window of each file. / Water uses a fixed -19 dB threshold on HV backscatter. / Otsu's method over-marked paddies, so we dropped it.
   Visual: `slide-4.webp`.
5. Title: **Site check: nine years of radar**
   Remember: Tap a point, get a screening score, and see the radar passes behind it.
   Sub line (24 muted): 9 years of Sentinel-1 (2017 to 2025) · about 150 scenes per area · 3 areas live: Bangkok, Ayutthaya, Samut Sakhon
   Body (number block, three rows, score in mono 96 + grade, text 32): **26** Poor · Rojana industrial park, Ayutthaya · water in 10 of 130 wet-season passes / **22** Poor · Lat Krabang paddy, east of Bangkok · water in 36 of 130 / **88** Good · Krathum Baen, Samut Sakhon · water in 0 of 130. Foot (24 muted): Grades are provisional.
   Visual: `slide-5a.webp` + `slide-5b.webp`.
6. Title: **What it does not claim**
   Remember: This is screening, not a building assessment.
   Body (3 bullets): Ground change is along the radar line of sight, relative to the window mean, with atmosphere included. Its sign is not confirmed, so we never say subsidence or uplift. / The record is short (Jun to Oct 2026), so there are no yearly rates. Values cover an 80 m area, not a building. / Radar can miss floodwater between buildings and under trees. Site grades are provisional.
   Visual: `slide-6.webp`.
7. Title: **Data, credits and AI use**
   Remember: NASA data is the core, and every source is credited.
   Layout: three columns (cards, `.raised`, 24px text, mono for dataset names), then a full-width AI band, then footer.
   - NASA data: NISAR L2 GUNW and GCOV, via the ASF DAAC · NASA Earthdata · NASA POWER (solar irradiance, context only)
   - Partner data: Copernicus Sentinel-1 and Sentinel-2 (ESA) · Copernicus DEM GLO-30 (ESA) · ESA WorldCover 2021
   - Other: OpenStreetMap contributors · CARTO base map · MapLibre GL JS · Next.js
   - AI use band: We used Claude (Anthropic), through Claude Code, to write code, design the interface and draft text. The team chose the challenge, the data and the method, and checked results against real NISAR and Sentinel-1 data. No AI-generated images, video or audio.
   - Footer line: Live app: bangkok-ground-watch.vercel.app · Code: {repo} · Not affiliated with or endorsed by NASA.

**Do not build (deck).** Animations beyond the 200ms fade, speaker notes, video or audio embeds, an eighth slide, slide thumbnails or an index, auto-advance timers, a language toggle or Thai text, icons or illustrations beyond the app's own screenshots, charts that are not in the app, stock images, any number not listed in slides above, the word "risk" for a district or site, the words subsidence, uplift, safe or guaranteed.

**Notes from the orchestrator (override anything above in section 11 that conflicts).**
- Slide 7 "Other": remove "CARTO base map"; the base map is OpenStreetMap.
- Slide 1 "Team: {team name}" renders only when `NEXT_PUBLIC_TEAM_NAME` is set; slide 7 "Code: {repo}" renders only when `NEXT_PUBLIC_REPO_URL` is set. No placeholder text may ever ship.
- Slide 6, first bullet, last sentence becomes: "Its sign is not confirmed, so we report change, not direction."
- Bangkok is live in the Site check API, so "3 areas live: Bangkok, Ayutthaya, Samut Sakhon" is true; still read the area names from `/v1/coverage` at build of the screenshots and fix the line if they differ.

## 12. SOLSAT theme (supersedes the colour, shadow and font values in section 3 and 4)

Source: THEME.md (extracted from solsat-frontend @ 21024711). The team's product family is SOLSAT: white and near-black, one orange, flat surfaces with hairlines, 4px corners, Poppins + Prompt. Layout, components, copy and behaviour stay as built. One light theme (SOLSAT has a dark theme, we do not ship it).

**Tokens: replace `web/app/tokens.css` `:root` colour, shadow, radius, font and motion lines with these (every existing variable keeps its name; lines not shown stay as they are).**
```css
:root {
  --bg: #FFFFFF;  --surface: #F7F7F8;  --surface-glass: rgba(247,247,248,.94);
  --text: #0B0B0C;  --muted: #5F6062;  --edge: #5F6062;      /* edge = SOLSAT control border */
  --accent: #B93A0A;  --accent-ink: #FFFFFF;                  /* SOLSAT tertiary, the AA-safe orange */
  --focus: #0B0B0C;                                           /* SOLSAT focus ring, 3px outline stays */
  --ok-bg: #E2EBD6;  --ok-ink: #1B6B36;
  --demo-bg: #FFE9DF;  --demo-ink: #A8360A;
  --bad-bg: #F9D6D9;  --bad-ink: #BE1E2D;
  --sh-dark: #D0D0D2;  --sh-light: #FFFFFF;                   /* now: hairline grey, white ring */
  --raised: 0 0 0 1px var(--sh-dark), 0 18px 40px -22px rgba(11,11,12,.35);  /* cards, floating panels */
  --raised-sm: 0 0 0 1px var(--sh-dark);                      /* rows, chips, controls */
  --inset: inset 0 0 0 1px var(--edge);                       /* pressed, inputs, selected row */
  --r-ctl: 4px;  --r-card: 8px;  --r-pill: 4px;               /* SOLSAT r-md, r-lg, r-pill */
  --font: var(--font-poppins), var(--font-prompt), system-ui, sans-serif;
  --mono: var(--font-chakra), var(--font-prompt), ui-monospace, monospace;
  --lh: 1.65;  --ease: cubic-bezier(.16,1,.3,1);  --dur: 160ms;
  --glass-border: #D0D0D2;  --glass-blur: 14px;  --scrim: rgba(11,11,12,.55);
  --hatch: #8A8B8C;
  --ramp-1: #FFE9DF; --ramp-2: #FFC2A8; --ramp-3: #FF7E4D; --ramp-4: #E04A12; --ramp-5: #B93A0A; /* Districts view only */
  /* new */
  --brand: #FF5A1F;  --brand-ink: #0B0B0C;                    /* SOLSAT orange: primary buttons, selected segment, map selection */
  --link: #285A80;                                            /* SOLSAT info blue: links, water marks and bars in charts */
  --font-display: var(--font-zen-dots), var(--font-kanit), var(--font-chakra), sans-serif;
  --orbit: #000000;                                           /* logo tile ground */
  --gate-scrim: rgba(247,247,248,.72);
  --map-line: #B93A0A;  --map-area-fill: rgba(255,90,31,.10);  --map-sel: #FF5A1F;  --map-casing: #FFFFFF;
}
```
Unchanged: `--s1..s6`, `--t-*` sizes (15px body stays, Poppins is wider, check 296px cards for overflow), `--los-*`, `--water`, `--water-a`, `--outline`, `--ramp-opacity`, all dimension variables.

**Fonts** (`web/app/layout.tsx`, replace the two Plex imports with `next/font/google`): `Poppins({subsets:['latin'],weight:['400','500','600'],variable:'--font-poppins'})`, `Prompt({subsets:['thai'],weight:['400','500','600'],variable:'--font-prompt'})`, `Chakra_Petch({subsets:['latin'],weight:['500','600'],variable:'--font-chakra'})`, `Zen_Dots({subsets:['latin'],weight:'400',variable:'--font-zen-dots'})`, `Kanit({subsets:['thai'],weight:['500','600'],variable:'--font-kanit'})`. Decision: SOLSAT's fonts. Thai is covered by Prompt (body) and Kanit (display) in every weight used; Latin by Poppins. A mixed EN/TH line switches face per script (both geometric, so the height matches), which is how SOLSAT itself renders. Numerals use Chakra Petch (not monospace), so all numeric elements need `font-variant-numeric: tabular-nums` (add to `body`); not verified that Chakra Petch has tabular figures, check the legend and the year strip once. Zen Dots (Latin only, weight 400 only, wide) is used for exactly three things: the wordmark, the landing h1, and the title on slide 1 (88px, three lines "Bangkok / Ground / Watch"). All other titles stay Poppins 600. Add `h1,h2,h3{font-synthesis-weight:none}` (SOLSAT rule) and give Zen Dots elements `font-weight:400`.

**Contrast (computed with `design-system/contrast.py`)**
| Pair | Ratio | Needs | Result |
|---|---|---|---|
| text on bg / on surface | 19.67 / 18.37 | 4.5 | pass |
| muted on bg / on surface | 6.29 / 5.87 | 4.5 | pass |
| muted on surface-glass over worst case (flattened on black, #E8E8E9) | 5.14 | 4.5 | pass |
| text on glass worst case #E8E8E9 | 16.06 | 4.5 | pass |
| accent-ink #FFFFFF on accent #B93A0A | 5.71 | 4.5 | pass |
| accent on bg / on surface / on glass worst case | 5.71 / 5.34 / 4.67 | 4.5 | pass |
| brand-ink #0B0B0C on brand #FF5A1F | 6.30 | 4.5 | pass |
| link #285A80 on bg / on surface | 7.33 / 6.84 | 4.5 | pass |
| ok-ink on ok-bg | 5.33 | 4.5 | pass |
| demo-ink on demo-bg | 5.62 | 4.5 | pass |
| bad-ink on bad-bg (lowest text pair) | 4.58 | 4.5 | pass |
| bad-ink on surface (field error) | 5.74 | 4.5 | pass |
| edge #5F6062 on bg / on surface (control borders) | 6.29 / 5.87 | 3.0 | pass |
| focus #0B0B0C on bg / on brand | 19.67 / 6.30 | 3.0 | pass |
| brand #FF5A1F on bg (graphics, selection casing) | 3.11 | 3.0 | pass |
| brand #FF5A1F on surface | 2.91 | 3.0 | FAIL, so brand is never used on `--surface`; surfaces use `--accent` |
| border #D0D0D2 on bg | 1.54 | n/a | decorative separator only; every control keeps the 6:1 `--edge` border |
Fixed by decision: SOLSAT's #FF5A1F cannot be text or a graphic on cards, so `--accent` is its own safe tone #B93A0A and the bright orange is reserved for filled buttons with black ink and for map selection.

**Elevation decision.** SOLSAT is flat (its tokens set card, tile and paper shadows to `none`, borders are hairlines, one soft shadow only for floating panels). So `--raised`, `--raised-sm` and `--inset` are redefined as above and no component CSS changes. What you lose: the soft extruded, pillow-like depth of neumorphism, and the shadow-only hover lift (hover now changes only from a ring to a ring plus shadow; keep the translateY(-1px) for feedback). What you gain: crisper edges, better contrast, and a look that matches solsat.ai. Selected and pressed states already carry a second cue (accent fill, check, left bar), so nothing becomes colour-only.

**Edits that are not token swaps (the only component CSS changes)**
- `globals.css:30` (`.round`), `:38` (`.seg-btn[aria-pressed]`), `:248` (`.btn.primary`): `background/border-color: var(--brand); color: var(--brand-ink)`.
- `globals.css:245, 299, 378, 495, 497` use `--focus` as a link or water colour: change to `var(--link)` (otherwise links and water marks turn black).
- `globals.css:352` hard-coded `rgba(232,236,241,.72)`: `var(--gate-scrim)`.
- Wordmark, `.land h1` and slide 1 title: `font-family: var(--font-display); font-weight: 400`.
- Slides CSS: same variables; the deck has no other hard-coded colours to change.

**Migration table**
| Old | New | Usages | Note |
|---|---|---|---|
| --bg #E8ECF1 | #FFFFFF | 46 | token swap |
| --surface #EEF1F6 | #F7F7F8 | 46 | token swap |
| --text #1B2230 / --muted #475066 | #0B0B0C / #5F6062 | 32 / 90 | token swap |
| --edge #6F798B | #5F6062 | 74 | stronger, fine |
| --accent #0B6E6E, --accent-ink #FFF | #B93A0A, #FFF | 48 / 6 | teal to orange |
| --focus #0A4FBF | #0B0B0C | 24 | 5 uses need `--link` (above) |
| --ok-/--demo-/--bad- pairs | SOLSAT success, warning, danger surfaces | 12 | token swap |
| --sh-dark #C3C9D4, --sh-light #FFF | #D0D0D2, #FFF | 0 / 12 | now only rings |
| --raised, --raised-sm, --inset | flat ring definitions | 28 / 26 / 18 | no CSS change |
| --r-ctl 12, --r-card 20, --r-pill 999 | 4, 8, 4 | 36 / 36 / 32 | pills and chips become square-cornered; round buttons use 50% and stay round |
| --font, --mono (IBM Plex) | Poppins+Prompt, Chakra Petch | 4 / 4 | plus layout.tsx imports |
| --ramp-1..5 teal | orange ramp | 0 in CSS (read by map JS) | Districts view |
| --glass-border rgba, --scrim, --glass-blur, --lh, --ease | #D0D0D2, ink 55%, 14px, 1.65, SOLSAT ease | 22 / 2 / 12 / 2 / 12 | token swap |

**Must not change.** Layout, component structure, copy (EN and TH), the LOS overlay PNG colours and the legend gradient `--los-0..100` (they match `process_to_web.py`), the water overlay colour `--water` and `--water-a`, 44px targets, the 3px focus outline, and every AA rule. The brand orange never appears inside the LOS legend or overlay.

**Map chrome (grey base map, red-blue LOS overlay).**
- Coverage rectangles: 2px `--map-line` #B93A0A stroke, `--map-area-fill` fill. #B93A0A on the grey base is 4.67:1 or better.
- District outlines: `--outline` white at 70%, 1px, unchanged; readable over the red-blue overlay and the grey base.
- Selected district: 6px `--map-casing` white under 3px `--map-sel` #FF5A1F. The white casing keeps it separate from the salmon (#F49A7B) and red ends of the LOS ramp, where orange alone would blend.
- Pin: `--accent` fill with the existing 3px white ring (5.71:1 against the ring); hollow pin unchanged.
- Floating panels keep the 94% opaque `--surface-glass`, a 1px `#D0D0D2` border and `--raised`; no dark glass (SOLSAT's black lens panels are not used, because text contrast is computed against a light surface).

**Brand use.** The logo is the team's own: copy `/Users/poom/Documents/work/solsat/solsat-code/solsat-frontend/public/solsat-logo.svg` to `web/public/solsat-logo.svg` (mark only, 1000x1000, white-to-black gradient). The white end vanishes on white, so it always sits on a black tile: `--orbit` background, `--r-ctl` radius, 8px inner padding (logo area = tile minus padding). Minimum tile size 28px, clear space of one quarter of the tile edge on every side (SOLSAT states no rule, this is our assumption). Always followed by the text "SOLSAT" in `--font-display` 14px, `--text`. Placements: landing top bar, right of the wordmark, "by" + tile 28px + SOLSAT (hidden under 375 wide, shown in the footer instead); landing footer, tile 40px + "Built by SOLSAT"; app: the user menu footer only; slide 1, tile 64px + SOLSAT above the title; slide 7, tile 40px in the footer line before "Live app". No logo in the app's map view.

**Changes to earlier sections caused by the theme**
- Section 10 landing: h1 in `--font-display` (44px, 32px phone), "by SOLSAT" in the top bar, footer line "Built by SOLSAT", hero screenshot and the 3 slide screenshots must be recaptured after the theme change.
- Section 11 deck: slide 1 title 88px Zen Dots in three lines (replaces 120px); slide chrome uses `--accent` for the progress bar; screenshots recaptured; slide 1 and 7 get the logo tile.
- Section 3 and 4 values for accent (teal), focus (blue), shadows and Plex are superseded by the block above.

**Do not build (theme).** A dark theme or theme switcher, the flux gradient, glow shadows, dark glass panels, Zen Dots in body text, the 20 and 24px card radii, a second orange, the logo on white without its black tile, the logo recoloured or stretched, any SOLSAT claim beyond "Built by SOLSAT".

## 13. Refocus, names and dark theme

Lead feature = Thanut's site suitability engine. Second feature = NISAR view. Product name stays "Bangkok Ground Watch". Params `?mode=site` and `?mode=ground` are unchanged. This section overrides earlier names, ordering and colour values; everything else stays.

### A. Names (feature names are brand names: Latin in both languages; utility labels are translated)
| Old | New EN | New TH | Reason |
|---|---|---|---|
| Site check (mode, lead) | **Site Scout** | Site Scout | A planner "scouts" a site; reads as a feature, one word to remember |
| Ground watch (mode) | **Ground Pulse** | Ground Pulse | Stops colliding with the product name; radar pulses, ground change over time |
| See the evidence / evidence view | **Radar Evidence** (button "Open Radar Evidence") | Radar Evidence | Says what the proof is made of |
| District detail | **District Profile** | โปรไฟล์เขต | Plain, one noun |
| My sites / Save / Saved | **Shortlist** / "Add to shortlist" / "In shortlist" | รายการที่คัดไว้ / เพิ่มในรายการ / อยู่ในรายการ | Says why you save |
| Check a site here | **Scout here** | สำรวจที่นี่ | Matches Site Scout |
| Covered areas / Go to area | **Scouting areas** / Go to area | พื้นที่ที่สำรวจได้ / ไปยังพื้นที่ | Areas where Site Scout works |
Descriptors (always shown under the name, keep "screening"): Site Scout: "Suitability screening for factory and rooftop solar sites" | "คัดกรองความเหมาะสมของที่ตั้งโรงงานและโซลาร์เซลล์บนหลังคา". Ground Pulse: "NISAR radar: ground change and surface water in 50 districts" | "เรดาร์ NISAR: การเปลี่ยนของพื้นดินและน้ำผิวดินใน 50 เขต".
Other strings: every "Ground watch" becomes "Ground Pulse" and every "Site check" becomes "Site Scout" (mode switch, `start.*`, `land.*`, `cov.*`, `site.*`, `d.checkSite`, `my.*`, `user.*` menu, `save.gate`, deck titles). Mode switch order and all card orders: Site Scout first, Ground Pulse second. Changed strings: `my.empty` "Your shortlist is empty" | "รายการที่คัดไว้ยังว่าง"; `my.empty.sub` "Check a site, then tap Add to shortlist." | "ตรวจที่ตั้ง แล้วแตะ เพิ่มในรายการ"; `my.guest` "Add a name to keep a shortlist. Guests can still scout sites." | "เพิ่มชื่อเพื่อเก็บรายการที่คัดไว้ ผู้เยี่ยมชมยังสำรวจที่ตั้งได้"; `save.gate` "Add a name to keep a shortlist" | "เพิ่มชื่อเพื่อเก็บรายการที่คัดไว้".

### B. Flow, lead feature first
- 5-second message (app, first screen): "This point's flooding history, from nine years of radar." Primary action: Open Radar Evidence.
```
[Landing] --"Open Site Scout"--> [/app/?mode=site: Bangkok + example point] --Open Radar Evidence--> [Radar Evidence]
    |  (card 2 "Open Ground Pulse")      | tap map = own point      | Back                        | Back
    +--> [/app/?mode=ground]  <--"Open {district} in Ground Pulse"-- result card NISAR block
[/app/ bare] -> [Gate: name or guest] -> [Start: Site Scout card first, preselected] -> mode.  Title tap = Start.
```
- Landing: hero promise "Check a site's flooding history from nine years of radar, with NISAR ground data beside it." | "ตรวจประวัติน้ำท่วมของที่ตั้งจากเรดาร์ 9 ปี พร้อมข้อมูลพื้นดินจาก NISAR ข้างกัน". Primary "Open Site Scout" (to `/app/?mode=site`, skips the gate as a deep link). Secondary "How it works". Hero screenshot: `/app/?mode=site` default state (example card, dark). Section 2: Site Scout card first and larger (7/12), Ground Pulse second (5/12), both with a source tag chip ("Sentinel-1" / "NISAR"). Coverage columns, how-it-works step order and the limits order follow.
- Start step (section 9): two cards, Site Scout first and preselected (focus, "Last used" overrides if the user's last mode was Ground Pulse). Bare `/app/` default mode with no saved mode = Site Scout.
- **First 10 seconds** (`/app/?mode=site`, no lat/lng): the map fits Bangkok, the example point Lat Krabang paddy (13.75, 100.83) is checked live through the API (never hardcoded numbers; if it fails, the "no point" state shows), pin dropped, result card open with an "Example" chip on the score, showing 22 Poor, "Water seen in 36 of 130 wet-season radar passes", the NISAR block for Lat Krabang. Under the chip: "Example point: Lat Krabang paddy. Tap anywhere in an outlined area to check your own site." Replace it by tapping the map (the chip and note disappear on the first user tap), "Use map centre" (keyboard), or a Shortlist row. `?lat=&lng=` deep links override the example. 

```
375 (dock + sheet)                    1440
+---------------------+     +---------------------------------------------------------+
| Bangkok Ground Watch|     | [title chip + SOLSAT]  [Site Scout|Ground Pulse]  [EN|TH][i][user] |
| [Site Scout|Ground P]|     | +-------------+                       +------------------+ |
|        MAP + pin     |     | | Scouting     |        MAP + pin      | Suitability screening|
|  (example, Bangkok)  |     | | areas list   |   coverage outlines   | 22  Poor  [Example]  |
+---------------------+     | | Shortlist    |                       | Water seen in 36 of  |
| sheet 45vh: 22 Poor |     | +-------------+                       | 130 ... NISAR block  |
| Example | flood line |     |                                       | [Open Radar Evidence]|
| NISAR block | [Open] |     |                                       +------------------+ |
+---------------------+     +---------------------------------------------------------+
```

### C. NISAR stays core
- **NISAR block** in the Site Scout result card, only when the point lies in a Bangkok district (point-in-polygon on the district file the app already loads); placed after "Things to know", before land cover. Eyebrow chip "NISAR", title "NISAR ground view · {district}". Rows (mono values): total LOS change per track, highest surface water, usable radar signal (low note from `d.lowUsable` when under 50%). Note line always: "NISAR values are shown next to the score. They are not part of it." Link (secondary, 44px): "Open {district} in Ground Pulse" to `?mode=ground&d=<dcode>`. A missing value shows "No data", an unprocessed one "Pending" (section 4 rules). Outside Bangkok: the block is not rendered. District Profile keeps "Scout here" (back link), so the pair is two-way.
- One line per satellite (landing under the hero, deck slide 1): NISAR: "NISAR (NASA and ISRO, L-band radar): how the ground changes and where surface water sits, across 50 districts." Sentinel-1: "Sentinel-1 (ESA, C-band radar): nine years of flood history at any covered point." Together: "Together: what is changing now, and what has flooded before."
New strings (EN | TH): `ex.chip` Example | ตัวอย่าง · `ex.note` Example point: Lat Krabang paddy. Tap anywhere in an outlined area to check your own site. | จุดตัวอย่าง: นาข้าวลาดกระบัง แตะที่ใดก็ได้ในพื้นที่ที่มีเส้นขอบเพื่อตรวจจุดของคุณ · `nisar.t` NISAR ground view · {district} | มุมมองพื้นดินจาก NISAR · {district} · `nisar.note` NISAR values are shown next to the score. They are not part of it. | ค่าจาก NISAR แสดงไว้ข้างคะแนน และไม่รวมอยู่ในคะแนน · `nisar.los` Total LOS change, {track} | ระยะ LOS เปลี่ยนรวม {track} · `nisar.water` Highest surface water | น้ำผิวดินสูงสุด · `nisar.open` Open {district} in Ground Pulse | เปิด {district} ใน Ground Pulse · `sat.nisar` as above | NISAR (NASA และ ISRO เรดาร์ย่าน L): พื้นดินเปลี่ยนไปอย่างไรและน้ำผิวดินอยู่ที่ใด ใน 50 เขต · `sat.s1` as above | Sentinel-1 (ESA เรดาร์ย่าน C): ประวัติน้ำท่วม 9 ปี ณ จุดใดก็ได้ในพื้นที่ที่ครอบคลุม · `sat.together` as above | รวมกัน: อะไรกำลังเปลี่ยนตอนนี้ และอะไรเคยท่วมมาก่อน · `land.promise` and `land.open` as in B (`land.open` = "Open Site Scout" | "เปิด Site Scout").

### D. Dark theme (one theme, no switcher; replaces the colour values of section 12)
Add `color-scheme: dark` to `:root`, `<meta name="color-scheme" content="dark">`, `<meta name="theme-color" content="#000000">`.
```css
:root {
  --bg: #000000;  --surface: #0B0B0C;  --surface-glass: rgba(11,11,12,.88);
  --text: #F5F5F5;  --muted: #BDBDBF;  --edge: #9A9B9D;
  --accent: #FF7E4D;  --accent-ink: #0B0B0C;   --focus: #F5F5F5;
  --ok-bg: #12261A;  --ok-ink: #7FD39B;  --demo-bg: #2A1208;  --demo-ink: #FFC2A8;
  --bad-bg: #2A1114;  --bad-ink: #FF8A95;
  --sh-dark: #3A3A3D;  --sh-light: #F5F5F5;
  --raised: 0 0 0 1px var(--sh-dark), 0 18px 40px -18px rgba(0,0,0,.6);
  --raised-sm: 0 0 0 1px var(--sh-dark);  --inset: inset 0 0 0 1px var(--edge);
  --glass-border: rgba(255,255,255,.18);  --glass-blur: 14px;
  --scrim: rgba(0,0,0,.7);  --gate-scrim: rgba(0,0,0,.72);
  --hatch: #6B6C6E;
  --ramp-1: #5C2310; --ramp-2: #A8360A; --ramp-3: #E04A12; --ramp-4: #FF7E4D; --ramp-5: #FFC2A8;
  --link: #8EC1E6;  --brand: #FF5A1F;  --brand-ink: #0B0B0C;  --orbit: #000000;
  --map-line: #FF7E4D;  --map-area-fill: rgba(255,90,31,.14);  --map-sel: #FF5A1F;  --map-casing: #000000;
}
```
Values are SOLSAT dark roles (THEME.md) except `--ok-bg`, `--bad-bg`, `--ramp-1` and `--hatch`, which are derived. Unchanged: `--los-*`, `--water`, `--water-a`, `--outline`, dimensions, type, radii, fonts, `--ramp-opacity` (set .85). Non-token edits: `.chart .band` opacity .25; `.crosshair` halo `box-shadow: 0 0 0 1px var(--bg)`; panels use `backdrop-filter: blur(var(--glass-blur)) saturate(160%)` (SOLSAT lens); `.pin.hollow` unchanged.

**Contrast (contrast.py)**
| Pair | Ratio | Needs | Result |
|---|---|---|---|
| text on bg / surface | 19.26 / 18.04 | 4.5 | pass |
| muted on bg / surface | 11.19 / 10.48 | 4.5 | pass |
| text / muted on glass worst case #282828 (88% panel over white) | 13.52 / 7.85 | 4.5 | pass |
| accent-ink on accent #FF7E4D | 7.81 | 4.5 | pass |
| accent on bg / surface / glass worst case | 8.34 / 7.81 / 5.85 | 4.5 | pass |
| brand-ink on brand #FF5A1F | 6.30 | 4.5 | pass |
| link on surface / glass worst case | 10.23 / 7.66 | 4.5 | pass |
| ok-ink on ok-bg / demo-ink on demo-bg / bad-ink on bad-bg | 8.87 / 11.38 / 7.84 | 4.5 | pass |
| bad-ink on surface | 8.73 | 4.5 | pass |
| edge on bg / surface / glass worst case (control borders) | 7.54 / 7.07 / 5.30 | 3.0 | pass |
| focus #F5F5F5 on surface | 18.04 | 3.0 | pass |
| accent line on the dark base map (#262626) | 6.01 | 3.0 | pass |
| LOS ramp ends #3B4CC0 and #B40426 on surface | 2.79 | n/a | fixed data colours; frame and outlines carry the boundary |
| hatch #6B6C6E on surface | 3.74 | 3.0 | pass |
Lowest UI pair: 5.30 (edge on worst-case glass). Lowest overall: 2.79, the data colours we may not change.

**Map and chrome**
- Base map: switch the raster source to CARTO `dark_all` (`https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`, attribution "© OpenStreetMap contributors © CARTO"). Reason: MapLibre raster paint cannot invert, and darkening OSM tiles with `raster-brightness-max` makes the black labels vanish. If the build must keep OSM tiles, use `raster-brightness-min: 0, raster-brightness-max: .38, raster-saturation: -.85, raster-contrast: .2` and accept that labels are weak. No CSS filter on the canvas.
- LOS overlay and legend gradient keep their colours. Legend bar gets a 1px `--edge` frame (its blue and red ends are 2.79:1 on dark). Water swatch keeps its 1px `--edge` border. Overlay opacity default stays 85%.
- District outlines `--outline` white 70% (better on dark). Coverage rectangles `--map-line` 2px with `--map-area-fill`. Selected district: 6px `--map-casing` black under 3px `--map-sel`. Pin: `--accent` fill, 3px `--sh-light` ring. Charts: lines and dots `--accent`, water bars `--link`.
- Panels over the map: dark glass `--surface-glass` (88%, blur 14, saturate 160%), 1px `--glass-border`, `--raised`; text is checked against the worst case above.
- Focus ring: 3px `--focus` (#F5F5F5), offset 2px, everywhere. Badges: same classes, new pairs; status never colour-only (icon + text stay). Fields: background `--bg`, 1px `--edge`, invalid 2px `--bad-ink` + icon + `role="alert"` text; placeholder `--muted`. Gate: `--gate-scrim` with the existing 6px blur; dialogs: `--scrim`.
- Logo: on dark the mark sits directly on the page (the dark tail merges into the ground, as in SOLSAT's own use); keep the 28px tile with a 1px `--glass-border`, no white tile. Recapture the hero and all deck screenshots in dark.

### E. What else changes
- Landing: top bar link order, hero (promise, primary, screenshot), section 2 order and sizes, a one-line strip under the hero with `sat.nisar`, `sat.s1`, `sat.together`, coverage columns order.
- About dialog: title unchanged; two groups, headings "Site Scout" then "Ground Pulse"; the limits already in `about.*` move under Ground Pulse, the flag and grade notes (sections 8) under Site Scout.
- Deck: slide order 1 Title (add the two-satellite line), 2 Why Bangkok, 3 Site Scout (old 5; visual: result card with the NISAR block plus the Radar Evidence strip), 4 Ground Pulse, from NISAR (old 3), 5 NISAR data, read without downloading (old 4), 6 What it does not claim, 7 Data, credits and AI use. Titles: "Site Scout: nine years of radar", "Ground Pulse, from NISAR"; slide 3 remember sentence "Tap a point, get a screening score, and see the radar passes behind it." stays. Slide 1 remember sentence: "Site flooding history and NISAR ground change, on one map." Dark stage (#000000), same chrome tokens.
- For others to edit (not me): README headings "Ground watch" and "Site check"; SUBMISSION_DRAFT.md summary paragraph, "What it does" subsection order (Site Scout first), demo script and slide outline order and names, DESIGN-facing screenshots; app page `<title>` stays.

### F. Do not build
A light/dark switcher or `prefers-color-scheme` branching, a third mode, renaming URL params or the repo, new copy that says safe, suitable for sure or approved, a map search box for the example, an animated intro for the example point, NISAR values inside the score, a Thai transliteration of feature names, new chart types, a tile-proxy or custom map style, recolouring the LOS overlay or legend.

**Notes from the orchestrator (override anything in section 13 that conflicts).**
- Base map: do NOT switch to CARTO `dark_all` (CARTO tiles returned an "API key required" watermark earlier in this project). Keep the OpenStreetMap raster source and its attribution, and darken it in MapLibre by inverting luminance with raster paint: `raster-saturation: -1`, `raster-brightness-min: 0.72`, `raster-brightness-max: 0.04`, `raster-contrast: 0.1` (min above max inverts, so the light land becomes near-black and the dark labels and roads become light). Tune the two brightness values by eye until land is close to `--bg` and labels are readable but quieter than the overlay. This paint applies to the base layer only, never to the LOS or water overlays.
- The example point shown on first open is fetched live like any other check and must be labelled "Example" until the user taps their own point. If the API call fails, show the normal error state, never a hard-coded result.
- The NISAR block in the result card reads from districts.json (point-in-polygon on the district outlines already loaded). Outside Bangkok it is not rendered, and one line says NISAR coverage in this app is Bangkok only.

## 14. Dashboard shell and tabs

Wireframe format (design-wireframe skill). Build budget: 2 hours, one engineer. Dark SOLSAT theme, names, behaviour and data from sections 1 to 13 stay. This changes the frame and where each feature lives. Section 9 "Start step" and the floating title chip, mode switch and top-right toolbar are replaced.

### 1. Shell (`/app/`)
| Piece | 1440 | 1024 (768 to 1279) | 375 |
|---|---|---|---|
| Sidebar | 240px, `--surface`, 1px right border `--glass-border` | 72px icon rail, labels in `title` + `aria-label`, shown on focus/hover | none |
| Top bar | 64px in the content area, `--bg`, bottom hairline | same | 56px, page title + lang + user icon |
| Tab bar | none | none | bottom, 64px + safe area, 5 items, icon 24 + label 12px, each 75px wide |
| Content | right of sidebar, padding 24 | padding 16 | padding 16 above the tab bar |
Sidebar, top to bottom: SOLSAT tile 32px + "Bangkok Ground Watch" (Poppins 600 15px, wraps to two lines) + "by SOLSAT" (Zen Dots 12px, `--muted`); tap = Overview. Nav (5 items, 44px rows, icon 20 + label 15px 500): Overview, Site Scout, Ground Pulse, Districts, Shortlist. Active item: `.pressed` style + 3px `--brand` left bar + `aria-current="page"` (never colour alone). Bottom: "About the data" link (opens the existing dialog), EN|TH toggle (rail: one 44px button showing the current language, toggles it), user chip (rail: person icon; menu unchanged: Shortlist, Switch user, Sign out or Add a name).
Top bar: left page title (h1 22px; 17px on 375) + one-line descriptor (14px `--muted`, hidden on 375); right the page's status badge. Badge per tab: Site Scout "Provisional grades"; Ground Pulse and Districts "Processed NISAR values" or DEMO; Overview and Shortlist none.
Moved: floating title chip -> sidebar header; mode switch -> nav items; top-right toolbar (EN|TH, About, user) -> sidebar footer (375: lang and user in the top bar, About inside the user menu); status badge -> top bar; Start step -> Overview.

### 2. Tabs and URLs
Scheme (one static page, client state from the URL): `/app/?tab=overview|site|ground|districts|shortlist`. Tab change uses `history.pushState` (browser Back works). Old links are read forever and rewritten to the canonical form with `replaceState`:
- no params -> `tab=overview`; `mode=site` -> `tab=site`; `mode=ground` -> `tab=ground`; any link with `d=<dcode>` (old `?mode=ground&d=1011` included) -> `tab=districts&d=<dcode>` and District Profile opens.
- Other params stay: `lat`, `lng`, `area` (Site Scout), `about=1`, `focus=<dcode>` (new, Ground Pulse only: flies to the district and outlines it, no panel).
Radar Evidence stays inside Site Scout (replaces the docked result column, Back returns). Cold start of any URL shows that tab directly and never the name dialog.

### 3. Overview (dashboard home)
Message: "Two radar views of Bangkok, and where to start." Primary action: Open Site Scout. Content, only from existing data:
- Header: "Welcome back, {name}" / "Hello, {name}" / guest "Welcome"; sub "NISAR and Sentinel-1 radar at a glance".
- 6 KPI tiles (3x2 at 1440, 2x3 at 768 and 375; `.raised`, label 14 muted, value mono 40, source line 12 muted "Source: ..."): NISAR radar pairs (count of `gunw` layers, "NISAR processed layers"), NISAR water scenes (count of `water` layers, same source; "Pending" if 0), Districts (length of `districts.json`, "District statistics"), Scouting areas (length of `/v1/coverage`, "Site Scout coverage service"), Radar pair dates (min to max date of `gunw` layers, same manifest source), In your shortlist (count, "This browser"). Tiles are not links. A failed source shows "No data" and a one-line reason.
- Panel left (7/12): "Top 5 districts by screening index", rows reuse the district row (rank, name, index); row opens District Profile; footer link "See all 50" -> Districts. Panel right (5/12): "Latest NISAR data" (latest radar pair date and track, latest water scene date, both from the manifest) and "Shortlist" summary ("{n} sites · best score {s}" or the empty line, link "Open Shortlist").
- Actions row under the header: primary "Open Site Scout", secondary "Open Ground Pulse". No map preview (saves a second MapLibre instance), no trends, no arrows, no new charts.
```
1440 content                                     375
+--------------------------------------------+   +------------------------+
| Welcome back, Nok                           |   | Overview               |
| [Open Site Scout] [Open Ground Pulse]       |   | Welcome back, Nok      |
| [17 pairs][19 water][50 districts]          |   | [Open Site Scout]      |
| [3 areas][21 Jun to 31 Oct][2 in shortlist] |   | [Open Ground Pulse]    |
| Top 5 districts       | Latest NISAR data   |   | 2x3 KPI tiles          |
| 1 Phra Nakhon  87.7   | Pair: 19 Oct 2026   |   | Top 5 districts        |
| 2 Dusit        70.1   | Shortlist: 2 sites  |   | Latest NISAR data      |
+--------------------------------------------+   | Shortlist   [tab bar]  |
```

### 4. Tab layouts (content area; each has a toolbar row 56px, a main panel, optional docked panel)
- **Site Scout** (lead, 1440): toolbar = Scouting areas as chips (tap = fly), "Use map centre", Display popover (NISAR overlay toggle). Map panel flex 1, rounded 8, 1px border. Result column docked right 400px (440 for Radar Evidence), full height, scrolls; shows the section 13 card with the example point on first open. 1024 and below: result column becomes the bottom sheet over the map. 375: chips row scrolls under the top bar, map fills, sheet 45vh above the tab bar. Shortlist list is removed from here (own tab).
```
1440: [toolbar: chips | centre | Display]       375: [chips scroll]
      +-----------------------+---------+            +--------------+
      |         MAP           | result  |            |     MAP      |
      |  pin + coverage       | 22 Poor |            +--------------+
      +-----------------------+ evidence|            | sheet 22 Poor|
```
- **Ground Pulse**: toolbar = layer (LOS | Backscatter | Water), track (Ascending 112 | Descending 4), Display (opacity, Map view). Map fills. Bottom row 72px under the map: play + scrubber (flex) + compact legend (240px, framed). Tap a district: navigates to `tab=districts&d=<dcode>` (Back returns, `focus` keeps it outlined). 375: toolbar wraps to two rows (layer; track + Display), legend row 40px above the scrubber row 56px.
- **Districts**: toolbar = search box (44px), "{n} of 50 districts", sort select on 375. Table fills; District Profile (section 10 content, unchanged) docks right 440px from 1280 up, opens as a drawer (full height, 420px) below 1280 and a full-screen sheet on 375. Row click or Enter on the district name opens it; Back/Close returns focus to that row. Default sort Screening index descending, nulls last under a "No data" divider. Columns at 1440: Rank, District, Screening index, LOS asc 112 (mm), LOS desc 4 (mm), Highest water, Usable signal, People per km2 (mono right-aligned; 56px rows; sticky header; horizontal scroll inside the table at 1024). 768: Rank, District, Index, Highest water, Usable signal. 375: no table, the district row component (name, index, subline "LOS -14.7 mm · water 3%") plus the sort select. Fields: `los_sum_mm`, `water_max_pct`, mean of `los[].coherent_pct` over all pairs (both tracks), `pop_density`, `index`.
```
1440: [search 320] 50 of 50 districts   | 375: [search]   [Sort by v]
Rank District     Index  A112   D004  Water Usable Dens | 1 Phra Nakhon        87.7
1    Phra Nakhon  87.7  -14.7  ...    ...   98%   10,965|   LOS -14.7 mm · water No data
```
- **Shortlist**: table columns Score + grade, Area, Location (lat, lng 4 decimals, mono), Saved, Open, Remove. Sorted by saved date, newest first. Open -> Site Scout with `lat,lng` (fresh check). Remove: instant, 5s Undo toast. 375: row cards (existing). Empty and guest states exactly as section 9 `my.*`, centred in the panel with the "Open Site Scout" button.

### 5. Gate
Start step is removed. Name entry becomes a dialog (440px; bottom sheet on 375) with the same field, rules and honesty line, shown only on the first visit to a bare `/app/` (flag `bgw:seen`); Guest, Esc and outside tap = guest and go to Overview. Returning visit: Overview directly, no dialog, greeting by name. Deep links (any `tab`, `lat`, `d`): no dialog, ever. The user chip opens the same dialog ("Add a name", "Switch user"). Remembered per user: language only (last mode is dropped; Overview is the home).

### 6. States, keyboard, copy
| Screen | loading | error | no data | empty |
|---|---|---|---|---|
| Overview | tile skeletons | tile "No data" + reason | tile "Pending" | shortlist line |
| Districts | 8 skeleton rows | "Could not load district data." + Try again | row index "No data" | search: no match line |
| Shortlist | skeleton rows | n/a (local) | n/a | empty or guest card |
Keyboard and focus order: skip link ("Skip to content") -> sidebar brand -> 5 nav links -> About -> language -> user chip -> top bar badge -> toolbar -> main panel -> docked panel. Sidebar and tab bar are `<nav aria-label>` with links (`aria-current`). Tables are real `<table>`; sort headers are buttons with `aria-sort`; the district name cell is the one focusable control per row. Opening a docked panel moves focus to its heading; Esc or Back closes it and returns focus. Focus ring 3px `--focus`; all targets 44px.
| Key | EN | TH |
|---|---|---|
| nav.main / skip | Main navigation / Skip to content | เมนูหลัก / ข้ามไปยังเนื้อหา |
| nav.overview | Overview | ภาพรวม |
| nav.districts | Districts | เขต |
| nav.shortlist | Shortlist | รายการที่คัดไว้ |
| desc.overview | NISAR and Sentinel-1 radar at a glance | ภาพรวมเรดาร์ NISAR และ Sentinel-1 |
| desc.districts | 50 districts, exposure screening from NISAR | 50 เขต คัดกรองการสัมผัสจาก NISAR |
| desc.shortlist | Sites you added in Site Scout | ไซต์ที่คุณเพิ่มจาก Site Scout |
| ov.guest | Welcome | ยินดีต้อนรับ |
| kpi.pairs / kpi.water | NISAR radar pairs / NISAR water scenes | คู่ภาพเรดาร์ NISAR / ภาพน้ำผิวดิน NISAR |
| kpi.districts / kpi.areas | Districts / Scouting areas | เขต / พื้นที่ที่สำรวจได้ |
| kpi.range / kpi.short | Radar pair dates / In your shortlist | ช่วงวันที่ของคู่ภาพเรดาร์ / ในรายการที่คัดไว้ |
| src | Source: {s} | แหล่งที่มา: {s} |
| src.manifest | NISAR processed layers | ชั้นข้อมูล NISAR ที่ประมวลผลแล้ว |
| src.districts | District statistics | สถิติรายเขต |
| src.coverage | Site Scout coverage service | บริการพื้นที่ครอบคลุมของ Site Scout |
| src.local | This browser | เบราว์เซอร์นี้ |
| ov.top / ov.all | Top 5 districts by screening index / See all 50 | 5 เขตที่ดัชนีคัดกรองสูงสุด / ดูทั้ง 50 เขต |
| ov.latest | Latest NISAR data | ข้อมูล NISAR ล่าสุด |
| ov.pair / ov.scene | Latest radar pair: {date} · {track} / Latest water scene: {date} | คู่ภาพเรดาร์ล่าสุด: {date} · {track} / ภาพน้ำผิวดินล่าสุด: {date} |
| ov.short.n / ov.short.empty | {n} sites · best score {s} / No sites yet. Add one from Site Scout. | {n} ไซต์ · คะแนนสูงสุด {s} / ยังไม่มีไซต์ เพิ่มได้จาก Site Scout |
| ov.short.open | Open Shortlist | เปิดรายการที่คัดไว้ |
| open.ground | Open Ground Pulse | เปิด Ground Pulse |
| th.rank / th.district | Rank / District | อันดับ / เขต |
| th.index | Screening index | ดัชนีคัดกรอง |
| th.losA / th.losD | LOS asc 112 (mm) / LOS desc 4 (mm) | LOS ขาขึ้น 112 (มม.) / LOS ขาลง 4 (มม.) |
| th.water / th.usable | Highest water / Usable signal | น้ำสูงสุด / สัญญาณที่ใช้ได้ |
| th.density | People per km2 | ประชากรต่อ ตร.กม. |
| th.score / th.site / th.area / th.saved | Score / Location / Area / Saved | คะแนน / ที่ตั้ง / พื้นที่ / บันทึกเมื่อ |
| search | Search districts | ค้นหาเขต |
| count | {n} of 50 districts | {n} จาก 50 เขต |
| sort | Sort by | เรียงตาม |
| none.q | No district matches "{q}" | ไม่พบเขตที่ตรงกับ "{q}" |
| err.d | Could not load district data. | โหลดข้อมูลเขตไม่ได้ |
| nodata.src | No data from this source right now. | ตอนนี้ไม่มีข้อมูลจากแหล่งนี้ |

### 7. Changes elsewhere
- Landing (section 10): hero screenshot recaptured from `/app/?tab=site` at 1440 showing the whole shell (sidebar, map, docked result with the Example card). All links use the canonical form: `/app/?tab=site`, `/app/?tab=ground`, `/app/?tab=districts&d=<dcode>`, `/app/?tab=site&area=<id>`, top-bar "Open the app" -> `/app/?tab=overview`. The `/?mode=` redirect script stays (the app normalises). Landing cards add one line "Part of a dashboard with Overview, Districts and Shortlist."
- Deck (section 11, order from section 13): slide 1 visual = `/app/?tab=overview`; slide 2 = `/app/?tab=districts` (table, default sort); slide 3 = Site Scout tab, docked result with the NISAR block plus Radar Evidence; slide 4 = `/app/?tab=ground` content area (toolbar, legend, scrubber) plus `/app/?tab=districts&d=1011` profile crop; slide 5 = Ground Pulse with Water layer; slide 6 About dialog. Crop to the content area except slide 1 (full shell). All recaptured dark at 1440x900.
- Section 8 and 9 copy that names "mode switch", "Start step" or "Back to start" is obsolete; the sidebar brand replaces `toStart`.

### 8. Do not build
A settings or profile page, notifications or a bell, user management or roles, a collapsible-sidebar toggle button (width is by breakpoint only), breadcrumbs, a global search, a map preview on Overview, trend arrows, percent change, sparklines or charts beyond the existing two, KPIs that have no source, drag-to-reorder or saved table views, column pickers, table pagination (50 rows scroll), export, a "recent activity" feed, a dark/light switch.
