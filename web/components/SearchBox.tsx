'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLang, useT } from './ui';
import type { Area } from '@/lib/siting';

export interface Place { lat: number; lng: number; name: string; addr: string }
type State = 'idle' | 'loading' | 'empty' | 'error' | 'outside' | 'results' | 'noquery';

const TH_BOX = { w: 97.3, s: 5.6, e: 105.7, n: 20.5 };
const cache = new Map<string, Place[]>();
let lastSent = 0;

function parse(j: unknown): Place[] {
  if (!Array.isArray(j)) return [];
  return j.flatMap((x): Place[] => {
    if (typeof x !== 'object' || x === null) return [];
    const o = x as Record<string, unknown>;
    const lat = Number(o.lat), lng = Number(o.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const full = typeof o.display_name === 'string' ? o.display_name : '';
    const name = typeof o.name === 'string' && o.name ? o.name : full.split(',')[0] ?? '';
    const addr = full.split(',').slice(1, 4).join(',').trim();
    return [{ lat, lng, name, addr }];
  }).slice(0, 5);
}

export default function SearchBox({ areas, compact, onPick }: { areas: Area[]; compact: boolean; onPick: (p: Place) => void }) {
  const t = useT();
  const lang = useLang();
  const id = useId();
  const [q, setQ] = useState('');
  const [state, setState] = useState<State>('idle');
  const [results, setResults] = useState<Place[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(!compact);
  const ctl = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setOpen(!compact); }, [compact]);
  useEffect(() => () => { ctl.current?.abort(); if (timer.current) clearTimeout(timer.current); }, []);

  const run = () => {
    const query = q.trim();
    if (!query) { setState('noquery'); setResults([]); return; }
    const key = `${lang}|${query.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit) { finish(hit); return; }
    ctl.current?.abort();
    if (timer.current) clearTimeout(timer.current);
    const c = new AbortController();
    ctl.current = c;
    setState('loading');
    const wait = Math.max(0, lastSent + 1000 - Date.now());
    timer.current = setTimeout(async () => {
      lastSent = Date.now();
      const bb = areas.length ? [Math.min(...areas.map((a) => a.bbox[0])), Math.max(...areas.map((a) => a.bbox[3])), Math.max(...areas.map((a) => a.bbox[2])), Math.min(...areas.map((a) => a.bbox[1]))] : null;
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=th&accept-language=${lang}${bb ? `&viewbox=${bb.join(',')}&bounded=0` : ''}&q=${encodeURIComponent(query)}`;
      try {
        const r = await fetch(url, { signal: c.signal });
        if (!r.ok) throw new Error('nominatim');
        const list = parse(await r.json());
        cache.set(key, list);
        if (cache.size > 20) cache.delete(cache.keys().next().value as string);
        if (!c.signal.aborted) finish(list);
      } catch { if (!c.signal.aborted) { setState('error'); setResults([]); } }
    }, wait);
  };
  const finish = (list: Place[]) => {
    setResults(list);
    setActive(list.length ? 0 : -1);
    const inTh = list.filter((p) => p.lng >= TH_BOX.w && p.lng <= TH_BOX.e && p.lat >= TH_BOX.s && p.lat <= TH_BOX.n);
    setState(list.length === 0 ? 'empty' : inTh.length === 0 ? 'outside' : 'results');
  };
  const choose = (p: Place) => { setState('idle'); setResults([]); setQ(p.name); onPick(p); if (compact) setOpen(false); };
  const close = () => { setState('idle'); setResults([]); setActive(-1); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); if (state === 'results' && active >= 0 && results[active]) choose(results[active]); else run(); }
    else if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Escape') { if (results.length || state !== 'idle') { e.preventDefault(); e.stopPropagation(); close(); } else if (compact) setOpen(false); }
  };
  const msg = state === 'noquery' ? t('sr.empty') : state === 'empty' ? t('sr.none') : state === 'error' ? t('sr.error') : state === 'outside' ? t('sr.outside') : state === 'loading' ? t('loading') : null;
  const expanded = state === 'results' && results.length > 0;

  if (!open) {
    return (
      <button type="button" className="btn icon-btn" aria-label={t('sr.label')} onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); }}>
        <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
    );
  }
  return (
    <div className={`search-box${compact ? ' compact' : ''}`} role="search">
      <div className="sb-row">
        <label className="sr" htmlFor={`${id}-i`}>{t('sr.label')}</label>
        <input ref={input} id={`${id}-i`} type="search" role="combobox" aria-expanded={expanded} aria-controls={`${id}-l`} aria-autocomplete="list" aria-activedescendant={expanded && active >= 0 ? `${id}-o${active}` : undefined}
          value={q} placeholder={t('sr.label')} autoComplete="off" onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
        <button type="button" className="btn icon-btn" aria-label={t('sr.go')} onClick={run}>
          <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>
      {(expanded || msg || state !== 'idle') && (
        <div className="sb-pop glass">
          {expanded && (
            <ul id={`${id}-l`} role="listbox" aria-label={t('sr.label')}>
              {results.map((p, i) => (
                <li key={`${p.lat},${p.lng},${i}`} id={`${id}-o${i}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>
                  <span className="dmain">{p.name}</span><span className="dsub">{p.addr}</span>
                </li>
              ))}
            </ul>
          )}
          {msg && <p className="comp-sub" role="status">{msg}</p>}
          <p className="comp-sub sb-note">{t('sr.note')}</p>
        </div>
      )}
    </div>
  );
}
