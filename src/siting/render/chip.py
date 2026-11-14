"""PNG chips: a window of a raster around a point, with a fixed colour stretch."""
from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageDraw

# (value, rgb) stops; linear interpolation
RAMPS = {
    "sar": ([-20, -15, -10, -5, 0], [(0, 0, 0), (40, 40, 60), (130, 130, 130), (210, 210, 210), (255, 255, 255)]),
    "sar_vh": ([-30, -25, -18, -12, -5], [(0, 0, 0), (40, 40, 60), (130, 130, 130), (210, 210, 210), (255, 255, 255)]),
    "water_freq_wet": ([0, 0.3, 0.6, 1.0], [(247, 251, 255), (158, 202, 225), (49, 130, 189), (8, 48, 107)]),
    "elev": ([1, 3, 5, 8], [(0, 104, 55), (166, 217, 106), (253, 224, 139), (140, 90, 60)]),
    "score": ([0, 50, 70, 100], [(215, 48, 39), (254, 224, 139), (166, 217, 106), (26, 152, 80)]),
}
WORLDCOVER = {10: (0, 100, 0), 20: (255, 187, 34), 30: (255, 255, 76), 40: (240, 150, 255),
              50: (250, 0, 0), 60: (180, 180, 180), 70: (240, 240, 240), 80: (0, 100, 200),
              90: (0, 150, 160), 95: (0, 207, 117), 100: (250, 230, 160)}
NODATA = (200, 200, 200)
LAYER_KIND = {"elev": "elev", "water_freq_wet": "water_freq_wet", "score": "score"}


def _ramp(a: np.ndarray, kind: str) -> np.ndarray:
    xs, cols = RAMPS[kind]
    cols = np.array(cols, dtype="float32")
    out = np.empty(a.shape + (3,), dtype="uint8")
    for ch in range(3):
        out[..., ch] = np.interp(np.nan_to_num(a, nan=xs[0]), xs, cols[:, ch]).astype("uint8")
    out[~np.isfinite(a)] = NODATA
    return out


def colorize(a: np.ndarray, kind: str) -> np.ndarray:
    if kind == "rgb":
        return a.copy()
    if kind == "landcover":
        out = np.zeros(a.shape + (3,), dtype="uint8")
        out[:] = NODATA
        for code, rgb in WORLDCOVER.items():
            out[a == code] = rgb
        return out
    return _ramp(a.astype("float32"), kind)


def render(a: np.ndarray, kind: str, row: int, col: int, half_px: int, out_px: int = 512,
           water_mask: np.ndarray | None = None) -> bytes:
    """Window of 2*half_px+1 pixels around (row, col), upscaled with nearest neighbour."""
    H, W = a.shape[:2]
    r0, r1 = max(row - half_px, 0), min(row + half_px + 1, H)
    c0, c1 = max(col - half_px, 0), min(col + half_px + 1, W)
    rgb = colorize(a[r0:r1, c0:c1], kind)
    if water_mask is not None:
        m = water_mask[r0:r1, c0:c1]
        rgb[m] = (0.5 * rgb[m] + 0.5 * np.array([0, 120, 255])).astype("uint8")
    h, w = rgb.shape[:2]
    scale = max(out_px // max(h, w), 1)
    img = Image.fromarray(rgb).resize((w * scale, h * scale), Image.NEAREST)
    d = ImageDraw.Draw(img)
    cx, cy = (col - c0 + 0.5) * scale, (row - r0 + 0.5) * scale
    arm = 8
    for color, wd in (((255, 255, 255), 4), ((255, 0, 0), 2)):
        d.line([(cx - arm, cy), (cx + arm, cy)], fill=color, width=wd)
        d.line([(cx, cy - arm), (cx, cy + arm)], fill=color, width=wd)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()
