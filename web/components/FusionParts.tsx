'use client';

import { fmtDate, fmtNum, type Fusion } from '@/lib/data';
import { landcoverLabel, type Key } from '@/lib/i18n';
import { useLang, useT } from './ui';

export function FusionCard({ f, districtCount }: { f: Fusion; districtCount: number }) {
  const t = useT();
  const lang = useLang();
  const rank = fmtNum(f.spearman, 2), rankD = fmtNum(f.spearmanDistricts, 2);
  const a = fmtNum(f.nisarEverHigh, 0), b = fmtNum(f.nisarEverZero, 0);
  if (!rank && !rankD && !a) return null;
  const thr = f.s1Threshold != null ? fmtNum(f.s1Threshold * 100, 0) : null;
  const caveat = lang === 'en' ? f.caveats.find((c) => /both radars/i.test(c)) ?? null : t('fusion.caveat');
  return (
    <section className="fusion-card" aria-labelledby="fusion-t">
      <h3 id="fusion-t" className="sub-h">{t('fusion.title')}</h3>
      <div className="fusion-nums">
        {rank && <div><p className="kpi-label">{t('fusion.rank')}</p><p className="kpi-val mono">{rank}</p><p className="kpi-src">{f.pixels != null ? t('fusion.rank.src', { n: fmtNum(f.pixels, 0) ?? '' }) : t('fusion.src')}</p></div>}
        {rankD && <div><p className="kpi-label">{t('fusion.rankD')}</p><p className="kpi-val mono">{rankD}</p><p className="kpi-src">{t('fusion.rankD.src', { n: districtCount })}</p></div>}
      </div>
      {a && b && thr && <p className="fusion-line">{t('fusion.line', { a, b, t: thr })}</p>}
      {caveat && <p className="comp-sub">{caveat}</p>}
      <p className="kpi-src">{t('fusion.src')}</p>
    </section>
  );
}

export function FusionLegend({ f }: { f: Fusion }) {
  const t = useT();
  return (
    <div className="fusion-legend">
      <ul>
        {f.legend.map((c) => (
          <li key={c.cls} title={c.definition}>
            <span className={`sw${c.colour ? '' : ' hatch'}`} style={c.colour ? { background: c.colour } : undefined} />
            <span className="fl-t"><b>{t(`fusion.cls.${c.cls}` as Key)}</b><span className="fl-d">{c.definition}</span></span>
          </li>
        ))}
      </ul>
      <p className="comp-sub">{t('fusion.caption')}</p>
    </div>
  );
}

const W = 360, H = 140, PL = 36, PR = 10, PT = 10, PB = 26;
const WANT = [40, 50, 10];

export function WaterByCover({ f, track }: { f: Fusion; track: string }) {
  const t = useT();
  const lang = useLang();
  const rows = f.lcWater.filter((r) => r.track === track);
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const classes = WANT.filter((c) => rows.some((r) => r.cls === c));
  if (dates.length < 2 || classes.length === 0) return null;
  const maxV = Math.max(5, ...rows.filter((r) => classes.includes(r.cls)).map((r) => r.pct));
  const x = (i: number) => PL + (i / (dates.length - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - v / maxV) * (H - PT - PB);
  const series = classes.map((c) => ({ c, label: rows.find((r) => r.cls === c)?.label ?? '', pts: dates.map((d, i) => { const r = rows.find((q) => q.cls === c && q.date === d); return r ? ([x(i), y(r.pct), r.pct] as const) : null; }) }));
  const cyc = f.cropland[track];
  const built = rows.filter((r) => r.cls === 50).map((r) => r.pct);
  let sentence: string | null = null;
  if (cyc) {
    const xv = cyc.pct[cyc.first], yv = cyc.pct[cyc.min], zv = cyc.pct[cyc.last];
    if (xv != null && yv != null && zv != null && built.length) {
      sentence = t('wc.sentence', { x: fmtNum(xv, 0) ?? '', y: fmtNum(yv, 0) ?? '', z: fmtNum(zv, 0) ?? '', m: String(Math.ceil(Math.max(...built))) });
    }
  }
  const dash = ['', '5 3', '1 3'];
  return (
    <figure className="chart wc">
      <figcaption className="sub-h">{t('wc.title')}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('wc.aria', { track, n: dates.length, s: sentence ?? '' })}>
        <line x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} className="zero" />
        {series.map((s, i) => {
          const pts = s.pts.flatMap((p) => (p ? [`${p[0]},${p[1]}`] : []));
          return (
            <g key={s.c}>
              <polyline points={pts.join(' ')} fill="none" className={`wc-line wc-${i}`} strokeDasharray={dash[i]} />
              {s.pts.map((p, j) => p && <circle key={j} cx={p[0]} cy={p[1]} r={2.5} className={`wc-dot wc-${i}`} />)}
            </g>
          );
        })}
        <text x={PL - 4} y={y(maxV) + 4} textAnchor="end" className="ax mono">{fmtNum(maxV, 0)}</text>
        <text x={PL - 4} y={y(0) + 4} textAnchor="end" className="ax mono">0</text>
        <text x={PL} y={H - 6} className="ax mono">{fmtDate(dates[0], lang, false)}</text>
        <text x={W - PR} y={H - 6} textAnchor="end" className="ax mono">{fmtDate(dates[dates.length - 1], lang, false)}</text>
      </svg>
      <ul className="wc-key">
        {series.map((s, i) => <li key={s.c}><span className={`wc-sw wc-${i}`} />{landcoverLabel(s.label, lang)}</li>)}
      </ul>
      {sentence && <p className="comp-text">{sentence}</p>}
      <p className="comp-sub">{t('wc.caveat')}</p>
      <table className="sr">
        <caption>{t('wc.title')}</caption>
        <thead><tr><th>{t('d.col.date')}</th>{series.map((s) => <th key={s.c}>{landcoverLabel(s.label, lang)} ({t('wc.y')})</th>)}</tr></thead>
        <tbody>{dates.map((d, i) => <tr key={d}><td>{d}</td>{series.map((s) => <td key={s.c}>{s.pts[i] ? fmtNum(s.pts[i]![2], 1) : ''}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}
