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
import { areaLabel, inBox, sitingEnabled, useSite, type Area, type BBox, type Pin } from '@/lib/siting';
import { cityOutline, parseTrack, districtAtPoint, featureCentre, sortedUnique, type Dataset, type LayerType } from '@/lib/data';
import { useRoute, type Tab } from '@/lib/route';
import Scrubber from './Scrubber';
import Legend from './Legend';
import DistrictDetail from './DistrictDetail';
import AboutDialog from './AboutDialog';
import { FusionCard, FusionLegend, WaterByCover } from './FusionParts';
import ScoreLegend, { useExclText } from './ScoreLegend';
import { ConfLegend } from './ConfidenceParts';
import SearchBox, { type Place } from './SearchBox';
import { useLookupSampler } from '@/lib/lookup';
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
  const [sheetFull, setSheetFull] = useState(false);
  const [fusionOn, setFusionOn] = useState(false);
  const [siteLayer, setSiteLayerRaw] = useState<'score' | 'conf' | 'none'>(route.layer === 'confidence' ? 'conf' : 'none');
  useEffect(() => { try { const v = localStorage.getItem('bgw-sitelayer2'); if (route.layer !== 'confidence' && (v === 'score' || v === 'conf' || v === 'none')) setSiteLayerRaw(v); } catch { /* storage unavailable */ } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setSiteLayer = (v: 'score' | 'conf' | 'none') => { setSiteLayerRaw(v); try { localStorage.setItem('bgw-sitelayer2', v); } catch { /* storage unavailable */ } };
  const [ovOn, setOvOn] = useState(true);
  const [labelsOn, setLabelsOn] = useState(true);
  const [place, setPlace] = useState<Place | null>(null);
  const [viewZoom, setViewZoom] = useState(9);
  const scoreOn = siteLayer === 'score';
  const confOn = siteLayer === 'conf' && !!data.confidence;
  useEffect(() => { if (route.layer === 'confidence') setSiteLayer('conf'); }, [route.layer]);
  const lookupS = useLookupSampler(data.lookup);
  const [scoreOp, setScoreOp] = useState(100);
  const [viewCenter, setViewCenter] = useState<[number, number] | null>(null);
  const excl = useExclText();
  const [base, setBaseState] = useState<'esri' | 's2' | 'map'>('esri');
  useEffect(() => { try { const v = localStorage.getItem('bgw-base2'); if (v === 'esri' || v === 's2' || v === 'map') setBaseState(v); const lb = localStorage.getItem('bgw-labels'); if (lb === '0') setLabelsOn(false); } catch { /* storage unavailable */ } }, []);
  const setBase = (b: 'esri' | 's2' | 'map') => { setBaseState(b); try { localStorage.setItem('bgw-base2', b); } catch { /* storage unavailable */ } };
  const setLabels = (v: boolean) => { setLabelsOn(v); try { localStorage.setItem('bgw-labels', v ? '1' : '0'); } catch { /* storage unavailable */ } };
  const [opacity, setOpacity] = useState(60);
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
  useEffect(() => () => { handled.current = ''; exampleDone.current = false; }, []);

  useEffect(() => { if (profile.lang && profile.lang !== lang) setLangRaw(profile.lang); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setUndo(null); }, [profile.key]);
  const [fitKey, setFitKey] = useState(0);
  useEffect(() => { if (isSite || isGround) setMapShown(true); }, [isSite, isGround]);
  useEffect(() => { if (isGround && !route.focus && mapShown) setFitKey((k) => k + 1); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGround]);
  useEffect(() => { setPopOpen(false); setPlaying(false); }, [tab]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(false), 4000); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { if (!aboutOpen && route.about) rewrite({ about: false }); }, [aboutOpen, route.about, rewrite]);
  useEffect(() => { if (route.focus && isGround) setFlyKey((k) => k + 1); }, [route.focus, isGround]);

  const latestLos = useMemo(() => data.layers.filter((l) => l.type === 'gunw').sort((a, b) => (a.date < b.date ? -1 : 1)).pop() ?? null, [data.layers]);
  const cityRaw = useMemo(() => cityOutline(data.geo), [data.geo]);
  // Districts come from a simplified file whose shared borders do not match vertex for vertex, so the union
  // boundary is only used when it closes into a few clean rings; otherwise every district outline is drawn.
  const cityReliable = !!cityRaw && cityRaw.closed && cityRaw.rings.length <= 3;
  const city = cityRaw;
  const goArea = useCallback((a: Area) => { site.clear(); setIsExample(false); setSiteOpen(false); setEvOpen(false); setFlyBox({ bbox: a.id === 'bangkok' && city ? city.bbox : a.bbox, key: Date.now() }); }, [city, site.clear]);
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
  const curUrl = radar && isGround && !fusionOn ? current?.url ?? null : null;
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
  const [fromMap, setFromMap] = useState<string | null>(null);
  const openDistrict = (code: string) => { setFromMap(null); navigate({ tab: 'districts', d: code }); };
  const closeDistrict = () => navigate({ tab: 'districts' }, true);
  const pickGround = (code: string) => { setFromMap(code); rewrite({ focus: code }); navigate({ tab: 'districts', d: code }); };
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
    return { id: siteId(site.pin.lat, site.pin.lng), lat: site.pin.lat, lng: site.pin.lng, areaId: su.areaId, areaName: su.areaName, score: Math.round(su.score), grade: su.flags.includes('urban_flooding_not_detected') ? null : su.grade, urban: su.flags.includes('urban_flooding_not_detected'), savedAt: new Date().toISOString() };
  };
  const onSave = () => {
    const rec = record();
    if (!rec) return;
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

  const onPlace = (p: Place) => {
    setPlace(p);
    setFlyBox({ center: [p.lng, p.lat], zoom: 17, key: Date.now() });
    if (isSite) dropPin(p.lat, p.lng);
  };
  const placeCode = place && data.geo ? districtAtPoint(data.geo, place.lat, place.lng) : null;
  const placeDistrict = placeCode ? data.districts.find((d) => d.dcode === placeCode) ?? null : null;
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
  const pairCover = type === 'gunw' && date && data.districts.length ? t('pair.cover', { n: data.districts.filter((d) => d.los.some((x) => x.track === track && x.date === date && x.mean != null)).length, m: data.districts.length }) : null;
  const missing = data.districts.filter((d) => !d.los.some((x) => x.track === track && x.mean != null));
  const popWrap = (content: React.ReactNode) => (
    <div className="pop-wrap">
      <button type="button" className="btn" data-display-toggle aria-expanded={popOpen} aria-controls={popId} onClick={() => setPopOpen((v) => !v)}>
        <span>{t('display')}</span><Chevron open={popOpen} />
      </button>
      {popOpen && <div id={popId} className="popover2 glass">{content}</div>}
    </div>
  );
  const baseControl = (
    <div className="field">
      <span className="field-label">{t('base.label')}</span>
      <Segmented label={t('base.label')} value={base} onChange={setBase} options={[{ value: 'esri', label: t('base.esri') }, { value: 's2', label: t('base.s2') }, { value: 'map', label: t('base.map') }]} />
      {base !== 'map' && <label className="switch"><input type="checkbox" role="switch" checked={labelsOn} onChange={(e) => setLabels(e.target.checked)} /><span>{t('base.labels')}</span></label>}
    </div>
  );
  const groundDisplay = (
    <div className="display-body">
      <div className="field">
        <label className="field-label" htmlFor={`${popId}-op`}>{t('opacity')} <span className="mono">{opacity}%</span></label>
        <input id={`${popId}-op`} className="range" type="range" min={20} max={100} step={5} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
      </div>
      {baseControl}
      <div className="field">
        <span className="field-label">{t('mapview')}</span>
        <Segmented label={t('mapview')} value={mapView} disabled={fusionOn && !!data.fusion} onChange={(m) => { setMapView(m); setPlaying(false); }}
          options={[{ value: 'radar', label: t('mapview.radar') }, { value: 'districts', label: t('mapview.districts') }]} />
      </div>
    </div>
  );
  const siteDisplay = (
    <div className="display-body">
      {baseControl}
      {data.scoreMaps && (
        <>
          <div className="field"><label className="field-label" htmlFor={`${popId}-so`}>{t('score.opacity')} <span className="mono">{scoreOp}%</span></label><input id={`${popId}-so`} className="range" type="range" min={30} max={100} step={5} value={scoreOp} onChange={(e) => setScoreOp(Number(e.target.value))} /></div>
        </>
      )}
      <label className="switch"><input type="checkbox" role="switch" checked={overlayOn} onChange={(e) => setOverlayOn(e.target.checked)} /><span>{t('site.overlay')}</span></label>
      <p className="comp-sub">{t('site.overlay.note')}</p>
    </div>
  );
  type LayerChoice = LayerType | 'fusion';
  const layerOptions: { value: LayerChoice; label: string; disabled: boolean }[] = [{ value: 'gunw', label: t('layer.los'), disabled: !has.gunw }, { value: 'water', label: t('layer.water'), disabled: !has.water }, ...(data.fusion ? [{ value: 'fusion' as LayerChoice, label: t('layer.fusion'), disabled: false }] : [])];
  const onLayer = (v: LayerChoice) => { if (v === 'fusion') { setFusionOn(true); setMapView('radar'); setPlaying(false); } else { setFusionOn(false); changeType(v); } };
  const showFusion = fusionOn && !!data.fusion;
  const veil = data.scoreMaps?.veil[track] ?? null;
  const extra = [
    ...(isSite && data.confidence ? [{ layer: data.confidence.layer, opacity: confOn ? (scoreOp / 100) * (viewZoom > 15 ? 0.5 : 1) : 0 }] : []),
    ...(isSite && data.scoreMaps ? Object.values(data.scoreMaps.areas).map((a) => ({ layer: a.layer, opacity: scoreOn ? (scoreOp / 100) * (viewZoom > 15 ? 0.5 : 1) : 0 })) : []),
    ...(isGround && !showFusion && type === 'gunw' && veil ? [{ layer: veil.layer, opacity: ovOn ? 1 : 0 }] : []),
  ];
  const viewArea = (() => {
    const areas = site.areas ?? [];
    if (!viewCenter) return areas[0]?.id ?? null;
    const [lng, lat] = viewCenter;
    const inside = areas.find((a) => lng >= a.bbox[0] && lng <= a.bbox[2] && lat >= a.bbox[1] && lat <= a.bbox[3]);
    if (inside) return inside.id;
    const d = (a: Area) => Math.hypot((a.bbox[0] + a.bbox[2]) / 2 - lng, (a.bbox[1] + a.bbox[3]) / 2 - lat);
    return [...areas].sort((a, b) => d(a) - d(b))[0]?.id ?? null;
  })();
  const exclCode = site.res.s === 'ok' && site.res.suit.score == null ? site.res.suit.exclusions[0] ?? null : null;
  const exclMap: Record<string, string> = { permanent_water: 'perm_water', protected_area: 'protected' };
  const exclInfo = (() => {
    if (!exclCode || !data.scoreMaps) return null;
    const cls = exclMap[exclCode] ?? exclCode;
    const e = data.scoreMaps.excluded.find((x) => x.cls === cls);
    return e ? { colour: e.colour, label: excl.label(cls, e.label) } : null;
  })();

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
      example={isExample} exclInfo={exclInfo} radar={{ sample: lookupS.ready && site.pin ? lookupS.sample(site.pin.lat, site.pin.lng) : null, conf: data.confidence, elev: lookupS.ready && site.pin && lookupS.sample(site.pin.lat, site.pin.lng) ? data.elev : null }} nisar={site.res.s === 'ok' ? nisarDistrict ? { district: nisarDistrict, tracks: allTracks, track, waterAvailable, recurrence: data.fusion?.perDistrict[nisarDistrict.dcode]?.recurrence ?? null } : 'outside' : null} years={resultYears} />
  );

  const mapPage = (
    <section className={`mappage${isGround && data.fusion && (showFusion || type === 'water') ? ' has-extras' : ''}`} hidden={!(isSite || isGround)} aria-label={t(titleKey[tab])}>
      <div className="toolbar-row" role="toolbar" aria-label={t('display')}>
        {isSite ? (
          <>
            <div className="chips-scroll">
              {site.areasError ? coverageAlert : site.areas == null ? <span className="comp-sub">{t('site.loadingAreas')}</span>
                : site.areas.map((a) => <button key={a.id} type="button" className="btn chip-btn" onClick={() => goArea(a)} title={t('site.go')}>{areaLabel(a.id, a.name, lang)}</button>)}
            </div>
            <button type="button" className="btn" data-use-centre disabled={!site.areas} onClick={useCentre}>{t('site.center')}</button>
            <SearchBox areas={site.areas ?? []} compact={phone} onPick={onPlace} />
            {popWrap(siteDisplay)}
          </>
        ) : (
          <>
            <Segmented label={t('layer.label')} options={layerOptions} value={showFusion ? 'fusion' : type} onChange={onLayer} disabled={!radar && !showFusion} />
            {!showFusion && <Segmented label={t('track.label')} options={trackOptions} value={track} onChange={changeTrack} />}
            <SearchBox areas={site.areas ?? []} compact={phone} onPick={onPlace} />
            {popWrap(groundDisplay)}
          </>
        )}
      </div>
      <div className="map-row">
        <div className="map-panel">
          {mapShown && (
            <MapView layers={data.fusion ? [...data.layers, data.fusion.layer] : data.layers} current={isSite ? (overlayOn ? latestLos : null) : showFusion ? data.fusion!.layer : radar && ovOn ? current : null} opacity={isSite ? 60 : opacity} mode={isSite ? 'radar' : mapView}
              geo={data.geo} districts={data.districts} selected={focusDistrict} flyKey={flyKey} padding={padding} onSelect={pickGround} onOverlayError={() => setToast(true)} label={t('map.label')} site={siteProps} fitKey={fitKey} base={base} city={isSite && cityReliable ? city : null} cityMask={scoreOn} districtLines={false} lang={lang} extra={extra} onMove={(lng, lat, z) => { setViewCenter([lng, lat]); setViewZoom(z); }} labels={labelsOn} marker={!isSite && place ? { lat: place.lat, lng: place.lng } : null} />
          )}
          {isSite && data.scoreMaps && <div className="map-switch glass"><Segmented label={t('sw.label')} value={siteLayer} onChange={setSiteLayer} options={[{ value: 'none', label: t('sw.imagery') }, { value: 'score', label: t('sw.score') }, ...(data.confidence ? [{ value: 'conf' as const, label: t('sw.conf') }] : [])]} /></div>}
          {isGround && <div className="map-switch glass"><button type="button" className="btn ov-toggle" aria-pressed={ovOn} onClick={() => setOvOn((v) => !v)}>{t('ov.toggle')}: {t(ovOn ? 'ov.on' : 'ov.off')}</button></div>}
          {place && <p className="search-attr">{t('sr.attr')}</p>}
          {isGround && place && placeDistrict && <div className="place-card glass"><p className="dmain">{place.name}</p><button type="button" className="btn" onClick={() => openDistrict(placeDistrict.dcode)}>{t('sr.open', { district: lang === 'en' ? placeDistrict.nameEn : placeDistrict.nameTh })}</button></div>}
          {isSite && <div className="crosshair" role="img" aria-label={t('site.crosshair')} />}
          {isSite && data.confidence && confOn && <ConfLegend conf={data.confidence} />}
          {isSite && data.scoreMaps && scoreOn && <ScoreLegend maps={data.scoreMaps} areaId={viewArea} defaultOpen={!phone} dashed={!!cityRaw} />}
          {isSite && overlayOn && <div className="map-legend glass"><Legend mode="radar" type="gunw" layer={latestLos} rangeMm={data.rangeMm} isNisar={data.isNisar} /></div>}
          {site.areas && isSite && !site.pin && <p className="map-hint glass">{t('site.hint')}</p>}
        </div>
        {isSite && siteIsOpen && (
          <aside className={`dock-col site-col${evOpen ? ' ev' : ''}${sheetFull ? ' full' : ''}`} aria-label={t('card.title')}>
            <button type="button" className="sheet-handle" aria-label={t('sheet.expand')} aria-expanded={sheetFull} onClick={() => setSheetFull((v) => !v)}><span /></button>
            <div className="dock-head">
              <h2 ref={siteHeadingRef} tabIndex={-1}>{t(evOpen ? 'ev.title' : 'card.title')}</h2>
              {!evOpen && site.res.s === 'ok' && site.ev.s !== 'error' && <button type="button" className="btn primary head-ev" onClick={() => setEvOpen(true)}>{t('evidence.open')}</button>}
              <button type="button" className="btn" onClick={() => setSiteOpen(false)}>{t('about.close')}</button>
            </div>
            <div className="dock-body">{sitePanelBody}</div>
          </aside>
        )}
      </div>
      {isGround && showFusion && data.fusion && <div className="ground-bar fusion-bar"><FusionLegend f={data.fusion} /></div>}
      {isGround && !showFusion && (
        <div className="ground-bar">
          <div className="gb-scrub">
            {!radar && <p className="loading-chip">{t('view.radarOnly')}</p>}
            {loadingUrl && curUrl === loadingUrl && <p className="loading-chip" role="status">{t('overlay.loading')}</p>}
            {pairCover && <p className="comp-sub pair-cover">{pairCover}</p>}
            <Scrubber dates={dates} secDates={secDates} index={index} onIndex={(i) => setDate(dates[i])} playing={playing} onPlaying={setPlaying} disabled={!radar} />
          </div>
          <div className="gb-legend"><Legend mode={mapView} type={type} layer={current} rangeMm={data.rangeMm} isNisar={data.isNisar} veil={veil && data.scoreMaps?.veilColour && type === 'gunw' ? { colour: data.scoreMaps.veilColour, pct: veil.pct } : null} />{missing.length > 0 && data.districts.length > 0 && <p className="track-note">{t(missing.length === 1 ? 'track.missing1' : 'track.missing', { n: missing.length, names: missing.map((d) => (lang === 'en' ? d.nameEn : d.nameTh)).join(', ') })}</p>}</div>
        </div>
      )}
      {isGround && data.fusion && (showFusion || type === 'water') && (
        <div className="extras">
          {showFusion ? <FusionCard f={data.fusion} districtCount={data.districts.length} /> : <WaterByCover f={data.fusion} track={track} />}
        </div>
      )}
    </section>
  );

  const profileNode = detail ? (
    <DistrictDetail d={detail} rank={ranked.indexOf(detail.dcode) + 1} rankOf={ranked.length} tracks={allTracks} track={track} onTrack={changeTrack} waterAvailable={waterAvailable}
      secDateOf={secDateOf} trackSpan={trackSpan} onBack={closeDistrict} backOnly={!wide || phone} backGround={fromMap === detail.dcode ? () => navigate({ tab: 'ground', focus: detail.dcode }) : null} onCheck={sitingEnabled && canCheckHere(detail.dcode) ? () => checkHere(detail.dcode) : null} fusion={data.fusion?.perDistrict[detail.dcode] ?? null} />
  ) : null;

  return (
    <>
      <Shell tab={tab} onNav={(k) => { if (k !== tab) navigate({ tab: k }); }} title={t(titleKey[tab])} descriptor={t(descKey[tab])} badge={badge} lang={lang} onLang={onLang} userMenu={userMenu} onAbout={() => setAboutOpen(true)}>
        {mapPage}
        {tab === 'overview' && (
          <OverviewPage onConf={() => navigate({ tab: 'site', layer: 'confidence' })} data={data} areas={site.areas} areasError={site.areasError} sites={profile.sites} greeting={greeting}
            onSite={() => navigate({ tab: 'site' })} onGround={() => navigate({ tab: 'ground' })} onShortlist={() => navigate({ tab: 'shortlist' })} onDistrict={openDistrict} onDistricts={() => navigate({ tab: 'districts' })} />
        )}
        {tab === 'districts' && <DistrictsPage selTrack={track} data={data} tracks={allTracks} selected={validD} onOpen={openDistrict} onClose={closeDistrict} profile={profileNode} showClose={wide && !phone} />}
        {tab === 'shortlist' && <ShortlistPage sites={profile.sites} guest={!profile.key} onOpen={openSaved} onRemove={removeSaved} onAdd={addName} onSite={() => navigate({ tab: 'site' })} />}
        {toast && <div className="toast" role="status">{t('overlay.fail')}</div>}
      </Shell>
      <NameDialog open={nameDialog != null} title={nameDialog?.welcome ? t('title') : nameDialog?.title ?? ''} onName={submitName} onClose={closeName} />
      <SignOutDialog open={signOutOpen} name={profile.name} onConfirm={() => { store.signOut(); setSignOutOpen(false); }} onCancel={() => setSignOutOpen(false)} />
      {undo && <UndoToast key={undo.removed.id} onUndo={doUndo} onExpire={() => setUndo(null)} />}
      <AboutDialog sanity={data.confidence?.sanity ?? null} noise={data.fusion?.noise ?? null} open={aboutOpen} span={data.gunwSpan} years={histYears(site.areas)} onClose={() => setAboutOpen(false)} />
      {phone && null}
    </>
  );
}
