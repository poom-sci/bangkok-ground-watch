'use client';

import { fmtNum, fmtRange, parseTrack, type Dataset } from '@/lib/data';
import { fmtDate } from '@/lib/data';
import { sitingEnabled, type Area } from '@/lib/siting';
import type { SavedSite } from '@/lib/user';
import { NoData, Pending, useLang, useT } from './ui';
import type { Key } from '@/lib/i18n';

function Tile({ label, value, source, state, small }: { label: string; value: string | null; source: Key; state?: 'loading' | 'pending'; small?: boolean }) {
  const t = useT();
  return (
    <div className="kpi" role="group" aria-label={label}>
      <p className="kpi-label">{label}</p>
      {state === 'loading' ? <span className="skel-block kpi-skel" aria-hidden="true" /> : state === 'pending' ? <p className="kpi-val"><Pending /></p>
        : value != null ? <p className={`kpi-val mono${small ? ' small' : ''}`}>{value}</p> : <><p className="kpi-val"><NoData /></p><p className="kpi-src">{t('nodata.src')}</p></>}
      <p className="kpi-src">{t('src', { s: t(source) })}</p>
    </div>
  );
}

function OverviewMap({ data }: { data: Dataset }) {
  const t = useT();
  const layer = data.layers.filter((l) => l.type === 'gunw').sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
  const feats = data.geo?.features ?? [];
  if (!layer || !feats.length) return null;
  const rings: number[][][] = [];
  const walk = (g: { type: string; coordinates?: unknown }) => {
    const c = g.coordinates as number[][][] | number[][][][];
    if (g.type === 'Polygon') (c as number[][][]).forEach((r) => rings.push(r));
    else if (g.type === 'MultiPolygon') (c as number[][][][]).forEach((p) => p.forEach((r) => rings.push(r)));
  };
  feats.forEach((f) => { if (f.geometry.type !== 'GeometryCollection') walk(f.geometry); });
  const xs = rings.flat().map((p) => p[0]), ys = rings.flat().map((p) => p[1]);
  if (!xs.length) return null;
  const w0 = Math.min(...xs), e0 = Math.max(...xs), s0 = Math.min(...ys), n0 = Math.max(...ys);
  const k = Math.cos(((s0 + n0) / 2) * Math.PI / 180);
  const X = (lng: number) => (lng - w0) * k, Y = (lat: number) => n0 - lat;
  const W = (e0 - w0) * k, H = n0 - s0;
  const lx = layer.bounds.map((p) => p[0]), ly = layer.bounds.map((p) => p[1]);
  const path = rings.map((r) => `M${r.map((p) => `${X(p[0]).toFixed(4)},${Y(p[1]).toFixed(4)}`).join('L')}Z`).join('');
  return (
    <figure className="ov-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('ov.img.alt')} preserveAspectRatio="xMidYMid meet">
        <rect width={W} height={H} className="ov-bg" />
        <svg x="0" y="0" width={W} height={H} viewBox={`0 0 ${W} ${H}`} overflow="hidden">
          <image href={layer.url} x={X(Math.min(...lx))} y={Y(Math.max(...ly))} width={(Math.max(...lx) - Math.min(...lx)) * k} height={Math.max(...ly) - Math.min(...ly)} preserveAspectRatio="none" style={{ imageRendering: 'pixelated' }} />
        </svg>
        <path d={path} className="ov-out" fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
    </figure>
  );
}

export default function OverviewPage({ data, areas, areasError, sites, greeting, onSite, onGround, onShortlist, onDistrict, onDistricts }: {
  data: Dataset; areas: Area[] | null; areasError: boolean; sites: SavedSite[]; greeting: string;
  onSite: () => void; onGround: () => void; onShortlist: () => void; onDistrict: (code: string) => void; onDistricts: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const gunw = data.layers.filter((l) => l.type === 'gunw');
  const water = data.layers.filter((l) => l.type === 'water');
  const manifestOk = data.layers.length > 0;
  const range = data.gunwSpan ? fmtRange(data.gunwSpan.from, data.gunwSpan.to, lang, t('interval.to')) : null;
  const latest = [...gunw].sort((a, b) => (a.date < b.date ? -1 : 1)).pop() ?? null;
  const latestWater = water.map((l) => l.date).sort().pop() ?? null;
  const trackLabel = (k: string) => { const p = parseTrack(k); return p ? t(p.dir === 'A' ? 'track.A' : 'track.D', { n: p.n }) : k; };
  const top = data.districts.filter((d) => d.index != null).sort((a, b) => (b.index ?? 0) - (a.index ?? 0)).slice(0, 5);
  const rated = sites.filter((s) => !s.urban);
  const best = rated.length ? Math.max(...rated.map((s) => s.score)) : null;
  return (
    <div className="ov">
      <div className="ov-head">
        <h2>{greeting}</h2>
        <p className="top-desc">{t('ov.msg')}</p>
        <div className="ov-hero">
        <OverviewMap data={data} />
        <div className="ov-start">
        <h3 className="sub-h">{t('ov.start')}</h3>
        <div className="ov-actions">
          {sitingEnabled && <button type="button" className="btn primary" onClick={onSite}>{t('land.open')}</button>}
          <button type="button" className="btn" onClick={onGround}>{t('open.ground')}</button>
        </div>
        </div>
        </div>
      </div>
      <div className="kpis">
        <Tile label={t('kpi.pairs')} value={manifestOk ? String(gunw.length) : null} source="src.manifest" />
        <Tile label={t('kpi.water')} value={manifestOk && water.length ? String(water.length) : null} state={manifestOk && !water.length ? 'pending' : undefined} source="src.manifest" />
        <Tile label={t('kpi.districts')} value={data.districtsOk ? String(data.districts.length) : null} source="src.districts" />
        {sitingEnabled && <Tile label={t('kpi.areas')} value={areas ? String(areas.length) : null} state={!areas && !areasError ? 'loading' : undefined} source="src.coverage" />}
        <Tile label={t('kpi.range')} value={range} source="src.manifest" small />
        {sitingEnabled && <Tile label={t('kpi.short')} value={String(sites.length)} source="src.local" />}
      </div>
      <div className="ov-cols">
        <section className="panel2" aria-labelledby="ov-top">
          <h3 id="ov-top" className="sub-h">{t('ov.top')}</h3>
          {top.length === 0 ? <p className="comp-sub">{data.districtsOk ? t('nodata') : t('nodata.src')}</p> : (
            <ol className="ov-top">
              {top.map((d, i) => (
                <li key={d.dcode}>
                  <button type="button" className="ov-row" onClick={() => onDistrict(d.dcode)}>
                    <span className="rank mono">{i + 1}</span>
                    <span className="dmain">{lang === 'en' ? d.nameEn : d.nameTh}</span>
                    <span className="mono ov-idx">{fmtNum(d.index, 1)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button type="button" className="link-btn" onClick={onDistricts}>{t('ov.all')}</button>
        </section>
        <div className="ov-side">
          <section className="panel2" aria-labelledby="ov-latest">
            <h3 id="ov-latest" className="sub-h">{t('ov.latest')}</h3>
            {manifestOk ? (
              <ul className="ov-lines">
                {latest && <li>{t('ov.pair', { date: fmtRange(latest.date, latest.secDate, lang, t('interval.to')) ?? t('nodata'), track: trackLabel(latest.track) })}</li>}
                {latestWater ? <li>{t('ov.scene', { date: fmtDate(latestWater, lang) ?? t('nodata') })}</li> : <li>{t('kpi.water')}: <Pending /></li>}
              </ul>
            ) : <p className="comp-sub">{t('nodata.src')}</p>}
          </section>
          {sitingEnabled && (
            <section className="panel2" aria-labelledby="ov-short">
              <h3 id="ov-short" className="sub-h">{t('my.title')}</h3>
              <p>{sites.length ? (best != null ? t('ov.short.n', { n: sites.length, s: best }) : `${sites.length} ${t('rated.pill')}`) : t('ov.short.empty')}</p>
              <button type="button" className="link-btn" onClick={onShortlist}>{t('ov.short.open')}</button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
