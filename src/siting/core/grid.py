"""North-up raster grid with an affine transform, plus lon/lat <-> row/col."""
from __future__ import annotations

from dataclasses import dataclass

from pyproj import Transformer


@dataclass(frozen=True)
class Grid:
    # rasterio-style affine: x = a*col + b*row + c ; y = d*col + e*row + f
    a: float
    b: float
    c: float
    d: float
    e: float
    f: float
    crs: str
    height: int
    width: int

    def __post_init__(self):
        if self.b != 0 or self.d != 0:
            raise ValueError("only north-up grids are supported")

    @classmethod
    def from_affine(cls, affine6, crs: str, height: int, width: int) -> "Grid":
        a, b, c, d, e, f = (float(v) for v in affine6)
        return cls(a, b, c, d, e, f, str(crs), int(height), int(width))

    def to_dict(self) -> dict:
        return {"affine": [self.a, self.b, self.c, self.d, self.e, self.f],
                "crs": self.crs, "height": self.height, "width": self.width}

    @classmethod
    def from_dict(cls, d: dict) -> "Grid":
        return cls.from_affine(d["affine"], d["crs"], d["height"], d["width"])

    @property
    def pixel_m(self) -> float:
        return abs(self.a)

    def _fwd(self) -> Transformer:
        return Transformer.from_crs("EPSG:4326", self.crs, always_xy=True)

    def _inv(self) -> Transformer:
        return Transformer.from_crs(self.crs, "EPSG:4326", always_xy=True)

    def lonlat_to_rc(self, lon: float, lat: float):
        """Return (row, col) as ints, or None when the point is outside the grid."""
        x, y = self._fwd().transform(lon, lat)
        col = (x - self.c) / self.a
        row = (y - self.f) / self.e
        if not (0 <= row < self.height and 0 <= col < self.width):
            return None
        return int(row), int(col)

    def lonlat_to_rc_float(self, lon: float, lat: float):
        """Fractional (row, col) without bounds checking."""
        x, y = self._fwd().transform(lon, lat)
        return (y - self.f) / self.e, (x - self.c) / self.a

    def rc_to_lonlat(self, row: float, col: float):
        x = self.c + self.a * (col + 0.5)
        y = self.f + self.e * (row + 0.5)
        lon, lat = self._inv().transform(x, y)
        return lon, lat

    def bbox_lonlat(self):
        lons, lats = [], []
        for r, c in ((0, 0), (0, self.width), (self.height, 0), (self.height, self.width)):
            x = self.c + self.a * c
            y = self.f + self.e * r
            lon, lat = self._inv().transform(x, y)
            lons.append(lon)
            lats.append(lat)
        return [min(lons), min(lats), max(lons), max(lats)]
