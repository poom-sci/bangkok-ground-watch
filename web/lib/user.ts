import { useCallback, useState } from 'react';
import type { Lang } from './i18n';

export type ModeId = 'ground' | 'site';
export interface SavedSite { id: string; lat: number; lng: number; areaId: string; areaName: string; score: number; grade: 'good' | 'fair' | 'poor' | null; savedAt: string }
export interface Profile { key: string | null; name: string; mode: ModeId | null; lang: Lang | null; sites: SavedSite[] }

export const MAX_SITES = 50;
export const NAME_RE = /^[\p{L}\p{N}\p{M} ._-]{2,24}$/u;
export type NameError = 'empty' | 'short' | 'long' | 'chars';

export const cleanName = (raw: string) => raw.normalize('NFC').replace(/\s+/g, ' ').trim();
export const nameKey = (name: string) => cleanName(name).toLowerCase().normalize('NFC');
export const clip = (name: string, n: number) => { const a = [...name]; return a.length > n ? `${a.slice(0, n).join('')}…` : name; };

export function validateName(raw: string): NameError | null {
  const n = cleanName(raw);
  if (!n) return 'empty';
  const len = [...n].length;
  if (len < 2) return 'short';
  if (len > 24) return 'long';
  return NAME_RE.test(n) ? null : 'chars';
}

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
const remove = (k: string) => { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } };

const isMode = (v: unknown): v is ModeId => v === 'ground' || v === 'site';
const isLang = (v: unknown): v is Lang => v === 'en' || v === 'th';
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function parseSites(v: unknown): SavedSite[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.flatMap((x): SavedSite[] => {
    if (typeof x !== 'object' || x === null) return [];
    const o = x as Record<string, unknown>;
    const lat = num(o.lat), lng = num(o.lng), score = num(o.score);
    if (lat == null || lng == null || score == null || typeof o.id !== 'string' || typeof o.savedAt !== 'string' || seen.has(o.id)) return [];
    seen.add(o.id);
    const g = o.grade;
    return [{ id: o.id, lat, lng, score, areaId: typeof o.areaId === 'string' ? o.areaId : '', areaName: typeof o.areaName === 'string' ? o.areaName : '',
      grade: g === 'good' || g === 'fair' || g === 'poor' ? g : null, savedAt: o.savedAt }];
  }).slice(0, MAX_SITES);
}

function parse(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { const j: unknown = JSON.parse(raw); return typeof j === 'object' && j !== null && !Array.isArray(j) ? (j as Record<string, unknown>) : {}; } catch { return {}; }
}

function load(key: string | null): Profile {
  if (key) {
    const o = parse(read(`bgw:u:${key}`));
    return { key, name: typeof o.name === 'string' && o.name ? clip(o.name, 24) : key, mode: isMode(o.mode) ? o.mode : null, lang: isLang(o.lang) ? o.lang : null, sites: parseSites(o.sites) };
  }
  const o = parse(read('bgw:guest'));
  return { key: null, name: '', mode: isMode(o.mode) ? o.mode : null, lang: isLang(o.lang) ? o.lang : null, sites: [] };
}

function persist(p: Profile) {
  if (p.key) write(`bgw:u:${p.key}`, JSON.stringify({ name: p.name, mode: p.mode, lang: p.lang, sites: p.sites }));
  else write('bgw:guest', JSON.stringify({ mode: p.mode, lang: p.lang }));
}

export const hasSeenEntry = () => read('bgw:seen') === '1';
export const markSeen = () => write('bgw:seen', '1');

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(() => load(read('bgw:user')));

  const commit = useCallback((p: Profile) => { persist(p); setProfile(p); }, []);
  const update = useCallback((patch: Partial<Pick<Profile, 'mode' | 'lang'>>) => {
    setProfile((p) => { const next = { ...p, ...patch }; persist(next); return next; });
  }, []);
  const signIn = useCallback((raw: string, mutate?: (p: Profile) => Profile): Profile => {
    const name = clip(cleanName(raw), 24);
    const key = nameKey(raw);
    const existing = load(key);
    let next: Profile = { ...existing, key, name };
    if (mutate) next = mutate(next);
    write('bgw:user', key);
    persist(next);
    setProfile(next);
    return next;
  }, []);
  const signOut = useCallback(() => {
    remove('bgw:user');
    setProfile((p) => { const g = load(null); return { ...g, mode: p.mode ?? g.mode, lang: p.lang ?? g.lang }; });
  }, []);
  return { profile, commit, update, signIn, signOut };
}

export const siteId = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

export function withSite(p: Profile, s: SavedSite): Profile {
  const i = p.sites.findIndex((x) => x.id === s.id);
  if (i >= 0) return { ...p, sites: p.sites.map((x, j) => (j === i ? s : x)) };
  return { ...p, sites: [s, ...p.sites].slice(0, MAX_SITES) };
}
