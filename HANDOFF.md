# solsat-siting — Handoff

เอกสารส่งมอบสำหรับคนที่จะรับงานนี้ต่อ อ่านไฟล์นี้ไฟล์เดียวแล้วควรรู้ว่า: งานนี้คืออะไร ทำถึงไหน รันอย่างไร สร้างข้อมูลซ้ำอย่างไร อะไรยังพังหรือยังไม่รู้ และต้องทำอะไรต่อ

อัปเดตล่าสุด: 2026-11-14 · repo: https://github.com/Thanut-Junnim26/solsat-siting

| เอกสาร | ใช้เมื่อ |
|---|---|
| **HANDOFF.md** (ไฟล์นี้) | เริ่มต้น ภาพรวม วิธีรัน/สร้างข้อมูล/deploy ปัญหาที่รู้ งานต่อ |
| [docs/API.md](docs/API.md) + [docs/openapi.json](docs/openapi.json) | สัญญา API ทุก endpoint (input/output/error) |
| [DESIGN.md](DESIGN.md) | เหตุผลของการออกแบบ วิธีคิดคะแนน รายการที่ต้องแก้ ผลสอบเทียบ (ข้อ 11) |
| [aois.json](aois.json) | ตั้งค่าพื้นที่ (AOI) ทุกแห่ง ใช้สร้างข้อมูลซ้ำได้ |

---

## 1. งานนี้คืออะไร

บริการ API หลังบ้านที่ **รับพิกัดหรือแปลงที่ดิน แล้วตอบคะแนนความเหมาะสมของพื้นที่สำหรับตั้งโรงงานที่จะติดโซลาร์** โดยดูจาก
- **ประวัติน้ำท่วม** จากภาพเรดาร์ Sentinel-1 (SAR) ปี 2017–2025
- **ความสูง** จาก Copernicus DEM GLO-30
- **ชนิดพื้นที่** จาก ESA WorldCover 2021 (ตัดป่า น้ำ พื้นที่ชุ่มน้ำออก)

และมี **เส้นหลักฐาน** (`/v1/evidence`) ที่ตอบว่าคะแนนมาจากภาพไหน วันไหน แต่ละภาพเห็นอะไร พร้อมรูปให้เปิดดูเอง รวมถึงภาพ Sentinel-2 สีจริงไว้เทียบ

**ที่มา:** เริ่มจากโจทย์ NASA Space Apps 2026 "Dancing with the SARs" แล้วพบว่า SAR ใช้กับ roof detector โดยตรงไม่ได้ แต่ใช้ประเมิน "ที่ตั้งโรงงาน" ได้ (น้ำท่วม ความสูง) จึงทำเป็นบริการแยกที่ roof detector และหน้าบ้านเรียกใช้ได้ งานนี้เป็น **POC แยก repo จาก solsat เดิม** และตั้งใจให้รันบน free tier ได้

**ขอบเขตปัจจุบัน:** ครอบคลุมเฉพาะ AOI ที่ประมวลผลไว้ล่วงหน้า (ข้อ 5) API อ่านอย่างเดียว ไม่ดึงภาพจากภายนอกตอนรับ request

## 2. สถานะ ณ วันที่ส่งมอบ

| ส่วน | สถานะ |
|---|---|
| API 8 endpoint (suitability, area, evidence, chip, coverage, runs, healthz, readyz) ใช้ pydantic response model ทุกตัว | ✅ ทำงาน มี 29 เทสต์อัตโนมัติผ่านทั้งหมด coverage 87% |
| เครื่องมือ: uv + lockfile, ruff, ty (type check), pytest-cov, pre-commit, GitHub Actions CI, Dependabot, Makefile | ✅ `make check` ผ่านทั้งหมด (CI ยังไม่เคยรันบน GitHub จริง) |
| Pipeline: ingest (ทำต่อจากจุดค้างได้ ลองซ้ำเมื่อพลาด) → optical → pairs → build | ✅ ใช้งานจริงกับอยุธยาและหาดใหญ่ |
| กฎจับน้ำ: VH < −18 dB (method 0.3.0) สอบเทียบกับ Sentinel-2 | ✅ แต่สอบเทียบจากแค่ 2 AOI / 2 เหตุการณ์ |
| ปริมาณแสง (NASA POWER) | ✅ แสดงผลอย่างเดียว ไม่รวมในคะแนน |
| `POST /v1/suitability/area` (จุดเชื่อม roof detector) | ✅ มี แต่ยังไม่ได้ต่อกับ roof detector จริง |
| รองรับขอบเขตป่าสงวน/พื้นที่คุ้มครอง (`--protected` GeoJSON) | 🟡 โค้ดพร้อมและมีเทสต์ **แต่ไม่มีข้อมูลขอบเขตจริง** |
| Dockerfile (หลายขั้น ใช้ `uv sync --locked` รันด้วย user ที่ไม่ใช่ root มี HEALTHCHECK) | ✅ build ได้ (522 MB) รันบนเครื่องแล้ว healthy และเรียก API ได้จริง **ยังไม่เคย deploy ขึ้น cloud** |
| รันที่ความละเอียด 20 ม. | ❌ ยังไม่ทำ (ทุกอย่างที่ 80 ม.) |
| InSAR การทรุดตัว | ❌ ทำไม่ได้ตอนนี้ (ข้อ 9) |
| Auth / rate limit | ❌ ไม่มี API เปิดโล่ง (CORS ตั้งผ่าน `SITING_CORS_ORIGINS` ได้ ปิดเป็นค่าเริ่มต้น) |
| ข้อมูล AOI ใน git | ❌ ไม่อยู่ใน git (ต้องสร้างเองตามข้อ 6 หรือรับไฟล์จากเจ้าของเดิม) |

**AOI ที่มีข้อมูล (ดู `GET /v1/coverage`)**

| AOI | method | หมายเหตุ |
|---|---|---|
| `hatyai` (หาดใหญ่) | 0.3.0 (VH) | น้ำท่วม 21–23 พ.ย. 2025 ใช้สอบเทียบ |
| `ayutthaya` (อยุธยา) | 0.2.0 → กำลังสร้างใหม่เป็น 0.3.0 | ดึงภาพ VH ซ้ำอยู่เบื้องหลัง (ดูข้อ 11) |
| `samutsakhon` (สมุทรสาคร) | ยังไม่มี | ตั้งค่าไว้ใน `aois.json` แต่ยังไม่ได้ดึงข้อมูล |

**Git:** ยังไม่มีอะไร merge เข้า `main` สาขางานซ้อนกันเป็นลำดับ `main` ← `m1-api-on-ayutthaya` ← `m2-hatyai` ← `m2b-recurrence` ← `m3-quality` (สาขาปัจจุบัน รวมทุกอย่าง) เปิด PR อันเดียวจาก `m3-quality` ได้

## 3. Quick start (ต้องมีข้อมูล AOI ใน `data/` แล้ว)

ใช้ [uv](https://docs.astral.sh/uv/) (ติดตั้ง: `brew install uv` หรือ `curl -LsSf https://astral.sh/uv/install.sh | sh`) ไม่ต้องสร้าง venv หรือเลือก Python เอง uv อ่าน `.python-version` (3.13) แล้วดาวน์โหลดให้

```bash
git clone https://github.com/Thanut-Junnim26/solsat-siting.git && cd solsat-siting
git checkout m3-quality
uv sync                       # API + เครื่องมือพัฒนา จาก uv.lock  (เพิ่ม --extra pipeline ถ้าจะดึงข้อมูล)
make check                    # lint + format + type check + openapi + 29 tests (ไม่ต้องมีข้อมูลจริง ไม่ต้องใช้เน็ต)
make run                      # API ที่ http://localhost:8780/docs  (อ่านข้อมูลจาก ./data)
```

| ตัวแปรสภาพแวดล้อม | ความหมาย | ค่าเริ่มต้น |
|---|---|---|
| `SITING_DATA` (หรือ `SITING_DATA_DIR`) | โฟลเดอร์ที่มี `<aoi>/meta.json` | `data` |
| `SITING_CORS_ORIGINS` | origin ที่อนุญาต คั่นด้วย comma เช่น `https://app.example.com,https://b.example.com` | ว่าง = ปิด CORS |
| `SITING_LOG_LEVEL` | ระดับ log | `INFO` |
| `PORT` | พอร์ตใน Docker | `8080` |

- ต้องใช้ Python ≥ 3.12 (ล็อกไว้ที่ 3.13 ใน `.python-version`; Docker ใช้ 3.13)
- ตั้งค่าได้จากไฟล์ `.env` ด้วย (อยู่ใน `.gitignore`)
- เทสต์ใช้ข้อมูลสังเคราะห์ที่สร้างเองใน `tests/conftest.py` จึงรันได้โดยไม่มีข้อมูลจริง
- `make help` ดูทุกคำสั่ง

## 4. โครงสร้าง repo

```
aois.json                  ตั้งค่า AOI ทุกแห่ง (bbox, วงโคจร, เดือนฤดูฝน, วันเหตุการณ์สำหรับสอบเทียบ)
pyproject.toml, uv.lock    dependencies + ตั้งค่า ruff/ty/pytest/coverage (uv.lock ต้อง commit)
.python-version            3.13
Makefile                   make check | run | openapi | docker ...
Dockerfile, .dockerignore  API อย่างเดียว หลายขั้น ใช้ uv ฝังโฟลเดอร์ data/ ไว้ในอิมเมจ (.dockerignore เป็น allow-list)
.github/                   workflows/ci.yml (CI), dependabot.yml
.pre-commit-config.yaml    ruff, uv-lock, ตรวจ openapi.json
docs/                      API.md, openapi.json
experiments/               hand_vs_elevation.py สคริปต์ทดลอง ไม่ใช่ส่วนของบริการ
prototype/                 สคริปต์ต้นแบบดั้งเดิม อ่านอย่างเดียว ชี้ path ชั่วคราวที่หายไปแล้ว ถูกแทนที่ด้วย src/
src/siting/
  __init__.py              METHOD_VERSION = "0.3.0" (VH) และ "0.2.0" (VV ล้วน ใช้เมื่อ AOI ไม่มีข้อมูล VH)
  config.py                Settings (pydantic-settings) อ่าน SITING_* จาก environment/.env
  core/
    score.py               ฟังก์ชันล้วนของวิธีคิดคะแนน ใช้ร่วมกันทั้ง pipeline และ API (ค่าคงที่ทุกตัวอยู่ที่นี่)
    grid.py                grid north-up + affine, lon/lat <-> row/col
    raster.py              rasterise polygon (point-in-polygon, even-odd) และคำนวณพื้นที่
  pipeline/                (ต้องใช้เน็ตยกเว้น build)  ดูข้อ 6
    ingest.py              ดึง Sentinel-1 RTC + DEM + WorldCover จาก Planetary Computer ทีละปี
    ingest_pairs.py        ดึง VV+VH ของวันที่ระบุ ใช้สอบเทียบ
    optical.py             ดึง Sentinel-2 L2A: สีจริง + MNDWI + mask เมฆ
    irradiance.py          NASA POWER climatology
    build.py               สร้างไฟล์ที่ API เสิร์ฟ (meta.json, layers.npz, scenes.npz, optical.npz)
    run.py                 รันทุกขั้นตอนของ AOI หนึ่งจาก aois.json
  calibrate.py             เทียบกฎจับน้ำ SAR กับน้ำจาก Sentinel-2 (precision/recall/F1)
  api/
    app.py                 FastAPI: router, lifespan (โหลดข้อมูลตอนเริ่ม), CORS/GZip, ทุก endpoint
    schemas.py             pydantic model ของทุก request/response (ที่มาของ openapi.json)
    store.py               เก็บข้อมูล AOI ในหน่วยความจำ
    openapi.py             สร้าง/ตรวจ docs/openapi.json  (uv run siting-openapi [--check])
  render/chip.py           วาด PNG (ramp สีคงที่ กากบาทตรงจุดที่ถาม)
tests/                     test_core.py, test_api.py (endpoint + openapi ตรงกับโค้ด), test_pipeline.py (calibrate, loader)
data/  raw/                ไฟล์ข้อมูล (ไม่อยู่ใน git)
```

## 5. ข้อมูลที่เสิร์ฟ (`data/<aoi>/`)

API โหลดทั้งหมดเข้าหน่วยความจำตอนเริ่ม (ตอนนี้ อยุธยา 23 MB (VV อย่างเดียว คาดว่า ~45 MB เมื่อมี VH), หาดใหญ่ 40 MB; `scenes.npz` ใหญ่สุด)

| ไฟล์ | เนื้อหา |
|---|---|
| `meta.json` | AOI (ชื่อ, bbox), `run_id`, `method_version`, `params` (กฎน้ำ, เดือนฤดูฝน, น้ำหนัก, เพดาน), grid (affine, CRS EPSG:32647, ขนาด), `scene_set_hash`, `code_sha`, จำนวนภาพ, ตารางความสูง→ความน่าจะเป็นท่วม, ภาพ optical, irradiance, attribution |
| `layers.npz` | ชั้นข้อมูลต่อ pixel: `score`, `water_freq_wet`, `flood_year_share`, `perm_water`, `protected`, `elev`, `p_flood`, `f_flood`, `f_elev`, `landcover` |
| `scenes.npz` | `db` (VV dB), `vh` (VH dB; ไม่มีถ้า AOI ใช้ 0.2.0), `months`, `dates`, `orbits` สำหรับทุกภาพ (float16) |
| `optical.npz` | `rgb` สีจริง, `mndwi`, `dates`, `cloud` ของภาพ Sentinel-2 (ไม่มีถ้า AOI ไม่มีภาพ optical) |

- ทุกอย่างอยู่บน grid 80 ม. UTM 47N (EPSG:32647) ที่ตัดตาม bbox ของ AOI
- ถ้าเปลี่ยนวิธีคิดคะแนนหรือพารามิเตอร์ ต้องรัน `build` ใหม่ (ไม่ต้องดึงภาพใหม่) `run_id` ขึ้นกับเวอร์ชันวิธีและ hash ของรายชื่อภาพ
- `scenes.npz` เป็น **ส่วนย่อย** ของภาพทั้งหมด: ภาพฤดูฝน + ภาพแรกของ ก.พ. และ มี.ค. ต่อปี (ใช้หาน้ำถาวร)

## 6. สร้างข้อมูลซ้ำ (pipeline)

ตั้งค่าที่ [aois.json](aois.json) แล้วรัน (ต้องมีเน็ต ไม่ต้องมีบัญชี Planetary Computer):

```bash
uv sync --extra pipeline                                   # ครั้งแรก (ไลบรารีดึงข้อมูล แยกจากของ API)
uv run siting-run --aoi hatyai --dry-run                   # ดูคำสั่งก่อน
uv run siting-run --aoi hatyai                             # ingest + optical + pairs + build
uv run siting-calibrate raw/hatyai data/hatyai             # ผลสอบเทียบ
```

| ขั้น | ทำอะไร | ใช้เวลา (วัดจริง) | ผลลัพธ์ |
|---|---|---|---|
| `ingest` | Sentinel-1 RTC (VV+VH) ที่ 80 ม. ทีละปี + DEM + WorldCover | **3–10 นาทีต่อปีต่อวงโคจร** (อยุธยา 9 ปี ≈ 1 ชม. ขึ้นไป หาดใหญ่ 2 วงโคจร ≈ 1 ชม.) | `raw/<aoi>/<orbit>/sar/y*.npz`, `layers.npz` |
| `optical` | Sentinel-2 วันที่ใกล้เหตุการณ์ที่เมฆน้อยที่สุด | 3–10 นาที | `raw/<aoi>/s2/<วันที่>.npz` |
| `pairs` | VV+VH ของวันที่ระบุ สำหรับสอบเทียบ | 1–3 นาที | `raw/<aoi>/pairs/<วันที่>.npz` |
| `build` | คำนวณคะแนน เขียนไฟล์ที่ API เสิร์ฟ + ดึง irradiance | วินาที ไม่ต้องใช้เน็ต (ยกเว้น irradiance) | `data/<aoi>/` |

- รันเฉพาะบางขั้นได้: `--steps build` (เช่นหลังแก้วิธีคิดคะแนน) และ `--no-irradiance` ถ้าไม่มีเน็ต
- ทุกขั้น **ทำต่อจากจุดที่ค้างได้** (ข้ามปีที่มีไฟล์แล้ว) และ ingest ลองซ้ำ 3 ครั้งเมื่ออ่านไฟล์พลาด
- **ขั้น ingest ถ้ารันหลายงานพร้อมกันจะช้าลงมากและอาจพังด้วย `TIFFReadEncodedTile failed`** ควรรันทีละ 1–2 งาน
- `run.py` ถูกทดสอบเฉพาะส่วนสร้างคำสั่ง (`test_run_script_builds_expected_commands`) ไม่ได้รันครบทั้งสายใน layout ใหม่ (`raw/<aoi>/<orbit>/`) แต่ทุกขั้นใช้โค้ดเดียวกับที่รันมือจริง
- **ข้อมูลอยุธยาที่มีอยู่ตอนนี้** ถูกสร้างจากโฟลเดอร์ชั่วคราวของต้นแบบ (ไม่ใช่ `run.py`) ถ้าสร้างใหม่ด้วย `run.py` ผลควรเหมือนกัน แต่ยังไม่ได้ตรวจเทียบ
- **เพิ่ม AOI ใหม่:** เติมรายการใน `aois.json` (bbox, orbits, wet, years) แล้วรัน `run.py --aoi <id>` วงโคจรเลือกโดยดูว่าเดือนไหนมีภาพมากสุดใน Planetary Computer (ดูวิธีในข้อ 10) ถ้าอยากสอบเทียบใส่ `optical_targets` และ `pair_dates` ด้วย
- **ขอบเขตป่าสงวน:** `uv run siting-build ... --protected ไฟล์.geojson` (Polygon/MultiPolygon/FeatureCollection พิกัด WGS84) pixel ในนั้นจะ `score: null` เหตุผล `protected_area`

## 7. วิธีคิดคะแนน (ย่อ รายละเอียดที่ DESIGN.md ข้อ 5)

1. pixel เป็น **น้ำ** ในภาพหนึ่งเมื่อ `VH < −18 dB` (0.2.0 ใช้ `VV < −15 dB`)
2. **น้ำถาวร** = เป็นน้ำเกิน 50% ของภาพฤดูแล้ง → ตัดออก
3. **ความถี่** = สัดส่วนภาพฤดูฝนที่เป็นน้ำ; **จำนวนปีที่ท่วม** = สัดส่วนปีที่เป็นน้ำ ≥ 2 ภาพ
4. **ความสูง** → ความน่าจะเป็นท่วม เรียนรู้ต่อ AOI (ช่วงละ 0.5 ม. ไม่เพิ่มตามความสูง)
5. `คะแนน = 100 × (0.7·min(clip(1−ความถี่/0.3), clip(1−ปีที่ท่วม/0.25)) + 0.3·(1−p_flood/max))` เกณฑ์ grade: good ≥ 70, fair 50–69, poor < 50
6. ตัดออก: ต้นไม้ (10), น้ำ (80), พื้นที่ชุ่มน้ำ (90), น้ำถาวร, พื้นที่คุ้มครอง
7. ค่าคงที่ทุกตัวอยู่ที่ `src/siting/core/score.py` และบันทึกใน `meta.json › params` ของแต่ละ run

**ค่าที่ผมตั้งเอง ยังไม่ได้สอบเทียบกับผลลัพธ์จริง:** น้ำหนัก 0.7/0.3, เพดาน 0.3 (ความถี่) และ 0.25 (ปีที่ท่วม), เกณฑ์ grade, เกณฑ์ "ท่วม" ของ pixel (ความถี่ > 0.1) ตอนเรียนรู้ตารางความสูง ต้องให้ทีมธุรกิจหรือข้อมูลผลลัพธ์จริงกำหนด

## 8. บันทึกการตัดสินใจและผลทดลอง (ทำไมถึงเป็นแบบนี้)

| เรื่อง | ผล | ตัดสินใจ |
|---|---|---|
| ใช้ SAR กับ roof detector | SAR ขาวดำ ความละเอียดต่ำกว่าภาพถ่ายหลังคา | ไม่ใช้ แต่ใช้ SAR ประเมิน "ที่ตั้ง" แทน |
| แหล่งข้อมูล | Copernicus Data Space ต้องมีบัญชี | ใช้ **Microsoft Planetary Computer** (STAC, ไม่ต้องล็อกอิน) ⚠ ยังไม่ได้ตรวจเงื่อนไขการใช้เชิงพาณิชย์ |
| ความละเอียด | ดาวน์โหลดช้า (~80 KB/s ในรอบแรก) | อ่านที่ 80 ม. ผ่าน overview |
| HAND ด้วย "pixel แม่น้ำที่ใกล้ที่สุด" | AUC 0.648 เกิดรอยต่อ Voronoi | เลิก ใช้ความสูงที่ smooth แล้วแปลงเป็นความน่าจะเป็น (AUC 0.745 ในอยุธยา วัดในตัวอย่างเดียวกับที่เรียนรู้ จึงสูงเกินจริงได้) |
| HAND ด้วย flow-routing (pysheds) | อยุธยา 0.68–0.69 เทียบความสูง 0.72; หาดใหญ่ 0.60–0.72 (ความสูง 0.98 แต่เกินจริงเพราะมีเขา) | **ไม่ใช้** สคริปต์: `experiments/hand_vs_elevation.py` |
| กฎจับน้ำ VV < −15 → VH < −18 | เทียบ Sentinel-2: VV recall ต่ำมาก (0.06–0.36) VH F1 0.72 (อยุธยา) / 0.63 (หาดใหญ่) | เปลี่ยนเป็น VH < −18 (method 0.3.0) ค่าที่ดีที่สุดเลื่อน −16..−18 ตามวัน จึงเลือก −18 แบบอนุรักษ์นิยม |
| ความถี่อย่างเดียวไม่ลงโทษน้ำท่วมครั้งเดียวที่รุนแรง | หาดใหญ่ pixel ที่ท่วม 23 พ.ย. ได้ "good" 55% | เพิ่มจำนวนปีที่ท่วม (0.2.0) แล้วเปลี่ยนเป็น VH (0.3.0): มัธยฐาน 24 และ 71% "poor" |
| ตรวจน้ำท่วมในเมืองด้วย "VV สว่างขึ้น" | วันท่วม +1.9 dB แต่วันไม่ท่วมก็ +1.2 dB | **ทำไม่ได้** ติด flag `urban_flooding_not_detected` แทน |
| ตารางความสูง→ท่วม ย้ายข้าม AOI | ช่วงความสูงต่างกันมาก (2.5–6.3 ม. vs 2.5–119 ม.) | ย้ายไม่ได้ ต้องเรียนรู้ใหม่ต่อ AOI |
| Sentinel-1 ต่อวงโคจร | Planetary Computer ของหาดใหญ่ descending/164 บางปีแค่ 0–4 ภาพ (2023 ไม่มี) | รวม ascending/70 เข้าด้วย; Sentinel-1B หายไปตั้งแต่ ธ.ค. 2021 ทำให้ภาพ 2022–2024 บางลง |
| ภาพ optical วันที่น้ำท่วมจริงของหาดใหญ่ | เมฆ 100% ทุกวัน 21–26 พ.ย. 2025 | ใช้ภาพ 3 ธ.ค. (หลังน้ำลดบางส่วน) สอบเทียบจึงเป็นค่าต่ำ |

## 9. ข้อจำกัดและปัญหาที่ยังเปิดอยู่

**ความถูกต้องของคะแนน**
1. **น้ำท่วมในเมืองมองไม่เห็น** SAR (ตึกสะท้อนสองครั้ง) ใจกลางหาดใหญ่ท่วม 2–3 ม. แต่ได้คะแนน 100 → ถ้าไปใช้ตัดสินใจ ต้องใช้ flag เตือน หรือเสริมด้วยข้อมูลน้ำท่วม GISTDA / ภาพ optical
2. **เหตุการณ์หายากแต่รุนแรง** ยังได้คะแนนไม่ต่ำพอ (ท่วมครั้งเดียวใน 9 ปียังอาจได้ fair/good) และยังไม่มีความลึกของน้ำ
3. **น้ำใต้พืช** (นาข้าว) อาจพลาด และความสูงเป็นพื้นผิว (DSM) รวมตึกกับต้นไม้
4. **80 ม./pixel** หลังคาเล็กกว่า 1 pixel ผลระดับหลังคาคือค่าของ pixel ที่ครอบ (มี flag `smaller_than_pixel`)
5. **สอบเทียบน้อย** 2 AOI, 2 เหตุการณ์, น้ำจาก optical (MNDWI > 0) เองก็ไม่ใช่ความจริงสมบูรณ์ (ดินเปียกและเงาก็ได้ MNDWI > 0)
6. **พิกัดนิคมอุตสาหกรรมต้นแบบ** เดิมเป็นพิกัดจากความจำ ไม่ได้ตรวจ ห้ามใช้ชื่อนิคมกับพิกัดโดยไม่ตรวจกับ กนอ.

**ทางเทคนิค**
7. `stac_item_id` เป็น `null` เสมอ (ข้อมูลเก็บแค่วันที่) มีแต่ลิงก์ค้น STAC ตามวัน
8. ไม่มี auth, CORS, rate limit; โหลดข้อมูลทั้งหมดเข้า RAM ตอนเริ่ม (ต่อ AOI 20–50 MB; AOI ใหญ่หรือ 20 ม. ต้องคิดใหม่เป็น COG)
9. `confidence.level` ยังไม่มี `high`
10. ข้อมูลต่างเวอร์ชันวิธีอยู่ปนกันได้ (อยุธยา 0.2.0 กับหาดใหญ่ 0.3.0 ระหว่างรอ) เทียบคะแนนข้าม AOI ที่ `method_version` ต่างกันไม่ได้
11. pysheds ไม่เข้ากับ NumPy 2 (เรียก `np.in1d`) ต้องใส่ shim ใน `experiments/` ไม่ได้อยู่ใน dependencies
12. สิทธิ์การใช้ข้อมูล: ยังไม่ได้ตรวจเงื่อนไขของ Planetary Computer สำหรับงานเชิงพาณิชย์ ไม่ใช้ภาพ Google/Esri เป็นหลักฐาน (เงื่อนไขไม่อนุญาต) ต้องแสดง attribution (อยู่ในทุก response)

**ที่ทำไม่ได้โดยผม (ต้องมีคนอื่นช่วย)**
- **InSAR การทรุดตัว:** Planetary Computer ไม่มีข้อมูลที่ใช้คำนวณได้ ต้องสั่งงานผ่าน ASF HyP3 ซึ่งต้องมีบัญชี NASA Earthdata (ผมสร้างบัญชีแทนไม่ได้) ข่าวดินทรุดปี 2025–2026 แทบไม่มี ข้อมูลที่ชัดมาจากงานวิจัย InSAR (สมุทรสาคร ~20 มม./ปี, กรุงเทพฯ ~10 มม./ปี)
- **ขอบเขตป่าสงวน/พื้นที่คุ้มครองจริง:** ต้องขอจากกรมป่าไม้/อุทยาน หรือ กนอ. (โค้ดรองรับแล้ว)
- **น้ำหนักคะแนน:** ต้องให้ทีมธุรกิจกำหนด

## 10. งานต่อ (เรียงตามความสำคัญที่ผมแนะนำ)

1. **เปิด PR** จาก `m3-quality` (หรือแยก 4 อัน ตามลำดับสาขา) — ผมไม่มี `gh` จึงเปิดให้เองไม่ได้
2. **ตัดสินใจว่าข้อมูลจะอยู่ที่ไหน** (ตอนนี้ไม่อยู่ใน git): ตัวเลือก (ก) ฝังในอิมเมจ Docker ตามที่ Dockerfile ทำอยู่ — ง่ายสุด เหมาะ POC; (ข) เก็บใน Cloud Storage แล้วให้ API โหลดตอนเริ่ม; (ค) git LFS
3. **สอบเทียบเพิ่ม** ด้วยเหตุการณ์น้ำท่วมอื่นที่รู้วัน เช่น เชียงราย (ไต้ฝุ่นยางิ ก.ย. 2024), นครสวรรค์/อยุธยา 2025 และเทียบกับแผนที่น้ำท่วม GISTDA (ถ้าขอได้) แล้วพิจารณาเพดาน −16..−18
4. **เพิ่ม AOI** ที่เหลือ: สมุทรสาคร (ตั้งค่าไว้แล้ว), บางพลี สมุทรปราการ, เชียงราย, นครสวรรค์ — ใส่ใน `aois.json` แล้วรัน `run.py`
5. **ต่อกับ roof detector / solsat-backend-go:** ส่ง polygon หลังคาเข้า `POST /v1/suitability/area` ตัดสินใจก่อนว่าหน้าบ้านยิงตรงหรือผ่าน Go (ถ้าผ่าน Go จะใช้ auth เดิมได้ และบริการนี้ไม่ต้องเปิดสาธารณะ)
6. **เพิ่ม auth/CORS/rate limit** ก่อนเปิดสาธารณะ
7. **แก้น้ำท่วมในเมือง** ด้วยข้อมูลน้ำท่วมของ GISTDA หรือภาพ optical (ข้อ 9.1) และ **ความลึกของน้ำ** (ข้อ 9.2)
8. **ย้ายเป็น 20 ม.** (ข้อมูลโต 16 เท่า ต้องเปลี่ยนเป็น COG และอ่านเฉพาะ window แทนการโหลดทั้งหมดเข้า RAM)
9. **InSAR** ต้องมีบัญชี Earthdata ก่อน (ข้อ 9)
10. **ตรวจสิทธิ์การใช้ข้อมูล** Planetary Computer สำหรับงานเชิงพาณิชย์

**ผมเลือกวงโคจรอย่างไร:** ค้น STAC `sentinel-1-rtc` ใน bbox แล้วนับภาพต่อ (orbit_state, relative_orbit) เลือกตัวที่ภาพต่อปีสม่ำเสมอ หากวงโคจรเดียวมีช่องว่างให้เพิ่มวงโคจรที่สอง (ดูตัวอย่างหาดใหญ่ใน `aois.json`)

## 11. สถานะงานเบื้องหลังตอนส่งมอบ

ตอนเขียนเอกสารนี้ งานดึงภาพ VH ซ้ำของอยุธยา (วงโคจร descending/62, ปี 2017–2025) ยังรันอยู่ในเครื่องผู้เขียนผ่านสคริปต์ `finish.sh` ซึ่งเมื่อดึงครบจะสร้างข้อมูลอยุธยาเป็น 0.3.0 แล้วดึงและสร้างสมุทรสาครต่อ ถ้ารับงานต่อและไม่พบผล ให้รันเองได้ด้วย:

```bash
uv run siting-run --aoi ayutthaya     # ~1 ชม.
uv run siting-run --aoi samutsakhon   # ไม่มีขั้น optical/pairs
```

## 12. Deploy (ร่างแผน ยังไม่เคยทำจริง)

**ที่ยืนยันแล้ว:** `docker build` สำเร็จ (522 MB) คอนเทนเนอร์รันด้วย user ที่ไม่ใช่ root (uid 10001) ผ่าน HEALTHCHECK (`healthy`) และตอบ `/readyz` กับ `/v1/suitability` ได้ที่พอร์ต 8080

```bash
make docker                              # = docker build -t solsat-siting .  (ต้องมี data/ ที่สร้างแล้ว)
docker run -p 8080:8080 solsat-siting
```

- ฝังโฟลเดอร์ `data/` ไว้ในอิมเมจ ถ้าไม่มีข้อมูล `/healthz` ตอบ 200 แต่ `/readyz` ตอบ **503** (ใช้เป็น readiness probe บน Cloud Run/k8s)
- ตั้งค่าด้วย environment: `SITING_CORS_ORIGINS`, `SITING_LOG_LEVEL`, `PORT`

**แผนที่เสนอ (ยังไม่ได้ลอง):**
- **POC / free tier:** GCP Cloud Run (scale ลงเป็นศูนย์) + Artifact Registry; ข้อมูลฝังในอิมเมจ; pipeline รันบนเครื่องคน ไม่ต้องมี worker บน cloud ใช้ repo เดียว ไม่ต้องใช้ k8s ตัวเลข free tier ที่ผมจำได้ (Cloud Run ~2 ล้าน request/เดือน) **ต้องเปิดหน้า pricing ยืนยันก่อน** และ GCP ต้องผูกบัตรกับ billing account ตั้ง budget alert ไว้
- **ตอนโตขึ้น:** ย้ายข้อมูลไป Cloud Storage (COG), เพิ่ม Cloud Run Job + Scheduler รัน pipeline อัตโนมัติ, Postgres/Neon สำหรับ catalog (โครงข้อมูลใน DESIGN.md ข้อ 3), Secret Manager
- สถาปัตยกรรมเต็มและเหตุผลเลือก GCP: DESIGN.md ข้อ 2

## 13. เครื่องมือพัฒนาและการทดสอบ

| เครื่องมือ | ใช้ทำอะไร | คำสั่ง |
|---|---|---|
| **uv** | จัดการ Python, dependencies, lockfile (`uv.lock`) | `uv sync`, `uv run ...` |
| **ruff** | lint + format (แทน flake8/black/isort) ตั้งค่าที่ `pyproject.toml` | `make lint`, `make fmt` |
| **ty** | type checker ของ Astral (เร็ว ตอนนี้เป็น beta จึงอาจมี false positive; ปิด/เปลี่ยนเป็น pyright ได้) | `make typecheck` |
| **pytest + pytest-cov** | 29 เทสต์ coverage 87% (ตั้งขั้นต่ำ 85%) | `make test` |
| **pre-commit** | รัน ruff, ตรวจ `uv.lock` และ `openapi.json` ก่อน commit | `uv run pre-commit install` หรือ `uvx pre-commit install` (ยังไม่ได้ติดตั้ง hook ในเครื่องผม) |
| **GitHub Actions** | `.github/workflows/ci.yml`: lint, format, type, openapi, เทสต์, build Docker + smoke test | **ยังไม่เคยรันบน GitHub จริง** (ผมรันเทียบเท่าบนเครื่องด้วย `make check`) ถ้า CI แดงครั้งแรก ให้ดู log ก่อน |
| **Dependabot** | เปิด PR อัปเดต uv, GitHub Actions, Docker รายสัปดาห์ | `.github/dependabot.yml` |

`make check` = ทุกอย่างที่ CI ทำ (ใช้ก่อนเปิด PR)

**เปลี่ยน endpoint หรือ schema แล้วต้อง** `make openapi` เพื่อ regenerate `docs/openapi.json` (มีเทสต์และ CI ตรวจว่าไฟล์ตรงกับโค้ด)

**หมายเหตุเรื่อง `httpx2`:** ตอนรันเทสต์ starlette เตือนให้ใช้แพ็กเกจ `httpx2` แทน `httpx` ผมยังไม่ได้ตรวจว่าเป็นแพ็กเกจที่เชื่อถือได้จึงไม่ติดตั้ง (ปิดคำเตือนไว้ใน `pyproject.toml`) ผู้รับงานควรตรวจต้นทางแล้วค่อยตัดสินใจ

| ไฟล์ทดสอบ | ครอบคลุม |
|---|---|
| `tests/test_core.py` | น้ำ/น้ำถาวร, ตารางความสูงไม่เพิ่มตามความสูง, น้ำหนักและการตัดออก, เกณฑ์ grade, จำนวนปีที่ท่วม (ภาพหลุดภาพเดียวไม่นับ), คำสั่งของ `run.py` |
| `tests/test_api.py` | grid ไป-กลับ, ทุก endpoint, null score ใน pixel ที่ตัดออก, 404 นอกพื้นที่, **evidence ตรงกับ input ของคะแนน**, รูป PNG, กฎ VH, วงโคจรและเดือนฤดูฝนต่อ AOI, area (รวมหลังคาเล็กกว่า pixel และ body ที่ผิด), พื้นที่คุ้มครอง, `/readyz`, CORS, ตัวแปร environment, **`docs/openapi.json` ตรงกับโค้ด** |
| `tests/test_pipeline.py` | `calibrate` (precision/recall/F1 และเลือกกฎที่ตรงกับน้ำ optical), `load_ingested` (รวมหลายวงโคจร, ไม่มี VH → ใช้ VV, ไม่มีไฟล์ → error ชัดเจน), `load_geometries` |

**ที่ไม่ได้ครอบคลุมด้วยเทสต์:** ขั้น pipeline ที่ใช้เน็ต (ingest, optical, pairs, irradiance) และตัวเลขสอบเทียบจริง ตรวจด้วยการรันจริงเท่านั้น

## 14. สิ่งที่ควรระวัง (gotchas ที่เจอมาแล้ว)

- **SAS token ของ Planetary Computer หมดอายุใน ~45 นาที:** ingest เซ็นใหม่ทุกปีและลองซ้ำ (เคยเจอ HTTP 403 กลางทางทำให้ต้องรันใหม่)
- **รัน ingest หลายงานพร้อมกัน** ช้าลงมากและเกิด `TIFFReadEncodedTile failed` ได้
- **เกณฑ์ dB ที่ 80 ม.:** pixel ปนน้ำกับพื้นดิน ค่าเฉลี่ยจึงไม่มืดเท่าน้ำล้วน (เคยลอง VV < −18 dB แล้วแทบไม่เจอน้ำ ต้องดูการกระจายของค่าจริงก่อนตั้งเกณฑ์ใหม่)
- **`pgrep -f` ในสคริปต์รอ** อาจเจอคำสั่งตัวเอง ใช้รูปแบบ `[x]xx` กัน
- **ข้อมูลเก่ากับเวอร์ชันใหม่:** `components.flood.years_flooded_share` อาจเป็น `null` ในข้อมูลที่สร้างก่อน 0.2.0

## 15. คำศัพท์

| คำ | ความหมาย |
|---|---|
| **AOI** | Area of Interest พื้นที่ที่ประมวลผลไว้ล่วงหน้า |
| **SAR / Sentinel-1** | เรดาร์ที่มองทะลุเมฆ น้ำนิ่งสะท้อนกลับน้อย (มืด) |
| **VV / VH** | โพลาไรเซชันของสัญญาณ VH ไวต่อพื้นผิวน้ำและพืชมากกว่าในงานนี้ |
| **dB** | หน่วยความสว่างของ SAR (ค่าติดลบมาก = มืด = น่าจะเป็นน้ำ) |
| **RTC** | Radiometric Terrain Corrected ภาพ SAR ที่แก้ผลของภูมิประเทศแล้ว |
| **STAC** | มาตรฐานแค็ตตาล็อกภาพดาวเทียมที่ Planetary Computer ใช้ |
| **DSM** | แบบจำลองพื้นผิว (รวมตึก/ต้นไม้) ต่างจาก DTM ที่เป็นพื้นดินเปล่า |
| **MNDWI** | ดัชนีน้ำจากภาพ optical (เขียว vs SWIR) > 0 ≈ น้ำ ใช้เป็น "ความจริง" ตอนสอบเทียบ |
| **HAND** | Height Above Nearest Drainage ความสูงเหนือทางน้ำที่ใกล้ที่สุด |
| **InSAR** | วัดการเคลื่อนตัวของพื้นดินจากการเทียบเฟสของ SAR สองภาพ (ยังไม่ได้ทำ) |
| **WorldCover** | แผนที่ชนิดพื้นที่ของ ESA ที่ 10 ม. (ปี 2021) |
| **method_version** | เวอร์ชันของวิธีคิดคะแนน (0.2.0 = VV, 0.3.0 = VH) |
| **run_id** | รหัสรอบประมวลผลของ AOI หนึ่ง ใช้ย้อนหลักฐาน |

## 16. Attribution

*Contains modified Copernicus Sentinel data (2017–2025); Copernicus DEM GLO-30; ESA WorldCover 2021 (CC BY 4.0); NASA POWER climatology* ต้องแสดงในผลลัพธ์ที่นำไปใช้ต่อ (ฟิลด์ `attribution` ในทุก response)
