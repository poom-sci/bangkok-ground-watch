'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { codeOf, featureCentre, type CityOutline, type Layer, type District } from '@/lib/data';
import { useLang, useT } from './ui';
import { areaLabel, inBox, type Area, type BBox, type Pin } from '@/lib/siting';

export type MapViewMode = 'radar' | 'districts';

export interface SiteProps {
  areas: Area[];
  pin: Pin | null;
  fly: { bbox?: BBox; center?: [number, number]; zoom?: number; key: number } | null;
  centerRef: { current: (() => Pin) | null };
  goLabel: string;
  pinLabel: string;
  onPick: (lat: number, lng: number) => void;
  onFly: (a: Area) => void;
}

interface Props {
  layers: Layer[];
  current: Layer | null;
  opacity: number;
  mode: MapViewMode;
  geo: FeatureCollection | null;
  districts: District[];
  selected: string | null;
  flyKey: number;
  padding: { top: number; right: number; bottom: number; left: number };
  onSelect: (dcode: string) => void;
  onOverlayError: () => void;
  label: string;
  site: SiteProps | null;
  fitKey?: number;
  base: 'esri' | 's2' | 'map';
  labels?: boolean;
  marker?: { lat: number; lng: number } | null;
  lang?: 'en' | 'th';
  extra?: { layer: Layer; opacity: number }[];
  onMove?: (lng: number, lat: number, zoom: number) => void;
  city?: CityOutline | null;
  cityMask?: boolean;
  districtLines?: boolean;
}

maplibregl.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hatchImage(line: string, face: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 6;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = face;
  g.fillRect(0, 0, 6, 6);
  g.strokeStyle = line;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, 6); g.lineTo(6, 0);
  g.moveTo(-1, 1); g.lineTo(1, -1);
  g.moveTo(5, 7); g.lineTo(7, 5);
  g.stroke();
  return g.getImageData(0, 0, 6, 6);
}

function boundsOf(f: Feature): maplibregl.LngLatBoundsLike | null {
  const b = new maplibregl.LngLatBounds();
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') b.extend([c[0], c[1]]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  if (f.geometry.type !== 'GeometryCollection') walk(f.geometry.coordinates);
  return b.isEmpty() ? null : b;
}

const ESRI_ATTR = 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community';
export const SAT_PAINT = { 'raster-brightness-max': 0.65, 'raster-saturation': -0.35, 'raster-contrast': 0.1 };
const SAT_ATTR = 'Sentinel-2 cloudless by <a href="https://s2maps.eu" target="_blank" rel="noopener noreferrer">EOX IT Services GmbH</a> (contains modified Copernicus Sentinel data 2016)';

export default function MapView(p: Props) {
  const lang = useLang();
  const loadingText = useT()('base.loading');
  const [rdy, setRdy] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const labels = useRef<{ el: HTMLElement; m: maplibregl.Marker; lng: number; lat: number }[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const added = useRef(new Set<string>());
  const hover = useRef<string | null>(null);
  const failed = useRef(new Set<string>());
  const zOrder = useRef(new Map<string, number>());
  const cityKeyRef = useRef('');
  const gMarker = useRef<maplibregl.Marker | null>(null);
  const areaMarkers = useRef<maplibregl.Marker[]>([]);
  const pinMarker = useRef<maplibregl.Marker | null>(null);
  const areaKey = useRef('');
  const lastFly = useRef(0);
  const selPaint = useRef('');
  const sel = useRef<string | null>(null);
  const latest = useRef(p);
  latest.current = p;

  const flyToSelected = () => {
    const map = mapRef.current;
    const cur = latest.current;
    if (!map || !ready.current || !cur.selected || !cur.geo) return;
    const f = cur.geo.features.find((x) => codeOf(x.properties) === cur.selected);
    const b = f && boundsOf(f);
    if (b) map.fitBounds(b, { padding: cur.padding, maxZoom: 12.5, duration: reduceMotion() ? 0 : 600 });
  };

  const fitDistricts = (duration: number): boolean => {
    const map = mapRef.current;
    const cur = latest.current;
    if (!map || !cur.geo || !cur.geo.features.length || cur.site) return false;
    const b = new maplibregl.LngLatBounds();
    cur.geo.features.forEach((f) => { const fb = boundsOf(f); if (fb) b.extend(fb as maplibregl.LngLatBounds); });
    if (b.isEmpty()) return false;
    map.resize();
    map.fitBounds(b, { padding: 24, duration });
    return true;
  };
  const flySite = () => {
    const map = mapRef.current;
    const f = latest.current.site?.fly;
    if (!map || !ready.current || !f || f.key === lastFly.current) return;
    lastFly.current = f.key;
    const duration = reduceMotion() ? 0 : 600;
    if (f.center) map.flyTo({ center: f.center, zoom: f.zoom ?? 13, duration, padding: latest.current.padding });
    else if (f.bbox) map.fitBounds([[f.bbox[0], f.bbox[1]], [f.bbox[2], f.bbox[3]]], { padding: latest.current.padding, duration });
  };

  const sync = () => {
    const map = mapRef.current;
    const cur = latest.current;
    if (!map || !ready.current) return;
    const radar = cur.mode === 'radar';
    const ex = new Map((cur.extra ?? []).map((e) => [e.layer.id, e.opacity]));
    const all = [...cur.layers, ...(cur.extra ?? []).map((e) => e.layer).filter((l) => !cur.layers.some((x) => x.id === l.id))];
    for (const l of all) {
      const wanted = cur.current?.id === l.id || ex.has(l.id);
      if (failed.current.has(l.id)) {
        if (!wanted) failed.current.delete(l.id);
        continue;
      }
      if (!added.current.has(l.id)) {
        if (!wanted) continue;
        added.current.add(l.id);
        zOrder.current.set(l.id, l.z ?? 1);
        let before = 'dist-fill';
        if ((l.z ?? 1) === 0) { const up = [...zOrder.current.entries()].find(([id, z]) => z === 1 && id !== l.id && map.getLayer(id)); if (up) before = up[0]; }
        map.addSource(l.id, { type: 'image', url: l.url, coordinates: l.bounds });
        map.addLayer({ id: l.id, type: 'raster', source: l.id, paint: {
          'raster-opacity': 0, 'raster-opacity-transition': { duration: 200, delay: 0 }, 'raster-fade-duration': 0, 'raster-resampling': 'nearest',
        } }, before);
      }
      const op = cur.current?.id === l.id ? (radar ? cur.opacity / 100 : 0) : radar || cur.site ? ex.get(l.id) ?? 0 : 0;
      map.setPaintProperty(l.id, 'raster-opacity', op);
    }
    const site = cur.site;
    const dv = site ? 'none' : 'visible';
    map.setLayoutProperty('dist-line', 'visibility', site && cur.districtLines ? 'visible' : dv);
    map.setLayoutProperty('dist-casing', 'visibility', dv);
    map.setLayoutProperty('dist-hit', 'visibility', dv);
    const av = site ? 'visible' : 'none';
    map.setLayoutProperty('area-fill', 'visibility', av);
    map.setLayoutProperty('area-line', 'visibility', av); map.setLayoutProperty('area-casing', 'visibility', av);
    map.setLayoutProperty('area-dash', 'visibility', av);
    const city = cur.city ?? null;
    const bk = site?.areas.find((a) => a.id === 'bangkok') ?? null;
    const cityKey = site && city && bk ? `${city.lines.length}|${city.closed}|${bk.bbox.join(',')}` : '';
    if (cityKey !== cityKeyRef.current) {
      cityKeyRef.current = cityKey;
      const cs = map.getSource('city') as maplibregl.GeoJSONSource | undefined;
      cs?.setData({ type: 'FeatureCollection', features: cityKey && city ? city.lines.map((l) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l } })) : [] });
      const ms = map.getSource('citymask') as maplibregl.GeoJSONSource | undefined;
      const b = bk?.bbox;
      ms?.setData({ type: 'FeatureCollection', features: cityKey && city && city.closed && b ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]], ...city.rings] } }] : [] });
    }
    if (map.getLayer('city-line')) { map.setLayoutProperty('city-line', 'visibility', cityKey ? 'visible' : 'none'); map.setLayoutProperty('city-mask', 'visibility', cityKey && cur.cityMask ? 'visible' : 'none'); }
    const key = site ? `${site.areas.map((a) => a.id).join('|')}|${cur.lang ?? ''}` : '';
    if (key !== areaKey.current) {
      areaKey.current = key;
      areaMarkers.current.forEach((m) => m.remove());
      areaMarkers.current = [];
      const src = map.getSource('areas') as maplibregl.GeoJSONSource | undefined;
      src?.setData({ type: 'FeatureCollection', features: (site?.areas ?? []).map((a) => ({
        type: 'Feature', properties: { id: a.id }, geometry: { type: 'Polygon', coordinates: [[[a.bbox[0], a.bbox[1]], [a.bbox[2], a.bbox[1]], [a.bbox[2], a.bbox[3]], [a.bbox[0], a.bbox[3]], [a.bbox[0], a.bbox[1]]]] } })) });
      (site?.areas ?? []).forEach((a) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'area-chip';
        el.textContent = areaLabel(a.id, a.name, latest.current.lang ?? 'en');
        el.setAttribute('aria-label', `${site?.goLabel ?? ''}: ${areaLabel(a.id, a.name, latest.current.lang ?? 'en')}`);
        el.onclick = (e) => { e.stopPropagation(); latest.current.site?.onFly(a); };
        areaMarkers.current.push(new maplibregl.Marker({ element: el, anchor: 'top-left', offset: [8, 8] }).setLngLat([a.bbox[0], a.bbox[3]]).addTo(map));
      });
    }
    if (!site && cur.marker && map) {
      if (!gMarker.current) { const el = document.createElement('div'); el.className = 'pin'; el.setAttribute('role', 'img'); gMarker.current = new maplibregl.Marker({ element: el }).setLngLat([cur.marker.lng, cur.marker.lat]).addTo(map); }
      gMarker.current.setLngLat([cur.marker.lng, cur.marker.lat]);
    } else if (gMarker.current) { gMarker.current.remove(); gMarker.current = null; }
    if (site?.pin) {
      const covered = site.areas.some((a) => inBox(a.bbox, site.pin!.lat, site.pin!.lng));
      if (!pinMarker.current) { const el = document.createElement('div'); el.classList.add('pin'); el.setAttribute('role', 'img'); pinMarker.current = new maplibregl.Marker({ element: el }).setLngLat([site.pin.lng, site.pin.lat]).addTo(map); }
      pinMarker.current.setLngLat([site.pin.lng, site.pin.lat]);
      const pe = pinMarker.current.getElement();
      pe.classList.toggle('hollow', !covered);
      pe.setAttribute('aria-label', site.pinLabel);
    } else if (pinMarker.current) { pinMarker.current.remove(); pinMarker.current = null; }
    if (site) site.centerRef.current = () => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; };
    if (map.getLayer('sat')) {
      map.setLayoutProperty('sat', 'visibility', cur.base === 's2' ? 'visible' : 'none');
      map.setLayoutProperty('esri', 'visibility', cur.base === 'esri' ? 'visible' : 'none');
      const lv = cur.base !== 'map' && cur.labels !== false ? 'visible' : 'none';
      map.setLayoutProperty('esri-places', 'visibility', lv);
      map.setLayoutProperty('esri-trans', 'visibility', lv);
      map.setLayoutProperty('base', 'visibility', cur.base === 'map' ? 'visible' : 'none');
    }
    const vis = radar ? 'none' : 'visible';
    const selColor = radar ? token('--map-sel') : token('--text');
    if (selColor !== selPaint.current && map.getLayer('dist-line')) {
      selPaint.current = selColor;
      map.setPaintProperty('dist-line', 'line-color', ['case', ['boolean', ['feature-state', 'sel'], false], selColor, ['boolean', ['feature-state', 'hover'], false], token('--map-line'), token('--outline')]);
    }
    map.setLayoutProperty('dist-fill', 'visibility', vis);
    map.setLayoutProperty('dist-hatch', 'visibility', vis);
    if (sel.current !== cur.selected) {
      if (sel.current) map.setFeatureState({ source: 'dist', id: sel.current }, { sel: false });
      if (cur.selected) map.setFeatureState({ source: 'dist', id: cur.selected }, { sel: true });
      sel.current = cur.selected;
    }
  };

  useEffect(() => {
    if (!box.current) return;
    const first = latest.current;
    const pts = first.layers.flatMap((l) => l.bounds);
    const map = new maplibregl.Map({
      container: box.current,
      style: {
        version: 8,
        sources: {
          base: { type: 'raster', tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'] },
          esri: { type: 'raster', tileSize: 256, maxzoom: 19, attribution: ESRI_ATTR, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] },
          esriplaces: { type: 'raster', tileSize: 256, maxzoom: 19, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'] },
          esritrans: { type: 'raster', tileSize: 256, maxzoom: 19, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'] },
          sat: { type: 'raster', tileSize: 256, maxzoom: 14, attribution: SAT_ATTR, tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'] },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': token('--bg') } },
          { id: 'esri', type: 'raster', source: 'esri', layout: { visibility: latest.current.base === 'esri' ? 'visible' : 'none' } },
          { id: 'sat', type: 'raster', source: 'sat', layout: { visibility: latest.current.base === 's2' ? 'visible' : 'none' }, paint: SAT_PAINT },
          { id: 'base', type: 'raster', source: 'base', layout: { visibility: latest.current.base === 'map' ? 'visible' : 'none' }, paint: { 'raster-saturation': -1, 'raster-brightness-min': 0.72, 'raster-brightness-max': 0.04, 'raster-contrast': 0.1 } },
        ],
      },
      center: [100.5, 13.75], zoom: 9, maxZoom: 18,
      attributionControl: { compact: window.innerWidth < 768 },
    });
    mapRef.current = map;
    const clampChips = () => {
      areaMarkers.current.forEach((m) => {
        const ll = m.getLngLat();
        const pt = map.project(ll);
        m.setOffset([Math.max(8, 8 - pt.x), Math.max(8, 8 - pt.y)]);
      });
    };
    map.on('move', clampChips);
    const setLoad = () => { const id = latest.current.base === 'esri' ? 'esri' : 'sat'; setImgLoading(latest.current.base !== 'map' && !!map.getSource(id) && !map.isSourceLoaded(id)); };
    map.on('sourcedata', (e) => { const id = (e as { sourceId?: string }).sourceId; if (id === 'sat' || id === 'esri') setLoad(); });
    map.on('idle', () => setImgLoading(false));
    const chipZoom = () => box.current?.classList.toggle('zoomed-out', map.getZoom() < 9);
    map.on('zoom', chipZoom); map.on('load', chipZoom);
    const moved = () => { const c = map.getCenter(); latest.current.onMove?.(c.lng, c.lat, map.getZoom()); };
    map.on('moveend', moved); map.on('load', moved);
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __map?: unknown }).__map = map;
    map.on('error', (e) => {
      const id = (e as { sourceId?: string }).sourceId;
      if (id && /^L\d+$/.test(id)) {
        try {
          if (map.getLayer(id)) map.removeLayer(id);
          if (map.getSource(id)) map.removeSource(id);
        } catch { /* already removed */ }
        added.current.delete(id);
        failed.current.add(id);
        latest.current.onOverlayError();
      }
    });
    map.once('style.load', () => {
      const ramp = ['--ramp-1', '--ramp-2', '--ramp-3', '--ramp-4', '--ramp-5'].map(token);
      const img = hatchImage(token('--hatch'), token('--surface'));
      if (img) map.addImage('hatch', img);
      const geo = latest.current.geo;
      if (geo) {
        const byCode = new Map(latest.current.districts.map((d) => [d.dcode, d.index]));
        const data: FeatureCollection = { ...geo, features: geo.features.map((f) => ({
          ...f, properties: { ...f.properties, idx: byCode.get(codeOf(f.properties)) ?? -1 },
        })) };
        map.addSource('dist', { type: 'geojson', data, promoteId: 'dcode' });
      } else {
        map.addSource('dist', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      map.addLayer({ id: 'dist-fill', type: 'fill', source: 'dist', filter: ['>=', ['get', 'idx'], 0], layout: { visibility: 'none' },
        paint: { 'fill-opacity': Number(token('--ramp-opacity')) || 0.8, 'fill-color': ['step', ['get', 'idx'], ramp[0], 20, ramp[1], 40, ramp[2], 60, ramp[3], 80, ramp[4]] } });
      map.addLayer({ id: 'dist-hatch', type: 'fill', source: 'dist', filter: ['<', ['get', 'idx'], 0], layout: { visibility: 'none' },
        paint: { 'fill-pattern': 'hatch' } });
      map.addSource('city', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('citymask', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'city-mask', type: 'fill', source: 'citymask', layout: { visibility: 'none' }, paint: { 'fill-color': token('--bg'), 'fill-opacity': 0.45 } });
      map.addSource('areas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'area-fill', type: 'fill', source: 'areas', layout: { visibility: 'none' }, paint: { 'fill-color': token('--map-area-fill'), 'fill-opacity': 0 } });
      map.addLayer({ id: 'area-dash', type: 'line', source: 'areas', filter: ['==', ['get', 'id'], 'bangkok'], layout: { visibility: 'none' }, paint: { 'line-color': token('--map-line'), 'line-width': 1, 'line-opacity': 0.45, 'line-dasharray': [3, 3] } });
      map.addLayer({ id: 'area-casing', type: 'line', source: 'areas', filter: ['!=', ['get', 'id'], 'bangkok'], layout: { visibility: 'none' }, paint: { 'line-color': '#000000', 'line-width': 4, 'line-opacity': 0.55, 'line-blur': 1 } });
      map.addLayer({ id: 'area-line', type: 'line', source: 'areas', filter: ['!=', ['get', 'id'], 'bangkok'], layout: { visibility: 'none' }, paint: { 'line-color': token('--map-line'), 'line-width': parseFloat(token('--area-line')) || 1.5, 'line-opacity': 0.8 } });
      map.addLayer({ id: 'city-line', type: 'line', source: 'city', layout: { visibility: 'none' }, paint: { 'line-color': token('--map-line'), 'line-width': 2 } });
      map.addLayer({ id: 'esri-places', type: 'raster', source: 'esriplaces', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.95 } });
      map.addLayer({ id: 'esri-trans', type: 'raster', source: 'esritrans', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.8 } });
      map.on('click', (e) => { const s = latest.current.site; if (s) s.onPick(e.lngLat.lat, e.lngLat.lng); });
      map.addLayer({ id: 'dist-hit', type: 'fill', source: 'dist', paint: { 'fill-color': 'rgba(0,0,0,0)' } });
      map.addLayer({ id: 'dist-casing', type: 'line', source: 'dist', paint: {
        'line-color': token('--map-casing'), 'line-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 1, 0.55], 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 6, 3.4],
      } });
      map.addLayer({ id: 'dist-line', type: 'line', source: 'dist', paint: {
        'line-color': ['case', ['boolean', ['feature-state', 'sel'], false], token('--map-sel'), ['boolean', ['feature-state', 'hover'], false], token('--map-line'), token('--outline')],
        'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, ['boolean', ['feature-state', 'hover'], false], 2, 1.5],
      } });
      map.on('click', 'dist-hit', (e) => {
        const code = codeOf(e.features?.[0]?.properties);
        if (code) latest.current.onSelect(code);
      });
      map.on('mousemove', 'dist-hit', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const next = codeOf(e.features?.[0]?.properties) || null;
        if (next === hover.current) return;
        if (hover.current) map.setFeatureState({ source: 'dist', id: hover.current }, { hover: false });
        if (next) map.setFeatureState({ source: 'dist', id: next }, { hover: true });
        hover.current = next;
      });
      map.on('mouseleave', 'dist-hit', () => {
        map.getCanvas().style.cursor = '';
        if (hover.current) map.setFeatureState({ source: 'dist', id: hover.current }, { hover: false });
        hover.current = null;
      });
      ready.current = true;
      setRdy(true);
      queueMicrotask(() => { if (latest.current.selected && latest.current.flyKey > 0) flyToSelected(); flySite(); });
      if (!fitDistricts(0) && pts.length) {
        const b = new maplibregl.LngLatBounds(pts[0], pts[0]);
        pts.forEach((q) => b.extend(q));
        map.fitBounds(b, { padding: first.padding, duration: 0 });
      }
      sync();
    });
    return () => { ro.disconnect(); areaMarkers.current.forEach((m) => m.remove()); areaMarkers.current = []; areaKey.current = ''; pinMarker.current?.remove(); pinMarker.current = null; ready.current = false; selPaint.current = ''; added.current.clear(); failed.current.clear(); zOrder.current.clear(); sel.current = null; hover.current = null; map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { sync(); });

  // district name labels for the satellite base (HTML markers, simple collision hiding)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    labels.current.forEach((l) => l.m.remove());
    labels.current = [];
    if (p.base !== 's2' || !p.geo || p.site) return;
    p.districts.forEach((d) => {
      const c = featureCentre(p.geo, d.dcode);
      if (!c) return;
      const el = document.createElement('span');
      el.className = 'dlabel';
      el.textContent = lang === 'en' ? d.nameEn : d.nameTh;
      el.style.display = 'none';
      const m = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([c.lng, c.lat]).addTo(map);
      labels.current.push({ el, m, lng: c.lng, lat: c.lat });
    });
    const place = () => {
      const show = map.getZoom() >= 10.5;
      const boxes: DOMRect[] = [];
      labels.current.forEach((l) => {
        if (!show) { l.el.style.display = 'none'; return; }
        l.el.style.display = '';
        const r = l.el.getBoundingClientRect();
        const clash = boxes.some((b) => !(r.right < b.left || r.left > b.right || r.bottom < b.top || r.top > b.bottom));
        if (clash) l.el.style.display = 'none'; else boxes.push(r);
      });
    };
    place();
    map.on('moveend', place); map.on('zoomend', place);
    return () => { map.off('moveend', place); map.off('zoomend', place); labels.current.forEach((l) => l.m.remove()); labels.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.base, p.geo, p.districts, p.site === null, lang, rdy]);

  useEffect(() => { if (p.fitKey) fitDistricts(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.fitKey]);

  useEffect(() => { flySite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.site?.fly?.key]);

  useEffect(() => { if (p.flyKey !== 0) flyToSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.flyKey]);

  return (
    <>
      <div ref={box} className="map" role="region" aria-label={p.label} />
      {imgLoading && p.base !== 'map' && <p className="base-loading" role="status">{loadingText}</p>}
    </>
  );
}
