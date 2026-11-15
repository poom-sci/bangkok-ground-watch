'use client';

import { useEffect, useRef } from 'react';
import { useLang, useT } from './ui';
import { fmtRange, fmtYear } from '@/lib/data';
import { sitingEnabled } from '@/lib/siting';
import type { Key } from '@/lib/i18n';

const bullets: Key[] = ['about.1', 'about.9', 'about.2', 'about.7', 'about.10', 'about.3', 'about.4', 'about.5', 'about.6', 'about.8'];
const sources: Key[] = ['src.esri', 'src.nom', 'src.sat', 'src.1', 'src.2', 'src.3', 'src.4', 'src.5'];

export default function AboutDialog({ open, span, years, onClose, noise, sanity }: { open: boolean; sanity?: Record<string, number> | null; noise: { disagree: number; both: number } | null; span: { from: string; to: string } | null; years: { from: number; to: number } | null; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const range = span ? fmtRange(span.from, span.to, lang, t('interval.to')) : null;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="about" aria-labelledby="about-title" onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="about-in">
        <div className="about-head">
          <h2 id="about-title">{t('about.open')}</h2>
          <button type="button" className="btn" onClick={onClose}>{t('about.close')}</button>
        </div>
        {sitingEnabled && (
          <>
            <h3>{t('about.site')}</h3>
            <ul className="about-list">{(['about.site.1', 'about.site.2', 'about.site.3'] as Key[]).map((k) => <li key={k}>{t(k)}</li>)}<li>{years ? t(years.from > 2011 ? 'flag.history' : 'flag.history0', { from: fmtYear(years.from, lang), to: fmtYear(years.to, lang), x: fmtYear(2011, lang) }) : t('about.site.4')}</li></ul>
          </>
        )}
        {sanity && Object.keys(sanity).length > 0 && (
          <>
            <h3>{t('about.cf')}</h3>
            <ul className="about-list">
              <li>{t('about.cf.rule')}</li>
              {sanity.confirmed_wet_below_2m_pct != null && sanity.observed_land_below_2m_pct != null && <li>{t('about.cf.s1', { a: sanity.confirmed_wet_below_2m_pct, b: sanity.observed_land_below_2m_pct })}</li>}
              {sanity.confirmed_dry_built_up_pct != null && sanity.observed_land_built_up_pct != null && <li>{t('about.cf.s2', { a: sanity.confirmed_dry_built_up_pct, b: sanity.observed_land_built_up_pct })}</li>}
            </ul>
          </>
        )}
        {sitingEnabled && <h3>{t('about.ground')}</h3>}
        <ul className="about-list">{bullets.flatMap((k) => (k === 'about.1' && noise ? ['about.noise' as Key, 'about.iono' as Key] : [k])).map((k) => <li key={k}>{k === 'about.noise' ? t('about.noise', { n: noise?.disagree ?? '', m: noise?.both ?? '' }) : k === 'about.4' ? (range ? t('about.4', { range }) : t('about.4b')) : t(k)}</li>)}</ul>
        <h3>{t('about.sources')}</h3>
        <ul className="about-list">{sources.map((k) => <li key={k}>{t(k)}</li>)}</ul>
      </div>
    </dialog>
  );
}
