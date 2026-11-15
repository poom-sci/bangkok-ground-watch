'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, LangProvider, Segmented, useLang, useT } from './ui';
import UserMenu, { SignOutDialog } from './UserMenu';
import { SolsatMark, LogoTile } from './Brand';
import { fmtDate, fmtMonthRange, loadDataset, parseTrack, type Dataset } from '@/lib/data';
import { areaLabel, fetchCoverage, sitingEnabled, type Area } from '@/lib/siting';
import { useProfile } from '@/lib/user';
import type { Lang } from '@/lib/i18n';

const REPO = (process.env.NEXT_PUBLIC_REPO_URL ?? '').trim();

const Minus = () => (
  <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M4.8 8h6.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);
const Arrow = () => (
  <svg className="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h12 M9 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function SignedInChip() {
  const store = useProfile();
  const [out, setOut] = useState(false);
  if (!store.profile.key) return null;
  const go = () => { window.location.href = '/app/?tab=overview'; };
  return (
    <>
      <UserMenu profile={store.profile} canMySites={false} onMySites={go} onSwitch={go} onAdd={go} onSignOut={() => setOut(true)} onAbout={() => { window.location.href = '/app/?tab=overview&about=1'; }} />
      <SignOutDialog open={out} name={store.profile.name} onConfirm={() => { store.signOut(); setOut(false); }} onCancel={() => setOut(false)} />
    </>
  );
}

function useCoverage(): Area[] | 'fail' | null {
  const [areas, setAreas] = useState<Area[] | 'fail' | null>(null);
  useEffect(() => {
    if (!sitingEnabled) return;
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), 3000);
    fetchCoverage(c.signal).then((a) => { clearTimeout(timer); setAreas(a); }, () => { clearTimeout(timer); setAreas('fail'); });
    return () => { clearTimeout(timer); c.abort(); };
  }, []);
  return areas;
}

function Body({ lang, onLang }: { lang: Lang; onLang: (l: Lang) => void }) {
  const t = useT();
  const [data, setData] = useState<Dataset | null>(null);
  const [named, setNamed] = useState(false);
  const areas = useCoverage();
  useEffect(() => {
    let live = true;
    loadDataset().then((d) => { if (live) setData(d); });
    try { setNamed(!!localStorage.getItem('bgw:user')); } catch { /* storage unavailable */ }
    return () => { live = false; };
  }, []);

  const stats = useMemo(() => {
    if (!data || data.layers.length === 0) return null;
    const gunw = data.layers.filter((l) => l.type === 'gunw');
    const water = data.layers.filter((l) => l.type === 'water');
    const tracks = [...new Set(gunw.map((l) => l.track))].sort();
    const n = data.districts.length;
    const perTrack = tracks.map((k) => ({ k, count: data.districts.filter((d) => d.los.some((x) => x.track === k && x.mean != null)).length }));
    const dates = gunw.map((l) => l.date).sort();
    const waterDates = water.map((l) => l.date).sort();
    const pairEnds = gunw.map((l) => l.secDate ?? l.date).sort();
    return { n, pairs: gunw.length, pairEnd: pairEnds[pairEnds.length - 1], water: water.length, perTrack, first: dates[0], last: dates[dates.length - 1], wFirst: waterDates[0], wLast: waterDates[waterDates.length - 1] };
  }, [data]);

  const to = t('interval.to');
  const trackLabel = (k: string) => { const p = parseTrack(k); return p ? t(p.dir === 'A' ? 'track.A' : 'track.D', { n: p.n }) : k; };
  const fullRange = stats ? `${fmtDate(stats.first, lang, false) ?? ''} ${to} ${fmtDate(stats.pairEnd, lang) ?? ''}` : null;
  const monthRange = stats ? fmtMonthRange(stats.first, stats.last, lang, to) : null;
  const waterRange = stats && stats.wFirst ? fmtMonthRange(stats.wFirst, stats.wLast, lang, to) : null;
  const districts = useMemo(() => (data ? [...data.districts].sort((a, b) => (lang === 'th' ? a.nameTh.localeCompare(b.nameTh, 'th') : a.nameEn.localeCompare(b.nameEn))) : []), [data, lang]);
  const hasBangkok = Array.isArray(areas) && areas.some((a) => a.id === 'bangkok');

  return (
    <div className="land">
      <header className="land-bar">
        <div className="bar-l"><a className="wordmark" href="/">{t('title')}</a><SolsatMark size={28} label={t('brand.by')} /></div>
        <div className="land-bar-r">
          <Segmented label={t('lang.label')} value={lang} onChange={onLang} options={[{ value: 'en', label: 'EN' }, { value: 'th', label: 'TH' }]} />
          <a className="btn land-open" href="/app/?tab=overview">{t('land.openApp')}</a>
          {named && <SignedInChip />}
        </div>
      </header>

      <main>
        <section className="land-hero">
          <div className="hero-text">
            <h1>{t('title')}</h1>
            <p className="promise">{t('land.promise')}</p>
            <div className="hero-actions">
              <a className="btn primary" href={sitingEnabled ? '/app/?tab=site' : '/app/?tab=ground'}>{t('land.open')}</a>
              <a className="btn" href="#how">{t('land.how')}</a>
            </div>
            <p className="comp-sub">{t('land.audience')}</p>
            <p className="comp-sub">{t('land.challenge')}</p>
          </div>
          <div className="hero-shot">
            <img src="/landing/hero.webp" srcSet="/landing/hero-800.webp 800w, /landing/hero.webp 1600w" sizes="(min-width: 1120px) 640px, 100vw" width={1600} height={1000}
              alt={t('land.hero.alt')} />
          </div>
        </section>

        <section className="sat-strip" aria-label={t('land.nav')}>
          <p>{t('sat.s1')}</p>
          <p>{t('sat.nisar')}</p>
          <p className="together">{t('sat.together')}</p>
        </section>

        <section className="land-sec" aria-labelledby="do">
          <h2 id="do">{t('land.do')}</h2>
          <div className="land-cards lead">
            {sitingEnabled && (
              <a className="land-card" href="/app/?tab=site">
                <span className="sub-h">{t('land.site.t')}</span>
                <span className="src-tag">{t('tag.s1')}</span>
                <span>{t('start.site')}</span>
                <span>{t('land.site.l')}</span>
                <span className="mono comp-sub">{t('land.site.ex1')}</span>
                <span className="mono comp-sub">{t('land.site.ex2')}</span>
                <span className="comp-sub">{t('badge.prov')}</span>
                <span className="card-cta">{t('land.site.cta')} <Arrow /></span>
              </a>
            )}
            <a className="land-card" href="/app/?tab=ground">
              <span className="sub-h">{t('land.ground.t')}</span>
              <span className="src-tag">{t('nisar.tag')}</span>
              <span>{t('start.ground')}</span>
              <span>{t('land.ground.l')}</span>
              {stats && stats.n > 0 && stats.pairs > 0 && <span className="mono comp-sub">{t('land.ground.ex', { n: stats.n, p: stats.pairs })}</span>}
              <span className="card-cta">{t('land.ground.cta')} <Arrow /></span>
            </a>
          </div>
          <p className="comp-sub dash-line">{t('land.dash')}</p>
        </section>

        <section className="land-sec" aria-labelledby="covers">
          <h2 id="covers">{t('land.covers')}</h2>
          <div className="land-cols">
            {sitingEnabled && (
              <div className="cov">
                <h3 className="sub-h">{t('cov.site')}</h3>
                <p className="cov-h">{t('cov.yes')}</p>
                <ul className="cov-list">
                  <li><Check /><span>{t('cov.s1')}</span></li>
                  <li>
                    <Check />
                    <span>
                      {Array.isArray(areas) && areas.length > 0 ? (
                        <>{t('cov.s2')} <span className="chips-inline">{areas.map((a) => <a key={a.id} className="btn chip-btn" href={`/app/?tab=site&area=${encodeURIComponent(a.id)}`}>{areaLabel(a.id, a.name, lang)}</a>)}</span></>
                      ) : areas === 'fail' ? t('cov.loading') : areas === null ? <span aria-hidden="true">…</span> : t('cov.loading')}
                    </span>
                  </li>
                </ul>
                <p className="cov-h">{t('cov.no')}</p>
                <ul className="cov-list muted">
                  <li><Minus /><span>{t('cov.sn1')}</span></li>
                  {Array.isArray(areas) && !hasBangkok && <li><Minus /><span>{t('cov.sn2')}</span></li>}
                  <li><Minus /><span>{t('cov.sn3')}</span></li>
                </ul>
              </div>
            )}
            <div className="cov">
              <h3 className="sub-h">{t('cov.ground')}</h3>
              <p className="cov-h">{t('cov.yes')}</p>
              <ul className="cov-list">
                {stats && stats.n > 0 && stats.pairs > 0 && monthRange && fullRange && <li><Check /><span>{t('cov.g1', { n: stats.n, p: stats.pairs, range: fullRange })}</span></li>}
                {stats && stats.n > 0 && stats.perTrack.some((x) => x.count > 0) && <li><Check /><span>{t('cov.g2', { list: stats.perTrack.filter((x) => x.count > 0).map((x) => t('cov.g2.item', { label: trackLabel(x.k), k: x.count, n: stats.n })).join(', ') })}</span></li>}
                {stats && stats.n > 0 && stats.water > 0 && waterRange && <li><Check /><span>{t('cov.g3', { w: stats.water, range: waterRange, n: stats.n })}</span></li>}
                <li><Check /><span>{t('cov.g4')}</span></li>
              </ul>
              <p className="cov-h">{t('cov.no')}</p>
              <ul className="cov-list muted">
                <li><Minus /><span>{t('cov.gn1')}</span></li>
                <li><Minus /><span>{t('cov.gn2')}</span></li>
              </ul>
              {districts.length > 0 && (
                <label className="picker">
                  <span className="cov-h">{t('cov.jump')}</span>
                  <select defaultValue="" onChange={(e) => { if (e.target.value) window.location.href = `/app/?tab=districts&d=${encodeURIComponent(e.target.value)}`; }}>
                    <option value="" disabled>{t('cov.jump')}</option>
                    {districts.map((d) => <option key={d.dcode} value={d.dcode}>{lang === 'th' ? d.nameTh : d.nameEn}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>
        </section>

        <section className="land-sec" id="how" aria-labelledby="how-h">
          <h2 id="how-h">{t('land.how')}</h2>
          <ol className="steps">
            {(['how.1', 'how.2', 'how.3', 'how.4'] as const).map((k, i) => <li key={k}><span className="step-n mono">{i + 1}</span><span>{t(k)}</span></li>)}
          </ol>
        </section>

        <section className="land-sec narrow" aria-labelledby="lim">
          <h2 id="lim">{t('lim.t')}</h2>
          <ul className="about-list">
            {data?.fusion?.noise ? <><li>{t('about.noise', { n: data.fusion.noise.disagree, m: data.fusion.noise.both })}</li><li>{t('about.iono')}</li></> : <li>{t('lim.1')}</li>}
            {monthRange && <li>{t('lim.2', { range: monthRange })}</li>}
            <li>{t('lim.3')}</li>
            <li>{t('lim.4')}</li>
          </ul>
          <p><a className="link" href="/app/?tab=overview&about=1">{t('lim.more')}</a></p>
        </section>
      </main>

      <footer className="land-foot">
        <p className="foot-brand"><LogoTile size={40} /><span>{t('foot.built')}</span></p>
        <p>{t('foot.credits')}</p>
        <p>{REPO ? <>{t('foot.ossLink')} <a className="link" href={REPO}>{REPO}</a></> : t('foot.oss')}</p>
        <p>{t('foot.ai')}</p>
        <p>{t('foot.na')}</p>
        <p><a className="link" href="/demo/bangkok-ground-watch-demo.mp4">{t('foot.deck')}</a></p>
      </footer>
    </div>
  );
}

export default function Landing() {
  const [lang, setLang] = useState<Lang>('en');
  useEffect(() => { try { const v = localStorage.getItem('bgw-lang'); if (v === 'en' || v === 'th') setLang(v); } catch { /* storage unavailable */ } }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const change = (l: Lang) => { setLang(l); try { localStorage.setItem('bgw-lang', l); } catch { /* storage unavailable */ } };
  return <LangProvider value={lang}><Body lang={lang} onLang={change} /></LangProvider>;
}
