'use client';

import { useEffect, useState } from 'react';
import { Chevron, NoData, Pending, useLang, useT } from './ui';
import { fmtDate, fmtNum, fmtRange, parseTrack, type District, type LosEntry, type WaterEntry } from '@/lib/data';
import type { Lang } from '@/lib/i18n';

function useTrackLabel() {
  const t = useT();
  return (k: string) => { const p = parseTrack(k); return p ? t(p.dir === 'A' ? 'track.A' : 'track.D', { n: p.n }) : k; };
}

const W = 360, H = 120, PL = 40, PR = 8, PT = 10, PB = 28;

function useArrowSelect(n: number, init: number) {
  const [sel, setSel] = useState(init);
  useEffect(() => { setSel(init); }, [n, init]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setSel((v) => Math.min(n - 1, v + 1)); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setSel((v) => Math.max(0, v - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setSel(0); }
    else if (e.key === 'End') { e.preventDefault(); setSel(n - 1); }
  };
  return { sel, setSel, onKeyDown };
}

function LosChart({ points, trackLabel, span }: { points: (LosEntry & { mean: number })[]; trackLabel: string; span: (d: string) => string | null }) {
  const t = useT();
  const lang = useLang();
  const n = points.length;
  const { sel, setSel, onKeyDown } = useArrowSelect(n, n - 1);
  const vals = [0, ...points.flatMap((p) => [p.mean, ...(p.p10 != null ? [p.p10] : []), ...(p.p90 != null ? [p.p90] : [])])];
  const lo = Math.min(...vals), hi = Math.max(...vals), range = hi - lo || 1;
  const x = (i: number) => (n === 1 ? (PL + W - PR) / 2 : PL + (i / (n - 1)) * (W - PL - PR));
  const y = (v: number) => PT + (1 - (v - lo) / range) * (H - PT - PB);
  const bandOk = points.every((p) => p.p10 != null && p.p90 != null) && n > 1;
  const band = bandOk ? `${points.map((p, i) => `${x(i)},${y(p.p90 as number)}`).join(' ')} ${[...points].map((p, i) => `${x(i)},${y(p.p10 as number)}`).reverse().join(' ')}` : '';
  const line = points.map((p, i) => `${x(i)},${y(p.mean)}`).join(' ');
  const cur = points[Math.min(sel, n - 1)];
  const dateOf = (p: LosEntry) => span(p.date) ?? fmtDate(p.date, lang) ?? t('nodata');
  const m = fmtNum(cur.mean, 1) ?? t('nodata'), a = fmtNum(cur.p10, 1), b = fmtNum(cur.p90, 1);
  const readout = a && b ? t('d.readout', { date: dateOf(cur), m, a, b }) : `${dateOf(cur)} · ${m} ${t('unit.mm')}`;
  const first = fmtDate(points[0].date, lang, false), last = fmtDate(points[n - 1].date, lang, false);
  return (
    <figure className="chart">
      <figcaption className="comp-sub">{t('d.chart1')}</figcaption>
      <div className="chart-wrap" tabIndex={0} onKeyDown={onKeyDown} role="group" aria-label={t('d.chart1')}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('d.sparkAria', { track: trackLabel, n, first: fmtNum(points[0].mean, 1) ?? '', last: fmtNum(points[n - 1].mean, 1) ?? '' })}>
          <line x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} className="zero" />
          {band && <polygon points={band} className="band" />}
          {n > 1 && <polyline points={line} className="line" fill="none" />}
          {points.map((p, i) => (
            <g key={p.date} onClick={() => setSel(i)}>
              <circle cx={x(i)} cy={y(p.mean)} r={12} fill="transparent" />
              <circle cx={x(i)} cy={y(p.mean)} r={i === sel ? 6 : 4} className={`dot${i === sel ? ' on' : ''}`} />
            </g>
          ))}
          <text x={PL - 4} y={y(hi) + 4} textAnchor="end" className="ax mono">{fmtNum(hi, 0)}</text>
          <text x={PL - 4} y={y(lo) + 4} textAnchor="end" className="ax mono">{fmtNum(lo, 0)}</text>
          <text x={PL} y={H - 6} className="ax mono">{first}</text>
          <text x={W - PR} y={H - 6} textAnchor="end" className="ax mono">{last}</text>
        </svg>
      </div>
      <p className="readout mono" aria-live="polite">{readout}</p>
      <table className="sr">
        <caption>{t('d.chart1')}</caption>
        <thead><tr><th>{t('d.col.date')}</th><th>{t('d.col.mean')}</th><th>{t('d.col.range')}</th></tr></thead>
        <tbody>{points.map((p) => <tr key={p.date}><td>{dateOf(p)}</td><td>{fmtNum(p.mean, 1)}</td><td>{fmtNum(p.p10, 1) ?? ''} {fmtNum(p.p90, 1) ?? ''}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

function WaterChart({ entries, max }: { entries: (WaterEntry & { pct: number })[]; max: number }) {
  const t = useT();
  const lang = useLang();
  const n = entries.length;
  const { sel, setSel, onKeyDown } = useArrowSelect(n, n - 1);
  const BW = 8, GAP = 2, width = Math.max(W, n * (BW + GAP) + PL + PR), slot = (width - PL - PR) / n, base = H - PB, top = PT;
  const top2 = Math.max(...entries.map((e) => e.pct), 1);
  const cur = entries[Math.min(sel, n - 1)];
  const lab = (e: WaterEntry) => fmtDate(e.date, lang) ?? t('nodata');
  return (
    <figure className="chart">
      <figcaption className="comp-sub">{t('d.chart2')}</figcaption>
      <div className="chart-wrap" tabIndex={0} onKeyDown={onKeyDown} role="group" aria-label={t('d.chart2')}>
        <svg viewBox={`0 0 ${width} ${H}`} role="img" aria-label={t('d.waterAria', { n, max: fmtNum(max, 1) ?? '' })}>
          <line x1={PL} x2={width - PR} y1={base} y2={base} className="zero" />
          {entries.map((e, i) => {
            const h = e.pct > 0 ? Math.max(3, (e.pct / top2) * (base - top)) : 3;
            const bx = PL + i * slot + (slot - BW) / 2;
            return (
              <g key={`${e.track}${e.date}`} onClick={() => setSel(i)}>
                <rect x={PL + i * slot} y={top} width={slot} height={base - top} fill="transparent" />
                <rect x={bx} y={base - h} width={BW} height={h} className={e.pct > 0 ? 'bar-w' : 'bar-w zero-bar'} />
                {i === sel && <rect x={bx - 2} y={base - h - 2} width={BW + 4} height={h + 4} className="bar-sel" />}
              </g>
            );
          })}
          <text x={PL - 4} y={top + 8} textAnchor="end" className="ax mono">{fmtNum(top2, 0)}%</text>
          <text x={PL - 4} y={base} textAnchor="end" className="ax mono">0</text>
          <text x={PL} y={H - 6} className="ax mono">{fmtDate(entries[0].date, lang, false)}</text>
          <text x={width - PR} y={H - 6} textAnchor="end" className="ax mono">{fmtDate(entries[n - 1].date, lang, false)}</text>
        </svg>
      </div>
      <p className="readout mono" aria-live="polite">{t('d.waterReadout', { date: lab(cur), p: fmtNum(cur.pct, 1) ?? t('nodata') })}</p>
      <table className="sr">
        <caption>{t('d.chart2')}</caption>
        <thead><tr><th>{t('d.col.date')}</th><th>{t('d.col.pct')}</th></tr></thead>
        <tbody>{entries.map((e) => <tr key={`${e.track}${e.date}`}><td>{lab(e)}</td><td>{fmtNum(e.pct, 1)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

function Disclosure({ title, extra, children }: { title: string; extra?: React.ReactNode; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="disc">
      <button type="button" className="disc-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="disc-title">{title}{extra}</span><Chevron open={open} />
      </button>
      {open && children && <div className="disc-body">{children}</div>}
    </section>
  );
}

export default function DistrictDetail({ d, rank, rankOf, tracks, track, onTrack, waterAvailable, secDateOf, trackSpan, onBack, onCheck }: {
  d: District; rank: number; rankOf: number; tracks: string[]; track: string; onTrack: (t: string) => void; waterAvailable: boolean;
  secDateOf: (track: string, date: string) => string | null; trackSpan: (track: string) => { start: string; end: string } | null; onBack: () => void; onCheck: (() => void) | null;
}) {
  const t = useT();
  const lang: Lang = useLang();
  const label = useTrackLabel();
  const [first, other] = lang === 'en' ? [d.nameEn, d.nameTh] : [d.nameTh, d.nameEn];
  const idx = fmtNum(d.index, 1);
  const points = d.los.filter((x): x is LosEntry & { mean: number } => x.track === track && x.mean != null).sort((a, b) => (a.date < b.date ? -1 : 1));
  const alt = tracks.find((k) => k !== track && d.los.some((x) => x.track === k && x.mean != null));
  const span = (day: string) => fmtRange(day, secDateOf(track, day), lang, t('interval.to'));
  const coh = d.los.filter((x) => x.track === track && x.coherent != null).map((x) => x.coherent as number);
  const usable = coh.length ? Math.round(coh.reduce((a, b) => a + b, 0) / coh.length) : null;
  const waterEntries = d.water.filter((w): w is WaterEntry & { pct: number } => w.pct != null).sort((a, b) => (a.date < b.date ? -1 : 1));
  const waterMax = fmtNum(waterEntries.length ? Math.max(...waterEntries.map((w) => w.pct)) : d.waterMaxPct, 1);
  const pop = fmtNum(d.pop, 0);
  return (
    <div className="detail">
      <div className="detail-head">
        <button type="button" className="btn back" onClick={onBack}>
          <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {t('back')}
        </button>
        <div className="detail-name">
          <h2 className="dh">{first}</h2>
          <p className="dother">{other}</p>
        </div>
      </div>
      <p className="dother">{t('index')}</p>
      <div className="bigidx">
        <span className="big mono">{idx ?? t('nodata')}</span>
        {idx && <span className="of mono">/ 100</span>}
        {idx && rank > 0 && <span className="rank-pill">{t('d.rank', { r: rank, n: rankOf })}</span>}
      </div>
      {!waterAvailable && <p className="dother">{t('index.noWater')}</p>}

      <h3 className="sub-h gh">{t('d.ground')}</h3>
      <ul className="trows">
        {tracks.map((k) => {
          const sp = trackSpan(k);
          const total = fmtNum(d.losSum[k], 1);
          const totalText = sp ? t('d.total', { start: fmtDate(sp.start, lang, false) ?? '', end: fmtDate(sp.end, lang) ?? '' }) : t('nodata');
          return (
            <li key={k}>
              <button type="button" className="trow" aria-pressed={k === track} onClick={() => onTrack(k)}>
                <span className="trow-text"><span className="dmain">{label(k)}</span><span className="dsub">{totalText}</span></span>
                <span className="trow-val">{total ? <><span className="mono">{total}</span> {t('unit.mm')}</> : <NoData />}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {points.length > 0 ? (
        <LosChart key={track} points={points} trackLabel={label(track)} span={span} />
      ) : (
        <div className="notrack">
          <p className="comp-sub">{t('d.noTrack')}</p>
          {alt && <button type="button" className="btn" onClick={() => onTrack(alt)}>{t('d.showTrack', { track: label(alt) })}</button>}
        </div>
      )}
      {points.length > 0 && usable != null && (
        <div className="usable">
          <p>{t('d.usable', { p: usable })}</p>
          <span className="bar"><span style={{ width: `${Math.max(0, Math.min(100, usable))}%` }} /></span>
          {usable < 50 && <p className="banner urban low" role="note"><svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2l6.5 11.5h-13z M8 6.5v3.2 M8 11.6v.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg><span>{t('d.lowUsable', { p: usable })}</span></p>}
        </div>
      )}

      <Disclosure title={waterMax ? t('d.water', { max: waterMax }) : t('stat.water')} extra={waterMax ? null : <> {waterAvailable ? <NoData /> : <Pending />}</>}>
        {waterEntries.length > 0 && <WaterChart entries={waterEntries} max={waterEntries.length ? Math.max(...waterEntries.map((w) => w.pct)) : 0} />}
        <p className="comp-sub">{t('d.waterCaveat')}</p>
      </Disclosure>
      <Disclosure title={pop ? t('d.people', { pop }) : t('d.pop')}>
        <dl className="stats">
          {([['d.pop', pop, ''], ['d.density', fmtNum(d.popDensity, 0), ''], ['d.bld', fmtNum(d.buildings, 0), ''], ['d.bldDensity', fmtNum(d.bldDensity, 0), ''], ['d.area', fmtNum(d.areaKm2, 1), '']] as const).map(([k, v]) => (
            <div className="stat" key={k}><dt>{t(k)}</dt><dd><span className="stat-val">{v ? <span className="mono">{v}</span> : <NoData />}</span></dd></div>
          ))}
        </dl>
        <p className="comp-sub">{t('d.osmCaveat')}</p>
      </Disclosure>
      {onCheck && <button type="button" className="btn wide" onClick={onCheck}>{t('d.checkSite')}</button>}
      <p className="screening">{t('screeningOnly')}</p>
    </div>
  );
}
