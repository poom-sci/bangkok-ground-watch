'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const TOTAL = 7;
const APP_URL = 'bangkok-ground-watch.vercel.app';
const TEAM = (process.env.NEXT_PUBLIC_TEAM_NAME ?? '').trim();
const REPO = (process.env.NEXT_PUBLIC_REPO_URL ?? '').trim();

const IMG = {
  '1': { src: '/slides/slide-1.webp', w: 2880, h: 1800, alt: 'The Bangkok Ground Watch app showing a radar line-of-sight change layer over Bangkok, with the Processed NISAR values badge.' },
  '2': { src: '/slides/slide-2.webp', w: 2880, h: 1800, alt: 'The app in Districts map view, with the 50 Bangkok districts coloured by screening index and the districts panel open.' },
  '3a': { src: '/slides/slide-3a.webp', w: 2080, h: 1800, alt: 'The map area of the app with the radar layer, its colour legend and the date scrubber.' },
  '3b': { src: '/slides/slide-3b.webp', w: 832, h: 1616, alt: 'A district panel for Lat Krabang with its total change on two tracks and a chart of mean change per radar pair.' },
  '4': { src: '/slides/slide-4.webp', w: 2880, h: 1800, alt: 'The app showing the surface water layer for 12 November 2026, with its legend.' },
  '5a': { src: '/slides/slide-5a.webp', w: 2080, h: 1800, alt: 'Site check result near Rojana industrial park: score 26, grade Poor, with a pin on the map.' },
  '5b': { src: '/slides/slide-5b.webp', w: 912, h: 1616, alt: 'Evidence view with a year strip of radar scenes and a selected scene where water was seen.' },
  '6': { src: '/slides/slide-6.webp', w: 2880, h: 1800, alt: 'The About the data dialog listing the limits of the data.' },
} as const;
type ImgKey = keyof typeof IMG;

function Shot({ k, style }: { k: ImgKey; style?: React.CSSProperties }) {
  const i = IMG[k];
  return (
    <figure className="s-frame" style={style}>
      <img src={i.src} width={i.w} height={i.h} alt={i.alt} loading="eager" decoding="async" />
    </figure>
  );
}

function Slide({ n, active, hidden, className = '', children, link }: { n: number; active: boolean; hidden: boolean; className?: string; children: ReactNode; link?: boolean }) {
  return (
    <section className={`slide ${className}`} data-active={active} aria-hidden={hidden ? true : undefined} aria-label={`Slide ${n} of ${TOTAL}`} id={`s${n}`}>
      {children}
      <footer className="s-foot">
        <span className="mono">{n} / {TOTAL}</span>
        {link ? <a className="mono" href="/app/">{APP_URL}</a> : <span className="mono">{APP_URL}</span>}
      </footer>
    </section>
  );
}

export default function Slides() {
  const [n, setN] = useState(1);
  const [scale, setScale] = useState(0.5);
  const [wide, setWide] = useState(true);
  const [ready, setReady] = useState(false);
  const touch = useRef<number | null>(null);

  const go = useCallback((to: number) => {
    const t = Math.max(1, Math.min(TOTAL, to));
    setN(t);
    try { window.history.replaceState(null, '', `#${t}`); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const fromHash = () => { const v = Number(window.location.hash.replace('#', '')); if (Number.isInteger(v) && v >= 1 && v <= TOTAL) setN(v); };
    const size = () => { setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080)); setWide(window.innerWidth >= 768); };
    fromHash(); size(); setReady(true);
    window.addEventListener('hashchange', fromHash);
    window.addEventListener('resize', size);
    return () => { window.removeEventListener('hashchange', fromHash); window.removeEventListener('resize', size); };
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !wide) return;
      const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' '];
      const prev = ['ArrowLeft', 'ArrowUp', 'PageUp'];
      if (next.includes(e.key)) { e.preventDefault(); go(n + 1); }
      else if (prev.includes(e.key)) { e.preventDefault(); go(n - 1); }
      else if (e.key === 'Home') { e.preventDefault(); go(1); }
      else if (e.key === 'End') { e.preventDefault(); go(TOTAL); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [n, wide, go]);

  const s = (i: number) => ({ n: i, active: n === i, hidden: wide && n !== i });

  return (
    <div className="deck" data-ready={ready} style={{ ['--ds' as string]: scale }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current == null || !wide) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) >= 50) go(n + (dx < 0 ? 1 : -1));
      }}>
      <div className="progress" aria-hidden="true"><span style={{ width: `${(n / TOTAL) * 100}%` }} /></div>
      <div className="dl-wrap"><a className="btn" href="/slides/bangkok-ground-watch.pdf" download>Download PDF</a></div>

      <main className="stage">
        <Slide {...s(1)} link>
          <div className="s-text">
            <h1 className="s-title t1">Bangkok Ground Watch</h1>
            <p className="s-remember">NISAR radar, made readable.</p>
            <div className="s-body">
              <p>Satellite radar shows how Bangkok&apos;s ground changes and where floodwater has been.</p>
              <p>NASA Space Apps Challenge 2026 · Dancing with the SARs</p>
              {TEAM && <p>Team: {TEAM}</p>}
            </div>
          </div>
          <div className="s-visual"><Shot k="1" /></div>
        </Slide>

        <Slide {...s(2)}>
          <div className="s-text">
            <h2 className="s-title">Why Bangkok needs this</h2>
            <p className="s-remember">Bangkok sits on soft clay and floods every wet season.</p>
            <ul className="s-body">
              <li>The city keeps building on soft ground.</li>
              <li>Radar sees ground and water through cloud, day and night.</li>
              <li>Every one of the 50 districts gets a screening view.</li>
            </ul>
          </div>
          <div className="s-visual"><Shot k="2" /></div>
        </Slide>

        <Slide {...s(3)}>
          <div className="s-text">
            <h2 className="s-title">Ground Watch, from NISAR</h2>
            <p className="s-remember">17 NISAR radar pairs show how Bangkok&apos;s ground changed.</p>
            <div className="s-nums three">
              <div><span className="num mono">17</span><span className="lab">radar pairs, 21 Jun to 31 Oct 2026, two tracks</span></div>
              <div><span className="num mono">19</span><span className="lab">water scenes, Jul to Nov 2026</span></div>
              <div><span className="num mono">50</span><span className="lab">districts, grid about 80 m</span></div>
            </div>
          </div>
          <div className="s-visual two"><Shot k="3a" style={{ flex: '58 1 0' }} /><Shot k="3b" style={{ flex: '42 1 0' }} /></div>
        </Slide>

        <Slide {...s(4)}>
          <div className="s-text">
            <h2 className="s-title">NISAR data, read without downloading</h2>
            <p className="s-remember">Each file is 2 to 6 GB. We read only Bangkok.</p>
            <ul className="s-body">
              <li>HTTP range requests fetch just the Bangkok window of each file.</li>
              <li>Water uses a fixed -19 dB threshold on HV backscatter.</li>
              <li>Otsu&apos;s method over-marked paddies, so we dropped it.</li>
            </ul>
          </div>
          <div className="s-visual"><Shot k="4" /></div>
        </Slide>

        <Slide {...s(5)} className="dense">
          <div className="s-text">
            <h2 className="s-title">Site check: nine years of radar</h2>
            <p className="s-remember">Tap a point, get a screening score, and see the radar passes behind it.</p>
            <p className="s-sub">9 years of Sentinel-1 (2017 to 2025) · about 150 scenes per area · 3 areas live: Bangkok, Ayutthaya, Samut Sakhon</p>
            <div className="s-rows">
              <div><span className="num mono">26</span><span className="row-t"><b>Poor</b> · Rojana industrial park, Ayutthaya · water in 10 of 130 wet-season passes</span></div>
              <div><span className="num mono">22</span><span className="row-t"><b>Poor</b> · Lat Krabang paddy, east of Bangkok · water in 36 of 130</span></div>
              <div><span className="num mono">88</span><span className="row-t"><b>Good</b> · Krathum Baen, Samut Sakhon · water in 0 of 130</span></div>
            </div>
            <p className="s-sub">Grades are provisional.</p>
          </div>
          <div className="s-visual two"><Shot k="5a" style={{ flex: '58 1 0' }} /><Shot k="5b" style={{ flex: '42 1 0' }} /></div>
        </Slide>

        <Slide {...s(6)}>
          <div className="s-text">
            <h2 className="s-title">What it does not claim</h2>
            <p className="s-remember">This is screening, not a building assessment.</p>
            <ul className="s-body small">
              <li>Ground change is along the radar line of sight, relative to the window mean, with atmosphere included. Its sign is not confirmed, so we report change, not direction.</li>
              <li>The record is short (Jun to Oct 2026), so there are no yearly rates. Values cover an 80 m area, not a building.</li>
              <li>Radar can miss floodwater between buildings and under trees. Site grades are provisional.</li>
            </ul>
          </div>
          <div className="s-visual"><Shot k="6" /></div>
        </Slide>

        <Slide {...s(7)} className="s7" link>
          <div className="s7-head">
            <h2 className="s-title">Data, credits and AI use</h2>
            <p className="s-remember">NASA data is the core, and every source is credited.</p>
          </div>
          <div className="s7-cards">
            <div className="s7-card"><h3>NASA data</h3><p><span className="mono">NISAR L2 GUNW</span> and <span className="mono">GCOV</span>, via the ASF DAAC · NASA Earthdata · <span className="mono">NASA POWER</span> (solar irradiance, context only)</p></div>
            <div className="s7-card"><h3>Partner data</h3><p>Copernicus Sentinel-1 and Sentinel-2 (ESA) · <span className="mono">Copernicus DEM GLO-30</span> (ESA) · <span className="mono">ESA WorldCover 2021</span></p></div>
            <div className="s7-card"><h3>Other</h3><p>OpenStreetMap contributors · <span className="mono">MapLibre GL JS</span> · <span className="mono">Next.js</span></p></div>
          </div>
          <div className="s7-ai"><p>We used Claude (Anthropic), through Claude Code, to write code, design the interface and draft text. The team chose the challenge, the data and the method, and checked results against real NISAR and Sentinel-1 data. No AI-generated images, video or audio.</p></div>
          <p className="s7-foot">Live app: <a href="/app/">{APP_URL}</a>{REPO && <> · Code: <a href={REPO}>{REPO}</a></>} · Not affiliated with or endorsed by NASA.</p>
        </Slide>
      </main>

      <button type="button" className="nav prev" aria-label="Previous slide" hidden={n === 1} onClick={() => go(n - 1)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <button type="button" className="nav next" aria-label="Next slide" hidden={n === TOTAL} onClick={() => go(n + 1)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>
  );
}
