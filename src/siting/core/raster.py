"""Rasterise GeoJSON polygons onto an AOI grid."""

from __future__ import annotations

import numpy as np

from .grid import Grid


def _rings(geometry: dict):
    t = geometry.get("type")
    if t == "Polygon":
        return [geometry["coordinates"]]
    if t == "MultiPolygon":
        return list(geometry["coordinates"])
    raise ValueError(f"unsupported geometry type: {t}")


def polygon_mask(grid: Grid, geometry: dict) -> np.ndarray:
    """Boolean (H,W) mask of pixels whose centre lies inside the polygon (even-odd rule, holes respected)."""
    mask = np.zeros((grid.height, grid.width), bool)
    for poly in _rings(geometry):
        pts = [[(c, r) for r, c in (grid.lonlat_to_rc_float(lon, lat) for lon, lat in ring)] for ring in poly]
        xs = [p[0] for ring in pts for p in ring]
        ys = [p[1] for ring in pts for p in ring]
        c0, c1 = max(int(np.floor(min(xs) - 1)), 0), min(int(np.ceil(max(xs) + 1)), grid.width)
        r0, r1 = max(int(np.floor(min(ys) - 1)), 0), min(int(np.ceil(max(ys) + 1)), grid.height)
        if c0 >= c1 or r0 >= r1:
            continue
        # pixel centres sit at (col + 0.5, row + 0.5) in fractional coordinates
        cx, cy = np.meshgrid(np.arange(c0, c1) + 0.5, np.arange(r0, r1) + 0.5)
        inside = np.zeros(cx.shape, bool)
        for ring in pts:
            for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1], strict=False):
                if y1 == y2:
                    continue
                cross = ((y1 > cy) != (y2 > cy)) & (cx < (x2 - x1) * (cy - y1) / (y2 - y1) + x1)
                inside ^= cross
        mask[r0:r1, c0:c1] ^= inside
    return mask


def polygon_centroid(geometry: dict):
    ring = _rings(geometry)[0][0]
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def polygon_area_m2(grid: Grid, geometry: dict) -> float:
    """Planar area in the grid CRS (metres)."""
    tf = grid._fwd()
    total = 0.0
    for poly in _rings(geometry):
        for k, ring in enumerate(poly):
            xy = [tf.transform(lon, lat) for lon, lat in ring]
            a = 0.5 * abs(
                sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(xy, xy[1:] + xy[:1], strict=False))
            )
            total += a if k == 0 else -a
    return total
