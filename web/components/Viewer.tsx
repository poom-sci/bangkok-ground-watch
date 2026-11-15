'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { Badge, Chevron, LangProvider, Segmented, Warn, useT } from './ui';
import SiteResult, { AreaRow } from './SiteResult';
import SiteEvidence from './SiteEvidence';
import Gate, { NameDialog } from './Gate';
import UserMenu, { SignOutDialog } from './UserMenu';
import MySites from './MySites';
import { hasSeenEntry, markSeen, siteId, useProfile, withSite, type ModeId, type SavedSite } from '@/lib/user';
import { inBox, sitingEnabled, useSite, type Area, type BBox, type Pin } from '@/lib/siting';
import { DisplayControls, DisplayToggle, LayerSwitch } from './Controls';
import Scrubber from './Scrubber';
import Legend from './Legend';
import { DistrictList } from './Districts';
import DistrictDetail from './DistrictDetail';
import AboutDialog from './AboutDialog';
import type { MapViewMode, SiteProps } from './MapView';
import { districtAtPoint, featureCentre, fmtMonthRange, fmtYear, sortedUnique, useDataset, type Dataset, type LayerType } from '@/lib/data';
import type { Lang } from '@/lib/i18n';

const MapView = dynamic(() => import('./MapView'), { ssr: false });

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const nearest = (dates: string[], target: string): string => {
  const t = Date.parse(target);
  return dates.reduce((best, d) => (Math.abs(Date.parse(d) - t) < Math.abs(Date.parse(best) - t) ? d : best), dates[dates.length - 1]);
};

function histYears(areas: Area[] | null): { from: number; to: number } | null {
  const ys = (areas ?? []).flatMap((a) => (a.range ? [Number(a.range[0].slice(0, 4)), Number(a.range[1].slice(0, 4))] : [])).filter(Number.isFinite);
  return ys.length ? { from: Math.min(...ys), to: Math.max(...ys) } : null;
}

function Workspace({ data, onLang: setLangRaw, lang }: { data: Dataset; onLang: (l: Lang) => void; lang: Lang }) {
  const t = useT();
  const store = useProfile();
  const profile = store.profile;
  const onLang = useCallback((l: Lang) => { setLangRaw(l); store.update({ lang: l }); }, [setLangRaw, store]);
  const desktop = useMedia('(min-width: 1024px)');
  const wide = useMedia('(min-width: 1280px)');
  const compact = !desktop;
  const displayId = useId();

  const has = useMemo<Record<LayerType, boolean>>(() => ({
    gunw: data.layers.some((l) => l.type === 'gunw'), water: data.layers.some((l) => l.type === 'water'),
  }), [data.layers]);
  const allTracks = useMemo(() => sortedUnique(data.layers.map((l) => l.track)), [data.layers]);
  const datesOf = useCallback((type: LayerType, track: string) =>
    sortedUnique(data.layers.filter((l) => l.type === type && l.track === track).map((l) => l.date)), [data.layers]);
  const tracksOf = useCallback((type: LayerType) => sortedUnique(data.layers.filter((l) => l.type === type).map((l) => l.track)), [data.layers]);

  const [type, setType] = useState<LayerType>(has.gunw ? 'gunw' : 'water');
  const [track, setTrack] = useState(() => tracksOf(has.gunw ? 'gunw' : 'water')[0] ?? '');
  const [date, setDate] = useState(() => { const d = datesOf(has.gunw ? 'gunw' : 'water', tracksOf(has.gunw ? 'gunw' : 'water')[0] ?? ''); return d[d.length - 1] ?? ''; });
  const [opacity, setOpacity] = useState(85);
  const [mapView, setMapView] = useState<MapViewMode>('radar');
  const [playing, setPlaying] = useState(false);
  const params = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get('mode');
    const d = q.get('d');
    const lat = Number(q.get('lat')), lng = Number(q.get('lng'));
    return { lat: q.get('lat') && Number.isFinite(lat) ? lat : null, lng: q.get('lng') && Number.isFinite(lng) ? lng : null, mode: m === 'ground' || (m === 'site' && sitingEnabled) ? (m as ModeId) : d && m !== 'site' ? ('ground' as ModeId) : null, d, area: q.get('area'), about: q.get('about') === '1' };
  }, []);
  const [selected, setSelected] = useState<string | null>(() => (params.d && params.mode !== 'site' && data.districts.some((x) => x.dcode === params.d) ? params.d : null));
  const [sheetFull, setSheetFull] = useState(false);
  const [flyKey, setFlyKey] = useState(() => (selected ? 1 : 0));
  const [panelOpen, setPanelOpen] = useState(wide || selected != null);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(params.about);
  const [toast, setToast] = useState(false);
  const [mode, setMode] = useState<'ground' | 'site'>(() => params.mode ?? (sitingEnabled ? 'site' : 'ground'));
  const isSite = mode === 'site';
  const deepMode: ModeId | null = params.mode ?? (params.about || params.lat != null ? (sitingEnabled ? 'site' : 'ground') : null);
  const [gate, setGate] = useState<'A' | 'B' | null>(() => (deepMode ? null : hasSeenEntry() ? 'B' : 'A'));
  const [gateLeaving, setGateLeaving] = useState(false);
  const [hello, setHello] = useState(false);
  const [nameDialog, setNameDialog] = useState<{ title: string; pendingSave: boolean } | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [mySitesOpen, setMySitesOpen] = useState(false);
  const [undo, setUndo] = useState<{ key: string | null; removed: SavedSite; index: number } | null>(null);
  const site = useSite(sitingEnabled);
  const areaDone = useRef(false);
  useEffect(() => { if (profile.lang && profile.lang !== lang) setLangRaw(profile.lang); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setUndo(null); }, [profile.key]);
  useEffect(() => {
    if (!gate) return;
    const els = [...(document.querySelector('main.app')?.children ?? [])].filter((e) => !e.classList.contains('gate'));
    els.forEach((e) => e.setAttribute('inert', ''));
    return () => els.forEach((e) => e.removeAttribute('inert'));
  }, [gate]);
  const [siteOpen, setSiteOpen] = useState(false);
  const [evOpen, setEvOpen] = useState(false);
  const [overlayOn, setOverlayOn] = useState(false);
  const [flyBox, setFlyBox] = useState<{ bbox?: BBox; center?: [number, number]; zoom?: number; key: number } | null>(null);
  const centerRef = useRef<(() => Pin) | null>(null);
  const siteHeadingRef = useRef<HTMLHeadingElement>(null);
  const sitePrev = useRef({ open: false, ev: false });
  const siteIsOpen = siteOpen && !!site.pin;
  useEffect(() => {
    const was = sitePrev.current;
    const q = (sel: string) => document.querySelector<HTMLElement>(sel);
    if (siteIsOpen && !was.open) { if (!isExample) siteHeadingRef.current?.focus(); }
    else if (!siteIsOpen && was.open) q('[data-use-centre]')?.focus();
    else if (siteIsOpen && evOpen !== was.ev) { if (evOpen) siteHeadingRef.current?.focus(); else q('[data-evidence-open]')?.focus(); }
    sitePrev.current = { open: siteIsOpen, ev: evOpen };
  }, [siteIsOpen, evOpen]);
  const latestLos = useMemo(() => data.layers.filter((l) => l.type === 'gunw').sort((a, b) => (a.date < b.date ? -1 : 1)).pop() ?? null, [data.layers]);
  const goArea = useCallback((a: Area) => setFlyBox({ bbox: a.bbox, key: Date.now() }), []);
  const [isExample, setIsExample] = useState(false);
  const exampleRef = useRef(false);
  const dropPin = useCallback((lat: number, lng: number) => { setIsExample(false); site.check({ lat, lng }); setSiteOpen(true); setEvOpen(false); }, [site.check]);
  const changeMode = (m: 'ground' | 'site') => {
    setMode(m); setPlaying(false); setDisplayOpen(false); setMySitesOpen(false); store.update({ mode: m });
    if (m === 'ground') { site.clear(); setSiteOpen(false); setEvOpen(false); }
  };

  const dates = datesOf(type, track);
  const secDateOf = useCallback((tr: string, day: string) => data.layers.find((l) => l.type === 'gunw' && l.track === tr && l.date === day)?.secDate ?? null, [data.layers]);
  const secDates = dates.map((d) => data.layers.find((l) => l.type === type && l.track === track && l.date === d)?.secDate ?? null);
  const index = Math.max(0, dates.indexOf(date));
  const current = data.layers.find((l) => l.type === type && l.track === track && l.date === date) ?? null;
  const availableTracks = useMemo(() => new Set(tracksOf(type)), [tracksOf, type]);
  const waterAvailable = data.districts.some((d) => d.waterMaxPct != null || d.water.some((w) => w.pct != null));
  const radar = mapView === 'radar';

  const loaded = useRef(new Set<string>());
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const nextUrl = data.layers.find((l) => l.type === type && l.track === track && l.date === dates[index + 1])?.url ?? null;
  const curUrl = radar && !isSite ? current?.url ?? null : null;
  useEffect(() => {
    if (!curUrl || loaded.current.has(curUrl)) { setLoadingUrl(null); return; }
    let live = true;
    setLoadingUrl(curUrl);
    const im = new Image();
    const done = (ok: boolean) => { if (ok) loaded.current.add(curUrl); if (live) setLoadingUrl((p) => (p === curUrl ? null : p)); };
    im.onload = () => done(true);
    im.onerror = () => done(false);
    im.src = curUrl;
    return () => { live = false; };
  }, [curUrl]);
  useEffect(() => {
    if (!nextUrl || !radar || loaded.current.has(nextUrl)) return;
    const im = new Image();
    im.onload = () => loaded.current.add(nextUrl);
    im.src = nextUrl;
  }, [nextUrl, radar]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasOpen = useRef(panelOpen);
  useEffect(() => {
    if (panelOpen && !wasOpen.current) headingRef.current?.focus();
    if (!panelOpen && wasOpen.current) document.querySelector<HTMLElement>('[data-districts-trigger]')?.focus();
    wasOpen.current = panelOpen;
  }, [panelOpen]);

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(false), 4000); return () => clearTimeout(id); }, [toast]);

  const changeType = (nt: LayerType) => {
    if (!has[nt]) return;
    const tracks = tracksOf(nt);
    const nk = tracks.includes(track) ? track : tracks[0];
    const nd = datesOf(nt, nk);
    setPlaying(false); setType(nt); setTrack(nk); setDate(nd[nd.length - 1]);
  };
  const changeTrack = (nk: string) => {
    const nd = datesOf(type, nk);
    if (!nd.length) return;
    setPlaying(false); setTrack(nk); setDate(nd.includes(date) ? date : nearest(nd, date));
  };
  const pick = (code: string) => {
    setSheetFull(false);
    setSelected(code); setFlyKey((k) => k + 1); setPanelOpen(true);
    if (compact) setDisplayOpen(false);
  };

  const sheetH = typeof window === 'undefined' ? 0 : window.innerHeight;
  const sideR = isSite ? (siteOpen && site.pin ? (evOpen ? 440 : 360) + 48 : 48) : null;
  const padding = desktop
    ? sideR != null ? { top: 96, bottom: 96, left: (wide ? 296 : 296) + 48, right: sideR } : { top: 80, bottom: 96, left: (wide ? 296 : 264) + 48, right: panelOpen ? (selected ? (wide ? 400 : 360) : (wide ? 360 : 320)) + 48 : 48 }
    : { top: 120, bottom: panelOpen && selected ? Math.round(sheetH * 0.45) + 24 : 230, left: 24, right: 24 };

  const display = (
    <DisplayControls tracks={allTracks} available={availableTracks} track={track} onTrack={changeTrack}
      opacity={opacity} onOpacity={setOpacity} mapView={mapView} onMapView={(m) => { setMapView(m); setPlaying(false); }} />
  );
  const layerSwitch = <LayerSwitch type={type} has={has} disabled={!radar} onChange={changeType} />;
  const scrubber = (
    <>
      {!radar && <p className="loading-chip">{t('view.radarOnly')}</p>}
      {loadingUrl && curUrl === loadingUrl && <p className="loading-chip" role="status">{t('overlay.loading')}</p>}
      <Scrubber dates={dates} secDates={secDates} index={index} onIndex={(i) => setDate(dates[i])} playing={playing} onPlaying={setPlaying} disabled={!radar} />
    </>
  );
  const siteDisplay = (
    <div className="display-body">
      <label className="switch"><input type="checkbox" role="switch" checked={overlayOn} onChange={(e) => setOverlayOn(e.target.checked)} /><span>{t('site.overlay')}</span></label>
      <p className="comp-sub">{t('site.overlay.note')}</p>
    </div>
  );
  const siteProps: SiteProps | null = isSite ? { areas: site.areas ?? [], pin: site.pin, fly: flyBox, centerRef, goLabel: t('site.go'), pinLabel: t('site.pin'), onPick: dropPin, onFly: goArea } : null;
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const closeGate = (after: () => void) => {
    setGateLeaving(true);
    setTimeout(() => { setGate(null); setGateLeaving(false); setHello(false); after(); }, reduce() ? 0 : 160);
  };
  const focusModeControl = () => requestAnimationFrame(() => (document.querySelector<HTMLElement>('.modesw .seg-btn[aria-pressed="true"]') ?? document.querySelector<HTMLElement>('.title-btn'))?.focus());
  const chooseMode = (m: ModeId) => closeGate(() => { changeMode(m); focusModeControl(); });
  const answerGate = (name: string | null) => {
    markSeen();
    if (name) { const p = store.signIn(name); setHello(true); if (p.lang && p.lang !== lang) setLangRaw(p.lang); }
    else if (profile.key) store.signOut();
    setGate('B');
  };
  useEffect(() => {
    try {
      if (gate) { window.history.replaceState(null, '', window.location.pathname); return; }
      const q = new URLSearchParams({ mode });
      if (mode === 'ground' && selected) q.set('d', selected);
      window.history.replaceState(null, '', `?${q.toString()}`);
    } catch { /* ignore */ }
  }, [gate, mode, selected]);
  useEffect(() => {
    if (areaDone.current || !params.area || !site.areas) return;
    areaDone.current = true;
    const a = site.areas.find((x) => x.id === params.area);
    if (a) goArea(a);
  }, [site.areas, params.area, goArea]);
  const trackSpan = (tr: string) => {
    const ls = data.layers.filter((l) => l.type === 'gunw' && l.track === tr);
    if (!ls.length) return null;
    const start = ls.map((l) => l.date).sort()[0];
    const end = ls.map((l) => l.secDate ?? l.date).sort().pop() ?? start;
    return { start, end };
  };
  const ranked = useMemo(() => data.districts.filter((x) => x.index != null).sort((a, b) => (b.index ?? 0) - (a.index ?? 0)).map((x) => x.dcode), [data.districts]);
  const resultAreaId = site.res.s === 'ok' ? site.res.suit.areaId : null;
  const resultYears = histYears((site.areas ?? []).filter((a) => a.id === resultAreaId)) ?? histYears(site.areas);
  const centre = (code: string) => featureCentre(data.geo, code);
  const canCheckHere = (code: string) => { const c = centre(code); return !!c && (site.areas ?? []).some((a) => inBox(a.bbox, c.lat, c.lng)); };
  const checkHere = (code: string) => {
    const c = centre(code);
    if (!c) return;
    changeMode('site');
    setFlyBox({ center: [c.lng, c.lat], zoom: 12, key: Date.now() });
    dropPin(c.lat, c.lng);
  };
  useEffect(() => {
    if (exampleRef.current || !isSite || gate || !site.areas || site.pin) return;
    exampleRef.current = true;
    const own = params.lat != null && params.lng != null;
    const pt = own ? { lat: params.lat as number, lng: params.lng as number } : { lat: 13.75, lng: 100.83 };
    setIsExample(!own);
    site.check(pt); setSiteOpen(true); setEvOpen(false);
    const bkk = site.areas.find((a) => a.id === 'bangkok');
    setFlyBox(!own && bkk ? { bbox: bkk.bbox, key: Date.now() } : { center: [pt.lng, pt.lat], zoom: own ? 13 : 11, key: Date.now() });
  }, [isSite, gate, site.areas, site.pin, site.check, params.lat, params.lng]);
  const goStart = () => { setHello(false); setGate('B'); setGateLeaving(false); };
  const pinId = site.pin ? siteId(site.pin.lat, site.pin.lng) : null;
  const saved = pinId ? profile.sites.some((s) => s.id === pinId) : false;
  const record = (): SavedSite | null => {
    if (site.res.s !== 'ok' || !site.pin) return null;
    const su = site.res.suit;
    if (su.score == null) return null;
    return { id: siteId(site.pin.lat, site.pin.lng), lat: site.pin.lat, lng: site.pin.lng, areaId: su.areaId, areaName: su.areaName, score: Math.round(su.score), grade: su.grade, savedAt: new Date().toISOString() };
  };
  const onSave = () => {
    const rec = record();
    if (!rec) return;
    if (!profile.key) { setNameDialog({ title: t('save.gate'), pendingSave: true }); return; }
    store.commit(saved ? { ...profile, sites: profile.sites.filter((s) => s.id !== rec.id) } : withSite(profile, rec));
  };
  const submitName = (name: string) => {
    const rec = nameDialog?.pendingSave ? record() : null;
    const p = store.signIn(name, rec ? (pp) => withSite(pp, rec) : undefined);
    if (p.lang && p.lang !== lang) setLangRaw(p.lang);
    setNameDialog(null);
  };
  const pickSaved = (s: SavedSite) => { setFlyBox({ center: [s.lng, s.lat], zoom: 13, key: Date.now() }); dropPin(s.lat, s.lng); setMySitesOpen(false); };
  const removeSaved = (s: SavedSite) => {
    const index = profile.sites.findIndex((x) => x.id === s.id);
    if (index < 0) return;
    setUndo({ key: profile.key, removed: s, index });
    store.commit({ ...profile, sites: profile.sites.filter((x) => x.id !== s.id) });
  };
  const doUndo = () => {
    if (!undo || undo.key !== profile.key) { setUndo(null); return; }
    if (!profile.sites.some((x) => x.id === undo.removed.id)) {
      const sites = [...profile.sites];
      sites.splice(Math.min(undo.index, sites.length), 0, undo.removed);
      store.commit({ ...profile, sites });
    }
    setUndo(null);
  };
  const showMySites = () => {
    if (desktop) { const h = document.getElementById('my-sites-h'); h?.scrollIntoView({ block: 'nearest' }); h?.focus(); }
    else { setMySitesOpen(true); setSiteOpen(false); setDisplayOpen(false); }
  };
  const mySites = (limit?: number) => <MySites sites={profile.sites} guest={!profile.key} limit={limit} onPick={pickSaved} onRemove={removeSaved} onAdd={() => setNameDialog({ title: t('user.add'), pendingSave: false })} />;
  const groundLine = data.gunwSpan ? t('start.ground.data', { range: fmtMonthRange(data.gunwSpan.from, data.gunwSpan.to, lang, t('interval.to')) ?? '', n: data.districts.length }) : t('mode.ground');
  const years = (site.areas ?? []).flatMap((a) => (a.range ? [Number(a.range[0].slice(0, 4)), Number(a.range[1].slice(0, 4))] : [])).filter(Number.isFinite);
  const yrRange = years.length ? (Math.min(...years) === Math.max(...years) ? fmtYear(years[0], lang) : `${fmtYear(Math.min(...years), lang)} ${t('interval.to')} ${fmtYear(Math.max(...years), lang)}`) : null;
  const siteLine = yrRange ? t('start.site.data', { range: yrRange }) : t('start.site.data0');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || gate || document.querySelector('dialog[open]')) return;
      if (displayOpen) { setDisplayOpen(false); requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-display-toggle]')?.focus()); return; }
      if (isSite) {
        if (mySitesOpen) setMySitesOpen(false);
        else if (siteOpen && site.pin) { if (evOpen) setEvOpen(false); else setSiteOpen(false); }
      } else if (panelOpen) { if (selected) setSelected(null); else setPanelOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const coverageAlert = (
    <div className="alert-err" role="alert">
      <p><Warn />{t('state.error')}</p>
      <button type="button" className="btn" onClick={site.retryAreas}>{t('retry')}</button>
    </div>
  );
  const nisarCode = site.res.s === 'ok' && site.pin ? districtAtPoint(data.geo, site.pin.lat, site.pin.lng) : null;
  const nisarDistrict = nisarCode ? data.districts.find((d) => d.dcode === nisarCode) ?? null : null;
  const useCentre = () => { const c = centerRef.current?.(); if (c) dropPin(c.lat, c.lng); };
  const losLegend = overlayOn ? <Legend mode="radar" type="gunw" layer={latestLos} rangeMm={data.rangeMm} isNisar={data.isNisar} /> : null;
  const legend = <Legend mode={mapView} type={type} layer={current} rangeMm={data.rangeMm} isNisar={data.isNisar} />;
  const detail = selected ? data.districts.find((d) => d.dcode === selected) ?? null : null;

  return (
    <main className={`app${panelOpen && !isSite ? ' panel-open' : ''}${isSite && siteOpen && site.pin ? ' site-open' : ''}${sitingEnabled ? ' has-modes' : ''}`}>
      <MapView layers={data.layers} current={isSite ? (overlayOn ? latestLos : null) : radar ? current : null} opacity={isSite ? 60 : opacity} mode={isSite ? 'radar' : mapView} geo={data.geo} districts={data.districts}
        selected={selected} flyKey={flyKey} padding={padding} onSelect={pick} onOverlayError={() => setToast(true)} label={t('map.label')} site={siteProps} />

      <div className="topbar">
        <header className="chip glass">
          <h1><button type="button" className="title-btn" aria-label={`${t('title')}: ${t('toStart')}`} onClick={goStart}>{t('title')}</button></h1>
          <p className="subtitle">{t(isSite ? 'start.site' : 'start.ground')}</p>
          {isSite ? <span className="badge demo"><Warn />{t('badge.prov')}</span> : data.isNisar != null && <Badge nisar={data.isNisar} />}
        </header>
        <div className="toolbar">
          <Segmented label={t('lang.label')} value={lang} onChange={onLang} options={[{ value: 'en', label: 'EN' }, { value: 'th', label: 'TH' }]} />
          <button type="button" className="btn about-btn" aria-label={t('about.open')} onClick={() => setAboutOpen(true)}>
            <span className="about-full">{t('about.open')}</span><span className="about-i" aria-hidden="true">i</span>
          </button>
          <UserMenu profile={profile} canMySites={isSite} onMySites={showMySites} onAbout={() => setAboutOpen(true)}
            onSwitch={() => setNameDialog({ title: t('user.switch'), pendingSave: false })} onAdd={() => setNameDialog({ title: t('user.add'), pendingSave: false })} onSignOut={() => setSignOutOpen(true)} />
        </div>

 {sitingEnabled && (
          <div className="modesw">
            <Segmented label={t('mode.label')} value={mode} onChange={changeMode}
              options={sitingEnabled ? [{ value: 'site', label: t('mode.site') }, { value: 'ground', label: t('mode.ground') }] : [{ value: 'ground', label: t('mode.ground') }]} />
          </div>
        )}
      </div>

      {toast && <div className="toast" role="status">{t('overlay.fail')}</div>}

      {isSite && <div className="crosshair" role="img" aria-label={t('site.crosshair')} />}
      {isSite ? (
        <>
      {desktop ? (
        <aside className="leftcard glass">
          <h3 className="sub-h">{t('site.areas')}</h3>
          {site.areas && <p className="comp-sub">{t('site.hint')}</p>}
          {site.areasError ? coverageAlert : site.areas == null ? <p className="comp-sub">{t('site.loadingAreas')}</p>
            : site.areas.length === 0 ? <p className="comp-sub">{t('site.noAreas')}</p>
            : <ul className="arealist">{site.areas.map((a) => <AreaRow key={a.id} area={a} onGo={goArea} />)}</ul>}
          <button type="button" className="btn wide" data-use-centre disabled={!site.areas} onClick={useCentre}>{t('site.center')}</button>
          <DisplayToggle open={displayOpen} onToggle={() => setDisplayOpen((v) => !v)} controls={displayId} />
          <div id={displayId} hidden={!displayOpen}>{siteDisplay}</div>
          {losLegend}
          <section aria-labelledby="my-sites-h">
            <h3 className="sub-h" id="my-sites-h" tabIndex={-1}>{t('my.title')}</h3>
            {mySites(3)}
          </section>
        </aside>
      ) : (
        <div className="bottom">
          {losLegend && <div className="glass legend-float">{losLegend}</div>}
          <div className="dock glass">
            {displayOpen && <div id={displayId} className="popover glass">{siteDisplay}</div>}
            {site.areasError ? coverageAlert : site.areas && <p className="comp-sub dock-hint">{t('site.hint')}</p>}
            <div className="chips-row">{(site.areas ?? []).map((a) => <button key={a.id} type="button" className="btn chip-btn" onClick={() => goArea(a)}>{a.name}</button>)}<button type="button" className="btn chip-btn" data-use-centre disabled={!site.areas} onClick={useCentre}>{t('site.center')}</button></div>
            <div className="dock-btns">
              <button type="button" className="btn" data-display-toggle aria-expanded={displayOpen} aria-controls={displayId} onClick={() => setDisplayOpen((v) => !v)}>
                <span>{t('display')}</span><Chevron open={displayOpen} />
              </button>
              <button type="button" className="btn" data-mysites-trigger aria-expanded={mySitesOpen} onClick={() => (mySitesOpen ? setMySitesOpen(false) : showMySites())}>{t('my.title')}</button>
            </div>
          </div>
        </div>
      )}

      {!desktop && mySitesOpen && (
        <aside className="panel glass site-panel" data-site="mine" aria-label={t('my.title')}>
          <button type="button" className="handle" aria-label={t('about.close')} onClick={() => setMySitesOpen(false)}><span /></button>
          <div className="panel-head"><h2>{t('my.title')}</h2><button type="button" className="btn" onClick={() => setMySitesOpen(false)}>{t('about.close')}</button></div>
          <div className="panel-body">{mySites()}</div>
        </aside>
      )}

      {siteOpen && site.pin && !mySitesOpen && (
        <aside className="panel glass site-panel" data-site={evOpen ? 'ev' : 'result'} aria-label={t('card.title')}>
          <button type="button" className="handle" aria-label={t('about.close')} onClick={() => setSiteOpen(false)}><span /></button>
          <div className="panel-head">
            <h2 ref={siteHeadingRef} tabIndex={-1}>{t(evOpen ? 'ev.title' : 'card.title')}</h2>
            <button type="button" className="btn" onClick={() => setSiteOpen(false)}>{t('about.close')}</button>
          </div>
          <div className="panel-body">
            {evOpen ? (
              site.ev.s === 'ok' ? <SiteEvidence ev={site.ev.data} landcover={site.res.s === 'ok' ? site.res.suit.landcover : null} onBack={() => setEvOpen(false)} />
                : <div><button type="button" className="btn back" onClick={() => setEvOpen(false)}>{t('back')}</button><p className="comp-sub">{site.ev.s === 'error' ? t('state.error') : t('loading')}</p></div>
            ) : <SiteResult res={site.res} ev={site.ev} onEvidence={() => setEvOpen(true)} onRetry={() => site.pin && site.check(site.pin)} onGo={goArea} saved={record() ? saved : null} onSave={record() ? onSave : null} example={isExample} nisar={site.res.s === 'ok' ? nisarDistrict ? { district: nisarDistrict, tracks: allTracks, track, waterAvailable } : 'outside' : null} years={resultYears} />}
          </div>
        </aside>
      )}
        </>
      ) : (
        <>
      {desktop ? (
        <>
          <aside className="leftcard glass">
            {layerSwitch}
            <DisplayToggle open={displayOpen} onToggle={() => setDisplayOpen((v) => !v)} controls={displayId} />
            <div id={displayId} hidden={!displayOpen}>{display}</div>
            {legend}
          </aside>
          <div className="scrubwrap glass">{scrubber}</div>
          {!panelOpen && <button type="button" className="btn pill" data-districts-trigger onClick={() => setPanelOpen(true)}>{t('districts')}</button>}
        </>
      ) : (
        <div className="bottom">
          <div className="glass legend-float">{legend}</div>
          <div className="dock glass">
            {displayOpen && <div id={displayId} className="popover glass">{display}</div>}
            {layerSwitch}
            {scrubber}
            <div className="dock-btns">
              <button type="button" className="btn" aria-expanded={displayOpen} aria-controls={displayId}
                onClick={() => { setDisplayOpen((v) => !v); setPanelOpen(false); }}>
                <span>{t('display')}</span><Chevron open={displayOpen} />
              </button>
              <button type="button" className="btn" data-districts-trigger aria-expanded={panelOpen} onClick={() => { setPanelOpen((v) => !v); setDisplayOpen(false); }}>
                {t('districts')}
              </button>
            </div>
          </div>
        </div>
      )}

      {panelOpen && (
        <aside className="panel glass" data-detail={detail ? 'true' : 'false'} data-full={sheetFull ? 'true' : undefined} aria-label={t('districts')}>
          <button type="button" className="handle" aria-label={t(detail ? 'd.expand' : 'about.close')} onClick={() => (detail ? setSheetFull((v) => !v) : setPanelOpen(false))}><span /></button>
          <div className="panel-head">
            <h2 ref={headingRef} tabIndex={-1}>{t(detail ? 'd.profile' : 'districts')}</h2>
            <button type="button" className="btn" onClick={() => setPanelOpen(false)}>{t('about.close')}</button>
          </div>
          <div className="panel-body">
            {detail
              ? <DistrictDetail d={detail} rank={ranked.indexOf(detail.dcode) + 1} rankOf={ranked.length} tracks={allTracks} track={track} onTrack={changeTrack} waterAvailable={waterAvailable}
                  secDateOf={secDateOf} trackSpan={trackSpan} onBack={() => setSelected(null)} onCheck={canCheckHere(detail.dcode) ? () => checkHere(detail.dcode) : null} />
              : <DistrictList districts={data.districts} track={track} selected={selected} onPick={pick} waterAvailable={waterAvailable} />}
          </div>
        </aside>
      )}

        </>
      )}

      {gate && (
        <Gate step={gate} lang={lang} onLang={onLang} profile={profile} hello={hello} siteEnabled={sitingEnabled} groundLine={groundLine} siteLine={siteLine}
          onName={(n) => answerGate(n)} onGuest={() => answerGate(null)} onDismiss={() => (profile.key ? setGate('B') : answerGate(null))} onChoose={chooseMode} onNotYou={() => setGate('A')} leaving={gateLeaving} />
      )}
      <NameDialog open={nameDialog != null} title={nameDialog?.title ?? ''} onName={submitName} onClose={() => setNameDialog(null)} />
      <SignOutDialog open={signOutOpen} name={profile.name} onConfirm={() => { store.signOut(); setSignOutOpen(false); }} onCancel={() => setSignOutOpen(false)} />
      {undo && <UndoToast key={undo.removed.id} onUndo={doUndo} onExpire={() => setUndo(null)} />}
      <AboutDialog open={aboutOpen} span={data.gunwSpan} years={histYears(site.areas)} onClose={() => setAboutOpen(false)} />
    </main>
  );
}

function UndoToast({ onUndo, onExpire }: { onUndo: () => void; onExpire: () => void }) {
  const t = useT();
  const [paused, setPaused] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => { btn.current?.focus(); }, []);
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => expire.current(), 10000);
    return () => clearTimeout(id);
  }, [paused]);
  return (
    <div className="toast undo-toast" role="status" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <span>{t('my.removedMsg')}</span>
      <button ref={btn} type="button" className="btn" onClick={onUndo}>{t('my.undo')}</button>
    </div>
  );
}

function Empty({ failed }: { failed: boolean }) {
  const t = useT();
  return (
    <div className="empty glass">
      <h2>{t(failed ? 'data.unavailable' : 'empty.title')}</h2>
      <p>{t(failed ? 'data.unavailable.body' : 'empty.body')}</p>
    </div>
  );
}

export default function Viewer() {
  const [lang, setLang] = useState<Lang>('en');
  const state = useDataset();

  useEffect(() => {
    try { const v = localStorage.getItem('bgw-lang'); if (v === 'en' || v === 'th') setLang(v); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const change = (l: Lang) => { setLang(l); try { localStorage.setItem('bgw-lang', l); } catch { /* storage unavailable */ } };

  return (
    <LangProvider value={lang}>
      {state.status === 'loading' ? <LoadingShell /> : state.data.layers.length === 0 ? <EmptyShell lang={lang} onLang={change} failed={state.data.failed} /> : <Workspace data={state.data} lang={lang} onLang={change} />}
    </LangProvider>
  );
}

function LoadingShell() {
  const t = useT();
  return <main className="app"><div className="chip glass solo"><h1>{t('title')}</h1><p className="subtitle">{t('loading')}</p></div></main>;
}

function EmptyShell({ lang, onLang, failed }: { lang: Lang; onLang: (l: Lang) => void; failed: boolean }) {
  const t = useT();
  return (
    <main className="app">
      <div className="topbar">
        <header className="chip glass"><h1>{t('title')}</h1><p className="subtitle">{t('subtitle')}</p></header>
        <div className="toolbar">
          <Segmented label={t('lang.label')} value={lang} onChange={onLang} options={[{ value: 'en', label: 'EN' }, { value: 'th', label: 'TH' }]} />
        </div>
      </div>
      <Empty failed={failed} />
    </main>
  );
}
