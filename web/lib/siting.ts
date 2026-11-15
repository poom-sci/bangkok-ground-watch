import { useCallback, useEffect, useRef, useState } from 'react';
import { finite } from './data';

export const SITING_BASE = (process.env.NEXT_PUBLIC_SITING_API ?? '').trim().replace(/\/$/, '');
export const sitingEnabled = SITING_BASE !== '';
export const abs = (u: string) => (/^https?:/.test(u) ? u : `${SITING_BASE}${u}`);

export type BBox = [number, number, number, number];
export interface Area { id: string; name: string; bbox: BBox; range: [string, string] | null }
export interface Suit {
  areaId: string; areaName: string; score: number | null; grade: 'good' | 'fair' | 'poor' | null;
  floodValue: number | null; yearsFlooded: number | null; floodSub: number | null; wFlood: number | null;
  elevValue: number | null; pFlood: number | null; elevSub: number | null; wElev: number | null;
  exclusions: string[]; landcover: string | null; level: 'low' | 'medium' | 'high' | null; flags: string[]; ghi: number | null; evidenceUrl: string | null;
}
export interface Scene { id: string; date: string; orbit: string; season: 'wet' | 'dry'; vv: number | null; vh: number | null; isWater: boolean; chipUrl: string | null; sourceUrl: string | null }
export interface LayerInfo { kind: string; value: number | null; source: string | null; chipUrl: string }
export interface Optical { date: string; cloud: number | null; days: number | null; water: boolean | null; chipUrl: string }
export interface Evidence {
  waterRule: string | null; version: string | null; runId: string | null; hash: string | null;
  total: number | null; wet: number | null; withWater: number | null; valid: number | null;
  scenes: Scene[]; layers: LayerInfo[]; optical: Optical[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const o = (v: unknown): Obj => (isObj(v) ? v : {});

function parseArea(a: unknown): Area | null {
  if (!isObj(a)) return null;
  const b = arr(a.bbox).map(finite);
  const id = str(a.id);
  if (!id || b.length !== 4 || b.some((x) => x == null)) return null;
  const r = arr(a.date_range);
  const range = str(r[0]) && str(r[1]) ? ([String(r[0]), String(r[1])] as [string, string]) : null;
  return { id, name: str(a.name) ?? id, bbox: b as BBox, range };
}

export async function fetchCoverage(signal: AbortSignal): Promise<Area[]> {
  const r = await fetch(`${SITING_BASE}/v1/coverage`, { signal });
  if (!r.ok) throw new Error('coverage');
  const j: unknown = await r.json();
  return arr(o(j).aois).flatMap((a) => parseArea(a) ?? []);
}

export type SuitResult = { kind: 'ok'; suit: Suit } | { kind: 'outside'; areas: Area[] };

export async function fetchSuitability(lat: number, lng: number, signal: AbortSignal): Promise<SuitResult> {
  const r = await fetch(`${SITING_BASE}/v1/suitability?lat=${lat}&lng=${lng}`, { signal });
  const j: unknown = await r.json().catch(() => null);
  if (r.status === 404 && o(o(j).detail).error === 'outside_coverage') {
    return { kind: 'outside', areas: arr(o(o(j).detail).available_aois).flatMap((a) => parseArea(a) ?? []) };
  }
  if (!r.ok || !isObj(j) || !('score' in j)) throw new Error('suitability');
  const d = o(j), c = o(d.components), f = o(c.flood), e = o(c.elevation), conf = o(d.confidence), lc = o(d.landcover);
  if (finite(d.score) == null && arr(d.exclusions).length === 0) throw new Error('suitability');
  const grade = str(d.grade);
  const level = str(conf.level);
  return {
    kind: 'ok',
    suit: {
      areaId: str(o(d.aoi).id) ?? '', areaName: str(o(d.aoi).name) ?? '',
      score: finite(d.score),
      grade: grade === 'good' || grade === 'fair' || grade === 'poor' ? grade : null,
      floodValue: finite(f.value), yearsFlooded: finite(f.years_flooded_share), floodSub: finite(f.subscore), wFlood: finite(f.weight),
      elevValue: finite(e.value), pFlood: finite(e.p_flood), elevSub: finite(e.subscore), wElev: finite(e.weight),
      exclusions: arr(d.exclusions).flatMap((x) => str(x) ?? []),
      landcover: str(lc.label),
      level: level === 'low' || level === 'medium' || level === 'high' ? level : null,
      flags: arr(conf.flags).flatMap((x) => str(x) ?? []),
      ghi: finite(o(d.irradiance).ghi_annual_mean),
      evidenceUrl: str(d.evidence_url),
    },
  };
}

export async function fetchEvidence(lat: number, lng: number, url: string | null, signal: AbortSignal): Promise<Evidence> {
  const r = await fetch(url ? abs(url) : `${SITING_BASE}/v1/evidence?lat=${lat}&lng=${lng}`, { signal });
  if (!r.ok) throw new Error('evidence');
  const d = o(await r.json()), m = o(d.method), s = o(d.summary);
  const hash = str(m.scene_set_hash);
  return {
    waterRule: str(m.water_rule), version: str(m.version), runId: str(d.run_id), hash: hash ? hash.replace('sha256:', '').slice(0, 8) : null,
    total: finite(s.scenes_total), wet: finite(s.scenes_wet), withWater: finite(s.wet_scenes_with_water), valid: finite(s.wet_scenes_valid),
    scenes: arr(d.scenes).flatMap((x): Scene[] => {
      const z = o(x);
      const id = str(z.scene_id), date = str(z.acquired_at), chip = str(z.chip_url);
      if (!id || !date) return [];
      return [{ id, date, orbit: str(z.orbit) ?? '', season: z.season === 'dry' ? 'dry' : 'wet', vv: finite(z.vv_db), vh: finite(z.vh_db), isWater: z.is_water === true, chipUrl: chip, sourceUrl: str(z.source_url) }];
    }),
    layers: arr(d.layers).flatMap((x): LayerInfo[] => { const z = o(x); const k = str(z.kind), c = str(z.chip_url); return k && c ? [{ kind: k, value: finite(z.value), source: str(z.source), chipUrl: c }] : []; }),
    optical: arr(d.optical_reference).flatMap((x): Optical[] => {
      const z = o(x); const date = str(z.acquired_at), c = str(z.chip_url);
      return date && c ? [{ date, cloud: finite(z.cloud_pct_aoi), days: finite(z.nearest_sar_days), water: typeof z.optical_water === 'boolean' ? z.optical_water : null, chipUrl: c }] : [];
    }),
  };
}

export type Res = { s: 'idle' } | { s: 'loading' } | { s: 'ok'; suit: Suit } | { s: 'outside'; areas: Area[] } | { s: 'error' };
export type EvState = { s: 'idle' } | { s: 'loading' } | { s: 'ok'; data: Evidence } | { s: 'error' };
export interface Pin { lat: number; lng: number }

export function useSite(active: boolean) {
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [areasError, setAreasError] = useState(false);
  const [pin, setPin] = useState<Pin | null>(null);
  const [res, setRes] = useState<Res>({ s: 'idle' });
  const [ev, setEv] = useState<EvState>({ s: 'idle' });
  const ctl = useRef<AbortController | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!active || !sitingEnabled || areas) return;
    const c = new AbortController();
    fetchCoverage(c.signal).then(setAreas, () => { if (!c.signal.aborted) setAreasError(true); });
    return () => c.abort();
  }, [active, areas, tries]);
  const retryAreas = useCallback(() => { setAreasError(false); setTries((n) => n + 1); }, []);

  const check = useCallback((p: Pin) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setPin(p); setRes({ s: 'loading' }); setEv({ s: 'idle' });
    fetchSuitability(p.lat, p.lng, c.signal).then((r) => {
      if (c.signal.aborted) return;
      if (r.kind === 'outside') { setRes({ s: 'outside', areas: r.areas }); return; }
      setRes({ s: 'ok', suit: r.suit });
      setEv({ s: 'loading' });
      fetchEvidence(p.lat, p.lng, r.suit.evidenceUrl, c.signal).then(
        (data) => { if (!c.signal.aborted) setEv({ s: 'ok', data }); },
        () => { if (!c.signal.aborted) setEv({ s: 'error' }); },
      );
    }, () => { if (!c.signal.aborted) setRes({ s: 'error' }); });
  }, []);

  const clear = useCallback(() => { ctl.current?.abort(); setPin(null); setRes({ s: 'idle' }); setEv({ s: 'idle' }); }, []);
  useEffect(() => () => ctl.current?.abort(), []);
  return { areas, areasError, retryAreas, pin, res, ev, check, clear };
}

export const inBox = (b: BBox, lat: number, lng: number) => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];

const AREA_TH: Record<string, string> = { ayutthaya: 'อยุธยา', bangkok: 'กรุงเทพฯ', samutsakhon: 'สมุทรสาคร' };
export const areaLabel = (id: string, name: string, lang: 'en' | 'th') => (lang === 'th' ? AREA_TH[id] ?? name : name);
