"""Pydantic models for every request and response. They are the source of docs/openapi.json."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Grade = Literal["good", "fair", "poor"]
Exclusion = Literal["permanent_water", "tree_cover", "water_body", "wetland", "protected_area"]
Flag = Literal[
    "few_wet_scenes",
    "vegetated_flooding_not_detected",
    "urban_flooding_not_detected",
    "elevation_is_dsm",
    "near_permanent_water",
    "aoi_edge",
]


# ---------- shared ----------
class LatLng(BaseModel):
    lat: float
    lng: float


class AoiRef(BaseModel):
    id: str = Field(examples=["hatyai"])
    name: str = Field(examples=["Hat Yai"])


class ErrorDetail(BaseModel):
    error: str = Field(examples=["outside_coverage"])
    run_id: str | None = None
    available_aois: list[dict[str, Any]] | None = None
    max_m2: int | None = None
    area_m2: int | None = None


class ErrorResponse(BaseModel):
    """FastAPI wraps errors as {"detail": ...}. For 404/422 raised by this service detail is an ErrorDetail."""

    detail: ErrorDetail | str | list[Any]


# ---------- /healthz /readyz ----------
class Health(BaseModel):
    ok: bool
    aois: list[str]


# ---------- /v1/coverage ----------
class CoverageAoi(BaseModel):
    id: str
    name: str
    bbox: list[float] = Field(description="[west, south, east, north], WGS84", min_length=4, max_length=4)
    run_id: str
    method_version: str
    pixel_m: float
    date_range: list[str] = Field(description="[first, last] Sentinel-1 date used")


class Coverage(BaseModel):
    aois: list[CoverageAoi]


# ---------- /v1/runs/{run_id} ----------
class Run(BaseModel):
    run_id: str
    method_version: str
    params: dict[str, Any]
    scene_set_hash: str
    code_sha: str
    created_at: str
    scenes_total: int
    scenes_wet: int
    scenes_dry: int
    date_range: list[str]
    scene_source: str
    elev_flood_table: dict[str, list[float]]
    attribution: list[str]


# ---------- /v1/suitability ----------
class FloodComponent(BaseModel):
    value: float | None = Field(description="Share of wet-season scenes in which the pixel is water (0-1)")
    unit: str
    years_flooded_share: float | None = Field(
        None,
        description="Share of observed years with water in >= 2 wet scenes. null for data built before 0.2.0",
    )
    subscore: float | None = Field(description="0-1, higher is better")
    weight: float


class ElevationComponent(BaseModel):
    value: float | None = Field(description="Smoothed Copernicus DEM height in metres (a surface model)")
    unit: str
    p_flood: float | None = Field(description="P(flooded | height), learned inside this AOI only")
    subscore: float | None
    weight: float


class Components(BaseModel):
    flood: FloodComponent
    elevation: ElevationComponent


class Landcover(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    class_: int = Field(alias="class", description="ESA WorldCover class code")
    label: str
    source: str


class Confidence(BaseModel):
    level: Literal["medium", "low"] = Field(description="low when more than 2 flags apply")
    flags: list[Flag]


class Irradiance(BaseModel):
    ghi_kwh_m2_day: dict[str, float] = Field(description="Monthly mean, keys JAN..DEC")
    ghi_annual_mean: float
    source: str
    note: str


class Suitability(BaseModel):
    location: LatLng
    aoi: AoiRef
    run_id: str
    method_version: str
    score: int | None = Field(None, ge=0, le=100, description="null when the point is excluded")
    grade: Grade | None = Field(None, description="good >= 70, fair 50-69, poor < 50 (provisional)")
    components: Components
    exclusions: list[Exclusion]
    landcover: Landcover
    confidence: Confidence
    irradiance: Irradiance | None = Field(None, description="Climatology; not part of the score")
    evidence_url: str
    attribution: list[str]


# ---------- /v1/suitability/area ----------
class Geometry(BaseModel):
    """GeoJSON Polygon or MultiPolygon, WGS84, positions are [lng, lat]."""

    type: Literal["Polygon", "MultiPolygon"]
    coordinates: list[Any] = Field(min_length=1)


class AreaRequest(BaseModel):
    geometry: Geometry

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [100.600, 14.275],
                                [100.601, 14.275],
                                [100.601, 14.276],
                                [100.600, 14.276],
                                [100.600, 14.275],
                            ]
                        ],
                    }
                }
            ]
        }
    )


class AreaComponents(BaseModel):
    flood_freq: float | None
    elevation_m: float | None
    p_flood: float | None


class AreaSuitability(BaseModel):
    aoi: AoiRef
    run_id: str
    method_version: str
    area_m2: int
    pixels: int
    pixel_m: float
    score_mean: float | None
    score_p10: float | None = Field(description="10th percentile: the worse end of the parcel")
    share_poor: float | None = Field(description="Share of non-excluded pixels with score < 50")
    share_excluded: float
    components: AreaComponents
    flags: list[Literal["smaller_than_pixel"]]
    evidence_url: str
    attribution: list[str]


# ---------- /v1/evidence ----------
class EvidenceMethod(BaseModel):
    version: str
    water_rule: str = Field(examples=["VH_dB < -18"])
    wet_months: list[int]
    pixel_m: float
    scene_set_hash: str
    code_sha: str
    scene_source: str


class Pixel(BaseModel):
    row: int
    col: int


class EvidencePoint(LatLng):
    pixel: Pixel


class EvidenceSummary(BaseModel):
    scenes_total: int
    scenes_wet: int
    wet_scenes_with_water: int
    wet_scenes_valid: int


class Scene(BaseModel):
    scene_id: str = Field(examples=["s1rtc-desc164-2025-11-23"])
    acquired_at: str
    platform: str
    orbit: str
    season: Literal["wet", "dry"]
    vv_db: float | None
    vh_db: float | None
    is_water: bool = Field(description="Result of the AOI's water rule; the same value used in the score")
    chip_url: str
    stac_item_id: str | None = Field(None, description="Always null for now; use source_url")
    source_url: str


class LayerRef(BaseModel):
    kind: Literal["elev", "water_freq_wet", "landcover", "score"]
    value: float | None
    source: str | None = None
    chip_url: str


class OpticalRef(BaseModel):
    acquired_at: str
    source: str
    cloud_pct_aoi: float
    nearest_sar_days: int
    mndwi: float | None
    optical_water: bool | None = Field(description="mndwi > 0; null when cloud covers the pixel")
    chip_url: str


class Evidence(BaseModel):
    run_id: str
    method: EvidenceMethod
    point: EvidencePoint
    summary: EvidenceSummary
    scenes: list[Scene]
    layers: list[LayerRef]
    optical_reference: list[OpticalRef]
    attribution: list[str]
