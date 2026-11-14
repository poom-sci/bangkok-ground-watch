# solsat-siting — API spec (v1, method 0.3.0)

บริการอ่านอย่างเดียวที่ตอบ **คะแนนความเหมาะสมของพื้นที่** (site suitability) สำหรับตั้งโรงงานที่จะติดโซลาร์ พร้อม **หลักฐาน** ว่าคะแนนมาจากภาพดาวเทียมอะไร

- สัญญา (contract) แบบเครื่องอ่านได้: [`openapi.json`](openapi.json) สร้างจาก pydantic model ใน `src/siting/api/schemas.py` (ทุก request/response มี schema; **เทสต์และ CI ตรวจว่าไฟล์นี้ตรงกับโค้ด**) หน้าทดลองตอนรันอยู่ที่ `/docs` และ `/redoc`
- ที่มาของวิธีคิด: [`../DESIGN.md`](../DESIGN.md) ข้อ 5 และผลสอบเทียบข้อ 11
- ตัวอย่างทุก response ด้านล่างมาจาก server ที่รันจริง (ตัดบางส่วน)

---

## 1. ข้อตกลงทั่วไป

| เรื่อง | ค่า |
|---|---|
| Base URL | `http://localhost:8780` (ตอนพัฒนา) ยังไม่มี URL บน cloud |
| Prefix | `/v1` (ยกเว้น `/healthz`) |
| รูปแบบ | JSON (UTF-8) ยกเว้น `/v1/evidence/chip` ที่ตอบ PNG |
| พิกัด | WGS84: `lat` (−90..90), `lng` (−180..180) ลำดับใน GeoJSON เป็น `[lng, lat]` |
| Auth | **ยังไม่มี** เปิดอ่านอย่างเดียว ก่อนเปิดสาธารณะต้องวางหลัง gateway หรือ `solsat-backend-go` |
| ความสามารถ | **อ่านอย่างเดียว** ไม่มี endpoint เขียน ไม่ดึงภาพจากภายนอกตอนรับ request |
| พื้นที่ที่ตอบได้ | เฉพาะ AOI ที่ประมวลผลไว้ล่วงหน้า (ดู `/v1/coverage`) นอกนั้น `404 outside_coverage` |
| ความละเอียด | 80 ม./pixel ใช้ประเมินระดับย่านได้ ไม่ใช่ระดับหลังคา |
| CORS | **ปิดเป็นค่าเริ่มต้น** เปิดด้วย `SITING_CORS_ORIGINS=https://app.example.com,...` (เฉพาะ GET/POST) |
| การบีบอัด | gzip อัตโนมัติสำหรับ response ที่ใหญ่กว่า 1 KB |

### Versioning และความเข้ากันได้
- `/v1` รับประกันว่า **จะเพิ่มฟิลด์ได้ แต่ไม่เปลี่ยนชื่อ ไม่ลบ ไม่เปลี่ยนความหมาย** ผู้เรียกต้องไม่พังเมื่อเจอฟิลด์ใหม่
- `method_version` คือเวอร์ชันของวิธีคิดคะแนน (ดูข้อ 5) **AOI แต่ละแห่งอาจใช้คนละเวอร์ชันได้** จึงเทียบคะแนนข้าม AOI ที่ `method_version` ต่างกันไม่ได้
- `run_id` ระบุรอบประมวลผลที่ให้คะแนนนั้น (`run_<aoi>_<method>_<hash ของชุดภาพ>`) เก็บไว้กับคะแนนเสมอเพื่อย้อนหลักฐาน

### รูปแบบ error
FastAPI ห่อ error ไว้ใน `detail`

| HTTP | `detail` | เมื่อไหร่ |
|---|---|---|
| 404 | `{"error": "outside_coverage", "available_aois": [...]}` | จุดอยู่นอกทุก AOI |
| 404 | `{"error": "outside_coverage", "run_id": "..."}` | ระบุ `run_id` แต่จุดอยู่นอก AOI ของ run นั้น |
| 404 | `{"error": "unknown_run", "run_id": "..."}` | ไม่มี `run_id` นี้ |
| 404 | `{"error": "unknown_scene"}` / `{"error": "unknown_optical_scene"}` | ไม่มีภาพ SAR หรือภาพ optical นั้น |
| 422 | ข้อความ หรือรายการ error ของ validation | พารามิเตอร์ผิด/ขาด, geometry ไม่ใช่ Polygon/MultiPolygon, ให้ทั้ง `scene_id` และ `layer` |
| 422 | `{"error": "area_too_large", "max_m2": 25000000, "area_m2": ...}` | polygon ใหญ่เกิน 25 ตร.กม. |

---

## 2. Endpoints

| Method | Path | ใช้ทำอะไร |
|---|---|---|
| GET | `/healthz` | liveness: ตอบ 200 เมื่อโปรเซสทำงาน พร้อมรายการ AOI ที่โหลดอยู่ |
| GET | `/readyz` | readiness: 200 เมื่อโหลด AOI อย่างน้อย 1 แห่ง ไม่เช่นนั้น **503** |
| GET | `/v1/coverage` | รายการ AOI พร้อม bbox, run และเวอร์ชันวิธี |
| GET | `/v1/runs/{run_id}` | พารามิเตอร์ทั้งหมดของรอบประมวลผล |
| GET | `/v1/suitability` | **คะแนนของจุดเดียว** |
| POST | `/v1/suitability/area` | **สถิติคะแนนในแปลง (polygon)** |
| GET | `/v1/evidence` | **หลักฐาน**: ภาพที่ใช้และค่าที่อ่านได้ ณ จุดนั้น |
| GET | `/v1/evidence/chip` | รูป PNG ของภาพ SAR หรือชั้นข้อมูลรอบจุด |

### 2.1 `GET /healthz`
```json
{"ok": true, "aois": ["ayutthaya", "hatyai"]}
```

### 2.2 `GET /v1/coverage`
ไม่มีพารามิเตอร์ ใช้วาดขอบเขตที่รองรับบนแผนที่

```json
{"aois": [{
  "id": "hatyai", "name": "Hat Yai",
  "bbox": [100.3489, 6.8990, 100.6009, 7.1212],
  "run_id": "run_hatyai_0.3.0_0fffd44d", "method_version": "0.3.0",
  "pixel_m": 80.0, "date_range": ["2017-02-02", "2025-12-29"]
}]}
```
`bbox` = `[west, south, east, north]`

### 2.3 `GET /v1/runs/{run_id}`
ตอบ `run_id`, `method_version`, `params` (กฎน้ำ, เดือนฤดูฝน, น้ำหนัก, เพดานต่าง ๆ), `scene_set_hash`, `code_sha`, `created_at`, `scenes_total/wet/dry`, `date_range`, `scene_source`, `elev_flood_table` (ตารางความสูง→ความน่าจะเป็นท่วมที่เรียนรู้ใน AOI นี้), `attribution`

### 2.4 `GET /v1/suitability`

**Input (query)**

| ชื่อ | ชนิด | บังคับ | ความหมาย |
|---|---|---|---|
| `lat` | number | ใช่ | −90..90 |
| `lng` | number | ใช่ | −180..180 |

**Output 200**
```json
{
  "location": {"lat": 7.04, "lng": 100.47},
  "aoi": {"id": "hatyai", "name": "Hat Yai"},
  "run_id": "run_hatyai_0.3.0_0fffd44d",
  "method_version": "0.3.0",
  "score": 100,
  "grade": "good",
  "components": {
    "flood": {"value": 0.0, "unit": "share of wet-season scenes with water",
              "years_flooded_share": 0.0, "subscore": 1.0, "weight": 0.7},
    "elevation": {"value": 8.5, "unit": "m (Copernicus DEM, a surface model)",
                  "p_flood": 0.0, "subscore": 1.0, "weight": 0.3}
  },
  "exclusions": [],
  "landcover": {"class": 50, "label": "built-up", "source": "ESA WorldCover 2021"},
  "confidence": {"level": "medium", "flags": ["urban_flooding_not_detected", "elevation_is_dsm"]},
  "irradiance": {"ghi_kwh_m2_day": {"JAN": 4.7174, "...": "..."}, "ghi_annual_mean": 5.0102,
                 "source": "NASA POWER climatology (ALLSKY_SFC_SW_DWN)", "note": "..."},
  "evidence_url": "/v1/evidence?lat=7.04&lng=100.47&run_id=run_hatyai_0.3.0_0fffd44d",
  "attribution": ["Contains modified Copernicus Sentinel data ...", "Copernicus DEM GLO-30", "ESA WorldCover 2021 (CC BY 4.0)"]
}
```

| ฟิลด์ | ความหมาย |
|---|---|
| `score` | จำนวนเต็ม 0–100 หรือ **`null`** เมื่อจุดอยู่ในพื้นที่ที่ตัดออก (ดู `exclusions`) |
| `grade` | `good` (≥70), `fair` (50–69), `poor` (<50), หรือ `null` เมื่อ `score` เป็น `null` **เกณฑ์ชั่วคราว** |
| `components.flood.value` | สัดส่วนภาพ SAR ฤดูฝนที่ pixel นี้เป็นน้ำ (0–1) |
| `components.flood.years_flooded_share` | สัดส่วนปีที่ท่วม (ปีหนึ่งนับเมื่อมีน้ำ ≥ 2 ภาพฤดูฝน) **อาจเป็น `null`** ถ้าข้อมูลสร้างก่อนเพิ่มฟิลด์นี้ |
| `components.*.subscore` | 0–1 ยิ่งสูงยิ่งดี |
| `components.elevation.p_flood` | ความน่าจะเป็นที่ pixel ที่ความสูงนี้จะท่วม เรียนรู้ภายใน AOI นั้น |
| `exclusions` | ค่าที่เป็นไปได้: `permanent_water`, `tree_cover`, `water_body`, `wetland`, `protected_area` |
| `landcover.class` | รหัส ESA WorldCover: 10 ต้นไม้, 20 พุ่มไม้, 30 หญ้า, 40 เพาะปลูก, 50 สิ่งปลูกสร้าง, 60 ดินเปล่า, 70 หิมะ, 80 น้ำ, 90 พื้นที่ชุ่มน้ำ, 95 ป่าชายเลน, 100 ตะไคร่ |
| `confidence.level` | `medium` หรือ `low` (low เมื่อมี flag เกิน 2 ข้อ) ยังไม่มี `high` |
| `irradiance` | ค่าแสงรายเดือนและเฉลี่ยต่อปี (kWh/m²/วัน) **ไม่รวมในคะแนน** อาจเป็น `null` |
| `evidence_url` | เรียกต่อเพื่อดูหลักฐาน เป็น path สัมพัทธ์ |

**Flags (`confidence.flags`)**

| flag | เงื่อนไข |
|---|---|
| `urban_flooding_not_detected` | land cover เป็น built-up SAR มองน้ำท่วมระหว่างตึกไม่เห็น คะแนนอาจสูงเกินจริง |
| `vegetated_flooding_not_detected` | land cover เป็นหญ้า/เพาะปลูก น้ำใต้พืชอาจพลาด |
| `elevation_is_dsm` | ความสูงเป็นพื้นผิว (รวมตึกและต้นไม้) มีทุกคำตอบ |
| `near_permanent_water` | ห่างน้ำถาวรไม่เกิน 2 pixel ค่าอาจปนกัน |
| `aoi_edge` | อยู่ใกล้ขอบ AOI (ใน 3 pixel) |
| `few_wet_scenes` | ภาพฤดูฝนน้อยกว่า 60 ภาพ |

### 2.5 `POST /v1/suitability/area`
ใช้กับแปลงที่ดิน และเป็นจุดเชื่อม **roof detector** (ส่ง polygon ของหลังคาเข้ามา)

**Input (JSON body)**
```json
{"geometry": {"type": "Polygon", "coordinates": [[[100.600,14.275],[100.601,14.275],[100.601,14.276],[100.600,14.276],[100.600,14.275]]]}}
```
- รับ `Polygon` (มีรูได้) และ `MultiPolygon` พิกัดเป็น `[lng, lat]`
- ใช้จุดกึ่งกลางของ polygon (ring แรก) เลือก AOI ถ้า polygon คร่อมหลาย AOI จะนับเฉพาะ AOI ของจุดกึ่งกลาง
- พื้นที่สูงสุด **25 ตร.กม.**

**Output 200**
```json
{
  "aoi": {"id": "ayutthaya", "name": "Ayutthaya"},
  "run_id": "run_ayutthaya_0.2.0_b2948de1", "method_version": "0.2.0",
  "area_m2": 11938, "pixels": 4, "pixel_m": 80.0,
  "score_mean": 87.6, "score_p10": 73.9,
  "share_poor": 0.0, "share_excluded": 0.0,
  "components": {"flood_freq": 0.017, "elevation_m": 3.834, "p_flood": 0.022},
  "flags": [],
  "evidence_url": "/v1/evidence?lat=14.2754&lng=100.6004&run_id=run_ayutthaya_0.2.0_b2948de1",
  "attribution": ["..."]
}
```

| ฟิลด์ | ความหมาย |
|---|---|
| `pixels` | จำนวน pixel ที่จุดกึ่งกลางอยู่ในแปลง (ถ้าไม่มี pixel ใดเลย ใช้ pixel ใต้จุดกึ่งกลาง 1 pixel) |
| `score_mean`, `score_p10` | เฉลี่ย และเปอร์เซ็นไทล์ที่ 10 (ส่วนที่แย่ของแปลง) เฉพาะ pixel ที่ไม่ถูกตัดออก `null` ถ้าถูกตัดออกหมด |
| `share_poor` | สัดส่วน pixel ที่ `score < 50` (จาก pixel ที่ไม่ถูกตัดออก) |
| `share_excluded` | สัดส่วน pixel ที่ถูกตัดออก (ต้นไม้ น้ำ ฯลฯ) |
| `flags` | `smaller_than_pixel` เมื่อพื้นที่เล็กกว่า 1 pixel (80×80 ม.) เช่นหลังคา ค่าที่ได้คือค่าของ pixel ที่ครอบหลังคา ไม่ใช่ของหลังคาเอง |

### 2.6 `GET /v1/evidence`
เส้นพิสูจน์ ตอบว่าคะแนนมาจากภาพไหน วันไหน ค่าเท่าไร ค่าใน `scenes` เป็นข้อมูลชุดเดียวกับที่ใช้คิดคะแนนจริง (ไม่ได้คำนวณใหม่)

**Input (query)**

| ชื่อ | บังคับ | ความหมาย |
|---|---|---|
| `lat`, `lng` | ใช่ | จุดที่ถาม |
| `run_id` | ไม่ | ระบุรอบประมวลผล (ค่าเริ่มต้น: AOI ที่ครอบคลุมจุดนั้น) |

**Output 200 (ตัดบางส่วน)**
```json
{
  "run_id": "run_hatyai_0.3.0_0fffd44d",
  "method": {"version": "0.3.0", "water_rule": "VH_dB < -18", "wet_months": [10, 11, 12], "pixel_m": 80.0,
             "scene_set_hash": "sha256:0fffd4...", "code_sha": "856743d",
             "scene_source": "sentinel-1-rtc, orbits ascending/70, descending/164; ... (subset)"},
  "point": {"lat": 7.04, "lng": 100.47, "pixel": {"row": 111, "col": 166}},
  "summary": {"scenes_total": 128, "scenes_wet": 100, "wet_scenes_with_water": 0, "wet_scenes_valid": 100},
  "scenes": [{
    "scene_id": "s1rtc-desc164-2017-02-02", "acquired_at": "2017-02-02", "platform": "sentinel-1",
    "orbit": "descending/164", "season": "dry",
    "vv_db": -5.84, "vh_db": -11.17, "is_water": false,
    "chip_url": "/v1/evidence/chip?lat=7.04&lng=100.47&run_id=...&scene_id=s1rtc-desc164-2017-02-02",
    "stac_item_id": null,
    "source_url": "https://planetarycomputer.microsoft.com/api/stac/v1/search?collections=sentinel-1-rtc&bbox=...&datetime=..."
  }],
  "layers": [{"kind": "elev", "value": 8.5, "source": "Copernicus DEM GLO-30", "chip_url": "..."},
             {"kind": "water_freq_wet", "value": 0.0, "chip_url": "..."},
             {"kind": "landcover", "value": 50, "source": "ESA WorldCover 2021", "chip_url": "..."},
             {"kind": "score", "value": 100.0, "chip_url": "..."}],
  "optical_reference": [{"acquired_at": "2025-12-03", "source": "Sentinel-2 L2A", "cloud_pct_aoi": 47.0,
                         "nearest_sar_days": 2, "mndwi": -0.37, "optical_water": false, "chip_url": "..."}],
  "attribution": ["..."]
}
```

| ฟิลด์ | ความหมาย |
|---|---|
| `method.water_rule` | กฎที่ใช้จริงของ AOI นี้ เช่น `VH_dB < -18` (0.3.0) หรือ `VV_dB < -15` (0.2.0) |
| `summary.wet_scenes_with_water` | จำนวนภาพฤดูฝนที่ pixel นี้เป็นน้ำ (นี่คือที่มาของ `flood.value`) |
| `scenes[]` | **ทุก** ภาพที่ใช้ เรียงตามเวลา `is_water` คือผลของกฎข้างบน `vh_db` เป็น `null` ใน AOI ที่สร้างโดยไม่มี VH |
| `scenes[].scene_id` | รูปแบบ `s1rtc-<asc\|desc><วงโคจร>-<วันที่>` ใช้กับ `/v1/evidence/chip` |
| `scenes[].stac_item_id` | **ตอนนี้เป็น `null` เสมอ** (ข้อมูลเก็บแค่วันที่) ให้ `source_url` ซึ่งเป็นลิงก์ค้น STAC ตามวันที่และ bbox แทน |
| `optical_reference[]` | ภาพ Sentinel-2 สีจริงที่ใกล้เหตุการณ์ `optical_water` = `mndwi > 0` และเป็น `null` ถ้า pixel นั้นถูกเมฆบัง `[]` ถ้า AOI ไม่มีภาพ optical |
| `method.scene_source` | ชุดภาพเป็น **ส่วนย่อย** (ภาพฤดูฝน + ภาพแรกของ ก.พ. และ มี.ค. ต่อปี) ไม่ใช่ทุกภาพที่ Sentinel-1 ถ่าย |

### 2.7 `GET /v1/evidence/chip`
ตอบ **ภาพ PNG** ขนาดราว 512 px มีกากบาทตรงจุดที่ถาม

**Input (query)**

| ชื่อ | บังคับ | ความหมาย |
|---|---|---|
| `lat`, `lng` | ใช่ | จุดกึ่งกลางภาพ |
| `scene_id` **หรือ** `layer` | ใช่ (อย่างใดอย่างหนึ่งเท่านั้น) | ให้ทั้งสองหรือไม่ให้เลย → 422 |
| `layer` | | `elev`, `water_freq_wet`, `landcover`, `score`, หรือ `s2-<YYYY-MM-DD>` (ภาพ Sentinel-2 สีจริง) |
| `band` | ไม่ | `vv` (ค่าเริ่มต้น) หรือ `vh` ใช้กับ `scene_id` |
| `overlay` | ไม่ | `water_mask` ทาสีน้ำเงินทับ pixel ที่เป็นน้ำตามกฎของ AOI (ใช้กับ `scene_id`) |
| `size_m` | ไม่ | ความกว้างกรอบเป็นเมตร 500–30000 (ค่าเริ่มต้น 8000) |
| `run_id` | ไม่ | ระบุรอบประมวลผล |

**Output:** `200 image/png` พร้อม `Cache-Control: public, max-age=31536000, immutable` (cache ได้ถาวรเพราะ run ไม่เปลี่ยน) สีคงที่เพื่อเทียบข้ามวันได้: SAR VV −20..0 dB, VH −30..−5 dB, คะแนนแดง→เขียว (0/50/70/100)

---

## 3. วิธีคิดคะแนน (method 0.3.0)

1. **น้ำต่อภาพ:** pixel ที่ `VH < −18 dB` นับเป็นน้ำ (0.2.0 ใช้ `VV < −15 dB` สำหรับ AOI ที่ไม่มี VH)
2. **น้ำถาวร:** เป็นน้ำในภาพฤดูแล้ง (ก.พ.–มี.ค.) เกิน 50% → ตัดออก
3. **ความถี่น้ำท่วม:** สัดส่วนภาพฤดูฝนที่เป็นน้ำ (ฤดูฝน: อยุธยา ส.ค.–พ.ย., หาดใหญ่ ต.ค.–ธ.ค.)
4. **จำนวนปีที่ท่วม:** ปีหนึ่งนับเมื่อมีน้ำ ≥ 2 ภาพฤดูฝน
5. **ความสูง → ความน่าจะเป็นท่วม:** แบ่ง DEM ช่วงละ 0.5 ม. เรียนรู้ต่อ AOI (ใช้ข้าม AOI ไม่ได้)
6. **คะแนน** = `100 × (0.7·min(clip(1 − freq/0.3), clip(1 − years_flooded/0.25)) + 0.3·(1 − p_flood/max p_flood))`
7. **ตัดออก:** ต้นไม้ (10), น้ำ (80), พื้นที่ชุ่มน้ำ (90), น้ำถาวร, พื้นที่คุ้มครอง

น้ำหนัก 0.7/0.3, เพดาน 0.3 และ 0.25, และเกณฑ์ grade เป็นค่าที่ **ตั้งเอง ยังไม่ได้สอบเทียบกับผลลัพธ์จริง** ส่วน threshold น้ำสอบเทียบกับ Sentinel-2 แล้ว (DESIGN ข้อ 11)

## 4. ข้อจำกัดที่ผู้เรียกต้องรู้
- **ใจกลางเมืองที่ท่วม คะแนนอาจสูงเกินจริง** (flag `urban_flooding_not_detected`) หาดใหญ่ 23 พ.ย. 2025 ท่วม 2–3 ม. แต่ SAR มองไม่เห็นในพื้นที่ตึก
- **ที่ละเอียด 80 ม.** ผลระดับหลังคาคือค่าของ pixel ที่ครอบ ไม่ใช่ของหลังคา
- **น้ำใต้พืชอาจพลาด** และความสูงเป็นพื้นผิว (DSM)
- ยังไม่มีการทรุดตัว (InSAR) และยังไม่มีข้อมูลขอบเขตป่าสงวนจริง (รองรับแต่ต้องมีไฟล์ขอบเขต)
- ตารางความสูง→ความน่าจะเป็นท่วม ใช้ข้าม AOI ไม่ได้ AOI ใหม่ต้องประมวลผลใหม่ทั้งหมด

## 5. รันและทดสอบ
```bash
uv sync && make check          # lint, type check, openapi, 29 tests
make run                       # http://localhost:8780/docs
```
สร้างข้อมูล AOI: `siting.pipeline.ingest` → `siting.pipeline.optical` → `siting.pipeline.build` ดู README และ DESIGN (ข้อมูลใน `data/` และ `raw/` ไม่อยู่ใน git)

สร้าง `openapi.json` ใหม่หลังเปลี่ยน endpoint:
```bash
make openapi        # = uv run siting-openapi
```

## 6. Attribution
ต้องแสดงในผลที่นำไปใช้ต่อ: *Contains modified Copernicus Sentinel data; Copernicus DEM GLO-30; ESA WorldCover 2021 (CC BY 4.0); NASA POWER* (ฟิลด์ `attribution` ในทุก response)
