'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { codeOf, type Layer, type District } from '@/lib/data';
import { inBox, type Area, type BBox, type Pin } from '@/lib/siting';

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

export default function MapView(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const added = useRef(new Set<string>());
  const hover = useRef<string | null>(null);
  const failed = useRef(new Set<string>());
  const areaMarkers = useRef<maplibregl.Marker[]>([]);
  const pinMarker = useRef<maplibregl.Marker | null>(null);
  const areaKey = useRef('');
  const lastFly = useRef(0);
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

  const flySite = () => {
    const map = mapRef.current;
    const f = latest.current.site?.fly;
    if (!map || !ready.current || !f || f.key === lastFly.current) return;
    lastFly.current = f.key;
    const duration = reduceMotion() ? 0 : 600;
    if (f.center) map.flyTo({ center: f.center, zoom: f.zoom ?? 13, duration });
    else if (f.bbox) map.fitBounds([[f.bbox[0], f.bbox[1]], [f.bbox[2], f.bbox[3]]], { padding: 48, duration });
  };

  const sync = () => {
    const map = mapRef.current;
    const cur = latest.current;
    if (!map || !ready.current) return;
    const radar = cur.mode === 'radar';
    for (const l of cur.layers) {
      if (failed.current.has(l.id)) {
        if (cur.current?.id !== l.id) failed.current.delete(l.id);
        continue;
      }
      if (!added.current.has(l.id)) {
        if (cur.current?.id !== l.id) continue;
        added.current.add(l.id);
        map.addSource(l.id, { type: 'image', url: l.url, coordinates: l.bounds });
        map.addLayer({ id: l.id, type: 'raster', source: l.id, paint: {
          'raster-opacity': 0, 'raster-opacity-transition': { duration: 200, delay: 0 }, 'raster-fade-duration': 0, 'raster-resampling': 'nearest',
        } }, 'dist-fill');
      }
      map.setPaintProperty(l.id, 'raster-opacity', radar && cur.current?.id === l.id ? cur.opacity / 100 : 0);
    }
    const site = cur.site;
    const dv = site ? 'none' : 'visible';
    map.setLayoutProperty('dist-line', 'visibility', dv);
    map.setLayoutProperty('dist-hit', 'visibility', dv);
    const av = site ? 'visible' : 'none';
    map.setLayoutProperty('area-fill', 'visibility', av);
    map.setLayoutProperty('area-line', 'visibility', av);
    const key = site ? site.areas.map((a) => a.id).join('|') : '';
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
        el.textContent = a.name;
        el.setAttribute('aria-label', `${site?.goLabel ?? ''}: ${a.name}`);
        el.onclick = (e) => { e.stopPropagation(); latest.current.site?.onFly(a); };
        areaMarkers.current.push(new maplibregl.Marker({ element: el, anchor: 'top-left', offset: [8, 8] }).setLngLat([a.bbox[0], a.bbox[3]]).addTo(map));
      });
    }
    if (site?.pin) {
      const covered = site.areas.some((a) => inBox(a.bbox, site.pin!.lat, site.pin!.lng));
      if (!pinMarker.current) { const el = document.createElement('div'); el.classList.add('pin'); el.setAttribute('role', 'img'); pinMarker.current = new maplibregl.Marker({ element: el }).setLngLat([site.pin.lng, site.pin.lat]).addTo(map); }
      pinMarker.current.setLngLat([site.pin.lng, site.pin.lat]);
      const pe = pinMarker.current.getElement();
      pe.classList.toggle('hollow', !covered);
      pe.setAttribute('aria-label', site.pinLabel);
    } else if (pinMarker.current) { pinMarker.current.remove(); pinMarker.current = null; }
    if (site) site.centerRef.current = () => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; };
    const vis = radar ? 'none' : 'visible';
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
        sources: { base: { type: 'raster', tileSize: 256, maxzoom: 19,
          attribution: '© OpenStreetMap contributors',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'] } },
        layers: [{ id: 'base', type: 'raster', source: 'base', paint: { 'raster-saturation': -0.85, 'raster-brightness-min': 0.3, 'raster-contrast': -0.2 } }],
      },
      center: [100.5, 13.75], zoom: 9,
      attributionControl: { compact: false },
    });
    mapRef.current = map;
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
      const accent = token('--accent');
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
      map.addSource('areas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'area-fill', type: 'fill', source: 'areas', layout: { visibility: 'none' }, paint: { 'fill-color': accent, 'fill-opacity': Number(token('--area-fill-a')) || 0.1 } });
      map.addLayer({ id: 'area-line', type: 'line', source: 'areas', layout: { visibility: 'none' }, paint: { 'line-color': accent, 'line-width': parseFloat(token('--area-line')) || 2 } });
      map.on('click', (e) => { const s = latest.current.site; if (s) s.onPick(e.lngLat.lat, e.lngLat.lng); });
      map.addLayer({ id: 'dist-hit', type: 'fill', source: 'dist', paint: { 'fill-color': 'rgba(0,0,0,0)' } });
      map.addLayer({ id: 'dist-line', type: 'line', source: 'dist', paint: {
        'line-color': ['case', ['boolean', ['feature-state', 'sel'], false], accent, ['boolean', ['feature-state', 'hover'], false], accent, token('--outline')],
        'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, ['boolean', ['feature-state', 'hover'], false], 2, 1],
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
      queueMicrotask(() => { if (latest.current.selected && latest.current.flyKey > 0) flyToSelected(); flySite(); });
      if (pts.length) {
        const b = new maplibregl.LngLatBounds(pts[0], pts[0]);
        pts.forEach((q) => b.extend(q));
        map.fitBounds(b, { padding: first.padding, duration: 0 });
      }
      sync();
    });
    return () => { areaMarkers.current.forEach((m) => m.remove()); areaMarkers.current = []; areaKey.current = ''; pinMarker.current?.remove(); pinMarker.current = null; ready.current = false; added.current.clear(); failed.current.clear(); sel.current = null; hover.current = null; map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { sync(); });

  useEffect(() => { flySite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.site?.fly?.key]);

  useEffect(() => { if (p.flyKey !== 0) flyToSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.flyKey]);

  return <div ref={box} className="map" role="region" aria-label={p.label} />;
}
