'use client';

import { fmtNum, type Confidence, type Dataset } from '@/lib/data';
import { dict, type Key } from '@/lib/i18n';
import type { LookupSample } from '@/lib/lookup';
import { useLang, useT } from './ui';

const slug = (cls: string) => cls.replace(/\s+/g, '_');

function useHas() {
  const lang = useLang();
  return (k: string) => (dict[lang] as Record<string, string>)[k] != null;
}

export function TwoRadarBlock({ sample, conf, landcover }: { sample: LookupSample; conf: Confidence; landcover: string | null }) {
  const t = useT();
  const has = useHas();
  const entry = conf.legend.find((c) => c.id === sample.classId);
  if (!entry) return null;
  const k = slug(entry.cls);
  const blind = !!landcover && /built-up|tree cover/i.test(landcover);
  let level = entry.conf;
  if (blind && level === 'high') level = 'medium';
  const r = sample.recurrence != null ? fmtNum(sample.recurrence, 0) : null;
  const f = fmtNum(sample.s1, 0);
  return (
    <section className="cf-block" aria-labelledby="cf-t">
      <h3 id="cf-t" className="sub-h">{t('cf.title')}</h3>
      <p className="cf-sent">{has(`cf.s.${k}`) ? t(`cf.s.${k}` as Key) : entry.cls}</p>
      <div className="cf-meters">
        <div>
          <p className="comp-sub">{r ? t('cf.nisar', { r }) : t('cf.nisar.none')}</p>
          <span className="meter" role="img" aria-label={r ? `${r} %` : t('cf.nisar.none')}><span style={{ width: `${sample.recurrence ?? 0}%` }} /></span>
        </div>
        <div>
          <p className="comp-sub">{t('cf.s1', { f: f ?? '' })}</p>
          <span className="meter" role="img" aria-label={`${f} %`}><span style={{ width: `${sample.s1}%` }} /></span>
        </div>
      </div>
      {level && has(`cf.level.${level}`) && <p className="cf-conf">{t('cf.conf')}: <span className={`cf-pill ${level}`}>{t(`cf.level.${level}` as Key)}</span></p>}
      {blind && <p className="comp-sub">{t('cf.cap')}</p>}
      <p className="comp-sub">{t('cf.note')}</p>
    </section>
  );
}

export function ConfLegend({ conf }: { conf: Confidence }) {
  const t = useT();
  const has = useHas();
  return (
    <details className="score-legend glass" open>
      <summary>{t('cf.legend')}</summary>
      <ul className="sl-ex">
        {conf.legend.map((c) => (
          <li key={c.id}>
            <span className={`sw${c.colour ? '' : ' hatch'}`} style={c.colour ? { background: c.colour, opacity: c.alpha && c.alpha < 0.5 ? 0.5 : 1 } : undefined} />
            <span className="sl-t"><b>{has(`cf.cls.${slug(c.cls)}`) ? t(`cf.cls.${slug(c.cls)}` as Key) : c.cls}</b></span>
          </li>
        ))}
      </ul>
    </details>
  );
}

const W = 360, H = 140, PL = 34, PR = 8, PT = 10, PB = 36;

export function ElevationChart({ elev, h }: { elev: NonNullable<Dataset['elev']>; h: number }) {
  const t = useT();
  const vis = elev.visible;
  const n = vis.length;
  const maxV = Math.max(5, ...vis.map((b) => b.recurrence ?? 0), ...elev.all.map((b) => b.recurrence ?? 0));
  const x = (i: number) => PL + (n === 1 ? 0.5 : i / (n - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - v / maxV) * (H - PT - PB);
  const label = (b: { from: number | null; to: number | null }) => (b.from == null ? t('el.below', { b: b.to ?? '' }) : b.to == null ? t('el.above', { a: b.from }) : t('el.band', { a: b.from, b: b.to }));
  const inBin = (b: { from: number | null; to: number | null }) => (b.from == null || h >= b.from) && (b.to == null || h < b.to);
  const at = vis.findIndex(inBin);
  // faint all-land series: align by bin centre
  const centre = (b: { from: number | null; to: number | null }, i: number) => (b.from != null && b.to != null ? (b.from + b.to) / 2 : b.from == null ? (b.to ?? 0) - 0.5 : (b.from ?? 0) + 0.5) + 0 * i;
  const visCentres = vis.map(centre);
  const xAt = (c: number) => { for (let i = 0; i < n - 1; i++) { if (c <= visCentres[i + 1]) { const a = visCentres[i], b = visCentres[i + 1]; return x(i) + ((c - a) / (b - a || 1)) * (x(i + 1) - x(i)); } } return x(n - 1); };
  const allPts = elev.all.filter((b) => b.recurrence != null).map((b, i) => `${Math.max(PL, Math.min(W - PR, xAt(centre(b, i))))},${y(b.recurrence as number)}`).join(' ');
  const line = vis.map((b, i) => `${x(i)},${y(b.recurrence ?? 0)}`).join(' ');
  const sentence = at >= 0 && vis[at].everWet != null ? t('el.sentence', { h: fmtNum(h, 1) ?? '', p: fmtNum(vis[at].everWet, 0) ?? '' }) : null;
  const lang = useLang();
  return (
    <figure className="chart wc el">
      <figcaption className="sub-h">{t('el.title')}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('el.aria', { s: sentence ?? '' })}>
        <line x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} className="zero" />
        {at >= 0 && <rect x={x(at) - 14} y={PT} width={28} height={H - PT - PB} className="el-hit" />}
        {allPts && <polyline points={allPts} fill="none" className="el-all" />}
        <polyline points={line} fill="none" className="wc-line wc-0" />
        {vis.map((b, i) => <circle key={i} cx={x(i)} cy={y(b.recurrence ?? 0)} r={i === at ? 5 : 2.5} className={`wc-dot wc-0${i === at ? ' on' : ''}`} />)}
        <text x={PL - 4} y={y(maxV) + 4} textAnchor="end" className="ax mono">{fmtNum(maxV, 0)}</text>
        <text x={PL - 4} y={y(0) + 4} textAnchor="end" className="ax mono">0</text>
        {vis.map((b, i) => <text key={i} x={x(i)} y={H - 20} textAnchor="middle" className="ax mono">{b.from == null ? `<${b.to}` : b.to == null ? `>${b.from}` : `${b.from}-${b.to}`}</text>)}
        <text x={(PL + W - PR) / 2} y={H - 4} textAnchor="middle" className="ax">{t('el.x')}</text>
      </svg>
      <ul className="wc-key"><li><span className="wc-sw wc-0" />{t('el.vis')}</li><li><span className="wc-sw el-all-sw" />{t('el.all')}</li></ul>
      {sentence && <p className="comp-text">{sentence}</p>}
      <p className="comp-sub">{lang === 'en' ? elev.caveat ?? t('el.caveat') : t('el.caveat')}</p>
      <table className="sr">
        <caption>{t('el.title')}</caption>
        <thead><tr><th>{t('el.x')}</th><th>{t('el.y')}</th></tr></thead>
        <tbody>{vis.map((b, i) => <tr key={i}><td>{label(b)}</td><td>{fmtNum(b.recurrence, 1)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
