import { useEffect, useState } from 'react';
import type { Layer } from './data';

export interface Patch { url: string; coords: [[number, number], [number, number], [number, number], [number, number]]; cell: [number, number][] }

const RADIUS_CELLS = 10;
const WINDOW = RADIUS_CELLS * 2 + 3;
const SCALE = 8;
const images = new Map<string, Promise<HTMLImageElement | null>>();

function load(url: string) {
  let p = images.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement | null>((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = url; });
    images.set(url, p);
  }
  return p;
}

/** Maps lng/lat to image pixel coordinates (0..w, 0..h) using the layer's TL, TR, BR, BL corners as an affine grid. */
function frame(b: Layer['bounds'], w: number, h: number) {
  const [tl, tr, , bl] = b;
  const ax = tr[0] - tl[0], ay = tr[1] - tl[1], bx = bl[0] - tl[0], by = bl[1] - tl[1];
  const det = ax * by - ay * bx;
  const toPx = (lng: number, lat: number): [number, number] => {
    const dx = lng - tl[0], dy = lat - tl[1];
    return [((dx * by - dy * bx) / det) * w, ((ax * dy - ay * dx) / det) * h];
  };
  const toLngLat = (x: number, y: number): [number, number] => [tl[0] + (x / w) * ax + (y / h) * bx, tl[1] + (x / w) * ay + (y / h) * by];
  return { toPx, toLngLat };
}

/** Score or confidence cells within about 800 m of the pin, clipped to a circle, plus the outline of the 80 m cell under it. */
export function usePatch(layer: Layer | null, pin: { lat: number; lng: number } | null): Patch | null {
  const [patch, setPatch] = useState<Patch | null>(null);
  const url = layer?.url ?? null;
  const lat = pin?.lat, lng = pin?.lng;
  useEffect(() => {
    if (!layer || !url || lat == null || lng == null) { setPatch(null); return; }
    let live = true;
    load(url).then((img) => {
      if (!live || !img) { if (live) setPatch(null); return; }
      const w = img.naturalWidth, h = img.naturalHeight;
      const f = frame(layer.bounds, w, h);
      const [px, py] = f.toPx(lng, lat);
      if (px < 0 || py < 0 || px >= w || py >= h) { setPatch(null); return; }
      const c0 = Math.floor(px) - RADIUS_CELLS - 1, r0 = Math.floor(py) - RADIUS_CELLS - 1;
      const cv = document.createElement('canvas');
      cv.width = cv.height = WINDOW * SCALE;
      const g = cv.getContext('2d');
      if (!g) { setPatch(null); return; }
      g.imageSmoothingEnabled = false;
      g.beginPath(); g.arc((px - c0) * SCALE, (py - r0) * SCALE, RADIUS_CELLS * SCALE, 0, Math.PI * 2); g.clip();
      g.drawImage(img, -c0 * SCALE, -r0 * SCALE, w * SCALE, h * SCALE);
      const cx = Math.floor(px), cy = Math.floor(py);
      let dataUrl = '';
      try { dataUrl = cv.toDataURL('image/png'); } catch { setPatch(null); return; }
      setPatch({
        url: dataUrl,
        coords: [f.toLngLat(c0, r0), f.toLngLat(c0 + WINDOW, r0), f.toLngLat(c0 + WINDOW, r0 + WINDOW), f.toLngLat(c0, r0 + WINDOW)],
        cell: [f.toLngLat(cx, cy), f.toLngLat(cx + 1, cy), f.toLngLat(cx + 1, cy + 1), f.toLngLat(cx, cy + 1), f.toLngLat(cx, cy)],
      });
    });
    return () => { live = false; };
  }, [layer, url, lat, lng]);
  return patch;
}
