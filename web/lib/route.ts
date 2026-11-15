import { useCallback, useEffect, useRef, useState } from 'react';
import { sitingEnabled } from './siting';

export type Tab = 'overview' | 'site' | 'ground' | 'districts' | 'shortlist';
export const TABS: Tab[] = ['overview', 'site', 'ground', 'districts', 'shortlist'];

export interface Route {
  tab: Tab;
  d: string | null;
  lat: number | null;
  lng: number | null;
  area: string | null;
  about: boolean;
  focus: string | null;
}

const num = (v: string | null): number | null => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/** Reads the canonical `tab=` scheme and every older link form. */
export function parseRoute(search: string): { route: Route; bare: boolean } {
  const q = new URLSearchParams(search);
  const bare = [...q.keys()].length === 0;
  const d = q.get('d') || null;
  const lat = num(q.get('lat')), lng = num(q.get('lng'));
  const rawTab = q.get('tab');
  const mode = q.get('mode');
  let tab: Tab = 'overview';
  if (rawTab && (TABS as string[]).includes(rawTab)) tab = rawTab as Tab;
  else if (d) tab = 'districts';
  else if (mode === 'site') tab = 'site';
  else if (mode === 'ground') tab = 'ground';
  else if (lat != null && lng != null) tab = 'site';
  else if (q.get('area')) tab = 'site';
  if (d && tab !== 'districts' && !rawTab) tab = 'districts';
  if (!sitingEnabled && (tab === 'site' || tab === 'shortlist')) tab = 'overview';
  return {
    route: { tab, d: tab === 'districts' ? d : null, lat: tab === 'site' ? lat : null, lng: tab === 'site' ? lng : null, area: tab === 'site' ? q.get('area') : null, about: q.get('about') === '1', focus: tab === 'ground' ? q.get('focus') : null },
    bare,
  };
}

export function routeSearch(r: Route): string {
  const q = new URLSearchParams({ tab: r.tab });
  if (r.d) q.set('d', r.d);
  if (r.lat != null && r.lng != null) { q.set('lat', String(r.lat)); q.set('lng', String(r.lng)); }
  if (r.area) q.set('area', r.area);
  if (r.focus) q.set('focus', r.focus);
  if (r.about) q.set('about', '1');
  return `?${q.toString()}`;
}

export function useRoute() {
  const [state] = useState(() => parseRoute(window.location.search));
  const [route, setRoute] = useState<Route>(state.route);
  const bare = state.bare;
  const cur = useRef<Route>(state.route);
  cur.current = route;

  useEffect(() => {
    const canonical = routeSearch(state.route);
    if (canonical !== window.location.search) window.history.replaceState(null, '', canonical);
    const onPop = () => setRoute(parseRoute(window.location.search).route);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((next: Partial<Route> & { tab?: Tab }, replace = false) => {
    const merged: Route = { tab: next.tab ?? cur.current.tab, d: null, lat: null, lng: null, area: null, about: false, focus: null, ...next };
    const search = routeSearch(merged);
    try { if (replace) window.history.replaceState(null, '', search); else window.history.pushState(null, '', search); } catch { /* ignore */ }
    cur.current = merged;
    setRoute(merged);
  }, []);

  const rewrite = useCallback((patch: Partial<Route>) => {
    const merged = { ...cur.current, ...patch };
    try { window.history.replaceState(null, '', routeSearch(merged)); } catch { /* ignore */ }
    cur.current = merged;
    setRoute(merged);
  }, []);

  return { route, bare, navigate, rewrite };
}
