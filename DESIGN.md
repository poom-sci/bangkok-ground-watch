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
