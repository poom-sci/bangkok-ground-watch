'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { Badge, Chevron, Segmented, Warn, useT } from './ui';
import SiteResult from './SiteResult';
import SiteEvidence from './SiteEvidence';
import { NameDialog } from './Gate';
import UserMenu, { SignOutDialog } from './UserMenu';
import Shell from './Shell';
import OverviewPage from './OverviewPage';
import DistrictsPage from './DistrictsPage';
import ShortlistPage from './ShortlistPage';
import { hasSeenEntry, markSeen, siteId, useProfile, withSite, type SavedSite } from '@/lib/user';
import { inBox, sitingEnabled, useSite, type Area, type BBox, type Pin } from '@/lib/siting';
import { parseTrack, districtAtPoint, featureCentre, sortedUnique, type Dataset, type LayerType } from '@/lib/data';
import { useRoute, type Tab } from '@/lib/route';
import Scrubber from './Scrubber';
import Legend from './Legend';
import DistrictDetail from './DistrictDetail';
import AboutDialog from './AboutDialog';
import type { MapViewMode, SiteProps } from './MapView';
import type { Key, Lang } from '@/lib/i18n';

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

export function UndoToast({ onUndo, onExpire }: { onUndo: () => void; onExpire: () => void }) {
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

export default function Workspace({ data, onLang: setLangRaw, lang }: { data: Dataset; onLang: (l: Lang) => void; lang: Lang }) {
  const t = useT();
  const store = useProfile();
  const profile = store.profile;
  const onLang = useCallback((l: Lang) => { setLangRaw(l); store.update({ lang: l }); }, [setLangRaw, store]);
  const wide = useMedia('(min-width: 1280px)');
  const phone = useMedia('(max-width: 767px)');
  const { route, bare, navigate, rewrite } = useRoute();
  const tab: Tab = route.tab;
  const isSite = tab === 'site';
  const isGround = tab === 'ground';
  const popId = useId();

  const has = useMemo<Record<LayerType, boolean>>(() => ({ gunw: data.layers.some((l) => l.type === 'gunw'), water: data.layers.some((l) => l.type === 'water') }), [data.layers]);
  const allTracks = useMemo(() => sortedUnique(data.layers.map((l) => l.track)), [data.layers]);
  const datesOf = useCallback((type: LayerType, track: string) => sortedUnique(data.layers.filter((l) => l.type === type && l.track === track).map((l) => l.date)), [data.layers]);
  const tracksOf = useCallback((type: LayerType) => sortedUnique(data.layers.filter((l) => l.type === type).map((l) => l.track)), [data.layers]);

  const coverage = useMemo(() => {
    const m: Record<string, number> = {};
    allTracks.forEach((k) => { m[k] = data.districts.filter((d) => d.los.some((x) => x.track === k && x.mean != null)).length; });
    return m;
  }, [allTracks, data.districts]);
  const bestTrack = (ty: LayerType) => {
    const ts = tracksOf(ty);
    const last = (k: string) => datesOf(ty, k).slice(-1)[0] ?? '';
    return [...ts].sort((a, b) => (coverage[b] ?? 0) - (coverage[a] ?? 0) || (last(b) < last(a) ? -1 : last(b) > last(a) ? 1 : 0))[0] ?? '';
  };
  const [type, setType] = useState<LayerType>(has.gunw ? 'gunw' : 'water');
  const [track, setTrack] = useState(() => bestTrack(has.gunw ? 'gunw' : 'water'));
  const [date, setDate] = useState(() => { const d = datesOf(has.gunw ? 'gunw' : 'water', bestTrack(has.gunw ? 'gunw' : 'water')); return d[d.length - 1] ?? ''; });
  const [opacity, setOpacity] = useState(85);
  const [mapView, setMapView] = useState<MapViewMode>('radar');
  const [playing, setPlaying] = useState(false);
  const [popOpen, setPopOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(route.about);
  const [toast, setToast] = useState(false);
  const [nameDialog, setNameDialog] = useState<{ title: string; pendingSave: boolean; welcome?: boolean } | null>(() => (bare && !hasSeenEntry() ? { title: '', pendingSave: false, welcome: true } : null));
  const [justNamed, setJustNamed] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [undo, setUndo] = useState<{ key: string | null; removed: SavedSite; index: number } | null>(null);
  const [mapShown, setMapShown] = useState(false);
  const [flyKey, setFlyKey] = useState(0);
  const site = useSite(sitingEnabled);
  const [siteOpen, setSiteOpen] = useState(true);
  const [evOpen, setEvOpen] = useState(false);
  const [overlayOn, setOverlayOn] = useState(false);
  const [isExample, setIsExample] = useState(false);
  const [flyBox, setFlyBox] = useState<{ bbox?: BBox; center?: [number, number]; zoom?: number; key: number } | null>(null);
  const centerRef = useRef<(() => Pin) | null>(null);
  const siteHeadingRef = useRef<HTMLHeadingElement>(null);
  const handled = useRef('');
  const exampleDone = useRef(false);

  useEffect(() => { if (profile.lang && profile.lang !== lang) setLangRaw(profile.lang); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setUndo(null); }, [profile.key]);
  useEffect(() => { if (isSite || isGround) setMapShown(true); }, [isSite, isGround]);
  useEffect(() => { setPopOpen(false); setPlaying(false); }, [tab]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(false), 4000); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { if (!aboutOpen && route.about) rewrite({ about: false }); }, [aboutOpen, route.about, rewrite]);
  useEffect(() => { if (route.focus && isGround) setFlyKey((k) => k + 1); }, [route.focus, isGround]);

  const latestLos = useMemo(() => data.layers.filter((l) => l.type === 'gunw').sort((a, b) => (a.date < b.date ? -1 : 1)).pop() ?? null, [data.layers]);
  const goArea = useCallback((a: Area) => setFlyBox({ bbox: a.bbox, key: Date.now() }), []);
  const dropPin = useCallback((lat: number, lng: number) => { setIsExample(false); site.check({ lat, lng }); setSiteOpen(true); setEvOpen(false); }, [site.check]);

  // Site Scout entry: own point from the URL, an area, or the live example point
  useEffect(() => {
    if (!isSite) return;
    const own = route.lat != null && route.lng != null;
    if (!own && !route.area && !site.areas) return;
    const key = own ? `${route.lat},${route.lng}` : route.area ? `area:${route.area}` : 'example';
    if (key === handled.current) return;
    handled.current = key;
    if (own) { dropPin(route.lat as number, route.lng as number); setFlyBox({ center: [route.lng as number, route.lat as number], zoom: 13, key: Date.now() }); return; }
    if (route.area) { const a = site.areas?.find((x) => x.id === route.area); if (a) goArea(a); return; }
    if (exampleDone.current || site.pin || !site.areas) return;
    exampleDone.current = true;
    setIsExample(true);
    site.check({ lat: 13.75, lng: 100.83 }); setSiteOpen(true); setEvOpen(false);
    const bkk = site.areas.find((a) => a.id === 'bangkok');
    setFlyBox(bkk ? { bbox: bkk.bbox, key: Date.now() } : { center: [100.83, 13.75], zoom: 11, key: Date.now() });
  }, [isSite, route.lat, route.lng, route.area, site.areas, site.pin, site.check, dropPin, goArea]);

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
  const curUrl = radar && isGround ? current?.url ?? null : null;
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

  const changeType = (nt: LayerType) => {
    if (!has[nt]) return;
    const tracks = tracksOf(nt);
    const nk = tracks.includes(track) ? track : bestTrack(nt);
    const nd = datesOf(nt, nk);
    setPlaying(false); setType(nt); setTrack(nk); setDate(nd[nd.length - 1]);
  };
  const changeTrack = (nk: string) => {
    const nd = datesOf(type, nk);
    if (!nd.length) return;
    setPlaying(false); setTrack(nk); setDate(nd.includes(date) ? date : nearest(nd, date));
  };

  // districts
  const trackSpan = (tr: string) => {
    const ls = data.layers.filter((l) => l.type === 'gunw' && l.track === tr);
    if (!ls.length) return null;
    const start = ls.map((l) => l.date).sort()[0];
    const end = ls.map((l) => l.secDate ?? l.date).sort().pop() ?? start;
    return { start, end };
  };
  const ranked = useMemo(() => data.districts.filter((x) => x.index != null).sort((a, b) => (b.index ?? 0) - (a.index ?? 0)).map((x) => x.dcode), [data.districts]);
  const validD = route.d && data.districts.some((x) => x.dcode === route.d) ? route.d : null;
  const detail = validD ? data.districts.find((d) => d.dcode === validD) ?? null : null;
  const openDistrict = (code: string) => navigate({ tab: 'districts', d: code });
  const closeDistrict = () => navigate({ tab: 'districts' }, true);
  const pickGround = (code: string) => { rewrite({ focus: code }); navigate({ tab: 'districts', d: code }); };
  const centre = (code: string) => featureCentre(data.geo, code);
  const canCheckHere = (code: string) => { const c = centre(code); return !!c && (site.areas ?? []).some((a) => inBox(a.bbox, c.lat, c.lng)); };
  const checkHere = (code: string) => { const c = centre(code); if (c) navigate({ tab: 'site', lat: Number(c.lat.toFixed(5)), lng: Number(c.lng.toFixed(5)) }); };

  // site result
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
    markSeen();
    const p = store.signIn(name, rec ? (pp) => withSite(pp, rec) : undefined);
    if (p.lang && p.lang !== lang) setLangRaw(p.lang);
    setJustNamed(true);
    setNameDialog(null);
  };
  const closeName = () => { if (nameDialog?.welcome) markSeen(); setNameDialog(null); };
  const openSaved = (s: SavedSite) => navigate({ tab: 'site', lat: Number(s.lat.toFixed(5)), lng: Number(s.lng.toFixed(5)) });
  const removeSaved = (s: SavedSite) => {
    const i = profile.sites.findIndex((x) => x.id === s.id);
    if (i < 0) return;
    setUndo({ key: profile.key, removed: s, index: i });
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
  const addName = () => setNameDialog({ title: t('user.add'), pendingSave: false });

  const siteIsOpen = siteOpen && !!site.pin;
  const sitePrev = useRef({ open: false, ev: false });
  useEffect(() => {
    if (!isSite) return;
    const was = sitePrev.current;
    const q = (sel: string) => document.querySelector<HTMLElement>(sel);
    if (siteIsOpen && !was.open) { if (!isExample) siteHeadingRef.current?.focus(); }
    else if (!siteIsOpen && was.open) q('[data-use-centre]')?.focus();
    else if (siteIsOpen && evOpen !== was.ev) { if (evOpen) siteHeadingRef.current?.focus(); else q('[data-evidence-open]')?.focus(); }
    sitePrev.current = { open: siteIsOpen, ev: evOpen };
  }, [siteIsOpen, evOpen, isSite, isExample]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return;
      if (popOpen) { setPopOpen(false); requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-display-toggle]')?.focus()); return; }
      if (isSite && siteIsOpen) { if (evOpen) setEvOpen(false); else setSiteOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const useCentre = () => { const c = centerRef.current?.(); if (c) dropPin(c.lat, c.lng); };
  const nisarCode = site.res.s === 'ok' && site.pin ? districtAtPoint(data.geo, site.pin.lat, site.pin.lng) : null;
  const nisarDistrict = nisarCode ? data.districts.find((d) => d.dcode === nisarCode) ?? null : null;
  const resultAreaId = site.res.s === 'ok' ? site.res.suit.areaId : null;
  const resultYears = histYears((site.areas ?? []).filter((a) => a.id === resultAreaId)) ?? histYears(site.areas);
  const sheetOverlay = !wide;
  const padding = { top: phone ? 24 : 48, left: phone ? 16 : 48, right: phone ? 16 : 48, bottom: sheetOverlay && isSite && siteIsOpen ? Math.round((typeof document === 'undefined' ? 400 : document.querySelector('.map-panel')?.clientHeight ?? 400) * 0.45) + 16 : 48 };

  const siteProps: SiteProps | null = isSite ? { areas: site.areas ?? [], pin: site.pin, fly: flyBox, centerRef, goLabel: t('site.go'), pinLabel: t('site.pin'), onPick: dropPin, onFly: goArea } : null;
  const focusDistrict = isGround && route.focus && data.districts.some((d) => d.dcode === route.focus) ? route.focus : null;

  const coverageAlert = (
    <div className="alert-err" role="alert">
      <p><Warn />{t('state.error')}</p>
      <button type="button" className="btn" onClick={site.retryAreas}>{t('retry')}</button>
    </div>
  );

  const trackOptions = allTracks.map((k) => { const p = parseTrack(k); return { value: k, label: `${p ? t(p.dir === 'A' ? 'track.A' : 'track.D', { n: p.n }) : k} · ${t('track.cov', { k: coverage[k] ?? 0, n: data.districts.length })}`, disabled: !availableTracks.has(k) }; });
  const missing = data.districts.filter((d) => !d.los.some((x) => x.track === track && x.mean != null));
  const popWrap = (content: React.ReactNode) => (
    <div className="pop-wrap">
      <button type="button" className="btn" data-display-toggle aria-expanded={popOpen} aria-controls={popId} onClick={() => setPopOpen((v) => !v)}>
        <span>{t('display')}</span><Chevron open={popOpen} />
      </button>
      {popOpen && <div id={popId} className="popover2 glass">{content}</div>}
    </div>
  );
  const groundDisplay = (
    <div className="display-body">
      <div className="field">
        <label className="field-label" htmlFor={`${popId}-op`}>{t('opacity')} <span className="mono">{opacity}%</span></label>
        <input id={`${popId}-op`} className="range" type="range" min={20} max={100} step={5} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
      </div>
      <div className="field">
        <span className="field-label">{t('mapview')}</span>
        <Segmented label={t('mapview')} value={mapView} onChange={(m) => { setMapView(m); setPlaying(false); }}
          options={[{ value: 'radar', label: t('mapview.radar') }, { value: 'districts', label: t('mapview.districts') }]} />
      </div>
    </div>
  );
  const siteDisplay = (
    <div className="display-body">
      <label className="switch"><input type="checkbox" role="switch" checked={overlayOn} onChange={(e) => setOverlayOn(e.target.checked)} /><span>{t('site.overlay')}</span></label>
      <p className="comp-sub">{t('site.overlay.note')}</p>
    </div>
  );
  const layerOptions = [{ value: 'gunw' as LayerType, label: t('layer.los'), disabled: !has.gunw }, { value: 'water' as LayerType, label: t('layer.water'), disabled: !has.water }];

  const titleKey: Record<Tab, Key> = { overview: 'nav.overview', site: 'mode.site', ground: 'mode.ground', districts: 'nav.districts', shortlist: 'nav.shortlist' };
  const descKey: Record<Tab, Key> = { overview: 'desc.overview', site: 'start.site', ground: 'start.ground', districts: 'desc.districts', shortlist: 'desc.shortlist' };
  const badge = isSite ? <span className="badge demo"><Warn />{t('badge.prov')}</span> : (isGround || tab === 'districts') && data.isNisar != null ? <Badge nisar={data.isNisar} /> : null;
  const greeting = justNamed && profile.key ? t('hello', { name: profile.name }) : profile.key ? t('welcome', { name: profile.name }) : t('ov.guest');

  const userMenu = (
    <UserMenu profile={profile} canMySites={sitingEnabled} onMySites={() => navigate({ tab: 'shortlist' })} onAbout={() => setAboutOpen(true)}
      onSwitch={() => setNameDialog({ title: t('user.switch'), pendingSave: false })} onAdd={addName} onSignOut={() => setSignOutOpen(true)} />
  );

  const sitePanelBody = evOpen ? (
    site.ev.s === 'ok' ? <SiteEvidence ev={site.ev.data} landcover={site.res.s === 'ok' ? site.res.suit.landcover : null} onBack={() => setEvOpen(false)} />
      : <div><button type="button" className="btn back" onClick={() => setEvOpen(false)}>{t('back')}</button><p className="comp-sub">{site.ev.s === 'error' ? t('state.error') : t('loading')}</p></div>
  ) : (
    <SiteResult res={site.res} ev={site.ev} onEvidence={() => setEvOpen(true)} onRetry={() => site.pin && site.check(site.pin)} onGo={goArea} saved={record() ? saved : null} onSave={record() ? onSave : null}
      example={isExample} nisar={site.res.s === 'ok' ? nisarDistrict ? { district: nisarDistrict, tracks: allTracks, track, waterAvailable } : 'outside' : null} years={resultYears} />
  );

  const mapPage = (
    <section className="mappage" hidden={!(isSite || isGround)} aria-label={t(titleKey[tab])}>
      <div className="toolbar-row" role="toolbar" aria-label={t('display')}>
        {isSite ? (
          <>
            <div className="chips-scroll">
              {site.areasError ? coverageAlert : site.areas == null ? <span className="comp-sub">{t('site.loadingAreas')}</span>
                : site.areas.map((a) => <button key={a.id} type="button" className="btn chip-btn" onClick={() => goArea(a)} title={t('site.go')}>{a.name}</button>)}
            </div>
            <button type="button" className="btn" data-use-centre disabled={!site.areas} onClick={useCentre}>{t('site.center')}</button>
            {popWrap(siteDisplay)}
          </>
        ) : (
          <>
            <Segmented label={t('layer.label')} options={layerOptions} value={type} onChange={changeType} disabled={!radar} />
            <Segmented label={t('track.label')} options={trackOptions} value={track} onChange={changeTrack} />
            {popWrap(groundDisplay)}
          </>
        )}
      </div>
      <div className="map-row">
        <div className="map-panel">
          {mapShown && (
            <MapView layers={data.layers} current={isSite ? (overlayOn ? latestLos : null) : radar ? current : null} opacity={isSite ? 60 : opacity} mode={isSite ? 'radar' : mapView}
              geo={data.geo} districts={data.districts} selected={focusDistrict} flyKey={flyKey} padding={padding} onSelect={pickGround} onOverlayError={() => setToast(true)} label={t('map.label')} site={siteProps} />
          )}
          {isSite && <div className="crosshair" role="img" aria-label={t('site.crosshair')} />}
          {isSite && overlayOn && <div className="map-legend glass"><Legend mode="radar" type="gunw" layer={latestLos} rangeMm={data.rangeMm} isNisar={data.isNisar} /></div>}
          {site.areas && isSite && !site.pin && <p className="map-hint glass">{t('site.hint')}</p>}
        </div>
        {isSite && siteIsOpen && (
          <aside className={`dock-col site-col${evOpen ? ' ev' : ''}`} aria-label={t('card.title')}>
            <div className="dock-head">
              <h2 ref={siteHeadingRef} tabIndex={-1}>{t(evOpen ? 'ev.title' : 'card.title')}</h2>
              <button type="button" className="btn" onClick={() => setSiteOpen(false)}>{t('about.close')}</button>
            </div>
            <div className="dock-body">{sitePanelBody}</div>
          </aside>
        )}
      </div>
      {isGround && (
        <div className="ground-bar">
          <div className="gb-scrub">
            {!radar && <p className="loading-chip">{t('view.radarOnly')}</p>}
            {loadingUrl && curUrl === loadingUrl && <p className="loading-chip" role="status">{t('overlay.loading')}</p>}
            <Scrubber dates={dates} secDates={secDates} index={index} onIndex={(i) => setDate(dates[i])} playing={playing} onPlaying={setPlaying} disabled={!radar} />
          </div>
          <div className="gb-legend"><Legend mode={mapView} type={type} layer={current} rangeMm={data.rangeMm} isNisar={data.isNisar} />{missing.length > 0 && data.districts.length > 0 && <p className="track-note">{t('track.missing', { n: missing.length, names: missing.map((d) => (lang === 'en' ? d.nameEn : d.nameTh)).join(', ') })}</p>}</div>
        </div>
      )}
    </section>
  );

  const profileNode = detail ? (
    <DistrictDetail d={detail} rank={ranked.indexOf(detail.dcode) + 1} rankOf={ranked.length} tracks={allTracks} track={track} onTrack={changeTrack} waterAvailable={waterAvailable}
      secDateOf={secDateOf} trackSpan={trackSpan} onBack={closeDistrict} backOnly={!wide || phone} onCheck={sitingEnabled && canCheckHere(detail.dcode) ? () => checkHere(detail.dcode) : null} />
  ) : null;

  return (
    <>
      <Shell tab={tab} onNav={(k) => { if (k !== tab) navigate({ tab: k }); }} title={t(titleKey[tab])} descriptor={t(descKey[tab])} badge={badge} lang={lang} onLang={onLang} userMenu={userMenu} onAbout={() => setAboutOpen(true)}>
        {mapPage}
        {tab === 'overview' && (
          <OverviewPage data={data} areas={site.areas} areasError={site.areasError} sites={profile.sites} greeting={greeting}
            onSite={() => navigate({ tab: 'site' })} onGround={() => navigate({ tab: 'ground' })} onShortlist={() => navigate({ tab: 'shortlist' })} onDistrict={openDistrict} onDistricts={() => navigate({ tab: 'districts' })} />
        )}
        {tab === 'districts' && <DistrictsPage data={data} tracks={allTracks} selected={validD} onOpen={openDistrict} onClose={closeDistrict} profile={profileNode} showClose={wide && !phone} />}
        {tab === 'shortlist' && <ShortlistPage sites={profile.sites} guest={!profile.key} onOpen={openSaved} onRemove={removeSaved} onAdd={addName} onSite={() => navigate({ tab: 'site' })} />}
        {toast && <div className="toast" role="status">{t('overlay.fail')}</div>}
      </Shell>
      <NameDialog open={nameDialog != null} title={nameDialog?.welcome ? t('title') : nameDialog?.title ?? ''} onName={submitName} onClose={closeName} />
      <SignOutDialog open={signOutOpen} name={profile.name} onConfirm={() => { store.signOut(); setSignOutOpen(false); }} onCancel={() => setSignOutOpen(false)} />
      {undo && <UndoToast key={undo.removed.id} onUndo={doUndo} onExpire={() => setUndo(null)} />}
      <AboutDialog open={aboutOpen} span={data.gunwSpan} years={histYears(site.areas)} onClose={() => setAboutOpen(false)} />
      {phone && null}
    </>
  );
}
