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
  z?: number;
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

export interface FusionClass { cls: string; colour: string | null; alpha: number | null; definition: string }
export interface Fusion {
  layer: Layer;
  legend: FusionClass[];
  pixels: number | null; spearman: number | null; spearmanDistricts: number | null;
  nisarEverHigh: number | null; nisarEverZero: number | null;
  caveats: string[];
  noise: { disagree: number; both: number } | null;
  lcWater: { date: string; track: string; cls: number; label: string; pct: number }[];
  cropland: Record<string, { first: string; min: string; last: string; pct: Record<string, number> }>;
  perDistrict: Record<string, { recurrence: number | null; s1: number | null }>;
  s1Threshold: number | null;
  nisarThreshold: number | null;
}

export interface ScoreMaps {
  ramp: { range: string; colour: string }[];
  excluded: { cls: string; colour: string; label: string; reason: string }[];
  areas: Record<string, { layer: Layer; scoredPct: number | null; excl: Record<string, number> }>;
  veil: Record<string, { layer: Layer; pct: number | null }>;
  veilColour: string | null;
}

export interface ConfClass { id: number; cls: string; colour: string | null; alpha: number | null; conf: string | null }
export interface ElevBin { from: number | null; to: number | null; cells: number; recurrence: number | null; everWet: number | null }
export interface Lookup {
  url: string; w: number; h: number; lon0: number; lat0: number; col: number[]; row: number[]; classes: Record<number, string>;
}
export interface Confidence {
  layer: Layer; legend: ConfClass[]; classPct: Record<string, number>; sanity: Record<string, number>;
}

export interface Dataset {
  failed: boolean;
  confidence: Confidence | null;
  lookup: Lookup | null;
  elev: { all: ElevBin[]; visible: ElevBin[]; caveat: string | null } | null;
  scoreMaps: ScoreMaps | null;
  fusion: Fusion | null;
  districtsOk: boolean;
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

function parseFusion(j: unknown, generated: string | null): Fusion | null {
  if (!isObj(j) || !isObj(j.overlay) || !isObj(j.agreement)) return null;
  const bounds = parseBounds(j.overlay.bounds);
  const img = str(j.overlay.image);
  if (!bounds || !img) return null;
  const v = generated ? `?v=${encodeURIComponent(generated)}` : '';
  const a = j.agreement;
  const method = isObj(j.method) ? j.method : {};
  const th = isObj(method.thresholds) ? method.thresholds : {};
  const noise = isObj(j.los_noise) ? j.los_noise : {};
  const dis = finite(noise.sign_disagree_districts), both = finite(noise.districts_with_both_tracks);
  const cyc = isObj(j.cropland_cycle) ? j.cropland_cycle : {};
  const cropland: Fusion['cropland'] = {};
  Object.entries(cyc).forEach(([k, raw]) => {
    if (!isObj(raw) || !isObj(raw.water_pct)) return;
    const pct: Record<string, number> = {};
    Object.entries(raw.water_pct).forEach(([d, x]) => { const n = finite(x); if (n != null) pct[d] = n; });
    const first = str(raw.first_date), min = str(raw.min_date), last = str(raw.last_date);
    if (first && min && last) cropland[k] = { first, min, last, pct };
  });
  const perDistrict: Fusion['perDistrict'] = {};
  arr(j.districts).forEach((d) => { if (isObj(d) && str(d.dcode)) perDistrict[String(d.dcode)] = { recurrence: finite(d.nisar_recurrence_mean), s1: finite(d.s1_frequency_mean) }; });
  return {
    layer: { id: 'L9999', type: 'water', date: '', secDate: null, track: '', url: `/data/${img}${v}`, bounds, thresholdDb: null },
    legend: arr(j.overlay.legend).flatMap((x) => (isObj(x) && str(x.class) && str(x.definition) ? [{ cls: String(x.class), colour: str(x.colour), alpha: finite(x.alpha), definition: String(x.definition) }] : [])),
    pixels: finite(a.pixels), spearman: finite(a.spearman), spearmanDistricts: finite(a.spearman_districts),
    nisarEverHigh: finite(a.nisar_ever_water_pct_where_s1_high), nisarEverZero: finite(a.nisar_ever_water_pct_where_s1_zero),
    caveats: arr(method.caveats).flatMap((x) => str(x) ?? []),
    noise: dis != null && both != null ? { disagree: dis, both } : null,
    lcWater: arr(j.landcover_water).flatMap((x) => {
      if (!isObj(x)) return [];
      const date = str(x.date), track = str(x.track), label = str(x.label), cls = finite(x.class), pct = finite(x.water_pct);
      return date && track && label && cls != null && pct != null ? [{ date, track, label, cls, pct }] : [];
    }),
    cropland, perDistrict, s1Threshold: finite(th.s1_frequency), nisarThreshold: finite(th.nisar_recurrence),
  };
}

function parseScoreMaps(j: unknown): ScoreMaps | null {
  if (!isObj(j) || !isObj(j.areas) || !isObj(j.legend)) return null;
  const v = isObj(j) && str(j.generated) ? `?v=${encodeURIComponent(String(j.generated))}` : '';
  let n = 9100;
  const areas: ScoreMaps['areas'] = {};
  Object.entries(j.areas).forEach(([id, raw]) => {
    if (!isObj(raw)) return;
    const img = str(raw.image), b = parseBounds(raw.bounds);
    if (!img || !b) return;
    const sh = isObj(raw.shares) ? raw.shares : {};
    const excl: Record<string, number> = {};
    if (isObj(sh.excluded_pct)) Object.entries(sh.excluded_pct).forEach(([k, x]) => { const f = finite(x); if (f != null) excl[k] = f; });
    areas[id] = { layer: { id: `L${n++}`, type: 'water', date: '', secDate: null, track: '', url: `/data/${img}${v}`, bounds: b, thresholdDb: null, z: 0 }, scoredPct: finite(sh.scored_pct), excl };
  });
  const veil: ScoreMaps['veil'] = {};
  const ns = isObj(j.los_nosignal) ? j.los_nosignal : null;
  if (ns && isObj(ns.tracks)) Object.entries(ns.tracks).forEach(([k, raw]) => {
    if (!isObj(raw)) return;
    const img = str(raw.image), b = parseBounds(raw.bounds);
    if (img && b) veil[k] = { layer: { id: `L${n++}`, type: 'water', date: '', secDate: null, track: k, url: `/data/${img}${v}`, bounds: b, thresholdDb: null, z: 0 }, pct: finite(raw.nosignal_pct_bangkok_districts) };
  });
  const ramp = arr(j.legend.ramp).flatMap((x) => (isObj(x) && str(x.range) && str(x.colour) ? [{ range: String(x.range), colour: String(x.colour) }] : []));
  const excluded = arr(j.legend.excluded).flatMap((x) => (isObj(x) && str(x.class) && str(x.colour) && str(x.label) ? [{ cls: String(x.class), colour: String(x.colour), label: String(x.label), reason: str(x.reason) ?? '' }] : []));
  if (!Object.keys(areas).length || !ramp.length) return null;
  return { ramp, excluded, areas, veil, veilColour: ns ? str(ns.colour) : null };
}

function parseConfidence(j: unknown, generated: string | null): { confidence: Confidence | null; lookup: Lookup | null; elev: Dataset['elev'] } {
  if (!isObj(j)) return { confidence: null, lookup: null, elev: null };
  const v = generated ? `?v=${encodeURIComponent(generated)}` : '';
  let confidence: Confidence | null = null;
  const c = j.confidence;
  if (isObj(c)) {
    const img = str(c.image), b = parseBounds(c.bounds);
    const legend = arr(c.legend).flatMap((x) => (isObj(x) && finite(x.id) != null && str(x.class) ? [{ id: finite(x.id) as number, cls: String(x.class), colour: str(x.colour), alpha: finite(x.alpha), conf: str(x.confidence) }] : []));
    const classPct: Record<string, number> = {};
    if (isObj(c.class_pct)) Object.entries(c.class_pct).forEach(([k, x]) => { const n = finite(x); if (n != null) classPct[k] = n; });
    const sanity: Record<string, number> = {};
    if (isObj(c.sanity)) Object.entries(c.sanity).forEach(([k, x]) => { const n = finite(x); if (n != null) sanity[k] = n; });
    if (img && b && legend.length) confidence = { layer: { id: 'L9300', type: 'water', date: '', secDate: null, track: '', url: `/data/${img}${v}`, bounds: b, thresholdDb: null, z: 0 }, legend, classPct, sanity };
  }
  let lookup: Lookup | null = null;
  const l = j.lookup;
  if (isObj(l) && isObj(l.lonlat_to_cell) && isObj(l.lonlat_to_cell.linear) && Array.isArray(l.shape) && isObj(l.class_ids)) {
    const lin = l.lonlat_to_cell.linear;
    const col = arr(lin.col).map(finite), row = arr(lin.row).map(finite);
    const lon0 = finite(l.lonlat_to_cell.lon0), lat0 = finite(l.lonlat_to_cell.lat0), img = str(l.image);
    const h = finite(l.shape[0]), w = finite(l.shape[1]);
    const classes: Record<number, string> = {};
    Object.entries(l.class_ids).forEach(([k, x]) => { if (str(x)) classes[Number(k)] = String(x); });
    if (img && col.length === 3 && row.length === 3 && !col.includes(null) && !row.includes(null) && lon0 != null && lat0 != null && w && h) {
      lookup = { url: `/data/${img}${v}`, w, h, lon0, lat0, col: col as number[], row: row as number[], classes };
    }
  }
  let elev: Dataset['elev'] = null;
  const e = j.elevation_curve;
  if (isObj(e)) {
    const bins = (x: unknown): ElevBin[] => arr(x).flatMap((r) => (isObj(r) ? [{ from: finite(r.from_m), to: finite(r.to_m), cells: finite(r.cells) ?? 0, recurrence: finite(r.nisar_recurrence_mean_pct), everWet: finite(r.nisar_ever_wet_pct) }] : []));
    const all = bins(e.all_land), visible = bins(e.radar_visible_land);
    if (visible.length > 1) elev = { all, visible, caveat: str(arr(e.caveats)[0]) };
  }
  return { confidence, lookup, elev };
}

export async function loadDataset(): Promise<Dataset> {
  const [mf, df, gf, ff, sf] = await Promise.all([getJson('/data/manifest.json'), getJson('/data/districts.json'), getJson('/data/bkk_districts.geojson'), getJson('/data/fusion.json'), getJson('/data/score_maps.json')]);
  const fusion = parseFusion(ff.json, isObj(ff.json) ? str(ff.json.generated) : null);
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
  const districtsOk = isObj(df.json) && arr(df.json.districts).length > 0;
  return { failed: mf.failed, ...parseConfidence(ff.json, isObj(ff.json) ? str(ff.json.generated) : null), fusion, scoreMaps: parseScoreMaps(sf.json), districtsOk, gunwSpan, waterSpan, rangeMm, layers, districts, geo, isNisar };
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

export function districtAtPoint(geo: FeatureCollection | null, lat: number, lng: number): string | null {
  for (const f of geo?.features ?? []) {
    const g = f.geometry;
    const polys: Ring[][] = g.type === 'Polygon' ? [g.coordinates as Ring[]] : g.type === 'MultiPolygon' ? (g.coordinates as Ring[][]) : [];
    for (const p of polys) {
      if (p[0] && inRing(p[0], lng, lat) && !p.slice(1).some((h) => inRing(h, lng, lat))) return codeOf(f.properties);
    }
  }
  return null;
}

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

export interface CityOutline { lines: number[][][]; rings: number[][][]; closed: boolean; bbox: [number, number, number, number] }
const memo = new WeakMap<object, CityOutline | null>();

/** Outer boundary of the union of all district polygons: edges that occur once (shared borders occur twice). */
export function cityOutline(geo: FeatureCollection | null): CityOutline | null {
  if (!geo) return null;
  const hit = memo.get(geo);
  if (hit !== undefined) return hit;
  const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
  const edges = new Map<string, { a: number[]; b: number[]; n: number }>();
  const addRing = (ring: number[][]) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = [r6(ring[i][0]), r6(ring[i][1])], b = [r6(ring[i + 1][0]), r6(ring[i + 1][1])];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const ka = `${a[0]},${a[1]}`, kb = `${b[0]},${b[1]}`;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = edges.get(key);
      if (e) e.n++; else edges.set(key, { a, b, n: 1 });
    }
  };
  geo.features.forEach((f) => {
    const g = f.geometry;
    const polys: number[][][][] = g.type === 'Polygon' ? [g.coordinates as number[][][]] : g.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : [];
    polys.forEach((p) => p.forEach(addRing));
  });
  const single = [...edges.values()].filter((e) => e.n === 1);
  if (!single.length) { memo.set(geo, null); return null; }
  const pk = (p: number[]) => `${p[0]},${p[1]}`;
  const adj = new Map<string, { e: number; other: number[] }[]>();
  single.forEach((e, i) => {
    [[e.a, e.b], [e.b, e.a]].forEach(([p, q]) => { const k = pk(p); const l = adj.get(k) ?? []; l.push({ e: i, other: q }); adj.set(k, l); });
  });
  const used = new Set<number>();
  const rings: number[][][] = [];
  let closed = true;
  const lines: number[][][] = [];
  single.forEach((e0, i0) => {
    if (used.has(i0)) return;
    used.add(i0);
    const path = [e0.a, e0.b];
    for (;;) {
      const last = path[path.length - 1];
      const next = (adj.get(pk(last)) ?? []).find((x) => !used.has(x.e));
      if (!next) break;
      used.add(next.e);
      path.push(next.other);
    }
    lines.push(path);
    const isClosed = pk(path[0]) === pk(path[path.length - 1]);
    if (isClosed && path.length >= 4) rings.push(path); else closed = false;
  });
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  single.forEach((x) => [x.a, x.b].forEach((p) => { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); }));
  const out: CityOutline = { lines, rings, closed, bbox: [w, s, e, n] };
  memo.set(geo, out);
  return out;
}
