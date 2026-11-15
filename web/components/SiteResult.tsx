'use client';

import { Check, Warn, NoData, useLang, useT } from './ui';
import { fmtNum, fmtYear } from '@/lib/data';
import { landcoverLabel, type Key } from '@/lib/i18n';
import type { Area, EvState, Res, Suit } from '@/lib/siting';

const Info = () => (
  <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 7.2v4 M8 4.7v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);
const Minus = () => (
  <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M4.8 8h6.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);

const FLAG_KEYS: Record<string, Key> = {
  vegetated_flooding_not_detected: 'flag.veg', elevation_is_dsm: 'flag.dsm', near_permanent_water: 'flag.water', aoi_edge: 'flag.edge', few_wet_scenes: 'flag.few',
};
const pct = (v: number | null) => {
  if (v == null) return null;
  const r = Math.round(v * 100);
  return v > 0 && r < 1 ? '<1' : String(r);
};
const EXCL_KEYS: Record<string, Key> = {
  water_body: 'excl.water_body', permanent_water: 'excl.permanent_water', tree_cover: 'excl.tree_cover', wetland: 'excl.wetland', protected_area: 'excl.protected_area',
};
const bar = (v: number | null) => <span className="bar comp-bar"><span style={{ width: `${v == null ? 0 : Math.max(0, Math.min(1, v)) * 100}%` }} /></span>;

function Skeleton() {
  return (
    <div className="skel" aria-hidden="true">
      <div className="skel-block big" /><div className="skel-block" /><div className="skel-block" /><div className="skel-block" />
    </div>
  );
}

function Comp({ title, text, sub, sub2 }: { title: string; text: string | null; sub: string | null; sub2: number | null }) {
  const t = useT();
  return (
    <div className="comp">
      <p className="comp-title">{title}</p>
      <p className="comp-text">{text ?? t('nodata')}</p>
      {sub && <p className="comp-sub">{sub}</p>}
      {bar(sub2)}
    </div>
  );
}

function Body({ suit, ev, onEvidence, saved, onSave, years }: { suit: Suit; ev: EvState; onEvidence: () => void; saved: boolean | null; onSave: (() => void) | null; years: { from: number; to: number } | null }) {
  const t = useT();
  const lang = useLang();
  const excluded = suit.score == null;
  const urban = suit.flags.includes('urban_flooding_not_detected');
  const known = suit.flags.flatMap((f) => (FLAG_KEYS[f] ? [FLAG_KEYS[f]] : []));
  const things: Key[] = suit.flags.some((f) => f !== 'urban_flooding_not_detected' && !FLAG_KEYS[f]) ? [...known, 'flag.other'] : known;
  const n = ev.s === 'ok' ? ev.data.withWater : null;
  const v = ev.s === 'ok' ? ev.data.valid : null;
  const floodPct = pct(suit.floodValue);
  const floodText = n != null && v != null ? t('comp.flood.n', { n, v }) : floodPct ? t('comp.flood.pct', { p: floodPct }) : null;
  const yearsPct = pct(suit.yearsFlooded);
  const h = fmtNum(suit.elevValue, 1);
  const pf = pct(suit.pFlood);
  const sun = fmtNum(suit.ghi, 1);
  const gradeIcon = suit.grade === 'good' ? <Check /> : suit.grade === 'fair' ? <Warn /> : <Minus />;
  const reasons = suit.exclusions.length ? suit.exclusions : ['unknown'];
  return (
    <div className="result">
      <div className="score-row">
        {excluded ? <span className="noscore">{t('state.none')}</span> : <span className="score mono">{Math.round(suit.score ?? 0)}</span>}
        {!excluded && <span className="of mono">/ 100</span>}
        {!excluded && (suit.grade ? <span className={`grade ${suit.grade}`}>{gradeIcon}{t(`grade.${suit.grade}` as Key)}</span> : <span className="grade none">{t('grade.none')}</span>)}
      </div>
      {!excluded && (
        <p className="comp-sub">{t('grade.prov')}{suit.level ? ` · ${t('conf', { level: t(`conf.${suit.level}` as Key) })}` : ''}</p>
      )}
      {urban && <p className="banner urban" role="note"><Warn /><span>{t('flag.urban')}</span></p>}
      {excluded && reasons.map((c) => <p key={c} className="banner neutral">{t(EXCL_KEYS[c] ?? 'excl.other')}</p>)}
      {!excluded && (
        <>
          <Comp title={t('comp.flood')} text={floodText} sub={yearsPct ? t('comp.flood.years', { p: yearsPct }) : null} sub2={suit.floodSub} />
          <Comp title={t('comp.elev')} text={h ? t('comp.elev.v', { h }) : null} sub={pf ? t('comp.elev.p', { p: pf }) : null} sub2={suit.elevSub} />
          {(things.length > 0 || years) && (
            <section aria-labelledby="things">
              <h3 id="things" className="sub-h">{t('things')}</h3>
              <ul className="things">{things.map((k) => <li key={k}><Info /><span>{t(k)}</span></li>)}{years && <li><Info /><span>{t(years.from > 2011 ? 'flag.history' : 'flag.history0', { from: fmtYear(years.from, lang), to: fmtYear(years.to, lang), x: fmtYear(2011, lang) })}</span></li>}</ul>
            </section>
          )}
        </>
      )}
      <dl className="secondary">
        <div><dt>{t('landcover')}</dt><dd>{suit.landcover ? landcoverLabel(suit.landcover, lang) : <NoData />}</dd></div>
        {!excluded && <div><dt>{t('sun')}</dt><dd>{sun ? t('sun.v', { x: sun }) : <NoData />}</dd></div>}
      </dl>
      <p className="comp-sub">{t('pixel')}</p>
      <div className="actions">
        <button type="button" className="btn primary" data-evidence-open onClick={onEvidence} disabled={ev.s === 'error'}>{t('evidence.open')}</button>
        {!excluded && onSave && (
          <button type="button" className="btn save-btn" aria-pressed={saved === true} onClick={onSave}>
            {saved ? <Check /> : <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h8v12l-4-3.500L4 14z" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinejoin="round" /></svg>}
            {t(saved ? 'saved' : 'save')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SiteResult({ res, ev, onEvidence, onRetry, onGo, saved, onSave, years }: {
  res: Res; ev: EvState; onEvidence: () => void; onRetry: () => void; onGo: (a: Area) => void; saved: boolean | null; onSave: (() => void) | null; years: { from: number; to: number } | null;
}) {
  const t = useT();
  if (res.s === 'loading') return <div aria-busy="true" aria-label={t('loading')}><Skeleton /></div>;
  if (res.s === 'error') return (
    <div className="state-error" role="alert">
      <p>{t('state.error')}</p>
      <button type="button" className="btn" onClick={onRetry}>{t('retry')}</button>
    </div>
  );
  if (res.s === 'outside') return (
    <div>
      <h3 className="outside-h">{t('state.outside')}</h3>
      <p className="comp-sub">{t('state.outside.sub')}</p>
      <ul className="arealist">{res.areas.map((a) => <AreaRow key={a.id} area={a} onGo={onGo} />)}</ul>
    </div>
  );
  if (res.s === 'ok') return <Body suit={res.suit} ev={ev} onEvidence={onEvidence} saved={saved} onSave={onSave} years={years} />;
  return null;
}

export function AreaRow({ area, onGo }: { area: Area; onGo: (a: Area) => void }) {
  const t = useT();
  const range = area.range ? `${area.range[0].slice(0, 4)} ${t('interval.to')} ${area.range[1].slice(0, 4)}` : null;
  return (
    <li className="arow">
      <span className="arow-text"><span className="dmain">{area.name}</span>{range && <span className="dsub mono">{range}</span>}</span>
      <button type="button" className="btn icon-btn" onClick={() => onGo(area)} aria-label={`${t('site.go')}: ${area.name}`} title={t('site.go')}>
        <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h12 M9 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </li>
  );
}
