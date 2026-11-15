'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Segmented, useLang, useT } from './ui';
import { fmtDate, fmtNum } from '@/lib/data';
import { landcoverLabel, type Key } from '@/lib/i18n';
import { abs, type Evidence, type Scene } from '@/lib/siting';

const LAYER_KINDS = ['elev', 'water_freq_wet', 'landcover', 'score'] as const;

function chipSrc(chip: string, params: Record<string, string>): string {
  const u = new URL(abs(chip), window.location.origin);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
}

function safeHttps(raw: string | null): string | null {
  if (!raw) return null;
  try { const u = new URL(raw); return u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
}

function ChipImage({ src, alt }: { src: string; alt: string }) {
  const t = useT();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  if (state === 'error') return <p className="img-msg" role="status">{t('ev.img.error')}</p>;
  return <img className={`chip-img${state === 'loading' ? ' dim' : ''}`} src={src} alt={alt} loading="lazy" width={512} height={512}
    onLoad={() => setState('ok')} onError={() => setState('error')} />;
}

function markState(s: Scene): 'wetNo' | 'wetYes' | 'dry' {
  return s.season === 'dry' ? 'dry' : s.isWater ? 'wetYes' : 'wetNo';
}

function Strip({ scenes, selected, onSelect }: { scenes: Scene[]; selected: string | null; onSelect: (id: string) => void }) {
  const t = useT();
  const lang = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const years = useMemo(() => {
    const m = new Map<string, Scene[]>();
    scenes.forEach((s) => { const y = s.date.slice(0, 4); m.set(y, [...(m.get(y) ?? []), s]); });
    const ys = [...m.keys()].map(Number).filter(Number.isFinite);
    if (!ys.length) return [] as [string, Scene[]][];
    const out: [string, Scene[]][] = [];
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) out.push([String(y), m.get(String(y)) ?? []]);
    return out;
  }, [scenes]);
  const order = scenes.map((s) => s.id);
  const move = (e: React.KeyboardEvent) => {
    const i = selected ? order.indexOf(selected) : 0;
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? order.length - 1 : null;
    if (next == null) return;
    e.preventDefault();
    const id = order[Math.max(0, Math.min(order.length - 1, next))];
    onSelect(id);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus());
  };
  return (
    <div>
      <div ref={ref} className="strip" role="group" aria-label={t('ev.strip')} onKeyDown={move}>
        {years.map(([y, list]) => (
          <div key={y} className="strip-row">
            <span className="strip-year mono">{y}</span>
            <span className="strip-marks">
              {list.map((s) => {
                const st = markState(s);
                return (
                  <button key={s.id} type="button" data-id={s.id} className={`mark ${s.season} ${s.isWater ? 'water' : ''}`} tabIndex={selected === s.id ? 0 : -1}
                    aria-pressed={selected === s.id} aria-label={`${fmtDate(s.date, lang) ?? s.date}, ${t(`ev.key.${st}` as Key)}`} onClick={() => onSelect(s.id)} />
                );
              })}
            </span>
          </div>
        ))}
      </div>
      <ul className="key" aria-label="Key">
        <li><span className="mark wet" aria-hidden="true" />{t('ev.key.wetNo')}</li>
        <li><span className="mark wet water" aria-hidden="true" />{t('ev.key.wetYes')}</li>
        <li><span className="mark dry" aria-hidden="true" />{t('ev.key.dry')}</li>
      </ul>
    </div>
  );
}

export default function SiteEvidence({ ev, landcover, onBack }: { ev: Evidence; landcover: string | null; onBack: () => void }) {
  const t = useT();
  const lang = useLang();
  const first = useMemo(() => ev.scenes.find((s) => s.season === 'wet' && s.isWater) ?? [...ev.scenes].reverse().find((s) => s.season === 'wet') ?? ev.scenes[ev.scenes.length - 1] ?? null, [ev.scenes]);
  const [sel, setSel] = useState<string | null>(first?.id ?? null);
  const [band, setBand] = useState<'vv' | 'vh'>('vv');
  const [mask, setMask] = useState(false);
  const [layer, setLayer] = useState<string | null>(null);
  useEffect(() => { setSel(first?.id ?? null); setLayer(null); }, [first]);
  const scene = ev.scenes.find((s) => s.id === sel) ?? null;
  const hasVh = scene?.vh != null;
  const useBand = hasVh ? band : 'vv';
  const layerInfo = layer ? ev.layers.find((l) => l.kind === layer) ?? null : null;
  const answer = (b: boolean) => t(b ? 'ev.yes' : 'ev.no');
  const rule = ev.waterRule ?? t('nodata');

  let src: string | null = null;
  let alt = '';
  if (layerInfo) { src = chipSrc(layerInfo.chipUrl, {}); alt = t(`ev.layer.${layerInfo.kind}` as Key); }
  else if (scene?.chipUrl) {
    src = chipSrc(scene.chipUrl, { ...(useBand === 'vh' ? { band: 'vh' } : {}), ...(mask ? { overlay: 'water_mask' } : {}) });
    alt = t('ev.alt', { date: fmtDate(scene.date, lang) ?? scene.date, answer: answer(scene.isWater) });
  }
  const layerValue = (k: string, v: number | null) => (v == null ? null : k === 'water_freq_wet' ? `${Math.round(v * 100)}%` : k === 'elev' ? `${fmtNum(v, 1)} m` : k === 'score' ? fmtNum(v, 0) : k === 'landcover' ? String(v) : fmtNum(v, 1));

  return (
    <div className="evidence">
      <button type="button" className="btn back" onClick={onBack}>
        <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {t('back')}
      </button>
      <p className="claim">{ev.valid != null && ev.withWater != null ? t('ev.claim', { v: ev.valid, n: ev.withWater }) : t('ev.title')}</p>
      <Strip scenes={ev.scenes} selected={sel} onSelect={(id) => { setSel(id); setLayer(null); }} />

      <section className="scene-panel" aria-label={t('ev.scene')}>
        {src ? <ChipImage key={src} src={src} alt={alt} /> : !layerInfo && <p className="img-msg" role="status">{t('ev.img.none')}</p>}
        {layerInfo ? (
          <div className="lines">
            <p><span className="muted">{t('ev.value')}</span> <span className="mono">{layerInfo.kind === 'landcover' ? (landcover ? landcoverLabel(landcover, lang) : t('nodata')) : layerValue(layerInfo.kind, layerInfo.value) ?? t('nodata')}</span></p>
            {layerInfo.source && <p><span className="muted">{t('ev.source')}</span> {layerInfo.source}</p>}
            {layerInfo.kind === 'score' && <p className="comp-sub">{t('ev.cap.score')}</p>}
            <button type="button" className="btn" onClick={() => setLayer(null)}>{t('ev.back.scene')}</button>
          </div>
        ) : scene && (
          <>
            <div className="scene-controls">
              {hasVh && <Segmented label="Band" value={useBand} onChange={setBand} options={[{ value: 'vv', label: 'VV' }, { value: 'vh', label: 'VH' }]} />}
              <label className="switch"><input type="checkbox" role="switch" checked={mask} onChange={(e) => setMask(e.target.checked)} /><span>{t('ev.mask')}</span></label>
            </div>
            <div className="lines mono">
              <p>{t('ev.date')}: {fmtDate(scene.date, lang) ?? t('nodata')}</p>
              <p>{t('ev.orbit')}: {scene.orbit || t('nodata')}</p>
              <p>VV: {scene.vv != null ? `${fmtNum(scene.vv, 1)} dB` : t('nodata')}</p>
              <p>VH: {scene.vh != null ? `${fmtNum(scene.vh, 1)} dB` : t('nodata')}</p>
              <p>{t('ev.water', { answer: answer(scene.isWater), rule })}</p>
            </div>
            <p className="comp-sub">{t('ev.cap.sar')}</p>
            {safeHttps(scene.sourceUrl) && <a className="link" href={safeHttps(scene.sourceUrl) ?? undefined} target="_blank" rel="noopener noreferrer">{t('ev.find')}</a>}
          </>
        )}
      </section>

      {ev.layers.length > 0 && (
        <ul className="layer-chips">
          {LAYER_KINDS.flatMap((k) => ev.layers.find((l) => l.kind === k) ?? []).map((l) => (
            <li key={l.kind}>
              <button type="button" className="thumb" aria-pressed={layer === l.kind} onClick={() => setLayer(layer === l.kind ? null : l.kind)}>
                <img src={chipSrc(l.chipUrl, {})} alt="" loading="lazy" width={72} height={72} />
                <span>{t(`ev.layer.${l.kind}` as Key)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {ev.optical.length > 0 && (
        <section>
          <h3 className="sub-h">{t('ev.optical')}</h3>
          <ul className="optical">
            {ev.optical.map((o) => (
              <li key={o.date}>
                <img src={chipSrc(o.chipUrl, {})} alt="" loading="lazy" width={72} height={72} />
                <span>
                  <span className="dmain mono">{fmtDate(o.date, lang) ?? o.date}</span>
                  <span className="dsub">{o.days != null && o.cloud != null ? t('ev.optical.row', { n: o.days, c: Math.round(o.cloud) }) : t('nodata')}</span>
                  <span className="dsub">{o.water == null ? t('ev.opt.cloud') : o.water ? t('ev.opt.yes') : t('ev.opt.no')}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="method">
        <summary>{t('ev.method')}</summary>
        <dl className="stats">
          <div className="stat"><dt>{t('ev.m.rule')}</dt><dd className="mono">{ev.waterRule ?? t('nodata')}</dd></div>
          <div className="stat"><dt>{t('ev.m.version')}</dt><dd className="mono">{ev.version ?? t('nodata')}</dd></div>
          <div className="stat"><dt>{t('ev.m.run')}</dt><dd className="mono wrap">{ev.runId ?? t('nodata')}</dd></div>
          <div className="stat"><dt>{t('ev.m.hash')}</dt><dd className="mono">{ev.hash ?? t('nodata')}</dd></div>
        </dl>
        <p className="comp-sub">{t('ev.subset')}</p>
      </details>
    </div>
  );
}
