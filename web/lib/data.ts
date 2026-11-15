import { useEffect, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import type { Lang } from './i18n';

export type LayerType = 'gunw' | 'water';
export type LonLat = [number, number];

export interface Layer {
  id: string;
  type: LayerType;
  date: string;
  secDate: string | null;
  track: string;
  url: string;
  bounds: [LonLat, LonLat, LonLat, LonLat];
  thresholdDb: number | null;
}

export interface LosEntry { date: string; track: string; mean: number | null; p10: number | null; p90: number | null; coherent: number | null }
export interface WaterEntry { date: string; track: string; pct: number | null }

export interface District {
  dcode: string;
  nameTh: string;
  nameEn: string;
  areaKm2: number | null;
  pop: number | null;
  buildings: number | null;
  index: number | null;
  popDensity: number | null;
  bldDensity: number | null;
  waterMaxPct: number | null;
  los: LosEntry[];
  losSum: Record<string, number | null>;
  water: WaterEntry[];
}

export interface Dataset {
  failed: boolean;
  gunwSpan: { from: string; to: string } | null;
  waterSpan: { from: string; to: string } | null;
  rangeMm: number | null;
  layers: Layer[];
  districts: District[];
  geo: FeatureCollection | null;
  isNisar: boolean | null;
}

export type LoadState = { status: 'loading' } | { status: 'ready'; data: Dataset };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

interface Fetched { json: unknown; failed: boolean }

async function getJson(path: string): Promise<Fetched> {
  try {
    const r = await fetch(path, { cache: 'no-cache' });
    if (r.status === 404) return { json: null, failed: false };
    return r.ok ? { json: await r.json(), failed: false } : { json: null, failed: true };
  } catch {
    return { json: null, failed: true };
  }
}

export const codeOf = (props: unknown): string => String(isObj(props) ? props.dcode ?? '' : '');

function parseBounds(v: unknown): Layer['bounds'] | null {
  const pts = arr(v);
  if (pts.length !== 4) return null;
  const out: LonLat[] = [];
  for (const p of pts) {
    const lon = finite(arr(p)[0]);
    const lat = finite(arr(p)[1]);
    if (lon == null || lat == null) return null;
    out.push([lon, lat]);
  }
  return out as Layer['bounds'];
}

function parseLayers(m: unknown): { layers: Layer[]; rangeMm: number | null; source: unknown } {
  if (!isObj(m)) return { layers: [], rangeMm: null, source: null };
  const generated = str(m.generated);
  const v = generated ? `?v=${encodeURIComponent(generated)}` : '';
  const layers: Layer[] = [];
  arr(m.layers).forEach((raw, i) => {
    if (!isObj(raw)) return;
    const type = str(raw.type)?.toLowerCase();
    const image = str(raw.image);
    const date = str(raw.date);
    const bounds = parseBounds(raw.bounds);
    if ((type !== 'gunw' && type !== 'water') || !image || !date || !bounds) return;
    layers.push({
      id: `L${i}`, type, date, secDate: str(raw.sec_date), track: str(raw.track) ?? '?', bounds,
      url: /^https?:/.test(image) ? image : `/data/${image}${v}`,
      thresholdDb: finite(raw.threshold_db),
    });
  });
  return { layers, rangeMm: finite(m.display_range_mm), source: m };
}

function parseDistricts(j: unknown, geo: FeatureCollection): District[] {
  const stats = new Map<string, Record<string, unknown>>();
  if (isObj(j)) arr(j.districts).forEach((r) => { if (isObj(r) && str(r.dcode)) stats.set(String(r.dcode), r); });
  const districts = geo.features.map((f): District => {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const code = codeOf(p) || String(f.id ?? '');
    const s = stats.get(code) ?? {};
    const areaKm2 = finite(p.area_km2);
    const pop = finite(p.pop);
    const losSum: Record<string, number | null> = {};
    if (isObj(s.los_sum_mm)) for (const [k, v] of Object.entries(s.los_sum_mm)) losSum[k] = finite(v);
    return {
      dcode: code,
      nameTh: str(p.name_th) ?? code,
      nameEn: str(p.name_en) ?? code,
      areaKm2, pop,
      buildings: finite(s.buildings),
      index: finite(s.index),
      popDensity: finite(s.pop_density) ?? (pop != null && areaKm2 ? Math.round(pop / areaKm2) : null),
      bldDensity: finite(s.bld_density),
      waterMaxPct: finite(s.water_max_pct),
      los: arr(s.los).flatMap((x) => isObj(x) && str(x.date) ? [{
        date: String(x.date), track: str(x.track) ?? '?', mean: finite(x.mean_mm), p10: finite(x.p10_mm), p90: finite(x.p90_mm), coherent: finite(x.coherent_pct),
      }] : []),
      losSum,
      water: arr(s.water).flatMap((x) => isObj(x) && str(x.date) ? [{ date: String(x.date), track: str(x.track) ?? '?', pct: finite(x.pct) }] : []),
    };
  });
  return districts;
}

export async function loadDataset(): Promise<Dataset> {
  const [mf, df, gf] = await Promise.all([getJson('/data/manifest.json'), getJson('/data/districts.json'), getJson('/data/bkk_districts.geojson')]);
  const { layers, rangeMm, source } = parseLayers(mf.json);
  const geo = isObj(gf.json) && Array.isArray(gf.json.features) ? (gf.json as unknown as FeatureCollection) : null;
  const districts = geo ? parseDistricts(df.json, geo) : [];
  const bothFiles = isObj(source) && isObj(df.json);
  const isNisar = bothFiles ? isObj(df.json) && df.json.source === 'nisar' && df.json.demo !== true && !(isObj(source) && source.demo === true) : null;
  const gunw = layers.filter((l) => l.type === 'gunw');
  const gStarts = gunw.map((l) => l.date).sort();
  const gEnds = gunw.map((l) => l.secDate ?? l.date).sort();
  const gunwSpan = gunw.length ? { from: gStarts[0], to: gEnds[gEnds.length - 1] } : null;
  const wDates = layers.filter((l) => l.type === 'water').map((l) => l.date).sort();
  const waterSpan = wDates.length ? { from: wDates[0], to: wDates[wDates.length - 1] } : null;
  return { failed: mf.failed, gunwSpan, waterSpan, rangeMm, layers, districts, geo, isNisar };
}

export function useDataset(): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    loadDataset().then((data) => { if (live) setState({ status: 'ready', data }); });
    return () => { live = false; };
  }, []);
  return state;
}

export const sortedUnique = (xs: string[]): string[] => [...new Set(xs)].sort();

export function parseTrack(track: string): { dir: 'A' | 'D'; n: number } | null {
  const m = /^([AD])0*(\d+)$/.exec(track);
  return m ? { dir: m[1] as 'A' | 'D', n: Number(m[2]) } : null;
}

export function fmtNum(v: number | null | undefined, digits = 1): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  const r = Number(v.toFixed(digits));
  return (r === 0 ? 0 : r).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtDate(iso: string, lang: Lang, withYear = true): string | null {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (lang === 'th') {
    return new Intl.DateTimeFormat('th-TH-u-ca-buddhist-nu-latn', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' as const } : {}), timeZone: 'UTC' }).format(d);
  }
  const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(d);
  return `${d.getUTCDate()} ${month}${withYear ? ` ${d.getUTCFullYear()}` : ''}`;
}

/** "21 Jun to 3 Jul 2026" when an end date exists, otherwise the single date. */
export function fmtRange(start: string, end: string | null, lang: Lang, to: string): string | null {
  if (!end) return fmtDate(start, lang);
  if (start.slice(0, 7) === end.slice(0, 7)) {
    const day = Number(start.slice(8, 10));
    const tail = fmtDate(end, lang);
    return Number.isFinite(day) && tail ? `${day} ${to} ${tail}` : null;
  }
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const a = fmtDate(start, lang, !sameYear);
  const b = fmtDate(end, lang);
  return a && b ? `${a} ${to} ${b}` : null;
}

/** "Jun to Nov 2026" from two ISO dates (month names only, year once when shared). */
export function fmtMonthRange(from: string, to: string, lang: Lang, word: string): string | null {
  const a = new Date(`${from}T00:00:00Z`), b = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const loc = lang === 'th' ? 'th-TH-u-ca-buddhist-nu-latn' : 'en-US';
  const month = (d: Date) => new Intl.DateTimeFormat(loc, { month: 'short', timeZone: 'UTC' }).format(d);
  const year = (d: Date) => new Intl.DateTimeFormat(loc, { year: 'numeric', timeZone: 'UTC' }).format(d);
  return a.getUTCFullYear() === b.getUTCFullYear() ? `${month(a)} ${word} ${month(b)} ${year(b)}` : `${month(a)} ${year(a)} ${word} ${month(b)} ${year(b)}`;
}

type Ring = number[][];
const ringArea = (r: Ring) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
const inRing = (r: Ring, x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
  }
  return inside;
};

export function featureCentre(geo: FeatureCollection | null, code: string): { lat: number; lng: number } | null {
  const f = geo?.features.find((x) => codeOf(x.properties) === code);
  if (!f) return null;
  const g = f.geometry;
  const polys: Ring[][] = g.type === 'Polygon' ? [g.coordinates as Ring[]] : g.type === 'MultiPolygon' ? (g.coordinates as Ring[][]) : [];
  if (!polys.length) return null;
  const ring = polys.map((p) => p[0]).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
  if (!ring || ring.length < 4) return null;
  const A = ringArea(ring);
  let cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const k = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    cx += (ring[i][0] + ring[i + 1][0]) * k; cy += (ring[i][1] + ring[i + 1][1]) * k;
  }
  if (A === 0) return null;
  cx /= 6 * A; cy /= 6 * A;
  if (inRing(ring, cx, cy)) return { lat: cy, lng: cx };
  const xs: number[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    if (y1 > cy !== y2 > cy) xs.push(x1 + ((cy - y1) / (y2 - y1)) * (x2 - x1));
  }
  xs.sort((a, b) => a - b);
  let best: [number, number] | null = null;
  for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  return best ? { lat: cy, lng: (best[0] + best[1]) / 2 } : { lat: ring[0][1], lng: ring[0][0] };
}

export function fmtYear(y: number, lang: Lang): string {
  return String(lang === 'th' ? y + 543 : y);
}
