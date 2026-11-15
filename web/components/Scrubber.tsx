'use client';

import { useEffect, useRef } from 'react';
import { useLang, useT } from './ui';
import { fmtRange } from '@/lib/data';

export default function Scrubber({ dates, secDates, index, onIndex, playing, onPlaying, disabled }: {
  dates: string[]; secDates: (string | null)[]; index: number; onIndex: (i: number) => void; playing: boolean; onPlaying: (p: boolean) => void; disabled: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const n = dates.length;
  const label = dates[index] ? fmtRange(dates[index], secDates[index] ?? null, lang, t('interval.to')) : null;
  const onIndexRef = useRef(onIndex);
  onIndexRef.current = onIndex;
  const onPlayingRef = useRef(onPlaying);
  onPlayingRef.current = onPlaying;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (index >= n - 1) onPlayingRef.current(false);
      else onIndexRef.current(index + 1);
    }, 900);
    return () => clearTimeout(timer);
  }, [playing, index, n]);

  if (n === 0) return <div className="scrub"><span className="nodata">{t('nodata')}</span></div>;
  const text = <span className="mono scrub-date">{label ?? t('nodata')}</span>;
  if (n === 1) return <div className="scrub single"><span className="field-label">{t('date.label')}</span>{text}</div>;

  const toggle = () => {
    if (playing) onPlaying(false);
    else { if (index >= n - 1) onIndex(0); onPlaying(true); }
  };
  return (
    <div className="scrub">
      <button type="button" className="round" onClick={toggle} disabled={disabled} aria-disabled={disabled || undefined} aria-label={t(playing ? 'pause' : 'play')}>
        <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
          {playing ? <path d="M4.5 3h2.6v10H4.5z M8.9 3h2.6v10H8.9z" fill="currentColor" /> : <path d="M5 3l8 5-8 5z" fill="currentColor" />}
        </svg>
      </button>
      <div className="scrub-track">
        <input className="range" type="range" min={0} max={n - 1} step={1} value={index} disabled={disabled} aria-disabled={disabled || undefined}
          aria-label={t('date.label')} aria-valuetext={label ?? undefined} onChange={(e) => { onPlaying(false); onIndex(Number(e.target.value)); }} />
        <div className="ticks" aria-hidden="true">
          {dates.map((d, i) => <span key={d} className="tick" style={{ left: `${(i / (n - 1)) * 100}%` }} />)}
        </div>
      </div>
      {text}
    </div>
  );
}
