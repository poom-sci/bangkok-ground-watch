import { useEffect, useRef, useState } from 'react';
import type { Lookup } from './data';

export interface LookupSample { recurrence: number | null; s1: number; classId: number }

/** Loads the lookup PNG once into an offscreen canvas and reads single cells (same-origin, unscaled, no smoothing). */
export function useLookupSampler(lookup: Lookup | null) {
  const ctx = useRef<CanvasRenderingContext2D | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!lookup) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (!live) return;
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d', { willReadFrequently: true });
        if (!g) return;
        g.imageSmoothingEnabled = false;
        g.drawImage(img, 0, 0);
        ctx.current = g;
        setReady(true);
      } catch { /* canvas unavailable */ }
    };
    img.onerror = () => { ctx.current = null; };
    img.src = lookup.url;
    return () => { live = false; };
  }, [lookup]);

  const sample = (lat: number, lng: number): LookupSample | null => {
    const g = ctx.current;
    if (!g || !lookup) return null;
    const u = lng - lookup.lon0, v = lat - lookup.lat0;
    const col = Math.floor(lookup.col[0] + lookup.col[1] * u + lookup.col[2] * v);
    const row = Math.floor(lookup.row[0] + lookup.row[1] * u + lookup.row[2] * v);
    if (col < 0 || row < 0 || col >= lookup.w || row >= lookup.h) return null;
    try {
      const d = g.getImageData(col, row, 1, 1).data;
      return { recurrence: d[0] === 255 ? null : Math.min(100, (d[0] / 250) * 100), s1: Math.min(100, (d[1] / 250) * 100), classId: d[2] };
    } catch { return null; }
  };
  return { sample, ready };
}
